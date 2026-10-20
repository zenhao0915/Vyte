// src/components/layout/HeaderBar.tsx
import React from 'react';
import { UserCheck } from 'lucide-react';
import type { ActiveTab, UserRole } from '../../types/orbyte';

interface HeaderBarProps {
    activeTab: ActiveTab;
    role: UserRole;
    setRole: (role: UserRole) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({ activeTab, role, setRole }) => {
    return (
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between sticky top-0 z-10">
            <div>
                <h2 className="text-xl font-bold text-slate-900">
                    {activeTab === 'mod1' && 'Module 1: Universal Inventory & Automated Restock'}
                    {activeTab === 'mod4' && 'Module 4: AI Quality Control & Expiry Prevention'}
                    {activeTab === 'mod5' && 'Module 5: Smart Invoice Hub & AI Categorization'}
                    {activeTab === 'mod2_3' && 'Modules 2 & 3: Sales Review & NLP Order Integration'}
                </h2>
                <p className="text-xs text-slate-500">
                    5-Step Orbyte Journey: Trigger → Connected Data → AI/Rule Decision → Human Approval → Audit Outcome
                </p>
            </div>

            <div className="flex items-center gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                    <button
                        onClick={() => setRole('SME_OWNER')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition ${
                            role === 'SME_OWNER' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        <UserCheck className="w-3.5 h-3.5" /> SME Owner (Can Approve)
                    </button>
                    <button
                        onClick={() => setRole('OPERATIONS_STAFF')}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition ${
                            role === 'OPERATIONS_STAFF' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-600'
                        }`}
                    >
                        Staff View (Read/Trigger Only)
                    </button>
                </div>
            </div>
        </header>
    );
};