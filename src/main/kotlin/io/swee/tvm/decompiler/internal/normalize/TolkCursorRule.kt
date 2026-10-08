package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.integer

/** Make cursor updates explicit without replacing LDUX/LDIX with constant-width opcodes. */
internal object CursorLoadRule : TolkNormalizer.Rule {
    private data class Load(val method: String, val opcode: String, val width: Boolean = true)
    private val loads = mapOf(
        "tvmLoadUint" to Load("loadUintExact", "LDUX"),
        "tvmLoadInt" to Load("loadIntExact", "LDIX"),
        "tvmLoadGrams" to Load("loadCoinsExact", "LDGRAMS", false),
    )

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val used = linkedSetOf<Load>()
        val generated = mutableSetOf<String>()
        for (function in source.functions) {
            val tokens = function.body
            var index = 0
            while (index < tokens.size) {
                val start = index++
                if (tokens[start].value != "var" || tokens.getOrNull(start + 1)?.value != "(") continue
                val close = closingParenthesis(tokens, start + 1) ?: continue
                val names = tokens.subList(start + 2, close)
                if (names.size != 3 || !names[0].identifier || names[1].value != "," || !names[2].identifier
                    || names[0].value == names[2].value && names[0].value != "_"
                    || tokens.getOrNull(close + 1)?.value != "=") continue
                val helper = tokens.getOrNull(close + 2)?.value ?: continue
                val load = loads[helper] ?: continue
                if (source.definesFunction(helper) || source.references(load.method) != 0) continue
                val end = closingParenthesis(tokens, close + 3) ?: continue
                if (tokens.getOrNull(end + 1)?.value != ";" || source.hasComments(tokens[start].start, tokens[end + 1].end)) continue
                val arguments = tokens.subList(close + 4, end)
                if (arguments.isEmpty() || !arguments.first().identifier) continue
                val receiver = arguments.first().value
                val width = if (load.width) {
                    if (arguments.getOrNull(1)?.value != ",") continue
                    arguments.drop(2).takeIf { integer(it) != null || it.size == 1 && it.single().identifier } ?: continue
                } else {
                    if (arguments.size != 1) continue
                    emptyList()
                }
                val declared = names.filter { it.identifier && it.value != "_" }.map { it.value }
                // New bindings must not capture the receiver/width or reuse existing scoped names.
                if (declared.any { name -> name == receiver || width.any { it.identifier && it.value == name }
                        || function.parameters.any { it.identifier && it.value == name }
                        || bindingCount(tokens, name) != 1 }) continue
                val indentation = source.text.substring(source.text.lastIndexOf('\n', tokens[start].start) + 1, tokens[start].start)
                // Unlike dispatch, cursor loads also occur on a one-line source. Preserve its space.
                val indent = indentation.takeIf { it.all(Char::isWhitespace) } ?: ""
                var cursor = names[0].value
                if (cursor == "_") {
                    cursor = "cursor"
                    var suffix = 2
                    while (source.references(cursor) != 0 || cursor in generated) cursor = "cursor${suffix++}"
                    generated += cursor
                }
                val argument = if (width.isEmpty()) "" else source.code(width)
                val value = names[2].value
                val call = "$cursor.${load.method}($argument);"
                val replacement = "var $cursor = $receiver;\n$indent" + if (value == "_") call else "var $value = $call"
                val change = function.change("cursor-load")
                add(TolkNormalizer.Edit(tokens[start].start, tokens[end + 1].end, replacement, change))
                used += load
                index = end + 2
            }
        }
        if (used.isNotEmpty()) {
            val insertion = source.tokens.indices.lastOrNull { source.tokens[it].value == "import" }
                ?.let { source.tokens.getOrNull(it + 1)?.end } ?: 0
            val declarations = "\n\n// Preserve exact TVM loads and their exceptions, including discarded results.\n" + used.joinToString("\n\n") {
                if (it.width) "fun slice.${it.method}(mutate self, len: int): int\n    asm (self len -> 1 0) \"${it.opcode}\""
                else "fun slice.${it.method}(mutate self): int\n    asm ( -> 1 0) \"${it.opcode}\""
            } + "\n"
            add(TolkNormalizer.Edit(insertion, insertion, declarations, first().change))
        }
    }

    private fun bindingCount(tokens: List<Token>, name: String): Int = tokens.indices.count { index ->
        if (tokens[index].value !in setOf("val", "var")) false
        else if (tokens.getOrNull(index + 1)?.value == name) true
        else if (tokens.getOrNull(index + 1)?.value == "(") {
            val close = closingParenthesis(tokens, index + 1)
            close != null && tokens.subList(index + 2, close).any { it.identifier && it.value == name }
        } else false
    }
}
