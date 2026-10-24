package com.hazendust.vyte.route.qc

import kotlinx.serialization.Serializable

@Serializable
data class OrbyteHrStaffDto(
    val staffId: String,
    val name: String,
    val position: String,
    val department: String,
    val shift: String = "Morning Shift",
    val whatsapp: String = "+6012-3456789",
    val activeTasksCount: Int = 1
)

@Serializable
data class OrbyteHrOverdueEscalationPayloadDto(
    val escalationId: String,
    val hrTaskId: String,
    val qcAlertId: String,
    val productName: String,
    val batchNo: String,
    val staff: OrbyteHrStaffDto,
    val assignedDueDate: String,
    val currentSystemDate: String,
    val daysOverdue: Int,
    val severity: String,
    val supervisorActionRequired: String,
    val reportedAtIso: String
)

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
    val status: String, // "PENDING_APPROVAL", "ASSIGNED_TO_STAFF", "APPROVED_RESOLVED"
    val hrTaskId: String? = null,
    val assignedStaffId: String? = null,
    val assignedStaffName: String? = null,
    val assignedStaffDepartment: String? = null,
    val assignedStaffPosition: String? = null,
    val assignedStaffRole: String? = null,
    val assignedPriority: String? = null,
    val assignedDueDate: String? = null,
    val hrNotes: String? = null,
    val assignedAt: String? = null,
    val hrEscalated: Boolean? = null,
    val hrEscalationPayload: OrbyteHrOverdueEscalationPayloadDto? = null,
    val completedAtDate: String? = null,
    val completedLate: Boolean? = null
)

@Serializable
data class QCScanResponse(
    val newAlerts: List<QCAlert>,
    val scannedCount: Int
)

@Serializable
data class ApproveQCAlertRequest(
    val userID: String = "",
    val role: String = "SME_OWNER"
)

@Serializable
data class AssignQCStaffRequest(
    val staff: OrbyteHrStaffDto,
    val priority: String = "HIGH",
    val dueDate: String,
    val staffNotes: String = "",
    val userID: String = "",
    val role: String = "SME_OWNER"
)

@Serializable
data class EscalateQCAlertRequest(
    val payload: OrbyteHrOverdueEscalationPayloadDto,
    val simulatedPastDate: String? = null,
    val userID: String = "",
    val role: String = "SME_OWNER"
)