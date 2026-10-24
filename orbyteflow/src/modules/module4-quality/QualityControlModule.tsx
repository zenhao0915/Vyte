// src/modules/module4-quality/QualityControlModule.tsx
import React, { useState, useMemo, useEffect } from 'react';
import {
    Sparkles, AlertTriangle, RefreshCw, CheckCircle2, Plus, AlertCircle,
    Users, X, UserCheck, Search, Send, Calendar, Clock, FileCode, Copy, Check,
} from 'lucide-react';
import {
    CURRENCY_SYMBOLS,
    type CurrencyCode,
    type OrbyteHrOverdueEscalationPayload,
    type OrbyteHrStaff,
    type Product,
    type QCAlert,
    type UserRole,
} from '../../types/vyte.ts';

export interface QualityControlModuleProps {
    qcAlerts: QCAlert[];
    products: Product[];
    role: UserRole;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onDispatchToHrStaff: (qcId: string, staff: OrbyteHrStaff, priority: 'URGENT' | 'HIGH' | 'NORMAL', dueDate: string, hrNotes: string) => void;
    onEscalateOverdueToHr: (qcId: string, payload: OrbyteHrOverdueEscalationPayload, simulatedPastDate?: string) => void;
    onCompleteHrTask: (qcId: string) => void;
    onTriggerScan: () => void;
    onAddCustomQCAlert: (newAlert: QCAlert) => void;
}

const WAREHOUSE_STAFF_ROSTER: OrbyteHrStaff[] = [
    { staffId: 'WH-S204', name: 'Amirul Hakim', department: 'Cold-Chain & Quality Ops', position: 'Senior Warehouse QC Inspector', shiftStatus: 'ON_DUTY' },
    { staffId: 'WH-S209', name: 'Nurul Aina', department: 'Storefront & Chiller', position: 'Floor Operations Lead', shiftStatus: 'ON_DUTY' },
    { staffId: 'WH-S215', name: 'Tan Wei Ming', department: 'Warehouse & Receiving', position: 'Warehouse Supervisor', shiftStatus: 'ON_DUTY' },
    { staffId: 'WH-S221', name: 'Priya Nair', department: 'Inventory & Returns', position: 'Stock Quarantine Specialist', shiftStatus: 'ON_DUTY' },
];

const sanitizePositiveInt = (raw: string) => raw.replace(/[^0-9]/g, '').replace(/^0+/, '');

