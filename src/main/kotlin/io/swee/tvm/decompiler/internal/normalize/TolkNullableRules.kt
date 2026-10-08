package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingBrace
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.integer
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.unwrap

/** Recover the lazy IF form of ??, never the eager CONDSEL form. */
internal object NullCoalesceRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        if (source.definesFunction("tvmNull_x3f_")) return@buildList
        for (function in source.functions) {
            val tokens = function.body
            for (declaration in source.declarations(function)) {
                if (declaration.size < 8 || declaration[2].value != "="
                    || declaration[3].value != "tvmNull_x3f_"
                    || closingParenthesis(declaration, 4) != declaration.lastIndex - 1) continue
                var argument = unwrap(declaration.subList(5, declaration.lastIndex - 1))
                if (argument.takeLast(2).map { it.value } == listOf("as", "unknown")) argument = unwrap(argument.dropLast(2))
                if (argument.size != 1 || !argument.single().identifier) continue
                val value = argument.single().value
                val type = source.scalarType(function, value, declaration.first().start)
                if (type !in setOf("int", "slice", "cell", "builder")) continue
                val flag = declaration[1].value
                if (tokens.count { it.identifier && it.value == flag } != 2
                    || function.parameters.any { it.identifier && it.value == flag }) continue
                val start = tokens.indexOf(declaration.last()) + 1
                if (tokens.getOrNull(start)?.value != "var" || tokens.getOrNull(start + 1)?.identifier != true
                    || tokens.getOrNull(start + 2)?.value != "=" || tokens.getOrNull(start + 3)?.value != value
                    || tokens.getOrNull(start + 4)?.value != ";") continue
                val target = tokens[start + 1].value
                if (target in setOf(flag, value) || function.parameters.any { it.identifier && it.value == target }
                    || tokens.indices.count { tokens[it].value in setOf("val", "var") && tokens.getOrNull(it + 1)?.value == target } != 1) continue
                val guard = start + 5
                if (tokens.getOrNull(guard)?.value != "if") continue
                val close = closingParenthesis(tokens, guard + 1) ?: continue
                if (tokens.subList(guard + 2, close).map { it.value } != listOf(flag, "!", "=", "0")) continue
                val end = closingBrace(tokens, close + 1) ?: continue
                var spanEnd = end
                if (tokens.getOrNull(end + 1)?.value == "else") {
                    val elseEnd = closingBrace(tokens, end + 2) ?: continue
                    if (elseEnd != end + 3) continue
                    spanEnd = elseEnd
                }
                // Keeping other values live beyond the branch can change Tolk's branch stack
                // permutation (shared SWAP versus a SWAP inside ELSE), despite equal results.
                if (tokens.drop(spanEnd + 1).map { it.value } != listOf("return", target, ";")) continue
                val assignment = tokens.subList(close + 2, end)
                if (assignment.size < 4 || assignment[0].value != target || assignment[1].value != "="
                    || assignment.last().value != ";" || assignment.count { it.value == ";" } != 1) continue
                val fallback = assignment.subList(2, assignment.lastIndex)
                val fallbackType = if (integer(fallback) != null) "int" else if (fallback.size == 1 && fallback.single().identifier
                    && fallback.single().value !in setOf(flag, target)) source.scalarType(function, fallback.single().value, declaration.first().start) else null
                if (fallbackType != type || source.hasComments(declaration.first().start, tokens[spanEnd].end)) continue
                add(TolkNormalizer.Edit(declaration.first().start, tokens[spanEnd].end,
                    "var $target = (($value as unknown) ?? ${source.code(fallback)}) as $type;", function.change("null-coalesce")))
            }
        }
    }
}

/** A standalone getter can return the native nullable address without changing internal callers. */
internal object OptionalAddressGetterRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        if (source.definesFunction("tvmLoadOptStdAddr")) return@buildList
        for (function in source.functions) {
            val id = function.methodId ?: continue
            if (id !in 0x10000..0x1ffff || function.result.map { it.value } != listOf("slice")
                || source.references(function.name.value) != 1) continue
            val tokens = function.body
            if (tokens.any { it.value in setOf("{", "}") } || tokens.count { it.value == "return" } != 1) continue
            for (start in tokens.indices) {
                if (tokens.getOrNull(start)?.value != "var" || tokens.getOrNull(start + 1)?.value != "(") continue
                val close = closingParenthesis(tokens, start + 1) ?: continue
                val names = tokens.subList(start + 2, close)
                if (names.size != 3 || !names[0].identifier || names[0].value == "_"
                    || names[1].value != "," || names[2].value != "_"
                    || tokens.getOrNull(close + 1)?.value != "=" || tokens.getOrNull(close + 2)?.value != "tvmLoadOptStdAddr") continue
                val end = closingParenthesis(tokens, close + 3) ?: continue
                val receiver = tokens.subList(close + 4, end)
                if (receiver.size != 1 || !receiver.single().identifier || names[0].value == receiver.single().value
                    || source.scalarType(function, receiver.single().value, tokens[start].start) != "slice") continue
                if (tokens.drop(end + 1).map { it.value } != listOf(";", "return", names[0].value, ";")
                    || tokens.count { it.identifier && it.value == names[0].value } != 2
                    || function.parameters.any { it.identifier && it.value == names[0].value }
                    || source.hasComments(tokens[start].start, tokens.last().end)) continue
                val change = function.change("optional-address-getter")
                add(TolkNormalizer.Edit(function.result.single().start, function.result.single().end, "address?", change))
                add(TolkNormalizer.Edit(tokens[start].start, tokens.last().end,
                    "return ${receiver.single().value}.loadAddressOpt();", change))
                break
            }
        }
    }
}
