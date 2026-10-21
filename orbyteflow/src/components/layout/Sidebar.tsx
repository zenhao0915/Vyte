// src/components/layout/Sidebar.tsx
import React, { useState } from 'react';
import {
    Box,
    TrendingUp,
    MessageSquare,
    AlertTriangle,
    FileText,
    Search,
    ChevronLeft,
    ChevronRight,
    Settings,
    LogOut,
    X,
    ShieldCheck,
} from 'lucide-react';
import type { ActiveTab, UserSession } from '../../types/vyte.ts';
import { VyteLogo } from '../common/VyteLogo';

interface SidebarProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    industryFilter: string;
    setIndustryFilter: (filter: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    pendingRestockCount: number;
    pendingOrderCount: number;
    pendingQcCount: number;
    pendingInvoiceCount: number;
    totalProductCount: number;
    userSession: UserSession | null;
    onLogout: () => void;
}

/** @Composable */
export const Sidebar: React.FC<SidebarProps> = ({
                                                    activeTab,
                                                    setActiveTab,
                                                    industryFilter,
                                                    setIndustryFilter,
                                                    searchQuery,
                                                    setSearchQuery,
                                                    pendingRestockCount,
                                                    pendingOrderCount,
                                                    pendingQcCount,
                                                    pendingInvoiceCount,
                                                    totalProductCount,
                                                    userSession,
                                                    onLogout,
                                                }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [whatsappAutoAlerts, setWhatsappAutoAlerts] = useState(true);
    const [strictRbacLock, setStrictRbacLock] = useState(true);

    const coreModules = [
        {
            id: 'mod1' as ActiveTab,
            label: 'Auto Restock',
            icon: Box,
            iconColor: 'text-emerald-600',
            badge: String(pendingRestockCount),
            badgeClass: 'bg-amber-100 text-amber-800',
        },
        {
            id: 'mod2' as ActiveTab,
            label: 'Sales Analytics',
            icon: TrendingUp,
            iconColor: 'text-blue-600',
            badge: 'AI',
            badgeClass: 'bg-blue-100 text-blue-700 rounded-md',
        },
        {
            id: 'mod3' as ActiveTab,
            label: 'Order Status',
            icon: MessageSquare,
            iconColor: 'text-purple-600',
            badge: String(pendingOrderCount),
            badgeClass: 'bg-purple-100 text-purple-700',
        },
        {
            id: 'mod4' as ActiveTab,
            label: 'Quality & Expiry',
            icon: AlertTriangle,
            iconColor: 'text-rose-600',
            badge: String(pendingQcCount),
            badgeClass: 'bg-rose-100 text-rose-700',
        },
        {
            id: 'mod5' as ActiveTab,
            label: 'Smart Invoices',
            icon: FileText,
            iconColor: 'text-emerald-600',
            badge: String(pendingInvoiceCount),
            badgeClass: 'bg-emerald-100 text-emerald-700',
        },
    ];

    return (
        <>
            <aside
                className={`${
                    isCollapsed ? 'w-20' : 'w-64'
                } h-screen sticky top-0 left-0 bg-white border-r border-slate-200/90 flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out select-none z-30`}
            >
                {/* Collapse Toggle Button */}
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-300 absolute -right-3 top-8 z-40 transition cursor-pointer"
                >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </button>

                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    {/* Official Vyte Brand Header (Scaled to Image 2 Margins) */}
                    <div className="px-5 py-4 flex items-center justify-center border-b border-slate-100 shrink-0">
                        {isCollapsed ? (
                            <VyteLogo iconOnly={true} className="h-9 w-auto" />
                        ) : (
                            <VyteLogo
                                variant="dark-text"
                                showSubtitle={true}
                                className="w-full max-w-[185px] h-auto"
                            />
                        )}
                    </div>

                    {/* Search Input */}
                    <div className="p-3.5 shrink-0">
                        {isCollapsed ? (
                            <button
                                type="button"
                                onClick={() => setIsCollapsed(false)}
                                title="Search SKU or item"
                                className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200/80 flex items-center justify-center text-slate-500 cursor-pointer"
                            >
                                <Search className="w-4 h-4" />
                            </button>
                        ) : (
                            <div className="relative">
                                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                                <input
                                    type="text"
                                    placeholder="Search SKU or item..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-3 py-2 bg-slate-50 text-slate-900 placeholder-slate-400 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500 transition"
                                />
                            </div>
                        )}
                    </div>

                    {/* CORE MODULES NAVIGATION */}
                    <nav className="px-3 space-y-1.5">
                        {!isCollapsed && (
                            <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                CORE MODULES
                            </p>
                        )}

                        {coreModules.map((mod) => {
                            const Icon = mod.icon;
                            const isActive = activeTab === mod.id;
                            return (
                                <button
                                    key={mod.id}
                                    onClick={() => setActiveTab(mod.id)}
                                    title={isCollapsed ? mod.label : undefined}
                                    className={`w-full flex items-center ${
                                        isCollapsed ? 'justify-center px-2 py-3' : 'justify-between px-3.5 py-2.5'
                                    } rounded-xl text-sm transition-all cursor-pointer border ${
                                        isActive
                                            ? 'bg-[#EBFDF2] border-[#A7F3D0] text-emerald-950 font-bold shadow-[0_1px_2px_rgba(16,185,129,0.06)]'
                                            : 'border-transparent text-slate-700 font-medium hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="flex items-center gap-3">
                                        <Icon className={`w-4 h-4 shrink-0 ${mod.iconColor}`} />
                                        {!isCollapsed && <span>{mod.label}</span>}
                                    </span>

                                    {!isCollapsed && (
                                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${mod.badgeClass}`}>
                                            {mod.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        {/* SME INDUSTRY PROFILES */}
                        <div className="pt-4 space-y-1">
                            {!isCollapsed && (
                                <p className="px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                    SME INDUSTRY PROFILES
                                </p>
                            )}

                            <button
                                onClick={() => setIndustryFilter('ALL')}
                                title="All SME Templates"
                                className={`w-full text-left ${
                                    isCollapsed ? 'flex justify-center py-2' : 'px-3.5 py-2 flex items-center justify-between'
                                } text-xs rounded-xl transition cursor-pointer ${
                                    industryFilter === 'ALL'
                                        ? 'font-bold text-slate-900 bg-slate-100/90'
                                        : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                            >
                                {isCollapsed ? (
                                    <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                        {totalProductCount}
                                    </span>
                                ) : (
                                    <>
                                        <span>• All SME Templates</span>
                                        <span className="bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded-md text-[11px] font-bold">
                                            {totalProductCount}
                                        </span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={() => setIndustryFilter('FNB_PERISHABLE')}
                                title="F&B / Perishable"
                                className={`w-full text-left ${
                                    isCollapsed ? 'flex justify-center py-2.5' : 'px-3.5 py-2 flex items-center gap-2.5'
                                } text-xs rounded-xl transition cursor-pointer ${
                                    industryFilter === 'FNB_PERISHABLE'
                                        ? 'font-bold text-rose-700 bg-rose-50/90'
                                        : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0"></span>
                                {!isCollapsed && <span>F&amp;B / Perishable</span>}
                            </button>

                            <button
                                onClick={() => setIndustryFilter('RETAIL_VARIANT')}
                                title="Retail & Variants"
                                className={`w-full text-left ${
                                    isCollapsed ? 'flex justify-center py-2.5' : 'px-3.5 py-2 flex items-center gap-2.5'
                                } text-xs rounded-xl transition cursor-pointer ${
                                    industryFilter === 'RETAIL_VARIANT'
                                        ? 'font-bold text-blue-700 bg-blue-50/90'
                                        : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
                                {!isCollapsed && <span>Retail &amp; Variants</span>}
                            </button>

                            <button
                                onClick={() => setIndustryFilter('B2B_RAW_MATERIAL')}
                                title="B2B & Packaging"
                                className={`w-full text-left ${
                                    isCollapsed ? 'flex justify-center py-2.5' : 'px-3.5 py-2 flex items-center gap-2.5'
                                } text-xs rounded-xl transition cursor-pointer ${
                                    industryFilter === 'B2B_RAW_MATERIAL'
                                        ? 'font-bold text-emerald-800 bg-[#EBFDF2]'
                                        : 'text-slate-600 hover:bg-slate-50 font-medium'
                                }`}
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span>
                                {!isCollapsed && <span>B2B &amp; Packaging</span>}
                            </button>
                        </div>
                    </nav>
                </div>

                {/* Bottom Settings & Logout Controls (Replaced Redundant Connection Hub) */}
                <div className="p-3 border-t border-slate-100 shrink-0">
                    {isCollapsed ? (
                        <div className="flex flex-col items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(true)}
                                title="Workspace Settings"
                                className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200/80 flex items-center justify-center transition cursor-pointer"
                            >
                                <Settings className="w-4 h-4" />
                            </button>
                            <button
                                type="button"
                                onClick={onLogout}
                                title="Log Out"
                                className="w-full py-2.5 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-rose-600 border border-rose-200/70 flex items-center justify-center transition cursor-pointer"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(true)}
                                className="py-2.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span>Settings</span>
                            </button>
                            <button
                                type="button"
                                onClick={onLogout}
                                className="py-2.5 px-3 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-rose-600 border border-rose-200/80 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Log Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {/* Workspace Settings Modal */}
            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900">Vyte Workspace Settings</h3>
                                <p className="text-xs text-slate-500">
                                    Organization &amp; automation preferences
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(false)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                <p className="text-[11px] font-bold uppercase text-slate-400">Authenticated Session</p>
                                <p className="font-bold text-slate-900">
                                    {userSession?.userName || 'Vyte Operator'} ({userSession?.userID || 'M067'})
                                </p>
                                <p className="text-slate-600">{userSession?.companyName}</p>
                                <p className="text-emerald-700 font-semibold">
                                    Assigned Login Role: {userSession?.userType} ({userSession?.role})
                                </p>
                            </div>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                <div>
                                    <p className="font-bold text-slate-800">Automated WhatsApp PO Dispatch</p>
                                    <p className="text-[11px] text-slate-500">
                                        Send supplier POs immediately upon approval
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={whatsappAutoAlerts}
                                    onChange={(e) => setWhatsappAutoAlerts(e.target.checked)}
                                    className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                />
                            </label>

                            <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                <div>
                                    <p className="font-bold text-slate-800">Enforce Login RBAC Permissions</p>
                                    <p className="text-[11px] text-slate-500">
                                        Lock approval actions to Owner &amp; Manager roles
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={strictRbacLock}
                                    onChange={(e) => setStrictRbacLock(e.target.checked)}
                                    className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                />
                            </label>

                            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
                                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>Malaysia PDPA Compliant • Human-in-the-Loop Active</span>
                            </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setShowSettingsModal(false)}
                                className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition cursor-pointer"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};