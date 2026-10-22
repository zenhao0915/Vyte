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
    ChevronRight,
} from 'lucide-react';
import type { ActiveTab, UserSession } from '../../types/vyte.ts';

interface HeaderBarProps {
    activeTab: ActiveTab;
    inventorySubTab?: 'restock' | 'orders';
    userSession: UserSession | null;
    totalSkus: number;
    pendingRestocks: number;
    pendingOrders: number;
    pendingQcBatches: number;
    totalInvoices: number;
    pendingInvoices: number;
    onNavigateFromNotification: (
        tab: ActiveTab,
        subTab?: 'restock' | 'orders'
    ) => void;
}

/** @Composable */
export const HeaderBar: React.FC<HeaderBarProps> = ({
                                                        activeTab,
                                                        inventorySubTab = 'restock',
                                                        userSession,
                                                        totalSkus,
                                                        pendingRestocks,
                                                        pendingOrders,
                                                        pendingQcBatches,
                                                        totalInvoices,
                                                        pendingInvoices,
                                                        onNavigateFromNotification,
                                                    }) => {
    const [isBellOpen, setIsBellOpen] = useState(false);
    const bellRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setIsBellOpen(false);
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsBellOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, []);

    const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
        mod1:
            inventorySubTab === 'orders'
                ? {
                    title: 'Order Status & AI Depletion Auto-Ordering',
                    subtitle:
                        'Depletion-driven supplier order queue & NLP customer order verification awaiting human intervention.',
                }
                : {
                    title: 'Auto Restock & Universal Inventory',
                    subtitle:
                        'Real-time threshold monitoring, supplier PO drafting & approval.',
                },
        mod2: {
            title: 'Sales Analytics & AI Procurement Review',
            subtitle:
                'Quarterly revenue reports, holding cost optimization & AI restock forecasting.',
        },
        mod3: {
            title: 'Order Status & AI Depletion Auto-Ordering',
            subtitle:
                'Depletion-driven supplier order queue & NLP customer order verification awaiting human intervention.',
        },
        mod4: {
            title: 'Quality & Expiry Guardian',
            subtitle:
                'Proactive perishable shelf-life tracking, batch quarantine & promotional loss mitigation.',
        },
        mod5: {
            title: 'Smart Invoices & AI Categorization',
            subtitle:
                'Automated supplier payable & customer receivable classification with human verification.',
        },
        logs: {
            title: 'History Log',
            subtitle: 'Centralized system-wide audit trail across all modules and role permissions.',
        },
    };

    const totalActionableAlerts =
        pendingRestocks + pendingOrders + pendingQcBatches + pendingInvoices;

    const notificationItems = [
        {
            id: 'notif-skus',
            label: 'Active Universal SKUs',
            value: `${totalSkus} Items`,
            subtext: 'F&B, Retail & B2B Ready',
            subtextColor: 'text-emerald-600 font-semibold',
            valueColor: 'text-slate-900',
            iconBg: 'bg-blue-500',
            icon: Layers,
            onClick: () => onNavigateFromNotification('mod1', 'restock'),
        },
        {
            id: 'notif-restock',
            label: 'Auto-Restock Triggers',
            value: `${pendingRestocks} Pending`,
            subtext: 'Awaiting Owner Approval',
            subtextColor: 'text-slate-400',
            valueColor: 'text-orange-600',
            iconBg: 'bg-orange-500',
            icon: RefreshCw,
            onClick: () => onNavigateFromNotification('mod1', 'restock'),
        },
        {
            id: 'notif-orders',
            label: 'Customer Orders (NLP)',
            value: `${pendingOrders} Pending`,
            subtext: 'Open Order Screen',
            subtextColor: 'text-purple-600 font-semibold',
            valueColor: 'text-purple-700',
            iconBg: 'bg-purple-600',
            icon: MessageSquare,
            onClick: () => onNavigateFromNotification('mod1', 'orders'),
        },
        {
            id: 'notif-qc',
            label: 'Quality / Expiry Risks',
            value: `${pendingQcBatches} Batches`,
            subtext: 'RM 762 loss preventable',
            subtextColor: 'text-emerald-600 font-semibold',
            valueColor: 'text-purple-600',
            iconBg: 'bg-rose-500',
            icon: AlertTriangle,
            onClick: () => onNavigateFromNotification('mod4'),
        },
        {
            id: 'notif-invoices',
            label: 'AI Categorized Invoices',
            value: `${totalInvoices} Docs`,
            subtext: `${pendingInvoices} Pending Review`,
            subtextColor: 'text-slate-400',
            valueColor: 'text-emerald-600',
            iconBg: 'bg-emerald-500',
            icon: FileText,
            onClick: () => onNavigateFromNotification('mod5'),
        },
    ];

    return (
        <header className="bg-white border border-slate-200/90 rounded-2xl px-6 py-3.5 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs z-30">
            <div>
                <h2 className="text-lg font-bold text-slate-900">
                    {titles[activeTab].title}
                </h2>
                <p className="text-xs text-slate-500">{titles[activeTab].subtitle}</p>
            </div>

            <div className="flex items-center gap-3.5">
                {/* User & Company Badge */}
                {userSession && (
                    <div className="text-right">
                        <p className="text-xs font-bold text-slate-800 leading-none">
                            {userSession.userName}{' '}
                            <span className="text-[10px] font-mono text-emerald-600">
                                ({userSession.userID})
                            </span>
                        </p>
                        <p className="text-[11px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                            <Building2 className="w-3 h-3" /> {userSession.companyName}
                        </p>
                    </div>
                )}

                {/* Notification Bell on the Far Right of HeaderBar */}
                <div ref={bellRef} className="relative pl-3 border-l border-slate-200">
                    <button
                        type="button"
                        onClick={() => setIsBellOpen((prev) => !prev)}
                        title="Workspace Notifications & Live KPIs"
                        className={`relative p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                            isBellOpen
                                ? 'bg-emerald-50 border-[#2BB656] text-emerald-700 shadow-2xs'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                    >
                        <Bell className="w-4 h-4" />
                        {totalActionableAlerts > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center shadow-2xs">
                                {totalActionableAlerts}
                            </span>
                        )}
                    </button>

                    {/* 60% Smaller Compact Notification Dropdown */}
                    {isBellOpen && (
                        <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 select-none">
                            <div className="px-3 py-2 bg-slate-900 text-white flex items-center justify-between">
                                <div>
                                    <h4 className="text-[10px] font-bold leading-tight">
                                        Live Status &amp; Alerts
                                    </h4>
                                    <p className="text-[9px] text-slate-400">
                                        Click to jump to screen
                                    </p>
                                </div>
                                <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                                    {totalActionableAlerts} Actionable
                                </span>
                            </div>

                            <div className="p-1.5 space-y-1 max-h-72 overflow-y-auto">
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
                                            className="w-full text-left bg-white hover:bg-slate-50 active:scale-[0.99] px-2.5 py-1.5 rounded-lg border border-slate-200/80 hover:border-emerald-300 flex items-center justify-between gap-2 transition cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div
                                                    className={`w-6 h-6 rounded-md ${item.iconBg} text-white flex items-center justify-center shrink-0`}
                                                >
                                                    <Icon className="w-3 h-3" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-baseline gap-1.5">
                                                        <span
                                                            className={`text-xs font-extrabold leading-none ${item.valueColor}`}
                                                        >
                                                            {item.value}
                                                        </span>
                                                        <span className="text-[10px] text-slate-500 font-medium truncate">
                                                            {item.label}
                                                        </span>
                                                    </div>
                                                    <span
                                                        className={`text-[9px] block truncate leading-tight mt-0.5 ${item.subtextColor}`}
                                                    >
                                                        {item.subtext}
                                                    </span>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3 h-3 text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition shrink-0" />
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