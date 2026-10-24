package com.hazendust.vyte.route.order

import com.hazendust.vyte.data.DataStore
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
import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.util.Base64

@Serializable
data class OrderDetailDto(
    val orderID: String,
    val requestedDate: String,
    val subtotal: Double,
    val currency: String,
    val internalNotes: String? = null,
    val createdBy: String,
    val lineOrders: List<LineOrderItemRequest>,
    val status: String,
    val invoiceID: String? = null
)

object OrderController : BaseRouteController {
    private val VALID_ACTIONS = setOf("APPROVE", "REJECT", "MODIFY")

    private suspend inline fun <reified T : Any> ApplicationCall.receiveOrNull(): T? =
        runCatching { receive<T>() }.getOrNull()

    override fun register(route: Route) {
        // 同时支持单数 /api/order 与复数 /api/orders
        listOf("/api/order", "/api/orders").forEach { basePath ->
            route.route(basePath) {
                get {
                    val ws = WorkspaceContext.current()
                    val orders = ws.savedOrders.values.map { o ->
                        OrderDetailDto(
                            orderID = o.orderID,
                            requestedDate = o.requestedDate,
                            subtotal = o.subtotal,
                            currency = o.currency,
                            internalNotes = o.internalNotes,
                            createdBy = o.createdBy,
                            lineOrders = o.lineOrders,
                            status = ws.orderStatuses[o.orderID] ?: "PENDING_HUMAN_APPROVAL",
                            invoiceID = ws.orderInvoiceIds[o.orderID]
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
                            orderID = o.orderID,
                            requestedDate = o.requestedDate,
                            subtotal = o.subtotal,
                            currency = o.currency,
                            internalNotes = o.internalNotes,
                            createdBy = o.createdBy,
                            lineOrders = o.lineOrders,
                            status = ws.orderStatuses[o.orderID] ?: "PENDING_HUMAN_APPROVAL",
                            invoiceID = ws.orderInvoiceIds[o.orderID]
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

                    // 兜底本地匹配
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

                post {
                    val req = call.receiveOrNull<CreateInvoiceOrderRequest>()
                        ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))

                    val ws = WorkspaceContext.current()
                    val finalOrderId = req.orderID.ifBlank { "ORD-${System.currentTimeMillis() % 100000}" }
                    ws.savedOrders[finalOrderId] = req.copy(orderID = finalOrderId)
                    ws.orderStatuses[finalOrderId] = "PENDING_HUMAN_APPROVAL"

                    val createdInv = InvoiceService.createReceivable(
                        party = req.internalNotes?.substringAfter("Customer:", "")?.trim()?.ifEmpty { null } ?: "Customer Order ($finalOrderId)",
                        amountRM = req.subtotal,
                        category = "Wholesale Customer Order",
                        aiConfidence = 97,
                        relatedRef = finalOrderId
                    )
                    ws.orderInvoiceIds[finalOrderId] = createdInv.id

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
                        ?: return@patch call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON"))

                    val action = req.approvalAction.trim().uppercase()
                    val ws = WorkspaceContext.current()
                    val finalStatus = when (action) {
                        "APPROVE" -> "APPROVED"
                        "MODIFY" -> "MODIFIED"
                        else -> "REJECTED"
                    }

                    if (action == "APPROVE") {
                        val originalOrder = ws.savedOrders[req.orderID]
                        if (originalOrder != null) {
                            for (line in originalOrder.lineOrders) {
                                if (!ProductService.checkStock(line.productID, line.quantity)) {
                                    return@patch call.respond(HttpStatusCode.Conflict, mapOf("error" to "Insufficient stock for ${line.productID}"))
                                }
                            }
                            for (line in originalOrder.lineOrders) {
                                ProductService.deductStock(line.productID, line.quantity, "Customer Order ${req.orderID}", req.updatedBy)
                            }
                        }
                        ws.orderStatuses[req.orderID] = "APPROVED"
                        val invId = req.invoiceID.ifBlank { ws.orderInvoiceIds[req.orderID].orEmpty() }
                        if (invId.isNotBlank()) InvoiceService.verify(invId)
                    } else {
                        ws.orderStatuses[req.orderID] = finalStatus
                    }

                    call.respond(
                        HttpStatusCode.OK,
                        ApproveCustomerOrderResponse(
                            orderID = req.orderID,
                            finalStatus = finalStatus,
                            inventoryDeducted = action == "APPROVE",
                            updatedAt = LocalDate.now().toString(),
                            message = "Order ${req.orderID} marked as $finalStatus."
                        )
                    )
                }
            }
        }
    }
}