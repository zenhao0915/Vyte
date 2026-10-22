// src/types/vyte.ts

export type UserRole = 'SME_OWNER' | 'MANAGER' | 'OPERATIONS_STAFF';
export type IndustryProfile = 'FNB_PERISHABLE' | 'RETAIL_VARIANT' | 'B2B_RAW_MATERIAL';
export type ActiveTab = 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5' | 'logs';
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
    // Orbyte HR System Integration Fields
    hrTaskId?: string;
    assignedStaffId?: string;
    assignedStaffName?: string;
    assignedStaffRole?: string;
    assignedPriority?: 'URGENT' | 'HIGH' | 'NORMAL';
    hrNotes?: string;
    assignedAt?: string;
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