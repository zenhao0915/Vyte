// src/modules/jayden-modules/SalesAndOrderPlaceholder.tsx
import React from 'react';

export const SalesAndOrderPlaceholder: React.FC = () => {
    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-lg font-bold text-slate-900">
                Teammate Workspace: Module 2 (Sales Review) & Module 3 (NLP Order Module)
            </h3>
            <p className="text-sm text-slate-600">
                Jayden & Zen Hao can build Module 2 (quarterly/yearly/monthly sales filtering & AI holding-cost stock
                recommendations) and Module 3 (NLP customer order stock verification, human approval & auto-invoicing) inside{' '}
                <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">src/modules/jayden-modules/</code> without causing
                Git merge conflicts.
            </p>
        </div>
    );
};