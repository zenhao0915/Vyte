package com.hazendust.vyte.route.audit

import com.hazendust.vyte.data.AuditLogEntity
import com.hazendust.vyte.data.DataStore
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * Public entry point for other modules: AuditService.log(module, role, detail).
 * Entries are stored in the shared DataStore.auditLogs, next to the ones the Order module writes via DataStore.recordAudit.
 */
object AuditService {
    const val SME_OWNER = "SME_OWNER"
    const val OPERATIONS_STAFF = "OPERATIONS_STAFF"

    const val PRODUCTS = "Products"
    const val QC = "Quality Control"
    const val INVOICES = "Invoices"
    const val JOBS = "Daily Jobs"

    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")
    private val STORED_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

    // AuditLogEntity has no module field and no time zone, so both are tracked here for entries this service writes
    private val ownEntryIds = mutableSetOf<String>()

    @Synchronized
    fun log(module: String, role: String, detail: String) {
        val id = newId()
        ownEntryIds.add(id)
        DataStore.auditLogs.add(
            0,
            AuditLogEntity(
                id = id,
                timestamp = ZonedDateTime.now(MALAYSIA).format(STORED_FORMAT),
                operatorRole = normaliseRole(role),
                action = module,
                details = detail
            )
        )
    }

    fun list(limit: Int): List<AuditLog> = DataStore.auditLogs
        .take(limit)
        .map { toAuditLog(it) }

    /** Anything that is not SME_OWNER (e.g. "STAFF", "User", "System") is shown as OPERATIONS_STAFF. */
    fun normaliseRole(role: String): String = if (role == SME_OWNER) SME_OWNER else OPERATIONS_STAFF

    @Synchronized
    private fun toAuditLog(entity: AuditLogEntity): AuditLog {
        val isOwn = entity.id in ownEntryIds
        return AuditLog(
            id = entity.id,
            time = formatTime(entity.timestamp, isOwn),
            module = if (isOwn) entity.action else moduleFromAction(entity.action),
            role = normaliseRole(entity.operatorRole),
            detail = entity.details
        )
    }

    /** Order module entries are stamped in the server's local zone; own entries are already Malaysia time. */
    private fun formatTime(timestamp: String, isOwn: Boolean): String = try {
        val local = LocalDateTime.parse(timestamp, STORED_FORMAT)
        val zoned = if (isOwn) local.atZone(MALAYSIA) else local.atZone(ZoneId.systemDefault()).withZoneSameInstant(MALAYSIA)
        zoned.format(TIME_FORMAT)
    } catch (e: DateTimeParseException) {
        timestamp.substringAfter(' ', timestamp)
    }

    private fun moduleFromAction(action: String): String = when {
        action.startsWith("ORDER") || action.startsWith("NLP_ORDER") -> "Orders"
        action.startsWith("SYSTEM") -> "System"
        action.startsWith("RESTOCK") -> "Restock"
        action.startsWith("SALES") -> "Sales"
        else -> action
    }

    private fun newId(): String {
        var id: String
        do {
            id = "AUD-${System.currentTimeMillis() % 100000}"
        } while (DataStore.auditLogs.any { it.id == id })
        return id
    }
}
