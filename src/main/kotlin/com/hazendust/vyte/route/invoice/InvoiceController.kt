package com.hazendust.vyte.route.invoice

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.http.content.*
import io.ktor.server.application.*
import io.ktor.server.plugins.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.utils.io.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.io.readByteArray
import java.io.IOException

object InvoiceController : BaseRouteController {
    private const val DATE_HINT = "\"21 Oct 2026\" or \"2026-10-21\""

    // Upper bound for a whole upload request; bigger requests are refused without reading them
    private const val MAX_MULTIPART_BYTES = 25L * 1024 * 1024

    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    private suspend fun ApplicationCall.respondResult(result: InvoiceResult) = when (result) {
        is InvoiceResult.Ok -> respond(HttpStatusCode.OK, result.invoice)
        is InvoiceResult.Fail -> respondError(result.status, result.error)
    }

    private fun rm(amount: Double) = "RM ${"%.2f".format(amount)}"

    private fun kind(inv: InvoiceItem) = if (inv.type == InvoiceService.PAYABLE) "supplier payable" else "customer receivable"

    /** Parsed body of POST /upload, from either JSON or multipart/form-data. */
    private class UploadInput(
        val rawText: String?,
        val type: String?,
        val userID: String,
        val party: String? = null,
        val amountRM: String? = null,
        val invNo: String? = null,
        val fileName: String? = null,
        val fileBytes: ByteArray? = null,
        val fileTooLarge: Boolean = false
    )

    private suspend fun ApplicationCall.receiveUploadInput(): UploadInput? {
        if (!request.contentType().match(ContentType.MultiPart.FormData)) {
            val json = receiveOrNull<UploadInvoiceRequest>() ?: return null
            return UploadInput(json.rawText, json.type, json.userID)
        }

        // Far too large: refuse without reading. Otherwise read the whole body so the client always gets a clean 413.
        if ((request.contentLength() ?: 0) > MAX_MULTIPART_BYTES) return UploadInput(null, null, "", fileTooLarge = true)

        val fields = mutableMapOf<String, String>()
        var fileName: String? = null
        var bytes: ByteArray? = null
        try {
            receiveMultipart(formFieldLimit = MAX_MULTIPART_BYTES).forEachPart { part ->
                when (part) {
                    is PartData.FormItem -> part.name?.let { fields[it] = part.value }
                    is PartData.FileItem -> {
                        val channel = part.provider()
                        if (part.name == "file") {
                            fileName = part.originalFileName
                            bytes = channel.readBuffer(InvoiceFiles.MAX_BYTES + 1).readByteArray()
                        }
                        channel.discard() // drain anything beyond the 5 MB we keep
                    }
                    else -> Unit
                }
                part.release()
            }
        } catch (e: Exception) {
            // Only thrown when a single part exceeds MAX_MULTIPART_BYTES
            return UploadInput(null, null, "", fileTooLarge = true)
        }
        return UploadInput(
            rawText = fields["rawText"],
            type = fields["type"]?.ifBlank { null },
            userID = fields["userID"].orEmpty(),
            party = fields["party"],
            amountRM = fields["amountRM"],
            invNo = fields["invNo"],
            fileName = fileName,
            fileBytes = bytes,
            fileTooLarge = (bytes?.size ?: 0) > InvoiceFiles.MAX_BYTES
        )
    }

    private fun ApplicationCall.fileUrl(invoiceId: String): String {
        val origin = request.origin
        return "${origin.scheme}://${origin.serverHost}:${origin.serverPort}/api/invoices/$invoiceId/file"
    }

    private fun changedFields(req: UpdateInvoiceRequest): String = listOfNotNull(
        req.party?.let { "party $it" },
        req.amountRM?.let { "amount ${rm(it)}" },
        req.aiCategory?.let { "category $it" },
        req.dueDate?.let { "due date $it" },
        req.type?.let { "type $it" },
        req.notes?.let { if (it.isBlank()) "notes cleared" else "notes" }
    ).joinToString(", ").ifEmpty { "no changes" }

