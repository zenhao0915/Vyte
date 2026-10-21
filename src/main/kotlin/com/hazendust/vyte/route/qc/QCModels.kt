package com.hazendust.vyte.route.qc

import kotlinx.serialization.Serializable

// ==========================================
// Quality Control Module
// ==========================================

/**
 * Mirrors the frontend `QCAlert` interface exactly (field names are case-sensitive).
 */
@Serializable
data class QCAlert(
    val id: String,
    val productName: String,
    val sku: String,
    val batchNo: String,
    val expiryDate: String,
    val daysLeft: Int,
    val qtyAffected: String,
    val triggerReason: String,
    val aiSuggestion: String,
    val actionLabel: String,
    val savedRM: Double,
    val status: String // "PENDING_APPROVAL", "APPROVED_RESOLVED"
)

/**
 * POST /api/qc/scan
 */
@Serializable
data class QCScanResponse(
    val newAlerts: List<QCAlert>,
    val scannedCount: Int
)

/**
 * POST /api/qc-alerts/{id}/approve
 */
@Serializable
data class ApproveQCAlertRequest(
    val userID: String = "",
    val role: String = ""
)
