// src/types/vyte.ts


export type CurrencyCode = 'MYR' | 'SGD' | 'USD' | 'RMB';

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
    MYR: 'RM',
    SGD: 'S$',
    USD: '$',
    RMB: '¥',
};

export type UserRole = 'SME_OWNER' | 'MANAGER' | 'OPERATIONS_STAFF';

export interface UserSession {
    userID: string;
    userName: string;
    email: string;
    userType: 'CEO' | 'Manager' | 'Staff';
    role: UserRole;
    companyName: string;
    companyOwnerName?: string;
}

export type ActiveTab = 'mod1' | 'mod2' | 'mod3' | 'mod4' | 'mod5' | 'mod6' | 'logs';

export type IndustryProfile = 'FNB_PERISHABLE' | 'RETAIL_VARIANT' | 'B2B_RAW_MATERIAL';

export type CompanyType = 'SDN_BHD' | 'ENTERPRISE' | 'LLP';

export type LicenseType =
    | 'PREMISE_LICENSE'
    | 'SIGNBOARD_LICENSE'
    | 'FOOD_ESTABLISHMENT'
    | 'PREMISE_TENANCY_CONTRACT'
    | 'SOFTWARE_SUBSCRIPTION_LICENSE'
    | 'FLEET_ROADTAX_PUSPAKOM'
    | 'EQUIPMENT_OEM_WARRANTY';

export type ComplianceStatus =
    | 'ACTIVE'
    | 'EXPIRING_SOON'
    | 'EXPIRED'
    | 'PENDING_RENEWAL';

export type ComplianceDocType =
    | 'SSM_CERT_FORM_9'
    | 'TENANCY_AGREEMENT'
    | 'SOFTWARE_LICENSE_AGREEMENT'
    | 'FLOOR_PLAN'
    | 'FIRE_SAFETY_CERT'
    | 'PREVIOUS_LICENSE';

export type ComplianceAssetCategory =
    | 'SSM_PBT_LICENSE'
    | 'RENTAL_CONTRACT'
    | 'SOFTWARE_LICENSE'
    | 'FLEET_VEHICLE'
    | 'EQUIPMENT_WARRANTY';

export type RenewalTaskStatus =
    | 'ASSIGNED_TO_AGENT'
    | 'SUBMITTED_TO_PBT'
    | 'APPROVED_RENEWED'
    | 'REJECTED';

export type SstTaxCode = 'EXEMPT_0' | 'FNB_LOGISTICS_6' | 'SERVICE_8' | 'SALES_10';

export const DOC_TYPES = [
    // Building & Rental Contracts
    { label: 'Stamped Tenancy Agreement (Rental Contract)', value: 'TENANCY_AGREEMENT' },
    { label: 'Building Floor Plan / CCC / Bomba Fire Safety', value: 'BUILDING_CCC_SAFETY' },

    // Car / Fleet Licences
    { label: 'JPJ Vehicle Ownership Grant (VOC) & Road Tax', value: 'VEHICLE_ROADTAX_VOC' },
    { label: 'PUSPAKOM VR1 Commercial Inspection Disc', value: 'PUSPAKOM_INSPECTION_SLIP' },

    // Warranties
    { label: 'Equipment OEM Warranty Card & Invoice', value: 'EQUIPMENT_WARRANTY_CERT' },

    // Software Licences
    { label: 'Software License Agreement / SaaS Master Contract', value: 'SOFTWARE_EULA_CONTRACT' },

    // Statutory
    { label: 'SSM Form 9 / PBT Premise License', value: 'SSM_CERT_FORM_9' },
];

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
    performance?: string;
    visibility?: boolean;
    isRemoved?: boolean;
    removedAt?: string;
    frozenUnitsSold?: number;
    frozenRevenueRM?: number;
    batchNo?: string;
    expiryDate?: string;
    variantSpec?: string;
    photoUrl?: string;
    valuationClass?: string;
    priceControl?: 'V' | 'S';
    restockStatus: 'HEALTHY' | 'TRIGGERED_PENDING_APPROVAL' | 'SUPPLIER_CONTACTED' | 'CONFIRMED';
}

export interface SupplierBid {
    bidId: string;
    productId: string;
    productSku?: string;
    sku?: string; // 兼容别名
    productName: string;
    supplierCode?: string;
    supplierId?: string; // 兼容别名
    supplierName: string;
    supplierContact?: string;
    address: string;
    status: 'Submitted' | 'Awarded' | string;
    quotationNetValueRM: number;
    unitPriceRM: number;
    quotedQty?: number;
    uom?: string;
    quotationDate?: string;
    leadTimeDays: number;
    pastDefectRatePct?: number;
    pastOrdersCount?: number;
    pastExperienceNote?: string;
    staffSampleComment?: string;
    staffComment?: string; // 兼容别名
    sampleTestStatus?: 'PASSED' | 'FAILED' | 'PENDING_TEST';
    sampleTestResult?: 'PASSED' | 'FAILED' | 'MINOR_ISSUES'; // 兼容别名
    aiQualityScore: number;
    aiRecommendation: string;
    isAiRecommended?: boolean;
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
    hrTaskId?: string;
    assignedStaffId?: string;
    assignedStaffName?: string;
    assignedStaffDepartment?: string;
    assignedStaffPosition?: string;
    assignedStaffRole?: string;
    assignedPriority?: 'URGENT' | 'HIGH' | 'NORMAL';
    assignedDueDate?: string;
    hrNotes?: string;
    assignedAt?: string;
    hrEscalated?: boolean;
    hrEscalationPayload?: any;
    completedAtDate?: string;
    completedLate?: boolean;
}

