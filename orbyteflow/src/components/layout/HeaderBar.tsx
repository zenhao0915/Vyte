// src/components/layout/HeaderBar.tsx
import React from 'react';
import { ShieldCheck, Building2 } from 'lucide-react';
import type { ActiveTab, UserRole, UserSession } from '../../types/vyte.ts';

interface HeaderBarProps {
    activeTab: ActiveTab;
    role: UserRole;
    userSession: UserSession | null;
}

/** @Composable */
export const HeaderBar: React.FC<HeaderBarProps> = ({
                                                        activeTab,
                                                        role,
                                                        userSession,
                                                    }) => {
    const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
        mod1: {
            title: 'Auto Restock & Universal Inventory',
            subtitle: 'Real-time threshold monitoring, supplier PO drafting & approval.',
        },
        mod2: {
            title: 'Sales Analytics & AI Procurement Review',
            subtitle: 'Quarterly revenue reports, holding cost optimization & AI restock forecasting.',
        },
        mod3: {
            title: 'Order Status & AI Depletion Auto-Ordering',
            subtitle: 'Depletion-driven supplier order queue & NLP customer order verification awaiting human intervention.',
        },
        mod4: {
            title: 'Quality & Expiry Guardian',
            subtitle: 'Proactive perishable shelf-life tracking, batch quarantine & promotional loss mitigation.',
        },
        mod5: {
            title: 'Smart Invoices & AI Categorization',
            subtitle: 'Automated supplier payable & customer receivable classification with human verification.',
        },
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

    return (
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0 z-20">
            <div>
                <h2 className="text-xl font-bold text-slate-900">{titles[activeTab].title}</h2>
                <p className="text-xs text-slate-500">{titles[activeTab].subtitle}</p>
            </div>

            <div className="flex items-center gap-3">
                {/* Static Login-Assigned Role Badge */}
                <div
                    className={`px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 ${activeBadge.style}`}
                >
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>{activeBadge.label}</span>
                </div>

                {/* User & Company Badge */}
                {userSession && (
                    <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
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
                    </div>
                )}
            </div>
        </header>
    );
};