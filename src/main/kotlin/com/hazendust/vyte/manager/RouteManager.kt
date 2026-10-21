package com.hazendust.vyte.manager

import com.hazendust.vyte.route.audit.AuditController
import com.hazendust.vyte.route.invoice.InvoiceController
import com.hazendust.vyte.route.jobs.JobsController
import com.hazendust.vyte.route.order.OrderController
import com.hazendust.vyte.route.product.ProductController
import com.hazendust.vyte.route.qc.QCController
import com.hazendust.vyte.route.restock.RestockController
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

interface BaseRouteController {
    fun register(route: Route)
}

object RouteManager {
    private val controllers: List<BaseRouteController> = listOf(
        OrderController,
        ProductController,
        QCController,
        InvoiceController,
        AuditController,
        JobsController,
        RestockController
    )

    fun registerAll(route: Route) {
        route.get("/api/ping") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "OK"))
        }
        controllers.forEach { it.register(route) }
    }
}