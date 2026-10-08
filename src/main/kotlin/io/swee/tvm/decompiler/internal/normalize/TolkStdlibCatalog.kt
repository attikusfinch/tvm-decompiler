package io.swee.tvm.decompiler.internal.normalize

import com.fasterxml.jackson.databind.ObjectMapper
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

/** Declaration-only catalog: builtin implementations and ordinary function bodies remain opaque. */
internal class TolkStdlibCatalog(val modules: Map<String, String>) {
    data class Type(val name: String, val items: List<Type> = emptyList(), val nullable: Boolean = false)
    data class Declaration(val name: String, val module: String, val nameTokens: List<Token>, val start: Int, val end: Int,
        val arguments: List<Type>, val results: List<Type>, val names: List<String>, val generics: Set<String>,
        val inputOrder: List<Int>, val outputOrder: List<Int>, val pure: Boolean, val mutated: List<Int>,
        val receiver: Type?, val instructions: List<StdlibAsm.Instruction>) {
        val physicalArguments get() = inputOrder.map { arguments[it] }
        val physicalResults get() = outputOrder.indices.map { results[outputOrder.indexOf(it)] }
    }
    private val aliases = modules.values.flatMap { text ->
        Regex("(?m)^type\\s+(\\w+)\\s*=\\s*([^\\r\\n]+)").findAll(text).mapNotNull { match ->
            parseType(TolkSource(match.groupValues[2]).tokens)?.let { match.groupValues[1] to it }
        }.toList()
    }.toMap()
    private val layouts = modules.values.flatMap { text ->
        // Only a single private primitive field; do not infer user schemas or multi-slot structures.
        Regex("struct\\s+(\\w+)(?:<[^>]+>)?\\s*\\{\\s*private\\s+(?:readonly\\s+)?\\w+\\s*:\\s*([^}]+)}")
            .findAll(text).mapNotNull { match -> parseType(TolkSource(match.groupValues[2]).tokens)?.let { match.groupValues[1] to it } }.toList()
    }.toMap()
    val declarations = modules.flatMap { (module, text) -> read(text, module) }

    fun candidates(wrapper: Declaration): List<Declaration> = declarations.filter { candidate ->
        if (candidate.instructions != wrapper.instructions || candidate.arguments.size != wrapper.arguments.size || candidate.results.size != wrapper.results.size) false else {
            val bindings = mutableMapOf<String, Type>()
            fun match(expected: Type, actual: Type): Boolean {
                if (expected.name in candidate.generics) return bindings.getOrPut(expected.name) { actual } == actual
                val left = erase(expected, generics = candidate.generics) ?: return false
                val right = erase(actual) ?: return false
                return left.name == right.name && left.items.size == right.items.size && left.items.zip(right.items).all { (a,b) -> match(a,b) }
            }
            candidate.physicalArguments.zip(wrapper.physicalArguments).all { (a,b) -> match(a,b) } &&
                candidate.physicalResults.zip(wrapper.physicalResults).all { (a,b) -> match(a,b) }
        }
    }.distinctBy { it.name }

    /** ABI erasure is used for names only. Native replacements require identical declared API types. */
    private fun erase(type: Type, seen: Set<String> = emptySet(), generics: Set<String> = emptySet()): Type? {
        if (type.name in generics) return type
        if (type.name in seen) return null
        val scalar = when {
            type.name in setOf("int", "bool", "coins", "varint16", "varuint16", "varint32", "varuint32") -> "int"
            type.name.matches(Regex("u?int[0-9]+")) -> "int"
            type.name in setOf("slice", "address", "any_address") || type.name.matches(Regex("(?:bits|bytes)[0-9]+")) -> "slice"
            type.name in setOf("cell", "string") -> "cell"
            type.name == "continuation" -> "cont"
            type.name in setOf("builder", "tuple", "unknown") -> type.name
            else -> null
        }
        if (scalar != null) return Type(scalar)
        if (type.name == "tuple[]") return Type("tuple[]", type.items.map { erase(it, seen, generics) ?: return null })
        val underlying = aliases[type.name] ?: layouts[type.name] ?: return null
        return erase(underlying, seen + type.name, generics)
    }

