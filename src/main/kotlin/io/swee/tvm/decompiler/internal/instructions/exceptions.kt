package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*

/** Recognizes the compiler's register-saving TRY envelope, never an arbitrary c2 handler. */
fun tryParseCompilerTry(registry: ParserRegistry, ctx: IrBlockBuilder, inst: TvmInst, tail: MutableList<TvmInst>): Boolean {
    if (inst.mnemonic != "PUSHCTR" && inst !is TvmConstDataPushcontShortInst &&
        inst !is TvmConstDataPushcontInst && inst !is TvmConstDataPushrefcontInst) return false
    val input = listOf(inst) + tail
    fun registerAt(index: Int, mnemonic: String, number: Int) = input.getOrNull(index)?.let {
        it.mnemonic == mnemonic && InstValueAccessor.getValue(it, "i").toString().toInt() == number
    } == true
    fun continuationAt(index: Int): List<TvmInst>? = when (val value = input.getOrNull(index)) {
        is TvmConstDataPushcontShortInst -> value.c.list
        is TvmConstDataPushcontInst -> value.c.list
        is TvmConstDataPushrefcontInst -> value.c.list
        else -> null
    }
    val compact = input.getOrNull(1)?.let {
        it.mnemonic == "SETCONTCTRMANY" && InstValueAccessor.getValue(it, "mask").toString().toInt() == 186
    } == true
    val handler: List<TvmInst>
    var cursor: Int
    if (compact) {
        handler = continuationAt(0) ?: return false
        cursor = 2
    } else {
        if (!listOf(1, 3, 4, 5, 7).withIndex().all { (i, r) -> registerAt(i, "PUSHCTR", r) }) return false
        handler = continuationAt(5) ?: return false
        if (!listOf(7, 5, 4, 3, 1).withIndex().all { (i, r) -> registerAt(i + 6, "SETCONTCTR", r) }) return false
        cursor = 11
    }
    fun integerAt(index: Int): Int? = when (val value = input.getOrNull(index)) {
        is TvmConstIntPushint4Inst -> ((value.i + 5) and 15) - 5
        is TvmConstIntPushint8Inst -> value.x
        is TvmConstIntPushint16Inst -> value.x
        else -> null
    }
    var captures = 0
    if (input.getOrNull(cursor + 2)?.mnemonic == "SETCONTVARARGS") {
        captures = integerAt(cursor) ?: return false
        if (captures !in 0..255 || integerAt(cursor + 1) != -1) return false
        cursor += 3
    }
    val body = continuationAt(cursor++) ?: return false
    fun swapAt(index: Int) = when (val value = input.getOrNull(index)) {
        is TvmStackBasicXchg0iInst -> value.i == 1
        is TvmStackBasicXchg0iLongInst -> value.i == 1
        else -> false
    }
    if (!registerAt(cursor++, "PUSHCTR", 1) || input.getOrNull(cursor++)?.mnemonic != "COMPOSALT" ||
        !swapAt(cursor++) || input.getOrNull(cursor++)?.mnemonic != "TRY") return false

    val captured = (0 until captures).map { ctx.stackPop() }
    val argument = StackEntry.Simple(TvmStackEntryType.UNKNOWN, name("exception_value"))
    val code = StackEntry.Simple(TvmStackEntryType.INT, name("exception_code"))
    fun branches(): Pair<IrBlockBuilder, IrBlockBuilder> {
        val (_, tried) = parseContinuation(registry, ctx, body)
        val caught = ctx.fork()
        // On an exception the VM discards the live operand stack. Only the handler's
        // captured stack followed by the exception value and code is available.
        caught.stackReplace(listOf(code, argument) + captured)
        caught.isReturnContext = false
        TvmDecompilerImpl.parseCodeBlock(registry, caught, handler, false)
        check(caught.upstream.getUsedEntries().size == ctx.upstream.getUsedEntries().size) {
            "TRY handler consumes an uncaptured stack slot"
        }
        return tried to caught
    }
    var (tried, caught) = branches()
    val extra = tried.upstream.getUsedEntries().size - ctx.upstream.getUsedEntries().size
    if (extra > 0) {
        ctx.stackEnsureAtLeast(ctx.stackDepth() + extra)
        val reparsed = branches(); tried = reparsed.first; caught = reparsed.second
    }
    val node = IRNode.TryCatch(tried.build(), caught.build(), argument, code)
    val surviving = listOf(tried, caught).filterNot { it.hasDiverged }
    if (surviving.isEmpty()) {
        ctx.appendNode(node)
        ctx.mergeUpstreams(listOf(tried, caught))
        ctx.hasDiverged = true
    } else {
        val local = mutableSetOf<StackEntry>()
        node.accept(object : io.swee.tvm.decompiler.internal.ir.IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                if (!node.reassignment) local += node.entries
            }
        })
        // Even one surviving arm needs an outer phi when its result was declared
        // inside the TRY scope (the other arm can rethrow or return).
        ControlFlowResolver.resolveForward(ctx, listOf(node), surviving, used = listOf(tried, caught), scopeLocal = local)
    }
    repeat(cursor - 1) { tail.removeFirst() }
    return true
}
