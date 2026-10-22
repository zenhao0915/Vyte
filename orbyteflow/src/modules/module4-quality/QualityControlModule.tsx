// src/modules/module4-quality/QualityControlModule.tsx
import React, { useState, useMemo } from 'react';
import {
    Sparkles,
    AlertTriangle,
    RefreshCw,
    CheckCircle2,
    Plus,
    AlertCircle,
    Users,
    X,
    UserCheck,
    Search,
    Send,
} from 'lucide-react';
import type { CurrencyCode, OrbyteHrStaff, Product, QCAlert, UserRole } from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';

export interface QualityControlModuleProps {
    qcAlerts: QCAlert[];
    products: Product[];
    role: UserRole;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onDispatchToHrStaff: (
        qcId: string,
        staff: OrbyteHrStaff,
        priority: 'URGENT' | 'HIGH' | 'NORMAL',
        hrNotes: string
    ) => void;
    onCompleteHrTask: (qcId: string) => void;
    onTriggerScan: () => void;
    onAddCustomQCAlert: (newAlert: QCAlert) => void;
}

// Simulated Orbyte HR System Staff Roster
const ORBYTE_HR_STAFF_ROSTER: OrbyteHrStaff[] = [
    {
        staffId: 'HR-S204',
        name: 'Amirul Hakim',
        department: 'Cold-Chain & Quality Ops',
        position: 'Senior QC Inspector',
        shiftStatus: 'ON_DUTY',
    },
    {
        staffId: 'HR-S209',
        name: 'Nurul Aina',
        department: 'Storefront & Promotions',
        position: 'Floor Operations Lead',
        shiftStatus: 'ON_DUTY',
    },
    {
        staffId: 'HR-S215',
        name: 'Tan Wei Ming',
        department: 'Warehouse & Receiving',
        position: 'Inventory Supervisor',
        shiftStatus: 'ON_DUTY',
    },
    {
        staffId: 'HR-S221',
        name: 'Priya Nair',
        department: 'Supplier Compliance',
        position: 'Procurement & Return Specialist',
        shiftStatus: 'ON_DUTY',
    },
];

const sanitizePositiveInt = (raw: string): string => {
    return raw.replace(/[^0-9]/g, '').replace(/^0+/, '');
};

