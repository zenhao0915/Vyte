package com.hazendust.vyte.route.order

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.manager.DatabaseManager
import com.hazendust.vyte.route.ai.AiService
import com.hazendust.vyte.route.audit.AuditService
import com.hazendust.vyte.route.invoice.InvoiceService
import com.hazendust.vyte.route.product.ProductService
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.LocalDate
import java.util.Base64

object OrderController : BaseRouteController {
    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private fun resolveRealProductId(identifier: String): String? {
        if (identifier.isBlank()) return null
        if (DataStore.products.containsKey(identifier)) return identifier
        return DataStore.products.values.firstOrNull {
            it.sku.equals(identifier, ignoreCase = true) || it.name.equals(identifier, ignoreCase = true)
        }?.id
    }
    override fun register(route: Route) {
        listOf("/api/order", "/api/orders").forEach { basePath ->
            route.route(basePath) {
                get {
                    val ws = WorkspaceContext.current()
                    val orders = ws.savedOrders.values.map { o ->
                        OrderDetailDto(
                            orderID = o.effectiveOrderId,
                            requestedDate = o.requestedDate,
                            subtotal = o.subtotal,
                            currency = o.currency,
                            internalNotes = o.internalNotes,
                            createdBy = o.createdBy,
                            lineOrders = o.lineOrders,
                            status = ws.orderStatuses[o.effectiveOrderId] ?: "APPROVED",
                            invoiceID = ws.orderInvoiceIds[o.effectiveOrderId]
                        )
                    }
                    call.respond(orders)
                }

                get("/{id}") {
                    val id = call.parameters["id"].orEmpty()
                    val ws = WorkspaceContext.current()
                    val o = ws.savedOrders[id]
                        ?: return@get call.respond(HttpStatusCode.NotFound, mapOf("error" to "Order $id not found"))
                    call.respond(
                        OrderDetailDto(
                            orderID = o.effectiveOrderId,
                            requestedDate = o.requestedDate,
                            subtotal = o.subtotal,
                            currency = o.currency,
                            internalNotes = o.internalNotes,
                            createdBy = o.createdBy,
                            lineOrders = o.lineOrders,
                            status = ws.orderStatuses[o.effectiveOrderId] ?: "APPROVED",
                            invoiceID = ws.orderInvoiceIds[o.effectiveOrderId]
                        )
                    )
                }

                post("/nlp-process") {
                    val req = call.receiveOrNull<ProcessNlpOrderRequest>()
                        ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                    val products = ProductService.list(null, null)
                    val catalogPrompt = products.joinToString("\n") {
                        "- productID: \"${it.id}\", SKU: \"${it.sku}\", name: \"${it.name}\", stock: ${it.stock}, price: ${it.priceRM}"
                    }
                    val systemPrompt = """
                        You extract customer order items for a Malaysian SME against this catalog:
                        $catalogPrompt
                        Reply with ONLY a JSON object:
                        { "items": [ { "productID": "P-101", "requestedQty": 5 } ] }
                    """.trimIndent()

                    val aiResult = withContext(Dispatchers.IO) {
                        if (!req.imageBase64.isNullOrBlank() && req.imageBase64.contains("base64,")) {
                            val mime = req.imageBase64.substringAfter("data:").substringBefore(";base64").ifBlank { "image/jpeg" }
                            val bytes = runCatching { Base64.getDecoder().decode(req.imageBase64.substringAfter("base64,").trim()) }.getOrNull()
                                ?: return@withContext AiService.AiResult.Failure("Invalid base64 payload")
                            AiService.chatJsonWithImage(systemPrompt, req.rawOrderText.ifBlank { "Extract order" }, mime, bytes, 400)
                        } else {
                            AiService.chatJson(systemPrompt, req.rawOrderText.take(4000), 400)
                        }
                    }

                    val extractedItems = mutableListOf<ExtractedOrderItem>()
                    if (aiResult is AiService.AiResult.Success) {
                        val itemsArr = aiResult.data["items"] as? kotlinx.serialization.json.JsonArray
                        itemsArr?.forEach { el ->
                            val obj = el as? kotlinx.serialization.json.JsonObject ?: return@forEach
                            val rawId = (obj["productID"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return@forEach
                            val qty = (obj["requestedQty"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()?.coerceIn(1, 9999) ?: 1
                            val realId = resolveRealProductId(rawId) ?: return@forEach
                            val product = ProductService.find(realId) ?: return@forEach
                            extractedItems.add(
                                ExtractedOrderItem(
                                    productID = product.id,
                                    SKU = product.sku,
                                    name = product.name,
                                    requestedQty = qty,
                                    availableStock = product.stock,
                                    isStockEnough = product.stock >= qty,
                                    sellingPrice = product.priceRM.toFloat(),
                                    lineTotal = Math.round(product.priceRM * qty * 100) / 100.0
                                )
                            )
                        }
                    }

                    // 本地规则兜底匹配
                    if (extractedItems.isEmpty()) {
                        val rawLower = req.rawOrderText.lowercase()
                        val matched = products.filter { p ->
                            p.name.lowercase().split(" ").any { w -> w.length > 2 && rawLower.contains(w) } || rawLower.contains(p.sku.lowercase())
                        }
                        val qty = (Regex("""\d+""").find(rawLower)?.value?.toIntOrNull() ?: 1).coerceIn(1, 9999)
                        matched.forEach { p ->
                            extractedItems.add(
                                ExtractedOrderItem(
                                    productID = p.id,
                                    SKU = p.sku,
                                    name = p.name,
                                    requestedQty = qty,
                                    availableStock = p.stock,
                                    isStockEnough = p.stock >= qty,
                                    sellingPrice = p.priceRM.toFloat(),
                                    lineTotal = Math.round(p.priceRM * qty * 100) / 100.0
                                )
                            )
                        }
                    }

                    val hasSufficientStock = extractedItems.isNotEmpty() && extractedItems.all { it.isStockEnough }
                    val subtotal = Math.round(extractedItems.sumOf { it.lineTotal } * 100) / 100.0

                    call.respond(
                        HttpStatusCode.OK,
                        ProcessNlpOrderResponse(
                            parseSuccess = extractedItems.isNotEmpty(),
                            hasSufficientStock = hasSufficientStock,
                            extractedItems = extractedItems,
                            calculatedSubtotal = subtotal,
                            currency = "MYR"
                        )
                    )
                }

                // 核心：添加订单并立即扣减库存、更新数据库
                post {
                    val req = call.receiveOrNull<CreateInvoiceOrderRequest>()
                        ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))

                    val ws = WorkspaceContext.current()
                    val finalOrderId = req.effectiveOrderId

                    // 1. 检查库存并扣除商品库存
                    val normalizedLines = mutableListOf<LineOrderItemRequest>()
                    for (line in req.lineOrders) {
                        val realId = resolveRealProductId(line.effectiveIdentifier)
                            ?: return@post call.respond(HttpStatusCode.NotFound, mapOf("error" to "Product '${line.effectiveIdentifier}' not found"))
                        val qty = line.effectiveQty
                        if (!ProductService.checkStock(realId, qty)) {
                            return@post call.respond(HttpStatusCode.Conflict, mapOf("error" to "Insufficient stock for $realId (requested $qty)"))
                        }
                        normalizedLines.add(line.copy(lineID = line.effectiveLineId, productID = realId, quantity = qty))
                    }

                    // 2. 依次扣减库存并生成出库流水
                    for (line in normalizedLines) {
                        ProductService.deductStock(line.productID, line.quantity, "Customer Order $finalOrderId", req.createdBy)
                    }

                    val normalizedReq = req.copy(orderID = finalOrderId, lineOrders = normalizedLines)
                    ws.savedOrders[finalOrderId] = normalizedReq
                    ws.orderStatuses[finalOrderId] = "APPROVED"

                    // 3. 生成关联应收发票
                    val partyName = req.internalNotes?.substringAfter("Customer:", "")?.trim()?.ifEmpty { null }
                        ?: "Customer Order ($finalOrderId)"
                    val createdInv = InvoiceService.createReceivable(
                        party = partyName,
                        amountRM = req.subtotal,
                        category = "Wholesale Customer Order",
                        aiConfidence = 97,
                        relatedRef = finalOrderId
                    )
                    ws.orderInvoiceIds[finalOrderId] = createdInv.id
                    InvoiceService.verify(createdInv.id)

                    // 4. 立即同步到 SQLite Database
                    if (DatabaseManager.isReady) {
                        DatabaseManager.saveWorkspace(ws)
                    }

                    AuditService.log(
                        "Orders",
                        req.createdBy.ifBlank { AuditService.SME_OWNER },
                        "Created order $finalOrderId (${normalizedLines.size} items, RM ${req.subtotal}), stock deducted and saved to DB."
                    )

                    call.respond(
                        HttpStatusCode.Created,
                        CreateInvoiceOrderResponse(
                            orderID = finalOrderId,
                            invoiceID = createdInv.id,
                            status = "APPROVED",
                            databaseUpdated = true,
                            invoicePdfUrl = "/invoices/${createdInv.id}.pdf",
                            createdAt = LocalDate.now().toString()
                        )
                    )
                }

                patch("/status") {
                    val req = call.receiveOrNull<ApproveCustomerOrderRequest>()
                        ?: return@patch call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))

                    val orderId = req.effectiveOrderId
                    val action = req.approvalAction.trim().uppercase()
                    val ws = WorkspaceContext.current()
                    val finalStatus = when (action) {
                        "APPROVE" -> "APPROVED"
                        "MODIFY" -> "MODIFIED"
                        else -> "REJECTED"
                    }

                    var inventoryDeducted = false
                    if (action == "APPROVE") {
                        val originalOrder = ws.savedOrders[orderId]
                        val currentStatus = ws.orderStatuses[orderId]
                        // 如果创建时未扣减，审批时补扣
                        if (originalOrder != null && currentStatus != "APPROVED") {
                            for (line in originalOrder.lineOrders) {
                                val realId = resolveRealProductId(line.effectiveIdentifier) ?: line.productID
                                val qty = line.effectiveQty
                                if (realId.isNotBlank() && !ProductService.checkStock(realId, qty)) {
                                    return@patch call.respond(HttpStatusCode.Conflict, mapOf("error" to "Insufficient stock for $realId"))
                                }
                            }
                            for (line in originalOrder.lineOrders) {
                                val realId = resolveRealProductId(line.effectiveIdentifier) ?: line.productID
                                val qty = line.effectiveQty
                                if (realId.isNotBlank()) {
                                    ProductService.deductStock(realId, qty, "Customer Order $orderId", req.updatedBy)
                                }
                            }
                            inventoryDeducted = true
                        }
                        ws.orderStatuses[orderId] = "APPROVED"
                        val invId = req.effectiveInvoiceId.ifBlank { ws.orderInvoiceIds[orderId].orEmpty() }
                        if (invId.isNotBlank()) InvoiceService.verify(invId)
                    } else {
                        ws.orderStatuses[orderId] = finalStatus
                    }

                    if (DatabaseManager.isReady) {
                        DatabaseManager.saveWorkspace(ws)
                    }

                    call.respond(
                        HttpStatusCode.OK,
                        ApproveCustomerOrderResponse(
                            orderID = orderId,
                            finalStatus = finalStatus,
                            inventoryDeducted = inventoryDeducted,
                            updatedAt = LocalDate.now().toString(),
                            message = "Order $orderId marked as $finalStatus."
                        )
                    )
                }
            }
        }
    }
}