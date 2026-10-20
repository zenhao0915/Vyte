package com.hazendust.vyte.models

import kotlinx.serialization.Serializable

@Serializable
data class Product(
    val productID: String,
    val customerName: String = "WhatsApp Customer",
    val channel: String = "WHATSAPP"
)