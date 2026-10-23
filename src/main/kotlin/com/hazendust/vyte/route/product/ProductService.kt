package com.hazendust.vyte.route.product

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.ProductEntity
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.invoice.InvoiceItem
import com.hazendust.vyte.route.invoice.InvoiceService
import io.ktor.http.*
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random

sealed interface ProductResult {
    data class Ok(val product: Product, val invoice: InvoiceItem? = null) : ProductResult
    data class Fail(val status: HttpStatusCode, val error: String) : ProductResult
}

/**
 * Public entry point of the Products module.
 * Every stock change goes through changeStock(), which locks the product, rejects negative stock,
 * writes a movement, re-checks the restock trigger, saves to SQLite and writes an audit entry.
 *
 * For other modules: checkStock(productId, qty) and deductStock(productId, qty, reason, userID).
 */
object ProductService {
    val INDUSTRIES = setOf("FNB_PERISHABLE", "RETAIL_VARIANT", "B2B_RAW_MATERIAL")
    val MOVEMENT_TYPES = setOf("SALE", "DELIVERY", "ADJUSTMENT", "DAMAGE", "OPENING", "RETURN")

    private const val SALES_WINDOW_DAYS = 30L
    private val MALAYSIA: ZoneId = ZoneId.of("Asia/Kuala_Lumpur")
    private val TRIGGERABLE = setOf("HEALTHY", "CONFIRMED")

    private val extras get() = WorkspaceContext.current().productExtras
    private val archivedEntities get() = WorkspaceContext.current().archivedProducts
    private val movements get() = WorkspaceContext.current().movements
    private val lastKnownStock get() = WorkspaceContext.current().lastKnownStock
    private val locks get() = WorkspaceContext.current().locks
    private val movementSeq = AtomicLong()

    @Volatile
    private var initialized = false

    init {
        init()
    }

    /**
     * Loads saved products and movements from SQLite, then saves any product that only exists in DataStore's seed.
     */
    @Synchronized
    fun init() {
        if (initialized) return
        initialized = true

        if (ProductRepository.init()) {
            ProductRepository.loadRecords().forEach { record ->
                val id = record.entity.id
                extras[id] = record.extras
                lastKnownStock[id] = record.entity.stock
                if (record.extras.archived) {
                    DataStore.products.remove(id)
                    archivedEntities[id] = record.entity
                } else {
                    DataStore.products[id] = record.entity
                }
            }
            ProductRepository.loadMovements().forEach { movementsOf(it.productId).add(it) }
        }

        seedIfEmpty()
        DataStore.products.values
            .filter { !lastKnownStock.containsKey(it.id) }
            .forEach { synchronized(lockFor(it.id)) { bootstrap(it) } }

        println(
            "[Products] Loaded ${DataStore.products.size} active / ${archivedEntities.size} archived products, " +
                "${movements.values.sumOf { it.size }} stock movements (persistent: ${ProductRepository.enabled})"
        )
    }

    // ============================== Reads ==============================

    fun list(industry: String?, search: String?, includeArchived: Boolean = false): List<Product> {
        val keyword = search?.trim().orEmpty()
        val ids =
            DataStore.products.keys.toList() + if (includeArchived) archivedEntities.keys.toList() else emptyList()
        return ids.sorted()
            .mapNotNull { find(it) }
            .filter { industry == null || industry == "ALL" || it.industry == industry }
            .filter {
                keyword.isEmpty() ||
                        it.name.contains(keyword, ignoreCase = true) ||
                        it.sku.contains(keyword, ignoreCase = true)
            }
    }

    fun find(id: String): Product? = synchronized(lockFor(id)) {
        syncExternalChange(id)
        entityOf(id)?.let { toProduct(it) }
    }

    fun isArchived(id: String): Boolean = extras[id]?.archived == true

    /** Newest first, or null if the product does not exist. */
    fun movements(id: String, limit: Int): List<StockMovement>? {
        find(id) ?: return null
        return movementsOf(id).reversed().take(limit)
    }

