// src/App.tsx
import { useCallback, useEffect, useState } from 'react';
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
import { getDebugMockMode, orbyteApi, setDebugMockMode } from './services/api';
import { UniversalSystemMigratorModal } from './components/migration/UniversalSystemMigratorModal';
import { CustomerSupportPortalModal } from './components/support/CustomerSupportPortalModal';

const SESSION_KEY = 'vyte_active_session_v1';
const FALLBACK_RATES: Record<CurrencyCode, number> = {
    MYR: 1.0,
    SGD: 0.313,
    USD: 0.244,
    RMB: 1.735,
};

const stripModPrefix = (t: string) =>
    t
        .replace(/\bMod(?:ule)?\s*[1-5]\s*[:\-]?\s*/gi, '')
        .replace(/\bin\s+Mod(?:ule)?\s*[1-5]\b/gi, '')
        .trim();

const formatDisplayDate = () =>
    new Date().toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });

function usePersistedState<T>(key: string, fallback: T, transform?: (val: T) => T) {
    const [state, setState] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw) as T;
            return transform ? transform(parsed) : parsed;
        } catch {
            return fallback;
        }
    });
    useEffect(() => {
        localStorage.setItem(key, JSON.stringify(state));
    }, [key, state]);
    return [state, setState] as const;
}

