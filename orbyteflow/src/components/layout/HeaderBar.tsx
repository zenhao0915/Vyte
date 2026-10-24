// src/components/layout/HeaderBar.tsx
import React, { useState, useRef, useEffect } from 'react';
import {
    Building2,
    Bell,
    Layers,
    RefreshCw,
    MessageSquare,
    AlertTriangle,
    FileText,
    ShieldCheck,
    ChevronRight,
    Globe,
    CheckCheck,
} from 'lucide-react';
import type { ActiveTab, CurrencyCode, UserSession } from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';

interface HeaderBarProps {
    activeTab: ActiveTab;
    inventorySubTab?: 'restock' | 'orders';
    userSession: UserSession | null;
    currency?: CurrencyCode;
    exchangeRate?: number;
    rateSourceLabel?: string;
    onRefreshRates?: () => void;
    totalSkus: number;
    pendingRestocks: number;
    pendingOrders: number;
    pendingQcBatches: number;
    totalInvoices: number;
    pendingInvoices: number;
    totalComplianceProfiles?: number;
    pendingCompliance?: number;
    onNavigateFromNotification: (tab: ActiveTab, subTab?: 'restock' | 'orders') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
                                                        activeTab,
                                                        inventorySubTab = 'restock',
                                                        userSession,
                                                        currency = 'MYR',
                                                        exchangeRate = 1.0,
                                                        rateSourceLabel = 'Live FX Rate',
                                                        onRefreshRates,
                                                        totalSkus,
                                                        pendingRestocks,
                                                        pendingOrders,
                                                        pendingQcBatches,
                                                        totalInvoices,
                                                        pendingInvoices,
                                                        totalComplianceProfiles = 0,
                                                        pendingCompliance = 0,
                                                        onNavigateFromNotification,
                                                    }) => {
    const [isBellOpen, setIsBellOpen] = useState(false);
    const [acknowledgedCount, setAcknowledgedCount] = useState(0);
    const bellRef = useRef<HTMLDivElement>(null);
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';

    const totalAlerts = pendingRestocks + pendingOrders + pendingQcBatches + pendingInvoices + pendingCompliance;

    // Keep acknowledgedCount clamped so resolving alerts doesn't mask future incoming alerts
    useEffect(() => {
        setAcknowledgedCount((prev) => Math.min(prev, totalAlerts));
    }, [totalAlerts]);

    useEffect(() => {
        const onOut = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) setIsBellOpen(false);
        };
        const onEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsBellOpen(false);
        };
        document.addEventListener('mousedown', onOut);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onOut);
            document.removeEventListener('keydown', onEsc);
        };
    }, []);

    const titles: Record<ActiveTab, string> = {
        mod1: inventorySubTab === 'orders' ? 'Customer Orders & Fulfillment' : 'Inventory & Supplier Restock',
        mod2: 'Sales Review & Procurement Forecast',
        mod3: 'Customer Orders & Fulfillment',
        mod4: 'Batch Quality & Expiry Control',
        mod5: 'Invoices & Accounts Payable / Receivable',
        mod6: 'Business License & Compliance',
        logs: 'Activity & Audit Log',
    };

    const unreadBadgeCount = Math.max(0, totalAlerts - acknowledgedCount);

    const notificationItems = [
        { id: 'notif-restock', label: 'Restock Triggers', value: `${pendingRestocks} Pending`, subtext: 'Low stock awaiting PO approval', valueColor: 'text-amber-600', iconBg: 'bg-amber-500', icon: RefreshCw, onClick: () => onNavigateFromNotification('mod1', 'restock') },
        { id: 'notif-orders', label: 'Customer Orders', value: `${pendingOrders} Pending`, subtext: 'Orders awaiting review', valueColor: 'text-purple-700', iconBg: 'bg-purple-600', icon: MessageSquare, onClick: () => onNavigateFromNotification('mod1', 'orders') },
        { id: 'notif-qc', label: 'Expiry & Quality Risks', value: `${pendingQcBatches} Batches`, subtext: 'Perishable batches at risk', valueColor: 'text-rose-600', iconBg: 'bg-rose-500', icon: AlertTriangle, onClick: () => onNavigateFromNotification('mod4') },
        { id: 'notif-invoices', label: 'Pending Invoices', value: `${pendingInvoices} Review`, subtext: `${totalInvoices} total invoices stored`, valueColor: 'text-emerald-600', iconBg: 'bg-emerald-500', icon: FileText, onClick: () => onNavigateFromNotification('mod5') },
        { id: 'notif-compliance', label: 'License Renewals', value: `${pendingCompliance} Alerts`, subtext: `${totalComplianceProfiles} entities monitored`, valueColor: 'text-teal-700', iconBg: 'bg-teal-600', icon: ShieldCheck, onClick: () => onNavigateFromNotification('mod6') },
        { id: 'notif-skus', label: 'Active Catalog', value: `${totalSkus} SKUs`, subtext: 'All inventory items', valueColor: 'text-slate-900', iconBg: 'bg-slate-700', icon: Layers, onClick: () => onNavigateFromNotification('mod1', 'restock') },
    ];

    return (
        <header className="bg-white border border-slate-200/90 rounded-2xl px-5 py-2.5 flex items-center justify-between gap-4 shrink-0 shadow-2xs z-30">
            <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">{titles[activeTab]}</h2>
                {pendingRestocks > 0 && activeTab === 'mod1' && inventorySubTab === 'restock' && (
                    <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                        {pendingRestocks} low-stock SKU{pendingRestocks > 1 ? 's' : ''} need approval
                    </span>
                )}
            </div>

            <div data-tour="header-controls" className="flex items-center gap-3 shrink-0">
                <button
                    type="button"
                    onClick={onRefreshRates}
                    title={`${rateSourceLabel} (Click to refresh)`}
                    className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
                >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                        {currency} ({currencySymbol})
                    </span>
                    {currency !== 'MYR' && <span className="text-slate-400 font-normal">{exchangeRate.toFixed(2)}</span>}
                </button>

                {userSession && (
                    <div className="text-right hidden sm:block">
                        <p className="text-xs font-semibold text-slate-800 leading-none">{userSession.userName}</p>
                        <p className="text-[11px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" /> {userSession.companyName}
                        </p>
                    </div>
                )}

                <div ref={bellRef} className="relative pl-2.5 border-l border-slate-200">
                    <button
                        type="button"
                        onClick={() => setIsBellOpen((p) => !p)}
                        title="Actionable Alerts"
                        className={`relative p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                            isBellOpen ? 'bg-emerald-50 border-[#2BB656] text-emerald-700' : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                    >
                        <Bell className="w-4 h-4" />
                        {unreadBadgeCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                {unreadBadgeCount}
                            </span>
                        )}
                    </button>

                    {isBellOpen && (
                        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 select-none">
                            <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between">
                                <span className="text-xs font-semibold">Action Center ({unreadBadgeCount})</span>
                                <button
                                    type="button"
                                    onClick={() => setAcknowledgedCount(totalAlerts)}
                                    className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-emerald-300 text-[10px] font-medium flex items-center gap-1 cursor-pointer transition"
                                >
                                    <CheckCheck className="w-3 h-3" /> Mark Read
                                </button>
                            </div>
                            <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
                                {notificationItems.map((item) => {
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            type="button"
                                            onClick={() => {
                                                item.onClick();
                                                setIsBellOpen(false);
                                            }}
                                            className="w-full text-left bg-white hover:bg-slate-50 px-2.5 py-2 rounded-lg border border-transparent hover:border-slate-200 flex items-center justify-between gap-2 transition cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className={`w-7 h-7 rounded-lg ${item.iconBg} text-white flex items-center justify-center shrink-0`}>
                                                    <Icon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span className={`text-xs font-bold leading-none ${item.valueColor}`}>{item.value}</span>
                                                        <span className="text-xs text-slate-700 font-medium truncate">{item.label}</span>
                                                    </div>
                                                    <span className="text-[11px] text-slate-400 block truncate mt-0.5">{item.subtext}</span>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-600 transition shrink-0" />
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};