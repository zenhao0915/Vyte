package com.hazendust.vyte.route.compliance

import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.migration.ComplianceProfileDto
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

object ComplianceAndSupportController : BaseRouteController {
    override fun register(route: Route) {
        route.route("/api/compliance") {
            get("/profiles") {
                call.respond(WorkspaceContext.current().complianceProfiles.toList())
            }
            post("/profiles") {
                val item = runCatching { call.receive<ComplianceProfileDto>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.complianceProfiles.removeIf { it.registrationNo.equals(item.registrationNo, ignoreCase = true) }
                ws.complianceProfiles.add(0, item)
                AuditService.log("Compliance", AuditService.SME_OWNER, "Saved compliance profile ${item.registrationNo} (${item.companyName}).")
                call.respond(HttpStatusCode.Created, item)
            }
            put("/profiles") {
                val list = runCatching { call.receive<List<ComplianceProfileDto>>() }.getOrNull()
                    ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.complianceProfiles.clear()
                ws.complianceProfiles.addAll(list)
                call.respond(HttpStatusCode.OK, ws.complianceProfiles.toList())
            }

            get("/vault-docs") {
                call.respond(WorkspaceContext.current().vaultDocs.toList())
            }
            post("/vault-docs") {
                val doc = runCatching { call.receive<DocumentVaultItemDto>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.vaultDocs.removeIf { it.docID == doc.docID }
                ws.vaultDocs.add(0, doc)
                AuditService.log("Document Vault", AuditService.SME_OWNER, "Uploaded vault document ${doc.docID} for ${doc.registrationNo}.")
                call.respond(HttpStatusCode.Created, doc)
            }
            put("/vault-docs") {
                val list = runCatching { call.receive<List<DocumentVaultItemDto>>() }.getOrNull()
                    ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.vaultDocs.clear()
                ws.vaultDocs.addAll(list)
                call.respond(HttpStatusCode.OK, ws.vaultDocs.toList())
            }

            get("/renewal-tasks") {
                call.respond(WorkspaceContext.current().renewalTasks.toList())
            }
            post("/renewal-tasks") {
                val task = runCatching { call.receive<RenewalTaskDto>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.renewalTasks.removeIf { it.renewalID == task.renewalID }
                ws.renewalTasks.add(0, task)
                AuditService.log("Compliance Renewal", AuditService.SME_OWNER, "Updated renewal task ${task.renewalID} (${task.status}).")
                call.respond(HttpStatusCode.Created, task)
            }
            put("/renewal-tasks") {
                val list = runCatching { call.receive<List<RenewalTaskDto>>() }.getOrNull()
                    ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.renewalTasks.clear()
                ws.renewalTasks.addAll(list)
                call.respond(HttpStatusCode.OK, ws.renewalTasks.toList())
            }
        }

        route.route("/api/quotations") {
            get {
                call.respond(WorkspaceContext.current().supplierQuotations.toList())
            }
            post {
                val bid = runCatching { call.receive<SupplierQuotationBidDto>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.supplierQuotations.removeIf { it.quotationNo == bid.quotationNo }
                ws.supplierQuotations.add(0, bid)
                call.respond(HttpStatusCode.Created, bid)
            }
            put {
                val list = runCatching { call.receive<List<SupplierQuotationBidDto>>() }.getOrNull()
                    ?: return@put call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.supplierQuotations.clear()
                ws.supplierQuotations.addAll(list)
                call.respond(HttpStatusCode.OK, ws.supplierQuotations.toList())
            }
        }

        route.route("/api/support/tickets") {
            get {
                call.respond(WorkspaceContext.current().supportTickets.toList())
            }
            post {
                val ticket = runCatching { call.receive<SupportTicketDto>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))
                val ws = WorkspaceContext.current()
                ws.supportTickets.removeIf { it.ticketId == ticket.ticketId }
                ws.supportTickets.add(0, ticket)
                AuditService.log("Technical Support", AuditService.OPERATIONS_STAFF, "Logged support ticket ${ticket.ticketId}: ${ticket.subject}.")
                call.respond(HttpStatusCode.Created, ticket)
            }
            patch("/{ticketId}") {
                val id = call.parameters["ticketId"].orEmpty()
                val body = runCatching { call.receive<Map<String, String>>() }.getOrNull().orEmpty()
                val ws = WorkspaceContext.current()
                val idx = ws.supportTickets.indexOfFirst { it.ticketId == id }
                if (idx < 0) return@patch call.respond(HttpStatusCode.NotFound, mapOf("error" to "Ticket $id not found"))
                val updated = ws.supportTickets[idx].copy(status = body["status"] ?: "RESOLVED")
                ws.supportTickets[idx] = updated
                call.respond(HttpStatusCode.OK, updated)
            }
        }
    }
}