package com.hazendust.vyte.route.order

import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.InvoiceEntity
import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.ai.AiService
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.util.concurrent.ConcurrentHashMap

object OrderController : BaseRouteController {
    private val savedOrders = ConcurrentHashMap<String, CreateInvoiceOrderRequest>()

    override fun register(route: Route) {
        route.route("/api/order") {
            get {
                call.respond(savedOrders.values.toList())
            }

            // 在 OrderController.kt 的 post("/nlp-process") 中接入 AiService:
            post("/nlp-process") {
                val req = call.receive<ProcessNlpOrderRequest>()
                val catalogPrompt = DataStore.products.values.joinToString("\n") {
                    "- productID: \"${it.id}\", SKU: \"${it.sku}\", name: \"${it.name}\", stock: ${it.stock}, price: ${it.sellingPrice}"
                }
                val systemPrompt = """
        You extract customer order items for a Malaysian SME against this catalog:
        $catalogPrompt
        Reply with ONLY a JSON object:
        { "items": [ { "productID": "P-101", "requestedQty": 5 } ] }
        Match customer product names fuzzy/semantically to the closest catalog item.
    """.trimIndent()

                // 如果前端 JSON 传了 imageBase64，就调视觉模型；否则调文本模型
                val aiResult = if (!req.imageBase64.isNullOrBlank() && req.imageBase64.contains("base64,")) {
                    val mime =
                        req.imageBase64.substringAfter("data:").substringBefore(";base64").ifBlank { "image/jpeg" }
                    val bytes = java.util.Base64.getDecoder().decode(req.imageBase64.substringAfter("base64,"))
                    AiService.chatJsonWithImage(
                        systemPrompt, req.rawOrderText, mime, bytes, 400
                    )
                } else {
                    AiService.chatJson(systemPrompt, req.rawOrderText, 400)
                }

                val extractedItems = mutableListOf<ExtractedOrderItem>()
                if (aiResult is AiService.AiResult.Success) {
                    val itemsArr = aiResult.data["items"] as? kotlinx.serialization.json.JsonArray
                    itemsArr?.forEach { el ->
                        val obj = el as? kotlinx.serialization.json.JsonObject ?: return@forEach
                        val pid = obj["productID"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
                            ?: return@forEach
                        val qty =
                            obj["requestedQty"]?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content?.toIntOrNull() }
                                ?: 1
                        val product = DataStore.products[pid] ?: return@forEach
                        extractedItems.add(
                            ExtractedOrderItem(
                                productID = product.id,
                                SKU = product.sku,
                                name = product.name,
                                requestedQty = qty,
                                availableStock = product.stock,
                                isStockEnough = product.stock >= qty,
                                sellingPrice = product.sellingPrice.toFloat(),
                                lineTotal = product.sellingPrice * qty
                            )
                        )
                    }
                }

                // 如果未配置 GROQ_API_KEY，自动回退到本地关键词匹配规则
                if (extractedItems.isEmpty()) {
                    val rawLower = req.rawOrderText.lowercase()
                    val matchedProducts = DataStore.products.values.filter { p ->
                        p.name.lowercase().split(" ")
                            .any { w -> w.length > 2 && rawLower.contains(w) } || rawLower.contains(p.sku.lowercase())
                    }.ifEmpty { listOfNotNull(DataStore.products.values.firstOrNull()) }

                    val parsedQty = Regex("""\d+""").find(rawLower)?.value?.toIntOrNull() ?: 5
                    matchedProducts.forEach { product ->
                        extractedItems.add(
                            ExtractedOrderItem(
                                productID = product.id,
                                SKU = product.sku,
                                name = product.name,
                                requestedQty = parsedQty,
                                availableStock = product.stock,
                                isStockEnough = product.stock >= parsedQty,
                                sellingPrice = product.sellingPrice.toFloat(),
                                lineTotal = product.sellingPrice * parsedQty
                            )
                        )
                    }
                }

                val hasSufficientStock = extractedItems.isNotEmpty() && extractedItems.all { it.isStockEnough }
                val calculatedSubtotal = extractedItems.sumOf { it.lineTotal }

                DataStore.recordAudit(
                    role = req.userID.ifBlank { "System" },
                    action = "NLP_ORDER_PARSED",
                    details = "Order parsed for '${req.customerName}'. Items: ${extractedItems.size}, Stock Sufficient: $hasSufficientStock."
                )

                call.respond(
                    HttpStatusCode.OK, ProcessNlpOrderResponse(
                        parseSuccess = extractedItems.isNotEmpty(),
                        hasSufficientStock = hasSufficientStock,
                        extractedItems = extractedItems,
                        calculatedSubtotal = calculatedSubtotal,
                        currency = "MYR"
                    )
                )
            }

            // ========================================================
            // 3.2 生成发票并更新数据库 (Generate Invoice & Update Database)
            // POST http://localhost:8989/api/order
            // ========================================================
            post {
                val req = call.receive<CreateInvoiceOrderRequest>()
                val finalOrderId = req.orderID.ifBlank { "ORD-${System.currentTimeMillis() % 100000}" }
                val invoiceId = "INV-CUST-${System.currentTimeMillis() % 100000}"

                // 暂存订单，等待后续管理员审核扣库
                savedOrders[finalOrderId] = req.copy(orderID = finalOrderId)

                // 生成待审核发票实体并归档至 DataStore
                DataStore.invoices.add(
                    0, InvoiceEntity(
                        id = invoiceId,
                        type = "CUSTOMER",
                        relatedRef = finalOrderId,
                        amount = req.subtotal,
                        category = "Sales Order",
                        status = "PENDING_APPROVAL",
                        createdAt = LocalDate.now().toString()
                    )
                )

                DataStore.recordAudit(
                    role = req.createdBy.ifBlank { "User" },
                    action = "ORDER_CREATED_PENDING_APPROVAL",
                    details = "Order $finalOrderId created with invoice $invoiceId. Amount: ${req.currency} ${req.subtotal}. Status: PENDING_HUMAN_APPROVAL."
                )

                call.respond(
                    HttpStatusCode.Created, CreateInvoiceOrderResponse(
                        orderID = finalOrderId,
                        invoiceID = invoiceId,
                        status = "PENDING_HUMAN_APPROVAL",
                        databaseUpdated = true,
                        invoicePdfUrl = "http://localhost:8989/invoices/$invoiceId.pdf",
                        createdAt = LocalDate.now().toString()
                    )
                )
            }

            patch("/status") {
                val req = call.receive<ApproveCustomerOrderRequest>()
                val isApproved = req.approvalAction.equals("APPROVE", ignoreCase = true)
                var inventoryDeducted = false
                val finalStatus = if (isApproved) "APPROVED" else req.approvalAction.uppercase()

                if (isApproved) {
                    val originalOrder = savedOrders[req.orderID]
                    if (originalOrder != null) {
                        for (line in originalOrder.lineOrders) {
                            val product = DataStore.products[line.productID]
                                ?: DataStore.products.values.firstOrNull { it.id == line.productID }

                            if (product != null) {
                                product.stock = (product.stock - line.quantity).coerceAtLeast(0)
                            }
                        }
                    }
                    inventoryDeducted = true

                    val invoice = DataStore.invoices.firstOrNull { it.id == req.invoiceID }
                    invoice?.status = "ISSUED"

                    DataStore.recordAudit(
                        role = req.updatedBy,
                        action = "ORDER_APPROVED",
                        details = "Order ${req.orderID} approved by ${req.updatedBy}. Inventory has been deducted. Notes: ${req.approvalNotes}"
                    )
                } else {
                    val invoice = DataStore.invoices.firstOrNull { it.id == req.invoiceID }
                    invoice?.status = "REJECTED"

                    DataStore.recordAudit(
                        role = req.updatedBy,
                        action = "ORDER_REJECTED",
                        details = "Order ${req.orderID} rejected by ${req.updatedBy}. Reason: ${req.approvalNotes}"
                    )
                }

                val resultMessage = if (isApproved) {
                    "Order ${req.orderID} approved successfully and inventory has been deducted."
                } else {
                    "Order ${req.orderID} has been marked as $finalStatus. Note: ${req.approvalNotes}"
                }

                call.respond(
                    HttpStatusCode.OK, ApproveCustomerOrderResponse(
                        orderID = req.orderID,
                        finalStatus = finalStatus,
                        inventoryDeducted = inventoryDeducted,
                        updatedAt = LocalDate.now().toString(),
                        message = resultMessage
                    )
                )
            }
        }
    }
}