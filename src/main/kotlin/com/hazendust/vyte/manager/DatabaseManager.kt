// FILE: src/main/kotlin/com/hazendust/vyte/manager/DatabaseManager.kt
package com.hazendust.vyte.manager

import com.hazendust.vyte.data.*
import com.hazendust.vyte.route.compliance.*
import com.hazendust.vyte.route.invoice.InvoiceExtras
import com.hazendust.vyte.route.migration.ComplianceProfileDto
import com.hazendust.vyte.route.order.CreateInvoiceOrderRequest
import com.hazendust.vyte.route.product.ProductExtras
import com.hazendust.vyte.route.product.ProductRecord
import com.hazendust.vyte.route.product.StockMovement
import com.hazendust.vyte.route.qc.QCAlert
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.time.OffsetDateTime
import kotlin.concurrent.Volatile

@Serializable
private data class PersistedInvoiceRecord(
    val entity: InvoiceEntity,
    val extras: InvoiceExtras? = null
)

@Serializable
private data class PersistedOrderRecord(
    val order: CreateInvoiceOrderRequest,
    val status: String,
    val invoiceId: String? = null
)

@Serializable
private data class PersistedQcAlertRecord(
    val alert: QCAlert,
    val productId: String? = null
)

object DatabaseManager {
    @Volatile
    private var connection: Connection? = null

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
    }

    val dbConnection: Connection
        get() = connection ?: error("DatabaseManager Not Initialized!")

    val isReady: Boolean
        get() = connection != null

    @Synchronized
    fun init(dbPath: String = "vyte.db") {
        if (connection == null) {
            try {
                File(dbPath).parentFile?.mkdirs()
                val conn = DriverManager.getConnection("jdbc:sqlite:$dbPath")
                connection = conn

                conn.createStatement().use { statement ->
                    statement.execute("PRAGMA journal_mode = WAL;")
                    statement.execute("PRAGMA synchronous = NORMAL;")
                    statement.execute("PRAGMA foreign_keys = ON;")
                    statement.execute("PRAGMA busy_timeout = 5000;")
                }

                createTablesIfNotExist()
                println("[Database] Vyte Multi-Tenant SQLite Engine Loaded Successfully! (WAL Mode Enabled)")
            } catch (e: Exception) {
                println("[Database] Initialize Database Failed: ${e.message}")
            }
        }
    }

    @Synchronized
    fun closeAndReset() {
        try {
            checkpointWal()
            connection?.close()
            println("[Database] Connection closed cleanly.")
        } catch (e: Exception) {
            println("[Database] Close Driver Failed: ${e.message}")
        } finally {
            connection = null
        }
    }

    @Synchronized
    fun checkpointWal() {
        try {
            connection?.createStatement()?.use { stmt ->
                stmt.execute("PRAGMA wal_checkpoint(TRUNCATE);")
            }
        } catch (e: Exception) {
            println("[Database] WAL Checkpoint Failed: ${e.message}")
        }
    }

    /**
     * 创建支持多租户 (tenant_id) 的完整业务表结构
     */
    @Synchronized
    private fun createTablesIfNotExist() {
        val conn = connection ?: return
        conn.createStatement().use { stmt ->
            // 0. 租户工作区元数据表 (记录是否已初始化及 transitionMode)
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS workspace_meta (
                    tenant_id TEXT PRIMARY KEY,
                    transition_mode TEXT NOT NULL DEFAULT 'COPILOT',
                    seeded INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );
            """.trimIndent())

            // 1. 商品与扩展属性表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_products (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    sku TEXT NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    stock INTEGER NOT NULL,
                    safe_threshold INTEGER NOT NULL,
                    cost_price REAL NOT NULL,
                    selling_price REAL NOT NULL,
                    expiry_date TEXT NOT NULL,
                    archived INTEGER NOT NULL DEFAULT 0,
                    record_json TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_tenant_products_sku ON tenant_products (tenant_id, sku);")

            // 2. 库存变动流水表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_stock_movements (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    product_id TEXT NOT NULL,
                    type TEXT NOT NULL,
                    qty_change INTEGER NOT NULL,
                    stock_after INTEGER NOT NULL,
                    reason TEXT NOT NULL,
                    user_id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_tenant_movements_prod ON tenant_stock_movements (tenant_id, product_id);")

            // 3. 供应商表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_suppliers (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    lead_time_days INTEGER NOT NULL,
                    moq INTEGER NOT NULL,
                    contact_wa TEXT NOT NULL,
                    unit_price_discount REAL NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())

            // 4. 审批任务表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_approval_tasks (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    trigger_type TEXT NOT NULL,
                    source_message TEXT NOT NULL,
                    deficit_summary TEXT NOT NULL,
                    recommended_supplier TEXT NOT NULL,
                    items_to_order TEXT NOT NULL,
                    total_estimated_cost REAL NOT NULL,
                    explainable_reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    operator_role TEXT,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())

            // 5. 发票与应收应付扩展表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_invoices (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    inv_no TEXT NOT NULL,
                    party TEXT NOT NULL,
                    type TEXT NOT NULL,
                    related_ref TEXT NOT NULL,
                    amount REAL NOT NULL,
                    category TEXT NOT NULL,
                    status TEXT NOT NULL,
                    paid INTEGER NOT NULL DEFAULT 0,
                    due_date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())

            // 6. 审计日志表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_audit_logs (
                    tenant_id TEXT NOT NULL,
                    seq INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    operator_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT NOT NULL,
                    is_own INTEGER NOT NULL DEFAULT 1
                );
            """.trimIndent())
            stmt.execute("CREATE INDEX IF NOT EXISTS idx_tenant_audit_logs ON tenant_audit_logs (tenant_id, seq DESC);")

            // 7. 合规证照档案表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_compliance_profiles (
                    tenant_id TEXT NOT NULL,
                    registration_no TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    license_type TEXT NOT NULL,
                    license_expiry_date TEXT NOT NULL,
                    compliance_status TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, registration_no)
                );
            """.trimIndent())

            // 8. 合规文件保险箱表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_vault_docs (
                    tenant_id TEXT NOT NULL,
                    doc_id TEXT NOT NULL,
                    registration_no TEXT NOT NULL,
                    doc_type TEXT NOT NULL,
                    expiry_date TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, doc_id)
                );
            """.trimIndent())

            // 9. 证照续期任务表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_renewal_tasks (
                    tenant_id TEXT NOT NULL,
                    renewal_id TEXT NOT NULL,
                    registration_no TEXT NOT NULL,
                    status TEXT NOT NULL,
                    target_deadline TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, renewal_id)
                );
            """.trimIndent())

            // 10. 供应商报价单表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_supplier_quotations (
                    tenant_id TEXT NOT NULL,
                    quotation_no TEXT NOT NULL,
                    sku TEXT NOT NULL,
                    supplier_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, quotation_no)
                );
            """.trimIndent())

            // 11. 技术支持工单表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_support_tickets (
                    tenant_id TEXT NOT NULL,
                    ticket_id TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    status TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, ticket_id)
                );
            """.trimIndent())

            // 12. 质检临期警报表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_qc_alerts (
                    tenant_id TEXT NOT NULL,
                    id TEXT NOT NULL,
                    sku TEXT NOT NULL,
                    batch_no TEXT NOT NULL,
                    expiry_date TEXT NOT NULL,
                    status TEXT NOT NULL,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, id)
                );
            """.trimIndent())

            // 13. 客户订单表
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS tenant_orders (
                    tenant_id TEXT NOT NULL,
                    order_id TEXT NOT NULL,
                    status TEXT NOT NULL,
                    subtotal REAL NOT NULL,
                    invoice_id TEXT,
                    record_json TEXT NOT NULL,
                    PRIMARY KEY (tenant_id, order_id)
                );
            """.trimIndent())
        }
    }

    /**
     * 按 tenantId 从数据库加载工作区数据；如果是首次访问的新租户则写入初始种子数据并落盘
     */
    @Synchronized
    fun loadWorkspace(ws: TenantWorkspace) {
        val conn = connection ?: return
        val tenantId = ws.tenantId
        try {
            var exists = false
            conn.prepareStatement("SELECT transition_mode FROM workspace_meta WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    if (rs.next()) {
                        exists = true
                        ws.transitionMode = rs.getString("transition_mode") ?: "COPILOT"
                    }
                }
            }

            if (!exists) {
                saveWorkspace(ws)
                return
            }

            // 1. 加载商品
            conn.prepareStatement("SELECT record_json FROM tenant_products WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching {
                            json.decodeFromString(ProductRecord.serializer(), rs.getString("record_json"))
                        }.onSuccess { rec ->
                            val id = rec.entity.id
                            ws.productExtras[id] = rec.extras
                            ws.lastKnownStock[id] = rec.entity.stock
                            if (rec.extras.archived) {
                                ws.archivedProducts[id] = rec.entity
                            } else {
                                ws.products[id] = rec.entity
                            }
                        }
                    }
                }
            }

            // 2. 加载库存流水
            conn.prepareStatement("SELECT * FROM tenant_stock_movements WHERE tenant_id = ? ORDER BY rowid ASC").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        val mov = StockMovement(
                            id = rs.getString("id"),
                            productId = rs.getString("product_id"),
                            type = rs.getString("type"),
                            change = rs.getInt("qty_change"),
                            stockAfter = rs.getInt("stock_after"),
                            reason = rs.getString("reason"),
                            userID = rs.getString("user_id"),
                            timestamp = rs.getString("timestamp")
                        )
                        ws.movements.computeIfAbsent(mov.productId) { java.util.concurrent.CopyOnWriteArrayList() }.add(mov)
                    }
                }
            }

            // 3. 加载供应商
            conn.prepareStatement("SELECT * FROM tenant_suppliers WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        ws.suppliers.add(
                            SupplierEntity(
                                id = rs.getString("id"),
                                name = rs.getString("name"),
                                leadTimeDays = rs.getInt("lead_time_days"),
                                moq = rs.getInt("moq"),
                                contactWa = rs.getString("contact_wa"),
                                unitPriceDiscount = rs.getDouble("unit_price_discount")
                            )
                        )
                    }
                }
            }

            // 4. 加载审批任务
            conn.prepareStatement("SELECT * FROM tenant_approval_tasks WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        ws.approvalTasks.add(
                            ApprovalTaskEntity(
                                id = rs.getString("id"),
                                triggerType = rs.getString("trigger_type"),
                                sourceMessage = rs.getString("source_message"),
                                deficitSummary = rs.getString("deficit_summary"),
                                recommendedSupplier = rs.getString("recommended_supplier"),
                                itemsToOrder = rs.getString("items_to_order"),
                                totalEstimatedCost = rs.getDouble("total_estimated_cost"),
                                explainableReason = rs.getString("explainable_reason"),
                                status = rs.getString("status"),
                                operatorRole = rs.getString("operator_role"),
                                createdAt = rs.getString("created_at")
                            )
                        )
                    }
                }
            }

            // 5. 加载发票
            conn.prepareStatement("SELECT record_json FROM tenant_invoices WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching {
                            json.decodeFromString(PersistedInvoiceRecord.serializer(), rs.getString("record_json"))
                        }.onSuccess { rec ->
                            ws.invoices.add(rec.entity)
                            if (rec.extras != null) {
                                ws.invoiceExtras[rec.entity.id] = rec.extras
                            }
                        }
                    }
                }
            }

            // 6. 加载审计日志
            conn.prepareStatement("SELECT * FROM tenant_audit_logs WHERE tenant_id = ? ORDER BY seq ASC").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        val id = rs.getString("id")
                        ws.auditLogs.add(
                            AuditLogEntity(
                                id = id,
                                timestamp = rs.getString("timestamp"),
                                operatorRole = rs.getString("operator_role"),
                                action = rs.getString("action"),
                                details = rs.getString("details")
                            )
                        )
                        if (rs.getInt("is_own") == 1) {
                            ws.ownAuditIds.add(id)
                        }
                    }
                }
            }

            // 7. 加载合规证照、文件保险箱、续期任务、报价单、工单、QC、订单
            conn.prepareStatement("SELECT record_json FROM tenant_compliance_profiles WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(ComplianceProfileDto.serializer(), rs.getString("record_json")) }
                            .onSuccess { ws.complianceProfiles.add(it) }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_vault_docs WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(DocumentVaultItemDto.serializer(), rs.getString("record_json")) }
                            .onSuccess { ws.vaultDocs.add(it) }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_renewal_tasks WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(RenewalTaskDto.serializer(), rs.getString("record_json")) }
                            .onSuccess { ws.renewalTasks.add(it) }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_supplier_quotations WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(SupplierQuotationBidDto.serializer(), rs.getString("record_json")) }
                            .onSuccess { ws.supplierQuotations.add(it) }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_support_tickets WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(SupportTicketDto.serializer(), rs.getString("record_json")) }
                            .onSuccess { ws.supportTickets.add(it) }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_qc_alerts WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(PersistedQcAlertRecord.serializer(), rs.getString("record_json")) }
                            .onSuccess { rec ->
                                ws.qcAlerts.add(rec.alert)
                                if (rec.productId != null) ws.qcAlertProductIds[rec.alert.id] = rec.productId
                            }
                    }
                }
            }

            conn.prepareStatement("SELECT record_json FROM tenant_orders WHERE tenant_id = ?").use { ps ->
                ps.setString(1, tenantId)
                ps.executeQuery().use { rs ->
                    while (rs.next()) {
                        runCatching { json.decodeFromString(PersistedOrderRecord.serializer(), rs.getString("record_json")) }
                            .onSuccess { rec ->
                                ws.savedOrders[rec.order.orderID] = rec.order
                                ws.orderStatuses[rec.order.orderID] = rec.status
                                if (rec.invoiceId != null) ws.orderInvoiceIds[rec.order.orderID] = rec.invoiceId
                            }
                    }
                }
            }
        } catch (e: Exception) {
            println("[Database] Failed to load workspace [$tenantId]: ${e.message}")
        }
    }

    /**
     * 将指定租户 Workspace 的全部内存状态原子化持久化到 SQLite
     */
    @Synchronized
    fun saveWorkspace(ws: TenantWorkspace) {
        val conn = connection ?: return
        val tenantId = ws.tenantId
        val now = OffsetDateTime.now().toString()
        val prevAutoCommit = conn.autoCommit
        conn.autoCommit = false
        try {
            // 0. 保存租户元数据
            conn.prepareStatement("""
                INSERT OR REPLACE INTO workspace_meta (tenant_id, transition_mode, seeded, updated_at)
                VALUES (?, ?, 1, ?);
            """.trimIndent()).use { ps ->
                ps.setString(1, tenantId)
                ps.setString(2, ws.transitionMode)
                ps.setString(3, now)
                ps.executeUpdate()
            }

            // 1. 同步商品表
            conn.prepareStatement("DELETE FROM tenant_products WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            val allProducts = ws.products.values.toList() + ws.archivedProducts.values.toList()
            conn.prepareStatement("""
                INSERT OR REPLACE INTO tenant_products
                (tenant_id, id, sku, name, category, stock, safe_threshold, cost_price, selling_price, expiry_date, archived, record_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (entity in allProducts) {
                    val ext = ws.productExtras[entity.id] ?: ProductExtras(
                        industry = "RETAIL_VARIANT",
                        uom = "unit",
                        reorderQty = entity.safeThreshold * 2,
                        supplierName = "",
                        supplierContact = "",
                        archived = ws.archivedProducts.containsKey(entity.id)
                    )
                    val rec = ProductRecord(entity, ext)
                    ps.setString(1, tenantId)
                    ps.setString(2, entity.id)
                    ps.setString(3, entity.sku)
                    ps.setString(4, entity.name)
                    ps.setString(5, entity.category)
                    ps.setInt(6, entity.stock)
                    ps.setInt(7, entity.safeThreshold)
                    ps.setDouble(8, entity.costPrice)
                    ps.setDouble(9, entity.sellingPrice)
                    ps.setString(10, entity.expiryDate)
                    ps.setInt(11, if (ext.archived) 1 else 0)
                    ps.setString(12, json.encodeToString(ProductRecord.serializer(), rec))
                    ps.setString(13, now)
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 2. 同步库存流水表
            conn.prepareStatement("""
                INSERT OR IGNORE INTO tenant_stock_movements
                (tenant_id, id, product_id, type, qty_change, stock_after, reason, user_id, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (list in ws.movements.values) {
                    for (m in list) {
                        ps.setString(1, tenantId)
                        ps.setString(2, m.id)
                        ps.setString(3, m.productId)
                        ps.setString(4, m.type)
                        ps.setInt(5, m.change)
                        ps.setInt(6, m.stockAfter)
                        ps.setString(7, m.reason)
                        ps.setString(8, m.userID)
                        ps.setString(9, m.timestamp)
                        ps.addBatch()
                    }
                }
                ps.executeBatch()
            }

            // 3. 同步供应商表
            conn.prepareStatement("DELETE FROM tenant_suppliers WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_suppliers (tenant_id, id, name, lead_time_days, moq, contact_wa, unit_price_discount)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (s in ws.suppliers) {
                    ps.setString(1, tenantId)
                    ps.setString(2, s.id)
                    ps.setString(3, s.name)
                    ps.setInt(4, s.leadTimeDays)
                    ps.setInt(5, s.moq)
                    ps.setString(6, s.contactWa)
                    ps.setDouble(7, s.unitPriceDiscount)
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 4. 同步审批任务表
            conn.prepareStatement("DELETE FROM tenant_approval_tasks WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_approval_tasks
                (tenant_id, id, trigger_type, source_message, deficit_summary, recommended_supplier, items_to_order, total_estimated_cost, explainable_reason, status, operator_role, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (t in ws.approvalTasks) {
                    ps.setString(1, tenantId)
                    ps.setString(2, t.id)
                    ps.setString(3, t.triggerType)
                    ps.setString(4, t.sourceMessage)
                    ps.setString(5, t.deficitSummary)
                    ps.setString(6, t.recommendedSupplier)
                    ps.setString(7, t.itemsToOrder)
                    ps.setDouble(8, t.totalEstimatedCost)
                    ps.setString(9, t.explainableReason)
                    ps.setString(10, t.status)
                    ps.setString(11, t.operatorRole)
                    ps.setString(12, t.createdAt)
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 5. 同步发票表
            conn.prepareStatement("DELETE FROM tenant_invoices WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_invoices
                (tenant_id, id, inv_no, party, type, related_ref, amount, category, status, paid, due_date, created_at, record_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (inv in ws.invoices) {
                    val ext = ws.invoiceExtras[inv.id]
                    val rec = PersistedInvoiceRecord(inv, ext)
                    ps.setString(1, tenantId)
                    ps.setString(2, inv.id)
                    ps.setString(3, ext?.invNo ?: inv.id)
                    ps.setString(4, ext?.party ?: "Unknown")
                    ps.setString(5, inv.type)
                    ps.setString(6, inv.relatedRef)
                    ps.setDouble(7, inv.amount)
                    ps.setString(8, inv.category)
                    ps.setString(9, ext?.status ?: inv.status)
                    ps.setInt(10, if (ext?.paid == true) 1 else 0)
                    ps.setString(11, ext?.dueDate ?: inv.createdAt)
                    ps.setString(12, inv.createdAt)
                    ps.setString(13, json.encodeToString(PersistedInvoiceRecord.serializer(), rec))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 6. 同步审计日志表
            conn.prepareStatement("DELETE FROM tenant_audit_logs WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_audit_logs (tenant_id, id, timestamp, operator_role, action, details, is_own)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (log in ws.auditLogs) {
                    ps.setString(1, tenantId)
                    ps.setString(2, log.id)
                    ps.setString(3, log.timestamp)
                    ps.setString(4, log.operatorRole)
                    ps.setString(5, log.action)
                    ps.setString(6, log.details)
                    ps.setInt(7, if (log.id in ws.ownAuditIds) 1 else 0)
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 7. 同步合规证照表
            conn.prepareStatement("DELETE FROM tenant_compliance_profiles WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_compliance_profiles
                (tenant_id, registration_no, company_name, license_type, license_expiry_date, compliance_status, record_json)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (c in ws.complianceProfiles) {
                    ps.setString(1, tenantId)
                    ps.setString(2, c.registrationNo)
                    ps.setString(3, c.companyName)
                    ps.setString(4, c.licenseType)
                    ps.setString(5, c.licenseExpiryDate)
                    ps.setString(6, c.complianceStatus)
                    ps.setString(7, json.encodeToString(ComplianceProfileDto.serializer(), c))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 8. 同步文件保险箱表
            conn.prepareStatement("DELETE FROM tenant_vault_docs WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_vault_docs (tenant_id, doc_id, registration_no, doc_type, expiry_date, record_json)
                VALUES (?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (d in ws.vaultDocs) {
                    ps.setString(1, tenantId)
                    ps.setString(2, d.docID)
                    ps.setString(3, d.registrationNo)
                    ps.setString(4, d.docType)
                    ps.setString(5, d.expiryDate)
                    ps.setString(6, json.encodeToString(DocumentVaultItemDto.serializer(), d))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 9. 同步续期任务表
            conn.prepareStatement("DELETE FROM tenant_renewal_tasks WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_renewal_tasks (tenant_id, renewal_id, registration_no, status, target_deadline, record_json)
                VALUES (?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (r in ws.renewalTasks) {
                    ps.setString(1, tenantId)
                    ps.setString(2, r.renewalID)
                    ps.setString(3, r.registrationNo)
                    ps.setString(4, r.status)
                    ps.setString(5, r.targetDeadline)
                    ps.setString(6, json.encodeToString(RenewalTaskDto.serializer(), r))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 10. 同步供应商报价表
            conn.prepareStatement("DELETE FROM tenant_supplier_quotations WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_supplier_quotations (tenant_id, quotation_no, sku, supplier_name, status, record_json)
                VALUES (?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (q in ws.supplierQuotations) {
                    ps.setString(1, tenantId)
                    ps.setString(2, q.quotationNo)
                    ps.setString(3, q.sku)
                    ps.setString(4, q.supplierName)
                    ps.setString(5, q.status)
                    ps.setString(6, json.encodeToString(SupplierQuotationBidDto.serializer(), q))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 11. 同步工单表
            conn.prepareStatement("DELETE FROM tenant_support_tickets WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_support_tickets (tenant_id, ticket_id, subject, status, record_json)
                VALUES (?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (t in ws.supportTickets) {
                    ps.setString(1, tenantId)
                    ps.setString(2, t.ticketId)
                    ps.setString(3, t.subject)
                    ps.setString(4, t.status)
                    ps.setString(5, json.encodeToString(SupportTicketDto.serializer(), t))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 12. 同步 QC 警报表
            conn.prepareStatement("DELETE FROM tenant_qc_alerts WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_qc_alerts (tenant_id, id, sku, batch_no, expiry_date, status, record_json)
                VALUES (?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for (a in ws.qcAlerts) {
                    val rec = PersistedQcAlertRecord(a, ws.qcAlertProductIds[a.id])
                    ps.setString(1, tenantId)
                    ps.setString(2, a.id)
                    ps.setString(3, a.sku)
                    ps.setString(4, a.batchNo)
                    ps.setString(5, a.expiryDate)
                    ps.setString(6, a.status)
                    ps.setString(7, json.encodeToString(PersistedQcAlertRecord.serializer(), rec))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            // 13. 同步客户订单表
            conn.prepareStatement("DELETE FROM tenant_orders WHERE tenant_id = ?").use {
                it.setString(1, tenantId)
                it.executeUpdate()
            }
            conn.prepareStatement("""
                INSERT INTO tenant_orders (tenant_id, order_id, status, subtotal, invoice_id, record_json)
                VALUES (?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                for ((oid, order) in ws.savedOrders) {
                    val status = ws.orderStatuses[oid] ?: "PENDING_HUMAN_APPROVAL"
                    val invId = ws.orderInvoiceIds[oid]
                    val rec = PersistedOrderRecord(order, status, invId)
                    ps.setString(1, tenantId)
                    ps.setString(2, oid)
                    ps.setString(3, status)
                    ps.setDouble(4, order.subtotal)
                    ps.setString(5, invId)
                    ps.setString(6, json.encodeToString(PersistedOrderRecord.serializer(), rec))
                    ps.addBatch()
                }
                ps.executeBatch()
            }

            conn.commit()
        } catch (e: Exception) {
            runCatching { conn.rollback() }
            println("[Database] Failed to save workspace [$tenantId]: ${e.message}")
        } finally {
            runCatching { conn.autoCommit = prevAutoCommit }
        }
    }

    /**
     * 清空某个租户的持久化数据（供 /api/workspace/reset 使用）
     */
    @Synchronized
    fun clearWorkspace(tenantId: String) {
        val conn = connection ?: return
        val tables = listOf(
            "workspace_meta", "tenant_products", "tenant_stock_movements", "tenant_suppliers",
            "tenant_approval_tasks", "tenant_invoices", "tenant_audit_logs", "tenant_compliance_profiles",
            "tenant_vault_docs", "tenant_renewal_tasks", "tenant_supplier_quotations",
            "tenant_support_tickets", "tenant_qc_alerts", "tenant_orders"
        )
        try {
            for (t in tables) {
                conn.prepareStatement("DELETE FROM $t WHERE tenant_id = ?").use { ps ->
                    ps.setString(1, tenantId)
                    ps.executeUpdate()
                }
            }
        } catch (e: Exception) {
            println("[Database] Failed to clear workspace [$tenantId]: ${e.message}")
        }
    }
}