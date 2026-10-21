// src/services/api.ts
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    ApproveCustomerOrderRequest,
    ApproveCustomerOrderResponse,
    ConfirmRestockRequest,
    ConfirmRestockResponse,
    ContactSupplierRequest,
    ContactSupplierResponse,
    CreateInvoiceOrderRequest,
    CreateInvoiceOrderResponse,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    ProcessNlpOrderRequest,
    ProcessNlpOrderResponse,
} from '../types/vyte.ts';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8989/api';

export interface ApiExchangeLog {
    id: string;
    timestamp: string;
    method: 'GET' | 'POST' | 'PATCH';
    endpoint: string;
    requestPayload: unknown;
    responsePayload: unknown;
    isSimulatedFallback: boolean;
}

async function requestWithFallback<TReq, TRes>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    payload: TReq | undefined,
    fallbackGenerator: () => TRes,
    onExchange?: (log: ApiExchangeLog) => void
): Promise<{ data: TRes; isSimulatedFallback: boolean }> {
    const endpoint = `${API_BASE_URL}${path}`;
    const timestamp = new Date().toLocaleTimeString();

    try {
        const res = await fetch(endpoint, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: payload ? JSON.stringify(payload) : undefined,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as TRes;

        onExchange?.({
            id: `API-${Date.now()}`,
            timestamp,
            method,
            endpoint,
            requestPayload: payload ?? null,
            responsePayload: data,
            isSimulatedFallback: false,
        });
        return { data, isSimulatedFallback: false };
    } catch {
        // Frontend-only fallback when localhost:8989 is offline
        const fallbackData = fallbackGenerator();
        onExchange?.({
            id: `API-${Date.now()}`,
            timestamp,
            method,
            endpoint,
            requestPayload: payload ?? null,
            responsePayload: fallbackData,
            isSimulatedFallback: true,
        });
        return { data: fallbackData, isSimulatedFallback: true };
    }
}

export const orbyteApi = {
    // System Health Check: GET http://localhost:8989/api/ping
    async ping() {
        return requestWithFallback('GET', '/ping', undefined, () => ({
            status: 'OK',
            service: 'OrbyteFlow Backend Gateway',
            timestamp: new Date().toISOString(),
        }));
    },

    // ========================================================================
    // 1. AUTOMATION RESTOCK MODULE ENDPOINTS
    // ========================================================================

    // POST http://localhost:8989/api/restock/confirm
    async confirmRestock(
        payload: ConfirmRestockRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ConfirmRestockRequest, ConfirmRestockResponse>(
            'POST',
            '/restock/confirm',
            payload,
            () => ({
                poNumber: payload.poNumber,
                status: 'CONFIRMED',
                confirmationStatus: 'SUPPLIER_ACKNOWLEDGED',
                isConfirmed: true,
                message: `PO ${payload.poNumber} for ${payload.quantity} ${payload.unitOfMeasure} of ${payload.SKU} confirmed with ${payload.supplierName}.`,
                updatedAt: new Date().toISOString(),
            }),
            onExchange
        );
    },

    // POST http://localhost:8989/api/restock/contact-supplier
    async contactSupplier(
        payload: ContactSupplierRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ContactSupplierRequest, ContactSupplierResponse>(
            'POST',
            '/restock/contact-supplier',
            payload,
            () => ({
                poNumber: payload.poNumber,
                deliveryStatus: 'SENT',
                sentAt: new Date().toISOString(),
                responseCode: 200,
                message: `Dispatched automated ${payload.channel} order message to ${payload.supplierName} (${payload.supplierPhoneNumber}).`,
            }),
            onExchange
        );
    },

    // ========================================================================
    // 2. SALES REVIEW MODULE ENDPOINTS (Module 2)
    // ========================================================================

    // POST http://localhost:8989/api/sales-review/report
    async getSalesReviewReport(
        payload: GetSalesReviewReportRequest,
        fallbackData: GetSalesReviewReportResponse,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<GetSalesReviewReportRequest, GetSalesReviewReportResponse>(
            'POST',
            '/sales-review/report',
            payload,
            () => fallbackData,
            onExchange
        );
    },

    // POST http://localhost:8989/api/sales-review/analyze-procurement
    async analyzeProcurement(
        payload: AnalyzeProcurementRequest,
        fallbackData: AnalyzeProcurementResponse,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<AnalyzeProcurementRequest, AnalyzeProcurementResponse>(
            'POST',
            '/sales-review/analyze-procurement',
            payload,
            () => fallbackData,
            onExchange
        );
    },

    // ========================================================================
    // 3. ORDER MODULE ENDPOINTS (Module 3)
    // ========================================================================

    // POST http://localhost:8989/api/order/nlp-process
    async processNlpOrder(
        payload: ProcessNlpOrderRequest,
        fallbackData: ProcessNlpOrderResponse,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ProcessNlpOrderRequest, ProcessNlpOrderResponse>(
            'POST',
            '/order/nlp-process',
            payload,
            () => fallbackData,
            onExchange
        );
    },

    // POST http://localhost:8989/api/order
    async createInvoiceOrder(
        payload: CreateInvoiceOrderRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<CreateInvoiceOrderRequest, CreateInvoiceOrderResponse>(
            'POST',
            '/order',
            payload,
            () => ({
                orderID: payload.orderID,
                invoiceID: `INV-${payload.orderID.replace('ORD-', '')}`,
                status: 'PENDING_HUMAN_APPROVAL',
                databaseUpdated: true,
                invoicePdfUrl: `/invoices/${payload.orderID}.pdf`,
                createdAt: new Date().toISOString(),
            }),
            onExchange
        );
    },

    // PATCH http://localhost:8989/api/order/status
    async approveCustomerOrder(
        payload: ApproveCustomerOrderRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ApproveCustomerOrderRequest, ApproveCustomerOrderResponse>(
            'PATCH',
            '/order/status',
            payload,
            () => ({
                orderID: payload.orderID,
                finalStatus:
                    payload.approvalAction === 'APPROVE'
                        ? 'APPROVED'
                        : payload.approvalAction === 'REJECT'
                            ? 'REJECTED'
                            : 'MODIFIED',
                inventoryDeducted: payload.approvalAction === 'APPROVE',
                updatedAt: new Date().toISOString(),
                message: `Order ${payload.orderID} marked as ${payload.approvalAction} by ${payload.updatedBy}.`,
            }),
            onExchange
        );
    },
};