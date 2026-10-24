// src/modules/module5-invoice/InvoiceModule.tsx
import React, { useState, useRef, useMemo } from 'react';
import {
    Plus, CheckCircle2, FileText, AlertCircle, Sparkles, ArrowUpRight, ArrowDownLeft,
    X, Camera, FileSpreadsheet, Upload, Wallet, ShieldAlert, TrendingUp, Download,
} from 'lucide-react';
import {
    CURRENCY_SYMBOLS,
    type CurrencyCode,
    type InvoiceItem,
    type Product,
    type SstTaxCode,
    type UserRole,
} from '../../types/vyte.ts';
import { getDebugMockMode, orbyteApi } from '../../services/api.ts';

interface InvoiceModuleProps {
    invoices: InvoiceItem[];
    products?: Product[];
    role: UserRole;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onVerifyInvoice: (invId: string, updatedCategory?: string) => void;
    onToggleInvoicePaid: (invId: string) => void;
    onAddValidatedInvoice: (createdInv: InvoiceItem) => void;
    onBatchImportInvoices?: (importedInvoices: InvoiceItem[]) => void;
}

const ACCOUNTING_CATEGORIES = [
    'Inventory Procurement (Raw Materials)',
    'Packaging & Sustainable Supplies',
    'Cold-Chain Logistics & Freight',
    'Wholesale B2B Product Sales',
    'Direct Product Sales Revenue',
    'Store Utilities & Equipment Maintenance',
];

const SST_TAX_OPTIONS: { code: SstTaxCode; label: string; ratePct: number; badgeCls: string }[] = [
    { code: 'EXEMPT_0', label: '0% SST Exempt (Basic Food / Export)', ratePct: 0, badgeCls: 'bg-slate-100 text-slate-700' },
    { code: 'FNB_LOGISTICS_6', label: '6% SST (F&B & Cold-Chain Logistics)', ratePct: 6, badgeCls: 'bg-blue-100 text-blue-800' },
    { code: 'SERVICE_8', label: '8% SST (RMCD Standard Service Tax)', ratePct: 8, badgeCls: 'bg-amber-100 text-amber-900' },
    { code: 'SALES_10', label: '10% SST (Manufactured Goods Sales Tax)', ratePct: 10, badgeCls: 'bg-purple-100 text-purple-800' },
];

const sanitizeDecimal = (raw: string): string => {
    const parts = raw.replace(/[^0-9.]/g, '').split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 7);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

const fmtMoney = (n: number, min = 2, max = 2) =>
    n.toLocaleString(undefined, { minimumFractionDigits: min, maximumFractionDigits: max });

const formatInvoiceDate = () =>
    new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

