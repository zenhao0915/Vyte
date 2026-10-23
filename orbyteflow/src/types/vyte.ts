// src/types/vyte.ts

export type UserRole = 'SME_OWNER' | 'MANAGER' | 'OPERATIONS_STAFF';
export type IndustryProfile = 'FNB_PERISHABLE' | 'RETAIL_VARIANT' | 'B2B_RAW_MATERIAL';
export type ActiveTab = 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5' | 'mod6' | 'logs';
export type CurrencyCode = 'MYR' | 'SGD' | 'USD';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
    MYR: 'RM',
    SGD: 'S$',
    USD: '$',
};

export interface OrbyteHrStaff {
    staffId: string;
    name: string;
    department: string;
    position: string;
    shiftStatus: 'ON_DUTY' | 'BUSY';
}

// Payload sent to Orbyte HR System when an assigned staff member misses the due date
export interface OrbyteHrOverdueEscalationPayload {
    event: 'ORBYTE_HR_TASK_OVERDUE_ESCALATION';
    escalationId: string;
    hrTaskId: string;
    qcAlertId: string;
    staff: {
        staffId: string;
        name: string;
        department: string;
        position: string;
    };
    taskDetails: {
        sku: string;
        productName: string;
        batchNo: string;
        actionRequired: string;
        priority: 'URGENT' | 'HIGH' | 'NORMAL';
        assignedDueDate: string;
        currentDate: string;
        daysOverdue: number;
        taskStatus: 'UNDONE_PAST_DUE';
        atRiskValueRM: number;
    };
    hrSystemDirective: 'LOG_KPI_BREACH_AND_ESCALATE_SUPERVISOR';
    dispatchedAt: string;
}

export interface UserSession {
    userID: string;
    userName: string;
    email: string;
    userType: 'CEO' | 'Manager' | 'Staff';
    role: UserRole;
    companyName: string;
    companyOwnerName?: string;
}

export interface Product {
    id: string;
    sku: string;
    name: string;
    category: string;
    industry: IndustryProfile;
    uom: string;
    stock: number;
    minThreshold: number;
    reorderQty: number;
    priceRM: number;
    unitCostRM?: number;
    dailyDepletionRate?: number;
    leadTimeDays?: number;
    moq?: number;
    supplierName: string;
    supplierContact: string;
    performance: 'Excellent' | 'Good' | 'Low';
    visibility: boolean;
    batchNo?: string;
    expiryDate?: string;
    variantSpec?: string;
    photoUrl?: string;
    restockStatus: 'HEALTHY' | 'TRIGGERED_PENDING_APPROVAL' | 'SUPPLIER_CONTACTED' | 'CONFIRMED';
}

export interface NewProductForm {
    name: string;
    sku: string;
    category: string;
    industry: IndustryProfile;
    uom: string;
    stock: number;
    minThreshold: number;
    reorderQty: number;
    priceRM: number;
    supplierName: string;
    supplierContact: string;
    extraAttr: string;
    photoUrl?: string;
}

export interface AutoOrderSuggestion {
    id: string;
    poNumber: string;
    productID: string;
    sku: string;
    productName: string;
    category: string;
    uom: string;
    currentStock: number;
    minThreshold: number;
    dailyDepletionRate: number;
    daysUntilStockout: number;
    leadTimeDays: number;
    suggestedOrderQty: number;
    moq: number;
    unitPriceRM: number;
    supplierName: string;
    supplierPhone: string;
    channel: 'WHATSAPP' | 'EMAIL';
    aiReasoning: string;
    urgency: 'CRITICAL' | 'HIGH' | 'MEDIUM';
    humanStatus: 'AWAITING_HUMAN_PERMISSION' | 'APPROVED_SENT_TO_SUPPLIER' | 'HELD_BY_HUMAN' | 'REJECTED';
    updatedAt?: string;
}

