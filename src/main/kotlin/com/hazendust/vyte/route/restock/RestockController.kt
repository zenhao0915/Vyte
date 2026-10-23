package com.hazendust.vyte.route.restock

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.product.ProductResult
import com.hazendust.vyte.route.product.ProductService
import com.hazendust.vyte.route.sales.*
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.OffsetDateTime
import kotlin.math.max
import kotlin.math.roundToInt

object RestockController : BaseRouteController {
    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    override fun register(route: Route) {
        route.post("/api/workspace/reset") {
            WorkspaceContext.resetCurrent()
            call.respond(HttpStatusCode.OK, mapOf("status" to "RESET_OK", "workspaceId" to WorkspaceContext.currentId()))
        }

        // 1.1 & 1.2 Restock Endpoints
        route.post("/api/restock/contact-supplier") {
            val req = call.receiveOrNull<ContactSupplierRequest>()
                ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
            if (req.supplierName.isBlank() || req.poNumber.isBlank()) {
                return@post call.respondError(HttpStatusCode.BadRequest, "poNumber and supplierName are required")
            }

            val prod = DataStore.products.values.firstOrNull { req.messageBody.contains(it.sku) || req.messageBody.contains(it.name) }
            if (prod != null) ProductService.approveRestock(prod.id)
            AuditService.log(AuditService.PRODUCTS, AuditService.SME_OWNER, "Contacted ${req.supplierName} via ${req.channel} for ${req.poNumber}.")
            call.respond(ContactSupplierResponse(req.poNumber, "SENT", OffsetDateTime.now().toString(), 200, "Dispatched via ${req.channel}"))
        }

        route.post("/api/restock/confirm") {
            val req = call.receiveOrNull<ConfirmRestockRequest>()
                ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
            if (req.quantity <= 0) {
                return@post call.respondError(HttpStatusCode.BadRequest, "quantity must be > 0")
            }
            val pid = req.productId.ifBlank { req.productid }
            val res = ProductService.confirmDelivery(pid, req.quantity, req.userID)
            val ok = res is ProductResult.Ok
            call.respond(ConfirmRestockResponse(req.poNumber, if (ok) "CONFIRMED" else "PROCESSED", "DELIVERED", true, "Restock confirmed", OffsetDateTime.now().toString()))
        }

        // 2.1 & 2.2 Sales Review Endpoints
        route.post("/api/sales-review/report") {
            val req = call.receiveOrNull<GetSalesReviewReportRequest>()
                ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

            val allProducts = ProductService.list(null, null)
                .filter { req.category.isNullOrBlank() || req.category == "ALL" || it.category.equals(req.category, ignoreCase = true) }

            val period = if (req.filterQuarter != null) "Q${req.filterQuarter} ${req.filterYear}" else "FY ${req.filterYear} (Full Year)"
            val days = if (req.filterQuarter != null) 90.0 else 365.0
            val qMult = when (req.filterQuarter) { 1 -> 0.88; 2 -> 0.96; 3 -> 1.08; 4 -> 1.24; else -> 1.0 }

            val breakdown = allProducts.map { p ->
                val rate = (p.dailyDepletionRate ?: 2.5).coerceAtLeast(1.2)
                val unitsSold = (rate * days * qMult * 0.45).roundToInt()
                val rev = Math.round(unitsSold * p.priceRM * 100) / 100.0
                ProductSalesBreakdownItem(p.id, p.sku, p.name, p.category, unitsSold, rev, p.stock)
            }

            val totalRev = Math.round(breakdown.sumOf { it.totalSalesAmount } * 100) / 100.0
            val totalUnits = breakdown.sumOf { it.unitsSold }
            val first = breakdown.firstOrNull()

            call.respond(
                GetSalesReviewReportResponse(
                    period = period,
                    totalRevenue = totalRev,
                    totalUnitsSold = totalUnits,
                    currency = "MYR",
                    productBreakdown = breakdown,
                    productID = first?.productID ?: "",
                    SKU = first?.SKU ?: "",
                    name = first?.name ?: "",
                    category = first?.category ?: "",
                    unitsSold = totalUnits,
                    remainingStock = first?.remainingStock ?: 0
                )
            )
        }

        route.post("/api/sales-review/analyze-procurement") {
            val req = call.receiveOrNull<AnalyzeProcurementRequest>()
                ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

            val holdingPct = req.holdingCostPercentage.coerceIn(1.0f, 50.0f)
            val turnoverDays = req.targetTurnoverDays.coerceIn(5, 90)
            val divisor = if (req.filterQuarter != null) 4.0 else 1.0

            val recs = ProductService.list(null, null).map { p ->
                val rate = (p.dailyDepletionRate ?: 2.5).coerceAtLeast(1.0)
                val cost = p.unitCostRM ?: (p.priceRM * 0.6)
                val holdingCost = Math.round(((p.stock * cost * (holdingPct / 100.0)) / divisor) * 100) / 100.0
                val sellOffDays = max(1, (p.stock / rate).roundToInt())
                val optimal = max(p.minThreshold, (rate * turnoverDays).roundToInt())
                val procureQty = max(0, optimal - p.stock)
                val priority = when {
                    p.stock <= p.minThreshold || sellOffDays <= 4 -> "HIGH"
                    procureQty > 0 -> "MEDIUM"
                    else -> "LOW"
                }
                ProcurementRecommendation(p.id, p.sku, p.name, p.stock, holdingCost, sellOffDays, optimal, procureQty, priority)
            }

            val highCount = recs.count { it.priorityLevel == "HIGH" }
            call.respond(
                AnalyzeProcurementResponse(
                    generatedAt = OffsetDateTime.now().toString(),
                    aiSummary = "Analyzed ${recs.size} active SKUs at ${holdingPct}% holding cost and ${turnoverDays}-day turnover target. Identified $highCount high-priority SKUs requiring restock.",
                    procurementRecommendations = recs
                )
            )
        }
    }
}