package com.hazendust.vyte.manager

import java.io.File
import java.sql.Connection
import java.sql.DriverManager
import java.time.LocalDate
import kotlin.concurrent.Volatile

object DatabaseManager {
    @Volatile
    private var connection: Connection? = null

    val dbConnection: Connection
        get() = connection ?: error("DatabaseManager Not Initialized!")

    /**
     * 初始化 SQLite 数据库（不再需要 KMP 的 DatabaseDriverFactory）
     */
    fun init(dbPath: String = "vyte.db") {
        if (connection == null) {
            try {
                // 确保父目录存在
                File(dbPath).parentFile?.mkdirs()

                // 建立 SQLite JDBC 连接
                val conn = DriverManager.getConnection("jdbc:sqlite:$dbPath")
                connection = conn

                // 启用 WAL 模式提高并发性能，开启外键约束
                conn.createStatement().use { statement ->
                    statement.execute("PRAGMA journal_mode = WAL;")
                    statement.execute("PRAGMA synchronous = NORMAL;")
                    statement.execute("PRAGMA foreign_keys = ON;")
                }

                createTablesIfNotExist()
                seedDefaultDataIfEmpty()
                println("[Database] Vyte SQLite Engine Load Successful! (WAL Mode Enabled)")
            } catch (e: Exception) {
                println("[Database] Initialize Database Failed: ${e.message}")
            }
        }
    }

    /**
     * 安全关闭数据库连接并重置实例（保留 WAL Checkpoint 清理）
     */
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

