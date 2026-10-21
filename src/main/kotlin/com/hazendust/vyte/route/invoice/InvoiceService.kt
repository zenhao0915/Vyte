package com.hazendust.vyte.route.invoice

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.InvoiceEntity
import io.ktor.http.HttpStatusCode
import java.io.File
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.Locale
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

sealed interface InvoiceResult {
    data class Ok(val invoice: InvoiceItem) : InvoiceResult
    data class Fail(val status: HttpStatusCode, val error: String) : InvoiceResult
}

/**
 * Public entry point for other modules: InvoiceService.createPayable(...) / createReceivable(...).
 */
object InvoiceService {
    const val PAYABLE = "SUPPLIER_PAYABLE"
    const val RECEIVABLE = "CUSTOMER_RECEIVABLE"
    val TYPES = setOf(PAYABLE, RECEIVABLE)
    val STATUSES = setOf("NEEDS_REVIEW", "VERIFIED")
    private const val DEFAULT_DUE_DAYS = 30L

    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")
    private val DISPLAY_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH)

    private val extras = ConcurrentHashMap<String, InvoiceExtras>()

    /** Creates a SUPPLIER_PAYABLE invoice (status NEEDS_REVIEW, unpaid, due in 30 days). sourceRef = relatedRef. */
    fun createPayable(
        party: String,
        amountRM: Double,
        category: String,
        aiConfidence: Int = 100,
        relatedRef: String = ""
    ): InvoiceItem = create(PAYABLE, party, amountRM, category, aiConfidence, relatedRef, today(), null, null, null)

    /** Creates a CUSTOMER_RECEIVABLE invoice (status NEEDS_REVIEW, unpaid, due in 30 days). sourceRef = relatedRef. */
    fun createReceivable(
        party: String,
        amountRM: Double,
        category: String = "Product Sales",
        aiConfidence: Int = 100,
        relatedRef: String = ""
    ): InvoiceItem = create(RECEIVABLE, party, amountRM, category, aiConfidence, relatedRef, today(), null, null, null)

    fun today(): LocalDate = LocalDate.now(MALAYSIA)

    /** Accepts "21 Oct 2026" or "2026-10-21". */
    fun parseDate(text: String): LocalDate? {
        val value = text.trim()
        return try {
            LocalDate.parse(value)
        } catch (e: DateTimeParseException) {
            try {
                LocalDate.parse(value, DISPLAY_DATE)
            } catch (e: DateTimeParseException) {
                null
            }
        }
    }

    // ============================== Reads ==============================

    /** Newest first. Order invoices rejected in the Order module are void and never listed. */
    fun list(filter: InvoiceFilter = InvoiceFilter()): List<InvoiceItem> {
        val party = filter.party?.trim().orEmpty()
        return DataStore.invoices
            .filter { it.status != "REJECTED" }
            .map { it to toItem(it) }
            .filter { (_, inv) -> filter.type == null || filter.type == "ALL" || inv.type == filter.type }
            .filter { (_, inv) -> filter.status == null || filter.status == "ALL" || inv.status == filter.status }
            .filter { (_, inv) -> filter.overdue == null || inv.overdue == filter.overdue }
            .filter { (_, inv) -> party.isEmpty() || inv.party.contains(party, ignoreCase = true) }
            .filter { (entity, _) ->
                val date = issueDate(entity)
                (filter.from == null || (date != null && !date.isBefore(filter.from))) &&
                    (filter.to == null || (date != null && !date.isAfter(filter.to)))
            }
            .sortedByDescending { (entity, _) -> issueDate(entity) ?: LocalDate.MIN } // stable: same-day keeps newest-first
            .map { it.second }
    }

    fun find(id: String): InvoiceItem? = entityOf(id)?.let { toItem(it) }

    fun summary(): InvoiceSummary {
        val all = list()
        val unpaid = all.filter { !it.paid }
        val overdue = all.filter { it.overdue }
        val month = today().withDayOfMonth(1)
        val paidThisMonth = DataStore.invoices
            .filter { it.status != "REJECTED" }
            .filter { extrasFor(it).paidOn?.let { d -> LocalDate.parse(d).withDayOfMonth(1) == month } == true }
        return InvoiceSummary(
            toReceiveRM = round2(unpaid.filter { it.type == RECEIVABLE }.sumOf { it.amountRM }),
            toPayRM = round2(unpaid.filter { it.type == PAYABLE }.sumOf { it.amountRM }),
            overdueCount = overdue.size,
            overdueRM = round2(overdue.sumOf { it.amountRM }),
            needsReviewCount = all.count { it.status == "NEEDS_REVIEW" },
            paidThisMonthRM = round2(paidThisMonth.sumOf { it.amount })
        )
    }

    /** The uploaded file of an invoice, or null if it has none (or it is missing on disk). */
    fun fileOf(id: String): File? = entityOf(id)?.let { extrasFor(it).fileName }?.let { InvoiceFiles.find(it) }

    // ============================== Writes ==============================

    @Synchronized
    fun createFromRequest(req: CreateInvoiceRequest, date: LocalDate, dueDate: LocalDate?): InvoiceResult {
        val invNo = req.invNo?.trim()?.ifEmpty { null }
        val party = req.party!!.trim()
        if (invNo != null && isDuplicate(invNo, party, exceptId = null)) {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice $invNo from $party already exists")
        }
        val category = req.aiCategory?.trim()?.ifEmpty { null }
        return InvoiceResult.Ok(
            create(
                type = req.type!!,
                party = party,
                amountRM = req.amountRM!!,
                category = category ?: "Uncategorised",
                aiConfidence = if (category != null) 100 else 0,
                relatedRef = req.sourceRef?.trim().orEmpty(),
                date = date,
                invNo = invNo,
                dueDate = dueDate,
                notes = req.notes?.trim()?.ifEmpty { null }
            )
        )
    }

    /** For uploads: same as create, but rejects an invNo + party that already exists. */
    @Synchronized
    fun createFromUpload(
        type: String,
        party: String,
        amountRM: Double,
        category: String,
        aiConfidence: Int,
        invNo: String?,
        date: LocalDate = today(),
        dueDate: LocalDate? = null,
        notes: String? = null
    ): InvoiceResult {
        if (invNo != null && isDuplicate(invNo, party, exceptId = null)) {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice $invNo from $party already exists")
        }
        return InvoiceResult.Ok(create(type, party, amountRM, category, aiConfidence, "", date, invNo, dueDate, notes))
    }

    @Synchronized
    fun attachFile(id: String, fileName: String, fileUrl: String): InvoiceItem? {
        val entity = entityOf(id) ?: return null
        extras[id] = extrasFor(entity).copy(fileName = fileName, fileUrl = fileUrl)
        return toItem(entity)
    }

    /** Rolls back an invoice whose upload could not be completed. */
    @Synchronized
    fun remove(id: String) {
        DataStore.invoices.removeIf { it.id == id }
        extras.remove(id)
    }

    @Synchronized
    fun update(id: String, req: UpdateInvoiceRequest, dueDate: LocalDate?): InvoiceResult {
        val entity = entityOf(id) ?: return InvoiceResult.Fail(HttpStatusCode.NotFound, "Invoice $id not found")
        val ext = extrasFor(entity)
        if (ext.status != "NEEDS_REVIEW") {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice $id is ${ext.status} and can no longer be edited")
        }

        val newParty = req.party?.trim() ?: ext.party
        if (isDuplicate(ext.invNo, newParty, exceptId = id)) {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice ${ext.invNo} from $newParty already exists")
        }

        val newCategory = req.aiCategory?.trim()
        val updated = entity.copy(
            type = when (req.type) {
                null -> entity.type
                PAYABLE -> "SUPPLIER"
                else -> "CUSTOMER"
            },
            amount = req.amountRM?.let { round2(it) } ?: entity.amount,
            category = newCategory ?: entity.category
        )
        // InvoiceEntity fields are read-only, so the entity is replaced in place (same position, same id)
        val index = DataStore.invoices.indexOfFirst { it.id == id }
        DataStore.invoices[index] = updated
        extras[id] = ext.copy(
            party = newParty,
            aiConfidence = if (newCategory != null) 100 else ext.aiConfidence, // a human-set category is certain
            dueDate = dueDate?.toString() ?: ext.dueDate,
            notes = if (req.notes != null) req.notes.trim().ifEmpty { null } else ext.notes
        )
        return InvoiceResult.Ok(toItem(updated))
    }

    @Synchronized
    fun verify(id: String): InvoiceResult {
        val entity = entityOf(id) ?: return InvoiceResult.Fail(HttpStatusCode.NotFound, "Invoice $id not found")
        val ext = extrasFor(entity)
        if (ext.status == "VERIFIED") {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice $id is already VERIFIED")
        }
        extras[id] = ext.copy(status = "VERIFIED")
        // Only mirror into InvoiceEntity.status for invoices this module owns; Order module invoices keep their own status
        if (ext.createdByInvoiceModule) entity.status = "VERIFIED"
        return InvoiceResult.Ok(toItem(entity))
    }

    /** paid = false undoes a payment. */
    @Synchronized
    fun setPaid(id: String, paid: Boolean): InvoiceResult {
        val entity = entityOf(id) ?: return InvoiceResult.Fail(HttpStatusCode.NotFound, "Invoice $id not found")
        val ext = extrasFor(entity)
        if (ext.paid == paid) {
            return InvoiceResult.Fail(HttpStatusCode.Conflict, "Invoice $id is already ${if (paid) "paid" else "unpaid"}")
        }
        extras[id] = ext.copy(paid = paid, paidOn = if (paid) today().toString() else null)
        return InvoiceResult.Ok(toItem(entity))
    }

    // ============================== Internals ==============================

    @Synchronized
    private fun create(
        type: String,
        party: String,
        amountRM: Double,
        category: String,
        aiConfidence: Int,
        relatedRef: String,
        date: LocalDate,
        invNo: String?,
        dueDate: LocalDate?,
        notes: String?
    ): InvoiceItem {
        val id = newId()
        DataStore.invoices.add(
            0,
            InvoiceEntity(
                id = id,
                type = if (type == PAYABLE) "SUPPLIER" else "CUSTOMER",
                relatedRef = relatedRef,
                amount = round2(amountRM),
                category = category,
                status = "NEEDS_REVIEW",
                createdAt = date.toString()
            )
        )
        extras[id] = InvoiceExtras(
            invNo = invNo ?: generateInvNo(type, date),
            party = party.ifBlank { "Unknown" },
            aiConfidence = aiConfidence.coerceIn(0, 100),
            dueDate = (dueDate ?: date.plusDays(DEFAULT_DUE_DAYS)).toString(),
            notes = notes,
            createdByInvoiceModule = true
        )
        return find(id)!!
    }

    /** Same invoice number from the same party (both case-insensitive). */
    private fun isDuplicate(invNo: String, party: String, exceptId: String?): Boolean =
        DataStore.invoices.any {
            it.id != exceptId && it.status != "REJECTED" &&
                extrasFor(it).invNo.equals(invNo.trim(), ignoreCase = true) &&
                extrasFor(it).party.trim().equals(party.trim(), ignoreCase = true)
        }

    private fun entityOf(id: String): InvoiceEntity? = DataStore.invoices.firstOrNull { it.id == id }

    private fun issueDate(entity: InvoiceEntity): LocalDate? = parseDate(entity.createdAt)

    private fun round2(value: Double) = Math.round(value * 100) / 100.0

    private fun newId(): String {
        var id: String
        do {
            id = "INV-${System.currentTimeMillis() % 100000}"
        } while (DataStore.invoices.any { it.id == id })
        return id
    }

    private fun generateInvNo(type: String, date: LocalDate): String {
        val prefix = if (type == PAYABLE) "SUP" else "CUST"
        var invNo: String
        do {
            invNo = "$prefix-${date.year}-${Random.nextInt(1000, 10000)}"
        } while (DataStore.invoices.any { extrasFor(it).invNo.equals(invNo, ignoreCase = true) })
        return invNo
    }

    /**
     * Invoices created elsewhere (e.g. the Order module) get default extras on first read.
     */
    private fun extrasFor(entity: InvoiceEntity): InvoiceExtras = extras.getOrPut(entity.id) {
        InvoiceExtras(
            invNo = entity.id,
            party = if (entity.relatedRef.isNotBlank()) "Customer order ${entity.relatedRef}" else "Unknown",
            aiConfidence = 100,
            dueDate = ((issueDate(entity) ?: today()).plusDays(DEFAULT_DUE_DAYS)).toString()
        )
    }

    private fun toItem(entity: InvoiceEntity): InvoiceItem {
        val ext = extrasFor(entity)
        val due = LocalDate.parse(ext.dueDate)
        return InvoiceItem(
            id = entity.id,
            invNo = ext.invNo,
            type = if (entity.type == "SUPPLIER") PAYABLE else RECEIVABLE,
            party = ext.party,
            date = issueDate(entity)?.format(DISPLAY_DATE) ?: entity.createdAt,
            amountRM = entity.amount,
            aiCategory = entity.category,
            aiConfidence = ext.aiConfidence,
            paid = ext.paid,
            status = ext.status,
            dueDate = due.format(DISPLAY_DATE),
            overdue = !ext.paid && due.isBefore(today()),
            sourceRef = entity.relatedRef,
            fileUrl = ext.fileUrl,
            notes = ext.notes
        )
    }
}
