// src/modules/module4-quality/QualityControlModule.tsx
import React, { useState } from 'react';
import {
    Sparkles,
    AlertTriangle,
    ShieldCheck,
    RefreshCw,
    CheckCircle2,
    Plus,
    AlertCircle,
} from 'lucide-react';
import type { Product, QCAlert, UserRole } from '../../types/vyte.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown';

export interface QualityControlModuleProps {
    qcAlerts: QCAlert[];
    products: Product[];
    role: UserRole;
    onApproveQC: (qcId: string) => void;
    onTriggerScan: () => void;
    onAddCustomQCAlert: (newAlert: QCAlert) => void;
}

const sanitizePositiveInt = (raw: string): string => {
    return raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
};

/** @Composable */
export const QualityControlModule: React.FC<QualityControlModuleProps> = ({
                                                                              qcAlerts,
                                                                              products,
                                                                              role,
                                                                              onApproveQC,
                                                                              onTriggerScan,
                                                                              onAddCustomQCAlert,
                                                                          }) => {
    const [isScanning, setIsScanning] = useState(false);
    const [showLogForm, setShowLogForm] = useState(false);

    const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
    const [batchNo, setBatchNo] = useState<string>('');
    const [qtyAffectedInput, setQtyAffectedInput] = useState<string>('');
    const [daysLeftInput, setDaysLeftInput] = useState<string>('');
    const [triggerReason, setTriggerReason] = useState<string>('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const handleRunScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            onTriggerScan();
            setIsScanning(false);
        }, 350);
    };

    const handleCreateCustomAlert = (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};
        const prod = products.find((p) => p.id === selectedProductId) || products[0];

        if (!batchNo.trim() || batchNo.trim().length < 3) {
            newErrors.batchNo = 'Batch/Lot number is required (min 3 chars).';
        }
        if (!qtyAffectedInput || Number(qtyAffectedInput) < 1) {
            newErrors.qtyAffected = 'Affected quantity must be at least 1.';
        }
        if (!daysLeftInput || Number(daysLeftInput) < 1 || Number(daysLeftInput) > 365) {
            newErrors.daysLeft = 'Days until expiry must be between 1 and 365.';
        }
        if (!triggerReason.trim() || triggerReason.trim().length < 6) {
            newErrors.triggerReason = 'Please describe the quality defect or expiry risk (min 6 chars).';
        }

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        const qtyNum = Number(qtyAffectedInput);
        const daysNum = Number(daysLeftInput);
        const estLossSaved = Number(((prod?.priceRM || 35) * qtyNum * 0.8).toFixed(2));

        const created: QCAlert = {
            id: `QC-${Date.now()}`,
            productName: prod?.name || 'Inspecting Batch Item',
            sku: prod?.sku || 'SKU-QC',
            batchNo: batchNo.trim().toUpperCase(),
            expiryDate: '2026-10-28',
            daysLeft: daysNum,
            qtyAffected: `${qtyNum} ${prod?.uom || 'units'}`,
            triggerReason: triggerReason.trim(),
            aiSuggestion:
                daysNum <= 5
                    ? `Launch 25% flash clearance bundle for ${qtyNum} ${prod?.uom || 'units'} & adjust next supplier restock PO.`
                    : `Quarantine ${batchNo.trim().toUpperCase()} immediately & generate Supplier Replacement Claim invoice.`,
            actionLabel: daysNum <= 5 ? 'Approve Clearance & Adjust PO' : 'Approve Quarantine & Claim',
            savedRM: estLossSaved,
            status: 'PENDING_APPROVAL',
        };

        onAddCustomQCAlert(created);
        setBatchNo('');
        setQtyAffectedInput('');
        setDaysLeftInput('');
        setTriggerReason('');
        setErrors({});
        setShowLogForm(false);
    };

    return (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-purple-600" /> AI Quality Control &amp; Expiry Prevention Guardian
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Monitors perishable expiry dates and batch defect logs, recommending high-margin actions that auto-log recovery claims in Smart Invoices.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowLogForm(!showLogForm)}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" /> Log Batch Quality Issue
                    </button>
                    <button
                        onClick={handleRunScan}
                        disabled={isScanning}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                        {isScanning ? 'Scanning Batches...' : 'Run AI Expiry & Batch QC Scan'}
                    </button>
                </div>
            </div>

            {/* Manual Quality / Expiry Logger Form */}
            {showLogForm && (
                <form
                    onSubmit={handleCreateCustomAlert}
                    noValidate
                    className="p-4 rounded-xl bg-purple-50/50 border border-purple-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
                >
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Select Product SKU *</label>
                        <VyteDropdown
                            variant="light"
                            value={selectedProductId}
                            onChange={(val) => setSelectedProductId(val)}
                            options={products.map((p) => ({
                                label: `${p.name} (${p.sku})`,
                                value: p.id,
                            }))}
                        />
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Batch / Lot Number *</label>
                        <input
                            type="text"
                            placeholder="e.g., LOT-2026-99"
                            value={batchNo}
                            onChange={(e) => {
                                setBatchNo(e.target.value);
                                if (errors.batchNo) setErrors({ ...errors, batchNo: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                errors.batchNo ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {errors.batchNo && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.batchNo}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Affected Quantity *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g., 15"
                            value={qtyAffectedInput}
                            onChange={(e) => {
                                setQtyAffectedInput(sanitizePositiveInt(e.target.value));
                                if (errors.qtyAffected) setErrors({ ...errors, qtyAffected: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                errors.qtyAffected ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {errors.qtyAffected && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.qtyAffected}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Days Until Expiry (1–365) *</label>
                        <input
                            type="text"
                            inputMode="numeric"
                            placeholder="e.g., 3"
                            value={daysLeftInput}
                            onChange={(e) => {
                                setDaysLeftInput(sanitizePositiveInt(e.target.value));
                                if (errors.daysLeft) setErrors({ ...errors, daysLeft: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                errors.daysLeft ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {errors.daysLeft && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.daysLeft}
                            </p>
                        )}
                    </div>

                    <div className="md:col-span-3">
                        <label className="font-bold text-slate-700 block mb-1">Quality Defect / Expiry Trigger Reason *</label>
                        <input
                            type="text"
                            placeholder="e.g., Vacuum seal moisture detected during morning inspection"
                            value={triggerReason}
                            onChange={(e) => {
                                setTriggerReason(e.target.value);
                                if (errors.triggerReason) setErrors({ ...errors, triggerReason: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                errors.triggerReason ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {errors.triggerReason && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {errors.triggerReason}
                            </p>
                        )}
                    </div>

                    <div className="flex items-end">
                        <button
                            type="submit"
                            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition cursor-pointer"
                        >
                            Generate AI QC Solution
                        </button>
                    </div>
                </form>
            )}

            {/* QC Alert Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {qcAlerts.map((qc) => {
                    const isUrgent = qc.daysLeft <= 3;

                    return (
                        <div
                            key={qc.id}
                            className={`p-4 rounded-2xl border flex flex-col justify-between space-y-3 transition ${
                                qc.status === 'PENDING_APPROVAL'
                                    ? 'bg-slate-50/70 border-amber-200'
                                    : 'bg-emerald-50/30 border-emerald-200'
                            }`}
                        >
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between">
                                    <span
                                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${
                                            isUrgent ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-800'
                                        }`}
                                    >
                                        <AlertTriangle className="w-3 h-3" />
                                        {qc.triggerReason}
                                    </span>
                                    <span className="text-xs font-mono text-slate-500">
                                        {qc.sku} • {qc.batchNo}
                                    </span>
                                </div>

                                <div>
                                    <h4 className="text-sm font-bold text-slate-900">{qc.productName}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-600 mt-0.5">
                                        <span>
                                            Affected Qty: <strong>{qc.qtyAffected}</strong>
                                        </span>
                                        <span>•</span>
                                        <span>
                                            Expiry: <strong>{qc.expiryDate}</strong>
                                        </span>
                                        <span>•</span>
                                        <span className={isUrgent ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                                            ({qc.daysLeft}d left)
                                        </span>
                                    </div>
                                </div>

                                <div className="p-3 bg-white rounded-xl border border-purple-200 shadow-2xs space-y-1">
                                    <p className="text-xs font-bold text-purple-800 flex items-center gap-1">
                                        <Sparkles className="w-3.5 h-3.5" /> Explainable AI Recommendation:
                                    </p>
                                    <p className="text-xs text-slate-700 leading-relaxed">{qc.aiSuggestion}</p>
                                    <div className="pt-1 flex items-center justify-between text-[11px]">
                                        <span className="font-semibold text-emerald-600">
                                            Est. Waste Prevented: RM {qc.savedRM.toFixed(2)}
                                        </span>
                                        <span className="text-slate-400">Auto-logs Claim in Smart Invoices</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-1">
                                {qc.status === 'PENDING_APPROVAL' ? (
                                    <button
                                        onClick={() => onApproveQC(qc.id)}
                                        className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                                    >
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        {canApprove
                                            ? `${qc.actionLabel} & Log Claim`
                                            : 'Locked: Owner / Manager Only'}
                                    </button>
                                ) : (
                                    <span className="w-full py-2 px-4 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5">
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                                        Approved &amp; Claim Logged in Smart Invoices
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