// src/App.tsx
import { useState, useEffect, useCallback } from 'react';
import type {
  ActiveTab,
  AuditLog,
  BusinessComplianceProfile,
  CurrencyCode,
  DocumentVaultItem,
  ExtractedNlpOrderItem,
  InvoiceItem,
  NewProductForm,
  OrbyteHrOverdueEscalationPayload,
  OrbyteHrStaff,
  Product,
  QCAlert,
  RenewalTask,
  UserRole,
  UserSession,
} from './types/vyte.ts';
import { CURRENCY_SYMBOLS } from './types/vyte.ts';
import {
  INITIAL_AUDIT_LOGS,
  INITIAL_COMPLIANCE_PROFILES,
  INITIAL_INVOICES,
  INITIAL_PRODUCTS,
  INITIAL_QC_ALERTS,
  INITIAL_RENEWAL_TASKS,
  INITIAL_VAULT_DOCS,
} from './data/mockData';
import { Sidebar } from './components/layout/Sidebar';
import { HeaderBar } from './components/layout/HeaderBar';
import { AuditLogPanel } from './components/common/AuditLogPanel';
import { RestockModule } from './modules/module1-restock/RestockModule';
import { AddProductModal } from './modules/module1-restock/AddProductModal';
import { QualityControlModule } from './modules/module4-quality/QualityControlModule';
import { InvoiceModule } from './modules/module5-invoice/InvoiceModule';
import { ComplianceRenewalModule } from './modules/module6-compliance/ComplianceRenewalModule';
import { SalesAnalyticsModule } from './modules/module3-sales/SalesAnalyticsModule.tsx';
import { OrderStatusModule } from './modules/module2-order/OrderStatusModule';
import { SplashScreen } from './components/SplashScreen';
import { LoadingScreen } from './components/LoadingScreen';
import { LoginPage } from './components/auth/LoginPage';
import { orbyteApi } from './services/api';

const SESSION_STORAGE_KEY = 'vyte_active_session_v1';
const CURRENCY_STORAGE_KEY = 'vyte_currency';
const FX_RATES_STORAGE_KEY = 'vyte_live_fx_rates_v2';
const STATE_PRODUCTS_KEY = 'vyte_state_products_v2';
const STATE_QC_KEY = 'vyte_state_qc_v2';
const STATE_INVOICES_KEY = 'vyte_state_invoices_v2';
const STATE_LOGS_KEY = 'vyte_state_logs_v2';
const STATE_COMPLIANCE_PROFILES_KEY = 'vyte_state_compliance_profiles_v1';
const STATE_VAULT_DOCS_KEY = 'vyte_state_vault_docs_v1';
const STATE_RENEWAL_TASKS_KEY = 'vyte_state_renewal_tasks_v1';
const STATE_TAB_KEY = 'vyte_state_active_tab_v2';
const STATE_SUBTAB_KEY = 'vyte_state_subtab_v2';
const STATE_SEARCH_KEY = 'vyte_state_global_search_v2';
const STATE_IND_FILTER_KEY = 'vyte_state_industry_filter_v2';

