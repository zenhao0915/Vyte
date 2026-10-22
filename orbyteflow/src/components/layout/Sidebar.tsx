// src/components/layout/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import {
    Box,
    TrendingUp,
    AlertTriangle,
    FileText,
    Clock,
    Search,
    ChevronLeft,
    ChevronRight,
    Settings,
    LogOut,
    X,
    ShieldCheck,
    Volume2,
    FileCode,
    Sliders,
} from 'lucide-react';
import type { ActiveTab, CurrencyCode, UserRole, UserSession } from '../../types/vyte.ts';
import { VyteLogo } from '../common/VyteLogo';
import { VyteDropdown } from '../common/VyteDropdown';

interface SidebarProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    role: UserRole;
    operatingCurrency: CurrencyCode;
    onCurrencyChange: (currency: CurrencyCode) => void;
    industryFilter?: string;
    setIndustryFilter?: (filter: string) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    pendingRestockCount: number;
    pendingOrderCount: number;
    pendingQcCount: number;
    pendingInvoiceCount: number;
    auditLogCount: number;
    totalProductCount: number;
    userSession: UserSession | null;
    onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
                                                    activeTab,
                                                    setActiveTab,
                                                    role,
                                                    operatingCurrency,
                                                    onCurrencyChange,
                                                    searchQuery,
                                                    setSearchQuery,
                                                    pendingRestockCount,
                                                    pendingOrderCount,
                                                    pendingQcCount,
                                                    pendingInvoiceCount,
                                                    auditLogCount,
                                                    userSession,
                                                    onLogout,
                                                }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);

    const [tempCurrency, setTempCurrency] = useState<CurrencyCode>(operatingCurrency);
    const [defaultTurnoverTarget, setDefaultTurnoverTarget] = useState<'7' | '14' | '21' | '30' | '60'>('21');
    const [audioAlerts, setAudioAlerts] = useState(true);
    const [autoDraftPo, setAutoDraftPo] = useState(true);
    const [whatsappAutoAlerts, setWhatsappAutoAlerts] = useState(true);
    const [strictRbacLock, setStrictRbacLock] = useState(true);
    const [eInvoiceCompliance, setEInvoiceCompliance] = useState(true);

    useEffect(() => {
        setTempCurrency(operatingCurrency);
    }, [operatingCurrency, showSettingsModal]);

    const handleSaveSettings = () => {
        onCurrencyChange(tempCurrency);
        setShowSettingsModal(false);
    };

    const roleBadgeConfig: Record<UserRole, { label: string; style: string }> = {
        SME_OWNER: {
            label: 'Owner (Full Approval Access)',
            style: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        },
        MANAGER: {
            label: 'Manager (Approval & Ops Access)',
            style: 'bg-blue-50 text-blue-800 border-blue-200',
        },
        OPERATIONS_STAFF: {
            label: 'Ops Staff (Read & Trigger Only)',
            style: 'bg-amber-50 text-amber-800 border-amber-200',
        },
    };

    const activeBadge = roleBadgeConfig[role];

    const coreModules = [
        {
            id: 'mod1' as ActiveTab,
            label: 'Restock & Orders',
            icon: Box,
            iconColor: 'text-emerald-600',
            badge: String(pendingRestockCount + pendingOrderCount),
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
        {
            id: 'logs' as ActiveTab,
            label: 'Audit Logs',
            icon: Clock,
            iconColor: 'text-slate-600',
            badge: String(auditLogCount),
            badgeClass: 'bg-slate-200 text-slate-800',
        },
    ];

    return (
        <>
            <aside
                className={`${
                    isCollapsed ? 'w-20' : 'w-64'
                } h-full bg-white border border-slate-200/90 rounded-2xl shadow-xs flex flex-col justify-between shrink-0 transition-all duration-300 ease-in-out select-none relative z-30`}
            >
                <button
                    type="button"
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center text-slate-500 hover:text-emerald-600 hover:border-emerald-300 absolute -right-3 top-8 z-40 transition cursor-pointer"
                >
                    {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
                </button>

                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    <div className="px-5 py-4 flex items-center justify-center border-b border-slate-100 shrink-0">
                        {isCollapsed ? (
                            <VyteLogo iconOnly={true} className="h-9 w-auto" />
                        ) : (
                            <VyteLogo variant="dark-text" showSubtitle={true} className="w-full max-w-[185px] h-auto" />
                        )}
                    </div>

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

                    <nav className="px-3 space-y-1.5">
                        {!isCollapsed && (
                            <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                CORE MODULES
                            </p>
                        )}

                        {coreModules.map((mod) => {
                            const Icon = mod.icon;
                            const isActive = activeTab === mod.id || (mod.id === 'mod1' && activeTab === 'mod3');
                            return (
                                <button
                                    key={mod.id}
                                    onClick={() => setActiveTab(mod.id)}
                                    title={isCollapsed ? mod.label : undefined}
                                    className={`w-full flex items-center ${
                                        isCollapsed
                                            ? 'justify-center px-2 py-3'
                                            : 'justify-between px-3.5 py-2.5'
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
                    </nav>
                </div>

                <div className="p-3 border-t border-slate-100 space-y-2 shrink-0">
                    <div
                        title={activeBadge.label}
                        className={`w-full rounded-xl border text-[11px] font-bold flex items-center ${
                            isCollapsed
                                ? 'justify-center py-2 px-1'
                                : 'justify-center gap-1.5 px-3 py-2'
                        } ${activeBadge.style}`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        {!isCollapsed && <span className="truncate">{activeBadge.label}</span>}
                    </div>

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
                                className="py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200/90 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span>Settings</span>
                            </button>
                            <button
                                type="button"
                                onClick={onLogout}
                                className="py-2 px-3 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-rose-600 border border-rose-200/80 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Log Out</span>
                            </button>
                        </div>
                    )}
                </div>
            </aside>

            {showSettingsModal && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                    <Sliders className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-slate-900">Workspace Settings</h3>
                                    <p className="text-xs text-slate-500">System configurations &amp; operational preferences</p>
                                </div>
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
                                    Role: {userSession?.userType} ({userSession?.role})
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">Operating Currency</label>
                                    <VyteDropdown<CurrencyCode>
                                        variant="light"
                                        size="sm"
                                        value={tempCurrency}
                                        onChange={(val: CurrencyCode) => setTempCurrency(val)}
                                        options={[
                                            { label: 'MYR (RM) - Malaysia', value: 'MYR' },
                                            { label: 'SGD (S$) - Singapore', value: 'SGD' },
                                            { label: 'USD ($) - International', value: 'USD' },
                                        ]}
                                    />
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">Default AI Turnover</label>
                                    <VyteDropdown<'7' | '14' | '21' | '30' | '60'>
                                        variant="light"
                                        size="sm"
                                        value={defaultTurnoverTarget}
                                        onChange={(val: '7' | '14' | '21' | '30' | '60') => setDefaultTurnoverTarget(val)}
                                        options={[
                                            { label: '7 Days (Fast FMCG)', value: '7' },
                                            { label: '14 Days (Retail Regular)', value: '14' },
                                            { label: '21 Days (Vyte Optimal)', value: '21' },
                                            { label: '30 Days (Standard)', value: '30' },
                                            { label: '60 Days (Slow B2B)', value: '60' },
                                        ]}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 pt-2">
                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5">
                                        <Volume2 className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-800">Audible Stock Alert</p>
                                            <p className="text-[11px] text-slate-500">Play alert chime when inventory hits min threshold</p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={audioAlerts}
                                        onChange={(e) => setAudioAlerts(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5">
                                        <Box className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-800">Auto-Draft Purchase Orders</p>
                                            <p className="text-[11px] text-slate-500">Prepare PO in queue immediately upon low stock trigger</p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={autoDraftPo}
                                        onChange={(e) => setAutoDraftPo(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5">
                                        <FileText className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-800">Automated WhatsApp PO Dispatch</p>
                                            <p className="text-[11px] text-slate-500">Send supplier POs upon authorized human approval</p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={whatsappAutoAlerts}
                                        onChange={(e) => setWhatsappAutoAlerts(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5">
                                        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-800">Enforce Strict RBAC Permissions</p>
                                            <p className="text-[11px] text-slate-500">Lock approvals and PO releases to Owner and Manager</p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={strictRbacLock}
                                        onChange={(e) => setStrictRbacLock(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>

                                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                                    <div className="flex items-center gap-2.5">
                                        <FileCode className="w-4 h-4 text-emerald-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-800">LHDN MyInvois 2.0 Compliance</p>
                                            <p className="text-[11px] text-slate-500">Enable validation schemas for Malaysian e-invoices</p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={eInvoiceCompliance}
                                        onChange={(e) => setEInvoiceCompliance(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>
                            </div>
                        </div>

                        <div className="flex justify-end pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={handleSaveSettings}
                                className="px-5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
                            >
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};