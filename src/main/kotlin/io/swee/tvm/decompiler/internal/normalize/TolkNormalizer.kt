package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange

/** Runs after Tolk emission. Rules edit complete, narrowly matched functions and retain an audit trail. */
internal object TolkNormalizer {
    data class Result(val main: String, val changes: List<NormalizationChange>)
    internal data class Edit(val start: Int, val end: Int, val replacement: String, val change: NormalizationChange)
    internal fun interface Rule { fun edits(source: TolkSource): List<Edit> }
    private val rules = listOf(AddressGetterReturnRule, NativeNullCheckRule, BooleanGuardRule,
        IntegerMatchRule, ConditionalSelectRule, CursorLoadRule, PrefixMatchRule, GetterNameRule)

    fun normalize(main: String): Result {
        var code = main
        val changes = mutableListOf<NormalizationChange>()
        for (rule in rules) {
            while (true) {
                val edits = rule.edits(TolkSource(code)).sortedByDescending { it.start }
                if (edits.isEmpty()) break
                check(edits.zipWithNext().all { (right, left) -> left.end <= right.start }) { "Overlapping normalization edits" }
                val previous = code
                for (edit in edits) {
                    code = code.replaceRange(edit.start, edit.end, edit.replacement)
                    changes += edit.change
                }
                check(code != previous) { "Normalization rule made no progress" }
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

/** These are ABI candidates, not recovered source names. Hash/signature/collision checks are mandatory. */
private object GetterNameRule : TolkNormalizer.Rule {
    private data class Candidate(val name: String, val arguments: List<String>, val result: String)
    private val candidates = listOf(
        Candidate("owner", emptyList(), "address"),
        Candidate("currentCounter", emptyList(), "int"),
        Candidate("get_nft_data", emptyList(), "(int,int,slice,slice,cell)"),
        Candidate("get_collection_data", emptyList(), "(int,cell,slice)"),
        Candidate("get_nft_address_by_index", listOf("int"), "slice"),
        Candidate("royalty_params", emptyList(), "(int,int,slice)"),
        Candidate("get_nft_content", listOf("int", "cell"), "cell"),
        Candidate("get_wallet_data", emptyList(), "(int,slice,slice,cell)"),
        Candidate("get_jetton_data", emptyList(), "(int,int,slice,cell,cell)"),
        Candidate("get_wallet_address", listOf("slice"), "slice"),
        Candidate("get_next_admin_address", emptyList(), "slice"),
        Candidate("extensionInfo", emptyList(), "(slice,slice,int,int,int)"),
        Candidate("is_signature_allowed", emptyList(), "int"),
        Candidate("seqno", emptyList(), "int"),
        Candidate("get_subwallet_id", emptyList(), "int"),
        Candidate("get_public_key", emptyList(), "int"),
        Candidate("get_extensions", emptyList(), "cell"),
    ).groupBy { getterMethodId(it.name) }

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val candidate = candidates[function.methodId]?.singleOrNull() ?: continue
            if (function.alreadyGetter || source.references(candidate.name) != 0
                || function.result.joinToString("") { it.value } != candidate.result
                || argumentTypes(function.parameters) != candidate.arguments || source.references(function.name.value) != 1) continue
            val annotation = function.annotation ?: continue
            val annotationSpan = source.text.substring(annotation.start, function.keyword.end)
            if (annotationSpan.contains("//") || annotationSpan.contains("/*")) continue
            // Restrict renaming to the emitter's anonymous method name; leave user-selected names alone.
            if (function.name.value != "fn_${function.methodId}") continue
            val change = NormalizationChange(if (candidate.name == "owner") "owner-getter-name" else "abi-getter-name",
                function.methodId.toString(), candidate.name)
            add(TolkNormalizer.Edit(annotation.start, function.keyword.end,
                "// Name inferred from method ID ${function.methodId}; original name may differ.\nget fun", change))
            add(TolkNormalizer.Edit(function.name.start, function.name.end, candidate.name, change))
        }
    }

    private fun argumentTypes(tokens: List<TolkSource.Token>): List<String>? {
        if (tokens.isEmpty()) return emptyList()
        val arguments = mutableListOf<String>()
        var start = 0
        for (index in 0..tokens.size) if (index == tokens.size || tokens[index].value == ",") {
            val argument = tokens.subList(start, index)
            if (argument.size != 3 || !argument[0].identifier || argument[1].value != ":") return null
            arguments += argument[2].value
            start = index + 1
        }
        return arguments
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