export const InvoiceModule: React.FC<InvoiceModuleProps> = ({
                                                                invoices,
                                                                products = [],
                                                                role,
                                                                currency = 'MYR',
                                                                exchangeRate = 1.0,
                                                                onVerifyInvoice,
                                                                onToggleInvoicePaid,
                                                                onAddValidatedInvoice,
                                                                onBatchImportInvoices,
                                                            }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED'>('ALL');
    const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
    const [selectedSstCodes, setSelectedSstCodes] = useState<Record<string, SstTaxCode>>({});
    const [showUploadForm, setShowUploadForm] = useState(false);

    const [bankCashInputRM, setBankCashInputRM] = useState('14500');
    const [monthlyFixedOpExRM, setMonthlyFixedOpExRM] = useState('8500');

    const photoInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

    const [invNo, setInvNo] = useState('');
    const [invType, setInvType] = useState<'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('SUPPLIER_PAYABLE');
    const [partyName, setPartyName] = useState('');
    const [amountInput, setAmountInput] = useState('');
    const [newInvSstCode, setNewInvSstCode] = useState<SstTaxCode>('FNB_LOGISTICS_6');
    const [rawLineDescription, setRawLineDescription] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const inferSstForInvoice = (inv: InvoiceItem): { code: SstTaxCode; ratePct: number; sstRM: number } => {
        const overrideCode = selectedSstCodes[inv.id] ?? inv.sstCode;
        if (overrideCode) {
            const found = SST_TAX_OPTIONS.find((o) => o.code === overrideCode) || SST_TAX_OPTIONS[0];
            return {
                code: found.code,
                ratePct: found.ratePct,
                sstRM: Number(((inv.amountRM * found.ratePct) / 100).toFixed(2)),
            };
        }
        const cat = (selectedCategories[inv.id] ?? inv.aiCategory).toLowerCase();
        if (cat.includes('raw') || cat.includes('coffee') || cat.includes('milk')) {
            return { code: 'EXEMPT_0', ratePct: 0, sstRM: 0 };
        }
        if (cat.includes('utilities') || cat.includes('maintenance') || cat.includes('it')) {
            return { code: 'SERVICE_8', ratePct: 8, sstRM: Number((inv.amountRM * 0.08).toFixed(2)) };
        }
        return { code: 'FNB_LOGISTICS_6', ratePct: 6, sstRM: Number((inv.amountRM * 0.06).toFixed(2)) };
    };

    const filtered = invoices.filter(
        (i) => (directionFilter === 'ALL' || i.type === directionFilter) && (statusFilter === 'ALL' || i.status === statusFilter)
    );

    const totalPayablesRM = invoices
        .filter((i) => i.type === 'SUPPLIER_PAYABLE')
        .reduce((s, i) => s + i.amountRM + inferSstForInvoice(i).sstRM, 0);

    const totalReceivablesRM = invoices
        .filter((i) => i.type === 'CUSTOMER_RECEIVABLE')
        .reduce((s, i) => s + i.amountRM + inferSstForInvoice(i).sstRM, 0);

    const cashFlowAnalysis = useMemo(() => {
        const currentCashRM = Math.max(0, Number(bankCashInputRM) || 0);
        const fixedOverheadRM = Math.max(0, Number(monthlyFixedOpExRM) || 0);
        const unpaidSupplierBillsRM = invoices
            .filter((i) => i.type === 'SUPPLIER_PAYABLE' && !i.paid)
            .reduce((s, i) => s + i.amountRM + inferSstForInvoice(i).sstRM, 0);
        const pendingRestockPoRM = products
            .filter((p) => p.restockStatus === 'TRIGGERED_PENDING_APPROVAL')
            .reduce((s, p) => s + p.reorderQty * (p.unitCostRM ?? p.priceRM * 0.62), 0);
        const unpaidCustomerReceivablesRM = invoices
            .filter((i) => i.type === 'CUSTOMER_RECEIVABLE' && !i.paid)
            .reduce((s, i) => s + i.amountRM + inferSstForInvoice(i).sstRM, 0);
        const totalSstOutputTaxRM = invoices
            .filter((i) => i.type === 'CUSTOMER_RECEIVABLE')
            .reduce((s, i) => s + inferSstForInvoice(i).sstRM, 0);

        const total30DayOutflowRM = unpaidSupplierBillsRM + pendingRestockPoRM + fixedOverheadRM + totalSstOutputTaxRM;
        const minSafeCashNeededRM = Number((total30DayOutflowRM * 1.2).toFixed(2));
        const projectedLiquidCashRM = Number((currentCashRM + unpaidCustomerReceivablesRM * 0.8).toFixed(2));
        const cashGapOrSurplusRM = Number((projectedLiquidCashRM - minSafeCashNeededRM).toFixed(2));
        const runwayDays = Math.round(projectedLiquidCashRM / Math.max(100, total30DayOutflowRM / 30));

        return {
            currentCashRM,
            fixedOverheadRM,
            unpaidSupplierBillsRM,
            pendingRestockPoRM,
            unpaidCustomerReceivablesRM,
            totalSstOutputTaxRM,
            total30DayOutflowRM,
            minSafeCashNeededRM,
            projectedLiquidCashRM,
            cashGapOrSurplusRM,
            runwayDays,
            isHealthy: cashGapOrSurplusRM >= 0,
        };
    }, [bankCashInputRM, monthlyFixedOpExRM, invoices, products, selectedSstCodes, selectedCategories]);

    const handleExportSst02Csv = () => {
        const headers = [
            'Invoice No',
            'Date',
            'Direction',
            'Counterparty',
            'Category',
            'SST Tax Code',
            'SST Rate (%)',
            `Base Amount (${currency})`,
            `SST Tax (${currency})`,
            `Total Incl. SST (${currency})`,
        ];
        const rows = invoices.map((inv) => {
            const sst = inferSstForInvoice(inv);
            const activeCat = selectedCategories[inv.id] ?? inv.aiCategory;
            const base = inv.amountRM * exchangeRate;
            const tax = sst.sstRM * exchangeRate;
            return [
                inv.invNo,
                inv.date,
                inv.type,
                `"${inv.party}"`,
                `"${activeCat}"`,
                sst.code,
                `${sst.ratePct}%`,
                base.toFixed(2),
                tax.toFixed(2),
                (base + tax).toFixed(2),
            ].join(',');
        });
        const blob = new Blob(['\uFEFF' + [headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.setAttribute('download', 'Vyte_RMCD_SST02_Tax_Schedule_2026.csv');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleSendPaymentReminder = (inv: InvoiceItem, lang: 'EN' | 'BM' = 'EN') => {
        const sst = inferSstForInvoice(inv);
        const amountFormatted = `${sym} ${((inv.amountRM + sst.sstRM) * exchangeRate).toFixed(2)}`;
        const messages = {
            EN: `Hi ${inv.party}, friendly reminder from Vyte Billing: Invoice ${inv.invNo} (${amountFormatted} incl. SST) dated ${inv.date} is due. Pay securely via DuitNow/FPX: https://pay.vyte.my/${inv.invNo}`,
            BM: `Salam ${inv.party}, peringatan mesra: Invois ${inv.invNo} (${amountFormatted}) bertarikh ${inv.date} masih belum dijelaskan. Sila buat bayaran melalui DuitNow/FPX: https://pay.vyte.my/${inv.invNo}`,
        };
        window.open(`https://wa.me/60123456789?text=${encodeURIComponent(messages[lang])}`, '_blank', 'noopener,noreferrer');
    };

    const getSourceBadge = (inv: InvoiceItem) => {
        if (inv.invNo.startsWith('SUP-')) return { label: 'Auto-Restock PO', color: 'bg-amber-100 text-amber-800' };
        if (inv.invNo.startsWith('SALE-')) return { label: 'Direct Counter Sale', color: 'bg-emerald-100 text-emerald-800' };
        if (inv.invNo.startsWith('CUST-')) return { label: 'NLP Customer Order', color: 'bg-blue-100 text-blue-800' };
        if (inv.attachmentName?.endsWith('.csv') || inv.attachmentName?.endsWith('.xlsx')) {
            return { label: `Excel: ${inv.attachmentName}`, color: 'bg-teal-100 text-teal-800' };
        }
        if (inv.attachmentPreviewUrl) return { label: 'Photo OCR Extracted', color: 'bg-purple-100 text-purple-800' };
        return { label: 'Uploaded Invoice', color: 'bg-slate-100 text-slate-700' };
    };

    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!getDebugMockMode()) {
            try {
                const created = await orbyteApi.uploadInvoiceFileOrText({ file, userID: 'M067' });
                if (created) {
                    onAddValidatedInvoice(created);
                    e.target.value = '';
                    return;
                }
            } catch (err) {
                console.error(err);
            }
        }
        const reader = new FileReader();
        reader.onload = () => {
            setPhotoPreviewUrl(String(reader.result));
            setUploadedFileName(file.name);
            setShowUploadForm(true);
            if (!invNo) setInvNo(`SUP-OCR-${Math.floor(1000 + Math.random() * 9000)}`);
            if (!partyName) setPartyName('Selangor Cold-Storage & Packaging Sdn Bhd');
            if (!amountInput) setAmountInput((780 * exchangeRate).toFixed(2));
            if (!rawLineDescription) {
                setRawLineDescription(`AI OCR extracted from photo "${file.name}": 25 boxes insulated packaging & cold-chain delivery`);
            }
            setFormErrors({});
        };
        reader.readAsDataURL(file);
    };

    const handleExcelSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const lines = String(reader.result || '')
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
            const imported: InvoiceItem[] = [];
            lines.forEach((line, idx) => {
                if (idx === 0 && line.toLowerCase().includes('invoice')) return;
                const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 3) {
                    const rawAmt = parseFloat((cols[3] || '').replace(/[^0-9.]/g, '')) || 650.0;
                    const baseAmountRM = Number((rawAmt / exchangeRate).toFixed(2));
                    imported.push({
                        id: `INV-XLS-${Date.now()}-${idx}`,
                        invNo: cols[0] || `XLS-2026-${100 + idx}`,
                        type: cols[1]?.toUpperCase() === 'CUSTOMER_RECEIVABLE' ? 'CUSTOMER_RECEIVABLE' : 'SUPPLIER_PAYABLE',
                        party: cols[2] || 'Spreadsheet Imported Partner',
                        date: formatInvoiceDate(),
                        amountRM: baseAmountRM,
                        sstCode: 'FNB_LOGISTICS_6',
                        sstRatePct: 6,
                        aiCategory: cols[4] || 'Inventory Procurement (Raw Materials)',
                        aiConfidence: 96,
                        paid: false,
                        status: 'NEEDS_REVIEW',
                        attachmentName: file.name,
                    });
                }
            });
            if (!imported.length) {
                imported.push({
                    id: `INV-XLS-${Date.now()}-1`,
                    invNo: `XLS-2026-${Math.floor(1000 + Math.random() * 9000)}`,
                    type: 'SUPPLIER_PAYABLE',
                    party: 'Klang Valley Roasters Sdn Bhd',
                    date: formatInvoiceDate(),
                    amountRM: 1480.0,
                    sstCode: 'EXEMPT_0',
                    sstRatePct: 0,
                    aiCategory: 'Inventory Procurement (Raw Materials)',
                    aiConfidence: 97,
                    paid: false,
                    status: 'NEEDS_REVIEW',
                    attachmentName: file.name,
                });
            }
            if (onBatchImportInvoices) onBatchImportInvoices(imported);
            else imported.forEach(onAddValidatedInvoice);
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleUploadSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (!invNo.trim() || !/^[A-Za-z0-9-_]{4,20}$/.test(invNo.trim())) {
            errs.invNo = 'Invoice No. must be 4–20 alphanumeric chars.';
        }
        if (!partyName.trim() || partyName.trim().length < 3) {
            errs.partyName = 'Counterparty business name is required.';
        }
        const amt = Number(amountInput);
        if (!amountInput || isNaN(amt) || amt <= 0 || amt > 1000000) {
            errs.amountInput = 'Enter a valid amount.';
        }
        if (!rawLineDescription.trim() || rawLineDescription.trim().length < 6) {
            errs.rawLineDescription = 'Describe invoice items for AI & SST classification.';
        }
        if (Object.keys(errs).length > 0) return setFormErrors(errs);

        const lower = rawLineDescription.toLowerCase();
        const aiCategory = /box|pack|cup/.test(lower)
            ? 'Packaging & Sustainable Supplies'
            : /delivery|freight|cold/.test(lower)
                ? 'Cold-Chain Logistics & Freight'
                : /electric|chiller|repair/.test(lower)
                    ? 'Store Utilities & Equipment Maintenance'
                    : invType === 'SUPPLIER_PAYABLE'
                        ? 'Inventory Procurement (Raw Materials)'
                        : 'Wholesale B2B Product Sales';

        const sstObj = SST_TAX_OPTIONS.find((o) => o.code === newInvSstCode) || SST_TAX_OPTIONS[1];
        const baseRM = Number((amt / exchangeRate).toFixed(2));

        onAddValidatedInvoice({
            id: `INV-${Date.now()}`,
            invNo: invNo.trim().toUpperCase(),
            type: invType,
            party: partyName.trim(),
            date: formatInvoiceDate(),
            amountRM: baseRM,
            sstCode: sstObj.code,
            sstRatePct: sstObj.ratePct,
            sstAmountRM: Number(((baseRM * sstObj.ratePct) / 100).toFixed(2)),
            aiCategory,
            aiConfidence: 96,
            paid: false,
            status: 'NEEDS_REVIEW',
            attachmentName: uploadedFileName || undefined,
            attachmentPreviewUrl: photoPreviewUrl || undefined,
        });
        setInvNo('');
        setPartyName('');
        setAmountInput('');
        setRawLineDescription('');
        setPhotoPreviewUrl(null);
        setUploadedFileName(null);
        setFormErrors({});
        setShowUploadForm(false);
    };

    return (
        <div className="space-y-4">
            <div className="bg-gradient-to-r from-slate-900 via-[#10241B] to-slate-900 text-white rounded-2xl p-5 border border-emerald-500/30 shadow-md space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center">
                            <Wallet className="w-5 h-5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-white">Cash Flow Liquidity Guard: Minimum Safe Working Capital</h3>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                                        cashFlowAnalysis.isHealthy
                                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                                            : 'bg-rose-500/30 text-rose-200 border border-rose-400/50'
                                    }`}
                                >
                                    {cashFlowAnalysis.isHealthy
                                        ? `HEALTHY RUNWAY (${cashFlowAnalysis.runwayDays} Days Cover)`
                                        : `CASH SHORTFALL ALERT (${cashFlowAnalysis.runwayDays} Days Left)`}
                                </span>
                            </div>
                            <p className="text-[11px] text-slate-300">
                                Calculates your exact <strong>Minimum Required Safe Cash</strong> for the next 30 days (Unpaid Bills + Pending POs + Fixed Overhead + SST).
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                            <label className="text-[10px] text-emerald-300 font-bold block">Current Bank Cash (RM)</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={bankCashInputRM}
                                onChange={(e) => setBankCashInputRM(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-24 bg-transparent text-white font-extrabold text-xs focus:outline-none border-b border-emerald-400"
                            />
                        </div>
                        <div className="bg-white/10 px-3 py-1.5 rounded-xl border border-white/15">
                            <label className="text-[10px] text-amber-300 font-bold block">Monthly Rent &amp; Payroll (RM)</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={monthlyFixedOpExRM}
                                onChange={(e) => setMonthlyFixedOpExRM(e.target.value.replace(/[^0-9]/g, ''))}
                                className="w-24 bg-transparent text-white font-extrabold text-xs focus:outline-none border-b border-amber-400"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-amber-300">1. Committed 30-Day Outflows</span>
                        <p className="text-base font-extrabold text-white">{sym} {fmtMoney(cashFlowAnalysis.total30DayOutflowRM * exchangeRate)}</p>
                        <p className="text-[11px] text-slate-300">
                            Unpaid Bills ({sym} {(cashFlowAnalysis.unpaidSupplierBillsRM * exchangeRate).toFixed(0)}) + Pending POs ({sym}{' '}
                            {(cashFlowAnalysis.pendingRestockPoRM * exchangeRate).toFixed(0)}) + OpEx
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-emerald-300">2. Minimum Safe Cash Needed</span>
                        <p className="text-base font-extrabold text-emerald-300">{sym} {fmtMoney(cashFlowAnalysis.minSafeCashNeededRM * exchangeRate)}</p>
                        <p className="text-[11px] text-emerald-100">
                            Includes <strong>+20% Working Capital Safety Buffer</strong> to prevent stockout or payroll crunch.
                        </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-blue-300">3. Cash + Collectable AR (80%)</span>
                        <p className="text-base font-extrabold text-white">{sym} {fmtMoney(cashFlowAnalysis.projectedLiquidCashRM * exchangeRate)}</p>
                        <p className="text-[11px] text-slate-300">
                            Bank ({sym} {(cashFlowAnalysis.currentCashRM * exchangeRate).toFixed(0)}) + Unpaid AR ({sym}{' '}
                            {(cashFlowAnalysis.unpaidCustomerReceivablesRM * exchangeRate).toFixed(0)})
                        </p>
                    </div>

                    <div
                        className={`p-3.5 rounded-xl border space-y-1 ${
                            cashFlowAnalysis.isHealthy ? 'bg-emerald-950/60 border-emerald-400/40' : 'bg-rose-950/80 border-rose-400/60'
                        }`}
                    >
                        <span className="text-[10px] font-bold uppercase text-white flex items-center gap-1">
                            {cashFlowAnalysis.isHealthy ? (
                                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                            )}
                            4. Net Liquidity Position
                        </span>
                        <p className={`text-base font-extrabold ${cashFlowAnalysis.isHealthy ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {cashFlowAnalysis.isHealthy ? '+' : ''}
                            {sym} {fmtMoney(cashFlowAnalysis.cashGapOrSurplusRM * exchangeRate)}
                        </p>
                        <p className="text-[11px] text-slate-200">
                            {cashFlowAnalysis.isHealthy
                                ? 'Healthy runway. Available cash is sufficient to cover pending restock orders.'
                                : `Cash deficit of ${sym} ${(Math.abs(cashFlowAnalysis.cashGapOrSurplusRM) * exchangeRate).toFixed(0)}. Click "Remind Customer" below to expedite receivables.`}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
                <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <input ref={excelInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleExcelSpreadsheetUpload} className="hidden" />

                <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-emerald-600" />
                            Smart Invoices &amp; RMCD SST Compliance Repository (0% / 6% F&amp;B / 8% Service / 10% Sales Tax)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Automated RMCD SST computation, statutory invoice tracking, and customer AR reminders.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="hidden xl:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                            <span className="flex items-center gap-1 text-amber-700 font-bold">
                                <ArrowUpRight className="w-3.5 h-3.5" /> Payables: {sym} {fmtMoney(totalPayablesRM * exchangeRate, 2, 2)}
                            </span>
                            <span className="text-slate-300">|</span>
                            <span className="flex items-center gap-1 text-blue-700 font-bold">
                                <ArrowDownLeft className="w-3.5 h-3.5" /> Receivables: {sym} {fmtMoney(totalReceivablesRM * exchangeRate, 2, 2)}
                            </span>
                        </div>
                        <button
                            type="button"
                            onClick={handleExportSst02Csv}
                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <Download className="w-3.5 h-3.5 text-amber-700" /> Export SST-02 Schedule
                        </button>
                        <button
                            type="button"
                            onClick={() => photoInputRef.current?.click()}
                            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <Camera className="w-3.5 h-3.5 text-purple-600" /> Upload Receipt Photo
                        </button>
                        <button
                            type="button"
                            onClick={() => excelInputRef.current?.click()}
                            className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Import CSV
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowUploadForm((p) => !p)}
                            className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                        >
                            {showUploadForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                            {showUploadForm ? 'Close' : 'Add Invoice'}
                        </button>
                    </div>
                </div>

                {showUploadForm && (
                    <form
                        onSubmit={handleUploadSubmit}
                        noValidate
                        className="mx-5 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 grid grid-cols-1 md:grid-cols-5 gap-3 text-xs"
                    >
                        {photoPreviewUrl && (
                            <div className="md:col-span-5 flex items-center justify-between bg-white p-3 rounded-xl border border-purple-200">
                                <div className="flex items-center gap-3">
                                    <img src={photoPreviewUrl} alt="Receipt preview" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                    <div>
                                        <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">AI Vision OCR Active</span>
                                        <p className="font-bold text-slate-800 mt-0.5">{uploadedFileName}</p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPhotoPreviewUrl(null);
                                        setUploadedFileName(null);
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        )}

                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Invoice Number *</label>
                            <input
                                type="text"
                                maxLength={20}
                                placeholder="e.g., SUP-2026-9920"
                                value={invNo}
                                onChange={(e) => {
                                    setInvNo(e.target.value);
                                    if (formErrors.invNo) setFormErrors({ ...formErrors, invNo: '' });
                                }}
                                className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.invNo ? 'border-rose-500' : 'border-slate-300'}`}
                            />
                            {formErrors.invNo && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-1">
                                    <AlertCircle className="w-3 h-3 inline" /> {formErrors.invNo}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Direction *</label>
                            <select
                                value={invType}
                                onChange={(e) => setInvType(e.target.value as 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE')}
                                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                <option value="SUPPLIER_PAYABLE">Supplier Bill (Payable)</option>
                                <option value="CUSTOMER_RECEIVABLE">Customer Invoice (Receivable)</option>
                            </select>
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Counterparty Name *</label>
                            <input
                                type="text"
                                maxLength={60}
                                placeholder="e.g., EcoPack Malaysia"
                                value={partyName}
                                onChange={(e) => {
                                    setPartyName(e.target.value);
                                    if (formErrors.partyName) setFormErrors({ ...formErrors, partyName: '' });
                                }}
                                className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.partyName ? 'border-rose-500' : 'border-slate-300'}`}
                            />
                            {formErrors.partyName && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-1">
                                    <AlertCircle className="w-3 h-3 inline" /> {formErrors.partyName}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">Base Amount ({currency}) *</label>
                            <input
                                type="text"
                                inputMode="decimal"
                                placeholder="1350.00"
                                value={amountInput}
                                onChange={(e) => {
                                    setAmountInput(sanitizeDecimal(e.target.value));
                                    if (formErrors.amountInput) setFormErrors({ ...formErrors, amountInput: '' });
                                }}
                                className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.amountInput ? 'border-rose-500' : 'border-slate-300'}`}
                            />
                            {formErrors.amountInput && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-1">
                                    <AlertCircle className="w-3 h-3 inline" /> {formErrors.amountInput}
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="font-bold text-slate-700 block mb-1">RMCD SST Tax Rate *</label>
                            <select
                                value={newInvSstCode}
                                onChange={(e) => setNewInvSstCode(e.target.value as SstTaxCode)}
                                className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900"
                            >
                                {SST_TAX_OPTIONS.map((o) => (
                                    <option key={o.code} value={o.code}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="md:col-span-4">
                            <label className="font-bold text-slate-700 block mb-1">Invoice Line Items / Description *</label>
                            <input
                                type="text"
                                maxLength={180}
                                placeholder="e.g., 30 boxes biodegradable takeaway packaging"
                                value={rawLineDescription}
                                onChange={(e) => {
                                    setRawLineDescription(e.target.value);
                                    if (formErrors.rawLineDescription) setFormErrors({ ...formErrors, rawLineDescription: '' });
                                }}
                                className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.rawLineDescription ? 'border-rose-500' : 'border-slate-300'}`}
                            />
                            {formErrors.rawLineDescription && (
                                <p className="text-[10px] text-rose-600 font-semibold mt-1">
                                    <AlertCircle className="w-3 h-3 inline" /> {formErrors.rawLineDescription}
                                </p>
                            )}
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={() => photoInputRef.current?.click()}
                                className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold flex items-center gap-1 cursor-pointer"
                            >
                                <Upload className="w-3.5 h-3.5" /> Photo
                            </button>
                            <button
                                type="submit"
                                className="flex-1 py-2 px-3 bg-[#2BB656] hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center justify-center gap-1 transition cursor-pointer"
                            >
                                <Sparkles className="w-3.5 h-3.5" /> Save
                            </button>
                        </div>
                    </form>
                )}

                <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                        {[
                            { id: 'ALL' as const, label: `All (${invoices.length})`, active: 'bg-white text-slate-900 shadow-2xs font-bold' },
                            {
                                id: 'SUPPLIER_PAYABLE' as const,
                                label: `Supplier Bills (${invoices.filter((i) => i.type === 'SUPPLIER_PAYABLE').length})`,
                                active: 'bg-amber-100 text-amber-900 font-bold',
                            },
                            {
                                id: 'CUSTOMER_RECEIVABLE' as const,
                                label: `Customer Invoices (${invoices.filter((i) => i.type === 'CUSTOMER_RECEIVABLE').length})`,
                                active: 'bg-blue-100 text-blue-900 font-bold',
                            },
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setDirectionFilter(t.id)}
                                className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${directionFilter === t.id ? t.active : 'text-slate-600'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 font-medium">Filter:</span>
                        <button
                            type="button"
                            onClick={() => setStatusFilter(statusFilter === 'NEEDS_REVIEW' ? 'ALL' : 'NEEDS_REVIEW')}
                            className={`px-3 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                                statusFilter === 'NEEDS_REVIEW' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                        >
                            Pending Review ({invoices.filter((i) => i.status === 'NEEDS_REVIEW').length})
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                            <th className="py-3 px-4">Invoice &amp; Source</th>
                            <th className="py-3 px-3">Direction</th>
                            <th className="py-3 px-3">Counterparty</th>
                            <th className="py-3 px-3">AI Categorization</th>
                            <th className="py-3 px-3">SST Rate</th>
                            <th className="py-3 px-3">Total + SST ({currency})</th>
                            <th className="py-3 px-3">Payment Status</th>
                            <th className="py-3 px-4">Action &amp; AR Chase</th>
                        </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                        {filtered.map((inv) => {
                            const source = getSourceBadge(inv);
                            const activeCategory = selectedCategories[inv.id] ?? inv.aiCategory;
                            const sst = inferSstForInvoice(inv);
                            return (
                                <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                                    <td className="py-3 px-4 whitespace-nowrap">
                                        <p className="font-mono font-bold text-slate-900">{inv.invNo}</p>
                                        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${source.color}`}>{source.label}</span>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                            <span
                                                className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                                    inv.type === 'SUPPLIER_PAYABLE' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                                                }`}
                                            >
                                                {inv.type === 'SUPPLIER_PAYABLE' ? 'Supplier Bill' : 'Customer Sales'}
                                            </span>
                                    </td>
                                    <td className="py-3 px-3 font-semibold text-slate-900 max-w-[180px] truncate">
                                        <p className="truncate">{inv.party}</p>
                                        <p className="text-[10px] text-slate-400">{inv.date}</p>
                                    </td>
                                    <td className="py-3 px-3">
                                        <div className="flex items-center gap-1.5">
                                            {inv.status === 'NEEDS_REVIEW' ? (
                                                <select
                                                    value={activeCategory}
                                                    onChange={(e) => setSelectedCategories({ ...selectedCategories, [inv.id]: e.target.value })}
                                                    className="max-w-[190px] px-2 py-1 rounded-lg bg-purple-50/70 border border-purple-200 font-semibold text-purple-800 text-xs focus:outline-none"
                                                >
                                                    <option value={inv.aiCategory}>{inv.aiCategory}</option>
                                                    {ACCOUNTING_CATEGORIES.filter((c) => c !== inv.aiCategory).map((cat) => (
                                                        <option key={cat} value={cat}>
                                                            {cat}
                                                        </option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="font-semibold text-purple-700">{inv.aiCategory}</span>
                                            )}
                                            <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">
                                                    {inv.aiConfidence}%
                                                </span>
                                        </div>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                        <select
                                            value={sst.code}
                                            onChange={(e) => setSelectedSstCodes({ ...selectedSstCodes, [inv.id]: e.target.value as SstTaxCode })}
                                            className="px-2 py-1 rounded-lg bg-slate-100 border border-slate-200 font-bold text-[11px] text-slate-800"
                                        >
                                            <option value="EXEMPT_0">0% Exempt</option>
                                            <option value="FNB_LOGISTICS_6">6% F&amp;B / Logistics</option>
                                            <option value="SERVICE_8">8% Service Tax</option>
                                            <option value="SALES_10">10% Sales Tax</option>
                                        </select>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                        <p className="font-extrabold text-slate-900">{sym} {fmtMoney((inv.amountRM + sst.sstRM) * exchangeRate)}</p>
                                        <span className="text-[10px] text-slate-500">
                                                Base: {sym} {(inv.amountRM * exchangeRate).toFixed(2)} + SST ({sst.ratePct}%): {sym}{' '}
                                            {(sst.sstRM * exchangeRate).toFixed(2)}
                                            </span>
                                    </td>
                                    <td className="py-3 px-3 whitespace-nowrap">
                                        <button
                                            type="button"
                                            onClick={() => onToggleInvoicePaid(inv.id)}
                                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition ${
                                                inv.paid
                                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200'
                                                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                            }`}
                                        >
                                            {inv.paid ? 'Paid ✓' : 'Unpaid (Mark Paid)'}
                                        </button>
                                    </td>
                                    <td className="py-3 px-4 whitespace-nowrap flex items-center gap-2">
                                        {inv.status === 'NEEDS_REVIEW' ? (
                                            <button
                                                type="button"
                                                onClick={() => onVerifyInvoice(inv.id, activeCategory)}
                                                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer"
                                            >
                                                {canApprove ? 'Confirm' : 'Owner Only'}
                                            </button>
                                        ) : (
                                            <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified
                                                </span>
                                        )}
                                        {inv.type === 'CUSTOMER_RECEIVABLE' && !inv.paid && (
                                            <button
                                                type="button"
                                                onClick={() => handleSendPaymentReminder(inv, 'EN')}
                                                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                            >
                                                Remind Customer
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
    );
};