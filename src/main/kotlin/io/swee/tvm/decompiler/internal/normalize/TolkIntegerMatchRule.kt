package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingBrace
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.integer
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.terminalReturn
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.unwrap

/** Inverse of process_match_expression's ordered integer equality tests. */
internal object IntegerMatchRule : TolkNormalizer.Rule {
    private data class Arm(val subject: String, val constant: List<Token>, val body: List<Token>, val end: Int)

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val tokens = function.body
            var depth = 0
            for (start in tokens.indices) {
                val top = depth == 0
                if (tokens[start].value == "{") depth++
                if (tokens[start].value == "}") depth--
                if (!top || tokens[start].value != "if") continue
                val arms = mutableListOf<Arm>()
                var cursor = start
                while (true) {
                    val arm = parseArm(tokens, cursor) ?: break
                    arms += arm
                    cursor = arm.end + 1
                }
                if (arms.size < 2 || arms.map { it.subject }.distinct().size != 1
                    || arms.map { integer(it.constant) }.distinct().size != arms.size
                    || source.scalarType(function, arms.first().subject, tokens[start].start) != "int") continue
                val fallback = tokens.subList(cursor, tokens.size)
                if (!terminalReturn(fallback) || source.hasComments(tokens[start].start, tokens.last().end)) continue
                val indentation = source.text.substring(source.text.lastIndexOf('\n', tokens[start].start) + 1, tokens[start].start)
                if (indentation.any { !it.isWhitespace() }) continue
                fun bodyText(body: List<Token>): String {
                    val lines = source.code(body).lines()
                    val indent = lines.drop(1).filter { it.isNotBlank() }.minOfOrNull { it.takeWhile(Char::isWhitespace).length } ?: 0
                    return lines.mapIndexed { i, line -> indentation + "        " + if (i == 0) line.trimStart() else line.drop(indent) }
                        .joinToString("\n") + "\n"
                }
                val replacement = buildString {
                    append("match (${arms.first().subject}) {\n")
                    for (arm in arms) {
                        append("${indentation}    ${source.code(arm.constant)} => {\n")
                        append(bodyText(arm.body))
                        append("${indentation}    }\n")
                    }
                    append("${indentation}    else => {\n")
                    append(bodyText(fallback))
                    append("${indentation}    }\n${indentation}}")
                }
                add(TolkNormalizer.Edit(tokens[start].start, tokens.last().end, replacement,
                    function.change("integer-match")))
                break
            }
        }
    }

    private fun parseArm(tokens: List<Token>, start: Int): Arm? {
        if (tokens.getOrNull(start)?.value != "if") return null
        val conditionEnd = closingParenthesis(tokens, start + 1) ?: return null
        val condition = unwrap(tokens.subList(start + 2, conditionEnd))
        val comparison = condition.windowed(2).indexOfFirst { it.map(Token::value) == listOf("=", "=") }
        if (comparison < 0) return null
        val left = unwrap(condition.take(comparison))
        val right = unwrap(condition.drop(comparison + 2))
        val (subject, constant) = when {
            left.size == 1 && left.single().identifier && integer(right) != null -> left.single().value to right
            right.size == 1 && right.single().identifier && integer(left) != null -> right.single().value to left
            else -> return null
        }
        val end = closingBrace(tokens, conditionEnd + 1) ?: return null
        if (tokens.getOrNull(end + 1)?.value == "else") return null
        val body = tokens.subList(conditionEnd + 2, end)
        if (!terminalReturn(body)) return null
        return Arm(subject, constant, body, end)
    }
}
