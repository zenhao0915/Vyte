package com.hazendust.vyte.route.jobs

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object JobsController : BaseRouteController {
    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    override fun register(route: Route) {
        DailyJobs.start()

        // POST http://localhost:8989/api/jobs/run-daily  (owner only; runs the 07:00 / 07:05 / 07:10 jobs now)
        route.post("/api/jobs/run-daily") {
            val req = call.receiveOrNull<RunDailyJobsRequest>()
                ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
            if (req.role != AuditService.SME_OWNER) {
                return@post call.respondError(HttpStatusCode.Forbidden, "Only SME_OWNER can run the daily jobs")
            }

            AuditService.log(
                module = AuditService.JOBS,
                role = req.role,
                detail = "Ran the daily jobs manually (QC scan, restock check, overdue summary)."
            )
            call.respond(HttpStatusCode.OK, withContext(Dispatchers.IO) { DailyJobs.runAll() })
        }
    }
}
