package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.unwrap

/** Live terminal arithmetic can use pure natives without deleting unused exception checks. */
internal object TerminalArithmeticRule : TolkNormalizer.Rule {
    private data class Arithmetic(val native: String, val arity: Int, val operator: Boolean = false)
    private val primitives = mapOf(
        "tvmMin" to Arithmetic("min", 2), "tvmMax" to Arithmetic("max", 2),
        "tvmMinmax" to Arithmetic("minMax", 2), "tvmAbs" to Arithmetic("abs", 1),
        "tvm_x2f__x25_" to Arithmetic("divMod", 2), "tvmDivmod" to Arithmetic("divMod", 2),
        "tvmModdiv" to Arithmetic("modDiv", 2),
        "tvmMuldiv" to Arithmetic("mulDivFloor", 3), "tvmMuldivr" to Arithmetic("mulDivRound", 3),
        "tvmMuldivc" to Arithmetic("mulDivCeil", 3), "tvmMuldivmod" to Arithmetic("mulDivMod", 3),
        "round_divide" to Arithmetic("~/", 2, true), "ceil_divide" to Arithmetic("^/", 2, true),
    )

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val body = function.body
            if (body.lastOrNull()?.value != ";") continue
            val expression = if (body.firstOrNull()?.value == "return") {
                unwrap(body.drop(1).dropLast(1))
            } else {
                // Checked and multi-result primitives keep a binding followed
                // by an exact, ordered return. Preserve that binding and ABI.
                if (body.firstOrNull()?.value !in setOf("var", "val")) continue
                val tupleBinding = body.getOrNull(1)?.value == "("
                val closeBinding = if (tupleBinding) closingParenthesis(body, 1) ?: continue else 1
                val names = if (tupleBinding) callArguments(body, 1, closeBinding) else listOf(body.subList(1, 2))
                if (names.size != (if (tupleBinding) 2 else 1) || names.any { it.size != 1 || !it.single().identifier }
                    || names.map { it.single().value }.distinct().size != names.size
                    || body.getOrNull(closeBinding + 1)?.value != "=") continue
                val end = (closeBinding + 2 until body.size).firstOrNull { body[it].value == ";" } ?: continue
                val returned = body.drop(end + 1)
                if (returned.firstOrNull()?.value != "return" || returned.lastOrNull()?.value != ";") continue
                val tuple = returned.drop(1).dropLast(1)
                val returnedNames = if (tupleBinding) {
                    if (tuple.firstOrNull()?.value != "(" || closingParenthesis(tuple, 0) != tuple.lastIndex) continue
                    callArguments(tuple, 0, tuple.lastIndex)
                } else listOf(tuple)
                if (returnedNames.map { a -> a.map { it.value } } != names.map { a -> a.map { it.value } }) continue
                unwrap(body.subList(closeBinding + 2, end))
            }
            val helper = expression.firstOrNull()?.value ?: continue
            val primitive = primitives[helper] ?: continue
            if (source.definesFunction(helper) || !primitive.operator && source.references(primitive.native) != 0
                || source.functions.any { f -> f.parameters.any { it.value == helper } }
                || source.tokens.zipWithNext().any { (a, b) -> a.value in setOf("val", "var", "const", "global") && b.value == helper }) continue
            val close = closingParenthesis(expression, 1)?.takeIf { it == expression.lastIndex } ?: continue
            val arguments = callArguments(expression, 1, close)
            // Constants, aliases of the same operand, globals and effects allow
            // native constant-folding/algebraic rewrites. Retain their exact helper.
            if (arguments.size != primitive.arity || arguments.any { it.size != 1 || !it.single().identifier }
                || arguments.map { it.single().value }.distinct().size != primitive.arity
                || arguments.any { source.scalarType(function, it.single().value, expression.first().start) != "int" }
                || source.hasComments(body.first().start, body.last().end)) continue
            val replacement = if (primitive.operator) "(${source.code(arguments[0])} ${primitive.native} ${source.code(arguments[1])})"
                else "${primitive.native}(${arguments.joinToString(", ") { source.code(it) }})"
            add(TolkNormalizer.Edit(expression.first().start, expression.last().end, replacement,
                function.change("terminal-native-arithmetic")))
        }
    }
}
