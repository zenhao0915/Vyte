// src/modules/module6-compliance/ComplianceRenewalModule.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowUpRight, Bot, Building2, CheckCircle2, ExternalLink,
    FileCheck, FileText, FolderLock, Lock, Plus, RefreshCw, Search, Send, ShieldCheck,
    Sparkles, Upload, UserCheck, X,
} from 'lucide-react';
import type {
    BusinessComplianceProfile, CheckComplianceExpiryResponse, ComplianceDocType,
    ComplianceStatus, CurrencyCode, DocumentVaultItem, LicenseType, RenewalTask,
    SSMVerifyResponse, UserRole,
} from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { complianceApi } from '../../services/api.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown.tsx';

interface ComplianceRenewalModuleProps {
    profiles: BusinessComplianceProfile[];
    setProfiles: React.Dispatch<React.SetStateAction<BusinessComplianceProfile[]>>;
    vaultDocs: DocumentVaultItem[];
    setVaultDocs: React.Dispatch<React.SetStateAction<DocumentVaultItem[]>>;
    renewalTasks: RenewalTask[];
    setRenewalTasks: React.Dispatch<React.SetStateAction<RenewalTask[]>>;
    role: UserRole;
    userID: string;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onLogAction: (module: string, detail: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

const PBT_COUNCIL_OPTIONS = [
    { label: 'All Councils (PBT)', value: 'ALL' },
    { label: 'MBPJ (Petaling Jaya)', value: 'MBPJ' },
    { label: 'DBKL (Kuala Lumpur)', value: 'DBKL' },
    { label: 'MBSA (Shah Alam)', value: 'MBSA' },
    { label: 'MBSJ (Subang Jaya)', value: 'MBSJ' },
];

const LICENSE_TYPE_OPTIONS: { label: string; value: LicenseType }[] = [
    { label: 'Premise License (Lesen Premis)', value: 'PREMISE_LICENSE' },
    { label: 'Signboard License (Lesen Iklan)', value: 'SIGNBOARD_LICENSE' },
    { label: 'Food Establishment (Premis Makanan)', value: 'FOOD_ESTABLISHMENT' },
];

const DOC_TYPE_OPTIONS: { label: string; value: ComplianceDocType }[] = [
    { label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9' },
    { label: 'Stamped Tenancy Agreement', value: 'TENANCY_AGREEMENT' },
    { label: 'Renovated Premise Floor Plan', value: 'FLOOR_PLAN' },
    { label: 'BOMBA Fire Safety Certificate', value: 'FIRE_SAFETY_CERT' },
    { label: 'Previous Year PBT License', value: 'PREVIOUS_LICENSE' },
];

function useLocalDraft<T>(key: string, fallback: T) {
    const [val, setVal] = useState<T>(() => {
        try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; }
    });
    useEffect(() => { localStorage.setItem(key, JSON.stringify(val)); }, [key, val]);
    return [val, setVal] as const;
}

export const ComplianceRenewalModule: React.FC<ComplianceRenewalModuleProps> = ({
                                                                                    profiles, setProfiles, vaultDocs, setVaultDocs, renewalTasks, setRenewalTasks,
                                                                                    role, userID, currency = 'MYR', exchangeRate = 1.0, onLogAction, onTriggerLoadingScreen,
                                                                                }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const isAuthorizedApprover = role === 'SME_OWNER' || role === 'MANAGER';

    const [activeSubView, setActiveSubView] = useState<'ssm_expiry' | 'vault' | 'concierge'>('ssm_expiry');
    const [toastBanner, setToastBanner] = useState<{ type: 'success' | 'warning' | 'error' | 'info'; message: string } | null>(null);
    const showToast = (type: 'success' | 'warning' | 'error' | 'info', message: string) => {
        setToastBanner({ type, message });
        setTimeout(() => setToastBanner(null), 4500);
    };

    const [ssmDraft, setSsmDraft] = useLocalDraft('vyte_mod6_ssm_lookup_draft_v1', {
        registrationNo: '202401048291', companyName: 'ACME TECH SDN. BHD.',
        councilName: 'MBPJ', licenseType: 'PREMISE_LICENSE' as LicenseType, licenseExpiryDate: '2026-11-30',
    });
    const [ssmErrors, setSsmErrors] = useState<{ registrationNo?: string; companyName?: string }>({});
    const [isVerifyingSsm, setIsVerifyingSsm] = useState(false);
    const [ssmResult, setSsmResult] = useState<SSMVerifyResponse | null>(null);

    const [expiryThresholdDays, setExpiryThresholdDays] = useState(60);
    const [councilFilter, setCouncilFilter] = useState('ALL');
    const [isScanningExpiry, setIsScanningExpiry] = useState(false);
    const [expiryCheckResponse, setExpiryCheckResponse] = useState<CheckComplianceExpiryResponse | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [vaultDraft, setVaultDraft] = useLocalDraft('vyte_mod6_vault_upload_draft_v1', {
        registrationNo: '202401048291', docType: 'TENANCY_AGREEMENT' as ComplianceDocType,
        fileUrl: 'https://storage.local/compliance/tenancy_2026.pdf', fileSizeKb: '1420',
        effectiveDate: '2026-01-01', expiryDate: '2028-12-31',
    });
    const [vaultErrors, setVaultErrors] = useState<{ fileUrl?: string; effectiveDate?: string; expiryDate?: string }>({});
    const [isUploadingDoc, setIsUploadingDoc] = useState(false);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(['DOC-99401', 'DOC-99388', 'DOC-99350']);

    const [renewalForm, setRenewalForm] = useLocalDraft('vyte_mod6_renewal_init_draft_v1', {
        registrationNo: '202401048291', councilName: 'MBPJ', licenseType: 'PREMISE_LICENSE' as LicenseType,
        filingMode: 'CONCIERGE_MANUAL_SUBMISSION' as 'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_GUIDED_CHECKLIST',
        renewalFeeEstimate: '450.00', internalNotes: 'Premise renovation completed; updated floor plan attached.',
    });
    const [isInitiatingRenewal, setIsInitiatingRenewal] = useState(false);
    const [activeTaskModal, setActiveTaskModal] = useState<RenewalTask | null>(null);
    const [taskUpdateForm, setTaskUpdateForm] = useState({
        action: 'SUBMIT_APPLICATION', submissionReferenceNo: 'MBPJ-LIC-2026-88192',
        pbtReceiptUrl: 'https://storage.local/receipts/mbpj_receipt_88192.pdf',
        agentNotes: 'Submitted via MBPJ portal desk. Pending council inspector site visit.',
    });
    const [isUpdatingTask, setIsUpdatingTask] = useState(false);

    const computeDaysRemaining = (isoDate: string) => {
        const t = new Date(isoDate).getTime();
        return isNaN(t) ? 30 : Math.ceil((t - new Date('2026-10-23T00:00:00Z').getTime()) / 86400000);
    };

    const handleVerifySsm = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: { registrationNo?: string; companyName?: string } = {};
        if (!ssmDraft.registrationNo.trim() || ssmDraft.registrationNo.trim().length < 6) errs.registrationNo = 'Valid SSM Registration No. (ROC/ROB) is required.';
        if (!ssmDraft.companyName.trim() || ssmDraft.companyName.trim().length < 3) errs.companyName = 'Company name is required (min 3 characters).';
        if (errs.registrationNo || errs.companyName) return setSsmErrors(errs);

        setSsmErrors({}); setIsVerifyingSsm(true);
        onTriggerLoadingScreen?.('Querying Real-Time SSM Data Feed...', 750);
        try {
            const res = await complianceApi.verifySsmBusiness({ registrationNo: ssmDraft.registrationNo.trim(), companyName: ssmDraft.companyName.trim(), userID });
            setSsmResult(res.data);
            onLogAction('SSM Verification', `Verified SSM ${res.data.registrationNo} (${res.data.companyName}) • Status: ${res.data.ssmStatus}.`);
            showToast('success', `SSM Verified via ${res.data.verificationSource}: ${res.data.companyName} (${res.data.companyType})`);
        } finally { setIsVerifyingSsm(false); }
    };

    const handleSaveVerifiedProfile = () => {
        if (!ssmResult) return;
        const daysLeft = computeDaysRemaining(ssmDraft.licenseExpiryDate);
        const newProfile: BusinessComplianceProfile = {
            registrationNo: ssmResult.registrationNo, companyName: ssmResult.companyName, companyType: ssmResult.companyType,
            ssmExpiryDate: ssmResult.ssmExpiryDate, councilName: ssmDraft.councilName, licenseType: ssmDraft.licenseType,
            licenseExpiryDate: ssmDraft.licenseExpiryDate, complianceStatus: daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE', autoAlertEnabled: true,
        };
        setProfiles((p) => p.some((x) => x.registrationNo === newProfile.registrationNo && x.licenseType === newProfile.licenseType)
            ? p.map((x) => (x.registrationNo === newProfile.registrationNo && x.licenseType === newProfile.licenseType ? newProfile : x))
            : [newProfile, ...p]);
        onLogAction('Compliance Profile', `Saved compliance profile for ${newProfile.companyName}.`);
        showToast('success', `Saved ${newProfile.companyName} to monitored compliance profiles.`);
    };

    const handleRunExpiryCheck = async (customCouncil?: string, customDays?: number) => {
        const targetCouncil = customCouncil ?? councilFilter;
        const targetDays = customDays ?? expiryThresholdDays;
        setIsScanningExpiry(true);
        try {
            const matching = profiles.filter((p) => (targetCouncil === 'ALL' || p.councilName === targetCouncil) && computeDaysRemaining(p.licenseExpiryDate) <= targetDays);
            const fallback: CheckComplianceExpiryResponse = {
                lastCheckedAt: new Date().toISOString(),
                totalLicensesMonitored: profiles.length,
                expiringItems: matching.map((p) => {
                    const daysRemaining = computeDaysRemaining(p.licenseExpiryDate);
                    return {
                        registrationNo: p.registrationNo, companyName: p.companyName, licenseType: p.licenseType, councilName: p.councilName,
                        expiryDate: p.licenseExpiryDate, daysRemaining,
                        urgencyLevel: daysRemaining < 0 ? 'EXPIRED' : daysRemaining <= 60 ? 'EXPIRING_SOON' : 'ACTIVE',
                        actionRequired: p.licenseType === 'PREMISE_LICENSE' ? 'Prepare floor plan and tenancy agreement for assisted PBT filing' : p.licenseType === 'FOOD_ESTABLISHMENT' ? 'Compile typhoid vaccination records, floor plan & SSM Form 9' : 'Attach visual signboard artwork & BOMBA endorsement for PBT renewal',
                    };
                }),
            };
            const res = await complianceApi.checkComplianceExpiry({ expiryThresholdDays: targetDays, councilFilter: targetCouncil === 'ALL' ? 'MBPJ' : targetCouncil, userID }, fallback);
            setExpiryCheckResponse(res.data);
            onLogAction('Compliance Expiry Scan', `Scanned ${res.data.totalLicensesMonitored} licenses • Found ${res.data.expiringItems.length} expiring item(s).`);
        } finally { setIsScanningExpiry(false); }
    };

    useEffect(() => { void handleRunExpiryCheck(); }, [expiryThresholdDays, councilFilter, profiles]);

    const handleUploadVaultDoc = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: { fileUrl?: string; effectiveDate?: string; expiryDate?: string } = {};
        if (!vaultDraft.fileUrl.trim()) errs.fileUrl = 'Document URL or uploaded file is required.';
        if (!vaultDraft.effectiveDate) errs.effectiveDate = 'Effective date is required.';
        if (!vaultDraft.expiryDate) errs.expiryDate = 'Expiry date is required.';
        if (Object.values(errs).some(Boolean)) return setVaultErrors(errs);

        setVaultErrors({}); setIsUploadingDoc(true);
        onTriggerLoadingScreen?.('Indexing & Formatting Document for PBT Packet...', 750);
        try {
            const sizeKb = Math.max(1, Number(vaultDraft.fileSizeKb) || 1024);
            const res = await complianceApi.uploadComplianceVaultDoc({
                registrationNo: vaultDraft.registrationNo, docType: vaultDraft.docType, fileUrl: vaultDraft.fileUrl.trim(),
                fileSizeKb: sizeKb, effectiveDate: vaultDraft.effectiveDate, expiryDate: vaultDraft.expiryDate, createdBy: userID,
            });
            const newDoc: DocumentVaultItem = {
                docID: res.data.docID, registrationNo: res.data.registrationNo, docType: res.data.docType,
                fileUrl: vaultDraft.fileUrl.trim(), fileSizeKb: sizeKb, effectiveDate: vaultDraft.effectiveDate,
                expiryDate: vaultDraft.expiryDate, uploadedAt: res.data.storedAt, uploadedBy: userID,
            };
            setVaultDocs((p) => [newDoc, ...p]);
            setSelectedDocIds((p) => (p.includes(newDoc.docID) ? p : [...p, newDoc.docID]));
            onLogAction('Document Vault', `Indexed ${res.data.docType} (${res.data.docID}) for SSM ${res.data.registrationNo}.`);
            showToast('success', `${res.data.docID}: ${res.data.message}`);
        } finally { setIsUploadingDoc(false); }
    };

