package com.hazendust.vyte.route.audit

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.invoice.InvoiceService
import com.hazendust.vyte.route.product.ProductService
import com.hazendust.vyte.route.qc.QCStore
import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

object AuditController : BaseRouteController {
    private const val DEFAULT_LIMIT = 50
    private const val MAX_LIMIT = 500

    override fun register(route: Route) {
        // GET http://localhost:8989/api/audit-logs?limit=50
        route.get("/api/audit-logs") {
            val rawLimit = call.request.queryParameters["limit"]
            val limit = if (rawLimit.isNullOrBlank()) DEFAULT_LIMIT else rawLimit.toIntOrNull()
            if (limit == null || limit !in 1..MAX_LIMIT) {
                return@get call.respond(HttpStatusCode.BadRequest, mapOf("error" to "limit must be a number between 1 and $MAX_LIMIT"))
            }
            call.respond(AuditService.list(limit))
        }

        // GET http://localhost:8989/api/dashboard/kpis
        route.get("/api/dashboard/kpis") {
            val products = ProductService.list(null, null)
            val invoices = InvoiceService.list()
            call.respond(
                DashboardKpis(
                    totalSkus = products.size,
                    pendingRestocks = products.count { it.restockStatus == "TRIGGERED_PENDING_APPROVAL" },
                    pendingQcBatches = QCStore.list("PENDING_APPROVAL").size,
                    totalInvoices = invoices.size,
                    pendingInvoiceReviews = invoices.count { it.status == "NEEDS_REVIEW" }
                )
            )
        }
    }
}
