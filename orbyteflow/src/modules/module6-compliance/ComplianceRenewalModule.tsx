import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
    AlertCircle,
    AlertTriangle,
    ArrowUpRight,
    Bot,
    Building2,
    Car,
    Check,
    CheckCircle2,
    ExternalLink,
    FileText,
    FolderLock,
    Laptop,
    Plus,
    RefreshCw,
    Send,
    ShieldCheck,
    Sparkles,
    Upload,
    Wrench,
} from 'lucide-react';
import type {
    BusinessComplianceProfile,
    ComplianceAssetCategory,
    CurrencyCode,
    DocumentVaultItem,
    InvoiceItem,
    Product,
    QCAlert,
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
    products?: Product[];
    qcAlerts?: QCAlert[];
    invoices?: InvoiceItem[];
    role: UserRole;
    userID: string;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onLogAction: (module: string, detail: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

type MainComplianceTab = 'ssm_radar' | 'accounting_sst' | 'mfrs_audit' | 'vault_packet' | 'assisted_filing';
type SsmSubTab = 'scanner' | 'lookup';
type VaultSubTab = 'repository' | 'upload';
type FilingSubTab = 'pipeline' | 'initiate';

const COMPLIANCE_UI_STORAGE_KEY = 'vyte_compliance_ui_state_v4';

const ISSUING_AUTHORITIES_AND_VENDORS = [
    {label: 'MBPJ (Petaling Jaya)', value: 'MBPJ'},
    {label: 'DBKL (Kuala Lumpur)', value: 'DBKL'},
    {label: 'MBSA (Shah Alam)', value: 'MBSA'},
    {label: 'MBSJ (Subang Jaya)', value: 'MBSJ'},
    {label: 'JPJ / PUSPAKOM Commercial Fleet', value: 'JPJ / PUSPAKOM Commercial Fleet'},
    {label: 'Landlord / Building Management Office', value: 'BUILDING_MANAGEMENT'},
    {label: 'OEM Machinery & Equipment Vendor', value: 'OEM_EQUIPMENT_VENDOR'},
    {label: 'Enterprise Software / SaaS Vendor (Microsoft/AWS/Atlassian)', value: 'SOFTWARE_VENDOR'},
];

const LICENSE_CATEGORIES = [
    {
        label: 'Premise License (Lesen Premis / SSM)',
        value: 'PREMISE_LICENSE',
        category: 'SSM_PBT_LICENSE' as ComplianceAssetCategory
    },
    {
        label: 'Signboard / Advertising License',
        value: 'SIGNBOARD_LICENSE',
        category: 'SSM_PBT_LICENSE' as ComplianceAssetCategory
    },
    {
        label: 'Building Tenancy & Rental Contract',
        value: 'BUILDING_RENTAL_CONTRACT',
        category: 'RENTAL_CONTRACT' as ComplianceAssetCategory
    },
    {
        label: 'Car / Fleet Road Tax & PUSPAKOM Inspection',
        value: 'FLEET_ROADTAX_PUSPAKOM',
        category: 'FLEET_VEHICLE' as ComplianceAssetCategory
    },
    {
        label: 'Equipment / Machinery OEM Warranty Period',
        value: 'EQUIPMENT_OEM_WARRANTY',
        category: 'EQUIPMENT_WARRANTY' as ComplianceAssetCategory
    },
    {
        label: 'Software License / Cloud SaaS Subscription',
        value: 'SOFTWARE_SUBSCRIPTION',
        category: 'SOFTWARE_LICENSE' as ComplianceAssetCategory
    },
];

const DOC_TYPES = [
    {label: 'Stamped Tenancy Agreement (Rental Contract)', value: 'TENANCY_AGREEMENT'},
    {label: 'Building Floor Plan / CCC / Fire Safety Endorsement', value: 'BUILDING_CCC_SAFETY'},
    {label: 'JPJ Vehicle Ownership Grant (VOC) & Road Tax', value: 'VEHICLE_ROADTAX_VOC'},
    {label: 'PUSPAKOM VR1 Commercial Inspection Slip', value: 'PUSPAKOM_INSPECTION_SLIP'},
    {label: 'Equipment OEM Warranty Card & Proof of Purchase', value: 'EQUIPMENT_WARRANTY_CERT'},
    {label: 'Software License Agreement / SaaS Master Contract', value: 'SOFTWARE_EULA_CONTRACT'},
    {label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9'},
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

    const [mainTab, setMainTab] = useState<MainComplianceTab>(savedState.mainTab ?? 'ssm_radar');
    const [ssmSubTab, setSsmSubTab] = useState<SsmSubTab>(savedState.ssmSubTab ?? 'scanner');
    const [vaultSubTab, setVaultSubTab] = useState<VaultSubTab>(savedState.vaultSubTab ?? 'repository');
    const [filingSubTab, setFilingSubTab] = useState<FilingSubTab>(savedState.filingSubTab ?? 'pipeline');
    const [assetCategoryFilter, setAssetCategoryFilter] = useState<'ALL' | ComplianceAssetCategory>('ALL');

    const [claimedWarrantyRegNos, setClaimedWarrantyRegNos] = useState<string[]>([]);

    // Form registration state
    const [ssmRegNo, setSsmRegNo] = useState<string>(savedState.ssmRegNo ?? 'BLD-UNIT-88A');
    const [ssmCompanyName, setSsmCompanyName] = useState<string>(savedState.ssmCompanyName ?? 'Bangsar South HQ - 3rd Floor');
    const [ssmCouncil, setSsmCouncil] = useState<string>(savedState.ssmCouncil ?? 'BUILDING_MANAGEMENT');
    const [ssmLicenseType, setSsmLicenseType] = useState<string>(savedState.ssmLicenseType ?? 'BUILDING_RENTAL_CONTRACT');
    const [ssmExpiryDate, setSsmExpiryDate] = useState<string>(savedState.ssmExpiryDate ?? '2027-01-31');
    const [ssmLookupError, setSsmLookupError] = useState<string>('');

    const [windowDays, setWindowDays] = useState<number>(savedState.windowDays ?? 365);

    // Document vault state
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(savedState.selectedDocIds ?? ['DOC-99401']);
    const [uploadRegNo, setUploadRegNo] = useState<string>(savedState.uploadRegNo ?? 'BLD-UNIT-88A');
    const [uploadDocType, setUploadDocType] = useState<string>(savedState.uploadDocType ?? 'TENANCY_AGREEMENT');
    const [uploadEffectiveDate, setUploadEffectiveDate] = useState<string>(savedState.uploadEffectiveDate ?? '2025-02-01');
    const [uploadExpiryDate, setUploadExpiryDate] = useState<string>(savedState.uploadExpiryDate ?? '2027-01-31');
    const [uploadFileName, setUploadFileName] = useState<string>('');
    const [uploadError, setUploadError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Renewal filing state
    const [filingRegNo, setFilingRegNo] = useState<string>(savedState.filingRegNo ?? 'BLD-UNIT-88A');
    const [filingMode, setFilingMode] = useState<'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED'>('CONCIERGE_MANUAL_SUBMISSION');
    const [selectedTermYears, setSelectedTermYears] = useState<1 | 3 | 5>(1);
    const [filingFeeInput, setFilingFeeInput] = useState<string>(savedState.filingFeeInput ?? '12000.00');
    const [filingDeadline, setFilingDeadline] = useState<string>(savedState.filingDeadline ?? '2026-12-15');
    const [filingNotes, setFilingNotes] = useState<string>(savedState.filingNotes ?? 'Tenancy extension notice. Rental deposit & stamped doc attached.');
    const [filingError, setFilingError] = useState<string>('');

    useEffect(() => {
        localStorage.setItem(COMPLIANCE_UI_STORAGE_KEY, JSON.stringify({
            mainTab,
            ssmSubTab,
            vaultSubTab,
            filingSubTab,
            ssmRegNo,
            ssmCompanyName,
            ssmCouncil,
            ssmLicenseType,
            ssmExpiryDate,
            windowDays,
            selectedDocIds,
            uploadRegNo,
            uploadDocType,
            uploadEffectiveDate,
            uploadExpiryDate,
            filingRegNo,
            filingFeeInput,
            filingDeadline,
            filingNotes,
        }));
    }, [mainTab, ssmSubTab, vaultSubTab, filingSubTab, ssmRegNo, ssmCompanyName, ssmCouncil, ssmLicenseType, ssmExpiryDate, windowDays, selectedDocIds, uploadRegNo, uploadDocType, uploadEffectiveDate, uploadExpiryDate, filingRegNo, filingFeeInput, filingDeadline, filingNotes]);

    const handleClaimWarrantyService = (prof: BusinessComplianceProfile) => {
        setClaimedWarrantyRegNos((prev) => [...prev, prof.registrationNo]);
        onLogAction('Warranty Claim', `Booked free OEM warranty inspection & preventive maintenance for ${prof.companyName} (${prof.registrationNo}).`);
    };

    // Category detection mapping covering all 5 pillars
    const detectAssetCategory = (p: BusinessComplianceProfile): ComplianceAssetCategory => {
        if (p.assetCategory) return p.assetCategory as ComplianceAssetCategory;
        const reg = p.registrationNo.toUpperCase();
        const comp = p.companyName.toUpperCase();
        const type = (p.licenseType || '').toUpperCase();
        const council = p.councilName.toUpperCase();

        if (reg.startsWith('SOFT-') || comp.includes('SOFTWARE') || comp.includes('SAAS') || type.includes('SOFTWARE') || council.includes('SOFTWARE')) {
            return 'SOFTWARE_LICENSE';
        }
        if (reg.startsWith('BLD-') || comp.includes('TENANCY') || comp.includes('HQ') || comp.includes('SUITE') || type.includes('RENTAL') || council.includes('BUILDING')) {
            return 'RENTAL_CONTRACT';
        }
        if (reg.startsWith('JPJ-') || council.includes('JPJ') || council.includes('PUSPAKOM') || comp.includes('VAN') || comp.includes('LORRY') || type.includes('FLEET')) {
            return 'FLEET_VEHICLE';
        }
        if (reg.startsWith('WARR-') || comp.includes('WARRANTY') || council.includes('WARRANTY') || type.includes('EQUIPMENT')) {
            return 'EQUIPMENT_WARRANTY';
        }
        return 'SSM_PBT_LICENSE';
    };

    const calcDaysLeft = (isoDate: string): number => Math.round((new Date(isoDate).getTime() - new Date(todayIso).getTime()) / 86400000);

    const scannedAlerts = useMemo(() => {
        return profiles.filter((p) => {
            const cat = detectAssetCategory(p);
            const matchAssetCat = assetCategoryFilter === 'ALL' || cat === assetCategoryFilter;
            return matchAssetCat && calcDaysLeft(p.licenseExpiryDate) <= windowDays;
        });
    }, [profiles, assetCategoryFilter, windowDays]);

    const handlePrepareAssistedFiling = (profile: BusinessComplianceProfile, preferredTerm?: 1 | 3 | 5) => {
        const term: 1 | 3 | 5 = preferredTerm ?? (profile.selectedRenewalTermYears === 1 || profile.selectedRenewalTermYears === 3 ? profile.selectedRenewalTermYears : 5);
        const annual = profile.annualFeeRM ?? 450;
        const disc = term === 5 ? (profile.fiveYearDiscountPct ?? 22) : term === 3 ? 12 : 0;
        const calculatedFee = Number((annual * term * (1 - disc / 100) * exchangeRate).toFixed(2));
        setFilingRegNo(profile.registrationNo);
        setSelectedTermYears(term);
        setFilingFeeInput(String(calculatedFee));
        setFilingNotes(`${term}-Year term renewal initiated for ${profile.companyName}. Documentation verified.`);
        setMainTab('assisted_filing');
        setFilingSubTab('initiate');
    };

    const handleVerifySsmProfile = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanReg = ssmRegNo.trim();
        const cleanName = ssmCompanyName.trim();
        if (cleanReg.length < 3) return setSsmLookupError('Identifier / Serial / Plate No. is required.');
        if (cleanName.length < 3) return setSsmLookupError('Asset / Place / Software Name is required (min 3 characters).');
        if (!ssmExpiryDate) return setSsmLookupError('Please select a valid expiry date.');

        setSsmLookupError('');
        onTriggerLoadingScreen?.(`Registering ${cleanName} into Documentation Database...`, 600);

        const daysLeft = calcDaysLeft(ssmExpiryDate);
        const computedStatus: BusinessComplianceProfile['complianceStatus'] =
            daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'COMPLIANT';

        const matchedConfig = LICENSE_CATEGORIES.find((l) => l.value === ssmLicenseType);
        const determinedCategory: ComplianceAssetCategory = matchedConfig ? matchedConfig.category : 'SSM_PBT_LICENSE';

        const newProfile: BusinessComplianceProfile = {
            registrationNo: cleanReg,
            companyName: cleanName.toUpperCase(),
            companyType: cleanName.toUpperCase().includes('PLT') ? 'LLP' : cleanName.toUpperCase().includes('SDN') ? 'SDN_BHD' : 'ENTERPRISE',
            ssmExpiryDate: '2027-12-31',
            councilName: ssmCouncil,
            licenseType: ssmLicenseType,
            licenseExpiryDate: ssmExpiryDate,
            complianceStatus: computedStatus,
            autoAlertEnabled: true,
            assetCategory: determinedCategory,
            annualFeeRM: determinedCategory === 'RENTAL_CONTRACT' ? 12000 : 480,
            fiveYearDiscountPct: 20,
            selectedRenewalTermYears: 1,
        };

        setProfiles((prev) => prev.some((p) => p.registrationNo === cleanReg) ? prev.map((p) => (p.registrationNo === cleanReg ? newProfile : p)) : [newProfile, ...prev]);
        onLogAction('License Registered', `Indexed ${cleanReg} (${cleanName.toUpperCase()}) under [${determinedCategory}].`);
        setSsmSubTab('scanner');
    };

    const handleUploadVaultDoc = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!uploadEffectiveDate || !uploadExpiryDate) return setUploadError('Both Effective Date and Expiry Date are required.');
        if (uploadExpiryDate <= uploadEffectiveDate) return setUploadError('Expiry Date must be after the Effective Date.');

        setUploadError('');
        const newDocId = `DOC-${Math.floor(10000 + Math.random() * 90000)}`;
        const cleanFile = uploadFileName.trim() || `${uploadDocType.toLowerCase()}_${uploadRegNo}.pdf`;

        const createdDoc: DocumentVaultItem = {
            docID: newDocId,
            registrationNo: uploadRegNo,
            docType: uploadDocType,
            fileUrl: `https://storage.local/compliance/${cleanFile}`,
            fileSizeKb: Math.floor(650 + Math.random() * 2100),
            effectiveDate: uploadEffectiveDate,
            expiryDate: uploadExpiryDate,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userID,
            notes: 'Indexed in Central Documentation Database',
        };

        setVaultDocs((prev) => [createdDoc, ...prev]);
        setSelectedDocIds((prev) => [...prev, newDocId]);
        setUploadFileName('');
        onLogAction('Vault Index', `Saved contract/doc ${newDocId} for asset ${uploadRegNo}.`);
        setVaultSubTab('repository');
    };

    const handleInitiateRenewal = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const feeNum = Number(filingFeeInput);
        if (!filingFeeInput || isNaN(feeNum) || feeNum <= 0) return setFilingError(`Enter a valid renewal fee.`);
        if (!filingDeadline) return setFilingError('Target filing deadline is required.');
        if (selectedDocIds.length === 0) return setFilingError('Please attach at least 1 document from the Document Vault.');

        setFilingError('');
        onTriggerLoadingScreen?.('Packaging Contract & Documentation Packet...', 800);
        const matchedProfile = profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
        const renId = `REN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        const createdTask: RenewalTask = {
            renewalID: renId,
            registrationNo: matchedProfile.registrationNo,
            companyName: matchedProfile.companyName,
            councilName: matchedProfile.councilName,
            licenseType: matchedProfile.licenseType,
            filingMode,
            status: 'ASSIGNED_TO_AGENT',
            assignedAgentID: filingMode === 'RPA_AUTOMATED' ? 'ORBYTE_RPA_BOT_01' : 'LEGAL_ADMIN_DESK',
            pbtPortalUrl: `https://contracts-vault.local/${matchedProfile.registrationNo}`,
            submissionReferenceNo: null,
            compiledSubmissionPdfUrl: `https://storage.local/packets/${renId}_bundle.pdf`,
            generatedChecklist: [
                {step: 1, name: 'Asset & Contract Registration Validated', isCompleted: true},
                {step: 2, name: `${selectedDocIds.length} Verified Vault Document(s) Attached`, isCompleted: true},
                {step: 3, name: `${selectedTermYears}-Year Renewal Terms Verified`, isCompleted: true},
                {step: 4, name: 'Manager / Owner Statutory Sign-off', isCompleted: false},
            ],
            targetDeadline: filingDeadline,
            renewalFee: feeNum,
            renewalTermYears: selectedTermYears,
            savedDiscountRM: selectedTermYears > 1 ? 500 : 0,
            currency: 'MYR',
            internalNotes: filingNotes.trim(),
            createdAt: new Date().toISOString(),
        };

        setRenewalTasks((prev) => [createdTask, ...prev]);
        onLogAction('Assisted Renewal', `Created renewal task ${renId} for ${matchedProfile.companyName}.`);
        setFilingSubTab('pipeline');
    };

    const handleAdvanceRenewalStatus = (task: RenewalTask) => {
        if (!canApprove) return alert('RBAC Restriction: Only Owner or Manager accounts can approve renewals.');
        const nextStatus: RenewalTaskStatus = (task.status as string) === 'ASSIGNED_TO_AGENT' ? 'SUBMITTED_TO_PBT' : 'APPROVED_RENEWED';
        const refNo = task.submissionReferenceNo || `REF-${Math.floor(100000 + Math.random() * 900000)}`;

        setRenewalTasks((prev) => prev.map((t) => t.renewalID === task.renewalID ? {
            ...t,
            status: nextStatus,
            submissionReferenceNo: refNo,
            generatedChecklist: t.generatedChecklist.map((c) => ({...c, isCompleted: true})),
        } : t));

        if ((nextStatus as string) === 'APPROVED_RENEWED') {
            const expYear = new Date().getFullYear() + (task.renewalTermYears ?? 1);
            setProfiles((prev) => prev.map((p) => p.registrationNo === task.registrationNo ? {
                ...p,
                complianceStatus: 'COMPLIANT',
                licenseExpiryDate: `${expYear}-12-31`,
            } : p));
        }
    };

    return (
        <div className="space-y-4 select-none w-full">
            {/* Top Overview Banner */}
            <div
                className="bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-950 text-white rounded-2xl p-5 border border-white/10 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                        className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                        Enterprise Documentation Database &amp; Asset Vault
                    </span>
                    <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400"/>
                        Centralized Repository for Tenancy, Fleet, Software &amp; Warranty Licences
                    </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5 text-sky-400 font-bold">
                            <Building2 className="w-4 h-4"/> Building &amp; Tenancy
                        </div>
                        <p className="text-[11px] text-slate-300">
                            Collect stamped tenancy agreements, landlord contacts, deposit refunds, and option-to-renew
                            milestones.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                            <Car className="w-4 h-4"/> Car &amp; Fleet Licences
                        </div>
                        <p className="text-[11px] text-slate-300">
                            Track JPJ road tax, commercial vehicle PUSPAKOM 6-month inspection slips, and fleet
                            insurance renewals.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5 text-purple-400 font-bold">
                            <Wrench className="w-4 h-4"/> Warranty Periods
                        </div>
                        <p className="text-[11px] text-slate-300">
                            OEM machinery, chillers, and hardware warranties with automatic 30-day free replacement
                            claim alerts.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                            <Laptop className="w-4 h-4"/> Software Licensing
                        </div>
                        <p className="text-[11px] text-slate-300">
                            SaaS subscriptions, ERP enterprise seats, license keys, and recurring software MSA
                            documentation.
                        </p>
                    </div>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                    className="inline-flex flex-wrap items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold gap-1">
                    <button
                        type="button"
                        onClick={() => setMainTab('ssm_radar')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'ssm_radar' ? 'bg-white text-emerald-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600"/>
                        <span>All Monitored Assets ({profiles.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setMainTab('vault_packet')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'vault_packet' ? 'bg-white text-purple-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <FolderLock className="w-3.5 h-3.5 text-purple-600"/>
                        <span>Documentation Database ({vaultDocs.length})</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setMainTab('assisted_filing')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                            mainTab === 'assisted_filing' ? 'bg-white text-blue-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                        <Bot className="w-3.5 h-3.5 text-blue-600"/>
                        <span>Renewal Pipeline ({renewalTasks.length})</span>
                    </button>
                </div>

                {mainTab === 'ssm_radar' && (
                    <div
                        className="inline-flex items-center bg-amber-100/80 p-1 rounded-xl border border-amber-200 text-xs font-semibold">
                        <button
                            type="button"
                            onClick={() => setSsmSubTab('scanner')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                ssmSubTab === 'scanner' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'
                            }`}
                        >
                            <AlertTriangle className="w-3.5 h-3.5"/> Expiry Radar ({scannedAlerts.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setSsmSubTab('lookup')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                ssmSubTab === 'lookup' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'
                            }`}
                        >
                            <Plus className="w-3.5 h-3.5"/> Register Asset / Contract
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
                                vaultSubTab === 'repository' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'
                            }`}
                        >
                            <FolderLock className="w-3.5 h-3.5"/> Stored Contracts ({vaultDocs.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setVaultSubTab('upload')}
                            className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${
                                vaultSubTab === 'upload' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'
                            }`}
                        >
                            <Upload className="w-3.5 h-3.5"/> Upload Contract / Doc
                        </button>
                    </div>
                )}
            </div>

            {/* TAB 1: ALL MONITORED ASSETS & EXPIRY RADAR */}
            {mainTab === 'ssm_radar' && (
                <div className="w-full space-y-4">
                    {ssmSubTab === 'scanner' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500"/>
                                        Licences, Leases, Warranties &amp; Subscriptions Radar
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Automated tracking for building rental renewals, vehicle road taxes, equipment
                                        warranties, and software subscriptions.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                    <select
                                        value={windowDays}
                                        onChange={(e) => setWindowDays(Number(e.target.value))}
                                        className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800"
                                    >
                                        <option value={30}>Expiring in 30 Days</option>
                                        <option value={60}>Expiring in 60 Days</option>
                                        <option value={90}>Expiring in 90 Days</option>
                                        <option value={365}>Show All (365 Days)</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            onTriggerLoadingScreen?.('Scanning Database & Expiry Timelines...', 500);
                                        }}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5"/> Scan
                                    </button>
                                </div>
                            </div>

                            {/* 5-Pillar Filter Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {[
                                    {
                                        id: 'ALL' as const,
                                        label: `All Monitored (${profiles.length})`,
                                        icon: ShieldCheck
                                    },
                                    {
                                        id: 'RENTAL_CONTRACT' as const,
                                        label: 'Building & Rental Places',
                                        icon: Building2
                                    },
                                    {id: 'FLEET_VEHICLE' as const, label: 'Car & Fleet Licences', icon: Car},
                                    {id: 'EQUIPMENT_WARRANTY' as const, label: 'Warranty Periods', icon: Wrench},
                                    {id: 'SOFTWARE_LICENSE' as const, label: 'Software Licensing', icon: Laptop},
                                    {id: 'SSM_PBT_LICENSE' as const, label: 'SSM & Council Licences', icon: FileText},
                                ].map((cat) => {
                                    const Icon = cat.icon;
                                    const active = assetCategoryFilter === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => setAssetCategoryFilter(cat.id)}
                                            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                                active
                                                    ? 'bg-slate-900 text-white border-slate-900'
                                                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                            }`}
                                        >
                                            <Icon className="w-3.5 h-3.5"/>
                                            <span>{cat.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Alert Items List */}
                            <div className="grid grid-cols-1 gap-3.5">
                                {scannedAlerts.length === 0 ? (
                                    <div
                                        className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
                                        No items expiring within the selected window. Click &quot;Register Asset /
                                        Contract&quot; to add new entries.
                                    </div>
                                ) : (
                                    scannedAlerts.map((prof) => {
                                        const daysLeft = calcDaysLeft(prof.licenseExpiryDate);
                                        const isExpired = daysLeft < 0 || prof.complianceStatus === 'EXPIRED';
                                        const cat = detectAssetCategory(prof);

                                        return (
                                            <div
                                                key={`${prof.registrationNo}-${prof.licenseType}`}
                                                className={`p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition ${
                                                    isExpired
                                                        ? 'bg-rose-50/40 border-rose-200'
                                                        : prof.complianceStatus === 'EXPIRING_SOON'
                                                            ? 'bg-amber-50/35 border-amber-200'
                                                            : 'bg-emerald-50/30 border-emerald-200'
                                                }`}
                                            >
                                                <div className="space-y-1.5 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span
                                                            className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold">
                                                            {prof.registrationNo}
                                                        </span>
                                                        <span
                                                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                                cat === 'RENTAL_CONTRACT' ? 'bg-sky-100 text-sky-800' :
                                                                    cat === 'FLEET_VEHICLE' ? 'bg-blue-100 text-blue-800' :
                                                                        cat === 'EQUIPMENT_WARRANTY' ? 'bg-purple-100 text-purple-800' :
                                                                            cat === 'SOFTWARE_LICENSE' ? 'bg-emerald-100 text-emerald-800' :
                                                                                'bg-slate-100 text-slate-800'
                                                            }`}>
                                                            {cat.replace(/_/g, ' ')}
                                                        </span>
                                                        <span
                                                            className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                                                isExpired ? 'bg-rose-100 text-rose-700' : prof.complianceStatus === 'EXPIRING_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                                            }`}>
                                                            {isExpired ? 'EXPIRED' : `${daysLeft}d left`}
                                                        </span>
                                                        <span
                                                            className="text-xs font-mono text-slate-500">Expiry Date: {prof.licenseExpiryDate}</span>
                                                    </div>

                                                    <h4 className="text-sm font-extrabold text-slate-900">
                                                        {prof.companyName}
                                                        <span
                                                            className="ml-2 font-normal text-xs text-slate-500 font-mono">[{prof.councilName}]</span>
                                                    </h4>

                                                    {/* Context-Specific Banner */}
                                                    <div
                                                        className="p-2.5 rounded-xl bg-white/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                        {cat === 'RENTAL_CONTRACT' && (
                                                            <div className="flex items-center gap-2 text-sky-800">
                                                                <Building2 className="w-3.5 h-3.5 shrink-0"/>
                                                                <span><strong>Building Listing:</strong> Stamped Tenancy Agreement active. Notice required 60 days before expiry for deposit protection.</span>
                                                            </div>
                                                        )}
                                                        {cat === 'FLEET_VEHICLE' && (
                                                            <div className="flex items-center gap-2 text-blue-800">
                                                                <Car className="w-3.5 h-3.5 shrink-0"/>
                                                                <span><strong>Vehicle Fleet:</strong> Road tax &amp; PUSPAKOM inspection slip must be submitted to avoid commercial insurance void.</span>
                                                            </div>
                                                        )}
                                                        {cat === 'EQUIPMENT_WARRANTY' && (
                                                            <div className="flex items-center gap-2 text-purple-800">
                                                                <Wrench className="w-3.5 h-3.5 shrink-0"/>
                                                                <span><strong>OEM Warranty:</strong> Free preventative maintenance/compressor replacement eligible before warranty expires.</span>
                                                            </div>
                                                        )}
                                                        {cat === 'SOFTWARE_LICENSE' && (
                                                            <div className="flex items-center gap-2 text-emerald-800">
                                                                <Laptop className="w-3.5 h-3.5 shrink-0"/>
                                                                <span><strong>Software License:</strong> Enterprise tier / SaaS seat contract. Master Services Agreement indexed in vault.</span>
                                                            </div>
                                                        )}
                                                        {cat === 'SSM_PBT_LICENSE' && (
                                                            <div className="flex items-center gap-2 text-slate-800">
                                                                <FileText className="w-3.5 h-3.5 shrink-0"/>
                                                                <span><strong>Business Premise:</strong> Local authority permit (Lesen Premis). Up to 22% discount on multi-year renewal.</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    {cat === 'EQUIPMENT_WARRANTY' && (
                                                        claimedWarrantyRegNos.includes(prof.registrationNo) ? (
                                                            <span
                                                                className="px-3 py-2 rounded-xl bg-purple-100 text-purple-800 text-xs font-bold inline-flex items-center gap-1">
                                                                <CheckCircle2 className="w-3.5 h-3.5"/> OEM Service Booked
                                                            </span>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleClaimWarrantyService(prof)}
                                                                className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                            >
                                                                <Wrench className="w-3.5 h-3.5"/> Claim Free Service
                                                            </button>
                                                        )
                                                    )}

                                                    <button
                                                        type="button"
                                                        onClick={() => handlePrepareAssistedFiling(prof)}
                                                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                    >
                                                        Renew / Extend <ArrowUpRight className="w-3.5 h-3.5"/>
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {/* Subtab: Register Asset */}
                    {ssmSubTab === 'lookup' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-emerald-600"/> Register Building Lease, Fleet,
                                        Software or Warranty
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Add building listings, tenancy agreements, vehicle plate numbers, software
                                        subscriptions, or equipment warranties to the documentation database.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleVerifySsmProfile} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Asset Category
                                            *</label>
                                        <select
                                            value={ssmLicenseType}
                                            onChange={(e) => setSsmLicenseType(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {LICENSE_CATEGORIES.map((l) => (
                                                <option key={l.value} value={l.value}>{l.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">ID / Plate No. /
                                            Contract Ref *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., BLD-LOT-401, JPJ-WXY8821, SOFT-MSFT-365"
                                            value={ssmRegNo}
                                            onChange={(e) => {
                                                setSsmRegNo(e.target.value);
                                                setSsmLookupError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Issuing Authority /
                                            Landlord / Vendor *</label>
                                        <select
                                            value={ssmCouncil}
                                            onChange={(e) => setSsmCouncil(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {ISSUING_AUTHORITIES_AND_VENDORS.map((c) => (
                                                <option key={c.value} value={c.value}>{c.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Asset / Rental Premise
                                            / Software Name *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., Suite 12-04 Menara Bangsar or Delivery Van BKK 1234 or AWS Enterprise Plan"
                                            value={ssmCompanyName}
                                            onChange={(e) => {
                                                setSsmCompanyName(e.target.value);
                                                setSsmLookupError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expiry / Tenancy Cutoff
                                            Date *</label>
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
                                        Back to Radar
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
                                    >
                                        <Check className="w-3.5 h-3.5"/> Save to Database
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 2: DOCUMENTATION DATABASE & CONTRACT VAULT */}
            {mainTab === 'vault_packet' && (
                <div className="w-full space-y-4">
                    {vaultSubTab === 'repository' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FolderLock className="w-4 h-4 text-purple-600"/> Centralized Documentation
                                        Database &amp; Vault
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Stores and indexes stamped tenancy agreements, vehicle grants, software
                                        licenses, and warranty documentation.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setVaultSubTab('upload')}
                                        className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5"/> + Upload Contract / Document
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setMainTab('assisted_filing');
                                            setFilingSubTab('initiate');
                                        }}
                                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                                    >
                                        Proceed with {selectedDocIds.length} Document(s) <ArrowUpRight
                                        className="w-3.5 h-3.5"/>
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                                        <th className="py-3 px-4 w-12">Select</th>
                                        <th className="py-3 px-3">Doc ID &amp; Classification</th>
                                        <th className="py-3 px-3">Linked Asset / Registration</th>
                                        <th className="py-3 px-3">Contract Validity Period</th>
                                        <th className="py-3 px-3">File Size</th>
                                        <th className="py-3 px-4 text-right">Action</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {vaultDocs.map((doc) => {
                                        const isChecked = selectedDocIds.includes(doc.docID);
                                        return (
                                            <tr key={doc.docID}
                                                className={isChecked ? 'bg-purple-50/30' : 'hover:bg-slate-50'}>
                                                <td className="py-3 px-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => setSelectedDocIds((prev) =>
                                                            prev.includes(doc.docID) ? prev.filter((id) => id !== doc.docID) : [...prev, doc.docID]
                                                        )}
                                                        className="w-4 h-4 accent-purple-600 cursor-pointer"
                                                    />
                                                </td>
                                                <td className="py-3 px-3">
                                                    <p className="font-bold text-slate-900">{doc.docType.replace(/_/g, ' ')}</p>
                                                    <span
                                                        className="font-mono text-[11px] text-slate-400">{doc.docID}</span>
                                                </td>
                                                <td className="py-3 px-3 font-mono font-bold text-slate-700">{doc.registrationNo}</td>
                                                <td className="py-3 px-3 font-mono text-slate-600">
                                                    {doc.effectiveDate} &rarr; <strong>{doc.expiryDate}</strong>
                                                </td>
                                                <td className="py-3 px-3 text-slate-500">{doc.fileSizeKb.toLocaleString()} KB</td>
                                                <td className="py-3 px-4 text-right">
                                                    <a
                                                        href={doc.fileUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 font-bold text-[11px] transition"
                                                    >
                                                        <FileText className="w-3 h-3"/> View Stored PDF <ExternalLink
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
                                        <Upload className="w-4 h-4 text-purple-600"/> Upload Contract / License Document
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Index tenancy contracts, vehicle registration certificates, software MSAs, or
                                        warranty agreements into the database.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Linked Asset / Entity
                                            *</label>
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
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract / Document
                                            Category *</label>
                                        <select
                                            value={uploadDocType}
                                            onChange={(e) => setUploadDocType(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            {DOC_TYPES.map((d) => (
                                                <option key={d.value} value={d.value}>{d.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract Effective Date
                                            *</label>
                                        <input
                                            type="date"
                                            value={uploadEffectiveDate}
                                            onChange={(e) => setUploadEffectiveDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract Expiry Date
                                            *</label>
                                        <input
                                            type="date"
                                            value={uploadExpiryDate}
                                            onChange={(e) => setUploadExpiryDate(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">File Upload</label>
                                        <div className="flex items-center gap-3">
                                            <input
                                                type="text"
                                                placeholder="Choose PDF / image or enter filename..."
                                                value={uploadFileName}
                                                onChange={(e) => setUploadFileName(e.target.value)}
                                                className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold cursor-pointer shrink-0"
                                            >
                                                Choose File
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
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                                    >
                                        <Upload className="w-3.5 h-3.5"/> Save to Documentation Database
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: ASSISTED FILING & RENEWAL PIPELINE */}
            {mainTab === 'assisted_filing' && (
                <div className="w-full space-y-4">
                    {filingSubTab === 'pipeline' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-blue-600"/> Active Renewals &amp; Contract
                                        Extensions
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Tracks renewal packet approvals, tenancy extension exercises, and road tax
                                        updates.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFilingSubTab('initiate')}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                    <Plus className="w-3.5 h-3.5"/> Initiate Renewal / Extension
                                </button>
                            </div>

                            <div className="space-y-3">
                                {renewalTasks.length === 0 ? (
                                    <div
                                        className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
                                        No active renewal tasks in pipeline.
                                    </div>
                                ) : (
                                    renewalTasks.map((task) => {
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
                                                            {task.registrationNo}
                                                        </span>
                                                        <span
                                                            className="text-sm font-extrabold text-slate-900">{task.companyName}</span>
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span
                                                                className="text-[10px] uppercase font-bold text-slate-400 block">Est. Cost</span>
                                                            <span className="text-sm font-extrabold text-slate-900">
                                                                {currencySymbol} {(task.renewalFee * exchangeRate).toLocaleString()}
                                                            </span>
                                                        </div>
                                                        {!isDone ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAdvanceRenewalStatus(task)}
                                                                className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                                            >
                                                                <Send className="w-3.5 h-3.5"/>
                                                                {(task.status as string) === 'ASSIGNED_TO_AGENT' ? 'Approve & Submit' : 'Mark Renewed'}
                                                            </button>
                                                        ) : (
                                                            <span
                                                                className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600"/> Completed ({task.submissionReferenceNo})
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
                                                                item.isCompleted ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'
                                                            }`}
                                                        >
                                                            <Check className="w-3.5 h-3.5"/> {item.name}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {filingSubTab === 'initiate' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div
                                className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-blue-600"/> Initiate Contract Renewal / Extension
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Link verified documents from the Documentation Database to process tenancy
                                        extensions, road tax renewals, or software renewals.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleInitiateRenewal} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Asset / Listing
                                            *</label>
                                        <select
                                            value={filingRegNo}
                                            onChange={(e) => setFilingRegNo(e.target.value)}
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
                                        <label className="font-bold text-slate-700 block mb-1.5">Processing Mode
                                            *</label>
                                        <select
                                            value={filingMode}
                                            onChange={(e) => setFilingMode(e.target.value as 'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED')}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            <option value="CONCIERGE_MANUAL_SUBMISSION">Concierge Legal / Admin Desk
                                            </option>
                                            <option value="RPA_AUTOMATED">Automated RPA Script</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expected Renewal Fee
                                            ({currency}) *</label>
                                        <input
                                            type="text"
                                            inputMode="decimal"
                                            value={filingFeeInput}
                                            onChange={(e) => {
                                                setFilingFeeInput(sanitizePositiveDecimal(e.target.value));
                                                setFilingError('');
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Extension
                                            Deadline *</label>
                                        <input
                                            type="date"
                                            value={filingDeadline}
                                            onChange={(e) => setFilingDeadline(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900"
                                        />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">Notes &amp; Contract
                                            Terms</label>
                                        <textarea
                                            rows={2}
                                            value={filingNotes}
                                            onChange={(e) => setFilingNotes(e.target.value)}
                                            className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800"
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
                                        Back
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer"
                                    >
                                        <Send className="w-3.5 h-3.5"/> Submit for Sign-Off
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