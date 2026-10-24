// src/modules/module6-compliance/ComplianceRenewalModule.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowUpRight, Bot, Building2, Car, Check, CheckCircle2,
    ExternalLink, Eye, FileText, FolderLock, Laptop, Loader2, Plus, RefreshCw, Search,
    Send, ShieldCheck, Sparkles, Trash2, Upload, Wrench, X,
} from 'lucide-react';
import {
    CURRENCY_SYMBOLS,
    type BusinessComplianceProfile,
    type ComplianceAssetCategory,
    type CurrencyCode,
    type DocumentVaultItem,
    type RenewalTask,
    type RenewalTaskStatus,
    type UserRole,
} from '../../types/vyte.ts';
import {
    complianceApi,
    DEFAULT_SEED_PROFILES,
    DEFAULT_SEED_VAULT_DOCS,
} from '../../services/complianceApi';

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

const VALID_MAIN_TABS: MainComplianceTab[] = ['ssm_radar', 'vault_packet', 'assisted_filing'];
const COMPLIANCE_UI_STORAGE_KEY = 'vyte_compliance_ui_state_v5';

const ISSUING_AUTHORITIES_AND_VENDORS = [
    { label: 'MBPJ (Petaling Jaya)', value: 'MBPJ' },
    { label: 'DBKL (Kuala Lumpur)', value: 'DBKL' },
    { label: 'MBSA (Shah Alam)', value: 'MBSA' },
    { label: 'MBSJ (Subang Jaya)', value: 'MBSJ' },
    { label: 'JPJ / PUSPAKOM Commercial Fleet', value: 'JPJ / PUSPAKOM Commercial Fleet' },
    { label: 'Landlord / Building Management Office', value: 'BUILDING_MANAGEMENT' },
    { label: 'OEM Machinery & Equipment Vendor', value: 'OEM_EQUIPMENT_VENDOR' },
    { label: 'Enterprise Software / SaaS Vendor (Microsoft/AWS/Atlassian)', value: 'SOFTWARE_VENDOR' },
];

const LICENSE_CATEGORIES: { label: string; value: string; category: ComplianceAssetCategory }[] = [
    { label: 'Premise License (Lesen Premis / SSM)', value: 'PREMISE_LICENSE', category: 'SSM_PBT_LICENSE' },
    { label: 'Signboard / Advertising License', value: 'SIGNBOARD_LICENSE', category: 'SSM_PBT_LICENSE' },
    { label: 'Building Tenancy & Rental Contract', value: 'BUILDING_RENTAL_CONTRACT', category: 'RENTAL_CONTRACT' },
    { label: 'Car / Fleet Road Tax & PUSPAKOM Inspection', value: 'FLEET_ROADTAX_PUSPAKOM', category: 'FLEET_VEHICLE' },
    { label: 'Equipment / Machinery OEM Warranty Period', value: 'EQUIPMENT_OEM_WARRANTY', category: 'EQUIPMENT_WARRANTY' },
    { label: 'Software License / Cloud SaaS Subscription', value: 'SOFTWARE_SUBSCRIPTION', category: 'SOFTWARE_LICENSE' },
];

