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
    AlertCircle,
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

const sanitizeIntegerInput = (raw: string): string => {
    return raw.replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, '');
};

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products,
                                                                        autoOrders,
                                                                        role,
                                                                        userID,
                                                                        onHumanDecisionAutoOrder,
                                                                        onDeductCustomerOrderStock,
                                                                        onLogAction,
                                                                    }) => {
    // Store edited quantities as strings so backspacing doesn't trap a leading '0'
    const [editedQuantities, setEditedQuantities] = useState<Record<string, string>>({});
    const [qtyErrors, setQtyErrors] = useState<Record<string, string>>({});
    const [dispatchingId, setDispatchingId] = useState<string | null>(null);

    const [customerName, setCustomerName] = useState('Bangsar Artisan Cafe');
    const [rawOrderText, setRawOrderText] = useState(
        'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 5 boxes of Biodegradable Kraft Takeaway Box by tomorrow.'
    );
    const [nlpErrors, setNlpErrors] = useState<{ customerName?: string; rawOrderText?: string }>({});
    const [customerOrders, setCustomerOrders] = useState<PendingCustomerOrder[]>([]);
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);

    const handleQtyChange = (order: AutoOrderSuggestion, rawVal: string) => {
        const cleaned = sanitizeIntegerInput(rawVal);
        setEditedQuantities((prev) => ({ ...prev, [order.id]: cleaned }));

        if (cleaned === '') {
            setQtyErrors((prev) => ({ ...prev, [order.id]: 'Order quantity is required.' }));
        } else if (Number(cleaned) < order.moq) {
            setQtyErrors((prev) => ({
                ...prev,
                [order.id]: `Quantity must meet supplier MOQ (${order.moq} ${order.uom}).`,
            }));
        } else {
            setQtyErrors((prev) => ({ ...prev, [order.id]: '' }));
        }
    };

    // Human Intervention Handler for AI Auto-Order Supplier Dispatch
    const handleSupplierPermission = async (
        order: AutoOrderSuggestion,
        decision: 'APPROVE_AND_CONTACT' | 'HOLD' | 'REJECT'
    ) => {
        if (role !== 'SME_OWNER') {
            alert('Vyte RBAC Restriction: Only SME_OWNER can grant permission to contact suppliers or approve POs.');
            return;
        }

        const rawQtyStr = editedQuantities[order.id] ?? String(order.suggestedOrderQty);
        const finalQty = Number(rawQtyStr);

        if (decision === 'APPROVE_AND_CONTACT') {
            if (!rawQtyStr || isNaN(finalQty) || finalQty < order.moq) {
                setQtyErrors((prev) => ({
                    ...prev,
                    [order.id]: `Cannot approve: minimum order quantity is ${order.moq} ${order.uom}.`,
                }));
                return;
            }

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

    // Parse NLP Customer Order -> Validate Input -> Check Stock -> Generate Draft Order
    const handleProcessNlpCustomerOrder = async (e: React.FormEvent) => {
        e.preventDefault();

        const newNlpErrors: { customerName?: string; rawOrderText?: string } = {};
        if (!customerName.trim() || customerName.trim().length < 2) {
            newNlpErrors.customerName = 'Customer name is required (min 2 chars).';
        }
        if (!rawOrderText.trim() || rawOrderText.trim().length < 10) {
            newNlpErrors.rawOrderText = 'Please enter a valid customer order message (min 10 chars).';
        } else if (!/\d+/.test(rawOrderText)) {
            newNlpErrors.rawOrderText = 'Order message must include a numeric quantity (e.g., "6 kg" or "5 boxes").';
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
            const fallbackMatch = rawOrderText.match(/(\d+)/);
            const fallbackQty = fallbackMatch ? Math.max(1, Number(fallbackMatch[1])) : 5;
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

        const newOrder: PendingCustomerOrder = {
            orderID: createRes.data.orderID,
            invoiceID: createRes.data.invoiceID,
            customerName: customerName.trim(),
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
        <div className="space-y-5">
            {/* Top Status Banner */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800">
              Vyte AI Depletion Engine Active
            </span>
                        <span className="text-xs text-slate-400 font-semibold">
              Human-in-the-Loop Gatekeeper • {awaitingCount} Awaiting Permission
            </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900">
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
                    const currentQtyStr = editedQuantities[order.id] ?? String(order.suggestedOrderQty);
                    const numericQty = currentQtyStr === '' ? 0 : Number(currentQtyStr);
                    const totalCostRM = numericQty * order.unitPriceRM;
                    const stockRatioPct = Math.min(
                        100,
                        Math.round((order.currentStock / Math.max(1, order.minThreshold * 2)) * 100)
                    );

                    return (
                        <div
                            key={order.id}
                            className={`bg-white rounded-2xl border p-5 shadow-xs transition ${
                                order.humanStatus === 'AWAITING_HUMAN_PERMISSION'
                                    ? 'border-amber-300/90'
                                    : order.humanStatus === 'APPROVED_SENT_TO_SUPPLIER'
                                        ? 'border-emerald-300/90 bg-emerald-50/20'
                                        : 'border-slate-200 opacity-75'
                            }`}
                        >
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
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
                                <div className="lg:w-80 bg-slate-50 p-4 rounded-2xl border border-slate-200/90 flex flex-col justify-between space-y-3 shrink-0">
                                    <div>
                                        <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                                            <div>
                        <span className="text-[11px] font-bold uppercase text-slate-400 block">
                          AI Suggested Order Qty
                        </span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        placeholder={String(order.moq)}
                                                        disabled={order.humanStatus !== 'AWAITING_HUMAN_PERMISSION'}
                                                        value={currentQtyStr}
                                                        onChange={(e) => handleQtyChange(order, e.target.value)}
                                                        className={`w-20 px-2.5 py-1 rounded-lg bg-white border font-extrabold text-sm text-slate-900 focus:outline-none ${
                                                            qtyErrors[order.id]
                                                                ? 'border-rose-500 focus:border-rose-500'
                                                                : 'border-slate-300 focus:border-emerald-500'
                                                        }`}
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
                                        {qtyErrors[order.id] && (
                                            <p className="text-[11px] text-rose-600 font-semibold mt-1.5 flex items-center gap-1">
                                                <AlertCircle className="w-3 h-3 shrink-0" /> {qtyErrors[order.id]}
                                            </p>
                                        )}
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
                                                className="w-full py-2 px-4 bg-[#2BB656] hover:bg-emerald-600 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
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
                                                Dispatched PO for {numericQty} {order.uom} to {order.supplierName} via {order.channel}. Stock updated.
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
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="border-b border-slate-100 pb-3">
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-600" /> NLP Customer Order Intake &amp; Stock Verification
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                        Automatically extracts products and quantities from incoming customer messages, verifies live inventory availability, and drafts invoices for human approval.
                    </p>
                </div>

                <form onSubmit={handleProcessNlpCustomerOrder} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">Customer / Counterparty *</label>
                        <input
                            type="text"
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
                            Incoming Customer Message (Natural Language) *
                        </label>
                        <input
                            type="text"
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
                                                className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
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