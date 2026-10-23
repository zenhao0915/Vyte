// src/services/api.ts
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    AuditLog,
    CheckComplianceExpiryResponse,
    ComplianceDocType,
    ExtractedNlpOrderItem,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    InvoiceItem,
    LicenseType,
    NewProductForm,
    Product,
    QCAlert,
    SSMVerifyResponse,
    UserRole,
    UserSession,
} from '../types/vyte.ts';
import {
    INITIAL_AUDIT_LOGS,
    INITIAL_INVOICES,
    INITIAL_PRODUCTS,
    INITIAL_QC_ALERTS,
} from '../data/mockData';

const DEBUG_MODE_KEY = 'vyte_debug_mock_mode';
const API_BASE_URL_KEY = 'vyte_api_base_url';

export const getDebugMockMode = (): boolean => {
    const raw = localStorage.getItem(DEBUG_MODE_KEY);
    return raw === null ? false : raw === 'true';
};

export const setDebugMockMode = (enabled: boolean): void => {
    localStorage.setItem(DEBUG_MODE_KEY, String(enabled));
};

export const getApiBaseUrl = (): string => {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
    return localStorage.getItem(API_BASE_URL_KEY) || metaEnv?.VITE_API_BASE_URL || 'http://localhost:8080';
};

export const setApiBaseUrl = (url: string): void => {
    localStorage.setItem(API_BASE_URL_KEY, url.trim().replace(/\/+$/, ''));
};

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
    if (getDebugMockMode()) throw new Error('DEBUG_MOCK_MODE_ACTIVE');
    const res = await fetch(`${getApiBaseUrl()}${path}`, {
        headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
        ...options,
    });
    if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody?.error || `HTTP ${res.status}`);
    }
    return (await res.json()) as T;
}

