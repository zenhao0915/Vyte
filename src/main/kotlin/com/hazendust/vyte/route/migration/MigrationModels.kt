package com.hazendust.vyte.route.migration

import com.hazendust.vyte.route.invoice.InvoiceItem
import com.hazendust.vyte.route.product.NewProductForm
import com.hazendust.vyte.route.product.Product
import kotlinx.serialization.Serializable

@Serializable
data class FieldMappingItem(
    val sourceField: String,
    val targetVyteField: String,
    val sampleValue: String
)

@Serializable
data class ComplianceProfileDto(
    val registrationNo: String,
    val companyName: String,
    val companyType: String = "SDN_BHD",
    val ssmExpiryDate: String,
    val councilName: String,
    val licenseType: String = "PREMISE_LICENSE",
    val licenseExpiryDate: String,
    val complianceStatus: String = "EXPIRING_SOON",
    val autoAlertEnabled: Boolean = true,
    val assetCategory: String = "SSM_PBT_LICENSE",
    val rentalAddress: String? = null,
    val landlordName: String? = null,
    val monthlyRentRM: Double? = null,
    val contractStartDate: String? = null,
    val warrantyPeriodMonths: Int? = null,
    val annualFeeRM: Double = 450.0,
    val fiveYearDiscountPct: Int = 20,
    val selectedRenewalTermYears: Int = 1
)

@Serializable
data class ParseMigrationRequest(
    val fileName: String,
    val rawContent: String = "",
    val fileBase64: String? = null,
    val transitionMode: String = "COPILOT",
    val userID: String = ""
)

@Serializable
data class AiParsedPreviewResponse(
    val detectedSystem: String,
    val fileFormat: String,
    val aiConfidence: Int,
    val fieldMappings: List<FieldMappingItem>,
    val products: List<Product>,
    val invoices: List<InvoiceItem>,
    val complianceProfiles: List<ComplianceProfileDto>,
    val aiSummary: String
)

@Serializable
data class CommitMigrationInvoiceInput(
    val invNo: String? = null,
    val type: String = "CUSTOMER_RECEIVABLE",
    val party: String,
    val date: String? = null,
    val dueDate: String? = null,
    val amountRM: Double,
    val aiCategory: String = "Migrated Legacy AR/AP",
    val aiConfidence: Int = 95,
    val paid: Boolean = false,
    val status: String = "NEEDS_REVIEW"
)

@Serializable
data class CommitMigrationRequest(
    val sourceFileName: String,
    val transitionMode: String = "COPILOT",
    val products: List<NewProductForm> = emptyList(),
    val invoices: List<CommitMigrationInvoiceInput> = emptyList(),
    val complianceProfiles: List<ComplianceProfileDto> = emptyList(),
    val userID: String = "",
    val role: String = "SME_OWNER"
)

@Serializable
data class CommitMigrationResponse(
    val status: String,
    val transitionMode: String,
    val importedProducts: List<Product>,
    val importedInvoices: List<InvoiceItem>,
    val importedComplianceProfiles: List<ComplianceProfileDto>,
    val summary: String
)