const FALLBACK_RATES: Record<CurrencyCode, number> = {
  MYR: 1.0,
  SGD: 0.313,
  USD: 0.244,
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

// Strips any legacy "Mod 1:", "Module 1:" references from saved strings
function stripModulePrefix(text: string): string {
  return text
      .replace(/\bMod(?:ule)?\s*[1-5]\s*[:\-]?\s*/gi, '')
      .replace(/\bin\s+Mod(?:ule)?\s*[1-5]\b/gi, '')
      .trim();
}

export default function App() {
  const [userSession, setUserSession] = useState<UserSession | null>(null);
  const [splashDone, setSplashDone] = useState<boolean>(false);

  const [isValidatingRefreshSession, setIsValidatingRefreshSession] = useState<boolean>(() => {
    return Boolean(localStorage.getItem(SESSION_STORAGE_KEY));
  });

  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [role, setRole] = useState<UserRole>('SME_OWNER');

  const [activeTab, setActiveTab] = useState<ActiveTab>(() =>
      loadPersistedState<ActiveTab>(STATE_TAB_KEY, 'mod1')
  );
  const [inventorySubTab, setInventorySubTab] = useState<'restock' | 'orders'>(() =>
      loadPersistedState<'restock' | 'orders'>(STATE_SUBTAB_KEY, 'restock')
  );
  const [industryFilter, setIndustryFilter] = useState<string>(() =>
      loadPersistedState<string>(STATE_IND_FILTER_KEY, 'ALL')
  );
  const [searchQuery, setSearchQuery] = useState<string>(() =>
      loadPersistedState<string>(STATE_SEARCH_KEY, '')
  );

  const [currency, setCurrency] = useState<CurrencyCode>(() => {
    const stored = localStorage.getItem(CURRENCY_STORAGE_KEY);
    return stored && stored in CURRENCY_SYMBOLS ? (stored as CurrencyCode) : 'MYR';
  });
  const [exchangeRates, setExchangeRates] = useState<Record<CurrencyCode, number>>(() =>
      loadPersistedState<Record<CurrencyCode, number>>(FX_RATES_STORAGE_KEY, FALLBACK_RATES)
  );
  const [rateSourceLabel, setRateSourceLabel] = useState<string>('Syncing Live FX API...');

  const [loadingOverlayMessage, setLoadingOverlayMessage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [pendingCustomerOrderCount, setPendingCustomerOrderCount] = useState<number>(1);
  const [deductedOrderIds, setDeductedOrderIds] = useState<Record<string, boolean>>({});

  const [products, setProducts] = useState<Product[]>(() =>
      loadPersistedState<Product[]>(STATE_PRODUCTS_KEY, INITIAL_PRODUCTS)
  );
  const [qcAlerts, setQcAlerts] = useState<QCAlert[]>(() =>
      loadPersistedState<QCAlert[]>(STATE_QC_KEY, INITIAL_QC_ALERTS)
  );
  const [invoices, setInvoices] = useState<InvoiceItem[]>(() => {
    const loaded = loadPersistedState<InvoiceItem[]>(STATE_INVOICES_KEY, INITIAL_INVOICES);
    return loaded
        .filter((inv) => !inv.invNo.startsWith('CLM-'))
        .map((inv) => ({
          ...inv,
          aiCategory: stripModulePrefix(inv.aiCategory),
        }));
  });
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const loaded = loadPersistedState<AuditLog[]>(STATE_LOGS_KEY, INITIAL_AUDIT_LOGS);
    return loaded.map((log) => ({
      ...log,
      module: stripModulePrefix(log.module) || 'System Hub',
      detail: stripModulePrefix(log.detail),
    }));
  });

  const [complianceProfiles, setComplianceProfiles] = useState<BusinessComplianceProfile[]>(() =>
      loadPersistedState<BusinessComplianceProfile[]>(
          STATE_COMPLIANCE_PROFILES_KEY,
          INITIAL_COMPLIANCE_PROFILES
      )
  );
  const [vaultDocs, setVaultDocs] = useState<DocumentVaultItem[]>(() =>
      loadPersistedState<DocumentVaultItem[]>(STATE_VAULT_DOCS_KEY, INITIAL_VAULT_DOCS)
  );
  const [renewalTasks, setRenewalTasks] = useState<RenewalTask[]>(() =>
      loadPersistedState<RenewalTask[]>(STATE_RENEWAL_TASKS_KEY, INITIAL_RENEWAL_TASKS)
  );

  const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
  const activeExchangeRate = exchangeRates[currency] ?? 1.0;
  const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';

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
    localStorage.setItem(STATE_COMPLIANCE_PROFILES_KEY, JSON.stringify(complianceProfiles));
  }, [complianceProfiles]);

  useEffect(() => {
    localStorage.setItem(STATE_VAULT_DOCS_KEY, JSON.stringify(vaultDocs));
  }, [vaultDocs]);

  useEffect(() => {
    localStorage.setItem(STATE_RENEWAL_TASKS_KEY, JSON.stringify(renewalTasks));
  }, [renewalTasks]);

  useEffect(() => {
    localStorage.setItem(STATE_TAB_KEY, JSON.stringify(activeTab));
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(STATE_SUBTAB_KEY, JSON.stringify(inventorySubTab));
  }, [inventorySubTab]);

  useEffect(() => {
    localStorage.setItem(STATE_IND_FILTER_KEY, JSON.stringify(industryFilter));
  }, [industryFilter]);

  useEffect(() => {
    localStorage.setItem(STATE_SEARCH_KEY, JSON.stringify(searchQuery));
  }, [searchQuery]);

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

  const fetchLiveExchangeRates = useCallback(
      async (notifyUser = false) => {
        try {
          const res1 = await fetch('https://open.er-api.com/v6/latest/MYR');
          if (res1.ok) {
            const data1 = await res1.json();
            if (data1?.rates?.SGD && data1?.rates?.USD) {
              const nextRates: Record<CurrencyCode, number> = {
                MYR: 1.0,
                SGD: Number(data1.rates.SGD),
                USD: Number(data1.rates.USD),
              };
              setExchangeRates(nextRates);
              localStorage.setItem(FX_RATES_STORAGE_KEY, JSON.stringify(nextRates));
              setRateSourceLabel(
                  `ExchangeRate-API Live â€¢ 1 RM = ${nextRates.SGD.toFixed(3)} SGD | ${nextRates.USD.toFixed(3)} USD`
              );
              if (notifyUser) {
                pushToast(
                    'success',
                    `Synced live market rates: 1 MYR = ${nextRates.SGD.toFixed(3)} SGD / ${nextRates.USD.toFixed(3)} USD`
                );
              }
              return;
            }
          }
        } catch {
          // Fallback to Provider 2
        }

        try {
          const res2 = await fetch('https://api.frankfurter.dev/v1/latest?base=MYR&symbols=SGD,USD');
          if (res2.ok) {
            const data2 = await res2.json();
            if (data2?.rates?.SGD && data2?.rates?.USD) {
              const nextRates: Record<CurrencyCode, number> = {
                MYR: 1.0,
                SGD: Number(data2.rates.SGD),
                USD: Number(data2.rates.USD),
              };
              setExchangeRates(nextRates);
              localStorage.setItem(FX_RATES_STORAGE_KEY, JSON.stringify(nextRates));
              setRateSourceLabel(
                  `ECB Frankfurter Live â€¢ 1 RM = ${nextRates.SGD.toFixed(3)} SGD | ${nextRates.USD.toFixed(3)} USD`
              );
              if (notifyUser) {
                pushToast(
                    'success',
                    `Synced ECB live rates: 1 MYR = ${nextRates.SGD.toFixed(3)} SGD / ${nextRates.USD.toFixed(3)} USD`
                );
              }
              return;
            }
          }
        } catch {
          // Fallback to Provider 3
        }

        try {
          const res3 = await fetch(
              'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/myr.json'
          );
          if (res3.ok) {
            const data3 = await res3.json();
            if (data3?.myr?.sgd && data3?.myr?.usd) {
              const nextRates: Record<CurrencyCode, number> = {
                MYR: 1.0,
                SGD: Number(data3.myr.sgd),
                USD: Number(data3.myr.usd),
              };
              setExchangeRates(nextRates);
              localStorage.setItem(FX_RATES_STORAGE_KEY, JSON.stringify(nextRates));
              setRateSourceLabel(
                  `CDN Forex Live â€¢ 1 RM = ${nextRates.SGD.toFixed(3)} SGD | ${nextRates.USD.toFixed(3)} USD`
              );
              return;
            }
          }
        } catch {
          setRateSourceLabel('Cached Market FX Rate Active');
        }
      },
      [pushToast]
  );

  useEffect(() => {
    void fetchLiveExchangeRates(false);
  }, [fetchLiveExchangeRates]);

  const handleCurrencyChange = (newCurrency: CurrencyCode) => {
    setCurrency(newCurrency);
    localStorage.setItem(CURRENCY_STORAGE_KEY, newCurrency);
    const rate = exchangeRates[newCurrency] ?? 1.0;
    pushToast(
        'success',
        `Operating currency set to ${newCurrency} (${CURRENCY_SYMBOLS[newCurrency]}) â€¢ 1 MYR = ${rate.toFixed(3)} ${newCurrency}`
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
            module: stripModulePrefix(module) || 'System Hub',
            role: overrideRole ?? role,
            detail: stripModulePrefix(detail),
          },
          ...prev,
        ]);
      },
      [role]
  );

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
          new Promise((resolve) => setTimeout(resolve, 450)),
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
        `Signed in as ${session.userName} (${session.userID}) â€¢ Role: ${session.userType} â€¢ Organization: ${session.companyName}.`,
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
        'Auto Restock',
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
        'Delivery Confirmed',
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
        'Stock Dispatch',
        `Dispatched ${actualDeducted} ${target.uom} of ${target.name} (Invoice ${posInvoiceNo}: ${currencySymbol} ${(saleAmountRM * activeExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Remaining: ${newStock} ${target.uom}.${
            isTriggered ? ' [LOW STOCK TRIGGERED]' : ''
        }`
    );
    pushToast(
        'success',
        `Deducted ${actualDeducted} ${target.uom} of ${target.name} & created Invoice ${posInvoiceNo}.`
    );
  };

  const handleSaveProduct = (newProd: NewProductForm) => {
    const basePriceRM = Number((Number(newProd.priceRM) / activeExchangeRate).toFixed(2));
    const isLow = Number(newProd.stock) <= Number(newProd.minThreshold);

    let parsedBatch: string | undefined = undefined;
    let parsedExpiry: string | undefined = undefined;
    if (newProd.industry === 'FNB_PERISHABLE' && newProd.extraAttr) {
      const parts = newProd.extraAttr.split('â€¢');
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
        'Catalog',
        `Added ${created.industry} SKU "${created.name}" (${created.stock} ${created.uom}). ${
            isLow ? 'Low-stock trigger activated.' : ''
        }`
    );
    setShowAddModal(false);
    pushToast('success', `Added ${created.name} (${created.sku}) to catalog.`);
  };

  const handleBatchImportProducts = (importedList: Product[]) => {
    if (importedList.length === 0) return;
    setProducts((prev) => [...importedList, ...prev]);
    addAuditLog(
        'Spreadsheet Import',
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
        'AI Forecast Applied',
        `${aiReason} -> Updated ${product.name} reorder quantity to +${recommendedQty} ${product.uom} & triggered approval in Auto Restock.`
    );

    setActiveTab('mod1');
    setInventorySubTab('restock');
    pushToast('info', `AI restock forecast applied to ${product.name}.`);
  };

  // Requirement 4: When Customer Orders detects a stock shortage, automatically flag those SKUs in Auto Restock
  const handleTriggerShortageRestock = useCallback(
      (shortageItems: { productID: string; neededQty: number }[]) => {
        if (shortageItems.length === 0) return;

        setProducts((prev) =>
            prev.map((p) => {
              const match = shortageItems.find((s) => s.productID === p.id);
              if (!match) return p;
              const recommendedPoQty = Math.max(
                  p.reorderQty,
                  match.neededQty + p.minThreshold
              );
              return {
                ...p,
                reorderQty: recommendedPoQty,
                restockStatus:
                    p.restockStatus === 'SUPPLIER_CONTACTED'
                        ? 'SUPPLIER_CONTACTED'
                        : 'TRIGGERED_PENDING_APPROVAL',
              };
            })
        );
      },
      []
  );

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
        'Order Approved',
        `Approved NLP Order ${orderId} for ${customerName}. ${
            inventoryDeducted ? 'Deducted stock' : 'Stock unchanged'
        } & created Invoice ${invoiceId} (${currencySymbol} ${(totalOrderRM * activeExchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) in Smart Invoices.`
    );
  };

  const handleDispatchQCToHrStaff = (
      qcId: string,
      staff: OrbyteHrStaff,
      priority: 'URGENT' | 'HIGH' | 'NORMAL',
      dueDate: string,
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
                  assignedStaffDepartment: staff.department,
                  assignedStaffPosition: staff.position,
                  assignedStaffRole: `${staff.position} (${staff.department})`,
                  assignedPriority: priority,
                  assignedDueDate: dueDate,
                  hrNotes: hrNotes || q.aiSuggestion,
                  assignedAt: nowTime,
                  hrEscalated: false,
                  hrEscalationPayload: undefined,
                }
                : q
        )
    );

    addAuditLog(
        'Orbyte HR Hub',
        `Dispatched QC Task ${hrTaskId} ("${targetQc.actionLabel}" for ${targetQc.productName} â€¢ Batch ${targetQc.batchNo}) to Orbyte HR Staff: ${staff.name} (${staff.staffId}) [Due: ${dueDate} â€¢ Priority: ${priority}].`
    );
    pushToast(
        'success',
        `Task ${hrTaskId} assigned to ${staff.name} (Due: ${dueDate}).`
    );
  };

  const handleEscalateOverdueToHr = useCallback(
      (
          qcId: string,
          payload: OrbyteHrOverdueEscalationPayload,
          simulatedPastDate?: string
      ) => {
        setQcAlerts((prev) =>
            prev.map((q) =>
                q.id === qcId
                    ? {
                      ...q,
                      assignedDueDate: simulatedPastDate ?? q.assignedDueDate,
                      hrEscalated: true,
                      hrEscalationPayload: payload,
                    }
                    : q
            )
        );

        addAuditLog(
            'Orbyte HR Escalation',
            `OVERDUE SLA BREACH: Task ${payload.hrTaskId} assigned to ${payload.staff.name} (${payload.staff.staffId}) passed due date (${payload.taskDetails.assignedDueDate}) while undone. Sent escalation payload ${payload.escalationId} to Orbyte HR System.`
        );
        pushToast(
            'warning',
            `Overdue task ${payload.hrTaskId} escalated to Orbyte HR System (${payload.staff.name}).`
        );
      },
      [addAuditLog, pushToast]
  );

  const handleCompleteHrQcTask = (qcId: string) => {
    const targetQc = qcAlerts.find((q) => q.id === qcId);
    if (!targetQc) return;

    const todayIso = new Date().toISOString().slice(0, 10);
    const isCompletedLate = Boolean(
        targetQc.hrEscalated ||
        (targetQc.assignedDueDate && targetQc.assignedDueDate < todayIso)
    );

    setQcAlerts((prev) =>
        prev.map((q) =>
            q.id === qcId
                ? {
                  ...q,
                  status: 'APPROVED_RESOLVED',
                  completedAtDate: todayIso,
                  completedLate: isCompletedLate,
                }
                : q
        )
    );

    addAuditLog(
        'Orbyte HR Completed',
        `Orbyte HR Staff ${targetQc.assignedStaffName || 'Operator'} (${
            targetQc.hrTaskId || 'QC-TASK'
        }) completed task for ${targetQc.productName} (${targetQc.batchNo}) [${
            isCompletedLate
                ? `COMPLETED LATE â€” Past Due Date ${targetQc.assignedDueDate}`
                : 'Completed On Time'
        }]. Prevented loss: ${currencySymbol} ${(
            targetQc.savedRM * activeExchangeRate
        ).toFixed(2)}.`
    );
    pushToast(
        isCompletedLate ? 'warning' : 'success',
        isCompletedLate
            ? `Task ${targetQc.hrTaskId || targetQc.batchNo} marked done (Completed Late â€” Past Due).`
            : `Task ${targetQc.hrTaskId || targetQc.batchNo} completed on time by HR staff.`
    );
  };

  const handleAddCustomQCAlert = (newAlert: QCAlert) => {
    setQcAlerts((prev) => [newAlert, ...prev]);
    addAuditLog(
        'Quality & Expiry',
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
          'Quality AI Scan',
          `AI Expiry Scan detected ${newlyDetected.length} new at-risk perishable batch(es).`
      );
      pushToast('warning', `Detected ${newlyDetected.length} new at-risk batch(es).`);
    } else {
      addAuditLog(
          'Quality AI Scan',
          'Completed batch scan â€” all active perishable batches are monitored.'
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
        'Smart Invoices',
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
        'Payment Status',
        `Marked invoice ${target.invNo} (${target.party}) as ${nextPaid ? 'PAID' : 'UNPAID'}.`
    );
  };

  const handleAddValidatedInvoice = (createdInv: InvoiceItem) => {
    setInvoices((prev) => [createdInv, ...prev]);
    addAuditLog(
        'Invoice Uploaded',
        `Uploaded & AI-classified ${createdInv.invNo} (${createdInv.party} â€¢ ${currencySymbol} ${(createdInv.amountRM * activeExchangeRate).toFixed(2)}) -> ${createdInv.aiCategory}.`
    );
    pushToast('success', `Uploaded & classified invoice ${createdInv.invNo}.`);
  };

  const handleBatchImportInvoices = (importedInvoices: InvoiceItem[]) => {
    if (importedInvoices.length === 0) return;
    setInvoices((prev) => [...importedInvoices, ...prev]);
    addAuditLog(
        'Spreadsheet Import',
        `Batch-imported ${importedInvoices.length} invoice(s) via Excel/CSV spreadsheet.`
    );
    pushToast('success', `Imported ${importedInvoices.length} invoices from spreadsheet.`);
  };

  const pendingRestockCount = products.filter(
      (p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL'
  ).length;
  const pendingQcCount = qcAlerts.filter((q) => q.status !== 'APPROVED_RESOLVED').length;
  const pendingInvoiceCount = invoices.filter((i) => i.status === 'NEEDS_REVIEW').length;
  const pendingComplianceCount = complianceProfiles.filter(
      (p) => p.complianceStatus === 'EXPIRING_SOON' || p.complianceStatus === 'EXPIRED'
  ).length;

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
            pendingComplianceCount={pendingComplianceCount}
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
              onRefreshRates={() => void fetchLiveExchangeRates(true)}
              totalSkus={products.length}
              pendingRestocks={pendingRestockCount}
              pendingOrders={pendingCustomerOrderCount}
              pendingQcBatches={pendingQcCount}
              totalInvoices={invoices.length}
              pendingInvoices={pendingInvoiceCount}
              onNavigateFromNotification={handleNavigateFromNotification}
          />

          <main className="flex-1 overflow-y-auto pr-1 space-y-4">
            {(activeTab === 'mod1' || activeTab === 'mod3') && (
                <div className="space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                        Auto Restock &amp; Catalog ({pendingRestockCount} Pending)
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
                        Customer Orders &amp; NLP ({pendingCustomerOrderCount})
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1.5">
                    SME Industry Profile:
                  </span>
                      <button
                          type="button"
                          onClick={() => setIndustryFilter('ALL')}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                              industryFilter === 'ALL'
                                  ? 'bg-slate-900 text-white font-bold'
                                  : 'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                      >
                        <span>All Templates</span>
                        <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                industryFilter === 'ALL'
                                    ? 'bg-white/20 text-white'
                                    : 'bg-slate-200 text-slate-700'
                            }`}
                        >
                      {products.length}
                    </span>
                      </button>

                      <button
                          type="button"
                          onClick={() => setIndustryFilter('FNB_PERISHABLE')}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                              industryFilter === 'FNB_PERISHABLE'
                                  ? 'bg-rose-100 text-rose-800 font-bold border border-rose-200'
                                  : 'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                        <span>F&amp;B / Perishable</span>
                      </button>

                      <button
                          type="button"
                          onClick={() => setIndustryFilter('RETAIL_VARIANT')}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                              industryFilter === 'RETAIL_VARIANT'
                                  ? 'bg-blue-100 text-blue-800 font-bold border border-blue-200'
                                  : 'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>Retail &amp; Variants</span>
                      </button>

                      <button
                          type="button"
                          onClick={() => setIndustryFilter('B2B_RAW_MATERIAL')}
                          className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                              industryFilter === 'B2B_RAW_MATERIAL'
                                  ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-200'
                                  : 'text-slate-600 hover:bg-slate-100 font-medium'
                          }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>B2B &amp; Packaging</span>
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
                        onTriggerShortageRestock={handleTriggerShortageRestock}
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
                    onEscalateOverdueToHr={handleEscalateOverdueToHr}
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

            {activeTab === 'mod6' && (
                <ComplianceRenewalModule
                    profiles={complianceProfiles}
                    setProfiles={setComplianceProfiles}
                    vaultDocs={vaultDocs}
                    setVaultDocs={setVaultDocs}
                    renewalTasks={renewalTasks}
                    setRenewalTasks={setRenewalTasks}
                    role={role}
                    userID={userSession.userID}
                    currency={currency}
                    exchangeRate={activeExchangeRate}
                    onLogAction={addAuditLog}
                    onTriggerLoadingScreen={handleTriggerLoadingScreen}
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