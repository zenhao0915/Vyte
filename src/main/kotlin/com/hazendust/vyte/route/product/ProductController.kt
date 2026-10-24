package com.hazendust.vyte.route.product

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

object ProductController : BaseRouteController {
    private const val DEFAULT_MOVEMENT_LIMIT = 50
    private const val MAX_MOVEMENT_LIMIT = 500

    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    private suspend fun ApplicationCall.respondResult(
        result: ProductResult,
        okStatus: HttpStatusCode = HttpStatusCode.OK
    ) = when (result) {
        is ProductResult.Ok -> respond(okStatus, result.product)
        is ProductResult.Fail -> respondError(result.status, result.error)
    }

    private fun rm(amount: Double) = "RM ${"%.2f".format(amount)}"

    private fun validate(form: NewProductForm): String? = when {
        form.name.isNullOrBlank() -> "name is required"
        form.category.isNullOrBlank() -> "category is required"
        form.industry.isNullOrBlank() -> "industry is required"
        form.industry !in ProductService.INDUSTRIES -> "industry must be one of ${ProductService.INDUSTRIES}"
        form.uom.isNullOrBlank() -> "uom is required"
        form.stock == null || form.stock < 0 -> "stock is required and must be >= 0"
        form.minThreshold == null || form.minThreshold < 0 -> "minThreshold is required and must be >= 0"
        form.reorderQty == null || form.reorderQty < 0 -> "reorderQty is required and must be >= 0"
        form.priceRM == null || form.priceRM < 0 -> "priceRM is required and must be >= 0"
        form.unitCostRM != null && form.unitCostRM < 0 -> "unitCostRM must be >= 0"
        else -> null
    }

    private fun validate(req: UpdateProductRequest): String? = when {
        req.sku != null && req.sku.isBlank() -> "sku must not be empty"
        req.name != null && req.name.isBlank() -> "name must not be empty"
        req.category != null && req.category.isBlank() -> "category must not be empty"
        listOfNotNull(req.priceRM, req.unitCostRM).any { it < 0 } -> "priceRM and unitCostRM must be >= 0"
        listOfNotNull(
            req.minThreshold,
            req.reorderQty,
            req.leadTimeDays,
            req.moq
        ).any { it < 0 } -> "minThreshold, reorderQty, leadTimeDays and moq must be >= 0"

        else -> null
    }

    private fun validate(req: StockMovementRequest): String? {
        val type = req.type ?: "ADJUSTMENT"
        return when {
            type !in ProductService.MOVEMENT_TYPES -> "type must be one of ${ProductService.MOVEMENT_TYPES}"
            type == "OPENING" -> "OPENING is only recorded when a product is created"
            req.change == 0 -> "change must not be 0"
            type in setOf("SALE", "DAMAGE") && req.change > 0 -> "$type needs a negative change"
            type in setOf("DELIVERY", "RETURN") && req.change < 0 -> "$type needs a positive change"
            else -> null
        }
    }

    private fun changedFields(req: UpdateProductRequest): String = listOfNotNull(
        req.sku?.let { "SKU $it" },
        req.name?.let { "name" },
        req.category?.let { "category" },
        req.priceRM?.let { "price ${rm(it)}" },
        req.unitCostRM?.let { "unit cost ${rm(it)}" },
        req.minThreshold?.let { "min threshold $it" },
        req.reorderQty?.let { "reorder qty $it" },
        req.supplierName?.let { "supplier $it" },
        req.supplierContact?.let { "supplier contact" },
        req.visibility?.let { if (it) "visible" else "hidden" },
        req.leadTimeDays?.let { "lead time $it days" },
        req.moq?.let { "MOQ $it" }).joinToString(", ").ifEmpty { "no changes" }

