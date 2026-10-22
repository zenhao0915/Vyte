// src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import type {
  ActiveTab,
  AuditLog,
  CurrencyCode,
  ExtractedNlpOrderItem,
  InvoiceItem,
  NewProductForm,
  OrbyteHrStaff,
  Product,
  QCAlert,
  UserRole,
  UserSession,
} from './types/vyte.ts';
import { CURRENCY_SYMBOLS } from './types/vyte.ts';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_QC_ALERTS,
} from './data/mockData';
import { Sidebar } from './components/layout/Sidebar';
import { HeaderBar } from './components/layout/HeaderBar';
import { AuditLogPanel } from './components/common/AuditLogPanel';
import { RestockModule } from './modules/module1-restock/RestockModule';
import { AddProductModal } from './modules/module1-restock/AddProductModal';
import { QualityControlModule } from './modules/module4-quality/QualityControlModule';
import { InvoiceModule } from './modules/module5-invoice/InvoiceModule';
import { SalesAnalyticsModule } from './modules/module3-sales/SalesAnalyticsModule.tsx';
import { OrderStatusModule } from './modules/module2-order/OrderStatusModule';
import { SplashScreen } from './components/SplashScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './components/auth/LoginPage';
import { orbyteApi } from './services/api';

const SESSION_STORAGE_KEY = 'vyte_active_session_v1';
const CURRENCY_STORAGE_KEY = 'vyte_currency';
const STATE_PRODUCTS_KEY = 'vyte_state_products_v2';
const STATE_QC_KEY = 'vyte_state_qc_v2';
const STATE_INVOICES_KEY = 'vyte_state_invoices_v2';
const STATE_LOGS_KEY = 'vyte_state_logs_v2';
const STATE_TAB_KEY = 'vyte_state_active_tab_v2';
const STATE_SUBTAB_KEY = 'vyte_state_subtab_v2';

const FALLBACK_RATES: Record<CurrencyCode, number> = {
  MYR: 1.0,
  SGD: 0.302,
  USD: 0.231,
};

interface StoredSessionPayload {
  session: UserSession;
  accessToken: string;
}

interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

