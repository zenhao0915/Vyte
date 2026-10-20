// src/modules/module4-quality/QualityControlModule.tsx
import React from 'react';
import { Sparkles } from 'lucide-react';
import type { QCAlert } from '../../types/orbyte';

interface QualityControlModuleProps {
    qcAlerts: QCAlert[];
    onApproveQC: (qcId: string) => void;
}

export const QualityControlModule: React.FC<QualityControlModuleProps> = ({ qcAlerts, onApproveQC }) => {
    return (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-600" /> AI Quality Control & Expiry Date Guardian
            </h3>
            <p className="text-xs text-slate-500 mt-1">
                Automatically monitors perishable expiry dates and batch defect logs, recommending high-margin actions for Admin
                approval (Supports SDG 8 & SDG 12).
            </p>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {qcAlerts.map((qc) => (
                    <div
                        key={qc.id}
                        className="p-5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-4"
                    >
                        <div>
                            <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">
                  {qc.triggerReason}
                </span>
                                <span className="text-xs font-mono text-slate-500">
                  {qc.sku} • {qc.batchNo}
                </span>
                            </div>
                            <h4 className="text-base font-bold text-slate-900 mt-3">{qc.productName}</h4>
                            <p className="text-xs text-slate-600 mt-1">
                                Affected Quantity: <strong>{qc.qtyAffected}</strong> • Expiry: <strong>{qc.expiryDate}</strong>
                            </p>

                            <div className="mt-3 p-3 bg-white rounded-lg border border-purple-200">
                                <p className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                    <Sparkles className="w-3.5 h-3.5" /> AI Recommended Solution:
                                </p>
                                <p className="text-xs text-slate-700 mt-1 leading-relaxed">{qc.aiSuggestion}</p>
                                <p className="text-[11px] font-semibold text-emerald-600 mt-1.5">
                                    Est. Waste / Cost Prevented: RM {qc.savedRM.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                            {qc.status === 'PENDING_APPROVAL' ? (
                                <button
                                    onClick={() => onApproveQC(qc.id)}
                                    className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition"
                                >
                                    {qc.actionLabel} (Requires Owner Role)
                                </button>
                            ) : (
                                <span className="w-full py-2 px-4 bg-emerald-100 text-emerald-800 font-semibold text-xs rounded-lg text-center">
                  ✓ Approved & Executed by Admin
                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};