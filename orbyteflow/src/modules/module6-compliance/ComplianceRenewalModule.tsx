import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle, AlertTriangle, ArrowUpRight, Bot, Building2, Calendar, Car, Check, CheckCircle2,
    Clock, Cpu, Download, ExternalLink, FileCheck, FileText, FolderLock, Percent, Plus,
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

const ISSUING_AUTHORITIES = [
    { label: 'MBPJ (Petaling Jaya Council)', value: 'MBPJ' },
    { label: 'DBKL (Kuala Lumpur City Hall)', value: 'DBKL' },
    { label: 'MBSA (Shah Alam City Council)', value: 'MBSA' },
    { label: 'Kompleks Bangsar Properties Sdn Bhd (Landlord)', value: 'Kompleks Bangsar Properties Sdn Bhd (Landlord)' },
    { label: 'Axis Industrial REIT Management (Landlord)', value: 'Axis Industrial REIT Management' },
    { label: 'SAP SE / Vyte Enterprise Cloud Licensing', value: 'SAP SE / Vyte Enterprise Cloud Licensing' },
    { label: 'Microsoft / Fortinet Authorized Reseller MY', value: 'Microsoft / Fortinet Authorized Reseller MY' },
    { label: 'JPJ / PUSPAKOM Commercial Fleet', value: 'JPJ / PUSPAKOM Commercial Fleet' },
    { label: 'Hitachi Cold-Chain OEM Warranty', value: 'Hitachi Cold-Chain OEM Warranty' },
];

const LICENSE_CATEGORIES = [
    { label: 'Premise Rental & Tenancy Contract (Store / Warehouse)', value: 'PREMISE_TENANCY_CONTRACT' },
    { label: 'Software Subscription & Cloud ERP/POS License', value: 'SOFTWARE_SUBSCRIPTION_LICENSE' },
    { label: 'Premise License (Lesen Premis)', value: 'PREMISE_LICENSE' },
    { label: 'Food Establishment (Lesen Makanan)', value: 'FOOD_ESTABLISHMENT' },
    { label: 'Signboard License (Lesen Iklan)', value: 'SIGNBOARD_LICENSE' },
    { label: 'Commercial Vehicle Road Tax & PUSPAKOM', value: 'FLEET_ROADTAX_PUSPAKOM' },
    { label: 'Equipment / Machinery OEM Warranty', value: 'EQUIPMENT_OEM_WARRANTY' },
];

