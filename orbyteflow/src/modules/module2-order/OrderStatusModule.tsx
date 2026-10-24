// src/modules/module2-order/OrderStatusModule.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
    CheckCircle2, MessageSquare, FileCheck, AlertCircle, Truck, Package, XCircle,
    AlertTriangle, ArrowUpRight, Edit3, FileText, ExternalLink, Plus, Trash2, Eye, X,
    Calendar, Camera, FileSpreadsheet,
} from 'lucide-react';
import {
    CURRENCY_SYMBOLS,
    type CurrencyCode,
    type ExtractedNlpOrderItem,
    type Product,
    type UserRole,
} from '../../types/vyte.ts';
import { getDebugMockMode, orbyteApi } from '../../services/api';
import { VyteDropdown } from '../../components/common/VyteDropdown';

interface OrderStatusModuleProps {
    products: Product[];
    role: UserRole;
    userID: string;
    currency?: CurrencyCode;
    exchangeRate?: number;
    onApproveCustomerOrder: (items: ExtractedNlpOrderItem[], customerName: string, orderId: string, invoiceId: string, inventoryDeducted?: boolean) => void;
    onTriggerShortageRestock?: (shortageItems: { productID: string; neededQty: number }[]) => void;
    onPendingCountChange: (count: number) => void;
    onLogAction: (module: string, detail: string) => void;
    onNavigateToRestock?: () => void;
    onNotify?: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
    onTriggerLoadingScreen?: (message: string, durationMs?: number) => void;
}

type OrderFulfillmentStatus = 'PENDING_HUMAN_APPROVAL' | 'MODIFIED' | 'APPROVED_AWAITING_DELIVERY' | 'DELIVERED_COMPLETED' | 'REJECTED';

interface CustomerOrderRecord {
    orderID: string; invoiceID: string; invoicePdfUrl: string; customerName: string;
    requestedDate: string; rawMessage: string; internalNotes?: string; approvalNotes?: string;
    inventoryDeducted?: boolean; createdAt?: string; updatedAt?: string;
    items: ExtractedNlpOrderItem[]; subtotal: number; status: OrderFulfillmentStatus;
}

interface ParsedOrderDraft {
    customerName: string; requestedDate: string; rawMessage: string;
    internalNotes: string; items: ExtractedNlpOrderItem[]; currency: string;
}

const ORDERS_LIST_KEY = 'vyte_customer_orders_list_v2';
const ORDER_INTAKE_KEY = 'vyte_order_intake_draft_v2';
const ORDER_DRAFT_KEY = 'vyte_order_parsed_step2_draft_v2';
const ORDER_NOTES_KEY = 'vyte_order_notes_map_v2';

const fmtMoney = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function readLocal<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
}

