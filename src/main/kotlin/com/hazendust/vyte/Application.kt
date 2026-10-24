// FILE: src/main/kotlin/com/hazendust/vyte/Application.kt
package com.hazendust.vyte

import com.hazendust.vyte.config.Configs
import com.hazendust.vyte.data.WorkspaceContext
import com.hazendust.vyte.manager.DatabaseManager
import com.hazendust.vyte.manager.RouteManager
import com.hazendust.vyte.route.auth.AuthController
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.request.*
import io.ktor.server.routing.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.LocalTime
import java.time.format.DateTimeFormatter

fun main(args: Array<String>) = VyteServerEngine.start()

object VyteServerEngine {
    private var server: EmbeddedServer<*, *>? = null
    var isRunning: Boolean = false
        private set

    private var isShutdownHookRegistered = false

    fun start() {
        if (isRunning) return
        println("[ServerEngine] Starting Vyte Engine for Team Haze&Dust...")

        if (!isShutdownHookRegistered) {
            Runtime.getRuntime().addShutdownHook(Thread { stop() })
            isShutdownHookRegistered = true
        }

        Configs.init()
        DatabaseManager.init()

        val bindHost = Configs.Backend.serviceHost
        val envPort = System.getenv("PORT")?.toIntOrNull()
        val bindPort = envPort ?: Configs.Backend.servicePort

        server = embeddedServer(
            factory = CIO,
            configure = {
                connectionIdleTimeoutSeconds = 30
                reuseAddress = true
                connector {
                    this.host = bindHost
                    this.port = bindPort
                }
            },
            module = Application::vyteServerModule
        )

        isRunning = true
        println("[ServerEngine] Vyte Engine running on http://$bindHost:$bindPort (Env PORT: $envPort)")
        server?.start(wait = true)
    }

    fun stop() {
        if (!isRunning) return
        println("[ServerEngine] Stopping Vyte Engine...")
        server?.stop(1000, 2000)
        server = null
        isRunning = false
        DatabaseManager.closeAndReset()
        println("[ServerEngine] Stopped cleanly.")
    }
}

private val LOG_TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss")
private val MUTATING_METHODS = setOf(HttpMethod.Post, HttpMethod.Put, HttpMethod.Patch, HttpMethod.Delete)

fun Application.vyteServerModule() {
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = false
            isLenient = true
            ignoreUnknownKeys = true
            encodeDefaults = true
        })
    }

    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowHeader("X-Workspace-ID")
        allowHeader("X-User-ID")
        allowHeader("X-User-Role")
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Get)
    }

    intercept(ApplicationCallPipeline.Plugins) {
        val rawTenant = call.request.headers["X-Workspace-ID"]
            ?: call.request.headers["X-User-ID"]
            ?: AuthController.resolveTenantFromToken(call.request.headers[HttpHeaders.Authorization])
            ?: call.request.queryParameters["userID"]
            ?: "default"
        val tenantId = WorkspaceContext.sanitizeTenantId(rawTenant)
        val startNs = System.nanoTime()
        val method = call.request.httpMethod
        val uri = call.request.uri

        withContext(WorkspaceContext.asCoroutineElement(tenantId)) {
            try {
                proceed()
            } finally {
                // 只要是写操作 (POST / PUT / PATCH / DELETE)，自动将该租户的 Workspace 同步持久化到 SQLite
                if (method in MUTATING_METHODS && DatabaseManager.isReady) {
                    withContext(Dispatchers.IO) {
                        DatabaseManager.saveWorkspace(WorkspaceContext.current())
                    }
                }
                val elapsedMs = (System.nanoTime() - startNs) / 1_000_000
                val status = call.response.status()?.value ?: 200
                val now = LocalTime.now().format(LOG_TIME_FMT)
                println("[API $now] [$tenantId] ${method.value} $uri -> $status (${elapsedMs}ms)")
            }
        }
    }

    routing {
        RouteManager.registerAll(this)
    }
}