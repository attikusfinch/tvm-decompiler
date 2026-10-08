package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange

/** Runs after Tolk emission. Rules edit complete, narrowly matched functions and retain an audit trail. */
internal object TolkNormalizer {
    data class Result(val main: String, val changes: List<NormalizationChange>)
    internal data class Edit(val start: Int, val end: Int, val replacement: String, val change: NormalizationChange)
    internal fun interface Rule { fun edits(source: TolkSource): List<Edit> }
    private val rules = listOf(AddressGetterReturnRule, OwnerGetterRule)

    fun normalize(main: String): Result {
        var code = main
        val changes = mutableListOf<NormalizationChange>()
        for (rule in rules) {
            val edits = rule.edits(TolkSource(code)).sortedByDescending { it.start }
            check(edits.zipWithNext().all { (right, left) -> left.end <= right.start }) { "Overlapping normalization edits" }
            for (edit in edits) {
                code = code.replaceRange(edit.start, edit.end, edit.replacement)
                changes += edit.change
            }
        }
        return Result(code, changes.distinct())
    }
}

/** A standalone getter returning LDSTDADDR can expose address, without a slice cast or temporary. */
private object AddressGetterReturnRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val id = function.methodId ?: continue
            if (id !in 0x10000..0x1ffff || function.result.map { it.value } != listOf("slice")
                || source.references(function.name.value) != 1) continue // Do not change internal call-site types.
            val body = function.body
            if (body.size < 15 || body.any { it.value in setOf("{", "}") } || body.count { it.value == "return" } != 1) continue
            if (body.takeLast(3).map { it.value }.let { it.size != 3 || it.first() != "return" || it.last() != ";" }) continue
            val returnName = body[body.size - 2]
            val declarationEnd = body.size - 3
            val declarationStart = body.take(declarationEnd - 1).indexOfLast { it.value == ";" } + 1
            val declaration = body.subList(declarationStart, declarationEnd)
            if (declaration.size < 12 || declaration.take(4).map { it.value } != listOf("val", returnName.value, "=", "(")
                || declaration.takeLast(4).map { it.value } != listOf("as", "slice", ")", ";")) continue
            val expression = declaration.subList(4, declaration.size - 4)
            if (expression.size <= 4 || expression.takeLast(4).map { it.value } != listOf(".", "loadAddress", "(", ")")) continue
            // Preserve comments attached to either statement rather than discarding them during folding.
            val span = source.text.substring(declaration.first().start, body.last().end)
            if (span.contains("//") || span.contains("/*")) continue
            val value = source.text.substring(expression.first().start, expression.last().end)
            val change = NormalizationChange("address-getter-return", id.toString(), function.name.value)
            add(TolkNormalizer.Edit(function.result.single().start, function.result.single().end, "address", change))
            add(TolkNormalizer.Edit(declaration.first().start, body.last().end, "return $value;", change))
        }
    }
}

/** owner is an ABI candidate, not a recovered source name. Hash/signature/collision checks are mandatory. */
private object OwnerGetterRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        if (source.references("owner") != 0) return@buildList
        for (function in source.functions) {
            if (function.alreadyGetter || function.methodId != getterMethodId("owner") || function.parameters.isNotEmpty()
                || function.result.map { it.value } != listOf("address") || source.references(function.name.value) != 1) continue
            val annotation = function.annotation ?: continue
            val annotationSpan = source.text.substring(annotation.start, function.keyword.end)
            if (annotationSpan.contains("//") || annotationSpan.contains("/*")) continue
            // Restrict renaming to the emitter's anonymous method name; leave user-selected names alone.
            if (function.name.value != "fn_${function.methodId}") continue
            val change = NormalizationChange("owner-getter-name", function.methodId.toString(), "owner")
            add(TolkNormalizer.Edit(annotation.start, function.keyword.end,
                "// Name inferred from method ID ${function.methodId}; original name may differ.\nget fun", change))
            add(TolkNormalizer.Edit(function.name.start, function.name.end, "owner", change))
        }
    }

    private fun getterMethodId(name: String): Int {
        var crc = 0
        for (byte in name.toByteArray(Charsets.UTF_8)) {
            crc = crc xor ((byte.toInt() and 0xff) shl 8)
            repeat(8) { crc = ((crc shl 1) xor if (crc and 0x8000 != 0) 0x1021 else 0) and 0xffff }
        }
        return crc or 0x10000
    }
}
