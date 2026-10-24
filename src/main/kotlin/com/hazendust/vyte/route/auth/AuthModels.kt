package com.hazendust.vyte.route.auth

import kotlinx.serialization.Serializable

@Serializable
data class UserSessionDto(
    val userID: String,
    val userName: String,
    val email: String,
    val userType: String, // "CEO" | "Manager" | "Staff"
    val role: String,     // "SME_OWNER" | "MANAGER" | "OPERATIONS_STAFF"
    val companyName: String,
    val companyOwnerName: String
)

@Serializable
data class RegisterAccountRequest(
    val firstName: String,
    val lastName: String,
    val email: String,
    val password: String,
    val companyName: String,
    val userType: String = "CEO",
    val role: String = "SME_OWNER",
    val acceptedTermsAt: String = ""
)

@Serializable
data class RegisterAccountResponse(
    val userID: String,
    val accessToken: String,
    val session: UserSessionDto,
    val createdAt: String
)

@Serializable
data class LoginAccountRequest(
    val email: String,
    val password: String,
    val companyName: String = "Vyte Smart Logistics Sdn Bhd",
    val userType: String = "CEO"
)

@Serializable
data class AuthSessionResponse(
    val accessToken: String,
    val session: UserSessionDto
)

@Serializable
data class GoogleLoginRequest(
    val idToken: String,
    val email: String,
    val fullName: String,
    val companyName: String,
    val userType: String = "CEO",
    val role: String = "SME_OWNER"
)

@Serializable
data class EnterpriseSsoRequest(
    val ssoAssertionToken: String,
    val corporateDomain: String,
    val email: String,
    val companyName: String,
    val userType: String = "CEO",
    val role: String = "SME_OWNER"
)

@Serializable
data class ValidateSessionRequest(
    val accessToken: String,
    val userID: String,
    val email: String
)

@Serializable
data class ValidateSessionResponse(
    val valid: Boolean,
    val session: UserSessionDto
)

@Serializable
data class PasswordResetRequest(val email: String)

@Serializable
data class PasswordResetResponse(
    val email: String,
    val resetToken: String,
    val expiresAt: String
)

@Serializable
data class ConfirmPasswordResetRequest(
    val email: String,
    val resetToken: String,
    val newPassword: String
)

@Serializable
data class ConfirmPasswordResetResponse(
    val success: Boolean,
    val message: String
)
