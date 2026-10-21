// src/modules/jayden-modules/SalesAnalyticsModule.tsx
import React, { useState, useMemo } from 'react';
import {
    TrendingUp,
    Sparkles,
    Calendar,
    DollarSign,
    PackageCheck,
    Clock,
    ArrowUpRight,
    RefreshCw,
    Download,
    CheckCircle2,
} from 'lucide-react';
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    Product,
} from '../../types/orbyte';
import { orbyteApi } from '../../services/api';

interface SalesAnalyticsModuleProps {
    products: Product[];
    userID: string;
    onQueueRestockToOrderModule: (product: Product, recommendedQty: number, aiReason: string) => void;
    onLogAction: (module: string, detail: string) => void;
}

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const SalesAnalyticsModule: React.FC<SalesAnalyticsModuleProps> = ({
                                                                              products,
                                                                              userID,
                                                                              onQueueRestockToOrderModule,
                                                                              onLogAction,
                                                                          }) => {
    const [filterMonth, setFilterMonth] = useState<number | null>(null);
    const [filterYear, setFilterYear] = useState<number>(2026);
    const [filterQuarter, setFilterQuarter] = useState<number | null>(3);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [holdingCostInput, setHoldingCostInput] = useState<string>('18.5');
    const [turnoverDaysInput, setTurnoverDaysInput] = useState<string>('21');
    const holdingCostPercentage = Math.min(50, Math.max(1, Number(holdingCostInput) || 1));
    const targetTurnoverDays = Math.min(90, Math.max(1, Number(turnoverDaysInput) || 7));

    const [isSyncingReport, setIsSyncingReport] = useState(false);
    const [isRunningAi, setIsRunningAi] = useState(false);
    const [queuedSkus, setQueuedSkus] = useState<Record<string, boolean>>({});

    const periodMultiplier = useMemo(() => {
        if (filterMonth !== null) {
            // Seasonal monthly variation
            return 0.85 + ((filterMonth % 4) * 0.1);
        }
        if (filterQuarter !== null) {
            const map: Record<number, number> = { 1: 0.88, 2: 0.96, 3: 1.08, 4: 1.24 };
            return map[filterQuarter] || 1.0;
        }
        return 1.0;
    }, [filterQuarter, filterMonth]);

    const salesReport: GetSalesReviewReportResponse = useMemo(() => {
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

    const aiProcurementAnalysis: AnalyzeProcurementResponse = useMemo(() => {
        const periodDivisor = filterMonth !== null ? 12 : filterQuarter !== null ? 4 : 1;

        const recommendations = products.map((p) => {
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
            aiSummary: `For ${salesReport.period}, portfolio revenue reached RM ${salesReport.totalRevenue.toLocaleString()} across ${salesReport.totalUnitsSold.toLocaleString()} units. At a ${holdingCostPercentage}% holding cost rate and ${targetTurnoverDays}-day turnover target, Vyte AI identified ${highPriorityCount} high-priority SKUs requiring immediate restock to prevent stockout revenue loss while keeping carrying costs optimal.`,
            procurementRecommendations: recommendations,
        };
    }, [products, periodMultiplier, filterMonth, filterQuarter, holdingCostPercentage, targetTurnoverDays, salesReport]);

    const handleRefreshSalesReport = async () => {
        setIsSyncingReport(true);
        const reqPayload: GetSalesReviewReportRequest = {
            filterYear,
            filterQuarter,
            category: selectedCategory === 'ALL' ? null : selectedCategory,
            productID: null,
            userID,
        };
        await orbyteApi.getSalesReviewReport(reqPayload, salesReport);
        onLogAction(
            'Sales Analytics',
            `Generated ${salesReport.period} sales report (Total Revenue: RM ${salesReport.totalRevenue.toLocaleString()}).`
        );
        setTimeout(() => setIsSyncingReport(false), 300);
    };

    const handleRunAiProcurement = async () => {
        setIsRunningAi(true);
        const reqPayload: AnalyzeProcurementRequest = {
            filterYear,
            filterQuarter,
            holdingCostPercentage,
            targetTurnoverDays,
            userID,
        };
        await orbyteApi.analyzeProcurement(reqPayload, aiProcurementAnalysis);
        onLogAction(
            'Sales Analytics (AI)',
            `Refreshed AI holding-cost & restock forecast for ${salesReport.period} (${holdingCostPercentage}% holding cost, ${targetTurnoverDays}d target turnover).`
        );
        setTimeout(() => setIsRunningAi(false), 350);
    };

    const categories = ['ALL', ...Array.from(new Set(products.map((p) => p.category)))];
    const maxSalesAmount = Math.max(...salesReport.productBreakdown.map((b) => b.totalSalesAmount), 1);

    return (
        <div className="space-y-6">
            {/* Unified Top Controls & Filter Bar (Year / Quarter / Month / Category) */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    {/* Year Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                        <Calendar className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-semibold text-slate-500">Year:</span>
                        <select
                            value={filterYear}
                            onChange={(e) => setFilterYear(Number(e.target.value))}
                            className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                        >
                            <option value={2026}>2026</option>
                            <option value={2025}>2025</option>
                            <option value={2024}>2024</option>
                        </select>
                    </div>

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

                    {/* Month Filter */}
                    <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
                        <span className="text-xs font-semibold text-slate-500">Month:</span>
                        <select
                            value={filterMonth ?? ''}
                            onChange={(e) => {
                                const val = e.target.value === '' ? null : Number(e.target.value);
                                setFilterMonth(val);
                                if (val !== null) setFilterQuarter(null);
                            }}
                            className="bg-transparent text-xs font-bold text-slate-900 focus:outline-none cursor-pointer"
                        >
                            <option value="">All Months</option>
                            {MONTH_NAMES.map((m, idx) => (
                                <option key={m} value={idx + 1}>
                                    {m}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Category Filter */}
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
                    >
                        {categories.map((cat) => (
                            <option key={cat} value={cat}>
                                {cat === 'ALL' ? 'All Product Categories' : cat}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2.5">
                    <button
                        onClick={handleRefreshSalesReport}
                        disabled={isSyncingReport}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingReport ? 'animate-spin' : ''}`} />
                        Refresh Report
                    </button>

                    <button
                        onClick={handleRunAiProcurement}
                        disabled={isRunningAi}
                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        {isRunningAi ? 'Analyzing...' : 'Recalculate AI Forecast'}
                    </button>
                </div>
            </div>

            {/* Executive AI Summary Banner */}
            <div className="bg-gradient-to-r from-[#0B0C0E] via-[#12221B] to-[#0E291E] text-white p-6 rounded-2xl shadow-md border border-emerald-500/20 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                <div className="space-y-2 max-w-3xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold">
                        <Sparkles className="w-3.5 h-3.5" /> Vyte AI Business &amp; Holding-Cost Intelligence ({salesReport.period})
                    </div>
                    <p className="text-sm text-slate-200 leading-relaxed">{aiProcurementAnalysis.aiSummary}</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 flex items-center gap-5 shrink-0">
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
                            className="mt-1 w-24 px-2.5 py-1 rounded-lg bg-white text-slate-900 font-bold text-sm focus:outline-none"
                        />
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
                            className="mt-1 w-24 px-2.5 py-1 rounded-lg bg-white text-slate-900 font-bold text-sm focus:outline-none"
                        />
                    </div>
                </div>
            </div>

            {/* Period Summary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">{salesReport.period} Total Revenue</p>
                        <p className="text-2xl font-extrabold text-slate-900 mt-1">
                            RM {salesReport.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </p>
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 mt-1">
              <ArrowUpRight className="w-3.5 h-3.5" /> +14.2% vs prior period
            </span>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <DollarSign className="w-6 h-6" />
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                    <div>
                        <p className="text-xs font-semibold text-slate-400 uppercase">Total Units Sold ({salesReport.period})</p>
                        <p className="text-2xl font-extrabold text-slate-900 mt-1">
                            {salesReport.totalUnitsSold.toLocaleString()} Units
                        </p>
                        <span className="text-xs text-slate-500 mt-1 block">
              Across {salesReport.productBreakdown.length} active catalog SKUs
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
                            {aiProcurementAnalysis.procurementRecommendations
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

            {/* Product Sales Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-blue-600" /> Product Sales Breakdown ({salesReport.period})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Tracks unit turnover, revenue contribution, and remaining inventory levels per SKU.
                        </p>
                    </div>
                    <button
                        onClick={() =>
                            onLogAction('Sales Analytics', `Exported ${salesReport.period} performance report.`)
                        }
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <Download className="w-3.5 h-3.5" /> Export Report
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                            <th className="py-3.5 px-4">Product Name &amp; SKU</th>
                            <th className="py-3.5 px-4">Category</th>
                            <th className="py-3.5 px-4">Units Sold</th>
                            <th className="py-3.5 px-4">Period Revenue (MYR)</th>
                            <th className="py-3.5 px-4 w-56">Revenue Share</th>
                            <th className="py-3.5 px-4">Remaining Stock</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                        {salesReport.productBreakdown.map((item) => {
                            const sharePct = Math.round((item.totalSalesAmount / maxSalesAmount) * 100);
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
                                        RM {item.totalSalesAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="py-3.5 px-4">
                                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                            <div
                                                className="bg-[#2BB656] h-full rounded-full transition-all duration-500"
                                                style={{ width: `${sharePct}%` }}
                                            />
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
            </div>

            {/* AI Procurement & Holding-Cost Optimization Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-emerald-600" /> AI Restock &amp; Holding-Cost Recommendations
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Evaluates holding cost against the time needed to sell off current inventory.
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                            <th className="py-3.5 px-4">SKU &amp; Product</th>
                            <th className="py-3.5 px-4">Current Stock</th>
                            <th className="py-3.5 px-4">Holding Cost</th>
                            <th className="py-3.5 px-4">Time to Sell Off</th>
                            <th className="py-3.5 px-4">Optimal Stock ({targetTurnoverDays}d)</th>
                            <th className="py-3.5 px-4">AI Recommended Procure</th>
                            <th className="py-3.5 px-4">Priority</th>
                            <th className="py-3.5 px-4">Action</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                        {aiProcurementAnalysis.procurementRecommendations.map((rec) => {
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
                                                    onClick={() => {
                                                        setQueuedSkus((prev) => ({ ...prev, [rec.SKU]: true }));
                                                        onQueueRestockToOrderModule(
                                                            matchedProduct,
                                                            rec.recommendedProcureQty,
                                                            `Vyte AI Forecast (${salesReport.period}): Sells off in ${rec.timeNeededToSellOffDays}d; optimal ${targetTurnoverDays}d stock is ${rec.optimalStockToHold} units`
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
            </div>
        </div>
    );
};