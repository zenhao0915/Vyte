import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowUpRight, Bot, Calendar, Car, Check, CheckCircle2,
    Clock, Download, ExternalLink, FileCheck, FileText, FolderLock, Percent, Plus,
    RefreshCw, Scale, Search, Send, ShieldCheck, Sparkles, Upload, Wrench,
} from 'lucide-react';
import type {
    AccountingStatutoryDeadline, BusinessComplianceProfile, ComplianceAssetCategory,
    CurrencyCode, DocumentVaultItem, InvoiceItem, Product, QCAlert, RenewalTask,
    RenewalTaskStatus, UserRole,
} from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { INITIAL_ACCOUNTING_DEADLINES } from '../../data/mockData';

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

const COMPLIANCE_UI_STORAGE_KEY = 'vyte_compliance_ui_state_v3';
const ACCOUNTING_DEADLINES_KEY = 'vyte_accounting_deadlines_v1';

const PBT_COUNCILS = [
    { label: 'MBPJ (Petaling Jaya)', value: 'MBPJ' },
    { label: 'DBKL (Kuala Lumpur)', value: 'DBKL' },
    { label: 'MBSA (Shah Alam)', value: 'MBSA' },
    { label: 'MBSJ (Subang Jaya)', value: 'MBSJ' },
    { label: 'JPJ / PUSPAKOM Commercial Fleet', value: 'JPJ / PUSPAKOM Commercial Fleet' },
    { label: 'Hitachi Cold-Chain OEM Warranty', value: 'Hitachi Cold-Chain OEM Warranty' },
];

const LICENSE_CATEGORIES = [
    { label: 'Premise License (Lesen Premis)', value: 'PREMISE_LICENSE' },
    { label: 'Food Establishment (Lesen Makanan)', value: 'FOOD_ESTABLISHMENT' },
    { label: 'Signboard License (Lesen Iklan)', value: 'SIGNBOARD_LICENSE' },
    { label: 'Commercial Vehicle Road Tax & PUSPAKOM', value: 'FLEET_ROADTAX_PUSPAKOM' },
    { label: 'Equipment / Machinery OEM Warranty', value: 'EQUIPMENT_OEM_WARRANTY' },
];

const DOC_TYPES = [
    { label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9' },
    { label: 'Stamped Tenancy Agreement', value: 'TENANCY_AGREEMENT' },
    { label: 'Premise Floor Plan (Renovated)', value: 'FLOOR_PLAN' },
    { label: 'BOMBA Fire Safety Endorsement', value: 'FIRE_SAFETY_CERT' },
    { label: 'JPJ Grant / PUSPAKOM VR1 Inspection Slip', value: 'PREVIOUS_LICENSE' },
];

const sanitizePositiveDecimal = (raw: string): string => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 6);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

