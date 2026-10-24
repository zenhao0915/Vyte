// src/services/api.ts
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    AuditLog,
    ExtractedNlpOrderItem,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    InvoiceItem,
    Product,
    QCAlert,
    UserRole,
    UserSession,
} from '../types/vyte.ts';
import {
    INITIAL_AUDIT_LOGS,
    INITIAL_COMPLIANCE_PROFILES,
    INITIAL_INVOICES,
    INITIAL_PRODUCTS,
    INITIAL_QC_ALERTS,
    INITIAL_RENEWAL_TASKS,
    INITIAL_VAULT_DOCS,
} from '../data/mockData';

const DEBUG_MODE_KEY = 'vyte_debug_mock_mode';
const API_BASE_URL_KEY = 'vyte_api_base_url';
const WORKSPACE_ID_KEY = 'vyte_isolated_workspace_id';
const AUTH_TOKEN_KEY = 'vyte_auth_token';

const MOCK_CACHE_KEYS = [
    'vyte_state_products_v2',
    'vyte_state_qc_v2',
    'vyte_state_invoices_v2',
    'vyte_state_logs_v2',
    'vyte_state_compliance_profiles_v1',
    'vyte_state_vault_docs_v1',
    'vyte_state_renewal_tasks_v1',
    'vyte_customer_orders_list_v2',
    'vyte_order_parsed_step2_draft_v2',
];

export function getActiveWorkspaceId(): string {
    const sessionStr = localStorage.getItem('vyte_session');
    if (sessionStr) {
        try {
            const user = JSON.parse(sessionStr);
            const identifier = user.email || user.userID;
            if (identifier) {
                return identifier.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
            }
        } catch {}
    }
    const custom = localStorage.getItem('vyte_workspace_id');
    if (custom && custom !== 'ws-mvm02vsm-0lwqs') {
        return custom;
    }
    return 'default';
}

export function getAuthHeaders(): Record<string, string> {
    const tenantId = getActiveWorkspaceId();
    const token = localStorage.getItem('accessToken') || localStorage.getItem('vyte_jwt') || '';
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Workspace-ID': tenantId,
        'X-User-ID': tenantId,
    };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}

export const getAuthToken = (): string | null => localStorage.getItem(AUTH_TOKEN_KEY);
export const setAuthToken = (token: string | null): void => {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
};

export const getDebugMockMode = (): boolean => {
    const raw = localStorage.getItem(DEBUG_MODE_KEY);
    return raw === null ? false : raw === 'true';
};

export const setDebugMockMode = (enabled: boolean): void => {
    localStorage.setItem(DEBUG_MODE_KEY, String(enabled));
    if (!enabled) MOCK_CACHE_KEYS.forEach((k) => localStorage.removeItem(k));
};

export const getApiBaseUrl = (): string => {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    return localStorage.getItem(API_BASE_URL_KEY) || metaEnv?.VITE_API_BASE_URL || 'http://localhost:8080';
};

export const setApiBaseUrl = (url: string): void => {
    localStorage.setItem(API_BASE_URL_KEY, url.trim().replace(/\/+$/, ''));
};

const getWorkspaceId = (): string => {
    const sessionStr = localStorage.getItem('vyte_session') || localStorage.getItem('user_session');
    if (sessionStr) {
        try {
            const user = JSON.parse(sessionStr);
            const identifier = user.email || user.userID;
            if (identifier) {
                const tenantId = identifier.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
                localStorage.setItem(WORKSPACE_ID_KEY, tenantId);
                return tenantId;
            }
        } catch {
        }
    }

    const wsId = localStorage.getItem(WORKSPACE_ID_KEY);
    if (wsId && !wsId.startsWith('ws-')) {
        return wsId;
    }

    return 'default';
};