function loadPersistedState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [splashDone, setSplashDone] = useState<boolean>(false);

  const [isValidatingRefreshSession, setIsValidatingRefreshSession] = useState<boolean>(() => {
    return Boolean(localStorage.getItem(SESSION_STORAGE_KEY));
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [role, setRole] = useState<UserRole>('SME_OWNER');

  // Persisted Navigation Tabs (Remember State)
  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
      loadPersistedState<ActiveTab>(STATE_TAB_KEY, 'mod1')
  );
  const [inventorySubTab, setInventorySubTab] = useState<'restock' | 'orders'>(() =>
      loadPersistedState<'restock' | 'orders'>(STATE_SUBTAB_KEY, 'restock')
  );

  // Operating Currency & Live Exchange Rate API State
  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return stored && stored in CURRENCY_SYMBOLS ? (stored as CurrencyCode) : 'MYR';
  });
  const [exchangeRates, setExchangeRates] = useState<Record<CurrencyCode, number>>(FALLBACK_RATES);
  const [rateSourceLabel, setRateSourceLabel] = useState<string>('Live FX Syncing...');

  const [loadingOverlayMessage, setLoadingOverlayMessage] = useState<string | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [pendingCustomerOrderCount, setPendingCustomerOrderCount] = useState<number>(1);
  const [deductedOrderIds, setDeductedOrderIds] = useState<Record<string, boolean>>({});

  // Persisted Core Data States (Remember State across refreshes & tab switches)
  const [products, setProducts] = useState<Product[]>(() =>
      loadPersistedState<Product[]>(STATE_PRODUCTS_KEY, INITIAL_PRODUCTS)
  );
  const [qcAlerts, setQcAlerts] = useState<QCAlert[]>(() =>
      loadPersistedState<QCAlert[]>(STATE_QC_KEY, INITIAL_QC_ALERTS)
  );
  const [invoices, setInvoices] = useState<InvoiceItem[]>(() => {
    const loaded = loadPersistedState<InvoiceItem[]>(STATE_INVOICES_KEY, INITIAL_INVOICES);
    // Filter out any legacy CLM- QC invoices so Smart Invoices only contains genuine payables/receivables
    return loaded.filter((inv) => !inv.invNo.startsWith('CLM-'));
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() =>
      loadPersistedState<AuditLog[]>(STATE_LOGS_KEY, INITIAL_AUDIT_LOGS)
  );

  const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
  const activeExchangeRate = exchangeRates[currency] ?? 1.0;
  const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';

  // Save state changes to localStorage automatically
  useEffect(() => {
    localStorage.setItem(STATE_PRODUCTS_KEY, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem(STATE_QC_KEY, JSON.stringify(qcAlerts));
  }, [qcAlerts]);

  useEffect(() => {
    localStorage.setItem(STATE_INVOICES_KEY, JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    localStorage.setItem(STATE_LOGS_KEY, JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem(STATE_TAB_KEY, JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(STATE_SUBTAB_KEY, JSON.stringify(inventorySubTab));
  }, [inventorySubTab]);

  // 1. LIVE CURRENCY EXCHANGE RATE API INTEGRATION
  const fetchLiveExchangeRates = useCallback(async () => {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/MYR');
      if (!response.ok) throw new Error('FX network response error');
      const data = await response.json();
      if (data?.rates) {
        const nextRates: Record<CurrencyCode, number> = {
          MYR: 1.0,
          SGD: Number(data.rates.SGD) || FALLBACK_RATES.SGD,
          USD: Number(data.rates.USD) || FALLBACK_RATES.USD,
        };
        setExchangeRates(nextRates);
        setRateSourceLabel(
            `Live FX API: 1 MYR = ${nextRates.SGD.toFixed(3)} SGD | ${nextRates.USD.toFixed(3)} USD`
        );
      }
    } catch {
      setExchangeRates(FALLBACK_RATES);
      setRateSourceLabel('Fallback FX Rate Active');
    }
  }, []);

  useEffect(() => {
    void fetchLiveExchangeRates();
  }, [fetchLiveExchangeRates]);

  const pushToast = useCallback(
      (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
        const id = `T-${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, type, message }]);
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4200);
      },
      []
  );

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    localStorage.setItem(CURRENCY_STORAGE_KEY, newCurrency);
    const rate = exchangeRates[newCurrency] ?? 1.0;
    pushToast(
        'success',
        `Currency switched to ${newCurrency} (${CURRENCY_SYMBOLS[newCurrency]}) • Live Rate: 1 MYR = ${rate.toFixed(3)} ${newCurrency}`
    );
  };

  const handleTriggerLoadingScreen = useCallback((message: string, durationMs = 900) => {
    setLoadingOverlayMessage(message);
    setTimeout(() => setLoadingOverlayMessage(null), durationMs);
  }, []);

  const addAuditLog = useCallback(
      (module: string, detail: string, overrideRole?: UserRole) => {
        const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
        setAuditLogs((prev) => [
          {
            id: `L-${Date.now()}-${Math.random()}`,
            time: now,
            module,
            role: overrideRole ?? role,
            detail,
          },
          ...prev,
        ]);
      },
      [role]
  );

  // Validate Stored Session on Page Refresh
  useEffect(() => {
    const rawStored = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawStored) {
      setIsValidatingRefreshSession(false);
      return;
    }

    let isMounted = true;

    const verifyExistingSession = async () => {
      try {
        const parsed = JSON.parse(rawStored) as StoredSessionPayload;
        if (!parsed?.session?.userID || !parsed?.accessToken) {
          throw new Error('Invalid stored session');
        }

        const [validationRes] = await Promise.all([
          orbyteApi.validateSession(
              {
                accessToken: parsed.accessToken,
                userID: parsed.session.userID,
                email: parsed.session.email,
              },
              parsed.session
          ),
          new Promise((resolve) => setTimeout(resolve, 650)),
        ]);

        if (!isMounted) return;

        if (validationRes.data.valid) {
          setUserSession(validationRes.data.session);
          setRole(validationRes.data.session.role);
          setSplashDone(true);
        } else {
          localStorage.removeItem(SESSION_STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      } finally {
        if (isMounted) {
          setIsValidatingRefreshSession(false);
        }
      }
    };

    void verifyExistingSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAuthenticated = (
      session: UserSession,
      accessToken = `vyte-jwt-${Date.now()}`
  ) => {
    const payload: StoredSessionPayload = { session, accessToken };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(payload));
    setUserSession(session);
    setRole(session.role);
    setSplashDone(false);
    addAuditLog(
        'Auth Hub',
        `Signed in as ${session.userName} (${session.userID}) • Role: ${session.userType} • Organization: ${session.companyName}.`,
        session.role
    );
  };

  const handleLogout = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    setUserSession(null);
    setSplashDone(false);
  };

  const handleNavigateFromNotification = (
      targetTab: ActiveTab,
      subTab?: 'restock' | 'orders'
  ) => {
    if (targetTab === 'mod3') {
      setActiveTab('mod1');
      setInventorySubTab('orders');
      return;
    }
    setActiveTab(targetTab);
    if (subTab) {
      setInventorySubTab(subTab);
    }
  };

  const handleApproveAndContactSupplier = async (
      productId: string,
      customReorderQty?: number
  ) => {
    if (!canApprove) {
      pushToast(
          'error',
          'Vyte RBAC Restriction: Only Owner or Manager accounts can approve supplier purchase orders.'
      );
      return;
    }

    const target = products.find((p) => p.id === productId);
    if (!target) return;

    const orderQty =
        customReorderQty && customReorderQty > 0 ? customReorderQty : target.reorderQty;
    const poNumber = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    await orbyteApi.contactSupplier({
      poNumber,
      supplierName: target.supplierName,
      supplierPhoneNumber: target.supplierContact,
      channel: 'WHATSAPP',
      messageBody: `Automated Vyte PO ${poNumber}: Please supply ${orderQty} ${target.uom} of ${target.name} (${target.sku}).`,
      userID: userSession?.userID || 'M067',
    });

    setProducts((prev) =>
        prev.map((p) =>
            p.id === productId
                ? { ...p, reorderQty: orderQty, restockStatus: 'SUPPLIER_CONTACTED' }
                : p
        )
    );

    const unitCost = target.unitCostRM ?? Number((target.priceRM * 0.62).toFixed(2));
    const poTotalRM = Number((unitCost * orderQty).toFixed(2));
    const poInvoiceNo = `SUP-${poNumber}`;

    const supplierBill: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: poInvoiceNo,
      type: 'SUPPLIER_PAYABLE',
      party: target.supplierName,
      date: '22 Oct 2026',
      amountRM: poTotalRM,
      aiCategory: `Inventory Procurement (${orderQty} ${target.uom} ${target.name})`,
      aiConfidence: 98,
      paid: false,
      status: 'NEEDS_REVIEW',
    };

    setInvoices((prev) => [supplierBill, ...prev]);

    addAuditLog(
        'Mod 1: Auto Restock',
        `Approved PO (+${orderQty} ${target.uom} ${target.name}) to ${target.supplierName}. Created Supplier Bill ${poInvoiceNo} (${currencySymbol} ${(poTotalRM * activeExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) in Smart Invoices.`
    );
    pushToast('success', `PO sent to ${target.supplierName} & logged in Smart Invoices.`);
  };

  const handleConfirmSupplierDelivery = async (productId: string) => {
    const target = products.find((p) => p.id === productId);
    if (!target) return;

    await orbyteApi.confirmRestock({
      poNumber: `PO-${target.sku}`,
      productId: target.id,
      SKU: target.sku,
      quantity: target.reorderQty,
      unitPrice: target.unitCostRM ?? target.priceRM * 0.62,
      currency: 'MYR',
      MOQ: target.moq ?? 10,
      unitOfMeasure: target.uom,
      supplierName: target.supplierName,
      supplierPhoneNumber: target.supplierContact,
      requestedDeliveryDate: new Date().toISOString().slice(0, 10),
      deliveryLocation: 'Main Warehouse',
      automationStatus: true,
      userID: userSession?.userID || 'M067',
    });

    const newStockTotal = target.stock + target.reorderQty;

    setProducts((prev) =>
        prev.map((p) =>
            p.id === productId
                ? {
                  ...p,
                  stock: newStockTotal,
                  restockStatus:
                      newStockTotal <= p.minThreshold
                          ? 'TRIGGERED_PENDING_APPROVAL'
                          : 'CONFIRMED',
                }
                : p
        )
    );

    addAuditLog(
        'Mod 1: Delivery Confirmed',
        `Received +${target.reorderQty} ${target.uom} of ${target.name} from ${target.supplierName}. Stock updated to ${newStockTotal} ${target.uom}.`
    );
    pushToast(
        'success',
        `Confirmed delivery of +${target.reorderQty} ${target.uom} ${target.name}.`
    );
  };

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
      date: '22 Oct 2026',
      amountRM: saleAmountRM,
      aiCategory: `Direct Product Sales (${actualDeducted} ${target.uom} ${target.name})`,
      aiConfidence: 99,
      paid: true,
      status: 'NEEDS_REVIEW',
    };

    setInvoices((prev) => [salesInvoice, ...prev]);

    addAuditLog(
        'Mod 1: Stock Dispatch',
        `Dispatched ${actualDeducted} ${target.uom} of ${target.name} (Invoice ${posInvoiceNo}: ${currencySymbol} ${(saleAmountRM * activeExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Remaining: ${newStock} ${target.uom}.${
            isTriggered ? ' [LOW STOCK TRIGGERED]' : ''
        }`
    );
  };

  const handleSaveProduct = (newProd: NewProductForm) => {
    // Convert entered price back to base MYR if user entered it in SGD/USD
    const basePriceRM = Number((Number(newProd.priceRM) / activeExchangeRate).toFixed(2));
    const isLow = Number(newProd.stock) <= Number(newProd.minThreshold);

    let parsedBatch: string | undefined = undefined;
    let parsedExpiry: string | undefined = undefined;
    if (newProd.industry === 'FNB_PERISHABLE' && newProd.extraAttr) {
      const parts = newProd.extraAttr.split('•');
      parsedBatch = parts[0]?.replace('Batch:', '').trim() || 'B-2026-NEW';
      parsedExpiry = parts[1]?.replace('Exp:', '').trim() || '2026-11-15';
    }

    const created: Product = {
      id: `P-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      sku: newProd.sku || `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      name: newProd.name,
      category: newProd.category,
      industry: newProd.industry,
      uom: newProd.uom,
      stock: Number(newProd.stock),
      minThreshold: Number(newProd.minThreshold),
      reorderQty: Number(newProd.reorderQty),
      priceRM: basePriceRM,
      unitCostRM: Number((basePriceRM * 0.6).toFixed(2)),
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
      photoUrl: newProd.photoUrl,
      restockStatus: isLow ? 'TRIGGERED_PENDING_APPROVAL' : 'HEALTHY',
    };
    setProducts((prev) => [created, ...prev]);
    addAuditLog(
        'Mod 1: Catalog',
        `Added ${created.industry} SKU "${created.name}" (${created.stock} ${created.uom}). ${
            isLow ? 'Low-stock trigger activated.' : ''
        }`
    );
    setShowAddModal(false);
    pushToast('success', `Added ${created.name} (${created.sku}) to catalog.`);
  };

  // Batch Import Products from Excel / CSV Spreadsheet
  const handleBatchImportProducts = (importedList: Product[]) => {
    if (importedList.length === 0) return;
    setProducts((prev) => [...importedList, ...prev]);
    addAuditLog(
        'Mod 1: Spreadsheet Import',
        `Batch-imported ${importedList.length} SKU(s) via Excel/CSV spreadsheet upload.`
    );
    pushToast('success', `Successfully imported ${importedList.length} products from spreadsheet.`);
  };

  const handleQueueRestockToOrderModule = (
      product: Product,
      recommendedQty: number,
      aiReason: string
  ) => {
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

    setActiveTab('mod1');
    setInventorySubTab('restock');
    pushToast('info', `AI restock forecast applied to ${product.name}.`);
  };

  const handleApproveCustomerOrder = (
      items: ExtractedNlpOrderItem[],
      customerName: string,
      orderId: string,
      invoiceId: string,
      inventoryDeducted = true
  ) => {
    if (inventoryDeducted && !deductedOrderIds[orderId]) {
      setDeductedOrderIds((prev) => ({ ...prev, [orderId]: true }));
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
    }

    const totalOrderRM = items.reduce((s, i) => s + i.lineTotal, 0);
    const itemSummary = items.map((i) => `${i.requestedQty} ${i.name}`).join(', ');
    const newCustInvoice: InvoiceItem = {
      id: `INV-${Date.now()}`,
      invNo: invoiceId,
      type: 'CUSTOMER_RECEIVABLE',
      party: customerName,
      date: new Date().toISOString().slice(0, 10),
      amountRM: totalOrderRM,
      aiCategory: `Wholesale NLP Order (${itemSummary})`,
      aiConfidence: 97,
      paid: false,
      status: 'NEEDS_REVIEW',
    };
    setInvoices((prev) => [newCustInvoice, ...prev]);

    addAuditLog(
        'Mod 3: Order Approved',
        `Approved NLP Order ${orderId} for ${customerName}. ${
            inventoryDeducted ? 'Deducted stock' : 'Stock unchanged'
        } & created Invoice ${invoiceId} (${currencySymbol} ${(totalOrderRM * activeExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) in Smart Invoices.`
    );
  };

  // =========================================================================
  // POINT 4: MODULE 4 QUALITY CONTROL -> DISPATCHES TASK TO ORBYTE HR STAFF
  // (No longer creates a CLM invoice in Smart Invoices!)
  // =========================================================================
  const handleDispatchQCToHrStaff = (
      qcId: string,
      staff: OrbyteHrStaff,
      priority: 'URGENT' | 'HIGH' | 'NORMAL',
      hrNotes: string
  ) => {
    if (!canApprove) {
      pushToast(
          'error',
          'Vyte RBAC Restriction: Only Owner or Manager accounts can dispatch QC tasks to Orbyte HR staff.'
      );
      return;
    }

    const targetQc = qcAlerts.find((q) => q.id === qcId);
    if (!targetQc) return;

    const hrTaskId = `HR-TASK-${Math.floor(1000 + Math.random() * 9000)}`;
    const nowTime = new Date().toLocaleTimeString('en-GB', { hour12: false });

    setQcAlerts((prev) =>
        prev.map((q) =>
            q.id === qcId
                ? {
                  ...q,
                  status: 'ASSIGNED_TO_STAFF',
                  hrTaskId,
                  assignedStaffId: staff.staffId,
                  assignedStaffName: staff.name,
                  assignedStaffRole: `${staff.position} (${staff.department})`,
                  assignedPriority: priority,
                  hrNotes: hrNotes || q.aiSuggestion,
                  assignedAt: nowTime,
                }
                : q
        )
    );

    addAuditLog(
        'Mod 4 -> Orbyte HR Hub',
        `Dispatched QC Task ${hrTaskId} ("${targetQc.actionLabel}" for ${targetQc.productName} • Batch ${targetQc.batchNo}) to Orbyte HR Staff: ${staff.name} (${staff.staffId} • ${staff.position}) [Priority: ${priority}].`
    );
    pushToast(
        'success',
        `Task ${hrTaskId} dispatched to ${staff.name} via Orbyte HR System.`
    );
  };

  const handleCompleteHrQcTask = (qcId: string) => {
    const targetQc = qcAlerts.find((q) => q.id === qcId);
    if (!targetQc) return;

    setQcAlerts((prev) =>
        prev.map((q) => (q.id === qcId ? { ...q, status: 'APPROVED_RESOLVED' } : q))
    );

    addAuditLog(
        'Mod 4: Orbyte HR Completed',
        `Orbyte HR Staff ${targetQc.assignedStaffName || 'Operator'} (${targetQc.hrTaskId || 'QC-TASK'}) completed execution for ${targetQc.productName} (${targetQc.batchNo}). Prevented loss: ${currencySymbol} ${(targetQc.savedRM * activeExchangeRate).toFixed(2)}.`
    );
    pushToast('success', `Marked ${targetQc.hrTaskId || targetQc.batchNo} as completed by HR staff.`);
  };

  const handleAddCustomQCAlert = (newAlert: QCAlert) => {
    setQcAlerts((prev) => [newAlert, ...prev]);
    addAuditLog(
        'Mod 4: Batch Logged',
        `Reported quality/expiry issue for ${newAlert.productName} (${newAlert.batchNo}: ${newAlert.triggerReason}).`
    );
    pushToast('info', `Logged QC batch alert for ${newAlert.productName}.`);
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
          batchNo: p.batchNo || 'B-2026-SCAN',
          expiryDate: p.expiryDate || '2026-10-26',
          daysLeft: 4,
          qtyAffected: `${p.stock} ${p.uom}`,
          triggerReason: 'AI Scan: High humidity shelf-life risk (< 5 days)',
          aiSuggestion: `Bundle ${p.name} with morning combo deals (-20%) & assign floor staff to relabel ${p.stock} ${p.uom} before expiry.`,
          actionLabel: 'Assign Staff: Combo Relabel',
          savedRM: Number((p.stock * p.priceRM * 0.75).toFixed(2)),
          status: 'PENDING_APPROVAL',
        });
      }
    });

    if (newlyDetected.length > 0) {
      setQcAlerts((prev) => [...newlyDetected, ...prev]);
      addAuditLog(
          'Mod 4: AI Scan',
          `AI Expiry Scan detected ${newlyDetected.length} new at-risk perishable batch(es).`
      );
      pushToast('warning', `Detected ${newlyDetected.length} new at-risk batch(es).`);
    } else {
      addAuditLog(
          'Mod 4: AI Scan',
          'Completed batch scan — all active perishable batches are monitored.'
      );
      pushToast('info', 'Batch scan complete. All perishable SKUs are up to date.');
    }
  };

  const handleVerifyInvoice = (invId: string, updatedCategory?: string) => {
    if (!canApprove) {
      pushToast(
          'error',
          'Vyte RBAC Restriction: Only Owner or Manager accounts can verify accounting categories.'
      );
      return;
    }
    const target = invoices.find((i) => i.id === invId);
    if (!target) return;

    setInvoices((prev) =>
        prev.map((inv) =>
            inv.id === invId
                ? {
                  ...inv,
                  aiCategory: updatedCategory ?? inv.aiCategory,
                  status: 'VERIFIED',
                }
                : inv
        )
    );
    addAuditLog(
        'Mod 5: Smart Invoices',
        `Verified invoice ${target.invNo} (${target.party}) under category "${
            updatedCategory ?? target.aiCategory
        }".`
    );
  };

  const handleToggleInvoicePaid = (invId: string) => {
    const target = invoices.find((i) => i.id === invId);
    if (!target) return;
    const nextPaid = !target.paid;

    setInvoices((prev) =>
        prev.map((inv) => (inv.id === invId ? { ...inv, paid: nextPaid } : inv))
    );
    addAuditLog(
        'Mod 5: Payment Status',
        `Marked invoice ${target.invNo} (${target.party}) as ${nextPaid ? 'PAID' : 'UNPAID'}.`
    );
  };

  const handleAddValidatedInvoice = (createdInv: InvoiceItem) => {
    setInvoices((prev) => [createdInv, ...prev]);
    addAuditLog(
        'Mod 5: Invoice Uploaded',
        `Uploaded & AI-classified ${createdInv.invNo} (${createdInv.party} • ${currencySymbol} ${(createdInv.amountRM * activeExchangeRate).toFixed(2)}) -> ${createdInv.aiCategory}.`
    );
    pushToast('success', `Uploaded & classified invoice ${createdInv.invNo}.`);
  };

  const handleBatchImportInvoices = (importedInvoices: InvoiceItem[]) => {
    if (importedInvoices.length === 0) return;
    setInvoices((prev) => [...importedInvoices, ...prev]);
    addAuditLog(
        'Mod 5: Spreadsheet Import',
        `Batch-imported ${importedInvoices.length} invoice(s) via Excel/CSV spreadsheet.`
    );
    pushToast('success', `Imported ${importedInvoices.length} invoices from spreadsheet.`);
  };

  const pendingRestockCount = products.filter(
      (p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL'
  ).length;
  const pendingQcCount = qcAlerts.filter((q) => q.status !== 'APPROVED_RESOLVED').length;
  const pendingInvoiceCount = invoices.filter((i) => i.status === 'NEEDS_REVIEW').length;

  if (isValidatingRefreshSession) {
    return <LoadingScreen isOpen={true} message="Validating active Vyte session..." />;
  }

  if (!userSession) {
    return <LoginPage onAuthenticated={handleAuthenticated} />;
  }

  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
  }

  const filteredProducts = products.filter((p) => {
    const matchInd = industryFilter === 'ALL' || p.industry === industryFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q);
    return matchInd && matchSearch;
  });

  return (
      <div className="h-screen overflow-hidden bg-[#F6F7F4] flex p-3 gap-3 text-slate-900 font-sans">
        <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            role={role}
            operatingCurrency={currency}
            onCurrencyChange={handleCurrencyChange}
            industryFilter={industryFilter}
            setIndustryFilter={setIndustryFilter}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            pendingRestockCount={pendingRestockCount}
            pendingOrderCount={pendingCustomerOrderCount}
            pendingQcCount={pendingQcCount}
            pendingInvoiceCount={pendingInvoiceCount}
            auditLogCount={auditLogs.length}
            totalProductCount={products.length}
            userSession={userSession}
            onLogout={handleLogout}
        />

        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden gap-3">
          <HeaderBar
              activeTab={activeTab}
              inventorySubTab={inventorySubTab}
              userSession={userSession}
              currency={currency}
              exchangeRate={activeExchangeRate}
              rateSourceLabel={rateSourceLabel}
              onRefreshRates={fetchLiveExchangeRates}
              totalSkus={products.length}
              pendingRestocks={pendingRestockCount}
              pendingOrders={pendingCustomerOrderCount}
              pendingQcBatches={pendingQcCount}
              totalInvoices={invoices.length}
              pendingInvoices={pendingInvoiceCount}
              onNavigateFromNotification={handleNavigateFromNotification}
          />

          <main className="flex-1 overflow-y-auto pr-1 space-y-4">
            {/* COMBINED MODULE 1 & MODULE 3 SCREEN WITH COMPACT TOGGLE BAR */}
            {(activeTab === 'mod1' || activeTab === 'mod3') && (
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                      <button
                          type="button"
                          onClick={() => {
                            setActiveTab('mod1');
                            setInventorySubTab('restock');
                          }}
                          className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                              inventorySubTab === 'restock'
                                  ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        1. Auto Restock &amp; Catalog ({pendingRestockCount} Pending)
                      </button>
                      <button
                          type="button"
                          onClick={() => {
                            setActiveTab('mod1');
                            setInventorySubTab('orders');
                          }}
                          className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                              inventorySubTab === 'orders'
                                  ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                          }`}
                      >
                        3. Customer Orders &amp; NLP ({pendingCustomerOrderCount})
                      </button>
                    </div>
                  </div>

                  <div className={inventorySubTab === 'restock' ? 'block' : 'hidden'}>
                    <RestockModule
                        products={filteredProducts}
                        role={role}
                        currency={currency}
                        exchangeRate={activeExchangeRate}
                        onApproveAndContactSupplier={handleApproveAndContactSupplier}
                        onConfirmSupplierDelivery={handleConfirmSupplierDelivery}
                        onRecordStockUsage={handleRecordStockUsage}
                        onOpenAddModal={() => setShowAddModal(true)}
                        onBatchImportProducts={handleBatchImportProducts}
                    />
                  </div>

                  <div className={inventorySubTab === 'orders' ? 'block' : 'hidden'}>
                    <OrderStatusModule
                        products={products}
                        role={role}
                        userID={userSession.userID}
                        currency={currency}
                        exchangeRate={activeExchangeRate}
                        onApproveCustomerOrder={handleApproveCustomerOrder}
                        onPendingCountChange={setPendingCustomerOrderCount}
                        onLogAction={addAuditLog}
                        onNavigateToRestock={() => setInventorySubTab('restock')}
                        onNotify={pushToast}
                        onTriggerLoadingScreen={handleTriggerLoadingScreen}
                    />
                  </div>
                </div>
            )}

            {activeTab === 'mod2' && (
                <SalesAnalyticsModule
                    products={products}
                    userID={userSession.userID}
                    currency={currency}
                    exchangeRate={activeExchangeRate}
                    onQueueRestockToOrderModule={handleQueueRestockToOrderModule}
                    onLogAction={addAuditLog}
                    onTriggerLoadingScreen={handleTriggerLoadingScreen}
                />
            )}

            {activeTab === 'mod4' && (
                <QualityControlModule
                    qcAlerts={qcAlerts}
                    products={products}
                    role={role}
                    currency={currency}
                    exchangeRate={activeExchangeRate}
                    onDispatchToHrStaff={handleDispatchQCToHrStaff}
                    onCompleteHrTask={handleCompleteHrQcTask}
                    onTriggerScan={handleTriggerQCScan}
                    onAddCustomQCAlert={handleAddCustomQCAlert}
                />
            )}

            {activeTab === 'mod5' && (
                <InvoiceModule
                    invoices={invoices}
                    role={role}
                    currency={currency}
                    exchangeRate={activeExchangeRate}
                    onVerifyInvoice={handleVerifyInvoice}
                    onToggleInvoicePaid={handleToggleInvoicePaid}
                    onAddValidatedInvoice={handleAddValidatedInvoice}
                    onBatchImportInvoices={handleBatchImportInvoices}
                />
            )}

            {activeTab === 'logs' && (
                <AuditLogPanel
                    logs={auditLogs}
                    role={role}
                    onClearLogs={() => setAuditLogs([])}
                />
            )}
          </main>
        </div>

        <AddProductModal
            isOpen={showAddModal}
            currency={currency}
            onClose={() => setShowAddModal(false)}
            onSaveProduct={handleSaveProduct}
        />

        <LoadingScreen
            isOpen={loadingOverlayMessage !== null}
            message={loadingOverlayMessage ?? ''}
        />

        {toasts.length > 0 && (
            <div className="fixed bottom-5 right-5 z-50 space-y-2 max-w-sm">
              {toasts.map((t) => (
                  <div
                      key={t.id}
                      className="px-4 py-3 rounded-xl shadow-xl border bg-slate-900 text-white border-slate-700 text-xs font-semibold flex items-center gap-2"
                  >
                    <span>{t.message}</span>
                  </div>
              ))}
            </div>
        )}
      </div>
  );
}