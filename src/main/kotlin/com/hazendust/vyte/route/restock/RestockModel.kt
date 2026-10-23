package com.hazendust.vyte.route.restock

import com.hazendust.vyte.route.invoice.InvoiceItem
import com.hazendust.vyte.route.product.Product
import kotlinx.serialization.Serializable

@Serializable
data class ConfirmRestockRequest(
    val poNumber: String, val productId: String = "", val productid: String = "",
    val SKU: String, val quantity: Int, val unitPrice: Double, val currency: String = "MYR",
    val MOQ: Int = 10, val unitOfMeasure: String = "unit", val supplierName: String,
    val supplierPhoneNumber: String, val requestedDeliveryDate: String = "",
    val deliveryLocation: String = "Main Warehouse", val automationStatus: Boolean = true, val userID: String
)

@Serializable
data class ConfirmRestockResponse(
    val poNumber: String,
    val status: String,
    val confirmationStatus: String,
    val isConfirmed: Boolean,
    val message: String,
    val updatedAt: String,
    val backendProduct: Product? = null,
    val backendInvoice: InvoiceItem? = null
)

@Serializable
data class ContactSupplierRequest(
    val poNumber: String,
    val productId: String = "",
    val supplierName: String,
    val supplierPhoneNumber: String,
    val channel: String,
    val messageBody: String,
    val userID: String,
    val role: String = "SME_OWNER",
    val reorderQty: Int? = null
)

@Serializable
data class ContactSupplierResponse(
    val poNumber: String, val deliveryStatus: String, val sentAt: String,
    val responseCode: Int, val message: String
)