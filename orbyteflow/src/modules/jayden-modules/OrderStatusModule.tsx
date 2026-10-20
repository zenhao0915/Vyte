// src/modules/jayden-modules/OrderStatusModule.tsx
import React, { useState } from 'react';
import {
    Sparkles,
    Send,
    XCircle,
    PauseCircle,
    CheckCircle2,
    AlertOctagon,
    MessageSquare,
    ShieldAlert,
    Flame,
    FileCheck,
} from 'lucide-react';
import type {
    AutoOrderSuggestion,
    ExtractedNlpOrderItem,
    Product,
    UserRole,
} from '../../types/orbyte';
import { orbyteApi } from '../../services/api';

interface OrderStatusModuleProps {
    products: Product[];
    autoOrders: AutoOrderSuggestion[];
    role: UserRole;
    userID: string;
    onHumanDecisionAutoOrder: (
        suggestionId: string,
        decision: 'APPROVE_AND_CONTACT' | 'HOLD' | 'REJECT',
        customQty?: number
    ) => void;
    onDeductCustomerOrderStock: (items: ExtractedNlpOrderItem[], customerName: string, orderId: string) => void;
    onLogAction: (module: string, detail: string) => void;
}

interface PendingCustomerOrder {
    orderID: string;
    invoiceID: string;
    customerName: string;
    requestedDate: string;
    items: ExtractedNlpOrderItem[];
    subtotal: number;
    hasSufficientStock: boolean;
    status: 'PENDING_HUMAN_APPROVAL' | 'APPROVED' | 'REJECTED';
}

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products,
                                                                        autoOrders,
                                                                        role,
                                                                        userID,
                                                                        onHumanDecisionAutoOrder,
                                                                        onDeductCustomerOrderStock,
                                                                        onLogAction,
                                                                    }) => {
    const [editedQuantities, setEditedQuantities] = useState<Record<string, number>>({});
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);

    const [customerName, setCustomerName] = useState('Bangsar Artisan Cafe');
    const [rawOrderText, setRawOrderText] = useState(
        'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 5 boxes of Biodegradable Kraft Takeaway Box by tomorrow.'
    );
    const [customerOrders, setCustomerOrders] = useState<PendingCustomerOrder[]>([]);
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);

    // Human Intervention Handler for AI Auto-Order Supplier Dispatch
    const handleSupplierPermission = async (
        order: AutoOrderSuggestion,
        decision: 'APPROVE_AND_CONTACT' | 'HOLD' | 'REJECT'
    ) => {
        if (role !== 'SME_OWNER') {
            alert('Vyte RBAC Restriction: Only SME_OWNER can grant permission to contact suppliers or approve POs.');
            return;
        }

        const finalQty = editedQuantities[order.id] ?? order.suggestedOrderQty;

        if (decision === 'APPROVE_AND_CONTACT') {
            setDispatchingId(order.id);

            await orbyteApi.confirmRestock({
                poNumber: order.poNumber,
                productId: order.productID,
                SKU: order.sku,
                quantity: finalQty,
                unitPrice: order.unitPriceRM,
                currency: 'MYR',
                MOQ: order.moq,
                unitOfMeasure: order.uom,
                supplierName: order.supplierName,
                supplierPhoneNumber: order.supplierPhone,
                requestedDeliveryDate: '2026-10-23',
                deliveryLocation: 'Vyte Central Hub, Petaling Jaya',
                automationStatus: true,
                userID,
            });

            await orbyteApi.contactSupplier({
                poNumber: order.poNumber,
                supplierName: order.supplierName,
                supplierPhoneNumber: order.supplierPhone,
                channel: order.channel,
                messageBody: `[Vyte Auto-PO ${order.poNumber}] Hi ${order.supplierName}, human approval granted for ${finalQty} ${order.uom} of ${order.productName} (${order.sku}). Please confirm delivery.`,
                userID,
            });

            setDispatchingId(null);
        }

        onHumanDecisionAutoOrder(order.id, decision, finalQty);
    };

    // Parse NLP Customer Order -> Check Stock -> Generate Draft Order & Invoice
    const handleProcessNlpCustomerOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsProcessingNlp(true);

        const lower = rawOrderText.toLowerCase();
        const extracted: ExtractedNlpOrderItem[] = [];

        products.forEach((p) => {
            const keywords = p.name.toLowerCase().split(' ').filter((w) => w.length > 3);
            const matched = keywords.some((kw) => lower.includes(kw)) || lower.includes(p.sku.toLowerCase());
            if (matched) {
                const regex = new RegExp(`(\\d+)\\s*(?:${p.uom}|boxes|box|kg|pcs|units|liters|l)?[^.]*?${keywords[0]}`, 'i');
                const match = rawOrderText.match(regex) || rawOrderText.match(/(\d+)/);
                const qty = match ? Math.max(1, Number(match[1])) : 5;
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
            extracted.push({
                productID: first.id,
                SKU: first.sku,
                name: first.name,
                requestedQty: 5,
                availableStock: first.stock,
                isStockEnough: first.stock >= 5,
                sellingPrice: first.priceRM,
                lineTotal: Number((5 * first.priceRM).toFixed(2)),
            });
        }

        const subtotal = extracted.reduce((s, i) => s + i.lineTotal, 0);
        const hasSufficientStock = extracted.every((i) => i.isStockEnough);

        const nlpRes = await orbyteApi.processNlpOrder(
            {
                rawOrderText,
                customerName,
                requestedDate: '2026-10-22',
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

        const orderID = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

        const createRes = await orbyteApi.createInvoiceOrder({
            orderID,
            requestedDate: '2026-10-22',
            subtotal: nlpRes.data.calculatedSubtotal,
            currency: 'MYR',
            internalNotes: `NLP parsed order from ${customerName}`,
            createdBy: userID,
            lineOrders: nlpRes.data.extractedItems.map((item, idx) => ({
                lineID: `LINE-${idx + 1}`,
                productID: item.productID,
                quantity: item.requestedQty,
                lineTotal: item.lineTotal,
                currency: 'MYR',
            })),
        });

        const newOrder: PendingCustomerOrder = {
            orderID: createRes.data.orderID,
            invoiceID: createRes.data.invoiceID,
            customerName,
            requestedDate: '2026-10-22',
            items: nlpRes.data.extractedItems,
            subtotal: nlpRes.data.calculatedSubtotal,
            hasSufficientStock: nlpRes.data.hasSufficientStock,
            status: 'PENDING_HUMAN_APPROVAL',
        };

        setCustomerOrders((prev) => [newOrder, ...prev]);
        onLogAction(
            'Order Status (NLP)',
            `Parsed customer order ${newOrder.orderID} (${newOrder.items.length} line items, RM ${newOrder.subtotal.toFixed(2)}) — awaiting human approval.`
        );
        setIsProcessingNlp(false);
    };

    // Human Order Approval
    const handleApproveRejectCustomerOrder = async (
        order: PendingCustomerOrder,
        action: 'APPROVE' | 'REJECT'
    ) => {
        if (role !== 'SME_OWNER') {
            alert('Vyte RBAC Restriction: Only SME_OWNER can approve or reject customer orders.');
            return;
        }

        await orbyteApi.approveCustomerOrder({
            orderID: order.orderID,
            invoiceID: order.invoiceID,
            approvalAction: action,
            approvalNotes: `${action} by ${userID} via Vyte Order Status`,
            updatedBy: userID,
        });

        setCustomerOrders((prev) =>
            prev.map((o) =>
                o.orderID === order.orderID
                    ? { ...o, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' }
                    : o
            )
        );

        if (action === 'APPROVE') {
            onDeductCustomerOrderStock(order.items, order.customerName, order.orderID);
        } else {
            onLogAction('Order Status', `Rejected customer order ${order.orderID} (${order.customerName}).`);
        }
    };

    const awaitingCount = autoOrders.filter((o) => o.humanStatus === 'AWAITING_HUMAN_PERMISSION').length;

    return (
        <div className="space-y-6">
            {/* Top Status Banner */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
                            Vyte AI Depletion Engine Active
                        </span>
                        <span className="text-xs text-slate-400 font-semibold">
                            Human-in-the-Loop Gatekeeper • {awaitingCount} Awaiting Permission
                        </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">
                        AI Automatic Supplier Ordering &amp; Depletion Monitor
                    </h3>
                    <p className="text-xs text-slate-500">
                        Calculates real-time stock depletion velocity (sales/day) &amp; drafts supplier purchase orders.
                        No supplier is contacted until you grant explicit permission below.
                    </p>
                </div>
            </div>

            {/* PART 1: AI DEPLETION-BASED AUTOMATIC SUPPLIER ORDER QUEUE */}
            <div className="grid grid-cols-1 gap-4">
                {autoOrders.map((order) => {
                    const currentQty = editedQuantities[order.id] ?? order.suggestedOrderQty;
                    const totalCostRM = currentQty * order.unitPriceRM;
                    const stockRatioPct = Math.min(
                        100,
                        Math.round((order.currentStock / Math.max(1, order.minThreshold * 2)) * 100)
                    );

                    return (
                        <div
                            key={order.id}
                            className={`bg-white rounded-2xl border p-6 shadow-sm transition ${
                                order.humanStatus === 'AWAITING_HUMAN_PERMISSION'
                                    ? 'border-amber-300/90'
                                    : order.humanStatus === 'APPROVED_SENT_TO_SUPPLIER'
                                        ? 'border-emerald-300/90 bg-emerald-50/20'
                                        : 'border-slate-200 opacity-75'
                            }`}
                        >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="space-y-3 flex-1">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        <span
                                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold flex items-center gap-1 ${
                                                order.urgency === 'CRITICAL'
                                                    ? 'bg-rose-100 text-rose-700'
                                                    : 'bg-amber-100 text-amber-800'
                                            }`}
                                        >
                                            <Flame className="w-3.5 h-3.5" /> {order.urgency} DEPLETION
                                        </span>
                                        <span className="text-xs font-mono font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                            {order.poNumber}
                                        </span>
                                        <span className="text-xs font-mono text-slate-500">SKU: {order.sku}</span>
                                        <span className="text-xs text-slate-500">• Supplier: {order.supplierName}</span>
                                    </div>

                                    <div>
                                        <h4 className="text-base font-bold text-slate-900">{order.productName}</h4>
                                        <p className="text-xs text-slate-600 mt-1 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                                            <strong className="text-purple-700 inline-flex items-center gap-1">
                                                <Sparkles className="w-3.5 h-3.5" /> Vyte AI Depletion Diagnosis:
                                            </strong>{' '}
                                            {order.aiReasoning}
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                            <span className="text-[11px] text-slate-400 block">Current Stock vs Min</span>
                                            <span className="text-sm font-extrabold text-rose-600">
                                                {order.currentStock} {order.uom}
                                            </span>
                                            <span className="text-xs text-slate-400"> / {order.minThreshold} min</span>
                                            <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
                                                <div
                                                    className="bg-rose-500 h-full rounded-full"
                                                    style={{ width: `${stockRatioPct}%` }}
                                                />
                                            </div>
                                        </div>

                                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                            <span className="text-[11px] text-slate-400 block">Depletion Rate (Sales)</span>
                                            <span className="text-sm font-extrabold text-slate-900">
                                                {order.dailyDepletionRate} {order.uom}/day
                                            </span>
                                            <span className="text-[11px] text-emerald-600 block mt-0.5">Live Sales Velocity</span>
                                        </div>

                                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                            <span className="text-[11px] text-slate-400 block">Est. Stockout In</span>
                                            <span className="text-sm font-extrabold text-amber-600">
                                                {order.daysUntilStockout.toFixed(1)} Days
                                            </span>
                                            <span className="text-[11px] text-slate-400 block mt-0.5">
                                                Supplier Lead: {order.leadTimeDays}d
                                            </span>
                                        </div>

                                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                            <span className="text-[11px] text-slate-400 block">Supplier Channel</span>
                                            <span className="text-xs font-bold text-slate-800 block truncate">
                                                {order.supplierPhone}
                                            </span>
                                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                                {order.channel}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Human Intervention Control Panel */}
                                <div className="lg:w-80 bg-slate-50 p-4 rounded-2xl border border-slate-200/90 flex flex-col justify-between space-y-4 shrink-0">
                                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                                        <div>
                                            <span className="text-[11px] font-bold uppercase text-slate-400 block">
                                                AI Suggested Order Qty
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <input
                                                    type="number"
                                                    min={order.moq}
                                                    disabled={order.humanStatus !== 'AWAITING_HUMAN_PERMISSION'}
                                                    value={currentQty}
                                                    onChange={(e) =>
                                                        setEditedQuantities({
                                                            ...editedQuantities,
                                                            [order.id]: Number(e.target.value),
                                                        })
                                                    }
                                                    className="w-20 px-2.5 py-1 rounded-lg bg-white border border-slate-300 font-extrabold text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
                                                />
                                                <span className="text-xs font-semibold text-slate-600">
                                                    {order.uom} (MOQ: {order.moq})
                                                </span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-[11px] text-slate-400 block">Est. PO Total</span>
                                            <span className="text-base font-extrabold text-slate-900">
                                                RM {totalCostRM.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {order.humanStatus === 'AWAITING_HUMAN_PERMISSION' ? (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-800 bg-amber-100/80 px-2.5 py-1 rounded-lg">
                                                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                                                Waiting for Human Permission to Contact Supplier
                                            </div>

                                            <button
                                                onClick={() => handleSupplierPermission(order, 'APPROVE_AND_CONTACT')}
                                                disabled={dispatchingId === order.id}
                                                className="w-full py-2.5 px-4 bg-[#2BB656] hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                                            >
                                                <Send className="w-3.5 h-3.5" />
                                                {dispatchingId === order.id
                                                    ? 'Contacting Supplier...'
                                                    : 'Approve & Contact Supplier'}
                                            </button>

                                            <div className="grid grid-cols-2 gap-2">
                                                <button
                                                    onClick={() => handleSupplierPermission(order, 'HOLD')}
                                                    className="py-1.5 px-3 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                                                >
                                                    <PauseCircle className="w-3.5 h-3.5 text-amber-600" /> Hold Order
                                                </button>
                                                <button
                                                    onClick={() => handleSupplierPermission(order, 'REJECT')}
                                                    className="py-1.5 px-3 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer"
                                                >
                                                    <XCircle className="w-3.5 h-3.5" /> Do Not Order
                                                </button>
                                            </div>
                                        </div>
                                    ) : order.humanStatus === 'APPROVED_SENT_TO_SUPPLIER' ? (
                                        <div className="p-3 rounded-xl bg-emerald-100/90 border border-emerald-300 text-emerald-900 text-xs space-y-1">
                                            <div className="font-bold flex items-center gap-1.5">
                                                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Permission Granted &amp; Sent
                                            </div>
                                            <p className="text-[11px] text-emerald-800">
                                                Dispatched PO for {currentQty} {order.uom} to {order.supplierName} via {order.channel}. Stock updated.
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="p-3 rounded-xl bg-slate-200/70 text-slate-700 text-xs font-semibold flex items-center justify-between">
                                            <span className="flex items-center gap-1.5">
                                                <AlertOctagon className="w-4 h-4 text-slate-500" />
                                                Status: {order.humanStatus.replace(/_/g, ' ')}
                                            </span>
                                            <button
                                                onClick={() => handleSupplierPermission(order, 'APPROVE_AND_CONTACT')}
                                                className="text-emerald-600 underline text-[11px] cursor-pointer"
                                            >
                                                Re-open &amp; Approve
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* PART 2: NLP CUSTOMER ORDER INTAKE & STOCK VERIFICATION */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
                <div className="border-b border-slate-100 pb-4">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-600" /> NLP Customer Order Intake &amp; Stock Verification
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Automatically extracts products and quantities from incoming customer messages, verifies live inventory availability, and drafts invoices for human approval.
                    </p>
                </div>

                <form onSubmit={handleProcessNlpCustomerOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Customer / Counterparty</label>
                        <input
                            type="text"
                            required
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-semibold text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div className="lg:col-span-6 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                            Incoming Customer Message (Natural Language)
                        </label>
                        <input
                            type="text"
                            required
                            value={rawOrderText}
                            onChange={(e) => setRawOrderText(e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                    <div className="lg:col-span-3 flex items-end">
                        <button
                            type="submit"
                            disabled={isProcessingNlp}
                            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isProcessingNlp ? 'Parsing Order...' : 'Analyze Order & Check Stock'}
                        </button>
                    </div>
                </form>

                {customerOrders.length > 0 && (
                    <div className="space-y-3 pt-2">
                        {customerOrders.map((co) => (
                            <div
                                key={co.orderID}
                                className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4"
                            >
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2.5">
                                        <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                                            {co.orderID}
                                        </span>
                                        <span className="font-mono text-xs text-slate-500">Invoice: {co.invoiceID}</span>
                                        <span className="text-xs font-bold text-slate-900">• {co.customerName}</span>
                                        <span
                                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                                                co.hasSufficientStock
                                                    ? 'bg-emerald-100 text-emerald-800'
                                                    : 'bg-rose-100 text-rose-700'
                                            }`}
                                        >
                                            {co.hasSufficientStock ? '✓ Stock Sufficient' : '⚠ Low Stock Impact'}
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap gap-2">
                                        {co.items.map((item) => (
                                            <span
                                                key={item.SKU}
                                                className="text-xs bg-white px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700"
                                            >
                                                <strong>{item.name}</strong>: Req {item.requestedQty} (Avail: {item.availableStock}) • RM{' '}
                                                {item.lineTotal.toFixed(2)}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right mr-2">
                                        <span className="text-[11px] text-slate-400 block">Order Subtotal</span>
                                        <span className="text-sm font-extrabold text-slate-900">
                                            RM {co.subtotal.toFixed(2)}
                                        </span>
                                    </div>

                                    {co.status === 'PENDING_HUMAN_APPROVAL' ? (
                                        <>
                                            <button
                                                onClick={() => handleApproveRejectCustomerOrder(co, 'APPROVE')}
                                                className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                                            >
                                                <FileCheck className="w-3.5 h-3.5" /> Approve Order
                                            </button>
                                            <button
                                                onClick={() => handleApproveRejectCustomerOrder(co, 'REJECT')}
                                                className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer"
                                            >
                                                Reject
                                            </button>
                                        </>
                                    ) : (
                                        <span
                                            className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                                                co.status === 'APPROVED'
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-rose-100 text-rose-700'
                                            }`}
                                        >
                                            {co.status}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};