export const QualityControlModule: React.FC<QualityControlModuleProps> = ({
                                                                              qcAlerts,
                                                                              products,
                                                                              role,
                                                                              currency = 'MYR',
                                                                              exchangeRate = 1.0,
                                                                              onDispatchToHrStaff,
                                                                              onCompleteHrTask,
                                                                              onTriggerScan,
                                                                              onAddCustomQCAlert,
                                                                          }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const [isScanning, setIsScanning] = useState(false);
    const [showLogForm, setShowLogForm] = useState(false);
    const [statusFilter, setStatusFilter] = useState<
        'ALL' | 'PENDING_APPROVAL' | 'ASSIGNED_TO_STAFF' | 'APPROVED_RESOLVED'
    >('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Click-in AI Recommendation & Orbyte HR Assignment Modal State
    const [selectedQcModal, setSelectedQcModal] = useState<QCAlert | null>(null);
    const [selectedStaffId, setSelectedStaffId] = useState<string>(ORBYTE_HR_STAFF_ROSTER[0].staffId);
    const [taskPriority, setTaskPriority] = useState<'URGENT' | 'HIGH' | 'NORMAL'>('URGENT');
    const [taskInstruction, setTaskInstruction] = useState<string>('');

    // Manual Defect Logger Form State
    const [selectedProductId, setSelectedProductId] = useState<string>(products[0]?.id || '');
    const [batchNo, setBatchNo] = useState<string>('');
    const [qtyAffectedInput, setQtyAffectedInput] = useState<string>('');
    const [daysLeftInput, setDaysLeftInput] = useState<string>('');
    const [triggerReason, setTriggerReason] = useState<string>('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const handleRunScan = () => {
        setIsScanning(true);
        setTimeout(() => {
            onTriggerScan();
            setIsScanning(false);
        }, 350);
    };

    const openAiRecommendationModal = (qc: QCAlert) => {
        setSelectedQcModal(qc);
        setSelectedStaffId(qc.assignedStaffId || ORBYTE_HR_STAFF_ROSTER[0].staffId);
        setTaskPriority(qc.daysLeft <= 3 ? 'URGENT' : 'HIGH');
        setTaskInstruction(qc.hrNotes || qc.aiSuggestion);
    };

    const handleConfirmHrDispatch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedQcModal) return;
        const staff =
            ORBYTE_HR_STAFF_ROSTER.find((s) => s.staffId === selectedStaffId) ||
            ORBYTE_HR_STAFF_ROSTER[0];
        onDispatchToHrStaff(selectedQcModal.id, staff, taskPriority, taskInstruction.trim());
        setSelectedQcModal(null);
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
                    ? `Assign store staff to apply 25% flash clearance bundle on ${qtyNum} ${prod?.uom || 'units'} & move to front chiller.`
                    : `Assign warehouse staff to quarantine ${batchNo.trim().toUpperCase()} immediately & schedule supplier return pickup.`,
            actionLabel: daysNum <= 5 ? 'Clearance & Relabel' : 'Quarantine & Return',
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

    const filteredAlerts = useMemo(() => {
        return qcAlerts.filter((qc) => {
            const matchStatus = statusFilter === 'ALL' || qc.status === statusFilter;
            const q = searchQuery.trim().toLowerCase();
            const matchQuery =
                !q ||
                qc.productName.toLowerCase().includes(q) ||
                qc.sku.toLowerCase().includes(q) ||
                qc.batchNo.toLowerCase().includes(q) ||
                qc.triggerReason.toLowerCase().includes(q);
            return matchStatus && matchQuery;
        });
    }, [qcAlerts, statusFilter, searchQuery]);

    const totalPreventableRM = qcAlerts.reduce((sum, q) => sum + q.savedRM, 0);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
            {/* Top Header Bar (Matches Image 2 Layout) */}
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-rose-600" /> Perishable Expiry &amp; Batch Quality Control Repository
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Scalable batch monitoring table. Click any <strong>AI Recommendation</strong> to review SOPs and dispatch tasks directly to <strong>Orbyte HR Staff</strong>.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="hidden sm:flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-800">
                        <span>Preventable Waste:</span>
                        <span>
              {currencySymbol} {(totalPreventableRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowLogForm(!showLogForm)}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                    >
                        <Plus className="w-3.5 h-3.5" /> Log Batch Issue
                    </button>

                    <button
                        type="button"
                        onClick={handleRunScan}
                        disabled={isScanning}
                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                        <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                        {isScanning ? 'Scanning Batches...' : '+ Run AI Expiry Scan'}
                    </button>
                </div>
            </div>

            {/* Collapsible Manual Batch Issue Form */}
            {showLogForm && (
                <form
                    onSubmit={handleCreateCustomAlert}
                    noValidate
                    className="mx-5 p-4 rounded-xl bg-rose-50/50 border border-rose-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
                >
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Select Product SKU *</label>
                        <select
                            value={selectedProductId}
                            onChange={(e) => setSelectedProductId(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900"
                        >
                            {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name} ({p.sku})
                                </option>
                            ))}
                        </select>
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
                            className={`w-full px-3 py-2 rounded-lg bg-white border ${
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
                            className={`w-full px-3 py-2 rounded-lg bg-white border ${
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
                            className={`w-full px-3 py-2 rounded-lg bg-white border ${
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
                            placeholder="e.g., Seal moisture detected or expires in 72 hours"
                            value={triggerReason}
                            onChange={(e) => {
                                setTriggerReason(e.target.value);
                                if (errors.triggerReason) setErrors({ ...errors, triggerReason: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-lg bg-white border ${
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
                            className="w-full py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition cursor-pointer"
                        >
                            Add to QC Table
                        </button>
                    </div>
                </form>
            )}

            {/* Filter Pills & Search Bar (Matches Image 2 Top Filter Strip) */}
            <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setStatusFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            statusFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs font-bold' : 'text-slate-600'
                        }`}
                    >
                        All ({qcAlerts.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('PENDING_APPROVAL')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            statusFilter === 'PENDING_APPROVAL'
                                ? 'bg-rose-100 text-rose-900 font-bold'
                                : 'text-slate-600'
                        }`}
                    >
                        Needs HR Assignment ({qcAlerts.filter((q) => q.status === 'PENDING_APPROVAL').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('ASSIGNED_TO_STAFF')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            statusFilter === 'ASSIGNED_TO_STAFF'
                                ? 'bg-blue-100 text-blue-900 font-bold'
                                : 'text-slate-600'
                        }`}
                    >
                        Assigned to HR Staff ({qcAlerts.filter((q) => q.status === 'ASSIGNED_TO_STAFF').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setStatusFilter('APPROVED_RESOLVED')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            statusFilter === 'APPROVED_RESOLVED'
                                ? 'bg-emerald-100 text-emerald-900 font-bold'
                                : 'text-slate-600'
                        }`}
                    >
                        Completed ({qcAlerts.filter((q) => q.status === 'APPROVED_RESOLVED').length})
                    </button>
                </div>

                <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                        type="text"
                        placeholder="Filter batch, SKU or reason..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            {/* Scalable Quality Control & Expiry Table (Point 5) */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                        <th className="py-3 px-4">Batch &amp; SKU</th>
                        <th className="py-3 px-3">Risk Level</th>
                        <th className="py-3 px-3">Product &amp; Trigger Reason</th>
                        <th className="py-3 px-3">AI Recommendation (Click-In)</th>
                        <th className="py-3 px-3">Affected Qty</th>
                        <th className="py-3 px-3">Loss Preventable ({currency})</th>
                        <th className="py-3 px-3">Orbyte HR Assignee</th>
                        <th className="py-3 px-4">HR Task Action</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAlerts.map((qc) => {
                        const isUrgent = qc.daysLeft <= 5;
                        const convertedSaved = (qc.savedRM * exchangeRate).toFixed(2);

                        return (
                            <tr key={qc.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                    <p className="font-mono font-bold text-slate-900">{qc.batchNo}</p>
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                      {qc.sku} • Exp: {qc.expiryDate}
                    </span>
                                </td>

                                <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${
                            isUrgent
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                        {isUrgent ? `${qc.daysLeft}d Left (Urgent)` : 'Batch Defect'}
                    </span>
                                </td>

                                <td className="py-3.5 px-3 max-w-[220px]">
                                    <p className="font-bold text-slate-900 truncate" title={qc.productName}>
                                        {qc.productName}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate" title={qc.triggerReason}>
                                        {qc.triggerReason}
                                    </p>
                                </td>

                                {/* Click-In AI Recommendation Pill */}
                                <td className="py-3.5 px-3">
                                    <button
                                        type="button"
                                        onClick={() => openAiRecommendationModal(qc)}
                                        className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer max-w-[250px]"
                                    >
                                        <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                        <span className="truncate">{qc.actionLabel}</span>
                                        <span className="bg-purple-200/80 text-purple-900 text-[10px] px-1.5 py-0.5 rounded font-extrabold shrink-0">
                        Click-In
                      </span>
                                    </button>
                                </td>

                                <td className="py-3.5 px-3 font-bold text-slate-800 whitespace-nowrap">
                                    {qc.qtyAffected}
                                </td>

                                <td className="py-3.5 px-3 font-extrabold text-emerald-700 whitespace-nowrap">
                                    {currencySymbol} {Number(convertedSaved).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>

                                {/* Orbyte HR Assignee Column */}
                                <td className="py-3.5 px-3 whitespace-nowrap">
                                    {qc.assignedStaffName ? (
                                        <div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          <UserCheck className="w-3 h-3 text-blue-600" /> {qc.assignedStaffName}
                        </span>
                                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                                                {qc.hrTaskId} • {qc.assignedPriority}
                                            </p>
                                        </div>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500">
                        Unassigned (HR Roster)
                      </span>
                                    )}
                                </td>

                                {/* Action Column */}
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                    {qc.status === 'PENDING_APPROVAL' && (
                                        <button
                                            type="button"
                                            onClick={() => openAiRecommendationModal(qc)}
                                            className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                                        >
                                            <Users className="w-3.5 h-3.5" /> Assign HR Staff
                                        </button>
                                    )}

                                    {qc.status === 'ASSIGNED_TO_STAFF' && (
                                        <button
                                            type="button"
                                            onClick={() => onCompleteHrTask(qc.id)}
                                            className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Staff Done
                                        </button>
                                    )}

                                    {qc.status === 'APPROVED_RESOLVED' && (
                                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Resolved by HR
                      </span>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {/* CLICK-IN AI RECOMMENDATION & ORBYTE HR STAFF ASSIGNMENT MODAL */}
            {selectedQcModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <form
                        onSubmit={handleConfirmHrDispatch}
                        className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4"
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
                  Orbyte HR System Connector • Step 3 &amp; 4
                </span>
                                <h3 className="text-base font-bold text-slate-900 mt-1">
                                    {selectedQcModal.productName} ({selectedQcModal.batchNo})
                                </h3>
                                <p className="text-xs text-slate-500">
                                    SKU: {selectedQcModal.sku} • Affected: {selectedQcModal.qtyAffected} • Expiry: {selectedQcModal.expiryDate}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedQcModal(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* AI Recommendation Detail Box */}
                        <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-purple-600" /> AI Root-Cause &amp; Recommended SOP
                </span>
                                <span className="font-extrabold text-emerald-700">
                  Saves {currencySymbol} {(selectedQcModal.savedRM * exchangeRate).toFixed(2)}
                </span>
                            </div>
                            <p className="text-slate-700 leading-relaxed">{selectedQcModal.aiSuggestion}</p>
                            <p className="text-[11px] text-rose-600 font-semibold">
                                Trigger: {selectedQcModal.triggerReason}
                            </p>
                        </div>

                        {/* Orbyte HR Staff Selection */}
                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">
                                    Assign to Orbyte HR Staff Member *
                                </label>
                                <select
                                    value={selectedStaffId}
                                    onChange={(e) => setSelectedStaffId(e.target.value)}
                                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                                >
                                    {ORBYTE_HR_STAFF_ROSTER.map((st) => (
                                        <option key={st.staffId} value={st.staffId}>
                                            {st.name} ({st.staffId}) — {st.position} [{st.department}]
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">Task Priority</label>
                                    <select
                                        value={taskPriority}
                                        onChange={(e) =>
                                            setTaskPriority(e.target.value as 'URGENT' | 'HIGH' | 'NORMAL')
                                        }
                                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"
                                    >
                                        <option value="URGENT">URGENT (Execute &lt; 2 hrs)</option>
                                        <option value="HIGH">HIGH (Same Shift)</option>
                                        <option value="NORMAL">NORMAL (Within 24 hrs)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">HR Sync Destination</label>
                                    <div className="px-3 py-2 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-semibold">
                                        Orbyte HR Shift Roster
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="font-bold text-slate-700 block mb-1">
                                    Action Instructions for Staff (Editable)
                                </label>
                                <textarea
                                    rows={2}
                                    value={taskInstruction}
                                    onChange={(e) => setTaskInstruction(e.target.value)}
                                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-emerald-500"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setSelectedQcModal(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={!canApprove}
                                className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                            >
                                <Send className="w-3.5 h-3.5" />
                                {canApprove
                                    ? 'Approve & Dispatch to Orbyte HR Staff'
                                    : 'Requires Owner/Manager Role'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};