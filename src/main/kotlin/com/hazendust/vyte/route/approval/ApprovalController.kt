package com.hazendust.vyte.route.approval

import com.hazendust.vyte.data.ApprovalTaskEntity
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.Serializable

object ApprovalController : BaseRouteController {
    override fun register(route: Route) {
        route.route("/api/approval-tasks") {
            get {
                call.respond(WorkspaceContext.current().approvalTasks.toList())
            }

            post {
                val task = runCatching { call.receive<ApprovalTaskEntity>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))
                val ws = WorkspaceContext.current()
                ws.approvalTasks.add(0, task)
                call.respond(HttpStatusCode.Created, task)
            }

            post("/{id}/approve") {
                val id = call.parameters["id"].orEmpty()
                val body = runCatching { call.receive<ApprovalActionBody>() }.getOrNull() ?: ApprovalActionBody()
                val ws = WorkspaceContext.current()
                val idx = ws.approvalTasks.indexOfFirst { it.id == id }
                if (idx < 0) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Task not found"))
                val updated = ws.approvalTasks[idx].copy(status = "APPROVED", operatorRole = body.operatorRole)
                ws.approvalTasks[idx] = updated
                AuditService.log("Approval", body.operatorRole, "Approved task $id (${updated.recommendedSupplier})")
                call.respond(HttpStatusCode.OK, updated)
            }

            post("/{id}/reject") {
                val id = call.parameters["id"].orEmpty()
                val body = runCatching { call.receive<ApprovalActionBody>() }.getOrNull() ?: ApprovalActionBody()
                val ws = WorkspaceContext.current()
                val idx = ws.approvalTasks.indexOfFirst { it.id == id }
                if (idx < 0) return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Task not found"))
                val updated = ws.approvalTasks[idx].copy(status = "REJECTED", operatorRole = body.operatorRole)
                ws.approvalTasks[idx] = updated
                AuditService.log("Approval", body.operatorRole, "Rejected task $id")
                call.respond(HttpStatusCode.OK, updated)
            }
        }
    }
}