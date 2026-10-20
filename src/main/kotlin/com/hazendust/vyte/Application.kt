package com.hazendust.vyte

import com.hazendust.vyte.config.Configs
import com.hazendust.vyte.manager.DatabaseManager
import com.hazendust.vyte.manager.RouteManager
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.server.application.*
import io.ktor.server.cio.*
import io.ktor.server.engine.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.cors.routing.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.Json

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
            Runtime.getRuntime().addShutdownHook(Thread {
                stop()
            })
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
                connectionIdleTimeoutSeconds = 15
                reuseAddress = true
                connector {
                    this.host = bindHost
                    this.port = bindPort
                }
            },
            module = Application::vyteServerModule
        )

        isRunning = true
        println("[ServerEngine] Vyte Engine successfully running on $bindHost:$bindPort (Env PORT: $envPort)")

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

fun Application.vyteServerModule() {
    install(ContentNegotiation) {
        json(Json {
            prettyPrint = true
            isLenient = true
            ignoreUnknownKeys = true
        })
    }

    install(CORS) {
        anyHost()
        allowHeader(HttpHeaders.ContentType)
        allowHeader(HttpHeaders.Authorization)
        allowMethod(HttpMethod.Options)
        allowMethod(HttpMethod.Put)
        allowMethod(HttpMethod.Patch)
        allowMethod(HttpMethod.Delete)
        allowMethod(HttpMethod.Post)
        allowMethod(HttpMethod.Get)
    }

    routing {
        RouteManager.registerAll(this)
    }
}