const DOC_TYPES = [
    { label: 'Stamped Tenancy Agreement (Rental Contract)', value: 'TENANCY_AGREEMENT' },
    { label: 'Building Floor Plan / CCC / Fire Safety Endorsement', value: 'BUILDING_CCC_SAFETY' },
    { label: 'JPJ Vehicle Ownership Grant (VOC) & Road Tax', value: 'VEHICLE_ROADTAX_VOC' },
    { label: 'PUSPAKOM VR1 Commercial Inspection Slip', value: 'PUSPAKOM_INSPECTION_SLIP' },
    { label: 'Equipment OEM Warranty Card & Proof of Purchase', value: 'EQUIPMENT_WARRANTY_CERT' },
    { label: 'Software License Agreement / SaaS Master Contract', value: 'SOFTWARE_EULA_CONTRACT' },
    { label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9' },
];

const OVERVIEW_CARDS = [
    { icon: Building2, color: 'text-sky-400', title: 'Building & Tenancy', desc: 'Collect stamped tenancy agreements, landlord contacts, deposit refunds, and option-to-renew milestones.' },
    { icon: Car, color: 'text-amber-400', title: 'Car & Fleet Licences', desc: 'Track JPJ road tax, commercial vehicle PUSPAKOM 6-month inspection slips, and fleet insurance renewals.' },
    { icon: Wrench, color: 'text-purple-400', title: 'Warranty Periods', desc: 'OEM machinery, chillers, and hardware warranties with automatic 30-day free replacement claim alerts.' },
    { icon: Laptop, color: 'text-emerald-400', title: 'Software Licensing', desc: 'SaaS subscriptions, ERP enterprise seats, license keys, and recurring software MSA documentation.' },
];

const CATEGORY_META: Record<ComplianceAssetCategory, { badgeCls: string; textCls: string; icon: React.ElementType; title: string; desc: string }> = {
    RENTAL_CONTRACT: { badgeCls: 'bg-sky-100 text-sky-800', textCls: 'text-sky-800', icon: Building2, title: 'Building Listing:', desc: 'Stamped Tenancy Agreement active. Notice required 60 days before expiry for deposit protection.' },
    FLEET_VEHICLE: { badgeCls: 'bg-blue-100 text-blue-800', textCls: 'text-blue-800', icon: Car, title: 'Vehicle Fleet:', desc: 'Road tax & PUSPAKOM inspection slip must be submitted to avoid commercial insurance void.' },
    EQUIPMENT_WARRANTY: { badgeCls: 'bg-purple-100 text-purple-800', textCls: 'text-purple-800', icon: Wrench, title: 'OEM Warranty:', desc: 'Free preventative maintenance/compressor replacement eligible before warranty expires.' },
    SOFTWARE_LICENSE: { badgeCls: 'bg-emerald-100 text-emerald-800', textCls: 'text-emerald-800', icon: Laptop, title: 'Software License:', desc: 'Enterprise tier / SaaS seat contract. Master Services Agreement indexed in vault.' },
    SSM_PBT_LICENSE: { badgeCls: 'bg-slate-100 text-slate-800', textCls: 'text-slate-800', icon: FileText, title: 'Business Premise:', desc: 'Local authority permit (Lesen Premis). Up to 22% discount on multi-year renewal.' },
};

const sanitizePositiveDecimal = (raw: string): string => {
    const parts = raw.replace(/[^0-9.]/g, '').split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 6);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

export const ComplianceRenewalModule: React.FC<ComplianceRenewalModuleProps> = ({
                                                                                    profiles, setProfiles, vaultDocs, setVaultDocs, renewalTasks, setRenewalTasks,
                                                                                    role, userID, currency = 'MYR', exchangeRate = 1.0, onLogAction, onTriggerLoadingScreen,
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

    const initialMainTab: MainComplianceTab = VALID_MAIN_TABS.includes(savedState.mainTab)
        ? savedState.mainTab
        : 'ssm_radar';

    const [mainTab, setMainTab] = useState<MainComplianceTab>(initialMainTab);
    const [ssmSubTab, setSsmSubTab] = useState<SsmSubTab>(savedState.ssmSubTab ?? 'scanner');
    const [vaultSubTab, setVaultSubTab] = useState<VaultSubTab>(savedState.vaultSubTab ?? 'repository');
    const [filingSubTab, setFilingSubTab] = useState<FilingSubTab>(savedState.filingSubTab ?? 'pipeline');
    const [assetCategoryFilter, setAssetCategoryFilter] = useState<'ALL' | ComplianceAssetCategory>('ALL');
    const [claimedWarrantyRegNos, setClaimedWarrantyRegNos] = useState<string[]>([]);

    // Radar / Register Asset state
    const [ssmRegNo, setSsmRegNo] = useState<string>(savedState.ssmRegNo ?? 'BLD-UNIT-88A');
    const [ssmCompanyName, setSsmCompanyName] = useState<string>(savedState.ssmCompanyName ?? 'Bangsar South HQ - 3rd Floor');
    const [ssmCouncil, setSsmCouncil] = useState<string>(savedState.ssmCouncil ?? 'BUILDING_MANAGEMENT');
    const [ssmLicenseType, setSsmLicenseType] = useState<string>(savedState.ssmLicenseType ?? 'BUILDING_RENTAL_CONTRACT');
    const [ssmExpiryDate, setSsmExpiryDate] = useState<string>(savedState.ssmExpiryDate ?? '2027-01-31');
    const [ssmLookupError, setSsmLookupError] = useState<string>('');
    const [windowDays, setWindowDays] = useState<number>(savedState.windowDays ?? 365);

    // Documentation Database (Vault) state
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(savedState.selectedDocIds ?? ['DOC-99401']);
    const [vaultSearchQuery, setVaultSearchQuery] = useState<string>('');
    const [vaultAssetFilter, setVaultAssetFilter] = useState<string>('ALL');
    const [previewDoc, setPreviewDoc] = useState<DocumentVaultItem | null>(null);

    const [uploadRegNo, setUploadRegNo] = useState<string>(savedState.uploadRegNo ?? 'BLD-UNIT-88A');
    const [uploadDocType, setUploadDocType] = useState<string>(savedState.uploadDocType ?? 'TENANCY_AGREEMENT');
    const [uploadEffectiveDate, setUploadEffectiveDate] = useState<string>(savedState.uploadEffectiveDate ?? '2025-02-01');
    const [uploadExpiryDate, setUploadExpiryDate] = useState<string>(savedState.uploadExpiryDate ?? '2027-01-31');
    const [uploadFileName, setUploadFileName] = useState<string>('');
    const [uploadFileObj, setUploadFileObj] = useState<File | null>(null);
    const [uploadNotes, setUploadNotes] = useState<string>('Indexed in Central Documentation Database');
    const [uploadError, setUploadError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Renewal Pipeline state
    const [filingRegNo, setFilingRegNo] = useState<string>(savedState.filingRegNo ?? 'BLD-UNIT-88A');
    const [filingMode, setFilingMode] = useState<'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED'>('CONCIERGE_MANUAL_SUBMISSION');
    const [selectedTermYears, setSelectedTermYears] = useState<1 | 3 | 5>(1);
    const [filingFeeInput, setFilingFeeInput] = useState<string>(savedState.filingFeeInput ?? '12000.00');
    const [filingDeadline, setFilingDeadline] = useState<string>(savedState.filingDeadline ?? '2026-12-15');
    const [filingNotes, setFilingNotes] = useState<string>(savedState.filingNotes ?? 'Tenancy extension notice. Rental deposit & stamped doc attached.');
    const [filingError, setFilingError] = useState<string>('');

    const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    // 拉取数据并在后端为空时自动用父组件初始值或默认种子数据回填
    const fetchAllData = useCallback(async () => {
        setIsRefreshing(true);
        try {
            const [pList, vList, rList] = await Promise.all([
                complianceApi.getProfiles(),
                complianceApi.getVaultDocs(),
                complianceApi.getRenewalTasks(),
            ]);

            setProfiles((prev) => {
                if (Array.isArray(pList) && pList.length > 0) return pList;
                const fallback = prev.length > 0 ? prev : DEFAULT_SEED_PROFILES;
                complianceApi.syncProfiles(fallback).catch(() => {});
                return fallback;
            });

            setVaultDocs((prev) => {
                if (Array.isArray(vList) && vList.length > 0) return vList;
                const fallback = prev.length > 0 ? prev : DEFAULT_SEED_VAULT_DOCS;
                complianceApi.syncVaultDocs(fallback).catch(() => {});
                return fallback;
            });

            setRenewalTasks((prev) => (Array.isArray(rList) && rList.length > 0 ? rList : prev));
        } catch (err: unknown) {
            console.error('Failed to load compliance data from server:', err);
            setProfiles((prev) => (prev.length > 0 ? prev : DEFAULT_SEED_PROFILES));
            setVaultDocs((prev) => (prev.length > 0 ? prev : DEFAULT_SEED_VAULT_DOCS));
        } finally {
            setIsRefreshing(false);
        }
    }, [setProfiles, setVaultDocs, setRenewalTasks]);

    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);

    // 保证下拉框选中的 registrationNo 始终存在于 profiles 中
    useEffect(() => {
        if (profiles.length > 0) {
            if (!profiles.some((p) => p.registrationNo === uploadRegNo)) {
                setUploadRegNo(profiles[0].registrationNo);
            }
            if (!profiles.some((p) => p.registrationNo === filingRegNo)) {
                setFilingRegNo(profiles[0].registrationNo);
            }
        }
    }, [profiles, uploadRegNo, filingRegNo]);

    // 清理不存在于 vaultDocs 中的幽灵选中 ID
    useEffect(() => {
        if (vaultDocs.length > 0) {
            setSelectedDocIds((prev) => {
                const valid = prev.filter((id) => vaultDocs.some((d) => d.docID === id));
                return valid.length === prev.length ? prev : valid;
            });
        }
    }, [vaultDocs]);

    useEffect(() => {
        localStorage.setItem(COMPLIANCE_UI_STORAGE_KEY, JSON.stringify({
            mainTab, ssmSubTab, vaultSubTab, filingSubTab, ssmRegNo, ssmCompanyName, ssmCouncil, ssmLicenseType, ssmExpiryDate,
            windowDays, selectedDocIds, uploadRegNo, uploadDocType, uploadEffectiveDate, uploadExpiryDate, filingRegNo, filingFeeInput, filingDeadline, filingNotes,
        }));
    }, [mainTab, ssmSubTab, vaultSubTab, filingSubTab, ssmRegNo, ssmCompanyName, ssmCouncil, ssmLicenseType, ssmExpiryDate, windowDays, selectedDocIds, uploadRegNo, uploadDocType, uploadEffectiveDate, uploadExpiryDate, filingRegNo, filingFeeInput, filingDeadline, filingNotes]);

    const handleClaimWarrantyService = (prof: BusinessComplianceProfile) => {
        setClaimedWarrantyRegNos((prev) => [...prev, prof.registrationNo]);
        onLogAction('Warranty Claim', `Booked free OEM warranty inspection & preventive maintenance for ${prof.companyName} (${prof.registrationNo}).`);
    };

    const detectAssetCategory = (p: BusinessComplianceProfile): ComplianceAssetCategory => {
        if (p.assetCategory && p.assetCategory in CATEGORY_META) return p.assetCategory as ComplianceAssetCategory;
        const reg = p.registrationNo.toUpperCase();
        const comp = p.companyName.toUpperCase();
        const type = (p.licenseType || '').toUpperCase();
        const council = p.councilName.toUpperCase();
        if (reg.startsWith('SOFT-') || comp.includes('SOFTWARE') || comp.includes('SAAS') || type.includes('SOFTWARE') || council.includes('SOFTWARE')) return 'SOFTWARE_LICENSE';
        if (reg.startsWith('BLD-') || comp.includes('TENANCY') || comp.includes('HQ') || comp.includes('SUITE') || type.includes('RENTAL') || council.includes('BUILDING') || p.assetCategory === 'BUILDING_RENTAL') return 'RENTAL_CONTRACT';
        if (reg.startsWith('JPJ-') || council.includes('JPJ') || council.includes('PUSPAKOM') || comp.includes('VAN') || comp.includes('LORRY') || type.includes('FLEET')) return 'FLEET_VEHICLE';
        if (reg.startsWith('WARR-') || comp.includes('WARRANTY') || council.includes('WARRANTY') || type.includes('EQUIPMENT')) return 'EQUIPMENT_WARRANTY';
        return 'SSM_PBT_LICENSE';
    };

    const calcDaysLeft = (isoDate: string): number => Math.round((new Date(isoDate).getTime() - new Date(todayIso).getTime()) / 86400000);

    const scannedAlerts = useMemo(
        () => profiles.filter((p) => (assetCategoryFilter === 'ALL' || detectAssetCategory(p) === assetCategoryFilter) && calcDaysLeft(p.licenseExpiryDate) <= windowDays),
        [profiles, assetCategoryFilter, windowDays]
    );

    const filteredVaultDocs = useMemo(() => {
        const q = vaultSearchQuery.trim().toLowerCase();
        return vaultDocs.filter((doc) => {
            const matchesAsset = vaultAssetFilter === 'ALL' || doc.registrationNo === vaultAssetFilter;
            const matchesQuery =
                !q ||
                doc.docID.toLowerCase().includes(q) ||
                doc.registrationNo.toLowerCase().includes(q) ||
                doc.docType.toLowerCase().includes(q) ||
                (doc.notes || '').toLowerCase().includes(q);
            return matchesAsset && matchesQuery;
        });
    }, [vaultDocs, vaultAssetFilter, vaultSearchQuery]);

    const computeTermFee = useCallback(
        (profile: BusinessComplianceProfile | undefined, term: 1 | 3 | 5): number => {
            const annual = profile?.annualFeeRM ?? 450;
            const disc = term === 5 ? (profile?.fiveYearDiscountPct ?? 22) : term === 3 ? 12 : 0;
            return Number((annual * term * (1 - disc / 100) * exchangeRate).toFixed(2));
        },
        [exchangeRate]
    );

    const handlePrepareAssistedFiling = (profile: BusinessComplianceProfile, preferredTerm?: 1 | 3 | 5) => {
        const term: 1 | 3 | 5 = preferredTerm ?? (profile.selectedRenewalTermYears === 3 || profile.selectedRenewalTermYears === 5 ? profile.selectedRenewalTermYears : 1);
        const calculatedFee = computeTermFee(profile, term);
        setFilingRegNo(profile.registrationNo);
        setSelectedTermYears(term);
        setFilingFeeInput(String(calculatedFee));
        setFilingNotes(`${term}-Year term renewal initiated for ${profile.companyName}. Documentation verified.`);

        // 自动勾选该资产关联的文档
        const linkedDocs = vaultDocs.filter((d) => d.registrationNo === profile.registrationNo).map((d) => d.docID);
        if (linkedDocs.length > 0) {
            setSelectedDocIds(linkedDocs);
        }

        setMainTab('assisted_filing');
        setFilingSubTab('initiate');
    };

    // 1. 提交新注册资产 -> POST /api/compliance/profiles
    const handleVerifySsmProfile = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanReg = ssmRegNo.trim().toUpperCase();
        const cleanName = ssmCompanyName.trim();
        if (cleanReg.length < 3) return setSsmLookupError('Identifier / Serial / Plate No. is required.');
        if (cleanName.length < 3) return setSsmLookupError('Asset / Place / Software Name is required (min 3 characters).');
        if (!ssmExpiryDate) return setSsmLookupError('Please select a valid expiry date.');

        setSsmLookupError('');
        setIsSubmitting(true);
        onTriggerLoadingScreen?.(`Registering ${cleanName} into Documentation Database...`, 600);

        const daysLeft = calcDaysLeft(ssmExpiryDate);
        const computedStatus: BusinessComplianceProfile['complianceStatus'] = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'COMPLIANT';
        const determinedCategory: ComplianceAssetCategory = LICENSE_CATEGORIES.find((l) => l.value === ssmLicenseType)?.category ?? 'SSM_PBT_LICENSE';

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

        try {
            const savedItem = await complianceApi.saveProfile(newProfile);
            setProfiles((prev) =>
                prev.some((p) => p.registrationNo.toUpperCase() === cleanReg)
                    ? prev.map((p) => (p.registrationNo.toUpperCase() === cleanReg ? savedItem : p))
                    : [savedItem, ...prev]
            );
            setUploadRegNo(cleanReg);
            setFilingRegNo(cleanReg);
            onLogAction('License Registered', `Indexed ${cleanReg} (${cleanName.toUpperCase()}) under [${determinedCategory}].`);
            setSsmSubTab('scanner');
        } catch (err: unknown) {
            setSsmLookupError(err instanceof Error ? err.message : 'Failed to register profile to backend.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 2. 上传文件归档 -> POST /api/compliance/vault-docs
    const handleUploadVaultDoc = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!uploadRegNo) return setUploadError('Please select or enter a linked Asset / Registration No.');
        if (!uploadEffectiveDate || !uploadExpiryDate) return setUploadError('Both Effective Date and Expiry Date are required.');
        if (uploadExpiryDate <= uploadEffectiveDate) return setUploadError('Expiry Date must be after the Effective Date.');

        setUploadError('');
        setIsSubmitting(true);

        const newDocId = `DOC-${Math.floor(10000 + Math.random() * 90000)}`;
        const cleanFile = uploadFileName.trim() || `${uploadDocType.toLowerCase()}_${uploadRegNo}.pdf`;
        // 若用户选择了本地真实文件，生成本地可访问的 Blob URL
        const resolvedUrl = uploadFileObj
            ? URL.createObjectURL(uploadFileObj)
            : `#preview-${newDocId}-${encodeURIComponent(cleanFile)}`;
        const resolvedSizeKb = uploadFileObj
            ? Math.max(1, Math.round(uploadFileObj.size / 1024))
            : Math.floor(650 + Math.random() * 2100);

        const createdDoc: DocumentVaultItem = {
            docID: newDocId,
            registrationNo: uploadRegNo,
            docType: uploadDocType,
            fileUrl: resolvedUrl,
            fileSizeKb: resolvedSizeKb,
            effectiveDate: uploadEffectiveDate,
            expiryDate: uploadExpiryDate,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userID,
            notes: uploadNotes.trim() || `File: ${cleanFile}`,
        };

        try {
            const savedDoc = await complianceApi.saveVaultDoc(createdDoc);
            setVaultDocs((prev) => [savedDoc, ...prev.filter((d) => d.docID !== savedDoc.docID)]);
            setSelectedDocIds((prev) => (prev.includes(savedDoc.docID) ? prev : [...prev, savedDoc.docID]));
            setUploadFileName('');
            setUploadFileObj(null);
            onLogAction('Vault Index', `Saved contract/doc ${savedDoc.docID} (${cleanFile}) for asset ${uploadRegNo}.`);
            setVaultSubTab('repository');
        } catch (err: unknown) {
            setUploadError(err instanceof Error ? err.message : 'Failed to upload document to backend.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 删除文档
    const handleDeleteVaultDoc = async (doc: DocumentVaultItem) => {
        await complianceApi.deleteVaultDoc(doc.docID);
        setVaultDocs((prev) => prev.filter((d) => d.docID !== doc.docID));
        setSelectedDocIds((prev) => prev.filter((id) => id !== doc.docID));
        onLogAction('Vault Delete', `Removed document ${doc.docID} (${doc.registrationNo}) from Documentation Database.`);
    };

    // 3. 发起续期 -> POST /api/compliance/renewal-tasks
    const handleInitiateRenewal = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const feeNum = Number(filingFeeInput);
        if (!filingFeeInput || isNaN(feeNum) || feeNum <= 0) return setFilingError('Enter a valid renewal fee.');
        if (!filingDeadline) return setFilingError('Target filing deadline is required.');
        if (selectedDocIds.length === 0) return setFilingError('Please attach at least 1 document from the Documentation Database.');

        const matchedProfile = profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
        if (!matchedProfile) {
            return setFilingError('No registered asset found. Please register an asset first.');
        }

        setFilingError('');
        setIsSubmitting(true);
        onTriggerLoadingScreen?.('Packaging Contract & Documentation Packet...', 800);

        const renId = `REN-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const baseFeeRM = Number((feeNum / exchangeRate).toFixed(2));
        const annualRM = matchedProfile.annualFeeRM ?? baseFeeRM / selectedTermYears;
        const discPct = selectedTermYears === 5 ? (matchedProfile.fiveYearDiscountPct ?? 22) : selectedTermYears === 3 ? 12 : 0;
        const savedDiscountRM = Number((annualRM * selectedTermYears * (discPct / 100)).toFixed(2));

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
            compiledSubmissionPdfUrl: `#packet-${renId}`,
            generatedChecklist: [
                { step: 1, name: 'Asset & Contract Registration Validated', isCompleted: true },
                { step: 2, name: `${selectedDocIds.length} Verified Vault Document(s) Attached`, isCompleted: true },
                { step: 3, name: `${selectedTermYears}-Year Renewal Terms Verified`, isCompleted: true },
                { step: 4, name: 'Manager / Owner Statutory Sign-off', isCompleted: false },
            ],
            targetDeadline: filingDeadline,
            renewalFee: baseFeeRM,
            renewalTermYears: selectedTermYears,
            savedDiscountRM,
            currency: 'MYR',
            internalNotes: filingNotes.trim(),
            createdAt: new Date().toISOString(),
        };

        try {
            const savedTask = await complianceApi.saveRenewalTask(createdTask);
            setRenewalTasks((prev) => [savedTask, ...prev]);
            onLogAction('Assisted Renewal', `Created renewal task ${renId} for ${matchedProfile.companyName}.`);
            setFilingSubTab('pipeline');
        } catch (err: unknown) {
            setFilingError(err instanceof Error ? err.message : 'Failed to save renewal task to backend.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // 4. 推进续期状态 -> POST /api/compliance/renewal-tasks 并在完成时更新 profiles
    const handleAdvanceRenewalStatus = async (task: RenewalTask) => {
        if (!canApprove) return alert('RBAC Restriction: Only Owner or Manager accounts can approve renewals.');
        const nextStatus: RenewalTaskStatus = task.status === 'ASSIGNED_TO_AGENT' ? 'SUBMITTED_TO_PBT' : 'APPROVED_RENEWED';
        const refNo = task.submissionReferenceNo || `REF-${Math.floor(100000 + Math.random() * 900000)}`;

        const updatedTask: RenewalTask = {
            ...task,
            status: nextStatus,
            submissionReferenceNo: refNo,
            generatedChecklist: task.generatedChecklist.map((c) =>
                c.step === 4
                    ? { ...c, isCompleted: nextStatus === 'APPROVED_RENEWED' }
                    : { ...c, isCompleted: true }
            ),
        };

        try {
            const savedTask = await complianceApi.saveRenewalTask(updatedTask);
            setRenewalTasks((prev) => prev.map((t) => (t.renewalID === task.renewalID ? savedTask : t)));

            if (nextStatus === 'APPROVED_RENEWED') {
                const termYears = task.renewalTermYears ?? 1;
                const targetProfile = profiles.find((p) => p.registrationNo === task.registrationNo);
                if (targetProfile) {
                    const baseDate = new Date(targetProfile.licenseExpiryDate);
                    const startYear = isNaN(baseDate.getTime()) || baseDate.getFullYear() < new Date().getFullYear()
                        ? new Date().getFullYear()
                        : baseDate.getFullYear();
                    const monthDay = /^\d{4}-\d{2}-\d{2}$/.test(targetProfile.licenseExpiryDate) ? targetProfile.licenseExpiryDate.slice(4) : '-12-31';
                    const updatedProfile: BusinessComplianceProfile = {
                        ...targetProfile,
                        complianceStatus: 'COMPLIANT',
                        licenseExpiryDate: `${startYear + termYears}${monthDay}`,
                    };

                    const savedProfile = await complianceApi.saveProfile(updatedProfile);
                    setProfiles((prev) => prev.map((p) => (p.registrationNo === task.registrationNo ? savedProfile : p)));
                }
            }
            onLogAction('Assisted Renewal', `Advanced renewal task ${task.renewalID} to [${nextStatus}].`);
        } catch (err: unknown) {
            alert(`Backend sync error: ${err instanceof Error ? err.message : 'Failed to advance status'}`);
        }
    };

    const handleViewDocument = (doc: DocumentVaultItem) => {
        if (doc.fileUrl.startsWith('blob:') || (doc.fileUrl.startsWith('http') && !doc.fileUrl.includes('storage.local'))) {
            window.open(doc.fileUrl, '_blank', 'noopener,noreferrer');
        } else {
            setPreviewDoc(doc);
        }
    };

    return (
        <div className="space-y-4 select-none w-full">
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-emerald-950 text-white rounded-2xl p-5 border border-white/10 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                        Enterprise Documentation Database &amp; Asset Vault
                    </span>
                    <div className="flex items-center gap-3">
                        {isRefreshing && (
                            <span className="text-xs text-emerald-400 flex items-center gap-1">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Syncing with Server...
                            </span>
                        )}
                        <span className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Centralized Repository for Tenancy, Fleet, Software &amp; Warranty Licences
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    {OVERVIEW_CARDS.map(({ icon: Icon, color, title, desc }) => (
                        <div key={title} className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                            <div className={`flex items-center gap-1.5 ${color} font-bold`}><Icon className="w-4 h-4" /> {title}</div>
                            <p className="text-[11px] text-slate-300">{desc}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold gap-1">
                    <button type="button" onClick={() => setMainTab('ssm_radar')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'ssm_radar' ? 'bg-white text-emerald-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> <span>All Monitored Assets ({profiles.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('vault_packet')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'vault_packet' ? 'bg-white text-purple-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <FolderLock className="w-3.5 h-3.5 text-purple-600" /> <span>Documentation Database ({vaultDocs.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('assisted_filing')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'assisted_filing' ? 'bg-white text-blue-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Bot className="w-3.5 h-3.5 text-blue-600" /> <span>Renewal Pipeline ({renewalTasks.length})</span>
                    </button>
                </div>

                {mainTab === 'ssm_radar' && (
                    <div className="inline-flex items-center bg-amber-100/80 p-1 rounded-xl border border-amber-200 text-xs font-semibold">
                        <button type="button" onClick={() => setSsmSubTab('scanner')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'scanner' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" /> Expiry Radar ({scannedAlerts.length})
                        </button>
                        <button type="button" onClick={() => setSsmSubTab('lookup')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'lookup' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <Plus className="w-3.5 h-3.5" /> Register Asset / Contract
                        </button>
                    </div>
                )}

                {mainTab === 'vault_packet' && (
                    <div className="inline-flex items-center bg-purple-100/80 p-1 rounded-xl border border-purple-200 text-xs font-semibold">
                        <button type="button" onClick={() => setVaultSubTab('repository')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'repository' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <FolderLock className="w-3.5 h-3.5" /> Stored Contracts ({vaultDocs.length})
                        </button>
                        <button type="button" onClick={() => setVaultSubTab('upload')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'upload' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <Upload className="w-3.5 h-3.5" /> Upload Contract / Doc
                        </button>
                    </div>
                )}

                {mainTab === 'assisted_filing' && (
                    <div className="inline-flex items-center bg-blue-100/80 p-1 rounded-xl border border-blue-200 text-xs font-semibold">
                        <button type="button" onClick={() => setFilingSubTab('pipeline')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'pipeline' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Bot className="w-3.5 h-3.5" /> Active Pipeline ({renewalTasks.length})
                        </button>
                        <button type="button" onClick={() => setFilingSubTab('initiate')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'initiate' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Plus className="w-3.5 h-3.5" /> Initiate Renewal
                        </button>
                    </div>
                )}
            </div>

            {mainTab === 'ssm_radar' && (
                <div className="w-full space-y-4">
                    {ssmSubTab === 'scanner' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" /> Licences, Leases, Warranties &amp; Subscriptions Radar
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Automated tracking for building rental renewals, vehicle road taxes, equipment warranties, and software subscriptions.</p>
                                </div>

                                <div className="flex items-center gap-2 text-xs">
                                    <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                                        <option value={30}>Expiring in 30 Days</option>
                                        <option value={60}>Expiring in 60 Days</option>
                                        <option value={90}>Expiring in 90 Days</option>
                                        <option value={365}>Show All (365 Days)</option>
                                        <option value={3650}>All Future Horizons</option>
                                    </select>
                                    <button
                                        type="button"
                                        disabled={isRefreshing}
                                        onClick={() => {
                                            onTriggerLoadingScreen?.('Scanning Database & Expiry Timelines...', 500);
                                            fetchAllData();
                                        }}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                                    >
                                        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} /> Scan
                                    </button>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                {([
                                    { id: 'ALL', label: `All Monitored (${profiles.length})`, icon: ShieldCheck },
                                    { id: 'RENTAL_CONTRACT', label: 'Building & Rental Places', icon: Building2 },
                                    { id: 'FLEET_VEHICLE', label: 'Car & Fleet Licences', icon: Car },
                                    { id: 'EQUIPMENT_WARRANTY', label: 'Warranty Periods', icon: Wrench },
                                    { id: 'SOFTWARE_LICENSE', label: 'Software Licensing', icon: Laptop },
                                    { id: 'SSM_PBT_LICENSE', label: 'SSM & Council Licences', icon: FileText },
                                ] as const).map((cat) => {
                                    const Icon = cat.icon;
                                    const active = assetCategoryFilter === cat.id;
                                    return (
                                        <button key={cat.id} type="button" onClick={() => setAssetCategoryFilter(cat.id)} className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${active ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'}`}>
                                            <Icon className="w-3.5 h-3.5" /> <span>{cat.label}</span>
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="grid grid-cols-1 gap-3.5">
                                {scannedAlerts.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">
                                        No items expiring within the selected window. Click &quot;Register Asset / Contract&quot; to add new entries.
                                    </div>
                                ) : (
                                    scannedAlerts.map((prof) => {
                                        const daysLeft = calcDaysLeft(prof.licenseExpiryDate);
                                        const isExpired = daysLeft < 0 || prof.complianceStatus === 'EXPIRED';
                                        const cat = detectAssetCategory(prof);
                                        const meta = CATEGORY_META[cat];
                                        const MetaIcon = meta.icon;
                                        const linkedDocCount = vaultDocs.filter((d) => d.registrationNo === prof.registrationNo).length;

                                        return (
                                            <div
                                                key={`${prof.registrationNo}-${prof.licenseType}`}
                                                className={`p-4 rounded-2xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition ${isExpired ? 'bg-rose-50/40 border-rose-200' : prof.complianceStatus === 'EXPIRING_SOON' ? 'bg-amber-50/35 border-amber-200' : 'bg-emerald-50/30 border-emerald-200'}`}
                                            >
                                                <div className="space-y-1.5 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold">{prof.registrationNo}</span>
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${meta.badgeCls}`}>{cat.replace(/_/g, ' ')}</span>
                                                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${isExpired ? 'bg-rose-100 text-rose-700' : prof.complianceStatus === 'EXPIRING_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                            {isExpired ? 'EXPIRED' : `${daysLeft}d left`}
                                                        </span>
                                                        <span className="text-xs font-mono text-slate-500">Expiry Date: {prof.licenseExpiryDate}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setVaultAssetFilter(prof.registrationNo);
                                                                setMainTab('vault_packet');
                                                                setVaultSubTab('repository');
                                                            }}
                                                            className="px-2 py-0.5 rounded bg-purple-100 hover:bg-purple-200 text-purple-800 text-[11px] font-bold cursor-pointer transition"
                                                        >
                                                            {linkedDocCount} Vault Doc(s)
                                                        </button>
                                                    </div>

                                                    <h4 className="text-sm font-extrabold text-slate-900">
                                                        {prof.companyName} <span className="ml-2 font-normal text-xs text-slate-500 font-mono">[{prof.councilName}]</span>
                                                    </h4>

                                                    <div className="p-2.5 rounded-xl bg-white/90 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                        <div className={`flex items-center gap-2 ${meta.textCls}`}>
                                                            <MetaIcon className="w-3.5 h-3.5 shrink-0" />
                                                            <span><strong>{meta.title}</strong> {meta.desc}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                    {cat === 'EQUIPMENT_WARRANTY' && (
                                                        claimedWarrantyRegNos.includes(prof.registrationNo) ? (
                                                            <span className="px-3 py-2 rounded-xl bg-purple-100 text-purple-800 text-xs font-bold inline-flex items-center gap-1">
                                                                <CheckCircle2 className="w-3.5 h-3.5" /> OEM Service Booked
                                                            </span>
                                                        ) : (
                                                            <button type="button" onClick={() => handleClaimWarrantyService(prof)} className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap">
                                                                <Wrench className="w-3.5 h-3.5" /> Claim Free Service
                                                            </button>
                                                        )
                                                    )}
                                                    <button type="button" onClick={() => handlePrepareAssistedFiling(prof)} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap">
                                                        Renew / Extend <ArrowUpRight className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}

                    {ssmSubTab === 'lookup' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-emerald-600" /> Register Building Lease, Fleet, Software or Warranty
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Add building listings, tenancy agreements, vehicle plate numbers, software subscriptions, or equipment warranties to the documentation database.</p>
                                </div>
                            </div>

                            <form onSubmit={handleVerifySsmProfile} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Asset Category *</label>
                                        <select value={ssmLicenseType} onChange={(e) => setSsmLicenseType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {LICENSE_CATEGORIES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">ID / Plate No. / Contract Ref *</label>
                                        <input type="text" placeholder="e.g., BLD-LOT-401, JPJ-WXY8821, SOFT-MSFT-365" value={ssmRegNo} onChange={(e) => { setSsmRegNo(e.target.value); setSsmLookupError(''); }} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Issuing Authority / Landlord / Vendor *</label>
                                        <select value={ssmCouncil} onChange={(e) => setSsmCouncil(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {ISSUING_AUTHORITIES_AND_VENDORS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Asset / Rental Premise / Software Name *</label>
                                        <input type="text" placeholder="e.g., Suite 12-04 Menara Bangsar or Delivery Van BKK 1234 or AWS Enterprise Plan" value={ssmCompanyName} onChange={(e) => { setSsmCompanyName(e.target.value); setSsmLookupError(''); }} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-emerald-500" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expiry / Tenancy Cutoff Date *</label>
                                        <input type="date" value={ssmExpiryDate} onChange={(e) => setSsmExpiryDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                </div>

                                {ssmLookupError && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {ssmLookupError}</p>}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setSsmSubTab('scanner')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Back to Radar</button>
                                    <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer disabled:opacity-50">
                                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                        Save to Database
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {mainTab === 'vault_packet' && (
                <div className="w-full space-y-4">
                    {vaultSubTab === 'repository' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FolderLock className="w-4 h-4 text-purple-600" /> Centralized Documentation Database &amp; Vault
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Stores and indexes stamped tenancy agreements, vehicle grants, software licenses, and warranty documentation.</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => setVaultSubTab('upload')} className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                        <Upload className="w-3.5 h-3.5" /> + Upload Contract / Document
                                    </button>
                                    <button
                                        type="button"
                                        disabled={selectedDocIds.length === 0}
                                        onClick={() => { setMainTab('assisted_filing'); setFilingSubTab('initiate'); }}
                                        className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                                    >
                                        Proceed with {selectedDocIds.length} Document(s) <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            {/* 搜索与资产筛选栏 */}
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                                <div className="flex flex-wrap items-center gap-2 flex-1">
                                    <div className="relative flex-1 min-w-[220px] max-w-md">
                                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                        <input
                                            type="text"
                                            placeholder="Search by Doc ID, Asset Reg No., Doc Type, or Notes..."
                                            value={vaultSearchQuery}
                                            onChange={(e) => setVaultSearchQuery(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:border-purple-500"
                                        />
                                    </div>
                                    <select
                                        value={vaultAssetFilter}
                                        onChange={(e) => setVaultAssetFilter(e.target.value)}
                                        className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-semibold text-slate-800"
                                    >
                                        <option value="ALL">All Linked Assets ({vaultDocs.length})</option>
                                        {profiles.map((p) => (
                                            <option key={p.registrationNo} value={p.registrationNo}>
                                                {p.registrationNo} — {p.companyName}
                                            </option>
                                        ))}
                                    </select>
                                    {(vaultSearchQuery || vaultAssetFilter !== 'ALL') && (
                                        <button
                                            type="button"
                                            onClick={() => { setVaultSearchQuery(''); setVaultAssetFilter('ALL'); }}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold cursor-pointer"
                                        >
                                            Reset Filter
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setSelectedDocIds(filteredVaultDocs.map((d) => d.docID))}
                                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                                    >
                                        Select All ({filteredVaultDocs.length})
                                    </button>
                                    {selectedDocIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedDocIds([])}
                                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold cursor-pointer"
                                        >
                                            Clear Selection
                                        </button>
                                    )}
                                </div>
                            </div>

                            {filteredVaultDocs.length === 0 ? (
                                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                                    <FolderLock className="w-8 h-8 text-purple-400 mx-auto" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-bold text-slate-800">No Contracts or Documents Found</p>
                                        <p className="text-xs text-slate-500">
                                            {vaultDocs.length === 0
                                                ? 'Your Documentation Database is currently empty. Upload a contract or load sample enterprise records.'
                                                : 'No documents matched your current search or asset filter.'}
                                        </p>
                                    </div>
                                    <div className="flex items-center justify-center gap-2 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setVaultSubTab('upload')}
                                            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                                        >
                                            <Upload className="w-3.5 h-3.5" /> Upload New Document
                                        </button>
                                        {vaultDocs.length === 0 && (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setVaultDocs(DEFAULT_SEED_VAULT_DOCS);
                                                    complianceApi.syncVaultDocs(DEFAULT_SEED_VAULT_DOCS).catch(() => {});
                                                }}
                                                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold cursor-pointer"
                                            >
                                                Restore Default Contracts
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs">
                                        <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                                            <th className="py-3 px-4 w-12">Select</th>
                                            <th className="py-3 px-3">Doc ID &amp; Classification</th>
                                            <th className="py-3 px-3">Linked Asset / Registration</th>
                                            <th className="py-3 px-3">Contract Validity Period</th>
                                            <th className="py-3 px-3">File Size</th>
                                            <th className="py-3 px-4 text-right">Actions</th>
                                        </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                        {filteredVaultDocs.map((doc) => {
                                            const isChecked = selectedDocIds.includes(doc.docID);
                                            const linkedProf = profiles.find((p) => p.registrationNo === doc.registrationNo);
                                            const daysLeft = calcDaysLeft(doc.expiryDate);
                                            return (
                                                <tr key={doc.docID} className={isChecked ? 'bg-purple-50/30' : 'hover:bg-slate-50'}>
                                                    <td className="py-3 px-4">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => setSelectedDocIds((prev) => prev.includes(doc.docID) ? prev.filter((id) => id !== doc.docID) : [...prev, doc.docID])}
                                                            className="w-4 h-4 accent-purple-600 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <p className="font-bold text-slate-900">{doc.docType.replace(/_/g, ' ')}</p>
                                                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                                                            <span className="font-mono">{doc.docID}</span>
                                                            {doc.notes && <span className="truncate max-w-xs text-slate-500">• {doc.notes}</span>}
                                                        </div>
                                                    </td>
                                                    <td className="py-3 px-3">
                                                        <span className="font-mono font-bold text-slate-800 block">{doc.registrationNo}</span>
                                                        {linkedProf && <span className="text-[11px] text-slate-500">{linkedProf.companyName}</span>}
                                                    </td>
                                                    <td className="py-3 px-3 font-mono text-slate-600">
                                                        <div>{doc.effectiveDate} &rarr; <strong>{doc.expiryDate}</strong></div>
                                                        <span className={`text-[10px] font-bold ${daysLeft < 0 ? 'text-rose-600' : daysLeft <= 60 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                                {daysLeft < 0 ? 'Expired' : `${daysLeft} days remaining`}
                                                            </span>
                                                    </td>
                                                    <td className="py-3 px-3 text-slate-500">{doc.fileSizeKb.toLocaleString()} KB</td>
                                                    <td className="py-3 px-4 text-right">
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleViewDocument(doc)}
                                                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 font-bold text-[11px] transition cursor-pointer"
                                                            >
                                                                <Eye className="w-3 h-3" /> Preview / View
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteVaultDoc(doc)}
                                                                title="Delete Document"
                                                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 transition cursor-pointer"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {vaultSubTab === 'upload' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        setUploadFileName(f.name);
                                        setUploadFileObj(f);
                                    }
                                }}
                                className="hidden"
                            />
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Upload className="w-4 h-4 text-purple-600" /> Upload Contract / License Document
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Index tenancy contracts, vehicle registration certificates, software MSAs, or warranty agreements into the database.</p>
                                </div>
                            </div>

                            <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Linked Asset / Entity *</label>
                                        <select value={uploadRegNo} onChange={(e) => setUploadRegNo(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {profiles.map((p) => <option key={p.registrationNo} value={p.registrationNo}>{p.companyName} ({p.registrationNo})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract / Document Category *</label>
                                        <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract Effective Date *</label>
                                        <input type="date" value={uploadEffectiveDate} onChange={(e) => setUploadEffectiveDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract Expiry Date *</label>
                                        <input type="date" value={uploadExpiryDate} onChange={(e) => setUploadExpiryDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">File Upload (PDF / PNG / JPG)</label>
                                        <div className="flex items-center gap-3">
                                            <input type="text" placeholder="Choose PDF / image or enter filename..." value={uploadFileName} onChange={(e) => setUploadFileName(e.target.value)} className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold cursor-pointer shrink-0">Choose File</button>
                                        </div>
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Document Remarks / Reference Notes</label>
                                        <input type="text" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                    </div>
                                </div>

                                {uploadError && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}</p>}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setVaultSubTab('repository')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Back</button>
                                    <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50">
                                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                        Save to Documentation Database
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {mainTab === 'assisted_filing' && (
                <div className="w-full space-y-4">
                    {filingSubTab === 'pipeline' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Bot className="w-4 h-4 text-blue-600" /> Active Renewals &amp; Contract Extensions
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Tracks renewal packet approvals, tenancy extension exercises, and road tax updates.</p>
                                </div>
                                <button type="button" onClick={() => setFilingSubTab('initiate')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer">
                                    <Plus className="w-3.5 h-3.5" /> Initiate Renewal / Extension
                                </button>
                            </div>

                            <div className="space-y-3">
                                {renewalTasks.length === 0 ? (
                                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-xs text-slate-500">No active renewal tasks in pipeline.</div>
                                ) : (
                                    renewalTasks.map((task) => {
                                        const isDone = task.status === 'APPROVED_RENEWED';
                                        return (
                                            <div key={task.renewalID} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono text-xs font-bold">{task.renewalID}</span>
                                                        <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">{task.registrationNo}</span>
                                                        <span className="text-sm font-extrabold text-slate-900">{task.companyName}</span>
                                                        {task.renewalTermYears && (
                                                            <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                                                {task.renewalTermYears}-Year Term
                                                            </span>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-3">
                                                        <div className="text-right">
                                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Est. Cost</span>
                                                            <span className="text-sm font-extrabold text-slate-900">{currencySymbol} {(task.renewalFee * exchangeRate).toLocaleString()}</span>
                                                        </div>
                                                        {!isDone ? (
                                                            <button type="button" onClick={() => handleAdvanceRenewalStatus(task)} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                                                                <Send className="w-3.5 h-3.5" /> {task.status === 'ASSIGNED_TO_AGENT' ? 'Approve & Submit' : 'Mark Renewed'}
                                                            </button>
                                                        ) : (
                                                            <span className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed ({task.submissionReferenceNo})
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-600">{task.internalNotes}</p>
                                                <div className="flex flex-wrap items-center gap-2 pt-1">
                                                    {task.generatedChecklist.map((item) => (
                                                        <span key={item.step} className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${item.isCompleted ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                            <Check className="w-3.5 h-3.5" /> {item.name}
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
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-blue-600" /> Initiate Contract Renewal / Extension
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Link verified documents from the Documentation Database to process tenancy extensions, road tax renewals, or software renewals.</p>
                                </div>
                            </div>

                            <form onSubmit={handleInitiateRenewal} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Asset / Listing *</label>
                                        <select
                                            value={filingRegNo}
                                            onChange={(e) => {
                                                const nextReg = e.target.value;
                                                setFilingRegNo(nextReg);
                                                const prof = profiles.find((p) => p.registrationNo === nextReg);
                                                if (prof) {
                                                    const term: 1 | 3 | 5 =
                                                        prof.selectedRenewalTermYears === 3 || prof.selectedRenewalTermYears === 5
                                                            ? prof.selectedRenewalTermYears
                                                            : 1;
                                                    setSelectedTermYears(term);
                                                    setFilingFeeInput(String(computeTermFee(prof, term)));
                                                }
                                            }}
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
                                        <label className="font-bold text-slate-700 block mb-1.5">Renewal Term *</label>
                                        <select
                                            value={selectedTermYears}
                                            onChange={(e) => {
                                                const nextTerm = Number(e.target.value) as 1 | 3 | 5;
                                                setSelectedTermYears(nextTerm);
                                                const prof = profiles.find((p) => p.registrationNo === filingRegNo);
                                                setFilingFeeInput(String(computeTermFee(prof, nextTerm)));
                                            }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900"
                                        >
                                            <option value={1}>1 Year (Standard)</option>
                                            <option value={3}>3 Years (12% Multi-Year Discount)</option>
                                            <option value={5}>5 Years (Up to 22% Discount)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Processing Mode *</label>
                                        <select value={filingMode} onChange={(e) => setFilingMode(e.target.value as 'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED')} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            <option value="CONCIERGE_MANUAL_SUBMISSION">Concierge Legal / Admin Desk</option>
                                            <option value="RPA_AUTOMATED">Automated RPA Script</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expected Renewal Fee ({currency}) *</label>
                                        <input type="text" inputMode="decimal" value={filingFeeInput} onChange={(e) => { setFilingFeeInput(sanitizePositiveDecimal(e.target.value)); setFilingError(''); }} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Extension Deadline *</label>
                                        <input type="date" value={filingDeadline} onChange={(e) => setFilingDeadline(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-5">
                                        <label className="font-bold text-slate-700 block mb-1.5">Notes &amp; Contract Terms</label>
                                        <textarea rows={2} value={filingNotes} onChange={(e) => setFilingNotes(e.target.value)} className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                    </div>
                                </div>

                                {filingError && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {filingError}</p>}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setFilingSubTab('pipeline')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Back</button>
                                    <button type="submit" disabled={isSubmitting} className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50">
                                        {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                                        Submit for Sign-Off
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* 内置文档详情预览弹窗（解决虚拟链接无法打开的问题） */}
            {previewDoc && (
                <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-6 space-y-4 text-xs">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div className="flex items-center gap-2">
                                <FileText className="w-5 h-5 text-purple-600" />
                                <div>
                                    <h4 className="text-sm font-extrabold text-slate-900">{previewDoc.docType.replace(/_/g, ' ')}</h4>
                                    <span className="font-mono text-[11px] text-slate-500">{previewDoc.docID} • {previewDoc.fileSizeKb} KB</span>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPreviewDoc(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                            <div className="flex justify-between">
                                <span className="text-slate-500">Linked Asset / Registration:</span>
                                <span className="font-mono font-bold text-slate-900">{previewDoc.registrationNo}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Effective Period:</span>
                                <span className="font-mono font-semibold text-slate-800">{previewDoc.effectiveDate} &rarr; {previewDoc.expiryDate}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">Indexed By:</span>
                                <span className="font-semibold text-slate-800">{previewDoc.uploadedBy} ({previewDoc.uploadedAt.slice(0, 10)})</span>
                            </div>
                            {previewDoc.notes && (
                                <div className="pt-2 border-t border-slate-200 text-slate-700">
                                    <span className="font-bold block mb-0.5">Summary / Notes:</span>
                                    {previewDoc.notes}
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                            {previewDoc.fileUrl.startsWith('blob:') && (
                                <a
                                    href={previewDoc.fileUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold inline-flex items-center gap-1.5"
                                >
                                    Open Raw File <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                            )}
                            <button
                                type="button"
                                onClick={() => setPreviewDoc(null)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold cursor-pointer"
                            >
                                Close Preview
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};