export const orbyteApi = {
    async fetchWorkspaceData(): Promise<{
        products: Product[];
        qcAlerts: QCAlert[];
        invoices: InvoiceItem[];
        auditLogs: AuditLog[];
    }> {
        if (getDebugMockMode()) {
            return {
                products: INITIAL_PRODUCTS,
                qcAlerts: INITIAL_QC_ALERTS,
                invoices: INITIAL_INVOICES,
                auditLogs: INITIAL_AUDIT_LOGS,
            };
        }
        const [products, qcAlerts, invoices, auditLogs] = await Promise.all([
            requestJson<Product[]>('/api/products'),
            requestJson<QCAlert[]>('/api/qc-alerts').catch(() => INITIAL_QC_ALERTS),
            requestJson<InvoiceItem[]>('/api/invoices').catch(() => INITIAL_INVOICES),
            requestJson<AuditLog[]>('/api/audit-logs?limit=100').catch(() => INITIAL_AUDIT_LOGS),
        ]);
        return { products, qcAlerts, invoices, auditLogs };
    },

    // Module 1: Products & Restock
    async createProduct(form: NewProductForm): Promise<Product | null> {
        if (getDebugMockMode()) return null;
        return requestJson<Product>('/api/products', { method: 'POST', body: JSON.stringify(form) });
    },

    async recordStockMovement(
        productId: string,
        change: number,
        type: 'SALE' | 'DELIVERY' | 'ADJUSTMENT' | 'DAMAGE',
        reason: string,
        userID: string
    ): Promise<Product | null> {
        if (getDebugMockMode()) return null;
        return requestJson<Product>(`/api/products/${productId}/stock-movement`, {
            method: 'POST',
            body: JSON.stringify({ change, type, reason, userID }),
        });
    },

    async contactSupplier(payload: {
        poNumber: string;
        productId?: string;
        supplierName: string;
        supplierPhoneNumber: string;
        channel: string;
        messageBody: string;
        userID: string;
        role?: UserRole;
    }) {
        if (!getDebugMockMode()) {
            try {
                if (payload.productId) {
                    await requestJson(`/api/products/${payload.productId}/approve-restock`, {
                        method: 'POST',
                        body: JSON.stringify({ userID: payload.userID, role: 'SME_OWNER' }),
                    });
                } else {
                    await requestJson('/api/restock/contact-supplier', {
                        method: 'POST',
                        body: JSON.stringify(payload),
                    });
                }
            } catch { /* fallback */ }
        }
        return {
            data: {
                poNumber: payload.poNumber,
                deliveryStatus: 'SENT',
                sentAt: new Date().toISOString(),
                responseCode: 200,
                message: `Dispatched to ${payload.supplierName} via ${payload.channel}`,
            },
        };
    },

    async confirmRestock(payload: {
        poNumber: string;
        productId: string;
        SKU: string;
        quantity: number;
        unitPrice: number;
        currency: string;
        MOQ: number;
        unitOfMeasure: string;
        supplierName: string;
        supplierPhoneNumber: string;
        requestedDeliveryDate: string;
        deliveryLocation: string;
        automationStatus: boolean;
        userID: string;
    }) {
        if (!getDebugMockMode()) {
            try {
                const res = await requestJson<{ product: Product; invoice: InvoiceItem }>(
                    `/api/products/${payload.productId}/confirm-delivery`,
                    { method: 'POST', body: JSON.stringify({ receivedQty: payload.quantity, userID: payload.userID }) }
                );
                return {
                    data: {
                        poNumber: payload.poNumber,
                        status: 'CONFIRMED',
                        confirmationStatus: 'DELIVERED',
                        isConfirmed: true,
                        message: 'Delivery confirmed & invoice generated by backend',
                        updatedAt: new Date().toISOString(),
                        backendProduct: res.product,
                        backendInvoice: res.invoice,
                    },
                };
            } catch { /* fallback */ }
        }
        return {
            data: {
                poNumber: payload.poNumber,
                status: 'CONFIRMED',
                confirmationStatus: 'DELIVERED',
                isConfirmed: true,
                message: 'Confirmed locally (Mock Mode)',
                updatedAt: new Date().toISOString(),
                backendProduct: undefined,
                backendInvoice: undefined,
            },
        };
    },

    // Module 2: Sales Analytics
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
                if (raw && Array.isArray(raw.productBreakdown)) {
                    return { data: raw as GetSalesReviewReportResponse, isSimulatedFallback: false };
                }
                if (raw && raw.productID) {
                    return { data: fallback, isSimulatedFallback: false };
                }
            } catch { /* fallback */ }
        }
        return { data: fallback, isSimulatedFallback: true };
    },

    async analyzeProcurement(
        payload: AnalyzeProcurementRequest,
        fallback: AnalyzeProcurementResponse
    ): Promise<{ data: AnalyzeProcurementResponse; isSimulatedFallback: boolean }> {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<AnalyzeProcurementResponse>('/api/sales-review/analyze-procurement', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (data && Array.isArray(data.procurementRecommendations)) {
                    return { data, isSimulatedFallback: false };
                }
            } catch { /* fallback */ }
        }
        return { data: fallback, isSimulatedFallback: true };
    },

    // Module 3: Customer Orders & NLP
    async processNlpOrder(
        payload: { rawOrderText: string; customerName: string; requestedDate: string; userID: string },
        fallbackResult: {
            parseSuccess: boolean;
            hasSufficientStock: boolean;
            extractedItems: ExtractedNlpOrderItem[];
            calculatedSubtotal: number;
            currency: string;
        }
    ) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<typeof fallbackResult>('/api/order/nlp-process', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                return { data };
            } catch { /* fallback */ }
        }
        return { data: fallbackResult };
    },

    async createInvoiceOrder(payload: {
        orderID: string;
        requestedDate: string;
        subtotal: number;
        currency: string;
        internalNotes?: string;
        createdBy: string;
        lineOrders: { lineID: string; productID: string; quantity: number; lineTotal: number; currency: string }[];
    }) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<{
                    orderID: string;
                    invoiceID: string;
                    status: string;
                    databaseUpdated: boolean;
                    invoicePdfUrl: string;
                    createdAt: string;
                }>('/api/order', { method: 'POST', body: JSON.stringify(payload) });
                return { data };
            } catch { /* fallback */ }
        }
        const invoiceID = `CUST-${payload.orderID.replace('ORD-', '')}`;
        return {
            data: {
                orderID: payload.orderID,
                invoiceID,
                status: 'PENDING_HUMAN_APPROVAL',
                databaseUpdated: true,
                invoicePdfUrl: `/invoices/${invoiceID}.pdf`,
                createdAt: new Date().toISOString(),
            },
        };
    },

    async approveCustomerOrder(payload: {
        orderID: string;
        invoiceID: string;
        approvalAction: 'APPROVE' | 'REJECT' | 'MODIFY';
        approvalNotes: string;
        updatedBy: string;
    }) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<{
                    orderID: string;
                    finalStatus: string;
                    inventoryDeducted: boolean;
                    updatedAt: string;
                    message: string;
                }>('/api/order/status', { method: 'PATCH', body: JSON.stringify(payload) });
                return { data };
            } catch { /* fallback */ }
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

    // Module 4: Quality Control
    async triggerQcScan(): Promise<{ newAlerts: QCAlert[]; scannedCount: number } | null> {
        if (getDebugMockMode()) return null;
        try {
            return await requestJson<{ newAlerts: QCAlert[]; scannedCount: number }>('/api/qc/scan', { method: 'POST' });
        } catch {
            return null;
        }
    },

    async approveQcAlert(qcId: string, userID: string): Promise<QCAlert | null> {
        if (getDebugMockMode()) return null;
        try {
            return await requestJson<QCAlert>(`/api/qc-alerts/${qcId}/approve`, {
                method: 'POST',
                body: JSON.stringify({ userID, role: 'SME_OWNER' }),
            });
        } catch {
            return null;
        }
    },

    // Module 5: Smart Invoices
    async createBackendInvoice(payload: {
        type: 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE';
        party: string;
        amountRM: number;
        date?: string;
        aiCategory?: string;
        invNo?: string;
        sourceRef?: string;
    }): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        try {
            return await requestJson<InvoiceItem>('/api/invoices', { method: 'POST', body: JSON.stringify(payload) });
        } catch {
            return null;
        }
    },

    async verifyBackendInvoice(invId: string, userID: string, updatedCategory?: string): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        try {
            if (updatedCategory) {
                await requestJson(`/api/invoices/${invId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ aiCategory: updatedCategory, userID }),
                }).catch(() => null);
            }
            return await requestJson<InvoiceItem>(`/api/invoices/${invId}/verify`, {
                method: 'PATCH',
                body: JSON.stringify({ userID, role: 'SME_OWNER' }),
            });
        } catch {
            return null;
        }
    },

    async toggleBackendInvoicePaid(invId: string, paid: boolean, userID: string): Promise<InvoiceItem | null> {
        if (getDebugMockMode()) return null;
        try {
            return await requestJson<InvoiceItem>(`/api/invoices/${invId}/paid`, {
                method: 'PATCH',
                body: JSON.stringify({ userID, paid }),
            });
        } catch {
            return null;
        }
    },

    // Auth & Session
    async validateSession(_payload: { accessToken: string; userID: string; email: string }, session: UserSession) {
        return { data: { valid: true, session } };
    },
    async registerAccount(payload: {
        firstName: string;
        lastName: string;
        email: string;
        password?: string;
        companyName: string;
        userType: 'CEO' | 'Manager' | 'Staff';
        role: UserRole;
        acceptedTermsAt: string;
    }) {
        const userID = payload.userType === 'CEO' ? 'M067' : payload.userType === 'Manager' ? 'M102' : 'S204';
        return { data: { userID, registeredAt: new Date().toISOString() } };
    },
    async loginAccount(payload: { email: string; password?: string; companyName: string; userType: 'CEO' | 'Manager' | 'Staff' }) {
        const role: UserRole = payload.userType === 'CEO' ? 'SME_OWNER' : payload.userType === 'Manager' ? 'MANAGER' : 'OPERATIONS_STAFF';
        const userID = payload.userType === 'CEO' ? 'M067' : payload.userType === 'Manager' ? 'M102' : 'S204';
        return {
            data: {
                accessToken: `vyte-jwt-${Date.now()}`,
                session: {
                    userID,
                    userName: payload.email.split('@')[0] || 'Vyte Operator',
                    email: payload.email,
                    userType: payload.userType,
                    role,
                    companyName: payload.companyName,
                    companyOwnerName: payload.email.split('@')[0] || 'Vyte Operator',
                } satisfies UserSession,
            },
        };
    },
    async loginWithGoogle(payload: { idToken: string; email: string; fullName: string; companyName: string; userType: 'CEO' | 'Manager' | 'Staff'; role: UserRole }) {
        return {
            data: {
                accessToken: payload.idToken,
                session: {
                    userID: 'M067',
                    userName: payload.fullName,
                    email: payload.email,
                    userType: payload.userType,
                    role: payload.role,
                    companyName: payload.companyName,
                    companyOwnerName: payload.fullName,
                } satisfies UserSession,
            },
        };
    },
    async loginWithEnterpriseSso(payload: { ssoAssertionToken: string; corporateDomain: string; email: string; companyName: string; userType: 'CEO' | 'Manager' | 'Staff'; role: UserRole }) {
        return {
            data: {
                accessToken: payload.ssoAssertionToken,
                session: {
                    userID: 'M067',
                    userName: payload.email.split('@')[0] || 'Enterprise User',
                    email: payload.email,
                    userType: payload.userType,
                    role: payload.role,
                    companyName: payload.companyName,
                    companyOwnerName: payload.email.split('@')[0] || 'Enterprise User',
                } satisfies UserSession,
            },
        };
    },
    async requestPasswordReset(payload: { email: string }) {
        return { data: { email: payload.email, resetToken: 'VYTE-8829' } };
    },
    async confirmPasswordReset(payload: { email: string; resetToken: string; newPassword?: string }) {
        return { data: { message: `Password updated for ${payload.email}. Please log in.` } };
    },
};

// Module 6: Business License & Compliance Renewal API
export const complianceApi = {
    async verifySsmBusiness(payload: { registrationNo: string; companyName: string; userID: string }): Promise<{ data: SSMVerifyResponse }> {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<SSMVerifyResponse>('/api/compliance/ssm-verify', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                return { data };
            } catch { /* fallback */ }
        }
        const nameUpper = payload.companyName.toUpperCase();
        const companyType = nameUpper.includes('PLT') || nameUpper.includes('LLP') ? 'LLP' : nameUpper.includes('ENTERPRISE') ? 'ENTERPRISE' : 'SDN_BHD';
        return {
            data: {
                registrationNo: payload.registrationNo,
                companyName: nameUpper,
                companyType,
                ssmStatus: 'ACTIVE',
                ssmExpiryDate: '2027-02-15',
                daysUntilExpiry: 115,
                isWithinRenewalWindow: true,
                verificationSource: 'SSM_DATA_FEED',
                lastSyncedAt: new Date().toISOString(),
            } as unknown as SSMVerifyResponse,
        };
    },

    async checkComplianceExpiry(
        payload: { expiryThresholdDays: number; councilFilter: string; userID: string },
        fallbackPayload: CheckComplianceExpiryResponse
    ): Promise<{ data: CheckComplianceExpiryResponse }> {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<CheckComplianceExpiryResponse>('/api/compliance/expiry-check', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (data && Array.isArray(data.expiringItems)) return { data };
            } catch { /* fallback */ }
        }
        return { data: fallbackPayload };
    },

    async uploadComplianceVaultDoc(payload: {
        registrationNo: string;
        docType: ComplianceDocType;
        fileUrl: string;
        fileSizeKb: number;
        effectiveDate: string;
        expiryDate: string;
        createdBy: string;
    }) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<any>('/api/compliance/vault/upload', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (data?.docID) return { data };
            } catch { /* fallback */ }
        }
        return {
            data: {
                docID: `DOC-${Math.floor(10000 + Math.random() * 90000)}`,
                registrationNo: payload.registrationNo,
                docType: payload.docType,
                storedAt: new Date().toISOString(),
                message: 'Document indexed & formatted for PBT compliance packet',
            },
        };
    },

    async initiateComplianceRenewal(payload: {
        registrationNo: string;
        councilName: string;
        licenseType: LicenseType;
        filingMode: 'CONCIERGE_MANUAL_SUBMISSION' | 'RPA_GUIDED_CHECKLIST';
        selectedDocumentIds: string[];
        renewalFeeEstimate: number;
        currency: string;
        internalNotes: string;
        createdBy: string;
    }) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<any>('/api/compliance/renewal/initiate', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (data?.renewalID) return { data };
            } catch { /* fallback */ }
        }
        const renewalID = `REN-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        const portalMap: Record<string, string> = {
            MBPJ: 'https://e-lesen.mbpj.gov.my',
            DBKL: 'https://elesen.dbkl.gov.my',
            MBSA: 'https://elesen.mbsa.gov.my',
            MBSJ: 'https://my-ilesen.mbsj.gov.my',
        };
        return {
            data: {
                renewalID,
                targetCouncil: payload.councilName,
                status: payload.filingMode === 'CONCIERGE_MANUAL_SUBMISSION' ? 'ASSIGNED_TO_AGENT' : 'IN_PROGRESS',
                assignedAgentID: payload.filingMode === 'CONCIERGE_MANUAL_SUBMISSION' ? 'AGENT_DESK_03' : 'RPA_BOT_01',
                pbtPortalUrl: portalMap[payload.councilName] || 'https://e-lesen.mbpj.gov.my',
                compiledSubmissionPdfUrl: `https://storage.local/packets/${payload.councilName}_${renewalID}.pdf`,
                generatedChecklist: [
                    { step: 1, name: 'SSM Form 9 Validated', isCompleted: true },
                    { step: 2, name: 'Tenancy Agreement Stamp Duty Attached', isCompleted: true },
                    { step: 3, name: 'BOMBA Fire Safety / Floor Plan Endorsement', isCompleted: false },
                ],
                deadlineDate: '2026-11-25',
                createdAt: new Date().toISOString(),
            },
        };
    },

    async updateRenewalTaskStatus(payload: {
        renewalID: string;
        action: string;
        submissionReferenceNo: string;
        pbtReceiptUrl: string;
        agentNotes: string;
        updatedBy: string;
    }) {
        if (!getDebugMockMode()) {
            try {
                const data = await requestJson<any>('/api/compliance/renewal/status', {
                    method: 'POST',
                    body: JSON.stringify(payload),
                });
                if (data?.currentStatus) return { data };
            } catch { /* fallback */ }
        }
        const isFinal = payload.action === 'APPROVE_FINAL_LICENSE';
        return {
            data: {
                currentStatus: isFinal ? 'APPROVED' : 'SUBMITTED_PENDING_APPROVAL',
                submissionReferenceNo: payload.submissionReferenceNo,
                nextFollowUpDate: '2026-11-05',
                updatedAt: new Date().toISOString(),
                message: isFinal ? 'PBT License officially approved and marked ACTIVE.' : 'Application submitted to council portal.',
            },
        };
    },
};