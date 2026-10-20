package com.hazendust.vyte.manager

import com.hazendust.vyte.route.order.OrderController
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get

interface BaseRouteController {
    fun register(route: Route)
}

object RouteManager {
    private val controllers: List<BaseRouteController> = listOf(
        OrderController
    )

    fun registerAll(route: Route) {
        route.get("/api/ping") {
            call.respond(HttpStatusCode.OK, mapOf("status" to "OK"))
        }
        controllers.forEach { it.register(route) }
    }
}