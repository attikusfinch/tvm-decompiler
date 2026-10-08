package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.TvmStackEntryType.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*
import java.math.BigInteger

private fun <T : TvmInst> pushInt(value: (inst: T) -> String): InstParserShort<T> {
    return { ctx, inst ->
        val v = value(inst)
        val res = StackEntry.Simple(INT, name("constval"), ConcreteValue.IntVal(v))
        ctx.stackPush(res)

        ctx
            .appendNode(IRNode.VariableDeclaration(listOf(res), IRNode.IntLiteral(v)))
    }
}
private fun <T : TvmInst> pushSlice(value: (inst: T) -> TvmCell): InstParserShort<T> {
    return { ctx, inst ->
        val v = value(inst)
        val res = StackEntry.Simple(SLICE, name("constslice"), ConcreteValue.SliceVal(v))
        ctx.stackPush(res)

        ctx
            .appendNode(IRNode.VariableDeclaration(listOf(res), IRNode.SliceLiteral(v)))
    }
}

fun registerConstParsers(registry: ParserRegistry) {
    with(registry) {
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushintLongInst> { it.x.toBigInteger().toString() })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushint16Inst> { it.x.toBigInteger().toString() })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushint8Inst> { it.x.toBigInteger().toString() })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushint4Inst> { (((it.i + 5) and 15) - 5).toBigInteger().toString() })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushpow2Inst> {
            BigInteger.TWO.pow(it.x + 1).toString()
        })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushnegpow2Inst> {
            BigInteger.TWO.pow(it.x + 1).negate().toString()
        })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushpow2decInst> {
            BigInteger.TWO.pow(it.x + 1).minus(BigInteger.ONE).toString()
        })
        register(ParserLevel.MANUAL, pushInt<TvmConstIntPushnanInst> {
            "NaN" // TODO ?
        })
        register(ParserLevel.MANUAL, pushSlice<TvmConstDataPushsliceInst> { it.s })
        register(ParserLevel.MANUAL, pushSlice<TvmConstDataPushsliceLongInst> { it.slice })
        register(ParserLevel.MANUAL, pushSlice<TvmConstDataPushsliceRefsInst> { it.slice })
        register(ParserLevel.MANUAL, pushSlice<TvmConstDataPushrefsliceInst> { it.c })
    }
}
