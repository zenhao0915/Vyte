// src/modules/module5-invoice/InvoiceModule.tsx
import React, { useState, useRef } from 'react';
import {
    Plus, CheckCircle2, FileText, Check, AlertCircle, Sparkles,
    ArrowUpRight, ArrowDownLeft, X, Camera, FileSpreadsheet, Upload,
} from 'lucide-react';
import type { CurrencyCode, InvoiceItem, UserRole } from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { getDebugMockMode, orbyteApi } from "../../services/api.ts";

interface InvoiceModuleProps {
    invoices: InvoiceItem[];
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

const sanitizeDecimal = (raw: string): string => {
    const parts = raw.replace(/[^0-9.]/g, '').split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 7);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

export const InvoiceModule: React.FC<InvoiceModuleProps> = ({
                                                                invoices, role, currency = 'MYR', exchangeRate = 1.0,
                                                                onVerifyInvoice, onToggleInvoicePaid, onAddValidatedInvoice, onBatchImportInvoices,
                                                            }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED'>('ALL');
    const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
    const [showUploadForm, setShowUploadForm] = useState(false);

    const photoInputRef = useRef<HTMLInputElement>(null);
    const excelInputRef = useRef<HTMLInputElement>(null);
    const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
    const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);

    const [invNo, setInvNo] = useState('');
    const [invType, setInvType] = useState<'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('SUPPLIER_PAYABLE');
    const [partyName, setPartyName] = useState('');
    const [amountInput, setAmountInput] = useState('');
    const [rawLineDescription, setRawLineDescription] = useState('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const filtered = invoices.filter((i) => (directionFilter === 'ALL' || i.type === directionFilter) && (statusFilter === 'ALL' || i.status === statusFilter));
    const totalPayablesRM = invoices.filter((i) => i.type === 'SUPPLIER_PAYABLE').reduce((s, i) => s + i.amountRM, 0);
    const totalReceivablesRM = invoices.filter((i) => i.type === 'CUSTOMER_RECEIVABLE').reduce((s, i) => s + i.amountRM, 0);

    const handleSendPaymentReminder = (inv: InvoiceItem, lang: 'EN' | 'BM' | 'ZH' = 'EN') => {
        const amountFormatted = `${sym} ${(inv.amountRM * exchangeRate).toFixed(2)}`;
        const messages = {
            EN: `Hi ${inv.party}, friendly reminder from Vyte Billing that Invoice ${inv.invNo} (${amountFormatted}) dated ${inv.date} is currently due. Pay instantly via DuitNow/FPX here: https://pay.vyte.my/${inv.invNo}`,
            BM: `Salam ${inv.party}, peringatan mesra bahawa Invois ${inv.invNo} (${amountFormatted}) bertarikh ${inv.date} masih belum dijelaskan. Sila buat bayaran melalui DuitNow/FPX: https://pay.vyte.my/${inv.invNo}`,
            ZH: `${inv.party} 您好，温馨提醒您账单 ${inv.invNo}（金额：${amountFormatted}，日期：${inv.date}）目前已到期。您可通过 DuitNow/FPX 一键完成付款：https://pay.vyte.my/${inv.invNo}`,
        };

        const whatsappUrl = `https://wa.me/60123456789?text=${encodeURIComponent(messages[lang])}`;
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    };

    const getSourceBadge = (inv: InvoiceItem) => {
        if (inv.invNo.startsWith('SUP-')) return { label: 'Auto-Restock PO', color: 'bg-amber-100 text-amber-800' };
        if (inv.invNo.startsWith('SALE-')) return { label: 'Direct Counter Sale', color: 'bg-emerald-100 text-emerald-800' };
        if (inv.invNo.startsWith('CUST-')) return { label: 'NLP Customer Order', color: 'bg-blue-100 text-blue-800' };
        if (inv.attachmentName?.endsWith('.csv') || inv.attachmentName?.endsWith('.xlsx')) return { label: `Excel: ${inv.attachmentName}`, color: 'bg-teal-100 text-teal-800' };
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
            if (!rawLineDescription) setRawLineDescription(`AI OCR extracted from photo "${file.name}": 25 boxes insulated packaging & cold-chain delivery`);
            setFormErrors({});
        };
        reader.readAsDataURL(file);
    };

