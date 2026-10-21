package com.hazendust.vyte.route.order

import kotlinx.serialization.Serializable

// ==========================================
// 3. Order Module
// ==========================================

/**
 * 3.1 NLP Customer Order & Stock Check
 */
@Serializable
data class ProcessNlpOrderRequest(
    val rawOrderText: String,
    val customerName: String,
    val requestedDate: String,
    val userID: String
)

@Serializable
data class ExtractedOrderItem(
    val productID: String,
    val SKU: String,
    val name: String,
    val requestedQty: Int,
    val availableStock: Int,
    val isStockEnough: Boolean,
    val sellingPrice: Float,
    val lineTotal: Double
)

@Serializable
data class ProcessNlpOrderResponse(
    val parseSuccess: Boolean,
    val hasSufficientStock: Boolean,
    val extractedItems: List<ExtractedOrderItem>,
    val calculatedSubtotal: Double,
    val currency: String
)

/**
 * 3.2 Generate Invoice & Update Database
 */
@Serializable
data class LineOrderItemRequest(
    val lineID: String,
    val productID: String,
    val quantity: Int,
    val lineTotal: Double,
    val currency: String
)

@Serializable
data class CreateInvoiceOrderRequest(
    val orderID: String,
    val requestedDate: String,
    val subtotal: Double,
    val currency: String,
    val internalNotes: String? = null,
    val createdBy: String,
    val lineOrders: List<LineOrderItemRequest>
)

@Serializable
data class CreateInvoiceOrderResponse(
    val orderID: String,
    val invoiceID: String,
    val status: String, // e.g. "PENDING_HUMAN_APPROVAL"
    val databaseUpdated: Boolean,
    val invoicePdfUrl: String,
    val createdAt: String
)

/**
 * 3.3 Human Order Approval
 */
@Serializable
data class ApproveCustomerOrderRequest(
    val orderID: String,
    val invoiceID: String,
    val approvalAction: String, // "APPROVE", "REJECT", "MODIFY"
    val approvalNotes: String,
    val updatedBy: String // userID
)

@Serializable
data class ApproveCustomerOrderResponse(
    val orderID: String,
    val finalStatus: String, // "APPROVED", "REJECTED"
    val inventoryDeducted: Boolean,
    val updatedAt: String,
    val message: String
)