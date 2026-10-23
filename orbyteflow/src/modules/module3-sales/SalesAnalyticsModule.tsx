// src/modules/module3-sales/SalesAnalyticsModule.tsx
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
    TrendingUp, Sparkles, Calendar, DollarSign, PackageCheck, Clock, RefreshCw,
    Download, CheckCircle2, AlertCircle, Search, ArrowUpDown, Wifi, WifiOff, Inbox, X,
} from 'lucide-react';
import type {
    AnalyzeProcurementRequest, AnalyzeProcurementResponse, CurrencyCode,
    GetSalesReviewReportRequest, GetSalesReviewReportResponse, Product,
} from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { orbyteApi } from '../../services/api.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown.tsx';

interface SalesAnalyticsModuleProps {
    products: Product[];
    userID: string;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onQueueRestockToOrderModule: (product: Product, recommendedQty: number, aiReason: string) => void;
    onLogAction: (module: string, detail: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

const STORAGE_KEY = 'vyte_sales_analytics_ui_state_v2';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type SalesSortField = 'name' | 'unitsSold' | 'totalSalesAmount' | 'remainingStock';
type ProcureSortField = 'name' | 'currentStock' | 'costOfHoldingStock' | 'timeNeededToSellOffDays' | 'recommendedProcureQty' | 'priorityLevel';

export const SalesAnalyticsModule: React.FC<SalesAnalyticsModuleProps> = ({
                                                                              products, userID, currency = 'MYR', exchangeRate = 1.0,
                                                                              onQueueRestockToOrderModule, onLogAction, onTriggerLoadingScreen,
                                                                          }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const currentYear = new Date().getFullYear();

    const availableYears = useMemo(() => {
        const s = new Set<number>([currentYear, currentYear - 1, currentYear - 2]);
        products.forEach((p) => {
            const y = p.expiryDate ? Number(p.expiryDate.slice(0, 4)) : NaN;
            if (!isNaN(y) && y >= 2020 && y <= currentYear + 2) s.add(y);
            const m = p.batchNo?.match(/20\d{2}/);
            if (m) s.add(Number(m[0]));
        });
        return Array.from(s).sort((a, b) => b - a);
    }, [products, currentYear]);

    const savedUi = useMemo(() => {
        try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
    }, []);

    const [activeSubView, setActiveSubView] = useState<'breakdown' | 'recommendations'>(savedUi.activeSubView ?? 'breakdown');
    const [filterMonth, setFilterMonth] = useState<number | null>(savedUi.filterMonth !== undefined ? savedUi.filterMonth : null);
    const [filterYear, setFilterYear] = useState<number>(savedUi.filterYear ?? (availableYears[0] || currentYear));
    const [filterQuarter, setFilterQuarter] = useState<number | null>(savedUi.filterQuarter !== undefined ? savedUi.filterQuarter : 3);
    const [selectedCategory, setSelectedCategory] = useState<string>(savedUi.selectedCategory ?? 'ALL');
    const [holdingCostInput, setHoldingCostInput] = useState<string>(savedUi.holdingCostInput ?? '18.5');
    const [turnoverDaysInput, setTurnoverDaysInput] = useState<string>(savedUi.turnoverDaysInput ?? '21');
    const [tableSearch, setTableSearch] = useState<string>(savedUi.tableSearch ?? '');

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            activeSubView, filterMonth, filterYear, filterQuarter, selectedCategory, holdingCostInput, turnoverDaysInput, tableSearch,
        }));
    }, [activeSubView, filterMonth, filterYear, filterQuarter, selectedCategory, holdingCostInput, turnoverDaysInput, tableSearch]);

    const inputErrors = useMemo(() => {
        const errs: { holdingCost?: string; turnoverDays?: string } = {};
        const hc = Number(holdingCostInput);
        if (!holdingCostInput.trim() || isNaN(hc) || hc < 1 || hc > 50) errs.holdingCost = 'Rate must be 1–50%.';
        const td = Number(turnoverDaysInput);
        if (!turnoverDaysInput.trim() || isNaN(td) || !Number.isInteger(td) || td < 5 || td > 90) errs.turnoverDays = 'Must be 5–90 days.';
        return errs;
    }, [holdingCostInput, turnoverDaysInput]);

    const holdingCostPercentage = Math.min(50, Math.max(1, Number(holdingCostInput) || 18.5));
    const targetTurnoverDays = Math.min(90, Math.max(5, Number(turnoverDaysInput) || 21));

    const [salesSortBy, setSalesSortBy] = useState<SalesSortField>('totalSalesAmount');
    const [salesSortDir, setSalesSortDir] = useState<'asc' | 'desc'>('desc');
    const [procureSortBy, setProcureSortBy] = useState<ProcureSortField>('recommendedProcureQty');
    const [procureSortDir, setProcureSortDir] = useState<'asc' | 'desc'>('desc');

    const [reportData, setReportData] = useState<GetSalesReviewReportResponse | null>(null);
    const [procurementData, setProcurementData] = useState<AnalyzeProcurementResponse | null>(null);
    const [isSimulatedData, setIsSimulatedData] = useState(false);
    const [isSyncingReport, setIsSyncingReport] = useState(false);
    const [isRunningAi, setIsRunningAi] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [queuedSkus, setQueuedSkus] = useState<Record<string, boolean>>({});

    const periodMultiplier = useMemo(() => {
        if (filterMonth !== null) return 0.85 + (filterMonth % 4) * 0.1;
        if (filterQuarter !== null) return ({ 1: 0.88, 2: 0.96, 3: 1.08, 4: 1.24 }[filterQuarter] || 1.0);
        return 1.0;
    }, [filterQuarter, filterMonth]);

    const fallbackSalesReport: GetSalesReviewReportResponse = useMemo(() => {
        const filtered = products.filter((p) => selectedCategory === 'ALL' || p.category === selectedCategory);
        const days = filterMonth !== null ? 30 : filterQuarter !== null ? 90 : 365;
        const breakdown = filtered.map((p) => {
            const unitsSold = Math.round((p.dailyDepletionRate ?? 2.5) * days * periodMultiplier);
            return {
                productID: p.id, SKU: p.sku, name: p.name, category: p.category, unitsSold,
                totalSalesAmount: Number((unitsSold * p.priceRM * exchangeRate).toFixed(2)), remainingStock: p.stock,
            };
        });
        const period = filterMonth !== null ? `${MONTH_NAMES[filterMonth - 1]} ${filterYear} (Monthly)` : filterQuarter !== null ? `Q${filterQuarter} ${filterYear}` : `FY ${filterYear} (Full Year)`;
        return {
            period,
            totalRevenue: Number(breakdown.reduce((s, i) => s + i.totalSalesAmount, 0).toFixed(2)),
            totalUnitsSold: breakdown.reduce((s, i) => s + i.unitsSold, 0),
            currency,
            productBreakdown: breakdown,
        };
    }, [products, selectedCategory, filterYear, filterQuarter, filterMonth, periodMultiplier, currency, exchangeRate]);

    const fallbackProcurementAnalysis: AnalyzeProcurementResponse = useMemo(() => {
        const div = filterMonth !== null ? 12 : filterQuarter !== null ? 4 : 1;
        const filtered = products.filter((p) => selectedCategory === 'ALL' || p.category === selectedCategory);
        const recommendations = filtered.map((p) => {
            const vel = (p.dailyDepletionRate ?? 2.5) * periodMultiplier;
            const unitCost = (p.unitCostRM ?? p.priceRM * 0.62) * exchangeRate;
            const costOfHoldingStock = Number(((p.stock * unitCost * (holdingCostPercentage / 100)) / div).toFixed(2));
            const timeNeededToSellOffDays = Math.max(1, Math.round(p.stock / Math.max(0.5, vel)));
            const optimalStockToHold = Math.round(vel * targetTurnoverDays);
            const recommendedProcureQty = Math.max(0, optimalStockToHold - p.stock);
            const priorityLevel: 'HIGH' | 'MEDIUM' | 'LOW' = timeNeededToSellOffDays <= 4 || p.stock <= p.minThreshold ? 'HIGH' : recommendedProcureQty > 0 ? 'MEDIUM' : 'LOW';
            return {
                productID: p.id, SKU: p.sku, name: p.name, currentStock: p.stock, costOfHoldingStock,
                timeNeededToSellOffDays, optimalStockToHold, recommendedProcureQty, priorityLevel,
            };
        });
        const highCount = recommendations.filter((r) => r.priorityLevel === 'HIGH').length;
        return {
            generatedAt: new Date().toISOString(),
            aiSummary: `For ${fallbackSalesReport.period}, portfolio revenue reached ${sym} ${fallbackSalesReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} across ${fallbackSalesReport.totalUnitsSold.toLocaleString()} units. At a ${holdingCostPercentage}% holding cost rate and ${targetTurnoverDays}-day turnover target, Vyte AI identified ${highCount} high-priority SKUs requiring immediate restock to prevent stockout revenue loss while keeping carrying costs optimal.`,
            procurementRecommendations: recommendations,
        };
    }, [products, selectedCategory, periodMultiplier, filterMonth, filterQuarter, holdingCostPercentage, targetTurnoverDays, fallbackSalesReport, sym, exchangeRate]);

    const fetchSalesAndProcurement = useCallback(async (logType: 'auto' | 'manual-report' | 'manual-ai' = 'auto') => {
        if (inputErrors.holdingCost || inputErrors.turnoverDays) return;
        setErrorMessage(null);
        if (logType === 'manual-ai') {
            setIsRunningAi(true); setQueuedSkus({});
            onTriggerLoadingScreen?.('Recalculating Vyte AI Holding-Cost Forecast...', 750);
        } else {
            setIsSyncingReport(true);
            if (logType === 'manual-report') setQueuedSkus({});
        }
        try {
            const reportReq: GetSalesReviewReportRequest = { filterYear, filterQuarter, category: selectedCategory === 'ALL' ? null : selectedCategory, productID: null, userID };
            const procureReq: AnalyzeProcurementRequest = { filterYear, filterQuarter, holdingCostPercentage, targetTurnoverDays, userID };
            const [reportRes, procureRes] = await Promise.all([
                orbyteApi.getSalesReviewReport(reportReq, fallbackSalesReport),
                orbyteApi.analyzeProcurement(procureReq, fallbackProcurementAnalysis),
            ]);
            setReportData(reportRes.data);
            setProcurementData(procureRes.data);
            setIsSimulatedData(reportRes.isSimulatedFallback || procureRes.isSimulatedFallback);

            if (logType === 'manual-report') onLogAction('Sales Analytics', `Synced ${reportRes.data.period} sales report (Total Revenue: ${sym} ${reportRes.data.totalRevenue.toLocaleString()}).`);
            else if (logType === 'manual-ai') onLogAction('Sales Analytics (AI)', `Recalculated AI holding-cost & restock forecast for ${reportRes.data.period} (${holdingCostPercentage}% holding cost, ${targetTurnoverDays}d turnover).`);
        } catch (err) {
            setErrorMessage(err instanceof Error ? err.message : 'Failed to fetch sales analytics from server.');
        } finally {
            setIsSyncingReport(false); setIsRunningAi(false);
        }
    }, [filterYear, filterQuarter, selectedCategory, userID, holdingCostPercentage, targetTurnoverDays, fallbackSalesReport, fallbackProcurementAnalysis, inputErrors, onLogAction, onTriggerLoadingScreen, sym]);

    useEffect(() => { void fetchSalesAndProcurement('auto'); }, [filterYear, filterQuarter, filterMonth, selectedCategory, products, holdingCostPercentage, targetTurnoverDays, exchangeRate]);

    const activeReport = reportData ?? fallbackSalesReport;
    const activeProcurement = procurementData ?? fallbackProcurementAnalysis;

    const handleExportCsv = () => {
        const headers = ['Period', 'Product ID', 'SKU', 'Product Name', 'Category', 'Units Sold', `Revenue (${currency})`, 'Revenue Share (%)', 'Remaining Stock', `Holding Cost (${currency})`, 'Time To Sell Off (Days)', `Optimal Stock (${targetTurnoverDays}d)`, 'Recommended Procure Qty', 'AI Priority Level'];
        const esc = (v: string | number) => { const s = String(v ?? ''); return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
        const rows = activeReport.productBreakdown.map((item) => {
            const sharePct = activeReport.totalRevenue > 0 ? ((item.totalSalesAmount / activeReport.totalRevenue) * 100).toFixed(2) : '0.00';
            const rec = activeProcurement.procurementRecommendations.find((r) => r.productID === item.productID || r.SKU === item.SKU);
            return [activeReport.period, item.productID, item.SKU, item.name, item.category, item.unitsSold, item.totalSalesAmount.toFixed(2), sharePct, item.remainingStock, rec ? rec.costOfHoldingStock.toFixed(2) : '0.00', rec ? rec.timeNeededToSellOffDays : '', rec ? rec.optimalStockToHold : '', rec ? rec.recommendedProcureQty : 0, rec ? rec.priorityLevel : 'LOW'].map(esc).join(',');
        });
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const safePeriod = activeReport.period.replace(/[^a-zA-Z0-9-_]/g, '_');
        a.href = url; a.setAttribute('download', `vyte_sales_analytics_${safePeriod}.csv`);
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        onLogAction('Sales Analytics', `Exported CSV report (vyte_sales_analytics_${safePeriod}.csv).`);
    };

    const categories = useMemo(() => ['ALL', ...Array.from(new Set(products.map((p) => p.category)))], [products]);

    const displayedBreakdown = useMemo(() => {
        const q = tableSearch.trim().toLowerCase();
        const list = activeReport.productBreakdown.filter((i) => !q || i.name.toLowerCase().includes(q) || i.SKU.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
        return [...list].sort((a, b) => {
            const d = salesSortDir === 'asc' ? 1 : -1;
            return salesSortBy === 'name' ? a.name.localeCompare(b.name) * d : (a[salesSortBy] - b[salesSortBy]) * d;
        });
    }, [activeReport, tableSearch, salesSortBy, salesSortDir]);

    const displayedRecommendations = useMemo(() => {
        const q = tableSearch.trim().toLowerCase();
        const rank = { HIGH: 3, MEDIUM: 2, LOW: 1 };
        const list = activeProcurement.procurementRecommendations.filter((r) => !q || r.name.toLowerCase().includes(q) || r.SKU.toLowerCase().includes(q));
        return [...list].sort((a, b) => {
            const d = procureSortDir === 'asc' ? 1 : -1;
            if (procureSortBy === 'name') return a.name.localeCompare(b.name) * d;
            if (procureSortBy === 'priorityLevel') return (rank[a.priorityLevel] - rank[b.priorityLevel]) * d;
            return (a[procureSortBy] - b[procureSortBy]) * d;
        });
    }, [activeProcurement, tableSearch, procureSortBy, procureSortDir]);

    const toggleSalesSort = (f: SalesSortField) => { if (salesSortBy === f) setSalesSortDir((p) => (p === 'asc' ? 'desc' : 'asc')); else { setSalesSortBy(f); setSalesSortDir('desc'); } };
    const toggleProcureSort = (f: ProcureSortField) => { if (procureSortBy === f) setProcureSortDir((p) => (p === 'asc' ? 'desc' : 'asc')); else { setProcureSortBy(f); setProcureSortDir('desc'); } };

    const isLoading = isSyncingReport || isRunningAi;
    const topProduct = useMemo(() => activeReport.productBreakdown.length ? [...activeReport.productBreakdown].sort((a, b) => b.totalSalesAmount - a.totalSalesAmount)[0] : null, [activeReport]);
    const totalHoldingCostFormatted = useMemo(() => activeProcurement.procurementRecommendations.reduce((a, r) => a + r.costOfHoldingStock, 0).toFixed(2), [activeProcurement]);

    const renderSearchBox = () => (
        <div className="relative w-56 sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input type="text" placeholder="Filter by product name or SKU..." value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} className="w-full pl-8 pr-7 py-1.5 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 transition" />
            {tableSearch && <button type="button" onClick={() => setTableSearch('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
        </div>
    );

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
            <div className="lg:col-span-4 space-y-3.5 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                        <button type="button" onClick={() => setActiveSubView('breakdown')} className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${activeSubView === 'breakdown' ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                            Product Sales Breakdown ({displayedBreakdown.length})
                        </button>
                        <button type="button" onClick={() => setActiveSubView('recommendations')} className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer ${activeSubView === 'recommendations' ? 'bg-amber-100 text-amber-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                            AI Restock &amp; Holding-Cost Recommendations ({displayedRecommendations.length})
                        </button>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className="w-36">
                            <VyteDropdown variant="soft" size="sm" prefix="Year:" icon={<Calendar className="w-3.5 h-3.5 text-emerald-600" />} value={filterYear} onChange={(v) => setFilterYear(Number(v))} options={availableYears.map((yr) => ({ label: String(yr), value: yr }))} />
                        </div>
                        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                            {[{ label: 'Q1', val: 1 }, { label: 'Q2', val: 2 }, { label: 'Q3', val: 3 }, { label: 'Q4', val: 4 }, { label: 'Full Year', val: null }].map((q) => (
                                <button key={q.label} type="button" onClick={() => { setFilterQuarter(q.val); setFilterMonth(null); }} className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${filterMonth === null && filterQuarter === q.val ? 'bg-[#2BB656] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                                    {q.label}
                                </button>
                            ))}
                        </div>
                        <div className="w-40">
                            <VyteDropdown variant="soft" size="sm" prefix="Month:" value={filterMonth ?? ''} onChange={(v) => { const p = v === '' ? null : Number(v); setFilterMonth(p); if (p !== null) setFilterQuarter(null); }} options={[{ label: 'All Months', value: '' }, ...MONTH_NAMES.map((m, idx) => ({ label: m, value: idx + 1 }))]} />
                        </div>
                        <div className="w-52">
                            <VyteDropdown variant="soft" size="sm" value={selectedCategory} onChange={(v) => setSelectedCategory(String(v))} options={categories.map((cat) => ({ label: cat === 'ALL' ? 'All Product Categories' : cat, value: cat }))} />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 border ${isSimulatedData ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-800 border-emerald-200'}`}>
              {isSimulatedData ? <><WifiOff className="w-3 h-3" /> Simulated Data</> : <><Wifi className="w-3 h-3" /> Live Backend</>}
            </span>
                        <button type="button" onClick={() => void fetchSalesAndProcurement('manual-report')} disabled={isLoading} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer">
                            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingReport ? 'animate-spin' : ''}`} /> Refresh Report
                        </button>
                    </div>
                </div>

                {errorMessage && (
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" /><span>{errorMessage}</span>
                    </div>
                )}

                {activeSubView === 'breakdown' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-blue-600" /> Product Sales Breakdown ({activeReport.period})</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Tracks unit turnover, share of total period revenue, and remaining inventory levels per SKU.</p>
                            </div>
                            <div className="flex items-center gap-2">
                                {renderSearchBox()}
                                <button type="button" onClick={handleExportCsv} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer">
                                    <Download className="w-3.5 h-3.5" /> Export CSV
                                </button>
                            </div>
                        </div>

                        {displayedBreakdown.length === 0 ? (
                            <div className="p-10 text-center text-xs text-slate-400 flex flex-col items-center gap-2"><Inbox className="w-6 h-6 text-slate-300" /><span>No matching SKU sales records found.</span></div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                                        <th className="py-3 px-4"><button type="button" onClick={() => toggleSalesSort('name')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Product Name &amp; SKU <ArrowUpDown className="w-3 h-3" /></button></th>
                                        <th className="py-3 px-4">Category</th>
                                        <th className="py-3 px-4"><button type="button" onClick={() => toggleSalesSort('unitsSold')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Units Sold <ArrowUpDown className="w-3 h-3" /></button></th>
                                        <th className="py-3 px-4"><button type="button" onClick={() => toggleSalesSort('totalSalesAmount')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Period Revenue ({currency}) <ArrowUpDown className="w-3 h-3" /></button></th>
                                        <th className="py-3 px-4 w-52">Revenue Share (% of Total)</th>
                                        <th className="py-3 px-4"><button type="button" onClick={() => toggleSalesSort('remainingStock')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Remaining Stock <ArrowUpDown className="w-3 h-3" /></button></th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {displayedBreakdown.map((item) => {
                                        const sharePct = activeReport.totalRevenue > 0 ? Number(((item.totalSalesAmount / activeReport.totalRevenue) * 100).toFixed(1)) : 0;
                                        return (
                                            <tr key={item.productID} className="hover:bg-slate-50/80 transition">
                                                <td className="py-3 px-4"><p className="font-bold text-slate-900">{item.name}</p><p className="text-[11px] font-mono text-slate-400">{item.SKU}</p></td>
                                                <td className="py-3 px-4 text-slate-600">{item.category}</td>
                                                <td className="py-3 px-4 font-bold text-slate-900">{item.unitsSold.toLocaleString()}</td>
                                                <td className="py-3 px-4 font-bold text-emerald-700">{sym} {item.totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden"><div className="bg-[#2BB656] h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, sharePct)}%` }} /></div>
                                                        <span className="text-[11px] font-semibold text-slate-600 w-10 text-right">{sharePct}%</span>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 font-semibold text-slate-700">{item.remainingStock} units</td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {activeSubView === 'recommendations' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-emerald-600" /> AI Restock &amp; Holding-Cost Recommendations</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Evaluates holding cost against time to sell off current inventory and applies optimal restock quantities.</p>
                            </div>
                            {renderSearchBox()}
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600">
                                    <th className="py-3 px-4"><button type="button" onClick={() => toggleProcureSort('name')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">SKU &amp; Product <ArrowUpDown className="w-3 h-3" /></button></th>
                                    <th className="py-3 px-3">Current Stock</th>
                                    <th className="py-3 px-3"><button type="button" onClick={() => toggleProcureSort('costOfHoldingStock')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Holding Cost ({currency}) <ArrowUpDown className="w-3 h-3" /></button></th>
                                    <th className="py-3 px-3"><button type="button" onClick={() => toggleProcureSort('timeNeededToSellOffDays')} className="inline-flex items-center gap-1 font-bold hover:text-slate-900 cursor-pointer">Time to Sell Off <ArrowUpDown className="w-3 h-3" /></button></th>
                                    <th className="py-3 px-3">Optimal ({targetTurnoverDays}d)</th>
                                    <th className="py-3 px-3">AI Recommended</th>
                                    <th className="py-3 px-3">Priority</th>
                                    <th className="py-3 px-4">Action</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {displayedRecommendations.map((rec) => {
                                    const matchedProduct = products.find((p) => p.id === rec.productID);
                                    const isQueued = queuedSkus[rec.SKU];
                                    return (
                                        <tr key={rec.productID} className="hover:bg-slate-50/80 transition">
                                            <td className="py-3 px-4"><p className="font-bold text-slate-900">{rec.name}</p><p className="text-[11px] font-mono text-slate-400">{rec.SKU}</p></td>
                                            <td className="py-3 px-3 font-bold text-slate-800">{rec.currentStock}</td>
                                            <td className="py-3 px-3 text-slate-700 font-medium">{sym} {rec.costOfHoldingStock.toFixed(2)}</td>
                                            <td className="py-3 px-3">
                                                <span className={`font-semibold text-[11px] px-2.5 py-0.5 rounded-full ${rec.timeNeededToSellOffDays <= 4 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>{rec.timeNeededToSellOffDays} days left</span>
                                            </td>
                                            <td className="py-3 px-3 font-semibold text-slate-700">{rec.optimalStockToHold} units</td>
                                            <td className="py-3 px-3 font-extrabold text-emerald-700">+{rec.recommendedProcureQty} units</td>
                                            <td className="py-3 px-3">
                                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${rec.priorityLevel === 'HIGH' ? 'bg-rose-100 text-rose-700' : rec.priorityLevel === 'MEDIUM' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>{rec.priorityLevel}</span>
                                            </td>
                                            <td className="py-3 px-4">
                                                {rec.recommendedProcureQty > 0 && matchedProduct ? (
                                                    isQueued ? (
                                                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /> Applied to Auto Restock</span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setQueuedSkus((p) => ({ ...p, [rec.SKU]: true }));
                                                                onQueueRestockToOrderModule(matchedProduct, rec.recommendedProcureQty, `Vyte AI Forecast (${activeReport.period}): Sells off in ${rec.timeNeededToSellOffDays}d; optimal ${targetTurnoverDays}d stock is ${rec.optimalStockToHold} units`);
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

            <div className="lg:col-span-1 space-y-3.5">
                <div className="bg-gradient-to-b from-[#0B0C0E] via-[#10231B] to-[#0D261C] text-white p-5 rounded-2xl shadow-md border border-emerald-500/25 space-y-4">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-bold">
                        <Sparkles className="w-3.5 h-3.5" /> Vyte AI Intelligence ({activeReport.period})
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{activeProcurement.aiSummary}</p>

                    <div className="p-3.5 rounded-xl bg-white/10 border border-white/15 space-y-3">
                        <div>
                            <label className="text-[11px] text-slate-300 font-semibold block">Holding Cost Rate (1–50%)</label>
                            <input
                                type="text" inputMode="decimal" placeholder="18.5" value={holdingCostInput}
                                onChange={(e) => setHoldingCostInput(e.target.value.replace(/[^0-9.]/g, '').replace(/^0+(?=\d)/, ''))}
                                className={`mt-1 w-full px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs focus:outline-none border-2 ${inputErrors.holdingCost ? 'border-rose-500' : 'border-transparent focus:border-emerald-400'}`}
                            />
                            {inputErrors.holdingCost && <p className="text-[10px] text-rose-300 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {inputErrors.holdingCost}</p>}
                        </div>

                        <div>
                            <label className="text-[11px] text-slate-300 font-semibold block">Target Turnover (5–90d)</label>
                            <input
                                type="text" inputMode="numeric" placeholder="21" value={turnoverDaysInput}
                                onChange={(e) => setTurnoverDaysInput(e.target.value.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''))}
                                className={`mt-1 w-full px-3 py-1.5 rounded-lg bg-white text-slate-900 font-bold text-xs focus:outline-none border-2 ${inputErrors.turnoverDays ? 'border-rose-500' : 'border-transparent focus:border-emerald-400'}`}
                            />
                            {inputErrors.turnoverDays && <p className="text-[10px] text-rose-300 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {inputErrors.turnoverDays}</p>}
                        </div>

                        <button
                            type="button" onClick={() => void fetchSalesAndProcurement('manual-ai')}
                            disabled={isLoading || Boolean(inputErrors.holdingCost) || Boolean(inputErrors.turnoverDays)}
                            className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition ${inputErrors.holdingCost || inputErrors.turnoverDays ? 'bg-slate-600 text-slate-300 cursor-not-allowed' : 'bg-[#2BB656] hover:bg-emerald-500 text-white cursor-pointer'}`}
                        >
                            <Sparkles className="w-3.5 h-3.5" />{isRunningAi ? 'Recalculating...' : 'Recalculate AI Forecast'}
                        </button>
                    </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">{activeReport.period} Revenue</p>
                        <p className="text-lg font-extrabold text-slate-900 mt-0.5 truncate">{sym} {activeReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {topProduct && <span className="text-[10px] text-slate-500 block truncate mt-0.5">Top: {topProduct.SKU} ({sym} {topProduct.totalSalesAmount.toLocaleString()})</span>}
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0"><DollarSign className="w-4 h-4" /></div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total Units Sold</p>
                        <p className="text-lg font-extrabold text-slate-900 mt-0.5">{activeReport.totalUnitsSold.toLocaleString()} Units</p>
                        <span className="text-[10px] text-slate-500 block mt-0.5">Across {activeReport.productBreakdown.length} active SKUs</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><PackageCheck className="w-4 h-4" /></div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Est. Holding Cost</p>
                        <p className="text-lg font-extrabold text-amber-600 mt-0.5">{sym} {totalHoldingCostFormatted}</p>
                        <span className="text-[10px] text-slate-500 block mt-0.5">At {holdingCostPercentage}% annual rate</span>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Clock className="w-4 h-4" /></div>
                </div>
            </div>
        </div>
    );
};