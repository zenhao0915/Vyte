package com.hazendust.vyte.route.invoice

import java.io.File

/**
 * Stores uploaded invoice files under uploads/ in the server's working directory.
 * FileIOUtil only handles text (and resolves into the temp dir), so binary files are written with java.io.File directly.
 */
object InvoiceFiles {
    const val MAX_BYTES = 5L * 1024 * 1024

    private val dir = File("uploads")

    /** Detects the real file type from its first bytes; returns "jpg", "png", "pdf" or null. */
    fun detectType(bytes: ByteArray): String? = when {
        bytes.size >= 3 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xD8.toByte() && bytes[2] == 0xFF.toByte() -> "jpg"
        bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(
            byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)
        ) -> "png"
        bytes.size >= 5 && String(bytes, 0, 5, Charsets.US_ASCII) == "%PDF-" -> "pdf"
        else -> null
    }

    /** Writes the file as uploads/<invoiceId>.<ext> and returns the file name. Throws on IO failure. */
    fun save(invoiceId: String, ext: String, bytes: ByteArray): String {
        ensureDir()
        val file = File(dir, "$invoiceId.$ext")
        file.writeBytes(bytes)
        return file.name
    }

    fun find(fileName: String): File? = File(dir, fileName).takeIf { it.isFile }

    /**
     * The root .gitignore belongs to the teammate, so the folder ignores itself with its own .gitignore.
     */
    private fun ensureDir() {
        dir.mkdirs()
        val ignore = File(dir, ".gitignore")
        if (!ignore.exists()) {
            ignore.writeText("# Uploaded invoice files (created by the Invoice module) - never commit\n*\n")
        }
    }
}
