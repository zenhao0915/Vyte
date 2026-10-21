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
    Wifi,
    WifiOff,
    Inbox,
} from 'lucide-react';
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    Product,
} from '../../types/vyte.ts';
import { orbyteApi } from '../../services/api.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown.tsx';

interface SalesAnalyticsModuleProps {
    products: Product[];
    userID: string;
    onQueueRestockToOrderModule: (product: Product, recommendedQty: number, aiReason: string) => void;
    onLogAction: (module: string, detail: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

type SalesSortField = 'name' | 'unitsSold' | 'totalSalesAmount' | 'remainingStock';
type ProcureSortField = 'name' | 'currentStock' | 'costOfHoldingStock' | 'timeNeededToSellOffDays' | 'recommendedProcureQty' | 'priorityLevel';

/** @Composable */
export const SalesAnalyticsModule: React.FC<SalesAnalyticsModuleProps> = ({
                                                                              products,
                                                                              userID,
                                                                              onQueueRestockToOrderModule,
                                                                              onLogAction,
                                                                              onTriggerLoadingScreen,
                                                                          }) => {
    const currentYear = new Date().getFullYear();

    // Dynamically derived year options from product catalog dates & current year
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

    const [filterMonth, setFilterMonth] = useState<number | null>(null);
    const [filterYear, setFilterYear] = useState<number>(() => availableYears[0] || currentYear);
    const [filterQuarter, setFilterQuarter] = useState<number | null>(3);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

    // Inputs & validation state
    const [holdingCostInput, setHoldingCostInput] = useState<string>('18.5');
    const [turnoverDaysInput, setTurnoverDaysInput] = useState<string>('21');

    const inputErrors = useMemo(() => {
        const errs: { holdingCost?: string; turnoverDays?: string } = {};
        const hc = Number(holdingCostInput);
        if (holdingCostInput.trim() === '' || isNaN(hc) || hc < 1 || hc > 50) {
            errs.holdingCost = 'Holding cost rate must be between 1% and 50%.';
        }
        const td = Number(turnoverDaysInput);
        if (
            turnoverDaysInput.trim() === '' ||
            isNaN(td) ||
            !Number.isInteger(td) ||
            td < 5 ||
            td > 90
        ) {
            errs.turnoverDays = 'Target turnover must be a whole number between 5 and 90 days.';
        }
        return errs;
    }, [holdingCostInput, turnoverDaysInput]);

    const holdingCostPercentage = Math.min(50, Math.max(1, Number(holdingCostInput) || 18.5));
    const targetTurnoverDays = Math.min(90, Math.max(5, Number(turnoverDaysInput) || 21));

    // Search & Sorting State
    const [tableSearch, setTableSearch] = useState<string>('');
    const [salesSortBy, setSalesSortBy] = useState<SalesSortField>('totalSalesAmount');
    const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('desc');
    const [procureSortBy, setProcureSortBy] = useState<ProcureSortField>('recommendedProcureQty');
    const [procureSortDir, setProcureSortDir] = useState<'asc' | 'desc'>('desc');

    // API Response State (stored in state and rendered)
    const [reportData, setReportData] = useState<GetSalesReviewReportResponse | null>(null);
    const [procurementData, setProcurementData] = useState<AnalyzeProcurementResponse | null>(null);
    const [isSimulatedData, setIsSimulatedData] = useState<boolean>(false);
    const [isSyncingReport, setIsSyncingReport] = useState<boolean>(false);
    const [isRunningAi, setIsRunningAi] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [queuedSkus, setQueuedSkus] = useState<Record<string, boolean>>({});

    const periodMultiplier = useMemo(() => {
        if (filterMonth !== null) {
            return 0.85 + ((filterMonth % 4) * 0.1);
        }
        if (filterQuarter !== null) {
            const map: Record<number, number> = { 1: 0.88, 2: 0.96, 3: 1.08, 4: 1.24 };
            return map[filterQuarter] || 1.0;
        }
        return 1.0;
    }, [filterQuarter, filterMonth]);

    // Fallback generator used only when backend is unreachable
    const fallbackSalesReport: GetSalesReviewReportResponse = useMemo(() => {
        const filtered = products.filter(
            (p) => selectedCategory === 'ALL' || p.category === selectedCategory
        );

        const daysInPeriod = filterMonth !== null ? 30 : filterQuarter !== null ? 90 : 365;

        const breakdown = filtered.map((p) => {
            const dailyRate = p.dailyDepletionRate ?? 2.5;
            const unitsSold = Math.round(dailyRate * daysInPeriod * periodMultiplier);
            const totalSalesAmount = Number((unitsSold * p.priceRM).toFixed(2));
            return {
                productID: p.id,
                SKU: p.sku,
                name: p.name,
                category: p.category,
                unitsSold,
                totalSalesAmount,
                remainingStock: p.stock,
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
            currency: 'MYR',
            productBreakdown: breakdown,
        };
    }, [products, selectedCategory, filterYear, filterQuarter, filterMonth, periodMultiplier]);

    const fallbackProcurementAnalysis: AnalyzeProcurementResponse = useMemo(() => {
        const periodDivisor = filterMonth !== null ? 12 : filterQuarter !== null ? 4 : 1;
        const filtered = products.filter(
            (p) => selectedCategory === 'ALL' || p.category === selectedCategory
        );

        const recommendations = filtered.map((p) => {
            const dailyVelocity = (p.dailyDepletionRate ?? 2.5) * periodMultiplier;
            const unitCost = p.unitCostRM ?? p.priceRM * 0.62;
            const annualHoldingCostPerUnit = unitCost * (holdingCostPercentage / 100);
            const costOfHoldingStock = Number(
                ((p.stock * annualHoldingCostPerUnit) / periodDivisor).toFixed(2)
            );
            const timeNeededToSellOffDays = Math.max(1, Math.round(p.stock / Math.max(0.5, dailyVelocity)));
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

        const highPriorityCount = recommendations.filter((r) => r.priorityLevel === 'HIGH').length;

        return {
            generatedAt: new Date().toISOString(),
            aiSummary: `For ${fallbackSalesReport.period}, portfolio revenue reached RM ${fallbackSalesReport.totalRevenue.toLocaleString()} across ${fallbackSalesReport.totalUnitsSold.toLocaleString()} units. At a ${holdingCostPercentage}% holding cost rate and ${targetTurnoverDays}-day turnover target, Vyte AI identified ${highPriorityCount} high-priority SKUs requiring immediate restock to prevent stockout revenue loss while keeping carrying costs optimal.`,
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
    ]);

    const fetchSalesAndProcurement = useCallback(
        async (logType: 'auto' | 'manual-report' | 'manual-ai' = 'auto') => {
            if (inputErrors.holdingCost || inputErrors.turnoverDays) {
                return;
            }

            setErrorMessage(null);
            if (logType === 'manual-ai') {
                setIsRunningAi(true);
                setQueuedSkus({}); // Reset queuedSkus on recalculate
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
                setIsSimulatedData(reportRes.isSimulatedFallback || procureRes.isSimulatedFallback);

                if (logType === 'manual-report') {
                    onLogAction(
                        'Sales Analytics',
                        `Synced ${reportRes.data.period} sales report (Total Revenue: RM ${reportRes.data.totalRevenue.toLocaleString()}).`
                    );
                } else if (logType === 'manual-ai') {
                    onLogAction(
                        'Sales Analytics (AI)',
                        `Recalculated AI holding-cost & restock forecast for ${reportRes.data.period} (${holdingCostPercentage}% holding cost, ${targetTurnoverDays}d turnover).`
                    );
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Failed to fetch sales analytics from server.';
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
        ]
    );

    // Re-fetch automatically when filters or products change
    useEffect(() => {
        void fetchSalesAndProcurement('auto');
    }, [filterYear, filterQuarter, filterMonth, selectedCategory, products]);

    const handleRefreshSalesReport = async () => {
        onTriggerLoadingScreen?.('Refreshing Sales Analytics Report...', 900);
        await fetchSalesAndProcurement('manual-report');
    };

    const handleRunAiProcurement = async () => {
        if (inputErrors.holdingCost || inputErrors.turnoverDays) return;
        onTriggerLoadingScreen?.('Recalculating Vyte AI Procurement Forecast...', 1000);
        await fetchSalesAndProcurement('manual-ai');
    };

    // Real CSV Export
    const handleExportCsv = () => {
        if (!reportData) return;

        const headers = [
            'Period',
            'Product ID',
            'SKU',
            'Product Name',
            'Category',
            'Units Sold',
            `Revenue (${reportData.currency})`,
            'Revenue Share (%)',
            'Remaining Stock',
            'Holding Cost (MYR)',
            'Time To Sell Off (Days)',
            `Optimal Stock (${targetTurnoverDays}d)`,
            'Recommended Procure Qty',
            'AI Priority Level',
        ];

        const rows = reportData.productBreakdown.map((item) => {
            const sharePct =
                reportData.totalRevenue > 0
                    ? ((item.totalSalesAmount / reportData.totalRevenue) * 100).toFixed(2)
                    : '0.00';
            const rec = procurementData?.procurementRecommendations.find(
                (r) => r.productID === item.productID || r.SKU === item.SKU
            );

            const escapeCsv = (val: string | number) => {
                const str = String(val ?? '');
                return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str.replace(/"/g, '""')}"`
                    : str;
            };

            return [
                reportData.period,
                item.productID,
                item.SKU,
                item.name,
                item.category,
                item.unitsSold,
                item.totalSalesAmount.toFixed(2),
                sharePct,
                item.remainingStock,
                rec ? rec.costOfHoldingStock.toFixed(2) : '0.00',
                rec ? rec.timeNeededToSellOffDays : '',
                rec ? rec.optimalStockToHold : '',
                rec ? rec.recommendedProcureQty : 0,
                rec ? rec.priorityLevel : 'LOW',
            ]
                .map(escapeCsv)
                .join(',');
        });

        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const safePeriod = reportData.period.replace(/[^a-zA-Z0-9-_]/g, '_');
        link.href = url;
        link.setAttribute('download', `vyte_sales_analytics_${safePeriod}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        onLogAction(
            'Sales Analytics',
            `Exported CSV report (vyte_sales_analytics_${safePeriod}.csv) with ${reportData.productBreakdown.length} SKUs.`
        );
    };

    const categories = useMemo(
        () => ['ALL', ...Array.from(new Set(products.map((p) => p.category)))],
        [products]
    );

    // Filtered & Sorted Sales Breakdown
    const displayedBreakdown = useMemo(() => {
        if (!reportData) return [];
        const q = tableSearch.trim().toLowerCase();
        const filtered = reportData.productBreakdown.filter(
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
    }, [reportData, tableSearch, salesSortBy, salesSortDir]);

    // Filtered & Sorted AI Procurement Recommendations
    const displayedRecommendations = useMemo(() => {
        if (!procurementData) return [];
        const q = tableSearch.trim().toLowerCase();
        const priorityRank: Record<'HIGH' | 'MEDIUM' | 'LOW', number> = {
            HIGH: 3,
            MEDIUM: 2,
            LOW: 1,
        };

        const filtered = procurementData.procurementRecommendations.filter(
            (rec) => !q || rec.name.toLowerCase().includes(q) || rec.SKU.toLowerCase().includes(q)
        );

        return [...filtered].sort((a, b) => {
            const dir = procureSortDir === 'asc' ? 1 : -1;
            if (procureSortBy === 'name') return a.name.localeCompare(b.name) * dir;
            if (procureSortBy === 'priorityLevel') {
                return (priorityRank[a.priorityLevel] - priorityRank[b.priorityLevel]) * dir;
            }
            return (a[procureSortBy] - b[procureSortBy]) * dir;
        });
    }, [procurementData, tableSearch, procureSortBy, procureSortDir]);

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

    const activeReport = reportData ?? fallbackSalesReport;
    const activeProcurement = procurementData ?? fallbackProcurementAnalysis;
    const isLoading = isSyncingReport || isRunningAi;

    const topProduct = useMemo(() => {
        if (!activeReport.productBreakdown.length) return null;
        return [...activeReport.productBreakdown].sort(
            (a, b) => b.totalSalesAmount - a.totalSalesAmount
        )[0];
    }, [activeReport]);

    return (
        <div className="space-y-6">
            {/* Unified Top Controls & Filter Bar */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Dynamic Year Dropdown */}
                    <VyteDropdown
                        variant="soft"
                        prefix="Year:"
                        icon={<Calendar className="w-4 h-4 text-emerald-600" />}
                        value={filterYear}
                        onChange={(val) => setFilterYear(Number(val))}
                        options={availableYears.map((yr) => ({
                            label: String(yr),
                            value: yr,
                        }))}
                        className="min-w-[140px]"
                    />

                    {/* Quarter / Full Year Filter */}
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
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                                    filterMonth === null && filterQuarter === q.val
                                        ? 'bg-[#2BB656] text-white shadow-sm'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>

                    {/* Month Dropdown */}
                    <VyteDropdown
                        variant="soft"
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
                        className="min-w-[165px]"
                    />

                    {/* Category Dropdown */}
                    <VyteDropdown
                        variant="soft"
                        value={selectedCategory}
                        onChange={(val) => setSelectedCategory(val)}
                        options={categories.map((cat) => ({
                            label: cat === 'ALL' ? 'All Product Categories' : cat,
                            value: cat,
                        }))}
                        className="min-w-[215px]"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Simulated Data / Live Backend Indicator */}
                    <span
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold inline-flex items-center gap-1.5 border ${
                            isSimulatedData
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                        title={
                            isSimulatedData
                                ? 'Backend offline — rendering simulated fallback data'
                                : 'Connected to live backend API'
                        }
                    >
                        {isSimulatedData ? (
                            <>
                                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                                Simulated Data
                            </>
                        ) : (
                            <>
                                <Wifi className="w-3.5 h-3.5 text-emerald-600" />
                                Live API Data
                            </>
                        )}
                    </span>

                    <button
                        type="button"
                        onClick={handleRefreshSalesReport}
                        disabled={isLoading}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingReport ? 'animate-spin' : ''}`} />
                        Refresh Report
                    </button>

                    <button
                        type="button"
                        onClick={handleRunAiProcurement}
                        disabled={isLoading || Boolean(inputErrors.holdingCost || inputErrors.turnoverDays)}
                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isRunningAi ? 'Analyzing...' : 'Recalculate AI Forecast'}
                    </button>
                </div>
            </div>

            {/* Error State Banner */}
            {errorMessage && (
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-rose-800">
                    <div className="flex items-center gap-2.5 font-semibold">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Failed to load analytics: {errorMessage}</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            onTriggerLoadingScreen?.('Retrying Sales Analytics Sync...', 900);
                            void fetchSalesAndProcurement('manual-report');
                        }}
                        className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition cursor-pointer shrink-0"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Executive AI Summary Banner (Renders Backend's aiSummary) */}
            <div className="bg-gradient-to-r from-[#0B0C0E] via-[#12221B] to-[#0E291E] text-white p-6 rounded-2xl shadow-md border border-emerald-500/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                            <Sparkles className="w-3.5 h-3.5" /> Vyte AI Business &amp; Holding-Cost Intelligence ({activeReport.period})
                        </div>
                        {isLoading && (
                            <span className="text-[11px] text-emerald-300/90 font-semibold animate-pulse">
                                Syncing latest metrics...
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">
                        {activeProcurement.aiSummary}
                    </p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 flex flex-col sm:flex-row items-start gap-4 shrink-0">
                    <div>
                        <label className="text-[11px] text-slate-300 block">Holding Cost Rate (1–50%)</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="18.5"
                            value={holdingCostInput}
                            onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, '');
                                setHoldingCostInput(cleaned);
                            }}
                            className={`mt-1 w-28 px-2.5 py-1 rounded-lg bg-white text-slate-900 font-bold text-sm focus:outline-none border-2 ${
                                inputErrors.holdingCost ? 'border-rose-500' : 'border-transparent'
                            }`}
                        />
                        {inputErrors.holdingCost && (
                            <p className="text-[10px] text-rose-300 font-semibold mt-1 max-w-[150px] flex items-start gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{inputErrors.holdingCost}</span>
                            </p>
                        )}
                    </div>
                    <div>
                        <label className="text-[11px] text-slate-300 block">Target Turnover (5–90d)</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="21"
                            value={turnoverDaysInput}
                            onChange={(e) => {
                                const cleaned = e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
                                setTurnoverDaysInput(cleaned);
                            }}
                            className={`mt-1 w-28 px-2.5 py-1 rounded-lg bg-white text-slate-900 font-bold text-sm focus:outline-none border-2 ${
                                inputErrors.turnoverDays ? 'border-rose-500' : 'border-transparent'
                            }`}
                        />
                        {inputErrors.turnoverDays && (
                            <p className="text-[10px] text-rose-300 font-semibold mt-1 max-w-[150px] flex items-start gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                                <span>{inputErrors.turnoverDays}</span>
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Period Summary KPIs (Removed hardcoded +14.2% vs prior period) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">{activeReport.period} Total Revenue</p>
                        <p className="text-2xl font-extrabold text-slate-900 mt-1">
                            {activeReport.currency}{' '}
                            {activeReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <span className="text-xs text-slate-500 mt-1 block">
                            {topProduct
                                ? `Top SKU: ${topProduct.SKU} (${activeReport.currency} ${topProduct.totalSalesAmount.toLocaleString()})`
                                : 'No recorded sales in selected filter'}
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <DollarSign className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">Total Units Sold ({activeReport.period})</p>
                        <p className="text-2xl font-extrabold text-slate-900 mt-1">
                            {activeReport.totalUnitsSold.toLocaleString()} Units
                        </p>
                        <span className="text-xs text-slate-500 mt-1 block">
                            Across {activeReport.productBreakdown.length} active catalog SKUs
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                        <PackageCheck className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">Est. Period Holding Cost</p>
                        <p className="text-2xl font-extrabold text-amber-600 mt-1">
                            RM{' '}
                            {activeProcurement.procurementRecommendations
                                .reduce((acc, r) => acc + r.costOfHoldingStock, 0)
                                .toFixed(2)}
                        </p>
                        <span className="text-xs text-slate-500 mt-1 block">
                            Based on {holdingCostPercentage}% annual carrying rate
                        </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                        <Clock className="w-6 h-6" />
                    </div>
                </div>
            </div>

            {/* Table Search Bar */}
            <div className="bg-white px-5 py-3.5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1 min-w-[240px] max-w-md">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                    <input
                        type="text"
                        placeholder="Filter breakdown & AI recommendations by product name or SKU..."
                        value={tableSearch}
                        onChange={(e) => setTableSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 transition"
                    />
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>
                        Showing <strong>{displayedBreakdown.length}</strong> of{' '}
                        <strong>{activeReport.productBreakdown.length}</strong> SKUs
                    </span>
                    {tableSearch && (
                        <button
                            type="button"
                            onClick={() => setTableSearch('')}
                            className="text-emerald-600 font-bold hover:underline cursor-pointer"
                        >
                            Clear Search
                        </button>
                    )}
                </div>
            </div>

            {/* Product Sales Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" /> Product Sales Breakdown ({activeReport.period})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Tracks unit turnover, share of total period revenue, and remaining inventory levels per SKU.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleExportCsv}
                        disabled={displayedBreakdown.length === 0}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5" /> Export CSV
                    </button>
                </div>

                {isLoading && !reportData ? (
                    <div className="p-10 text-center space-y-2">
                        <RefreshCw className="w-6 h-6 text-emerald-600 animate-spin mx-auto" />
                        <p className="text-xs font-semibold text-slate-500">Loading sales breakdown...</p>
                    </div>
                ) : displayedBreakdown.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                        <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-bold text-slate-700">No matching products in sales report</p>
                        <p className="text-xs text-slate-500">
                            Try clearing your search filter or selecting "All Product Categories".
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleSalesSort('name')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Product Name &amp; SKU <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">Category</th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleSalesSort('unitsSold')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Units Sold <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleSalesSort('totalSalesAmount')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Period Revenue ({activeReport.currency}) <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4 w-64">Revenue Share (% of Total)</th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleSalesSort('remainingStock')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Remaining Stock <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                            {displayedBreakdown.map((item) => {
                                // Fixed: Revenue Share is now relative to totalRevenue, not the top product
                                const sharePct =
                                    activeReport.totalRevenue > 0
                                        ? Number(((item.totalSalesAmount / activeReport.totalRevenue) * 100).toFixed(1))
                                        : 0;

                                return (
                                    <tr key={item.productID} className="hover:bg-slate-50/80 transition">
                                        <td className="py-3.5 px-4">
                                            <p className="font-semibold text-slate-900">{item.name}</p>
                                            <p className="text-xs font-mono text-slate-400">{item.SKU}</p>
                                        </td>
                                        <td className="py-3.5 px-4 text-xs text-slate-600">{item.category}</td>
                                        <td className="py-3.5 px-4 font-bold text-slate-800">
                                            {item.unitsSold.toLocaleString()}
                                        </td>
                                        <td className="py-3.5 px-4 font-bold text-emerald-700">
                                            {activeReport.currency}{' '}
                                            {item.totalSalesAmount.toLocaleString(undefined, {
                                                minimumFractionDigits: 2,
                                            })}
                                        </td>
                                        <td className="py-3.5 px-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                                    <div
                                                        className="bg-[#2BB656] h-full rounded-full transition-all duration-500"
                                                        style={{ width: `${Math.min(100, sharePct)}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs font-bold text-slate-600 w-12 text-right">
                                                    {sharePct.toFixed(1)}%
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-3.5 px-4 font-semibold text-slate-700">
                                            {item.remainingStock} units
                                        </td>
                                    </tr>
                                );
                            })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* AI Procurement & Holding-Cost Optimization Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-emerald-600" /> AI Restock &amp; Holding-Cost Recommendations
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Evaluates holding cost against time needed to sell off current inventory.
                        </p>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                        Generated: {new Date(activeProcurement.generatedAt).toLocaleTimeString()}
                    </span>
                </div>

                {displayedRecommendations.length === 0 ? (
                    <div className="p-10 text-center space-y-2">
                        <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-sm font-bold text-slate-700">No procurement recommendations found</p>
                        <p className="text-xs text-slate-500">Adjust your search or category filter to view SKUs.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                            <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('name')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        SKU &amp; Product <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('currentStock')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Current Stock <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('costOfHoldingStock')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Holding Cost <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('timeNeededToSellOffDays')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Time to Sell Off <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">Optimal Stock ({targetTurnoverDays}d)</th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('recommendedProcureQty')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        AI Recommended Procure <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">
                                    <button
                                        type="button"
                                        onClick={() => toggleProcureSort('priorityLevel')}
                                        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
                                    >
                                        Priority <ArrowUpDown className="w-3 h-3" />
                                    </button>
                                </th>
                                <th className="py-3.5 px-4">Action</th>
                            </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-sm">
                            {displayedRecommendations.map((rec) => {
                                const matchedProduct = products.find((p) => p.id === rec.productID);
                                const isQueued = queuedSkus[rec.SKU];

                                return (
                                    <tr key={rec.productID} className="hover:bg-slate-50/80 transition">
                                        <td className="py-4 px-4">
                                            <p className="font-semibold text-slate-900">{rec.name}</p>
                                            <p className="text-xs font-mono text-slate-400">{rec.SKU}</p>
                                        </td>
                                        <td className="py-4 px-4 font-bold text-slate-800">{rec.currentStock}</td>
                                        <td className="py-4 px-4 text-slate-700 font-medium">
                                            RM {rec.costOfHoldingStock.toFixed(2)}
                                        </td>
                                        <td className="py-4 px-4">
                                            <span
                                                className={`font-semibold text-xs px-2.5 py-1 rounded-full ${
                                                    rec.timeNeededToSellOffDays <= 4
                                                        ? 'bg-rose-100 text-rose-700'
                                                        : 'bg-slate-100 text-slate-700'
                                                }`}
                                            >
                                                {rec.timeNeededToSellOffDays} days left
                                            </span>
                                        </td>
                                        <td className="py-4 px-4 font-semibold text-slate-700">
                                            {rec.optimalStockToHold} units
                                        </td>
                                        <td className="py-4 px-4 font-extrabold text-emerald-700">
                                            +{rec.recommendedProcureQty} units
                                        </td>
                                        <td className="py-4 px-4">
                                            <span
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold ${
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
                                        <td className="py-4 px-4">
                                            {rec.recommendedProcureQty > 0 && matchedProduct ? (
                                                isQueued ? (
                                                    <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
                                                        <CheckCircle2 className="w-4 h-4" /> Sent to Order Queue
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
                                                        Apply to Auto-Restock &rarr;
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
                )}
            </div>
        </div>
    );
};