package com.hazendust.vyte.data

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
        seedDefaultWorkspace()
    }

    fun seedDefaultWorkspace() {
        val today = LocalDate.now()
        listOf(
            ProductEntity("P-101", "SKU-RICE-01", "Beras Jasmine Super Special 10kg", "Staples", 15, 20, 26.0, 32.0, today.plusMonths(6).toString()),
            ProductEntity("P-102", "SKU-MILO-01", "Milo 1kg Refill Pack", "Beverages", 8, 15, 17.5, 22.5, today.plusMonths(8).toString()),
            ProductEntity("P-103", "SKU-MILK-01", "Dutch Lady Fresh Milk 1L", "Dairy", 40, 25, 6.2, 8.5, today.plusDays(4).toString()),
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

        // Seed initial QC Alert
        val initialQc = QCAlert(
            id = "QC-101",
            productName = "Dutch Lady Fresh Milk 1L",
            sku = "SKU-MILK-01",
            batchNo = "B-${today.year}-10",
            expiryDate = today.plusDays(4).toString(),
            daysLeft = 4,
            qtyAffected = "40 L",
            triggerReason = "Expires in 4 days (Threshold: 5 days)",
            aiSuggestion = "Bundle with morning combo deals (-20%) & pause Friday supplier restock.",
            actionLabel = "Approve Bundle Promo",
            savedRM = 255.0,
            status = "PENDING_APPROVAL"
        )
        qcAlerts.add(initialQc)
        qcAlertProductIds[initialQc.id] = "P-103"

        // Seed initial Invoices
        val inv1 = InvoiceEntity("INV-1", "SUPPLIER", "P-101", 3400.0, "Inventory Procurement (Raw Materials)", "VERIFIED", today.minusDays(2).toString())
        val inv2 = InvoiceEntity("INV-2", "CUSTOMER", "ORD-1001", 4250.0, "Wholesale B2B Product Sales", "NEEDS_REVIEW", today.minusDays(1).toString())
        invoices.addAll(listOf(inv1, inv2))
        invoiceExtras[inv1.id] = InvoiceExtras("SUP-2026-8841", "Berjaya Wholesale Hub", 98, today.plusDays(14).toString(), paid = true, paidOn = today.minusDays(1).toString(), status = "VERIFIED", createdByInvoiceModule = true)
        invoiceExtras[inv2.id] = InvoiceExtras("CUST-2026-1049", "Bangsar Deli & Grocer", 94, today.plusDays(7).toString(), paid = false, status = "NEEDS_REVIEW", createdByInvoiceModule = true)

        // Seed initial Compliance, Vault Docs & Renewal Tasks
        complianceProfiles.addAll(
            listOf(
                ComplianceProfileDto(
                    registrationNo = "202401048291", companyName = "ACME TECH SDN. BHD.", companyType = "SDN_BHD",
                    ssmExpiryDate = "2027-02-15", councilName = "MBPJ", licenseType = "PREMISE_LICENSE",
                    licenseExpiryDate = "2026-11-30", complianceStatus = "EXPIRING_SOON", autoAlertEnabled = true,
                    assetCategory = "SSM_PBT_LICENSE", annualFeeRM = 450.0, fiveYearDiscountPct = 22, selectedRenewalTermYears = 5
                ),
                ComplianceProfileDto(
                    registrationNo = "BLDG-PJ-101", companyName = "PJ FLAGSHIP ROASTERY & CENTRAL WAREHOUSE", companyType = "SDN_BHD",
                    ssmExpiryDate = "2027-12-31", councilName = "Sunway Commercial Properties Sdn Bhd", licenseType = "BUILDING_RENTAL_CONTRACT",
                    licenseExpiryDate = "2026-11-30", complianceStatus = "EXPIRING_SOON", autoAlertEnabled = true,
                    assetCategory = "BUILDING_RENTAL", rentalAddress = "Lot 18, Jalan 51A/223, Seksyen 51A, 46100 Petaling Jaya, Selangor",
                    landlordName = "Sunway Commercial Properties Sdn Bhd", monthlyRentRM = 6800.0, contractStartDate = "2024-12-01",
                    annualFeeRM = 81600.0, fiveYearDiscountPct = 10, selectedRenewalTermYears = 3
                ),
                ComplianceProfileDto(
                    registrationNo = "JPJ-WXY8821-FLT", companyName = "COLD-CHAIN LORRY (WXY 8821) - ROAD TAX & PUSPAKOM", companyType = "SDN_BHD",
                    ssmExpiryDate = "2026-11-05", councilName = "JPJ / PUSPAKOM Commercial Fleet", licenseType = "FLEET_ROADTAX_PUSPAKOM",
                    licenseExpiryDate = "2026-10-29", complianceStatus = "EXPIRING_SOON", autoAlertEnabled = true,
                    assetCategory = "FLEET_VEHICLE", annualFeeRM = 1280.0, fiveYearDiscountPct = 18, selectedRenewalTermYears = 1
                )
            )
        )

        vaultDocs.add(
            DocumentVaultItemDto(
                docID = "DOC-99388", registrationNo = "202401048291", docType = "SSM_CERT_FORM_9",
                fileUrl = "https://storage.local/compliance/ssm_form9_202401048291.pdf", fileSizeKb = 640,
                effectiveDate = "2026-02-15", expiryDate = "2027-02-15", uploadedAt = "2026-10-20T11:20:00Z",
                uploadedBy = "M067", notes = "SSM Form 9 Corporate Registration Certificate"
            )
        )

        renewalTasks.add(
            RenewalTaskDto(
                renewalID = "REN-2026-0041", registrationNo = "202401048291", companyName = "ACME TECH SDN. BHD.",
                councilName = "MBPJ", licenseType = "PREMISE_LICENSE", filingMode = "CONCIERGE_MANUAL_SUBMISSION",
                status = "ASSIGNED_TO_AGENT", assignedAgentID = "AGENT_DESK_03", pbtPortalUrl = "https://e-lesen.mbpj.gov.my",
                compiledSubmissionPdfUrl = "https://storage.local/packets/MBPJ_REN_2026_0041.pdf",
                generatedChecklist = listOf(
                    ChecklistStepDto(1, "SSM Form 9 Validated", true),
                    ChecklistStepDto(2, "Tenancy Agreement Stamp Duty Attached", true),
                    ChecklistStepDto(3, "BOMBA Fire Safety Endorsement", false)
                ),
                targetDeadline = "2026-11-20", renewalFee = 1755.0, renewalTermYears = 5, savedDiscountRM = 495.0,
                currency = "MYR", internalNotes = "5-Year Bundle Selected (-22% multi-year discount applied).",
                createdAt = "2026-10-22T19:57:00Z"
            )
        )

        supportTickets.add(
            SupportTicketDto(
                ticketId = "SRV-2026-904", subject = "Legacy Inventory CSV & Database Migration Mapping Check",
                category = "DATA_MIGRATION", priority = "HIGH", status = "RESOLVED", createdAt = "2026-10-20 10:15",
                assignedEngineer = "Jason Lim (Vyte Systems Specialist)",
                resolutionNote = "Verified all migrated SKU thresholds and supplier contact records."
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