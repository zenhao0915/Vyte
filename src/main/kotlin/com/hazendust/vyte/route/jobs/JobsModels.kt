package com.hazendust.vyte.route.jobs

import kotlinx.serialization.Serializable

// ==========================================
// Daily Jobs Module
// ==========================================

/**
 * POST /api/jobs/run-daily
 */
@Serializable
data class RunDailyJobsRequest(
    val userID: String = "",
    val role: String = ""
)

@Serializable
data class QcJobResult(
    val scannedCount: Int,
    val newAlerts: Int
)

@Serializable
data class RestockJobResult(
    val checkedCount: Int,
    val newlyTriggered: List<String> // product ids
)

@Serializable
data class OverdueJobResult(
    val overdueCount: Int,
    val overdueRM: Double
)

@Serializable
data class RunDailyJobsResponse(
    val ranAt: String, // ISO-8601, Malaysia time
    val qcScan: QcJobResult,
    val restockCheck: RestockJobResult,
    val overdueInvoices: OverdueJobResult
)
