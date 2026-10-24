package com.hazendust.vyte.route.approval

import kotlinx.serialization.Serializable

@Serializable
data class ApprovalActionBody(val operatorRole: String = "SME_OWNER", val notes: String = "")
