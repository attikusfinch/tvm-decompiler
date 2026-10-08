package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token

/** Inverse of Tolk's lazy union lowering: quiet prefix tests, terminal arms, explicit fallback. */
internal object PrefixMatchRule : TolkNormalizer.Rule {
    private data class Arm(val start: Int, val end: Int, val tail: Token, val flag: Token,
                           val receiver: Token, val hex: String, val body: List<Token>) {
        val typeName get() = "Message_${hex.length * 4}_$hex"
        val bits get() = hex.flatMap { it.digitToInt(16).toString(2).padStart(4, '0').toList() }.joinToString("")
    }

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val types = linkedMapOf<String, String>()
        val aliases = linkedMapOf<String, String>()
        for (function in source.functions) {
            val tokens = function.body
            // Only a top-level dispatch at the end of a function. Nested joins and loop exits
            // require a control-flow model; retaining them is preferable to guessing.
            var depth = 0
            val first = tokens.indices.firstOrNull { index ->
                val top = depth == 0
                if (tokens[index].value == "{") depth++
                if (tokens[index].value == "}") depth--
                top && tokenStartsPrefix(tokens, index)
            } ?: continue
            val arms = mutableListOf<Arm>()
            var cursor = first
            while (true) {
                val arm = parseArm(tokens, cursor) ?: break
                arms += arm
                cursor = arm.end + 1
            }
            if (arms.isEmpty() || prefixDeclaration(tokens, cursor) != null) continue
            if (arms.zipWithNext().any { (left, right) -> left.tail.value == "_" || right.receiver.value != left.tail.value }) continue
            // A lazy union requires a prefix-free set. Duplicate/overlapping prefixes retain
            // their original ordered tests. Leading zeroes are part of the serialized width.
            if (arms.indices.any { i -> arms.indices.any { j -> i != j && arms[j].bits.startsWith(arms[i].bits) } }) continue
            if (source.hasComments(tokens[first].start, tokens.last().end)) continue
            val fallback = tokens.subList(cursor, tokens.size)
            if (arms.any { arm ->
                    function.parameters.any { it.identifier && it.value in setOf(arm.tail.value, arm.flag.value) }
                        || tokens.count { it.identifier && it.value == arm.flag.value } != 2
                }) continue
            val allowedTails = arms.withIndex().all { (index, arm) ->
                if (arm.tail.value == "_") true else {
                    val allowed = setOf(arm.tail.start) + arm.body.map { it.start } +
                        listOfNotNull(arms.getOrNull(index + 1)?.receiver?.start)
                    tokens.filter { it.identifier && it.value == arm.tail.value }.all { it.start in allowed }
                }
            }
            if (!allowedTails || arms.any { source.references(it.typeName) != 0 }) continue
            if (arms.any { arm -> source.tokens.zipWithNext().any { (left, right) ->
                    left.value == "fun" && right.value == tokens[arm.start + 7].value
                } }) continue // An emitter helper lives in stdlib.tolk; never assume a user function's behavior.
            val alias = "Messages_${function.name.value}"
            if (arms.size > 1 && (source.references(alias) != 0 || alias in aliases)) continue
            var message = "message"
            var suffix = 2
            while (source.references(message) != 0) message = "message${suffix++}"
            val indentation = source.text.substring(source.text.lastIndexOf('\n', tokens[first].start) + 1, tokens[first].start)
            if (indentation.any { !it.isWhitespace() }) continue
            fun bodyText(body: List<Token>): String {
                if (body.isEmpty()) return ""
                val text = source.code(body)
                val lines = text.lines()
                val restIndent = lines.drop(1).filter { it.isNotBlank() }.minOfOrNull { it.takeWhile(Char::isWhitespace).length }
                val firstIndent = restIndent ?: 0
                return lines.mapIndexed { index, line ->
                    indentation + "        " + if (index == 0) line.trimStart() else line.drop(firstIndent)
                }.joinToString("\n") + "\n"
            }
            val replacement = buildString {
                append("val $message = lazy ${if (arms.size == 1) arms.single().typeName else alias}.fromSlice(${arms.first().receiver.value});\n")
                append("${indentation}match ($message) {\n")
                for (arm in arms) {
                    append("${indentation}    ${arm.typeName} => {\n")
                    if (arm.tail.value != "_" && arm.body.any { it.identifier && it.value == arm.tail.value })
                        append("${indentation}        var ${arm.tail.value} = $message.tail;\n")
                    append(bodyText(arm.body))
                    append("${indentation}    }\n")
                }
                append("${indentation}    else => {\n")
                append(bodyText(fallback))
                append("${indentation}    }\n${indentation}}")
            }
            val change = NormalizationChange("prefix-lazy-match", function.methodId?.toString() ?: when (function.name.value) {
                "onInternalMessage" -> "0"; "onExternalMessage" -> "-1"; else -> "unknown"
            }, function.name.value)
            add(TolkNormalizer.Edit(tokens[first].start, tokens.last().end, replacement, change))
            arms.forEach { types[it.typeName] = "struct (0x${it.hex}) ${it.typeName} { tail: RemainingBitsAndRefs }" }
            if (arms.size > 1) aliases[alias] = "type $alias = ${arms.joinToString(" | ") { it.typeName }}"
        }
        if (isNotEmpty()) {
            val lastImport = source.tokens.zipWithNext().lastOrNull { (left, right) ->
                left.value == "import" && right.value.startsWith('"')
            }?.second
            val insert = lastImport?.let { source.text.indexOf('\n', it.end).takeIf { it >= 0 }?.plus(1) ?: it.end } ?: 0
            val declarations = "// Message names follow observed prefixes; payload schemas remain unknown.\n" +
                (types.values + aliases.values).joinToString("\n") + "\n\n"
            add(TolkNormalizer.Edit(insert, insert, declarations, first().change))
        }
    }

    private fun tokenStartsPrefix(tokens: List<Token>, start: Int) = tokens.getOrNull(start)?.value == "var"
        && tokens.getOrNull(start + 1)?.value == "(" && tokens.getOrNull(start + 7)?.value?.startsWith("matchPrefix") == true

    private fun prefixDeclaration(tokens: List<Token>, start: Int): List<Token>? {
        if (start + 12 > tokens.size) return null
        val declaration = tokens.subList(start, start + 12)
        if (declaration.map { it.value }.let {
                it[0] != "var" || it[1] != "(" || it[3] != "," || it[5] != ")" || it[6] != "="
                    || it[8] != "(" || it[10] != ")" || it[11] != ";"
            } || !declaration[2].identifier || !declaration[4].identifier || !declaration[9].identifier) return null
        val prefix = Regex("matchPrefix_(\\d+)_([0-9A-F]+)").matchEntire(declaration[7].value) ?: return null
        val hex = prefix.groupValues[2]
        if (hex.length !in 1..12 || prefix.groupValues[1].toIntOrNull() != hex.length * 4) return null
        return declaration
    }

    private fun parseArm(tokens: List<Token>, start: Int): Arm? {
        val declaration = prefixDeclaration(tokens, start) ?: return null
        val guard = start + 12
        if (tokens.drop(guard).take(8).map { it.value } != listOf("if", "(", declaration[4].value, "!", "=", "0", ")", "{")) return null
        var depth = 1
        var end = guard + 8
        while (end < tokens.size && depth != 0) {
            if (tokens[end].value == "{") depth++
            if (tokens[end].value == "}") depth--
            end++
        }
        if (depth != 0 || tokens.getOrNull(end)?.value == "else") return null
        val body = tokens.subList(guard + 8, end - 1)
        depth = 0
        var terminalReturn = -1
        body.forEachIndexed { index, token ->
            if (depth == 0 && token.value == "return") terminalReturn = index
            if (token.value == "{") depth++
            if (token.value == "}") depth--
        }
        // Inner returns and a conditional/block immediately before the terminal
        // return can change Tolk's IFJMP/IFNOT selection inside a match arm.
        if (terminalReturn < 0 || body.count { it.value == "return" } != 1 || body.lastOrNull()?.value != ";"
            || body.drop(terminalReturn).count { it.value == ";" } != 1
            || terminalReturn > 0 && body[terminalReturn - 1].value != ";") return null
        return Arm(start, end - 1, declaration[2], declaration[4], declaration[9],
            declaration[7].value.substringAfterLast('_'), body)
    }
}
