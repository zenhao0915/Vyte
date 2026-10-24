// FILE: src/main/kotlin/com/hazendust/vyte/route/product/ProductRepository.kt
package com.hazendust.vyte.route.product

import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.DatabaseManager
import kotlinx.serialization.json.Json
import java.time.OffsetDateTime

object ProductRepository {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    val enabled: Boolean
        get() = DatabaseManager.isReady

    @Synchronized
    fun init(): Boolean = DatabaseManager.isReady

    @Synchronized
    fun loadRecords(tenantId: String = WorkspaceContext.currentId()): List<ProductRecord> {
        if (!enabled) return emptyList()
        val records = mutableListOf<ProductRecord>()
        DatabaseManager.dbConnection.prepareStatement(
            "SELECT id, record_json FROM tenant_products WHERE tenant_id = ?"
        ).use { ps ->
            ps.setString(1, tenantId)
            ps.executeQuery().use { rs ->
                while (rs.next()) {
                    runCatching { json.decodeFromString(ProductRecord.serializer(), rs.getString("record_json")) }
                        .onSuccess { records.add(it) }
                        .onFailure { println("[Products] Skipped unreadable product ${rs.getString("id")}: ${it.message}") }
                }
            }
        }
        return records
    }

    @Synchronized
    fun loadMovements(tenantId: String = WorkspaceContext.currentId()): List<StockMovement> {
        if (!enabled) return emptyList()
        val movements = mutableListOf<StockMovement>()
        DatabaseManager.dbConnection.prepareStatement(
            "SELECT * FROM tenant_stock_movements WHERE tenant_id = ? ORDER BY rowid ASC"
        ).use { ps ->
            ps.setString(1, tenantId)
            ps.executeQuery().use { rs ->
                while (rs.next()) {
                    movements.add(
                        StockMovement(
                            id = rs.getString("id"),
                            productId = rs.getString("product_id"),
                            type = rs.getString("type"),
                            change = rs.getInt("qty_change"),
                            stockAfter = rs.getInt("stock_after"),
                            reason = rs.getString("reason"),
                            userID = rs.getString("user_id"),
                            timestamp = rs.getString("timestamp")
                        )
                    )
                }
            }
        }
        return movements
    }

    @Synchronized
    fun save(record: ProductRecord, movement: StockMovement? = null) {
        if (!enabled) return
        val tenantId = WorkspaceContext.currentId()
        val conn = DatabaseManager.dbConnection
        val prevAutoCommit = conn.autoCommit
        conn.autoCommit = false
        try {
            conn.prepareStatement("""
                INSERT OR REPLACE INTO tenant_products
                (tenant_id, id, sku, name, category, stock, safe_threshold, cost_price, selling_price, expiry_date, archived, record_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()).use { ps ->
                ps.setString(1, tenantId)
                ps.setString(2, record.entity.id)
                ps.setString(3, record.entity.sku)
                ps.setString(4, record.entity.name)
                ps.setString(5, record.entity.category)
                ps.setInt(6, record.entity.stock)
                ps.setInt(7, record.entity.safeThreshold)
                ps.setDouble(8, record.entity.costPrice)
                ps.setDouble(9, record.entity.sellingPrice)
                ps.setString(10, record.entity.expiryDate)
                ps.setInt(11, if (record.extras.archived) 1 else 0)
                ps.setString(12, json.encodeToString(ProductRecord.serializer(), record))
                ps.setString(13, OffsetDateTime.now().toString())
                ps.executeUpdate()
            }

            if (movement != null) {
                conn.prepareStatement("""
                    INSERT OR REPLACE INTO tenant_stock_movements
                    (tenant_id, id, product_id, type, qty_change, stock_after, reason, user_id, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
                """.trimIndent()).use { ps ->
                    ps.setString(1, tenantId)
                    ps.setString(2, movement.id)
                    ps.setString(3, movement.productId)
                    ps.setString(4, movement.type)
                    ps.setInt(5, movement.change)
                    ps.setInt(6, movement.stockAfter)
                    ps.setString(7, movement.reason)
                    ps.setString(8, movement.userID)
                    ps.setString(9, movement.timestamp)
                    ps.executeUpdate()
                }
            }
            conn.commit()
        } catch (e: Exception) {
            runCatching { conn.rollback() }
            throw e
        } finally {
            runCatching { conn.autoCommit = prevAutoCommit }
        }
    }
}