// src/components/layout/Sidebar.tsx
import React from 'react';
import { Package, AlertTriangle, FileText, BarChart3, Search, ShieldCheck } from 'lucide-react';
import type { ActiveTab } from '../../types/orbyte';

interface SidebarProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    industryFilter: string;
    setIndustryFilter: (filter: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    pendingRestockCount: number;
    pendingQcCount: number;
    pendingInvoiceCount: number;
    totalProductCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
                                                    activeTab,
                                                    setActiveTab,
                                                    industryFilter,
                                                    setIndustryFilter,
                                                    searchQuery,
                                                    setSearchQuery,
                                                    pendingRestockCount,
                                                    pendingQcCount,
                                                    pendingInvoiceCount,
                                                    totalProductCount,
                                                }) => {
    return (
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between shrink-0">
            <div>
                <div className="p-6 flex items-center gap-3 border-b border-slate-100">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                        O
                    </div>
                    <div>
                        <h1 className="font-bold text-slate-900 text-lg leading-none">orbyteflow</h1>
                        <span className="text-xs text-slate-400">Smart SME Hub • Domain 2</span>
                    </div>
                </div>

                <div className="p-4">
                    <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <input
                            type="text"
                            placeholder="Search SKU or item..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>

                <nav className="px-3 space-y-1">
                    <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        Zi Yun's Modules (1, 4, 5)
                    </p>
                    <button
                        onClick={() => setActiveTab('mod1')}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                            activeTab === 'mod1' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
            <span className="flex items-center gap-2.5">
              <Package className="w-4 h-4" /> 1. Auto Restock
            </span>
                        <span className="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full font-semibold">
              {pendingRestockCount}
            </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('mod4')}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                            activeTab === 'mod4' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
            <span className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4" /> 4. Quality & Expiry
            </span>
                        <span className="bg-rose-100 text-rose-700 text-xs px-2 py-0.5 rounded-full font-semibold">
              {pendingQcCount}
            </span>
                    </button>

                    <button
                        onClick={() => setActiveTab('mod5')}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                            activeTab === 'mod5' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
            <span className="flex items-center gap-2.5">
              <FileText className="w-4 h-4" /> 5. AI Invoices
            </span>
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-semibold">
              {pendingInvoiceCount}
            </span>
                    </button>

                    <div className="pt-4">
                        <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Jayden's Modules (2, 3)
                        </p>
                        <button
                            onClick={() => setActiveTab('mod2_3')}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                                activeTab === 'mod2_3' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            <BarChart3 className="w-4 h-4" /> 2 & 3. Sales & Orders
                        </button>
                    </div>

                    <div className="pt-4">
                        <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                            Universal SME Profiles
                        </p>
                        <button
                            onClick={() => setIndustryFilter('ALL')}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded flex items-center justify-between ${
                                industryFilter === 'ALL' ? 'font-bold text-slate-900 bg-slate-100' : 'text-slate-600'
                            }`}
                        >
                            <span>• All SME Templates</span>
                            <span className="bg-slate-200 px-1.5 py-0.5 rounded text-[10px]">{totalProductCount}</span>
                        </button>
                        <button
                            onClick={() => setIndustryFilter('FNB_PERISHABLE')}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded flex items-center justify-between ${
                                industryFilter === 'FNB_PERISHABLE' ? 'font-bold text-rose-600 bg-rose-50' : 'text-slate-600'
                            }`}
                        >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span> F&B / Perishable
              </span>
                        </button>
                        <button
                            onClick={() => setIndustryFilter('RETAIL_VARIANT')}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded flex items-center justify-between ${
                                industryFilter === 'RETAIL_VARIANT' ? 'font-bold text-blue-600 bg-blue-50' : 'text-slate-600'
                            }`}
                        >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span> Retail & Variants
              </span>
                        </button>
                        <button
                            onClick={() => setIndustryFilter('B2B_RAW_MATERIAL')}
                            className={`w-full text-left px-3 py-1.5 text-xs rounded flex items-center justify-between ${
                                industryFilter === 'B2B_RAW_MATERIAL' ? 'font-bold text-emerald-600 bg-emerald-50' : 'text-slate-600'
                            }`}
                        >
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span> B2B & Packaging
              </span>
                        </button>
                    </div>
                </nav>
            </div>

            <div className="p-4 m-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" /> Orbyte Connected Hub
                </div>
                <p className="text-slate-500 leading-relaxed">
                    100% Synthetic Data • Malaysia PDPA Compliant • Human-in-the-Loop Active
                </p>
            </div>
        </aside>
    );
};