// src/modules/module5-invoice/InvoiceModule.tsx
import React from 'react';
import { Plus } from 'lucide-react';
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
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">
                        Supplier & Customer Invoice Repository (AI Auto-Categorized)
                    </h3>
                    <p className="text-xs text-slate-500">
                        Stores incoming supplier bills and customer invoices, automatically classifying accounting categories for
                        human review.
                    </p>
                </div>
                <button
                    onClick={onSimulateUploadInvoice}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                    <Plus className="w-4 h-4" /> Simulate Upload & AI Categorize Invoice
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                        <th className="py-3.5 px-4">Invoice No.</th>
                        <th className="py-3.5 px-4">Type</th>
                        <th className="py-3.5 px-4">Counterparty (Supplier / Customer)</th>
                        <th className="py-3.5 px-4">AI Assigned Category & Confidence</th>
                        <th className="py-3.5 px-4">Date</th>
                        <th className="py-3.5 px-4">Amount</th>
                        <th className="py-3.5 px-4">Paid</th>
                        <th className="py-3.5 px-4">Human Verification</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                    {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/80">
                            <td className="py-4 px-4 font-mono text-xs font-semibold">{inv.invNo}</td>
                            <td className="py-4 px-4">
                  <span
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold ${
                          inv.type === 'SUPPLIER_PAYABLE' ? 'bg-amber-50 text-amber-800' : 'bg-blue-50 text-blue-800'
                      }`}
                  >
                    {inv.type === 'SUPPLIER_PAYABLE' ? 'Supplier Invoice' : 'Customer Invoice'}
                  </span>
                            </td>
                            <td className="py-4 px-4 font-medium text-slate-900">{inv.party}</td>
                            <td className="py-4 px-4">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-purple-700 text-xs">{inv.aiCategory}</span>
                                    <span className="bg-purple-100 text-purple-800 text-[10px] px-1.5 py-0.5 rounded font-bold">
                      {inv.aiConfidence}% AI
                    </span>
                                </div>
                            </td>
                            <td className="py-4 px-4 text-xs text-slate-500">{inv.date}</td>
                            <td className="py-4 px-4 font-bold text-slate-800">RM {inv.amountRM.toFixed(2)}</td>
                            <td className="py-4 px-4">
                                {inv.paid ? (
                                    <span className="text-emerald-600 font-bold">✓</span>
                                ) : (
                                    <span className="text-slate-400">—</span>
                                )}
                            </td>
                            <td className="py-4 px-4">
                                {inv.status === 'NEEDS_REVIEW' ? (
                                    <button
                                        onClick={() => onVerifyInvoice(inv.id)}
                                        className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-full text-xs font-bold transition"
                                    >
                                        Verify Category
                                    </button>
                                ) : (
                                    <span className="px-3.5 py-1.5 bg-emerald-500 text-white rounded-full text-xs font-semibold">
                      Verified
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