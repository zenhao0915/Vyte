package com.hazendust.vyte.config

import kotlinx.serialization.json.*
import kotlin.properties.ReadWriteProperty
import kotlin.reflect.KProperty

open class Configurable(var name: String) {
    private val values = mutableListOf<ConfigValue<*>>()
    fun saveValue(): JsonObject = buildJsonObject { values.forEach { it.save(this) } }
    fun getValue(jsonObject: JsonObject) = values.forEach { it.load(jsonObject) }
    fun <T> register(v: ConfigValue<T>): ConfigValue<T> = v.also { values.add(it) }
}

class ConfigValue<T>(
    val name: String,
    var value: T,
    private val saver: (JsonObjectBuilder, String, T) -> Unit,
    private val loader: (JsonObject, String, T) -> T
) : ReadWriteProperty<Any?, T> {
    fun save(b: JsonObjectBuilder) = saver(b, name, value)
    fun load(jo: JsonObject) { value = loader(jo, name, value) }
    override fun getValue(thisRef: Any?, property: KProperty<*>): T = value
    override fun setValue(thisRef: Any?, property: KProperty<*>, value: T) { this.value = value }
}

fun Configurable.value(name: String, default: String) = register(ConfigValue(name, default, { b, k, v -> b.put(k, v) }, { jo, k, d -> jo[k]?.jsonPrimitive?.contentOrNull ?: d }))
fun Configurable.value(name: String, default: Int) = register(ConfigValue(name, default, { b, k, v -> b.put(k, v) }, { jo, k, d -> jo[k]?.jsonPrimitive?.intOrNull ?: d }))
fun Configurable.value(name: String, default: Float) = register(ConfigValue(name, default, { b, k, v -> b.put(k, v) }, { jo, k, d -> jo[k]?.jsonPrimitive?.floatOrNull ?: d }))
fun Configurable.value(name: String, default: Boolean) = register(ConfigValue(name, default, { b, k, v -> b.put(k, v) }, { jo, k, d -> jo[k]?.jsonPrimitive?.booleanOrNull ?: d }))
fun Configurable.value(name: String, default: List<String>) = register(ConfigValue(name, default,
    { b, k, v -> b.put(k, buildJsonArray { v.forEach { add(JsonPrimitive(it)) } }) },
    { jo, k, d -> jo[k]?.jsonArray?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: d }
))
inline fun <reified T : Enum<T>> Configurable.enumValue(name: String, default: T) = register(ConfigValue(name, default,
    { b, k, v -> b.put(k, v.name) },
    { jo, k, d -> jo[k]?.jsonPrimitive?.contentOrNull?.let { s -> enumValues<T>().firstOrNull { it.name == s } } ?: d }
))