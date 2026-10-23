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
    FolderLock,
    Bot,
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
    totalVaultDocs?: number;
    totalRenewalTasks?: number;
    onNavigateFromNotification: (tab: ActiveTab, subTab?: 'restock' | 'orders') => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
                                                        activeTab,
                                                        inventorySubTab = 'restock',
                                                        userSession,
                                                        currency = 'MYR',
                                                        exchangeRate = 1.0,
                                                        rateSourceLabel = 'Live FX Rate Active',
                                                        onRefreshRates,
                                                        totalSkus,
                                                        pendingRestocks,
                                                        pendingOrders,
                                                        pendingQcBatches,
                                                        totalInvoices,
                                                        pendingInvoices,
                                                        totalComplianceProfiles = 4,
                                                        pendingCompliance = 3,
                                                        totalVaultDocs = 4,
                                                        totalRenewalTasks = 1,
                                                        onNavigateFromNotification,
                                                    }) => {
    const [isBellOpen, setIsBellOpen] = useState(false);
    const [acknowledgedCount, setAcknowledgedCount] = useState(0);
    const bellRef = useRef<HTMLDivElement>(null);
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';

    useEffect(() => {
        const onOut = (e: MouseEvent) => {
            if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
                setIsBellOpen(false);
            }
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

    const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
        mod1:
            inventorySubTab === 'orders'
                ? {
                    title: 'Order Status & NLP Customer Fulfillment',
                    subtitle: 'NLP customer order verification & live inventory reservation',
                }
                : {
                    title: 'Auto Restock & Universal Inventory',
                    subtitle: 'Threshold monitoring, spreadsheet import & supplier PO approval',
                },
        mod2: {
            title: 'Sales Analytics & AI Procurement Review',
            subtitle: 'Holding cost optimization & AI restock forecasting',
        },
        mod3: {
            title: 'Order Status & NLP Customer Fulfillment',
            subtitle: 'NLP customer order verification & live inventory reservation',
        },
        mod4: {
            title: 'Quality & Expiry Guardian (Orbyte HR Integrated)',
            subtitle: 'Batch expiry table, click-in AI SOPs & Orbyte HR staff task dispatch',
        },
        mod5: {
            title: 'Smart Invoices & AI Categorization',
            subtitle: 'Photo OCR / Excel upload, supplier bills & customer receivable verification',
        },
        mod6: {
            title: 'Business License & Compliance Renewal',
            subtitle: 'Real-time SSM lookup, centralized document vault & concierge/RPA PBT renewal filing',
        },
        logs: {
            title: 'History Log',
            subtitle: 'Centralized immutable audit trail across all modules and role permissions',
        },
    };

    const totalAlerts =
        pendingRestocks +
        pendingOrders +
        pendingQcBatches +
        pendingInvoices +
        pendingCompliance;
    const unreadBadgeCount = Math.max(0, totalAlerts - acknowledgedCount);

    const notificationItems = [
        {
            id: 'notif-skus',
            label: 'Catalog SKUs',
            value: `${totalSkus} Items`,
            subtext: 'F&B, Retail & B2B active',
            subtextColor: 'text-emerald-600 font-semibold',
            valueColor: 'text-slate-900',
            iconBg: 'bg-blue-500',
            icon: Layers,
            onClick: () => onNavigateFromNotification('mod1', 'restock'),
        },
        {
            id: 'notif-restock',
            label: 'Restock Triggers',
            value: `${pendingRestocks} Pending`,
            subtext: 'Awaiting PO approval',
            subtextColor: 'text-amber-700 font-semibold',
            valueColor: 'text-orange-600',
            iconBg: 'bg-orange-500',
            icon: RefreshCw,
            onClick: () => onNavigateFromNotification('mod1', 'restock'),
        },
        {
            id: 'notif-orders',
            label: 'Customer Orders',
            value: `${pendingOrders} Pending`,
            subtext: 'Open order queue',
            subtextColor: 'text-purple-600 font-semibold',
            valueColor: 'text-purple-700',
            iconBg: 'bg-purple-600',
            icon: MessageSquare,
            onClick: () => onNavigateFromNotification('mod1', 'orders'),
        },
        {
            id: 'notif-qc',
            label: 'Quality & Expiry Risks',
            value: `${pendingQcBatches} Batches`,
            subtext: `${currencySymbol} ${(762 * exchangeRate).toFixed(0)} at-risk stock`,
            subtextColor: 'text-rose-600 font-semibold',
            valueColor: 'text-rose-600',
            iconBg: 'bg-rose-500',
            icon: AlertTriangle,
            onClick: () => onNavigateFromNotification('mod4'),
        },
        {
            id: 'notif-invoices',
            label: 'Invoices & Bills',
            value: `${totalInvoices} Docs`,
            subtext: `${pendingInvoices} pending verification`,
            subtextColor: 'text-emerald-700 font-semibold',
            valueColor: 'text-emerald-600',
            iconBg: 'bg-emerald-500',
            icon: FileText,
            onClick: () => onNavigateFromNotification('mod5'),
        },
        {
            id: 'notif-compliance',
            label: 'License & Compliance',
            value: `${pendingCompliance} Alerts`,
            subtext: `${totalComplianceProfiles} SSM & PBT profiles monitored`,
            subtextColor: 'text-teal-700 font-semibold',
            valueColor: 'text-teal-700',
            iconBg: 'bg-teal-600',
            icon: ShieldCheck,
            onClick: () => onNavigateFromNotification('mod6'),
        },
    ];

    return (
        <header className="bg-white border border-slate-200/90 rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs z-30">
            {/* Left: Title & Subtitle */}
            <div className="min-w-0">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                    {titles[activeTab].title}
                </h2>
                <p className="text-[11px] text-slate-500 truncate">
                    {titles[activeTab].subtitle}
                </p>
            </div>

            {/* Center (Between Title and Currency Icon): Minimized Compliance KPI Strip */}
            {activeTab === 'mod6' && (
                <div className="hidden xl:flex items-center gap-2 mx-auto px-2.5 py-1.5 rounded-xl bg-slate-50/90 border border-slate-200/80">
                    <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
                        <div className="w-6 h-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5" />
                        </div>
                        <div className="leading-tight">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">
                SSM &amp; PBT
              </span>
                            <span className="text-xs font-extrabold text-slate-900 whitespace-nowrap">
                {totalComplianceProfiles} Entities
              </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
                        <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5" />
                        </div>
                        <div className="leading-tight">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">
                Expiring
              </span>
                            <span className="text-xs font-extrabold text-amber-600 whitespace-nowrap">
                {pendingCompliance} Licenses
              </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pr-2.5 border-r border-slate-200">
                        <div className="w-6 h-6 rounded-lg bg-purple-600 text-white flex items-center justify-center shrink-0">
                            <FolderLock className="w-3.5 h-3.5" />
                        </div>
                        <div className="leading-tight">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">
                Doc Vault
              </span>
                            <span className="text-xs font-extrabold text-purple-700 whitespace-nowrap">
                {totalVaultDocs} Indexed
              </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center shrink-0">
                            <Bot className="w-3.5 h-3.5" />
                        </div>
                        <div className="leading-tight">
              <span className="text-[9px] text-slate-400 font-bold uppercase block">
                Concierge / RPA
              </span>
                            <span className="text-xs font-extrabold text-blue-700 whitespace-nowrap">
                {totalRenewalTasks} Tasks
              </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Right: Currency Pill, User Profile & Notification Bell */}
            <div className="flex items-center gap-3 shrink-0">
                <button
                    type="button"
                    onClick={onRefreshRates}
                    title={`${rateSourceLabel} (Click to refresh live FX rate)`}
                    className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50/90 hover:bg-emerald-100 border border-emerald-200 text-[11px] font-bold text-emerald-800 transition cursor-pointer"
                >
                    <Globe className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
            {currency} ({currencySymbol})
                        {currency !== 'MYR'
                            ? ` • 1 RM = ${exchangeRate.toFixed(3)} ${currency}`
                            : ' • Base Currency'}
          </span>
                </button>

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

                <div ref={bellRef} className="relative pl-3 border-l border-slate-200">
                    <button
                        type="button"
                        onClick={() => setIsBellOpen((p) => !p)}
                        title="Workspace Alerts & Live KPIs"
                        className={`relative p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                            isBellOpen
                                ? 'bg-emerald-50 border-[#2BB656] text-emerald-700 shadow-2xs'
                                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
                        }`}
                    >
                        <Bell className="w-4 h-4" />
                        {unreadBadgeCount > 0 && (
                            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-extrabold flex items-center justify-center shadow-2xs">
                {unreadBadgeCount}
              </span>
                        )}
                    </button>

                    {isBellOpen && (
                        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden z-50 select-none">
                            <div className="px-3.5 py-2.5 bg-slate-900 text-white flex items-center justify-between">
                                <div>
                                    <h4 className="text-[11px] font-bold leading-tight">Workspace Alerts</h4>
                                    <p className="text-[9px] text-slate-400">Select an item to view details</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setAcknowledgedCount(totalAlerts)}
                                    className="px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold flex items-center gap-1 cursor-pointer transition"
                                >
                                    <CheckCheck className="w-3 h-3" /> Mark Read
                                </button>
                            </div>
                            <div className="p-2 space-y-1.5 max-h-80 overflow-y-auto">
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
                                            className="w-full text-left bg-white hover:bg-slate-50 active:scale-[0.99] px-2.5 py-2 rounded-lg border border-slate-200/80 hover:border-emerald-300 flex items-center justify-between gap-2 transition cursor-pointer group"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div
                                                    className={`w-7 h-7 rounded-lg ${item.iconBg} text-white flex items-center justify-center shrink-0`}
                                                >
                                                    <Icon className="w-3.5 h-3.5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-baseline gap-1.5">
                            <span
                                className={`text-xs font-extrabold leading-none ${item.valueColor}`}
                            >
                              {item.value}
                            </span>
                                                        <span className="text-[10px] text-slate-700 font-semibold truncate">
                              {item.label}
                            </span>
                                                    </div>
                                                    <span
                                                        className={`text-[10px] block truncate leading-tight mt-0.5 ${item.subtextColor}`}
                                                    >
                            {item.subtext}
                          </span>
                                                </div>
                                            </div>
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition shrink-0" />
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