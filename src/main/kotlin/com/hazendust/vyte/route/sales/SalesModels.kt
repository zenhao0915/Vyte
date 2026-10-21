package com.hazendust.vyte.route.sales

import kotlinx.serialization.Serializable

// ==========================================
// 2. Sales Review Module
// ==========================================

/**
 * 2.1 Final Product Report (扁平化 Primitive Type 结构)
 */
@Serializable
data class GetSalesReviewReportRequest(
    val filterYear: Int,
    val filterQuarter: Int? = null,
    val category: String? = null,
    val productID: String,
    val userID: String
)

@Serializable
data class GetSalesReviewReportResponse(
    val period: String,
    val productID: String,
    val SKU: String,
    val name: String,
    val category: String,
    val currency: String,
    val unitsSold: Int,
    val totalRevenue: Double,
    val remainingStock: Int
)

/**
 * 2.2 AI Procurement Analysis (Holding Cost & Stock-to-Hold)
 */
@Serializable
data class AnalyzeProcurementRequest(
    val filterYear: Int,
    val filterQuarter: Int? = null,
    val holdingCostPercentage: Float,
    val targetTurnoverDays: Int,
    val userID: String
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
    val priorityLevel: String // "HIGH", "MEDIUM", "LOW"
)

@Serializable
data class AnalyzeProcurementResponse(
    val generatedAt: String,
    val aiSummary: String,
    val procurementRecommendations: List<ProcurementRecommendation>
)