    fun summary(): InventorySummary {
        val products = list(null, null)
        val today = LocalDate.now(MALAYSIA)
        return InventorySummary(
            totalSkus = products.size,
            stockValueRM = round2(products.sumOf { it.stock * (it.unitCostRM ?: 0.0) }),
            lowStockCount = products.count { it.stock <= it.minThreshold },
            pendingRestockCount = products.count { it.restockStatus == "TRIGGERED_PENDING_APPROVAL" },
            supplierContactedCount = products.count { it.restockStatus == "SUPPLIER_CONTACTED" },
            expiringIn7Days = products.count { p ->
                val expiry = p.expiryDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                p.stock > 0 && expiry != null && ChronoUnit.DAYS.between(today, expiry) in 0..7
            }
        )
    }

    // ============================== For other modules ==============================

    /** True if the product exists, is not archived and has at least qty in stock. */
    fun checkStock(productId: String, qty: Int): Boolean {
        return !(qty <= 0 || isArchived(productId)) && (find(productId)?.stock ?: return false) >= qty
    }

    /** Records a SALE of qty units. Returns false (and changes nothing) if the product is missing or stock is insufficient. */
    fun deductStock(productId: String, qty: Int, reason: String, userID: String): Boolean =
        qty > 0 && changeStock(productId, "SALE", -qty, reason, userID) is ProductResult.Ok

    // ============================== Stock changes ==============================

    /**
     * The single entry point for stock changes. Rejects with 409 "insufficient stock" instead of going below 0.
     */
    fun changeStock(
        productId: String,
        type: String,
        change: Int,
        reason: String,
        userID: String,
        role: String = AuditService.OPERATIONS_STAFF
    ): ProductResult = synchronized(lockFor(productId)) {
        if (type !in MOVEMENT_TYPES) {
            return ProductResult.Fail(HttpStatusCode.BadRequest, "type must be one of $MOVEMENT_TYPES")
        }
        syncExternalChange(productId)
        failIfInactive(productId)?.let { return it }
        val entity = DataStore.products.getValue(productId)
        if (entity.stock + change < 0) {
            return ProductResult.Fail(HttpStatusCode.Conflict, "insufficient stock")
        }
        applyStockChange(entity, type, change, reason, userID, role)
    }