export interface QCAlert {
    id: string;
    productName: string;
    sku: string;
    batchNo: string;
    expiryDate: string;
    daysLeft: number;
    qtyAffected: string;
    triggerReason: string;
    aiSuggestion: string;
    actionLabel: string;
    savedRM: number;
    status: 'PENDING_APPROVAL' | 'ASSIGNED_TO_STAFF' | 'APPROVED_RESOLVED';
    // Orbyte HR System Integration & Due-Date Tracking Fields
    hrTaskId?: string;
    assignedStaffId?: string;
    assignedStaffName?: string;
    assignedStaffDepartment?: string;
    assignedStaffPosition?: string;
    assignedStaffRole?: string;
    assignedPriority?: 'URGENT' | 'HIGH' | 'NORMAL';
    assignedDueDate?: string; // ISO YYYY-MM-DD
    completedAtDate?: string; // ISO YYYY-MM-DD
    completedLate?: boolean;
    hrNotes?: string;
    assignedAt?: string;
    hrEscalated?: boolean;
    hrEscalationPayload?: OrbyteHrOverdueEscalationPayload;
}

export interface InvoiceItem {
    id: string;
    invNo: string;
    type: 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE';
    party: string;
    date: string;
    amountRM: number;
    aiCategory: string;
    aiConfidence: number;
    paid: boolean;
    status: 'NEEDS_REVIEW' | 'VERIFIED';
    attachmentName?: string;
    attachmentPreviewUrl?: string;
}

export interface AuditLog {
    id: string;
    time: string;
    module: string;
    role: UserRole;
    detail: string;
}

export interface ExtractedNlpOrderItem {
    productID: string;
    SKU: string;
    name: string;
    requestedQty: number;
    availableStock: number;
    isStockEnough: boolean;
    sellingPrice: number;
    lineTotal: number;
}

export interface GetSalesReviewReportRequest {
    filterYear: number;
    filterQuarter: number | null;
    category: string | null;
    productID: string | null;
    userID: string;
}

export interface GetSalesReviewReportResponse {
    period: string;
    totalRevenue: number;
    totalUnitsSold: number;
    currency: string;
    productBreakdown: {
        productID: string;
        SKU: string;
        name: string;
        category: string;
        unitsSold: number;
        totalSalesAmount: number;
        remainingStock: number;
    }[];
}

export interface AnalyzeProcurementRequest {
    filterYear: number;
    filterQuarter: number | null;
    holdingCostPercentage: number;
    targetTurnoverDays: number;
    userID: string;
}

export interface AnalyzeProcurementResponse {
    generatedAt: string;
    aiSummary: string;
    procurementRecommendations: {
        productID: string;
        SKU: string;
        name: string;
        currentStock: number;
        costOfHoldingStock: number;
        timeNeededToSellOffDays: number;
        optimalStockToHold: number;
        recommendedProcureQty: number;
        priorityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
    }[];
}

// ============================================================================
// AUTH, SESSION & PASSWORD RESET API PAYLOADS
// ============================================================================

export type UserType = 'CEO' | 'Manager' | 'Staff';

export interface RegisterAccountRequest {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    companyName: string;
    userType: UserType;
    role: UserRole;
    acceptedTermsAt: string;
}

export interface RegisterAccountResponse {
    userID: string;
    userName: string;
    email: string;
    companyName: string;
    userType: UserType;
    role: UserRole;
    registeredAt: string;
    message: string;
}

export interface LoginAccountRequest {
    email: string;
    password: string;
    companyName?: string;
    userType?: UserType;
}

export interface AuthSessionResponse {
    authenticated: boolean;
    accessToken: string;
    authProvider: 'LOCAL' | 'GOOGLE' | 'ENTERPRISE_SSO';
    issuedAt: string;
    session?: UserSession;
}

export interface ValidateSessionRequest {
    accessToken: string;
    userID: string;
    email: string;
}

export interface ValidateSessionResponse {
    valid: boolean;
    session: UserSession;
    verifiedAt: string;
}

export interface ForgotPasswordRequest {
    email: string;
}

export interface ForgotPasswordResponse {
    resetToken: string;
    email: string;
    expiresAt: string;
    message: string;
}

export interface ResetPasswordRequest {
    email: string;
    resetToken: string;
    newPassword: string;
}

