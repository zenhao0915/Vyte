package com.hazendust.vyte.route.sales

import kotlinx.serialization.Serializable

@Serializable
data class GetSalesReviewReportRequest(
    val filterYear: Int,
    val filterQuarter: Int? = null,
    val category: String? = null,
    val productID: String? = null, // 改为可空，匹配前端传参
    val userID: String = ""
)

@Serializable
data class ProductSalesBreakdownItem(
    val productID: String,
    val SKU: String,
    val name: String,
    val category: String,
    val unitsSold: Int,
    val totalSalesAmount: Double,
    val remainingStock: Int
)

@Serializable
data class GetSalesReviewReportResponse(
    val period: String,
    val totalRevenue: Double,
    val totalUnitsSold: Int,
    val currency: String = "MYR",
    val productBreakdown: List<ProductSalesBreakdownItem>,
    val productID: String = "",
    val SKU: String = "",
    val name: String = "",
    val category: String = "",
    val unitsSold: Int = 0,
    val remainingStock: Int = 0
)

@Serializable
data class AnalyzeProcurementRequest(
    val filterYear: Int,
    val filterQuarter: Int? = null,
    val holdingCostPercentage: Float,
    val targetTurnoverDays: Int,
    val userID: String = ""
)

@Serializable
data class ProcurementRecommendation(
    val productID: String,
    val SKU: String,
    val name: String,
    val currentStock: Int,
    val costOfHoldingStock: Double,
    val timeNeededToSellOffDays: Int,
    val optimalStockToHold: Int,
    val recommendedProcureQty: Int,
    val priorityLevel: String
)

@Serializable
data class AnalyzeProcurementResponse(
    val generatedAt: String,
    val aiSummary: String,
    val procurementRecommendations: List<ProcurementRecommendation>
)