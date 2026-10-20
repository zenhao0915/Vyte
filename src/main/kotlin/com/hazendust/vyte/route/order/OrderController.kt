package com.hazendust.vyte.route.order

import com.hazendust.vyte.data.ApprovalTaskEntity
import com.hazendust.vyte.data.DataStore
import com.hazendust.vyte.data.InvoiceEntity
import com.hazendust.vyte.manager.BaseRouteController
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.LocalDate
import java.util.concurrent.CopyOnWriteArrayList

object OrderController : BaseRouteController {
    private val customerOrders = CopyOnWriteArrayList<CustomerOrderSummaryResponse>()

    override fun register(route: Route) {
        route.route("/api/orders") {

            // 1. 接入自然语言订单并执行库存预检 (Trigger & Decision Logic)
            post("/ingest") {
                val req = call.receive<IngestOrderRequest>()
                val rawLower = req.rawMessage.lowercase()
                val orderId = "ORD-${System.currentTimeMillis() % 10000}"

                // A. 模拟 NLP 智能提取：匹配商品与数量
                var matchedProduct = DataStore.products.values.firstOrNull { p ->
                    val keyword = p.name.split(" ").firstOrNull()?.lowercase() ?: ""
                    keyword.isNotBlank() && rawLower.contains(keyword)
                } ?: DataStore.products.values.first() // 兜底匹配第一项

                val digitMatch = Regex("""\d+""").find(rawLower)
                val orderQty = digitMatch?.value?.toIntOrNull() ?: 10

                val parsedItem = ParsedItemDto(
                    productName = matchedProduct.name,
                    matchedProductId = matchedProduct.id,
                    requestedQuantity = orderQty,
                    unitPrice = matchedProduct.sellingPrice
                )

                // B. 库存充裕性判断
                if (matchedProduct.stock >= orderQty) {
                    // 库存充足：扣减库存、生成出库发票、直接履约
                    matchedProduct.stock -= orderQty
                    val invoiceId = "INV-CUST-${System.currentTimeMillis() % 10000}"
                    val totalAmount = orderQty * matchedProduct.sellingPrice

                    DataStore.invoices.add(0, InvoiceEntity(
                        id = invoiceId,
                        type = "CUSTOMER",
                        relatedRef = req.customerName,
                        amount = totalAmount,
                        category = matchedProduct.category,
                        status = "ISSUED",
                        createdAt = LocalDate.now().toString()
                    ))

                    DataStore.recordAudit(
                        role = "Vyte Automation Agent",
                        action = "ORDER_AUTO_FULFILLED",
                        details = "Order $orderId (${req.customerName}) fulfilled: $orderQty x ${matchedProduct.name}. Remaining: ${matchedProduct.stock}."
                    )

                    val summary = CustomerOrderSummaryResponse(
                        orderId = orderId,
                        customerName = req.customerName,
                        rawMessage = req.rawMessage,
                        totalAmount = totalAmount,
                        status = "FULFILLED",
                        createdAt = LocalDate.now().toString()
                    )
                    customerOrders.add(0, summary)

                    call.respond(HttpStatusCode.OK, IngestOrderResponse(
                        orderId = orderId,
                        customerName = req.customerName,
                        hasDeficit = false,
                        status = "FULFILLED",
                        parsedItems = listOf(parsedItem),
                        deficits = emptyList(),
                        invoiceId = invoiceId,
                        restockTaskId = null,
                        message = "Stock is sufficient. Customer invoice $invoiceId generated."
                    ))

                } else {
                    // 库存不足：触发 5 步自动化闭环，向 Restock 模块注入待审批任务
                    val deficitQty = orderQty - matchedProduct.stock
                    val taskId = "TASK-${System.currentTimeMillis() % 10000}"

                    // 决策逻辑：自动比对最优供应商（最短交期 + 综合折扣）
                    val bestSupplier = DataStore.suppliers.minByOrNull { it.leadTimeDays } ?: DataStore.suppliers.first()
                    val estCost = deficitQty * (matchedProduct.costPrice * bestSupplier.unitPriceDiscount)

                    val explainReason = "Auto-evaluated: Deficit of $deficitQty units. Selected ${bestSupplier.name} due to fastest lead time (${bestSupplier.leadTimeDays} day) and ${((1.0 - bestSupplier.unitPriceDiscount) * 100).toInt()}% procurement discount."

                    val approvalTask = ApprovalTaskEntity(
                        id = taskId,
                        triggerType = "STOCK_DEFICIT",
                        sourceMessage = req.rawMessage,
                        deficitSummary = "${matchedProduct.name}: Deficit of $deficitQty units (Stock: ${matchedProduct.stock}, Needed: $orderQty)",
                        recommendedSupplier = bestSupplier.name,
                        itemsToOrder = "$deficitQty units of ${matchedProduct.name}",
                        totalEstimatedCost = estCost,
                        explainableReason = explainReason,
                        status = "PENDING",
                        createdAt = LocalDate.now().toString()
                    )
                    DataStore.approvalTasks.add(0, approvalTask)

                    DataStore.recordAudit(
                        role = "Vyte Inflow Engine",
                        action = "RESTOCK_TASK_DISPATCHED",
                        details = "Stock deficit triggered for ${matchedProduct.name}. Pending Restock Approval Task $taskId dispatched to Manager."
                    )

                    val summary = CustomerOrderSummaryResponse(
                        orderId = orderId,
                        customerName = req.customerName,
                        rawMessage = req.rawMessage,
                        totalAmount = orderQty * matchedProduct.sellingPrice,
                        status = "PENDING_RESTOCK_APPROVAL",
                        createdAt = LocalDate.now().toString()
                    )
                    customerOrders.add(0, summary)

                    call.respond(HttpStatusCode.Created, IngestOrderResponse(
                        orderId = orderId,
                        customerName = req.customerName,
                        hasDeficit = true,
                        status = "PENDING_RESTOCK_APPROVAL",
                        parsedItems = listOf(parsedItem),
                        deficits = listOf(
                            OrderDeficitDto(
                                productId = matchedProduct.id,
                                productName = matchedProduct.name,
                                requestedQuantity = orderQty,
                                currentStock = matchedProduct.stock,
                                deficitQuantity = deficitQty
                            )
                        ),
                        invoiceId = null,
                        restockTaskId = taskId,
                        message = "Stock deficit detected ($deficitQty units short). Restock approval task $taskId created."
                    ))
                }
            }

            // 2. 获取所有历史客户订单列表
            get {
                call.respond(customerOrders)
            }
        }
    }
}