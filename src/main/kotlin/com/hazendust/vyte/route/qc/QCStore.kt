package com.hazendust.vyte.route.qc

import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.product.ProductResult
import com.hazendust.vyte.route.product.ProductService
import io.ktor.http.*
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

sealed interface QCResult {
    data class Ok(val alert: QCAlert) : QCResult
    data class Fail(val status: HttpStatusCode, val error: String) : QCResult
}

object QCStore {
    val STATUSES = setOf("PENDING_APPROVAL", "ASSIGNED_TO_STAFF", "APPROVED_RESOLVED")
    const val WRITE_OFF = "Approve Write-off"
    private const val NO_BATCH = "N/A"
    private const val ALERT_WINDOW_DAYS = 7
    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")

    private val alerts get() = WorkspaceContext.current().qcAlerts
    private val alertProductIds get() = WorkspaceContext.current().qcAlertProductIds

    fun list(status: String?): List<QCAlert> =
        alerts.filter { status == null || it.status == status }

    fun productIdOf(alertId: String): String? = alertProductIds[alertId]

    @Synchronized
    fun addCustom(alert: QCAlert): QCAlert {
        alerts.removeIf { it.id == alert.id }
        alerts.add(0, alert)
        return alert
    }

    @Synchronized
    fun assignStaff(id: String, req: AssignQCStaffRequest): QCResult {
        val index = alerts.indexOfFirst { it.id == id }
        if (index < 0) return QCResult.Fail(HttpStatusCode.NotFound, "QC alert $id not found")
        val current = alerts[index]
        val taskId = current.hrTaskId ?: "WH-TASK-${(1000..9999).random()}"
        val updated = current.copy(
            status = "ASSIGNED_TO_STAFF",
            hrTaskId = taskId,
            assignedStaffId = req.staff.staffId,
            assignedStaffName = req.staff.name,
            assignedStaffDepartment = req.staff.department,
            assignedStaffPosition = req.staff.position,
            assignedStaffRole = "${req.staff.position} (${req.staff.department})",
            assignedPriority = req.priority,
            assignedDueDate = req.dueDate,
            hrNotes = req.staffNotes.ifBlank { current.aiSuggestion },
            assignedAt = java.time.LocalTime.now(MALAYSIA).format(java.time.format.DateTimeFormatter.ofPattern("HH:mm:ss")),
            hrEscalated = false,
            hrEscalationPayload = null
        )
        alerts[index] = updated
        return QCResult.Ok(updated)
    }

    @Synchronized
    fun escalate(id: String, req: EscalateQCAlertRequest): QCResult {
        val index = alerts.indexOfFirst { it.id == id }
        if (index < 0) return QCResult.Fail(HttpStatusCode.NotFound, "QC alert $id not found")
        val current = alerts[index]
        val updated = current.copy(
            assignedDueDate = req.simulatedPastDate ?: current.assignedDueDate,
            hrEscalated = true,
            hrEscalationPayload = req.payload
        )
        alerts[index] = updated
        return QCResult.Ok(updated)
    }

    @Synchronized
    fun approve(id: String, userID: String, role: String): QCResult {
        val index = alerts.indexOfFirst { it.id == id }
        if (index < 0) return QCResult.Fail(HttpStatusCode.NotFound, "QC alert $id not found")

        val alert = alerts[index]
        if (alert.status == "APPROVED_RESOLVED") {
            return QCResult.Fail(HttpStatusCode.Conflict, "QC alert $id is already APPROVED_RESOLVED")
        }

        if (alert.actionLabel == WRITE_OFF) {
            val productId = alertProductIds[id]
            val product = productId?.let { ProductService.find(it) }
            if (product != null && product.stock > 0) {
                val writeOff = ProductService.changeStock(
                    product.id, "DAMAGE", -product.stock,
                    "QC write-off: batch ${alert.batchNo} expired ${alert.expiryDate}", userID, role
                )
                if (writeOff is ProductResult.Fail) return QCResult.Fail(writeOff.status, writeOff.error)
            }
        }

        val todayIso = LocalDate.now(MALAYSIA).toString()
        val isLate = alert.hrEscalated == true || (alert.assignedDueDate != null && alert.assignedDueDate < todayIso)
        val resolved = alert.copy(
            status = "APPROVED_RESOLVED",
            completedAtDate = todayIso,
            completedLate = isLate
        )
        alerts[index] = resolved
        return QCResult.Ok(resolved)
    }

