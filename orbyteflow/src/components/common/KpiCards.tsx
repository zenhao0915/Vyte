// src/components/common/KpiCards.tsx
import React from 'react';
import { Layers, RefreshCw, AlertTriangle, FileText, Globe, Clock, CheckCircle2 } from 'lucide-react';

interface KpiCardsProps {
    totalSkus: number;
    pendingRestocks: number;
    pendingQcBatches: number;
    totalInvoices: number;
}

export const KpiCards: React.FC<KpiCardsProps> = ({
                                                      totalSkus,
                                                      pendingRestocks,
                                                      pendingQcBatches,
                                                      totalInvoices,
                                                  }) => {
    return (
        <div className="space-y-2.5">
            {/* Compact 4-Column KPI Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0">
                        <Layers className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 font-medium truncate">Active Universal SKUs</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-lg font-extrabold text-slate-900 leading-tight">{totalSkus} Items</p>
                            <span className="text-[10px] text-emerald-600 font-semibold truncate">F&amp;B, Retail, B2B</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-orange-500 text-white flex items-center justify-center shrink-0">
                        <RefreshCw className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 font-medium truncate">Auto-Restock Triggers</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-lg font-extrabold text-orange-600 leading-tight">{pendingRestocks} Pending</p>
                            <span className="text-[10px] text-slate-400 truncate">Owner Approval</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                        <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 font-medium truncate">Quality / Expiry Risks</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-lg font-extrabold text-purple-600 leading-tight">{pendingQcBatches} Batches</p>
                            <span className="text-[10px] text-emerald-600 font-semibold truncate">RM 762 saved</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-[11px] text-slate-500 font-medium truncate">AI Categorized Invoices</p>
                        <div className="flex items-baseline gap-2">
                            <p className="text-lg font-extrabold text-emerald-600 leading-tight">{totalInvoices} Docs</p>
                            <span className="text-[10px] text-slate-400 truncate">96% AI Accuracy</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Must-Have #5 & #6: Orbyte Hub Fit, Measurable Business Benefit & SDG Strip */}
            <div className="bg-slate-900 text-white px-4 py-2 rounded-xl flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-bold text-emerald-400">
            <Globe className="w-3.5 h-3.5" /> Orbyte Ecosystem Plug-in
          </span>
                    <span className="text-slate-400">|</span>
                    <span className="inline-flex items-center gap-1 text-slate-200">
            <Clock className="w-3 h-3 text-amber-400" /> <strong>Measurable Benefit:</strong> Saves ~14.5 hrs/wk chasing suppliers &amp; avoids 98% manual PO pricing errors
          </span>
                </div>
                <div className="flex items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 font-semibold">
            SDG 8 (8.2 &amp; 8.3)
          </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-400/30 text-blue-300 font-semibold">
            SDG 9
          </span>
                    <span className="px-2 py-0.5 rounded bg-purple-500/20 border border-purple-400/30 text-purple-300 font-semibold">
            SDG 12 Waste Reduction
          </span>
                    <span className="hidden xl:inline-flex items-center gap-1 text-slate-400 ml-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> PDPA Synthetic Data
          </span>
                </div>
            </div>
        </div>
    );
};