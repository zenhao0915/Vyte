package com.hazendust.vyte.route.order

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.InvoiceEntity
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.ai.AiService
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
    private val VALID_ACTIONS = setOf("APPROVE", "REJECT", "MODIFY")

    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    private suspend fun ApplicationCall.respondError(status: HttpStatusCode, message: String) =
        respond(status, mapOf("error" to message))

    override fun register(route: Route) {
        route.route("/api/order") {
            get {
                call.respond(WorkspaceContext.current().savedOrders.values.toList())
            }

            post("/nlp-process") {
                val req = call.receiveOrNull<ProcessNlpOrderRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

                if (req.customerName.isBlank()) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "customerName is required")
                }
                if (req.rawOrderText.isBlank() && req.imageBase64.isNullOrBlank()) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "rawOrderText or imageBase64 is required")
                }

                val products = ProductService.list(null, null)
                val catalogPrompt = products.joinToString("\n") {
                    "- productID: \"${it.id}\", SKU: \"${it.sku}\", name: \"${it.name}\", stock: ${it.stock}, price: ${it.priceRM}"
                }
                val systemPrompt = """
                    You extract customer order items for a Malaysian SME against this catalog:
                    $catalogPrompt
                    Reply with ONLY a JSON object:
                    { "items": [ { "productID": "P-101", "requestedQty": 5 } ] }
                    Match customer product names fuzzy/semantically to the closest catalog item.
                """.trimIndent()

                // 切换到 Dispatchers.IO 防止阻塞 Ktor CIO 事件循环线程
                val aiResult = withContext(Dispatchers.IO) {
                    if (!req.imageBase64.isNullOrBlank() && req.imageBase64.contains("base64,")) {
                        val mime = req.imageBase64.substringAfter("data:").substringBefore(";base64").ifBlank { "image/jpeg" }
                        val bytes = runCatching { Base64.getDecoder().decode(req.imageBase64.substringAfter("base64,").trim()) }.getOrNull()
                            ?: return@withContext AiService.AiResult.Failure("Invalid base64 image payload")
                        AiService.chatJsonWithImage(systemPrompt, req.rawOrderText.ifBlank { "Extract order items" }, mime, bytes, 400)
                    } else {
                        AiService.chatJson(systemPrompt, req.rawOrderText.take(4000), 400)
                    }
                }

                val extractedItems = mutableListOf<ExtractedOrderItem>()
                if (aiResult is AiService.AiResult.Success) {
                    val itemsArr = aiResult.data["items"] as? kotlinx.serialization.json.JsonArray
                    itemsArr?.forEach { el ->
                        val obj = el as? kotlinx.serialization.json.JsonObject ?: return@forEach
                        val pid = (obj["productID"] as? kotlinx.serialization.json.JsonPrimitive)?.content ?: return@forEach
                        val qty = (obj["requestedQty"] as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull()?.coerceIn(1, 9999) ?: 1
                        val product = ProductService.find(pid) ?: return@forEach
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

                // 未配 GROQ_API_KEY 时回退本地关键词规则
                if (extractedItems.isEmpty()) {
                    val rawLower = req.rawOrderText.lowercase()
                    val matchedProducts = products.filter { p ->
                        p.name.lowercase().split(" ").any { w -> w.length > 2 && rawLower.contains(w) } ||
                                rawLower.contains(p.sku.lowercase())
                    }
                    val parsedQty = (Regex("""\d+""").find(rawLower)?.value?.toIntOrNull() ?: 5).coerceIn(1, 9999)
                    matchedProducts.forEach { product ->
                        extractedItems.add(
                            ExtractedOrderItem(
                                productID = product.id,
                                SKU = product.sku,
                                name = product.name,
                                requestedQty = parsedQty,
                                availableStock = product.stock,
                                isStockEnough = product.stock >= parsedQty,
                                sellingPrice = product.priceRM.toFloat(),
                                lineTotal = Math.round(product.priceRM * parsedQty * 100) / 100.0
                            )
                        )
                    }
                }

                val hasSufficientStock = extractedItems.isNotEmpty() && extractedItems.all { it.isStockEnough }
                val calculatedSubtotal = Math.round(extractedItems.sumOf { it.lineTotal } * 100) / 100.0

                DataStore.recordAudit(
                    role = req.userID.ifBlank { "System" },
                    action = "NLP_ORDER_PARSED",
                    details = "Order parsed for '${req.customerName}'. Items: ${extractedItems.size}, Stock Sufficient: $hasSufficientStock."
                )

                call.respond(
                    HttpStatusCode.OK,
                    ProcessNlpOrderResponse(
                        parseSuccess = extractedItems.isNotEmpty(),
                        hasSufficientStock = hasSufficientStock,
                        extractedItems = extractedItems,
                        calculatedSubtotal = calculatedSubtotal,
                        currency = "MYR"
                    )
                )
            }

            post {
                val req = call.receiveOrNull<CreateInvoiceOrderRequest>()
                    ?: return@post call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

                if (req.lineOrders.isEmpty()) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "lineOrders must not be empty")
                }
                if (req.subtotal < 0 || req.lineOrders.any { it.quantity <= 0 || it.lineTotal < 0 }) {
                    return@post call.respondError(HttpStatusCode.BadRequest, "Invalid quantity or negative subtotal")
                }

                val ws = WorkspaceContext.current()
                val finalOrderId = req.orderID.ifBlank { "ORD-${System.currentTimeMillis() % 100000}" }
                ws.savedOrders[finalOrderId] = req.copy(orderID = finalOrderId)
                ws.orderStatuses[finalOrderId] = "PENDING_HUMAN_APPROVAL"

                val createdInv = com.hazendust.vyte.route.invoice.InvoiceService.createReceivable(
                    party = req.internalNotes?.substringAfter("Customer:", "")?.trim()?.ifEmpty { null } ?: "Customer Order ($finalOrderId)",
                    amountRM = req.subtotal,
                    category = "Wholesale Customer Order",
                    aiConfidence = 97,
                    relatedRef = finalOrderId
                )

                DataStore.recordAudit(
                    role = req.createdBy.ifBlank { "SME_OWNER" },
                    action = "ORDER_CREATED_PENDING_APPROVAL",
                    details = "Order $finalOrderId created with invoice ${createdInv.invNo}. Amount: ${req.currency} ${req.subtotal}."
                )

                call.respond(
                    HttpStatusCode.Created,
                    CreateInvoiceOrderResponse(
                        orderID = finalOrderId,
                        invoiceID = createdInv.id,
                        status = "PENDING_HUMAN_APPROVAL",
                        databaseUpdated = true,
                        invoicePdfUrl = "/invoices/${createdInv.id}.pdf",
                        createdAt = LocalDate.now().toString()
                    )
                )
            }

            patch("/status") {
                val req = call.receiveOrNull<ApproveCustomerOrderRequest>()
                    ?: return@patch call.respondError(HttpStatusCode.BadRequest, "Invalid JSON body")

                val action = req.approvalAction.trim().uppercase()
                if (action !in VALID_ACTIONS) {
                    return@patch call.respondError(HttpStatusCode.BadRequest, "approvalAction must be one of $VALID_ACTIONS")
                }

                val ws = WorkspaceContext.current()
                val currentStatus = ws.orderStatuses[req.orderID]
                if (currentStatus == "APPROVED" && action == "APPROVE") {
                    return@patch call.respondError(HttpStatusCode.Conflict, "Order ${req.orderID} has already been approved")
                }

                var inventoryDeducted = false
                val finalStatus = when (action) {
                    "APPROVE" -> "APPROVED"
                    "MODIFY" -> "MODIFIED"
                    else -> "REJECTED"
                }

                if (action == "APPROVE") {
                    val originalOrder = ws.savedOrders[req.orderID]
                    if (originalOrder != null) {
                        // 先检查所有商品库存是否充足
                        for (line in originalOrder.lineOrders) {
                            if (!ProductService.checkStock(line.productID, line.quantity)) {
                                return@patch call.respondError(
                                    HttpStatusCode.Conflict,
                                    "Insufficient warehouse stock for product ${line.productID} (requested ${line.quantity})"
                                )
                            }
                        }
                        // 统一通过 ProductService.deductStock 扣减，确保生成销售流水与自动触发低库存补货预警
                        for (line in originalOrder.lineOrders) {
                            ProductService.deductStock(line.productID, line.quantity, "Customer Order ${req.orderID}", req.updatedBy)
                        }
                    }
                    inventoryDeducted = true
                    ws.orderStatuses[req.orderID] = "APPROVED"
                    InvoiceService.verify(req.invoiceID)
                    DataStore.invoices.firstOrNull { it.id == req.invoiceID }?.status = "VERIFIED"

                    DataStore.recordAudit(
                        role = req.updatedBy,
                        action = "ORDER_APPROVED",
                        details = "Order ${req.orderID} approved by ${req.updatedBy}. Inventory deducted. Notes: ${req.approvalNotes}"
                    )
                } else if (action == "MODIFY") {
                    ws.orderStatuses[req.orderID] = "MODIFIED"
                    DataStore.recordAudit(
                        role = req.updatedBy,
                        action = "ORDER_MODIFIED",
                        details = "Order ${req.orderID} modified by ${req.updatedBy}. Notes: ${req.approvalNotes}"
                    )
                } else {
                    ws.orderStatuses[req.orderID] = "REJECTED"
                    DataStore.invoices.firstOrNull { it.id == req.invoiceID }?.status = "REJECTED"
                    DataStore.recordAudit(
                        role = req.updatedBy,
                        action = "ORDER_REJECTED",
                        details = "Order ${req.orderID} rejected by ${req.updatedBy}. Reason: ${req.approvalNotes}"
                    )
                }

                call.respond(
                    HttpStatusCode.OK,
                    ApproveCustomerOrderResponse(
                        orderID = req.orderID,
                        finalStatus = finalStatus,
                        inventoryDeducted = inventoryDeducted,
                        updatedAt = LocalDate.now().toString(),
                        message = "Order ${req.orderID} marked as $finalStatus."
                    )
                )
            }
        }
    }
}