    /**
     * Daily job: re-checks the restock trigger (min threshold or stockout within lead time) on every active product.
     * Returns the products that were newly set to TRIGGERED_PENDING_APPROVAL.
     */
    fun recheckAllTriggers(): List<Product> {
        val triggered = mutableListOf<Product>()
        for (id in DataStore.products.keys.sorted()) {
            synchronized(lockFor(id)) {
                syncExternalChange(id)
                val entity = DataStore.products[id] ?: return@synchronized
                val ext = extrasFor(entity)
                val newExt = recheckTrigger(entity, ext)
                if (newExt == ext || saveOrFail(ProductRecord(entity, newExt)) != null) return@synchronized
                extras[id] = newExt
                triggered += toProduct(entity)
                AuditService.log(
                    module = AuditService.PRODUCTS,
                    role = AuditService.OPERATIONS_STAFF,
                    detail = "Daily restock check: ${entity.name} (${ext.restockStatus}) - ${
                        triggerNote(
                            entity,
                            newExt
                        )
                    }"
                )
            }
        }
        return triggered
    }

    /** Sets stock to the counted quantity with an ADJUSTMENT movement for the difference. */
    fun adjust(productId: String, countedQty: Int, reason: String, userID: String, role: String): ProductResult =
        synchronized(lockFor(productId)) {
            syncExternalChange(productId)
            failIfInactive(productId)?.let { return it }
            val entity = DataStore.products.getValue(productId)
            applyStockChange(entity, "ADJUSTMENT", countedQty - entity.stock, "Stock count: $reason", userID, role)
        }

    // ============================== Product lifecycle ==============================

    @Synchronized
    fun create(form: NewProductForm): ProductResult {
        val industry = form.industry!!
        val stock = form.stock!!
        val minThreshold = form.minThreshold!!
        val priceRM = form.priceRM!!

        val sku = form.sku?.trim().orEmpty().ifEmpty { generateSku(industry) }
        if (skuTaken(sku, exceptId = null)) {
            return ProductResult.Fail(HttpStatusCode.Conflict, "SKU $sku already exists")
        }

        val attr = parseExtraAttr(industry, form.extraAttr.orEmpty())
        attr.error?.let { return ProductResult.Fail(HttpStatusCode.BadRequest, it) }

        val id = newId()
        val entity = ProductEntity(
            id = id,
            sku = sku,
            name = form.name!!.trim(),
            category = form.category!!.trim(),
            stock = stock,
            safeThreshold = minThreshold,
            costPrice = form.unitCostRM ?: round2(priceRM * 0.6),
            sellingPrice = priceRM,
            expiryDate = attr.expiryDate.orEmpty()
        )
        val ext = ProductExtras(
            industry = industry,
            uom = form.uom!!.trim(),
            reorderQty = form.reorderQty!!,
            leadTimeDays = attr.leadTimeDays,
            moq = attr.moq,
            supplierName = form.supplierName.orEmpty(),
            supplierContact = form.supplierContact.orEmpty(),
            batchNo = attr.batchNo,
            variantSpec = attr.variantSpec,
            restockStatus = if (stock <= minThreshold) "TRIGGERED_PENDING_APPROVAL" else "HEALTHY"
        )
        val opening = newMovement(id, "OPENING", stock, stock, "Opening stock", "system")

        synchronized(lockFor(id)) {
            saveOrFail(ProductRecord(entity, ext), opening)?.let { return it }
            DataStore.products[id] = entity
            extras[id] = ext
            movementsOf(id).add(opening)
            lastKnownStock[id] = stock
            return ProductResult.Ok(toProduct(entity))
        }
    }

    @Synchronized
    fun update(id: String, req: UpdateProductRequest): ProductResult = synchronized(lockFor(id)) {
        syncExternalChange(id)
        failIfInactive(id)?.let { return it }
        val entity = DataStore.products.getValue(id)
        val ext = extrasFor(entity)

        val newSku = req.sku?.trim()
        if (newSku != null && skuTaken(newSku, exceptId = id)) {
            return ProductResult.Fail(HttpStatusCode.Conflict, "SKU $newSku already exists")
        }

        val newEntity = entity.copy(
            sku = newSku ?: entity.sku,
            name = req.name?.trim() ?: entity.name,
            category = req.category?.trim() ?: entity.category,
            sellingPrice = req.priceRM ?: entity.sellingPrice,
            safeThreshold = req.minThreshold ?: entity.safeThreshold,
            costPrice = req.unitCostRM ?: entity.costPrice
        )
        val newExt = recheckTrigger(
            newEntity,
            ext.copy(
                reorderQty = req.reorderQty ?: ext.reorderQty,
                supplierName = req.supplierName ?: ext.supplierName,
                supplierContact = req.supplierContact ?: ext.supplierContact,
                visibility = req.visibility ?: ext.visibility,
                leadTimeDays = req.leadTimeDays ?: ext.leadTimeDays,
                moq = req.moq ?: ext.moq
            )
        )

        saveOrFail(ProductRecord(newEntity, newExt))?.let { return it }
        DataStore.products[id] = newEntity
        extras[id] = newExt
        ProductResult.Ok(toProduct(newEntity))
    }

    /** Soft delete: hidden from lists and from the Order module, history is kept. */
    @Synchronized
    fun archive(id: String): ProductResult = synchronized(lockFor(id)) {
        syncExternalChange(id)
        failIfInactive(id)?.let { return it }
        val entity = DataStore.products.getValue(id)
        val newExt = extrasFor(entity).copy(archived = true)

        saveOrFail(ProductRecord(entity, newExt))?.let { return it }
        extras[id] = newExt
        archivedEntities[id] = entity
        DataStore.products.remove(id)
        ProductResult.Ok(toProduct(entity))
    }

    fun approveRestock(id: String): ProductResult = synchronized(lockFor(id)) {
        syncExternalChange(id)
        failIfInactive(id)?.let { return it }
        val entity = DataStore.products.getValue(id)
        val ext = extrasFor(entity)
        if (ext.restockStatus != "TRIGGERED_PENDING_APPROVAL") {
            return ProductResult.Fail(
                HttpStatusCode.Conflict,
                "Restock can only be approved when status is TRIGGERED_PENDING_APPROVAL (current: ${ext.restockStatus})"
            )
        }
        val newExt = ext.copy(restockStatus = "SUPPLIER_CONTACTED")
        saveOrFail(ProductRecord(entity, newExt))?.let { return it }
        extras[id] = newExt
        ProductResult.Ok(toProduct(entity))
    }

    fun confirmDelivery(id: String, receivedQty: Int?, userID: String): ProductResult = synchronized(lockFor(id)) {
        syncExternalChange(id)
        failIfInactive(id)?.let { return it }
        val entity = DataStore.products.getValue(id)
        val ext = extrasFor(entity)
        if (ext.restockStatus != "SUPPLIER_CONTACTED") {
            return ProductResult.Fail(
                HttpStatusCode.Conflict,
                "Delivery can only be confirmed when status is SUPPLIER_CONTACTED (current: ${ext.restockStatus})"
            )
        }

        val qty = receivedQty ?: ext.reorderQty
        val reason = "Restock delivery from ${ext.supplierName.ifBlank { "supplier" }}"
        val delivered = applyStockChange(entity, "DELIVERY", qty, reason, userID, AuditService.OPERATIONS_STAFF)
        if (delivered is ProductResult.Fail) return delivered

        val confirmedExt = extrasFor(entity).copy(restockStatus = "CONFIRMED")
        saveOrFail(ProductRecord(entity, confirmedExt))?.let { return it }
        extras[id] = confirmedExt

        val invoice = InvoiceService.createPayable(
            party = ext.supplierName.ifBlank { "Unknown supplier" },
            amountRM = qty * entity.costPrice,
            category = "Inventory Restock (${entity.category})",
            aiConfidence = 98,
            relatedRef = id
        )
        ProductResult.Ok(toProduct(entity), invoice)
    }

    // ============================== Internals ==============================

    /** null if the product exists and is not archived, otherwise a 404/409 Fail. */
    private fun failIfInactive(id: String): ProductResult.Fail? = when {
        DataStore.products.containsKey(id) -> null
        archivedEntities.containsKey(id) -> ProductResult.Fail(HttpStatusCode.Conflict, "Product $id is archived")
        else -> ProductResult.Fail(HttpStatusCode.NotFound, "Product $id not found")
    }

    /** Caller must hold lockFor(entity.id) and have checked that the result is not negative. */
    private fun applyStockChange(
        entity: ProductEntity,
        type: String,
        change: Int,
        reason: String,
        userID: String,
        role: String
    ): ProductResult {
        val ext = extrasFor(entity)
        val newStock = entity.stock + change
        val movement = newMovement(entity.id, type, change, newStock, reason, userID)
        val updated = entity.copy(stock = newStock)
        val newExt = recheckTrigger(updated, ext, pending = movement)

        saveOrFail(ProductRecord(updated, newExt), movement)?.let { return it }
        entity.stock = newStock
        extras[entity.id] = newExt
        movementsOf(entity.id).add(movement)
        lastKnownStock[entity.id] = newStock

        val triggered = ext.restockStatus != newExt.restockStatus
        AuditService.log(
            module = AuditService.PRODUCTS,
            role = role,
            detail = describeMovement(entity, newExt, movement) + if (triggered) " " + triggerNote(
                entity,
                newExt
            ) else ""
        )
        return ProductResult.Ok(toProduct(entity))
    }

    /**
     * The Order module changes DataStore stock directly. Record that difference as a movement so history,
     * depletion rate and the saved stock stay correct. Caller must hold lockFor(id).
     */
    private fun syncExternalChange(id: String) {
        val entity = DataStore.products[id] ?: return
        val known = lastKnownStock[id] ?: return bootstrap(entity)
        if (entity.stock == known) return

        val diff = entity.stock - known
        entity.stock = known
        val result = applyStockChange(
            entity,
            if (diff < 0) "SALE" else "ADJUSTMENT",
            diff,
            "Stock changed outside the Products module (e.g. order approval)",
            "system",
            AuditService.OPERATIONS_STAFF
        )
        // If saving failed, keep the other module's value in memory and retry on the next call
        if (result is ProductResult.Fail) entity.stock = known + diff
    }

    /** Saves a product that exists in DataStore but was never saved by this module (e.g. DataStore's own seed). */
    private fun bootstrap(entity: ProductEntity) {
        val ext = extrasFor(entity)
        val opening =
            newMovement(entity.id, "OPENING", entity.stock, entity.stock, "Opening stock (imported)", "system")
        if (saveOrFail(ProductRecord(entity, ext), opening) != null) return
        movementsOf(entity.id).add(opening)
        lastKnownStock[entity.id] = entity.stock
    }

    private fun saveOrFail(record: ProductRecord, movement: StockMovement? = null): ProductResult.Fail? = try {
        ProductRepository.save(record, movement)
        null
    } catch (e: Exception) {
        println("[Products] Failed to save ${record.entity.id}: ${e.message}")
        ProductResult.Fail(HttpStatusCode.InternalServerError, "Could not save product ${record.entity.id}")
    }

    private data class SalesStats(
        val dailyDepletionRate: Double,
        val daysUntilStockout: Double?,
        val performance: String
    )

    /** From SALE movements of the last 30 days; pending is a movement not yet added to the history. */
    private fun salesStats(id: String, stock: Int, pending: StockMovement? = null): SalesStats {
        val since = OffsetDateTime.now(MALAYSIA).minusDays(SALES_WINDOW_DAYS)
        val unitsSold = (movementsOf(id) + listOfNotNull(pending))
            .filter { it.type == "SALE" }
            .filter { runCatching { OffsetDateTime.parse(it.timestamp).isAfter(since) }.getOrDefault(false) }
            .sumOf { -it.change }
        val rate = round1(unitsSold / SALES_WINDOW_DAYS.toDouble())
        return SalesStats(
            dailyDepletionRate = rate,
            daysUntilStockout = if (rate > 0) round1(stock / rate) else null,
            performance = when {
                rate >= 5 -> "Excellent"
                rate >= 1 -> "Good"
                else -> "Low"
            }
        )
    }

    /** HEALTHY/CONFIRMED -> TRIGGERED_PENDING_APPROVAL when at/below min, or when stock runs out within the lead time. */
    private fun recheckTrigger(
        entity: ProductEntity,
        ext: ProductExtras,
        pending: StockMovement? = null
    ): ProductExtras {
        if (ext.restockStatus !in TRIGGERABLE) return ext
        val stockout = salesStats(entity.id, entity.stock, pending).daysUntilStockout
        val belowMin = entity.stock <= entity.safeThreshold
        val runsOutInLeadTime = stockout != null && ext.leadTimeDays != null && stockout <= ext.leadTimeDays
        return if (belowMin || runsOutInLeadTime) ext.copy(restockStatus = "TRIGGERED_PENDING_APPROVAL") else ext
    }

    /** Call after the movement has been added to the history. */
    private fun triggerNote(entity: ProductEntity, ext: ProductExtras): String =
        if (entity.stock <= entity.safeThreshold) {
            "Auto-restock triggered (at or below min ${entity.safeThreshold})."
        } else {
            val stockout = salesStats(entity.id, entity.stock).daysUntilStockout
            "Auto-restock triggered (~$stockout days of stock left, supplier lead time ${ext.leadTimeDays} days)."
        }

    private fun describeMovement(entity: ProductEntity, ext: ProductExtras, m: StockMovement): String {
        val uom = ext.uom
        val qty = kotlin.math.abs(m.change)
        val what = when (m.type) {
            "SALE" -> "Sold $qty $uom ${entity.name}"
            "DELIVERY" -> "Received delivery of +$qty $uom ${entity.name}"
            "DAMAGE" -> "Wrote off $qty $uom ${entity.name} as damaged/expired"
            "RETURN" -> "Customer return of +$qty $uom ${entity.name}"
            "OPENING" -> "Recorded opening stock of $qty $uom ${entity.name}"
            else -> "Adjusted ${entity.name} stock by ${if (m.change >= 0) "+" else ""}${m.change} $uom"
        }
        val reason = m.reason.ifBlank { null }?.let { " ($it)" }.orEmpty()
        return "$what$reason. Stock now ${m.stockAfter} $uom."
    }

    private fun toProduct(entity: ProductEntity): Product {
        val ext = extrasFor(entity)
        val stats = salesStats(entity.id, entity.stock)
        return Product(
            id = entity.id,
            sku = entity.sku,
            name = entity.name,
            category = entity.category,
            industry = ext.industry,
            uom = ext.uom,
            stock = entity.stock,
            minThreshold = entity.safeThreshold,
            reorderQty = ext.reorderQty,
            priceRM = entity.sellingPrice,
            unitCostRM = entity.costPrice.takeIf { it > 0.0 },
            dailyDepletionRate = stats.dailyDepletionRate,
            daysUntilStockout = stats.daysUntilStockout,
            leadTimeDays = ext.leadTimeDays,
            moq = ext.moq,
            supplierName = ext.supplierName,
            supplierContact = ext.supplierContact,
            performance = stats.performance,
            visibility = ext.visibility,
            batchNo = ext.batchNo,
            expiryDate = entity.expiryDate.ifBlank { null },
            variantSpec = ext.variantSpec,
            restockStatus = ext.restockStatus
        )
    }

    /** Products created elsewhere (DataStore seed, other modules) get default extras. */
    private fun extrasFor(entity: ProductEntity): ProductExtras = extras.getOrPut(entity.id) {
        val supplier = DataStore.suppliers.firstOrNull()
        ProductExtras(
            industry = if (entity.category.equals("Dairy", ignoreCase = true)) "FNB_PERISHABLE" else "RETAIL_VARIANT",
            uom = "unit",
            reorderQty = entity.safeThreshold,
            leadTimeDays = supplier?.leadTimeDays,
            moq = supplier?.moq,
            supplierName = supplier?.name ?: "",
            supplierContact = supplier?.contactWa ?: "",
            restockStatus = if (entity.stock <= entity.safeThreshold) "TRIGGERED_PENDING_APPROVAL" else "HEALTHY"
        )
    }

    private fun entityOf(id: String): ProductEntity? = DataStore.products[id] ?: archivedEntities[id]

    private fun lockFor(id: String): Any = locks.computeIfAbsent(id) { Any() }

    private fun movementsOf(id: String): CopyOnWriteArrayList<StockMovement> =
        movements.computeIfAbsent(id) { CopyOnWriteArrayList() }

    private fun newMovement(
        productId: String,
        type: String,
        change: Int,
        stockAfter: Int,
        reason: String,
        userID: String
    ) =
        StockMovement(
            id = "MOV-${System.currentTimeMillis()}-${movementSeq.incrementAndGet()}",
            productId = productId,
            type = type,
            change = change,
            stockAfter = stockAfter,
            reason = reason,
            userID = userID.ifBlank { "unknown" },
            timestamp = OffsetDateTime.now(MALAYSIA).truncatedTo(ChronoUnit.SECONDS).toString()
        )

    private fun skuTaken(sku: String, exceptId: String?): Boolean =
        (DataStore.products.values + archivedEntities.values).any {
            it.id != exceptId && it.sku.equals(
                sku,
                ignoreCase = true
            )
        }

    private fun round1(value: Double) = Math.round(value * 10) / 10.0

    private fun round2(value: Double) = Math.round(value * 100) / 100.0

    private fun newId(): String {
        var id: String
        do {
            id = "P-${System.currentTimeMillis() % 100000}"
        } while (entityOf(id) != null)
        return id
    }

    private fun generateSku(industry: String): String {
        val prefix = when (industry) {
            "FNB_PERISHABLE" -> "FNB"
            "RETAIL_VARIANT" -> "RTL"
            else -> "B2B"
        }
        var sku: String
        do {
            sku = "$prefix-${Random.nextInt(1000, 10000)}"
        } while (skuTaken(sku, exceptId = null))
        return sku
    }

    private data class ExtraAttr(
        val batchNo: String? = null,
        val expiryDate: String? = null,
        val variantSpec: String? = null,
        val moq: Int? = null,
        val leadTimeDays: Int? = null,
        val error: String? = null
    )

    /**
     * FNB_PERISHABLE:   "Batch: B-2026-10 • Exp: 2026-11-15"
     * RETAIL_VARIANT:   free text, stored as variantSpec
     * B2B_RAW_MATERIAL: "MOQ: 20 Boxes • Lead Time: 3 Days"
     */
    private fun parseExtraAttr(industry: String, raw: String): ExtraAttr {
        val text = raw.trim()
        if (text.isEmpty()) return ExtraAttr()

        return when (industry) {
            "FNB_PERISHABLE" -> {
                val batchNo = Regex("""Batch:\s*(.+?)\s*(?:Exp:|$)""", RegexOption.IGNORE_CASE)
                    .find(text)?.groupValues?.get(1)
                    ?.substringBefore('\u2022')?.substringBefore('|')
                    ?.trim()?.trimEnd { !it.isLetterOrDigit() }?.ifEmpty { null }

                val exp = Regex("""Exp:\s*([^\u2022|\s]+)""", RegexOption.IGNORE_CASE)
                    .find(text)?.groupValues?.get(1)?.trim()

                if (exp != null) {
                    try {
                        LocalDate.parse(exp)
                    } catch (e: DateTimeParseException) {
                        return ExtraAttr(error = "Expiry date '$exp' must be in YYYY-MM-DD format")
                    }
                }
                ExtraAttr(batchNo = batchNo, expiryDate = exp)
            }

            "RETAIL_VARIANT" -> ExtraAttr(variantSpec = text)

            else -> ExtraAttr(
                moq = Regex("""MOQ:\s*(\d+)""", RegexOption.IGNORE_CASE)
                    .find(text)?.groupValues?.get(1)?.toIntOrNull(),
                leadTimeDays = Regex("""Lead\s*Time:\s*(\d+)""", RegexOption.IGNORE_CASE)
                    .find(text)?.groupValues?.get(1)?.toIntOrNull()
            )
        }
    }

    /**
     * Only runs when there are no products at all (DataStore seeds 4 today, so normally it does nothing).
     */
    private fun seedIfEmpty() {
        if (DataStore.products.isNotEmpty() || archivedEntities.isNotEmpty()) return
        val today = LocalDate.now(MALAYSIA)
        listOf(
            NewProductForm(
                "Dutch Lady Fresh Milk 1L",
                "FNB-1001",
                "Dairy",
                "FNB_PERISHABLE",
                "bottle",
                40,
                25,
                60,
                8.5,
                6.2,
                "Berjaya Wholesale Hub",
                "+60123456781",
                "Batch: B-${today.year}-${today.monthValue} • Exp: ${today.plusDays(12)}"
            ),
            NewProductForm(
                "Gardenia Original Classic Bread",
                "FNB-1002",
                "Bakery",
                "FNB_PERISHABLE",
                "loaf",
                12,
                15,
                30,
                4.2,
                2.9,
                "Ah Hock Grocers Dist",
                "+60123456782",
                "Batch: B-${today.year}-${today.monthValue} • Exp: ${today.plusDays(4)}"
            ),
            NewProductForm(
                "Cotton Polo Tee", "RTL-2001", "Apparel", "RETAIL_VARIANT", "pcs", 35, 10, 20, 39.9, 18.0,
                "Klang Valley Logistics Hub", "+60123456783", "Size M • Navy"
            ),
            NewProductForm(
                "Food-Grade Packaging Box 12x12",
                "B2B-3001",
                "Packaging",
                "B2B_RAW_MATERIAL",
                "box",
                18,
                20,
                100,
                1.2,
                0.7,
                "Klang Valley Logistics Hub",
                "+60123456783",
                "MOQ: 20 Boxes • Lead Time: 3 Days"
            )
        ).forEach { create(it) }
    }
}
