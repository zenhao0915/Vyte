// src/modules/module5-invoice/InvoiceModule.tsx
import React, { useState } from 'react';
import { Plus, CheckCircle2, FileText, Check } from 'lucide-react';
import type { InvoiceItem } from '../../types/orbyte';

interface InvoiceModuleProps {
    invoices: InvoiceItem[];
    onVerifyInvoice: (invId: string) => void;
    onSimulateUploadInvoice: () => void;
}

export const InvoiceModule: React.FC<InvoiceModuleProps> = ({
                                                                invoices,
                                                                onVerifyInvoice,
                                                                onSimulateUploadInvoice,
                                                            }) => {
    const [directionFilter, setDirectionFilter] = useState<'ALL' | 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'>('ALL');
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'VERIFIED'>('ALL');

    const filtered = invoices.filter((inv) => {
        const matchDir = directionFilter === 'ALL' || inv.type === directionFilter;
        const matchStat = statusFilter === 'ALL' || inv.status === statusFilter;
        return matchDir && matchStat;
    });

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
            <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                        <FileText className="w-5 h-5 text-emerald-600" /> Supplier &amp; Customer Invoice Repository
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Stores payable &amp; receivable invoices with automated AI accounting classification and Malaysia E-Invoicing validation.
                    </p>
                </div>
                <button
                    onClick={onSimulateUploadInvoice}
                    className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                >
                    <Plus className="w-4 h-4" /> Simulate Upload &amp; AI Parse Invoice
                </button>
            </div>

            {/* Filter Tabs for Payables vs Receivables */}
            <div className="px-6 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                    <button
                        onClick={() => setDirectionFilter('ALL')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                        }`}
                    >
                        All ({invoices.length})
                    </button>
                    <button
                        onClick={() => setDirectionFilter('SUPPLIER_PAYABLE')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'SUPPLIER_PAYABLE' ? 'bg-amber-100 text-amber-900 font-bold' : 'text-slate-600'
                        }`}
                    >
                        Supplier Bills (Payables)
                    </button>
                    <button
                        onClick={() => setDirectionFilter('CUSTOMER_RECEIVABLE')}
                        className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                            directionFilter === 'CUSTOMER_RECEIVABLE' ? 'bg-blue-100 text-blue-900 font-bold' : 'text-slate-600'
                        }`}
                    >
                        Customer Invoices (Receivables)
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <button
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

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                        <th className="py-3.5 px-4">Invoice Number</th>
                        <th className="py-3.5 px-4">Direction</th>
                        <th className="py-3.5 px-4">Counterparty Name</th>
                        <th className="py-3.5 px-4">AI Categorization &amp; Confidence</th>
                        <th className="py-3.5 px-4">E-Invoice Status</th>
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 px-4">Total (MYR)</th>
                        <th className="py-3.5 px-4">Payment</th>
                        <th className="py-3.5 px-4">Human Verification</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                    {filtered.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-4 px-4 font-mono text-xs font-bold text-slate-800">{inv.invNo}</td>
                            <td className="py-4 px-4">
                                    <span
                                        className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                                            inv.type === 'SUPPLIER_PAYABLE'
                                                ? 'bg-amber-50 text-amber-800'
                                                : 'bg-blue-50 text-blue-800'
                                        }`}
                                    >
                                        {inv.type === 'SUPPLIER_PAYABLE' ? 'Supplier Bill' : 'Customer Sales'}
                                    </span>
                            </td>
                            <td className="py-4 px-4 font-semibold text-slate-900">{inv.party}</td>
                            <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-purple-700 text-xs">{inv.aiCategory}</span>
                                    <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                                            {inv.aiConfidence}% AI
                                        </span>
                                </div>
                            </td>
                            <td className="py-4 px-4">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                        <Check className="w-3 h-3" /> E-Invoice Ready
                                    </span>
                            </td>
                            <td className="py-4 px-4 text-xs text-slate-500">{inv.date}</td>
                            <td className="py-4 px-4 font-bold text-slate-900">RM {inv.amountRM.toFixed(2)}</td>
                            <td className="py-4 px-4">
                                {inv.paid ? (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">
                                            Paid
                                        </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">
                                            Unpaid
                                        </span>
                                )}
                            </td>
                            <td className="py-4 px-4">
                                {inv.status === 'NEEDS_REVIEW' ? (
                                    <button
                                        onClick={() => onVerifyInvoice(inv.id)}
                                        className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-xl text-xs font-bold transition cursor-pointer"
                                    >
                                        Confirm Category
                                    </button>
                                ) : (
                                    <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold inline-flex items-center gap-1">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Verified
                                        </span>
                                )}
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};