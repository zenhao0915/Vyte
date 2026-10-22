// src/modules/module1-restock/RestockModule.tsx
import React, { useState } from 'react';
import {
    Plus,
    Send,
    CheckCircle2,
    Clock,
    AlertTriangle,
    ShoppingBag,
    Lock,
    AlertCircle,
    Loader2,
} from 'lucide-react';
import type { Product, UserRole } from '../../types/vyte.ts';

interface RestockModuleProps {
    products: Product[];
    role: UserRole;
    onApproveAndContactSupplier: (
        productId: string,
        customReorderQty?: number
    ) => Promise<void> | void;
    onConfirmSupplierDelivery: (productId: string) => Promise<void> | void;
    onRecordStockUsage: (productId: string, usedQty: number) => void;
    onOpenAddModal: () => void;
}

const sanitizeBoundedInt = (raw: string, maxDigits = 5): string => {
    return raw.replace(/[^0-9]/g, '').replace(/^0+/, '').slice(0, maxDigits);
};

export const RestockModule: React.FC<RestockModuleProps> = ({
                                                                products,
                                                                role,
                                                                onApproveAndContactSupplier,
                                                                onConfirmSupplierDelivery,
                                                                onRecordStockUsage,
                                                                onOpenAddModal,
                                                            }) => {
    const [usageInputs, setUsageInputs] = useState<Record<string, string>>({});
    const [usageErrors, setUsageErrors] = useState<Record<string, string>>({});
    const [reorderInputs, setReorderInputs] = useState<Record<string, string>>({});
    const [reorderErrors, setReorderErrors] = useState<Record<string, string>>({});

    // Per-row button loading states (does not block the rest of the page)
    const [approvingIds, setApprovingIds] = useState<Record<string, boolean>>({});
    const [confirmingIds, setConfirmingIds] = useState<Record<string, boolean>>({});

    const handleDispatchUsage = (item: Product) => {
        if (item.stock <= 0) return;
        const rawStr = usageInputs[item.id] ?? '3';
        const qty = Number(rawStr);

        if (!rawStr || isNaN(qty) || qty < 1) {
            setUsageErrors((prev) => ({ ...prev, [item.id]: 'Enter at least 1.' }));
            return;
        }
        if (qty > item.stock) {
            setUsageErrors((prev) => ({
                ...prev,
                [item.id]: `Max available is ${item.stock} ${item.uom}.`,
            }));
            return;
        }

        setUsageErrors((prev) => ({ ...prev, [item.id]: '' }));
        onRecordStockUsage(item.id, qty);
    };

    const handleApprovePO = async (item: Product) => {
        const rawReorder = reorderInputs[item.id] ?? String(item.reorderQty);
        const qty = Number(rawReorder);
        const minMoq = item.moq ?? 5;

        if (!rawReorder || isNaN(qty) || qty < minMoq) {
            setReorderErrors((prev) => ({
                ...prev,
                [item.id]: `Min supplier order is ${minMoq} ${item.uom}.`,
            }));
            return;
        }
        if (qty > 10000) {
            setReorderErrors((prev) => ({
                ...prev,
                [item.id]: 'Max single PO limit is 10,000 units.',
            }));
            return;
        }

        setReorderErrors((prev) => ({ ...prev, [item.id]: '' }));
        setApprovingIds((prev) => ({ ...prev, [item.id]: true }));
        try {
            await onApproveAndContactSupplier(item.id, qty);
        } finally {
            setApprovingIds((prev) => ({ ...prev, [item.id]: false }));
        }
    };

    const handleConfirmDeliveryClick = async (item: Product) => {
        setConfirmingIds((prev) => ({ ...prev, [item.id]: true }));
        try {
            await onConfirmSupplierDelivery(item.id);
        } finally {
            setConfirmingIds((prev) => ({ ...prev, [item.id]: false }));
        }
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">
                            Universal Catalog &amp; Automated Supplier Restock
                        </h3>
                        <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 rounded-md border border-emerald-200">
                            5-Step Journey Live
                        </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Record custom sales/usage to test low-stock triggers &rarr; Approve PO (auto-creates Supplier Bill in Smart Invoices) &rarr; Confirm Delivery.
                    </p>
                </div>
                <button
                    onClick={onOpenAddModal}
                    className="px-3.5 py-1.5 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" /> Add New Product
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                        <th className="py-2.5 px-4">Product &amp; Industry Spec</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">SKU &amp; Profile</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Live Stock vs Min</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Record Sale / Usage</th>
                        <th className="py-2.5 px-3">Connected Supplier</th>
                        <th className="py-2.5 px-3 whitespace-nowrap">Unit Price</th>
                        <th className="py-2.5 px-4 w-72">Automated Supplier Restock (5-Step)</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                    {products.map((item) => {
                        const isLow = item.stock <= item.minThreshold;
                        const isOutOfStock = item.stock <= 0;
                        const currentUsageVal = usageInputs[item.id] ?? '3';
                        const currentReorderVal =
                            reorderInputs[item.id] ?? String(item.reorderQty);
                        const isApproving = Boolean(approvingIds[item.id]);
                        const isConfirming = Boolean(confirmingIds[item.id]);

                        return (
                            <tr key={item.id} className="hover:bg-slate-50/70 transition">
                                <td className="py-2.5 px-4 max-w-[210px]">
                                    <p
                                        className="font-bold text-slate-900 truncate"
                                        title={item.name}
                                    >
                                        {item.name}
                                    </p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                        {item.batchNo
                                            ? `Batch: ${item.batchNo} • Exp: ${item.expiryDate}`
                                            : item.variantSpec || item.category}
                                    </p>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                    <p className="font-mono text-[11px] font-bold text-slate-700">
                                        {item.sku}
                                    </p>
                                    <span className="inline-block mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                            {item.industry.replace(/_/g, ' ')}
                                        </span>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                    <div>
                                            <span
                                                className={`text-sm font-extrabold ${
                                                    isLow ? 'text-rose-600' : 'text-slate-900'
                                                }`}
                                            >
                                                {item.stock.toLocaleString()} {item.uom}
                                            </span>
                                        <span className="text-[11px] text-slate-400">
                                                {' '}
                                            / Min {item.minThreshold}
                                            </span>
                                    </div>
                                    {isOutOfStock ? (
                                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded font-bold">
                                                Out of Stock (0 Left)
                                            </span>
                                    ) : isLow ? (
                                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-rose-600 font-bold">
                                                <AlertTriangle className="w-3 h-3" /> Step 1: Low Stock Triggered
                                            </span>
                                    ) : null}
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap">
                                    {isOutOfStock ? (
                                        <span className="text-[11px] text-slate-400 italic">
                                                Restock required before sale
                                            </span>
                                    ) : (
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-1.5">
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={currentUsageVal}
                                                    onChange={(e) => {
                                                        const cleaned = sanitizeBoundedInt(
                                                            e.target.value,
                                                            4
                                                        );
                                                        setUsageInputs((prev) => ({
                                                            ...prev,
                                                            [item.id]: cleaned,
                                                        }));
                                                        setUsageErrors((prev) => ({
                                                            ...prev,
                                                            [item.id]: '',
                                                        }));
                                                    }}
                                                    placeholder="Qty"
                                                    className="w-14 px-2 py-1 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-emerald-500"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleDispatchUsage(item)}
                                                    className="px-2.5 py-1 bg-slate-900 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition cursor-pointer"
                                                >
                                                    <ShoppingBag className="w-3 h-3" /> Sell / Use
                                                </button>
                                            </div>
                                            {usageErrors[item.id] && (
                                                <p className="text-[10px] text-rose-600 font-semibold flex items-center gap-0.5">
                                                    <AlertCircle className="w-2.5 h-2.5" />{' '}
                                                    {usageErrors[item.id]}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </td>

                                <td className="py-2.5 px-3 max-w-[170px]">
                                    <p className="font-semibold text-slate-800 truncate">
                                        {item.supplierName}
                                    </p>
                                    <p className="text-[11px] text-slate-500 font-mono truncate">
                                        {item.supplierContact}
                                    </p>
                                </td>

                                <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-800">
                                    RM{' '}
                                    {item.priceRM.toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
                                </td>

                                <td className="py-2.5 px-4">
                                    {item.restockStatus === 'TRIGGERED_PENDING_APPROVAL' && (
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-semibold text-slate-500">
                                                        PO Qty:
                                                    </span>
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    value={currentReorderVal}
                                                    onChange={(e) => {
                                                        const cleaned = sanitizeBoundedInt(
                                                            e.target.value,
                                                            5
                                                        );
                                                        setReorderInputs((prev) => ({
                                                            ...prev,
                                                            [item.id]: cleaned,
                                                        }));
                                                        setReorderErrors((prev) => ({
                                                            ...prev,
                                                            [item.id]: '',
                                                        }));
                                                    }}
                                                    className="w-16 px-2 py-0.5 rounded bg-white border border-amber-300 text-xs font-extrabold text-slate-900 focus:outline-none"
                                                />
                                                <span className="text-[10px] text-slate-500">
                                                        {item.uom}
                                                    </span>
                                            </div>

                                            {reorderErrors[item.id] && (
                                                <p className="text-[10px] text-rose-600 font-semibold">
                                                    {reorderErrors[item.id]}
                                                </p>
                                            )}

                                            <button
                                                type="button"
                                                disabled={isApproving}
                                                onClick={() => void handleApprovePO(item)}
                                                className={`w-full px-3 py-1.5 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap disabled:opacity-60 ${
                                                    role === 'SME_OWNER' || role === 'MANAGER'
                                                        ? 'bg-amber-500 hover:bg-amber-600 text-white'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {role === 'SME_OWNER' || role === 'MANAGER' ? (
                                                    <>
                                                        {isApproving ? (
                                                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                                                        ) : (
                                                            <Send className="w-3 h-3 shrink-0" />
                                                        )}
                                                        {isApproving
                                                            ? 'Dispatching PO...'
                                                            : `Approve & Contact (+${
                                                                currentReorderVal || 0
                                                            } ${item.uom})`}
                                                    </>
                                                ) : (
                                                    <>
                                                        <Lock className="w-3 h-3 shrink-0" />
                                                        Locked: Owner Only
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}

                                    {item.restockStatus === 'SUPPLIER_CONTACTED' && (
                                        <div className="space-y-1.5">
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                                <Clock className="w-2.5 h-2.5" /> PO Sent • Bill Logged in Invoices
                                            </div>
                                            <button
                                                type="button"
                                                disabled={isConfirming}
                                                onClick={() =>
                                                    void handleConfirmDeliveryClick(item)
                                                }
                                                className="w-full px-3 py-1.5 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-60 text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                            >
                                                {isConfirming ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <CheckCircle2 className="w-3 h-3" />
                                                )}
                                                {isConfirming
                                                    ? 'Confirming...'
                                                    : `Confirm Delivery (+${item.reorderQty} ${item.uom})`}
                                            </button>
                                        </div>
                                    )}

                                    {item.restockStatus === 'CONFIRMED' && (
                                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 whitespace-nowrap">
                                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />{' '}
                                            Delivered &amp; Restocked
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