const DOC_TYPES = [
    { label: 'Stamped Premise Rental & Tenancy Contract', value: 'TENANCY_AGREEMENT' },
    { label: 'Software License Agreement & Seat Key Certificate', value: 'SOFTWARE_LICENSE_AGREEMENT' },
    { label: 'SSM Certificate (Form 9 / Section 17)', value: 'SSM_CERT_FORM_9' },
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

    const [ssmRegNo, setSsmRegNo] = useState<string>(savedState.ssmRegNo ?? 'TEN-2026-9901');
    const [ssmCompanyName, setSsmCompanyName] = useState<string>(savedState.ssmCompanyName ?? 'RETAIL OUTLET & WAREHOUSE LEASE - LOT 22');
    const [ssmCouncil, setSsmCouncil] = useState<string>(savedState.ssmCouncil ?? 'Kompleks Bangsar Properties Sdn Bhd (Landlord)');
    const [ssmLicenseType, setSsmLicenseType] = useState<string>(savedState.ssmLicenseType ?? 'PREMISE_TENANCY_CONTRACT');
    const [ssmExpiryDate, setSsmExpiryDate] = useState<string>(savedState.ssmExpiryDate ?? '2026-11-30');
    const [ssmSeatOrUnitInfo, setSsmSeatOrUnitInfo] = useState<string>('2,400 sq.ft Ground Floor (RM 4,000/month)');
    const [ssmLookupError, setSsmLookupError] = useState<string>('');

    const [councilFilter, setCouncilFilter] = useState<string>(savedState.councilFilter ?? 'ALL');
    const [windowDays, setWindowDays] = useState<number>(savedState.windowDays ?? 365);
    const [lastScannedAt, setLastScannedAt] = useState<string>('2026-10-23 12:15:00');

    const [selectedDocIds, setSelectedDocIds] = useState<string[]>(savedState.selectedDocIds ?? ['DOC-99401', 'DOC-99412', 'DOC-99388']);
    const [uploadRegNo, setUploadRegNo] = useState<string>(savedState.uploadRegNo ?? 'TEN-2025-8810');
    const [uploadDocType, setUploadDocType] = useState<string>(savedState.uploadDocType ?? 'TENANCY_AGREEMENT');
    const [uploadEffectiveDate, setUploadEffectiveDate] = useState<string>(savedState.uploadEffectiveDate ?? '2026-01-01');
    const [uploadExpiryDate, setUploadExpiryDate] = useState<string>(savedState.uploadExpiryDate ?? '2027-12-31');
    const [uploadFileName, setUploadFileName] = useState<string>('');
    const [uploadNotes, setUploadNotes] = useState<string>('');
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
        if (p.registrationNo.startsWith('TEN-') || p.licenseType === 'PREMISE_TENANCY_CONTRACT' || p.companyName.toUpperCase().includes('LEASE') || p.companyName.toUpperCase().includes('RENTAL')) return 'RENTAL_CONTRACT';
        if (p.registrationNo.startsWith('SW-') || p.licenseType === 'SOFTWARE_SUBSCRIPTION_LICENSE' || p.companyName.toUpperCase().includes('SOFTWARE') || p.companyName.toUpperCase().includes('SEATS')) return 'SOFTWARE_LICENSE';
        if (p.registrationNo.startsWith('JPJ-') || p.councilName.toUpperCase().includes('JPJ') || p.councilName.toUpperCase().includes('PUSPAKOM')) return 'FLEET_VEHICLE';
        if (p.registrationNo.startsWith('WARR-') || p.companyName.toUpperCase().includes('WARRANTY')) return 'EQUIPMENT_WARRANTY';
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
            const discPct = p.fiveYearDiscountPct ?? 20;
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

    // SAP FI/MM (Valuation Class 3100, Moving Average Price V, Ledger 0L) & MFRS 102 Audit Summary
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
                sapValuationClass: p.valuationClass || '3100 (Trading Goods)',
                sapPriceControl: p.priceControl || 'V (Moving Avg Price)',
                sapGlAccount: p.industry === 'FNB_PERISHABLE' ? '1000000 (Raw Materials)' : '1140000 (Merchandise Inv)',
                qcRef: activeQc ? `Stock Type 02 Quality Inspection: ${activeQc.batchNo}` : 'Stock Type 01 Unrestricted-Use (Verified)',
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
        const headers = ['SKU', 'Product Name', 'SAP Valuation Class', 'SAP Price Control', 'SAP G/L Account', 'Physical Stock', 'UOM', `Unit Cost (${currency})`, `Total Historical Cost (${currency})`, `Est. NRV / Unit (${currency})`, `NRV Write-Down (${currency})`, `MFRS 102 Carrying Value (${currency})`, 'Stock Type & Audit Status'];
        const rows = mfrsAuditSummary.rows.map((r) => [
            r.sku, `"${r.name}"`, `"${r.sapValuationClass}"`, `"${r.sapPriceControl}"`, `"${r.sapGlAccount}"`, r.stock, r.uom,
            (r.unitCost * exchangeRate).toFixed(2), (r.totalHistoricalCostRM * exchangeRate).toFixed(2),
            (r.effectiveNrvPerUnit * exchangeRate).toFixed(2), (r.nrvWriteDownRM * exchangeRate).toFixed(2),
            (r.mfrsCarryingValueRM * exchangeRate).toFixed(2), `"${r.qcRef}"`,
        ].join(','));
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.setAttribute('download', `Vyte_SAP_G000_MFRS102_Inventory_Audit_${todayIso}.csv`);
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        onLogAction('Internal Audit', `Exported SAP G000 / MFRS 102 Inventory Valuation Schedule (${mfrsAuditSummary.rows.length} SKUs).`);
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
        setFilingNotes(term === 5 ? `5-Year Multi-Year Bundle Selected (-${disc}% discount).` : term === 3 ? `3-Year Renewal Contract Selected (-12% discount).` : `1-Year Standard Annual Renewal.`);
        setMainTab('assisted_filing');
        setFilingSubTab('initiate');
    };

    const handleVerifySsmProfile = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const cleanReg = ssmRegNo.trim();
        const cleanName = ssmCompanyName.trim();
        if (cleanReg.length < 4) return setSsmLookupError('Contract / License / Serial No. must be at least 4 characters.');
        if (cleanName.length < 3) return setSsmLookupError('Contract / Asset / License Name is required.');
        if (!ssmExpiryDate) return setSsmLookupError('Please select a valid Expiry Date.');

        setSsmLookupError('');
        onTriggerLoadingScreen?.(`Registering ${cleanReg} into Compliance & Documentation Database...`, 750);
        const daysLeft = calcDaysLeft(ssmExpiryDate);
        const computedStatus: BusinessComplianceProfile['complianceStatus'] = daysLeft < 0 ? 'EXPIRED' : daysLeft <= 60 ? 'EXPIRING_SOON' : 'ACTIVE';

        const categoryMap: Record<string, ComplianceAssetCategory> = {
            PREMISE_TENANCY_CONTRACT: 'RENTAL_CONTRACT',
            SOFTWARE_SUBSCRIPTION_LICENSE: 'SOFTWARE_LICENSE',
            FLEET_ROADTAX_PUSPAKOM: 'FLEET_VEHICLE',
            EQUIPMENT_OEM_WARRANTY: 'EQUIPMENT_WARRANTY',
        };

        const newProfile: BusinessComplianceProfile = {
            registrationNo: cleanReg,
            companyName: cleanName.toUpperCase(),
            companyType: cleanName.toUpperCase().includes('PLT') ? 'LLP' : cleanName.toUpperCase().includes('SDN') ? 'SDN_BHD' : 'ENTERPRISE',
            ssmExpiryDate: ssmExpiryDate,
            councilName: ssmCouncil,
            licenseType: ssmLicenseType,
            licenseExpiryDate: ssmExpiryDate,
            complianceStatus: computedStatus,
            autoAlertEnabled: true,
            assetCategory: categoryMap[ssmLicenseType] || 'SSM_PBT_LICENSE',
            annualFeeRM: ssmLicenseType === 'PREMISE_TENANCY_CONTRACT' ? 36000 : ssmLicenseType === 'SOFTWARE_SUBSCRIPTION_LICENSE' ? 3200 : 480,
            fiveYearDiscountPct: 20,
            selectedRenewalTermYears: 3,
            seatOrUnitInfo: ssmSeatOrUnitInfo.trim() || undefined,
        };

        setProfiles((prev) => prev.some((p) => p.registrationNo === cleanReg) ? prev.map((p) => (p.registrationNo === cleanReg ? newProfile : p)) : [newProfile, ...prev]);
        onLogAction('License & Compliance', `Registered ${cleanReg} (${cleanName.toUpperCase()}) under ${ssmCouncil}.`);
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
            docID: newDocId,
            registrationNo: uploadRegNo,
            docType: uploadDocType,
            fileUrl: `https://storage.local/compliance/${cleanFile}`,
            fileSizeKb: Math.floor(450 + Math.random() * 1600),
            effectiveDate: uploadEffectiveDate,
            expiryDate: uploadExpiryDate,
            uploadedAt: new Date().toISOString(),
            uploadedBy: userID,
            notes: uploadNotes.trim() || `Indexed ${uploadDocType.replace(/_/g, ' ')} for ${uploadRegNo}`,
        };
        setVaultDocs((prev) => [createdDoc, ...prev]);
        setSelectedDocIds((prev) => [...prev, newDocId]);
        setUploadFileName('');
        setUploadNotes('');
        onLogAction('Compliance Vault', `Uploaded ${uploadDocType} (${newDocId}) for ${uploadRegNo}.`);
        setVaultSubTab('repository');
    };

    const handleInitiateRenewal = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const feeNum = Number(filingFeeInput);
        if (!filingFeeInput || isNaN(feeNum) || feeNum <= 0) return setFilingError(`Enter a valid renewal fee greater than ${currencySymbol} 0.00.`);
        if (!filingDeadline) return setFilingError('Target filing deadline is required.');
        if (selectedDocIds.length === 0) return setFilingError('Please select at least 1 supporting document from the Document Vault first.');

        setFilingError('');
        onTriggerLoadingScreen?.('Packaging Vault Documents & Initiating Renewal...', 800);
        const matchedProfile = profiles.find((p) => p.registrationNo === filingRegNo) || profiles[0];
        const renId = `REN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const baseFeeRM = Number((feeNum / exchangeRate).toFixed(2));
        const annualRM = matchedProfile.annualFeeRM ?? 450;
        const savedRM = selectedTermYears > 1 ? Math.max(0, Number((annualRM * selectedTermYears + 150 * (selectedTermYears - 1) - baseFeeRM).toFixed(2))) : 0;

        const createdTask: RenewalTask = {
            renewalID: renId, registrationNo: matchedProfile.registrationNo, companyName: matchedProfile.companyName,
            councilName: matchedProfile.councilName, licenseType: matchedProfile.licenseType, filingMode,
            status: 'ASSIGNED_TO_AGENT', assignedAgentID: filingMode === 'RPA_AUTOMATED' ? 'ORBYTE_RPA_BOT_01' : 'AGENT_DESK_03',
            pbtPortalUrl: `https://e-lesen.${matchedProfile.councilName.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}.gov.my`,
            submissionReferenceNo: null, compiledSubmissionPdfUrl: `https://storage.local/packets/${renId}.pdf`,
            generatedChecklist: [
                { step: 1, name: 'Entity & Contract Terms Validated', isCompleted: true },
                { step: 2, name: `${selectedDocIds.length} Vault Document(s) Attached & Indexed`, isCompleted: true },
                { step: 3, name: `${selectedTermYears}-Year Renewal Term (${savedRM > 0 ? `Saved RM ${savedRM}` : 'Standard 1-Yr'})`, isCompleted: true },
                { step: 4, name: 'Owner / Manager Final Approval', isCompleted: false },
            ],
            targetDeadline: filingDeadline, renewalFee: baseFeeRM, renewalTermYears: selectedTermYears,
            savedDiscountRM: savedRM, currency: 'MYR', internalNotes: filingNotes.trim() || 'Standard renewal.',
            createdAt: new Date().toISOString(),
        };

        setRenewalTasks((prev) => [createdTask, ...prev.filter((x) => x.renewalID !== createdTask.renewalID)]);
        onLogAction('Assisted Renewal', `Initiated ${selectedTermYears}-Year ${filingMode} task ${renId} for ${matchedProfile.companyName}.`);
        setFilingSubTab('pipeline');
    };

    const handleAdvanceRenewalStatus = (task: RenewalTask) => {
        if (!canApprove) return;
        const nextStatus: RenewalTaskStatus = (task.status as string) === 'ASSIGNED_TO_AGENT' ? 'SUBMITTED_TO_PBT' : 'APPROVED_RENEWED';
        const refNo = task.submissionReferenceNo || `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        setRenewalTasks((prev) => prev.map((t) => t.renewalID === task.renewalID ? { ...t, status: nextStatus, submissionReferenceNo: refNo, generatedChecklist: t.generatedChecklist.map((c) => ({ ...c, isCompleted: true })) } : t));
        if ((nextStatus as string) === 'APPROVED_RENEWED') {
            const newExpYear = 2026 + (task.renewalTermYears ?? 1);
            setProfiles((prev) => prev.map((p) => p.registrationNo === task.registrationNo ? { ...p, complianceStatus: 'ACTIVE', licenseExpiryDate: `${newExpYear}-11-30` } : p));
        }
        onLogAction('Assisted Renewal', `Updated renewal task ${task.renewalID} (${task.companyName}) to ${nextStatus} [Ref: ${refNo}].`);
    };

    return (
        <div className="space-y-4 select-none w-full">
            {/* Top Summary Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-[#10241B] to-slate-900 text-white rounded-2xl p-5 border border-emerald-500/30 shadow-md space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
                        Licensing, Rental Contracts, Software Subscriptions &amp; Statutory Audit Hub
                    </span>
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5" />
                        Multi-Year Renewal Savings Potential: {currencySymbol} {(multiYearPortfolioSummary.totalSavedRM * exchangeRate).toLocaleString()}
                    </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-teal-300 font-extrabold text-sm">Premise Rental &amp; Tenancy</p>
                        <p className="font-bold text-white">Store &amp; Warehouse Leases</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Tracks tenancy expiry dates, landlord renewal notice windows, and stamped lease agreements in the Document Vault.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-blue-300 font-extrabold text-sm">Software Licensing</p>
                        <p className="font-bold text-white">ERP, POS &amp; Security Seats</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Monitors cloud ERP/POS seats, API keys, and firewall subscriptions so store operations never experience service lockouts.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <p className="text-amber-300 font-extrabold text-sm">SSM, PBT &amp; Fleet Permits</p>
                        <p className="font-bold text-white">Zero Late Compound Fines</p>
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                            Proactive countdowns for SSM Annual Returns, council premise licenses, JPJ road tax, and equipment warranties.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 space-y-1">
                        <p className="text-emerald-300 font-extrabold text-sm">
                            SAP FI/MM &amp; RMCD SST On-Time
                        </p>
                        <p className="font-bold text-white">Ledger 0L &amp; Statement G000</p>
                        <p className="text-[11px] text-emerald-100 leading-relaxed">
                            Full compliance with SAP Valuation Class 3100, Moving Average Price (V), MFRS 102 NRV, and RMCD SST-02 deadlines.
                        </p>
                    </div>
                </div>
            </div>

            {/* Main 5-Tab Toggle Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap items-center bg-slate-200/80 p-1 rounded-xl border border-slate-300/70 text-xs font-semibold gap-1">
                    <button type="button" onClick={() => setMainTab('ssm_radar')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'ssm_radar' ? 'bg-white text-emerald-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Licenses, Rental &amp; Software ({profiles.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('accounting_sst')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'accounting_sst' ? 'bg-white text-amber-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        <span>Government SST &amp; Tax Deadlines ({accountingDeadlines.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('mfrs_audit')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'mfrs_audit' ? 'bg-white text-indigo-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Scale className="w-3.5 h-3.5 text-indigo-600" />
                        <span>SAP G000 &amp; MFRS 102 Audit</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('vault_packet')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'vault_packet' ? 'bg-white text-purple-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <FolderLock className="w-3.5 h-3.5 text-purple-600" />
                        <span>Documentation Database ({vaultDocs.length})</span>
                    </button>
                    <button type="button" onClick={() => setMainTab('assisted_filing')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${mainTab === 'assisted_filing' ? 'bg-white text-blue-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                        <Bot className="w-3.5 h-3.5 text-blue-600" />
                        <span>Assisted Renewal ({renewalTasks.length})</span>
                    </button>
                </div>

                {mainTab === 'ssm_radar' && (
                    <div className="inline-flex items-center bg-amber-100/80 p-1 rounded-xl border border-amber-200 text-xs font-semibold">
                        <button type="button" onClick={() => setSsmSubTab('scanner')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'scanner' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <AlertTriangle className="w-3.5 h-3.5" /><span>Expiry Radar ({scannedAlerts.length})</span>
                        </button>
                        <button type="button" onClick={() => setSsmSubTab('lookup')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${ssmSubTab === 'lookup' ? 'bg-amber-500 text-white font-bold shadow-2xs' : 'text-amber-900 hover:bg-amber-200/60'}`}>
                            <Search className="w-3.5 h-3.5" /><span>Add Rental / Software / License</span>
                        </button>
                    </div>
                )}

                {mainTab === 'vault_packet' && (
                    <div className="inline-flex items-center bg-purple-100/80 p-1 rounded-xl border border-purple-200 text-xs font-semibold">
                        <button type="button" onClick={() => setVaultSubTab('repository')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'repository' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <FolderLock className="w-3.5 h-3.5" /><span>Contract &amp; License Vault ({selectedDocIds.length})</span>
                        </button>
                        <button type="button" onClick={() => setVaultSubTab('upload')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${vaultSubTab === 'upload' ? 'bg-purple-600 text-white font-bold shadow-2xs' : 'text-purple-900 hover:bg-purple-200/60'}`}>
                            <Upload className="w-3.5 h-3.5" /><span>Upload Contract / License PDF</span>
                        </button>
                    </div>
                )}

                {mainTab === 'assisted_filing' && (
                    <div className="inline-flex items-center bg-blue-100/80 p-1 rounded-xl border border-blue-200 text-xs font-semibold">
                        <button type="button" onClick={() => setFilingSubTab('pipeline')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'pipeline' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Clock className="w-3.5 h-3.5" /><span>Filing Pipeline ({renewalTasks.length})</span>
                        </button>
                        <button type="button" onClick={() => setFilingSubTab('initiate')} className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1.5 ${filingSubTab === 'initiate' ? 'bg-blue-600 text-white font-bold shadow-2xs' : 'text-blue-900 hover:bg-blue-200/60'}`}>
                            <Plus className="w-3.5 h-3.5" /><span>Initiate Renewal</span>
                        </button>
                    </div>
                )}
            </div>

            {/* =====================================================================
                TAB 1: LICENSES, RENTAL PLACE CONTRACTS, SOFTWARE LICENSING & FLEET
               ===================================================================== */}
            {mainTab === 'ssm_radar' && (
                <div className="w-full space-y-4">
                    {ssmSubTab === 'scanner' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        Premise Rental Contracts, Software Licenses, SSM/Council Permits &amp; Fleet Radar
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Monitor lease agreements, software seat subscriptions, business licenses, and equipment warranties in one central registry.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <select value={councilFilter} onChange={(e) => setCouncilFilter(e.target.value)} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                                        <option value="ALL">Provider / Authority: All</option>
                                        {ISSUING_AUTHORITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                    <select value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 font-bold text-slate-800">
                                        <option value={30}>Window: 30 Days</option>
                                        <option value={60}>Window: 60 Days</option>
                                        <option value={90}>Window: 90 Days</option>
                                        <option value={365}>Window: All (365 Days)</option>
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => { onTriggerLoadingScreen?.('Scanning Rental Contracts, Software Licenses & Permits...', 600); setLastScannedAt(new Date().toISOString().slice(0, 19).replace('T', ' ')); }}
                                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                                    >
                                        <RefreshCw className="w-3.5 h-3.5" /> Scan Now
                                    </button>
                                </div>
                            </div>

                            {/* Category Filter Pills including Rental Place & Software Licensing */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    {[
                                        { id: 'ALL' as const, label: `All Monitored (${profiles.length})`, icon: ShieldCheck },
                                        { id: 'RENTAL_CONTRACT' as const, label: 'Premise Rental & Tenancy Contracts', icon: Building2 },
                                        { id: 'SOFTWARE_LICENSE' as const, label: 'Software Licensing & Cloud Seats', icon: Cpu },
                                        { id: 'SSM_PBT_LICENSE' as const, label: 'SSM & Council Licenses', icon: FileText },
                                        { id: 'FLEET_VEHICLE' as const, label: 'Fleet Road Tax & PUSPAKOM', icon: Car },
                                        { id: 'EQUIPMENT_WARRANTY' as const, label: 'Machinery Warranties', icon: Wrench },
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

                            <div className="grid grid-cols-1 gap-3.5">
                                {scannedAlerts.map((prof) => {
                                    const daysLeft = calcDaysLeft(prof.licenseExpiryDate);
                                    const isExpired = daysLeft < 0 || prof.complianceStatus === 'EXPIRED';
                                    const cat = detectAssetCategory(prof);
                                    const annualFee = prof.annualFeeRM ?? 450;
                                    const disc5Yr = prof.fiveYearDiscountPct ?? 20;
                                    const selectedTerm = prof.selectedRenewalTermYears ?? 3;
                                    const cost1YrX5 = (annualFee * 5 + 150 * 5) * exchangeRate;
                                    const cost5YrBundle = (annualFee * 5 * (1 - disc5Yr / 100) + 150) * exchangeRate;
                                    const savings5Yr = Math.round(cost1YrX5 - cost5YrBundle);
                                    const linkedVaultDocs = vaultDocs.filter((d) => d.registrationNo === prof.registrationNo);

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
                                                        cat === 'RENTAL_CONTRACT'
                                                            ? 'bg-amber-100 text-amber-900'
                                                            : cat === 'SOFTWARE_LICENSE'
                                                                ? 'bg-indigo-100 text-indigo-800'
                                                                : cat === 'FLEET_VEHICLE'
                                                                    ? 'bg-blue-100 text-blue-800'
                                                                    : cat === 'EQUIPMENT_WARRANTY'
                                                                        ? 'bg-purple-100 text-purple-800'
                                                                        : 'bg-teal-100 text-teal-800'
                                                    }`}>
                                                        {cat === 'RENTAL_CONTRACT'
                                                            ? 'Premise Rental Contract'
                                                            : cat === 'SOFTWARE_LICENSE'
                                                                ? 'Software License'
                                                                : cat === 'FLEET_VEHICLE'
                                                                    ? 'Vehicle Road Tax'
                                                                    : cat === 'EQUIPMENT_WARRANTY'
                                                                        ? 'Equipment Warranty'
                                                                        : 'Business License'}
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

                                                {prof.seatOrUnitInfo && (
                                                    <p className="text-xs text-slate-600 font-semibold">
                                                        Contract / License Spec: {prof.seatOrUnitInfo}
                                                    </p>
                                                )}

                                                <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/90 flex flex-wrap items-center justify-between gap-2 text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Percent className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                                        <span className="text-slate-700">
                                                            <strong>Annual Pay-As-You-Go (5x):</strong>{' '}
                                                            <span className="line-through text-rose-600 font-semibold">
                                                                {currencySymbol} {Math.round(cost1YrX5).toLocaleString()}
                                                            </span>{' '}
                                                            vs <strong>Multi-Year Contract (-{disc5Yr}%):</strong>{' '}
                                                            <span className="text-emerald-700 font-extrabold">
                                                                {currencySymbol} {Math.round(cost5YrBundle).toLocaleString()}
                                                            </span>{' '}
                                                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                                                Save {currencySymbol} {savings5Yr.toLocaleString()}
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
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setUploadRegNo(prof.registrationNo);
                                                        setMainTab('vault_packet');
                                                        setVaultSubTab('repository');
                                                    }}
                                                    className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                                                >
                                                    <FolderLock className="w-3.5 h-3.5" /> Vault Docs ({linkedVaultDocs.length})
                                                </button>

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
                                                            <Wrench className="w-3.5 h-3.5" /> Claim Free OEM Check
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

                    {/* Register New Premise Rental Contract, Software License, SSM License or Fleet Permit */}
                    {ssmSubTab === 'lookup' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Search className="w-4 h-4 text-emerald-600" /> Add Premise Rental Contract, Software License, Business Permit or Warranty
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Register rental leases, software licenses, council permits, or vehicle road tax into the compliance database.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleVerifySsmProfile} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract / License / Reference No. *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., TEN-2026-9901 or SW-LIC-2026-401"
                                            value={ssmRegNo}
                                            onChange={(e) => { setSsmRegNo(e.target.value); setSsmLookupError(''); }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div className="lg:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Rental Premise / Software Name / License Title *</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., STOREFRONT LEASE LOT 22 or SAP CLOUD POS 15 SEATS"
                                            value={ssmCompanyName}
                                            onChange={(e) => { setSsmCompanyName(e.target.value); setSsmLookupError(''); }}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Landlord / Software Vendor / Authority *</label>
                                        <select value={ssmCouncil} onChange={(e) => setSsmCouncil(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {ISSUING_AUTHORITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Category *</label>
                                        <select value={ssmLicenseType} onChange={(e) => setSsmLicenseType(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-semibold text-slate-900">
                                            {LICENSE_CATEGORIES.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract / License Expiry Date *</label>
                                        <input type="date" value={ssmExpiryDate} onChange={(e) => setSsmExpiryDate(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-bold text-slate-900" />
                                    </div>
                                    <div className="md:col-span-2 lg:col-span-3">
                                        <label className="font-bold text-slate-700 block mb-1.5">Unit / Monthly Rental / Software Seat Details</label>
                                        <input
                                            type="text"
                                            placeholder="e.g., 2,400 sq.ft Ground Floor (RM 4,000/month) or 15 Named User Seats"
                                            value={ssmSeatOrUnitInfo}
                                            onChange={(e) => setSsmSeatOrUnitInfo(e.target.value)}
                                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800"
                                        />
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
                                        <RefreshCw className="w-3.5 h-3.5" /> Save to Database
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}
                </div>
            )}

            {/* =====================================================================
                TAB 2: ON-TIME GOVERNMENT SST & STATUTORY TAX DEADLINES (SAP FI/MM)
               ===================================================================== */}
            {mainTab === 'accounting_sst' && (
                <div className="w-full space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <FileCheck className="w-4 h-4 text-emerald-600" />
                                    Malaysia RMCD SST &amp; SAP Tax Code Mapping (0 / XI)
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Enforces Royal Malaysian Customs Department (RMCD) Sales &amp; Service Tax rules mapped to SAP Tax Jurisdiction TX0000000.
                                </p>
                            </div>
                            <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                On-Time Statutory Sync Active
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                                <span className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-bold">0% EXEMPT (SAP CODE 0)</span>
                                <p className="font-bold text-slate-900 mt-1.5">Basic Food &amp; Raw Materials</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Raw coffee beans, fresh milk, B2B exempted logistics &amp; exports.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200">
                                <span className="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold">6% SST (SAP CODE XI)</span>
                                <p className="font-bold text-slate-900 mt-1.5">F&amp;B &amp; Cold-Chain Logistics</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Prepared food &amp; beverages, parking, and qualifying logistics services.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200">
                                <span className="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold">8% SST (SAP CODE XI)</span>
                                <p className="font-bold text-slate-900 mt-1.5">Standard Taxable Services</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">IT/cloud software, equipment maintenance, professional &amp; consultancy fees.</p>
                            </div>
                            <div className="p-3.5 rounded-xl bg-purple-50/70 border border-purple-200">
                                <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">10% SST (SAP CODE XI)</span>
                                <p className="font-bold text-slate-900 mt-1.5">Manufactured Goods</p>
                                <p className="text-[11px] text-slate-600 mt-0.5">Taxable commercial shelving, packaging machinery &amp; non-exempt supplies.</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                            <div>
                                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-amber-600" />
                                    On-Time Government Statutory Tax, SST-02 &amp; Audit Filing Tracker
                                </h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Tracks mandatory LHDN, RMCD (SST-02), SSM MBRS, and KWSP/PERKESO filing deadlines with mapped SAP G/L accounts.
                                </p>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                                    <th className="py-3 px-4">Form Code &amp; Authority</th>
                                    <th className="py-3 px-3">Statutory Filing Description</th>
                                    <th className="py-3 px-3">SAP G/L Account</th>
                                    <th className="py-3 px-3">Submission Due Date</th>
                                    <th className="py-3 px-3">Est. Amount ({currency})</th>
                                    <th className="py-3 px-3">Late Penalty Risk</th>
                                    <th className="py-3 px-4 text-right">On-Time Filing Action</th>
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
                                            <td className="py-3.5 px-3 font-mono text-[11px] font-bold text-blue-700 whitespace-nowrap">
                                                {item.sapGlAccount || '3300000 (Trade Payables)'}
                                            </td>
                                            <td className="py-3.5 px-3 whitespace-nowrap">
                                                <p className="font-mono font-bold text-slate-900">{item.dueDate}</p>
                                                <span className={`text-[10px] font-bold ${daysLeft <= 14 ? 'text-rose-600' : 'text-amber-700'}`}>
                                                    {daysLeft >= 0 ? `Due in ${daysLeft} days (On Track)` : `Overdue by ${Math.abs(daysLeft)}d`}
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
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> Filed On Time
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
                                                                'Statutory Tax Filing',
                                                                `Filed statutory form ${item.formCode} (${item.authority}) on time via Bank 1 (1810000).`
                                                            );
                                                        }}
                                                        className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs cursor-pointer transition"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> Submit On Time
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
                TAB 3: SAP S/4HANA (LEDGER 0L / G000) & MFRS 102 INTERNAL AUDIT
               ===================================================================== */}
            {mainTab === 'mfrs_audit' && (
                <div className="w-full space-y-4">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <Scale className="w-5 h-5 text-indigo-600" />
                                        SAP Financial Statement (Company Code US00 | Ledger 0L | Version G000) &amp; MFRS 102 Audit
                                    </h3>
                                    <span className="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-bold">
                                        Valuation Class 3100 | Moving Average Price (V)
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Reconciles G/L Accounts <strong>1000000 (Raw Materials)</strong>, <strong>1140000 (Merchandise Inventories)</strong>, <strong>9100000 (GR/IR)</strong>, and <strong>3300000 (Trade Payables)</strong> with MFRS 102 Lower of Cost &amp; NRV.
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleDownloadMfrsAuditCsv}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition"
                            >
                                <Download className="w-3.5 h-3.5" /> Export SAP G000 &amp; MFRS 102 Schedule (CSV)
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-slate-400">G/L 1000000 &amp; 1140000 Cost</span>
                                <p className="text-lg font-extrabold text-slate-900">
                                    {currencySymbol} {(mfrsAuditSummary.totalHistoricalCost * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-slate-500 block">Moving Average Price (V) Basis</span>
                            </div>

                            <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-rose-600">Stock Type 02 NRV Write-Down</span>
                                <p className="text-lg font-extrabold text-rose-700">
                                    - {currencySymbol} {(mfrsAuditSummary.totalWriteDown * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-rose-700 block">Quality Inspection Impairment</span>
                            </div>

                            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-emerald-700">Audited Carrying Value</span>
                                <p className="text-lg font-extrabold text-emerald-800">
                                    {currencySymbol} {(mfrsAuditSummary.totalCarryingValue * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <span className="text-[11px] text-emerald-700 font-semibold block">Statement Version G000 Certified</span>
                            </div>

                            <div className="p-4 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                                <span className="text-[10px] font-bold uppercase text-indigo-700">GR/IR 9100000 3-Way Match</span>
                                <p className="text-lg font-extrabold text-indigo-900">100% Reconciled</p>
                                <span className="text-[11px] text-indigo-700 block">PO (4500000003) = GR (101) = Invoice</span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase">
                                    <th className="py-2.5 px-4">SKU &amp; Product</th>
                                    <th className="py-2.5 px-3">SAP G/L &amp; Valuation</th>
                                    <th className="py-2.5 px-3">Stock On Hand</th>
                                    <th className="py-2.5 px-3">MAP Unit Cost (V)</th>
                                    <th className="py-2.5 px-3">Total Cost</th>
                                    <th className="py-2.5 px-3">NRV Write-Down</th>
                                    <th className="py-2.5 px-3">Carrying Value</th>
                                    <th className="py-2.5 px-4">SAP Stock Type Status</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {mfrsAuditSummary.rows.map((r) => (
                                    <tr key={r.id} className={r.hasImpairmentRisk ? 'bg-rose-50/30' : 'hover:bg-slate-50'}>
                                        <td className="py-3 px-4">
                                            <p className="font-bold text-slate-900">{r.name}</p>
                                            <span className="font-mono text-[11px] text-slate-400">{r.sku}</span>
                                        </td>
                                        <td className="py-3 px-3">
                                            <p className="font-mono text-[11px] font-bold text-blue-700">{r.sapGlAccount}</p>
                                            <span className="text-[10px] text-slate-500">Class {r.sapValuationClass}</span>
                                        </td>
                                        <td className="py-3 px-3 font-bold">{r.stock} {r.uom}</td>
                                        <td className="py-3 px-3">{currencySymbol} {(r.unitCost * exchangeRate).toFixed(2)}</td>
                                        <td className="py-3 px-3 font-semibold">{currencySymbol} {(r.totalHistoricalCostRM * exchangeRate).toFixed(2)}</td>
                                        <td className="py-3 px-3 font-bold text-rose-600">
                                            {r.nrvWriteDownRM > 0 ? `- ${currencySymbol} ${(r.nrvWriteDownRM * exchangeRate).toFixed(2)}` : '-'}
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
                TAB 4: DOCUMENTATION DATABASE (RENTAL CONTRACTS, SOFTWARE & PERMITS)
               ===================================================================== */}
            {mainTab === 'vault_packet' && (
                <div className="w-full">
                    {vaultSubTab === 'repository' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                                        <FolderLock className="w-4 h-4 text-purple-600" /> Centralized Documentation Database (Rental Contracts, Software Licenses &amp; Statutory Permits)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Stores stamped tenancy agreements, software license certificates, floor plans, and SSM documents for audit and renewal packets.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button type="button" onClick={() => setVaultSubTab('upload')} className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                                        <Upload className="w-3.5 h-3.5" /> + Upload Contract / License
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
                                        <th className="py-3 px-3">Document ID &amp; Category</th>
                                        <th className="py-3 px-3">Contract / Entity Reference</th>
                                        <th className="py-3 px-3">Contract / License Description</th>
                                        <th className="py-3 px-3">Validity Period</th>
                                        <th className="py-3 px-3">File Size</th>
                                        <th className="py-3 px-4 text-right">Document File</th>
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
                                                <td className="py-3 px-3 font-mono font-bold text-purple-700">{doc.registrationNo}</td>
                                                <td className="py-3 px-3 text-slate-700 max-w-xs">{doc.notes || 'Official compliance record'}</td>
                                                <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">{doc.effectiveDate} &rarr; <strong>{doc.expiryDate}</strong></td>
                                                <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{doc.fileSizeKb.toLocaleString()} KB</td>
                                                <td className="py-3 px-4 text-right whitespace-nowrap">
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
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Upload className="w-4 h-4 text-purple-600" /> Upload Rental Contract, Software License or Permit to Database</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Archive stamped tenancy contracts, software license agreements, or council permits.</p>
                                </div>
                            </div>

                            <form onSubmit={handleUploadVaultDoc} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div>
                                        <label className="font-bold text-slate-700 block mb-1.5">Target Contract / Entity *</label>
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
                                    <div className="md:col-span-2">
                                        <label className="font-bold text-slate-700 block mb-1.5">Contract / License Notes</label>
                                        <input type="text" placeholder="e.g., Lot 18 Bangsar Tenancy Contract (RM 4,000/mo) or 15-Seat ERP License" value={uploadNotes} onChange={(e) => setUploadNotes(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-800" />
                                    </div>
                                    <div className="md:col-span-2">
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
                TAB 5: ASSISTED RENEWAL PIPELINE
               ===================================================================== */}
            {mainTab === 'assisted_filing' && (
                <div className="w-full">
                    {filingSubTab === 'pipeline' && (
                        <div className="w-full bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                                <div>
                                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><Bot className="w-4 h-4 text-blue-600" /> Active Renewal Pipeline</h3>
                                    <p className="text-xs text-slate-500 mt-0.5">Tracks lease renewals, software subscription renewals, and council license packets.</p>
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
                                        <Plus className="w-4 h-4 text-blue-600" /> Initiate Assisted Renewal (1-Year vs Multi-Year Bundle)
                                    </h3>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        Select a renewal term for your rental contract, software license, or business permit.
                                    </p>
                                </div>
                            </div>

                            <form onSubmit={handleInitiateRenewal} noValidate className="space-y-4 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {[
                                        { yr: 1 as const, title: '1-Year Standard Term', disc: 0, tag: 'Standard Annual Rate', desc: 'Renew for 12 months at standard annual rate.' },
                                        { yr: 3 as const, title: '3-Year Contract Plan', disc: 12, tag: 'Save 12% Multi-Year Discount', desc: 'Lock in 3 years of coverage with a 12% bulk discount.' },
                                        { yr: 5 as const, title: '5-Year Best Value Bundle', disc: 22, tag: 'Save 22% + Waive Runner Fees', desc: 'Maximum savings with 22% multi-year discount.' },
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
                                            <option value="RPA_AUTOMATED">Automated Portal Pre-Fill</option>
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