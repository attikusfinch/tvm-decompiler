package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.integer
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.unwrap

/** CONDSEL chooses already evaluated values; only local references/constants may become arms. */
internal object ConditionalSelectRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val helper = "tvmCondSelect"
        if (source.definesFunction(helper)) return@buildList
        for (function in source.functions) {
            val tokens = function.body
            for (index in tokens.indices) {
                if (tokens[index].value != helper) continue
                val end = closingParenthesis(tokens, index + 1) ?: continue
                var depth = 0
                val commas = (index + 2 until end).filter {
                    if (tokens[it].value == "(") depth++
                    if (tokens[it].value == ")") depth--
                    depth == 0 && tokens[it].value == ","
                }
                if (commas.size != 2 || source.hasComments(tokens[index].start, tokens[end].end)) continue
                val condition = unwrap(tokens.subList(index + 2, commas[0]))
                if (condition.size != 1 || !condition.single().identifier) continue
                fun operand(value: List<Token>): List<Token>? {
                    val wrapped = unwrap(value)
                    if (wrapped.takeLast(2).map { it.value } != listOf("as", "unknown")) return null
                    val inner = unwrap(wrapped.dropLast(2))
                    return inner.takeIf { integer(it) != null || it.size == 1 && it.single().identifier }
                }
                val left = operand(tokens.subList(commas[0] + 1, commas[1])) ?: continue
                val right = operand(tokens.subList(commas[1] + 1, end)) ?: continue
                fun type(operand: List<Token>) = if (integer(operand) != null) "int"
                    else source.scalarType(function, operand.single().value, tokens[index].start)
                val valueType = type(left)
                if (valueType !in setOf("int", "slice", "cell", "builder", "tuple", "unknown") || valueType != type(right)) continue
                // Keep the surrounding result cast. Compiler's zero test before CONDSEL is removed;
                // branch casts to unknown would instead cause an IF and must not be carried inside.
                val replacement = "(${source.code(condition)} != 0 ? ${source.code(left)} : ${source.code(right)})"
                add(TolkNormalizer.Edit(tokens[index].start, tokens[end].end, replacement,
                    function.change("conditional-select")))
            }
        }
    }
}
