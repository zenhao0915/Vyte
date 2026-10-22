// src/modules/module2-order/OrderStatusModule.tsx
import React, { useState, useEffect, useMemo } from 'react';
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
    Edit3,
    FileText,
    ExternalLink,
    Plus,
    Trash2,
    Eye,
    X,
    Calendar,
} from 'lucide-react';
import type { CurrencyCode, ExtractedNlpOrderItem, Product, UserRole } from '../../types/vyte.ts';
import { CURRENCY_SYMBOLS } from '../../types/vyte.ts';
import { orbyteApi } from '../../services/api';
import { VyteDropdown } from '../../components/common/VyteDropdown';


interface OrderStatusModuleProps {
    products: Product[];
    role: UserRole;
    userID: string;
    currency?: CurrencyCode;
    onApproveCustomerOrder: (
        items: ExtractedNlpOrderItem[],
        customerName: string,
        orderId: string,
        invoiceId: string,
        inventoryDeducted?: boolean
    ) => void;
    onPendingCountChange: (count: number) => void;
    onLogAction: (module: string, detail: string) => void;
    onNavigateToRestock?: () => void;
    onNotify?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

type OrderFulfillmentStatus =
    | 'PENDING_HUMAN_APPROVAL'
    | 'MODIFIED'
    | 'APPROVED_AWAITING_DELIVERY'
    | 'DELIVERED_COMPLETED'
    | 'REJECTED';

interface CustomerOrderRecord {
    orderID: string;
    invoiceID: string;
    invoicePdfUrl: string;
    customerName: string;
    requestedDate: string; // ISO YYYY-MM-DD
    rawMessage: string;
    internalNotes?: string;
    approvalNotes?: string;
    inventoryDeducted?: boolean;
    createdAt?: string;
    updatedAt?: string;
    items: ExtractedNlpOrderItem[];
    subtotal: number;
    status: OrderFulfillmentStatus;
}

interface ParsedOrderDraft {
    customerName: string;
    requestedDate: string;
    rawMessage: string;
    internalNotes: string;
    items: ExtractedNlpOrderItem[];
    currency: string;
}

interface ConfirmDialogState {
    order: CustomerOrderRecord;
    action: 'APPROVE' | 'REJECT' | 'MODIFY';
    allEnoughLive: boolean;
}

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products,
                                                                        role,
                                                                        userID,
                                                                        currency = 'MYR',
                                                                        onApproveCustomerOrder,
                                                                        onPendingCountChange,
                                                                        onLogAction,
                                                                        onNavigateToRestock,
                                                                        onNotify,
                                                                        onTriggerLoadingScreen,
                                                                    }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const todayIso = new Date().toISOString().slice(0, 10);

    const [customerName, setCustomerName] = useState('Bangsar Artisan Cafe');
    const [requestedDate, setRequestedDate] = useState<string>(todayIso);
    const [rawOrderText, setRawOrderText] = useState(
        'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box by tomorrow.'
    );
    const [nlpErrors, setNlpErrors] = useState<{
        customerName?: string;
        requestedDate?: string;
        rawOrderText?: string;
    }>({});
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

    // Parse-failure & Draft Review/Edit states
    const [parseFailureMessage, setParseFailureMessage] = useState<string | null>(null);
    const [parsedDraft, setParsedDraft] = useState<ParsedOrderDraft | null>(null);
    const [addSkuId, setAddSkuId] = useState<string>(products[0]?.id || '');

    // Per-order approval notes, inline modify editor, status filter, detail modal, confirm modal, and local toast
    const [orderNotesMap, setOrderNotesMap] = useState<Record<string, string>>({});
    const [modifyingOrderId, setModifyingOrderId] = useState<string | null>(null);
    const [modifiedQuantities, setModifiedQuantities] = useState<Record<string, number>>({});
    const [statusFilter, setStatusFilter] = useState<'ALL' | OrderFulfillmentStatus>('ALL');
    const [selectedDetailOrder, setSelectedDetailOrder] = useState<CustomerOrderRecord | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
    const [localToast, setLocalToast] = useState<{
        type: 'success' | 'error' | 'warning' | 'info';
        message: string;
    } | null>(null);

    const notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => {
        if (onNotify) {
            onNotify(type, message);
        } else {
            setLocalToast({ type, message });
            setTimeout(() => setLocalToast(null), 4000);
        }
    };

    const [customerOrders, setCustomerOrders] = useState<CustomerOrderRecord[]>([
        {
            orderID: 'ORD-2026-4810',
            invoiceID: 'CUST-2026-4810',
            invoicePdfUrl: '/invoices/ORD-2026-4810.pdf',
            customerName: 'Mont Kiara Roastery & Bakery',
            requestedDate: '2026-10-21',
            rawMessage: 'Need 4 kg of Artisan Arabica Coffee Beans urgent delivery.',
            internalNotes: 'Priority morning dispatch slot.',
            createdAt: '2026-10-21T09:15:00.000Z',
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
            (o) =>
                o.status === 'PENDING_HUMAN_APPROVAL' ||
                o.status === 'MODIFIED' ||
                o.status === 'APPROVED_AWAITING_DELIVERY'
        ).length;
        onPendingCountChange(pending);
    }, [customerOrders, onPendingCountChange]);

    const applyPresetMessage = (presetCustomer: string, presetText: string) => {
        setCustomerName(presetCustomer);
        setRawOrderText(presetText);
        setNlpErrors({});
        setParseFailureMessage(null);
    };

    // Step 1: Parse NLP Customer Order -> Produces either Parse-Failure State or Review/Edit Draft
    const handleProcessNlpCustomerOrder = async (e: React.FormEvent) => {
        e.preventDefault();

        const newNlpErrors: { customerName?: string; requestedDate?: string; rawOrderText?: string } = {};
        if (!customerName.trim() || customerName.trim().length < 3) {
            newNlpErrors.customerName = 'Customer business name is required (min 3 chars).';
        }
        if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
            newNlpErrors.requestedDate = 'Select a valid ISO delivery date (YYYY-MM-DD).';
        }
        if (!rawOrderText.trim() || rawOrderText.trim().length < 10) {
            newNlpErrors.rawOrderText = 'Please enter a complete customer order message (min 10 chars).';
        } else if (!/\d+/.test(rawOrderText)) {
            newNlpErrors.rawOrderText = 'Order message must include numeric quantities (e.g., "6 kg").';
        }

        if (newNlpErrors.customerName || newNlpErrors.requestedDate || newNlpErrors.rawOrderText) {
            setNlpErrors(newNlpErrors);
            return;
        }

        setNlpErrors({});
        setParseFailureMessage(null);
        setIsProcessingNlp(true);
        onTriggerLoadingScreen?.('Analyzing Customer Order via NLP & Checking Live Stock...', 950);

        try {
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

            // Do NOT default to products[0] if no SKU matched!
            const parseSuccess = extracted.length > 0;
            const subtotal = extracted.reduce((s, i) => s + i.lineTotal, 0);
            const hasSufficientStock = parseSuccess && extracted.every((i) => i.isStockEnough);

            const nlpRes = await orbyteApi.processNlpOrder(
                {
                    rawOrderText: rawOrderText.trim(),
                    customerName: customerName.trim(),
                    requestedDate,
                    userID,
                },
                {
                    parseSuccess,
                    hasSufficientStock,
                    extractedItems: extracted,
                    calculatedSubtotal: subtotal,
                    currency,
                }
            );

            if (!nlpRes.data.parseSuccess || nlpRes.data.extractedItems.length === 0) {
                setParsedDraft(null);
                setParseFailureMessage(
                    `Could not match any catalog products in "${rawOrderText.trim()}". Mention an active SKU or product name (e.g., ${products
                        .slice(0, 3)
                        .map((p) => `${p.name} [${p.sku}]`)
                        .join(', ')}) or build a manual draft below.`
                );
                onLogAction(
                    'Mod 3: NLP Parse Failed',
                    `No catalog SKUs matched incoming message from ${customerName.trim()}.`
                );
                notify('warning', 'NLP Parser could not match any catalog products in the message.');
                return;
            }

            // Open the Review/Edit step before creating the order
            setParsedDraft({
                customerName: customerName.trim(),
                requestedDate,
                rawMessage: rawOrderText.trim(),
                internalNotes: `NLP parsed order from ${customerName.trim()}`,
                items: nlpRes.data.extractedItems,
                currency: nlpRes.data.currency || currency,
            });

            notify(
                'info',
                `Extracted ${nlpRes.data.extractedItems.length} SKU(s). Please review or edit before creating the order.`
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unexpected NLP parsing error.';
            notify('error', msg);
        } finally {
            setIsProcessingNlp(false);
        }
    };

    // Draft Review/Edit helpers
    const handleUpdateDraftQty = (productID: string, newQty: number) => {
        if (!parsedDraft) return;
        const safeQty = Math.max(1, Math.min(9999, Math.round(newQty) || 1));
        setParsedDraft({
            ...parsedDraft,
            items: parsedDraft.items.map((item) => {
                if (item.productID !== productID) return item;
                const liveProd = products.find((p) => p.id === productID);
                const avail = liveProd ? liveProd.stock : item.availableStock;
                return {
                    ...item,
                    requestedQty: safeQty,
                    availableStock: avail,
                    isStockEnough: avail >= safeQty,
                    lineTotal: Number((safeQty * item.sellingPrice).toFixed(2)),
                };
            }),
        });
    };

    const handleRemoveDraftItem = (productID: string) => {
        if (!parsedDraft) return;
        setParsedDraft({
            ...parsedDraft,
            items: parsedDraft.items.filter((i) => i.productID !== productID),
        });
    };

    const handleAddDraftItem = () => {
        if (!parsedDraft || !addSkuId) return;
        const prod = products.find((p) => p.id === addSkuId);
        if (!prod) return;

        const existing = parsedDraft.items.find((i) => i.productID === prod.id);
        if (existing) {
            handleUpdateDraftQty(prod.id, existing.requestedQty + 1);
            return;
        }

        const newItem: ExtractedNlpOrderItem = {
            productID: prod.id,
            SKU: prod.sku,
            name: prod.name,
            requestedQty: 1,
            availableStock: prod.stock,
            isStockEnough: prod.stock >= 1,
            sellingPrice: prod.priceRM,
            lineTotal: prod.priceRM,
        };

        setParsedDraft({
            ...parsedDraft,
            items: [...parsedDraft.items, newItem],
        });
    };

    // Step 2: Confirm Review/Edit Draft & Create Order via API (using API-returned IDs & PDF URL)
    const handleConfirmCreateOrder = async () => {
        if (!parsedDraft || parsedDraft.items.length === 0) {
            notify('warning', 'Order draft must contain at least one line item.');
            return;
        }

        setIsCreatingOrder(true);
        try {
            const draftSubtotal = Number(
                parsedDraft.items.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2)
            );
            const candidateOrderId = `ORD-${parsedDraft.requestedDate.slice(0, 4)}-${Math.floor(
                1000 + Math.random() * 9000
            )}`;

            onTriggerLoadingScreen?.('Generating Order & PDF Invoice...', 950);

            const createRes = await orbyteApi.createInvoiceOrder({
                orderID: candidateOrderId,
                requestedDate: parsedDraft.requestedDate,
                subtotal: draftSubtotal,
                currency: parsedDraft.currency,
                internalNotes: parsedDraft.internalNotes,
                createdBy: userID,
                lineOrders: parsedDraft.items.map((item, idx) => ({
                    lineID: `LINE-${idx + 1}`,
                    productID: item.productID,
                    quantity: item.requestedQty,
                    lineTotal: item.lineTotal,
                    currency: parsedDraft.currency,
                })),
            });

            // Use orderID, invoiceID, and invoicePdfUrl returned by the API
            const createdOrder: CustomerOrderRecord = {
                orderID: createRes.data.orderID,
                invoiceID: createRes.data.invoiceID,
                invoicePdfUrl: createRes.data.invoicePdfUrl,
                customerName: parsedDraft.customerName,
                requestedDate: parsedDraft.requestedDate,
                rawMessage: parsedDraft.rawMessage,
                internalNotes: parsedDraft.internalNotes,
                createdAt: createRes.data.createdAt,
                items: parsedDraft.items,
                subtotal: draftSubtotal,
                status:
                    (createRes.data.status as OrderFulfillmentStatus) || 'PENDING_HUMAN_APPROVAL',
            };

            const hasSufficientStock = createdOrder.items.every((i) => i.isStockEnough);

            setCustomerOrders((prev) => [createdOrder, ...prev]);
            setParsedDraft(null);

            onLogAction(
                'Mod 3: Order Created',
                `Created order ${createdOrder.orderID} (Invoice ${createdOrder.invoiceID} • PDF: ${createdOrder.invoicePdfUrl}) for ${createdOrder.customerName} (${currencySymbol} ${createdOrder.subtotal.toFixed(2)}) — ${
                    hasSufficientStock ? 'Stock Sufficient, awaiting approval.' : 'Blocked: Insufficient Stock.'
                }`
            );
            notify(
                'success',
                `Created Order ${createdOrder.orderID} and generated Invoice ${createdOrder.invoiceID}.`
            );
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to create customer order.';
            notify('error', msg);
        } finally {
            setIsCreatingOrder(false);
        }
    };

    // Step 3: Request confirmation before Approve / Reject / Modify
    const requestOrderAction = (
        order: CustomerOrderRecord,
        action: 'APPROVE' | 'REJECT' | 'MODIFY',
        allEnoughLive: boolean
    ) => {
        if (role !== 'SME_OWNER' && role !== 'MANAGER') {
            notify(
                'error',
                'Vyte RBAC Restriction: Only Owner or Manager accounts can approve, modify, or reject customer orders.'
            );
            return;
        }

        if (action === 'APPROVE' && !allEnoughLive) {
            notify(
                'error',
                'Insufficient Inventory: Cannot approve order while warehouse stock is lower than requested quantity. Please restock in Module 1 first.'
            );
            return;
        }

        setConfirmDialog({ order, action, allEnoughLive });
    };

    // Step 4: Execute Approve / Reject / Modify with try/catch and inventoryDeducted handling
    const executeConfirmedOrderAction = async () => {
        if (!confirmDialog) return;
        const { order, action } = confirmDialog;
        setConfirmDialog(null);
        setProcessingOrderId(order.orderID);
        onTriggerLoadingScreen?.(`Applying ${action} Status to ${order.orderID}...`, 900);

        try {
            const rawNotes = (orderNotesMap[order.orderID] || '').trim();
            const approvalNotes = rawNotes || `${action} by ${userID}`;

            // Apply any modified line quantities if action === 'MODIFY'
            const updatedItems =
                action === 'MODIFY'
                    ? order.items.map((item) => {
                        const key = `${order.orderID}:${item.productID}`;
                        const modQty = modifiedQuantities[key] ?? item.requestedQty;
                        const liveProd = products.find((p) => p.id === item.productID);
                        const avail = liveProd ? liveProd.stock : item.availableStock;
                        return {
                            ...item,
                            requestedQty: modQty,
                            availableStock: avail,
                            isStockEnough: avail >= modQty,
                            lineTotal: Number((modQty * item.sellingPrice).toFixed(2)),
                        };
                    })
                    : order.items;

            const updatedSubtotal = Number(
                updatedItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2)
            );

            const res = await orbyteApi.approveCustomerOrder({
                orderID: order.orderID,
                invoiceID: order.invoiceID,
                approvalAction: action,
                approvalNotes,
                updatedBy: userID,
            });

            if (action === 'APPROVE') {
                setCustomerOrders((prev) =>
                    prev.map((o) =>
                        o.orderID === order.orderID
                            ? {
                                ...o,
                                status: 'APPROVED_AWAITING_DELIVERY',
                                approvalNotes,
                                inventoryDeducted: res.data.inventoryDeducted,
                                updatedAt: res.data.updatedAt,
                            }
                            : o
                    )
                );

                // Pass inventoryDeducted from API response so stock is never deducted twice
                onApproveCustomerOrder(
                    updatedItems,
                    order.customerName,
                    order.orderID,
                    order.invoiceID,
                    res.data.inventoryDeducted
                );
                notify('success', `Order ${order.orderID} approved and invoiced (${order.invoiceID}).`);
            } else if (action === 'MODIFY') {
                setCustomerOrders((prev) =>
                    prev.map((o) =>
                        o.orderID === order.orderID
                            ? {
                                ...o,
                                items: updatedItems,
                                subtotal: updatedSubtotal,
                                status: 'MODIFIED',
                                approvalNotes,
                                inventoryDeducted: res.data.inventoryDeducted,
                                updatedAt: res.data.updatedAt,
                            }
                            : o
                    )
                );
                setModifyingOrderId(null);
                onLogAction(
                    'Mod 3: Order Modified',
                    `Modified customer order ${order.orderID} (${order.customerName}) • New Total: ${currencySymbol} ${updatedSubtotal.toFixed(2)} • Notes: "${approvalNotes}".`
                );
                notify('info', `Order ${order.orderID} updated and marked as MODIFIED.`);
            } else {
                setCustomerOrders((prev) =>
                    prev.map((o) =>
                        o.orderID === order.orderID
                            ? {
                                ...o,
                                status: 'REJECTED',
                                approvalNotes,
                                inventoryDeducted: res.data.inventoryDeducted,
                                updatedAt: res.data.updatedAt,
                            }
                            : o
                    )
                );
                onLogAction(
                    'Mod 3: Order Rejected',
                    `Rejected customer order ${order.orderID} (${order.customerName}) • Notes: "${approvalNotes}".`
                );
                notify('warning', `Order ${order.orderID} rejected.`);
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to update customer order status.';
            notify('error', msg);
        } finally {
            setProcessingOrderId(null);
        }
    };

    // Step 5: Confirm Customer Order Dispatched / Delivered
    const handleConfirmCustomerDelivery = (order: CustomerOrderRecord) => {
        setCustomerOrders((prev) =>
            prev.map((o) =>
                o.orderID === order.orderID
                    ? { ...o, status: 'DELIVERED_COMPLETED', updatedAt: new Date().toISOString() }
                    : o
            )
        );
        onLogAction(
            'Mod 3: Order Delivered',
            `Confirmed customer delivery for ${order.orderID} to ${order.customerName} (Invoice ${order.invoiceID}).`
        );
        notify('success', `Confirmed delivery for ${order.orderID}.`);
    };

    const filteredOrders = useMemo(() => {
        if (statusFilter === 'ALL') return customerOrders;
        return customerOrders.filter((o) => o.status === statusFilter);
    }, [customerOrders, statusFilter]);

    const statusTabs: { id: 'ALL' | OrderFulfillmentStatus; label: string; count: number }[] = [
        { id: 'ALL', label: 'All Orders', count: customerOrders.length },
        {
            id: 'PENDING_HUMAN_APPROVAL',
            label: 'Pending Approval',
            count: customerOrders.filter((o) => o.status === 'PENDING_HUMAN_APPROVAL').length,
        },
        {
            id: 'MODIFIED',
            label: 'Modified',
            count: customerOrders.filter((o) => o.status === 'MODIFIED').length,
        },
        {
            id: 'APPROVED_AWAITING_DELIVERY',
            label: 'Awaiting Delivery',
            count: customerOrders.filter((o) => o.status === 'APPROVED_AWAITING_DELIVERY').length,
        },
        {
            id: 'DELIVERED_COMPLETED',
            label: 'Completed',
            count: customerOrders.filter((o) => o.status === 'DELIVERED_COMPLETED').length,
        },
        {
            id: 'REJECTED',
            label: 'Rejected',
            count: customerOrders.filter((o) => o.status === 'REJECTED').length,
        },
    ];

    return (
        <div className="space-y-5 relative">
            {/* Local Fallback Toast Notification */}
            {localToast && (
                <div className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl shadow-xl border bg-slate-900 text-white border-slate-700 flex items-center gap-2.5 text-xs font-semibold">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{localToast.message}</span>
                </div>
            )}

            {/* NLP Customer Order Parser Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-600" /> B2B Customer Order Intake (NLP Parser &amp; Live Stock Verification)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            1. Customer Message Trigger &rarr; 2. NLP Extraction &rarr; 3. Review/Edit Draft &rarr; 4. Owner Approval / Modify &rarr; 5. Confirm Delivery
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
                        <button
                            type="button"
                            onClick={() =>
                                applyPresetMessage(
                                    'KL Downtown Bistro',
                                    'Please send 12 crates of Sparkling Yuzu Syrup by Friday.'
                                )
                            }
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md font-semibold cursor-pointer"
                        >
                            Unmatched SKU (Test Fail)
                        </button>
                    </div>
                </div>

                <form onSubmit={handleProcessNlpCustomerOrder} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3 space-y-3">
                        <div className="space-y-1">
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

                        {/* ISO Date Picker */}
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-purple-600" /> Requested Delivery Date (ISO) *
                            </label>
                            <input
                                type="date"
                                value={requestedDate}
                                onChange={(e) => {
                                    setRequestedDate(e.target.value);
                                    if (nlpErrors.requestedDate) setNlpErrors({ ...nlpErrors, requestedDate: undefined });
                                }}
                                className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 focus:outline-none ${
                                    nlpErrors.requestedDate ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'
                                }`}
                            />
                            {nlpErrors.requestedDate && (
                                <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.requestedDate}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Multi-line Textarea for Customer Order Message */}
                    <div className="lg:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">
                            Incoming WhatsApp / Email Customer Order Message *
                        </label>
                        <textarea
                            rows={4}
                            maxLength={500}
                            placeholder="e.g., Please send 6 kg of Artisan Arabica Coffee Beans..."
                            value={rawOrderText}
                            onChange={(e) => {
                                setRawOrderText(e.target.value);
                                if (nlpErrors.rawOrderText) setNlpErrors({ ...nlpErrors, rawOrderText: undefined });
                            }}
                            className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs text-slate-900 focus:outline-none resize-y ${
                                nlpErrors.rawOrderText ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'
                            }`}
                        />
                        {nlpErrors.rawOrderText && (
                            <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.rawOrderText}
                            </p>
                        )}
                    </div>

                    <div className="lg:col-span-3 flex flex-col justify-end gap-2">
                        <button
                            type="submit"
                            disabled={isProcessingNlp}
                            className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {isProcessingNlp ? 'Parsing Order...' : 'Analyze Order & Check Stock'}
                        </button>
                    </div>
                </form>

                {/* Parse-Failure State Banner (No silent fallback to first product) */}
                {parseFailureMessage && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 text-rose-800">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-rose-900">NLP Parse Failure — No Matching Catalog Products</p>
                                    <p className="text-rose-700 mt-0.5 leading-relaxed">{parseFailureMessage}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setParseFailureMessage(null)}
                                className="text-rose-500 hover:text-rose-800 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={() => {
                                    setParseFailureMessage(null);
                                    setParsedDraft({
                                        customerName: customerName.trim() || 'Manual B2B Customer',
                                        requestedDate,
                                        rawMessage: rawOrderText.trim(),
                                        internalNotes: 'Manually assembled after NLP parse failure',
                                        items: [],
                                        currency,
                                    });
                                }}
                                className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold transition cursor-pointer"
                            >
                                Build Order Manually in Review Editor &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {/* Review / Edit Step Before Creating the Order */}
                {parsedDraft && (
                    <div className="p-5 rounded-2xl bg-purple-50/60 border-2 border-purple-300 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/80 pb-3">
                            <div>
                                <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider">
                                    Step 2: Human Review &amp; Edit Before Order Creation
                                </span>
                                <h4 className="text-sm font-bold text-slate-900 mt-1">
                                    Review Extracted Line Items for {parsedDraft.customerName} (Delivery: {parsedDraft.requestedDate})
                                </h4>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setParsedDraft(null)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                                >
                                    Discard Draft
                                </button>
                                <button
                                    type="button"
                                    disabled={isCreatingOrder || parsedDraft.items.length === 0}
                                    onClick={() => void handleConfirmCreateOrder()}
                                    className="px-4 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                                >
                                    <FileCheck className="w-3.5 h-3.5" />
                                    {isCreatingOrder ? 'Creating Order...' : 'Confirm & Create Order'}
                                </button>
                            </div>
                        </div>

                        {/* Add SKU to Draft */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="w-72">
                                <VyteDropdown
                                    variant="light"
                                    size="sm"
                                    value={addSkuId}
                                    onChange={(val) => setAddSkuId(val)}
                                    options={products.map((p) => ({
                                        label: `${p.name} (${p.sku}) — ${currencySymbol} ${p.priceRM.toFixed(2)}`,
                                        value: p.id,
                                    }))}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={handleAddDraftItem}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add SKU to Draft
                            </button>

                            <div className="flex-1 min-w-[220px]">
                                <input
                                    type="text"
                                    placeholder="Internal order notes..."
                                    value={parsedDraft.internalNotes}
                                    onChange={(e) =>
                                        setParsedDraft({ ...parsedDraft, internalNotes: e.target.value })
                                    }
                                    className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs text-slate-800"
                                />
                            </div>
                        </div>

                        {/* Editable Line Items Table */}
                        {parsedDraft.items.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-3 text-center">
                                No items in draft yet. Select a product above and click "Add SKU to Draft".
                            </p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-purple-200 bg-white">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                        <th className="py-2 px-3.5">SKU &amp; Product</th>
                                        <th className="py-2 px-3.5">Requested Qty (Editable)</th>
                                        <th className="py-2 px-3.5">Live Warehouse Stock</th>
                                        <th className="py-2 px-3.5">Unit Price</th>
                                        <th className="py-2 px-3.5 text-right">Line Subtotal</th>
                                        <th className="py-2 px-3.5 text-center">Remove</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {parsedDraft.items.map((item) => (
                                        <tr key={item.productID}>
                                            <td className="py-2.5 px-3.5 font-bold text-slate-900">
                                                {item.name}{' '}
                                                <span className="font-mono text-[11px] text-slate-400">
                                                    ({item.SKU})
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-3.5">
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={9999}
                                                    value={item.requestedQty}
                                                    onChange={(e) =>
                                                        handleUpdateDraftQty(item.productID, Number(e.target.value))
                                                    }
                                                    className="w-20 px-2 py-1 rounded-lg border border-purple-300 font-extrabold text-slate-900"
                                                />
                                            </td>
                                            <td className="py-2.5 px-3.5">
                                                {item.isStockEnough ? (
                                                    <span className="text-emerald-700 font-bold">
                                                        ✓ {item.availableStock} Available
                                                    </span>
                                                ) : (
                                                    <span className="text-rose-600 font-bold">
                                                        ⚠ Only {item.availableStock} Left
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-slate-600">
                                                {currencySymbol} {item.sellingPrice.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">
                                                {currencySymbol} {item.lineTotal.toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => handleRemoveDraftItem(item.productID)}
                                                    className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Customer Order Fulfillment Queue */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                            <Package className="w-4 h-4 text-emerald-600" /> Active Customer Orders &amp; Fulfillment Pipeline ({filteredOrders.length})
                        </h4>
                        <p className="text-[11px] text-slate-500">
                            Orders with insufficient stock are automatically blocked from approval until restocked in Module 1.
                        </p>
                    </div>

                    {/* Status Filter Tabs */}
                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                        {statusTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setStatusFilter(tab.id)}
                                className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${
                                    statusFilter === tab.id
                                        ? 'bg-white text-slate-900 shadow-2xs'
                                        : 'text-slate-600 hover:text-slate-900'
                                }`}
                            >
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>
                </div>

                {filteredOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                        No customer orders match the selected status filter ({statusFilter}).
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredOrders.map((co) => {
                            const isPendingOrModified =
                                co.status === 'PENDING_HUMAN_APPROVAL' || co.status === 'MODIFIED';
                            const isModifyingThis = modifyingOrderId === co.orderID;
                            const isBusy = processingOrderId === co.orderID;

                            const liveItems = co.items.map((item) => {
                                const liveProd = products.find(
                                    (p) => p.id === item.productID || p.sku === item.SKU
                                );
                                const currentWarehouseStock = liveProd ? liveProd.stock : item.availableStock;
                                const uom = liveProd?.uom ?? 'units';
                                const key = `${co.orderID}:${item.productID}`;
                                const effectiveQty = isModifyingThis
                                    ? modifiedQuantities[key] ?? item.requestedQty
                                    : item.requestedQty;
                                const shortageQty = Math.max(0, effectiveQty - currentWarehouseStock);

                                return {
                                    ...item,
                                    requestedQty: effectiveQty,
                                    lineTotal: Number((effectiveQty * item.sellingPrice).toFixed(2)),
                                    uom,
                                    availableStock: currentWarehouseStock,
                                    shortageQty,
                                    isStockEnough: isPendingOrModified
                                        ? currentWarehouseStock >= effectiveQty
                                        : true,
                                };
                            });

                            const allEnoughLive = liveItems.every((i) => i.isStockEnough);

                            return (
                                <div
                                    key={co.orderID}
                                    className={`rounded-2xl border overflow-hidden transition ${
                                        isPendingOrModified
                                            ? allEnoughLive
                                                ? 'bg-white border-slate-200'
                                                : 'bg-rose-50/20 border-rose-200'
                                            : co.status === 'APPROVED_AWAITING_DELIVERY'
                                                ? 'bg-blue-50/15 border-blue-200'
                                                : co.status === 'DELIVERED_COMPLETED'
                                                    ? 'bg-emerald-50/15 border-emerald-200'
                                                    : 'bg-slate-50 border-slate-200 opacity-75'
                                    }`}
                                >
                                    {/* Card Top Header Bar */}
                                    <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">
                                                {co.orderID}
                                            </span>
                                            <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                Invoice: {co.invoiceID}
                                            </span>
                                            {co.invoicePdfUrl && (
                                                <a
                                                    href={co.invoicePdfUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition"
                                                >
                                                    <FileText className="w-3 h-3" /> PDF <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            )}
                                            <span className="text-sm font-bold text-slate-900">{co.customerName}</span>
                                            <span className="text-xs font-mono text-slate-500">• {co.requestedDate}</span>

                                            {co.status === 'MODIFIED' && (
                                                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                                                    MODIFIED
                                                </span>
                                            )}

                                            {isPendingOrModified && (
                                                <span
                                                    className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                                        allEnoughLive
                                                            ? 'bg-emerald-100 text-emerald-800'
                                                            : 'bg-rose-100 text-rose-700'
                                                    }`}
                                                >
                                                    {allEnoughLive ? (
                                                        <>
                                                            <CheckCircle2 className="w-3 h-3" /> Stock Sufficient
                                                        </>
                                                    ) : (
                                                        <>
                                                            <AlertTriangle className="w-3 h-3" /> Insufficient Stock
                                                        </>
                                                    )}
                                                </span>
                                            )}
                                        </div>

                                        {/* Right Actions & Total */}
                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedDetailOrder(co)}
                                                className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                                            >
                                                <Eye className="w-3.5 h-3.5" /> Details
                                            </button>

                                            <div className="text-right mr-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                                    Order Total
                                                </span>
                                                <span className="text-base font-extrabold text-slate-900 whitespace-nowrap">
                                                    {currencySymbol} {co.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </span>
                                            </div>

                                            {isPendingOrModified && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {allEnoughLive ? (
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                requestOrderAction(co, 'APPROVE', allEnoughLive)
                                                            }
                                                            className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                        >
                                                            <FileCheck className="w-3.5 h-3.5" /> Approve &amp; Invoice
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <button
                                                                type="button"
                                                                disabled
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

                                                    {/* MODIFY Button */}
                                                    {isModifyingThis ? (
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() =>
                                                                requestOrderAction(co, 'MODIFY', allEnoughLive)
                                                            }
                                                            className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" /> Save Modification
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            disabled={isBusy}
                                                            onClick={() => {
                                                                const initMap: Record<string, number> = {};
                                                                co.items.forEach((i) => {
                                                                    initMap[`${co.orderID}:${i.productID}`] =
                                                                        i.requestedQty;
                                                                });
                                                                setModifiedQuantities((prev) => ({
                                                                    ...prev,
                                                                    ...initMap,
                                                                }));
                                                                setModifyingOrderId(co.orderID);
                                                            }}
                                                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" /> Modify
                                                        </button>
                                                    )}

                                                    <button
                                                        type="button"
                                                        disabled={isBusy}
                                                        onClick={() =>
                                                            requestOrderAction(co, 'REJECT', allEnoughLive)
                                                        }
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

                                    {/* Card Body: Customer Message + Notes Input + Line-Item Table */}
                                    <div className="p-4 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-xs text-slate-500 italic">
                                                Customer Message: &ldquo;{co.rawMessage}&rdquo;
                                            </p>
                                            {co.approvalNotes && (
                                                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                                    Review Note: {co.approvalNotes}
                                                </span>
                                            )}
                                        </div>

                                        {/* Notes Input for Approve / Modify / Reject */}
                                        {isPendingOrModified && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Add approval / modification / rejection notes for audit record..."
                                                    value={orderNotesMap[co.orderID] ?? ''}
                                                    onChange={(e) =>
                                                        setOrderNotesMap((prev) => ({
                                                            ...prev,
                                                            [co.orderID]: e.target.value,
                                                        }))
                                                    }
                                                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                                                />
                                                {isModifyingThis && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifyingOrderId(null)}
                                                        className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                                                    >
                                                        Cancel Edit
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                                    <th className="py-2 px-3.5">Product Item &amp; SKU</th>
                                                    <th className="py-2 px-3.5">Customer Requested</th>
                                                    <th className="py-2 px-3.5">
                                                        {isPendingOrModified
                                                            ? 'Live Warehouse Stock'
                                                            : 'Stock Allocation Status'}
                                                    </th>
                                                    <th className="py-2 px-3.5">Unit Price</th>
                                                    <th className="py-2 px-3.5 text-right">Line Subtotal</th>
                                                </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                {liveItems.map((item) => {
                                                    const key = `${co.orderID}:${item.productID}`;
                                                    return (
                                                        <tr key={item.SKU} className="hover:bg-slate-50/60">
                                                            <td className="py-2.5 px-3.5">
                                                                <span className="font-bold text-slate-900">
                                                                    {item.name}
                                                                </span>
                                                                <span className="ml-2 font-mono text-[11px] text-slate-400">
                                                                    ({item.SKU})
                                                                </span>
                                                            </td>

                                                            <td className="py-2.5 px-3.5 font-extrabold text-slate-900">
                                                                {isModifyingThis ? (
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={9999}
                                                                        value={
                                                                            modifiedQuantities[key] ??
                                                                            item.requestedQty
                                                                        }
                                                                        onChange={(e) =>
                                                                            setModifiedQuantities((prev) => ({
                                                                                ...prev,
                                                                                [key]: Math.max(
                                                                                    1,
                                                                                    Number(e.target.value) || 1
                                                                                ),
                                                                            }))
                                                                        }
                                                                        className="w-20 px-2 py-1 rounded border border-amber-400 bg-amber-50/40 font-extrabold text-slate-900"
                                                                    />
                                                                ) : (
                                                                    `${item.requestedQty} ${item.uom}`
                                                                )}
                                                            </td>

                                                            <td className="py-2.5 px-3.5">
                                                                {isPendingOrModified ? (
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
                                                                    <span className="text-slate-400 font-semibold">
                                                                        Order Cancelled
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">
                                                                        ✓ {item.requestedQty} {item.uom} Reserved &amp; Deducted (Rem: {item.availableStock} {item.uom})
                                                                    </span>
                                                                )}
                                                            </td>

                                                            <td className="py-2.5 px-3.5 text-slate-600 font-medium">
                                                                {currencySymbol} {item.sellingPrice.toFixed(2)} / {item.uom}
                                                            </td>

                                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">
                                                                {currencySymbol}{' '}
                                                                {item.lineTotal.toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                })}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Confirmation Dialog Modal */}
            {confirmDialog && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <h3 className="text-base font-bold text-slate-900">
                                Confirm {confirmDialog.action} Order
                            </h3>
                            <button
                                type="button"
                                onClick={() => setConfirmDialog(null)}
                                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Are you sure you want to mark order{' '}
                            <strong className="text-slate-900">{confirmDialog.order.orderID}</strong> for{' '}
                            <strong className="text-slate-900">{confirmDialog.order.customerName}</strong> as{' '}
                            <strong className="text-slate-900">{confirmDialog.action}</strong>?
                        </p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setConfirmDialog(null)}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => void executeConfirmedOrderAction()}
                                className={`px-4 py-2 text-white rounded-xl text-xs font-bold cursor-pointer ${
                                    confirmDialog.action === 'REJECT'
                                        ? 'bg-rose-600 hover:bg-rose-700'
                                        : confirmDialog.action === 'MODIFY'
                                            ? 'bg-amber-500 hover:bg-amber-600'
                                            : 'bg-[#2BB656] hover:bg-emerald-600'
                                }`}
                            >
                                Confirm {confirmDialog.action}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Order Detail View Modal */}
            {selectedDetailOrder && (
                <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl border border-slate-200 max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">
                                        {selectedDetailOrder.orderID}
                                    </span>
                                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">
                                        {selectedDetailOrder.invoiceID}
                                    </span>
                                </div>
                                <h3 className="text-base font-bold text-slate-900 mt-1">
                                    {selectedDetailOrder.customerName}
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedDetailOrder(null)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div>
                                <span className="text-slate-400 block">Status</span>
                                <strong className="text-slate-900">{selectedDetailOrder.status}</strong>
                            </div>
                            <div>
                                <span className="text-slate-400 block">Requested Date (ISO)</span>
                                <strong className="font-mono text-slate-900">
                                    {selectedDetailOrder.requestedDate}
                                </strong>
                            </div>
                            <div>
                                <span className="text-slate-400 block">Inventory Deducted</span>
                                <strong className="text-slate-900">
                                    {selectedDetailOrder.inventoryDeducted ? 'Yes (Verified)' : 'Pending / No'}
                                </strong>
                            </div>
                            <div className="col-span-2">
                                <span className="text-slate-400 block">Invoice PDF Document</span>
                                <a
                                    href={selectedDetailOrder.invoicePdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-1"
                                >
                                    {selectedDetailOrder.invoicePdfUrl} <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                            <div>
                                <span className="text-slate-400 block">Total Amount</span>
                                <strong className="text-slate-900">
                                    {currencySymbol} {selectedDetailOrder.subtotal.toFixed(2)}
                                </strong>
                            </div>
                        </div>

                        <div className="space-y-1 text-xs">
                            <p className="font-bold text-slate-700">Raw Customer Message</p>
                            <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 italic text-slate-600">
                                &ldquo;{selectedDetailOrder.rawMessage}&rdquo;
                            </p>
                        </div>

                        {selectedDetailOrder.approvalNotes && (
                            <div className="space-y-1 text-xs">
                                <p className="font-bold text-slate-700">Approval / Modification Notes</p>
                                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">
                                    {selectedDetailOrder.approvalNotes}
                                </p>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                    <th className="py-2 px-3">SKU</th>
                                    <th className="py-2 px-3">Product</th>
                                    <th className="py-2 px-3">Qty</th>
                                    <th className="py-2 px-3">Unit Price</th>
                                    <th className="py-2 px-3 text-right">Subtotal</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {selectedDetailOrder.items.map((i) => (
                                    <tr key={i.SKU}>
                                        <td className="py-2 px-3 font-mono">{i.SKU}</td>
                                        <td className="py-2 px-3 font-bold">{i.name}</td>
                                        <td className="py-2 px-3">{i.requestedQty}</td>
                                        <td className="py-2 px-3">{currencySymbol} {i.sellingPrice.toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-bold">
                                            {currencySymbol} {i.lineTotal.toFixed(2)}
                                        </td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button
                                type="button"
                                onClick={() => setSelectedDetailOrder(null)}
                                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};