export interface ResetPasswordResponse {
    success: boolean;
    updatedAt: string;
    message: string;
}

export interface GoogleAuthRequest {
    idToken: string;
    email: string;
    fullName: string;
    companyName: string;
    userType: UserType;
    role: UserRole;
}

export interface EnterpriseSsoAuthRequest {
    ssoAssertionToken: string;
    corporateDomain: string;
    email: string;
    companyName: string;
    userType: UserType;
    role: UserRole;
}

// ============================================================================
// MODULE 1: AUTO RESTOCK API PAYLOADS
// ============================================================================

export interface ConfirmRestockRequest {
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
}

export interface ConfirmRestockResponse {
    poNumber: string;
    status: string;
    confirmationStatus: string;
    isConfirmed: boolean;
    message: string;
    updatedAt: string;
}

export interface ContactSupplierRequest {
    poNumber: string;
    supplierName: string;
    supplierPhoneNumber: string;
    channel: 'WHATSAPP' | 'EMAIL' | 'SMS';
    messageBody: string;
    userID: string;
}

export interface ContactSupplierResponse {
    poNumber: string;
    deliveryStatus: string;
    sentAt: string;
    responseCode: number;
    message: string;
}

// ============================================================================
// ORDER MODULE API PAYLOADS
// ============================================================================

export interface ProcessNlpOrderRequest {
    rawOrderText: string;
    customerName: string;
    requestedDate: string;
    userID: string;
}

export interface ProcessNlpOrderResponse {
    parseSuccess: boolean;
    hasSufficientStock: boolean;
    extractedItems: ExtractedNlpOrderItem[];
    calculatedSubtotal: number;
    currency: string;
}

export interface CreateInvoiceOrderLine {
    lineID: string;
    productID: string;
    quantity: number;
    lineTotal: number;
    currency: string;
}

export interface CreateInvoiceOrderRequest {
    orderID: string;
    requestedDate: string;
    subtotal: number;
    currency: string;
    internalNotes: string;
    createdBy: string;
    lineOrders: CreateInvoiceOrderLine[];
}

export interface CreateInvoiceOrderResponse {
    orderID: string;
    invoiceID: string;
    status: string;
    databaseUpdated: boolean;
    invoicePdfUrl: string;
    createdAt: string;
}

export interface ApproveCustomerOrderRequest {
    orderID: string;
    invoiceID: string;
    approvalAction: 'APPROVE' | 'REJECT' | 'MODIFY';
    approvalNotes: string;
    updatedBy: string;
}

export interface ApproveCustomerOrderResponse {
    orderID: string;
    finalStatus: string;
    inventoryDeducted: boolean;
    updatedAt: string;
    message: string;
}

// ============================================================================
// MODULE 6: BUSINESS LICENSE & COMPLIANCE RENEWAL ENTITIES & PAYLOADS
// ============================================================================

export type CompanyType = 'SDN_BHD' | 'ENTERPRISE' | 'LLP';

export type LicenseType =
    | 'PREMISE_LICENSE'
    | 'SIGNBOARD_LICENSE'
    | 'FOOD_ESTABLISHMENT';

export type ComplianceStatus =
    | 'ACTIVE'
    | 'EXPIRING_SOON'
    | 'EXPIRED'
    | 'PENDING_RENEWAL';

export type ComplianceDocType =
    | 'SSM_CERT_FORM_9'
    | 'TENANCY_AGREEMENT'
    | 'FLOOR_PLAN'
    | 'FIRE_SAFETY_CERT'
    | 'PREVIOUS_LICENSE';

export type RenewalTaskStatus =
    | 'ASSIGNED_TO_AGENT'
    | 'SUBMITTED_TO_PBT'
    | 'APPROVED_RENEWED'
    | 'REJECTED';

export interface BusinessComplianceProfile {
    registrationNo: string;
    companyName: string;
    companyType: CompanyType | string;
    ssmExpiryDate: string; // ISO Date YYYY-MM-DD
    councilName: string; // Target PBT, e.g., MBPJ, MBSA, DBKL
    licenseType: LicenseType | string;
    licenseExpiryDate: string; // ISO Date YYYY-MM-DD
    complianceStatus: ComplianceStatus;
    autoAlertEnabled: boolean;
}

