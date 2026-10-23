// src/components/common/KpiCards.tsx
import React from 'react';
import { Layers, RefreshCw, AlertTriangle, FileText } from 'lucide-react';

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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white px-4 py-3.5 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0">
                    <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium truncate">Active Universal SKUs</p>
                    <p className="text-xl font-extrabold text-slate-900 leading-tight">{totalSkus} Items</p>
                    <span className="text-[10px] text-emerald-600 font-semibold block truncate">
            F&amp;B, Retail &amp; B2B Ready
          </span>
                </div>
            </div>

            <div className="bg-white px-4 py-3.5 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500 text-white flex items-center justify-center shrink-0">
                    <RefreshCw className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium truncate">Auto-Restock Triggers</p>
                    <p className="text-xl font-extrabold text-orange-600 leading-tight">{pendingRestocks} Pending</p>
                    <span className="text-[10px] text-slate-400 block truncate">Awaiting Owner Approval</span>
                </div>
            </div>

            <div className="bg-white px-4 py-3.5 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium truncate">Quality / Expiry Risks</p>
                    <p className="text-xl font-extrabold text-purple-600 leading-tight">{pendingQcBatches} Batches</p>
                    <span className="text-[10px] text-emerald-600 font-semibold block truncate">
            RM 762 loss preventable
          </span>
                </div>
            </div>

            <div className="bg-white px-4 py-3.5 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-[11px] text-slate-500 font-medium truncate">AI Categorized Invoices</p>
                    <p className="text-xl font-extrabold text-emerald-600 leading-tight">{totalInvoices} Docs</p>
                    <span className="text-[10px] text-slate-400 block truncate">Avg 95% AI Accuracy</span>
                </div>
            </div>
        </div>
    );
};