    override fun register(route: Route) {
        ProductService.init()

        route.route("/api/products") {
            post {
                val form = call.receiveOrNull<NewProductForm>() ?: return@post call.respondError(
                    HttpStatusCode.BadRequest,
                    "Invalid JSON body"
                )

                val safeIndustry = form.industry?.takeIf { it in ProductService.INDUSTRIES } ?: when {
                    form.category?.contains("Dairy", true) == true || form.category?.contains(
                        "Milk",
                        true
                    ) == true || form.category?.contains("Food", true) == true || form.category?.contains(
                        "Beverage",
                        true
                    ) == true -> "FNB_PERISHABLE"

                    form.category?.contains("Box", true) == true || form.category?.contains(
                        "Packaging",
                        true
                    ) == true -> "B2B_RAW_MATERIAL"

                    else -> "RETAIL_VARIANT"
                }
                val safeForm = form.copy(industry = safeIndustry)
                validate(safeForm)?.let { return@post call.respondError(HttpStatusCode.BadRequest, it) }

                val result = ProductService.create(safeForm)
                call.respondResult(result, HttpStatusCode.Created)
            }

            get {
                val industry = call.request.queryParameters["industry"]?.ifBlank { null }
                if (industry != null && industry != "ALL" && industry !in ProductService.INDUSTRIES) {
                    return@get call.respondError(
                        HttpStatusCode.BadRequest, "industry must be ALL or one of ${ProductService.INDUSTRIES}"
                    )
                }
                val includeArchived = call.request.queryParameters["includeArchived"].toBoolean()
                call.respond(ProductService.list(industry, call.request.queryParameters["search"], includeArchived))
            }

            // GET http://localhost:8989/api/products/{id}
            get("/{id}") {
                val id = call.parameters["id"].orEmpty()
                val product = ProductService.find(id) ?: return@get call.respondError(
                    HttpStatusCode.NotFound,
                    "Product $id not found"
                )
                call.respond(product)
            }

            // GET http://localhost:8989/api/products/{id}/movements?limit=50
            get("/{id}/movements") {
                val id = call.parameters["id"].orEmpty()
                val rawLimit = call.request.queryParameters["limit"]
                val limit = if (rawLimit.isNullOrBlank()) DEFAULT_MOVEMENT_LIMIT else rawLimit.toIntOrNull()
                if (limit == null || limit !in 1..MAX_MOVEMENT_LIMIT) {
                    return@get call.respondError(
                        HttpStatusCode.BadRequest,
                        "limit must be a number between 1 and $MAX_MOVEMENT_LIMIT"
                    )
                }
                val movements = ProductService.movements(id, limit) ?: return@get call.respondError(
                    HttpStatusCode.NotFound,
                    "Product $id not found"
                )
                call.respond(movements)
            }

            // PATCH http://localhost:8989/api/products/{id}
            patch("/{id}") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<UpdateProductRequest>()
                    ?: return@patch call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                validate(req)?.let { return@patch call.respondError(HttpStatusCode.BadRequest, it) }

                val result = ProductService.update(id, req)
                if (result is ProductResult.Ok) {
                    AuditService.log(
                        module = AuditService.PRODUCTS,
                        role = AuditService.OPERATIONS_STAFF,
                        detail = "Updated ${result.product.name} (${result.product.sku}): ${changedFields(req)}."
                    )
                }
                call.respondResult(result)
            }

            // 1. DELETE 请求容错（避免无 Body 报 400）：
            delete("/{id}") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<OwnerActionRequest>()
                // 优先从 Header 或 QueryParam 获取角色，没有则默认 SME_OWNER
                val role = req?.role?.ifBlank { null } ?: call.request.queryParameters["role"]
                ?: call.request.headers["X-User-Role"] ?: AuditService.SME_OWNER

                val result = ProductService.archive(id)
                if (result is ProductResult.Ok) {
                    AuditService.log(AuditService.PRODUCTS, role, "Archived SKU ${result.product.sku}")
                }
                call.respondResult(result)
            }

            post("/{id}/approve-restock") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<OwnerActionRequest>()
                val role = req?.role?.ifBlank { null } ?: AuditService.SME_OWNER
                val result = ProductService.approveRestock(id)
                call.respondResult(result)
            }

            // POST http://localhost:8989/api/products/{id}/stock-movement
            post("/{id}/stock-movement") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<StockMovementRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "change (whole number) is required")
                validate(req)?.let { return@post call.respondError(HttpStatusCode.BadRequest, it) }

                call.respondResult(
                    ProductService.changeStock(id, req.type ?: "ADJUSTMENT", req.change, req.reason.trim(), req.userID)
                )
            }

            // POST http://localhost:8989/api/products/{id}/adjust
            post("/{id}/adjust") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<AdjustStockRequest>() ?: return@post call.respondError(
                    HttpStatusCode.BadRequest,
                    "Invalid JSON body"
                )
                if (req.role !in setOf(AuditService.SME_OWNER, AuditService.MANAGER)) {
                    return@post call.respondError(HttpStatusCode.Forbidden, "Only SME_OWNER can adjust stock")
                }
                val countedQty = req.countedQty
                val reason = req.reason?.trim()
                if (countedQty == null || countedQty < 0) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "countedQty is required and must be >= 0")
                }
                if (reason.isNullOrEmpty()) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "reason is required")
                }

                call.respondResult(ProductService.adjust(id, countedQty, reason, req.userID, req.role))
            }

            // POST http://localhost:8989/api/products/{id}/confirm-delivery
            post("/{id}/confirm-delivery") {
                val id = call.parameters["id"].orEmpty()
                val req = call.receiveOrNull<ConfirmDeliveryRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")
                if (req.receivedQty != null && req.receivedQty <= 0) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "receivedQty must be > 0")
                }

                when (val result = ProductService.confirmDelivery(id, req.receivedQty, req.userID)) {
                    is ProductResult.Fail -> call.respondError(result.status, result.error)
                    is ProductResult.Ok -> {
                        val invoice = result.invoice!!
                        AuditService.log(
                            module = AuditService.PRODUCTS,
                            role = AuditService.OPERATIONS_STAFF,
                            detail = "Confirmed restock of ${result.product.name}; supplier payable ${invoice.invNo} for ${invoice.party} (${
                                rm(invoice.amountRM)
                            }) created."
                        )
                        call.respond(
                            HttpStatusCode.OK,
                            ConfirmDeliveryResponse(product = result.product, invoice = invoice)
                        )
                    }
                }
            }
        }

        // GET http://localhost:8989/api/inventory/summary
        route.get("/api/inventory/summary") {
            call.respond(ProductService.summary())
        }
    }
}
