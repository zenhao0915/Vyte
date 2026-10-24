// FILE: src/main/kotlin/com/hazendust/vyte/data/WorkspaceContext.kt
package com.hazendust.vyte.data

import com.hazendust.vyte.manager.DatabaseManager
import com.hazendust.vyte.route.compliance.ChecklistStepDto
import com.hazendust.vyte.route.compliance.DocumentVaultItemDto
import com.hazendust.vyte.route.compliance.RenewalTaskDto
import com.hazendust.vyte.route.compliance.SupplierQuotationBidDto
import com.hazendust.vyte.route.compliance.SupportTicketDto
import com.hazendust.vyte.route.invoice.InvoiceExtras
import com.hazendust.vyte.route.migration.ComplianceProfileDto
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
    val orderInvoiceIds = ConcurrentHashMap<String, String>()

    val complianceProfiles = CopyOnWriteArrayList<ComplianceProfileDto>()
    val vaultDocs = CopyOnWriteArrayList<DocumentVaultItemDto>()
    val renewalTasks = CopyOnWriteArrayList<RenewalTaskDto>()
    val supplierQuotations = CopyOnWriteArrayList<SupplierQuotationBidDto>()
    val supportTickets = CopyOnWriteArrayList<SupportTicketDto>()

    var transitionMode: String = "COPILOT"

    val qcAlerts = CopyOnWriteArrayList<QCAlert>()
    val qcAlertProductIds = ConcurrentHashMap<String, String>()

    val savedOrders = ConcurrentHashMap<String, CreateInvoiceOrderRequest>()
    val orderStatuses = ConcurrentHashMap<String, String>()

    init {
        if (DatabaseManager.isReady) {
            DatabaseManager.loadWorkspace(this)
        }
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
        DatabaseManager.clearWorkspace(id)
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