    override fun register(route: Route) {
        route.route("/api/invoices") {
            // GET http://localhost:8989/api/invoices?type=ALL&status=NEEDS_REVIEW&overdue=true&party=ah&from=1 Oct 2026&to=2026-10-31
            get {
                val q = call.request.queryParameters
                val type = q["type"]?.ifBlank { null }
                val status = q["status"]?.ifBlank { null }
                if (type != null && type != "ALL" && type !in InvoiceService.TYPES) {
                    return@get call.respondError(HttpStatusCode.BadRequest, "type must be ALL or one of ${InvoiceService.TYPES}")
                }
                if (status != null && status != "ALL" && status !in InvoiceService.STATUSES) {
                    return@get call.respondError(HttpStatusCode.BadRequest, "status must be ALL or one of ${InvoiceService.STATUSES}")
                }
                val overdue = when (q["overdue"]?.lowercase()) {
                    null, "" -> null
                    "true" -> true
                    "false" -> false
                    else -> return@get call.respondError(HttpStatusCode.BadRequest, "overdue must be true or false")
                }
                val from = q["from"]?.ifBlank { null }?.let {
                    InvoiceService.parseDate(it) ?: return@get call.respondError(HttpStatusCode.BadRequest, "from must look like $DATE_HINT")
                }
                val to = q["to"]?.ifBlank { null }?.let {
                    InvoiceService.parseDate(it) ?: return@get call.respondError(HttpStatusCode.BadRequest, "to must look like $DATE_HINT")
                }
                if (from != null && to != null && from.isAfter(to)) {
                    return@get call.respondError(HttpStatusCode.BadRequest, "from must not be after to")
                }
                call.respond(InvoiceService.list(InvoiceFilter(type, status, overdue, q["party"], from, to)))
            }

            // GET http://localhost:8989/api/invoices/summary
            get("/summary") {
                call.respond(InvoiceService.summary())
            }

            // GET http://localhost:8989/api/invoices/{id}/file
            get("/{id}/file") {
                val id = call.parameters["id"].orEmpty()
                InvoiceService.find(id) ?: return@get call.respondError(HttpStatusCode.NotFound, "Invoice $id not found")
                val file = InvoiceService.fileOf(id)
                    ?: return@get call.respondError(HttpStatusCode.NotFound, "Invoice $id has no uploaded file")
                call.response.header(
                    HttpHeaders.ContentDisposition,
                    ContentDisposition.Inline.withParameter(ContentDisposition.Parameters.FileName, file.name).toString()
                )
                call.respondFile(file)
            }

            // POST http://localhost:8989/api/invoices
            post {
                val req = call.receiveOrNull<CreateInvoiceRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                when {
                    req.type !in InvoiceService.TYPES ->
                        return@post call.respondError(HttpStatusCode.BadRequest, "type must be one of ${InvoiceService.TYPES}")
                    req.party.isNullOrBlank() ->
                        return@post call.respondError(HttpStatusCode.BadRequest, "party is required")
                    req.amountRM == null || req.amountRM < 0 ->
                        return@post call.respondError(HttpStatusCode.BadRequest, "amountRM is required and must be >= 0")
                }
                val date = if (req.date.isNullOrBlank()) InvoiceService.today() else InvoiceService.parseDate(req.date)
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "date must look like $DATE_HINT")
                val dueDate = req.dueDate?.ifBlank { null }?.let {
                    InvoiceService.parseDate(it) ?: return@post call.respondError(HttpStatusCode.BadRequest, "dueDate must look like $DATE_HINT")
                }

                when (val result = InvoiceService.createFromRequest(req, date, dueDate)) {
                    is InvoiceResult.Fail -> call.respondError(result.status, result.error)
                    is InvoiceResult.Ok -> {
                        val inv = result.invoice
                        AuditService.log(
                            module = AuditService.INVOICES,
                            role = AuditService.OPERATIONS_STAFF,
                            detail = "Created ${kind(inv)} ${inv.invNo} for ${inv.party} (${rm(inv.amountRM)}, due ${inv.dueDate})."
                        )
                        call.respond(HttpStatusCode.Created, inv)
                    }
                }
            }

            // POST http://localhost:8989/api/invoices/upload  (JSON { rawText, type?, userID } or multipart with "file")
            post("/upload") {
                val input = call.receiveUploadInput()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                if (input.fileTooLarge) {
                    return@post call.respondError(HttpStatusCode.PayloadTooLarge, "file must be 5 MB or smaller")
                }
                if (input.type != null && input.type !in InvoiceService.TYPES) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "type must be one of ${InvoiceService.TYPES}")
                }
                val isMultipart = call.request.contentType().match(ContentType.MultiPart.FormData)
                val bytes = input.fileBytes
                val ext = bytes?.let { InvoiceFiles.detectType(it) }
                when {
                    isMultipart && (bytes == null || bytes.isEmpty()) ->
                        return@post call.respondError(HttpStatusCode.BadRequest, "file is required (multipart field \"file\")")
                    isMultipart && ext == null ->
                        return@post call.respondError(HttpStatusCode.UnsupportedMediaType, "file must be a JPG, PNG or PDF")
                    !isMultipart && input.rawText.isNullOrBlank() ->
                        return@post call.respondError(HttpStatusCode.BadRequest, "rawText is required")
                }

