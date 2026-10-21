package com.hazendust.vyte.route.product

import com.hazendust.vyte.manager.DatabaseManager
import kotlinx.serialization.json.Json
import java.time.OffsetDateTime

/**
 * Saves products and stock movements in the project's SQLite database (vyte.db) through DatabaseManager.dbConnection.
 * Uses its own tables (product_records, stock_movements); the tables DatabaseManager creates are not touched.
 */
object ProductRepository {
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    var enabled = false
        private set

    @Synchronized
    fun init(): Boolean {
        if (enabled) return true
        return try {
            DatabaseManager.dbConnection.createStatement().use { stmt ->
                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS product_records (
                        id TEXT PRIMARY KEY,
                        data TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    );
                """.trimIndent())

                stmt.execute("""
                    CREATE TABLE IF NOT EXISTS stock_movements (
                        id TEXT PRIMARY KEY,
                        product_id TEXT NOT NULL,
                        type TEXT NOT NULL,
                        qty_change INTEGER NOT NULL,
                        stock_after INTEGER NOT NULL,
                        reason TEXT NOT NULL,
                        user_id TEXT NOT NULL,
                        timestamp TEXT NOT NULL
                    );
                """.trimIndent())

                stmt.execute("CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements (product_id);")
            }
            enabled = true
            true
        } catch (e: Exception) {
            println("[Products] SQLite unavailable, products will NOT survive a restart: ${e.message}")
            false
        }
    }

    @Synchronized
    fun loadRecords(): List<ProductRecord> {
        if (!enabled) return emptyList()
        val records = mutableListOf<ProductRecord>()
        DatabaseManager.dbConnection.createStatement().use { stmt ->
            stmt.executeQuery("SELECT id, data FROM product_records").use { rs ->
                while (rs.next()) {
                    runCatching { json.decodeFromString(ProductRecord.serializer(), rs.getString("data")) }
                        .onSuccess { records.add(it) }
                        .onFailure { println("[Products] Skipped unreadable product record ${rs.getString("id")}: ${it.message}") }
                }
            }
        }
        return records
    }

    /** Oldest first (insertion order). */
    @Synchronized
    fun loadMovements(): List<StockMovement> {
        if (!enabled) return emptyList()
        val movements = mutableListOf<StockMovement>()
        DatabaseManager.dbConnection.createStatement().use { stmt ->
            stmt.executeQuery("SELECT * FROM stock_movements ORDER BY rowid").use { rs ->
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

    /**
     * Saves the product and (optionally) its new movement in one transaction. Throws if the write fails.
     */
    @Synchronized
    fun save(record: ProductRecord, movement: StockMovement? = null) {
        if (!enabled) return
        val conn = DatabaseManager.dbConnection
        conn.autoCommit = false
        try {
            conn.prepareStatement(
                "INSERT OR REPLACE INTO product_records (id, data, updated_at) VALUES (?, ?, ?);"
            ).use { ps ->
                ps.setString(1, record.entity.id)
                ps.setString(2, json.encodeToString(ProductRecord.serializer(), record))
                ps.setString(3, OffsetDateTime.now().toString())
                ps.executeUpdate()
            }

            if (movement != null) {
                conn.prepareStatement("""
                    INSERT INTO stock_movements (id, product_id, type, qty_change, stock_after, reason, user_id, timestamp)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                """.trimIndent()).use { ps ->
                    ps.setString(1, movement.id)
                    ps.setString(2, movement.productId)
                    ps.setString(3, movement.type)
                    ps.setInt(4, movement.change)
                    ps.setInt(5, movement.stockAfter)
                    ps.setString(6, movement.reason)
                    ps.setString(7, movement.userID)
                    ps.setString(8, movement.timestamp)
                    ps.executeUpdate()
                }
            }
            conn.commit()
        } catch (e: Exception) {
            conn.rollback()
            throw e
        } finally {
            conn.autoCommit = true
        }
    }
}
