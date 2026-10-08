package io.swee.tvm.decompiler.internal.normalize

import com.fasterxml.jackson.databind.ObjectMapper
import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

/** Declaration facts come from the actual output library; opcode aliases come from CP0 metadata. */
internal class FuncStdlibCatalog(library: String, builtin: String = "") {
    data class Type(val name: String, val items: List<Type> = emptyList())
    data class Declaration(val signature: FuncSource.Signature, val name: String,
        val arguments: List<Type>, val results: List<Type>, val generics: Set<String>,
        val inputOrder: List<Int>, val outputOrder: List<Int>, val impure: Boolean,
        val instructions: List<Instruction>, val builtin: Boolean) {
        val physicalArguments get() = inputOrder.map { arguments[it] }
        // asm(-> 1 0) names physical results in the order returned to FunC.
        val physicalResults get() = outputOrder.indices.map { physical -> results[outputOrder.indexOf(physical)] }
    }
    data class Instruction(val kind: String, val operands: Map<String, String>)
    val declarations = listOf(library to false, builtin to true).flatMap { (text, builtIn) ->
        val source = FuncSource(text)
        source.signatures.mapNotNull { declaration(it, builtIn) }
    }
    private val modifying = listOf(library, builtin).flatMap { FuncSource(it).signatures }
        .filter { it.modifying }.groupBy { it.name.value }

    /** ~name can override name; a cursor rewrite must use the same declaration facts. */
    fun compatibleModifyingDeclaration(regular: Declaration): Boolean {
        val definitions = modifying[regular.name] ?: return true
        val modifier = definitions.singleOrNull()?.let { declaration(it.copy(modifying = false)) } ?: return false
        return modifier.arguments == regular.arguments && modifier.results == regular.results &&
            modifier.generics == regular.generics && modifier.inputOrder == regular.inputOrder &&
            modifier.outputOrder == regular.outputOrder && modifier.impure == regular.impure &&
            modifier.instructions == regular.instructions
    }

    fun candidates(wrapper: Declaration): List<Declaration> = declarations.filter { candidate ->
        candidate.instructions == wrapper.instructions && compatible(candidate, wrapper)
    }.distinctBy { it.name }

    private fun compatible(candidate: Declaration, wrapper: Declaration): Boolean {
        if (candidate.arguments.size != wrapper.arguments.size || candidate.results.size != wrapper.results.size) return false
        val bindings = mutableMapOf<String, Type>()
        fun match(expected: Type, actual: Type): Boolean {
            if (expected.name in candidate.generics) return bindings.getOrPut(expected.name) { actual } == actual
            return expected.name == actual.name && expected.items.size == actual.items.size &&
                expected.items.zip(actual.items).all { (a, b) -> match(a, b) }
        }
        return candidate.physicalArguments.zip(wrapper.physicalArguments).all { (a, b) -> match(a, b) } &&
            candidate.physicalResults.zip(wrapper.physicalResults).all { (a, b) -> match(a, b) }
    }

