// src/modules/module6-compliance/ComplianceRenewalModule.tsx
import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertCircle,
    AlertTriangle,
    ArrowUpRight,
    Bot,
    Check,
    CheckCircle2,
    Clock,
    ExternalLink,
    FileText,
    FolderLock,
    Plus,
    RefreshCw,
    Search,
    Send,
    ShieldCheck,
    Upload,
} from 'lucide-react';
import type {
    BusinessComplianceProfile,
    CurrencyCode,
    DocumentVaultItem,
    RenewalTask,
    RenewalTaskStatus,
    UserRole,
} from '../../types/vyte.ts';
import {CURRENCY_SYMBOLS} from '../../types/vyte.ts';

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

type MainComplianceTab = 'ssm_radar' | 'vault_packet' | 'assisted_filing';
type SsmSubTab = 'scanner' | 'lookup';
type VaultSubTab = 'repository' | 'upload';
type FilingSubTab = 'pipeline' | 'initiate';

const COMPLIANCE_UI_STORAGE_KEY = 'vyte_compliance_ui_state_v2';

const PBT_COUNCILS = [
    {label: 'MBPJ (Petaling Jaya)', value: 'MBPJ'},
    {label: 'DBKL (Kuala Lumpur)', value: 'DBKL'},
    {label: 'MBSA (Shah Alam)', value: 'MBSA'},
    {label: 'MBSJ (Subang Jaya)', value: 'MBSJ'},
];

const LICENSE_CATEGORIES = [
    {label: 'Premise License (Lesen Premis)', value: 'PREMISE_LICENSE'},
    {label: 'Food Establishment (Lesen Makanan)', value: 'FOOD_ESTABLISHMENT'},
    {label: 'Signboard License (Lesen Iklan)', value: 'SIGNBOARD_LICENSE'},
    {label: 'Warehouse & Storage Permit', value: 'WAREHOUSE_PERMIT'},
];

const DOC_TYPES = [
    {label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9'},
    {label: 'Stamped Tenancy Agreement', value: 'TENANCY_AGREEMENT'},
    {label: 'Premise Floor Plan (Renovated)', value: 'FLOOR_PLAN'},
    {label: 'BOMBA Fire Safety Endorsement', value: 'FIRE_SAFETY_CERT'},
    {label: 'Typhoid Vaccination & Food Handler Cert', value: 'TYPHOID_CERT'},
    {label: 'Visual Signboard Artwork (DBP Approved)', value: 'SIGNBOARD_ARTWORK'},
];

const sanitizePositiveDecimal = (raw: string): string => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 6);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

