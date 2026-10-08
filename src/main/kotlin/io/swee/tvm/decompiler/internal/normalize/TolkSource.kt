package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange

/** A token/offset view of generated Tolk. Strings and comments never participate in rule matching. */
internal class TolkSource(val text: String) {
    data class Token(val value: String, val start: Int, val end: Int, val identifier: Boolean = false)
    data class Function(
        val name: Token, val keyword: Token, val parameters: List<Token>, val result: List<Token>,
        val body: List<Token>, val methodId: Int?, val annotation: Token?, val alreadyGetter: Boolean,
    ) {
        fun change(rule: String) = NormalizationChange(rule, methodId?.toString() ?: when (name.value) {
            "onInternalMessage" -> "0"; "onExternalMessage" -> "-1"; else -> "unknown"
        }, name.value)
    }
    val tokens = tokenize(text)
    val functions = parseFunctions()

    fun references(name: String) = tokens.count { it.identifier && it.value == name }

    fun code(tokens: List<Token>) = text.substring(tokens.first().start, tokens.last().end)

    fun hasComments(start: Int, end: Int) = text.substring(start, end).let { "//" in it || "/*" in it }

    fun definesFunction(name: String) = tokens.zipWithNext().any { (left, right) ->
        left.value == "fun" && right.value == name
    }

    /** Only unique, local scalar definitions. No global or shadowed-name type guesses. */
    fun scalarType(function: Function, name: String, at: Int): String? {
        val parameters = mutableListOf<String>()
        var start = 0
        for (index in 0..function.parameters.size) if (index == function.parameters.size || function.parameters[index].value == ",") {
            val parameter = function.parameters.subList(start, index)
            if (parameter.size == 3 && parameter[0].value == name && parameter[1].value == ":") parameters += parameter[2].value
            start = index + 1
        }
        val bindings = mutableListOf<List<Token>>()
        val body = function.body
        for (index in body.indices) {
            if (body[index].value !in setOf("val", "var")) continue
            if (body.getOrNull(index + 1)?.value == name) {
                val end = (index + 2 until body.size).firstOrNull { body[it].value in setOf(";", "{", "}") } ?: continue
                bindings += body.subList(index, end + 1)
            } else if (body.getOrNull(index + 1)?.value == "(") {
                val close = closingParenthesis(body, index + 1) ?: continue
                if (body.subList(index + 2, close).none { it.identifier && it.value == name }) continue
                val end = (close + 1 until body.size).firstOrNull { body[it].value in setOf(";", "{", "}") } ?: continue
                bindings += body.subList(index, end + 1)
            }
        }
        if (parameters.size + bindings.size != 1) return null
        parameters.singleOrNull()?.let { return it }
        val declaration = bindings.single()
        if (declaration.first().start >= at) return null
        val scopes = mutableListOf<Int>()
        for (index in body.indices) {
            if (body[index].start >= declaration.first().start) break
            if (body[index].value == "{") scopes += index
            if (body[index].value == "}" && scopes.isNotEmpty()) scopes.removeAt(scopes.lastIndex)
        }
        if (scopes.lastOrNull()?.let { closingBrace(body, it)?.let { end -> body[end].start < at } } == true) return null
        if (declaration[1].value == "(") {
            val close = closingParenthesis(declaration, 1) ?: return null
            val names = declaration.subList(2, close).filter { it.identifier }.map { it.value }
            val helper = declaration.getOrNull(close + 2)?.value
            if (names.size != 2 || names[1] != name || declaration.getOrNull(close + 1)?.value != "="
                || helper !in setOf("tvmLoadUint", "tvmLoadInt", "tvmLoadGrams") || definesFunction(helper!!)) return null
            return "int"
        }
        if (declaration.getOrNull(2)?.value == ":" && declaration.getOrNull(4)?.value == "=") return declaration.getOrNull(3)?.value
        if (declaration.getOrNull(2)?.value != "=") return null
        val expression = unwrap(declaration.subList(3, declaration.lastIndex))
        if (expression.takeLast(2).map { it.value }.firstOrNull() == "as") return expression.last().value
        if (integer(expression) != null) return "int"
        if (expression.size == 1 && expression.single().value in setOf("true", "false")) return "bool"
        val intHelpers = setOf("tvmGetForwardFeeSimple", "tvmGetOriginalFwdFee", "tvmGetGasFee", "tvmGetStorageFee")
        val helper = expression.firstOrNull()?.value
        if (helper in intHelpers && expression.getOrNull(1)?.value == "("
            && closingParenthesis(expression, 1) == expression.lastIndex && !definesFunction(helper!!)) return "int"
        for (open in expression.indices) if (expression[open].value == "("
            && closingParenthesis(expression, open) == expression.lastIndex && open >= 2
            && expression[open - 2].value == "."
            && expression[open - 1].value in setOf("loadUint", "loadInt", "preloadUint", "preloadInt", "loadCoins", "loadUintExact", "loadIntExact")) return "int"
        return null
    }

