// src/modules/module3-sales/SalesAnalyticsModule.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    TrendingUp,
    Sparkles,
    Calendar,
    DollarSign,
    PackageCheck,
    Clock,
    RefreshCw,
    Download,
    CheckCircle2,
    AlertCircle,
    Search,
    ArrowUpDown,
    Inbox,
    X,
    Wallet,
} from 'lucide-react';
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    CurrencyCode,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    Product,
} from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { orbyteApi } from '../../services/api.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown.tsx';

interface SalesAnalyticsModuleProps {
    products: Product[];
    userID: string;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onQueueRestockToOrderModule: (
        product: Product,
        recommendedQty: number,
        aiReason: string
    ) => void;
    onLogAction: (module: string, detail: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

const SALES_ANALYTICS_STORAGE_KEY = 'vyte_sales_analytics_ui_state_v2';

const MONTH_NAMES = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
];

type SalesSortField = 'name' | 'unitsSold' | 'totalSalesAmount' | 'remainingStock';
type ProcureSortField =
    | 'name'
    | 'currentStock'
    | 'costOfHoldingStock'
    | 'timeNeededToSellOffDays'
    | 'recommendedProcureQty'
    | 'priorityLevel';

interface PersistedSalesUiState {
    activeSubView: 'breakdown' | 'recommendations';
    filterMonth: number | null;
    filterYear: number;
    filterQuarter: number | null;
    selectedCategory: string;
    holdingCostInput: string;
    turnoverDaysInput: string;
    availableCashInput: string;
    dailyBurnInput: string;
    tableSearch: string;
}

export const SalesAnalyticsModule: React.FC<SalesAnalyticsModuleProps> = ({
                                                                              products,
                                                                              userID,
                                                                              currency = 'MYR',
                                                                              exchangeRate = 1.0,
                                                                              onQueueRestockToOrderModule,
                                                                              onLogAction,
                                                                              onTriggerLoadingScreen,
                                                                          }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const currentYear = new Date().getFullYear();

    const availableYears = useMemo(() => {
        const yearSet = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
        products.forEach((p) => {
            if (p.expiryDate) {
                const parsedYear = Number(p.expiryDate.slice(0, 4));
                if (!isNaN(parsedYear) && parsedYear >= 2020 && parsedYear <= currentYear + 2) {
                    yearSet.add(parsedYear);
                }
            }
            if (p.batchNo) {
                const match = p.batchNo.match(/20\d{2}/);
                if (match) yearSet.add(Number(match[0]));
            }
        });
        return Array.from(yearSet).sort((a, b) => b - a);
    }, [products, currentYear]);

    const savedUi = useMemo<Partial<PersistedSalesUiState>>(() => {
        try {
            const raw = localStorage.getItem(SALES_ANALYTICS_STORAGE_KEY);
            return raw ? (JSON.parse(raw) as Partial<PersistedSalesUiState>) : {};
        } catch {
            return {};
        }
    }, []);

    const [activeSubView, setActiveSubView] = useState<'breakdown' | 'recommendations'>(
        savedUi.activeSubView ?? 'recommendations'
    );
    const [filterMonth, setFilterMonth] = useState<number | null>(
        savedUi.filterMonth !== undefined ? savedUi.filterMonth : null
    );
    const [filterYear, setFilterYear] = useState<number>(
        savedUi.filterYear ?? (availableYears[0] || currentYear)
    );
    const [filterQuarter, setFilterQuarter] = useState<number | null>(
        savedUi.filterQuarter !== undefined ? savedUi.filterQuarter : 1
    );
    const [selectedCategory, setSelectedCategory] = useState<string>(
        savedUi.selectedCategory ?? 'ALL'
    );

    const [holdingCostInput, setHoldingCostInput] = useState<string>(
        savedUi.holdingCostInput !== undefined ? savedUi.holdingCostInput : '18.5'
    );
    const [turnoverDaysInput, setTurnoverDaysInput] = useState<string>(
        savedUi.turnoverDaysInput !== undefined ? savedUi.turnoverDaysInput : '21'
    );
    const [availableCashInput, setAvailableCashInput] = useState<string>(
        savedUi.availableCashInput !== undefined ? savedUi.availableCashInput : '18000'
    );
    const [dailyBurnInput, setDailyBurnInput] = useState<string>(
        savedUi.dailyBurnInput !== undefined ? savedUi.dailyBurnInput : '280'
    );
    const [tableSearch, setTableSearch] = useState<string>(savedUi.tableSearch ?? '');

    useEffect(() => {
        const payload: PersistedSalesUiState = {
            activeSubView,
            filterMonth,
            filterYear,
            filterQuarter,
            selectedCategory,
            holdingCostInput,
            turnoverDaysInput,
            availableCashInput,
            dailyBurnInput,
            tableSearch,
        };
        localStorage.setItem(SALES_ANALYTICS_STORAGE_KEY, JSON.stringify(payload));
    }, [
        activeSubView,
        filterMonth,
        filterYear,
        filterQuarter,
        selectedCategory,
        holdingCostInput,
        turnoverDaysInput,
        availableCashInput,
        dailyBurnInput,
        tableSearch,
    ]);

    const inputErrors = useMemo(() => {
        const errs: { holdingCost?: string; turnoverDays?: string } = {};
        const hc = Number(holdingCostInput);
        if (holdingCostInput.trim() === '' || isNaN(hc) || hc < 1 || hc > 50) {
            errs.holdingCost = 'Rate must be 1–50%.';
        }
        const td = Number(turnoverDaysInput);
        if (
            turnoverDaysInput.trim() === '' ||
            isNaN(td) ||
            !Number.isInteger(td) ||
            td < 5 ||
            td > 90
        ) {
            errs.turnoverDays = 'Must be 5–90 days.';
        }
        return errs;
    }, [holdingCostInput, turnoverDaysInput]);

    const holdingCostPercentage = Math.min(50, Math.max(1, Number(holdingCostInput) || 18.5));
    const targetTurnoverDays = Math.min(90, Math.max(5, Number(turnoverDaysInput) || 21));
    const availableCashReserve = Math.max(0, Number(availableCashInput) || 0);
    const dailyOperatingBurn = Math.max(0, Number(dailyBurnInput) || 0);

    const [salesSortBy, setSalesSortBy] = useState<SalesSortField>('totalSalesAmount');
    const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('desc');
    const [procureSortBy, setProcureSortBy] = useState<ProcureSortField>(
        'recommendedProcureQty'
    );
    const [procureSortDir, setProcureSortDir] = useState<'asc' | 'desc'>('desc');

    const [reportData, setReportData] = useState<GetSalesReviewReportResponse | null>(null);
    const [procurementData, setProcurementData] =
        useState<AnalyzeProcurementResponse | null>(null);
    const [isSyncingReport, setIsSyncingReport] = useState<boolean>(false);
    const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [queuedSkus, setQueuedSkus] = useState<Record<string, boolean>>({});

    const periodMultiplier = useMemo(() => {
        if (filterMonth !== null) {
            return 0.85 + (filterMonth % 4) * 0.1;
        }
        if (filterQuarter !== null) {
            const map: Record<number, number> = { 1: 0.88, 2: 0.96, 3: 1.08, 4: 1.24 };
            return map[filterQuarter] || 1.0;
        }
        return 1.0;
    }, [filterQuarter, filterMonth]);

    // Historical Sales Report: Keeps removed/discontinued products in historical breakdown,
    // but freezes their remaining stock at 0 so they do not add to future projections.
    const fallbackSalesReport: GetSalesReviewReportResponse = useMemo(() => {
        const filtered = products.filter(
            (p) => selectedCategory === 'ALL' || p.category === selectedCategory
        );

        const daysInPeriod = filterMonth !== null ? 30 : filterQuarter !== null ? 90 : 365;

        const breakdown = filtered.map((p) => {
            const dailyRate = p.dailyDepletionRate ?? 2.5;
            const unitsSold = Math.round(dailyRate * daysInPeriod * periodMultiplier);
            const totalSalesAmount = Number((unitsSold * p.priceRM * exchangeRate).toFixed(2));
            return {
                productID: p.id,
                SKU: p.sku,
                name: p.name,
                category: p.category,
                unitsSold,
                totalSalesAmount,
                remainingStock: p.visibility === false ? 0 : p.stock,
            };
        });

        const totalRevenue = breakdown.reduce((sum, item) => sum + item.totalSalesAmount, 0);
        const totalUnitsSold = breakdown.reduce((sum, item) => sum + item.unitsSold, 0);

        const periodLabel =
            filterMonth !== null
                ? `${MONTH_NAMES[filterMonth - 1]} ${filterYear} (Monthly)`
                : filterQuarter !== null
                    ? `Q${filterQuarter} ${filterYear}`
                    : `FY ${filterYear} (Full Year)`;

        return {
            period: periodLabel,
            totalRevenue: Number(totalRevenue.toFixed(2)),
            totalUnitsSold,
            currency,
            productBreakdown: breakdown,
        };
    }, [
        products,
        selectedCategory,
        filterYear,
        filterQuarter,
        filterMonth,
        periodMultiplier,
        currency,
        exchangeRate,
    ]);

    // Future AI Restock & Holding-Cost Recommendations: Only active products (visibility !== false)
    // can be restocked or add to future holding costs / revenue projections.
    const fallbackProcurementAnalysis: AnalyzeProcurementResponse = useMemo(() => {
        const periodDivisor = filterMonth !== null ? 12 : filterQuarter !== null ? 4 : 1;
        const activeProducts = products.filter(
            (p) =>
                p.visibility !== false &&
                (selectedCategory === 'ALL' || p.category === selectedCategory)
        );

        const recommendations = activeProducts.map((p) => {
            const dailyVelocity = (p.dailyDepletionRate ?? 2.5) * periodMultiplier;
            const unitCost = (p.unitCostRM ?? p.priceRM * 0.62) * exchangeRate;
            const annualHoldingCostPerUnit = unitCost * (holdingCostPercentage / 100);
            const costOfHoldingStock = Number(
                ((p.stock * annualHoldingCostPerUnit) / periodDivisor).toFixed(2)
            );
            const timeNeededToSellOffDays = Math.max(
                1,
                Math.round(p.stock / Math.max(0.5, dailyVelocity))
            );
            const optimalStockToHold = Math.round(dailyVelocity * targetTurnoverDays);
            const recommendedProcureQty = Math.max(0, optimalStockToHold - p.stock);

            const priorityLevel: 'HIGH' | 'MEDIUM' | 'LOW' =
                timeNeededToSellOffDays <= 4 || p.stock <= p.minThreshold
                    ? 'HIGH'
                    : recommendedProcureQty > 0
                        ? 'MEDIUM'
                        : 'LOW';

            return {
                productID: p.id,
                SKU: p.sku,
                name: p.name,
                currentStock: p.stock,
                costOfHoldingStock,
                timeNeededToSellOffDays,
                optimalStockToHold,
                recommendedProcureQty,
                priorityLevel,
            };
        });

        const highPriorityCount = recommendations.filter(
            (r) => r.priorityLevel === 'HIGH'
        ).length;

        return {
            generatedAt: new Date().toISOString(),
            aiSummary: `For ${fallbackSalesReport.period}, portfolio revenue reached ${currencySymbol} ${fallbackSalesReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${fallbackSalesReport.totalUnitsSold.toLocaleString()} units. At a ${holdingCostPercentage}% holding cost rate and ${targetTurnoverDays}-day turnover target, Vyte AI identified ${highPriorityCount} high-priority SKUs requiring immediate restock to prevent stockout revenue loss while keeping carrying costs optimal.`,
            procurementRecommendations: recommendations,
        };
    }, [
        products,
        selectedCategory,
        periodMultiplier,
        filterMonth,
        filterQuarter,
        holdingCostPercentage,
        targetTurnoverDays,
        fallbackSalesReport,
        currencySymbol,
        exchangeRate,
    ]);

    // Stock Holding & Cash Flow Runway Calculator Metrics
    const cashFlowRunway = useMemo(() => {
        const activeRecs = fallbackProcurementAnalysis.procurementRecommendations;

        let currentStockLocked = 0;
        let restockPurchaseCost = 0;
        let totalHoldingCost = 0;
        let maxSellOffCycleDays = 21;
        let totalExpectedRevenueBack = 0;
        const perSkuCashNeeded: Record<string, number> = {};

        activeRecs.forEach((rec) => {
            const prod = products.find((p) => p.id === rec.productID);
            if (!prod || prod.visibility === false) return;

            const unitCost = (prod.unitCostRM ?? prod.priceRM * 0.62) * exchangeRate;
            const unitSellingPrice = prod.priceRM * exchangeRate;

            const lockedInSku = rec.currentStock * unitCost;
            const procureCostForSku = rec.recommendedProcureQty * unitCost;
            const cashNeededForSku = Number(
                (procureCostForSku + rec.costOfHoldingStock).toFixed(2)
            );

            perSkuCashNeeded[rec.productID] = cashNeededForSku;
            currentStockLocked += lockedInSku;
            restockPurchaseCost += procureCostForSku;
            totalHoldingCost += rec.costOfHoldingStock;

            if (rec.timeNeededToSellOffDays > maxSellOffCycleDays) {
                maxSellOffCycleDays = rec.timeNeededToSellOffDays;
            }

            const totalUnitsToSell = rec.currentStock + rec.recommendedProcureQty;
            totalExpectedRevenueBack += totalUnitsToSell * unitSellingPrice;
        });

        const restockPlusHolding = restockPurchaseCost + totalHoldingCost;
        const waitPeriodOpEx = maxSellOffCycleDays * dailyOperatingBurn;
        const minimumCashNeeded = restockPlusHolding + waitPeriodOpEx;
        const netProfitAfterSellOff =
            totalExpectedRevenueBack - currentStockLocked - minimumCashNeeded;
        const isCashSufficient = availableCashReserve >= minimumCashNeeded;

        return {
            currentStockLocked: Number(currentStockLocked.toFixed(2)),
            restockPurchaseCost: Number(restockPurchaseCost.toFixed(2)),
            totalHoldingCost: Number(totalHoldingCost.toFixed(2)),
            restockPlusHolding: Number(restockPlusHolding.toFixed(2)),
            maxSellOffCycleDays,
            waitPeriodOpEx: Number(waitPeriodOpEx.toFixed(2)),
            minimumCashNeeded: Number(minimumCashNeeded.toFixed(2)),
            totalExpectedRevenueBack: Number(totalExpectedRevenueBack.toFixed(2)),
            netProfitAfterSellOff: Number(netProfitAfterSellOff.toFixed(2)),
            isCashSufficient,
            perSkuCashNeeded,
        };
    }, [
        fallbackProcurementAnalysis,
        products,
        exchangeRate,
        dailyOperatingBurn,
        availableCashReserve,
    ]);

    const fetchSalesAndProcurement = useCallback(
        async (logType: 'auto' | 'manual-report' | 'manual-ai' = 'auto') => {
            if (inputErrors.holdingCost || inputErrors.turnoverDays) {
                return;
            }

            setErrorMessage(null);
            if (logType === 'manual-ai') {
                setIsRunningAi(true);
                setQueuedSkus({});
                onTriggerLoadingScreen?.('Recalculating Vyte AI Holding-Cost Forecast...', 750);
            } else {
                setIsSyncingReport(true);
                if (logType === 'manual-report') {
                    setQueuedSkus({});
                }
            }

            try {
                const reportReq: GetSalesReviewReportRequest = {
                    filterYear,
                    filterQuarter,
                    category: selectedCategory === 'ALL' ? null : selectedCategory,
                    productID: null,
                    userID,
                };

                const procureReq: AnalyzeProcurementRequest = {
                    filterYear,
                    filterQuarter,
                    holdingCostPercentage,
                    targetTurnoverDays,
                    userID,
                };

                const [reportRes, procureRes] = await Promise.all([
                    orbyteApi.getSalesReviewReport(reportReq, fallbackSalesReport),
                    orbyteApi.analyzeProcurement(procureReq, fallbackProcurementAnalysis),
                ]);

                setReportData(reportRes.data);
                setProcurementData(procureRes.data);

                if (logType === 'manual-report') {
                    onLogAction(
                        'Sales Analytics',
                        `Synced ${reportRes.data.period} sales report (Total Revenue: ${currencySymbol} ${reportRes.data.totalRevenue.toLocaleString()}).`
                    );
                } else if (logType === 'manual-ai') {
                    onLogAction(
                        'Sales Analytics (AI)',
                        `Recalculated AI holding-cost & cash-flow forecast for ${reportRes.data.period} (${holdingCostPercentage}% holding cost, ${targetTurnoverDays}d turnover).`
                    );
                }
            } catch (err) {
                const msg =
                    err instanceof Error
                        ? err.message
                        : 'Failed to fetch sales analytics from server.';
                setErrorMessage(msg);
            } finally {
                setIsSyncingReport(false);
                setIsRunningAi(false);
            }
        },
        [
            filterYear,
            filterQuarter,
            selectedCategory,
            userID,
            holdingCostPercentage,
            targetTurnoverDays,
            fallbackSalesReport,
            fallbackProcurementAnalysis,
            inputErrors.holdingCost,
            inputErrors.turnoverDays,
            onLogAction,
            onTriggerLoadingScreen,
            currencySymbol,
        ]
    );

    useEffect(() => {
        void fetchSalesAndProcurement('auto');
    }, [
        filterYear,
        filterQuarter,
        filterMonth,
        selectedCategory,
        products,
        holdingCostPercentage,
        targetTurnoverDays,
        exchangeRate,
    ]);

    const handleRefreshSalesReport = async () => {
        await fetchSalesAndProcurement('manual-report');
    };

    const handleRunAiProcurement = async () => {
        if (inputErrors.holdingCost || inputErrors.turnoverDays) return;
        await fetchSalesAndProcurement('manual-ai');
    };

    const handleExportCsv = () => {
        const activeRep = reportData ?? fallbackSalesReport;
        const activeProc = procurementData ?? fallbackProcurementAnalysis;

        const headers = [
            'Period',
            'Product ID',
            'SKU',
            'Product Name',
            'Status',
            'Category',
            'Units Sold',
            `Revenue (${currency})`,
            'Revenue Share (%)',
            'Remaining Stock',
            `Holding Cost (${currency})`,
            'Time To Sell Off (Days)',
            `Optimal Stock (${targetTurnoverDays}d)`,
            'Recommended Procure Qty',
            `Cash Needed (${currency})`,
            'AI Priority Level',
        ];

        const rows = activeRep.productBreakdown.map((item) => {
            const prod = products.find((p) => p.id === item.productID);
            const isDiscontinued = prod?.visibility === false;
            const sharePct =
                activeRep.totalRevenue > 0
                    ? ((item.totalSalesAmount / activeRep.totalRevenue) * 100).toFixed(2)
                    : '0.00';
            const rec = activeProc.procurementRecommendations.find(
                (r) => r.productID === item.productID || r.SKU === item.SKU
            );
            const cashNeeded = cashFlowRunway.perSkuCashNeeded[item.productID] ?? 0;

            const escapeCsv = (val: string | number) => {
                const str = String(val ?? '');
                return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str.replace(/"/g, '""')}"`
                    : str;
            };

            return [
                activeRep.period,
                item.productID,
                item.SKU,
                item.name,
                isDiscontinued ? 'DISCONTINUED_HISTORY_ONLY' : 'ACTIVE',
                item.category,
                item.unitsSold,
                item.totalSalesAmount.toFixed(2),
                sharePct,
                item.remainingStock,
                rec ? rec.costOfHoldingStock.toFixed(2) : '0.00',
                rec ? rec.timeNeededToSellOffDays : 0,
                rec ? rec.optimalStockToHold : 0,
                rec ? rec.recommendedProcureQty : 0,
                cashNeeded.toFixed(2),
                rec ? rec.priorityLevel : 'ARCHIVED',
            ]
                .map(escapeCsv)
                .join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safePeriod = activeRep.period.replace(/[^a-zA-Z0-9-_]/g, '_');
        link.href = url;
        link.setAttribute('download', `vyte_sales_analytics_${safePeriod}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        onLogAction(
            'Sales Analytics',
            `Exported CSV report (vyte_sales_analytics_${safePeriod}.csv) with ${activeRep.productBreakdown.length} SKUs.`
        );
    };

    const categories = useMemo(
        () => ['ALL', ...Array.from(new Set(products.map((p) => p.category)))],
        [products]
    );

    const activeReport = fallbackSalesReport;
    const activeProcurement = fallbackProcurementAnalysis;

    const displayedBreakdown = useMemo(() => {
        const q = tableSearch.trim().toLowerCase();
        const filtered = activeReport.productBreakdown.filter(
            (item) =>
                !q ||
                item.name.toLowerCase().includes(q) ||
                item.SKU.toLowerCase().includes(q) ||
                item.category.toLowerCase().includes(q)
        );

        return [...filtered].sort((a, b) => {
            const dir = salesSortDir === 'asc' ? 1 : -1;
            if (salesSortBy === 'name') return a.name.localeCompare(b.name) * dir;
            return (a[salesSortBy] - b[salesSortBy]) * dir;
        });
    }, [activeReport, tableSearch, salesSortBy, salesSortDir]);

    const displayedRecommendations = useMemo(() => {
        const q = tableSearch.trim().toLowerCase();
        const priorityRank: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
        };

        const filtered = activeProcurement.procurementRecommendations.filter(
            (rec) =>
                !q ||
                rec.name.toLowerCase().includes(q) ||
                rec.SKU.toLowerCase().includes(q)
        );

        return [...filtered].sort((a, b) => {
            const dir = procureSortDir === 'asc' ? 1 : -1;
            if (procureSortBy === 'name') return a.name.localeCompare(b.name) * dir;
            if (procureSortBy === 'priorityLevel') {
                return (
                    (priorityRank[a.priorityLevel] - priorityRank[b.priorityLevel]) * dir
                );
            }
            return (a[procureSortBy] - b[procureSortBy]) * dir;
        });
    }, [activeProcurement, tableSearch, procureSortBy, procureSortDir]);

    const toggleSalesSort = (field: SalesSortField) => {
        if (salesSortBy === field) {
            setSalesSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSalesSortBy(field);
            setSalesSortDir('desc');
        }
    };

    const toggleProcureSort = (field: ProcureSortField) => {
        if (procureSortBy === field) {
            setProcureSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setProcureSortBy(field);
            setProcureSortDir('desc');
        }
    };

    const isLoading = isSyncingReport || isRunningAi;

    const topProduct = useMemo(() => {
        if (!activeReport.productBreakdown.length) return null;
        return [...activeReport.productBreakdown].sort(
            (a, b) => b.totalSalesAmount - a.totalSalesAmount
        )[0];
    }, [activeReport]);

    const totalHoldingCostFormatted = useMemo(
        () =>
            activeProcurement.procurementRecommendations
                .reduce((acc, r) => acc + r.costOfHoldingStock, 0)
                .toFixed(2),
        [activeProcurement]
    );

    const renderSearchBox = () => (
        <div className="relative w-56 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
                type="text"
                placeholder="Filter by product name or SKU..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full pl-8 pr-7 py-1.5 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 transition"
            />
            {tableSearch && (
                <button
                    type="button"
                    onClick={() => setTableSearch('')}
                    title="Clear search"
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
            {/* LEFT 80% WORKSPACE (4 of 5 cols) */}
            <div className="lg:col-span-4 space-y-3.5 min-w-0">
                {/* Top Sub-View Toggle Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setActiveSubView('breakdown')}
                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                activeSubView === 'breakdown'
                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            Product Sales Breakdown ({displayedBreakdown.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveSubView('recommendations')}
                            className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${
                                activeSubView === 'recommendations'
                                    ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs'
                                    : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                            AI Restock &amp; Holding-Cost Recommendations ({displayedRecommendations.length})
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={handleExportCsv}
                        className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5" /> Export Executive Sales Report (CSV)
                    </button>
                </div>

                {/* Date & Category Filter Bar (Simulated Data icon removed) */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="w-36">
                            <VyteDropdown
                                variant="soft"
                                size="sm"
                                prefix="Year:"
                                icon={<Calendar className="w-3.5 h-3.5 text-emerald-600" />}
                                value={filterYear}
                                onChange={(val) => setFilterYear(Number(val))}
                                options={availableYears.map((yr) => ({
                                    label: String(yr),
                                    value: yr,
                                }))}
                            />
                        </div>

                        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                            {[
                                { label: 'Q1', val: 1 },
                                { label: 'Q2', val: 2 },
                                { label: 'Q3', val: 3 },
                                { label: 'Q4', val: 4 },
                                { label: 'Full Year', val: null },
                            ].map((q) => (
                                <button
                                    key={q.label}
                                    type="button"
                                    onClick={() => {
                                        setFilterQuarter(q.val);
                                        setFilterMonth(null);
                                    }}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                        filterMonth === null && filterQuarter === q.val
                                            ? 'bg-[#2BB656] text-white shadow-2xs'
                                            : 'text-slate-600 hover:text-slate-900'
                                    }`}
                                >
                                    {q.label}
                                </button>
                            ))}
                        </div>

                        <div className="w-40">
                            <VyteDropdown
                                variant="soft"
                                size="sm"
                                prefix="Month:"
                                value={filterMonth ?? ''}
                                onChange={(val) => {
                                    const parsed = val === '' ? null : Number(val);
                                    setFilterMonth(parsed);
                                    if (parsed !== null) setFilterQuarter(null);
                                }}
                                options={[
                                    { label: 'All Months', value: '' },
                                    ...MONTH_NAMES.map((m, idx) => ({
                                        label: m,
                                        value: idx + 1,
                                    })),
                                ]}
                            />
                        </div>

                        <div className="w-52">
                            <VyteDropdown
                                variant="soft"
                                size="sm"
                                value={selectedCategory}
                                onChange={(val) => setSelectedCategory(String(val))}
                                options={categories.map((cat) => ({
                                    label: cat === 'ALL' ? 'All Product Categories' : cat,
                                    value: cat,
                                }))}
                            />
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleRefreshSalesReport()}
                        disabled={isLoading}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingReport ? 'animate-spin' : ''}`} />
                        Refresh Report
                    </button>
                </div>

                {/* Stock Holding & Cash Flow Runway Calculator Banner */}
                <div className="bg-gradient-to-r from-[#0B1512] via-[#0F241C] to-[#0B1914] text-white p-5 rounded-2xl border border-emerald-500/25 shadow-sm space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5">
                                <Wallet className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h3 className="text-sm font-bold text-white">
                                        Stock Holding &amp; Cash Flow Runway Calculator
                                    </h3>
                                    <span
                                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                            cashFlowRunway.isCashSufficient
                                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
                                                : 'bg-rose-500/25 text-rose-300 border-rose-400/40'
                                        }`}
                                    >
                    {cashFlowRunway.isCashSufficient
                        ? `Cash Sufficient for ${cashFlowRunway.maxSellOffCycleDays}-Day Sell-Off Cycle`
                        : `Cash Buffer Shortfall for ${cashFlowRunway.maxSellOffCycleDays}-Day Sell-Off Cycle`}
                  </span>
                                </div>
                                <p className="text-[11px] text-slate-300 mt-0.5">
                                    Calculates the cash reserve required to hold stock and cover operating costs during the{' '}
                                    <strong>{cashFlowRunway.maxSellOffCycleDays}-day sell-off cycle</strong> before sales revenue is earned back.
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                            <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                                <label className="text-[10px] font-bold text-emerald-300 block">
                                    Available Cash Reserve ({currencySymbol})
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={availableCashInput}
                                    onChange={(e) =>
                                        setAvailableCashInput(
                                            e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '')
                                        )
                                    }
                                    className="mt-0.5 w-28 bg-transparent text-white font-extrabold text-xs focus:outline-none border-b border-emerald-400/40"
                                />
                            </div>

                            <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                                <label className="text-[10px] font-bold text-amber-300 block">
                                    Daily Operating Burn ({currencySymbol}/day)
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={dailyBurnInput}
                                    onChange={(e) =>
                                        setDailyBurnInput(
                                            e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '')
                                        )
                                    }
                                    className="mt-0.5 w-28 bg-transparent text-white font-extrabold text-xs focus:outline-none border-b border-amber-400/40"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white/[0.06] border border-white/10">
              <span className="text-[10px] font-bold uppercase text-slate-300 block">
                Current Stock Locked
              </span>
                            <p className="text-sm font-extrabold text-white mt-1">
                                {currencySymbol}{' '}
                                {cashFlowRunway.currentStockLocked.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                Already paid in stock
              </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.06] border border-white/10">
              <span className="text-[10px] font-bold uppercase text-amber-300 block">
                Restock + Holding Cost
              </span>
                            <p className="text-sm font-extrabold text-amber-300 mt-1">
                                {currencySymbol}{' '}
                                {cashFlowRunway.restockPlusHolding.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                Procure: {currencySymbol} {cashFlowRunway.restockPurchaseCost.toFixed(0)} + Hold:{' '}
                                {currencySymbol} {cashFlowRunway.totalHoldingCost.toFixed(0)}
              </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.06] border border-white/10">
              <span className="text-[10px] font-bold uppercase text-sky-300 block">
                Wait Period OpEx ({cashFlowRunway.maxSellOffCycleDays}d)
              </span>
                            <p className="text-sm font-extrabold text-white mt-1">
                                {currencySymbol}{' '}
                                {cashFlowRunway.waitPeriodOpEx.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                Burn while stock sells off
              </span>
                        </div>

                        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30">
              <span className="text-[10px] font-bold uppercase text-emerald-300 block">
                Minimum Cash Needed
              </span>
                            <p className="text-sm font-extrabold text-emerald-300 mt-1">
                                {currencySymbol}{' '}
                                {cashFlowRunway.minimumCashNeeded.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                            <span className="text-[10px] text-emerald-200/80 block mt-0.5">
                Required until stock sells off
              </span>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.06] border border-white/10">
              <span className="text-[10px] font-bold uppercase text-emerald-300 block">
                Revenue Earned Back
              </span>
                            <p className="text-sm font-extrabold text-emerald-400 mt-1">
                                {currencySymbol}{' '}
                                {cashFlowRunway.totalExpectedRevenueBack.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}
                            </p>
                            <span className="text-[10px] text-slate-300 block mt-0.5">
                Net Profit: +{currencySymbol}{' '}
                                {Math.max(0, cashFlowRunway.netProfitAfterSellOff).toLocaleString(undefined, {
                                    maximumFractionDigits: 0,
                                })}
              </span>
                        </div>
                    </div>
                </div>

                {errorMessage && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{errorMessage}</span>
                    </div>
                )}

                {/* Product Sales Breakdown Table */}
                {activeSubView === 'breakdown' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-blue-600" /> Product Sales Breakdown ({activeReport.period})
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Tracks unit turnover, share of total period revenue, and historical records for discontinued SKUs.
                                </p>
                            </div>
                            {renderSearchBox()}
                        </div>

                        {displayedBreakdown.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                                <Inbox className="w-6 h-6 text-slate-300" />
                                <span>No matching SKU sales records found.</span>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                                        <th className="py-3 px-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleSalesSort('name')}
                                                className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                            >
                                                Product Name &amp; SKU <ArrowUpDown className="w-3 h-3" />
                                            </button>
                                        </th>
                                        <th className="py-3 px-4">Category</th>
                                        <th className="py-3 px-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleSalesSort('unitsSold')}
                                                className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                            >
                                                Units Sold <ArrowUpDown className="w-3 h-3" />
                                            </button>
                                        </th>
                                        <th className="py-3 px-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleSalesSort('totalSalesAmount')}
                                                className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                            >
                                                Period Revenue ({currency}) <ArrowUpDown className="w-3 h-3" />
                                            </button>
                                        </th>
                                        <th className="py-3 px-4 w-52">Revenue Share (% of Total)</th>
                                        <th className="py-3 px-4">
                                            <button
                                                type="button"
                                                onClick={() => toggleSalesSort('remainingStock')}
                                                className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                            >
                                                Remaining Stock <ArrowUpDown className="w-3 h-3" />
                                            </button>
                                        </th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {displayedBreakdown.map((item) => {
                                        const matchedProd = products.find((p) => p.id === item.productID);
                                        const isRemoved = matchedProd?.visibility === false;
                                        const sharePct =
                                            activeReport.totalRevenue > 0
                                                ? Number(
                                                    ((item.totalSalesAmount / activeReport.totalRevenue) * 100).toFixed(1)
                                                )
                                                : 0;
                                        return (
                                            <tr
                                                key={item.productID}
                                                className={`transition ${
                                                    isRemoved ? 'bg-slate-50/70 opacity-75' : 'hover:bg-slate-50/80'
                                                }`}
                                            >
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-slate-900">{item.name}</p>
                                                        {isRemoved && (
                                                            <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                                  Removed (History Only)
                                </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] font-mono text-slate-400">{item.SKU}</p>
                                                </td>
                                                <td className="py-3 px-4 text-slate-600">{item.category}</td>
                                                <td className="py-3 px-4 font-bold text-slate-900">
                                                    {item.unitsSold.toLocaleString()}
                                                </td>
                                                <td className="py-3 px-4 font-bold text-emerald-700">
                                                    {currencySymbol}{' '}
                                                    {item.totalSalesAmount.toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                                            <div
                                                                className="bg-[#2BB656] h-full rounded-full transition-all duration-500"
                                                                style={{ width: `${Math.min(100, sharePct)}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-[11px] font-semibold text-slate-600 w-10 text-right">
                                {sharePct}%
                              </span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-slate-700">
                                                    {isRemoved ? 'Archived (0 units)' : `${item.remainingStock} units`}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* AI Procurement & Holding-Cost Recommendations Table */}
                {activeSubView === 'recommendations' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-600" /> AI Restock &amp; Holding-Cost Recommendations
                                </h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    Evaluates holding cost against time to sell off current inventory and applies optimal restock quantities.
                                </p>
                            </div>
                            {renderSearchBox()}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                                    <th className="py-3 px-4">
                                        <button
                                            type="button"
                                            onClick={() => toggleProcureSort('name')}
                                            className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                        >
                                            SKU &amp; Product <ArrowUpDown className="w-3 h-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3">Current Stock</th>
                                    <th className="py-3 px-3">
                                        <button
                                            type="button"
                                            onClick={() => toggleProcureSort('costOfHoldingStock')}
                                            className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                        >
                                            Holding Cost ({currency}) <ArrowUpDown className="w-3 h-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3">
                                        <button
                                            type="button"
                                            onClick={() => toggleProcureSort('timeNeededToSellOffDays')}
                                            className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer"
                                        >
                                            Time to Sell Off <ArrowUpDown className="w-3 h-3" />
                                        </button>
                                    </th>
                                    <th className="py-3 px-3">Optimal ({targetTurnoverDays}d)</th>
                                    <th className="py-3 px-3">AI Recommended</th>
                                    <th className="py-3 px-3">Cash Needed ({currency})</th>
                                    <th className="py-3 px-3">Priority</th>
                                    <th className="py-3 px-4">Action</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {displayedRecommendations.map((rec) => {
                                    const matchedProduct = products.find((p) => p.id === rec.productID);
                                    const isQueued = queuedSkus[rec.SKU];
                                    const skuCashNeeded =
                                        cashFlowRunway.perSkuCashNeeded[rec.productID] ?? rec.costOfHoldingStock;

                                    return (
                                        <tr key={rec.productID} className="hover:bg-slate-50/80 transition">
                                            <td className="py-3 px-4">
                                                <p className="font-bold text-slate-900">{rec.name}</p>
                                                <p className="text-[11px] font-mono text-slate-400">{rec.SKU}</p>
                                            </td>
                                            <td className="py-3 px-3 font-bold text-slate-800">{rec.currentStock}</td>
                                            <td className="py-3 px-3 text-slate-700 font-medium">
                                                {currencySymbol} {rec.costOfHoldingStock.toFixed(2)}
                                            </td>
                                            <td className="py-3 px-3">
                          <span
                              className={`font-semibold text-[11px] px-2.5 py-0.5 rounded-full ${
                                  rec.timeNeededToSellOffDays <= 4
                                      ? 'bg-rose-100 text-rose-700'
                                      : 'bg-slate-100 text-slate-700'
                              }`}
                          >
                            {rec.timeNeededToSellOffDays} days left
                          </span>
                                            </td>
                                            <td className="py-3 px-3 font-semibold text-slate-700">
                                                {rec.optimalStockToHold} units
                                            </td>
                                            <td className="py-3 px-3 font-extrabold text-emerald-700">
                                                +{rec.recommendedProcureQty} units
                                            </td>
                                            <td className="py-3 px-3 font-bold text-slate-900">
                                                {currencySymbol}{' '}
                                                {skuCashNeeded.toLocaleString(undefined, {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 2,
                                                })}
                                            </td>
                                            <td className="py-3 px-3">
                          <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                  rec.priorityLevel === 'HIGH'
                                      ? 'bg-rose-100 text-rose-700'
                                      : rec.priorityLevel === 'MEDIUM'
                                          ? 'bg-amber-100 text-amber-800'
                                          : 'bg-emerald-100 text-emerald-700'
                              }`}
                          >
                            {rec.priorityLevel}
                          </span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {rec.recommendedProcureQty > 0 && matchedProduct ? (
                                                    isQueued ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Applied to Auto Restock
                              </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setQueuedSkus((prev) => ({ ...prev, [rec.SKU]: true }));
                                                                onQueueRestockToOrderModule(
                                                                    matchedProduct,
                                                                    rec.recommendedProcureQty,
                                                                    `Vyte AI Forecast (${activeReport.period}): Sells off in ${rec.timeNeededToSellOffDays}d; optimal ${targetTurnoverDays}d stock is ${rec.optimalStockToHold} units`
                                                                );
                                                            }}
                                                            className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                                                        >
                                                            Apply to Auto Restock &rarr;
                                                        </button>
                                                    )
                                                ) : (
                                                    <span className="text-xs text-slate-400">Stock Optimal</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT 20% COLUMN (1 of 5 cols): VYTE AI INTELLIGENCE (STANDARDIZED FONT SIZES) + KPI CARDS */}
            <div className="lg:col-span-1 space-y-3.5">
                <div className="bg-gradient-to-b from-[#0B0C0E] via-[#10231B] to-[#0D261C] text-white p-5 rounded-2xl shadow-md border border-emerald-500/25 space-y-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                        <Sparkles className="w-3.5 h-3.5" /> Vyte AI Intelligence ({activeReport.period})
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed">
                        {activeProcurement.aiSummary}
                    </p>

                    {/* Standardized Font Sizes for Both Inputs */}
                    <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 space-y-3">
                        <div>
                            <label className="text-[11px] text-slate-300 font-semibold block leading-snug">
                                Holding Cost Rate (1–50%)
                            </label>
                            <input
                                type="text"
                                inputMode="decimal"
                                placeholder="18.5"
                                value={holdingCostInput}
                                onChange={(e) => {
                                    const cleaned = e.target.value
                                        .replace(/[^0-9.]/g, '')
                                        .replace(/^0+(?=\d)/, '');
                                    setHoldingCostInput(cleaned);
                                }}
                                className={`mt-1 w-full px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs focus:outline-none border-2 ${
                                    inputErrors.holdingCost
                                        ? 'border-rose-500'
                                        : 'border-transparent focus:border-emerald-400'
                                }`}
                            />
                            {inputErrors.holdingCost && (
                                <p className="text-[10px] text-rose-300 font-semibold mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> {inputErrors.holdingCost}
                                </p>
                            )}
                        </div>

                        <div>
                            <label className="text-[11px] text-slate-300 font-semibold block leading-snug">
                                Target Turnover (5–90d)
                            </label>
                            <input
                                type="text"
                                inputMode="numeric"
                                placeholder="21"
                                value={turnoverDaysInput}
                                onChange={(e) => {
                                    const cleaned = e.target.value
                                        .replace(/[^0-9]/g, '')
                                        .replace(/^0+(?=\d)/, '');
                                    setTurnoverDaysInput(cleaned);
                                }}
                                className={`mt-1 w-full px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs focus:outline-none border-2 ${
                                    inputErrors.turnoverDays
                                        ? 'border-rose-500'
                                        : 'border-transparent focus:border-emerald-400'
                                }`}
                            />
                            {inputErrors.turnoverDays && (
                                <p className="text-[10px] text-rose-300 font-semibold mt-1 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> {inputErrors.turnoverDays}
                                </p>
                            )}
                        </div>

                        <button
                            type="button"
                            onClick={() => void handleRunAiProcurement()}
                            disabled={
                                isLoading ||
                                Boolean(inputErrors.holdingCost) ||
                                Boolean(inputErrors.turnoverDays)
                            }
                            className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition ${
                                inputErrors.holdingCost || inputErrors.turnoverDays
                                    ? 'bg-slate-600 text-slate-300 cursor-not-allowed'
                                    : 'bg-[#2BB656] hover:bg-emerald-500 text-white cursor-pointer'
                            }`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isRunningAi ? 'Recalculating...' : 'Recalculate AI Forecast'}
                        </button>
                    </div>
                </div>

                {/* Stacked Right KPI Cards */}
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">
                            {activeReport.period} Revenue
                        </p>
                        <p className="text-lg font-extrabold text-slate-900 mt-0.5 truncate">
                            {currencySymbol}{' '}
                            {activeReport.totalRevenue.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                            })}
                        </p>
                        {topProduct && (
                            <span className="text-[10px] text-slate-500 block truncate mt-0.5">
                Top: {topProduct.SKU} ({currencySymbol}{' '}
                                {topProduct.totalSalesAmount.toLocaleString()})
              </span>
                        )}
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                        <DollarSign className="w-4 h-4" />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Units Sold</p>
                        <p className="text-lg font-extrabold text-slate-900 mt-0.5">
                            {activeReport.totalUnitsSold.toLocaleString()} Units
                        </p>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
              Across {activeReport.productBreakdown.length} monitored SKUs
            </span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <PackageCheck className="w-4 h-4" />
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Est. Holding Cost</p>
                        <p className="text-lg font-extrabold text-amber-600 mt-0.5">
                            {currencySymbol} {totalHoldingCostFormatted}
                        </p>
                        <span className="text-[10px] text-slate-500 block mt-0.5">
              At {holdingCostPercentage}% annual rate
            </span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                        <Clock className="w-4 h-4" />
                    </div>
                </div>
            </div>
        </div>
    );
};