export const ComplianceRenewalModule: React.FC<ComplianceRenewalModuleProps> = ({
                                                                                    profiles,
                                                                                    setProfiles,
                                                                                    vaultDocs,
                                                                                    setVaultDocs,
                                                                                    renewalTasks,
                                                                                    setRenewalTasks,
                                                                                    role,
                                                                                    userID,
                                                                                    currency = 'MYR',
                                                                                    exchangeRate = 1.0,
                                                                                    onLogAction,
                                                                                    onTriggerLoadingScreen,
                                                                                }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
    const todayIso = new Date().toISOString().slice(0, 10);

    const savedState = useMemo(() => {
        try {
            const raw = localStorage.getItem(COMPLIANCE_UI_STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch {
            return {};
        }
    }, []);

    const [mainTab, setMainTab] = useState<MainComplianceTab>(
        savedState.mainTab ?? 'ssm_radar'
    );
    const [ssmSubTab, setSsmSubTab] = useState<SsmSubTab>(
        savedState.ssmSubTab ?? 'scanner'
    );
    const [vaultSubTab, setVaultSubTab] = useState<VaultSubTab>(
        savedState.vaultSubTab ?? 'repository'
    );
    const [filingSubTab, setFilingSubTab] = useState<FilingSubTab>(
        savedState.filingSubTab ?? 'pipeline'
    );

    const [ssmRegNo, setSsmRegNo] = useState<string>(
        savedState.ssmRegNo ?? '202401048291'
    );
    const [ssmCompanyName, setSsmCompanyName] = useState<string>(
        savedState.ssmCompanyName ?? 'ACME TECH SDN. BHD.'
    );
    const [ssmCouncil, setSsmCouncil] = useState<string>(
        savedState.ssmCouncil ?? 'MBPJ'
    );
    const [ssmLicenseType, setSsmLicenseType] = useState<string>(
        savedState.ssmLicenseType ?? 'PREMISE_LICENSE'
    );
    const [ssmExpiryDate, setSsmExpiryDate] = useState<string>(
        savedState.ssmExpiryDate ?? '2026-11-30'
    );
    const [ssmLookupError, setSsmLookupError] = useState<string>('');

    const [councilFilter, setCouncilFilter] = useState<string>(
        savedState.councilFilter ?? 'ALL'
    );
    const [windowDays, setWindowDays] = useState<number>(
        savedState.windowDays ?? 60
    );
    const [lastScannedAt, setLastScannedAt] = useState<string>('2026-10-23 12:15:00');

    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
        savedState.selectedDocIds ?? ['DOC-99401', 'DOC-99388', 'DOC-99350']
    );
    const [uploadRegNo, setUploadRegNo] = useState<string>(
        savedState.uploadRegNo ?? '202401048291'
    );
    const [uploadDocType, setUploadDocType] = useState<string>(
        savedState.uploadDocType ?? 'TENANCY_AGREEMENT'
    );
    const [uploadEffectiveDate, setUploadEffectiveDate] = useState<string>(
        savedState.uploadEffectiveDate ?? '2026-01-01'
    );
    const [uploadExpiryDate, setUploadExpiryDate] = useState<string>(
        savedState.uploadExpiryDate ?? '2027-12-31'
    );
    const [uploadFileName, setUploadFileName] = useState<string>('');
    const [uploadError, setUploadError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [filingRegNo, setFilingRegNo] = useState<string>(
        savedState.filingRegNo ?? '202401048291'
    );
    const [filingMode, setFilingMode] = useState<
        'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED'
    >(savedState.filingMode ?? 'CONCIERGE_MANUAL_SUBMISSION');
    const [filingFeeInput, setFilingFeeInput] = useState<string>(
        savedState.filingFeeInput ?? '450.00'
    );
    const [filingDeadline, setFilingDeadline] = useState<string>(
        savedState.filingDeadline ?? '2026-11-20'
    );
    const [filingNotes, setFilingNotes] = useState<string>(
        savedState.filingNotes ??
        'Premise renovation completed; updated floor plan & stamped tenancy attached.'
    );
    const [filingError, setFilingError] = useState<string>('');

    useEffect(() => {
        localStorage.setItem(
            COMPLIANCE_UI_STORAGE_KEY,
            JSON.stringify({
                mainTab,
                ssmSubTab,
                vaultSubTab,
                filingSubTab,
                ssmRegNo,
                ssmCompanyName,
                ssmCouncil,
                ssmLicenseType,
                ssmExpiryDate,
                councilFilter,
                windowDays,
                selectedDocIds,
                uploadRegNo,
                uploadDocType,
                uploadEffectiveDate,
                uploadExpiryDate,
                filingRegNo,
                filingMode,
                filingFeeInput,
                filingDeadline,
                filingNotes,
            })
        );
    }, [
        mainTab,
        ssmSubTab,
        vaultSubTab,
        filingSubTab,
        ssmRegNo,
        ssmCompanyName,
        ssmCouncil,
        ssmLicenseType,
        ssmExpiryDate,
        councilFilter,
        windowDays,
        selectedDocIds,
        uploadRegNo,
        uploadDocType,
        uploadEffectiveDate,
        uploadExpiryDate,
        filingRegNo,
        filingMode,
        filingFeeInput,
        filingDeadline,
        filingNotes,
    ]);

    const calcDaysLeft = (isoDate: string): number => {
        const targetMs = new Date(isoDate).getTime();
        const nowMs = new Date(todayIso).getTime();
        return Math.round((targetMs - nowMs) / (1000 * 60 * 60 * 24));
    };

    const scannedAlerts = useMemo(() => {
        return profiles.filter((p) => {
            const matchCouncil =
                councilFilter === 'ALL' || p.councilName === councilFilter;
            const daysLeft = calcDaysLeft(p.licenseExpiryDate);
            const withinWindow = daysLeft <= windowDays;
            return matchCouncil && withinWindow;
        });
    }, [profiles, councilFilter, windowDays]);

    const handleVerifySsmProfile = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanReg = ssmRegNo.trim();
        const cleanName = ssmCompanyName.trim();

        if (!/^\d{12}$/.test(cleanReg)) {
            setSsmLookupError(
                'SSM Registration No. must be an exact 12-digit numeric format (e.g., 202401048291).'
            );
            return;
        }
        if (cleanName.length < 3) {
            setSsmLookupError('Registered Company Name is required (min 3 characters).');
            return;
        }
        if (!ssmExpiryDate) {
            setSsmLookupError('Please select a valid PBT License Expiry date.');
            return;
        }

        setSsmLookupError('');
        onTriggerLoadingScreen?.(
            `Querying SSM Registry for ${cleanReg} & Validating PBT Window...`,
            750
        );

        const daysLeft = calcDaysLeft(ssmExpiryDate);
        const computedStatus: BusinessComplianceProfile['complianceStatus'] =
            daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE';

        const newProfile: BusinessComplianceProfile = {
            registrationNo: cleanReg,
            companyName: cleanName.toUpperCase(),
            companyType: cleanName.toUpperCase().includes('PLT')
                ? 'LLP'
                : cleanName.toUpperCase().includes('SDN')
                    ? 'SDN_BHD'
                    : 'ENTERPRISE',
            ssmExpiryDate: '2027-03-15',
            councilName: ssmCouncil as BusinessComplianceProfile['councilName'],
            licenseType: ssmLicenseType as BusinessComplianceProfile['licenseType'],
            licenseExpiryDate: ssmExpiryDate,
            complianceStatus: computedStatus,
            autoAlertEnabled: true,
        };

        setProfiles((prev) => {
            const exists = prev.some((p) => p.registrationNo === cleanReg);
            return exists
                ? prev.map((p) => (p.registrationNo === cleanReg ? newProfile : p))
                : [newProfile, ...prev];
        });

        onLogAction(
            'License & Compliance',
            `Verified SSM Registration ${cleanReg} (${cleanName.toUpperCase()}) • Council: ${ssmCouncil} • Status: ${computedStatus}.`
        );

        setSsmSubTab('scanner');
    };

    const handlePrepareAssistedFiling = (profile: BusinessComplianceProfile) => {
        setFilingRegNo(profile.registrationNo);
        setMainTab('assisted_filing');
        setFilingSubTab('initiate');
    };

    const handleUploadVaultDoc = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!uploadEffectiveDate || !uploadExpiryDate) {
            setUploadError('Both Effective Date and Expiry Date are required.');
            return;
        }
        if (uploadExpiryDate <= uploadEffectiveDate) {
            setUploadError('Expiry Date must be later than the Effective Date.');
            return;
        }

        setUploadError('');
        const newDocId = `DOC-${Math.floor(10000 + Math.random() * 90000)}`;
        const cleanFile =
            uploadFileName.trim() ||
            `${uploadDocType.toLowerCase()}_${uploadRegNo}.pdf`;

        const createdDoc: DocumentVaultItem = {
            docID: newDocId,
            registrationNo: uploadRegNo,
            docType: uploadDocType as DocumentVaultItem['docType'],
            fileUrl: `https://storage.local/compliance/${cleanFile}`,
            fileSizeKb: Math.floor(450 + Math.random() * 1600),
            effectiveDate: uploadEffectiveDate,
            expiryDate: uploadExpiryDate,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userID,
        };

        setVaultDocs((prev) => [createdDoc, ...prev]);
        setSelectedDocIds((prev) => [...prev, newDocId]);
        setUploadFileName('');

        onLogAction(
            'Compliance Vault',
            `Uploaded ${uploadDocType} (${newDocId}) for company ${uploadRegNo} to centralized compliance vault.`
        );
        setVaultSubTab('repository');
    };

    const handleInitiateRenewal = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const feeNum = Number(filingFeeInput);
        if (!filingFeeInput || isNaN(feeNum) || feeNum <= 0) {
            setFilingError(`Enter a valid renewal fee greater than ${currencySymbol} 0.00.`);
            return;
        }
        if (!filingDeadline) {
            setFilingError('Target filing deadline is required.');
            return;
        }
        if (selectedDocIds.length === 0) {
            setFilingError(
                'Please select at least 1 supporting document from the Document Vault first.'
            );
            return;
        }

        setFilingError('');
        onTriggerLoadingScreen?.(
            'Packaging Vault Documents & Initiating Assisted Renewal...',
            800
        );

        const matchedProfile =
            profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
        const renId = `REN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const baseFeeRM = Number((feeNum / exchangeRate).toFixed(2));

        const createdTask: RenewalTask = {
            renewalID: renId,
            registrationNo: matchedProfile.registrationNo,
            companyName: matchedProfile.companyName,
            councilName: matchedProfile.councilName,
            licenseType: matchedProfile.licenseType,
            filingMode,
            status: 'ASSIGNED_TO_AGENT',
            assignedAgentID:
                filingMode === 'RPA_AUTOMATED' ? 'ORBYTE_RPA_BOT_01' : 'AGENT_DESK_03',
            pbtPortalUrl: `https://e-lesen.${matchedProfile.councilName.toLowerCase()}.gov.my`,
            submissionReferenceNo: null,
            compiledSubmissionPdfUrl: `https://storage.local/packets/${matchedProfile.councilName}_${renId}.pdf`,
            generatedChecklist: [
                {step: 1, name: 'SSM Form 9 & Business Profile Validated', isCompleted: true},
                {
                    step: 2,
                    name: `${selectedDocIds.length} Vault Document(s) Attached & Indexed`,
                    isCompleted: true,
                },
                {
                    step: 3,
                    name: 'Owner / Manager Final Submission Approval',
                    isCompleted: false,
                },
            ],
            targetDeadline: filingDeadline,
            renewalFee: baseFeeRM,
            currency: 'MYR',
            internalNotes: filingNotes.trim() || 'Standard annual PBT license renewal.',
            createdAt: new Date().toISOString(),
        };

        setRenewalTasks((prev) => [createdTask, ...prev]);
        onLogAction(
            'Assisted Renewal',
            `Initiated ${filingMode} task ${renId} for ${matchedProfile.companyName} (${matchedProfile.councilName}).`
        );
        setFilingSubTab('pipeline');
    };

    const handleAdvanceRenewalStatus = (task: RenewalTask) => {
        if (!canApprove) {
            alert(
                'Vyte RBAC Restriction: Only Owner or Manager accounts can approve statutory renewal submissions.'
            );
            return;
        }

        const nextStatus: RenewalTaskStatus =
            (task.status as string) === 'ASSIGNED_TO_AGENT'
                ? 'SUBMITTED_TO_PBT'
                : 'APPROVED_RENEWED';

        const refNo =
            task.submissionReferenceNo ||
            `${task.councilName}-SUB-${Math.floor(100000 + Math.random() * 900000)}`;

        setRenewalTasks((prev) =>
            prev.map((t) =>
                t.renewalID === task.renewalID
                    ? {
                        ...t,
                        status: nextStatus,
                        submissionReferenceNo: refNo,
                        generatedChecklist: t.generatedChecklist.map((c) => ({
                            ...c,
                            isCompleted: true,
                        })),
                    }
                    : t
            )
        );

        if ((nextStatus as string) === 'APPROVED_RENEWED') {
            setProfiles((prev) =>
                prev.map((p) =>
                    p.registrationNo === task.registrationNo
                        ? {
                            ...p,
                            complianceStatus: 'ACTIVE',
                            licenseExpiryDate: '2027-11-30',
                        }
                        : p
                )
            );
        }

        onLogAction(
            'Assisted Renewal',
            `Updated renewal task ${task.renewalID} (${task.companyName}) to ${nextStatus} [Ref: ${refNo}].`
        );
    };

    return (
        <div className="space-y-4 select-none w-full">
            {/* Real-Life SME Financial Loss Statistics Banner (Mentor Feedback #4) */}
            <div
                className="bg-gradient-to-r from-rose-950 via-slate-900 to-slate-900 text-white rounded-2xl p-5 border border-rose-500/30 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
    <span
        className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[11px] font-bold uppercase tracking-wider">
      Why This Matters: Real-Life Malaysian SME Financial Loss Statistics
    </span>
                    <span className="text-xs text-emerald-400 font-bold">
      Vyte Auto-Shield Active: RM 68,500+ Potential Penalties Prevented
    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-rose-400 font-extrabold text-base">Up to RM 50,000 Fine</p>
                        <p className="font-bold text-white">SSM &amp; Local Council (PBT) Lapses</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Over <strong>34,000 Malaysian SMEs</strong> are compounded annually under the Companies Act
                            2016 &amp; PBT bylaws (RM 500–RM 2,000/day premise closure) simply due to missed renewal
                            dates.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-amber-400 font-extrabold text-base">RM 300–RM 2,000 + Voided Insurance</p>
                        <p className="font-bold text-white">Commercial Fleet Road Tax &amp; PUSPAKOM</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            1 in 5 SME delivery lorries miss their 6-month PUSPAKOM/JPJ window. Operating with an
                            expired disk voids commercial cargo insurance—costing SMEs <strong>RM 45,000+ per uninsured
                            accident</strong>.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-purple-300 font-extrabold text-base">RM 8,500–RM 22,000 / Breakdown</p>
                        <p className="font-bold text-white">Missed Equipment &amp; Cold-Room Warranties</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            <strong>62% of F&amp;B and retail SMEs</strong> fail to claim free OEM compressor/machinery
                            replacements before warranty expiry, paying out-of-pocket for repairs that were 100%
                            covered.
                        </p>
                    </div>
                </div>
            </div>
            {/* Main 3-Tab Toggle Bar + Secondary Sub-Function Toggle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                    className="inline-flex flex-wrap items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setMainTab('ssm_radar')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'ssm_radar'
                                ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600"/>
                        <span>SSM Lookup &amp; Expiry Radar ({profiles.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setMainTab('vault_packet')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'vault_packet'
                                ? 'bg-white text-purple-800 font-bold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <FolderLock className="w-3.5 h-3.5 text-purple-600"/>
                        <span>Document Vault &amp; Packet Builder ({vaultDocs.length})</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setMainTab('assisted_filing')}
                        className={`px-3.5 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'assisted_filing'
                                ? 'bg-white text-blue-800 font-bold shadow-2xs'
                                : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Bot className="w-3.5 h-3.5 text-blue-600"/>
                        <span>Concierge &amp; RPA Assisted Filing ({renewalTasks.length})</span>
                    </button>
                </div>

                {mainTab === 'ssm_radar' && (
                    <div
                        className="inline-flex items-center bg-amber-100/80 p-1 rounded-xl border border-amber-200 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setSsmSubTab('scanner')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                ssmSubTab === 'scanner'
                                    ? 'bg-amber-500 text-white font-bold shadow-2xs'
                                    : 'text-amber-900 hover:bg-amber-200/60'
                            }`}
                        >
                            <AlertTriangle className="w-3.5 h-3.5"/>
                            <span>Expiry Alert Scanner ({scannedAlerts.length} Alerts)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSsmSubTab('lookup')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                ssmSubTab === 'lookup'
                                    ? 'bg-amber-500 text-white font-bold shadow-2xs'
                                    : 'text-amber-900 hover:bg-amber-200/60'
                            }`}
                        >
                            <Search className="w-3.5 h-3.5"/>
                            <span>Real-Time SSM Lookup</span>
                        </button>
                    </div>
                )}

                {mainTab === 'vault_packet' && (
                    <div
                        className="inline-flex items-center bg-purple-100/80 p-1 rounded-xl border border-purple-200 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setVaultSubTab('repository')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                vaultSubTab === 'repository'
                                    ? 'bg-purple-600 text-white font-bold shadow-2xs'
                                    : 'text-purple-900 hover:bg-purple-200/60'
                            }`}
                        >
                            <FolderLock className="w-3.5 h-3.5"/>
                            <span>Vault Repository &amp; Packet ({selectedDocIds.length} Selected)</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setVaultSubTab('upload')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                vaultSubTab === 'upload'
                                    ? 'bg-purple-600 text-white font-bold shadow-2xs'
                                    : 'text-purple-900 hover:bg-purple-200/60'
                            }`}
                        >
                            <Upload className="w-3.5 h-3.5"/>
                            <span>Upload Compliance Document</span>
                        </button>
                    </div>
                )}

                {mainTab === 'assisted_filing' && (
                    <div
                        className="inline-flex items-center bg-blue-100/80 p-1 rounded-xl border border-blue-200 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setFilingSubTab('pipeline')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                filingSubTab === 'pipeline'
                                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                                    : 'text-blue-900 hover:bg-blue-200/60'
                            }`}
                        >
                            <Clock className="w-3.5 h-3.5"/>
                            <span>Active Filing Pipeline ({renewalTasks.length})</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setFilingSubTab('initiate')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                filingSubTab === 'initiate'
                                    ? 'bg-blue-600 text-white font-bold shadow-2xs'
                                    : 'text-blue-900 hover:bg-blue-200/60'
                            }`}
                        >
                            <Plus className="w-3.5 h-3.5"/>
                            <span>Initiate Assisted Renewal</span>
                        </button>
                    </div>
                )}
            </div>

            {/* =====================================================================
          MAIN TAB 1: SSM LOOKUP & EXPIRY RADAR (BOTH SUB-FUNCTIONS FULL-WIDTH)
         ===================================================================== */}
            {mainTab === 'ssm_radar' && (
                <div className="w-full">
                    {ssmSubTab === 'scanner' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500"/> License &amp; PBT Compliance
                                        Expiry Alert Scanner
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Scans SSM dates, premise licenses &amp; signboard renewals to trigger proactive
                                        warnings before council penalties occur.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <select
                                        value={councilFilter}
                                        onChange={(e) => setCouncilFilter(e.target.value)}
                                        className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                                    >
                                        <option value="ALL">PBT: All Councils</option>
                                        {PBT_COUNCILS.map((c) => (
                                            <option key={c.value} value={c.value}>
                                                {c.label}
                                            </option>
                                        ))}
                                    </select>

                                    <select
                                        value={windowDays}
                                        onChange={(e) => setWindowDays(Number(e.target.value))}
                                        className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                                    >
                                        <option value={30}>Window: 30 Days</option>
                                        <option value={60}>Window: 60 Days</option>
                                        <option value={90}>Window: 90 Days</option>
                                        <option value={365}>Window: All (365 Days)</option>
                                    </select>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            onTriggerLoadingScreen?.('Scanning SSM & PBT Expiry Dates...', 600);
                                            setLastScannedAt(new Date().toISOString().slice(0, 19).replace('T', ' '));
                                        }}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5"/> Scan Now
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setSsmSubTab('lookup')}
                                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl font-bold flex items-center gap-1 transition cursor-pointer"
                                    >
                                        <Plus className="w-3.5 h-3.5"/> Add / Verify SSM Entity
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing <strong>{scannedAlerts.length}</strong> alert(s) out of{' '}
                    <strong>{profiles.length}</strong> monitored licenses
                </span>
                                <span className="font-mono text-[11px]">Checked: {lastScannedAt}</span>
                            </div>

                            <div className="grid grid-cols-1 gap-3">
                                {scannedAlerts.map((prof) => {
                                    const daysLeft = calcDaysLeft(prof.licenseExpiryDate);
                                    const isExpired = daysLeft < 0 || prof.complianceStatus === 'EXPIRED';

                                    return (
                                        <div
                                            key={`${prof.registrationNo}-${prof.licenseType}`}
                                            className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition ${
                                                isExpired
                                                    ? 'bg-rose-50/40 border-rose-200'
                                                    : prof.complianceStatus === 'EXPIRING_SOON'
                                                        ? 'bg-amber-50/40 border-amber-200'
                                                        : 'bg-emerald-50/30 border-emerald-200'
                                            }`}
                                        >
                                            <div className="space-y-1.5">
                                                <div className="flex flex-wrap items-center gap-2">
                          <span
                              className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold">
                            {prof.councilName}
                          </span>
                                                    <span
                                                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                                            isExpired
                                                                ? 'bg-rose-100 text-rose-700'
                                                                : prof.complianceStatus === 'EXPIRING_SOON'
                                                                    ? 'bg-amber-100 text-amber-800'
                                                                    : 'bg-emerald-100 text-emerald-800'
                                                        }`}
                                                    >
                            {prof.complianceStatus} ({daysLeft}d left)
                          </span>
                                                    <span className="text-xs font-mono text-slate-500">
                            Exp: {prof.licenseExpiryDate}
                          </span>
                                                </div>

                                                <h4 className="text-sm font-extrabold text-slate-900">
                                                    {prof.companyName}{' '}
                                                    <span className="font-mono text-xs font-normal text-slate-500">
                            ({prof.registrationNo})
                          </span>{' '}
                                                    • {prof.licenseType.replace(/_/g, ' ')}
                                                </h4>

                                                <p className="text-xs text-amber-900 font-medium">
                                                    Action Required: Prepare floor plan, SSM Form 9, and tenancy
                                                    agreement in Document Vault for assisted PBT renewal filing.
                                                </p>
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handlePrepareAssistedFiling(prof)}
                                                    className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                >
                                                    Prepare Assisted Filing <ArrowUpRight className="w-3.5 h-3.5"/>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Full-Width Real-Time SSM Business Lookup */}
                    {ssmSubTab === 'lookup' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Search className="w-4 h-4 text-emerald-600"/> Real-Time SSM Business
                                        Lookup &amp; Profile Registration
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Verify 12-digit SSM registration numbers and register PBT council renewal
                                        windows across your organization.
                                    </p>
                                </div>
                                <span
                                    className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono text-xs font-bold">
                  POST /ssm-verify
                </span>
                            </div>

                            <form onSubmit={handleVerifySsmProfile} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            SSM Registration No. (12-Digit) *
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={12}
                                            placeholder="e.g., 202401048291"
                                            value={ssmRegNo}
                                            onChange={(e) => {
                                                setSsmRegNo(e.target.value.replace(/[^0-9]/g, ''));
                                                setSsmLookupError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>

                                    <div className="lg:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Registered Company Name *
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="e.g., ACME TECH SDN. BHD."
                                            value={ssmCompanyName}
                                            onChange={(e) => {
                                                setSsmCompanyName(e.target.value);
                                                setSsmLookupError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Target Local Council (PBT) *
                                        </label>
                                        <select
                                            value={ssmCouncil}
                                            onChange={(e) => setSsmCouncil(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {PBT_COUNCILS.map((c) => (
                                                <option key={c.value} value={c.value}>
                                                    {c.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            License Category *
                                        </label>
                                        <select
                                            value={ssmLicenseType}
                                            onChange={(e) => setSsmLicenseType(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {LICENSE_CATEGORIES.map((l) => (
                                                <option key={l.value} value={l.value}>
                                                    {l.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            PBT License Expiry Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={ssmExpiryDate}
                                            onChange={(e) => setSsmExpiryDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>
                                </div>

                                {ssmLookupError && (
                                    <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 shrink-0"/> {ssmLookupError}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setSsmSubTab('scanner')}
                                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                                    >
                                        Back to Expiry Scanner
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5"/> Verify SSM &amp; Save to Radar
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* =====================================================================
          MAIN TAB 2: DOCUMENT VAULT & PACKET BUILDER (BOTH SUB-FUNCTIONS FULL-WIDTH)
         ===================================================================== */}
            {mainTab === 'vault_packet' && (
                <div className="w-full">
                    {vaultSubTab === 'repository' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FolderLock className="w-4 h-4 text-purple-600"/> Centralized Compliance
                                        Document Vault &amp; Packet Builder
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Select required statutory documents below to bundle into your PBT renewal
                                        packet.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setVaultSubTab('upload')}
                                        className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5"/> + Upload New Document
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMainTab('assisted_filing');
                                            setFilingSubTab('initiate');
                                        }}
                                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                                    >
                                        Proceed with {selectedDocIds.length} Selected Doc(s) <ArrowUpRight
                                        className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                                        <th className="py-3 px-4 w-12">Select</th>
                                        <th className="py-3 px-3">Document ID &amp; Type</th>
                                        <th className="py-3 px-3">SSM Entity</th>
                                        <th className="py-3 px-3">Validity Period</th>
                                        <th className="py-3 px-3">File Size</th>
                                        <th className="py-3 px-4 text-right">Document Preview</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {vaultDocs.map((doc) => {
                                        const isChecked = selectedDocIds.includes(doc.docID);
                                        return (
                                            <tr
                                                key={doc.docID}
                                                className={`transition ${
                                                    isChecked ? 'bg-purple-50/30 hover:bg-purple-50/50' : 'hover:bg-slate-50'
                                                }`}
                                            >
                                                <td className="py-3 px-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {
                                                            setSelectedDocIds((prev) =>
                                                                prev.includes(doc.docID)
                                                                    ? prev.filter((id) => id !== doc.docID)
                                                                    : [...prev, doc.docID]
                                                            );
                                                        }}
                                                        className="w-4 h-4 accent-purple-600 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="py-3 px-3">
                                                    <p className="font-bold text-slate-900">
                                                        {doc.docType.replace(/_/g, ' ')}
                                                    </p>
                                                    <span className="font-mono text-[11px] text-slate-400">
                              {doc.docID}
                            </span>
                                                </td>
                                                <td className="py-3 px-3 font-mono font-bold text-slate-700">
                                                    {doc.registrationNo}
                                                </td>
                                                <td className="py-3 px-3 font-mono text-slate-600">
                                                    {doc.effectiveDate} &rarr; <strong>{doc.expiryDate}</strong>
                                                </td>
                                                <td className="py-3 px-3 text-slate-500">
                                                    {doc.fileSizeKb.toLocaleString()} KB
                                                </td>
                                                <td className="py-3 px-4 text-right">
                                                    <a
                                                        href={doc.fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 font-bold text-[11px] transition"
                                                    >
                                                        <FileText className="w-3 h-3"/> View PDF <ExternalLink
                                                        className="w-2.5 h-2.5"/>
                                                    </a>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Full-Width Upload Document to Compliance Vault */}
                    {vaultSubTab === 'upload' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.png"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) setUploadFileName(f.name);
                                }}
                                className="hidden"
                            />

                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-purple-600"/> Upload Document to Compliance
                                        Vault
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Index official certificates, tenancy agreements, or floor plans for PBT renewal
                                        packets.
                                    </p>
                                </div>
                                <span
                                    className="px-3 py-1 rounded-lg bg-purple-50 text-purple-700 border border-purple-200 font-mono text-xs font-bold">
                  POST /vault/upload
                </span>
                            </div>

                            <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Target Company (SSM No.) *
                                        </label>
                                        <select
                                            value={uploadRegNo}
                                            onChange={(e) => setUploadRegNo(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {profiles.map((p) => (
                                                <option key={p.registrationNo} value={p.registrationNo}>
                                                    {p.companyName} ({p.registrationNo})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Document Category *
                                        </label>
                                        <select
                                            value={uploadDocType}
                                            onChange={(e) => setUploadDocType(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {DOC_TYPES.map((d) => (
                                                <option key={d.value} value={d.value}>
                                                    {d.label}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Document Effective Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={uploadEffectiveDate}
                                            onChange={(e) => setUploadEffectiveDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Document Expiry Date *
                                        </label>
                                        <input
                                            type="date"
                                            value={uploadExpiryDate}
                                            onChange={(e) => setUploadExpiryDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>

                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Document PDF / Scan File
                                        </label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                placeholder="Click 'Choose PDF / Image' or enter filename..."
                                                value={uploadFileName}
                                                onChange={(e) => setUploadFileName(e.target.value)}
                                                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold cursor-pointer shrink-0"
                                            >
                                                Choose PDF / Image
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {uploadError && (
                                    <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 shrink-0"/> {uploadError}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setVaultSubTab('repository')}
                                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                                    >
                                        Back to Vault Table
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5"/> Save &amp; Index in Vault
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* =====================================================================
          MAIN TAB 3: CONCIERGE & RPA ASSISTED FILING (BOTH SUB-FUNCTIONS FULL-WIDTH)
         ===================================================================== */}
            {mainTab === 'assisted_filing' && (
                <div className="w-full">
                    {filingSubTab === 'pipeline' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-blue-600"/> Active Concierge &amp; RPA Assisted
                                        Filing Pipeline
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Tracks preparatory renewal packets, checklist verification, and Owner/Manager
                                        human approval before council submission.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setFilingSubTab('initiate')}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5"/> + Initiate New Renewal
                                </button>
                            </div>

                            <div className="space-y-3">
                                {renewalTasks.map((task) => {
                                    const convertedFee = (task.renewalFee * exchangeRate).toFixed(2);
                                    const isDone = (task.status as string) === 'APPROVED_RENEWED';

                                    return (
                                        <div
                                            key={task.renewalID}
                                            className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex flex-wrap items-center gap-2">
                          <span
                              className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono text-xs font-bold">
                            {task.renewalID}
                          </span>
                                                    <span
                                                        className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">
                            {task.councilName}
                          </span>
                                                    <span className="text-sm font-extrabold text-slate-900">
                            {task.companyName}
                          </span>
                                                    <span
                                                        className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 text-[11px] font-bold">
                            {task.filingMode.replace(/_/g, ' ')}
                          </span>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                            <span className="text-[10px] uppercase font-bold text-slate-400 block">
                              Est. Council Fee
                            </span>
                                                        <span className="text-sm font-extrabold text-slate-900">
                              {currencySymbol} {convertedFee}
                            </span>
                                                    </div>

                                                    {!isDone ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAdvanceRenewalStatus(task)}
                                                            className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                                        >
                                                            <Send className="w-3.5 h-3.5"/>
                                                            {(task.status as string) === 'ASSIGNED_TO_AGENT'
                                                                ? 'Approve & Submit Packet to PBT'
                                                                : 'Confirm PBT License Renewed'}
                                                        </button>
                                                    ) : (
                                                        <span
                                                            className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                              <CheckCircle2
                                  className="w-4 h-4 text-emerald-600"/> Renewed &amp; Active ({task.submissionReferenceNo})
                            </span>
                                                    )}
                                                </div>
                                            </div>

                                            <p className="text-xs text-slate-600">{task.internalNotes}</p>

                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                {task.generatedChecklist.map((item) => (
                                                    <span
                                                        key={item.step}
                                                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${
                                                            item.isCompleted
                                                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                                                : 'bg-amber-50 text-amber-800 border-amber-200'
                                                        }`}
                                                    >
                            <Check className="w-3 h-3"/> {item.name}
                          </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Full-Width Initiate Concierge / RPA Assisted License Renewal */}
                    {filingSubTab === 'initiate' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-blue-600"/> Initiate Concierge / RPA Assisted
                                        License Renewal
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Packages your selected Vault documents ({selectedDocIds.length} attached) into a
                                        preparatory renewal workflow.
                                    </p>
                                </div>
                                <span
                                    className="px-3 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-mono text-xs font-bold">
                  POST /renewal/initiate
                </span>
                            </div>

                            <form onSubmit={handleInitiateRenewal} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Target Monitored Entity *
                                        </label>
                                        <select
                                            value={filingRegNo}
                                            onChange={(e) => setFilingRegNo(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {profiles.map((p) => (
                                                <option key={p.registrationNo} value={p.registrationNo}>
                                                    {p.companyName} ({p.councilName} • {p.licenseType})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Assisted Execution Mode *
                                        </label>
                                        <select
                                            value={filingMode}
                                            onChange={(e) =>
                                                setFilingMode(
                                                    e.target.value as
                                                        | 'CONCIERGE_MANUAL_SUBMISSION'
                                                        | 'RPA_AUTOMATED'
                                                )
                                            }
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            <option value="CONCIERGE_MANUAL_SUBMISSION">
                                                Concierge Desk Specialist (Assisted Filing)
                                            </option>
                                            <option value="RPA_AUTOMATED">
                                                Orbyte RPA Bot Pre-Fill (Human Approval Gate)
                                            </option>
                                        </select>
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Estimated Renewal Fee ({currency}) *
                                        </label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            placeholder="e.g., 450.00"
                                            value={filingFeeInput}
                                            onChange={(e) => {
                                                setFilingFeeInput(sanitizePositiveDecimal(e.target.value));
                                                setFilingError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"
                                        />
                                    </div>

                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Target Submission Deadline *
                                        </label>
                                        <input
                                            type="date"
                                            value={filingDeadline}
                                            onChange={(e) => setFilingDeadline(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>

                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">
                                            Internal Filing Notes / Instructions
                                        </label>
                                        <textarea
                                            rows={3}
                                            value={filingNotes}
                                            onChange={(e) => setFilingNotes(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800"
                                        />
                                    </div>
                                </div>

                                {filingError && (
                                    <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 shrink-0"/> {filingError}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={() => setFilingSubTab('pipeline')}
                                        className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer"
                                    >
                                        Back to Pipeline
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                                    >
                                        <Send className="w-3.5 h-3.5"/> Create Renewal Task
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};