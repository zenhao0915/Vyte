// src/components/layout/HeaderBar.tsx
import React from 'react';
import { UserCheck, LogOut, Building2 } from 'lucide-react';
import type { ActiveTab, UserRole, UserSession } from '../../types/orbyte';

interface HeaderBarProps {
    activeTab: ActiveTab;
    role: UserRole;
    setRole: (role: UserRole) => void;
    userSession: UserSession | null;
    onLogout: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
                                                        activeTab,
                                                        role,
                                                        setRole,
                                                        userSession,
                                                        onLogout,
                                                    }) => {
    const titles: Record<ActiveTab, { title: string; subtitle: string }> = {
        mod1: {
            title: 'Auto Restock & Universal Inventory',
            subtitle: 'Real-time threshold monitoring, supplier PO drafting & owner approval.',
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

    return (
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-10">
            <div>
                <h2 className="text-xl font-bold text-slate-900">{titles[activeTab].title}</h2>
                <p className="text-xs text-slate-500">{titles[activeTab].subtitle}</p>
            </div>

            <div className="flex items-center gap-3">
                {/* Role Switcher for Testing RBAC */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setRole('SME_OWNER')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                            role === 'SME_OWNER' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        <UserCheck className="w-3.5 h-3.5" /> SME Owner (Can Approve)
                    </button>
                    <button
                        onClick={() => setRole('OPERATIONS_STAFF')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            role === 'OPERATIONS_STAFF' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        Staff View (Read/Trigger)
                    </button>
                </div>

                {/* User & Company Badge */}
                {userSession && (
                    <div className="flex items-center gap-2.5 pl-3 border-l border-slate-200">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-slate-800 leading-none">
                                {userSession.userName}{' '}
                                <span className="text-[10px] font-mono text-emerald-600">({userSession.userID})</span>
                            </p>
                            <p className="text-[11px] text-slate-400 flex items-center justify-end gap-1 mt-0.5">
                                <Building2 className="w-3 h-3" /> {userSession.companyName}
                            </p>
                        </div>
                        <button
                            onClick={onLogout}
                            title="Log out to Auth Screen"
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-slate-200/80 transition cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
};