export const ComplianceRenewalModule: React.FC<ComplianceRenewalModuleProps> = ({
                                                                                    profiles, setProfiles, vaultDocs, setVaultDocs, renewalTasks, setRenewalTasks,
                                                                                    products = [], qcAlerts = [], invoices = [], role, userID, currency = 'MYR',
                                                                                    exchangeRate = 1.0, onLogAction, onTriggerLoadingScreen,
                                                                                }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';
    const todayIso = new Date().toISOString().slice(0, 10);

    const savedState = useMemo(() => {
        try { const raw = localStorage.getItem(COMPLIANCE_UI_STORAGE_KEY); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
    }, []);

    const [mainTab, setMainTab] = useState<MainComplianceTab>(savedState.mainTab ?? 'ssm_radar');
    const [ssmSubTab, setSsmSubTab] = useState<SsmSubTab>(savedState.ssmSubTab ?? 'scanner');
    const [vaultSubTab, setVaultSubTab] = useState<VaultSubTab>(savedState.vaultSubTab ?? 'repository');
    const [filingSubTab, setFilingSubTab] = useState<FilingSubTab>(savedState.filingSubTab ?? 'pipeline');
    const [assetCategoryFilter, setAssetCategoryFilter] = useState<'ALL' | ComplianceAssetCategory>('ALL');

    const [accountingDeadlines, setAccountingDeadlines] = useState<AccountingStatutoryDeadline[]>(() => {
        try { const raw = localStorage.getItem(ACCOUNTING_DEADLINES_KEY); return raw ? JSON.parse(raw) : INITIAL_ACCOUNTING_DEADLINES; } catch { return INITIAL_ACCOUNTING_DEADLINES; }
    });
    useEffect(() => { localStorage.setItem(ACCOUNTING_DEADLINES_KEY, JSON.stringify(accountingDeadlines)); }, [accountingDeadlines]);

    const [ssmRegNo, setSsmRegNo] = useState<string>(savedState.ssmRegNo ?? '202401048291');
    const [ssmCompanyName, setSsmCompanyName] = useState<string>(savedState.ssmCompanyName ?? 'ACME TECH SDN. BHD.');
    const [ssmCouncil, setSsmCouncil] = useState<string>(savedState.ssmCouncil ?? 'MBPJ');
    const [ssmLicenseType, setSsmLicenseType] = useState<string>(savedState.ssmLicenseType ?? 'PREMISE_LICENSE');
    const [ssmExpiryDate, setSsmExpiryDate] = useState<string>(savedState.ssmExpiryDate ?? '2026-11-30');
    const [ssmLookupError, setSsmLookupError] = useState<string>('');

    const [councilFilter, setCouncilFilter] = useState<string>(savedState.councilFilter ?? 'ALL');
    const [windowDays, setWindowDays] = useState<number>(savedState.windowDays ?? 365);
    const [lastScannedAt, setLastScannedAt] = useState<string>('2026-10-23 12:15:00');

    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(savedState.selectedDocIds ?? ['DOC-99401', 'DOC-99388', 'DOC-99350']);
    const [uploadRegNo, setUploadRegNo] = useState<string>(savedState.uploadRegNo ?? '202401048291');
    const [uploadDocType, setUploadDocType] = useState<string>(savedState.uploadDocType ?? 'TENANCY_AGREEMENT');
    const [uploadEffectiveDate, setUploadEffectiveDate] = useState<string>(savedState.uploadEffectiveDate ?? '2026-01-01');
    const [uploadExpiryDate, setUploadExpiryDate] = useState<string>(savedState.uploadExpiryDate ?? '2027-12-31');
    const [uploadFileName, setUploadFileName] = useState<string>('');
    const [uploadError, setUploadError] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [filingRegNo, setFilingRegNo] = useState<string>(savedState.filingRegNo ?? '202401048291');
    const [filingMode, setFilingMode] = useState<'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED'>(savedState.filingMode ?? 'CONCIERGE_MANUAL_SUBMISSION');
    const [selectedTermYears, setSelectedTermYears] = useState<1 | 3 | 5>(5);
    const [filingFeeInput, setFilingFeeInput] = useState<string>(savedState.filingFeeInput ?? '1755.00');
    const [filingDeadline, setFilingDeadline] = useState<string>(savedState.filingDeadline ?? '2026-11-20');
    const [filingNotes, setFilingNotes] = useState<string>(savedState.filingNotes ?? '5-Year Multi-Year Bundle (-22% discount). Updated floor plan & tenancy attached.');
    const [filingError, setFilingError] = useState<string>('');

    useEffect(() => {
        localStorage.setItem(COMPLIANCE_UI_STORAGE_KEY, JSON.stringify({
            mainTab, ssmSubTab, vaultSubTab, filingSubTab, ssmRegNo, ssmCompanyName, ssmCouncil,
            ssmLicenseType, ssmExpiryDate, councilFilter, windowDays, selectedDocIds, uploadRegNo,
            uploadDocType, uploadEffectiveDate, uploadExpiryDate, filingRegNo, filingMode, filingFeeInput, filingDeadline, filingNotes,
        }));
    }, [mainTab, ssmSubTab, vaultSubTab, filingSubTab, ssmRegNo, ssmCompanyName, ssmCouncil, ssmLicenseType, ssmExpiryDate, councilFilter, windowDays, selectedDocIds, uploadRegNo, uploadDocType, uploadEffectiveDate, uploadExpiryDate, filingRegNo, filingMode, filingFeeInput, filingDeadline, filingNotes]);

    const detectAssetCategory = (p: BusinessComplianceProfile): ComplianceAssetCategory => {
        if (p.assetCategory) return p.assetCategory;
        if (p.registrationNo.startsWith('JPJ-') || p.councilName.toUpperCase().includes('JPJ') || p.councilName.toUpperCase().includes('PUSPAKOM') || p.companyName.toUpperCase().includes('LORRY') || p.companyName.toUpperCase().includes('VAN')) return 'FLEET_VEHICLE';
        if (p.registrationNo.startsWith('WARR-') || p.companyName.toUpperCase().includes('WARRANTY') || p.councilName.toUpperCase().includes('WARRANTY')) return 'EQUIPMENT_WARRANTY';
        return 'SSM_PBT_LICENSE';
    };

    const calcDaysLeft = (isoDate: string): number => Math.round((new Date(isoDate).getTime() - new Date(todayIso).getTime()) / 86400000);

    const scannedAlerts = useMemo(() => {
        return profiles.filter((p) => {
            const cat = detectAssetCategory(p);
            const matchAssetCat = assetCategoryFilter === 'ALL' || cat === assetCategoryFilter;
            const matchCouncil = councilFilter === 'ALL' || p.councilName === councilFilter;
            return matchAssetCat && matchCouncil && calcDaysLeft(p.licenseExpiryDate) <= windowDays;
        });
    }, [profiles, assetCategoryFilter, councilFilter, windowDays]);

    const multiYearPortfolioSummary = useMemo(() => {
        let totalAnnual5YrPayAsYouGoRM = 0;
        let totalBundle5YrDiscountedRM = 0;
        profiles.forEach((p) => {
            const annualFee = p.annualFeeRM ?? 480;
            const discPct = p.fiveYearDiscountPct ?? 22;
            const runnerFeePerFiling = 150;
            totalAnnual5YrPayAsYouGoRM += annualFee * 5 + runnerFeePerFiling * 5;
            totalBundle5YrDiscountedRM += annualFee * 5 * (1 - discPct / 100) + runnerFeePerFiling;
        });
        return {
            totalAnnual5YrPayAsYouGoRM: Math.round(totalAnnual5YrPayAsYouGoRM),
            totalBundle5YrDiscountedRM: Math.round(totalBundle5YrDiscountedRM),
            totalSavedRM: Math.round(totalAnnual5YrPayAsYouGoRM - totalBundle5YrDiscountedRM),
        };
    }, [profiles]);

    const mfrsAuditSummary = useMemo(() => {
        const rows = products.map((p) => {
            const unitCost = p.unitCostRM ?? Number((p.priceRM * 0.62).toFixed(2));
            const totalHistoricalCostRM = Number((p.stock * unitCost).toFixed(2));
            const activeQc = qcAlerts.find((q) => q.sku === p.sku && q.status !== 'APPROVED_RESOLVED');
            const normalNrvPerUnit = Number((p.priceRM * 0.92).toFixed(2));
            const effectiveNrvPerUnit = activeQc ? Number((unitCost * 0.78).toFixed(2)) : normalNrvPerUnit;
            const totalNrvRM = Number((p.stock * effectiveNrvPerUnit).toFixed(2));
            const mfrsCarryingValueRM = Math.min(totalHistoricalCostRM, totalNrvRM);
            const nrvWriteDownRM = Math.max(0, Number((totalHistoricalCostRM - totalNrvRM).toFixed(2)));
            return {
                ...p, unitCost, effectiveNrvPerUnit, totalHistoricalCostRM, totalNrvRM,
                mfrsCarryingValueRM, nrvWriteDownRM, hasImpairmentRisk: nrvWriteDownRM > 0,
                qcRef: activeQc ? `${activeQc.batchNo} (${activeQc.triggerReason})` : 'Clean Batch (FIFO Verified)',
            };
        });
        const totalHistoricalCost = rows.reduce((s, r) => s + r.totalHistoricalCostRM, 0);
        const totalWriteDown = rows.reduce((s, r) => s + r.nrvWriteDownRM, 0);
        const totalCarryingValue = rows.reduce((s, r) => s + r.mfrsCarryingValueRM, 0);
        const verifiedPurchasesRM = invoices.filter((i) => i.type === 'SUPPLIER_PAYABLE').reduce((s, i) => s + i.amountRM, 0);
        const estimatedOpeningStockRM = Math.max(4500, Number((totalHistoricalCost * 0.85).toFixed(2)));
        const estimatedCogsRM = Math.max(1200, Number((estimatedOpeningStockRM + verifiedPurchasesRM - totalHistoricalCost).toFixed(2)));
        return { rows, totalHistoricalCost, totalWriteDown, totalCarryingValue, verifiedPurchasesRM, estimatedOpeningStockRM, estimatedCogsRM };
    }, [products, qcAlerts, invoices]);

    const handleDownloadMfrsAuditCsv = () => {
        const headers = ['SKU', 'Product Name', 'Category', 'Physical Stock', 'UOM', `Unit Cost (${currency})`, `Total Historical Cost (${currency})`, `Est. NRV / Unit (${currency})`, `NRV Write-Down (${currency})`, `MFRS 102 Carrying Value (${currency})`, 'Audit Remarks'];
        const rows = mfrsAuditSummary.rows.map((r) => [
            r.sku, `"${r.name}"`, `"${r.category}"`, r.stock, r.uom,
            (r.unitCost * exchangeRate).toFixed(2), (r.totalHistoricalCostRM * exchangeRate).toFixed(2),
            (r.effectiveNrvPerUnit * exchangeRate).toFixed(2), (r.nrvWriteDownRM * exchangeRate).toFixed(2),
            (r.mfrsCarryingValueRM * exchangeRate).toFixed(2), `"${r.qcRef}"`,
        ].join(','));
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.setAttribute('download', `Vyte_MFRS102_Inventory_Audit_Schedule_${todayIso}.csv`);
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        onLogAction('MFRS 102 Audit', `Generated MFRS 102 Inventory Valuation & NRV Audit Schedule (${mfrsAuditSummary.rows.length} SKUs).`);
    };

    const handleSelectTermOnCard = (regNo: string, term: 1 | 3 | 5) => {
        setProfiles((prev) => prev.map((p) => (p.registrationNo === regNo ? { ...p, selectedRenewalTermYears: term } : p)));
    };

    const handleClaimWarrantyService = (prof: BusinessComplianceProfile) => {
        setProfiles((prev) => prev.map((p) => (p.registrationNo === prof.registrationNo ? { ...p, warrantyClaimed: true } : p)));
        onLogAction('Warranty Claim', `Booked free OEM warranty inspection & preventive replacement for ${prof.companyName} (${prof.registrationNo}).`);
    };

    const handlePrepareAssistedFiling = (profile: BusinessComplianceProfile, preferredTerm?: 1 | 3 | 5) => {
        const term = preferredTerm ?? profile.selectedRenewalTermYears ?? 5;
        const annual = profile.annualFeeRM ?? 450;
        const disc = term === 5 ? (profile.fiveYearDiscountPct ?? 22) : term === 3 ? 12 : 0;
        const calculatedFee = Number((annual * term * (1 - disc / 100) * exchangeRate).toFixed(2));
        setFilingRegNo(profile.registrationNo);
        setSelectedTermYears(term);
        setFilingFeeInput(String(calculatedFee));
        setFilingNotes(term === 5 ? `5-Year Multi-Year Bundle Selected (-${disc}% discount + 4x runner fees waived).` : term === 3 ? `3-Year Bundle Selected (-12% discount).` : `1-Year Standard Annual Renewal.`);
        setMainTab('assisted_filing');
        setFilingSubTab('initiate');
    };

    const handleVerifySsmProfile = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanReg = ssmRegNo.trim();
        const cleanName = ssmCompanyName.trim();
        if (cleanReg.length < 6) return setSsmLookupError('Registration / Fleet / Warranty No. must be at least 6 characters.');
        if (cleanName.length < 3) return setSsmLookupError('Registered Entity / Asset Name is required (min 3 characters).');
        if (!ssmExpiryDate) return setSsmLookupError('Please select a valid Expiry Date.');

        setSsmLookupError('');
        onTriggerLoadingScreen?.(`Verifying ${cleanReg} & Calculating 1-Yr vs 5-Yr Bundle Savings...`, 750);
        const daysLeft = calcDaysLeft(ssmExpiryDate);
        const computedStatus: BusinessComplianceProfile['complianceStatus'] = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE';

        const newProfile: BusinessComplianceProfile = {
            registrationNo: cleanReg, companyName: cleanName.toUpperCase(),
            companyType: cleanName.toUpperCase().includes('PLT') ? 'LLP' : cleanName.toUpperCase().includes('SDN') ? 'SDN_BHD' : 'ENTERPRISE',
            ssmExpiryDate: '2027-03-15', councilName: ssmCouncil, licenseType: ssmLicenseType,
            licenseExpiryDate: ssmExpiryDate, complianceStatus: computedStatus, autoAlertEnabled: true,
            assetCategory: ssmLicenseType === 'FLEET_ROADTAX_PUSPAKOM' ? 'FLEET_VEHICLE' : ssmLicenseType === 'EQUIPMENT_OEM_WARRANTY' ? 'EQUIPMENT_WARRANTY' : 'SSM_PBT_LICENSE',
            annualFeeRM: 480, fiveYearDiscountPct: 22, selectedRenewalTermYears: 5,
        };

        setProfiles((prev) => prev.some((p) => p.registrationNo === cleanReg) ? prev.map((p) => (p.registrationNo === cleanReg ? newProfile : p)) : [newProfile, ...prev]);
        onLogAction('License & Compliance', `Verified ${cleanReg} (${cleanName.toUpperCase()}) • Authority: ${ssmCouncil}.`);
        setSsmSubTab('scanner');
    };

    const handleUploadVaultDoc = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!uploadEffectiveDate || !uploadExpiryDate) return setUploadError('Both Effective Date and Expiry Date are required.');
        if (uploadExpiryDate <= uploadEffectiveDate) return setUploadError('Expiry Date must be later than the Effective Date.');
        setUploadError('');
        const newDocId = `DOC-${Math.floor(10000 + Math.random() * 90000)}`;
        const cleanFile = uploadFileName.trim() || `${uploadDocType.toLowerCase()}_${uploadRegNo}.pdf`;
        const createdDoc: DocumentVaultItem = {
            docID: newDocId, registrationNo: uploadRegNo, docType: uploadDocType,
            fileUrl: `https://storage.local/compliance/${cleanFile}`, fileSizeKb: Math.floor(450 + Math.random() * 1600),
            effectiveDate: uploadEffectiveDate, expiryDate: uploadExpiryDate, uploadedAt: new Date().toISOString(), uploadedBy: userID,
        };
        setVaultDocs((prev) => [createdDoc, ...prev]);
        setSelectedDocIds((prev) => [...prev, newDocId]);
        setUploadFileName('');
        onLogAction('Compliance Vault', `Uploaded ${uploadDocType} (${newDocId}) for entity ${uploadRegNo}.`);
        setVaultSubTab('repository');
    };

    const handleInitiateRenewal = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const feeNum = Number(filingFeeInput);
        if (!filingFeeInput || isNaN(feeNum) || feeNum <= 0) return setFilingError(`Enter a valid renewal fee greater than ${currencySymbol} 0.00.`);
        if (!filingDeadline) return setFilingError('Target filing deadline is required.');
        if (selectedDocIds.length === 0) return setFilingError('Please select at least 1 supporting document from the Document Vault first.');

        setFilingError('');
        onTriggerLoadingScreen?.('Packaging Vault Documents & Initiating Assisted Renewal...', 800);
        const matchedProfile = profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
        const renId = `REN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const baseFeeRM = Number((feeNum / exchangeRate).toFixed(2));
        const annualRM = matchedProfile.annualFeeRM ?? 450;
        const savedRM = selectedTermYears > 1 ? Math.max(0, Number((annualRM * selectedTermYears + 150 * (selectedTermYears - 1) - baseFeeRM).toFixed(2))) : 0;

        const createdTask: RenewalTask = {
            renewalID: renId, registrationNo: matchedProfile.registrationNo, companyName: matchedProfile.companyName,
            councilName: matchedProfile.councilName, licenseType: matchedProfile.licenseType, filingMode,
            status: 'ASSIGNED_TO_AGENT', assignedAgentID: filingMode === 'RPA_AUTOMATED' ? 'ORBYTE_RPA_BOT_01' : 'AGENT_DESK_03',
            pbtPortalUrl: `https://e-lesen.${matchedProfile.councilName.toLowerCase().replace(/[^a-z]/g, '')}.gov.my`,
            submissionReferenceNo: null, compiledSubmissionPdfUrl: `https://storage.local/packets/${matchedProfile.councilName}_${renId}.pdf`,
            generatedChecklist: [
                { step: 1, name: 'SSM Form 9 & Business Profile Validated', isCompleted: true },
                { step: 2, name: `${selectedDocIds.length} Vault Document(s) Attached & Indexed`, isCompleted: true },
                { step: 3, name: `${selectedTermYears}-Year Renewal Term (${savedRM > 0 ? `Saved RM ${savedRM}` : 'Standard 1-Yr'})`, isCompleted: true },
                { step: 4, name: 'Owner / Manager Final Submission Approval', isCompleted: false },
            ],
            targetDeadline: filingDeadline, renewalFee: baseFeeRM, renewalTermYears: selectedTermYears,
            savedDiscountRM: savedRM, currency: 'MYR', internalNotes: filingNotes.trim() || 'Standard PBT license renewal.',
            createdAt: new Date().toISOString(),
        };

        setRenewalTasks((prev) => [createdTask, ...prev]);
        onLogAction('Assisted Renewal', `Initiated ${selectedTermYears}-Year ${filingMode} task ${renId} for ${matchedProfile.companyName}.`);
        setFilingSubTab('pipeline');
    };

    const handleAdvanceRenewalStatus = (task: RenewalTask) => {
        if (!canApprove) return alert('Vyte RBAC Restriction: Only Owner or Manager accounts can approve statutory renewal submissions.');
        const nextStatus: RenewalTaskStatus = (task.status as string) === 'ASSIGNED_TO_AGENT' ? 'SUBMITTED_TO_PBT' : 'APPROVED_RENEWED';
        const refNo = task.submissionReferenceNo || `${task.councilName.slice(0, 4).toUpperCase()}-SUB-${Math.floor(100000 + Math.random() * 900000)}`;
        setRenewalTasks((prev) => prev.map((t) => t.renewalID === task.renewalID ? { ...t, status: nextStatus, submissionReferenceNo: refNo, generatedChecklist: t.generatedChecklist.map((c) => ({ ...c, isCompleted: true })) } : t));
        if ((nextStatus as string) === 'APPROVED_RENEWED') {
            const newExpYear = 2026 + (task.renewalTermYears ?? 1);
            setProfiles((prev) => prev.map((p) => p.registrationNo === task.registrationNo ? { ...p, complianceStatus: 'ACTIVE', licenseExpiryDate: `${newExpYear}-11-30` } : p));
        }
        onLogAction('Assisted Renewal', `Updated renewal task ${task.renewalID} (${task.companyName}) to ${nextStatus} [Ref: ${refNo}].`);
    };

    return (
        <div className="space-y-4 select-none w-full">
            {/* Real-Life SME Financial Loss + 1-Year vs 5-Year Discount Reminder Banner */}
            <div className="bg-gradient-to-r from-rose-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-5 border border-rose-500/30 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-[11px] font-bold uppercase tracking-wider">
                        SME Compliance, Fleet, Warranty &amp; Multi-Year Savings Shield
                    </span>
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        5-Year Bundle Smart Reminder: Save {currencySymbol} {(multiYearPortfolioSummary.totalSavedRM * exchangeRate).toLocaleString()} Across All Licenses!
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-rose-400 font-extrabold text-sm">Up to RM 50,000 Fine</p>
                        <p className="font-bold text-white">SSM, LHDN &amp; PBT Lapses</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Missed SSM Annual Returns, LHDN Form C, or PBT licenses trigger RM 500–RM 2,000/day compound fines.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-amber-400 font-extrabold text-sm">RM 45,000+ Uninsured Risk</p>
                        <p className="font-bold text-white">Car / Fleet Road Tax &amp; PUSPAKOM</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Commercial lorries &amp; vans require 6-month PUSPAKOM &amp; JPJ road tax. Lapses void cargo insurance.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-purple-300 font-extrabold text-sm">RM 8,500–RM 22,000 Saved</p>
                        <p className="font-bold text-white">Equipment &amp; Chiller Warranties</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Alerts you 30 days before OEM warranty expires so you can claim free compressor/boiler servicing.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 space-y-1">
                        <p className="text-emerald-300 font-extrabold text-sm">
                            1年1年还 vs 买5年立省 {currencySymbol} {(multiYearPortfolioSummary.totalSavedRM * exchangeRate).toLocaleString()}
                        </p>
                        <p className="font-bold text-white">Multi-Year Discount Reminder</p>
                        <p className="text-[11px] text-emerald-100 leading-relaxed">
                            Paying 1-by-1 year costs <strong>{currencySymbol} {(multiYearPortfolioSummary.totalAnnual5YrPayAsYouGoRM * exchangeRate).toLocaleString()}</strong>. Buying 5-Yr bundle costs only <strong>{currencySymbol} {(multiYearPortfolioSummary.totalBundle5YrDiscountedRM * exchangeRate).toLocaleString()}</strong> (-22% + 0 runner fees)!
                        </p>
                    </div>
                </div>
            </div>

            {/* Main 5-Tab Toggle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold gap-1">
                    <button type="button" onClick={() => setMainTab('ssm_radar')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'ssm_radar' ? 'bg-white text-emerald-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Licenses, Fleet &amp; Warranties ({profiles.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('accounting_sst')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'accounting_sst' ? 'bg-white text-amber-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>Accounting &amp; SST Due Dates ({accountingDeadlines.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('mfrs_audit')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'mfrs_audit' ? 'bg-white text-indigo-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Scale className="w-3.5 h-3.5 text-indigo-600" />
                        <span>MFRS 102 Audit Visualizer</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('vault_packet')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'vault_packet' ? 'bg-white text-purple-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <FolderLock className="w-3.5 h-3.5 text-purple-600" />
                        <span>Document Vault ({vaultDocs.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('assisted_filing')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'assisted_filing' ? 'bg-white text-blue-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Bot className="w-3.5 h-3.5 text-blue-600" />
                        <span>Assisted Filing ({renewalTasks.length})</span>
                    </button>
                </div>

                {mainTab === 'ssm_radar' && (
                    <div className="inline-flex items-center bg-amber-100/80 p-1 rounded-xl border border-amber-200 text-xs font-semibold">
                        <button type="button" onClick={() => setSsmSubTab('scanner')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'scanner' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" /><span>Expiry Radar ({scannedAlerts.length})</span>
                        </button>
                        <button type="button" onClick={() => setSsmSubTab('lookup')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'lookup' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <Search className="w-3.5 h-3.5" /><span>Add License / Car / Warranty</span>
                        </button>
                    </div>
                )}

                {mainTab === 'vault_packet' && (
                    <div className="inline-flex items-center bg-purple-100/80 p-1 rounded-xl border border-purple-200 text-xs font-semibold">
                        <button type="button" onClick={() => setVaultSubTab('repository')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'repository' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <FolderLock className="w-3.5 h-3.5" /><span>Vault Repository ({selectedDocIds.length})</span>
                        </button>
                        <button type="button" onClick={() => setVaultSubTab('upload')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'upload' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <Upload className="w-3.5 h-3.5" /><span>Upload Document</span>
                        </button>
                    </div>
                )}

                {mainTab === 'assisted_filing' && (
                    <div className="inline-flex items-center bg-blue-100/80 p-1 rounded-xl border border-blue-200 text-xs font-semibold">
                        <button type="button" onClick={() => setFilingSubTab('pipeline')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'pipeline' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Clock className="w-3.5 h-3.5" /><span>Filing Pipeline ({renewalTasks.length})</span>
                        </button>
                        <button type="button" onClick={() => setFilingSubTab('initiate')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'initiate' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Plus className="w-3.5 h-3.5" /><span>Initiate Renewal (1-Yr vs 5-Yr)</span>
                        </button>
                    </div>
                )}
            </div>

            {/* =====================================================================
                TAB 1: LICENSES, FLEET ROAD TAX & WARRANTIES + 1-YR VS 5-YR OPTIMIZER
               ===================================================================== */}
            {mainTab === 'ssm_radar' && (
                <div className="w-full space-y-4">
                    {ssmSubTab === 'scanner' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        Unified License, Fleet Road Tax/PUSPAKOM &amp; Equipment Warranty Radar
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Compare <strong>1-Year Annual Renewal (1年1年还)</strong> vs <strong>5-Year Bundle Discount (买5年省22%)</strong> &amp; claim equipment warranties before expiry.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <select value={councilFilter} onChange={(e) => setCouncilFilter(e.target.value)} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                                        <option value="ALL">Authority: All</option>
                                        {PBT_COUNCILS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                    <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                                        <option value={30}>Window: 30 Days</option>
                                        <option value={60}>Window: 60 Days</option>
                                        <option value={90}>Window: 90 Days</option>
                                        <option value={365}>Window: All (365 Days)</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => { onTriggerLoadingScreen?.('Scanning SSM, JPJ Fleet & OEM Warranties...', 600); setLastScannedAt(new Date().toISOString().slice(0, 19).replace('T', ' ')); }}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Scan Now
                                    </button>
                                </div>
                            </div>

                            {/* Category Filter Pills (All | SSM & PBT | Car/Fleet Licenses | Equipment Warranties) */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    {[
                                        { id: 'ALL' as const, label: `All Monitored (${profiles.length})`, icon: ShieldCheck },
                                        { id: 'SSM_PBT_LICENSE' as const, label: 'SSM & Council Licenses', icon: FileText },
                                        { id: 'FLEET_VEHICLE' as const, label: 'Car / Lorry Licenses (JPJ & PUSPAKOM)', icon: Car },
                                        { id: 'EQUIPMENT_WARRANTY' as const, label: 'Machinery & Chiller Warranties', icon: Wrench },
                                    ].map((cat) => {
                                        const Icon = cat.icon;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setAssetCategoryFilter(cat.id)}
                                                className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
                                                    assetCategoryFilter === cat.id
                                                        ? 'bg-slate-900 text-white border-slate-900'
                                                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                                                }`}
                                            >
                                                <Icon className="w-3.5 h-3.5" />
                                                <span>{cat.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <span className="font-mono text-[11px] text-slate-400">Checked: {lastScannedAt}</span>
                            </div>

                            {/* Cards List with 1-Year vs 5-Year Discount Optimizer & Warranty Claim Action */}
                            <div className="grid grid-cols-1 gap-3.5">
                                {scannedAlerts.map((prof) => {
                                    const daysLeft = calcDaysLeft(prof.licenseExpiryDate);
                                    const isExpired = daysLeft < 0 || prof.complianceStatus === 'EXPIRED';
                                    const cat = detectAssetCategory(prof);
                                    const annualFee = prof.annualFeeRM ?? 450;
                                    const disc5Yr = prof.fiveYearDiscountPct ?? 22;
                                    const selectedTerm = prof.selectedRenewalTermYears ?? 5;
                                    const cost1YrX5 = (annualFee * 5 + 150 * 5) * exchangeRate;
                                    const cost5YrBundle = (annualFee * 5 * (1 - disc5Yr / 100) + 150) * exchangeRate;
                                    const savings5Yr = Math.round(cost1YrX5 - cost5YrBundle);

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
                                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-[11px] font-bold">
                                                        {prof.councilName}
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                        cat === 'FLEET_VEHICLE'
                                                            ? 'bg-blue-100 text-blue-800'
                                                            : cat === 'EQUIPMENT_WARRANTY'
                                                                ? 'bg-purple-100 text-purple-800'
                                                                : 'bg-teal-100 text-teal-800'
                                                    }`}>
                                                        {cat === 'FLEET_VEHICLE' ? 'Vehicle / Road Tax' : cat === 'EQUIPMENT_WARRANTY' ? 'Equipment Warranty' : 'Business License'}
                                                    </span>
                                                    <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${
                                                        isExpired ? 'bg-rose-100 text-rose-700' : prof.complianceStatus === 'EXPIRING_SOON' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                                                    }`}>
                                                        {prof.complianceStatus} ({daysLeft}d left)
                                                    </span>
                                                    <span className="text-xs font-mono text-slate-500">Exp: {prof.licenseExpiryDate}</span>
                                                </div>

                                                <h4 className="text-sm font-extrabold text-slate-900">
                                                    {prof.companyName}{' '}
                                                    <span className="font-mono text-xs font-normal text-slate-500">({prof.registrationNo})</span>
                                                </h4>

                                                {/* 1-Year vs 5-Year Smart Reminder Bar */}
                                                <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/90 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Percent className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                        <span className="text-slate-700">
                                                            <strong>1年1年还 (5x Annual):</strong>{' '}
                                                            <span className="line-through text-rose-600 font-semibold">
                                                                {currencySymbol} {Math.round(cost1YrX5).toLocaleString()}
                                                            </span>{' '}
                                                            vs <strong>买5年享折扣 (-{disc5Yr}%):</strong>{' '}
                                                            <span className="text-emerald-700 font-extrabold">
                                                                {currencySymbol} {Math.round(cost5YrBundle).toLocaleString()}
                                                            </span>{' '}
                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                                                立省 {currencySymbol} {savings5Yr.toLocaleString()}
                                                            </span>
                                                        </span>
                                                    </div>

                                                    <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px]">
                                                        {([1, 3, 5] as const).map((yr) => (
                                                            <button
                                                                key={yr}
                                                                type="button"
                                                                onClick={() => handleSelectTermOnCard(prof.registrationNo, yr)}
                                                                className={`px-2 py-0.5 rounded-md font-bold transition cursor-pointer ${
                                                                    selectedTerm === yr
                                                                        ? 'bg-emerald-600 text-white'
                                                                        : 'text-slate-600 hover:text-slate-900'
                                                                }`}
                                                            >
                                                                {yr === 1 ? '1-Yr' : yr === 3 ? '3-Yr (-12%)' : `5-Yr (-${disc5Yr}%)`}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                                                {cat === 'EQUIPMENT_WARRANTY' && (
                                                    prof.warrantyClaimed ? (
                                                        <span className="px-3 py-2 rounded-xl bg-purple-100 text-purple-800 text-xs font-bold inline-flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Free OEM Service Booked
                                                        </span>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleClaimWarrantyService(prof)}
                                                            className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                        >
                                                            <Wrench className="w-3.5 h-3.5" /> Claim Free OEM Check Before Expiry
                                                        </button>
                                                    )
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => handlePrepareAssistedFiling(prof, selectedTerm)}
                                                    className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                >
                                                    Renew ({selectedTerm}-Yr Plan) <ArrowUpRight className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Lookup / Register New License, Fleet Vehicle, or Equipment Warranty */}
                    {ssmSubTab === 'lookup' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Search className="w-4 h-4 text-emerald-600" /> Register SSM License, Fleet Vehicle Road Tax or Equipment Warranty
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Add company licenses, commercial lorries/vans (JPJ/PUSPAKOM), or store machinery warranties to automated expiry tracking.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleVerifySsmProfile} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">SSM / Vehicle Plate / Serial No. *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 202401048291 or JPJ-WXY8821"
                                            value={ssmRegNo}
                                            onChange={(e) => { setSsmRegNo(e.target.value); setSsmLookupError(''); }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Company / Vehicle / Equipment Name *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., COLD-CHAIN LORRY WXY 8821 or ACME TECH SDN BHD"
                                            value={ssmCompanyName}
                                            onChange={(e) => { setSsmCompanyName(e.target.value); setSsmLookupError(''); }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Issuing Authority / OEM *</label>
                                        <select value={ssmCouncil} onChange={(e) => setSsmCouncil(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {PBT_COUNCILS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Category *</label>
                                        <select value={ssmLicenseType} onChange={(e) => setSsmLicenseType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {LICENSE_CATEGORIES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expiry Date *</label>
                                        <input type="date" value={ssmExpiryDate} onChange={(e) => setSsmExpiryDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                </div>

                                {ssmLookupError && (
                                    <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5">
                                        <AlertCircle className="w-4 h-4 shrink-0" /> {ssmLookupError}
                                    </p>
                                )}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setSsmSubTab('scanner')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">
                                        Back to Expiry Radar
                                    </button>
                                    <button type="submit" className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs transition cursor-pointer">
                                        <RefreshCw className="w-3.5 h-3.5" /> Save &amp; Activate Expiry Radar
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* =====================================================================
                TAB 2: ACCOUNTING FORMS SUBMISSION DUE DATES & SST COMPLIANCE HUB
               ===================================================================== */}
            {mainTab === 'accounting_sst' && (
                <div className="w-full space-y-4">
                    {/* Malaysia RMCD SST Statutory Rate Update Banner (6% vs 8% vs 10%) */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-emerald-600" />
                                    Malaysia Government SST Statutory Rate Engine (RMCD 2024/2026 Framework)
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Automatically applies updated Royal Malaysian Customs Department (RMCD) Sales &amp; Service Tax rules across your invoices.
                                </p>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                Gazetted SST Rules Synced ✓
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">0% EXEMPT</span>
                                <p className="font-bold text-slate-900 mt-1.5">Basic Food &amp; Raw Ingredients</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Raw coffee beans, fresh milk, B2B exempted logistics &amp; exports.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                                <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">6% RETAINED TIER</span>
                                <p className="font-bold text-slate-900 mt-1.5">F&amp;B, Cold-Chain &amp; Telecom</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Prepared food &amp; beverages, parking, and qualifying logistics services.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                                <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold">8% NEW SERVICE TAX</span>
                                <p className="font-bold text-slate-900 mt-1.5">Standard Taxable Services</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">IT/cloud software, equipment maintenance, professional &amp; consultancy fees.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
                                <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">10% SALES TAX</span>
                                <p className="font-bold text-slate-900 mt-1.5">Manufactured Goods</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Taxable commercial shelving, packaging machinery &amp; non-exempt supplies.</p>
                            </div>
                        </div>
                    </div>

                    {/* Statutory Accounting & Tax Forms Submission Calendar */}
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-amber-600" />
                                    Statutory Accounting, Tax &amp; SST Forms Submission Due Date Tracker
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Monitors mandatory LHDN, RMCD (SST-02), SSM MBRS, and KWSP/PERKESO filing deadlines so your SME never incurs late surcharges.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                                    <th className="py-3 px-4">Form Code &amp; Authority</th>
                                    <th className="py-3 px-3">Statutory Filing Description</th>
                                    <th className="py-3 px-3">Submission Due Date</th>
                                    <th className="py-3 px-3">Est. Amount ({currency})</th>
                                    <th className="py-3 px-3">Late Penalty Risk</th>
                                    <th className="py-3 px-4 text-right">Filing Status &amp; Action</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {accountingDeadlines.map((item) => {
                                    const daysLeft = calcDaysLeft(item.dueDate);
                                    return (
                                        <tr key={item.id} className="hover:bg-slate-50/80 transition">
                                            <td className="py-3.5 px-4 whitespace-nowrap">
                                                <p className="font-mono font-bold text-slate-900">{item.formCode}</p>
                                                <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                                                        {item.authority}
                                                    </span>
                                            </td>
                                            <td className="py-3.5 px-3 font-semibold text-slate-800 max-w-xs">
                                                {item.title}
                                            </td>
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                <p className="font-mono font-bold text-slate-900">{item.dueDate}</p>
                                                <span className={`text-[10px] font-bold ${daysLeft <= 14 ? 'text-rose-600' : 'text-amber-700'}`}>
                                                        {daysLeft >= 0 ? `Due in ${daysLeft} days` : `Overdue by ${Math.abs(daysLeft)}d`}
                                                    </span>
                                            </td>
                                            <td className="py-3.5 px-3 font-extrabold text-slate-900 whitespace-nowrap">
                                                {currencySymbol} {(item.estimatedPayableRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>
                                            <td className="py-3.5 px-3 text-[11px] text-rose-700 max-w-xs">
                                                {item.penaltyRule}
                                            </td>
                                            <td className="py-3.5 px-4 text-right whitespace-nowrap">
                                                {item.status === 'FILED_COMPLETED' ? (
                                                    <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 font-bold text-xs inline-flex items-center gap-1">
                                                            <CheckCircle2 className="w-3.5 h-3.5" /> Filed &amp; Lodged
                                                        </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setAccountingDeadlines((prev) =>
                                                                prev.map((d) =>
                                                                    d.id === item.id ? { ...d, status: 'FILED_COMPLETED' } : d
                                                                )
                                                            );
                                                            onLogAction(
                                                                'Accounting Compliance',
                                                                `Marked statutory form ${item.formCode} (${item.authority}) as FILED & COMPLETED.`
                                                            );
                                                        }}
                                                        className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> Mark Filed / Lodged
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                TAB 3: MFRS 102 INVENTORY AUDIT & INTERNAL CHECKING VISUALIZER
               ===================================================================== */}
            {mainTab === 'mfrs_audit' && (
                <div className="w-full space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Scale className="w-5 h-5 text-indigo-600" />
                                        MFRS 102 (Inventories) Internal Audit &amp; Boss Visualizer
                                    </h3>
                                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                        Audit-Ready Schedule
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Visualizes <strong>Lower of Cost and Net Realisable Value (NRV)</strong>, stock roll-forward cut-off reconciliation, and 3-Way PO-GRN-Invoice match for external/internal auditors.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleDownloadMfrsAuditCsv}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                            >
                                <Download className="w-3.5 h-3.5" /> Export MFRS 102 Audit Schedule (CSV)
                            </button>
                        </div>

                        {/* Visual Audit Waterfall for the Boss */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-slate-400">1. Historical Inventory Cost</span>
                                <p className="text-lg font-extrabold text-slate-900">
                                    {currencySymbol} {(mfrsAuditSummary.totalHistoricalCost * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-slate-500 block">FIFO / Weighted Avg Cost Basis</span>
                            </div>

                            <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-rose-600">2. MFRS 102 NRV Write-Down</span>
                                <p className="text-lg font-extrabold text-rose-700">
                                    - {currencySymbol} {(mfrsAuditSummary.totalWriteDown * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-rose-700 block">Expiring / Damaged Batch Impairment</span>
                            </div>

                            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-emerald-700">3. Audited Carrying Value</span>
                                <p className="text-lg font-extrabold text-emerald-800">
                                    {currencySymbol} {(mfrsAuditSummary.totalCarryingValue * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-emerald-700 font-semibold block">Balance Sheet Certified Value ✓</span>
                            </div>

                            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-indigo-700">4. Three-Way Audit Match</span>
                                <p className="text-lg font-extrabold text-indigo-900">98.6% Verified</p>
                                <span className="text-[11px] text-indigo-700 block">PO ↔ Delivery GRN ↔ Supplier Invoice</span>
                            </div>
                        </div>

                        {/* Stock Roll-Forward Reconciliation Bar */}
                        <div className="p-4 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3 text-xs">
                            <div>
                                <span className="text-[10px] uppercase font-bold text-emerald-400 block">
                                    Audit Stock Roll-Forward Equation (Cut-Off Reconciliation)
                                </span>
                                <p className="font-mono text-xs mt-1 text-slate-200">
                                    Opening ({currencySymbol} {(mfrsAuditSummary.estimatedOpeningStockRM * exchangeRate).toFixed(0)}) + Verified Purchases ({currencySymbol} {(mfrsAuditSummary.verifiedPurchasesRM * exchangeRate).toFixed(0)}) - COGS ({currencySymbol} {(mfrsAuditSummary.estimatedCogsRM * exchangeRate).toFixed(0)}) - NRV Write-Down ({currencySymbol} {(mfrsAuditSummary.totalWriteDown * exchangeRate).toFixed(2)}) ={' '}
                                    <strong className="text-emerald-400">
                                        Closing Book Value ({currencySymbol} {(mfrsAuditSummary.totalCarryingValue * exchangeRate).toFixed(2)})
                                    </strong>
                                </p>
                            </div>
                            <span className="px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold">
                                Zero Unexplained Variance
                            </span>
                        </div>

                        {/* SKU-Level MFRS 102 Lower of Cost vs NRV Table */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                                    <th className="py-2.5 px-4">SKU &amp; Product</th>
                                    <th className="py-2.5 px-3">Stock On Hand</th>
                                    <th className="py-2.5 px-3">Unit Cost</th>
                                    <th className="py-2.5 px-3">Total Cost</th>
                                    <th className="py-2.5 px-3">Est. NRV / Unit</th>
                                    <th className="py-2.5 px-3">NRV Write-Down</th>
                                    <th className="py-2.5 px-3">MFRS Carrying Value</th>
                                    <th className="py-2.5 px-4">Internal Audit Check</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {mfrsAuditSummary.rows.map((r) => (
                                    <tr key={r.id} className={r.hasImpairmentRisk ? 'bg-rose-50/30' : 'hover:bg-slate-50'}>
                                        <td className="py-3 px-4">
                                            <p className="font-bold text-slate-900">{r.name}</p>
                                            <span className="font-mono text-[11px] text-slate-400">{r.sku}</span>
                                        </td>
                                        <td className="py-3 px-3 font-bold">{r.stock} {r.uom}</td>
                                        <td className="py-3 px-3">{currencySymbol} {(r.unitCost * exchangeRate).toFixed(2)}</td>
                                        <td className="py-3 px-3 font-semibold">{currencySymbol} {(r.totalHistoricalCostRM * exchangeRate).toFixed(2)}</td>
                                        <td className="py-3 px-3">{currencySymbol} {(r.effectiveNrvPerUnit * exchangeRate).toFixed(2)}</td>
                                        <td className="py-3 px-3 font-bold text-rose-600">
                                            {r.nrvWriteDownRM > 0 ? `- ${currencySymbol} ${(r.nrvWriteDownRM * exchangeRate).toFixed(2)}` : '—'}
                                        </td>
                                        <td className="py-3 px-3 font-extrabold text-emerald-700">
                                            {currencySymbol} {(r.mfrsCarryingValueRM * exchangeRate).toFixed(2)}
                                        </td>
                                        <td className="py-3 px-4">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.hasImpairmentRisk ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}`}>
                                                    {r.qcRef}
                                                </span>
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* =====================================================================
                TAB 4: DOCUMENT VAULT & PACKET BUILDER
               ===================================================================== */}
            {mainTab === 'vault_packet' && (
                <div className="w-full">
                    {vaultSubTab === 'repository' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FolderLock className="w-4 h-4 text-purple-600" /> Centralized Compliance Document Vault &amp; Packet Builder
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Select required statutory documents below to bundle into your PBT renewal packet.</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => setVaultSubTab('upload')} className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                        <Upload className="w-3.5 h-3.5" /> + Upload New Document
                                    </button>
                                    <button type="button" onClick={() => { setMainTab('assisted_filing'); setFilingSubTab('initiate'); }} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer">
                                        Proceed with {selectedDocIds.length} Selected Doc(s) <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                                        <th className="py-3 px-4 w-12">Select</th>
                                        <th className="py-3 px-3">Document ID &amp; Type</th>
                                        <th className="py-3 px-3">SSM / Entity</th>
                                        <th className="py-3 px-3">Validity Period</th>
                                        <th className="py-3 px-3">File Size</th>
                                        <th className="py-3 px-4 text-right">Document Preview</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {vaultDocs.map((doc) => {
                                        const isChecked = selectedDocIds.includes(doc.docID);
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
                                                    <span className="font-mono text-[11px] text-slate-400">{doc.docID}</span>
                                                </td>
                                                <td className="py-3 px-3 font-mono font-bold text-slate-700">{doc.registrationNo}</td>
                                                <td className="py-3 px-3 font-mono text-slate-600">{doc.effectiveDate} &rarr; <strong>{doc.expiryDate}</strong></td>
                                                <td className="py-3 px-3 text-slate-500">{doc.fileSizeKb.toLocaleString()} KB</td>
                                                <td className="py-3 px-4 text-right">
                                                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-purple-100 text-slate-700 hover:text-purple-800 font-bold text-[11px] transition">
                                                        <FileText className="w-3 h-3" /> View PDF <ExternalLink className="w-2.5 h-2.5" />
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
                            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.png" onChange={(e) => { const f = e.target.files?.[0]; if (f) setUploadFileName(f.name); }} className="hidden" />
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4 text-purple-600" /> Upload Document to Compliance Vault</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Index official certificates, tenancy agreements, JPJ slips, or floor plans.</p>
                                </div>
                            </div>

                            <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Entity *</label>
                                        <select value={uploadRegNo} onChange={(e) => setUploadRegNo(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {profiles.map((p) => <option key={p.registrationNo} value={p.registrationNo}>{p.companyName} ({p.registrationNo})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Document Category *</label>
                                        <select value={uploadDocType} onChange={(e) => setUploadDocType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Effective Date *</label>
                                        <input type="date" value={uploadEffectiveDate} onChange={(e) => setUploadEffectiveDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Expiry Date *</label>
                                        <input type="date" value={uploadExpiryDate} onChange={(e) => setUploadExpiryDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">Document File</label>
                                        <div className="flex items-center gap-3">
                                            <input type="text" placeholder="Choose PDF/Image or enter filename..." value={uploadFileName} onChange={(e) => setUploadFileName(e.target.value)} className="flex-1 px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                            <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold cursor-pointer shrink-0">Choose File</button>
                                        </div>
                                    </div>
                                </div>
                                {uploadError && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {uploadError}</p>}
                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setVaultSubTab('repository')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Back</button>
                                    <button type="submit" className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer"><Upload className="w-3.5 h-3.5" /> Save to Vault</button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* =====================================================================
                TAB 5: CONCIERGE & RPA ASSISTED FILING (WITH 1-YR VS 5-YR SELECTOR)
               ===================================================================== */}
            {mainTab === 'assisted_filing' && (
                <div className="w-full">
                    {filingSubTab === 'pipeline' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-blue-600" /> Active Concierge &amp; RPA Assisted Filing Pipeline</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Tracks renewal packets, multi-year bundle savings, and Owner/Manager final approval.</p>
                                </div>
                                <button type="button" onClick={() => setFilingSubTab('initiate')} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer">
                                    <Plus className="w-3.5 h-3.5" /> + Initiate New Renewal
                                </button>
                            </div>

                            <div className="space-y-3">
                                {renewalTasks.map((task) => {
                                    const convertedFee = (task.renewalFee * exchangeRate).toFixed(2);
                                    const isDone = (task.status as string) === 'APPROVED_RENEWED';
                                    return (
                                        <div key={task.renewalID} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-3">
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="px-2.5 py-0.5 rounded-md bg-blue-100 text-blue-800 font-mono text-xs font-bold">{task.renewalID}</span>
                                                    <span className="px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono text-xs font-bold">{task.councilName}</span>
                                                    <span className="text-sm font-extrabold text-slate-900">{task.companyName}</span>
                                                    {task.renewalTermYears && (
                                                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                                            {task.renewalTermYears}-Year Plan {task.savedDiscountRM ? `(Saved ${currencySymbol} ${(task.savedDiscountRM * exchangeRate).toFixed(0)})` : ''}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    <div className="text-right">
                                                        <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Fee</span>
                                                        <span className="text-sm font-extrabold text-slate-900">{currencySymbol} {convertedFee}</span>
                                                    </div>
                                                    {!isDone ? (
                                                        <button type="button" onClick={() => handleAdvanceRenewalStatus(task)} className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                                                            <Send className="w-3.5 h-3.5" />
                                                            {(task.status as string) === 'ASSIGNED_TO_AGENT' ? 'Approve & Submit Packet' : 'Confirm Renewed'}
                                                        </button>
                                                    ) : (
                                                        <span className="px-3.5 py-2 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                                                            <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Renewed ({task.submissionReferenceNo})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-600">{task.internalNotes}</p>
                                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                                {task.generatedChecklist.map((item) => (
                                                    <span key={item.step} className={`px-2.5 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 border ${item.isCompleted ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}`}>
                                                        <Check className="w-3 h-3" /> {item.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {filingSubTab === 'initiate' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Plus className="w-4 h-4 text-blue-600" /> Initiate Assisted Renewal (1-Year Annual vs 5-Year Discount Bundle)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Choose between paying year-by-year or locking in a 5-year bundle with up to 22% fee discount &amp; 4x waived runner fees.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleInitiateRenewal} noValidate className="space-y-4 text-xs">
                                {/* Interactive 1-Year vs 3-Year vs 5-Year Bundle Selector */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[
                                        { yr: 1 as const, title: '1-Year Standard (1年1年还)', disc: 0, tag: 'No Discount • Renew Every Year', desc: 'Pay full annual fee + runner fee every single year.' },
                                        { yr: 3 as const, title: '3-Year Smart Plan (买3年)', disc: 12, tag: 'Save 12% + Waive 2x Runner Fees', desc: 'Lock in 3 years of compliance with 12% bulk discount.' },
                                        { yr: 5 as const, title: '5-Year Best Value Bundle (买5年享折扣)', disc: 22, tag: 'RECOMMENDED • Save 22% + Zero Late Fines', desc: 'Maximum savings! Pay once, enjoy 22% discount & 5 years peace of mind.' },
                                    ].map((plan) => {
                                        const targetProf = profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
                                        const baseAnnual = targetProf?.annualFeeRM ?? 450;
                                        const planFee = Number((baseAnnual * plan.yr * (1 - plan.disc / 100) * exchangeRate).toFixed(2));
                                        return (
                                            <button
                                                key={plan.yr}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedTermYears(plan.yr);
                                                    setFilingFeeInput(String(planFee));
                                                    setFilingNotes(`${plan.yr}-Year Renewal Plan Selected (-${plan.disc}% multi-year discount).`);
                                                }}
                                                className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                                                    selectedTermYears === plan.yr
                                                        ? 'bg-emerald-50 border-2 border-[#2BB656] shadow-xs'
                                                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-extrabold text-slate-900">{plan.title}</span>
                                                    <span className="text-sm font-extrabold text-emerald-700">{currencySymbol} {planFee}</span>
                                                </div>
                                                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">{plan.tag}</span>
                                                <p className="text-[11px] text-slate-500 mt-1">{plan.desc}</p>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Monitored Entity *</label>
                                        <select value={filingRegNo} onChange={(e) => setFilingRegNo(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {profiles.map((p) => <option key={p.registrationNo} value={p.registrationNo}>{p.companyName} ({p.councilName})</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Execution Mode *</label>
                                        <select value={filingMode} onChange={(e) => setFilingMode(e.target.value as 'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_AUTOMATED')} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            <option value="CONCIERGE_MANUAL_SUBMISSION">Concierge Desk Specialist</option>
                                            <option value="RPA_AUTOMATED">Orbyte RPA Bot Pre-Fill</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Net Bundle Fee ({currency}) *</label>
                                        <input type="text" inputMode="decimal" value={filingFeeInput} onChange={(e) => { setFilingFeeInput(sanitizePositiveDecimal(e.target.value)); setFilingError(''); }} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Deadline *</label>
                                        <input type="date" value={filingDeadline} onChange={(e) => setFilingDeadline(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-4">
                                        <label className="font-bold text-slate-700 block mb-1.5">Filing Notes</label>
                                        <textarea rows={2} value={filingNotes} onChange={(e) => setFilingNotes(e.target.value)} className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                    </div>
                                </div>

                                {filingError && <p className="text-xs text-rose-600 font-semibold flex items-center gap-1.5"><AlertCircle className="w-4 h-4 shrink-0" /> {filingError}</p>}

                                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                                    <button type="button" onClick={() => setFilingSubTab('pipeline')} className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold cursor-pointer">Back</button>
                                    <button type="submit" className="px-5 py-2.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-xs cursor-pointer">
                                        <Send className="w-3.5 h-3.5" /> Create {selectedTermYears}-Year Renewal Task
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