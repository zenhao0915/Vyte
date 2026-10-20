// src/App.tsx
import { useState } from 'react';
import type { ActiveTab, AuditLog, InvoiceItem, NewProductForm, Product, QCAlert, UserRole } from './types/orbyte';
import { INITIAL_AUDIT_LOGS, INITIAL_INVOICES, INITIAL_PRODUCTS, INITIAL_QC_ALERTS } from './data/mockData';
import { Sidebar } from './components/layout/Sidebar';
import { HeaderBar } from './components/layout/HeaderBar';
import { KpiCards } from './components/common/KpiCards';
import { AuditLogPanel } from './components/common/AuditLogPanel';
import { RestockModule } from './modules/module1-restock/RestockModule';
import { AddProductModal } from './modules/module1-restock/AddProductModal';
import { QualityControlModule } from './modules/module4-quality/QualityControlModule';
import { InvoiceModule } from './modules/module5-invoice/InvoiceModule';
import { SalesAndOrderPlaceholder } from './modules/jayden-modules/SalesAndOrderPlaceholder';

export default function App() {
  const [role, setRole] = useState<UserRole>('SME_OWNER');
  const [activeTab, setActiveTab] = useState<ActiveTab>('mod1');
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [qcAlerts, setQcAlerts] = useState<QCAlert[]>(INITIAL_QC_ALERTS);
  const [invoices, setInvoices] = useState<InvoiceItem[]>(INITIAL_INVOICES);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(INITIAL_AUDIT_LOGS);

  const addAuditLog = (module: string, detail: string) => {
    const now = new Date().toTimeString().split(' ')[0];
    setAuditLogs((prev) => [{ id: `L-${Date.now()}`, time: now, module, role, detail }, ...prev]);
  };

  // Module 1: Approve Auto-Restock
  const handleApproveRestock = (productId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Orbyte RBAC Restriction: Only SME_OWNER can approve consequential supplier purchase orders.');
      return;
    }
    setProducts((prev) =>
        prev.map((p) => {
          if (p.id === productId) {
            addAuditLog(
                'Module 1 (Restock)',
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
      supplierName: newProd.supplierName || 'Preferred Orbyte Supplier',
      supplierContact: newProd.supplierContact || '+6012-9998888',
      performance: 'Good',
      visibility: true,
      batchNo: newProd.industry === 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
      variantSpec: newProd.industry !== 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
      restockStatus: isLow ? 'TRIGGERED_PENDING_APPROVAL' : 'HEALTHY',
    };
    setProducts([created, ...products]);
    addAuditLog(
        'Module 1 (Inventory)',
        `Added new ${created.industry} product "${created.name}". ${isLow ? 'Low-stock alert auto-triggered!' : ''}`
    );
    setShowAddModal(false);
  };

  // Module 4: Approve Quality / Expiry AI Recommendation
  const handleApproveQC = (qcId: string) => {
    if (role !== 'SME_OWNER') {
      alert('Orbyte RBAC Restriction: Only SME_OWNER can approve QC write-offs or promotional markdowns.');
      return;
    }
    setQcAlerts((prev) =>
        prev.map((q) => {
          if (q.id === qcId) {
            addAuditLog('Module 4 (Quality AI)', `Approved AI solution for ${q.productName} (${q.actionLabel}).`);
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
            addAuditLog('Module 5 (Invoice AI)', `Verified AI category "${inv.aiCategory}" for ${inv.invNo}.`);
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
      date: '20 Oct 2026',
      amountRM: 1350.0,
      aiCategory: 'Packaging & Sustainable Supplies',
      aiConfidence: 96,
      paid: false,
      status: 'NEEDS_REVIEW',
    };
    setInvoices([newInv, ...invoices]);
    addAuditLog('Module 5 (Invoice AI)', `AI parsed & categorized uploaded invoice ${newInv.invNo} (96% confidence).`);
  };

  const filteredProducts = products.filter((p) => {
    const matchesInd = industryFilter === 'ALL' || p.industry === industryFilter;
    const matchesSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesInd && matchesSearch;
  });

  return (
      <div className="min-h-screen bg-[#F5F7FA] flex font-sans text-slate-800">
        <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            industryFilter={industryFilter}
            setIndustryFilter={setIndustryFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            pendingRestockCount={products.filter((p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL').length}
            pendingQcCount={qcAlerts.filter((q) => q.status === 'PENDING_APPROVAL').length}
            pendingInvoiceCount={invoices.filter((i) => i.status === 'NEEDS_REVIEW').length}
            totalProductCount={products.length}
        />

        <main className="flex-1 flex flex-col overflow-y-auto">
          <HeaderBar activeTab={activeTab} role={role} setRole={setRole} />

          <div className="p-8 space-y-6">
            <KpiCards
                totalSkus={products.length}
                pendingRestocks={products.filter((p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL').length}
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

            {activeTab === 'mod2_3' && <SalesAndOrderPlaceholder />}

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