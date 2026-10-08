package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.unwrap

private fun TolkSource.Function.change(rule: String) = NormalizationChange(rule,
    methodId?.toString() ?: when (name.value) { "onInternalMessage" -> "0"; "onExternalMessage" -> "-1"; else -> "unknown" }, name.value)

/** ISNULL is a TVM integer predicate (-1/0). Retain that representation outside boolean guards. */
internal object NativeNullCheckRule : TolkNormalizer.Rule {
    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val helper = "tvmNull_x3f_"
        if (source.tokens.zipWithNext().any { (left, right) -> left.value == "fun" && right.value == helper }) return@buildList
        for (function in source.functions) {
            val tokens = function.body
            for (index in tokens.indices) {
                if (tokens[index].value != helper || !tokens[index].identifier) continue
                val end = closingParenthesis(tokens, index + 1) ?: continue
                val argument = tokens.subList(index + 2, end)
                if (argument.isEmpty() || argument.any { it.value in setOf(helper, ",", "{", "}") }
                    || source.hasComments(tokens[index].start, tokens[end].end)) continue
                val unwrapped = unwrap(argument)
                // Legacy IR may store TVM null in a non-nullable slice/int. Dropping this escape would
                // let Tolk incorrectly constant-fold the null check to false based on the static type.
                val value = if (unwrapped.takeLast(2).map { it.value } == listOf("as", "unknown")) source.code(argument)
                    else "(${source.code(argument)} as unknown)"
                add(TolkNormalizer.Edit(tokens[index].start, tokens[end].end, "(($value == null) as int)", function.change("native-null-check")))
            }
        }
    }
}

/** Fold an adjacent one-use boolean binding, or an explicit bool-to-int zero test, in a guard. */
internal object BooleanGuardRule : TolkNormalizer.Rule {
    private data class Test(val value: List<Token>, val negated: Boolean)

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val tokens = function.body
            val foldedGuards = mutableSetOf<Int>()
            for (declaration in source.declarations(function)) {
                if (declaration.size < 8 || !declaration[1].identifier || declaration[2].value != "=") continue
                val value = booleanCast(declaration.subList(3, declaration.lastIndex)) ?: continue
                val name = declaration[1].value
                if (function.body.count { it.identifier && it.value == name } != 2
                    || function.parameters.any { it.identifier && it.value == name }) continue
                val next = tokens.indexOf(declaration.last()) + 1
                // Sinking a binding into a while condition could re-evaluate an originally fixed value.
                if (tokens.getOrNull(next)?.value !in setOf("if", "assert")) continue
                val end = closingParenthesis(tokens, next + 1) ?: continue
                val test = zeroTest(tokens.subList(next + 2, end)) ?: continue
                if (test.value.size != 1 || test.value.single().value != name
                    || source.hasComments(declaration.first().start, tokens[end].end)) continue
                val condition = predicate(source.code(value), test.negated)
                add(TolkNormalizer.Edit(declaration.first().start, tokens[end].end,
                    "${tokens[next].value} ($condition)", function.change("boolean-guard")))
                foldedGuards += next
            }
            for (index in tokens.indices) {
                if (index in foldedGuards || tokens[index].value !in setOf("if", "assert", "while")) continue
                val end = closingParenthesis(tokens, index + 1) ?: continue
                val test = zeroTest(tokens.subList(index + 2, end)) ?: continue
                val value = booleanCast(test.value) ?: continue
                if (source.hasComments(tokens[index].start, tokens[end].end)) continue
                add(TolkNormalizer.Edit(tokens[index + 1].end, tokens[end].start,
                    predicate(source.code(value), test.negated), function.change("boolean-guard")))
            }
        }
    }

    private fun predicate(code: String, negated: Boolean) = if (negated) "!($code)" else code

    private fun zeroTest(value: List<Token>): Test? {
        var tokens = unwrap(value)
        var negated = false
        while (tokens.firstOrNull()?.value == "!") { negated = !negated; tokens = unwrap(tokens.drop(1)) }
        if (tokens.size < 4 || tokens.last().value != "0") return null
        val comparison = tokens.takeLast(3).map { it.value }
        if (comparison != listOf("!", "=", "0") && comparison != listOf("=", "=", "0")) return null
        // Require an entire left operand, not a suffix of a larger arithmetic/comparison expression.
        val left = tokens.dropLast(3)
        if (left.size != 1 && !(left.firstOrNull()?.value == "(" && closingParenthesis(left, 0) == left.lastIndex)) return null
        return Test(unwrap(left), negated xor (comparison.first() == "="))
    }

    private fun booleanCast(value: List<Token>): List<Token>? {
        val tokens = unwrap(value)
        if (tokens.takeLast(2).map { it.value } != listOf("as", "int")) return null
        val expression = unwrap(tokens.dropLast(2))
        return expression.takeIf(::isBoolean)
    }

    private fun isBoolean(tokens: List<Token>): Boolean {
        if (tokens.isEmpty()) return false
        if (tokens.size == 1 && tokens.single().value in setOf("true", "false")) return true
        var depth = 0
        val operators = mutableListOf<String>()
        var index = 0
        while (index < tokens.size) {
            val token = tokens[index].value
            if (token in setOf("(", "[")) depth++
            if (token in setOf(")", "]")) depth--
            if (depth == 0 && token in setOf("<", ">", "=", "!", "+", "-", "*", "/", "%", "&", "|", "^")) {
                val next = tokens.getOrNull(index + 1)?.value
                if (token in setOf("<", ">", "=", "!") && next == "=") { operators += token + next; index++ }
                else operators += token
            }
            index++
        }
        val comparisons = setOf("<", ">", "<=", ">=", "==", "!=")
        if (operators.count { it in comparisons } == 1 && operators.all { it in comparisons || it in setOf("+", "-", "*", "/", "%") }) return true
        if (operators.isNotEmpty() || tokens.last().value != ")") return false
        // Only known native slice predicates, not arbitrary integer-returning compatibility calls.
        for (open in tokens.indices) if (tokens[open].value == "(" && closingParenthesis(tokens, open) == tokens.lastIndex)
            return open >= 2 && tokens[open - 2].value == "." && tokens[open - 1].value in setOf("bitsEqual", "isEmpty")
        return false
    }
}
