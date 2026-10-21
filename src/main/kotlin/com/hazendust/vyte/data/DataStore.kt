package com.hazendust.vyte.data

import kotlinx.serialization.Serializable
import java.time.LocalDate
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
    var status: String, // PENDING, APPROVED, REJECTED
    var operatorRole: String? = null,
    val createdAt: String
)

@Serializable
data class InvoiceEntity(
    val id: String,
    val type: String, // CUSTOMER, SUPPLIER
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
    val products = ConcurrentHashMap<String, ProductEntity>()
    val suppliers = CopyOnWriteArrayList<SupplierEntity>()
    val approvalTasks = CopyOnWriteArrayList<ApprovalTaskEntity>()
    val invoices = CopyOnWriteArrayList<InvoiceEntity>()
    val auditLogs = CopyOnWriteArrayList<AuditLogEntity>()

    init {
        seed()
    }

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

    private fun seed() {
        val today = LocalDate.now()
        listOf(
            ProductEntity("P-101", "SKU-RICE-01", "Beras Jasmine Super Special 10kg", "Staples", 15, 20, 26.0, 32.0, today.plusMonths(6).toString()),
            ProductEntity("P-102", "SKU-MILO-01", "Milo 1kg Refill Pack", "Beverages", 8, 15, 17.5, 22.5, today.plusMonths(8).toString()),
            ProductEntity("P-103", "SKU-MILK-01", "Dutch Lady Fresh Milk 1L", "Dairy", 40, 25, 6.2, 8.5, today.plusDays(12).toString()),
            ProductEntity("P-104", "SKU-FLOUR-01", "Cap Sauh Wheat Flour 1kg", "Staples", 85, 30, 2.8, 3.8, today.plusMonths(4).toString())
        ).forEach { products[it.id] = it }

        suppliers.addAll(listOf(
            SupplierEntity("S-01", "Berjaya Wholesale Hub", 1, 10, "+60123456781", 0.90),
            SupplierEntity("S-02", "Ah Hock Grocers Dist", 3, 5, "+60123456782", 0.95),
            SupplierEntity("S-03", "Klang Valley Logistics Hub", 2, 20, "+60123456783", 0.88)
        ))

        recordAudit("System", "SYSTEM_INIT", "DataStore seeded with Malaysian SME synthetic dataset.")
    }
}