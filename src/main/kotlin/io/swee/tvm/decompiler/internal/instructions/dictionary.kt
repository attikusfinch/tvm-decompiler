package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*

/** A quiet lookup's success flag is consumed by THROWIFNOT, proving a fixed surviving width. */
fun registerDictionaryParsers(registry: ParserRegistry) {
    val lookups = listOf(
        TvmDictGetDictgetInst::class.java, TvmDictGetDictigetInst::class.java, TvmDictGetDictugetInst::class.java,
        TvmDictGetDictgetrefInst::class.java, TvmDictGetDictigetrefInst::class.java, TvmDictGetDictugetrefInst::class.java,
    )
    for (lookup in lookups) for (guard in listOf(TvmExceptionsThrowifnotShortInst::class.java, TvmExceptionsThrowifnotInst::class.java)) {
        registry.registerChain(listOf(lookup, guard), ParserLevel.MANUAL, { ctx, instructions ->
            val opcode = instructions[0].mnemonic
            val code = when (val instruction = instructions[1]) {
                is TvmExceptionsThrowifnotShortInst -> instruction.n
                is TvmExceptionsThrowifnotInst -> instruction.n
                else -> error("Expected THROWIFNOT")
            }
            val width = ctx.stackPop(TvmStackEntryType.INT.typename)
            val dictionary = ctx.stackPop(TvmStackEntryType.CELL.typename)
            val key = ctx.stackPop(if (opcode in setOf("DICTGET", "DICTGETREF")) TvmStackEntryType.SLICE.typename else TvmStackEntryType.INT.typename)
            val result = StackEntry.Simple(if (opcode.endsWith("REF")) TvmStackEntryType.CELL else TvmStackEntryType.SLICE, name("dict_value"))
            val call = IRNode.FunctionCall("asm_${opcode}_MUST_$code",
                listOf(key, dictionary, width).map { IRNode.VariableUsage(it, tracked = true) },
                "\"$opcode\" \"$code THROWIFNOT\"")
            ctx.appendNode(IRNode.VariableDeclaration(listOf(result), call))
            ctx.stackPush(result)
            true
        })
    }
}
