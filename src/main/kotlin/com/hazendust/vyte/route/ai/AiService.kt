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
import java.time.Duration
import java.util.Base64

/**
 * RunPod vLLM chat completions (OpenAI-compatible) using only JDK HttpClient and kotlinx.serialization.
 * 具备 Markdown 括号清洗、大小写/下划线容错、冷启动重试机制与多模态视觉智能路由。
 */
object AiService {
    const val DEFAULT_TEXT_MODEL = "Qwen/Qwen2.5-Coder-7B-Instruct"
    const val DEFAULT_IMAGE_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"

    // 默认指向你的 RunPod Serverless 实例 (Endpoint ID: 59c1b77t92ft7p)
    private const val DEFAULT_RUNPOD_ENDPOINT = "59c1b77t92ft7p"
    private const val DEFAULT_RUNPOD_API_KEY = "rpa_71ETCQ89K3VQRADCD1O9V23E6V5PRK1SVKXWC2BHo5x0ny"

    // Serverless 冷启动加载模型需要更充裕的超时窗口 (90s)
    private val TIMEOUT: Duration = Duration.ofSeconds(90)
    private const val MAX_RETRIES = 2
    private const val MAX_RETRY_WAIT_MS = 5_000L

    const val MAX_IMAGE_BYTES = 3L * 1024 * 1024

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    private val http: HttpClient = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .build()

    sealed interface AiResult {
        data class Success(val data: JsonObject, val model: String) : AiResult
        data class Failure(val reason: String) : AiResult
    }

    private data class Settings(
        val textApiKey: String?,
        val textModel: String,
        val textBaseUrl: String,
        val imageApiKey: String?,
        val imageModel: String,
        val imageBaseUrl: String
    )

    fun isConfigured(): Boolean = settings().textApiKey != null

    /** 快速心跳检测，可用于项目启动时检验 RunPod 是否在线 */
    fun testConnection(): AiResult = chatJson(
        system = "You are a test ping agent.",
        user = "Respond with JSON: {\"status\": \"ok\"}",
        maxTokens = 20
    )

    /** 文本 Prompt：模型必须返回 JSON 结构 */
    fun chatJson(system: String, user: String, maxTokens: Int): AiResult {
        val s = settings()
        val apiKey = s.textApiKey ?: return AiResult.Failure("RunPod API key not configured")
        val body = requestBody(s.textModel, system, maxTokens) {
            put("content", user)
        }
        return send(apiKey, s.textBaseUrl, s.textModel, body)
    }

    /** 视觉图片 Prompt：自动路由到 Groq（若有 Key）或默认视觉端点，避免撞向不支持视觉的纯文本 RunPod */
    fun chatJsonWithImage(system: String, userText: String, mime: String, image: ByteArray, maxTokens: Int): AiResult {
        if (image.size > MAX_IMAGE_BYTES) {
            return AiResult.Failure("image is larger than ${MAX_IMAGE_BYTES / 1024 / 1024} MB, too big for the AI image API")
        }
        val s = settings()
        val apiKey = s.imageApiKey ?: return AiResult.Failure(
            "Vision model requires a valid GROQ_API_KEY (RunPod text endpoint cannot process images)"
        )

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
        return send(apiKey, s.imageBaseUrl, s.imageModel, body)
    }

