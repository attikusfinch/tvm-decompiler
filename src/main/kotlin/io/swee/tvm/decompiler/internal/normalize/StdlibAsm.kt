package io.swee.tvm.decompiler.internal.normalize

import com.fasterxml.jackson.databind.ObjectMapper
import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry

/** Shared by both library catalogs. Unknown words/operands never produce a partial match. */
internal object StdlibAsm {
    data class Instruction(val kind: String, val operands: Map<String, String>)
    private val cp0 by lazy { Cp0InstructionRegistry.create() }
    private val documentedAliases: Map<String, String> by lazy {
        val root = StdlibAsm::class.java.getResourceAsStream("/cp0_fixed.json")!!.use { ObjectMapper().readTree(it) }
        root["aliases"].flatMap { alias ->
            val name = alias["mnemonic"].asText()
            if (cp0.getByOpcode(name) == null) emptyList() else
                alias["doc_fift"]?.asText()?.lineSequence()?.map { it.trim() }
                    ?.filter { it.matches(Regex("[A-Z][A-Z0-9_]*")) }?.map { it to name }?.toList() ?: emptyList()
        }.groupBy({ it.first }, { it.second }).mapNotNull { (alias, names) ->
            names.distinct().singleOrNull()?.let { alias to it }
        }.toMap()
    }

    fun key(expression: String): List<Instruction>? {
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
