// src/modules/module1-restock/RestockModule.tsx
import React from 'react';
import { Plus, Send, CheckCircle2 } from 'lucide-react';
import type { Product } from '../../types/orbyte';

interface RestockModuleProps {
    products: Product[];
    onApproveRestock: (productId: string) => void;
    onOpenAddModal: () => void;
}

export const RestockModule: React.FC<RestockModuleProps> = ({
                                                                products,
                                                                onApproveRestock,
                                                                onOpenAddModal,
                                                            }) => {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-bold text-slate-900">All Product List & Automated Restock Monitor</h3>
                    <p className="text-xs text-slate-500">
                        When stock drops below minimum threshold, AI drafts supplier order & waits for human approval.
                    </p>
                </div>
                <button
                    onClick={onOpenAddModal}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                    <Plus className="w-4 h-4" /> Add New Product
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                        <th className="py-3.5 px-4">Product Item & Industry Spec</th>
                        <th className="py-3.5 px-4">SKU</th>
                        <th className="py-3.5 px-4">Industry Profile</th>
                        <th className="py-3.5 px-4">Stock vs Threshold</th>
                        <th className="py-3.5 px-4">Supplier Contact</th>
                        <th className="py-3.5 px-4">Unit Price</th>
                        <th className="py-3.5 px-4">Automated Restock Action (5-Step)</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                    {products.map((item) => {
                        const isLow = item.stock <= item.minThreshold;
                        return (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition">
                                <td className="py-4 px-4">
                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {item.batchNo
                                            ? `Batch: ${item.batchNo} • Exp: ${item.expiryDate}`
                                            : item.variantSpec || item.category}
                                    </p>
                                </td>
                                <td className="py-4 px-4 font-mono text-xs text-slate-600">{item.sku}</td>
                                <td className="py-4 px-4">
                    <span className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700">
                      {item.industry.replace(/_/g, ' ')}
                    </span>
                                </td>
                                <td className="py-4 px-4">
                                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                        {item.stock} {item.uom}
                      </span>
                                        <span className="text-xs text-slate-400">/ Min {item.minThreshold}</span>
                                    </div>
                                    {isLow && (
                                        <span className="inline-block mt-1 text-[11px] text-rose-600 font-semibold">
                        ⚠ Triggered: Below Threshold
                      </span>
                                    )}
                                </td>
                                <td className="py-4 px-4">
                                    <p className="text-xs font-semibold text-slate-800">{item.supplierName}</p>
                                    <p className="text-[11px] text-slate-500">{item.supplierContact}</p>
                                </td>
                                <td className="py-4 px-4 font-semibold text-slate-800">RM {item.priceRM.toFixed(2)}</td>
                                <td className="py-4 px-4">
                                    {item.restockStatus === 'TRIGGERED_PENDING_APPROVAL' && (
                                        <div className="space-y-1.5">
                                            <button
                                                onClick={() => onApproveRestock(item.id)}
                                                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                                            >
                                                <Send className="w-3.5 h-3.5" /> Approve & Contact Supplier (+{item.reorderQty} {item.uom})
                                            </button>
                                            <p className="text-[11px] text-slate-500">
                                                AI Draft: "Hi {item.supplierName}, confirm PO for {item.reorderQty} {item.uom}..."
                                            </p>
                                        </div>
                                    )}
                                    {item.restockStatus === 'CONFIRMED' && (
                                        <span className="px-3.5 py-1.5 bg-emerald-600 text-white rounded-full text-xs font-semibold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Supplier Confirmed & Restocked
                      </span>
                                    )}
                                    {item.restockStatus === 'HEALTHY' && (
                                        <span className="px-3.5 py-1.5 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                        Healthy Stock
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