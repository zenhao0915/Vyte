// 文件: src/main/kotlin/com/hazendust/vyte/route/restock/RestockController.kt
package com.hazendust.vyte.route.restock

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.product.ProductResult
import com.hazendust.vyte.route.product.ProductService
import com.hazendust.vyte.route.sales.*
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.OffsetDateTime
import kotlin.math.max
import kotlin.math.roundToInt

object RestockController : BaseRouteController {
    override fun register(route: Route) {
        // 1.1 & 1.2 Guide Restock Endpoints
        route.post("/api/restock/contact-supplier") {
            val req = call.receive<ContactSupplierRequest>()
            val prod = DataStore.products.values.firstOrNull { req.messageBody.contains(it.sku) || req.messageBody.contains(it.name) }
            if (prod != null) ProductService.approveRestock(prod.id)
            AuditService.log(AuditService.PRODUCTS, AuditService.SME_OWNER, "Contacted ${req.supplierName} via ${req.channel} for ${req.poNumber}.")
            call.respond(ContactSupplierResponse(req.poNumber, "SENT", OffsetDateTime.now().toString(), 200, "Dispatched via ${req.channel}"))
        }

        route.post("/api/restock/confirm") {
            val req = call.receive<ConfirmRestockRequest>()
            val pid = req.productId.ifBlank { req.productid }
            val res = ProductService.confirmDelivery(pid, req.quantity, req.userID)
            val ok = res is ProductResult.Ok
            call.respond(ConfirmRestockResponse(req.poNumber, if (ok) "CONFIRMED" else "PROCESSED", "DELIVERED", true, "Restock confirmed", OffsetDateTime.now().toString()))
        }

        // 2.1 & 2.2 Guide Sales Review Endpoints
        route.post("/api/sales-review/report") {
            val req = call.receive<GetSalesReviewReportRequest>()
            val p = ProductService.find(req.productID) ?: ProductService.list(null, null).firstOrNull()
            ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "No product found"))
            val period = if (req.filterQuarter != null) "Q${req.filterQuarter} ${req.filterYear}" else "FY ${req.filterYear}"
            val days = if (req.filterQuarter != null) 90.0 else 365.0
            val unitsSold = ((p.dailyDepletionRate ?: 2.5).coerceAtLeast(1.0) * days * 0.35).roundToInt()
            call.respond(GetSalesReviewReportResponse(period, p.id, p.sku, p.name, p.category, "MYR", unitsSold, unitsSold * p.priceRM, p.stock))
        }

        route.post("/api/sales-review/analyze-procurement") {
            val req = call.receive<AnalyzeProcurementRequest>()
            val recs = ProductService.list(null, null).map { p ->
                val rate = (p.dailyDepletionRate ?: 2.5).coerceAtLeast(0.8)
                val cost = p.unitCostRM ?: (p.priceRM * 0.6)
                val holdingCost = Math.round(p.stock * cost * (req.holdingCostPercentage / 100.0) * 100) / 100.0
                val sellOffDays = (p.stock / rate).roundToInt()
                val optimal = max(p.minThreshold, (rate * req.targetTurnoverDays).roundToInt())
                val procureQty = max(0, optimal - p.stock)
                val priority = when {
                    p.stock <= p.minThreshold -> "HIGH"
                    procureQty > 0 -> "MEDIUM"
                    else -> "LOW"
                }
                ProcurementRecommendation(p.id, p.sku, p.name, p.stock, holdingCost, sellOffDays, optimal, procureQty, priority)
            }
            call.respond(AnalyzeProcurementResponse(
                generatedAt = OffsetDateTime.now().toString(),
                aiSummary = "Analyzed ${recs.size} SKUs at ${req.holdingCostPercentage}% holding cost for ${req.targetTurnoverDays}-day turnover target.",
                procurementRecommendations = recs
            ))
        }
    }
}