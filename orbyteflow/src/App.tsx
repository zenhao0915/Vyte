// src/App.tsx
import { useState } from 'react';
import type {
  ActiveTab,
  AuditLog,
  AutoOrderSuggestion,
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
  INITIAL_AUTO_ORDERS,
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
  // 1. Login Page First -> 2. Splash Screen -> 3. Dashboard
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [splashDone, setSplashDone] = useState<boolean>(false);

  const [role, setRole] = useState<UserRole>('SME_OWNER');
  const [activeTab, setActiveTab] = useState<ActiveTab>('mod1');
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [autoOrders, setAutoOrders] = useState<AutoOrderSuggestion[]>(INITIAL_AUTO_ORDERS);
  const [qcAlerts, setQcAlerts] = useState<QCAlert[]>(INITIAL_QC_ALERTS);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(INITIAL_INVOICES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  const addAuditLog = (module: string, detail: string) => {
    const now = new Date().toTimeString().split(' ')[0];
    setAuditLogs((prev) => [{ id: `L-${Date.now()}`, time: now, module, role, detail }, ...prev]);
  };

  const handleAuthenticated = (session: UserSession) => {
    setUserSession(session);
    setRole(session.role);
    setSplashDone(false); // Play splash screen right after login!
    addAuditLog(
        'Vyte Auth',
        `User ${session.userName} (${session.userID} • ${session.userType}) signed in to ${session.companyName}.`
    );
  };

  const handleLogout = () => {
    setUserSession(null);
    setSplashDone(false);
  };

  // Module 1: Approve Auto-Restock
  const handleApproveRestock = (productId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can approve consequential supplier purchase orders.');
      return;
    }
    setProducts((prev) =>
        prev.map((p) => {
          if (p.id === productId) {
            addAuditLog(
                'Auto Restock',
                `Approved Auto-Restock PO (${p.reorderQty} ${p.uom}) & sent confirmation to ${p.supplierName}.`
            );
            return { ...p, stock: p.stock + p.reorderQty, restockStatus: 'CONFIRMED' };
          }
          return p;
        })
    );
  };

  // Module 1: Add Universal Product
  const handleSaveProduct = (newProd: NewProductForm) => {
    const isLow = Number(newProd.stock) <= Number(newProd.minThreshold);
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
      batchNo: newProd.industry === 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
      variantSpec: newProd.industry !== 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
      restockStatus: isLow ? 'TRIGGERED_PENDING_APPROVAL' : 'HEALTHY',
    };
    setProducts([created, ...products]);
    addAuditLog(
        'Auto Restock',
        `Added new ${created.industry} product "${created.name}". ${isLow ? 'Low-stock alert auto-triggered!' : ''}`
    );
    setShowAddModal(false);
  };

  // Module 2 -> Module 3 Bridge
  const handleQueueRestockToOrderModule = (product: Product, recommendedQty: number, aiReason: string) => {
    const newSuggestion: AutoOrderSuggestion = {
      id: `AO-${Date.now()}`,
      poNumber: `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      productID: product.id,
      sku: product.sku,
      productName: product.name,
      category: product.category,
      uom: product.uom,
      currentStock: product.stock,
      minThreshold: product.minThreshold,
      dailyDepletionRate: product.dailyDepletionRate ?? 2.5,
      daysUntilStockout: Number((product.stock / (product.dailyDepletionRate ?? 2.5)).toFixed(1)),
      leadTimeDays: product.leadTimeDays ?? 2,
      suggestedOrderQty: recommendedQty,
      moq: product.moq ?? 10,
      unitPriceRM: product.unitCostRM ?? Number((product.priceRM * 0.62).toFixed(2)),
      supplierName: product.supplierName,
      supplierPhone: product.supplierContact,
      channel: product.supplierContact.includes('@') ? 'EMAIL' : 'WHATSAPP',
      aiReasoning: aiReason,
      urgency: product.stock <= product.minThreshold ? 'CRITICAL' : 'HIGH',
      humanStatus: 'AWAITING_HUMAN_PERMISSION',
    };

    setAutoOrders((prev) => [newSuggestion, ...prev]);
    addAuditLog(
        'Sales Analytics -> Order Status',
        `Queued Vyte AI restock suggestion for ${product.name} (+${recommendedQty} ${product.uom}) awaiting human permission.`
    );
  };

  // Module 3: Human Intervention on AI Auto-Order Suggestion
  const handleHumanDecisionAutoOrder = (
      suggestionId: string,
      decision: 'APPROVE_AND_CONTACT' | 'HOLD' | 'REJECT',
      customQty?: number
  ) => {
    const target = autoOrders.find((o) => o.id === suggestionId);
    if (!target) return;

    const finalQty = customQty ?? target.suggestedOrderQty;

    setAutoOrders((prev) =>
        prev.map((o) => {
          if (o.id === suggestionId) {
            return {
              ...o,
              suggestedOrderQty: finalQty,
              humanStatus:
                  decision === 'APPROVE_AND_CONTACT'
                      ? 'APPROVED_SENT_TO_SUPPLIER'
                      : decision === 'HOLD'
                          ? 'HELD_BY_HUMAN'
                          : 'REJECTED',
              updatedAt: new Date().toLocaleTimeString(),
            };
          }
          return o;
        })
    );

    if (decision === 'APPROVE_AND_CONTACT') {
      setProducts((prev) =>
          prev.map((p) =>
              p.id === target.productID
                  ? { ...p, stock: p.stock + finalQty, restockStatus: 'CONFIRMED' }
                  : p
          )
      );
      addAuditLog(
          'Order Status (Human Approved)',
          `Granted permission & contacted ${target.supplierName} for ${finalQty} ${target.uom} of ${target.productName} (${target.poNumber}).`
      );
    } else if (decision === 'HOLD') {
      addAuditLog('Order Status', `Placed AI auto-order ${target.poNumber} on hold.`);
    } else {
      addAuditLog('Order Status', `Rejected AI auto-order ${target.poNumber} — supplier was not contacted.`);
    }
  };

  // Module 3: Deduct stock & generate receivable invoice when NLP Customer Order is approved
  const handleDeductCustomerOrderStock = (
      items: ExtractedNlpOrderItem[],
      customerName: string,
      orderId: string
  ) => {
    setProducts((prev) =>
        prev.map((p) => {
          const line = items.find((i) => i.productID === p.id);
          if (!line) return p;
          const updatedStock = Math.max(0, p.stock - line.requestedQty);
          return {
            ...p,
            stock: updatedStock,
            restockStatus: updatedStock <= p.minThreshold ? 'TRIGGERED_PENDING_APPROVAL' : p.restockStatus,
          };
        })
    );

    const totalOrderRM = items.reduce((s, i) => s + i.lineTotal, 0);
    const newCustInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: `CUST-2026-${orderId.replace('ORD-', '')}`,
      type: 'CUSTOMER_RECEIVABLE',
      party: customerName,
      date: '21 Oct 2026',
      amountRM: totalOrderRM,
      aiCategory: 'Automated NLP Customer Order Sales',
      aiConfidence: 97,
      paid: false,
      status: 'NEEDS_REVIEW',
    };
    setInvoices((prev) => [newCustInvoice, ...prev]);

    addAuditLog(
        'Order Status (NLP Approved)',
        `Approved customer order ${orderId} for ${customerName}, deducted stock, and generated invoice ${newCustInvoice.invNo}.`
    );
  };

  // Module 4: Approve Quality / Expiry AI Recommendation
  const handleApproveQC = (qcId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Vyte RBAC Restriction: Only SME_OWNER can approve QC write-offs or promotional markdowns.');
      return;
    }
    setQcAlerts((prev) =>
        prev.map((q) => {
          if (q.id === qcId) {
            addAuditLog('Quality & Expiry', `Approved AI solution for ${q.productName} (${q.actionLabel}).`);
            return { ...q, status: 'APPROVED_RESOLVED' };
          }
          return q;
        })
    );
  };

  // Module 5: Verify AI Categorized Invoice
  const handleVerifyInvoice = (invId: string) => {
    setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id === invId) {
            addAuditLog('Smart Invoices', `Verified AI category "${inv.aiCategory}" for ${inv.invNo}.`);
            return { ...inv, status: 'VERIFIED' };
          }
          return inv;
        })
    );
  };

  // Module 5: Simulate Upload & AI Categorize Invoice
  const handleSimulateNewInvoice = () => {
    const newInv: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: `SUP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      type: 'SUPPLIER_PAYABLE',
      party: 'EcoPack Malaysia Sdn Bhd',
      date: '21 Oct 2026',
      amountRM: 1350.0,
      aiCategory: 'Packaging & Sustainable Supplies',
      aiConfidence: 96,
      paid: false,
      status: 'NEEDS_REVIEW',
    };
    setInvoices([newInv, ...invoices]);
    addAuditLog('Smart Invoices', `Vyte AI parsed & categorized uploaded invoice ${newInv.invNo} (96% confidence).`);
  };

  const filteredProducts = products.filter((p) => {
    const matchesInd = industryFilter === 'ALL' || p.industry === industryFilter;
    const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesInd && matchesSearch;
  });

  // STEP 1: Show Login Page first
  if (!userSession) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  // STEP 2: After Login, play the Spring-Physics Splash Screen
  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  // STEP 3: Main Vyte Dashboard
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
            pendingOrderCount={
              autoOrders.filter((o) => o.humanStatus === 'AWAITING_HUMAN_PERMISSION').length
            }
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

          <div className="p-8 space-y-6">
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
                    onApproveRestock={handleApproveRestock}
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
                    autoOrders={autoOrders}
                    role={role}
                    userID={userSession.userID}
                    onHumanDecisionAutoOrder={handleHumanDecisionAutoOrder}
                    onDeductCustomerOrderStock={handleDeductCustomerOrderStock}
                    onLogAction={addAuditLog}
                />
            )}

            {activeTab === 'mod4' && (
                <QualityControlModule qcAlerts={qcAlerts} onApproveQC={handleApproveQC} />
            )}

            {activeTab === 'mod5' && (
                <InvoiceModule
                    invoices={invoices}
                    onVerifyInvoice={handleVerifyInvoice}
                    onSimulateUploadInvoice={handleSimulateNewInvoice}
                />
            )}

            <AuditLogPanel logs={auditLogs} role={role} />
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