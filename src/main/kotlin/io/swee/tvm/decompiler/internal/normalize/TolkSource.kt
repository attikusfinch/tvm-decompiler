package io.swee.tvm.decompiler.internal.normalize

/** A token/offset view of generated Tolk. Strings and comments never participate in rule matching. */
internal class TolkSource(val text: String) {
    data class Token(val value: String, val start: Int, val end: Int, val identifier: Boolean = false)
    data class Function(
        val name: Token, val keyword: Token, val parameters: List<Token>, val result: List<Token>,
        val body: List<Token>, val methodId: Int?, val annotation: Token?, val alreadyGetter: Boolean,
    )
    val tokens = tokenize(text)
    val functions = parseFunctions()

    fun references(name: String) = tokens.count { it.identifier && it.value == name }

    fun code(tokens: List<Token>) = text.substring(tokens.first().start, tokens.last().end)

    fun hasComments(start: Int, end: Int) = text.substring(start, end).let { "//" in it || "/*" in it }

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
