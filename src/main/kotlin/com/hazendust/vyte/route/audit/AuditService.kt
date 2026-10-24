// AuditService.kt 完整替换：
package com.hazendust.vyte.route.audit

import com.hazendust.vyte.data.AuditLogEntity
import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.WorkspaceContext
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

object AuditService {
    const val SME_OWNER = "SME_OWNER"
    const val MANAGER = "MANAGER"
    const val OPERATIONS_STAFF = "OPERATIONS_STAFF"

    const val PRODUCTS = "Products"
    const val QC = "Quality Control"
    const val INVOICES = "Invoices"
    const val JOBS = "Daily Jobs"

    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")
    private val STORED_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
    private val TIME_FORMAT: DateTimeFormatter = DateTimeFormatter.ofPattern("HH:mm:ss")

    private val ownEntryIds get() = WorkspaceContext.current().ownAuditIds

    @Synchronized
    fun log(module: String, role: String, detail: String): AuditLog {
        val id = newId()
        ownEntryIds.add(id)
        val entity = AuditLogEntity(
            id = id,
            timestamp = ZonedDateTime.now(MALAYSIA).format(STORED_FORMAT),
            operatorRole = normaliseRole(role),
            action = module,
            details = detail
        )
        DataStore.auditLogs.add(0, entity)
        return toAuditLog(entity)
    }

    @Synchronized
    fun clear() {
        DataStore.auditLogs.clear()
        ownEntryIds.clear()
    }

    fun list(limit: Int): List<AuditLog> = DataStore.auditLogs
        .take(limit)
        .map { toAuditLog(it) }

    /** 保留 SME_OWNER、MANAGER 与 OPERATIONS_STAFF 三种角色 */
    fun normaliseRole(role: String): String = when (role.uppercase()) {
        SME_OWNER, "CEO", "OWNER" -> SME_OWNER
        MANAGER -> MANAGER
        else -> OPERATIONS_STAFF
    }

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
            id = "AUD-${System.currentTimeMillis() % 100000}-${(10..99).random()}"
        } while (DataStore.auditLogs.any { it.id == id })
        return id
    }
}