export interface InvoiceItem {
    id: string;
    invNo: string;
    type: 'SUPPLIER_PAYABLE' | 'CUSTOMER_RECEIVABLE';
    party: string;
    date: string;
    dueDate?: string;
    amountRM: number;
    sstCode?: SstTaxCode;
    sstRatePct?: number;
    sstAmountRM?: number;
    sapTaxCode?: 'XI' | '0';
    reconciliationAccount?: string;
    glOffsetAccount?: string;
    paymentTerms?: string;
    doubleInvoiceChecked?: boolean;
    poReference?: string;
    grnDocNo?: string;
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

export interface BusinessComplianceProfile {
    registrationNo: string;
    companyName: string;
    companyType: string;
    ssmExpiryDate: string;
    councilName: string;
    licenseType: string;
    licenseExpiryDate: string;
    complianceStatus: 'EXPIRING_SOON' | 'EXPIRED' | 'COMPLIANT';
    autoAlertEnabled: boolean;
    assetCategory: string;
    rentalAddress?: string;
    landlordName?: string;
    monthlyRentRM?: number;
    contractStartDate?: string;
    annualFeeRM?: number;
    fiveYearDiscountPct?: number;
    selectedRenewalTermYears?: number;
    warrantyPeriodMonths?: number;
    warrantyClaimed?: boolean;
}

export interface DocumentVaultItem {
    docID: string;
    registrationNo: string;
    docType: string;
    fileUrl: string;
    fileSizeKb: number;
    effectiveDate: string;
    expiryDate: string;
    uploadedAt: string;
    uploadedBy: string;
    notes: string;
}

export interface RenewalTask {
    renewalID: string;
    registrationNo: string;
    companyName: string;
    councilName: string;
    licenseType: string;
    filingMode: string;
    status: string;
    assignedAgentID: string;
    pbtPortalUrl: string;
    submissionReferenceNo: string | null;
    compiledSubmissionPdfUrl: string;
    generatedChecklist: { step: number; name: string; isCompleted: boolean }[];
    targetDeadline: string;
    renewalFee: number;
    renewalTermYears: number;
    savedDiscountRM: number;
    currency: string;
    internalNotes: string;
    createdAt: string;
}

export interface SupportTicket {
    ticketId: string;
    subject: string;
    category: 'INVENTORY_ENGINE' | 'HARDWARE_SCANNER' | 'ON_SITE_MAINTENANCE' | 'DATA_MIGRATION';
    priority: 'URGENT_SLA' | 'HIGH' | 'NORMAL';
    status: 'OPEN_ASSIGNED' | 'IN_PROGRESS' | 'RESOLVED';
    createdAt: string;
    assignedEngineer: string;
    resolutionNote: string;
}

export interface ExtractedNlpOrderItem {
    productID: string;
    SKU: string;
    name: string;
    requestedQty: number;
    availableStock: number;
    shortageQty?: number;
    isStockEnough: boolean;
    sellingPrice: number;
    lineTotal: number;
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
    urgency: 'CRITICAL' | 'HIGH' | 'NORMAL';
    humanStatus: string;
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
    extraAttr?: string;
    photoUrl?: string;
}

export interface OrbyteHrStaff {
    staffId: string;
    name: string;
    department: string;
    position: string;
    shiftStatus: 'ON_DUTY' | 'BUSY';
}

export interface SupplierQuotationBid {
    quotationNo: string;
    rfqNo: string;
    productId: string;
    sku: string;
    productName: string;
    orderQty: number;
    uom: string;
    supplierCode: string;
    supplierName: string;
    supplierContact: string;
    address: string;
    status: 'Submitted' | 'Awarded' | 'Completed';
    unitPriceRM: number;
    totalNetValueRM: number;
    quotationDate: string;
    deliveryLeadDays: number;
    fullyQuotedItems: string;
    bestPricedItems: string;
    pastOrdersCount: number;
    pastDefectRatePct: number;
    pastExperienceNote: string;
    sampleTestStatus: 'PASSED' | 'WARNING' | 'FAILED' | 'PENDING';
    staffSampleComment: string;
    testedByStaff: string;
    aiQualityScore: number;
    aiRecommendation: 'RECOMMENDED_BEST_VALUE' | 'LOWEST_PRICE_HIGH_RISK' | 'ACCEPTABLE_BACKUP' | 'AVOID_DEFECT_RISK';
    aiAnalysisNote: string;
}

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

export interface AccountingStatutoryDeadline {
    id: string;
    formCode: string;
    title: string;
    authority: 'LHDN (Inland Revenue)' | 'RMCD (Customs SST)' | 'SSM (Companies Commission)' | 'KWSP / PERKESO';
    frequency: 'ANNUAL' | 'BI_MONTHLY' | 'MONTHLY' | 'QUARTERLY';
    dueDate: string;
    estimatedPayableRM: number;
    penaltyRule: string;
    status: 'PENDING_FILING' | 'PREPARED_READY' | 'FILED_COMPLETED';
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