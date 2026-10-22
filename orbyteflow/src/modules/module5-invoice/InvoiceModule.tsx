// src/modules/module5-invoice/InvoiceModule.tsx
import React, { useState } from 'react';
import {
    Plus,
    CheckCircle2,
    FileText,
    Check,
    AlertCircle,
    Sparkles,
    ArrowUpRight,
    ArrowDownLeft,
    X,
} from 'lucide-react';
import { type InvoiceItem, type UserRole, type CurrencyCode, CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { VyteDropdown } from '../../components/common/VyteDropdown';

interface InvoiceModuleProps {
    invoices: InvoiceItem[];
    role: UserRole;
    currency?: CurrencyCode;
    onVerifyInvoice: (invId: string, updatedCategory?: string) => void;
    onToggleInvoicePaid: (invId: string) => void;
    onAddValidatedInvoice: (createdInv: InvoiceItem) => void;
}

const ACCOUNTING_CATEGORIES = [
    'Inventory Procurement (Raw Materials)',
    'Packaging & Sustainable Supplies',
    'Cold-Chain Logistics & Freight',
    'Wholesale B2B Product Sales',
    'Direct Product Sales Revenue',
    'Quality Claim & Waste Prevention',
    'Store Utilities & Equipment Maintenance',
];

const sanitizeBoundedDecimal = (raw: string): string => {
    const cleaned = raw.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    const intPart = parts[0].replace(/^0+/, '').slice(0, 7);
    return parts.length > 1 ? `${intPart || '0'}.${parts[1].slice(0, 2)}` : intPart;
};

/** @Composable */
export const InvoiceModule: React.FC<InvoiceModuleProps> = ({
                                                                invoices,
                                                                role,
                                                                currency = 'MYR',
                                                                onVerifyInvoice,
                                                                onToggleInvoicePaid,
                                                                onAddValidatedInvoice,
                                                            }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const currencyCode = currency;

    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED'>('ALL');
    const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
    const [showUploadForm, setShowUploadForm] = useState<boolean>(false);

    const [invNo, setInvNo] = useState<string>('');
    const [invType, setInvType] = useState<'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('SUPPLIER_PAYABLE');
    const [partyName, setPartyName] = useState<string>('');
    const [amountInput, setAmountInput] = useState<string>('');
    const [rawLineDescription, setRawLineDescription] = useState<string>('');
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});

    const canApprove = role === 'SME_OWNER' || role === 'MANAGER';

    const filtered = invoices.filter((inv) => {
        const matchDir = directionFilter === 'ALL' || inv.type === directionFilter;
        const matchStat = statusFilter === 'ALL' || inv.status === statusFilter;
        return matchDir && matchStat;
    });

    const totalPayablesRM = invoices
        .filter((i) => i.type === 'SUPPLIER_PAYABLE')
        .reduce((s, i) => s + i.amountRM, 0);

    const totalReceivablesRM = invoices
        .filter((i) => i.type === 'CUSTOMER_RECEIVABLE')
        .reduce((s, i) => s + i.amountRM, 0);

    const getSourceBadge = (inv: InvoiceItem) => {
        if (inv.invNo.startsWith('SUP-PO-')) {
            return { label: 'Mod 1: Auto-Restock PO', color: 'bg-amber-100 text-amber-800' };
        }
        if (inv.invNo.startsWith('SALE-')) {
            return { label: 'Mod 1: Counter Sale', color: 'bg-emerald-100 text-emerald-800' };
        }
        if (inv.invNo.startsWith('CUST-')) {
            return { label: 'Mod 3: NLP Customer Order', color: 'bg-blue-100 text-blue-800' };
        }
        if (inv.invNo.startsWith('CLM-')) {
            return { label: 'Mod 4: QC Claim Recovery', color: 'bg-purple-100 text-purple-800' };
        }
        return { label: 'Mod 5: Uploaded Invoice', color: 'bg-slate-100 text-slate-700' };
    };

    const handleUploadSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const errs: Record<string, string> = {};

        if (!invNo.trim() || !/^[A-Za-z0-9-_]{4,20}$/.test(invNo.trim())) {
            errs.invNo = 'Invoice No. must be 4–20 alphanumeric chars (e.g., SUP-2026-9901).';
        }
        if (!partyName.trim() || partyName.trim().length < 3) {
            errs.partyName = 'Counterparty business name is required (min 3 chars).';
        }
        const amt = Number(amountInput);
        if (!amountInput || isNaN(amt) || amt <= 0 || amt > 1000000) {
            errs.amountInput = `Enter a valid amount between ${currencySymbol} 0.01 and ${currencySymbol} 1,000,000.`;
        }
        if (!rawLineDescription.trim() || rawLineDescription.trim().length < 6) {
            errs.rawLineDescription = 'Describe invoice items (min 6 chars) for AI classification.';
        }

        if (Object.keys(errs).length > 0) {
            setFormErrors(errs);
            return;
        }

        const lowerDesc = rawLineDescription.toLowerCase();
        let classifiedCategory =
            invType === 'SUPPLIER_PAYABLE'
                ? 'Inventory Procurement (Raw Materials)'
                : 'Wholesale B2B Product Sales';

        if (lowerDesc.includes('box') || lowerDesc.includes('pack') || lowerDesc.includes('cup')) {
            classifiedCategory = 'Packaging & Sustainable Supplies';
        } else if (lowerDesc.includes('delivery') || lowerDesc.includes('freight') || lowerDesc.includes('lorry')) {
            classifiedCategory = 'Cold-Chain Logistics & Freight';
        } else if (lowerDesc.includes('electric') || lowerDesc.includes('chiller') || lowerDesc.includes('repair')) {
            classifiedCategory = 'Store Utilities & Equipment Maintenance';
        }

        const newInvoice: InvoiceItem = {
            id: `INV-${Date.now()}`,
            invNo: invNo.trim().toUpperCase(),
            type: invType,
            party: partyName.trim(),
            date: '21 Oct 2026',
            amountRM: amt,
            aiCategory: classifiedCategory,
            aiConfidence: 96,
            paid: false,
            status: 'NEEDS_REVIEW',
        };

        onAddValidatedInvoice(newInvoice);
        setInvNo('');
        setPartyName('');
        setAmountInput('');
        setRawLineDescription('');
        setFormErrors({});
        setShowUploadForm(false);
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4 pb-6">
            <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" /> Supplier &amp; Customer Smart Invoice Repository
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Automatically gathers supplier bills &amp; customer invoices from Modules 1, 3, and 4. Click any Paid/Unpaid badge to toggle payment status.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-3 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                        <span className="flex items-center gap-1 text-amber-700 font-bold">
                            <ArrowUpRight className="w-3.5 h-3.5" /> Payables: {currencySymbol}{' '}
                            {totalPayablesRM.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-slate-300">|</span>
                        <span className="flex items-center gap-1 text-blue-700 font-bold">
                            <ArrowDownLeft className="w-3.5 h-3.5" /> Receivables: {currencySymbol}{' '}
                            {totalReceivablesRM.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowUploadForm((prev) => !prev)}
                        className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                        {showUploadForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        {showUploadForm ? 'Close Upload Form' : 'Upload & AI Parse Invoice'}
                    </button>
                </div>
            </div>

            {/* Validated Upload & AI Parse Form */}
            {showUploadForm && (
                <form
                    onSubmit={handleUploadSubmit}
                    noValidate
                    className="mx-5 p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs"
                >
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
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                formErrors.invNo ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {formErrors.invNo && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {formErrors.invNo}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Invoice Direction *</label>
                        <VyteDropdown
                            variant="light"
                            value={invType}
                            onChange={(val) => setInvType(val)}
                            options={[
                                { label: 'Supplier Bill (Payable)', value: 'SUPPLIER_PAYABLE' },
                                { label: 'Customer Invoice (Receivable)', value: 'CUSTOMER_RECEIVABLE' },
                            ]}
                        />
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Counterparty Name *</label>
                        <input
                            type="text"
                            maxLength={60}
                            placeholder="e.g., EcoPack Malaysia Sdn Bhd"
                            value={partyName}
                            onChange={(e) => {
                                setPartyName(e.target.value);
                                if (formErrors.partyName) setFormErrors({ ...formErrors, partyName: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                formErrors.partyName ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {formErrors.partyName && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {formErrors.partyName}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="font-bold text-slate-700 block mb-1">Total Amount ({currencyCode}) *</label>
                        <input
                            type="text"
                            inputMode="decimal"
                            placeholder="e.g., 1350.00"
                            value={amountInput}
                            onChange={(e) => {
                                setAmountInput(sanitizeBoundedDecimal(e.target.value));
                                if (formErrors.amountInput) setFormErrors({ ...formErrors, amountInput: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                formErrors.amountInput ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {formErrors.amountInput && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {formErrors.amountInput}
                            </p>
                        )}
                    </div>

                    <div className="md:col-span-3">
                        <label className="font-bold text-slate-700 block mb-1">
                            Invoice Line Items / Description (Used by AI to Classify Category) *
                        </label>
                        <input
                            type="text"
                            maxLength={180}
                            placeholder="e.g., 30 boxes of biodegradable takeaway packaging & kraft paper cups"
                            value={rawLineDescription}
                            onChange={(e) => {
                                setRawLineDescription(e.target.value);
                                if (formErrors.rawLineDescription) setFormErrors({ ...formErrors, rawLineDescription: '' });
                            }}
                            className={`w-full px-3 py-2 rounded-xl bg-white border ${
                                formErrors.rawLineDescription ? 'border-rose-500' : 'border-slate-300'
                            }`}
                        />
                        {formErrors.rawLineDescription && (
                            <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {formErrors.rawLineDescription}
                            </p>
                        )}
                    </div>

                    <div className="flex items-end">
                        <button
                            type="submit"
                            className="w-full py-2 px-4 bg-[#2BB656] hover:bg-emerald-600 text-white font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" /> Save &amp; AI Classify
                        </button>
                    </div>
                </form>
            )}

            {/* Filter Tabs */}
            <div className="px-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                    <button
                        type="button"
                        onClick={() => setDirectionFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                        }`}
                    >
                        All ({invoices.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setDirectionFilter('SUPPLIER_PAYABLE')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'SUPPLIER_PAYABLE' ? 'bg-amber-100 text-amber-900 font-bold' : 'text-slate-600'
                        }`}
                    >
                        Supplier Bills ({invoices.filter((i) => i.type === 'SUPPLIER_PAYABLE').length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setDirectionFilter('CUSTOMER_RECEIVABLE')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'CUSTOMER_RECEIVABLE' ? 'bg-blue-100 text-blue-900 font-bold' : 'text-slate-600'
                        }`}
                    >
                        Customer Invoices ({invoices.filter((i) => i.type === 'CUSTOMER_RECEIVABLE').length})
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Filter:</span>
                    <button
                        type="button"
                        onClick={() => setStatusFilter(statusFilter === 'NEEDS_REVIEW' ? 'ALL' : 'NEEDS_REVIEW')}
                        className={`px-3 py-1 rounded-lg border font-semibold transition cursor-pointer ${
                            statusFilter === 'NEEDS_REVIEW'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                        }`}
                    >
                        Pending Review ({invoices.filter((i) => i.status === 'NEEDS_REVIEW').length})
                    </button>
                </div>
            </div>

            {/* Invoices Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-600 uppercase">
                        <th className="py-3 px-4">Invoice &amp; Source</th>
                        <th className="py-3 px-3">Direction</th>
                        <th className="py-3 px-3">Counterparty Name</th>
                        <th className="py-3 px-3">AI Categorization &amp; Confidence</th>
                        <th className="py-3 px-3">E-Invoice</th>
                        <th className="py-3 px-3">Total ({currencyCode})</th>
                        <th className="py-3 px-3">Payment (Click to Toggle)</th>
                        <th className="py-3 px-4">Human Verification</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {filtered.map((inv) => {
                        const source = getSourceBadge(inv);
                        const activeCategory = selectedCategories[inv.id] ?? inv.aiCategory;
                        const categoryOptions = [
                            inv.aiCategory,
                            ...ACCOUNTING_CATEGORIES.filter((c) => c !== inv.aiCategory),
                        ].map((cat) => ({ label: cat, value: cat }));

                        return (
                            <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-3 px-4 whitespace-nowrap">
                                    <p className="font-mono font-bold text-slate-900">{inv.invNo}</p>
                                    <span className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-bold ${source.color}`}>
                                            {source.label}
                                        </span>
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                        <span
                                            className={`px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                                inv.type === 'SUPPLIER_PAYABLE'
                                                    ? 'bg-amber-50 text-amber-800'
                                                    : 'bg-blue-50 text-blue-800'
                                            }`}
                                        >
                                            {inv.type === 'SUPPLIER_PAYABLE' ? 'Supplier Bill' : 'Customer Sales'}
                                        </span>
                                </td>

                                <td className="py-3 px-3 font-semibold text-slate-900 max-w-[200px] truncate">
                                    <p className="truncate">{inv.party}</p>
                                    <p className="text-[10px] text-slate-400">{inv.date}</p>
                                </td>

                                <td className="py-3 px-3">
                                    <div className="flex items-center gap-1.5">
                                        {inv.status === 'NEEDS_REVIEW' ? (
                                            <VyteDropdown
                                                variant="purple"
                                                size="sm"
                                                value={activeCategory}
                                                onChange={(val) =>
                                                    setSelectedCategories({ ...selectedCategories, [inv.id]: val })
                                                }
                                                options={categoryOptions}
                                                className="w-[240px]"
                                            />
                                        ) : (
                                            <span className="font-semibold text-purple-700">{inv.aiCategory}</span>
                                        )}
                                        <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0">
                                                {inv.aiConfidence}% AI
                                            </span>
                                    </div>
                                </td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                            <Check className="w-3 h-3" /> Ready
                                        </span>
                                </td>

                                <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                                    {currencySymbol}{' '}
                                    {inv.amountRM.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
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
                                        {inv.paid ? 'Paid ✓ (Toggle)' : 'Unpaid (Mark Paid)'}
                                    </button>
                                </td>

                                <td className="py-3 px-4 whitespace-nowrap">
                                    {inv.status === 'NEEDS_REVIEW' ? (
                                        <button
                                            type="button"
                                            onClick={() => onVerifyInvoice(inv.id, activeCategory)}
                                            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer"
                                        >
                                            {canApprove ? 'Confirm Category' : 'Owner / Manager Only'}
                                        </button>
                                    ) : (
                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified
                                            </span>
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