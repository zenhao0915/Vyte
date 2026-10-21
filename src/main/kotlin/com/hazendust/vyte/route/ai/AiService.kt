package com.hazendust.vyte.route.ai

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.util.Base64

/**
 * Groq chat completions (OpenAI-compatible) using only the JDK HttpClient and kotlinx.serialization.
 *
 * API key: env var GROQ_API_KEY only (never hard-coded, never logged).
 * GROQ_BASE_URL (optional) overrides the API URL; it exists only to test against a local mock server.
 *
 * Never throws: every failure comes back as AiResult.Failure so callers can fall back to rule-based logic.
 */
object AiService {
    const val DEFAULT_TEXT_MODEL = "llama-3.3-70b-versatile"
    const val DEFAULT_IMAGE_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
    private const val DEFAULT_BASE_URL = "https://api.groq.com/openai/v1"
    private val TIMEOUT: Duration = Duration.ofSeconds(30)
    private const val MAX_RETRY_WAIT_MS = 5_000L

    // Groq accepts base64 image requests up to 4 MB; base64 adds ~33%, so keep raw images at or below 3 MB
    const val MAX_IMAGE_BYTES = 3L * 1024 * 1024

    private val json = Json { ignoreUnknownKeys = true }
    private val http: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build()

    sealed interface AiResult {
        data class Success(val data: JsonObject, val model: String) : AiResult
        data class Failure(val reason: String) : AiResult
    }

    private data class Settings(val apiKey: String?, val textModel: String, val imageModel: String, val baseUrl: String)

    fun isConfigured(): Boolean = settings().apiKey != null

    /** Text prompt; the model must answer with a JSON object. */
    fun chatJson(system: String, user: String, maxTokens: Int): AiResult {
        val s = settings()
        val body = requestBody(s.textModel, system, maxTokens) {
            put("content", user)
        }
        return send(s, body)
    }

    /** Image prompt (vision model); mime is "image/png" or "image/jpeg". */
    fun chatJsonWithImage(system: String, userText: String, mime: String, image: ByteArray, maxTokens: Int): AiResult {
        if (image.size > MAX_IMAGE_BYTES) {
            return AiResult.Failure("image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB, too big for the AI image API")
        }
        val s = settings()
        val dataUrl = "data:$mime;base64," + Base64.getEncoder().encodeToString(image)
        val body = requestBody(s.imageModel, system, maxTokens) {
            putJsonArray("content") {
                addJsonObject {
                    put("type", "text")
                    put("text", userText)
                }
                addJsonObject {
                    put("type", "image_url")
                    putJsonObject("image_url") { put("url", dataUrl) }
                }
            }
        }
        return send(s, body)
    }

    private fun requestBody(
        model: String,
        system: String,
        maxTokens: Int,
        userContent: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit
    ): Pair<String, String> = model to buildJsonObject {
        put("model", model)
        putJsonArray("messages") {
            addJsonObject {
                put("role", "system")
                put("content", system)
            }
            addJsonObject {
                put("role", "user")
                userContent()
            }
        }
        put("temperature", 0.2)
        putJsonObject("response_format") { put("type", "json_object") }
        put("max_tokens", maxTokens)
    }.toString()

    private fun send(s: Settings, modelAndBody: Pair<String, String>): AiResult {
        val apiKey = s.apiKey ?: return AiResult.Failure("no API key, GROQ_API_KEY not set")
        val (model, body) = modelAndBody
        val request = try {
            HttpRequest.newBuilder(URI.create("${s.baseUrl.trimEnd('/')}/chat/completions"))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer $apiKey")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        } catch (e: IllegalArgumentException) {
            return AiResult.Failure("invalid GROQ_BASE_URL")
        }

        return try {
            var response = http.send(request, HttpResponse.BodyHandlers.ofString())
            if (response.statusCode() == 429 || response.statusCode() >= 500) {
                // One retry, honouring Retry-After (seconds) up to 5 s
                val waitMs = response.headers().firstValue("retry-after").orElse(null)
                    ?.toDoubleOrNull()?.let { (it * 1000).toLong() } ?: 1_000L
                Thread.sleep(waitMs.coerceIn(0, MAX_RETRY_WAIT_MS))
                response = http.send(request, HttpResponse.BodyHandlers.ofString())
            }
            if (response.statusCode() != 200) {
                return AiResult.Failure("AI API returned HTTP ${response.statusCode()}")
            }

            val content = json.parseToJsonElement(response.body()).jsonObject["choices"]
                ?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonObject
                ?.get("content")?.jsonPrimitive?.contentOrNull
                ?: return AiResult.Failure("AI response had no message content")
            val data = runCatching { json.parseToJsonElement(content) }.getOrNull() as? JsonObject
                ?: return AiResult.Failure("AI answer was not a JSON object")
            AiResult.Success(data, model)
        } catch (e: java.net.http.HttpTimeoutException) {
            AiResult.Failure("AI request timed out after ${TIMEOUT.seconds} s")
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            AiResult.Failure("AI request interrupted")
        } catch (e: Exception) {
            // Never include the key or the request in the message
            AiResult.Failure("AI request failed (${e.javaClass.simpleName})")
        }
    }

    private fun settings(): Settings = Settings(
        apiKey = System.getenv("GROQ_API_KEY")?.trim()?.ifEmpty { null },
        textModel = DEFAULT_TEXT_MODEL,
        imageModel = DEFAULT_IMAGE_MODEL,
        baseUrl = System.getenv("GROQ_BASE_URL")?.trim()?.ifEmpty { null } ?: DEFAULT_BASE_URL
    )

    /** Small helpers for reading model answers safely. */
    fun JsonObject.string(key: String): String? =
        (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content?.trim()?.ifEmpty { null }

    fun JsonObject.number(key: String): Double? =
        (this[key] as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull?.toDoubleOrNull()?.takeIf { it.isFinite() }

    fun JsonObject.stringList(key: String): List<String> =
        (this[key] as? kotlinx.serialization.json.JsonArray)
            ?.mapNotNull { (it as? kotlinx.serialization.json.JsonPrimitive)?.contentOrNull?.trim()?.ifEmpty { null } }
            .orEmpty()
}
