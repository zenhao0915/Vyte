// FILE: src/main/kotlin/com/hazendust/vyte/route/ai/AiService.kt
package com.hazendust.vyte.route.ai

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.util.Base64

object AiService {
    const val DEFAULT_TEXT_MODEL = "gemini-3.5-flash-lite"
    const val DEFAULT_IMAGE_MODEL = "gemini-3.5-flash-lite"
    private const val FALLBACK_MODEL = "gemini-3.1-flash-lite"

    private const val DEFAULT_GEMINI_API_KEY = ""

    private val TIMEOUT: Duration = Duration.ofSeconds(60)
    private const val MAX_RETRIES = 2
    private const val MAX_RETRY_WAIT_MS = 3_000L

    const val MAX_IMAGE_BYTES = 4L * 1024 * 1024

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(10))
        .build()

    @Volatile
    private var preferredGatewayIndex: Int = 0

    sealed interface AiResult {
        data class Success(val data: JsonObject, val model: String) : AiResult
        data class Failure(val reason: String) : AiResult
    }

    fun isConfigured(): Boolean = resolveApiKey() != null

    fun testConnection(): AiResult = chatJson(
        system = "You are a test ping agent.",
        user = "Respond with JSON: {\"status\": \"ok\"}",
        maxTokens = 64
    )

    fun chatJson(system: String, user: String, maxTokens: Int): AiResult {
        val apiKey = resolveApiKey() ?: return AiResult.Failure("Gemini API key not configured")
        val body = buildGeminiRequestBody(
            system = system,
            userText = user,
            mime = null,
            imageBase64 = null,
            maxTokens = maxTokens
        )
        return sendWithGatewayFallback(apiKey, DEFAULT_TEXT_MODEL, body)
    }

    fun chatJsonWithImage(system: String, userText: String, mime: String, image: ByteArray, maxTokens: Int): AiResult {
        if (image.size > MAX_IMAGE_BYTES) {
            return AiResult.Failure("image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB, too big for the AI image API")
        }
        val apiKey = resolveApiKey() ?: return AiResult.Failure("Gemini API key not configured")
        val b64 = Base64.getEncoder().encodeToString(image)
        val body = buildGeminiRequestBody(
            system = system,
            userText = userText,
            mime = mime,
            imageBase64 = b64,
            maxTokens = maxTokens
        )
        return sendWithGatewayFallback(apiKey, DEFAULT_IMAGE_MODEL, body)
    }

    private fun buildGeminiRequestBody(
        system: String,
        userText: String,
        mime: String?,
        imageBase64: String?,
        maxTokens: Int
    ): String = buildJsonObject {
        if (system.isNotBlank()) {
            putJsonObject("systemInstruction") {
                putJsonArray("parts") {
                    addJsonObject { put("text", system) }
                }
            }
        }
        putJsonArray("contents") {
            addJsonObject {
                put("role", "user")
                putJsonArray("parts") {
                    addJsonObject { put("text", userText) }
                    if (!mime.isNullOrBlank() && !imageBase64.isNullOrBlank()) {
                        addJsonObject {
                            putJsonObject("inlineData") {
                                put("mimeType", mime)
                                put("data", imageBase64)
                            }
                        }
                    }
                }
            }
        }
        putJsonObject("generationConfig") {
            put("temperature", 0.2)
            put("responseMimeType", "application/json")
            // 留足输出 Token 余量，防止 JSON 被截断
            put("maxOutputTokens", maxOf(maxTokens * 2, 2048))
            // 关闭冗长思维链以实现毫秒/秒级极速 JSON 返回
            putJsonObject("thinkingConfig") {
                put("thinkingBudget", 0)
            }
        }
    }.toString()

    private fun gatewayUrls(model: String, encodedKey: String): List<String> = listOf(
        "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$encodedKey",
        "https://aiplatform.googleapis.com/v1/publishers/google/models/$model:generateContent?key=$encodedKey"
    )

    private fun sendWithGatewayFallback(apiKey: String, primaryModel: String, body: String): AiResult {
        val encodedKey = URLEncoder.encode(apiKey, StandardCharsets.UTF_8)
        val modelsToTry = listOf(primaryModel, FALLBACK_MODEL).distinct()

        var lastFailure: AiResult.Failure = AiResult.Failure("AI request failed")

        for (model in modelsToTry) {
            val urls = gatewayUrls(model, encodedKey)
            val startIdx = preferredGatewayIndex.coerceIn(0, urls.lastIndex)
            val orderedIndices = listOf(startIdx, 1 - startIdx).distinct()

            for (gwIdx in orderedIndices) {
                val url = urls[gwIdx]
                val res = executeHttp(url, apiKey, model, body)
                if (res is AiResult.Success) {
                    preferredGatewayIndex = gwIdx
                    return res
                }
                if (res is AiResult.Failure) {
                    lastFailure = res
                    // 若是 401/403 网关绑定不匹配或 404 模型未找到，继续尝试备用网关/模型
                    if (res.reason.contains("HTTP 401") || res.reason.contains("HTTP 403") || res.reason.contains("HTTP 404") || res.reason.contains("HTTP 400")) {
                        continue
                    }
                }
            }
        }
        return lastFailure
    }

    private fun executeHttp(url: String, apiKey: String, model: String, body: String): AiResult {
        val request = try {
            HttpRequest.newBuilder(URI.create(url))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .header("x-goog-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        } catch (e: IllegalArgumentException) {
            return AiResult.Failure("Invalid Gemini endpoint URL")
        }

        var attempts = 0
        while (attempts <= MAX_RETRIES) {
            attempts++
            try {
                val response = http.send(request, HttpResponse.BodyHandlers.ofString())
                val status = response.statusCode()

                if (status == 429 || status in 502..504) {
                    if (attempts <= MAX_RETRIES) {
                        val waitMs = (1_000L * attempts).coerceAtMost(MAX_RETRY_WAIT_MS)
                        println("[AiService] Gemini HTTP $status. Retrying in ${waitMs}ms (Attempt $attempts/$MAX_RETRIES)...")
                        Thread.sleep(waitMs)
                        continue
                    }
                }

                // 如果某些网关不支持 thinkingConfig 字段报 400，自动剥离 thinkingConfig 重试一次
                if (status == 400 && body.contains("\"thinkingConfig\"")) {
                    val strippedBody = body.replace(Regex(""",\s*"thinkingConfig"\s*:\s*\{[^}]*\}"""), "")
                    if (strippedBody != body) {
                        return executeHttp(url, apiKey, model, strippedBody)
                    }
                }

                if (status != 200) {
                    val errPreview = response.body().take(250).replace("\n", " ")
                    System.err.println("[AiService] Gemini HTTP $status ($model): $errPreview")
                    return AiResult.Failure("AI API returned HTTP $status: $errPreview")
                }

                val root = json.parseToJsonElement(response.body()).jsonObject
                val parts = root["candidates"]
                    ?.jsonArray?.firstOrNull()?.jsonObject
                    ?.get("content")?.jsonObject
                    ?.get("parts")?.jsonArray
                    ?: return AiResult.Failure("Gemini response had no candidate parts")

                // 取最后一个含文本的 part（跳过可能存在的 thought part）
                val content = parts.mapNotNull { part ->
                    val obj = part.jsonObject
                    if (obj["thought"]?.jsonPrimitive?.contentOrNull == "true") null
                    else obj["text"]?.jsonPrimitive?.contentOrNull
                }.lastOrNull() ?: parts.firstOrNull()?.jsonObject?.get("text")?.jsonPrimitive?.contentOrNull
                ?: return AiResult.Failure("Gemini response had no text content")

                val data = extractJsonObject(content)
                    ?: return AiResult.Failure("Gemini answer was not a valid JSON object: ${content.take(100)}")

                return AiResult.Success(data, model)
            } catch (e: java.net.http.HttpTimeoutException) {
                System.err.println("[AiService] Timeout after ${TIMEOUT.seconds}s calling Gemini ($model)")
                return AiResult.Failure("AI request timed out after ${TIMEOUT.seconds}s")
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                return AiResult.Failure("AI request interrupted")
            } catch (e: Exception) {
                System.err.println("[AiService] Request exception: ${e.message}")
                return AiResult.Failure("AI request failed (${e.javaClass.simpleName}: ${e.message})")
            }
        }
        return AiResult.Failure("AI request exceeded retry limit")
    }

    private fun extractJsonObject(raw: String): JsonObject? {
        val trimmed = raw.trim()
        runCatching { json.parseToJsonElement(trimmed) as? JsonObject }.getOrNull()?.let { return it }

        val withoutFences = trimmed
            .replace(Regex("""^```(?:json)?\s*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*```$"""), "")
            .trim()
        runCatching { json.parseToJsonElement(withoutFences) as? JsonObject }.getOrNull()?.let { return it }

        val start = trimmed.indexOf('{')
        val end = trimmed.lastIndexOf('}')
        if (start != -1 && end != -1 && end > start) {
            val substring = trimmed.substring(start, end + 1)
            runCatching { json.parseToJsonElement(substring) as? JsonObject }.getOrNull()?.let { return it }
        }
        return null
    }

    private fun resolveApiKey(): String? =
        (System.getenv("GEMINI_API_KEY")?.trim()?.takeIf { it.isNotEmpty() }
            ?: System.getenv("GOOGLE_API_KEY")?.trim()?.takeIf { it.isNotEmpty() }
            ?: DEFAULT_GEMINI_API_KEY).ifEmpty { null }

    private fun JsonObject.findPrimitive(key: String): JsonPrimitive? {
        (this[key] as? JsonPrimitive)?.let { return it }
        val normalized = key.replace("_", "").lowercase()
        for ((k, v) in entries) {
            if (k.replace("_", "").lowercase() == normalized && v is JsonPrimitive) {
                return v
            }
        }
        return null
    }

    fun JsonObject.string(key: String): String? =
        findPrimitive(key)?.takeIf { it.isString }?.content?.trim()?.ifEmpty { null }

    fun JsonObject.number(key: String): Double? =
        findPrimitive(key)?.contentOrNull?.toDoubleOrNull()?.takeIf { it.isFinite() }

    fun JsonObject.int(key: String): Int? =
        findPrimitive(key)?.contentOrNull?.toIntOrNull()

    fun JsonObject.boolean(key: String): Boolean? =
        findPrimitive(key)?.contentOrNull?.toBooleanStrictOrNull()

    fun JsonObject.stringList(key: String): List<String> {
        val target = this[key] ?: entries.firstOrNull {
            it.key.replace("_", "").equals(key.replace("_", ""), ignoreCase = true)
        }?.value

        return (target as? JsonArray)
            ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.ifEmpty { null } }
            .orEmpty()
    }
}