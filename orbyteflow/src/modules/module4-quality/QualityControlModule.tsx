// src/modules/module4-quality/QualityControlModule.tsx
import React, { useState } from 'react';
import { Sparkles, AlertTriangle, ShieldCheck, RefreshCw, CheckCircle2 } from 'lucide-react';
import type { QCAlert, UserRole } from '../../types/orbyte';

interface QualityControlModuleProps {
    qcAlerts: QCAlert[];
    role: UserRole;
    onApproveQC: (qcId: string) => void;
    onTriggerScan: () => void;
}

export const QualityControlModule: React.FC<QualityControlModuleProps> = ({
                                                                              qcAlerts,
                                                                              role,
                                                                              onApproveQC,
                                                                              onTriggerScan,
                                                                          }) => {
    const [isScanning, setIsScanning] = useState(false);

    const handleRunScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            onTriggerScan();
            setIsScanning(false);
        }, 400);
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" /> AI Quality Control &amp; Expiry Prevention Guardian
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Identifies expiring batches and defect rates, generating high-margin commercial solutions for Admin approval (SDG 8 &amp; SDG 12).
                    </p>
                </div>
                <button
                    onClick={handleRunScan}
                    disabled={isScanning}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                    {isScanning ? 'Scanning Batches...' : 'Run AI Expiry & Batch QC Scan'}
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {qcAlerts.map((qc) => {
                    const isUrgent = qc.daysLeft <= 3;

                    return (
                        <div
                            key={qc.id}
                            className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition ${
                                qc.status === 'PENDING_APPROVAL'
                                    ? 'bg-slate-50/70 border-amber-200'
                                    : 'bg-emerald-50/30 border-emerald-200'
                            }`}
                        >
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span
                                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                                            isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                                        }`}
                                    >
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {qc.triggerReason}
                                    </span>
                                    <span className="text-xs font-mono text-slate-500">
                                        {qc.sku} • {qc.batchNo}
                                    </span>
                                </div>

                                <div>
                                    <h4 className="text-base font-bold text-slate-900">{qc.productName}</h4>
                                    <div className="flex items-center gap-3 text-xs text-slate-600 mt-1">
                                        <span>Affected Qty: <strong>{qc.qtyAffected}</strong></span>
                                        <span>•</span>
                                        <span>Expiry: <strong>{qc.expiryDate}</strong></span>
                                        <span>•</span>
                                        <span className={isUrgent ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                                            ({qc.daysLeft} days remaining)
                                        </span>
                                    </div>
                                </div>

                                <div className="p-3.5 bg-white rounded-xl border border-purple-200 shadow-xs space-y-1.5">
                                    <p className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5" /> Explainable AI Recommendation:
                                    </p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{qc.aiSuggestion}</p>
                                    <div className="pt-1 flex items-center justify-between text-[11px]">
                                        <span className="font-semibold text-emerald-600">
                                            Est. Waste Prevented: RM {qc.savedRM.toFixed(2)}
                                        </span>
                                        <span className="text-slate-400">Target SDG 12.3</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-2">
                                {qc.status === 'PENDING_APPROVAL' ? (
                                    <button
                                        onClick={() => {
                                            if (role !== 'SME_OWNER') {
                                                alert('Orbyte RBAC Restriction: Only SME_OWNER can approve QC solutions or promotional markdowns.');
                                                return;
                                            }
                                            onApproveQC(qc.id);
                                        }}
                                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        {role === 'SME_OWNER'
                                            ? `${qc.actionLabel} (Approve)`
                                            : 'Requires SME_OWNER Approval'}
                                    </button>
                                ) : (
                                    <span className="w-full py-2.5 px-4 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        Approved &amp; Executed by Admin
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};