    fun declarations(function: Function): List<List<Token>> {
        val result = mutableListOf<List<Token>>()
        var start = 0
        var parentheses = 0
        for ((index, token) in function.body.withIndex()) {
            when (token.value) {
                "(" -> parentheses++
                ")" -> parentheses--
                "{", "}" -> if (parentheses == 0) start = index + 1
                ";" -> if (parentheses == 0) {
                    if (function.body.getOrNull(start)?.value == "val") result += function.body.subList(start, index + 1)
                    start = index + 1
                }
            }
        }
        return result
    }

    companion object {
        fun callArguments(tokens: List<Token>, open: Int, close: Int): List<List<Token>> {
            val result = mutableListOf<List<Token>>()
            var start = open + 1
            var depth = 0
            for (index in open + 1 until close) {
                if (tokens[index].value in setOf("(", "[", "{")) depth++
                if (tokens[index].value in setOf(")", "]", "}")) depth--
                if (depth == 0 && tokens[index].value == ",") {
                    result += tokens.subList(start, index)
                    start = index + 1
                }
            }
            if (start < close) result += tokens.subList(start, close)
            return result
        }

        /** An identifier/call/member chain or an already enclosed expression can take a dot suffix. */
        fun memberReceiver(tokens: List<Token>): Boolean {
            if (tokens.isEmpty()) return false
            if (tokens[0].value == "(" && closingParenthesis(tokens, 0) == tokens.lastIndex) return true
            if (!tokens[0].identifier) return false
            var index = 1
            while (index < tokens.size) {
                if (tokens[index].value == "(") index = (closingParenthesis(tokens, index) ?: return false) + 1
                else if (tokens[index].value == "." && tokens.getOrNull(index + 1)?.identifier == true) index += 2
                else return false
            }
            return true
        }

        fun closingBrace(tokens: List<Token>, start: Int): Int? {
            if (tokens.getOrNull(start)?.value != "{") return null
            var depth = 0
            for (index in start until tokens.size) {
                if (tokens[index].value == "{") depth++
                if (tokens[index].value == "}" && --depth == 0) return index
            }
            return null
        }

        fun integer(tokens: List<Token>): java.math.BigInteger? {
            val value = unwrap(tokens).joinToString("") { it.value }
            if (!Regex("-?(?:[0-9]+|0[xX][0-9a-fA-F]+)").matches(value)) return null
            return runCatching {
                val negative = value.startsWith('-')
                val magnitude = value.removePrefix("-")
                val result = if (magnitude.startsWith("0x", true)) java.math.BigInteger(magnitude.drop(2), 16)
                    else java.math.BigInteger(magnitude)
                if (negative) result.negate() else result
            }.getOrNull()
        }

        /** Conservative match-arm return context; blocks before return can alter IFJMP selection. */
        fun terminalReturn(tokens: List<Token>): Boolean {
            val index = tokens.indexOfFirst { it.value == "return" }
            val depth = if (index >= 0) tokens.take(index).fold(0) { depth, token ->
                depth + when (token.value) { "{" -> 1; "}" -> -1; else -> 0 }
            } else -1
            return index >= 0 && tokens.count { it.value == "return" } == 1
                && depth == 0
                && (index == 0 || tokens[index - 1].value == ";") && tokens.lastOrNull()?.value == ";"
                && tokens.drop(index).count { it.value == ";" } == 1
        }

        fun closingParenthesis(tokens: List<Token>, start: Int): Int? {
            if (tokens.getOrNull(start)?.value != "(") return null
            var depth = 0
            for (index in start until tokens.size) {
                if (tokens[index].value == "(") depth++
                if (tokens[index].value == ")" && --depth == 0) return index
            }
            return null
        }

        fun unwrap(tokens: List<Token>): List<Token> {
            var result = tokens
            while (result.firstOrNull()?.value == "(" && closingParenthesis(result, 0) == result.lastIndex)
                result = result.subList(1, result.lastIndex)
            return result
        }
    }