    private fun requestBody(
        model: String,
        system: String,
        maxTokens: Int,
        userContent: kotlinx.serialization.json.JsonObjectBuilder.() -> Unit
    ): String = buildJsonObject {
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

    private fun send(apiKey: String, baseUrl: String, model: String, body: String): AiResult {
        val url = if (baseUrl.endsWith("/chat/completions")) baseUrl else "${baseUrl.trimEnd('/')}/chat/completions"
        val request = try {
            HttpRequest.newBuilder(URI.create(url))
                .timeout(TIMEOUT)
                .header("Authorization", "Bearer $apiKey")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build()
        } catch (e: IllegalArgumentException) {
            return AiResult.Failure("Invalid AI endpoint URL: $url")
        }

        var attempts = 0
        while (attempts <= MAX_RETRIES) {
            attempts++
            try {
                val response = http.send(request, HttpResponse.BodyHandlers.ofString())
                val status = response.statusCode()

                // 处理 429 或 502/503/504 等临时冷启动拥塞状态
                if (status == 429 || status in 502..504) {
                    if (attempts <= MAX_RETRIES) {
                        val retryAfterSec = response.headers().firstValue("retry-after").orElse(null)?.toDoubleOrNull()
                        val waitMs = (retryAfterSec?.let { (it * 1000).toLong() } ?: 2_000L).coerceIn(1_000L, MAX_RETRY_WAIT_MS)
                        println("[AiService] HTTP $status from $url. Retrying in ${waitMs}ms (Attempt $attempts/$MAX_RETRIES)...")
                        Thread.sleep(waitMs)
                        continue
                    }
                }

                if (status != 200) {
                    val errPreview = response.body().take(250).replace("\n", " ")
                    System.err.println("[AiService] Error HTTP $status: $errPreview")
                    return AiResult.Failure("AI API returned HTTP $status: $errPreview")
                }

                val root = json.parseToJsonElement(response.body()).jsonObject
                val content = root["choices"]
                    ?.jsonArray?.firstOrNull()?.jsonObject?.get("message")?.jsonObject
                    ?.get("content")?.jsonPrimitive?.contentOrNull
                    ?: return AiResult.Failure("AI response choices had no message content")

                val data = extractJsonObject(content)
                    ?: return AiResult.Failure("AI answer was not a valid JSON object: ${content.take(100)}")

                return AiResult.Success(data, model)
            } catch (e: java.net.http.HttpTimeoutException) {
                System.err.println("[AiService] Timeout after ${TIMEOUT.seconds}s calling $url")
                return AiResult.Failure("AI request timed out after ${TIMEOUT.seconds}s (possible cold start)")
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

    /**
     * 清洗大模型输出内容：剔除外层的 Markdown 代码块 (```json ... ```) 并提取核心 {...} JSON 对象
     */
    private fun extractJsonObject(raw: String): JsonObject? {
        val trimmed = raw.trim()

        // 1. 直接反序列化尝试
        runCatching { json.parseToJsonElement(trimmed) as? JsonObject }.getOrNull()?.let { return it }

        // 2. 剥离 Markdown 围栏 ```json ... ```
        val withoutFences = trimmed
            .replace(Regex("""^```(?:json)?\s*""", RegexOption.IGNORE_CASE), "")
            .replace(Regex("""\s*```$"""), "")
            .trim()
        runCatching { json.parseToJsonElement(withoutFences) as? JsonObject }.getOrNull()?.let { return it }

        // 3. 兜底提取最外层的 { ... }
        val start = trimmed.indexOf('{')
        val end = trimmed.lastIndexOf('}')
        if (start != -1 && end != -1 && end > start) {
            val substring = trimmed.substring(start, end + 1)
            runCatching { json.parseToJsonElement(substring) as? JsonObject }.getOrNull()?.let { return it }
        }
        return null
    }

    private fun settings(): Settings {
        val runpodKey = System.getenv("RUNPOD_API_KEY")?.trim() ?: DEFAULT_RUNPOD_API_KEY
        val groqKey = System.getenv("GROQ_API_KEY")?.trim()

        val endpointId = System.getenv("RUNPOD_ENDPOINT_ID")?.trim() ?: DEFAULT_RUNPOD_ENDPOINT
        val customBaseUrl = System.getenv("RUNPOD_BASE_URL")?.trim()

        val textBaseUrl = when {
            !customBaseUrl.isNullOrEmpty() -> customBaseUrl
            endpointId.isNotBlank() -> "https://api.runpod.ai/v2/$endpointId/openai/v1"
            else -> "https://api.groq.com/openai/v1"
        }

        val textModel = System.getenv("RUNPOD_TEXT_MODEL") ?: DEFAULT_TEXT_MODEL
        val imageModel = System.getenv("RUNPOD_IMAGE_MODEL") ?: DEFAULT_IMAGE_MODEL
        val imageBaseUrl = System.getenv("GROQ_BASE_URL")?.trim() ?: "https://api.groq.com/openai/v1"

        return Settings(
            textApiKey = runpodKey.ifEmpty { null },
            textModel = textModel,
            textBaseUrl = textBaseUrl,
            imageApiKey = groqKey?.ifEmpty { null },
            imageModel = imageModel,
            imageBaseUrl = imageBaseUrl
        )
    }

    // ==========================================
    // 弹性属性解析辅助工具（支持驼峰、下划线及大小写容错）
    // ==========================================

    private fun JsonObject.findPrimitive(key: String): JsonPrimitive? {
        // 1. 精确匹配
        (this[key] as? JsonPrimitive)?.let { return it }

        // 2. 忽略大小写及下划线（例如 ai_suggestion 与 aiSuggestion 均能命中）
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