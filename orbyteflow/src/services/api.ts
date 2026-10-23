// src/services/api.ts
import type {
    AnalyzeProcurementRequest,
    AnalyzeProcurementResponse,
    ApproveCustomerOrderRequest,
    ApproveCustomerOrderResponse,
    AuthSessionResponse,
    ConfirmRestockRequest,
    ConfirmRestockResponse,
    ContactSupplierRequest,
    ContactSupplierResponse,
    CreateInvoiceOrderRequest,
    CreateInvoiceOrderResponse,
    EnterpriseSsoAuthRequest,
    ForgotPasswordRequest,
    ForgotPasswordResponse,
    GetSalesReviewReportRequest,
    GetSalesReviewReportResponse,
    GoogleAuthRequest,
    LoginAccountRequest,
    ProcessNlpOrderRequest,
    ProcessNlpOrderResponse,
    RegisterAccountRequest,
    RegisterAccountResponse,
    ResetPasswordRequest,
    ResetPasswordResponse,
    UserSession,
    ValidateSessionRequest,
    ValidateSessionResponse,
} from '../types/vyte.ts';
import type {
    SSMVerifyRequest,
    SSMVerifyResponse,
    CheckComplianceExpiryRequest,
    CheckComplianceExpiryResponse,
    StoreComplianceDocRequest,
    StoreComplianceDocResponse,
    InitiateRenewalRequest,
    InitiateRenewalResponse,
    UpdateRenewalTaskRequest,
    UpdateRenewalTaskResponse,
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

// Add inside orbyteApi object in src/services/api.ts:
// ========================================================================
// 0. AUTHENTICATION, SESSION & PASSWORD RESET ENDPOINTS
// ========================================================================

// POST http://localhost:8989/api/auth/register
    async registerAccount(
        payload: RegisterAccountRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        const assignedId =
            payload.userType === 'CEO' ? 'M067' : payload.userType === 'Manager' ? 'M102' : 'S204';
        const fullName = `${payload.firstName} ${payload.lastName}`.trim();

        return requestWithFallback<RegisterAccountRequest, RegisterAccountResponse>(
            'POST',
            '/auth/register',
            payload,
            () => ({
                userID: assignedId,
                userName: fullName,
                email: payload.email,
                companyName: payload.companyName,
                userType: payload.userType,
                role: payload.role,
                registeredAt: new Date().toISOString(),
                message: `Account registered for ${fullName}. Please log in to continue.`,
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/login
    async loginAccount(
        payload: LoginAccountRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        const userType = payload.userType ?? 'CEO';
        const role =
            userType === 'CEO'
                ? 'SME_OWNER'
                : userType === 'Manager'
                    ? 'MANAGER'
                    : 'OPERATIONS_STAFF';
        const userID =
            userType === 'CEO' ? 'M067' : userType === 'Manager' ? 'M102' : 'S204';

        return requestWithFallback<LoginAccountRequest, AuthSessionResponse>(
            'POST',
            '/auth/login',
            payload,
            () => ({
                authenticated: true,
                accessToken: `vyte-jwt-${Date.now()}`,
                authProvider: 'LOCAL',
                issuedAt: new Date().toISOString(),
                session: {
                    userID,
                    userName: payload.email.split('@')[0] || 'Vyte Operator',
                    email: payload.email,
                    userType,
                    role,
                    companyName: payload.companyName || 'Vyte Smart Logistics Sdn Bhd',
                    companyOwnerName: payload.email.split('@')[0] || 'Vyte Operator',
                },
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/session/validate
    async validateSession(
        payload: ValidateSessionRequest,
        cachedSession: UserSession,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ValidateSessionRequest, ValidateSessionResponse>(
            'POST',
            '/auth/session/validate',
            payload,
            () => ({
                valid: Boolean(payload.accessToken && cachedSession.userID),
                session: cachedSession,
                verifiedAt: new Date().toISOString(),
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/forgot-password
    async requestPasswordReset(
        payload: ForgotPasswordRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ForgotPasswordRequest, ForgotPasswordResponse>(
            'POST',
            '/auth/forgot-password',
            payload,
            () => ({
                resetToken: `RST-${Math.floor(100000 + Math.random() * 900000)}`,
                email: payload.email,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                message: `Verification code generated for ${payload.email}.`,
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/reset-password
    async confirmPasswordReset(
        payload: ResetPasswordRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        return requestWithFallback<ResetPasswordRequest, ResetPasswordResponse>(
            'POST',
            '/auth/reset-password',
            payload,
            () => ({
                success: true,
                updatedAt: new Date().toISOString(),
                message: `Password for ${payload.email} has been updated. You can now log in.`,
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/google
    async loginWithGoogle(
        payload: GoogleAuthRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        const userID =
            payload.userType === 'CEO' ? 'M067' : payload.userType === 'Manager' ? 'M102' : 'S204';

        return requestWithFallback<GoogleAuthRequest, AuthSessionResponse>(
            'POST',
            '/auth/google',
            payload,
            () => ({
                authenticated: true,
                accessToken: `vyte-google-jwt-${Date.now()}`,
                authProvider: 'GOOGLE',
                issuedAt: new Date().toISOString(),
                session: {
                    userID,
                    userName: `${payload.fullName} (Google)`,
                    email: payload.email,
                    userType: payload.userType,
                    role: payload.role,
                    companyName: payload.companyName,
                    companyOwnerName: payload.fullName,
                },
            }),
            onExchange
        );
    },

// POST http://localhost:8989/api/auth/sso/verify
    async loginWithEnterpriseSso(
        payload: EnterpriseSsoAuthRequest,
        onExchange?: (log: ApiExchangeLog) => void
    ) {
        const userID =
            payload.userType === 'CEO' ? 'M067' : payload.userType === 'Manager' ? 'M102' : 'S204';

        return requestWithFallback<EnterpriseSsoAuthRequest, AuthSessionResponse>(
            'POST',
            '/auth/sso/verify',
            payload,
            () => ({
                authenticated: true,
                accessToken: `vyte-sso-jwt-${Date.now()}`,
                authProvider: 'ENTERPRISE_SSO',
                issuedAt: new Date().toISOString(),
                session: {
                    userID,
                    userName: `Jayden Lai (SSO â€¢ ${payload.corporateDomain})`,
                    email: payload.email,
                    userType: payload.userType,
                    role: payload.role,
                    companyName: payload.companyName,
                    companyOwnerName: 'Jayden Lai',
                },
            }),
            onExchange
        );
    },
};

// ============================================================================
// MODULE 6: BUSINESS LICENSE & COMPLIANCE RENEWAL API
// ============================================================================
export const complianceApi = {
    // 1. Real-Time SSM Business Lookup & Auto-Populate
    verifySsmBusiness: async (
        payload: SSMVerifyRequest,
        fallbackData?: SSMVerifyResponse
    ): Promise<{ data: SSMVerifyResponse; isSimulatedFallback: boolean }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/compliance/ssm-verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as SSMVerifyResponse;
            return { data, isSimulatedFallback: false };
        } catch {
            const upperName = payload.companyName.trim().toUpperCase();
            const inferredType = upperName.includes('PLT') || upperName.includes('LLP')
                ? 'LLP'
                : upperName.includes('SDN')
                    ? 'SDN_BHD'
                    : 'ENTERPRISE';

            const simulated: SSMVerifyResponse = fallbackData ?? {
                registrationNo: payload.registrationNo.trim(),
                companyName: upperName || 'ACME TECH SDN. BHD.',
                companyType: inferredType,
                isValid: /^\d{12}$/.test(payload.registrationNo.trim()) || payload.registrationNo.trim().length >= 7,
                ssmStatus: 'EXISTING',
                ssmExpiryDate: '2027-02-15',
                daysUntilExpiry: 116,
                isWithinRenewalWindow: true,
                verificationSource: 'SSM_DATA_FEED',
                verifiedAt: new Date().toISOString(),
            };
            return { data: simulated, isSimulatedFallback: true };
        }
    },

    // 2. License & Compliance Expiry Alert Check
    checkComplianceExpiry: async (
        payload: CheckComplianceExpiryRequest,
        fallbackData?: CheckComplianceExpiryResponse
    ): Promise<{ data: CheckComplianceExpiryResponse; isSimulatedFallback: boolean }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/compliance/expiry-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as CheckComplianceExpiryResponse;
            return { data, isSimulatedFallback: false };
        } catch {
            const simulated: CheckComplianceExpiryResponse = fallbackData ?? {
                lastCheckedAt: new Date().toISOString(),
                totalLicensesMonitored: 8,
                expiringItems: [
                    {
                        registrationNo: '202401048291',
                        companyName: 'ACME TECH SDN. BHD.',
                        licenseType: 'PREMISE_LICENSE',
                        councilName: 'MBPJ',
                        expiryDate: '2026-11-30',
                        daysRemaining: 39,
                        urgencyLevel: 'EXPIRING_SOON',
                        actionRequired: 'Prepare floor plan and tenancy agreement for assisted PBT filing',
                    },
                ],
            };
            return { data: simulated, isSimulatedFallback: true };
        }
    },

    // 3. Centralized Form Management & Document Vault
    uploadComplianceVaultDoc: async (
        payload: StoreComplianceDocRequest,
        fallbackData?: StoreComplianceDocResponse
    ): Promise<{ data: StoreComplianceDocResponse; isSimulatedFallback: boolean }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/compliance/vault/upload`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as StoreComplianceDocResponse;
            return { data, isSimulatedFallback: false };
        } catch {
            const simulated: StoreComplianceDocResponse = fallbackData ?? {
                docID: `DOC-${Math.floor(90000 + Math.random() * 9999)}`,
                registrationNo: payload.registrationNo,
                docType: payload.docType,
                fileStored: true,
                formattedPackageReady: true,
                storedAt: new Date().toISOString(),
                message: 'Document indexed and verified for PBT submission packet',
            };
            return { data: simulated, isSimulatedFallback: true };
        }
    },

    // 4. Assisted Filing & RPA / Concierge Renewal Initiation
    initiateComplianceRenewal: async (
        payload: InitiateRenewalRequest,
        fallbackData?: InitiateRenewalResponse
    ): Promise<{ data: InitiateRenewalResponse; isSimulatedFallback: boolean }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/compliance/renewal/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as InitiateRenewalResponse;
            return { data, isSimulatedFallback: false };
        } catch {
            const portalUrls: Record<string, string> = {
                MBPJ: 'https://e-lesen.mbpj.gov.my',
                DBKL: 'https://elesen.dbkl.gov.my',
                MBSA: 'https://myelesen.mbsa.gov.my',
                MBSJ: 'https://elesen.mbsj.gov.my',
            };
            const renewalID = `REN-2026-${String(Math.floor(10 + Math.random() * 89)).padStart(4, '0')}`;
            const simulated: InitiateRenewalResponse = fallbackData ?? {
                renewalID,
                status:
                    payload.filingMode === 'CONCIERGE_MANUAL_SUBMISSION'
                        ? 'ASSIGNED_TO_AGENT'
                        : 'READY_FOR_FILING',
                targetCouncil: payload.councilName,
                pbtPortalUrl: portalUrls[payload.councilName] || 'https://e-lesen.mbpj.gov.my',
                generatedChecklist: [
                    {
                        step: 1,
                        name: 'SSM Form 9 Validated',
                        isCompleted: payload.selectedDocumentIds.length >= 1,
                    },
                    {
                        step: 2,
                        name: 'Tenancy Agreement Stamp Duty Attached',
                        isCompleted: payload.selectedDocumentIds.length >= 2,
                    },
                    {
                        step: 3,
                        name: 'BOMBA Fire Safety Endorsement',
                        isCompleted: payload.selectedDocumentIds.length >= 3,
                    },
                ],
                compiledSubmissionPdfUrl: `https://storage.local/packets/${payload.councilName}_${renewalID.replace(/-/g, '_')}.pdf`,
                assignedAgentID:
                    payload.filingMode === 'CONCIERGE_MANUAL_SUBMISSION' ? 'AGENT_DESK_03' : null,
                deadlineDate: '2026-11-20',
                createdAt: new Date().toISOString(),
            };
            return { data: simulated, isSimulatedFallback: true };
        }
    },

    // 5. Concierge / RPA Task Status Update
    updateRenewalTaskStatus: async (
        payload: UpdateRenewalTaskRequest,
        fallbackData?: UpdateRenewalTaskResponse
    ): Promise<{ data: UpdateRenewalTaskResponse; isSimulatedFallback: boolean }> => {
        try {
            const response = await fetch(`${API_BASE_URL}/compliance/renewal/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = (await response.json()) as UpdateRenewalTaskResponse;
            return { data, isSimulatedFallback: false };
        } catch {
            const nextStatus =
                payload.action === 'APPROVE_FINAL_LICENSE'
                    ? 'APPROVED'
                    : 'SUBMITTED_MANUAL_PBT';
            const simulated: UpdateRenewalTaskResponse = fallbackData ?? {
                renewalID: payload.renewalID,
                currentStatus: nextStatus,
                submissionReferenceNo: payload.submissionReferenceNo,
                isAcknowledged: true,
                nextFollowUpDate: '2026-10-29',
                updatedAt: new Date().toISOString(),
                message: 'Filing recorded. Reminder queued for council approval review.',
            };
            return { data: simulated, isSimulatedFallback: true };
        }
    },
};