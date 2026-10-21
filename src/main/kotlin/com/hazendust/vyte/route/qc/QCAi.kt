package com.hazendust.vyte.route.qc

import com.hazendust.vyte.route.ai.AiService
import com.hazendust.vyte.route.ai.AiService.number
import com.hazendust.vyte.route.ai.AiService.string
import com.hazendust.vyte.route.product.ProductService
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Replaces the rule-based suggestion of new QC alerts with an AI one when the AI is available.
 * Expired batches always keep the rule-based write-off (never ask an AI how to sell expired food),
 * and the AI may never produce the write-off label, because approving it sets the product's stock to 0.
 */
object QCAi {
    private const val MAX_TOKENS = 200
    private const val PARALLEL_CALLS = 3
    private const val TOTAL_TIMEOUT_SECONDS = 75L
    private const val MAX_LABEL_LENGTH = 40
    private const val MAX_SUGGESTION_LENGTH = 240

    private val pool = Executors.newFixedThreadPool(PARALLEL_CALLS) { r -> Thread(r, "qc-ai").apply { isDaemon = true } }

    data class Enriched(val alerts: List<QCAlert>, val auditLine: String?)

    private sealed interface Outcome {
        data class Applied(val alert: QCAlert, val model: String) : Outcome
        data class Kept(val reason: String) : Outcome
    }

    private val SYSTEM_PROMPT = """
        You advise small Malaysian food businesses (kedai runcit, cafes, bakeries, mini markets) on perishable stock
        that is close to its expiry date. Prices are in Malaysian Ringgit (RM). Be practical, legal and food-safe.
        Reply with ONLY a JSON object with exactly these keys:
        - "aiSuggestion": ONE sentence (max 30 words) telling the owner what to do with this batch today
        - "actionLabel": a short button label of 2-4 words that starts with "Approve", e.g. "Approve Markdown"
        - "savedRM": number, the RM value this action is expected to recover; never more than maxRecoverableRM
    """.trimIndent()

    fun enrich(newAlerts: List<QCAlert>): Enriched {
        val candidates = newAlerts.filter { it.daysLeft >= 0 }
        if (candidates.isEmpty()) return Enriched(newAlerts, null)
        if (!AiService.isConfigured()) {
            return Enriched(newAlerts, "AI not used for ${candidates.size} QC alert(s) (no API key); kept rule-based suggestions.")
        }

        val futures = pool.invokeAll(candidates.map { alert -> Callable { suggest(alert) } }, TOTAL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
        val outcomes = futures.map { f -> runCatching { f.get() }.getOrElse { Outcome.Kept("AI took too long") } }

        val applied = outcomes.filterIsInstance<Outcome.Applied>()
        val byId = applied.associate { it.alert.id to it.alert }
        val kept = outcomes.filterIsInstance<Outcome.Kept>()

        val line = buildString {
            append("AI wrote suggestions for ${applied.size} of ${candidates.size} new QC alert(s)")
            applied.firstOrNull()?.let { append(" (${it.model})") }
            append(".")
            if (kept.isNotEmpty()) append(" ${kept.size} kept the rule-based suggestion (${kept.map { it.reason }.distinct().joinToString("; ")}).")
            applied.forEach { append(" ${it.alert.productName}: ${it.alert.actionLabel}, est. RM ${"%.2f".format(it.alert.savedRM)}.") }
        }
        return Enriched(newAlerts.map { byId[it.id] ?: it }, line)
    }

    private fun suggest(alert: QCAlert): Outcome {
        val product = QCStore.productIdOf(alert.id)?.let { ProductService.find(it) }
            ?: return Outcome.Kept("product not found")
        val maxRecoverable = product.stock * product.priceRM

        val prompt = """
            Product: ${product.name} (category ${product.category})
            Batch: ${alert.batchNo}, expires ${alert.expiryDate} (${alert.daysLeft} day(s) left)
            Quantity affected: ${alert.qtyAffected}
            Selling price: RM ${product.priceRM} per ${product.uom}; unit cost: RM ${product.unitCostRM ?: "unknown"}
            Units sold per day recently: ${product.dailyDepletionRate ?: 0.0}
            maxRecoverableRM: ${"%.2f".format(maxRecoverable)}
            Current rule-based suggestion: "${alert.aiSuggestion}" (${alert.actionLabel}, RM ${alert.savedRM})
        """.trimIndent()

        return when (val result = AiService.chatJson(SYSTEM_PROMPT, prompt, MAX_TOKENS)) {
            is AiService.AiResult.Failure -> Outcome.Kept(result.reason)
            is AiService.AiResult.Success -> {
                val data = result.data
                val suggestion = data.string("aiSuggestion")?.take(MAX_SUGGESTION_LENGTH)
                    ?: return Outcome.Kept("AI gave no suggestion")
                // A rejected label means the text describes a different action, so keep the whole rule-based suggestion
                val label = data.string("actionLabel")?.takeIf { isSafeLabel(it) }
                    ?: return Outcome.Kept("AI action label not allowed")
                val savedRM = data.number("savedRM")?.takeIf { it >= 0 }
                    ?.let { Math.round(minOf(it, maxRecoverable) * 100) / 100.0 }
                    ?: alert.savedRM
                QCStore.applyAi(alert.id, suggestion, label, savedRM)
                    ?.let { Outcome.Applied(it, result.model) }
                    ?: Outcome.Kept("alert was resolved meanwhile")
            }
        }
    }

    /** Starts with "Approve", is short, and can't be mistaken for the write-off action. */
    private fun isSafeLabel(label: String): Boolean =
        label.startsWith("Approve ") &&
            label.length <= MAX_LABEL_LENGTH &&
            listOf("write", "dispos", "discard", "quarantine").none { label.contains(it, ignoreCase = true) }
}
