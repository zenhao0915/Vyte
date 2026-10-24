// src/components/layout/Sidebar.tsx
import React, { useEffect, useState } from 'react';
import {
    AlertTriangle,
    Box,
    Bug,
    ChevronLeft,
    ChevronRight,
    Clock,
    Compass,
    Database,
    FileCode,
    FileText,
    Headset,
    LogOut,
    Search,
    Server,
    Settings,
    ShieldCheck,
    Sliders,
    TrendingUp,
    Volume2,
    X,
} from 'lucide-react';
import type { ActiveTab, CurrencyCode, UserRole, UserSession } from '../../types/vyte.ts';
import { VyteLogo } from '../common/VyteLogo';
import { VyteDropdown } from '../common/VyteDropdown';
import { getApiBaseUrl, setApiBaseUrl, orbyteApi } from '../../services/api';

interface SidebarProps {
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    role: UserRole;
    operatingCurrency: CurrencyCode;
    onCurrencyChange: (currency: CurrencyCode) => void;
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    pendingRestockCount: number;
    pendingOrderCount: number;
    pendingQcCount: number;
    pendingInvoiceCount: number;
    pendingComplianceCount: number;
    auditLogCount: number;
    userSession: UserSession | null;
    onLogout: () => void;
    debugMockMode?: boolean;
    onToggleDebugMockMode?: (enabled: boolean) => void;
    onOpenMigratorModal?: () => void;
    onOpenSupportModal?: () => void;
    onStartTutorial?: () => void;
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
                                                    pendingComplianceCount,
                                                    auditLogCount,
                                                    userSession,
                                                    onLogout,
                                                    debugMockMode = false,
                                                    onToggleDebugMockMode,
                                                    onOpenMigratorModal,
                                                    onOpenSupportModal,
                                                    onStartTutorial,
                                                }) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [showSettingsModal, setShowSettingsModal] = useState(false);
    const [tempCurrency, setTempCurrency] = useState<CurrencyCode>(operatingCurrency);
    const [defaultTurnoverTarget, setDefaultTurnoverTarget] = useState<
        '7' | '14' | '21' | '30' | '60'
    >('21');
    const [tempDebugMode, setTempDebugMode] = useState(debugMockMode);
    const [tempServerUrl, setTempServerUrl] = useState(getApiBaseUrl);
    const [prefs, setPrefs] = useState({
        audio: true,
        autoPo: true,
        wa: true,
        rbac: true,
        einv: true,
    });

    useEffect(() => {
        setTempCurrency(operatingCurrency);
        setTempDebugMode(debugMockMode);
        setTempServerUrl(getApiBaseUrl());
    }, [operatingCurrency, debugMockMode, showSettingsModal]);

    const handleSaveSettings = () => {
        setApiBaseUrl(tempServerUrl);
        if (onToggleDebugMockMode && tempDebugMode !== debugMockMode) {
            onToggleDebugMockMode(tempDebugMode);
        }
        onCurrencyChange(tempCurrency);
        setShowSettingsModal(false);
    };

    // 核心：调用后端登出接口，并彻底清除本地存储
    const handleLogout = async () => {
        try {
            if (orbyteApi?.logout) {
                await orbyteApi.logout();
            } else {
                await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        } finally {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('vyte_jwt');
            localStorage.removeItem('vyte_session');
            localStorage.removeItem('vyte_workspace_id');
            localStorage.removeItem('active_workspace_id');
            localStorage.removeItem('user_session');
            localStorage.removeItem('user');
            onLogout();
        }
    };

    const roleBadge = {
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
    }[role];

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
            id: 'mod6' as ActiveTab,
            label: 'License & Compliance',
            icon: ShieldCheck,
            iconColor: 'text-teal-600',
            badge: String(pendingComplianceCount),
            badgeClass: 'bg-teal-100 text-teal-800',
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

    const toggleItems = [
        {
            key: 'audio' as const,
            icon: Volume2,
            title: 'Audible Stock Alert',
            desc: 'Play alert chime when inventory hits min threshold',
        },
        {
            key: 'autoPo' as const,
            icon: Box,
            title: 'Auto-Draft Purchase Orders',
            desc: 'Prepare PO in queue immediately upon low stock trigger',
        },
        {
            key: 'wa' as const,
            icon: FileText,
            title: 'Automated WhatsApp PO Dispatch',
            desc: 'Send supplier POs upon authorized human approval',
        },
        {
            key: 'rbac' as const,
            icon: ShieldCheck,
            title: 'Enforce Strict RBAC Permissions',
            desc: 'Lock approvals and PO releases to Owner and Manager',
        },
        {
            key: 'einv' as const,
            icon: FileCode,
            title: 'E-Invoicing Validation',
            desc: 'Enable validation schemas for digital invoices',
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
                    {isCollapsed ? (
                        <ChevronRight className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronLeft className="w-3.5 h-3.5" />
                    )}
                </button>

                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
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

                    <nav data-tour="sidebar-nav" className="px-3 space-y-1.5">
                        {!isCollapsed && (
                            <p className="px-3 pt-1 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                CORE MODULES
                            </p>
                        )}
                        {coreModules.map((mod) => {
                            const Icon = mod.icon;
                            const isActive =
                                activeTab === mod.id || (mod.id === 'mod1' && activeTab === 'mod3');
                            return (
                                <button
                                    key={mod.id}
                                    type="button"
                                    onClick={() => setActiveTab(mod.id)}
                                    title={isCollapsed ? mod.label : undefined}
                                    className={`w-full flex items-center ${
                                        isCollapsed
                                            ? 'justify-center px-2 py-3'
                                            : 'justify-between px-3 py-2.5'
                                    } rounded-xl text-xs transition-all cursor-pointer border ${
                                        isActive
                                            ? 'bg-[#EBFDF2] border-[#A7F3D0] text-emerald-950 font-bold shadow-[0_1px_2px_rgba(16,185,129,0.06)]'
                                            : 'border-transparent text-slate-700 font-medium hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="flex items-center gap-2.5 min-w-0">
                                        <Icon className={`w-4 h-4 shrink-0 ${mod.iconColor}`} />
                                        {!isCollapsed && (
                                            <span
                                                className={`truncate whitespace-nowrap ${
                                                    mod.id === 'mod6'
                                                        ? 'text-[11px] tracking-tight'
                                                        : 'text-xs'
                                                }`}
                                            >
                                                {mod.label}
                                            </span>
                                        )}
                                    </span>
                                    {!isCollapsed && (
                                        <span
                                            className={`text-[11px] px-2 py-0.5 rounded-full font-bold shrink-0 ml-1 ${mod.badgeClass}`}
                                        >
                                            {mod.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}

                        {!isCollapsed && (
                            <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                TOOLS &amp; SUPPORT
                            </p>
                        )}
                        {onOpenMigratorModal && (
                            <button
                                type="button"
                                onClick={onOpenMigratorModal}
                                title={isCollapsed ? 'Data Import Tool' : undefined}
                                className={`w-full flex items-center ${
                                    isCollapsed
                                        ? 'justify-center px-2 py-2.5'
                                        : 'justify-between px-3 py-2'
                                } rounded-xl text-xs transition-all cursor-pointer border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-950 font-bold`}
                            >
                                <span className="flex items-center gap-2.5 min-w-0">
                                    <Database className="w-4 h-4 shrink-0 text-emerald-600" />
                                    {!isCollapsed && <span className="truncate">Data Import Tool</span>}
                                </span>
                                {!isCollapsed && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-200 text-emerald-800">
                                        AI
                                    </span>
                                )}
                            </button>
                        )}

                        {onOpenSupportModal && (
                            <button
                                type="button"
                                onClick={onOpenSupportModal}
                                title={isCollapsed ? 'After-Sales Support' : undefined}
                                className={`w-full flex items-center ${
                                    isCollapsed
                                        ? 'justify-center px-2 py-2.5'
                                        : 'justify-between px-3 py-2'
                                } rounded-xl text-xs transition-all cursor-pointer border border-blue-200 bg-blue-50/80 hover:bg-blue-100 text-blue-950 font-bold`}
                            >
                                <span className="flex items-center gap-2.5 min-w-0">
                                    <Headset className="w-4 h-4 shrink-0 text-blue-600" />
                                    {!isCollapsed && (
                                        <span className="truncate">After-Sales Support</span>
                                    )}
                                </span>
                                {!isCollapsed && (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-200 text-blue-800">
                                        24/7
                                    </span>
                                )}
                            </button>
                        )}
                    </nav>
                </div>

                <div className="p-3 border-t border-slate-100 space-y-2 shrink-0">
                    <div
                        title={roleBadge.label}
                        className={`w-full rounded-xl border text-[11px] font-bold flex items-center ${
                            isCollapsed
                                ? 'justify-center py-2 px-1'
                                : 'justify-center gap-1.5 px-3 py-2'
                        } ${roleBadge.style}`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                        {!isCollapsed && <span className="truncate">{roleBadge.label}</span>}
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
                                onClick={handleLogout}
                                title="Log Out"
                                className="w-full py-2.5 rounded-xl bg-rose-50/70 hover:bg-rose-100 text-rose-600 border border-rose-200/70 flex items-center justify-center transition cursor-pointer"
                            >
                                <LogOut className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div data-tour="sidebar-settings" className="grid grid-cols-2 gap-2">
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
                                onClick={handleLogout}
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
                                    <h3 className="text-base font-bold text-slate-900">
                                        Workspace Settings
                                    </h3>
                                    <p className="text-xs text-slate-500">
                                        System configurations &amp; operational preferences
                                    </p>
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
                                <p className="text-[11px] font-bold uppercase text-slate-400">
                                    Authenticated Session
                                </p>
                                <p className="font-bold text-slate-900">
                                    {userSession?.userName || 'Vyte Operator'} (
                                    {userSession?.userID || 'M067'})
                                </p>
                                <p className="text-slate-600">{userSession?.companyName}</p>
                                <p className="text-emerald-700 font-semibold">
                                    Role: {userSession?.userType} ({userSession?.role})
                                </p>
                            </div>
                            {onStartTutorial && (
                                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="w-8 h-8 rounded-lg bg-[#2BB656]/20 text-emerald-700 flex items-center justify-center shrink-0">
                                            <Compass className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">
                                                Interactive Workspace Tutorial
                                            </p>
                                            <p className="text-[11px] text-slate-600">
                                                Step-by-step guided tour with spotlight highlights across all modules
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowSettingsModal(false);
                                            onStartTutorial();
                                        }}
                                        className="px-3.5 py-2 rounded-xl bg-[#2BB656] hover:bg-emerald-600 text-white font-bold text-xs shrink-0 transition cursor-pointer shadow-2xs"
                                    >
                                        Launch Tutorial
                                    </button>
                                </div>
                            )}

                            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <div className="flex items-center gap-2.5">
                                        <Bug className="w-4 h-4 text-amber-600 shrink-0" />
                                        <div>
                                            <p className="font-bold text-slate-900">
                                                Debug Mode (Use Local Mock Data)
                                            </p>
                                            <p className="text-[11px] text-slate-600">
                                                When enabled, uses the built-in mock dataset
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={tempDebugMode}
                                        onChange={(e) => setTempDebugMode(e.target.checked)}
                                        className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                    />
                                </label>
                                {!tempDebugMode && (
                                    <div className="pt-1 border-t border-amber-200/70 flex items-center gap-2">
                                        <Server className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                        <input
                                            type="text"
                                            value={tempServerUrl}
                                            onChange={(e) => setTempServerUrl(e.target.value)}
                                            placeholder="http://localhost:8080"
                                            className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-mono text-slate-800 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-1">
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">
                                        Operating Currency
                                    </label>
                                    <VyteDropdown<CurrencyCode>
                                        variant="light"
                                        size="sm"
                                        value={tempCurrency}
                                        onChange={setTempCurrency}
                                        options={[
                                            { label: 'MYR (RM) - Malaysia', value: 'MYR' },
                                            { label: 'SGD (S$) - Singapore', value: 'SGD' },
                                            { label: 'USD ($) - International', value: 'USD' },
                                            { label: 'RMB (¥) - China', value: 'RMB' },
                                        ]}
                                    />
                                </div>

                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">
                                        Default AI Turnover
                                    </label>
                                    <VyteDropdown<'7' | '14' | '21' | '30' | '60'>
                                        variant="light"
                                        size="sm"
                                        value={defaultTurnoverTarget}
                                        onChange={setDefaultTurnoverTarget}
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
                                {toggleItems.map(({ key, icon: Icon, title, desc }) => (
                                    <label
                                        key={key}
                                        className="flex items-center justify-between p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50"
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <Icon className="w-4 h-4 text-emerald-600 shrink-0" />
                                            <div>
                                                <p className="font-bold text-slate-800">{title}</p>
                                                <p className="text-[11px] text-slate-500">{desc}</p>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={prefs[key]}
                                            onChange={(e) =>
                                                setPrefs((p) => ({ ...p, [key]: e.target.checked }))
                                            }
                                            className="w-4 h-4 accent-[#2BB656] cursor-pointer"
                                        />
                                    </label>
                                ))}
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