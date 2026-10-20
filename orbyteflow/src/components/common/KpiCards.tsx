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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shrink-0">
                    <Layers className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-medium">Active Universal SKUs</p>
                    <p className="text-2xl font-bold text-slate-900">{totalSkus} Items</p>
                    <span className="text-[11px] text-emerald-600 font-medium">F&B, Retail & B2B Ready</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-orange-500 text-white flex items-center justify-center shrink-0">
                    <RefreshCw className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-medium">Auto-Restock Triggers</p>
                    <p className="text-2xl font-bold text-orange-600">{pendingRestocks} Pending</p>
                    <span className="text-[11px] text-slate-400">Awaiting Owner Approval</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-600 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-medium">Quality / Expiry Risks</p>
                    <p className="text-2xl font-bold text-purple-600">{pendingQcBatches} Batches</p>
                    <span className="text-[11px] text-emerald-600 font-medium">RM 762 loss preventable</span>
                </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-xs text-slate-500 font-medium">AI Categorized Invoices</p>
                    <p className="text-2xl font-bold text-emerald-600">{totalInvoices} Docs</p>
                    <span className="text-[11px] text-slate-400">Avg 95% AI Accuracy</span>
                </div>
            </div>
        </div>
    );
};