export async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
    if (getDebugMockMode()) {
        throw new Error(`DEBUG_MOCK_MODE_ACTIVE: ${path}`);
    }

    const token = getAuthToken();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Workspace-ID': getWorkspaceId(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options?.headers as Record<string, string> || {}),
    };

    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        ...options,
        headers,
    });

    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${res.status}: ${res.statusText}`);
    }

    return (await res.json()) as T;
}

export const orbyteApi = {
    async checkBackendHealth(): Promise<boolean> {
        try {
            const res = await fetch(`${getApiBaseUrl()}/api/ping`, { method: 'GET' });
            return res.ok;
        } catch {
            return false;
        }
    },

    async registerAccount(payload: {
        firstName: string;
        lastName: string;
        email: string;
        password?: string;
        companyName: string;
        userType: 'CEO' | 'Manager' | 'Staff';
        role: string;
        acceptedTermsAt: string;
    }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Register Failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        const tenantId = payload.email.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        localStorage.setItem('vyte_workspace_id', tenantId);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('vyte_jwt', data.accessToken);
        localStorage.setItem('vyte_session', JSON.stringify(data.session));

        return { data };
    },

    async logout() {
        try {
            await fetch(`${getApiBaseUrl()}/api/auth/logout`, {
                method: 'POST',
                headers: getAuthHeaders(),
            });
        } catch (err) {
            console.warn('Backend logout request failed:', err);
        } finally {
            localStorage.removeItem('accessToken');
            localStorage.removeItem('vyte_jwt');
            localStorage.removeItem('vyte_session');
            localStorage.removeItem('vyte_workspace_id');
            localStorage.removeItem('active_workspace_id');
            localStorage.removeItem('user_session');
            localStorage.removeItem('user');
        }
    },

    async loginAccount(payload: {
        email: string;
        password?: string;
        companyName: string;
        userType: 'CEO' | 'Manager' | 'Staff';
    }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Login Failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        const tenantId = payload.email.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        localStorage.setItem('vyte_workspace_id', tenantId);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('vyte_jwt', data.accessToken);
        localStorage.setItem('vyte_session', JSON.stringify(data.session));

        return { data };
    },

    async loginWithGoogle(payload: {
        idToken: string;
        email: string;
        fullName: string;
        companyName: string;
        userType: 'CEO' | 'Manager' | 'Staff';
        role: string;
    }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `Google Login Failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        const tenantId = payload.email.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        localStorage.setItem('vyte_workspace_id', tenantId);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('vyte_jwt', data.accessToken);
        localStorage.setItem('vyte_session', JSON.stringify(data.session));

        return { data };
    },

    async loginWithEnterpriseSso(payload: {
        ssoAssertionToken: string;
        corporateDomain: string;
        email: string;
        companyName: string;
        userType: 'CEO' | 'Manager' | 'Staff';
        role: string;
    }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/sso`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || `SSO Login Failed (HTTP ${res.status})`);
        }

        const data = await res.json();
        const tenantId = payload.email.trim().replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
        localStorage.setItem('vyte_workspace_id', tenantId);
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('vyte_jwt', data.accessToken);
        localStorage.setItem('vyte_session', JSON.stringify(data.session));

        return { data };
    },

    async requestPasswordReset(payload: { email: string }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/password-reset/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Request Failed');
        }
        return { data: await res.json() };
    },

    async confirmPasswordReset(payload: { email: string; resetToken: string; newPassword: string }) {
        const res = await fetch(`${getApiBaseUrl()}/api/auth/password-reset/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Confirm Password Reset Failed');
        }
        return { data: await res.json() };
    },

    async fetchWorkspaceData() {
        if (getDebugMockMode()) {
            return {
                products: INITIAL_PRODUCTS,
                qcAlerts: INITIAL_QC_ALERTS,
                invoices: INITIAL_INVOICES,
                auditLogs: INITIAL_AUDIT_LOGS,
                complianceProfiles: INITIAL_COMPLIANCE_PROFILES,
                vaultDocs: INITIAL_VAULT_DOCS,
                renewalTasks: INITIAL_RENEWAL_TASKS,
            };
        }
        const [products, qcAlerts, invoices, auditLogs] = await Promise.all([
            requestJson<Product[]>('/api/products'),
            requestJson<QCAlert[]>('/api/qc-alerts').catch(() => []),
            requestJson<InvoiceItem[]>('/api/invoices').catch(() => []),
            requestJson<AuditLog[]>('/api/audit-logs?limit=100').catch(() => []),
        ]);
        return { products, qcAlerts, invoices, auditLogs, complianceProfiles: [], vaultDocs: [], renewalTasks: [] };
    },

    async fetchBackendOrders(): Promise<any[]> {
        if (getDebugMockMode()) return [];
        return requestJson<any[]>('/api/order').catch(() => []);
    },

    async fileToBase64(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.includes(',') ? result.split(',')[1] : result;
                resolve(base64);
            };
            reader.onerror = (error) => reject(error);
            reader.readAsDataURL(file);
        });
    },

    async parseLegacySystemFile(file: File, extractedRawText: string) {
        try {
            const isBinaryDb = /\.(db|sqlite|sqlite3)$/i.test(file.name);
            const fileBase64 = isBinaryDb ? await this.fileToBase64(file) : undefined;

            const payload = {
                fileName: file.name,
                rawContent: extractedRawText,
                fileBase64: fileBase64
            };

            const res = await fetch(`${getApiBaseUrl()}/api/migration/parse`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || `Analyze Error (HTTP ${res.status})`);
            }

            return await res.json();
        } catch (err: any) {
            console.error('Migration parse failed:', err);
            return null;
        }
    },

    async commitMigration(payload: {
        sourceFileName: string;
        transitionMode: 'SHADOW' | 'COPILOT' | 'AUTOPILOT';
        products: any[];
        invoices: any[];
        complianceProfiles: any[];
        userID?: string;
    }) {
        const wsId = payload.userID || getActiveWorkspaceId();

        const res = await fetch(`${getApiBaseUrl()}/api/migration/commit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Workspace-ID': wsId,
                'X-User-ID': wsId,
            },
            body: JSON.stringify({
                ...payload,
                userID: wsId,
            }),
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP ${res.status}: Import Data Failed`);
        }

        return await res.json();
    },

    createProduct: async (form: any) => {
        const wsId = localStorage.getItem('vyte_workspace_id') || 'ws-mvm02vsm-0lwqs';

        const res = await fetch(`${getApiBaseUrl()}/api/products`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Workspace-ID': wsId,
                'X-User-ID': wsId,
            },
            body: JSON.stringify(form),
        });

        if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error);
        }

        return await res.json();
    },

    async recordStockMovement(
        productId: string, change: number, type: 'SALE' | 'DELIVERY' | 'ADJUSTMENT' | 'DAMAGE', reason: string, userID: string
    ): Promise<Product | null> {
        if (getDebugMockMode()) return null;
        return requestJson<Product>(`/api/products/${productId}/stock-movement`, {
            method: 'POST', body: JSON.stringify({ change, type, reason, userID }),
        });
    },

    async contactSupplier(payload: {
        poNumber: string; productId?: string; supplierName: string; supplierPhoneNumber: string;
        channel: string; messageBody: string; userID: string; role?: UserRole;
    }) {
        if (!getDebugMockMode()) {
            if (payload.productId) {
                await requestJson(`/api/products/${payload.productId}/approve-restock`, {
                    method: 'POST', body: JSON.stringify({ userID: payload.userID, role: 'SME_OWNER' }),
                });
            } else {
                await requestJson('/api/restock/contact-supplier', { method: 'POST', body: JSON.stringify(payload) });
            }
        }
        return {
            data: {
                poNumber: payload.poNumber, deliveryStatus: 'SENT', sentAt: new Date().toISOString(),
                responseCode: 200, message: `Dispatched to ${payload.supplierName} via ${payload.channel}`,
            },
        };
    },

    async confirmRestock(payload: {
        poNumber: string; productId: string; SKU: string; quantity: number; unitPrice: number; currency: string;
        MOQ: number; unitOfMeasure: string; supplierName: string; supplierPhoneNumber: string;
        requestedDeliveryDate: string; deliveryLocation: string; automationStatus: boolean; userID: string;
    }) {
        if (!getDebugMockMode()) {
            const res = await requestJson<{ product: Product; invoice: InvoiceItem }>(
                `/api/products/${payload.productId}/confirm-delivery`,
                { method: 'POST', body: JSON.stringify({ receivedQty: payload.quantity, userID: payload.userID }) }
            );
            return {
                data: {
                    poNumber: payload.poNumber, status: 'CONFIRMED', confirmationStatus: 'DELIVERED', isConfirmed: true,
                    message: 'Delivery confirmed & invoice generated by backend', updatedAt: new Date().toISOString(),
                    backendProduct: res.product, backendInvoice: res.invoice,
                },
            };
        }
        return {
            data: {
                poNumber: payload.poNumber, status: 'CONFIRMED', confirmationStatus: 'DELIVERED', isConfirmed: true,
                message: 'Confirmed locally (Mock Mode)', updatedAt: new Date().toISOString(),
                backendProduct: undefined, backendInvoice: undefined,
            },
        };
    },

    async getSalesReviewReport(
        payload: GetSalesReviewReportRequest,
        fallback: GetSalesReviewReportResponse
    ): Promise<{ data: GetSalesReviewReportResponse; isSimulatedFallback: boolean }> {
        if (!getDebugMockMode()) {
            try {
                const raw = await requestJson<any>('/api/sales-review/report', {
                    method: 'POST',
                    body: JSON.stringify({ ...payload, productID: payload.productID || 'P-101' }),
                });
                if (raw?.productBreakdown) {
                    return { data: raw as GetSalesReviewReportResponse, isSimulatedFallback: false };
                }
            } catch (err) {
                console.warn('[OrbyteApi] Falling back to simulated sales review report:', err);
            }
        }
        return { data: fallback, isSimulatedFallback: true };
    },

    async analyzeProcurement(
        payload: AnalyzeProcurementRequest, fallback: AnalyzeProcurementResponse
    ): Promise<{ data: AnalyzeProcurementResponse; isSimulatedFallback: boolean }> {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<AnalyzeProcurementResponse>('/api/sales-review/analyze-procurement', {
                    method: 'POST', body: JSON.stringify(payload),
                });
                if (data && Array.isArray(data.procurementRecommendations)) return { data, isSimulatedFallback: false };
            } catch { /* fallback */ }
        }
        return { data: fallback, isSimulatedFallback: true };
    },

    async processNlpOrder(
        payload: { rawOrderText: string; customerName: string; requestedDate: string; userID: string; imageBase64?: string },
        fallbackResult: { parseSuccess: boolean; hasSufficientStock: boolean; extractedItems: ExtractedNlpOrderItem[]; calculatedSubtotal: number; currency: string }
    ) {
        if (!getDebugMockMode()) {
            const data = await requestJson<typeof fallbackResult>('/api/order/nlp-process', {
                method: 'POST', body: JSON.stringify(payload),
            });
            return { data };
        }
        return { data: fallbackResult };
    },

    async createInvoiceOrder(payload: {
        orderID: string; requestedDate: string; subtotal: number; currency: string; internalNotes?: string; createdBy: string;
        lineOrders: { lineID: string; productID: string; quantity: number; lineTotal: number; currency: string }[];
    }) {
        if (!getDebugMockMode()) {
            const data = await requestJson<{
                orderID: string; invoiceID: string; status: string; databaseUpdated: boolean; invoicePdfUrl: string; createdAt: string;
            }>('/api/order', { method: 'POST', body: JSON.stringify(payload) });
            return { data };
        }
        const invoiceID = `CUST-${payload.orderID.replace('ORD-', '')}`;
        return {
            data: {
                orderID: payload.orderID, invoiceID, status: 'PENDING_HUMAN_APPROVAL',
                databaseUpdated: true, invoicePdfUrl: `/invoices/${invoiceID}.pdf`, createdAt: new Date().toISOString(),
            },
        };
    },

    async approveCustomerOrder(payload: {
        orderID: string; invoiceID: string; approvalAction: 'APPROVE' | 'REJECT' | 'MODIFY'; approvalNotes: string; updatedBy: string;
    }) {
        if (!getDebugMockMode()) {
            const data = await requestJson<{
                orderID: string; finalStatus: string; inventoryDeducted: boolean; updatedAt: string; message: string;
            }>('/api/order/status', { method: 'PATCH', body: JSON.stringify(payload) });
            return { data };
        }
        return {
            data: {
                orderID: payload.orderID,
                finalStatus: payload.approvalAction === 'APPROVE' ? 'APPROVED' : payload.approvalAction,
                inventoryDeducted: payload.approvalAction === 'APPROVE',
                updatedAt: new Date().toISOString(),
                message: `Order ${payload.orderID} ${payload.approvalAction}`,
            },
        };
    },

    async triggerQcScan(): Promise<{ newAlerts: QCAlert[]; scannedCount: number } | null> {
        if (getDebugMockMode()) return null;
        return requestJson<{ newAlerts: QCAlert[]; scannedCount: number }>('/api/qc/scan', { method: 'POST' });
    },

    async approveQcAlert(qcId: string, userID: string): Promise<QCAlert | null> {
        if (getDebugMockMode()) return null;
        return requestJson<QCAlert>(`/api/qc-alerts/${qcId}/approve`, {
            method: 'POST', body: JSON.stringify({ userID, role: 'SME_OWNER' }),
        });
    },

    async uploadInvoiceFileOrText(payload: {
        file?: File; rawText?: string; type?: 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE';
        party?: string; amountRM?: string; invNo?: string; userID: string;
    }): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        if (payload.file) {
            const fd = new FormData();
            fd.append('file', payload.file);
            fd.append('userID', payload.userID);
            if (payload.rawText) fd.append('rawText', payload.rawText);
            if (payload.type) fd.append('type', payload.type);
            if (payload.party) fd.append('party', payload.party);
            if (payload.amountRM) fd.append('amountRM', payload.amountRM);
            if (payload.invNo) fd.append('invNo', payload.invNo);
            const headers: Record<string, string> = {
                'X-Workspace-ID': getWorkspaceId(),
                ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
            };
            const res = await fetch(`${getApiBaseUrl()}/api/invoices/upload`, {
                method: 'POST', headers, body: fd,
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err?.error || `Upload failed (${res.status})`);
            }
            return (await res.json()) as InvoiceItem;
        }
        return requestJson<InvoiceItem>('/api/invoices/upload', {
            method: 'POST', body: JSON.stringify({ rawText: payload.rawText, type: payload.type, userID: payload.userID }),
        });
    },

    async createBackendInvoice(payload: {
        type: 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE'; party: string; amountRM: number;
        date?: string; aiCategory?: string; invNo?: string; sourceRef?: string;
    }): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        return requestJson<InvoiceItem>('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
    },

    async verifyBackendInvoice(invId: string, userID: string, updatedCategory?: string): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        if (updatedCategory) {
            await requestJson(`/api/invoices/${invId}`, {
                method: 'PATCH', body: JSON.stringify({ aiCategory: updatedCategory, userID }),
            }).catch(() => null);
        }
        return requestJson<InvoiceItem>(`/api/invoices/${invId}/verify`, {
            method: 'PATCH', body: JSON.stringify({ userID, role: 'SME_OWNER' }),
        });
    },

    async toggleBackendInvoicePaid(invId: string, paid: boolean, userID: string): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        return requestJson<InvoiceItem>(`/api/invoices/${invId}/paid`, {
            method: 'PATCH', body: JSON.stringify({ userID, paid }),
        });
    },

    async validateSession(_payload: { accessToken: string; userID: string; email: string }, session: UserSession) {
        return { data: { valid: true, session } };
    },
};