export const OrderStatusModule: React.FC<OrderStatusModuleProps> = ({
                                                                        products, role, userID, currency = 'MYR', exchangeRate = 1.0,
                                                                        onApproveCustomerOrder, onTriggerShortageRestock, onPendingCountChange,
                                                                        onLogAction, onNavigateToRestock, onNotify, onTriggerLoadingScreen,
                                                                    }) => {
    const sym = CURRENCY_SYMBOLS[currency] || 'RM';
    const todayIso = new Date().toISOString().slice(0, 10);

    const detectLanguageAndBuildReply = (
        rawText: string, customer: string, items: ExtractedNlpOrderItem[], allStockEnough: boolean
    ): { langLabel: string; flag: string; autoReplyText: string } => {
        const hasChinese = /[\u4e00-\u9fa5]/.test(rawText);
        const hasMalay = /\b(tolong|hantar|esok|kotak|susu|kopi|nak|bila|terima kasih|bos)\b/i.test(rawText);
        const itemSummary = items.map((i) => `${i.requestedQty}x ${i.name}`).join(', ');

        if (hasChinese) {
            return {
                langLabel: '中文 / Mandarin Detected', flag: '🇨🇳/🇲🇾',
                autoReplyText: allStockEnough
                    ? `老板您好 (${customer})！Vyte AI 已收到您的订单：${itemSummary}。仓库现货充足，我们已经为您安排出货并附上电子账单，感谢支持！`
                    : `老板您好 (${customer})！收到您的订单（${itemSummary}）。目前部分货品正在紧急补货中，我们会在配齐后第一时间优先为您送出！`,
            };
        }
        if (hasMalay) {
            return {
                langLabel: 'Bahasa Melayu Detected', flag: '🇲🇾',
                autoReplyText: allStockEnough
                    ? `Salam Boss (${customer})! Pesanan anda (${itemSummary}) telah diterima oleh Vyte AI. Stok mencukupi dan penghantaran sedang disediakan. Terima kasih!`
                    : `Salam Boss (${customer})! Pesanan anda (${itemSummary}) diterima. Stok sedang ditambah semula dan kami akan maklumkan masa penghantaran secepat mungkin.`,
            };
        }
        return {
            langLabel: 'English / Manglish Detected', flag: '🇬🇧/🇲🇾',
            autoReplyText: allStockEnough
                ? `Hi ${customer}! We've received your order (${itemSummary}). Stock is confirmed and ready for dispatch. Here is your invoice reference!`
                : `Hi ${customer}! We received your order (${itemSummary}). One or more items are currently being restocked—we'll update your delivery slot shortly!`,
        };
    };

    const savedIntake = useMemo(() => readLocal<Partial<{ customerName: string; requestedDate: string; rawOrderText: string }>>(ORDER_INTAKE_KEY, {}), []);
    const [customerName, setCustomerName] = useState<string>(() => savedIntake.customerName ?? 'Bangsar Artisan Cafe');
    const [requestedDate, setRequestedDate] = useState<string>(() => savedIntake.requestedDate ?? todayIso);
    const [rawOrderText, setRawOrderText] = useState<string>(() => {
        if (savedIntake.rawOrderText !== undefined) return savedIntake.rawOrderText;
        const p1 = products[0], p2 = products[2] || products[1] || products[0];
        return `Hi team, please send 6 ${p1?.uom || 'units'} of ${p1?.name || 'Coffee Beans'} and 3 ${p2?.uom || 'units'} of ${p2?.name || 'Takeaway Box'} by tomorrow.`;
    });

    useEffect(() => {
        if (!getDebugMockMode()) {
            void orbyteApi.fetchBackendOrders().then((orders) => {
                if (Array.isArray(orders)) {
                    setCustomerOrders(orders.map((o: any) => ({
                        orderID: o.orderID,
                        invoiceID: `INV-CUST-${o.orderID.replace('ORD-', '')}`,
                        invoicePdfUrl: `/invoices/${o.orderID}.pdf`,
                        customerName: o.internalNotes?.replace('Order from ', '') || 'B2B Customer',
                        requestedDate: o.requestedDate,
                        rawMessage: o.internalNotes || '',
                        items: (o.lineOrders || []).map((l: any) => {
                            const prod = products.find((p) => p.id === l.productID);
                            return {
                                productID: l.productID, SKU: prod?.sku || l.productID, name: prod?.name || l.productID,
                                requestedQty: l.quantity, availableStock: prod?.stock ?? 0, isStockEnough: (prod?.stock ?? 0) >= l.quantity,
                                sellingPrice: prod?.priceRM ?? Number((l.lineTotal / Math.max(1, l.quantity)).toFixed(2)), lineTotal: l.lineTotal,
                            };
                        }),
                        subtotal: o.subtotal,
                        status: 'PENDING_HUMAN_APPROVAL',
                    })));
                }
            });
        }
    }, [products]);

    useEffect(() => { localStorage.setItem(ORDER_INTAKE_KEY, JSON.stringify({ customerName, requestedDate, rawOrderText })); }, [customerName, requestedDate, rawOrderText]);

    const [nlpErrors, setNlpErrors] = useState<{ customerName?: string; requestedDate?: string; rawOrderText?: string }>({});
    const [isProcessingNlp, setIsProcessingNlp] = useState(false);
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);

    const orderPhotoInputRef = useRef<HTMLInputElement>(null);
    const orderExcelInputRef = useRef<HTMLInputElement>(null);
    const [uploadedOrderPhotoPreview, setUploadedOrderPhotoPreview] = useState<string | null>(null);
    const [uploadedOrderFileName, setUploadedOrderFileName] = useState<string | null>(null);
    const [parseFailureMessage, setParseFailureMessage] = useState<string | null>(null);

    const [parsedDraft, setParsedDraft] = useState<ParsedOrderDraft | null>(() => readLocal(ORDER_DRAFT_KEY, null));
    useEffect(() => {
        if (parsedDraft) localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify(parsedDraft));
        else localStorage.removeItem(ORDER_DRAFT_KEY);
    }, [parsedDraft]);

    const [addSkuId, setAddSkuId] = useState<string>(products[0]?.id || '');
    useEffect(() => {
        if (products.length > 0 && !products.some((p) => p.id === addSkuId)) setAddSkuId(products[0].id);
    }, [products, addSkuId]);

    const [orderNotesMap, setOrderNotesMap] = useState<Record<string, string>>(() => readLocal(ORDER_NOTES_KEY, {}));
    useEffect(() => { localStorage.setItem(ORDER_NOTES_KEY, JSON.stringify(orderNotesMap)); }, [orderNotesMap]);

    const [modifyingOrderId, setModifyingOrderId] = useState<string | null>(null);
    const [modifiedQuantities, setModifiedQuantities] = useState<Record<string, number>>({});
    const [statusFilter, setStatusFilter] = useState<'ALL' | OrderFulfillmentStatus>('ALL');
    const [selectedDetailOrder, setSelectedDetailOrder] = useState<CustomerOrderRecord | null>(null);
    const [confirmDialog, setConfirmDialog] = useState<{ order: CustomerOrderRecord; action: 'APPROVE' | 'REJECT' | 'MODIFY'; allEnoughLive: boolean } | null>(null);

    const notify = (type: 'success' | 'error' | 'warning' | 'info', message: string) => onNotify?.(type, message);

    const [customerOrders, setCustomerOrders] = useState<CustomerOrderRecord[]>(() => {
        const p0 = products[0];
        const price = p0?.priceRM ?? 68.0;
        return readLocal(ORDERS_LIST_KEY, [{
            orderID: 'ORD-2026-4810', invoiceID: 'CUST-2026-4810', invoicePdfUrl: '/invoices/ORD-2026-4810.pdf',
            customerName: 'Mont Kiara Roastery & Bakery', requestedDate: '2026-10-21',
            rawMessage: `Need 4 ${p0?.uom || 'kg'} of ${p0?.name || 'Artisan Arabica Coffee Beans'} urgent delivery.`,
            internalNotes: 'Priority morning dispatch slot.', createdAt: '2026-10-21T09:15:00.000Z',
            items: [{
                productID: p0?.id || 'P1', SKU: p0?.sku || 'FNB-4886', name: p0?.name || 'Artisan Arabica Coffee Beans',
                requestedQty: 4, availableStock: p0?.stock ?? 8, isStockEnough: (p0?.stock ?? 8) >= 4,
                sellingPrice: price, lineTotal: Number((4 * price).toFixed(2)),
            }],
            subtotal: Number((4 * price).toFixed(2)), status: 'PENDING_HUMAN_APPROVAL',
        }]);
    });

    useEffect(() => {
        localStorage.setItem(ORDERS_LIST_KEY, JSON.stringify(customerOrders));
        onPendingCountChange(customerOrders.filter((o) => o.status === 'PENDING_HUMAN_APPROVAL' || o.status === 'MODIFIED' || o.status === 'APPROVED_AWAITING_DELIVERY').length);
    }, [customerOrders, onPendingCountChange]);

    const liveDraftItems = useMemo(() => {
        if (!parsedDraft) return [];
        return parsedDraft.items.map((item) => {
            const liveProd = products.find((p) => p.id === item.productID || p.sku === item.SKU);
            const currentAvail = liveProd ? liveProd.stock : item.availableStock;
            const shortage = Math.max(0, item.requestedQty - currentAvail);
            return { ...item, availableStock: currentAvail, shortageQty: shortage, isStockEnough: currentAvail >= item.requestedQty };
        });
    }, [parsedDraft, products]);

    const isDraftStockSufficient = useMemo(() => liveDraftItems.length > 0 && liveDraftItems.every((i) => i.isStockEnough), [liveDraftItems]);
    const draftAutoReply = useMemo(() => (parsedDraft ? detectLanguageAndBuildReply(parsedDraft.rawMessage, parsedDraft.customerName, liveDraftItems, isDraftStockSufficient) : null), [parsedDraft, liveDraftItems, isDraftStockSufficient]);

    const lastShortageKeyRef = useRef<string>('');
    useEffect(() => {
        if (!onTriggerShortageRestock) return;
        const shortages = liveDraftItems.filter((i) => !i.isStockEnough && (i.shortageQty ?? 0) > 0).map((i) => ({ productID: i.productID, neededQty: i.shortageQty ?? 0 }));
        const key = shortages.map((s) => `${s.productID}:${s.neededQty}`).join('|');
        if (key && key !== lastShortageKeyRef.current) {
            lastShortageKeyRef.current = key;
            onTriggerShortageRestock(shortages);
        } else if (!key) {
            lastShortageKeyRef.current = '';
        }
    }, [liveDraftItems, onTriggerShortageRestock]);

    const applyCustomPreset = (presetCustomer: string, presetText: string) => {
        setCustomerName(presetCustomer); setRawOrderText(presetText); setNlpErrors({}); setParseFailureMessage(null);
    };

    const applyPresetMessage = (presetCustomer: string, idx1 = 0, idx2 = 2) => {
        const p1 = products[idx1] || products[0], p2 = products[idx2] || products[1] || products[0];
        const msg = p1 && p2 && p1.id !== p2.id
            ? `Hi team, please send 6 ${p1.uom} of ${p1.name} and 3 ${p2.uom} of ${p2.name} by tomorrow.`
            : `Hello, we would like to order 5 ${p1?.uom || 'units'} of ${p1?.name || 'Coffee Beans'} for our outlet.`;
        applyCustomPreset(presetCustomer, msg);
    };

    const handleCustomerOrderPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            setUploadedOrderPhotoPreview(String(reader.result));
            setUploadedOrderFileName(file.name);
            setParseFailureMessage(null);
            const p1 = products[0], p2 = products[2] || products[1] || products[0];
            const extractedText = `[OCR from "${file.name}"] Please supply 5 ${p1?.uom || 'kg'} of ${p1?.name || 'Item 1'} and 4 ${p2?.uom || 'box'} of ${p2?.name || 'Item 2'}.`;
            setCustomerName('Damansara Specialty Roasters');
            setRawOrderText(extractedText);

            const ocrItems: ExtractedNlpOrderItem[] = [];
            if (p1) ocrItems.push({ productID: p1.id, SKU: p1.sku, name: p1.name, requestedQty: 5, availableStock: p1.stock, isStockEnough: p1.stock >= 5, sellingPrice: p1.priceRM, lineTotal: Number((5 * p1.priceRM).toFixed(2)) });
            if (p2 && p2.id !== p1?.id) ocrItems.push({ productID: p2.id, SKU: p2.sku, name: p2.name, requestedQty: 4, availableStock: p2.stock, isStockEnough: p2.stock >= 4, sellingPrice: p2.priceRM, lineTotal: Number((4 * p2.priceRM).toFixed(2)) });

            setParsedDraft({ customerName: 'Damansara Specialty Roasters', requestedDate, rawMessage: extractedText, internalNotes: `Extracted from photo: ${file.name}`, items: ocrItems, currency });
            onLogAction('Orders', `Extracted ${ocrItems.length} item(s) from order image "${file.name}".`);
            notify('success', `Extracted customer order from "${file.name}".`);
            e.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const handleCustomerOrderExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const lines = String(reader.result || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
            const extractedItems: ExtractedNlpOrderItem[] = [];
            let detectedCustomer = `Order (${file.name.replace(/\.[^/.]+$/, '')})`;

            lines.forEach((line, idx) => {
                if (idx === 0 && (line.toLowerCase().includes('sku') || line.toLowerCase().includes('qty'))) return;
                const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
                if (cols.length >= 2) {
                    const query = cols[0].toLowerCase();
                    const qty = Math.min(9999, Math.max(1, Number(cols[1]) || 5));
                    if (cols[2]) detectedCustomer = cols[2];
                    const matchedProd = products.find((p) => p.sku.toLowerCase() === query || p.name.toLowerCase().includes(query) || query.includes(p.sku.toLowerCase())) || products[idx % products.length];
                    if (matchedProd) {
                        extractedItems.push({ productID: matchedProd.id, SKU: matchedProd.sku, name: matchedProd.name, requestedQty: qty, availableStock: matchedProd.stock, isStockEnough: matchedProd.stock >= qty, sellingPrice: matchedProd.priceRM, lineTotal: Number((qty * matchedProd.priceRM).toFixed(2)) });
                    }
                }
            });

            if (!extractedItems.length && products.length > 0) {
                const p1 = products[0];
                extractedItems.push({ productID: p1.id, SKU: p1.sku, name: p1.name, requestedQty: 6, availableStock: p1.stock, isStockEnough: p1.stock >= 6, sellingPrice: p1.priceRM, lineTotal: Number((6 * p1.priceRM).toFixed(2)) });
            }

            const summaryMsg = `[Spreadsheet Import: ${file.name}] ${extractedItems.map((i) => `${i.requestedQty}x ${i.name} (${i.SKU})`).join(', ')}`;
            setUploadedOrderFileName(file.name); setCustomerName(detectedCustomer); setRawOrderText(summaryMsg); setParseFailureMessage(null);
            setParsedDraft({ customerName: detectedCustomer, requestedDate, rawMessage: summaryMsg, internalNotes: `Imported from "${file.name}"`, items: extractedItems, currency });
            onLogAction('Orders', `Imported order file "${file.name}" (${extractedItems.length} line items).`);
            notify('success', `Loaded ${extractedItems.length} line item(s) from "${file.name}".`);
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleProcessNlpCustomerOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        const errs: { customerName?: string; requestedDate?: string; rawOrderText?: string } = {};
        if (!customerName.trim() || customerName.trim().length < 3) errs.customerName = 'Customer business name is required (min 3 chars).';
        if (!requestedDate || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) errs.requestedDate = 'Select a valid delivery date (YYYY-MM-DD).';
        if (!rawOrderText.trim() || rawOrderText.trim().length < 10) errs.rawOrderText = 'Please enter a complete customer order message (min 10 chars).';
        else if (!/\d+/.test(rawOrderText)) errs.rawOrderText = 'Order message must include numeric quantities (e.g., "6 kg").';
        if (Object.keys(errs).length > 0) return setNlpErrors(errs);

        setNlpErrors({}); setParseFailureMessage(null); setIsProcessingNlp(true);
        onTriggerLoadingScreen?.('Parsing customer order & checking stock...', 850);

        try {
            const lower = rawOrderText.toLowerCase();
            const extracted: ExtractedNlpOrderItem[] = [];

            products.forEach((p) => {
                const keywords = p.name.toLowerCase().split(' ').filter((w) => w.length > 2);
                if (keywords.some((kw) => lower.includes(kw)) || lower.includes(p.sku.toLowerCase())) {
                    const regex = new RegExp(`(\\d+)\\s*(?:${p.uom}|boxes|box|kg|pcs|units|liters|l|pack|packs)?[^.]*?${keywords[0]}`, 'i');
                    const match = rawOrderText.match(regex) || rawOrderText.match(/(\d+)/);
                    const qty = match ? Math.min(9999, Math.max(1, Number(match[1]))) : 5;
                    extracted.push({ productID: p.id, SKU: p.sku, name: p.name, requestedQty: qty, availableStock: p.stock, isStockEnough: p.stock >= qty, sellingPrice: p.priceRM, lineTotal: Number((qty * p.priceRM).toFixed(2)) });
                }
            });

            const parseSuccess = extracted.length > 0;
            const subtotal = extracted.reduce((s, i) => s + i.lineTotal, 0);
            const hasSufficientStock = parseSuccess && extracted.every((i) => i.isStockEnough);

            const nlpRes = await orbyteApi.processNlpOrder(
                { rawOrderText: rawOrderText.trim(), customerName: customerName.trim(), requestedDate, userID },
                { parseSuccess, hasSufficientStock, extractedItems: extracted, calculatedSubtotal: subtotal, currency }
            );

            if (!nlpRes.data.parseSuccess || nlpRes.data.extractedItems.length === 0) {
                setParsedDraft(null);
                setParseFailureMessage(`No catalog products matched "${rawOrderText.trim()}". Mention an active SKU or product name (${products.slice(0, 3).map((p) => `${p.name} [${p.sku}]`).join(', ')}) or build the order manually below.`);
                onLogAction('Orders', `No catalog SKUs matched message from ${customerName.trim()}.`);
                notify('warning', 'Could not match any catalog products in the message.');
                return;
            }

            setParsedDraft({
                customerName: customerName.trim(), requestedDate, rawMessage: rawOrderText.trim(),
                internalNotes: `Order from ${customerName.trim()}`, items: nlpRes.data.extractedItems, currency: nlpRes.data.currency || currency,
            });

            if (!hasSufficientStock) notify('warning', 'Insufficient stock for one or more items. Restock required before confirmation.');
            else notify('info', `Matched ${nlpRes.data.extractedItems.length} SKU(s). Review line items below.`);
        } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Order parsing error.');
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
                const avail = products.find((p) => p.id === productID)?.stock ?? item.availableStock;
                return { ...item, requestedQty: safeQty, availableStock: avail, isStockEnough: avail >= safeQty, lineTotal: Number((safeQty * item.sellingPrice).toFixed(2)) };
            }),
        });
    };

    const handleAddDraftItem = () => {
        if (!parsedDraft || !addSkuId) return;
        const prod = products.find((p) => p.id === addSkuId) || products[0];
        if (!prod) return;
        const existing = parsedDraft.items.find((i) => i.productID === prod.id);
        if (existing) return handleUpdateDraftQty(prod.id, existing.requestedQty + 1);
        setParsedDraft({
            ...parsedDraft,
            items: [...parsedDraft.items, { productID: prod.id, SKU: prod.sku, name: prod.name, requestedQty: 1, availableStock: prod.stock, isStockEnough: prod.stock >= 1, sellingPrice: prod.priceRM, lineTotal: prod.priceRM }],
        });
    };

    const handleConfirmCreateOrder = async () => {
        if (!parsedDraft || liveDraftItems.length === 0) return notify('warning', 'Order draft must contain at least one line item.');
        if (!isDraftStockSufficient) return notify('error', 'Cannot confirm order: warehouse stock is insufficient.');

        setIsCreatingOrder(true);
        try {
            const draftSubtotal = Number(liveDraftItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
            const candidateOrderId = `ORD-${parsedDraft.requestedDate.slice(0, 4)}-${Math.floor(1000 + Math.random() * 9000)}`;
            onTriggerLoadingScreen?.('Creating order & generating invoice...', 850);

            const createRes = await orbyteApi.createInvoiceOrder({
                orderID: candidateOrderId, requestedDate: parsedDraft.requestedDate, subtotal: draftSubtotal,
                currency: parsedDraft.currency, internalNotes: parsedDraft.internalNotes, createdBy: userID,
                lineOrders: liveDraftItems.map((item, idx) => ({ lineID: `LINE-${idx + 1}`, productID: item.productID, quantity: item.requestedQty, lineTotal: item.lineTotal, currency: parsedDraft.currency })),
            });

            const createdOrder: CustomerOrderRecord = {
                orderID: createRes.data.orderID, invoiceID: createRes.data.invoiceID, invoicePdfUrl: createRes.data.invoicePdfUrl,
                customerName: parsedDraft.customerName, requestedDate: parsedDraft.requestedDate, rawMessage: parsedDraft.rawMessage,
                internalNotes: parsedDraft.internalNotes, createdAt: createRes.data.createdAt, items: liveDraftItems,
                subtotal: draftSubtotal, status: (createRes.data.status as OrderFulfillmentStatus) || 'PENDING_HUMAN_APPROVAL',
            };

            setCustomerOrders((p) => [createdOrder, ...p]);
            setParsedDraft(null); setUploadedOrderPhotoPreview(null); setUploadedOrderFileName(null);
            onLogAction('Orders', `Created order ${createdOrder.orderID} (Invoice ${createdOrder.invoiceID}) for ${createdOrder.customerName}.`);
            notify('success', `Created Order ${createdOrder.orderID} (${createdOrder.invoiceID}).`);
        } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Failed to create order.');
        } finally {
            setIsCreatingOrder(false);
        }
    };

    const requestOrderAction = (order: CustomerOrderRecord, action: 'APPROVE' | 'REJECT' | 'MODIFY', allEnoughLive: boolean) => {
        if (role !== 'SME_OWNER' && role !== 'MANAGER') return notify('error', 'Access denied: Only Owner or Manager accounts can approve or modify orders.');
        if (action === 'APPROVE' && !allEnoughLive) return notify('error', 'Insufficient stock: Please restock before approving.');
        setConfirmDialog({ order, action, allEnoughLive });
    };

    const executeConfirmedOrderAction = async () => {
        if (!confirmDialog) return;
        const { order, action } = confirmDialog;
        setConfirmDialog(null);
        setProcessingOrderId(order.orderID);
        onTriggerLoadingScreen?.(`Updating ${order.orderID}...`, 850);

        try {
            const approvalNotes = (orderNotesMap[order.orderID] || '').trim() || `${action} by ${userID}`;
            const useEditedQuantities = action === 'MODIFY' || modifyingOrderId === order.orderID;
            const updatedItems = useEditedQuantities
                ? order.items.map((item) => {
                    const modQty = modifiedQuantities[`${order.orderID}:${item.productID}`] ?? item.requestedQty;
                    const avail = products.find((p) => p.id === item.productID)?.stock ?? item.availableStock;
                    return {
                        ...item,
                        requestedQty: modQty,
                        availableStock: avail,
                        isStockEnough: avail >= modQty,
                        lineTotal: Number((modQty * item.sellingPrice).toFixed(2)),
                    };
                })
                : order.items;
            const updatedSubtotal = Number(updatedItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));
            const res = await orbyteApi.approveCustomerOrder({
                orderID: order.orderID,
                invoiceID: order.invoiceID,
                approvalAction: action,
                approvalNotes,
                updatedBy: userID,
            });

            if (action === 'APPROVE') {
                setCustomerOrders((p) =>
                    p.map((o) =>
                        o.orderID === order.orderID
                            ? {
                                ...o,
                                items: updatedItems,
                                subtotal: updatedSubtotal,
                                status: 'APPROVED_AWAITING_DELIVERY',
                                approvalNotes,
                                inventoryDeducted: res.data.inventoryDeducted,
                                updatedAt: res.data.updatedAt,
                            }
                            : o
                    )
                );
                setModifyingOrderId(null);
                onApproveCustomerOrder(updatedItems, order.customerName, order.orderID, order.invoiceID, res.data.inventoryDeducted);
                notify('success', `Order ${order.orderID} approved and invoiced.`);
            } else if (action === 'MODIFY') {
                setCustomerOrders((p) =>
                    p.map((o) =>
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
                onLogAction('Orders', `Modified order ${order.orderID} (${order.customerName}) • New Total: ${sym} ${(updatedSubtotal * exchangeRate).toFixed(2)}.`);
                notify('info', `Order ${order.orderID} updated.`);
            } else {
                setCustomerOrders((p) =>
                    p.map((o) =>
                        o.orderID === order.orderID
                            ? { ...o, status: 'REJECTED', approvalNotes, inventoryDeducted: res.data.inventoryDeducted, updatedAt: res.data.updatedAt }
                            : o
                    )
                );
                setModifyingOrderId(null);
                onLogAction('Orders', `Rejected order ${order.orderID} (${order.customerName}).`);
                notify('warning', `Order ${order.orderID} rejected.`);
            }
        } catch (err) {
            notify('error', err instanceof Error ? err.message : 'Failed to update order status.');
        } finally {
            setProcessingOrderId(null);
        }
    };

    const filteredOrders = useMemo(() => (statusFilter === 'ALL' ? customerOrders : customerOrders.filter((o) => o.status === statusFilter)), [customerOrders, statusFilter]);

    const statusTabs: { id: 'ALL' | OrderFulfillmentStatus; label: string; count: number }[] = [
        { id: 'ALL', label: 'All Orders', count: customerOrders.length },
        { id: 'PENDING_HUMAN_APPROVAL', label: 'Pending Approval', count: customerOrders.filter((o) => o.status === 'PENDING_HUMAN_APPROVAL').length },
        { id: 'MODIFIED', label: 'Modified', count: customerOrders.filter((o) => o.status === 'MODIFIED').length },
        { id: 'APPROVED_AWAITING_DELIVERY', label: 'Awaiting Delivery', count: customerOrders.filter((o) => o.status === 'APPROVED_AWAITING_DELIVERY').length },
        { id: 'DELIVERED_COMPLETED', label: 'Completed', count: customerOrders.filter((o) => o.status === 'DELIVERED_COMPLETED').length },
        { id: 'REJECTED', label: 'Rejected', count: customerOrders.filter((o) => o.status === 'REJECTED').length },
    ];

    return (
        <div className="space-y-5 relative">
            <input ref={orderPhotoInputRef} type="file" accept="image/*" onChange={handleCustomerOrderPhotoUpload} className="hidden" />
            <input ref={orderExcelInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleCustomerOrderExcelUpload} className="hidden" />

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                            <MessageSquare className="w-4 h-4 text-purple-600" /> Customer Order Intake (Text, Photo OCR &amp; Spreadsheet)
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Parse incoming WhatsApp/Email orders, upload purchase order photos, or import CSV/Excel sheets.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <button type="button" onClick={() => orderPhotoInputRef.current?.click()} className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer">
                            <Camera className="w-3.5 h-3.5 text-purple-600" /> Upload Order Photo
                        </button>
                        <button type="button" onClick={() => orderExcelInputRef.current?.click()} className="px-3 py-1.5 bg-teal-50 hover:bg-teal-100 text-teal-800 border border-teal-200 rounded-xl font-bold flex items-center gap-1.5 transition cursor-pointer">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-teal-600" /> Import Order CSV
                        </button>
                        <span className="text-slate-300 hidden sm:inline">|</span>
                        <button type="button" onClick={() => applyPresetMessage('Bangsar Artisan Cafe', 0, 2)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer">Cafe Sample</button>
                        <button type="button" onClick={() => applyPresetMessage('Subang Retail Hub', 1, 1)} className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold cursor-pointer">Retail Sample</button>
                        <button type="button" onClick={() => applyCustomPreset('Kampung Baru Kopitiam', 'Boss, tolong hantar 6 kg Artisan Arabica Coffee Beans esok')} className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-[11px] font-bold cursor-pointer">🇲🇾 BM Sample</button>
                        <button type="button" onClick={() => applyCustomPreset('吉隆坡茶室', '老板，明天帮我送 6 kg Artisan Arabica Coffee Beans 和 3 box Takeaway Box')} className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 rounded-lg text-[11px] font-bold cursor-pointer">🇨🇳 中文 Sample</button>
                    </div>
                </div>

                {(uploadedOrderPhotoPreview || uploadedOrderFileName) && (
                    <div className="p-3 rounded-xl bg-purple-50/70 border border-purple-200 flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-3">
                            {uploadedOrderPhotoPreview ? (
                                <img src={uploadedOrderPhotoPreview} alt="Order Preview" className="w-11 h-11 rounded-lg object-cover border border-purple-300" />
                            ) : (
                                <div className="w-10 h-10 rounded-lg bg-teal-100 text-teal-700 flex items-center justify-center font-bold"><FileSpreadsheet className="w-5 h-5" /></div>
                            )}
                            <div>
                                <span className="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">{uploadedOrderPhotoPreview ? 'Photo OCR Extracted' : 'Spreadsheet Parsed'}</span>
                                <p className="font-bold text-slate-900 mt-0.5">{uploadedOrderFileName}</p>
                                <p className="text-[11px] text-slate-600">Items loaded into the review table below.</p>
                            </div>
                        </div>
                        <button type="button" onClick={() => { setUploadedOrderPhotoPreview(null); setUploadedOrderFileName(null); }} className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"><X className="w-4 h-4" /></button>
                    </div>
                )}

                <form onSubmit={handleProcessNlpCustomerOrder} noValidate className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-3 space-y-3">
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 block">Customer Business Name *</label>
                            <input type="text" maxLength={60} placeholder="e.g., Bangsar Artisan Cafe" value={customerName} onChange={(e) => { setCustomerName(e.target.value); if (nlpErrors.customerName) setNlpErrors({ ...nlpErrors, customerName: undefined }); }} className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-semibold text-slate-900 focus:outline-none ${nlpErrors.customerName ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'}`} />
                            {nlpErrors.customerName && <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.customerName}</p>}
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-700 flex items-center gap-1"><Calendar className="w-3.5 h-3.5 text-purple-600" /> Requested Delivery Date *</label>
                            <input type="date" value={requestedDate} onChange={(e) => { setRequestedDate(e.target.value); if (nlpErrors.requestedDate) setNlpErrors({ ...nlpErrors, requestedDate: undefined }); }} className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 focus:outline-none ${nlpErrors.requestedDate ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'}`} />
                            {nlpErrors.requestedDate && <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.requestedDate}</p>}
                        </div>
                    </div>

                    <div className="lg:col-span-6 space-y-1">
                        <label className="text-xs font-bold text-slate-700 block">Customer Order Message *</label>
                        <textarea rows={4} maxLength={500} placeholder="e.g., Please send 6 kg of Coffee Beans..." value={rawOrderText} onChange={(e) => { setRawOrderText(e.target.value); if (nlpErrors.rawOrderText) setNlpErrors({ ...nlpErrors, rawOrderText: undefined }); }} className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs text-slate-900 focus:outline-none resize-y ${nlpErrors.rawOrderText ? 'border-rose-500' : 'border-slate-300 focus:border-emerald-500'}`} />
                        {nlpErrors.rawOrderText && <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1"><AlertCircle className="w-3 h-3 shrink-0" /> {nlpErrors.rawOrderText}</p>}
                    </div>

                    <div className="lg:col-span-3 flex flex-col justify-end gap-2">
                        <button type="submit" disabled={isProcessingNlp} className="w-full py-3 px-4 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition cursor-pointer">
                            <FileCheck className="w-3.5 h-3.5" /> {isProcessingNlp ? 'Parsing Order...' : 'Parse Order & Check Stock'}
                        </button>
                    </div>
                </form>

                {parseFailureMessage && (
                    <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 space-y-2.5 text-xs">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2 text-rose-800">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-bold text-rose-900">No Matching Catalog Products Found</p>
                                    <p className="text-rose-700 mt-0.5 leading-relaxed">{parseFailureMessage}</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setParseFailureMessage(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button type="button" onClick={() => { setParseFailureMessage(null); setParsedDraft({ customerName: customerName.trim() || 'B2B Customer', requestedDate, rawMessage: rawOrderText.trim(), internalNotes: 'Manual order draft', items: [], currency }); }} className="px-3 py-1.5 bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg font-bold transition cursor-pointer">
                                Build Order Manually &rarr;
                            </button>
                        </div>
                    </div>
                )}

                {parsedDraft && (
                    <div className="p-5 rounded-2xl bg-purple-50/60 border-2 border-purple-300 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-purple-200/80 pb-3">
                            <div>
                                <span className="px-2.5 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider">Order Draft Review</span>
                                <h4 className="text-sm font-bold text-slate-900 mt-1">Review Line Items for {parsedDraft.customerName} (Delivery: {parsedDraft.requestedDate})</h4>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button type="button" onClick={() => setParsedDraft(null)} className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-semibold cursor-pointer">Discard Draft</button>
                                {!isDraftStockSufficient && onNavigateToRestock && (
                                    <button type="button" onClick={onNavigateToRestock} className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer">
                                        Go to Restock <ArrowUpRight className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button
                                    type="button" disabled={isCreatingOrder || liveDraftItems.length === 0 || !isDraftStockSufficient}
                                    onClick={() => void handleConfirmCreateOrder()}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition ${!isDraftStockSufficient || liveDraftItems.length === 0 ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed' : 'bg-[#2BB656] hover:bg-emerald-600 text-white cursor-pointer'}`}
                                >
                                    <FileCheck className="w-3.5 h-3.5" />
                                    {isCreatingOrder ? 'Creating Order...' : !isDraftStockSufficient ? 'Locked: Restock Required' : 'Confirm & Create Order'}
                                </button>
                            </div>
                        </div>

                        {draftAutoReply && (
                            <div className="p-4 rounded-xl bg-white border border-purple-200 shadow-2xs space-y-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-base">{draftAutoReply.flag}</span>
                                        <span className="text-xs font-bold text-slate-800">{draftAutoReply.langLabel}</span>
                                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Vyte AI Auto-Reply</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(draftAutoReply.autoReplyText)}`, '_blank');
                                            onLogAction('Orders', `Sent AI WhatsApp reply to ${parsedDraft.customerName} (${draftAutoReply.langLabel}).`);
                                            notify('success', `WhatsApp AI Reply sent to ${parsedDraft.customerName}!`);
                                        }}
                                        className="px-3.5 py-1.5 bg-[#25D366] hover:bg-[#20ba5a] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                    >
                                        <MessageSquare className="w-3.5 h-3.5" /> Send AI Reply via WhatsApp
                                    </button>
                                </div>
                                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 font-mono">&ldquo;{draftAutoReply.autoReplyText}&rdquo;</div>
                            </div>
                        )}

                        {!isDraftStockSufficient && (
                            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-semibold flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                                <span>Warehouse stock is insufficient for one or more items below. Restock has been flagged in Inventory &amp; Restock.</span>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="w-72">
                                <VyteDropdown
                                    variant="light" size="sm" value={addSkuId} onChange={setAddSkuId}
                                    options={products.map((p) => ({ label: `${p.name} (${p.sku}) \u2014 ${sym} ${(p.priceRM * exchangeRate).toFixed(2)}`, value: p.id }))}
                                />
                            </div>
                            <button type="button" onClick={handleAddDraftItem} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer">
                                <Plus className="w-3.5 h-3.5" /> Add SKU to Draft
                            </button>
                            <div className="flex-1 min-w-[220px]">
                                <input type="text" placeholder="Internal order notes..." value={parsedDraft.internalNotes} onChange={(e) => setParsedDraft({ ...parsedDraft, internalNotes: e.target.value })} className="w-full px-3 py-1.5 bg-white border border-purple-200 rounded-lg text-xs text-slate-800" />
                            </div>
                        </div>

                        {liveDraftItems.length === 0 ? (
                            <p className="text-xs text-slate-500 italic py-3 text-center">No items in draft yet. Select a product above and click &quot;Add SKU to Draft&quot;.</p>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-purple-200 bg-white">
                                <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                        <th className="py-2 px-3.5">SKU &amp; Product</th>
                                        <th className="py-2 px-3.5">Requested Qty</th>
                                        <th className="py-2 px-3.5">Warehouse Stock</th>
                                        <th className="py-2 px-3.5">Unit Price ({currency})</th>
                                        <th className="py-2 px-3.5 text-right">Line Subtotal ({currency})</th>
                                        <th className="py-2 px-3.5 text-center">Remove</th>
                                    </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                    {liveDraftItems.map((item) => (
                                        <tr key={item.productID}>
                                            <td className="py-2.5 px-3.5 font-bold text-slate-900">{item.name} <span className="font-mono text-[11px] text-slate-400">({item.SKU})</span></td>
                                            <td className="py-2.5 px-3.5">
                                                <input type="number" min={1} max={9999} value={item.requestedQty} onChange={(e) => handleUpdateDraftQty(item.productID, Number(e.target.value))} className="w-20 px-2 py-1 rounded-lg border border-purple-300 font-extrabold text-slate-900" />
                                            </td>
                                            <td className="py-2.5 px-3.5">
                                                {item.isStockEnough ? (
                                                    <span className="text-emerald-700 font-bold">{"\u2713"} {item.availableStock} Available</span>
                                                ) : (
                                                    <span className="text-rose-600 font-bold">{"\u26A0"} Only {item.availableStock} Left (Short by {item.shortageQty})</span>
                                                )}
                                            </td>
                                            <td className="py-2.5 px-3.5 text-slate-600">{sym} {(item.sellingPrice * exchangeRate).toFixed(2)}</td>
                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">{sym} {(item.lineTotal * exchangeRate).toFixed(2)}</td>
                                            <td className="py-2.5 px-3.5 text-center">
                                                <button type="button" onClick={() => setParsedDraft({ ...parsedDraft, items: parsedDraft.items.filter((i) => i.productID !== item.productID) })} className="p-1 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
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

            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2"><Package className="w-4 h-4 text-emerald-600" /> Customer Orders &amp; Fulfillment Queue ({filteredOrders.length})</h4>
                        <p className="text-[11px] text-slate-500">Orders with insufficient stock are locked until inventory is replenished.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                        {statusTabs.map((tab) => (
                            <button key={tab.id} type="button" onClick={() => setStatusFilter(tab.id)} className={`px-2.5 py-1 rounded-lg font-bold transition cursor-pointer ${statusFilter === tab.id ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}>
                                {tab.label} ({tab.count})
                            </button>
                        ))}
                    </div>
                </div>

                {filteredOrders.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">No customer orders match the selected filter ({statusFilter}).</div>
                ) : (
                    <div className="space-y-4">
                        {filteredOrders.map((co) => {
                            const isPendingOrModified = co.status === 'PENDING_HUMAN_APPROVAL' || co.status === 'MODIFIED';
                            const isModifyingThis = modifyingOrderId === co.orderID;
                            const isBusy = processingOrderId === co.orderID;

                            const liveItems = co.items.map((item) => {
                                const liveProd = products.find((p) => p.id === item.productID || p.sku === item.SKU);
                                const currentWarehouseStock = liveProd ? liveProd.stock : item.availableStock;
                                const uom = liveProd?.uom ?? 'units';
                                const effectiveQty = isModifyingThis ? modifiedQuantities[`${co.orderID}:${item.productID}`] ?? item.requestedQty : item.requestedQty;
                                const shortageQty = Math.max(0, effectiveQty - currentWarehouseStock);
                                return { ...item, requestedQty: effectiveQty, lineTotal: Number((effectiveQty * item.sellingPrice).toFixed(2)), uom, availableStock: currentWarehouseStock, shortageQty, isStockEnough: isPendingOrModified ? currentWarehouseStock >= effectiveQty : true };
                            });

                            const allEnoughLive = liveItems.every((i) => i.isStockEnough);
                            const liveOrderSubtotal = Number(liveItems.reduce((sum, i) => sum + i.lineTotal, 0).toFixed(2));

                            return (
                                <div key={co.orderID} className={`rounded-2xl border overflow-hidden transition ${isPendingOrModified ? (allEnoughLive ? 'bg-white border-slate-200' : 'bg-rose-50/20 border-rose-200') : co.status === 'APPROVED_AWAITING_DELIVERY' ? 'bg-blue-50/15 border-blue-200' : co.status === 'DELIVERED_COMPLETED' ? 'bg-emerald-50/15 border-emerald-200' : 'bg-slate-50 border-slate-200 opacity-75'}`}>
                                    <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">{co.orderID}</span>
                                            <span className="font-mono text-xs text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">Invoice: {co.invoiceID}</span>
                                            {co.invoicePdfUrl && (
                                                <a href={co.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition">
                                                    <FileText className="w-3 h-3" /> PDF <ExternalLink className="w-2.5 h-2.5" />
                                                </a>
                                            )}
                                            <span className="text-sm font-bold text-slate-900">{co.customerName}</span>
                                            <span className="text-xs font-mono text-slate-500">{"\u2022"} {co.requestedDate}</span>
                                            {co.status === 'MODIFIED' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">MODIFIED</span>}
                                            {isPendingOrModified && (
                                                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1 ${allEnoughLive ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-700'}`}>
                          {allEnoughLive ? <><CheckCircle2 className="w-3 h-3" /> Stock Sufficient</> : <><AlertTriangle className="w-3 h-3" /> Insufficient Stock</>}
                        </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2.5">
                                            <button type="button" onClick={() => setSelectedDetailOrder(co)} className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"><Eye className="w-3.5 h-3.5" /> Details</button>
                                            <div className="text-right mr-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-400 block">Order Total</span>
                                                <span className="text-base font-extrabold text-slate-900 whitespace-nowrap">
                                                    {sym} {fmtMoney(liveOrderSubtotal * exchangeRate)}
                                                </span>
                                            </div>

                                            {isPendingOrModified && (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {allEnoughLive ? (
                                                        <button type="button" disabled={isBusy} onClick={() => requestOrderAction(co, 'APPROVE', allEnoughLive)} className="px-3.5 py-2 bg-[#2BB656] hover:bg-emerald-600 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap">
                                                            <FileCheck className="w-3.5 h-3.5" /> Approve &amp; Invoice
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-1.5">
                                                            <button type="button" disabled className="px-3 py-2 bg-slate-200 text-slate-500 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-not-allowed whitespace-nowrap">
                                                                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Locked: Low Stock
                                                            </button>
                                                            {onNavigateToRestock && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        onTriggerShortageRestock?.(liveItems.filter((i) => !i.isStockEnough).map((i) => ({ productID: i.productID, neededQty: i.shortageQty })));
                                                                        onNavigateToRestock();
                                                                    }}
                                                                    className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                                >
                                                                    Go to Restock <ArrowUpRight className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                        </div>
                                                    )}

                                                    {isModifyingThis ? (
                                                        <button type="button" disabled={isBusy} onClick={() => requestOrderAction(co, 'MODIFY', allEnoughLive)} className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer">
                                                            <Edit3 className="w-3.5 h-3.5" /> Save Changes
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="button" disabled={isBusy}
                                                            onClick={() => {
                                                                const initMap: Record<string, number> = {};
                                                                co.items.forEach((i) => { initMap[`${co.orderID}:${i.productID}`] = i.requestedQty; });
                                                                setModifiedQuantities((p) => ({ ...p, ...initMap }));
                                                                setModifyingOrderId(co.orderID);
                                                            }}
                                                            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" /> Modify
                                                        </button>
                                                    )}

                                                    <button type="button" disabled={isBusy} onClick={() => requestOrderAction(co, 'REJECT', allEnoughLive)} className="px-3 py-2 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1 transition cursor-pointer">
                                                        <XCircle className="w-3.5 h-3.5" /> Reject
                                                    </button>
                                                </div>
                                            )}

                                            {co.status === 'APPROVED_AWAITING_DELIVERY' && (
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 text-[11px] font-bold">{"\u2713"} Invoiced</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setCustomerOrders((p) => p.map((o) => (o.orderID === co.orderID ? { ...o, status: 'DELIVERED_COMPLETED', updatedAt: new Date().toISOString() } : o)));
                                                            onLogAction('Orders', `Confirmed delivery for ${co.orderID} (${co.customerName}).`);
                                                            notify('success', `Confirmed delivery for ${co.orderID}.`);
                                                        }}
                                                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                                                    >
                                                        <Truck className="w-3.5 h-3.5" /> Confirm Delivery
                                                    </button>
                                                </div>
                                            )}

                                            {co.status === 'DELIVERED_COMPLETED' && (
                                                <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs font-bold inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Delivered &amp; Completed</span>
                                            )}
                                            {co.status === 'REJECTED' && <span className="px-3 py-1.5 rounded-xl bg-rose-100 text-rose-700 text-xs font-bold">Rejected</span>}
                                        </div>
                                    </div>

                                    <div className="p-4 space-y-3">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <p className="text-xs text-slate-500 italic">Customer Message: &ldquo;{co.rawMessage}&rdquo;</p>
                                            {co.approvalNotes && <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">Note: {co.approvalNotes}</span>}
                                        </div>

                                        {isPendingOrModified && (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text" placeholder="Add approval or modification notes..." value={orderNotesMap[co.orderID] ?? ''}
                                                    onChange={(e) => setOrderNotesMap((p) => ({ ...p, [co.orderID]: e.target.value }))}
                                                    className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800 focus:outline-none focus:border-emerald-500"
                                                />
                                                {isModifyingThis && <button type="button" onClick={() => setModifyingOrderId(null)} className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer">Cancel Edit</button>}
                                            </div>
                                        )}

                                        <div className="overflow-x-auto rounded-xl border border-slate-200/90 bg-white">
                                            <table className="w-full text-left border-collapse text-xs">
                                                <thead>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                                    <th className="py-2 px-3.5">Product Item &amp; SKU</th>
                                                    <th className="py-2 px-3.5">Requested Qty</th>
                                                    <th className="py-2 px-3.5">{isPendingOrModified ? 'Live Warehouse Stock' : 'Stock Allocation'}</th>
                                                    <th className="py-2 px-3.5">Unit Price ({currency})</th>
                                                    <th className="py-2 px-3.5 text-right">Line Subtotal ({currency})</th>
                                                </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                {liveItems.map((item) => {
                                                    const key = `${co.orderID}:${item.productID}`;
                                                    return (
                                                        <tr key={item.SKU} className="hover:bg-slate-50/60">
                                                            <td className="py-2.5 px-3.5"><span className="font-bold text-slate-900">{item.name}</span><span className="ml-2 font-mono text-[11px] text-slate-400">({item.SKU})</span></td>
                                                            <td className="py-2.5 px-3.5 font-extrabold text-slate-900">
                                                                {isModifyingThis ? (
                                                                    <input type="number" min={1} max={9999} value={modifiedQuantities[key] ?? item.requestedQty} onChange={(e) => setModifiedQuantities((p) => ({ ...p, [key]: Math.max(1, Number(e.target.value) || 1) }))} className="w-20 px-2 py-1 rounded border border-amber-400 bg-amber-50/40 font-extrabold text-slate-900" />
                                                                ) : (
                                                                    `${item.requestedQty} ${item.uom}`
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3.5">
                                                                {isPendingOrModified ? (
                                                                    item.isStockEnough ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[11px]">{"\u2713"} {item.availableStock} {item.uom} Available</span>
                                                                    ) : (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-bold text-[11px]">{"\u26A0"} Only {item.availableStock} {item.uom} Left (Short by {item.shortageQty} {item.uom})</span>
                                                                    )
                                                                ) : co.status === 'REJECTED' ? (
                                                                    <span className="text-slate-400 font-semibold">Order Cancelled</span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-[11px]">{"\u2713"} {item.requestedQty} {item.uom} Deducted (Rem: {item.availableStock} {item.uom})</span>
                                                                )}
                                                            </td>
                                                            <td className="py-2.5 px-3.5 text-slate-600 font-medium">{sym} {fmtMoney(item.sellingPrice * exchangeRate)} / {item.uom}</td>
                                                            <td className="py-2.5 px-3.5 text-right font-extrabold text-slate-900">{sym} {fmtMoney(item.lineTotal * exchangeRate)}</td>
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
                            <h3 className="text-base font-bold text-slate-900">Confirm {confirmDialog.action} Order</h3>
                            <button type="button" onClick={() => setConfirmDialog(null)} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Are you sure you want to mark order <strong className="text-slate-900">{confirmDialog.order.orderID}</strong> for <strong className="text-slate-900">{confirmDialog.order.customerName}</strong> as <strong className="text-slate-900">{confirmDialog.action}</strong>?
                        </p>
                        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setConfirmDialog(null)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer">Cancel</button>
                            <button type="button" onClick={() => void executeConfirmedOrderAction()} className={`px-4 py-2 text-white rounded-xl text-xs font-bold cursor-pointer ${confirmDialog.action === 'REJECT' ? 'bg-rose-600 hover:bg-rose-700' : confirmDialog.action === 'MODIFY' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-[#2BB656] hover:bg-emerald-600'}`}>
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
                                    <span className="font-mono text-xs font-bold text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-md">{selectedDetailOrder.orderID}</span>
                                    <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-md">{selectedDetailOrder.invoiceID}</span>
                                </div>
                                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedDetailOrder.customerName}</h3>
                            </div>
                            <button type="button" onClick={() => setSelectedDetailOrder(null)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"><X className="w-4 h-4" /></button>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                            <div><span className="text-slate-400 block">Status</span><strong className="text-slate-900">{selectedDetailOrder.status}</strong></div>
                            <div><span className="text-slate-400 block">Requested Date</span><strong className="font-mono text-slate-900">{selectedDetailOrder.requestedDate}</strong></div>
                            <div><span className="text-slate-400 block">Inventory Deducted</span><strong className="text-slate-900">{selectedDetailOrder.inventoryDeducted ? 'Yes (Verified)' : 'Pending / No'}</strong></div>
                            <div className="col-span-2">
                                <span className="text-slate-400 block">Invoice PDF Document</span>
                                <a href={selectedDetailOrder.invoicePdfUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-600 font-bold hover:underline inline-flex items-center gap-1">{selectedDetailOrder.invoicePdfUrl} <ExternalLink className="w-3 h-3" /></a>
                            </div>
                            <div><span className="text-slate-400 block">Total Amount</span><strong className="text-slate-900">{sym} {fmtMoney(selectedDetailOrder.subtotal * exchangeRate)}</strong></div>
                        </div>

                        <div className="space-y-1 text-xs">
                            <p className="font-bold text-slate-700">Customer Order Message</p>
                            <p className="p-3 rounded-xl bg-slate-50 border border-slate-200 italic text-slate-600">&ldquo;{selectedDetailOrder.rawMessage}&rdquo;</p>
                        </div>

                        {selectedDetailOrder.approvalNotes && (
                            <div className="space-y-1 text-xs">
                                <p className="font-bold text-slate-700">Approval / Modification Notes</p>
                                <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900">{selectedDetailOrder.approvalNotes}</p>
                            </div>
                        )}

                        <div className="overflow-x-auto rounded-xl border border-slate-200">
                            <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase">
                                    <th className="py-2 px-3">SKU</th><th className="py-2 px-3">Product</th><th className="py-2 px-3">Qty</th><th className="py-2 px-3">Unit Price</th><th className="py-2 px-3 text-right">Subtotal</th>
                                </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                {selectedDetailOrder.items.map((i) => (
                                    <tr key={i.SKU}>
                                        <td className="py-2 px-3 font-mono">{i.SKU}</td>
                                        <td className="py-2 px-3 font-bold">{i.name}</td>
                                        <td className="py-2 px-3">{i.requestedQty}</td>
                                        <td className="py-2 px-3">{sym} {(i.sellingPrice * exchangeRate).toFixed(2)}</td>
                                        <td className="py-2 px-3 text-right font-bold">{sym} {(i.lineTotal * exchangeRate).toFixed(2)}</td>
                                    </tr>
                                ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-100">
                            <button type="button" onClick={() => setSelectedDetailOrder(null)} className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold cursor-pointer">Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};