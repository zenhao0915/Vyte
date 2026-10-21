// src/types/orbyte.ts

export type UserRole = 'SME_OWNER' | 'MANAGER' | 'OPERATIONS_STAFF';
export type IndustryProfile = 'FNB_PERISHABLE' | 'RETAIL_VARIANT' | 'B2B_RAW_MATERIAL';
export type ActiveTab = 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5';

export interface UserSession {
    userID: string;
    userName: string;
    email: string;
    userType: 'CEO' | 'Manager' | 'Staff';
    role: UserRole;
    companyName: string;
    companyOwnerName: string;
}

// Module 1: Automation Restock & Universal SME Inventory
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
}

// Module 4: Quality Control & Expiry AI
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
    status: 'PENDING_APPROVAL' | 'APPROVED_RESOLVED';
}

// Module 5: Invoice Module & AI Categorization
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
}

// Shared Activity / Audit Log
export interface AuditLog {
    id: string;
    time: string;
    module: string;
    role: UserRole;
    detail: string;
}

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
    deliveryStatus: 'SENT' | 'QUEUED' | 'FAILED';
    sentAt: string;
    responseCode: number;
    message: string;
}

export interface GetSalesReviewReportRequest {
    filterYear: number;
    filterQuarter?: number | null;
    category?: string | null;
    productID?: string | null;
    userID: string;
}

export interface ProductSalesBreakdown {
    productID: string;
    SKU: string;
    name: string;
    category: string;
    unitsSold: number;
    totalSalesAmount: number;
    remainingStock: number;
}

export interface GetSalesReviewReportResponse {
    period: string;
    totalRevenue: number;
    totalUnitsSold: number;
    currency: string;
    productBreakdown: ProductSalesBreakdown[];
}

export interface AnalyzeProcurementRequest {
    filterYear: number;
    filterQuarter?: number | null;
    holdingCostPercentage: number;
    targetTurnoverDays: number;
    userID: string;
}

export interface ProcurementRecommendation {
    productID: string;
    SKU: string;
    name: string;
    currentStock: number;
    costOfHoldingStock: number;
    timeNeededToSellOffDays: number;
    optimalStockToHold: number;
    recommendedProcureQty: number;
    priorityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface AnalyzeProcurementResponse {
    generatedAt: string;
    aiSummary: string;
    procurementRecommendations: ProcurementRecommendation[];
}

export interface ProcessNlpOrderRequest {
    rawOrderText: string;
    customerName: string;
    requestedDate: string;
    userID: string;
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

export interface ProcessNlpOrderResponse {
    parseSuccess: boolean;
    hasSufficientStock: boolean;
    extractedItems: ExtractedNlpOrderItem[];
    calculatedSubtotal: number;
    currency: string;
}

export interface CustomerLineOrderPayload {
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
    lineOrders: CustomerLineOrderPayload[];
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
    finalStatus: 'APPROVED' | 'REJECTED' | 'MODIFIED';
    inventoryDeducted: boolean;
    updatedAt: string;
    message: string;
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
    channel: 'WHATSAPP' | 'EMAIL' | 'SMS';
    aiReasoning: string;
    urgency: 'CRITICAL' | 'HIGH' | 'MODERATE';
    humanStatus: 'AWAITING_HUMAN_PERMISSION' | 'APPROVED_SENT_TO_SUPPLIER' | 'HELD_BY_HUMAN' | 'REJECTED';
    updatedAt?: string;
}