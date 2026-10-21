// src/modules/jayden-modules/OrderStatusModule.tsx
import React, { useState, useEffect } from 'react';
import {
    Sparkles,
    CheckCircle2,
    MessageSquare,
    FileCheck,
    AlertCircle,
    Truck,
    Package,
    XCircle,
    AlertTriangle,
    ArrowUpRight,
} from 'lucide-react';
import type { ExtractedNlpOrderItem, Product, UserRole } from '../../types/orbyte';
import { orbyteApi } from '../../services/api';

interface OrderStatusModuleProps {
    products: Product[];
    role: UserRole;
    userID: string;
    onApproveCustomerOrder: (
        items: ExtractedNlpOrderItem[],
        customerName: string,
        orderId: string,
        invoiceId: string
    ) => void;
    onPendingCountChange: (count: number) => void;
    onLogAction: (module: string, detail: string) => void;
    onNavigateToRestock?: () => void;
}

interface CustomerOrderRecord {
    orderID: string;
    invoiceID: string;
    customerName: string;
    requestedDate: string;
    rawMessage: string;
    items: ExtractedNlpOrderItem[];
    subtotal: number;
    status: 'PENDING_HUMAN_APPROVAL' | 'APPROVED_AWAITING_DELIVERY' | 'DELIVERED_COMPLETED' | 'REJECTED';
}

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products,
                                                                        role,
                                                                        userID,
                                                                        onApproveCustomerOrder,
                                                                        onPendingCountChange,
                                                                        onLogAction,
                                                                        onNavigateToRestock,
                                                                    }) => {
    const [customerName, setCustomerName] = useState('Bangsar Artisan Cafe');
    const [rawOrderText, setRawOrderText] = useState(
        'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box by tomorrow.'
    );
    const [nlpErrors, setNlpErrors] = useState<{ customerName?: string; rawOrderText?: string }>({});
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);

    const [customerOrders, setCustomerOrders] = useState<CustomerOrderRecord[]>([
        {
            orderID: 'ORD-2026-4810',
            invoiceID: 'CUST-2026-4810',
            customerName: 'Mont Kiara Roastery & Bakery',
            requestedDate: '21 Oct 2026',
            rawMessage: 'Need 4 kg of Artisan Arabica Coffee Beans urgent delivery.',
            items: [
                {
                    productID: 'P1',
                    SKU: 'FNB-4886',
                    name: 'Artisan Arabica Coffee Beans',
                    requestedQty: 4,
                    availableStock: products[0]?.stock ?? 8,
                    isStockEnough: (products[0]?.stock ?? 8) >= 4,
                    sellingPrice: 68.0,
                    lineTotal: 272.0,
                },
            ],
            subtotal: 272.0,
            status: 'PENDING_HUMAN_APPROVAL',
        },
    ]);

    useEffect(() => {
        const pending = customerOrders.filter(
            (o) => o.status === 'PENDING_HUMAN_APPROVAL' || o.status === 'APPROVED_AWAITING_DELIVERY'
        ).length;
        onPendingCountChange(pending);
    }, [customerOrders, onPendingCountChange]);

    const applyPresetMessage = (presetCustomer: string, presetText: string) => {
        setCustomerName(presetCustomer);
        setRawOrderText(presetText);
        setNlpErrors({});
    };

    // Step 1-3: Parse NLP Customer Order -> Check Live Stock from Module 1
    const handleProcessNlpCustomerOrder = async (e: React.FormEvent) => {
        e.preventDefault();

        const newNlpErrors: { customerName?: string; rawOrderText?: string } = {};
        if (!customerName.trim() || customerName.trim().length < 3) {
            newNlpErrors.customerName = 'Customer business name is required (min 3 chars).';
        }
        if (!rawOrderText.trim() || rawOrderText.trim().length < 10) {
            newNlpErrors.rawOrderText = 'Please enter a complete customer order message (min 10 chars).';
        } else if (!/\d+/.test(rawOrderText)) {
            newNlpErrors.rawOrderText = 'Order message must include numeric quantities (e.g., "6 kg").';
        }

        if (newNlpErrors.customerName || newNlpErrors.rawOrderText) {
            setNlpErrors(newNlpErrors);
            return;
        }

        setNlpErrors({});
        setIsProcessingNlp(true);

        const lower = rawOrderText.toLowerCase();
        const extracted: ExtractedNlpOrderItem[] = [];

        products.forEach((p) => {
            const keywords = p.name
                .toLowerCase()
                .split(' ')
                .filter((w) => w.length > 3);
            const matched = keywords.some((kw) => lower.includes(kw)) || lower.includes(p.sku.toLowerCase());
            if (matched) {
                const regex = new RegExp(
                    `(\\d+)\\s*(?:${p.uom}|boxes|box|kg|pcs|units|liters|l)?[^.]*?${keywords[0]}`,
                    'i'
                );
                const match = rawOrderText.match(regex) || rawOrderText.match(/(\d+)/);
                const qty = match ? Math.min(9999, Math.max(1, Number(match[1]))) : 5;
                extracted.push({
                    productID: p.id,
                    SKU: p.sku,
                    name: p.name,
                    requestedQty: qty,
                    availableStock: p.stock,
                    isStockEnough: p.stock >= qty,
                    sellingPrice: p.priceRM,
                    lineTotal: Number((qty * p.priceRM).toFixed(2)),
                });
            }
        });

        if (extracted.length === 0 && products.length > 0) {
            const first = products[0];
            const fallbackMatch = rawOrderText.match(/(\d+)/);
            const fallbackQty = fallbackMatch ? Math.min(9999, Math.max(1, Number(fallbackMatch[1]))) : 5;
            extracted.push({
                productID: first.id,
                SKU: first.sku,
                name: first.name,
                requestedQty: fallbackQty,
                availableStock: first.stock,
                isStockEnough: first.stock >= fallbackQty,
                sellingPrice: first.priceRM,
                lineTotal: Number((fallbackQty * first.priceRM).toFixed(2)),
            });
        }

        const subtotal = extracted.reduce((s, i) => s + i.lineTotal, 0);
        const hasSufficientStock = extracted.every((i) => i.isStockEnough);

        const nlpRes = await orbyteApi.processNlpOrder(
            {
                rawOrderText: rawOrderText.trim(),
                customerName: customerName.trim(),
                requestedDate: '21 Oct 2026',
                userID,
            },
            {
                parseSuccess: true,
                hasSufficientStock,
                extractedItems: extracted,
                calculatedSubtotal: subtotal,
                currency: 'MYR',
            }
        );

        const orderNum = Math.floor(1000 + Math.random() * 9000);
        const orderID = `ORD-2026-${orderNum}`;
        const invoiceID = `CUST-2026-${orderNum}`;

        await orbyteApi.createInvoiceOrder({
            orderID,
            requestedDate: '21 Oct 2026',
            subtotal: nlpRes.data.calculatedSubtotal,
            currency: 'MYR',
            internalNotes: `NLP parsed order from ${customerName.trim()}`,
            createdBy: userID,
            lineOrders: nlpRes.data.extractedItems.map((item, idx) => ({
                lineID: `LINE-${idx + 1}`,
                productID: item.productID,
                quantity: item.requestedQty,
                lineTotal: item.lineTotal,
                currency: 'MYR',
            })),
        });

        const newOrder: CustomerOrderRecord = {
            orderID,
            invoiceID,
            customerName: customerName.trim(),
            requestedDate: '21 Oct 2026',
            rawMessage: rawOrderText.trim(),
            items: nlpRes.data.extractedItems,
            subtotal: nlpRes.data.calculatedSubtotal,
            status: 'PENDING_HUMAN_APPROVAL',
        };

        setCustomerOrders((prev) => [newOrder, ...prev]);
        onLogAction(
            'Mod 3: NLP Order Parsed',
            `Extracted ${newOrder.items.length} SKU(s) for ${newOrder.customerName} (${newOrder.orderID} • RM ${newOrder.subtotal.toFixed(2)}) — ${
                hasSufficientStock ? 'Stock Sufficient, awaiting approval.' : 'Blocked: Insufficient Stock.'
            }`
        );
        setIsProcessingNlp(false);
    };

    // Step 4: Owner Approves or Rejects Customer Order (BLOCKS APPROVAL IF STOCK IS INSUFFICIENT)
    const handleApproveRejectOrder = async (
        order: CustomerOrderRecord,
        action: 'APPROVE' | 'REJECT',
        allEnoughLive: boolean
    ) => {
        if (role !== 'SME_OWNER') {
            alert('Vyte RBAC Restriction: Only SME_OWNER can approve or reject customer orders.');
            return;
        }

        if (action === 'APPROVE' && !allEnoughLive) {
            alert(
                'Insufficient Inventory: Cannot approve customer order because warehouse stock is lower than requested quantity. Please restock in Module 1 first.'
            );
            return;
        }

        await orbyteApi.approveCustomerOrder({
            orderID: order.orderID,
            invoiceID: order.invoiceID,
            approvalAction: action,
            approvalNotes: `${action} by ${userID}`,
            updatedBy: userID,
        });

        if (action === 'APPROVE') {
            setCustomerOrders((prev) =>
                prev.map((o) =>
                    o.orderID === order.orderID ? { ...o, status: 'APPROVED_AWAITING_DELIVERY' } : o
                )
            );
            onApproveCustomerOrder(order.items, order.customerName, order.orderID, order.invoiceID);
        } else {
            setCustomerOrders((prev) =>
                prev.map((o) => (o.orderID === order.orderID ? { ...o, status: 'REJECTED' } : o))
            );
            onLogAction('Mod 3: Order Rejected', `Rejected customer order ${order.orderID} (${order.customerName}).`);
        }
    };

    // Step 5: Confirm Customer Order Dispatched / Delivered
    const handleConfirmCustomerDelivery = (order: CustomerOrderRecord) => {
        setCustomerOrders((prev) =>
            prev.map((o) =>
                o.orderID === order.orderID ? { ...o, status: 'DELIVERED_COMPLETED' } : o
            )
        );
        onLogAction(
            'Mod 3: Order Delivered',
            `Confirmed customer delivery for ${order.orderID} to ${order.customerName} (Invoice ${order.invoiceID}).`
        );
    };

    return (
        <div className="space-y-5">
            {/* NLP Customer Order Parser Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-600" /> B2B Customer Order Intake (NLP Parser &amp; Live Stock Verification)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            1. Customer Message Trigger &rarr; 2. Live Catalog Stock Check &rarr; 3. NLP Line-Item Extraction &rarr; 4. Owner Approval (Auto-Invoices in Mod 5) &rarr; 5. Confirm Delivery
                        </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-semibold">Sample Messages:</span>
                        <button
                            type="button"
                            onClick={() =>
                                applyPresetMessage(
                                    'Bangsar Artisan Cafe',
                                    'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box.'
                                )
                            }
                            className="px-2 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-md font-semibold cursor-pointer"
                        >
                            Cafe Order
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                applyPresetMessage(
                                    'Subang Retail Hub',
                                    'Hello, we would like to order 5 pcs of 4-Tier Modular Steel Shelving for our new outlet.'
                                )
                            }
                            className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md font-semibold cursor-pointer"
                        >
                            Retail Shelving
                        </button>
                    </div>
                </div>

                <form onSubmit={handleProcessNlpCustomerOrder} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">Customer Business Name *</label>
                        <input
                            type="text"
                            maxLength={60}
                            placeholder="e.g., Bangsar Artisan Cafe"
                            value={customerName}
                            onChange={(e) => {
                                setCustomerName(e.target.value);
                                if (nlpErrors.customerName) setNlpErrors({ ...nlpErrors, customerName: undefined });
                            }}
                            className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-semibold text-slate-900 focus:outline-none ${
                                nlpErrors.customerName ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'
                            }`}
                        />
                        {nlpErrors.customerName && (
                            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.customerName}
                            </p>
                        )}
                    </div>

                    <div className="lg:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">
                            Incoming WhatsApp / Email Customer Order Message *
                        </label>
                        <input
                            type="text"
                            maxLength={240}
                            placeholder="e.g., Please send 6 kg of Artisan Arabica Coffee Beans..."
                            value={rawOrderText}
                            onChange={(e) => {
                                setRawOrderText(e.target.value);
                                if (nlpErrors.rawOrderText) setNlpErrors({ ...nlpErrors, rawOrderText: undefined });
                            }}
                            className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs text-slate-900 focus:outline-none ${
                                nlpErrors.rawOrderText ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'
                            }`}
                        />
                        {nlpErrors.rawOrderText && (
                            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.rawOrderText}
                            </p>
                        )}
                    </div>

                    <div className="lg:col-span-3 flex items-start pt-5">
                        <button
                            type="submit"
                            disabled={isProcessingNlp}
                            className="w-full py-2 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isProcessingNlp ? 'Parsing Order...' : 'Analyze Order & Check Stock'}
                        </button>
                    </div>
                </form>
            </div>

            {/* Customer Order Fulfillment Queue */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-600" /> Active Customer Orders &amp; Fulfillment Pipeline ({customerOrders.length})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                            Orders with insufficient stock are automatically blocked from approval until restocked in Module 1.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {customerOrders.map((co) => {
                        const isPendingApproval = co.status === 'PENDING_HUMAN_APPROVAL';

                        // Read live warehouse stock from `products`
                        const liveItems = co.items.map((item) => {
                            const liveProd = products.find((p) => p.id === item.productID || p.sku === item.SKU);
                            const currentWarehouseStock = liveProd ? liveProd.stock : item.availableStock;
                            const uom = liveProd?.uom ?? 'units';
                            const shortageQty = Math.max(0, item.requestedQty - currentWarehouseStock);

                            return {
                                ...item,
                                uom,
                                availableStock: currentWarehouseStock,
                                shortageQty,
                                isStockEnough: isPendingApproval ? currentWarehouseStock >= item.requestedQty : true,
                            };
                        });

                        const allEnoughLive = liveItems.every((i) => i.isStockEnough);

                        return (
                            <div
                                key={co.orderID}
                                className={`rounded-2xl border overflow-hidden transition ${
                                    co.status === 'PENDING_HUMAN_APPROVAL'
                                        ? allEnoughLive
                                            ? 'bg-white border-slate-200'
                                            : 'bg-rose-50/20 border-rose-200'
                                        : co.status === 'APPROVED_AWAITING_DELIVERY'
                                            ? 'bg-blue-50/15 border-blue-200'
                                            : co.status === 'DELIVERED_COMPLETED'
                                                ? 'bg-emerald-50/15 border-emerald-200'
                                                : 'bg-slate-50 border-slate-200 opacity-70'
                                }`}
                            >
                                {/* Card Top Header Bar */}
                                <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2.5">
                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">
                      {co.orderID}
                    </span>
                                        <span className="font-mono text-xs text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                      Invoice: {co.invoiceID}
                    </span>
                                        <span className="text-sm font-bold text-slate-900">{co.customerName}</span>
                                        <span className="text-xs text-slate-400">• {co.requestedDate}</span>

                                        {isPendingApproval && (
                                            <span
                                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                                    allEnoughLive
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-rose-100 text-rose-700'
                                                }`}
                                            >
                        {allEnoughLive ? (
                            <>
                                <CheckCircle2 className="w-3 h-3" /> Stock Sufficient (Ready to Approve)
                            </>
                        ) : (
                            <>
                                <AlertTriangle className="w-3 h-3" /> Insufficient Stock — Restock Required
                            </>
                        )}
                      </span>
                                        )}
                                    </div>

                                    {/* Right Actions & Total */}
                                    <div className="flex flex-wrap items-center gap-3">
                                        <div className="text-right mr-1">
                                            <span className="text-[10px] uppercase font-bold text-slate-400 block">Order Total</span>
                                            <span className="text-base font-extrabold text-slate-900 whitespace-nowrap">
                        RM {co.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                                        </div>

                                        {co.status === 'PENDING_HUMAN_APPROVAL' && (
                                            <div className="flex items-center gap-2">
                                                {allEnoughLive ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleApproveRejectOrder(co, 'APPROVE', allEnoughLive)}
                                                        className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                    >
                                                        <FileCheck className="w-3.5 h-3.5" /> Approve &amp; Generate Invoice
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-1.5">
                                                        <button
                                                            type="button"
                                                            disabled
                                                            title="Cannot sell to customer while stock is insufficient"
                                                            className="px-3 py-2 bg-slate-200 text-slate-500 rounded-xl text-xs font-bold flex items-center gap-1 cursor-not-allowed whitespace-nowrap"
                                                        >
                                                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Blocked: Low Stock
                                                        </button>
                                                        {onNavigateToRestock && (
                                                            <button
                                                                type="button"
                                                                onClick={onNavigateToRestock}
                                                                className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                            >
                                                                Restock in Mod 1 <ArrowUpRight className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}

                                                <button
                                                    type="button"
                                                    onClick={() => handleApproveRejectOrder(co, 'REJECT', allEnoughLive)}
                                                    className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" /> Reject
                                                </button>
                                            </div>
                                        )}

                                        {co.status === 'APPROVED_AWAITING_DELIVERY' && (
                                            <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-[11px] font-bold">
                          ✓ Invoiced in Mod 5
                        </span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleConfirmCustomerDelivery(co)}
                                                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                >
                                                    <Truck className="w-3.5 h-3.5" /> Confirm Customer Delivery
                                                </button>
                                            </div>
                                        )}

                                        {co.status === 'DELIVERED_COMPLETED' && (
                                            <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Delivered &amp; Completed
                      </span>
                                        )}

                                        {co.status === 'REJECTED' && (
                                            <span className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold">
                        Rejected
                      </span>
                                        )}
                                    </div>
                                </div>

                                {/* Card Body: Customer Message + Clean 5-Column Line-Item Table */}
                                <div className="p-4 space-y-3">
                                    <p className="text-xs text-slate-500 italic">
                                        Customer Message: &ldquo;{co.rawMessage}&rdquo;
                                    </p>

                                    <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
                                        <table className="w-full text-left border-collapse text-xs">
                                            <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                                <th className="py-2 px-3.5">Product Item &amp; SKU</th>
                                                <th className="py-2 px-3.5">Customer Requested</th>
                                                <th className="py-2 px-3.5">
                                                    {isPendingApproval ? 'Live Warehouse Stock' : 'Stock Allocation Status'}
                                                </th>
                                                <th className="py-2 px-3.5">Unit Price</th>
                                                <th className="py-2 px-3.5 text-right">Line Subtotal</th>
                                            </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                            {liveItems.map((item) => (
                                                <tr key={item.SKU} className="hover:bg-slate-50/60">
                                                    <td className="py-2.5 px-3.5">
                                                        <span className="font-bold text-slate-900">{item.name}</span>
                                                        <span className="ml-2 font-mono text-[11px] text-slate-400">({item.SKU})</span>
                                                    </td>

                                                    <td className="py-2.5 px-3.5 font-extrabold text-slate-900">
                                                        {item.requestedQty} {item.uom}
                                                    </td>

                                                    <td className="py-2.5 px-3.5">
                                                        {isPendingApproval ? (
                                                            item.isStockEnough ? (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">
                                    ✓ {item.availableStock} {item.uom} Available
                                  </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[11px]">
                                    ⚠ Only {item.availableStock} {item.uom} Left (Short by {item.shortageQty} {item.uom})
                                  </span>
                                                            )
                                                        ) : co.status === 'REJECTED' ? (
                                                            <span className="text-slate-400 font-semibold">Order Cancelled</span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">
                                  ✓ {item.requestedQty} {item.uom} Reserved &amp; Deducted (Rem: {item.availableStock} {item.uom})
                                </span>
                                                        )}
                                                    </td>

                                                    <td className="py-2.5 px-3.5 text-slate-600 font-medium">
                                                        RM {item.sellingPrice.toFixed(2)} / {item.uom}
                                                    </td>

                                                    <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">
                                                        RM {item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};