    /**
     * WAL Checkpoint 截断（原汁原味保留你的性能与安全机制）
     */
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
     * 创建支持 Vyte 5 大模块的真实业务表结构
     */
    private fun createTablesIfNotExist() {
        val conn = connection ?: return
        conn.createStatement().use { stmt ->
            stmt.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    id TEXT PRIMARY KEY,
                    sku TEXT NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL,
                    stock INTEGER NOT NULL,
                    safe_threshold INTEGER NOT NULL,
                    cost_price REAL NOT NULL,
                    selling_price REAL NOT NULL,
                    expiry_date TEXT NOT NULL
                );
            """.trimIndent())

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS suppliers (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    lead_time_days INTEGER NOT NULL,
                    moq INTEGER NOT NULL,
                    contact_wa TEXT NOT NULL,
                    unit_price_discount REAL NOT NULL
                );
            """.trimIndent())

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS approval_tasks (
                    id TEXT PRIMARY KEY,
                    trigger_type TEXT NOT NULL,
                    source_message TEXT NOT NULL,
                    deficit_summary TEXT NOT NULL,
                    recommended_supplier TEXT NOT NULL,
                    items_to_order TEXT NOT NULL,
                    total_estimated_cost REAL NOT NULL,
                    explainable_reason TEXT NOT NULL,
                    status TEXT NOT NULL,
                    operator_role TEXT,
                    created_at TEXT NOT NULL
                );
            """.trimIndent())

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS invoices (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    related_ref TEXT NOT NULL,
                    amount REAL NOT NULL,
                    category TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
            """.trimIndent())

            stmt.execute("""
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    timestamp TEXT NOT NULL,
                    operator_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    details TEXT NOT NULL
                );
            """.trimIndent())
        }
    }

    /**
     * 播种马来西亚真实中小微企业合成数据（替换掉原项目的餐饮菜单与桌号）
     */
    private fun seedDefaultDataIfEmpty() {
        val conn = connection ?: return
        val today = LocalDate.now()

        // 检查商品表是否为空
        var hasProducts = false
        conn.createStatement().use { stmt ->
            stmt.executeQuery("SELECT COUNT(*) FROM products").use { rs ->
                if (rs.next() && rs.getInt(1) > 0) hasProducts = true
            }
        }

        if (!hasProducts) {
            val insertProductSql = """
                INSERT INTO products (id, sku, name, category, stock, safe_threshold, cost_price, selling_price, expiry_date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
            """.trimIndent()

            conn.prepareStatement(insertProductSql).use { ps ->
                // 1. 正常快消品 (大米)
                ps.setString(1, "P-101")
                ps.setString(2, "SKU-RICE-01")
                ps.setString(3, "Beras Jasmine Super Special 10kg")
                ps.setString(4, "Staples")
                ps.setInt(5, 15)
                ps.setInt(6, 20)
                ps.setDouble(7, 26.0)
                ps.setDouble(8, 32.0)
                ps.setString(9, today.plusMonths(6).toString())
                ps.addBatch()

                // 2. 畅销饮料包 (Milo)
                ps.setString(1, "P-102")
                ps.setString(2, "SKU-MILO-01")
                ps.setString(3, "Milo 1kg Refill Pack")
                ps.setString(4, "Beverages")
                ps.setInt(5, 8)
                ps.setInt(6, 15)
                ps.setDouble(7, 17.5)
                ps.setDouble(8, 22.5)
                ps.setString(9, today.plusMonths(8).toString())
                ps.addBatch()

                // 3. 临期测试品 (鲜奶 - 用于触发 QC 临期报警与打折建议)
                ps.setString(1, "P-103")
                ps.setString(2, "SKU-MILK-01")
                ps.setString(3, "Dutch Lady Fresh Milk 1L")
                ps.setString(4, "Dairy")
                ps.setInt(5, 40)
                ps.setInt(6, 25)
                ps.setDouble(7, 6.2)
                ps.setDouble(8, 8.5)
                ps.setString(9, today.plusDays(12).toString())
                ps.addBatch()

                // 4. 慢速滞销品 (面粉 - 用于测试 Capital Tie-up)
                ps.setString(1, "P-104")
                ps.setString(2, "SKU-FLOUR-01")
                ps.setString(3, "Cap Sauh Wheat Flour 1kg")
                ps.setString(4, "Staples")
                ps.setInt(5, 85)
                ps.setInt(6, 30)
                ps.setDouble(7, 2.8)
                ps.setDouble(8, 3.8)
                ps.setString(9, today.plusMonths(4).toString())
                ps.addBatch()

                ps.executeBatch()
            }

            // 写入本地供应商数据
            val insertSupplierSql = """
                INSERT INTO suppliers (id, name, lead_time_days, moq, contact_wa, unit_price_discount)
                VALUES (?, ?, ?, ?, ?, ?);
            """.trimIndent()

            conn.prepareStatement(insertSupplierSql).use { ps ->
                ps.setString(1, "S-01")
                ps.setString(2, "Berjaya Wholesale Hub")
                ps.setInt(3, 1)
                ps.setInt(4, 10)
                ps.setString(5, "+60123456781")
                ps.setDouble(6, 0.90) // 便宜 10%
                ps.addBatch()

                ps.setString(1, "S-02")
                ps.setString(2, "Ah Hock Grocers Dist")
                ps.setInt(3, 3)
                ps.setInt(4, 5)
                ps.setString(5, "+60123456782")
                ps.setDouble(6, 0.95)
                ps.addBatch()

                ps.setString(1, "S-03")
                ps.setString(2, "Klang Valley Logistics Hub")
                ps.setInt(3, 2)
                ps.setInt(4, 20)
                ps.setString(5, "+60123456783")
                ps.setDouble(6, 0.88)
                ps.addBatch()

                ps.executeBatch()
            }

            // 写入系统初始化审计日志
            val insertAuditSql = """
                INSERT INTO audit_logs (id, timestamp, operator_role, action, details)
                VALUES (?, datetime('now', 'localtime'), ?, ?, ?);
            """.trimIndent()
            conn.prepareStatement(insertAuditSql).use { ps ->
                ps.setString(1, "LOG-INIT")
                ps.setString(2, "System Boot")
                ps.setString(3, "SYSTEM_INIT")
                ps.setString(4, "Database initialized with Malaysian SME synthetic dataset.")
                ps.executeUpdate()
            }
        }
    }
}