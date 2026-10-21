// src/modules/module1-restock/RestockModule.tsx
import React from 'react';
import { Plus, Send, CheckCircle2, Clock, AlertTriangle, ArrowDown, Lock } from 'lucide-react';
import type { Product, UserRole } from '../../types/orbyte';

interface RestockModuleProps {
    products: Product[];
    role: UserRole;
    onApproveAndContactSupplier: (productId: string) => void;
    onConfirmSupplierDelivery: (productId: string) => void;
    onSimulateStockDrop: (productId: string) => void;
    onOpenAddModal: () => void;
}

export const RestockModule: React.FC<RestockModuleProps> = ({
                                                                products,
                                                                role,
                                                                onApproveAndContactSupplier,
                                                                onConfirmSupplierDelivery,
                                                                onSimulateStockDrop,
                                                                onOpenAddModal,
                                                            }) => {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Compact Header */}
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">Universal Catalog &amp; Automated Restock Engine</h3>
                        <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
              5-Step Journey Live
            </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        1. Threshold Trigger &rarr; 2. Connected Stock &amp; Supplier Data &rarr; 3. AI PO Draft &rarr; 4. Owner Approval &rarr; 5. Confirmed &amp; Logged
                    </p>
                </div>
                <button
                    onClick={onOpenAddModal}
                    className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" /> Add New Product
                </button>
            </div>

            {/* Responsive 6-Column Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                        <th className="py-2.5 px-4">Product &amp; Industry Spec</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">SKU &amp; Profile</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Stock vs Min (Trigger)</th>
                        <th className="py-2.5 px-3">Connected Supplier</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Unit Price</th>
                        <th className="py-2.5 px-4 w-64">Decision &amp; Human Approval</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {products.map((item) => {
                        const isLow = item.stock <= item.minThreshold;

                        return (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition">
                                {/* Col 1: Product & Spec */}
                                <td className="py-2.5 px-4 max-w-[220px]">
                                    <p className="font-bold text-slate-900 truncate" title={item.name}>
                                        {item.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                        {item.batchNo
                                            ? `Batch: ${item.batchNo} • Exp: ${item.expiryDate}`
                                            : item.variantSpec || item.category}
                                    </p>
                                </td>

                                {/* Col 2: SKU + Industry Badge combined */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                    <p className="font-mono text-[11px] font-bold text-slate-700">{item.sku}</p>
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                      {item.industry.replace(/_/g, ' ')}
                    </span>
                                </td>

                                {/* Col 3: Stock vs Min + Embedded Demo Trigger Button */}
                                <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                        <div>
                        <span className={`text-sm font-extrabold ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                          {item.stock} {item.uom}
                        </span>
                                            <span className="text-[11px] text-slate-400"> / Min {item.minThreshold}</span>
                                        </div>
                                        <button
                                            onClick={() => onSimulateStockDrop(item.id)}
                                            title="Simulate -5 unit sales to trigger low-stock automation"
                                            className="px-2 py-0.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 rounded text-[10px] font-semibold inline-flex items-center gap-0.5 transition cursor-pointer"
                                        >
                                            <ArrowDown className="w-2.5 h-2.5" /> -5
                                        </button>
                                    </div>
                                    {isLow && (
                                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-rose-600 font-bold">
                        <AlertTriangle className="w-3 h-3" /> Step 1: Triggered
                      </span>
                                    )}
                                </td>

                                {/* Col 4: Supplier & Contact */}
                                <td className="py-2.5 px-3 max-w-[180px]">
                                    <p className="font-semibold text-slate-800 truncate">{item.supplierName}</p>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">{item.supplierContact}</p>
                                </td>

                                {/* Col 5: Price (No wrapping) */}
                                <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-800">
                                    RM {item.priceRM.toFixed(2)}
                                </td>

                                {/* Col 6: 5-Step Action & RBAC Gate */}
                                <td className="py-2.5 px-4">
                                    {item.restockStatus === 'TRIGGERED_PENDING_APPROVAL' && (
                                        <div className="space-y-1">
                                            <button
                                                onClick={() => onApproveAndContactSupplier(item.id)}
                                                className={`w-full px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap ${
                                                    role === 'SME_OWNER'
                                                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                                        : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                                                }`}
                                            >
                                                {role === 'SME_OWNER' ? (
                                                    <>
                                                        <Send className="w-3 h-3 shrink-0" />
                                                        Approve &amp; Contact (+{item.reorderQty} {item.uom})
                                                    </>
                                                ) : (
                                                    <>
                                                        <Lock className="w-3 h-3 shrink-0" />
                                                        Locked: Owner Approval Needed
                                                    </>
                                                )}
                                            </button>
                                            <p
                                                className="text-[10px] text-slate-500 truncate max-w-[230px]"
                                                title={`AI Draft: Hi ${item.supplierName}, dispatch PO for ${item.reorderQty} ${item.uom}`}
                                            >
                                                AI Draft: &quot;Hi {item.supplierName}, PO for {item.reorderQty} {item.uom}...&quot;
                                            </p>
                                        </div>
                                    )}

                                    {item.restockStatus === 'SUPPLIER_CONTACTED' && (
                                        <div className="space-y-1">
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                <Clock className="w-2.5 h-2.5" /> Supplier Contacted
                                            </div>
                                            <button
                                                onClick={() => onConfirmSupplierDelivery(item.id)}
                                                className="w-full px-3 py-1 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 shadow-xs transition cursor-pointer whitespace-nowrap"
                                            >
                                                <CheckCircle2 className="w-3 h-3" /> Confirm Delivery (+{item.reorderQty} {item.uom})
                                            </button>
                                        </div>
                                    )}

                                    {item.restockStatus === 'CONFIRMED' && (
                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Restocked &amp; Logged
                      </span>
                                    )}

                                    {item.restockStatus === 'HEALTHY' && (
                                        <span className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap">
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