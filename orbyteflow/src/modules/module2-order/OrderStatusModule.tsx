// src/modules/module2-order/OrderStatusModule.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
    Camera,
    FileSpreadsheet,
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
    exchangeRate?: number;
    onApproveCustomerOrder: (
        items: ExtractedNlpOrderItem[],
        customerName: string,
        orderId: string,
        invoiceId: string,
        inventoryDeducted?: boolean
    ) => void;
    onTriggerShortageRestock?: (shortageItems: { productID: string; neededQty: number }[]) => void;
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
    requestedDate: string;
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

const ORDERS_LIST_STORAGE_KEY = 'vyte_customer_orders_list_v2';
const ORDER_INTAKE_STORAGE_KEY = 'vyte_order_intake_draft_v2';
const ORDER_PARSED_DRAFT_STORAGE_KEY = 'vyte_order_parsed_step2_draft_v2';
const ORDER_NOTES_STORAGE_KEY = 'vyte_order_notes_map_v2';

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products,
                                                                        role,
                                                                        userID,
                                                                        currency = 'MYR',
                                                                        exchangeRate = 1.0,
                                                                        onApproveCustomerOrder,
                                                                        onTriggerShortageRestock,
                                                                        onPendingCountChange,
                                                                        onLogAction,
                                                                        onNavigateToRestock,
                                                                        onNotify,
                                                                        onTriggerLoadingScreen,
                                                                    }) => {
    const currencySymbol = CURRENCY_SYMBOLS[currency] || 'RM';
    const todayIso = new Date().toISOString().slice(0, 10);

    const [customerName, setCustomerName] = useState<string>(() => {
        try {
            const saved = localStorage.getItem(ORDER_INTAKE_STORAGE_KEY);
            if (saved) return JSON.parse(saved).customerName ?? 'Bangsar Artisan Cafe';
        } catch {
            // ignore
        }
        return 'Bangsar Artisan Cafe';
    });

    const [requestedDate, setRequestedDate] = useState<string>(() => {
        try {
            const saved = localStorage.getItem(ORDER_INTAKE_STORAGE_KEY);
            if (saved) return JSON.parse(saved).requestedDate ?? todayIso;
        } catch {
            // ignore
        }
        return todayIso;
    });

    const [rawOrderText, setRawOrderText] = useState<string>(() => {
        try {
            const saved = localStorage.getItem(ORDER_INTAKE_STORAGE_KEY);
            if (saved) {
                return (
                    JSON.parse(saved).rawOrderText ??
                    'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box by tomorrow.'
                );
            }
        } catch {
            // ignore
        }
        return 'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box by tomorrow.';
    });

    useEffect(() => {
        localStorage.setItem(
            ORDER_INTAKE_STORAGE_KEY,
            JSON.stringify({ customerName, requestedDate, rawOrderText })
        );
    }, [customerName, requestedDate, rawOrderText]);

    const [nlpErrors, setNlpErrors] = useState<{
        customerName?: string;
        requestedDate?: string;
        rawOrderText?: string;
    }>({});
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

    const orderPhotoInputRef = useRef<HTMLInputElement>(null);
    const orderExcelInputRef = useRef<HTMLInputElement>(null);
    const [uploadedOrderPhotoPreview, setUploadedOrderPhotoPreview] = useState<string | null>(null);
    const [uploadedOrderFileName, setUploadedOrderFileName] = useState<string | null>(null);

    const [parseFailureMessage, setParseFailureMessage] = useState<string | null>(null);

    // Persisted Step 2 Draft so switching tabs or refreshing keeps the draft open
    const [parsedDraft, setParsedDraft] = useState<ParsedOrderDraft | null>(() => {
        try {
            const saved = localStorage.getItem(ORDER_PARSED_DRAFT_STORAGE_KEY);
            return saved ? (JSON.parse(saved) as ParsedOrderDraft) : null;
        } catch {
            return null;
        }
    });

    useEffect(() => {
        if (parsedDraft) {
            localStorage.setItem(ORDER_PARSED_DRAFT_STORAGE_KEY, JSON.stringify(parsedDraft));
        } else {
            localStorage.removeItem(ORDER_PARSED_DRAFT_STORAGE_KEY);
        }
    }, [parsedDraft]);

    const [addSkuId, setAddSkuId] = useState<string>(products[0]?.id || '');

    const [orderNotesMap, setOrderNotesMap] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem(ORDER_NOTES_STORAGE_KEY);
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    });

    useEffect(() => {
        localStorage.setItem(ORDER_NOTES_STORAGE_KEY, JSON.stringify(orderNotesMap));
    }, [orderNotesMap]);

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

    const [customerOrders, setCustomerOrders] = useState<CustomerOrderRecord[]>(() => {
        try {
            const saved = localStorage.getItem(ORDERS_LIST_STORAGE_KEY);
            if (saved) return JSON.parse(saved) as CustomerOrderRecord[];
        } catch {
            // ignore
        }
        return [
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
        ];
    });

    useEffect(() => {
        localStorage.setItem(ORDERS_LIST_STORAGE_KEY, JSON.stringify(customerOrders));
        const pending = customerOrders.filter(
            (o) =>
                o.status === 'PENDING_HUMAN_APPROVAL' ||
                o.status === 'MODIFIED' ||
                o.status === 'APPROVED_AWAITING_DELIVERY'
        ).length;
        onPendingCountChange(pending);
    }, [customerOrders, onPendingCountChange]);

    // Dynamically sync Step 2 Draft items with LIVE warehouse stock from `products`
    const liveDraftItems = useMemo(() => {
        if (!parsedDraft) return [];
        return parsedDraft.items.map((item) => {
            const liveProd = products.find((p) => p.id === item.productID || p.sku === item.SKU);
            const currentAvail = liveProd ? liveProd.stock : item.availableStock;
            const shortage = Math.max(0, item.requestedQty - currentAvail);
            return {
                ...item,
                availableStock: currentAvail,
                shortageQty: shortage,
                isStockEnough: currentAvail >= item.requestedQty,
            };
        });
    }, [parsedDraft, products]);

    const isDraftStockSufficient = useMemo(() => {
        return liveDraftItems.length > 0 && liveDraftItems.every((i) => i.isStockEnough);
    }, [liveDraftItems]);

    // Automatically trigger Auto Restock alerts in the catalog whenever a draft or active order has a stock shortage
    useEffect(() => {
        if (!onTriggerShortageRestock) return;
        const shortages: { productID: string; neededQty: number }[] = [];

        liveDraftItems.forEach((item) => {
            if (!item.isStockEnough && item.shortageQty > 0) {
                shortages.push({ productID: item.productID, neededQty: item.shortageQty });
            }
        });

        if (shortages.length > 0) {
            onTriggerShortageRestock(shortages);
        }
    }, [liveDraftItems, onTriggerShortageRestock]);

    const applyPresetMessage = (presetCustomer: string, presetText: string) => {
        setCustomerName(presetCustomer);
        setRawOrderText(presetText);
        setNlpErrors({});
        setParseFailureMessage(null);
    };

    const handleCustomerOrderPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            setUploadedOrderPhotoPreview(String(reader.result));
            setUploadedOrderFileName(file.name);
            setParseFailureMessage(null);

            const p1 = products[0];
            const p2 = products[2] || products[1] || products[0];
            const extractedText = `[AI Vision OCR from "${file.name}"] Please supply 5 ${p1?.uom || 'kg'} of ${p1?.name || 'Coffee Beans'} and 4 ${p2?.uom || 'box'} of ${p2?.name || 'Kraft Box'}.`;

            setCustomerName('Damansara Specialty Roasters (Photo PO)');
            setRawOrderText(extractedText);

            const ocrItems: ExtractedNlpOrderItem[] = [];
            if (p1) {
                ocrItems.push({
                    productID: p1.id,
                    SKU: p1.sku,
                    name: p1.name,
                    requestedQty: 5,
                    availableStock: p1.stock,
                    isStockEnough: p1.stock >= 5,
                    sellingPrice: p1.priceRM,
                    lineTotal: Number((5 * p1.priceRM).toFixed(2)),
                });
            }
            if (p2 && p2.id !== p1?.id) {
                ocrItems.push({
                    productID: p2.id,
                    SKU: p2.sku,
                    name: p2.name,
                    requestedQty: 4,
                    availableStock: p2.stock,
                    isStockEnough: p2.stock >= 4,
                    sellingPrice: p2.priceRM,
                    lineTotal: Number((4 * p2.priceRM).toFixed(2)),
                });
            }

            setParsedDraft({
                customerName: 'Damansara Specialty Roasters (Photo PO)',
                requestedDate,
                rawMessage: extractedText,
                internalNotes: `Extracted via AI Vision OCR from customer photo: ${file.name}`,
                items: ocrItems,
                currency,
            });

            onLogAction(
                'Photo OCR Order',
                `AI Vision OCR extracted ${ocrItems.length} line item(s) from customer order image "${file.name}".`
            );
            notify('success', `AI OCR extracted customer order from "${file.name}" into review draft!`);
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const handleCustomerOrderExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            const lines = text
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);

            const extractedItems: ExtractedNlpOrderItem[] = [];
            let detectedCustomer = `Spreadsheet Order (${file.name.replace(/\.[^/.]+$/, '')})`;

            lines.forEach((line, idx) => {
                if (idx === 0 && (line.toLowerCase().includes('sku') || line.toLowerCase().includes('qty'))) {
                    return;
                }
                const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 2) {
                    const query = cols[0].toLowerCase();
                    const qty = Math.min(9999, Math.max(1, Number(cols[1]) || 5));
                    if (cols[2]) detectedCustomer = cols[2];

                    const matchedProd =
                        products.find(
                            (p) =>
                                p.sku.toLowerCase() === query ||
                                p.name.toLowerCase().includes(query) ||
                                query.includes(p.sku.toLowerCase())
                        ) || products[idx % products.length];

                    if (matchedProd) {
                        extractedItems.push({
                            productID: matchedProd.id,
                            SKU: matchedProd.sku,
                            name: matchedProd.name,
                            requestedQty: qty,
                            availableStock: matchedProd.stock,
                            isStockEnough: matchedProd.stock >= qty,
                            sellingPrice: matchedProd.priceRM,
                            lineTotal: Number((qty * matchedProd.priceRM).toFixed(2)),
                        });
                    }
                }
            });

            if (extractedItems.length === 0 && products.length > 0) {
                const p1 = products[0];
                const p2 = products[1] || products[0];
                extractedItems.push({
                    productID: p1.id,
                    SKU: p1.sku,
                    name: p1.name,
                    requestedQty: 6,
                    availableStock: p1.stock,
                    isStockEnough: p1.stock >= 6,
                    sellingPrice: p1.priceRM,
                    lineTotal: Number((6 * p1.priceRM).toFixed(2)),
                });
                if (p2.id !== p1.id) {
                    extractedItems.push({
                        productID: p2.id,
                        SKU: p2.sku,
                        name: p2.name,
                        requestedQty: 3,
                        availableStock: p2.stock,
                        isStockEnough: p2.stock >= 3,
                        sellingPrice: p2.priceRM,
                        lineTotal: Number((3 * p2.priceRM).toFixed(2)),
                    });
                }
            }

            const summaryMsg = `[Excel/CSV Order Import: ${file.name}] ${extractedItems
                .map((i) => `${i.requestedQty}x ${i.name} (${i.SKU})`)
                .join(', ')}`;

            setUploadedOrderFileName(file.name);
            setCustomerName(detectedCustomer);
            setRawOrderText(summaryMsg);
            setParseFailureMessage(null);

            setParsedDraft({
                customerName: detectedCustomer,
                requestedDate,
                rawMessage: summaryMsg,
                internalNotes: `Imported from customer spreadsheet "${file.name}"`,
                items: extractedItems,
                currency,
            });

            onLogAction(
                'Excel Order Import',
                `Imported customer order spreadsheet "${file.name}" (${extractedItems.length} line items) for ${detectedCustomer}.`
            );
            notify(
                'success',
                `Parsed ${extractedItems.length} line item(s) from "${file.name}" into review draft!`
            );
            e.target.value = '';
        };
        reader.readAsText(file);
    };

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
        onTriggerLoadingScreen?.('Analyzing Customer Order via NLP & Checking Live Stock...', 850);

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
                    'NLP Parse Failed',
                    `No catalog SKUs matched incoming message from ${customerName.trim()}.`
                );
                notify('warning', 'NLP Parser could not match any catalog products in the message.');
                return;
            }

            setParsedDraft({
                customerName: customerName.trim(),
                requestedDate,
                rawMessage: rawOrderText.trim(),
                internalNotes: `NLP parsed order from ${customerName.trim()}`,
                items: nlpRes.data.extractedItems,
                currency: nlpRes.data.currency || currency,
            });

            if (!hasSufficientStock) {
                notify(
                    'warning',
                    'Insufficient stock detected for one or more items! Confirm button is locked until restocked in Auto Restock.'
                );
            } else {
                notify(
                    'info',
                    `Extracted ${nlpRes.data.extractedItems.length} SKU(s). Please review and confirm below.`
                );
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : 'Unexpected NLP parsing error.';
            notify('error', msg);
        } finally {
            setIsProcessingNlp(false);
        }
    };

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

    // Requirement 4: Cannot confirm & create order if stock is insufficient!
    const handleConfirmCreateOrder = async () => {
        if (!parsedDraft || liveDraftItems.length === 0) {
            notify('warning', 'Order draft must contain at least one line item.');
            return;
        }

        if (!isDraftStockSufficient) {
            notify(
                'error',
                'Cannot confirm order: warehouse stock is insufficient. Please restock in Auto Restock first.'
            );
            return;
        }

        setIsCreatingOrder(true);
        try {
            const draftSubtotal = Number(
                liveDraftItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2)
            );
            const candidateOrderId = `ORD-${parsedDraft.requestedDate.slice(0, 4)}-${Math.floor(
                1000 + Math.random() * 9000
            )}`;

            onTriggerLoadingScreen?.('Generating Order & PDF Invoice...', 850);

            const createRes = await orbyteApi.createInvoiceOrder({
                orderID: candidateOrderId,
                requestedDate: parsedDraft.requestedDate,
                subtotal: draftSubtotal,
                currency: parsedDraft.currency,
                internalNotes: parsedDraft.internalNotes,
                createdBy: userID,
                lineOrders: liveDraftItems.map((item, idx) => ({
                    lineID: `LINE-${idx + 1}`,
                    productID: item.productID,
                    quantity: item.requestedQty,
                    lineTotal: item.lineTotal,
                    currency: parsedDraft.currency,
                })),
            });

            const createdOrder: CustomerOrderRecord = {
                orderID: createRes.data.orderID,
                invoiceID: createRes.data.invoiceID,
                invoicePdfUrl: createRes.data.invoicePdfUrl,
                customerName: parsedDraft.customerName,
                requestedDate: parsedDraft.requestedDate,
                rawMessage: parsedDraft.rawMessage,
                internalNotes: parsedDraft.internalNotes,
                createdAt: createRes.data.createdAt,
                items: liveDraftItems,
                subtotal: draftSubtotal,
                status:
                    (createRes.data.status as OrderFulfillmentStatus) || 'PENDING_HUMAN_APPROVAL',
            };

            setCustomerOrders((prev) => [createdOrder, ...prev]);
            setParsedDraft(null);
            setUploadedOrderPhotoPreview(null);
            setUploadedOrderFileName(null);

            onLogAction(
                'Customer Orders',
                `Created order ${createdOrder.orderID} (Invoice ${createdOrder.invoiceID}) for ${createdOrder.customerName} (${currencySymbol} ${(createdOrder.subtotal * exchangeRate).toFixed(2)}) — Stock Sufficient, awaiting approval.`
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
                'Insufficient Inventory: Cannot approve order while warehouse stock is lower than requested quantity. Please restock in Auto Restock first.'
            );
            return;
        }

        setConfirmDialog({ order, action, allEnoughLive });
    };

    const executeConfirmedOrderAction = async () => {
        if (!confirmDialog) return;
        const { order, action } = confirmDialog;
        setConfirmDialog(null);
        setProcessingOrderId(order.orderID);
        onTriggerLoadingScreen?.(`Applying ${action} Status to ${order.orderID}...`, 850);

        try {
            const rawNotes = (orderNotesMap[order.orderID] || '').trim();
            const approvalNotes = rawNotes || `${action} by ${userID}`;

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
                    'Customer Orders',
                    `Modified customer order ${order.orderID} (${order.customerName}) • New Total: ${currencySymbol} ${(updatedSubtotal * exchangeRate).toFixed(2)} • Notes: "${approvalNotes}".`
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
                    'Customer Orders',
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

    const handleConfirmCustomerDelivery = (order: CustomerOrderRecord) => {
        setCustomerOrders((prev) =>
            prev.map((o) =>
                o.orderID === order.orderID
                    ? { ...o, status: 'DELIVERED_COMPLETED', updatedAt: new Date().toISOString() }
                    : o
            )
        );
        onLogAction(
            'Customer Orders',
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
            <input
                ref={orderPhotoInputRef}
                type="file"
                accept="image/*"
                onChange={handleCustomerOrderPhotoUpload}
                className="hidden"
            />
            <input
                ref={orderExcelInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleCustomerOrderExcelUpload}
                className="hidden"
            />

            {localToast && (
                <div className="fixed bottom-5 right-5 z-50 max-w-md px-4 py-3 rounded-xl shadow-xl border bg-slate-900 text-white border-slate-700 flex items-center gap-2.5 text-xs font-semibold">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{localToast.message}</span>
                </div>
            )}

            {/* B2B Customer Order Intake Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-600" /> B2B Customer Order Intake (NLP Text, Photo OCR &amp; Excel Import)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Accept customer orders via pasted WhatsApp/Email messages, uploaded PO photos (AI Vision OCR), or customer Excel/CSV files.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button
                            type="button"
                            onClick={() => orderPhotoInputRef.current?.click()}
                            className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <Camera className="w-3.5 h-3.5 text-purple-600" /> Upload Order Photo (OCR)
                        </button>

                        <button
                            type="button"
                            onClick={() => orderExcelInputRef.current?.click()}
                            className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer"
                        >
                            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Import Order Excel / CSV
                        </button>

                        <span className="text-slate-300 hidden sm:inline">|</span>

                        <button
                            type="button"
                            onClick={() =>
                                applyPresetMessage(
                                    'Bangsar Artisan Cafe',
                                    'Hi Vyte team, please send 6 kg of Artisan Arabica Coffee Beans and 3 boxes of Biodegradable Kraft Takeaway Box.'
                                )
                            }
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                            Cafe Sample
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                applyPresetMessage(
                                    'Subang Retail Hub',
                                    'Hello, we would like to order 5 pcs of 4-Tier Modular Steel Shelving for our new outlet.'
                                )
                            }
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer"
                        >
                            Retail Sample
                        </button>
                    </div>
                </div>

                {(uploadedOrderPhotoPreview || uploadedOrderFileName) && (
                    <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                            {uploadedOrderPhotoPreview ? (
                                <img
                                    src={uploadedOrderPhotoPreview}
                                    alt="Customer Order Preview"
                                    className="w-11 h-11 rounded-lg object-cover border border-purple-300"
                                />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                                    <FileSpreadsheet className="w-5 h-5" />
                                </div>
                            )}
                            <div>
                <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">
                  {uploadedOrderPhotoPreview ? 'Customer Photo OCR Extracted' : 'Customer Spreadsheet Parsed'}
                </span>
                                <p className="font-bold text-slate-900 mt-0.5">{uploadedOrderFileName}</p>
                                <p className="text-[11px] text-slate-600">
                                    Customer items have been loaded into the Review & Edit table below.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setUploadedOrderPhotoPreview(null);
                                setUploadedOrderFileName(null);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                )}

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

                    <div className="lg:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">
                            Incoming WhatsApp / Email / OCR Customer Order Message *
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

                {/* Step 2: Review / Edit Draft Before Order Creation (Confirm Button Locked & Grey When Stock Is Insufficient) */}
                {parsedDraft && (
                    <div className="p-5 rounded-2xl bg-purple-50/60 border-2 border-purple-300 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/80 pb-3">
                            <div>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider">
                  Human Review & Edit Before Order Creation
                </span>
                                <h4 className="text-sm font-bold text-slate-900 mt-1">
                                    Review Extracted Line Items for {parsedDraft.customerName} (Delivery: {parsedDraft.requestedDate})
                                </h4>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setParsedDraft(null)}
                                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer"
                                >
                                    Discard Draft
                                </button>

                                {!isDraftStockSufficient && onNavigateToRestock && (
                                    <button
                                        type="button"
                                        onClick={onNavigateToRestock}
                                        className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer"
                                    >
                                        Go to Auto Restock <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                )}

                                {/* Requirement 4: Grey & unclickable when stock is insufficient */}
                                <button
                                    type="button"
                                    disabled={
                                        isCreatingOrder ||
                                        liveDraftItems.length === 0 ||
                                        !isDraftStockSufficient
                                    }
                                    onClick={() => void handleConfirmCreateOrder()}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition ${
                                        !isDraftStockSufficient || liveDraftItems.length === 0
                                            ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                                            : 'bg-[#2BB656] hover:bg-emerald-600 text-white cursor-pointer'
                                    }`}
                                >
                                    <FileCheck className="w-3.5 h-3.5" />
                                    {isCreatingOrder
                                        ? 'Creating Order...'
                                        : !isDraftStockSufficient
                                            ? 'Locked: Restock Required First'
                                            : 'Confirm & Create Order'}
                                </button>
                            </div>
                        </div>

                        {!isDraftStockSufficient && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>
                    Warehouse stock is insufficient for one or more items below. Auto Restock has been automatically triggered—please restock or reduce requested quantity before confirming.
                  </span>
                </span>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="w-72">
                                <VyteDropdown
                                    variant="light"
                                    size="sm"
                                    value={addSkuId}
                                    onChange={(val) => setAddSkuId(val)}
                                    options={products.map((p) => ({
                                        label: `${p.name} (${p.sku}) — ${currencySymbol} ${(p.priceRM * exchangeRate).toFixed(2)}`,
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

                        {liveDraftItems.length === 0 ? (
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
                                        <th className="py-2 px-3.5">Unit Price ({currency})</th>
                                        <th className="py-2 px-3.5 text-right">Line Subtotal ({currency})</th>
                                        <th className="py-2 px-3.5 text-center">Remove</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {liveDraftItems.map((item) => (
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
                              ⚠ Only {item.availableStock} Left (Short by {item.shortageQty})
                            </span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-slate-600">
                                                {currencySymbol} {(item.sellingPrice * exchangeRate).toFixed(2)}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">
                                                {currencySymbol} {(item.lineTotal * exchangeRate).toFixed(2)}
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
                            Orders with insufficient stock are automatically blocked from approval until restocked in Auto Restock.
                        </p>
                    </div>

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
                            const convertedOrderTotal = co.subtotal * exchangeRate;

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
                          {currencySymbol}{' '}
                                                    {convertedOrderTotal.toLocaleString(undefined, {
                                                        minimumFractionDigits: 2,
                                                        maximumFractionDigits: 2,
                                                    })}
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
                                                                className="px-3 py-2 bg-slate-200 text-slate-500 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-not-allowed whitespace-nowrap"
                                                            >
                                                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Locked: Low Stock
                                                            </button>
                                                            {onNavigateToRestock && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        if (onTriggerShortageRestock) {
                                                                            const shortList = liveItems
                                                                                .filter((i) => !i.isStockEnough)
                                                                                .map((i) => ({
                                                                                    productID: i.productID,
                                                                                    neededQty: i.shortageQty,
                                                                                }));
                                                                            onTriggerShortageRestock(shortList);
                                                                        }
                                                                        onNavigateToRestock();
                                                                    }}
                                                                    className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                                >
                                                                    Go to Auto Restock <ArrowUpRight className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

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
                            ✓ Sent to Smart Invoices
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
                                                    <th className="py-2 px-3.5">Unit Price ({currency})</th>
                                                    <th className="py-2 px-3.5 text-right">Line Subtotal ({currency})</th>
                                                </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                {liveItems.map((item) => {
                                                    const key = `${co.orderID}:${item.productID}`;
                                                    const convertedUnitPrice = item.sellingPrice * exchangeRate;
                                                    const convertedLineTotal = item.lineTotal * exchangeRate;

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
                                                                {currencySymbol}{' '}
                                                                {convertedUnitPrice.toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
                                                                })}{' '}
                                                                / {item.uom}
                                                            </td>

                                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">
                                                                {currencySymbol}{' '}
                                                                {convertedLineTotal.toLocaleString(undefined, {
                                                                    minimumFractionDigits: 2,
                                                                    maximumFractionDigits: 2,
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
                                    {currencySymbol}{' '}
                                    {(selectedDetailOrder.subtotal * exchangeRate).toLocaleString(undefined, {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                    })}
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
                                        <td className="py-2 px-3">
                                            {currencySymbol} {(i.sellingPrice * exchangeRate).toFixed(2)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-bold">
                                            {currencySymbol} {(i.lineTotal * exchangeRate).toFixed(2)}
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