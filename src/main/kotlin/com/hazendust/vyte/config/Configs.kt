package com.hazendust.vyte.config

import com.hazendust.vyte.util.FileIOUtil
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject

object Configs {
    private val configs = mutableListOf<Configurable>()
    private val jsonPretty = Json {
        prettyPrint = true
        ignoreUnknownKeys = true
    }

    object Backend : Configurable("BackEnd") {
        var serviceName by value("ServiceName", "Vyte Server")
        var serviceHost by value("ServiceHost", "0.0.0.0")
        var servicePort by value("ServicePort", 8080)
    }

    init {
        configs.add(Backend)
    }

    fun init(configPath: String = "config.json") {
        if (FileIOUtil.exists(configPath)) {
            try {
                loadConfig(configPath)
                println("[$configPath] Config loaded!")
            } catch (e: Exception) {
                println("[Error] Config Load Failed, Using Default Value: ${e.message}")
            }
        }
        saveConfig(configPath)
    }

    fun loadConfig(path: String = "config.json") {
        val content = FileIOUtil.readText(path) ?: return
        val rootObject = jsonPretty.parseToJsonElement(content).jsonObject
        configs.forEach { conf ->
            rootObject[conf.name]?.jsonObject?.let { jo ->
                conf.getValue(jo)
            }
        }
    }

    fun saveConfig(path: String = "config.json") = runCatching {
        val rootObj = buildJsonObject {
            configs.forEach {
                put(it.name, it.saveValue())
            }
        }
        val output = jsonPretty.encodeToString(JsonObject.serializer(), rootObj)
        FileIOUtil.writeText(path, output)
    }.getOrElse {
        println("Failed to save config: ${it.message}")
    }
}