    companion object {
        val standard by lazy {
            val root = TolkStdlibCatalog::class.java.getResourceAsStream("/tolk-stdlib/source.json")!!.use { ObjectMapper().readTree(it) }
            TolkStdlibCatalog(root["files"].associate { entry ->
                val name = entry["name"].asText().removeSuffix(".tolk")
                name to TolkStdlibCatalog::class.java.getResourceAsStream("/tolk-stdlib/$name.tolk")!!.use { it.readBytes().toString(Charsets.UTF_8) }
            })
        }

        fun read(text: String, module: String = ""): List<Declaration> {
            val source = TolkSource(text)
            val tokens = source.tokens
            return buildList {
                var index = 0
                var depth = 0
                while (index < tokens.size) {
                    if (depth == 0 && tokens[index].value == "fun") {
                        val open = (index + 1 until tokens.size).firstOrNull { tokens[it].value in setOf("(", "{", "fun") }
                        if (open != null && tokens[open].value == "(") {
                            val close = closingParenthesis(tokens, open)
                            val body = close?.let { (it + 1 until tokens.size).firstOrNull { i -> tokens[i].value in setOf("asm", "builtin", "{", "fun") } }
                            if (close != null && body != null && tokens[body].value == "asm") {
                                var end = body + 1
                                if (tokens.getOrNull(end)?.value == "(") end = (closingParenthesis(tokens, end) ?: end) + 1
                                while (tokens.getOrNull(end)?.value?.startsWith('"') == true) end++
                                declaration(source, module, index, open, close, body, end)?.let { add(it) }
                                index = end
                                continue
                            }
                        }
                    }
                    if (tokens[index].value == "{") depth++
                    if (tokens[index].value == "}") depth--
                    index++
                }
            }
        }

        fun functionNames(source: TolkSource): Set<String> = source.tokens.indices.filter { source.tokens[it].value == "fun" }.mapNotNull { index ->
            val end = (index + 1 until source.tokens.size).firstOrNull { source.tokens[it].value in setOf("(", "{", "fun") } ?: return@mapNotNull null
            source.tokens.subList(index + 1,end).joinToString("") { it.value }
        }.toSet()

        private fun declaration(source: TolkSource, module: String, index: Int, open: Int, close: Int, asm: Int, end: Int): Declaration? {
            val tokens = source.tokens
            if (tokens.getOrNull(close + 1)?.value != ":" || end <= asm + 1) return null
            val nameTokens = tokens.subList(index + 1, open)
            val dot = nameTokens.indexOfLast { it.value == "." }
            val receiver = if (dot >= 0) parseType(nameTokens.take(dot)) ?: return null else null
            val function = nameTokens.drop(dot + 1)
            if (function.firstOrNull()?.identifier != true) return null
            val generics = (nameTokens + function.drop(1)).windowed(2).filter { it[0].value in setOf("<", ",") && it[1].identifier }
                .map { it[1].value }.toSet()
            if (function.size != 1 && (function.getOrNull(1)?.value != "<" || function.last().value != ">")) return null
            val name = (receiver?.name?.let { "$it." } ?: "") + function.first().value
            val arguments = mutableListOf<Type>(); val names = mutableListOf<String>(); val mutations = mutableListOf<Int>()
            for (argument in split(tokens.subList(open + 1, close))) {
                var parameter = argument
                if (parameter.firstOrNull()?.value == "mutate") { mutations += arguments.size; parameter = parameter.drop(1) }
                val default = parameter.indexOfFirst { it.value == "=" }
                if (default >= 0) parameter = parameter.take(default)
                if (parameter.firstOrNull()?.identifier != true) return null
                val argumentType = if (parameter.size == 1 && parameter[0].value == "self") receiver else
                    parameter.takeIf { it.getOrNull(1)?.value == ":" }?.drop(2)?.let(::parseType)
                arguments += argumentType ?: return null
                names += parameter.first().value
            }
            if (names.distinct().size != names.size) return null
            val returnTokens = tokens.subList(close + 2, asm)
            val returnsSelf = returnTokens.singleOrNull()?.value == "self"
            val results = mutations.map { arguments[it] } + if (returnsSelf && mutations.isNotEmpty()) emptyList() else
                if (returnsSelf) listOf(receiver ?: return null) else resultTypes(returnTokens) ?: return null
            var body = tokens.subList(asm + 1,end)
            var inputOrder = arguments.indices.toList(); var outputOrder = results.indices.toList()
            if (body.firstOrNull()?.value == "(") {
                val last = closingParenthesis(body,0) ?: return null
                val order = body.subList(1,last)
                val arrow = order.indices.firstOrNull { order[it].value == "-" && order.getOrNull(it+1)?.value == ">" }
                val inputs = if (arrow == null) order else order.take(arrow)
                if (inputs.isNotEmpty()) inputOrder = inputs.map { names.indexOf(it.value).takeIf { n -> n >= 0 } ?: return null }
                if (arrow != null) outputOrder = order.drop(arrow+2).map { it.value.toIntOrNull() ?: return null }
                body = body.drop(last+1)
            }
            if (inputOrder.sorted() != arguments.indices.toList() || outputOrder.sorted() != results.indices.toList()) return null
            if (body.isEmpty() || body.any { !it.value.startsWith('"') || !it.value.endsWith('"') || '\\' in it.value }) return null
            val instructions = StdlibAsm.key(body.joinToString(" ") { it.value.substring(1,it.value.lastIndex) }) ?: return null
            var start = index; var pure = false
            while (start > 1) {
                var annotation = start-1
                if (tokens[annotation].value == ")") {
                    var level = 1; annotation--
                    while (annotation >= 0 && level > 0) {
                        if (tokens[annotation].value == ")") level++
                        if (tokens[annotation].value == "(") level--
                        annotation--
                    }
                }
                if (annotation < 1 || !tokens[annotation].identifier || tokens[annotation-1].value != "@") break
                if (tokens[annotation].value !in setOf("pure", "deprecated")) return null
                if (tokens[annotation].value == "pure") pure = true
                start = annotation-1
            }
            return Declaration(name,module,nameTokens,tokens[start].start,tokens[end-1].end,arguments,results,names,generics,
                inputOrder,outputOrder,pure,mutations,receiver,instructions)
        }

        private fun resultTypes(tokens: List<Token>): List<Type>? {
            if (tokens.singleOrNull()?.value == "void") return emptyList()
            if (tokens.firstOrNull()?.value == "(" && closingParenthesis(tokens,0) == tokens.lastIndex)
                return split(tokens.drop(1).dropLast(1)).map { parseType(it) ?: return null }
            return listOf(parseType(tokens) ?: return null)
        }

        private fun parseType(tokens: List<Token>): Type? {
            if (tokens.isEmpty()) return null
            if (tokens.last().value == "?") return parseType(tokens.dropLast(1))?.copy(nullable = true)
            if (tokens.size == 1 && tokens[0].identifier) return Type(tokens[0].value)
            if (tokens.first().value == "[" && tokens.last().value == "]")
                return Type("tuple[]", split(tokens.drop(1).dropLast(1)).map { parseType(it) ?: return null })
            if (tokens.first().identifier && tokens.getOrNull(1)?.value == "<" && tokens.last().value == ">")
                return Type(tokens[0].value, split(tokens.drop(2).dropLast(1)).map { parseType(it) ?: return null })
            return null
        }

        private fun split(tokens: List<Token>): List<List<Token>> {
            if (tokens.isEmpty()) return emptyList()
            val result = mutableListOf<List<Token>>(); var start = 0; var depth = 0
            for ((index,token) in tokens.withIndex()) {
                if (token.value in setOf("(", "[", "<")) depth++
                if (token.value in setOf(")", "]", ">")) depth--
                if (token.value == "," && depth == 0) { result += tokens.subList(start,index); start = index+1 }
            }
            result += tokens.subList(start,tokens.size)
            return result
        }
    }
}
