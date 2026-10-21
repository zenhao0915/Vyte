package com.hazendust.vyte.route.jobs

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.invoice.InvoiceFilter
import com.hazendust.vyte.route.invoice.InvoiceService
import com.hazendust.vyte.route.product.ProductService
import com.hazendust.vyte.route.qc.QCStore
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Daily jobs in Malaysia time on one JDK daemon thread (no extra dependency):
 * 07:00 QC expiry scan, 07:05 restock trigger check, 07:10 overdue invoice summary.
 * Started from JobsController.register(), so Application.kt needs no change.
 */
object DailyJobs {
    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")
    private val QC_SCAN_AT: LocalTime = LocalTime.of(7, 0)
    private val RESTOCK_CHECK_AT: LocalTime = LocalTime.of(7, 5)
    private val OVERDUE_SUMMARY_AT: LocalTime = LocalTime.of(7, 10)

    @Volatile
    private var started = false

    @Synchronized
    fun start() {
        if (started) return
        started = true
        val executor = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "daily-jobs").apply { isDaemon = true } }
        schedule(executor, "QC expiry scan", QC_SCAN_AT) { runQcScan(automatic = true) }
        schedule(executor, "restock trigger check", RESTOCK_CHECK_AT) { runRestockCheck() }
        schedule(executor, "overdue invoice summary", OVERDUE_SUMMARY_AT) { runOverdueSummary() }
    }

    /** Runs all three jobs now (POST /api/jobs/run-daily). */
    @Synchronized
    fun runAll(): RunDailyJobsResponse = RunDailyJobsResponse(
        ranAt = OffsetDateTime.now(MALAYSIA).truncatedTo(ChronoUnit.SECONDS).toString(),
        qcScan = runQcScan(automatic = false),
        restockCheck = runRestockCheck(),
        overdueInvoices = runOverdueSummary()
    )

    private fun runQcScan(automatic: Boolean): QcJobResult {
        // scanAndSuggest writes its own audit entries (scan summary + AI use)
        val result = QCStore.scanAndSuggest(automatic)
        return QcJobResult(result.scannedCount, result.newAlerts.size)
    }

    private fun runRestockCheck(): RestockJobResult {
        val checked = DataStore.products.size
        val triggered = ProductService.recheckAllTriggers()
        AuditService.log(
            module = AuditService.PRODUCTS,
            role = AuditService.OPERATIONS_STAFF,
            detail = "Daily restock check: $checked products checked, " + when (triggered.size) {
                0 -> "no new restock triggers."
                else -> "${triggered.size} newly triggered (${triggered.joinToString(", ") { it.name }})."
            }
        )
        return RestockJobResult(checked, triggered.map { it.id })
    }

    private fun runOverdueSummary(): OverdueJobResult {
        val overdue = InvoiceService.list(InvoiceFilter(overdue = true))
        val total = Math.round(overdue.sumOf { it.amountRM } * 100) / 100.0
        val payable = overdue.filter { it.type == InvoiceService.PAYABLE }
        val receivable = overdue.filter { it.type == InvoiceService.RECEIVABLE }
        AuditService.log(
            module = AuditService.INVOICES,
            role = AuditService.OPERATIONS_STAFF,
            detail = if (overdue.isEmpty()) {
                "Daily overdue check: no overdue invoices."
            } else {
                "Daily overdue check: ${overdue.size} overdue invoice(s), RM ${"%.2f".format(total)} " +
                    "(to pay RM ${"%.2f".format(payable.sumOf { it.amountRM })}, to receive RM ${"%.2f".format(receivable.sumOf { it.amountRM })}): " +
                    overdue.take(5).joinToString(", ") { "${it.invNo} ${it.party} due ${it.dueDate}" } +
                    if (overdue.size > 5) ", +${overdue.size - 5} more." else "."
            }
        )
        return OverdueJobResult(overdue.size, total)
    }

    private fun schedule(executor: java.util.concurrent.ScheduledExecutorService, name: String, at: LocalTime, job: () -> Unit) {
        val now = LocalDateTime.now(MALAYSIA)
        var next = now.toLocalDate().atTime(at)
        if (!next.isAfter(now)) next = next.plusDays(1)
        executor.scheduleAtFixedRate({
            // A failing job must not stop the timer or the other jobs
            try {
                job()
            } catch (e: Exception) {
                println("[Jobs] Daily $name failed: ${e.message}")
            }
        }, ChronoUnit.MILLIS.between(now, next), TimeUnit.DAYS.toMillis(1), TimeUnit.MILLISECONDS)
        println("[Jobs] Daily $name scheduled at $at Asia/Kuala_Lumpur (next run: $next)")
    }
}
