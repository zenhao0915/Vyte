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
            // GET http://localhost:8989/api/qc-alerts?status=PENDING_APPROVAL
            get {
                val status = call.request.queryParameters["status"]?.ifBlank { null }
                if (status != null && status !in QCStore.STATUSES) {
                    return@get call.respondError(HttpStatusCode.BadRequest, "status must be one of ${QCStore.STATUSES}")
                }
                call.respond(QCStore.list(status))
            }

            // POST http://localhost:8989/api/qc-alerts/{id}/approve
            post("/{id}/approve") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<ApproveQCAlertRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                if (req.role !in setOf(AuditService.SME_OWNER, AuditService.MANAGER)) {
                    return@post call.respondError(HttpStatusCode.Forbidden, "Only SME_OWNER can approve QC actions")
                }

                when (val result = QCStore.approve(id, req.userID, req.role)) {
                    is QCResult.Fail -> call.respondError(result.status, result.error)
                    is QCResult.Ok -> {
                        val alert = result.alert
                        val action = alert.actionLabel.removePrefix("Approve ")
                        AuditService.log(
                            module = AuditService.QC,
                            role = req.role,
                            detail = if (alert.actionLabel == QCStore.WRITE_OFF) {
                                "Approved $action for ${alert.productName} batch ${alert.batchNo}: ${alert.qtyAffected} quarantined and removed from stock."
                            } else {
                                "Approved $action for ${alert.productName} batch ${alert.batchNo} (${alert.qtyAffected}, est. RM ${"%.2f".format(alert.savedRM)} saved)."
                            }
                        )
                        call.respond(HttpStatusCode.OK, alert)
                    }
                }
            }
        }

        // POST http://localhost:8989/api/qc/scan
        route.post("/api/qc/scan") {
            val result = withContext(Dispatchers.IO) { QCStore.scanAndSuggest(automatic = false) }
            call.respond(HttpStatusCode.OK, result)
        }
    }
}