export default function App() {
    const [userSession, setUserSession] = useState<UserSession | null>(null);
    const [splashDone, setSplashDone] = useState(false);
    const [isValidatingRefreshSession, setIsValidatingRefreshSession] = useState(() =>
        Boolean(localStorage.getItem(SESSION_KEY))
    );
    const [toasts, setToasts] = useState<
        { id: string; type: 'success' | 'error' | 'warning' | 'info'; message: string }[]
    >([]);
    const [role, setRole] = useState<UserRole>('SME_OWNER');
    const [debugMockMode, setDebugMockModeState] = useState<boolean>(getDebugMockMode);

    const [activeTab, setActiveTab] = usePersistedState<ActiveTab>(
        'vyte_state_active_tab_v2',
        'mod1'
    );
    const [inventorySubTab, setInventorySubTab] = usePersistedState<'restock' | 'orders'>(
        'vyte_state_subtab_v2',
        'restock'
    );
    const [industryFilter, setIndustryFilter] = usePersistedState<string>(
        'vyte_state_industry_filter_v2',
        'ALL'
    );
    const [searchQuery, setSearchQuery] = usePersistedState<string>(
        'vyte_state_global_search_v2',
        ''
    );

    const [currency, setCurrency] = useState<CurrencyCode>(() => {
        const s = localStorage.getItem('vyte_currency');
        return s && s in CURRENCY_SYMBOLS ? (s as CurrencyCode) : 'MYR';
    });
    const [exchangeRates, setExchangeRates] = usePersistedState<Record<CurrencyCode, number>>(
        'vyte_live_fx_rates_v2',
        FALLBACK_RATES,
        (saved) => ({ ...FALLBACK_RATES, ...saved })
    );

    const [rateSourceLabel, setRateSourceLabel] = useState('Syncing FX rates...');
    const [loadingOverlayMessage, setLoadingOverlayMessage] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showMigratorModal, setShowMigratorModal] = useState(false);
    const [showSupportModal, setShowSupportModal] = useState(false);
    const [pendingCustomerOrderCount, setPendingCustomerOrderCount] = useState(1);
    const [deductedOrderIds, setDeductedOrderIds] = useState<Record<string, boolean>>({});

    const [products, setProducts] = usePersistedState<Product[]>(
        'vyte_state_products_v2',
        INITIAL_PRODUCTS
    );
    const [qcAlerts, setQcAlerts] = usePersistedState<QCAlert[]>(
        'vyte_state_qc_v2',
        INITIAL_QC_ALERTS
    );
    const [invoices, setInvoices] = usePersistedState<InvoiceItem[]>(
        'vyte_state_invoices_v2',
        INITIAL_INVOICES,
        (list) =>
            list
                .filter((i) => !i.invNo.startsWith('CLM-'))
                .map((i) => ({ ...i, aiCategory: stripModPrefix(i.aiCategory) }))
    );
    const [auditLogs, setAuditLogs] = usePersistedState<AuditLog[]>(
        'vyte_state_logs_v2',
        INITIAL_AUDIT_LOGS,
        (list) =>
            list.map((l) => ({
                ...l,
                module: stripModPrefix(l.module) || 'System',
                detail: stripModPrefix(l.detail),
            }))
    );
    const [complianceProfiles, setComplianceProfiles] = usePersistedState<
        BusinessComplianceProfile[]
    >('vyte_state_compliance_profiles_v4', INITIAL_COMPLIANCE_PROFILES);
    const [vaultDocs, setVaultDocs] = usePersistedState<DocumentVaultItem[]>(
        'vyte_state_vault_docs_v2',
        INITIAL_VAULT_DOCS
    );
    const [renewalTasks, setRenewalTasks] = usePersistedState<RenewalTask[]>(
        'vyte_state_renewal_tasks_v1',
        INITIAL_RENEWAL_TASKS
    );

    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
    const activeExchangeRate = exchangeRates[currency] ?? 1.0;

    const pushToast = useCallback(
        (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
            const id = `T-${Date.now()}-${Math.random()}`;
            setToasts((p) => [...p, { id, type, message }]);
            setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 4200);
        },
        []
    );

    const addAuditLog = useCallback(
        (module: string, detail: string, overrideRole?: UserRole) => {
            const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
            setAuditLogs((p) => [
                {
                    id: `L-${Date.now()}-${Math.random()}`,
                    time,
                    module: stripModPrefix(module) || 'System',
                    role: overrideRole ?? role,
                    detail: stripModPrefix(detail),
                },
                ...p,
            ]);
        },
        [role, setAuditLogs]
    );

    const handleRemoveProduct = (productId: string) => {
        const target = products.find((p) => p.id === productId);
        if (!target) return;
        setProducts((prev) =>
            prev.map((prod) => {
                if (prod.id !== productId) return prod;
                return {
                    ...prod,
                    visibility: false,
                    isArchived: true,
                    isRemoved: true,
                    stock: 0,
                    restockStatus: 'HEALTHY',
                    decommissionedAt: new Date().toISOString(),
                };
            })
        );
        addAuditLog(
            'Catalog',
            `Decommissioned product "${target.name}" (${target.sku}). Historical invoices and logs preserved; future sales and restocks disabled.`
        );
        pushToast(
            'info',
            `Decommissioned "${target.name}". Historical records are preserved.`
        );
    };

    const syncWithBackend = useCallback(
        async (isDebug: boolean, showNotification = false) => {
            if (isDebug) {
                setProducts(INITIAL_PRODUCTS);
                setQcAlerts(INITIAL_QC_ALERTS);
                setInvoices(INITIAL_INVOICES);
                setAuditLogs(INITIAL_AUDIT_LOGS);
                setComplianceProfiles(INITIAL_COMPLIANCE_PROFILES);
                setVaultDocs(INITIAL_VAULT_DOCS);
                setRenewalTasks(INITIAL_RENEWAL_TASKS);
                if (showNotification) {
                    pushToast('info', 'Debug Mode enabled: restored local mock dataset.');
                }
                return;
            }
            setProducts([]);
            setQcAlerts([]);
            setInvoices([]);
            setAuditLogs([]);
            setComplianceProfiles([]);
            setVaultDocs([]);
            setRenewalTasks([]);
            try {
                const data = await orbyteApi.fetchWorkspaceData();
                setProducts(data.products);
                setQcAlerts(data.qcAlerts);
                setInvoices(data.invoices);
                setAuditLogs(data.auditLogs);
                if (showNotification) {
                    pushToast('success', `Synced ${data.products.length} products from live backend.`);
                }
            } catch {
                if (showNotification) {
                    pushToast('error', 'Cannot reach backend server. Workspace cleared.');
                }
            }
        },
        [
            pushToast,
            setAuditLogs,
            setComplianceProfiles,
            setInvoices,
            setProducts,
            setQcAlerts,
            setRenewalTasks,
            setVaultDocs,
        ]
    );

    useEffect(() => {
        if (userSession && !debugMockMode) void syncWithBackend(false, false);
    }, [userSession, debugMockMode, syncWithBackend]);

    const handleToggleDebugMode = (enabled: boolean) => {
        setDebugMockMode(enabled);
        setDebugMockModeState(enabled);
        void syncWithBackend(enabled, true);
    };

    const fetchLiveExchangeRates = useCallback(async (notifyUser = false) => {
        const providers = [
            {
                url: 'https://open.er-api.com/v6/latest/MYR',
                name: 'ExchangeRate-API Live',
                parse: (d: any) =>
                    d?.rates?.SGD && d?.rates?.USD && d?.rates?.CNY
                        ? { SGD: +d.rates.SGD, USD: +d.rates.USD, RMB: +d.rates.CNY }
                        : null,
            },
            {
                url: 'https://api.frankfurter.dev/v1/latest?base=MYR&symbols=SGD,USD,CNY',
                name: 'ECB Frankfurter Live',
                parse: (d: any) =>
                    d?.rates?.SGD && d?.rates?.USD && d?.rates?.CNY
                        ? { SGD: +d.rates.SGD, USD: +d.rates.USD, RMB: +d.rates.CNY }
                        : null,
            },
            {
                url: 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/myr.json',
                name: 'CDN Forex Live',
                parse: (d: any) =>
                    d?.myr?.sgd && d?.myr?.usd && d?.myr?.cny
                        ? { SGD: +d.myr.sgd, USD: +d.myr.usd, RMB: +d.myr.cny }
                        : null,
            },
        ];

        for (const p of providers) {
            try {
                const res = await fetch(p.url);
                if (!res.ok) continue;
                const parsed = p.parse(await res.json());
                if (parsed) {
                    const next: Record<CurrencyCode, number> = {
                        MYR: 1.0,
                        SGD: parsed.SGD,
                        USD: parsed.USD,
                        RMB: parsed.RMB,
                    };
                    setExchangeRates(next);
                    setRateSourceLabel(
                        `${p.name} • 1 RM = ${next.SGD.toFixed(3)} SGD | ${next.USD.toFixed(3)} USD | ${next.RMB.toFixed(3)} RMB`
                    );
                    if (notifyUser) {
                        pushToast(
                            'success',
                            `Synced live rates: 1 MYR = ${next.SGD.toFixed(3)} SGD / ${next.USD.toFixed(3)} USD / ${next.RMB.toFixed(3)} RMB`
                        );
                    }
                    return;
                }
            } catch {
                /* try next provider */
            }
        }
        setRateSourceLabel('Cached Market FX Rate Active');
    }, [pushToast, setExchangeRates]);

    useEffect(() => {
        void fetchLiveExchangeRates(false);
    }, [fetchLiveExchangeRates]);

    const handleCurrencyChange = (newCurrency: CurrencyCode) => {
        setCurrency(newCurrency);
        localStorage.setItem('vyte_currency', newCurrency);
        pushToast('success', `Currency set to ${newCurrency} (${CURRENCY_SYMBOLS[newCurrency]})`);
    };

    const handleTriggerLoadingScreen = useCallback((message: string, durationMs = 900) => {
        setLoadingOverlayMessage(message);
        setTimeout(() => setLoadingOverlayMessage(null), durationMs);
    }, []);

    useEffect(() => {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) {
            setIsValidatingRefreshSession(false);
            return;
        }
        let mounted = true;
        (async () => {
            try {
                const parsed = JSON.parse(raw) as { session: UserSession; accessToken: string };
                if (!parsed?.session?.userID || !parsed?.accessToken) throw new Error();
                const [res] = await Promise.all([
                    orbyteApi.validateSession(
                        {
                            accessToken: parsed.accessToken,
                            userID: parsed.session.userID,
                            email: parsed.session.email,
                        },
                        parsed.session
                    ),
                    new Promise((r) => setTimeout(r, 450)),
                ]);
                if (mounted && res.data.valid) {
                    setUserSession(res.data.session);
                    setRole(res.data.session.role);
                    setSplashDone(true);
                } else {
                    localStorage.removeItem(SESSION_KEY);
                }
            } catch {
                localStorage.removeItem(SESSION_KEY);
            } finally {
                if (mounted) setIsValidatingRefreshSession(false);
            }
        })();
        return () => {
            mounted = false;
        };
    }, []);

    const handleAuthenticated = (
        session: UserSession,
        accessToken = `vyte-jwt-${Date.now()}`
    ) => {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ session, accessToken }));
        setUserSession(session);
        setRole(session.role);
        setSplashDone(false);
        addAuditLog(
            'Auth',
            `Signed in as ${session.userName} (${session.userID}) • Role: ${session.userType} • ${session.companyName}.`,
            session.role
        );
    };

    const handleLogout = () => {
        localStorage.removeItem(SESSION_KEY);
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
        if (subTab) setInventorySubTab(subTab);
    };

    const handleApproveAndContactSupplier = async (
        productId: string,
        customReorderQty?: number
    ) => {
        if (!canApprove) {
            return pushToast(
                'error',
                'Access denied: Only Owner or Manager accounts can approve purchase orders.'
            );
        }
        const target = products.find((p) => p.id === productId);
        if (!target || target.isRemoved || !target.visibility) return;
        const orderQty =
            customReorderQty && customReorderQty > 0 ? customReorderQty : target.reorderQty;
        const poNumber = `PO-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        await orbyteApi.contactSupplier({
            poNumber,
            productId: target.id,
            supplierName: target.supplierName,
            supplierPhoneNumber: target.supplierContact,
            channel: 'WHATSAPP',
            messageBody: `Vyte PO ${poNumber}: Please supply ${orderQty} ${target.uom} of ${target.name} (${target.sku}).`,
            userID: userSession?.userID || 'M067',
            role,
        });

        setProducts((p) =>
            p.map((x) =>
                x.id === productId
                    ? { ...x, reorderQty: orderQty, restockStatus: 'SUPPLIER_CONTACTED' }
                    : x
            )
        );
        const unitCost = target.unitCostRM ?? Number((target.priceRM * 0.62).toFixed(2));
        const poTotalRM = Number((unitCost * orderQty).toFixed(2));
        const poInvoiceNo = `SUP-${poNumber}`;

        if (debugMockMode) {
            setInvoices((p) => [
                {
                    id: `INV-${Date.now()}`,
                    invNo: poInvoiceNo,
                    type: 'SUPPLIER_PAYABLE',
                    party: target.supplierName,
                    date: formatDisplayDate(),
                    amountRM: poTotalRM,
                    aiCategory: `Inventory Procurement (${orderQty} ${target.uom} ${target.name})`,
                    aiConfidence: 98,
                    paid: false,
                    status: 'NEEDS_REVIEW',
                },
                ...p,
            ]);
        }
        addAuditLog(
            'Restock',
            `Approved PO ${poNumber} (+${orderQty} ${target.uom} ${target.name}) to ${target.supplierName}.`
        );
        pushToast('success', `PO ${poNumber} dispatched to ${target.supplierName}.`);
    };

    const handleConfirmSupplierDelivery = async (productId: string) => {
        const target = products.find((p) => p.id === productId);
        if (!target || target.isRemoved || !target.visibility) return;
        const res = await orbyteApi.confirmRestock({
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

        if (res.data.backendProduct) {
            setProducts((p) =>
                p.map((x) => (x.id === productId ? res.data.backendProduct! : x))
            );
            if (res.data.backendInvoice) {
                setInvoices((p) => [
                    res.data.backendInvoice!,
                    ...p.filter((i) => i.id !== res.data.backendInvoice!.id),
                ]);
            }
        } else {
            const newStock = target.stock + target.reorderQty;
            setProducts((p) =>
                p.map((x) =>
                    x.id === productId
                        ? {
                            ...x,
                            stock: newStock,
                            restockStatus:
                                newStock <= x.minThreshold ? 'TRIGGERED_PENDING_APPROVAL' : 'CONFIRMED',
                        }
                        : x
                )
            );
        }
        addAuditLog(
            'Delivery',
            `Received +${target.reorderQty} ${target.uom} of ${target.name} from ${target.supplierName}.`
        );
        pushToast(
            'success',
            `Confirmed delivery of +${target.reorderQty} ${target.uom} ${target.name}.`
        );
    };

    const handleRecordStockUsage = async (productId: string, usedQty: number) => {
        const target = products.find((p) => p.id === productId);
        if (!target || target.isRemoved || !target.visibility || target.stock <= 0 || usedQty <= 0) {
            return;
        }
        const actual = Math.min(usedQty, target.stock);
        const saleAmountRM = Number((actual * target.priceRM).toFixed(2));
        const posInvoiceNo = `SALE-2026-${Math.floor(1000 + Math.random() * 9000)}`;

        const updatedProd = await orbyteApi
            .recordStockMovement(
                productId,
                -actual,
                'SALE',
                `Counter Sale (${posInvoiceNo})`,
                userSession?.userID || 'M067'
            )
            .catch(() => null);
        if (updatedProd) {
            setProducts((p) => p.map((x) => (x.id === productId ? updatedProd : x)));
        } else {
            const newStock = Math.max(0, target.stock - actual);
            setProducts((p) =>
                p.map((x) =>
                    x.id === productId
                        ? {
                            ...x,
                            stock: newStock,
                            restockStatus:
                                newStock <= x.minThreshold && x.restockStatus !== 'SUPPLIER_CONTACTED'
                                    ? 'TRIGGERED_PENDING_APPROVAL'
                                    : x.restockStatus,
                        }
                        : x
                )
            );
        }

        const backendInv = await orbyteApi.createBackendInvoice({
            type: 'CUSTOMER_RECEIVABLE',
            party: `Direct Sale (${target.sku})`,
            amountRM: saleAmountRM,
            invNo: posInvoiceNo,
            aiCategory: `Product Sales (${actual} ${target.uom} ${target.name})`,
            sourceRef: target.id,
        });
        setInvoices((p) => [
            backendInv ?? {
                id: `INV-${Date.now()}`,
                invNo: posInvoiceNo,
                type: 'CUSTOMER_RECEIVABLE',
                party: `Direct Sale (${target.sku})`,
                date: formatDisplayDate(),
                amountRM: saleAmountRM,
                aiCategory: `Product Sales (${actual} ${target.uom} ${target.name})`,
                aiConfidence: 99,
                paid: true,
                status: 'NEEDS_REVIEW',
            },
            ...p,
        ]);

        addAuditLog(
            'Dispatch',
            `Dispatched ${actual} ${target.uom} of ${target.name} (${posInvoiceNo}).`
        );
        pushToast(
            'success',
            `Recorded sale of ${actual} ${target.uom} ${target.name} (${posInvoiceNo}).`
        );
    };

    const handleSaveProduct = async (newProd: NewProductForm) => {
        const basePriceRM = Number((Number(newProd.priceRM) / activeExchangeRate).toFixed(2));
        const backendCreated = await orbyteApi
            .createProduct({ ...newProd, priceRM: basePriceRM })
            .catch(() => null);
        if (backendCreated) {
            setProducts((p) => [backendCreated, ...p]);
            addAuditLog(
                'Catalog',
                `Added SKU "${backendCreated.name}" (${backendCreated.stock} ${backendCreated.uom}).`
            );
            setShowAddModal(false);
            pushToast('success', `Added ${backendCreated.name} (${backendCreated.sku}).`);
            return;
        }
        const isLow = Number(newProd.stock) <= Number(newProd.minThreshold);
        const parts = newProd.extraAttr?.split(/[•|]/) || [];
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
            supplierName: newProd.supplierName || 'Preferred Supplier',
            supplierContact: newProd.supplierContact || '+6012-9998888',
            performance: 'Good',
            visibility: true,
            batchNo:
                newProd.industry === 'FNB_PERISHABLE'
                    ? parts[0]?.replace('Batch:', '').trim() || 'B-2026-NEW'
                    : undefined,
            expiryDate:
                newProd.industry === 'FNB_PERISHABLE'
                    ? parts[1]?.replace('Exp:', '').trim() || '2026-11-15'
                    : undefined,
            variantSpec:
                newProd.industry !== 'FNB_PERISHABLE' ? newProd.extraAttr : undefined,
            photoUrl: newProd.photoUrl,
            restockStatus: isLow ? 'TRIGGERED_PENDING_APPROVAL' : 'HEALTHY',
        };
        setProducts((p) => [created, ...p]);
        addAuditLog(
            'Catalog',
            `Added SKU "${created.name}" (${created.stock} ${created.uom}).`
        );
        setShowAddModal(false);
        pushToast('success', `Added ${created.name} (${created.sku}).`);
    };

    const handleBatchImportProducts = (importedList: Product[]) => {
        if (!importedList.length) return;
        setProducts((p) => [...importedList, ...p]);
        addAuditLog('Import', `Batch-imported ${importedList.length} SKU(s) from file.`);
        pushToast('success', `Imported ${importedList.length} products.`);
    };

    const handleQueueRestockToOrderModule = (
        product: Product,
        recommendedQty: number,
        aiReason: string
    ) => {
        if (product.isRemoved || !product.visibility) return;
        setProducts((p) =>
            p.map((x) =>
                x.id === product.id
                    ? {
                        ...x,
                        reorderQty: recommendedQty,
                        restockStatus: 'TRIGGERED_PENDING_APPROVAL',
                    }
                    : x
            )
        );
        addAuditLog(
            'Forecast',
            `${aiReason} -> Updated ${product.name} reorder qty to +${recommendedQty} ${product.uom}.`
        );
        setActiveTab('mod1');
        setInventorySubTab('restock');
        pushToast('info', `Restock quantity updated for ${product.name}.`);
    };

    const handleTriggerShortageRestock = useCallback(
        (shortageItems: { productID: string; neededQty: number }[]) => {
            if (!shortageItems.length) return;
            setProducts((p) =>
                p.map((x) => {
                    if (x.isRemoved || !x.visibility) return x;
                    const m = shortageItems.find((s) => s.productID === x.id);
                    return m
                        ? {
                            ...x,
                            reorderQty: Math.max(x.reorderQty, m.neededQty + x.minThreshold),
                            restockStatus:
                                x.restockStatus === 'SUPPLIER_CONTACTED'
                                    ? 'SUPPLIER_CONTACTED'
                                    : 'TRIGGERED_PENDING_APPROVAL',
                        }
                        : x;
                })
            );
        },
        [setProducts]
    );

    const handleApproveCustomerOrder = (
        items: ExtractedNlpOrderItem[],
        customerName: string,
        orderId: string,
        invoiceId: string,
        inventoryDeducted = true
    ) => {
        if (inventoryDeducted && !deductedOrderIds[orderId]) {
            setDeductedOrderIds((p) => ({ ...p, [orderId]: true }));
            setProducts((p) =>
                p.map((x) => {
                    if (x.isRemoved || !x.visibility) return x;
                    const line = items.find((i) => i.productID === x.id);
                    if (!line) return x;
                    const nextStock = Math.max(0, x.stock - line.requestedQty);
                    return {
                        ...x,
                        stock: nextStock,
                        restockStatus:
                            nextStock <= x.minThreshold && x.restockStatus !== 'SUPPLIER_CONTACTED'
                                ? 'TRIGGERED_PENDING_APPROVAL'
                                : x.restockStatus,
                    };
                })
            );
        }
        const totalOrderRM = items.reduce((s, i) => s + i.lineTotal, 0);
        setInvoices((p) => [
            {
                id: `INV-${Date.now()}`,
                invNo: invoiceId,
                type: 'CUSTOMER_RECEIVABLE',
                party: customerName,
                date: formatDisplayDate(),
                amountRM: totalOrderRM,
                aiCategory: `Customer Order (${items.map((i) => `${i.requestedQty} ${i.name}`).join(', ')})`,
                aiConfidence: 97,
                paid: false,
                status: 'NEEDS_REVIEW',
            },
            ...p,
        ]);
        addAuditLog(
            'Orders',
            `Approved order ${orderId} for ${customerName} (Invoice ${invoiceId}).`
        );
    };

    const handleDispatchQCToWarehouseStaff = (
        qcId: string,
        staff: OrbyteHrStaff,
        priority: 'URGENT' | 'HIGH' | 'NORMAL',
        dueDate: string,
        staffNotes: string
    ) => {
        if (!canApprove) {
            return pushToast(
                'error',
                'Access denied: Only Owner or Manager accounts can assign warehouse QC tasks.'
            );
        }
        const targetQc = qcAlerts.find((q) => q.id === qcId);
        if (!targetQc) return;
        const taskId = `WH-TASK-${Math.floor(1000 + Math.random() * 9000)}`;
        setQcAlerts((p) =>
            p.map((q) =>
                q.id === qcId
                    ? {
                        ...q,
                        status: 'ASSIGNED_TO_STAFF',
                        hrTaskId: taskId,
                        assignedStaffId: staff.staffId,
                        assignedStaffName: staff.name,
                        assignedStaffDepartment: staff.department,
                        assignedStaffPosition: staff.position,
                        assignedStaffRole: `${staff.position} (${staff.department})`,
                        assignedPriority: priority,
                        assignedDueDate: dueDate,
                        hrNotes: staffNotes || q.aiSuggestion,
                        assignedAt: new Date().toLocaleTimeString('en-GB', { hour12: false }),
                        hrEscalated: false,
                        hrEscalationPayload: undefined,
                    }
                    : q
            )
        );
        addAuditLog(
            'Quality Control',
            `Assigned warehouse task ${taskId} (${targetQc.productName}) to ${staff.name}.`
        );
        pushToast('success', `Task ${taskId} assigned to ${staff.name} (Due: ${dueDate}).`);
    };

    const handleEscalateOverdueToSupervisor = useCallback(
        (
            qcId: string,
            payload: OrbyteHrOverdueEscalationPayload,
            simulatedPastDate?: string
        ) => {
            setQcAlerts((p) =>
                p.map((q) =>
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
                'Warehouse Escalation',
                `Overdue warehouse task ${payload.hrTaskId} (${payload.staff.name}) escalated to Warehouse Supervisor.`
            );
            pushToast(
                'warning',
                `Overdue task ${payload.hrTaskId} escalated to Warehouse Supervisor.`
            );
        },
        [addAuditLog, pushToast, setQcAlerts]
    );

    const handleCompleteWarehouseQcTask = async (qcId: string) => {
        const targetQc = qcAlerts.find((q) => q.id === qcId);
        if (!targetQc) return;
        await orbyteApi.approveQcAlert(qcId, userSession?.userID || 'M067');
        const todayIso = new Date().toISOString().slice(0, 10);
        const isLate = Boolean(
            targetQc.hrEscalated ||
            (targetQc.assignedDueDate && targetQc.assignedDueDate < todayIso)
        );
        setQcAlerts((p) =>
            p.map((q) =>
                q.id === qcId
                    ? {
                        ...q,
                        status: 'APPROVED_RESOLVED',
                        completedAtDate: todayIso,
                        completedLate: isLate,
                    }
                    : q
            )
        );
        addAuditLog(
            'Quality Control',
            `${targetQc.assignedStaffName || 'Warehouse Staff'} completed QC task for ${targetQc.productName}.`
        );
        pushToast(
            isLate ? 'warning' : 'success',
            `Task ${targetQc.hrTaskId || targetQc.batchNo} marked complete.`
        );
    };

    const handleTriggerQCScan = async () => {
        const backendScan = await orbyteApi.triggerQcScan();
        if (backendScan) {
            if (backendScan.newAlerts.length > 0) {
                setQcAlerts((p) => [...backendScan.newAlerts, ...p]);
                pushToast(
                    'warning',
                    `Expiry scan found ${backendScan.newAlerts.length} new at-risk batch(es).`
                );
            } else {
                pushToast(
                    'info',
                    `Scanned ${backendScan.scannedCount} batches. No new risks found.`
                );
            }
            return;
        }
        const existingSkus = new Set(qcAlerts.map((q) => q.sku));
        const newlyDetected: QCAlert[] = products
            .filter(
                (p) =>
                    !p.isRemoved &&
                    p.visibility !== false &&
                    p.industry === 'FNB_PERISHABLE' &&
                    !existingSkus.has(p.sku)
            )
            .map((p) => ({
                id: `QC-${Date.now()}-${p.id}`,
                productName: p.name,
                sku: p.sku,
                batchNo: p.batchNo || 'B-2026-SCAN',
                expiryDate: p.expiryDate || '2026-10-26',
                daysLeft: 4,
                qtyAffected: `${p.stock} ${p.uom}`,
                triggerReason: 'Shelf-life threshold (< 5 days remaining)',
                aiSuggestion: `Bundle ${p.name} with morning combo deals (-20%) & relabel ${p.stock} ${p.uom}.`,
                actionLabel: 'Assign Staff: Combo Relabel',
                savedRM: Number((p.stock * p.priceRM * 0.75).toFixed(2)),
                status: 'PENDING_APPROVAL',
            }));
        if (newlyDetected.length > 0) {
            setQcAlerts((p) => [...newlyDetected, ...p]);
            addAuditLog(
                'Quality Scan',
                `Detected ${newlyDetected.length} new at-risk batch(es).`
            );
            pushToast('warning', `Found ${newlyDetected.length} new at-risk batch(es).`);
        } else {
            pushToast(
                'info',
                'Batch scan complete. All perishable items are within safe dates.'
            );
        }
    };

    const handleVerifyInvoice = async (invId: string, updatedCategory?: string) => {
        if (!canApprove) {
            return pushToast(
                'error',
                'Access denied: Only Owner or Manager accounts can verify invoices.'
            );
        }
        const target = invoices.find((i) => i.id === invId);
        if (!target) return;
        await orbyteApi.verifyBackendInvoice(
            invId,
            userSession?.userID || 'M067',
            updatedCategory
        );
        setInvoices((p) =>
            p.map((i) =>
                i.id === invId
                    ? {
                        ...i,
                        aiCategory: updatedCategory ?? i.aiCategory,
                        status: 'VERIFIED',
                    }
                    : i
            )
        );
        addAuditLog('Invoices', `Verified invoice ${target.invNo} (${target.party}).`);
    };

    const handleToggleInvoicePaid = async (invId: string) => {
        const target = invoices.find((i) => i.id === invId);
        if (!target) return;
        const nextPaid = !target.paid;
        await orbyteApi.toggleBackendInvoicePaid(
            invId,
            nextPaid,
            userSession?.userID || 'M067'
        );
        setInvoices((p) => p.map((i) => (i.id === invId ? { ...i, paid: nextPaid } : i)));
        addAuditLog(
            'Invoices',
            `Marked invoice ${target.invNo} as ${nextPaid ? 'PAID' : 'UNPAID'}.`
        );
    };

    const handleAddValidatedInvoice = async (createdInv: InvoiceItem) => {
        const backendInv = await orbyteApi.createBackendInvoice({
            type: createdInv.type,
            party: createdInv.party,
            amountRM: createdInv.amountRM,
            invNo: createdInv.invNo,
            aiCategory: createdInv.aiCategory,
        });
        setInvoices((p) => [backendInv ?? createdInv, ...p]);
        addAuditLog(
            'Invoices',
            `Added invoice ${createdInv.invNo} (${createdInv.aiCategory}).`
        );
        pushToast('success', `Saved invoice ${createdInv.invNo}.`);
    };

    if (isValidatingRefreshSession) {
        return <LoadingScreen isOpen={true} message="Restoring workspace session..." />;
    }
    if (!userSession) return <LoginPage onAuthenticated={handleAuthenticated} />;
    if (!splashDone) return <SplashScreen onComplete={() => setSplashDone(true)} />;

    const activeProducts = products.filter(
        (p) => !p.isRemoved && p.visibility !== false && !(p as any).isArchived
    );
    const pendingRestockCount = activeProducts.filter(
        (p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL'
    ).length;
    const pendingQcCount = qcAlerts.filter((q) => q.status !== 'APPROVED_RESOLVED').length;
    const pendingInvoiceCount = invoices.filter((i) => i.status === 'NEEDS_REVIEW').length;
    const pendingComplianceCount = complianceProfiles.filter(
        (p) =>
            p.complianceStatus === 'EXPIRING_SOON' || p.complianceStatus === 'EXPIRED'
    ).length;
    const q = searchQuery.trim().toLowerCase();

    // Pass matching products (both active and archived) to RestockModule so its Decommissioned History tab works seamlessly
    const filteredCatalogAndArchivedProducts = products.filter(
        (p) =>
            (industryFilter === 'ALL' || p.industry === industryFilter) &&
            (!q ||
                p.name.toLowerCase().includes(q) ||
                p.sku.toLowerCase().includes(q) ||
                p.category.toLowerCase().includes(q))
    );

    return (
        <div className="h-screen overflow-hidden bg-[#F6F7F4] flex p-3 gap-3 text-slate-900 font-sans">
            <Sidebar
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                role={role}
                operatingCurrency={currency}
                onCurrencyChange={handleCurrencyChange}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                pendingRestockCount={pendingRestockCount}
                pendingOrderCount={pendingCustomerOrderCount}
                pendingQcCount={pendingQcCount}
                pendingInvoiceCount={pendingInvoiceCount}
                pendingComplianceCount={pendingComplianceCount}
                auditLogCount={auditLogs.length}
                totalProductCount={activeProducts.length}
                userSession={userSession}
                onLogout={handleLogout}
                debugMockMode={debugMockMode}
                onToggleDebugMockMode={handleToggleDebugMode}
                onOpenMigratorModal={() => setShowMigratorModal(true)}
                onOpenSupportModal={() => setShowSupportModal(true)}
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
                    totalSkus={activeProducts.length}
                    pendingRestocks={pendingRestockCount}
                    pendingOrders={pendingCustomerOrderCount}
                    pendingQcBatches={pendingQcCount}
                    totalInvoices={invoices.length}
                    pendingInvoices={pendingInvoiceCount}
                    totalComplianceProfiles={complianceProfiles.length}
                    pendingCompliance={pendingComplianceCount}
                    totalVaultDocs={vaultDocs.length}
                    totalRenewalTasks={renewalTasks.length}
                    onNavigateFromNotification={handleNavigateFromNotification}
                />

                <main className="flex-1 overflow-y-auto pr-1 space-y-4">
                    {(activeTab === 'mod1' || activeTab === 'mod3') && (
                        <div className="space-y-3.5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                                    {(['restock', 'orders'] as const).map((sub) => (
                                        <button
                                            key={sub}
                                            type="button"
                                            onClick={() => {
                                                setActiveTab('mod1');
                                                setInventorySubTab(sub);
                                            }}
                                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                                inventorySubTab === sub
                                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                                    : 'text-slate-600 hover:text-slate-900'
                                            }`}
                                        >
                                            {sub === 'restock'
                                                ? `Inventory & Restock (${pendingRestockCount} Pending)`
                                                : `Customer Orders (${pendingCustomerOrderCount})`}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex flex-wrap items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200/90 shadow-2xs text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1.5">
                    Industry Filter:
                  </span>
                                    {[
                                        {
                                            id: 'ALL',
                                            label: 'All Items',
                                            activeCls: 'bg-slate-900 text-white font-bold',
                                            dot: null,
                                        },
                                        {
                                            id: 'FNB_PERISHABLE',
                                            label: 'F&B / Perishable',
                                            activeCls:
                                                'bg-rose-100 text-rose-800 font-bold border border-rose-200',
                                            dot: 'bg-rose-500',
                                        },
                                        {
                                            id: 'RETAIL_VARIANT',
                                            label: 'Retail & Variants',
                                            activeCls:
                                                'bg-blue-100 text-blue-800 font-bold border border-blue-200',
                                            dot: 'bg-blue-500',
                                        },
                                        {
                                            id: 'B2B_RAW_MATERIAL',
                                            label: 'B2B & Packaging',
                                            activeCls:
                                                'bg-emerald-100 text-emerald-900 font-bold border border-emerald-200',
                                            dot: 'bg-emerald-500',
                                        },
                                    ].map((f) => (
                                        <button
                                            key={f.id}
                                            type="button"
                                            onClick={() => setIndustryFilter(f.id)}
                                            className={`px-2.5 py-1 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                                industryFilter === f.id
                                                    ? f.activeCls
                                                    : 'text-slate-600 hover:bg-slate-100 font-medium'
                                            }`}
                                        >
                                            {f.dot && <span className={`w-2 h-2 rounded-full ${f.dot}`} />}
                                            <span>{f.label}</span>
                                            {f.id === 'ALL' && (
                                                <span
                                                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                                        industryFilter === 'ALL'
                                                            ? 'bg-white/20 text-white'
                                                            : 'bg-slate-200 text-slate-700'
                                                    }`}
                                                >
                          {activeProducts.length}
                        </span>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className={inventorySubTab === 'restock' ? 'block' : 'hidden'}>
                                <RestockModule
                                    products={filteredCatalogAndArchivedProducts}
                                    role={role}
                                    currency={currency}
                                    exchangeRate={activeExchangeRate}
                                    onApproveAndContactSupplier={handleApproveAndContactSupplier}
                                    onConfirmSupplierDelivery={handleConfirmSupplierDelivery}
                                    onRecordStockUsage={handleRecordStockUsage}
                                    onOpenAddModal={() => setShowAddModal(true)}
                                    onBatchImportProducts={handleBatchImportProducts}
                                    onOpenMigratorModal={() => setShowMigratorModal(true)}
                                    onRemoveProduct={handleRemoveProduct}
                                />
                            </div>

                            <div className={inventorySubTab === 'orders' ? 'block' : 'hidden'}>
                                <OrderStatusModule
                                    products={activeProducts}
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
                            qcAlerts={qcAlerts}
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
                            products={activeProducts}
                            role={role}
                            currency={currency}
                            exchangeRate={activeExchangeRate}
                            onDispatchToHrStaff={handleDispatchQCToWarehouseStaff}
                            onEscalateOverdueToHr={handleEscalateOverdueToSupervisor}
                            onCompleteHrTask={handleCompleteWarehouseQcTask}
                            onTriggerScan={handleTriggerQCScan}
                            onAddCustomQCAlert={(a) => {
                                setQcAlerts((p) => [a, ...p]);
                                addAuditLog('Quality Control', `Logged batch issue for ${a.productName}.`);
                                pushToast('info', `Logged batch alert for ${a.productName}.`);
                            }}
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
                            onBatchImportInvoices={(list) => {
                                if (list.length) {
                                    setInvoices((p) => [...list, ...p]);
                                    pushToast('success', `Imported ${list.length} invoices.`);
                                }
                            }}
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

            <UniversalSystemMigratorModal
                isOpen={showMigratorModal}
                onClose={() => setShowMigratorModal(false)}
                onImportSuccess={({
                                      products: newProds,
                                      invoices: newInvs,
                                      complianceProfiles: newComp,
                                      sourceFileName,
                                      transitionMode,
                                  }) => {
                    if (newProds.length) setProducts((p) => [...newProds, ...p]);
                    if (newInvs.length) setInvoices((p) => [...newInvs, ...p]);
                    if (newComp.length) setComplianceProfiles((p) => [...newComp, ...p]);
                    addAuditLog(
                        'Data Import',
                        `Imported ${newProds.length} SKUs, ${newInvs.length} invoices & ${newComp.length} records from "${sourceFileName}" (Mode: ${transitionMode}).`
                    );
                    pushToast('success', `Imported "${sourceFileName}" (${transitionMode} mode).`);
                }}
            />

            <CustomerSupportPortalModal
                isOpen={showSupportModal}
                onClose={() => setShowSupportModal(false)}
                userSession={userSession}
                onLogAction={addAuditLog}
                onNotify={pushToast}
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