                val rawText = input.rawText?.ifBlank { null }
                if (ext == "pdf" && rawText == null) {
                    // Reading PDF text needs a PDF library, which the project doesn't have
                    return@post call.respondError(HttpStatusCode.BadRequest, "Please upload a photo or paste the text")
                }

                // AI first (text, else photo); keyword rules are the fallback. Explicit form fields always win.
                val parsed = rawText?.let { InvoiceParser.parse(it) }
                val ai = withContext(Dispatchers.IO) {
                    when {
                        rawText != null -> InvoiceAi.extractFromText(rawText)
                        bytes != null && ext != null -> InvoiceAi.extractFromImage(if (ext == "png") "image/png" else "image/jpeg", bytes)
                        else -> InvoiceAi.Outcome.Unavailable("nothing to read")
                    }
                }
                val read = (ai as? InvoiceAi.Outcome.Read)?.extraction

                val amount = when {
                    !input.amountRM.isNullOrBlank() -> input.amountRM.toDoubleOrNull()?.takeIf { it >= 0 }
                        ?: return@post call.respondError(HttpStatusCode.BadRequest, "amountRM must be a number >= 0")
                    read?.amountRM != null -> read.amountRM
                    parsed?.amountRM != null -> parsed.amountRM
                    isMultipart -> 0.0
                    else -> return@post call.respondError(HttpStatusCode.BadRequest, "Could not find an amount in rawText")
                }
                val party = input.party?.trim()?.ifEmpty { null } ?: read?.party ?: parsed?.party ?: "Unknown (uploaded file)"
                val category = read?.category ?: parsed?.category ?: "Uncategorised"
                val confidence = read?.confidence ?: parsed?.aiConfidence ?: 0
                val invNo = input.invNo?.trim()?.ifEmpty { null } ?: read?.invNo ?: parsed?.invNo
                val type = input.type ?: read?.type
                    ?: if (category == "Product Sales") InvoiceService.RECEIVABLE else InvoiceService.PAYABLE
                val notes = when {
                    read != null -> InvoiceAi.reviewNotes(confidence, read.missingFields, "AI")
                    parsed != null -> listOfNotNull(
                        "Read by keyword rules (AI unavailable).",
                        InvoiceAi.reviewNotes(confidence, emptyList(), "Rule")
                    ).joinToString(" ")
                    else -> "AI could not read this file; please fill in the details."
                }

                val created = InvoiceService.createFromUpload(
                    type, party, amount, category, confidence, invNo,
                    date = read?.date ?: InvoiceService.today(),
                    dueDate = read?.dueDate,
                    notes = notes
                )
                if (created is InvoiceResult.Fail) return@post call.respondError(created.status, created.error)
                var inv = (created as InvoiceResult.Ok).invoice

                if (bytes != null && ext != null) {
                    try {
                        val stored = InvoiceFiles.save(inv.id, ext, bytes)
                        inv = InvoiceService.attachFile(inv.id, stored, call.fileUrl(inv.id))!!
                    } catch (e: IOException) {
                        InvoiceService.remove(inv.id)
                        return@post call.respondError(HttpStatusCode.InternalServerError, "Could not save the uploaded file")
                    }
                }

