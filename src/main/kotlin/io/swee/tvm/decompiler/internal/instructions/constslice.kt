package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.api.OutputLanguage
import io.swee.tvm.decompiler.internal.TvmStackEntryType.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.TvmCell
import org.ton.bytecode.TvmInst

private fun <T : TvmInst> embeddedConstSlice(
    funcName: String,
    outputs: List<Pair<TvmStackEntryType, String>>
): InstParserFull<T> = parser@{ ctx, inst ->
    if (ctx.options.exact) return@parser false
    // Tolk lazy matching uses SDBEGINSQ. Keep the embedded opcode in the existing
    // exact-asm fallback instead of replacing it with PUSHSLICE + SDBEGINSXQ.
    if (funcName == "begins_with" && ctx.options.language == OutputLanguage.TOLK) return@parser false
    val subslice = InstValueAccessor.getValue(inst, "s") as TvmCell
    val input = ctx.stackPop(if (funcName == "store_slice") BUILDER.typename else SLICE.typename)
    val outEntries = outputs.map { (t, n) -> StackEntry.Simple(t, name(n)) }
    ctx.appendNode(
        IRNode.VariableDeclaration(
            outEntries,
            IRNode.FunctionCall(
                funcName,
                listOf(IRNode.VariableUsage(input, tracked = true), IRNode.SliceLiteral(subslice))
            )
        )
    )
    outEntries.forEach { ctx.stackPush(it) }
    true
}

fun registerConstSliceParsers(registry: ParserRegistry) {
    with(registry) {
        register(
            org.ton.bytecode.TvmCellBuildStsliceconstInst::class.java,
            ParserLevel.MANUAL,
            embeddedConstSlice("store_slice", listOf(BUILDER to "b")),
            predicate = { true }
        )
        register(
            org.ton.bytecode.TvmCellParseSdbeginsqInst::class.java,
            ParserLevel.MANUAL,
            embeddedConstSlice("begins_with", listOf(SLICE to "s", INT to "matched")),
            predicate = { true }
        )
        register(
            org.ton.bytecode.TvmCellParseSdbeginsInst::class.java,
            ParserLevel.MANUAL,
            embeddedConstSlice("begins_with_or_throw", listOf(SLICE to "s")),
            predicate = { true }
        )
    }
}
