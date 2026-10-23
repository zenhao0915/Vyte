package com.hazendust.vyte.data

import kotlinx.serialization.Serializable
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

@Serializable
data class ProductEntity(
    val id: String,
    val sku: String,
    val name: String,
    val category: String,
    var stock: Int,
    val safeThreshold: Int,
    val costPrice: Double,
    val sellingPrice: Double,
    val expiryDate: String
)

@Serializable
data class SupplierEntity(
    val id: String,
    val name: String,
    val leadTimeDays: Int,
    val moq: Int,
    val contactWa: String,
    val unitPriceDiscount: Double
)

@Serializable
data class ApprovalTaskEntity(
    val id: String,
    val triggerType: String,
    val sourceMessage: String,
    val deficitSummary: String,
    val recommendedSupplier: String,
    val itemsToOrder: String,
    val totalEstimatedCost: Double,
    val explainableReason: String,
    var status: String,
    var operatorRole: String? = null,
    val createdAt: String
)

@Serializable
data class InvoiceEntity(
    val id: String,
    val type: String,
    val relatedRef: String,
    val amount: Double,
    val category: String,
    var status: String,
    val createdAt: String
)

@Serializable
data class AuditLogEntity(
    val id: String,
    val timestamp: String,
    val operatorRole: String,
    val action: String,
    val details: String
)

object DataStore {
    val products: ConcurrentHashMap<String, ProductEntity>
        get() = WorkspaceContext.current().products

    val suppliers: CopyOnWriteArrayList<SupplierEntity>
        get() = WorkspaceContext.current().suppliers

    val approvalTasks: CopyOnWriteArrayList<ApprovalTaskEntity>
        get() = WorkspaceContext.current().approvalTasks

    val invoices: CopyOnWriteArrayList<InvoiceEntity>
        get() = WorkspaceContext.current().invoices

    val auditLogs: CopyOnWriteArrayList<AuditLogEntity>
        get() = WorkspaceContext.current().auditLogs

    fun recordAudit(role: String, action: String, details: String) {
        val entry = AuditLogEntity(
            id = "LOG-${System.currentTimeMillis() % 100000}",
            timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
            operatorRole = role,
            action = action,
            details = details
        )
        auditLogs.add(0, entry)
    }
}