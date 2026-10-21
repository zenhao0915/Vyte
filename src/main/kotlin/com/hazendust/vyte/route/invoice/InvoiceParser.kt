package com.hazendust.vyte.route.invoice

/**
 * Rule-based invoice text parser (placeholder until AI categorisation is added).
 */
object InvoiceParser {
    data class Parsed(
        val party: String,
        val amountRM: Double?,
        val category: String,
        val aiConfidence: Int,
        val invNo: String?
    )

    // Checked in order; the first rule with a matching keyword wins
    private val CATEGORY_RULES = listOf(
        "Packaging & Supplies" to Regex("""\b(packaging|box|boxes|plastic|plastics)\b""", RegexOption.IGNORE_CASE),
        "Logistics & Freight" to Regex("""\b(delivery|deliveries|lalamove|courier|freight)\b""", RegexOption.IGNORE_CASE),
        "Utilities & Rent" to Regex("""\b(tnb|electric|electricity|water|rent|rental)\b""", RegexOption.IGNORE_CASE),
        "Inventory Procurement" to Regex("""\b(flour|stock|ingredient|ingredients|supplier)\b""", RegexOption.IGNORE_CASE),
        "Product Sales" to Regex("""\b(customer|sale|sales)\b""", RegexOption.IGNORE_CASE)
    )

    // "RM 1,234.50", "RM12", "rm 3.5"
    private val RM_AMOUNT = Regex("""RM\s*(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)""", RegexOption.IGNORE_CASE)

    // Any number with exactly 2 decimals: "1,234.50", "88.00"
    private val DECIMAL_AMOUNT = Regex("""(?<![\d.])(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})(?![\d.])""")

    // "Invoice No: KP-2026-118", "INV #A1023", "Bill Number 77/2026"; the value must contain a digit
    private val INVOICE_NO = Regex("""\b(?:invoice|inv|bill)\s*(?:no\.?|number|#)\s*[:#.]?\s*([A-Za-z0-9][A-Za-z0-9\-/]*\d[A-Za-z0-9\-/]*)""", RegexOption.IGNORE_CASE)

    fun parse(rawText: String): Parsed {
        val party = rawText.lineSequence()
            .map { it.trim() }
            .firstOrNull { it.isNotEmpty() }
            ?.take(120)
            ?: "Unknown"

        val amounts = (RM_AMOUNT.findAll(rawText) + DECIMAL_AMOUNT.findAll(rawText))
            .mapNotNull { it.groupValues[1].replace(",", "").toDoubleOrNull() }
            .toList()

        val matchedCategory = CATEGORY_RULES.firstOrNull { (_, regex) -> regex.containsMatchIn(rawText) }?.first

        return Parsed(
            party = party,
            amountRM = amounts.maxOrNull(),
            category = matchedCategory ?: "Uncategorised",
            aiConfidence = if (matchedCategory != null) 90 else 60,
            invNo = INVOICE_NO.find(rawText)?.groupValues?.get(1)
        )
    }
}