    companion object {
        private val cp0 by lazy { Cp0InstructionRegistry.create() }
        private val documentedAliases: Map<String, String> by lazy {
            val root = FuncStdlibCatalog::class.java.getResourceAsStream("/cp0_fixed.json")!!.use { ObjectMapper().readTree(it) }
            root["aliases"].flatMap { alias ->
                val name = alias["mnemonic"].asText()
                if (cp0.getByOpcode(name) == null) emptyList() else
                    alias["doc_fift"]?.asText()?.lineSequence()?.map { it.trim() }
                        ?.filter { it.matches(Regex("[A-Z][A-Z0-9_]*")) }?.map { it to name }?.toList() ?: emptyList()
            }.groupBy({ it.first }, { it.second }).mapNotNull { (alias, names) ->
                names.distinct().singleOrNull()?.let { alias to it }
            }.toMap()
        }

        fun declaration(signature: FuncSource.Signature, builtin: Boolean = false): Declaration? {
            if (signature.modifying || !signature.name.value.matches(Regex("[A-Za-z_][A-Za-z0-9_?]*"))) return null
            val resultTokens = signature.result
            val arrow = resultTokens.indices.firstOrNull { resultTokens[it].value == "-" && resultTokens.getOrNull(it + 1)?.value == ">" }
            val generics = if (resultTokens.firstOrNull()?.value == "forall" && arrow != null)
                resultTokens.subList(1, arrow).filter { it.identifier }.map { it.value }.toSet() else emptySet()
            val returns = if (generics.isEmpty()) resultTokens else resultTokens.drop(arrow!! + 2)
            val results = resultTypes(returns, generics) ?: return null
            val parameterTokens = listOf(Token("(", 0, 0)) + signature.parameters + Token(")", 0, 0)
            val parameters = callArguments(parameterTokens, 0, parameterTokens.lastIndex)
            if (parameters.any { it.size < 2 || !it.last().identifier }) return null
            val arguments = parameters.map { type(it.dropLast(1), generics) ?: return null }
            val names = parameters.map { it.last().value }
            if (names.distinct().size != names.size) return null
            val header = signature.header
            val open = header.indexOfFirst { it.start >= signature.name.end && it.value == "(" }
            val close = closingParenthesis(header, open) ?: return null
            val qualifiers = header.drop(close + 1)
            val asm = qualifiers.indexOfFirst { it.value == "asm" }
            if (asm < 0 || qualifiers.take(asm).any { it.value != "impure" }) return null
            var body = qualifiers.drop(asm + 1)
            var inputs = arguments.indices.toList()
            var outputs = results.indices.toList()
            if (body.firstOrNull()?.value == "(") {
                val end = closingParenthesis(body, 0) ?: return null
                val description = body.subList(1, end)
                val split = description.indices.firstOrNull { description[it].value == "-" && description.getOrNull(it + 1)?.value == ">" }
                val before = if (split == null) description else description.take(split)
                if (before.isNotEmpty()) inputs = before.map { names.indexOf(it.value).takeIf { it >= 0 } ?: return null }
                if (split != null) outputs = description.drop(split + 2).map { it.value.toIntOrNull() ?: return null }
                body = body.drop(end + 1)
            }
            if (inputs.sorted() != arguments.indices.toList() || outputs.sorted() != results.indices.toList()) return null
            if (body.isEmpty() || body.any { !it.value.startsWith('"') || !it.value.endsWith('"') || '\\' in it.value }) return null
            val instructions = instructionKey(body.joinToString(" ") { it.value.substring(1, it.value.lastIndex) }) ?: return null
            return Declaration(signature, signature.name.value, arguments, results, generics, inputs, outputs,
                qualifiers.take(asm).any { it.value == "impure" }, instructions, builtin)
        }

        private fun resultTypes(tokens: List<Token>, generics: Set<String>): List<Type>? {
            if (tokens.firstOrNull()?.value == "(" && closingParenthesis(tokens, 0) == tokens.lastIndex)
                return callArguments(tokens, 0, tokens.lastIndex).map { type(it, generics) ?: return null }
            return listOf(type(tokens, generics) ?: return null)
        }

        private fun type(tokens: List<Token>, generics: Set<String>): Type? {
            if (tokens.size == 1 && tokens[0].value in FuncSource.primitiveTypes + generics) return Type(tokens[0].value)
            if (tokens.firstOrNull()?.value == "[" && tokens.lastOrNull()?.value == "]") {
                val content = listOf(Token("(", 0, 0)) + tokens.drop(1).dropLast(1) + Token(")", 0, 0)
                val items = callArguments(content, 0, content.lastIndex).map { type(it, generics) ?: return null }
                return Type("tuple[]", items)
            }
            return null
        }

        /** Fail closed on unconsumed constants, unknown words, refs, macros and incomplete operands. */
        private fun instructionKey(expression: String): List<Instruction>? {
            val text = expression.replace(Regex("c(\\d+)\\s+PUSH\\b"), "$1 PUSHCTR")
                .replace(Regex("c(\\d+)\\s+POP\\b"), "$1 POPCTR")
            val pending = ArrayDeque<String>()
            val result = mutableListOf<Instruction>()
            for (word in text.trim().split(Regex("\\s+"))) {
                val data = cp0.getByOpcode(word) ?: documentedAliases[word]?.let { cp0.getByOpcode(it) }
                if (data == null) {
                    val number = word.removePrefix("c").removePrefix("s").toBigIntegerOrNull() ?: return null
                    pending.addLast(number.toString())
                } else {
                    val operands = data.implicitOperands.mapValues { it.value.toString() }.toMutableMap()
                    for (operand in data.instDescriptionRaw.bytecode.operands.asReversed()) {
                        if (operand.name !in operands) operands[operand.name] = pending.removeLastOrNull() ?: return null
                    }
                    result += Instruction(data.instClass.name, operands)
                }
            }
            return result.takeIf { it.isNotEmpty() && pending.isEmpty() }
        }
    }
}
