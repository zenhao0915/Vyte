package com.hazendust.vyte.route.order

import kotlinx.serialization.Serializable

/**
 * 接收客户订单的请求体（支持 WhatsApp 自然语言消息或结构化录入）
 */
@Serializable
data class IngestOrderRequest(
    val rawMessage: String,
    val customerName: String = "WhatsApp Customer",
    val channel: String = "WHATSAPP"
)

/**
 * 解析出的商品详情项
 */
@Serializable
data class ParsedItemDto(
    val productName: String,
    val matchedProductId: String?,
    val requestedQuantity: Int,
    val unitPrice: Double
)

/**
 * 缺货差额分析项（用于向前台反馈短缺明细）
 */
@Serializable
data class OrderDeficitDto(
    val productId: String,
    val productName: String,
    val requestedQuantity: Int,
    val currentStock: Int,
    val deficitQuantity: Int
)

/**
 * 订单接入处理的响应体
 */
@Serializable
data class IngestOrderResponse(
    val orderId: String,
    val customerName: String,
    val hasDeficit: Boolean,
    val status: String, // "FULFILLED" 或 "PENDING_RESTOCK_APPROVAL"
    val parsedItems: List<ParsedItemDto>,
    val deficits: List<OrderDeficitDto>,
    val invoiceId: String? = null,
    val restockTaskId: String? = null,
    val message: String
)

/**
 * 查询历史客户订单简报响应
 */
@Serializable
data class CustomerOrderSummaryResponse(
    val orderId: String,
    val customerName: String,
    val rawMessage: String,
    val totalAmount: Double,
    val status: String,
    val createdAt: String
)