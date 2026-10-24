package com.hazendust.vyte.route.compliance

import kotlinx.serialization.Serializable

@Serializable
data class DocumentVaultItemDto(
    val docID: String,
    val registrationNo: String,
    val docType: String,
    val fileUrl: String,
    val fileSizeKb: Int,
    val effectiveDate: String,
    val expiryDate: String,
    val uploadedAt: String,
    val uploadedBy: String,
    val notes: String = ""
)

@Serializable
data class ChecklistStepDto(
    val step: Int,
    val name: String,
    val isCompleted: Boolean
)

@Serializable
data class RenewalTaskDto(
    val renewalID: String,
    val registrationNo: String,
    val companyName: String,
    val councilName: String,
    val licenseType: String,
    val filingMode: String,
    val status: String,
    val assignedAgentID: String? = null,
    val pbtPortalUrl: String? = null,
    val submissionReferenceNo: String? = null,
    val compiledSubmissionPdfUrl: String? = null,
    val generatedChecklist: List<ChecklistStepDto> = emptyList(),
    val targetDeadline: String,
    val renewalFee: Double,
    val renewalTermYears: Int = 1,
    val savedDiscountRM: Double = 0.0,
    val currency: String = "MYR",
    val internalNotes: String = "",
    val createdAt: String
)

@Serializable
data class SupplierQuotationBidDto(
    val quotationNo: String,
    val rfqNo: String,
    val productId: String,
    val sku: String,
    val productName: String,
    val orderQty: Int,
    val uom: String,
    val supplierCode: String,
    val supplierName: String,
    val supplierContact: String,
    val address: String,
    var status: String,
    val unitPriceRM: Double,
    val totalNetValueRM: Double,
    val quotationDate: String,
    val deliveryLeadDays: Int,
    val fullyQuotedItems: String,
    val bestPricedItems: String,
    val pastOrdersCount: Int,
    val pastDefectRatePct: Double,
    val pastExperienceNote: String,
    val sampleTestStatus: String,
    val staffSampleComment: String,
    val testedByStaff: String,
    val aiQualityScore: Int,
    val aiRecommendation: String,
    val aiAnalysisNote: String
)

@Serializable
data class SupportTicketDto(
    val ticketId: String,
    val subject: String,
    val category: String,
    val priority: String,
    var status: String,
    val createdAt: String,
    val assignedEngineer: String,
    val resolutionNote: String
)
