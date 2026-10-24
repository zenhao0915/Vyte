package com.hazendust.vyte.route.order

import kotlinx.serialization.Serializable

@Serializable
data class OrderDetailDto(
    val orderID: String,
    val requestedDate: String,
    val subtotal: Double,
    val currency: String,
    val internalNotes: String? = null,
    val createdBy: String,
    val lineOrders: List<LineOrderItemRequest>,
    val status: String,
    val invoiceID: String? = null
)

@Serializable
data class ProcessNlpOrderRequest(
    val rawOrderText: String = "",
    val customerName: String = "Customer",
    val requestedDate: String = "",
    val userID: String = "",
    val imageBase64: String? = null
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
    val currency: String = "MYR"
)

@Serializable
data class LineOrderItemRequest(
    val lineID: String = "",
    val lineId: String = "",
    val productID: String = "",
    val productId: String = "",
    val sku: String = "",
    val SKU: String = "",
    val quantity: Int = 0,
    val requestedQty: Int = 0,
    val lineTotal: Double = 0.0,
    val currency: String = "MYR"
) {
    val effectiveLineId: String
        get() = lineID.ifBlank { lineId }.ifBlank { "LINE-${System.currentTimeMillis() % 100000}" }

    val effectiveIdentifier: String
        get() = productID.ifBlank { productId }.ifBlank { SKU }.ifBlank { sku }

    val effectiveQty: Int
        get() = if (quantity > 0) quantity else if (requestedQty > 0) requestedQty else 1
}

@Serializable
data class CreateInvoiceOrderRequest(
    val orderID: String = "",
    val orderId: String = "",
    val requestedDate: String = "",
    val subtotal: Double = 0.0,
    val currency: String = "MYR",
    val internalNotes: String? = null,
    val createdBy: String = "SME_OWNER",
    val lineOrders: List<LineOrderItemRequest> = emptyList(),
    val autoDeductInventory: Boolean = true // 默认创建订单即扣减库存
) {
    val effectiveOrderId: String
        get() = orderID.ifBlank { orderId }.ifBlank { "ORD-${System.currentTimeMillis() % 100000}" }
}

@Serializable
data class CreateInvoiceOrderResponse(
    val orderID: String,
    val invoiceID: String,
    val status: String,
    val databaseUpdated: Boolean,
    val invoicePdfUrl: String,
    val createdAt: String
)

@Serializable
data class ApproveCustomerOrderRequest(
    val orderID: String = "",
    val orderId: String = "",
    val invoiceID: String = "",
    val invoiceId: String = "",
    val approvalAction: String = "APPROVE",
    val approvalNotes: String = "",
    val updatedBy: String = "SME_OWNER"
) {
    val effectiveOrderId: String
        get() = orderID.ifBlank { orderId }
    val effectiveInvoiceId: String
        get() = invoiceID.ifBlank { invoiceId }
}

@Serializable
data class ApproveCustomerOrderResponse(
    val orderID: String,
    val finalStatus: String,
    val inventoryDeducted: Boolean,
    val updatedAt: String,
    val message: String
)