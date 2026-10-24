package com.hazendust.vyte.route.qc

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object QCController : BaseRouteController {
    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    override fun register(route: Route) {
        route.route("/api/qc-alerts") {
            get {
                val status = call.request.queryParameters["status"]?.ifBlank { null }
                if (status != null && status !in QCStore.STATUSES) {
                    return@get call.respondError(HttpStatusCode.BadRequest, "status must be one of ${QCStore.STATUSES}")
                }
                call.respond(QCStore.list(status))
            }

            post {
                val alert = call.receiveOrNull<QCAlert>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                val created = QCStore.addCustom(alert)
                AuditService.log(AuditService.QC, AuditService.OPERATIONS_STAFF, "Logged custom QC batch alert for ${created.productName} (${created.batchNo}).")
                call.respond(HttpStatusCode.Created, created)
            }

            post("/{id}/assign") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<AssignQCStaffRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                when (val res = QCStore.assignStaff(id, req)) {
                    is QCResult.Fail -> call.respondError(res.status, res.error)
                    is QCResult.Ok -> {
                        AuditService.log(AuditService.QC, req.role, "Assigned warehouse task ${res.alert.hrTaskId} (${res.alert.productName}) to ${req.staff.name}.")
                        call.respond(HttpStatusCode.OK, res.alert)
                    }
                }
            }

            post("/{id}/escalate") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<EscalateQCAlertRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                when (val res = QCStore.escalate(id, req)) {
                    is QCResult.Fail -> call.respondError(res.status, res.error)
                    is QCResult.Ok -> {
                        AuditService.log(AuditService.QC, req.role, "Escalated overdue warehouse task ${req.payload.hrTaskId} to Warehouse Supervisor.")
                        call.respond(HttpStatusCode.OK, res.alert)
                    }
                }
            }

            post("/{id}/approve") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<ApproveQCAlertRequest>() ?: ApproveQCAlertRequest()
                val effectiveRole = req.role.ifBlank { AuditService.SME_OWNER }

                when (val result = QCStore.approve(id, req.userID, effectiveRole)) {
                    is QCResult.Fail -> call.respondError(result.status, result.error)
                    is QCResult.Ok -> {
                        val alert = result.alert
                        val action = alert.actionLabel.removePrefix("Approve ")
                        AuditService.log(
                            module = AuditService.QC,
                            role = effectiveRole,
                            detail = if (alert.actionLabel == QCStore.WRITE_OFF) {
                                "Approved $action for ${alert.productName} batch ${alert.batchNo}: ${alert.qtyAffected} quarantined and removed from stock."
                            } else {
                                "Completed QC task ($action) for ${alert.productName} batch ${alert.batchNo} (${alert.qtyAffected}, est. RM ${"%.2f".format(alert.savedRM)} saved)."
                            }
                        )
                        call.respond(HttpStatusCode.OK, alert)
                    }
                }
            }
        }

        route.post("/api/qc/scan") {
            val result = withContext(Dispatchers.IO) { QCStore.scanAndSuggest(automatic = false) }
            call.respond(HttpStatusCode.OK, result)
        }
    }
}