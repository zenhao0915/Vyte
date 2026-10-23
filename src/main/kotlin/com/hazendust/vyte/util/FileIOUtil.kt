package com.hazendust.vyte.util

import java.io.File

object FileIOUtil {
    private fun resolveFile(path: String): File {
        val file = File(path)
        return if (file.isAbsolute) file else File("data", path)
    }
    
    fun readText(path: String): String? = resolveFile(path).takeIf { it.exists() }?.readText()

    fun writeText(path: String, content: String) {
        val f = resolveFile(path)
        f.parentFile?.mkdirs()
        f.writeText(content)
    }
    fun exists(path: String): Boolean = resolveFile(path).exists()
}