    const toggleVaultDocSelection = (docID: string) => setSelectedDocIds((p) => (p.includes(docID) ? p.filter((id) => id !== docID) : [...p, docID]));

    const handleInitiateRenewal = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isAuthorizedApprover) return showToast('error', 'RBAC Restriction: Only Owner or Manager accounts can initiate PBT renewal filings.');
        if (!selectedDocIds.length) return showToast('warning', 'Please select at least 1 compliance document from the Vault packet.');

        setIsInitiatingRenewal(true);
        onTriggerLoadingScreen?.('Packaging Vault Documents & Initiating Concierge Renewal...', 850);
        try {
            const feeNum = Math.max(0, Number(renewalForm.renewalFeeEstimate) || 450);
            const res = await complianceApi.initiateComplianceRenewal({
                registrationNo: renewalForm.registrationNo, councilName: renewalForm.councilName, licenseType: renewalForm.licenseType,
                filingMode: renewalForm.filingMode, selectedDocumentIds: selectedDocIds, renewalFeeEstimate: feeNum,
                currency, internalNotes: renewalForm.internalNotes.trim(), createdBy: userID,
            });
            const matchedCompany = profiles.find((p) => p.registrationNo === renewalForm.registrationNo)?.companyName || 'ACME TECH SDN. BHD.';
            setRenewalTasks((p) => [{
                renewalID: res.data.renewalID, registrationNo: renewalForm.registrationNo, companyName: matchedCompany,
                councilName: res.data.targetCouncil, licenseType: renewalForm.licenseType, filingMode: renewalForm.filingMode,
                status: res.data.status, assignedAgentID: res.data.assignedAgentID, pbtPortalUrl: res.data.pbtPortalUrl,
                submissionReferenceNo: null, compiledSubmissionPdfUrl: res.data.compiledSubmissionPdfUrl,
                generatedChecklist: res.data.generatedChecklist, targetDeadline: res.data.deadlineDate,
                renewalFee: feeNum, currency, internalNotes: renewalForm.internalNotes.trim(), createdAt: res.data.createdAt,
            }, ...p]);
            setProfiles((p) => p.map((x) => (x.registrationNo === renewalForm.registrationNo && x.licenseType === renewalForm.licenseType ? { ...x, complianceStatus: 'PENDING_RENEWAL' } : x)));
            onLogAction('Compliance Renewal', `Initiated ${res.data.renewalID} (${res.data.targetCouncil} - ${renewalForm.licenseType}).`);
            showToast('success', `Initiated Renewal ${res.data.renewalID} (${res.data.status}).`);
        } finally { setIsInitiatingRenewal(false); }
    };

    const handleUpdateRenewalTaskStatus = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!activeTaskModal) return;
        setIsUpdatingTask(true);
        onTriggerLoadingScreen?.(`Recording PBT Reference Slip for ${activeTaskModal.renewalID}...`, 800);
        try {
            const res = await complianceApi.updateRenewalTaskStatus({
                renewalID: activeTaskModal.renewalID, action: taskUpdateForm.action,
                submissionReferenceNo: taskUpdateForm.submissionReferenceNo.trim(), pbtReceiptUrl: taskUpdateForm.pbtReceiptUrl.trim(),
                agentNotes: taskUpdateForm.agentNotes.trim(), updatedBy: activeTaskModal.assignedAgentID || userID,
            });
            setRenewalTasks((p) => p.map((t) => t.renewalID === activeTaskModal.renewalID ? {
                ...t, status: res.data.currentStatus, submissionReferenceNo: res.data.submissionReferenceNo,
                pbtReceiptUrl: taskUpdateForm.pbtReceiptUrl.trim(), agentNotes: taskUpdateForm.agentNotes.trim(),
                nextFollowUpDate: res.data.nextFollowUpDate, updatedAt: res.data.updatedAt,
                generatedChecklist: t.generatedChecklist.map((s) => ({ ...s, isCompleted: true })),
            } : t));
            if (res.data.currentStatus === 'APPROVED') {
                setProfiles((p) => p.map((x) => (x.registrationNo === activeTaskModal.registrationNo ? { ...x, complianceStatus: 'ACTIVE' } : x)));
            }
            onLogAction('Concierge PBT Filing', `Updated ${activeTaskModal.renewalID} to ${res.data.currentStatus}.`);
            showToast('success', `${activeTaskModal.renewalID}: ${res.data.message}`);
            setActiveTaskModal(null);
        } finally { setIsUpdatingTask(false); }
    };

    const expiringCount = useMemo(() => profiles.filter((p) => p.complianceStatus === 'EXPIRING_SOON' || p.complianceStatus === 'EXPIRED').length, [profiles]);
    const statusBadgeStyle = (s: ComplianceStatus | string) =>
        s === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : s === 'EXPIRING_SOON' ? 'bg-amber-100 text-amber-800 border-amber-200' : s === 'EXPIRED' ? 'bg-rose-100 text-rose-700 border-rose-200' : s === 'PENDING_RENEWAL' ? 'bg-blue-100 text-blue-800 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200';

    const regOptions = useMemo(() => Array.from(new Set(profiles.map((p) => p.registrationNo))).map((reg) => ({
        label: `${reg} — ${profiles.find((p) => p.registrationNo === reg)?.companyName || 'Company'}`,
        value: reg,
    })), [profiles]);

    return (
        <div className="space-y-4 select-none">
            {toastBanner && (
                <div className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl shadow-xl border bg-slate-900 text-white border-slate-700 flex items-center gap-2.5 text-xs font-semibold">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" /><span>{toastBanner.message}</span>
                </div>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { icon: Building2, bg: 'bg-emerald-500', label: 'Monitored SSM & PBT Profiles', val: `${profiles.length} Entities`, valCls: 'text-slate-900', sub: 'SSM_DATA_FEED Live Sync', subCls: 'text-emerald-600 font-semibold' },
                    { icon: AlertTriangle, bg: 'bg-amber-500', label: 'Expiring / Action Required', val: `${expiringCount} Licenses`, valCls: 'text-amber-600', sub: `Threshold: ${expiryThresholdDays}-Day Radar`, subCls: 'text-slate-400' },
                    { icon: FolderLock, bg: 'bg-purple-600', label: 'Centralized Document Vault', val: `${vaultDocs.length} Indexed`, valCls: 'text-purple-600', sub: `${selectedDocIds.length} Selected for PBT Packet`, subCls: 'text-emerald-600 font-semibold' },
                    { icon: Bot, bg: 'bg-blue-600', label: 'Concierge / RPA Renewals', val: `${renewalTasks.length} Tasks`, valCls: 'text-blue-600', sub: 'MBPJ, DBKL & MBSA Portals', subCls: 'text-slate-400' },
                ].map((k, idx) => {
                    const Icon = k.icon;
                    return (
                        <div key={idx} className="bg-white px-4 py-3.5 rounded-xl border border-slate-200/90 shadow-xs flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg ${k.bg} text-white flex items-center justify-center shrink-0`}><Icon className="w-5 h-5" /></div>
                            <div className="min-w-0">
                                <p className="text-[11px] text-slate-500 font-medium truncate">{k.label}</p>
                                <p className={`text-xl font-extrabold ${k.valCls} leading-tight`}>{k.val}</p>
                                <span className={`text-[10px] ${k.subCls} block truncate`}>{k.sub}</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                    {[
                        { id: 'ssm_expiry' as const, icon: ShieldCheck, icCls: 'text-emerald-600', label: `1. SSM Lookup & Expiry Radar (${profiles.length})` },
                        { id: 'vault' as const, icon: FolderLock, icCls: 'text-purple-600', label: `2. Document Vault & Packet Builder (${vaultDocs.length})` },
                        { id: 'concierge' as const, icon: Bot, icCls: 'text-blue-600', label: `3. Concierge & RPA Assisted Filing (${renewalTasks.length})` },
                    ].map((t) => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} type="button" onClick={() => setActiveSubView(t.id)} className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${activeSubView === t.id ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                                <Icon className={`w-3.5 h-3.5 ${t.icCls}`} />{t.label}
                            </button>
                        );
                    })}
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 font-semibold flex items-center gap-2">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>PDPA &amp; Malaysian PBT Compliant: Uses SSM Data Feeds + Assisted Concierge/RPA Filing (No Open Govt Write-APIs)</span>
                </div>
            </div>

            {activeSubView === 'ssm_expiry' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Search className="w-4 h-4 text-emerald-600" /> Real-Time SSM Business Lookup</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Verify registration numbers &amp; detect 12-month renewal window</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-mono font-bold">POST /ssm-verify</span>
                        </div>

                        <form onSubmit={handleVerifySsm} noValidate className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">SSM Registration No. (12-Digit New / ROC / ROB) *</label>
                                <input type="text" placeholder="e.g., 202401048291" value={ssmDraft.registrationNo} onChange={(e) => setSsmDraft({ ...ssmDraft, registrationNo: e.target.value })} className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:border-[#2BB656]" />
                                {ssmErrors.registrationNo && <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {ssmErrors.registrationNo}</p>}
                            </div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Registered Company Name *</label>
                                <input type="text" placeholder="e.g., ACME TECH SDN. BHD." value={ssmDraft.companyName} onChange={(e) => setSsmDraft({ ...ssmDraft, companyName: e.target.value })} className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-[#2BB656]" />
                                {ssmErrors.companyName && <p className="text-[11px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {ssmErrors.companyName}</p>}
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">Target Council (PBT)</label>
                                    <VyteDropdown variant="light" size="sm" value={ssmDraft.councilName} onChange={(v) => setSsmDraft({ ...ssmDraft, councilName: v })} options={PBT_COUNCIL_OPTIONS.filter((o) => o.value !== 'ALL')} />
                                </div>
                                <div>
                                    <label className="font-bold text-slate-700 block mb-1">PBT License Expiry</label>
                                    <input type="date" value={ssmDraft.licenseExpiryDate} onChange={(e) => setSsmDraft({ ...ssmDraft, licenseExpiryDate: e.target.value })} className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 font-mono text-xs font-bold text-slate-900" />
                                </div>
                            </div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">License Category</label>
                                <VyteDropdown<LicenseType> variant="light" size="sm" value={ssmDraft.licenseType} onChange={(v) => setSsmDraft({ ...ssmDraft, licenseType: v })} options={LICENSE_TYPE_OPTIONS} />
                            </div>
                            <button type="submit" disabled={isVerifyingSsm} className="w-full py-2.5 px-4 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                                <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSsm ? 'animate-spin' : ''}`} />
                                {isVerifyingSsm ? 'Verifying with SSM Data Feed...' : 'Verify SSM & Auto-Populate Profile'}
                            </button>
                        </form>

                        {ssmResult && (
                            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-2.5 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">{ssmResult.verificationSource} • {ssmResult.ssmStatus}</span>
                                    <span className="font-mono text-[11px] text-slate-500">{ssmResult.companyType}</span>
                                </div>
                                <div>
                                    <p className="font-extrabold text-slate-900 text-sm">{ssmResult.companyName}</p>
                                    <p className="font-mono text-xs text-slate-600">SSM Reg No: {ssmResult.registrationNo}</p>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-emerald-200/70">
                                    <div><span className="text-[10px] text-slate-500 block">SSM Expiry Date</span><strong className="font-mono text-slate-900">{ssmResult.ssmExpiryDate} ({ssmResult.daysUntilExpiry}d)</strong></div>
                                    <div><span className="text-[10px] text-slate-500 block">12-Month Renewal Window</span><strong className="text-emerald-700">{ssmResult.isWithinRenewalWindow ? '✓ Eligible for Renewal' : 'Not Yet Due'}</strong></div>
                                </div>
                                <button type="button" onClick={handleSaveVerifiedProfile} className="w-full mt-2 py-2 bg-slate-900 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                                    <Plus className="w-3.5 h-3.5" /> Save / Update in Monitored Profiles
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> License &amp; PBT Compliance Expiry Alert Scanner</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Scans SSM dates, premise licenses &amp; signboard renewals to trigger proactive warnings</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="w-36"><VyteDropdown variant="soft" size="sm" prefix="PBT:" value={councilFilter} onChange={setCouncilFilter} options={PBT_COUNCIL_OPTIONS} /></div>
                                <div className="w-40"><VyteDropdown<number> variant="soft" size="sm" prefix="Window:" value={expiryThresholdDays} onChange={(v) => setExpiryThresholdDays(Number(v))} options={[{ label: '30 Days', value: 30 }, { label: '60 Days', value: 60 }, { label: '90 Days', value: 90 }, { label: '180 Days', value: 180 }, { label: '365 Days (All)', value: 365 }]} /></div>
                                <button type="button" onClick={() => void handleRunExpiryCheck()} className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                                    <RefreshCw className={`w-3.5 h-3.5 ${isScanningExpiry ? 'animate-spin' : ''}`} /> Scan Now
                                </button>
                            </div>
                        </div>

                        {expiryCheckResponse && expiryCheckResponse.expiringItems.length > 0 && (
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between text-[11px] text-slate-500">
                                    <span>Showing <strong className="text-slate-800">{expiryCheckResponse.expiringItems.length}</strong> alert(s) out of {expiryCheckResponse.totalLicensesMonitored} monitored licenses</span>
                                    <span className="font-mono">Checked: {expiryCheckResponse.lastCheckedAt.slice(0, 19).replace('T', ' ')}Z</span>
                                </div>
                                {expiryCheckResponse.expiringItems.map((item, idx) => (
                                    <div key={`${item.registrationNo}-${item.licenseType}-${idx}`} className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200 flex flex-wrap items-center justify-between gap-3 text-xs">
                                        <div className="space-y-1 max-w-md">
                                            <div className="flex items-center gap-2">
                                                <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[10px] font-bold">{item.councilName}</span>
                                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadgeStyle(item.urgencyLevel)}`}>{item.urgencyLevel} ({item.daysRemaining}d left)</span>
                                                <span className="font-mono text-[11px] text-slate-500">Exp: {item.expiryDate}</span>
                                            </div>
                                            <p className="font-bold text-slate-900">{item.companyName} <span className="font-mono text-slate-500 font-normal">({item.registrationNo})</span> • {item.licenseType.replace(/_/g, ' ')}</p>
                                            <p className="text-[11px] text-amber-900 font-medium">Action Required: {item.actionRequired}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => { setRenewalForm((p) => ({ ...p, registrationNo: item.registrationNo, councilName: item.councilName, licenseType: item.licenseType as LicenseType })); setActiveSubView('concierge'); }}
                                            className="px-3 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer shrink-0"
                                        >
                                            Prepare Assisted Filing <ArrowUpRight className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                    <th className="py-2.5 px-3.5">Company &amp; SSM No.</th>
                                    <th className="py-2.5 px-3">PBT &amp; License</th>
                                    <th className="py-2.5 px-3">SSM Expiry</th>
                                    <th className="py-2.5 px-3">License Expiry</th>
                                    <th className="py-2.5 px-3">Status</th>
                                    <th className="py-2.5 px-3 text-center">Auto-Alert</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {profiles.map((prof) => (
                                    <tr key={`${prof.registrationNo}-${prof.licenseType}`} className="hover:bg-slate-50/70">
                                        <td className="py-2.5 px-3.5"><p className="font-bold text-slate-900">{prof.companyName}</p><p className="font-mono text-[11px] text-slate-500">{prof.registrationNo} • {prof.companyType}</p></td>
                                        <td className="py-2.5 px-3"><span className="font-bold text-slate-800">{prof.councilName}</span><span className="block text-[11px] text-slate-500">{prof.licenseType.replace(/_/g, ' ')}</span></td>
                                        <td className="py-2.5 px-3 font-mono text-slate-700">{prof.ssmExpiryDate}</td>
                                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{prof.licenseExpiryDate}</td>
                                        <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${statusBadgeStyle(prof.complianceStatus)}`}>{prof.complianceStatus}</span></td>
                                        <td className="py-2.5 px-3 text-center">
                                            <input type="checkbox" checked={prof.autoAlertEnabled} onChange={() => setProfiles((p) => p.map((x) => (x.registrationNo === prof.registrationNo && x.licenseType === prof.licenseType ? { ...x, autoAlertEnabled: !x.autoAlertEnabled } : x)))} className="w-4 h-4 accent-[#2BB656] cursor-pointer" />
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeSubView === 'vault' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <input
                            ref={fileInputRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setVaultDraft((p) => ({ ...p, fileUrl: `https://storage.local/compliance/${f.name.replace(/\s+/g, '_').toLowerCase()}`, fileSizeKb: String(Math.max(12, Math.round(f.size / 1024))) }));
                                setVaultErrors({}); e.target.value = '';
                            }}
                        />
                        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4 text-purple-600" /> Store &amp; Index Compliance File</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Upload once to bundle into formatted PBT submission packets</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-mono font-bold">POST /vault/upload</span>
                        </div>

                        <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-3 text-xs">
                            <div><label className="font-bold text-slate-700 block mb-1">Target SSM Registration No.</label><VyteDropdown variant="light" size="sm" value={vaultDraft.registrationNo} onChange={(v) => setVaultDraft({ ...vaultDraft, registrationNo: v })} options={regOptions} /></div>
                            <div><label className="font-bold text-slate-700 block mb-1">Compliance Document Type *</label><VyteDropdown<ComplianceDocType> variant="light" size="sm" value={vaultDraft.docType} onChange={(v) => setVaultDraft({ ...vaultDraft, docType: v })} options={DOC_TYPE_OPTIONS} /></div>
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="font-bold text-slate-700">Vault Storage File URL *</label>
                                    <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer">+ Browse Local PDF/Image</button>
                                </div>
                                <input type="text" value={vaultDraft.fileUrl} onChange={(e) => setVaultDraft({ ...vaultDraft, fileUrl: e.target.value })} className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-mono text-xs text-slate-900" />
                                {vaultErrors.fileUrl && <p className="text-[11px] text-rose-600 font-semibold mt-1">{vaultErrors.fileUrl}</p>}
                            </div>
                            <div className="grid grid-cols-3 gap-2.5">
                                <div><label className="font-bold text-slate-700 block mb-1">Size (KB)</label><input type="number" min={1} value={vaultDraft.fileSizeKb} onChange={(e) => setVaultDraft({ ...vaultDraft, fileSizeKb: e.target.value })} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 font-mono text-xs" /></div>
                                <div><label className="font-bold text-slate-700 block mb-1">Effective Date</label><input type="date" value={vaultDraft.effectiveDate} onChange={(e) => setVaultDraft({ ...vaultDraft, effectiveDate: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 font-mono text-xs" /></div>
                                <div><label className="font-bold text-slate-700 block mb-1">Expiry Date</label><input type="date" value={vaultDraft.expiryDate} onChange={(e) => setVaultDraft({ ...vaultDraft, expiryDate: e.target.value })} className="w-full px-2 py-1.5 rounded-lg border border-slate-300 font-mono text-xs" /></div>
                            </div>
                            <button type="submit" disabled={isUploadingDoc} className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                                <Upload className="w-3.5 h-3.5" />{isUploadingDoc ? 'Indexing in Vault...' : 'Upload & Index for Submission Packet'}
                            </button>
                        </form>
                    </div>

                    <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><FolderLock className="w-4 h-4 text-emerald-600" /> Indexed Compliance Vault &amp; Packet Bundler</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Check documents to include in your next Concierge / RPA PBT renewal packet</p>
                            </div>
                            <button type="button" onClick={() => setActiveSubView('concierge')} className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                                <FileCheck className="w-3.5 h-3.5" /> Bundle Selected ({selectedDocIds.length}) &amp; Initiate Filing &rarr;
                            </button>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                    <th className="py-2.5 px-3 text-center">Packet</th>
                                    <th className="py-2.5 px-3">Doc ID &amp; Type</th>
                                    <th className="py-2.5 px-3">SSM Reg No.</th>
                                    <th className="py-2.5 px-3">Validity Period</th>
                                    <th className="py-2.5 px-3">Size &amp; Uploader</th>
                                    <th className="py-2.5 px-3 text-right">File Link</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {vaultDocs.map((doc) => {
                                    const isSelected = selectedDocIds.includes(doc.docID);
                                    return (
                                        <tr key={doc.docID} onClick={() => toggleVaultDocSelection(doc.docID)} className={`transition cursor-pointer ${isSelected ? 'bg-emerald-50/50 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}>
                                            <td className="py-2.5 px-3 text-center"><input type="checkbox" checked={isSelected} onChange={() => toggleVaultDocSelection(doc.docID)} onClick={(e) => e.stopPropagation()} className="w-4 h-4 accent-[#2BB656] cursor-pointer" /></td>
                                            <td className="py-2.5 px-3"><span className="font-mono font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded text-[11px]">{doc.docID}</span><p className="font-bold text-slate-900 mt-1">{doc.docType.replace(/_/g, ' ')}</p></td>
                                            <td className="py-2.5 px-3 font-mono text-slate-700">{doc.registrationNo}</td>
                                            <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{doc.effectiveDate || '2026-01-01'} &rarr; <strong className="text-slate-900">{doc.expiryDate || '2027-12-31'}</strong></td>
                                            <td className="py-2.5 px-3 text-slate-600">{doc.fileSizeKb.toLocaleString()} KB • <span className="font-mono">{doc.uploadedBy}</span></td>
                                            <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}><a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 hover:underline font-bold">View PDF <ExternalLink className="w-3 h-3" /></a></td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeSubView === 'concierge' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                    <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                        <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-blue-600" /> Initiate Assisted PBT Renewal</h3>
                                <p className="text-[11px] text-slate-500 mt-0.5">Generate PBT portal checklist or handoff packet to human concierge desk</p>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-mono font-bold">POST /renewal/initiate</span>
                        </div>

                        <form onSubmit={handleInitiateRenewal} noValidate className="space-y-3 text-xs">
                            <div><label className="font-bold text-slate-700 block mb-1">Company / SSM Registration No.</label><VyteDropdown variant="light" size="sm" value={renewalForm.registrationNo} onChange={(v) => setRenewalForm({ ...renewalForm, registrationNo: v })} options={regOptions} /></div>
                            <div className="grid grid-cols-2 gap-2.5">
                                <div><label className="font-bold text-slate-700 block mb-1">Target Council (PBT)</label><VyteDropdown variant="light" size="sm" value={renewalForm.councilName} onChange={(v) => setRenewalForm({ ...renewalForm, councilName: v })} options={PBT_COUNCIL_OPTIONS.filter((o) => o.value !== 'ALL')} /></div>
                                <div><label className="font-bold text-slate-700 block mb-1">Estimated Fee ({currency})</label><input type="number" step="0.01" value={renewalForm.renewalFeeEstimate} onChange={(e) => setRenewalForm({ ...renewalForm, renewalFeeEstimate: e.target.value })} className="w-full px-3 py-1.5 rounded-lg border border-slate-300 font-bold text-slate-900" /></div>
                            </div>
                            <div><label className="font-bold text-slate-700 block mb-1">License Type</label><VyteDropdown<LicenseType> variant="light" size="sm" value={renewalForm.licenseType} onChange={(v) => setRenewalForm({ ...renewalForm, licenseType: v })} options={LICENSE_TYPE_OPTIONS} /></div>
                            <div>
                                <label className="font-bold text-slate-700 block mb-1">Assisted Filing Mode</label>
                                <VyteDropdown<'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_GUIDED_CHECKLIST'>
                                    variant="light" size="sm" value={renewalForm.filingMode} onChange={(v) => setRenewalForm({ ...renewalForm, filingMode: v })}
                                    options={[
                                        { label: 'Concierge Manual Submission (Assign Agent Desk)', value: 'CONCIERGE_MANUAL_SUBMISSION' },
                                        { label: 'Self-Guided PBT Portal + RPA Checklist', value: 'RPA_GUIDED_CHECKLIST' },
                                    ]}
                                />
                            </div>
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-700">Bundled Vault Document IDs ({selectedDocIds.length})</span>
                                    <button type="button" onClick={() => setActiveSubView('vault')} className="text-[11px] font-bold text-emerald-600 hover:underline cursor-pointer">Edit Selection</button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">{selectedDocIds.map((id) => <span key={id} className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-mono text-[10px] font-bold">{id}</span>)}</div>
                            </div>
                            <div><label className="font-bold text-slate-700 block mb-1">Internal Notes for Concierge Agent / Inspector</label><textarea rows={2} value={renewalForm.internalNotes} onChange={(e) => setRenewalForm({ ...renewalForm, internalNotes: e.target.value })} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900" /></div>
                            <button type="submit" disabled={isInitiatingRenewal || !isAuthorizedApprover} className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs transition ${isAuthorizedApprover ? 'bg-[#2BB656] hover:bg-emerald-600 text-white cursor-pointer' : 'bg-slate-200 text-slate-500 cursor-not-allowed'}`}>
                                {isAuthorizedApprover ? <><Send className="w-3.5 h-3.5" />{isInitiatingRenewal ? 'Generating Packet & Assigning...' : 'Initiate Renewal & Compile PDF Packet'}</> : <><Lock className="w-3.5 h-3.5" />Locked: Owner / Manager Approval Required</>}
                            </button>
                        </form>
                    </div>

                    <div className="lg:col-span-7 space-y-4">
                        {renewalTasks.map((task) => (
                            <div key={task.renewalID} className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                                <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono text-xs font-bold">{task.renewalID}</span>
                                        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-mono text-[11px] font-bold">{task.councilName}</span>
                                        <span className="text-sm font-bold text-slate-900">{task.companyName}</span>
                                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">{task.status}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs">
                                        <a href={task.pbtPortalUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold inline-flex items-center gap-1">PBT Portal <ExternalLink className="w-3 h-3" /></a>
                                        <button type="button" onClick={() => setActiveTaskModal(task)} className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-emerald-600 text-white font-bold inline-flex items-center gap-1 transition cursor-pointer"><UserCheck className="w-3.5 h-3.5" /> Update Filing Status</button>
                                    </div>
                                </div>

                                <div className="p-5 space-y-4 text-xs">
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
                                        <div><span className="text-[10px] text-slate-400 uppercase font-bold block">License Type</span><strong className="text-slate-900">{task.licenseType.replace(/_/g, ' ')}</strong></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase font-bold block">Assigned Agent</span><strong className="font-mono text-blue-700">{task.assignedAgentID || 'RPA_AUTOMATED'}</strong></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase font-bold block">Target Deadline</span><strong className="font-mono text-slate-900">{task.targetDeadline}</strong></div>
                                        <div><span className="text-[10px] text-slate-400 uppercase font-bold block">Estimated Fee</span><strong className="text-emerald-700">{sym} {(task.renewalFee * exchangeRate).toFixed(2)}</strong></div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <p className="font-bold text-slate-800">Interactive Pre-Filing Checklist (Click to verify)</p>
                                            {task.compiledSubmissionPdfUrl && <a href={task.compiledSubmissionPdfUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-700 font-bold hover:underline inline-flex items-center gap-1"><FileText className="w-3.5 h-3.5" /> Compiled Packet PDF</a>}
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            {task.generatedChecklist.map((step) => (
                                                <button
                                                    key={step.step} type="button"
                                                    onClick={() => setRenewalTasks((p) => p.map((t) => (t.renewalID === task.renewalID ? { ...t, generatedChecklist: t.generatedChecklist.map((s) => (s.step === step.step ? { ...s, isCompleted: !s.isCompleted } : s)) } : t)))}
                                                    className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition cursor-pointer ${step.isCompleted ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-bold' : 'bg-amber-50/60 border-amber-200 text-amber-900 font-medium'}`}
                                                >
                                                    <CheckCircle2 className={`w-4 h-4 shrink-0 ${step.isCompleted ? 'text-[#2BB656]' : 'text-amber-500'}`} />
                                                    <span className="truncate">Step {step.step}: {step.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {task.submissionReferenceNo && (
                                        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                                <span className="text-[10px] font-bold uppercase text-emerald-700 block">PBT Government Submission Reference Logged</span>
                                                <p className="font-mono font-bold text-slate-900">{task.submissionReferenceNo} • Next Follow-Up: {task.nextFollowUpDate}</p>
                                                {task.agentNotes && <p className="text-[11px] text-slate-600 mt-0.5">{task.agentNotes}</p>}
                                            </div>
                                            {task.pbtReceiptUrl && <a href={task.pbtReceiptUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded bg-white border border-emerald-300 text-emerald-800 font-bold text-[11px] inline-flex items-center gap-1">Official PBT Receipt <ExternalLink className="w-3 h-3" /></a>}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTaskModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <form onSubmit={handleUpdateRenewalTaskStatus} className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-mono text-[10px] font-bold">PATCH /api/compliance/renewal/status</span>
                                <h3 className="text-base font-bold text-slate-900 mt-1">Update Concierge / RPA Filing ({activeTaskModal.renewalID})</h3>
                            </div>
                            <button type="button" onClick={() => setActiveTaskModal(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Workflow Action</label>
                            <VyteDropdown
                                variant="light" size="sm" value={taskUpdateForm.action} onChange={(v) => setTaskUpdateForm({ ...taskUpdateForm, action: v })}
                                options={[
                                    { label: 'SUBMIT_APPLICATION (Log Manual PBT Portal Submission)', value: 'SUBMIT_APPLICATION' },
                                    { label: 'APPROVE_FINAL_LICENSE (Council Approved & Active)', value: 'APPROVE_FINAL_LICENSE' },
                                ]}
                            />
                        </div>
                        <div><label className="font-bold text-slate-700 block mb-1">Government PBT Submission Reference No. *</label><input type="text" required value={taskUpdateForm.submissionReferenceNo} onChange={(e) => setTaskUpdateForm({ ...taskUpdateForm, submissionReferenceNo: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900" /></div>
                        <div><label className="font-bold text-slate-700 block mb-1">Official PBT Receipt URL</label><input type="text" value={taskUpdateForm.pbtReceiptUrl} onChange={(e) => setTaskUpdateForm({ ...taskUpdateForm, pbtReceiptUrl: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-mono text-slate-800" /></div>
                        <div><label className="font-bold text-slate-700 block mb-1">Concierge Agent / RPA Execution Notes</label><textarea rows={3} value={taskUpdateForm.agentNotes} onChange={(e) => setTaskUpdateForm({ ...taskUpdateForm, agentNotes: e.target.value })} className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900" /></div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setActiveTaskModal(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Cancel</button>
                            <button type="submit" disabled={isUpdatingTask} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold cursor-pointer">{isUpdatingTask ? 'Saving Status...' : 'Record PBT Filing Update'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};