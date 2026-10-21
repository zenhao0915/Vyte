// src/App.tsx
import { useState } from 'react';
import type {
  ActiveTab,
  AuditLog,
  ExtractedNlpOrderItem,
  InvoiceItem,
  NewProductForm,
  Product,
  QCAlert,
  UserRole,
  UserSession,
} from './types/orbyte';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_QC_ALERTS,
} from './data/mockData';
import { Sidebar } from './components/layout/Sidebar';
import { HeaderBar } from './components/layout/HeaderBar';
import { KpiCards } from './components/common/KpiCards';
import { AuditLogPanel } from './components/common/AuditLogPanel';
import { RestockModule } from './modules/module1-restock/RestockModule';
import { AddProductModal } from './modules/module1-restock/AddProductModal';
import { QualityControlModule } from './modules/module4-quality/QualityControlModule';
import { InvoiceModule } from './modules/module5-invoice/InvoiceModule';
import { SalesAnalyticsModule } from './modules/jayden-modules/SalesAnalyticsModule';
import { OrderStatusModule } from './modules/jayden-modules/OrderStatusModule';
import { SplashScreen } from './components/SplashScreen';
import { LoginPage } from './components/auth/LoginPage';

export default function App() {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [splashDone, setSplashDone] = useState<boolean>(false);

  const [role, setRole] = useState<UserRole>('SME_OWNER');
  const [activeTab, setActiveTab] = useState<ActiveTab>('mod1');
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [pendingCustomerOrderCount, setPendingCustomerOrderCount] = useState<number>(1);

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [qcAlerts, setQcAlerts] = useState<QCAlert[]>(INITIAL_QC_ALERTS);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(INITIAL_INVOICES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  const addAuditLog = (module: string, detail: string) => {
    const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setAuditLogs((prev) => [
      { id: `L-${Date.now()}-${Math.random()}`, time: now, module, role, detail },
      ...prev,
    ]);
  };

  const handleAuthenticated = (session: UserSession) => {
    setUserSession(session);
    setRole(session.role);
    setSplashDone(false);
    addAuditLog(
        'Auth Hub',
        `Signed in as ${session.userName} (${session.userID}) • Organization: ${session.companyName}.`
    );
  };

  const handleLogout = () => {
    setUserSession(null);
    setSplashDone(false);
  };

  // =========================================================================
  // MODULE 1: AUTO RESTOCK & CUSTOM QUANTITY USAGE / SALE DISPATCH
  // =========================================================================
  const handleApproveAndContactSupplier = (productId: string, customReorderQty?: number) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can approve supplier purchase orders.');
      return;
    }

    const target = products.find((p) => p.id === productId);
    if (!target) return;

    const orderQty = customReorderQty && customReorderQty > 0 ? customReorderQty : target.reorderQty;

    setProducts((prev) =>
        prev.map((p) =>
            p.id === productId
                ? { ...p, reorderQty: orderQty, restockStatus: 'SUPPLIER_CONTACTED' }
                : p
        )
    );

    // Immediately generate Supplier Payable Bill in Module 5
    const unitCost = target.unitCostRM ?? Number((target.priceRM * 0.62).toFixed(2));
    const poTotalRM = Number((unitCost * orderQty).toFixed(2));
    const poInvoiceNo = `SUP-PO-${Math.floor(1000 + Math.random() * 9000)}`;

    const supplierBill: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: poInvoiceNo,
      type: 'SUPPLIER_PAYABLE',
      party: target.supplierName,
      date: '21 Oct 2026',
      amountRM: poTotalRM,
      aiCategory: `Inventory Procurement (${orderQty} ${target.uom} ${target.name})`,
      aiConfidence: 98,
      paid: false,
      status: 'NEEDS_REVIEW',
    };

    setInvoices((prev) => [supplierBill, ...prev]);

    addAuditLog(
        'Mod 1: Auto Restock',
        `Approved PO (+${orderQty} ${target.uom} ${target.name}) to ${target.supplierName}. Created Supplier Bill ${poInvoiceNo} (RM ${poTotalRM.toLocaleString(undefined, { minimumFractionDigits: 2 })}) in Smart Invoices.`
    );
  };

  // Step 5b: Confirm Supplier Delivery -> Updates Live Stock
  const handleConfirmSupplierDelivery = (productId: string) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;

    const newStockTotal = target.stock + target.reorderQty;

    setProducts((prev) =>
        prev.map((p) =>
            p.id === productId
                ? {
                  ...p,
                  stock: newStockTotal,
                  restockStatus: newStockTotal <= p.minThreshold ? 'TRIGGERED_PENDING_APPROVAL' : 'CONFIRMED',
                }
                : p
        )
    );

    addAuditLog(
        'Mod 1: Delivery Confirmed',
        `Received +${target.reorderQty} ${target.uom} of ${target.name} from ${target.supplierName}. Stock updated to ${newStockTotal} ${target.uom}.`
    );
  };

  // Custom Stock Usage / Walk-in Sale -> Deducts exact quantity & generates Receivable Invoice in Mod 5
  const handleRecordStockUsage = (productId: string, usedQty: number) => {
    const target = products.find((p) => p.id === productId);
    if (!target || target.stock <= 0 || usedQty <= 0) return;

    const actualDeducted = Math.min(usedQty, target.stock);
    const newStock = Math.max(0, target.stock - actualDeducted);
    const isTriggered = newStock <= target.minThreshold;

    setProducts((prev) =>
        prev.map((p) =>
            p.id === productId
                ? {
                  ...p,
                  stock: newStock,
                  restockStatus:
                      isTriggered && p.restockStatus !== 'SUPPLIER_CONTACTED'
                          ? 'TRIGGERED_PENDING_APPROVAL'
                          : p.restockStatus,
                }
                : p
        )
    );

    const saleAmountRM = Number((actualDeducted * target.priceRM).toFixed(2));
    const posInvoiceNo = `SALE-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    const salesInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: posInvoiceNo,
      type: 'CUSTOMER_RECEIVABLE',
      party: `Direct Counter Sale (${target.sku})`,
      date: '21 Oct 2026',
      amountRM: saleAmountRM,
      aiCategory: `Direct Product Sales (${actualDeducted} ${target.uom} ${target.name})`,
      aiConfidence: 99,
      paid: true,
      status: 'NEEDS_REVIEW',
    };

    setInvoices((prev) => [salesInvoice, ...prev]);

    addAuditLog(
        'Mod 1: Stock Dispatch',
        `Dispatched ${actualDeducted} ${target.uom} of ${target.name} (Invoice ${posInvoiceNo}: RM ${saleAmountRM.toLocaleString(undefined, { minimumFractionDigits: 2 })}). Remaining: ${newStock} ${target.uom}.${
            isTriggered ? ' [LOW STOCK TRIGGERED]' : ''
        }`
    );
  };

  // Module 1: Add Universal Product
  const handleSaveProduct = (newProd: NewProductForm) => {
    const isLow = Number(newProd.stock) <= Number(newProd.minThreshold);

    let parsedBatch: string | undefined = undefined;
    let parsedExpiry: string | undefined = undefined;
    if (newProd.industry === 'FNB_PERISHABLE' && newProd.extraAttr) {
      const parts = newProd.extraAttr.split('•');
      parsedBatch = parts[0]?.replace('Batch:', '').trim() || 'B-2026-NEW';
      parsedExpiry = parts[1]?.replace('Exp:', '').trim() || '2026-11-15';
    }

    const created: Product = {
      id: `P-${Date.now()}`,
      sku: newProd.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: newProd.name,
      category: newProd.category,
      industry: newProd.industry,
      uom: newProd.uom,
      stock: Number(newProd.stock),
      minThreshold: Number(newProd.minThreshold),
      reorderQty: Number(newProd.reorderQty),
      priceRM: Number(newProd.priceRM),
      unitCostRM: Number((Number(newProd.priceRM) * 0.6).toFixed(2)),
      dailyDepletionRate: 3.0,
      leadTimeDays: 2,
      moq: 10,
      supplierName: newProd.supplierName || 'Preferred Vyte Supplier',
      supplierContact: newProd.supplierContact || '+6012-9998888',
      performance: 'Good',
      visibility: true,
      batchNo: parsedBatch,
      expiryDate: parsedExpiry,
      variantSpec: newProd.industry !== 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
      restockStatus: isLow ? 'TRIGGERED_PENDING_APPROVAL' : 'HEALTHY',
    };
    setProducts([created, ...products]);
    addAuditLog(
        'Mod 1: Catalog',
        `Added ${created.industry} SKU "${created.name}" (${created.stock} ${created.uom}). ${
            isLow ? 'Low-stock trigger activated.' : ''
        }`
    );
    setShowAddModal(false);
  };

  // =========================================================================
  // MODULE 2 -> MODULE 1 BRIDGE: APPLY AI FORECAST & JUMP TO MODULE 1
  // =========================================================================
  const handleQueueRestockToOrderModule = (product: Product, recommendedQty: number, aiReason: string) => {
    setProducts((prev) =>
        prev.map((p) =>
            p.id === product.id
                ? {
                  ...p,
                  reorderQty: recommendedQty,
                  restockStatus: 'TRIGGERED_PENDING_APPROVAL',
                }
                : p
        )
    );

    addAuditLog(
        'Mod 2: AI Forecast Applied',
        `${aiReason} -> Updated ${product.name} reorder quantity to +${recommendedQty} ${product.uom} & triggered approval in Auto Restock.`
    );

    // Switch directly to Module 1 so the user immediately sees the triggered restock row!
    setActiveTab('mod1');
  };

  // =========================================================================
  // MODULE 3: NLP CUSTOMER ORDER APPROVAL & DELIVERY CONFIRMATION
  // =========================================================================
  const handleApproveCustomerOrder = (
      items: ExtractedNlpOrderItem[],
      customerName: string,
      orderId: string,
      invoiceId: string
  ) => {
    // 1. Deduct stock from Module 1 (and trigger restock if stock falls <= minThreshold)
    setProducts((prev) =>
        prev.map((p) => {
          const line = items.find((i) => i.productID === p.id);
          if (!line) return p;
          const updatedStock = Math.max(0, p.stock - line.requestedQty);
          const isLow = updatedStock <= p.minThreshold;
          return {
            ...p,
            stock: updatedStock,
            restockStatus:
                isLow && p.restockStatus !== 'SUPPLIER_CONTACTED'
                    ? 'TRIGGERED_PENDING_APPROVAL'
                    : p.restockStatus,
          };
        })
    );

    // 2. Deposit Customer Receivable Invoice in Module 5
    const totalOrderRM = items.reduce((s, i) => s + i.lineTotal, 0);
    const itemSummary = items.map((i) => `${i.requestedQty} ${i.name}`).join(', ');
    const newCustInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: invoiceId,
      type: 'CUSTOMER_RECEIVABLE',
      party: customerName,
      date: '21 Oct 2026',
      amountRM: totalOrderRM,
      aiCategory: `Wholesale NLP Order (${itemSummary})`,
      aiConfidence: 97,
      paid: false,
      status: 'NEEDS_REVIEW',
    };
    setInvoices((prev) => [newCustInvoice, ...prev]);

    addAuditLog(
        'Mod 3: Order Approved',
        `Approved NLP Order ${orderId} for ${customerName}. Reserved stock & created Invoice ${invoiceId} (RM ${totalOrderRM.toLocaleString(undefined, { minimumFractionDigits: 2 })}) in Smart Invoices.`
    );
  };

  // =========================================================================
  // MODULE 4: QUALITY CONTROL & EXPIRY -> GENERATES CLAIM / RECOVERY INVOICE
  // =========================================================================
  const handleApproveQC = (qcId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can approve QC write-offs or promotional markdowns.');
      return;
    }

    const targetQc = qcAlerts.find((q) => q.id === qcId);
    if (!targetQc) return;

    setQcAlerts((prev) =>
        prev.map((q) => (q.id === qcId ? { ...q, status: 'APPROVED_RESOLVED' } : q))
    );

    const qcInvoiceNo = `CLM-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const qcInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: qcInvoiceNo,
      type: 'CUSTOMER_RECEIVABLE',
      party: `QC Claim / Promo Recovery (${targetQc.batchNo})`,
      date: '21 Oct 2026',
      amountRM: targetQc.savedRM,
      aiCategory: `Quality Claim & Waste Prevention (${targetQc.productName})`,
      aiConfidence: 95,
      paid: true,
      status: 'NEEDS_REVIEW',
    };
    setInvoices((prev) => [qcInvoice, ...prev]);

    addAuditLog(
        'Mod 4: Quality AI',
        `Approved "${targetQc.actionLabel}" for ${targetQc.productName}. Logged recovery note ${qcInvoiceNo} (RM ${targetQc.savedRM.toFixed(2)}) in Smart Invoices.`
    );
  };

  const handleAddCustomQCAlert = (newAlert: QCAlert) => {
    setQcAlerts((prev) => [newAlert, ...prev]);
    addAuditLog(
        'Mod 4: Batch Logged',
        `Reported quality/expiry issue for ${newAlert.productName} (${newAlert.batchNo}: ${newAlert.triggerReason}).`
    );
  };

  const handleTriggerQCScan = () => {
    const fnbProducts = products.filter((p) => p.industry === 'FNB_PERISHABLE');
    const existingSkus = new Set(qcAlerts.map((q) => q.sku));
    const newlyDetected: QCAlert[] = [];

    fnbProducts.forEach((p) => {
      if (!existingSkus.has(p.sku)) {
        newlyDetected.push({
          id: `QC-${Date.now()}-${p.id}`,
          productName: p.name,
          sku: p.sku,
          batchNo: p.batchNo || 'B-2026-10A',
          expiryDate: p.expiryDate || '2026-10-26',
          daysLeft: 5,
          qtyAffected: `${p.stock} ${p.uom}`,
          triggerReason: 'Batch within 5-day freshness threshold',
          aiSuggestion: `Bundle ${p.name} into weekend promo (15% off) & adjust next supplier PO.`,
          actionLabel: 'Approve Bundle Promo',
          savedRM: Number((Math.max(1, p.stock) * p.priceRM * 0.75).toFixed(2)),
          status: 'PENDING_APPROVAL',
        });
      }
    });

    if (newlyDetected.length > 0) {
      setQcAlerts((prev) => [...newlyDetected, ...prev]);
      addAuditLog(
          'Mod 4: AI Batch Scan',
          `Detected ${newlyDetected.length} perishable batch(es) requiring expiry action.`
      );
    } else {
      addAuditLog(
          'Mod 4: AI Batch Scan',
          `Scanned ${products.length} catalog SKUs — all expiring batches are already displayed.`
      );
    }
  };

  // =========================================================================
  // MODULE 5: SMART INVOICES -> VERIFY CATEGORY, TOGGLE PAID, UPLOAD
  // =========================================================================
  const handleVerifyInvoice = (invId: string, updatedCategory?: string) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can verify accounting classifications.');
      return;
    }
    setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id === invId) {
            const finalCat = updatedCategory || inv.aiCategory;
            addAuditLog(
                'Mod 5: Smart Invoices',
                `Verified Invoice ${inv.invNo} (${inv.party}) under accounting category "${finalCat}".`
            );
            return { ...inv, aiCategory: finalCat, status: 'VERIFIED' };
          }
          return inv;
        })
    );
  };

  const handleToggleInvoicePaid = (invId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can update invoice payment settlement status.');
      return;
    }
    setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id === invId) {
            const nextPaid = !inv.paid;
            addAuditLog(
                'Mod 5: Payment Status',
                `Marked Invoice ${inv.invNo} (${inv.party} • RM ${inv.amountRM.toFixed(2)}) as ${
                    nextPaid ? 'PAID' : 'UNPAID'
                }.`
            );
            return { ...inv, paid: nextPaid };
          }
          return inv;
        })
    );
  };

  const handleAddValidatedInvoice = (createdInv: InvoiceItem) => {
    setInvoices((prev) => [createdInv, ...prev]);
    addAuditLog(
        'Mod 5: AI Invoice Upload',
        `Uploaded & AI-classified ${createdInv.invNo} (${createdInv.party} • RM ${createdInv.amountRM.toFixed(
            2
        )}) as "${createdInv.aiCategory}".`
    );
  };

  const filteredProducts = products.filter((p) => {
    const matchesInd = industryFilter === 'ALL' || p.industry === industryFilter;
    const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesInd && matchesSearch;
  });

  if (!userSession) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  return (
      <div className="min-h-screen bg-[#F5F7FA] flex font-sans text-slate-800">
        <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            industryFilter={industryFilter}
            setIndustryFilter={setIndustryFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            pendingRestockCount={
              products.filter((p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL').length
            }
            pendingOrderCount={pendingCustomerOrderCount}
            pendingQcCount={qcAlerts.filter((q) => q.status === 'PENDING_APPROVAL').length}
            pendingInvoiceCount={invoices.filter((i) => i.status === 'NEEDS_REVIEW').length}
            totalProductCount={products.length}
        />

        <main className="flex-1 flex flex-col overflow-y-auto">
          <HeaderBar
              activeTab={activeTab}
              role={role}
              setRole={setRole}
              userSession={userSession}
              onLogout={handleLogout}
          />

          <div className="p-4 lg:p-5 space-y-4 max-w-[1600px] mx-auto w-full">
            <KpiCards
                totalSkus={products.length}
                pendingRestocks={
                  products.filter((p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL').length
                }
                pendingQcBatches={qcAlerts.filter((q) => q.status === 'PENDING_APPROVAL').length}
                totalInvoices={invoices.length}
            />

            {activeTab === 'mod1' && (
                <RestockModule
                    products={filteredProducts}
                    role={role}
                    onApproveAndContactSupplier={handleApproveAndContactSupplier}
                    onConfirmSupplierDelivery={handleConfirmSupplierDelivery}
                    onRecordStockUsage={handleRecordStockUsage}
                    onOpenAddModal={() => setShowAddModal(true)}
                />
            )}

            {activeTab === 'mod2' && (
                <SalesAnalyticsModule
                    products={filteredProducts}
                    userID={userSession.userID}
                    onQueueRestockToOrderModule={handleQueueRestockToOrderModule}
                    onLogAction={addAuditLog}
                />
            )}

            {activeTab === 'mod3' && (
                <OrderStatusModule
                    products={products}
                    role={role}
                    userID={userSession.userID}
                    onApproveCustomerOrder={handleApproveCustomerOrder}
                    onPendingCountChange={setPendingCustomerOrderCount}
                    onLogAction={addAuditLog}
                />
            )}

            {activeTab === 'mod4' && (
                <QualityControlModule
                    qcAlerts={qcAlerts}
                    products={products}
                    role={role}
                    onApproveQC={handleApproveQC}
                    onTriggerScan={handleTriggerQCScan}
                    onAddCustomQCAlert={handleAddCustomQCAlert}
                />
            )}

            {activeTab === 'mod5' && (
                <InvoiceModule
                    invoices={invoices}
                    role={role}
                    onVerifyInvoice={handleVerifyInvoice}
                    onToggleInvoicePaid={handleToggleInvoicePaid}
                    onAddValidatedInvoice={handleAddValidatedInvoice}
                />
            )}

            <AuditLogPanel
                logs={auditLogs}
                role={role}
                onClearLogs={() => setAuditLogs([])}
            />
          </div>
        </main>

        <AddProductModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            onSaveProduct={handleSaveProduct}
        />
      </div>
  );
}