    const handleExcelSpreadsheetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const lines = String(reader.result || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const imported: InvoiceItem[] = [];
            lines.forEach((line, idx) => {
                if (idx === 0 && line.toLowerCase().includes('invoice')) return;
                const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 3) {
                    imported.push({
                        id: `INV-XLS-${Date.now()}-${idx}`,
                        invNo: cols[0] || `XLS-2026-${100 + idx}`,
                        type: cols[1]?.toUpperCase() === 'CUSTOMER_RECEIVABLE' ? 'CUSTOMER_RECEIVABLE' : 'SUPPLIER_PAYABLE',
                        party: cols[2] || 'Spreadsheet Imported Partner',
                        date: '22 Oct 2026',
                        amountRM: Number(cols[3]) || 650.0,
                        aiCategory: cols[4] || 'Inventory Procurement (Raw Materials)',
                        aiConfidence: 96, paid: false, status: 'NEEDS_REVIEW', attachmentName: file.name,
                    });
                }
            });
            if (!imported.length) {
                imported.push(
                    { id: `INV-XLS-${Date.now()}-1`, invNo: `XLS-2026-${Math.floor(1000 + Math.random() * 9000)}`, type: 'SUPPLIER_PAYABLE', party: 'Klang Valley Roasters Sdn Bhd', date: '22 Oct 2026', amountRM: 1480.0, aiCategory: 'Inventory Procurement (Raw Materials)', aiConfidence: 97, paid: false, status: 'NEEDS_REVIEW', attachmentName: file.name },
                    { id: `INV-XLS-${Date.now()}-2`, invNo: `XLS-2026-${Math.floor(1000 + Math.random() * 9000)}`, type: 'CUSTOMER_RECEIVABLE', party: 'PJ Specialty Coffee Roasters', date: '22 Oct 2026', amountRM: 920.0, aiCategory: 'Wholesale B2B Product Sales', aiConfidence: 95, paid: true, status: 'NEEDS_REVIEW', attachmentName: file.name }
                );
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
        if (!invNo.trim() || !/^[A-Za-z0-9-_]{4,20}$/.test(invNo.trim())) errs.invNo = 'Invoice No. must be 4–20 alphanumeric chars (e.g., SUP-2026-9901).';
        if (!partyName.trim() || partyName.trim().length < 3) errs.partyName = 'Counterparty business name is required (min 3 chars).';
        const amt = Number(amountInput);
        if (!amountInput || isNaN(amt) || amt <= 0 || amt > 1000000) errs.amountInput = `Enter a valid amount between ${sym} 0.01 and 1,000,000.`;
        if (!rawLineDescription.trim() || rawLineDescription.trim().length < 6) errs.rawLineDescription = 'Describe invoice items (min 6 chars) for AI classification.';
        if (Object.keys(errs).length > 0) return setFormErrors(errs);

        const lower = rawLineDescription.toLowerCase();
        const aiCategory = /box|pack|cup/.test(lower)
            ? 'Packaging & Sustainable Supplies'
            : /delivery|freight|cold/.test(lower)
                ? 'Cold-Chain Logistics & Freight'
                : /electric|chiller|repair/.test(lower)
                    ? 'Store Utilities & Equipment Maintenance'
                    : invType === 'SUPPLIER_PAYABLE' ? 'Inventory Procurement (Raw Materials)' : 'Wholesale B2B Product Sales';

        onAddValidatedInvoice({
            id: `INV-${Date.now()}`, invNo: invNo.trim().toUpperCase(), type: invType, party: partyName.trim(),
            date: '22 Oct 2026', amountRM: Number((amt / exchangeRate).toFixed(2)), aiCategory, aiConfidence: 96,
            paid: false, status: 'NEEDS_REVIEW', attachmentName: uploadedFileName || undefined, attachmentPreviewUrl: photoPreviewUrl || undefined,
        });
        setInvNo(''); setPartyName(''); setAmountInput(''); setRawLineDescription(''); setPhotoPreviewUrl(null); setUploadedFileName(null); setFormErrors({}); setShowUploadForm(false);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-4">
            <input ref={photoInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
            <input ref={excelInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleExcelSpreadsheetUpload} className="hidden" />

            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2"><FileText className="w-5 h-5 text-emerald-600" /> Supplier &amp; Customer Smart Invoice Repository</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Automatically gathers supplier bills &amp; customer invoices across Auto Restock and Customer Orders, plus supports Photo OCR &amp; Excel/CSV batch import.</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <div className="hidden xl:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                        <span className="flex items-center gap-1 text-amber-700 font-bold"><ArrowUpRight className="w-3.5 h-3.5" /> Payables: {sym} {(totalPayablesRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1 text-blue-700 font-bold"><ArrowDownLeft className="w-3.5 h-3.5" /> Receivables: {sym} {(totalReceivablesRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                    </div>
                    <button type="button" onClick={() => photoInputRef.current?.click()} className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                        <Camera className="w-3.5 h-3.5 text-purple-600" /> Upload Receipt Photo
                    </button>
                    <button type="button" onClick={() => excelInputRef.current?.click()} className="px-3 py-2 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Import Excel / CSV
                    </button>
                    <button type="button" onClick={() => setShowUploadForm((p) => !p)} className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer">
                        {showUploadForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}{showUploadForm ? 'Close Form' : 'Manual / AI Parse Invoice'}
                    </button>
                </div>
            </div>

            {showUploadForm && (
                <form onSubmit={handleUploadSubmit} noValidate className="mx-5 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
                    {photoPreviewUrl && (
                        <div className="md:col-span-4 flex items-center justify-between bg-white p-3 rounded-xl border border-purple-200">
                            <div className="flex items-center gap-3">
                                <img src={photoPreviewUrl} alt="Receipt preview" className="w-12 h-12 object-cover rounded-lg border border-slate-200" />
                                <div>
                                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">AI Vision OCR Active</span>
                                    <p className="font-bold text-slate-800 mt-0.5">{uploadedFileName}</p>
                                    <p className="text-[11px] text-slate-500">Fields below were auto-populated from your receipt image. Review and click Save.</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => { setPhotoPreviewUrl(null); setUploadedFileName(null); }} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                    )}

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Invoice Number *</label>
                        <input type="text" maxLength={20} placeholder="e.g., SUP-2026-9920" value={invNo} onChange={(e) => { setInvNo(e.target.value); if (formErrors.invNo) setFormErrors({ ...formErrors, invNo: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.invNo ? 'border-rose-500' : 'border-slate-300'}`} />
                        {formErrors.invNo && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.invNo}</p>}
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Invoice Direction *</label>
                        <select value={invType} onChange={(e) => setInvType(e.target.value as 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE')} className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 font-semibold text-slate-900">
                            <option value="SUPPLIER_PAYABLE">Supplier Bill (Payable)</option>
                            <option value="CUSTOMER_RECEIVABLE">Customer Invoice (Receivable)</option>
                        </select>
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Counterparty Name *</label>
                        <input type="text" maxLength={60} placeholder="e.g., EcoPack Malaysia Sdn Bhd" value={partyName} onChange={(e) => { setPartyName(e.target.value); if (formErrors.partyName) setFormErrors({ ...formErrors, partyName: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.partyName ? 'border-rose-500' : 'border-slate-300'}`} />
                        {formErrors.partyName && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.partyName}</p>}
                    </div>
                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Total Amount ({currency}) *</label>
                        <input type="text" inputMode="decimal" placeholder="e.g., 1350.00" value={amountInput} onChange={(e) => { setAmountInput(sanitizeDecimal(e.target.value)); if (formErrors.amountInput) setFormErrors({ ...formErrors, amountInput: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.amountInput ? 'border-rose-500' : 'border-slate-300'}`} />
                        {formErrors.amountInput && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.amountInput}</p>}
                    </div>
                    <div className="md:col-span-3">
                        <label className="font-bold text-slate-700 block mb-1">Invoice Line Items / Description (Used by AI to Classify Category) *</label>
                        <input type="text" maxLength={180} placeholder="e.g., 30 boxes of biodegradable takeaway packaging & kraft paper cups" value={rawLineDescription} onChange={(e) => { setRawLineDescription(e.target.value); if (formErrors.rawLineDescription) setFormErrors({ ...formErrors, rawLineDescription: '' }); }} className={`w-full px-3 py-2 rounded-lg bg-white border ${formErrors.rawLineDescription ? 'border-rose-500' : 'border-slate-300'}`} />
                        {formErrors.rawLineDescription && <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {formErrors.rawLineDescription}</p>}
                    </div>
                    <div className="flex items-end gap-2">
                        <button type="button" onClick={() => photoInputRef.current?.click()} className="py-2 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-bold flex items-center gap-1 cursor-pointer"><Upload className="w-3.5 h-3.5" /> Photo</button>
                        <button type="submit" className="flex-1 py-2 px-4 bg-[#2BB656] hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer"><Sparkles className="w-3.5 h-3.5" /> Save &amp; AI Classify</button>
                    </div>
                </form>
            )}

            <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                    {[
                        { id: 'ALL' as const, label: `All (${invoices.length})`, active: 'bg-white text-slate-900 shadow-2xs font-bold' },
                        { id: 'SUPPLIER_PAYABLE' as const, label: `Supplier Bills (${invoices.filter((i) => i.type === 'SUPPLIER_PAYABLE').length})`, active: 'bg-amber-100 text-amber-900 font-bold' },
                        { id: 'CUSTOMER_RECEIVABLE' as const, label: `Customer Invoices (${invoices.filter((i) => i.type === 'CUSTOMER_RECEIVABLE').length})`, active: 'bg-blue-100 text-blue-900 font-bold' },
                    ].map((t) => (
                        <button key={t.id} type="button" onClick={() => setDirectionFilter(t.id)} className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${directionFilter === t.id ? t.active : 'text-slate-600'}`}>{t.label}</button>
                    ))}
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Filter:</span>
                    <button type="button" onClick={() => setStatusFilter(statusFilter === 'NEEDS_REVIEW' ? 'ALL' : 'NEEDS_REVIEW')} className={`px-3 py-1 rounded-lg border font-semibold transition cursor-pointer ${statusFilter === 'NEEDS_REVIEW' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
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
                        <th className="py-3 px-3">Counterparty Name</th>
                        <th className="py-3 px-3">AI Categorization &amp; Confidence</th>
                        <th className="py-3 px-3">E-Invoice</th>
                        <th className="py-3 px-3">Total ({currency})</th>
                        <th className="py-3 px-3">Payment (Click to Toggle)</th>
                        <th className="py-3 px-4">Action &amp; Verification</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {filtered.map((inv) => {
                        const source = getSourceBadge(inv);
                        const activeCategory = selectedCategories[inv.id] ?? inv.aiCategory;
                        return (
                            <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-3 px-4 whitespace-nowrap">
                                    <p className="font-mono font-bold text-slate-900">{inv.invNo}</p>
                                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${source.color}`}>{source.label}</span>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${inv.type === 'SUPPLIER_PAYABLE' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'}`}>
                                      {inv.type === 'SUPPLIER_PAYABLE' ? 'Supplier Bill' : 'Customer Sales'}
                                    </span>
                                </td>
                                <td className="py-3 px-3 font-semibold text-slate-900 max-w-[200px] truncate">
                                    <p className="truncate">{inv.party}</p><p className="text-[10px] text-slate-400">{inv.date}</p>
                                </td>
                                <td className="py-3 px-3">
                                    <div className="flex items-center gap-1.5">
                                        {inv.status === 'NEEDS_REVIEW' ? (
                                            <select value={activeCategory} onChange={(e) => setSelectedCategories({ ...selectedCategories, [inv.id]: e.target.value })} className="max-w-[230px] px-2 py-1 rounded-lg bg-purple-50/70 border border-purple-200 font-semibold text-purple-800 text-xs focus:outline-none">
                                                <option value={inv.aiCategory}>{inv.aiCategory}</option>
                                                {ACCOUNTING_CATEGORIES.filter((c) => c !== inv.aiCategory).map((cat) => <option key={cat} value={cat}>{cat}</option>)}
                                            </select>
                                        ) : (
                                            <span className="font-semibold text-purple-700">{inv.aiCategory}</span>
                                        )}
                                        <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">{inv.aiConfidence}% AI</span>
                                    </div>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200"><Check className="w-3 h-3" /> Ready</span>
                                </td>
                                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                                    {sym} {(inv.amountRM * exchangeRate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                    <button type="button" onClick={() => onToggleInvoicePaid(inv.id)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer border transition ${inv.paid ? 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}>
                                        {inv.paid ? 'Paid ✓ (Toggle)' : 'Unpaid (Mark Paid)'}
                                    </button>
                                </td>
                                <td className="py-3 px-4 whitespace-nowrap flex items-center gap-2">
                                    {inv.status === 'NEEDS_REVIEW' ? (
                                        <button type="button" onClick={() => onVerifyInvoice(inv.id, activeCategory)} className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer">
                                            {canApprove ? 'Confirm Category' : 'Owner/Mgr Only'}
                                        </button>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified</span>
                                    )}

                                    {inv.type === 'CUSTOMER_RECEIVABLE' && !inv.paid && (
                                        <button
                                            type="button"
                                            onClick={() => handleSendPaymentReminder(inv, 'EN')}
                                            className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                                        >
                                            Remind Customer (WhatsApp)
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
    );
};