    /**
     * Rule-based scan (under the lock), then AI suggestions for the new alerts (outside the lock). Logs both.
     */
    fun scanAndSuggest(automatic: Boolean): QCScanResponse {
        val result = scan()
        val enriched = QCAi.enrich(result.newAlerts)
        val response = result.copy(newAlerts = enriched.alerts)
        AuditService.log(AuditService.QC, AuditService.OPERATIONS_STAFF, scanSummary(response, automatic))
        enriched.auditLine?.let { AuditService.log(AuditService.QC, AuditService.OPERATIONS_STAFF, it) }
        return response
    }

    /** Replaces the suggestion of a still-pending alert; null if it is gone or already resolved. */
    @Synchronized
    fun applyAi(alertId: String, aiSuggestion: String, actionLabel: String, savedRM: Double): QCAlert? {
        val index = alerts.indexOfFirst { it.id == alertId }
        if (index < 0 || alerts[index].status != "PENDING_APPROVAL") return null
        val updated = alerts[index].copy(aiSuggestion = aiSuggestion, actionLabel = actionLabel, savedRM = savedRM)
        alerts[index] = updated
        return updated
    }

    @Synchronized
    fun scan(): QCScanResponse {
        val today = LocalDate.now(MALAYSIA)
        val candidates = ProductService.list("FNB_PERISHABLE", null)
            .filter { it.expiryDate != null && it.stock > 0 }

        val newAlerts = candidates.mapNotNull { product ->
            val expiry = runCatching { LocalDate.parse(product.expiryDate) }.getOrNull() ?: return@mapNotNull null
            val daysLeft = ChronoUnit.DAYS.between(today, expiry).toInt()
            if (daysLeft > ALERT_WINDOW_DAYS) return@mapNotNull null

            val batchNo = product.batchNo ?: NO_BATCH
            val alreadyOpen = alerts.any {
                it.status == "PENDING_APPROVAL" && it.sku == product.sku && it.batchNo == batchNo
            }
            if (alreadyOpen) return@mapNotNull null

            val stockValue = product.stock * product.priceRM
            val (triggerReason, suggestion, actionLabel, savedRM) = when {
                daysLeft < 0 -> RuleSuggestion(
                    "Batch expired",
                    "Quarantine and dispose of the batch",
                    WRITE_OFF,
                    0.0
                )

                daysLeft <= 2 -> RuleSuggestion(
                    "Expires in $daysLeft ${if (daysLeft == 1) "day" else "days"}",
                    "Mark down 30% today and bundle with a best seller",
                    "Approve Markdown",
                    stockValue * 0.7
                )

                else -> RuleSuggestion(
                    "Batch approaching freshness window",
                    "Bundle into a weekend combo (15% off) and pause auto-restock for 3 days",
                    "Approve Bundle Promo",
                    stockValue * 0.75
                )
            }

            val alert = QCAlert(
                id = newId(),
                productName = product.name,
                sku = product.sku,
                batchNo = batchNo,
                expiryDate = product.expiryDate!!,
                daysLeft = daysLeft,
                qtyAffected = "${product.stock} ${product.uom}",
                triggerReason = triggerReason,
                aiSuggestion = suggestion,
                actionLabel = actionLabel,
                savedRM = Math.round(savedRM * 100) / 100.0,
                status = "PENDING_APPROVAL"
            )
            alerts.add(0, alert)
            alertProductIds[alert.id] = product.id
            alert
        }

        return QCScanResponse(newAlerts = newAlerts, scannedCount = candidates.size)
    }

    fun scanSummary(result: QCScanResponse, automatic: Boolean): String {
        val prefix = if (automatic) "Daily 07:00 QC scan" else "QC scan"
        val found = when (result.newAlerts.size) {
            0 -> "no new expiry alerts"
            1 -> "1 new expiry alert (${result.newAlerts[0].productName})"
            else -> "${result.newAlerts.size} new expiry alerts (${result.newAlerts.joinToString(", ") { it.productName }})"
        }
        return "$prefix checked ${result.scannedCount} perishable batches: $found."
    }

    private fun newId(): String {
        var id: String
        do {
            id = "QC-${System.currentTimeMillis() % 100000}"
        } while (alerts.any { it.id == id })
        return id
    }

    private data class RuleSuggestion(
        val triggerReason: String,
        val aiSuggestion: String,
        val actionLabel: String,
        val savedRM: Double
    )
}