export interface DocumentVaultItem {
    docID: string;
    registrationNo: string;
    docType: ComplianceDocType | string;
    fileUrl: string;
    fileSizeKb: number;
    effectiveDate?: string;
    expiryDate?: string;
    uploadedAt: string;
    uploadedBy: string;
}

export interface RenewalChecklistStep {
    step: number;
    name: string;
    isCompleted: boolean;
}

export interface RenewalTask {
    renewalID: string;
    registrationNo: string;
    companyName: string;
    councilName: string;
    licenseType: string;
    filingMode: string;
    status: RenewalTaskStatus;
    assignedAgentID: string;
    pbtPortalUrl: string;
    submissionReferenceNo: string | null;
    compiledSubmissionPdfUrl: string;
    generatedChecklist: { step: number; name: string; isCompleted: boolean }[];
    targetDeadline: string;
    renewalFee: number;
    currency: string;
    internalNotes?: string;
    createdAt?: string;
}
// 1. Real-Time SSM Business Lookup & Auto-Populate
export interface SSMVerifyRequest {
    registrationNo: string;
    companyName: string;
    userID: string;
}

export interface SSMVerifyResponse {
    registrationNo: string;
    companyName: string;
    companyType: CompanyType | string;
    isValid: boolean;
    ssmStatus: string;
    ssmExpiryDate: string;
    daysUntilExpiry: number;
    isWithinRenewalWindow: boolean;
    verificationSource: string;
    verifiedAt: string;
}

// 2. License & Compliance Expiry Alert Check
export interface CheckComplianceExpiryRequest {
    expiryThresholdDays: number;
    councilFilter: string;
    userID: string;
}

export interface ExpiringLicenseItem {
    registrationNo: string;
    companyName: string;
    licenseType: LicenseType | string;
    councilName: string;
    expiryDate: string;
    daysRemaining: number;
    urgencyLevel: ComplianceStatus | string;
    actionRequired: string;
}

export interface CheckComplianceExpiryResponse {
    lastCheckedAt: string;
    totalLicensesMonitored: number;
    expiringItems: ExpiringLicenseItem[];
}

// 3. Centralized Form Management & Document Vault
export interface StoreComplianceDocRequest {
    registrationNo: string;
    docType: ComplianceDocType | string;
    fileUrl: string;
    fileSizeKb: number;
    effectiveDate: string;
    expiryDate: string;
    createdBy: string;
}

export interface StoreComplianceDocResponse {
    docID: string;
    registrationNo: string;
    docType: ComplianceDocType | string;
    fileStored: boolean;
    formattedPackageReady: boolean;
    storedAt: string;
    message: string;
}

// 4. Assisted Filing & RPA / Concierge Renewal Initiation
export interface InitiateRenewalRequest {
    registrationNo: string;
    councilName: string;
    licenseType: LicenseType | string;
    filingMode: string;
    selectedDocumentIds: string[];
    renewalFeeEstimate: number;
    currency: string;
    internalNotes: string;
    createdBy: string;
}

export interface InitiateRenewalResponse {
    renewalID: string;
    status: RenewalTaskStatus;
    targetCouncil: string;
    pbtPortalUrl: string;
    generatedChecklist: RenewalChecklistStep[];
    compiledSubmissionPdfUrl: string;
    assignedAgentID: string | null;
    deadlineDate: string;
    createdAt: string;
}

// 5. Concierge / RPA Task Status Update
export interface UpdateRenewalTaskRequest {
    renewalID: string;
    action: string;
    submissionReferenceNo: string;
    pbtReceiptUrl: string;
    agentNotes: string;
    updatedBy: string;
}

export interface UpdateRenewalTaskResponse {
    renewalID: string;
    currentStatus: RenewalTaskStatus;
    submissionReferenceNo: string;
    isAcknowledged: boolean;
    nextFollowUpDate: string;
    updatedAt: string;
    message: string;
}