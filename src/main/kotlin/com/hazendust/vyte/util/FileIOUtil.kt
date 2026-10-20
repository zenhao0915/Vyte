package com.hazendust.vyte.util

import java.io.File

object FileIOUtil {
    private fun resolveFile(path: String): File {
        val file = File(path)
        if (file.isAbsolute) {
            return file
        }
        val baseDir = System.getProperty("java.io.tmpdir") ?: "."
        return File(baseDir, path)
    }

    fun readText(path: String): String? {
        val f = resolveFile(path)
        return if (f.exists()) f.readText() else null
    }

    fun writeText(path: String, content: String) {
        val f = resolveFile(path)
        f.parentFile?.mkdirs()
        f.writeText(content)
    }

    fun exists(path: String): Boolean = resolveFile(path).exists()
}