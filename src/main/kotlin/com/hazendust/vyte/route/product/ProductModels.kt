package com.hazendust.vyte.route.product

import com.hazendust.vyte.data.ProductEntity
import com.hazendust.vyte.route.invoice.InvoiceItem
import kotlinx.serialization.Serializable

// ==========================================
// Product Module
// ==========================================

/**
 * Mirrors the frontend `Product` interface exactly (field names are case-sensitive).
 * Optional TS fields are nullable with a null default so they are omitted from JSON when absent.
 * dailyDepletionRate, daysUntilStockout and performance are calculated on read from SALE movements.
 */
@Serializable
data class Product(
    val id: String,
    val sku: String,
    val name: String,
    val category: String,
    val industry: String, // "FNB_PERISHABLE", "RETAIL_VARIANT", "B2B_RAW_MATERIAL"
    val uom: String,
    val stock: Int,
    val minThreshold: Int,
    val reorderQty: Int,
    val priceRM: Double,
    val unitCostRM: Double? = null,
    val dailyDepletionRate: Double? = null,
    val daysUntilStockout: Double? = null,
    val leadTimeDays: Int? = null,
    val moq: Int? = null,
    val supplierName: String,
    val supplierContact: String,
    val performance: String, // "Excellent", "Good", "Low"
    val visibility: Boolean,
    val batchNo: String? = null,
    val expiryDate: String? = null,
    val variantSpec: String? = null,
    val restockStatus: String, // "HEALTHY", "TRIGGERED_PENDING_APPROVAL", "SUPPLIER_CONTACTED", "CONFIRMED"
    val photoUrl: String? = null
)

/**
 * One stock change. Returned by GET /api/products/{id}/movements and stored in the stock_movements table.
 */
@Serializable
data class StockMovement(
    val id: String,
    val productId: String,
    val type: String, // "SALE", "DELIVERY", "ADJUSTMENT", "DAMAGE", "OPENING", "RETURN"
    val change: Int,
    val stockAfter: Int,
    val reason: String,
    val userID: String,
    val timestamp: String // ISO-8601 with Malaysia offset, e.g. "2026-10-21T21:00:05+08:00"
)

/**
 * POST /api/products
 * All fields are nullable so missing values produce a 400 { error } instead of a parse failure.
 */
@Serializable
data class NewProductForm(
    val name: String? = null,
    val sku: String? = null,
    val category: String? = null,
    val industry: String? = null,
    val uom: String? = null,
    val stock: Int? = null,
    val minThreshold: Int? = null,
    val reorderQty: Int? = null,
    val priceRM: Double? = null,
    val unitCostRM: Double? = null,
    val supplierName: String? = null,
    val supplierContact: String? = null,
    val extraAttr: String? = null,
    val batchNo: String? = null,
    val expiryDate: String? = null,
    val variantSpec: String? = null,
    val leadTimeDays: Int? = null,
    val moq: Int? = null,
    val photoUrl: String? = null
)

/**
 * PATCH /api/products/{id} — only the fields that are present are changed.
 */
@Serializable
data class UpdateProductRequest(
    val sku: String? = null,
    val name: String? = null,
    val category: String? = null,
    val priceRM: Double? = null,
    val minThreshold: Int? = null,
    val reorderQty: Int? = null,
    val supplierName: String? = null,
    val supplierContact: String? = null,
    val visibility: Boolean? = null,
    val unitCostRM: Double? = null,
    val leadTimeDays: Int? = null,
    val moq: Int? = null
)

/**
 * POST /api/products/{id}/stock-movement
 * type defaults to ADJUSTMENT; SALE/DAMAGE need a negative change, DELIVERY/RETURN a positive one.
 */
@Serializable
data class StockMovementRequest(
    val change: Int,
    val reason: String = "",
    val type: String? = null,
    val userID: String = ""
)

/**
 * POST /api/products/{id}/adjust
 */
@Serializable
data class AdjustStockRequest(
    val countedQty: Int? = null,
    val reason: String? = null,
    val userID: String = "",
    val role: String = ""
)

/**
 * POST /api/products/{id}/approve-restock and DELETE /api/products/{id}
 */
@Serializable
data class OwnerActionRequest(
    val userID: String = "",
    val role: String = ""
)

/**
 * POST /api/products/{id}/confirm-delivery
 */
@Serializable
data class ConfirmDeliveryRequest(
    val receivedQty: Int? = null,
    val userID: String = ""
)

/**
 * Response of POST /api/products/{id}/confirm-delivery:
 * the updated product plus the SUPPLIER_PAYABLE invoice created for the delivery.
 */
@Serializable
data class ConfirmDeliveryResponse(
    val product: Product,
    val invoice: InvoiceItem
)

/**
 * GET /api/inventory/summary
 */
@Serializable
data class InventorySummary(
    val totalSkus: Int,
    val stockValueRM: Double,
    val lowStockCount: Int,
    val pendingRestockCount: Int,
    val supplierContactedCount: Int,
    val expiringIn7Days: Int
)

/**
 * Product fields that DataStore.ProductEntity does not hold.
 * Shared fields (stock, price, threshold, ...) stay in DataStore.products so the Order module sees the same stock.
 */
@Serializable
data class ProductExtras(
    val industry: String,
    val uom: String,
    val reorderQty: Int,
    val leadTimeDays: Int? = null,
    val moq: Int? = null,
    val supplierName: String,
    val supplierContact: String,
    val visibility: Boolean = true,
    val batchNo: String? = null,
    val variantSpec: String? = null,
    val restockStatus: String = "HEALTHY",
    val archived: Boolean = false,
    val photoUrl: String? = null
)

/**
 * One row of the product_records table (stored as JSON).
 */
@Serializable
data class ProductRecord(
    val entity: ProductEntity,
    val extras: ProductExtras
)
