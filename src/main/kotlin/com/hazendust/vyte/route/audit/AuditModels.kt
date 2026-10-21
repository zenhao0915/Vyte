package com.hazendust.vyte.route.audit

import kotlinx.serialization.Serializable

// ==========================================
// Audit & Dashboard Module
// ==========================================

/**
 * Mirrors the frontend `AuditLog` interface exactly (field names are case-sensitive).
 */
@Serializable
data class AuditLog(
    val id: String,
    val time: String, // "HH:mm:ss", Malaysia time
    val module: String,
    val role: String, // "SME_OWNER", "OPERATIONS_STAFF"
    val detail: String
)

/**
 * GET /api/dashboard/kpis
 */
@Serializable
data class DashboardKpis(
    val totalSkus: Int,
    val pendingRestocks: Int,
    val pendingQcBatches: Int,
    val totalInvoices: Int,
    val pendingInvoiceReviews: Int
)
