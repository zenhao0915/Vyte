package com.hazendust.vyte.route.supplier

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.SupplierEntity
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

object SupplierController : BaseRouteController {
    override fun register(route: Route) {
        listOf("/api/suppliers", "/api/supplier").forEach { path ->
            route.route(path) {
                get {
                    call.respond(WorkspaceContext.current().suppliers.toList())
                }

                get("/{id}") {
                    val id = call.parameters["id"].orEmpty()
                    val supplier = WorkspaceContext.current().suppliers.firstOrNull { it.id == id }
                        ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Supplier not found"))
                    call.respond(supplier)
                }

                post {
                    val entity = runCatching { call.receive<SupplierEntity>() }.getOrNull()
                        ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))
                    val ws = WorkspaceContext.current()
                    val finalEntity = if (entity.id.isBlank()) entity.copy(id = "S-${System.currentTimeMillis() % 10000}") else entity
                    ws.suppliers.removeIf { it.id == finalEntity.id }
                    ws.suppliers.add(finalEntity)
                    AuditService.log("Suppliers", AuditService.SME_OWNER, "Added/Updated supplier ${finalEntity.name}")
                    call.respond(HttpStatusCode.Created, finalEntity)
                }

                delete("/{id}") {
                    val id = call.parameters["id"].orEmpty()
                    WorkspaceContext.current().suppliers.removeIf { it.id == id }
                    call.respond(HttpStatusCode.OK, mapOf("status" to "DELETED", "id" to id))
                }
            }
        }
    }
}