    private fun parseFunctions(): List<Function> {
        val result = mutableListOf<Function>()
        fun endOf(start: Int, open: String, close: String): Int? {
            var depth = 0
            for (index in start until tokens.size) {
                if (tokens[index].value == open) depth++
                if (tokens[index].value == close && --depth == 0) return index
            }
            return null
        }
        var index = 0
        var depth = 0
        while (index < tokens.size) {
            val token = tokens[index]
            if (depth == 0 && token.value == "fun" && tokens.getOrNull(index + 1)?.identifier == true
                && tokens.getOrNull(index + 2)?.value == "(") {
                val paramEnd = endOf(index + 2, "(", ")") ?: break
                if (tokens.getOrNull(paramEnd + 1)?.value != ":") { index++; continue }
                val bodyStart = (paramEnd + 2 until tokens.size).firstOrNull { tokens[it].value in setOf("{", "asm", "fun") } ?: break
                if (tokens[bodyStart].value != "{") { index++; continue }
                val bodyEnd = endOf(bodyStart, "{", "}") ?: break
                val annotation = (5..6).map { tokens.subList(maxOf(0, index - it), index) }.firstOrNull {
                    it.take(3).map(Token::value) == listOf("@", "method_id", "(") && it.lastOrNull()?.value == ")"
                }
                val methodId = annotation?.drop(3)?.dropLast(1)?.joinToString("") { it.value }?.toIntOrNull()
                result += Function(tokens[index + 1], token, tokens.subList(index + 3, paramEnd),
                    tokens.subList(paramEnd + 2, bodyStart), tokens.subList(bodyStart + 1, bodyEnd),
                    methodId, if (methodId != null) annotation?.first() else null, tokens.getOrNull(index - 1)?.value == "get")
                index = bodyEnd + 1
                continue
            }
            if (token.value == "{") depth++
            if (token.value == "}") depth--
            index++
        }
        return result
    }

    private fun tokenize(source: String): List<Token> {
        val result = mutableListOf<Token>()
        var index = 0
        while (index < source.length) {
            val start = index
            when {
                source[index].isWhitespace() -> index++
                source.startsWith("//", index) -> { index = source.indexOf('\n', index).takeIf { it >= 0 } ?: source.length }
                source.startsWith("/*", index) -> {
                    val end = source.indexOf("*/", index + 2)
                    if (end < 0) return emptyList()
                    index = end + 2
                }
                source[index] == '"' -> {
                    index++
                    while (index < source.length && source[index] != '"') {
                        if (source[index] == '\\') index++
                        index++
                    }
                    if (index >= source.length) return emptyList()
                    index++
                    result += Token(source.substring(start, index), start, index)
                }
                source[index].isLetter() || source[index] == '_' -> {
                    while (index < source.length && (source[index].isLetterOrDigit() || source[index] == '_')) index++
                    result += Token(source.substring(start, index), start, index, identifier = true)
                }
                source[index].isDigit() -> {
                    while (index < source.length && source[index].isLetterOrDigit()) index++
                    result += Token(source.substring(start, index), start, index)
                }
                else -> { index++; result += Token(source.substring(start, index), start, index) }
            }
        }
        return result
    }
}
