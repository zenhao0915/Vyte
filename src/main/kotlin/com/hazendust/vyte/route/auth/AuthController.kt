package com.hazendust.vyte.route.auth

import com.hazendust.vyte.manager.BaseRouteController
import com.hazendust.vyte.route.audit.AuditService
import io.ktor.http.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.OffsetDateTime
import java.util.concurrent.ConcurrentHashMap
import kotlin.random.Random

object AuthController : BaseRouteController {
    private data class StoredAccount(
        var password: String,
        val session: UserSessionDto
    )

    private val accountsByEmail = ConcurrentHashMap<String, StoredAccount>()
    private val sessionsByToken = ConcurrentHashMap<String, UserSessionDto>()
    private val resetTokensByEmail = ConcurrentHashMap<String, String>()

    private fun mapTypeToRole(userType: String): String = when (userType) {
        "CEO" -> "SME_OWNER"
        "Manager" -> "MANAGER"
        else -> "OPERATIONS_STAFF"
    }

    private fun defaultUserId(userType: String): String = when (userType) {
        "CEO" -> "M067"
        "Manager" -> "M102"
        else -> "S204"
    }

    override fun register(route: Route) {
        route.route("/api/auth") {
            get("/me") {
                val authHeader = call.request.headers["Authorization"].orEmpty()
                val token = authHeader.removePrefix("Bearer ").trim()
                val session = sessionsByToken[token]
                    ?: accountsByEmail.values.firstOrNull()?.session
                    ?: UserSessionDto("M067", "Jayden Lai", "admin@vyte.com", "CEO", "SME_OWNER", "Vyte Smart Logistics", "Jayden Lai")
                call.respond(HttpStatusCode.OK, session)
            }

            post("/logout") {
                call.respond(HttpStatusCode.OK, mapOf("status" to "LOGGED_OUT"))
            }

            post("/register") {
                val req = runCatching { call.receive<RegisterAccountRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val cleanEmail = req.email.trim().lowercase()
                val fullName = "${req.firstName.trim()} ${req.lastName.trim()}".trim().ifEmpty { "Vyte Operator" }
                val role = req.role.ifBlank { mapTypeToRole(req.userType) }
                val userID = defaultUserId(req.userType)
                val session = UserSessionDto(
                    userID = userID,
                    userName = fullName,
                    email = req.email.trim(),
                    userType = req.userType,
                    role = role,
                    companyName = req.companyName.trim().ifEmpty { "Vyte Smart Logistics Sdn Bhd" },
                    companyOwnerName = fullName
                )
                val token = "vyte-jwt-${System.currentTimeMillis()}"
                accountsByEmail[cleanEmail] = StoredAccount(req.password, session)
                sessionsByToken[token] = session

                AuditService.log("Auth", role, "Registered account for $fullName ($userID) • ${session.companyName}.")
                call.respond(
                    HttpStatusCode.Created,
                    RegisterAccountResponse(
                        userID = userID,
                        accessToken = token,
                        session = session,
                        createdAt = OffsetDateTime.now().toString()
                    )
                )
            }

            post("/login") {
                val req = runCatching { call.receive<LoginAccountRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val cleanEmail = req.email.trim().lowercase()
                val existing = accountsByEmail[cleanEmail]
                if (existing != null && existing.password != req.password) {
                    return@post call.respond(HttpStatusCode.Unauthorized, mapOf("error" to "Incorrect password for this account."))
                }

                val session = existing?.session ?: run {
                    val userType = req.userType
                    val role = mapTypeToRole(userType)
                    val name = req.email.trim().substringBefore('@').ifEmpty { "Vyte Operator" }
                    UserSessionDto(
                        userID = defaultUserId(userType),
                        userName = name,
                        email = req.email.trim(),
                        userType = userType,
                        role = role,
                        companyName = req.companyName.ifBlank { "Vyte Smart Logistics Sdn Bhd" },
                        companyOwnerName = name
                    )
                }
                val token = "vyte-jwt-${System.currentTimeMillis()}"
                sessionsByToken[token] = session

                AuditService.log("Auth", session.role, "Signed in as ${session.userName} (${session.userID}).")
                call.respond(HttpStatusCode.OK, AuthSessionResponse(accessToken = token, session = session))
            }

            post("/google") {
                val req = runCatching { call.receive<GoogleLoginRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val role = req.role.ifBlank { mapTypeToRole(req.userType) }
                val session = UserSessionDto(
                    userID = defaultUserId(req.userType),
                    userName = req.fullName.ifBlank { "Jayden Lai" },
                    email = req.email.trim(),
                    userType = req.userType,
                    role = role,
                    companyName = req.companyName.ifBlank { "Vyte Smart Logistics Sdn Bhd" },
                    companyOwnerName = req.fullName.ifBlank { "Jayden Lai" }
                )
                val token = "vyte-google-jwt-${System.currentTimeMillis()}"
                sessionsByToken[token] = session
                call.respond(HttpStatusCode.OK, AuthSessionResponse(accessToken = token, session = session))
            }

            post("/sso") {
                val req = runCatching { call.receive<EnterpriseSsoRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val role = req.role.ifBlank { mapTypeToRole(req.userType) }
                val name = req.email.substringBefore('@').ifBlank { "Enterprise Operator" }
                val session = UserSessionDto(
                    userID = defaultUserId(req.userType),
                    userName = name,
                    email = req.email.trim(),
                    userType = req.userType,
                    role = role,
                    companyName = req.companyName.ifBlank { "Vyte Smart Logistics Sdn Bhd" },
                    companyOwnerName = name
                )
                val token = "vyte-sso-jwt-${System.currentTimeMillis()}"
                sessionsByToken[token] = session
                call.respond(HttpStatusCode.OK, AuthSessionResponse(accessToken = token, session = session))
            }

            post("/validate-session") {
                val req = runCatching { call.receive<ValidateSessionRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val stored = sessionsByToken[req.accessToken]
                    ?: accountsByEmail[req.email.trim().lowercase()]?.session
                    ?: UserSessionDto(
                        userID = req.userID.ifBlank { "M067" },
                        userName = req.email.substringBefore('@').ifBlank { "Vyte Operator" },
                        email = req.email,
                        userType = if (req.userID == "M102") "Manager" else if (req.userID == "S204") "Staff" else "CEO",
                        role = if (req.userID == "M102") "MANAGER" else if (req.userID == "S204") "OPERATIONS_STAFF" else "SME_OWNER",
                        companyName = "Vyte Smart Logistics Sdn Bhd",
                        companyOwnerName = req.email.substringBefore('@').ifBlank { "Vyte Operator" }
                    )

                call.respond(HttpStatusCode.OK, ValidateSessionResponse(valid = req.accessToken.isNotBlank(), session = stored))
            }

            post("/password-reset/request") {
                val req = runCatching { call.receive<PasswordResetRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val code = "VYTE-${Random.nextInt(100000, 999999)}"
                resetTokensByEmail[req.email.trim().lowercase()] = code
                call.respond(
                    HttpStatusCode.OK,
                    PasswordResetResponse(
                        email = req.email.trim(),
                        resetToken = code,
                        expiresAt = OffsetDateTime.now().plusMinutes(15).toString()
                    )
                )
            }

            post("/password-reset/confirm") {
                val req = runCatching { call.receive<ConfirmPasswordResetRequest>() }.getOrNull()
                    ?: return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid JSON body"))

                val key = req.email.trim().lowercase()
                val expected = resetTokensByEmail[key]
                if (expected != null && !expected.equals(req.resetToken.trim(), ignoreCase = true)) {
                    return@post call.respond(HttpStatusCode.BadRequest, mapOf("error" to "Invalid verification code."))
                }
                accountsByEmail[key]?.password = req.newPassword
                resetTokensByEmail.remove(key)
                call.respond(
                    HttpStatusCode.OK,
                    ConfirmPasswordResetResponse(
                        success = true,
                        message = "Password updated successfully for ${req.email.trim()}. Please log in."
                    )
                )
            }
        }
    }
}