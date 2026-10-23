package com.hazendust.vyte.data

import com.hazendust.vyte.route.invoice.InvoiceExtras
import com.hazendust.vyte.route.order.CreateInvoiceOrderRequest
import com.hazendust.vyte.route.product.ProductExtras
import com.hazendust.vyte.route.product.StockMovement
import com.hazendust.vyte.route.qc.QCAlert
import kotlinx.coroutines.ThreadContextElement
import kotlinx.coroutines.asContextElement
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

class TenantWorkspace(val tenantId: String) {
    val products = ConcurrentHashMap<String, ProductEntity>()
    val archivedProducts = ConcurrentHashMap<String, ProductEntity>()
    val productExtras = ConcurrentHashMap<String, ProductExtras>()
    val movements = ConcurrentHashMap<String, CopyOnWriteArrayList<StockMovement>>()
    val lastKnownStock = ConcurrentHashMap<String, Int>()
    val locks = ConcurrentHashMap<String, Any>()

    val suppliers = CopyOnWriteArrayList<SupplierEntity>()
    val approvalTasks = CopyOnWriteArrayList<ApprovalTaskEntity>()
    val invoices = CopyOnWriteArrayList<InvoiceEntity>()
    val invoiceExtras = ConcurrentHashMap<String, InvoiceExtras>()
    val auditLogs = CopyOnWriteArrayList<AuditLogEntity>()
    val ownAuditIds = ConcurrentHashMap.newKeySet<String>()
    val complianceProfiles = CopyOnWriteArrayList<com.hazendust.vyte.route.migration.ComplianceProfileDto>()
    var transitionMode: String = "COPILOT"

    val qcAlerts = CopyOnWriteArrayList<QCAlert>()
    val qcAlertProductIds = ConcurrentHashMap<String, String>()

    val savedOrders = ConcurrentHashMap<String, CreateInvoiceOrderRequest>()
    val orderStatuses = ConcurrentHashMap<String, String>()

    init {
        seedDefaultWorkspace()
    }

    fun seedDefaultWorkspace() {
        val today = LocalDate.now()
        listOf(
            ProductEntity("P-101", "SKU-RICE-01", "Beras Jasmine Super Special 10kg", "Staples", 15, 20, 26.0, 32.0, today.plusMonths(6).toString()),
            ProductEntity("P-102", "SKU-MILO-01", "Milo 1kg Refill Pack", "Beverages", 8, 15, 17.5, 22.5, today.plusMonths(8).toString()),
            ProductEntity("P-103", "SKU-MILK-01", "Dutch Lady Fresh Milk 1L", "Dairy", 40, 25, 6.2, 8.5, today.plusDays(5).toString()),
            ProductEntity("P-104", "SKU-FLOUR-01", "Cap Sauh Wheat Flour 1kg", "Staples", 85, 30, 2.8, 3.8, today.plusMonths(4).toString())
        ).forEach { p ->
            products[p.id] = p
            lastKnownStock[p.id] = p.stock
            productExtras[p.id] = ProductExtras(
                industry = if (p.category == "Dairy" || p.category == "Beverages") "FNB_PERISHABLE" else "RETAIL_VARIANT",
                uom = if (p.id == "P-103") "L" else "pack",
                reorderQty = p.safeThreshold * 2,
                leadTimeDays = 2,
                moq = 10,
                supplierName = "Berjaya Wholesale Hub",
                supplierContact = "+6012-3456781",
                batchNo = "B-${today.year}-10",
                restockStatus = if (p.stock <= p.safeThreshold) "TRIGGERED_PENDING_APPROVAL" else "HEALTHY"
            )
        }

        suppliers.addAll(
            listOf(
                SupplierEntity("S-01", "Berjaya Wholesale Hub", 1, 10, "+60123456781", 0.90),
                SupplierEntity("S-02", "Ah Hock Grocers Dist", 3, 5, "+60123456782", 0.95),
                SupplierEntity("S-03", "Klang Valley Logistics Hub", 2, 20, "+60123456783", 0.88)
            )
        )

        auditLogs.add(
            AuditLogEntity(
                id = "LOG-INIT",
                timestamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
                operatorRole = "SME_OWNER",
                action = "System",
                details = "Workspace [$tenantId] initialized with Malaysian SME dataset."
            )
        )
    }
}

object WorkspaceContext {
    private const val DEFAULT_TENANT = "default"
    private const val MAX_WORKSPACES = 300
    private val currentTenant = ThreadLocal.withInitial { DEFAULT_TENANT }
    private val workspaces = ConcurrentHashMap<String, TenantWorkspace>()

    fun currentId(): String = currentTenant.get() ?: DEFAULT_TENANT

    fun current(): TenantWorkspace {
        val id = currentId()
        if (workspaces.size > MAX_WORKSPACES && !workspaces.containsKey(id)) {
            workspaces.keys.firstOrNull { it != DEFAULT_TENANT }?.let { workspaces.remove(it) }
        }
        return workspaces.computeIfAbsent(id) { TenantWorkspace(it) }
    }

    fun resetCurrent(): TenantWorkspace {
        val id = currentId()
        val fresh = TenantWorkspace(id)
        workspaces[id] = fresh
        return fresh
    }

    fun sanitizeTenantId(raw: String?): String {
        val cleaned = raw?.trim()?.replace(Regex("[^a-zA-Z0-9_-]"), "")?.take(48)
        return if (cleaned.isNullOrBlank()) DEFAULT_TENANT else cleaned
    }

    fun asCoroutineElement(tenantId: String): ThreadContextElement<String> =
        currentTenant.asContextElement(value = sanitizeTenantId(tenantId))

    fun <T> withTenant(tenantId: String, block: () -> T): T {
        val prev = currentTenant.get()
        currentTenant.set(sanitizeTenantId(tenantId))
        return try {
            block()
        } finally {
            currentTenant.set(prev)
        }
    }
}