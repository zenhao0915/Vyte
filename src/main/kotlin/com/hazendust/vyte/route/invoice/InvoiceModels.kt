package com.hazendust.vyte.route.invoice

import kotlinx.serialization.Serializable

// ==========================================
// Invoice Module
// ==========================================

/**
 * Mirrors the frontend `InvoiceItem` interface exactly (field names are case-sensitive).
 * fileUrl and notes have no default, so they are sent as an explicit null when empty.
 */
@Serializable
data class InvoiceItem(
    val id: String,
    val invNo: String,
    val type: String, // "SUPPLIER_PAYABLE", "CUSTOMER_RECEIVABLE"
    val party: String,
    val date: String, // "21 Oct 2026"
    val amountRM: Double,
    val aiCategory: String,
    val aiConfidence: Int, // 0-100
    val paid: Boolean,
    val status: String, // "NEEDS_REVIEW", "VERIFIED"
    val dueDate: String, // "21 Nov 2026"
    val overdue: Boolean, // not paid and dueDate before today (Malaysia time)
    val sourceRef: String, // product id / PO number / order id, "" if none
    val fileUrl: String?,
    val notes: String?
)

/**
 * POST /api/invoices
 */
@Serializable
data class CreateInvoiceRequest(
    val type: String? = null,
    val party: String? = null,
    val amountRM: Double? = null,
    val date: String? = null, // "21 Oct 2026" or "2026-10-21"; defaults to today
    val dueDate: String? = null, // defaults to date + 30 days
    val aiCategory: String? = null,
    val invNo: String? = null,
    val sourceRef: String? = null,
    val notes: String? = null
)

/**
 * POST /api/invoices/upload as JSON (multipart/form-data uses the same field names plus a "file" part)
 */
@Serializable
data class UploadInvoiceRequest(
    val rawText: String? = null,
    val type: String? = null,
    val userID: String = ""
)

/**
 * PATCH /api/invoices/{id} — only while NEEDS_REVIEW; only the fields that are present are changed.
 * notes: "" clears the note.
 */
@Serializable
data class UpdateInvoiceRequest(
    val party: String? = null,
    val amountRM: Double? = null,
    val aiCategory: String? = null,
    val dueDate: String? = null,
    val notes: String? = null,
    val type: String? = null,
    val userID: String = ""
)

/**
 * PATCH /api/invoices/{id}/verify
 */
@Serializable
data class VerifyInvoiceRequest(
    val userID: String = "",
    val role: String = ""
)

/**
 * PATCH /api/invoices/{id}/paid — { paid: false } undoes a payment.
 */
@Serializable
data class MarkInvoicePaidRequest(
    val userID: String = "",
    val paid: Boolean = true
)

/**
 * GET /api/invoices/summary
 */
@Serializable
data class InvoiceSummary(
    val toReceiveRM: Double,
    val toPayRM: Double,
    val overdueCount: Int,
    val overdueRM: Double,
    val needsReviewCount: Int,
    val paidThisMonthRM: Double
)

/**
 * Query filters for GET /api/invoices.
 */
data class InvoiceFilter(
    val type: String? = null,
    val status: String? = null,
    val overdue: Boolean? = null,
    val party: String? = null,
    val from: java.time.LocalDate? = null,
    val to: java.time.LocalDate? = null
)

/**
 * InvoiceItem fields that DataStore.InvoiceEntity does not hold.
 * Shared fields (type, amount, category, date, relatedRef = sourceRef) stay in DataStore.invoices.
 */
data class InvoiceExtras(
    val invNo: String,
    val party: String,
    val aiConfidence: Int,
    val dueDate: String, // ISO yyyy-MM-dd
    val paid: Boolean = false,
    val paidOn: String? = null, // ISO yyyy-MM-dd, for paidThisMonthRM
    val status: String = "NEEDS_REVIEW",
    val notes: String? = null,
    val fileName: String? = null, // file under uploads/
    val fileUrl: String? = null,
    val createdByInvoiceModule: Boolean = false
)