                AuditService.log(
                    module = AuditService.INVOICES,
                    role = AuditService.OPERATIONS_STAFF,
                    detail = if (read == null && parsed == null && input.amountRM.isNullOrBlank()) {
                        "Uploaded invoice file ${input.fileName ?: "(unnamed)"} as ${inv.invNo}; details to be filled in during review."
                    } else {
                        "Scanned invoice ${inv.invNo} from ${inv.party} (${rm(inv.amountRM)}), categorised as ${inv.aiCategory}" +
                            if (inv.fileUrl != null) ", file attached." else "."
                    }
                )
                AuditService.log(
                    module = AuditService.INVOICES,
                    role = AuditService.OPERATIONS_STAFF,
                    detail = when (ai) {
                        is InvoiceAi.Outcome.Read ->
                            "AI categorised ${inv.invNo} as ${inv.aiCategory} at ${inv.aiConfidence}% (${ai.extraction.model})." +
                                if (ai.extraction.missingFields.isNotEmpty()) " Missing: ${ai.extraction.missingFields.joinToString(", ")}." else ""
                        is InvoiceAi.Outcome.Unavailable ->
                            "AI not used for ${inv.invNo} (${ai.reason}); " +
                                if (parsed != null) "keyword rules categorised it as ${inv.aiCategory} at ${inv.aiConfidence}%." else "left for manual review."
                    }
                )
                call.respond(HttpStatusCode.Created, inv)
            }

            // PATCH http://localhost:8989/api/invoices/{id}
            patch("/{id}") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<UpdateInvoiceRequest>()
                    ?: return@patch call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                when {
                    req.party != null && req.party.isBlank() ->
                        return@patch call.respondError(HttpStatusCode.BadRequest, "party must not be empty")
                    req.amountRM != null && req.amountRM < 0 ->
                        return@patch call.respondError(HttpStatusCode.BadRequest, "amountRM must be >= 0")
                    req.aiCategory != null && req.aiCategory.isBlank() ->
                        return@patch call.respondError(HttpStatusCode.BadRequest, "aiCategory must not be empty")
                    req.type != null && req.type !in InvoiceService.TYPES ->
                        return@patch call.respondError(HttpStatusCode.BadRequest, "type must be one of ${InvoiceService.TYPES}")
                }
                val dueDate = req.dueDate?.let {
                    InvoiceService.parseDate(it) ?: return@patch call.respondError(HttpStatusCode.BadRequest, "dueDate must look like $DATE_HINT")
                }

                val result = InvoiceService.update(id, req, dueDate)
                if (result is InvoiceResult.Ok) {
                    AuditService.log(
                        module = AuditService.INVOICES,
                        role = AuditService.OPERATIONS_STAFF,
                        detail = "Edited ${kind(result.invoice)} ${result.invoice.invNo} during review: ${changedFields(req)}."
                    )
                }
                call.respondResult(result)
            }

            // PATCH http://localhost:8989/api/invoices/{id}/verify
            patch("/{id}/verify") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<VerifyInvoiceRequest>()
                    ?: return@patch call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                if (req.role !in setOf(AuditService.SME_OWNER, AuditService.MANAGER)) {
                    return@patch call.respondError(HttpStatusCode.Forbidden, "Only SME_OWNER can verify invoices")
                }

                val result = InvoiceService.verify(id)
                if (result is InvoiceResult.Ok) {
                    val inv = result.invoice
                    AuditService.log(
                        module = AuditService.INVOICES,
                        role = req.role,
                        detail = "Verified ${kind(inv)} ${inv.invNo} from ${inv.party} (${rm(inv.amountRM)})."
                    )
                }
                call.respondResult(result)
            }

            // PATCH http://localhost:8989/api/invoices/{id}/paid  ({ "paid": false } undoes)
            patch("/{id}/paid") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<MarkInvoicePaidRequest>()
                    ?: return@patch call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

                val result = InvoiceService.setPaid(id, req.paid)
                if (result is InvoiceResult.Ok) {
                    val inv = result.invoice
                    AuditService.log(
                        module = AuditService.INVOICES,
                        role = AuditService.OPERATIONS_STAFF,
                        detail = if (req.paid) {
                            "Marked ${kind(inv)} ${inv.invNo} (${inv.party}, ${rm(inv.amountRM)}) as paid."
                        } else {
                            "Undid payment of ${kind(inv)} ${inv.invNo} (${inv.party}, ${rm(inv.amountRM)}); now unpaid."
                        }
                    )
                }
                call.respondResult(result)
            }
        }
    }
}