export const QualityControlModule: React.FC<QualityControlModuleProps> = ({
                                                                              qcAlerts, products, role, currency = 'MYR', exchangeRate = 1.0,
                                                                              onDispatchToHrStaff, onEscalateOverdueToHr, onCompleteHrTask, onTriggerScan, onAddCustomQCAlert,
                                                                          }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
    const todayIso = new Date().toISOString().slice(0, 10);

    const [isScanning, setIsScanning] = useState(false);
    const [showLogForm, setShowLogForm] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING_APPROVAL' | 'ASSIGNED_TO_STAFF' | 'OVERDUE_HR' | 'APPROVED_RESOLVED'>('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const [selectedQcModal, setSelectedQcModal] = useState<QCAlert | null>(null);
    const [selectedStaffId, setSelectedStaffId] = useState(WAREHOUSE_STAFF_ROSTER[0].staffId);
    const [taskPriority, setTaskPriority] = useState<'URGENT' | 'HIGH' | 'NORMAL'>('URGENT');
    const [taskDueDate, setTaskDueDate] = useState(todayIso);
    const [dueDateError, setDueDateError] = useState('');
    const [taskInstruction, setTaskInstruction] = useState('');

    const [inspectingPayload, setInspectingPayload] = useState<OrbyteHrOverdueEscalationPayload | null>(null);
    const [copiedPayload, setCopiedPayload] = useState(false);

    const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
    const [batchNo, setBatchNo] = useState('');
    const [qtyAffectedInput, setQtyAffectedInput] = useState('');
    const [daysLeftInput, setDaysLeftInput] = useState('');
    const [triggerReason, setTriggerReason] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});

    const buildOverduePayload = (qc: QCAlert, effectiveDueDate: string): OrbyteHrOverdueEscalationPayload => {
        const diffDays = Math.max(1, Math.round((new Date(todayIso).getTime() - new Date(effectiveDueDate).getTime()) / 86400000));
        return {
            event: 'ORBYTE_HR_TASK_OVERDUE_ESCALATION',
            escalationId: `ESC-WH-${Math.floor(1000 + Math.random() * 9000)}`,
            hrTaskId: qc.hrTaskId || `WH-TASK-${qc.id}`,
            qcAlertId: qc.id,
            staff: {
                staffId: qc.assignedStaffId || 'WH-S204',
                name: qc.assignedStaffName || 'Amirul Hakim',
                department: qc.assignedStaffDepartment || 'Cold-Chain & Quality Ops',
                position: qc.assignedStaffPosition || 'Senior Warehouse QC Inspector',
            },
            taskDetails: {
                sku: qc.sku, productName: qc.productName, batchNo: qc.batchNo,
                actionRequired: qc.hrNotes || qc.aiSuggestion, priority: qc.assignedPriority || 'URGENT',
                assignedDueDate: effectiveDueDate, currentDate: todayIso, daysOverdue: diffDays,
                taskStatus: 'UNDONE_PAST_DUE', atRiskValueRM: qc.savedRM,
            },
            hrSystemDirective: 'LOG_KPI_BREACH_AND_ESCALATE_SUPERVISOR',
            dispatchedAt: new Date().toISOString(),
        };
    };

    useEffect(() => {
        qcAlerts.forEach((qc) => {
            if (qc.status === 'ASSIGNED_TO_STAFF' && qc.assignedDueDate && qc.assignedDueDate < todayIso && !qc.hrEscalated) {
                onEscalateOverdueToHr(qc.id, buildOverduePayload(qc, qc.assignedDueDate), qc.assignedDueDate);
            }
        });
    }, [qcAlerts, todayIso, onEscalateOverdueToHr]);

    const handleRunScan = () => {
        setIsScanning(true);
        setTimeout(() => { onTriggerScan(); setIsScanning(false); }, 350);
    };

    const openAiRecommendationModal = (qc: QCAlert) => {
        setSelectedQcModal(qc);
        setSelectedStaffId(qc.assignedStaffId || WAREHOUSE_STAFF_ROSTER[0].staffId);
        setTaskPriority(qc.daysLeft <= 3 ? 'URGENT' : 'HIGH');
        setTaskDueDate(qc.assignedDueDate || todayIso);
        setDueDateError('');
        setTaskInstruction(qc.hrNotes || qc.aiSuggestion);
    };

    const handleConfirmStaffDispatch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedQcModal) return;
        if (!taskDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(taskDueDate)) return setDueDateError('Please select a valid completion due date.');
        const staff = WAREHOUSE_STAFF_ROSTER.find((s) => s.staffId === selectedStaffId) || WAREHOUSE_STAFF_ROSTER[0];
        onDispatchToHrStaff(selectedQcModal.id, staff, taskPriority, taskDueDate, taskInstruction.trim());
        setSelectedQcModal(null);
    };

    const handleSimulatePastDueAndEscalate = (qc: QCAlert) => {
        const pastDateObj = new Date();
        pastDateObj.setDate(pastDateObj.getDate() - 2);
        const simulatedPastDueIso = pastDateObj.toISOString().slice(0, 10);
        const payload = buildOverduePayload(qc, simulatedPastDueIso);
        onEscalateOverdueToHr(qc.id, payload, simulatedPastDueIso);
        setInspectingPayload(payload);
    };

    const handleCreateCustomAlert = (e: React.FormEvent) => {
        e.preventDefault();
        const newErrors: Record<string, string> = {};
        const prod = products.find((p) => p.id === selectedProductId) || products[0];
        if (!batchNo.trim() || batchNo.trim().length < 3) newErrors.batchNo = 'Batch/Lot number is required (min 3 chars).';
        if (!qtyAffectedInput || Number(qtyAffectedInput) < 1) newErrors.qtyAffected = 'Affected quantity must be at least 1.';
        if (!daysLeftInput || Number(daysLeftInput) < 1 || Number(daysLeftInput) > 365) newErrors.daysLeft = 'Days until expiry must be between 1 and 365.';
        if (!triggerReason.trim() || triggerReason.trim().length < 6) newErrors.triggerReason = 'Please describe the quality defect or expiry risk (min 6 chars).';
        if (Object.keys(newErrors).length > 0) return setErrors(newErrors);

        const qtyNum = Number(qtyAffectedInput);
        const daysNum = Number(daysLeftInput);
        onAddCustomQCAlert({
            id: `QC-${Date.now()}`,
            productName: prod?.name || 'Inspecting Batch Item',
            sku: prod?.sku || 'SKU-QC',
            batchNo: batchNo.trim().toUpperCase(),
            expiryDate: '2026-10-28',
            daysLeft: daysNum,
            qtyAffected: `${qtyNum} ${prod?.uom || 'units'}`,
            triggerReason: triggerReason.trim(),
            aiSuggestion: daysNum <= 5
                ? `Assign warehouse staff to apply 25% clearance bundle on ${qtyNum} ${prod?.uom || 'units'} & move to front chiller.`
                : `Assign warehouse staff to quarantine ${batchNo.trim().toUpperCase()} immediately & schedule supplier return pickup.`,
            actionLabel: daysNum <= 5 ? 'Clearance & Relabel' : 'Quarantine & Return',
            savedRM: Number(((prod?.priceRM || 35) * qtyNum * 0.8).toFixed(2)),
            status: 'PENDING_APPROVAL',
        });
        setBatchNo(''); setQtyAffectedInput(''); setDaysLeftInput(''); setTriggerReason(''); setErrors({}); setShowLogForm(false);
    };

    const isCompletedPastDue = (qc: QCAlert): boolean =>
        qc.status === 'APPROVED_RESOLVED' &&
        Boolean(qc.completedLate || qc.hrEscalated || (qc.assignedDueDate && qc.assignedDueDate < (qc.completedAtDate || todayIso)));

    const filteredAlerts = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        return qcAlerts.filter((qc) => {
            const isOverdue = (qc.status === 'ASSIGNED_TO_STAFF' && Boolean(qc.assignedDueDate && qc.assignedDueDate < todayIso)) || Boolean(qc.hrEscalated);
            const matchStatus = statusFilter === 'ALL' ? true : statusFilter === 'OVERDUE_HR' ? isOverdue : qc.status === statusFilter;
            const matchQuery = !q || qc.productName.toLowerCase().includes(q) || qc.sku.toLowerCase().includes(q) || qc.batchNo.toLowerCase().includes(q) || qc.triggerReason.toLowerCase().includes(q) || Boolean(qc.assignedStaffName?.toLowerCase().includes(q));
            return matchStatus && matchQuery;
        });
    }, [qcAlerts, statusFilter, searchQuery, todayIso]);

    const overdueCount = qcAlerts.filter((q) => (q.status === 'ASSIGNED_TO_STAFF' && Boolean(q.assignedDueDate && q.assignedDueDate < todayIso)) || Boolean(q.hrEscalated)).length;
    const totalPreventableRM = qcAlerts.reduce((sum, q) => sum + q.savedRM, 0);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-rose-600" /> Perishable Expiry &amp; Batch Quality Control Repository
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Assign quality inspection and expiry actions with strict completion due dates to <strong>Warehouse Staff</strong>.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="hidden sm:flex items-center gap-2 bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 text-xs font-bold text-rose-800">
                        <span>Preventable Waste:</span>
                        <span>{currencySymbol} {(totalPreventableRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <button type="button" onClick={() => setShowLogForm(!showLogForm)} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                        <Plus className="w-3.5 h-3.5" /> Log Batch Issue
                    </button>
                    <button type="button" onClick={handleRunScan} disabled={isScanning} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                        <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                        {isScanning ? 'Scanning Batches...' : 'Run AI Expiry Scan'}
                    </button>
                </div>
            </div>

            {showLogForm && (
                <form onSubmit={handleCreateCustomAlert} noValidate className="mx-5 p-4 rounded-xl bg-rose-50/50 border border-rose-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Select Product SKU *</label>
                        <select value={selectedProductId} onChange={(e) => setSelectedProductId(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900">
                            {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Batch / Lot Number *</label>
                        <input type="text" placeholder="e.g., LOT-2026-99" value={batchNo} onChange={(e) => { setBatchNo(e.target.value); if (errors.batchNo) setErrors({ ...errors, batchNo: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${errors.batchNo ? 'border-rose-500' : 'border-slate-300'}`} />
                        {errors.batchNo && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.batchNo}</p>}
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Affected Quantity *</label>
                        <input type="text" inputMode="numeric" placeholder="e.g., 15" value={qtyAffectedInput} onChange={(e) => { setQtyAffectedInput(sanitizePositiveInt(e.target.value)); if (errors.qtyAffected) setErrors({ ...errors, qtyAffected: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${errors.qtyAffected ? 'border-rose-500' : 'border-slate-300'}`} />
                        {errors.qtyAffected && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.qtyAffected}</p>}
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Days Until Expiry (1–365) *</label>
                        <input type="text" inputMode="numeric" placeholder="e.g., 3" value={daysLeftInput} onChange={(e) => { setDaysLeftInput(sanitizePositiveInt(e.target.value)); if (errors.daysLeft) setErrors({ ...errors, daysLeft: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${errors.daysLeft ? 'border-rose-500' : 'border-slate-300'}`} />
                        {errors.daysLeft && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.daysLeft}</p>}
                    </div>
                    <div className="md:col-span-3">
                        <label className="font-bold text-slate-700 block mb-1">Quality Defect / Expiry Trigger Reason *</label>
                        <input type="text" placeholder="e.g., Seal moisture detected or expires in 72 hours" value={triggerReason} onChange={(e) => { setTriggerReason(e.target.value); if (errors.triggerReason) setErrors({ ...errors, triggerReason: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${errors.triggerReason ? 'border-rose-500' : 'border-slate-300'}`} />
                        {errors.triggerReason && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {errors.triggerReason}</p>}
                    </div>
                    <div className="flex items-end">
                        <button type="submit" className="w-full py-2 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg transition cursor-pointer">Add to QC Table</button>
                    </div>
                </form>
            )}

            <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                    {([
                        { id: 'ALL', label: `All (${qcAlerts.length})`, activeCls: 'bg-white text-slate-900 shadow-2xs font-bold', idleCls: 'text-slate-600' },
                        { id: 'PENDING_APPROVAL', label: `Needs Staff Assignment (${qcAlerts.filter((q) => q.status === 'PENDING_APPROVAL').length})`, activeCls: 'bg-amber-100 text-amber-900 font-bold', idleCls: 'text-slate-600' },
                        { id: 'ASSIGNED_TO_STAFF', label: `Assigned to Warehouse (${qcAlerts.filter((q) => q.status === 'ASSIGNED_TO_STAFF').length})`, activeCls: 'bg-blue-100 text-blue-900 font-bold', idleCls: 'text-slate-600' },
                        { id: 'OVERDUE_HR', label: `Overdue Escalated (${overdueCount})`, activeCls: 'bg-rose-600 text-white font-bold', idleCls: overdueCount > 0 ? 'text-rose-600 font-bold' : 'text-slate-600' },
                        { id: 'APPROVED_RESOLVED', label: `Completed (${qcAlerts.filter((q) => q.status === 'APPROVED_RESOLVED').length})`, activeCls: 'bg-emerald-100 text-emerald-900 font-bold', idleCls: 'text-slate-600' },
                    ] as const).map((tab) => (
                        <button key={tab.id} type="button" onClick={() => setStatusFilter(tab.id)} className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${statusFilter === tab.id ? tab.activeCls : tab.idleCls}`}>
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="relative w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input type="text" placeholder="Filter batch, SKU or staff..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500" />
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                        <th className="py-3 px-4">Batch &amp; SKU</th>
                        <th className="py-3 px-2.5">Risk Level</th>
                        <th className="py-3 px-2.5">Product &amp; Trigger Reason</th>
                        <th className="py-3 px-2.5">AI Recommendation (Click-In)</th>
                        <th className="py-3 px-2.5">Loss Preventable ({currency})</th>
                        <th className="py-3 px-2.5">Warehouse Assignee</th>
                        <th className="py-3 px-2.5">Task Due Date &amp; SLA</th>
                        <th className="py-3 px-4">Warehouse Task Action</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAlerts.map((qc) => {
                        const isUrgent = qc.daysLeft <= 5;
                        const convertedSaved = (qc.savedRM * exchangeRate).toFixed(2);
                        const isOverdueActive = qc.status === 'ASSIGNED_TO_STAFF' && Boolean(qc.assignedDueDate && qc.assignedDueDate < todayIso);
                        const wasCompletedLate = isCompletedPastDue(qc);

                        return (
                            <tr key={qc.id} className={`transition ${isOverdueActive ? 'bg-rose-50/35 hover:bg-rose-50/60' : 'hover:bg-slate-50/80'}`}>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                    <p className="font-mono font-bold text-slate-900">{qc.batchNo}</p>
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">{qc.sku} • {qc.qtyAffected}</span>
                                </td>
                                <td className="py-3.5 px-2.5 whitespace-nowrap">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold inline-flex items-center gap-1 ${isUrgent ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}>
                      <AlertTriangle className="w-3 h-3" /> {isUrgent ? `${qc.daysLeft}d Left (Urgent)` : 'Batch Defect'}
                    </span>
                                </td>
                                <td className="py-3.5 px-2.5 max-w-[190px]">
                                    <p className="font-bold text-slate-900 truncate" title={qc.productName}>{qc.productName}</p>
                                    <p className="text-[11px] text-slate-500 truncate" title={qc.triggerReason}>{qc.triggerReason}</p>
                                </td>
                                <td className="py-3.5 px-2.5">
                                    <button type="button" onClick={() => openAiRecommendationModal(qc)} className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-800 font-bold text-xs inline-flex items-center gap-1.5 transition cursor-pointer max-w-[215px]">
                                        <Sparkles className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                                        <span className="truncate">{qc.actionLabel}</span>
                                        <span className="bg-purple-200/80 text-purple-900 text-[10px] px-1.5 py-0.5 rounded font-extrabold shrink-0">Click-In</span>
                                    </button>
                                </td>
                                <td className="py-3.5 px-2.5 font-extrabold text-emerald-700 whitespace-nowrap">
                                    {currencySymbol} {Number(convertedSaved).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-3.5 px-2.5 whitespace-nowrap">
                                    {qc.assignedStaffName ? (
                                        <div>
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                          <UserCheck className="w-3 h-3 text-blue-600" /> {qc.assignedStaffName}
                        </span>
                                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">{qc.hrTaskId} • {qc.assignedPriority}</p>
                                        </div>
                                    ) : (
                                        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-500">Unassigned (Warehouse Roster)</span>
                                    )}
                                </td>
                                <td className="py-3.5 px-2.5 whitespace-nowrap">
                                    {qc.assignedDueDate ? (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1 font-mono text-xs font-bold text-slate-800">
                                                <Calendar className="w-3 h-3 text-slate-400" /> <span>{qc.assignedDueDate}</span>
                                            </div>
                                            {qc.status === 'APPROVED_RESOLVED' ? (
                                                wasCompletedLate ? (
                                                    <div className="flex items-center gap-1">
                                                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Completed Late (Past Due)</span>
                                                        {qc.hrEscalationPayload && (
                                                            <button type="button" onClick={() => setInspectingPayload(qc.hrEscalationPayload!)} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 hover:bg-slate-700 text-emerald-300 inline-flex items-center gap-1 cursor-pointer" title="Inspect JSON escalation payload">
                                                                <FileCode className="w-2.5 h-2.5" /> Payload
                                                            </button>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">Completed On Time</span>
                                                )
                                            ) : isOverdueActive ? (
                                                <div className="flex items-center gap-1">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-600 text-white">OVERDUE • ESCALATED</span>
                                                    {qc.hrEscalationPayload && (
                                                        <button type="button" onClick={() => setInspectingPayload(qc.hrEscalationPayload!)} className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 hover:bg-slate-700 text-emerald-300 inline-flex items-center gap-1 cursor-pointer" title="Inspect JSON escalation payload">
                                                            <FileCode className="w-2.5 h-2.5" /> Payload
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">On Track</span>
                                                    <button type="button" onClick={() => handleSimulatePastDueAndEscalate(qc)} className="text-[10px] text-rose-600 hover:underline font-semibold cursor-pointer" title="Simulate task passing due date while undone">
                                                        Simulate Overdue
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-[11px] text-slate-400 italic">No due date set</span>
                                    )}
                                </td>
                                <td className="py-3.5 px-4 whitespace-nowrap">
                                    {qc.status === 'PENDING_APPROVAL' && (
                                        <button type="button" onClick={() => openAiRecommendationModal(qc)} className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer">
                                            <Users className="w-3.5 h-3.5" /> Assign Staff
                                        </button>
                                    )}
                                    {qc.status === 'ASSIGNED_TO_STAFF' && (
                                        <button type="button" onClick={() => onCompleteHrTask(qc.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 transition cursor-pointer">
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Done
                                        </button>
                                    )}
                                    {qc.status === 'APPROVED_RESOLVED' && (
                                        wasCompletedLate ? (
                                            <span className="px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-amber-700" /> Resolved (Late)
                        </span>
                                        ) : (
                                            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Resolved by Staff
                        </span>
                                        )
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            </div>

            {selectedQcModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <form onSubmit={handleConfirmStaffDispatch} noValidate className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">Warehouse Task Assignment</span>
                                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedQcModal.productName} ({selectedQcModal.batchNo})</h3>
                                <p className="text-xs text-slate-500">SKU: {selectedQcModal.sku} • Affected: {selectedQcModal.qtyAffected} • Expiry: {selectedQcModal.expiryDate}</p>
                            </div>
                            <button type="button" onClick={() => setSelectedQcModal(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200 space-y-2 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-purple-900 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-purple-600" /> AI Root-Cause &amp; Recommended Action</span>
                                <span className="font-extrabold text-emerald-700">Saves {currencySymbol} {(selectedQcModal.savedRM * exchangeRate).toFixed(2)}</span>
                            </div>
                            <p className="text-slate-700 leading-relaxed">{selectedQcModal.aiSuggestion}</p>
                            <p className="text-[11px] text-rose-600 font-semibold">Trigger: {selectedQcModal.triggerReason}</p>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Assign to Warehouse Staff Member *</label>
                                <select value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900 focus:outline-none focus:border-emerald-500">
                                    {WAREHOUSE_STAFF_ROSTER.map((st) => <option key={st.staffId} value={st.staffId}>{st.name} ({st.staffId}) — {st.position} [{st.department}]</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">Task Priority</label>
                                    <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as 'URGENT' | 'HIGH' | 'NORMAL')} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-bold text-slate-900">
                                        <option value="URGENT">URGENT (Execute &lt; 2 hrs)</option>
                                        <option value="HIGH">HIGH (Same Shift)</option>
                                        <option value="NORMAL">NORMAL (Within 24 hrs)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 flex items-center gap-1 mb-1"><Clock className="w-3.5 h-3.5 text-rose-600" /> Completion Due Date *</label>
                                    <input type="date" value={taskDueDate} onChange={(e) => { setTaskDueDate(e.target.value); setDueDateError(''); }} className={`w-full px-3 py-2 rounded-xl bg-white border font-mono font-bold text-slate-900 focus:outline-none ${dueDateError ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'}`} />
                                    {dueDateError && <p className="text-[10px] text-rose-600 font-semibold mt-1">{dueDateError}</p>}
                                </div>
                            </div>

                            <p className="text-[11px] text-slate-500 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200">
                                <strong>SLA Rule:</strong> If the assigned warehouse staff member leaves this task undone past the due date, Vyte automatically sends an overdue escalation payload to the Warehouse Supervisor.
                            </p>

                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Action Instructions for Warehouse Staff (Editable)</label>
                                <textarea rows={2} value={taskInstruction} onChange={(e) => setTaskInstruction(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-800 focus:outline-none focus:border-emerald-500" />
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                            <button type="button" onClick={() => setSelectedQcModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">Cancel</button>
                            <button type="submit" disabled={!canApprove} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer">
                                <Send className="w-3.5 h-3.5" /> {canApprove ? 'Approve & Assign to Warehouse Staff' : 'Requires Owner/Manager Role'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {inspectingPayload && (
                <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-[#14181D] text-slate-100 rounded-2xl border border-slate-700 max-w-xl w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3">
                            <div>
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 uppercase">POST /api/warehouse-ops/overdue-escalation</span>
                                <h3 className="text-base font-bold text-white mt-1.5">Overdue Warehouse Task Escalation Payload</h3>
                                <p className="text-xs text-slate-400">Dispatched because task <strong>{inspectingPayload.hrTaskId}</strong> remained undone past its due date (<strong>{inspectingPayload.taskDetails.assignedDueDate}</strong>).</p>
                            </div>
                            <button type="button" onClick={() => setInspectingPayload(null)} className="p-1 text-slate-400 hover:text-white cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => {
                                    void navigator.clipboard.writeText(JSON.stringify(inspectingPayload, null, 2));
                                    setCopiedPayload(true);
                                    setTimeout(() => setCopiedPayload(false), 2000);
                                }}
                                className="absolute right-3 top-3 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-400 flex items-center gap-1 cursor-pointer border border-slate-700"
                            >
                                {copiedPayload ? <><Check className="w-3.5 h-3.5" /> Copied</> : <><Copy className="w-3.5 h-3.5" /> Copy JSON</>}
                            </button>
                            <pre className="p-4 rounded-xl bg-[#0B0C0E] border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-80 leading-relaxed">
                {JSON.stringify(inspectingPayload, null, 2)}
              </pre>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-800">
                            <button type="button" onClick={() => setInspectingPayload(null)} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-500 text-slate-950 font-bold text-xs rounded-xl cursor-pointer">
                                Close Payload Inspector
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};