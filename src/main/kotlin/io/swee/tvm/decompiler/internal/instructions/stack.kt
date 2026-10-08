package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*

fun registerStackParsers(registry: ParserRegistry) {
    fun IrBlockBuilder.stackSwap(a: Int, b: Int) {
        val ref = stackFetch(a)
        stackSet(a, stackFetch(b))
        stackSet(b, ref)
    }
    fun IrBlockBuilder.stackPopMany(count: Int) {
        repeat(count) {
            stackPop()
        }
    }
    fun IrBlockBuilder.stackReverse(start: Int, end: Int) {
        val copy = stackCopy().toMutableList()

        var i = start
        var j = end - 1

        while (i < j) {
            val a = copy[i]
            val b = copy[j]
            copy[i] = b
            copy[j] = a
            i++
            j--
        }

        stackReplace(copy)
    }

    with(registry) {
        register<TvmStackBasicNopInst>(ParserLevel.MANUAL) { ctx, _ ->
            // NOP has no stack operands. The stdlib's generic touch overload
            // cannot describe this opcode's runtime ABI. Keep its gas/position.
            ctx.appendNode(IRNode.VariableDeclaration(emptyList(), IRNode.FunctionCall("asm_NOP", emptyList(), "\"NOP\"")))
        }
        register<TvmStackBasicXchg0iInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackSwap(0, inst.i)
        }
        register<TvmStackBasicXchg0iLongInst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackSwap(0, inst.i)
        }
        register<TvmStackBasicXchgIjInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.j)
            ctx.stackSwap(inst.i, inst.j)
        }
        register<TvmStackBasicXchg1iInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackSwap(1, inst.i)
        }
        register<TvmStackBasicPushInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackPush(ctx.stackFetch(inst.i))
        }
        register<TvmStackComplexPushLongInst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackPush(ctx.stackFetch(inst.i))
        }
        register<TvmStackBasicPopInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            if (inst.i == 0) {
                ctx.stackPop()
            } else {
                ctx.stackSwap(0, inst.i)
                ctx.stackPop()
            }
        }
        register<TvmStackComplexPopLongInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            if (inst.i == 0) {
                ctx.stackPop()
            } else {
                ctx.stackSwap(0, inst.i)
                ctx.stackPop()
            }
        }
        register<TvmStackComplexXchg2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, 1)
            ctx.stackSwap(1, inst.i)
            ctx.stackSwap(0, inst.j)
        }
        register<TvmStackComplexXcpuInst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j)
            ctx.stackSwap(0, inst.i)
            ctx.stackPush(ctx.stackFetch(inst.j))
        }
        register<TvmStackComplexPuxcInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackEnsureAtLeast(inst.j)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackSwap(0, 1)
            ctx.stackSwap(0, inst.j)
        }
        register<TvmStackComplexPush2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackPush(ctx.stackFetch(inst.j + 1))
        }
        register<TvmStackComplexXchg3Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, inst.k, 2)
            ctx.stackSwap(2, inst.i);
            ctx.stackSwap(1, inst.j);
            ctx.stackSwap(0, inst.k);
        }
        register<TvmStackComplexXc2puInst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, inst.k, 1)
            ctx.stackSwap(1, inst.i)
            ctx.stackSwap(0, inst.j)
            ctx.stackPush(ctx.stackFetch(inst.k))
        }
        register<TvmStackComplexXcpuxcInst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, 1)
            ctx.stackEnsureAtLeast(inst.k)
            ctx.stackSwap(1, inst.i)
            ctx.stackPush(ctx.stackFetch(inst.j))
            ctx.stackSwap(0, 1)
            ctx.stackSwap(0, inst.k)
        }
        register<TvmStackComplexXcpu2Inst> (ParserLevel.MANUAL){ ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, inst.k)
            ctx.stackSwap(0, inst.i)
            ctx.stackPush(ctx.stackFetch(inst.j))
            ctx.stackPush(ctx.stackFetch(inst.k + 1))
        }
        register<TvmStackComplexPuxc2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackEnsureAtLeast(inst.j, inst.j)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackSwap(2, 0)
            ctx.stackSwap(1, inst.j)
            ctx.stackSwap(0, inst.k)
        }
        register<TvmStackComplexPuxcpuInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackEnsureAtLeast(inst.j, inst.k)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackSwap(0, 1)
            ctx.stackSwap(0, inst.j)
            ctx.stackPush(ctx.stackFetch(inst.k))
        }
        register<TvmStackComplexPu2xcInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i)
            ctx.stackEnsureAtLeast(inst.j, inst.k - 1)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackSwap(1, 0)
            ctx.stackPush(ctx.stackFetch(inst.j))
            ctx.stackSwap(1, 0)
            ctx.stackSwap(0, inst.k)
        }
        register<TvmStackComplexPush3Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.i, inst.j, inst.k)
            ctx.stackPush(ctx.stackFetch(inst.i))
            ctx.stackPush(ctx.stackFetch(inst.j + 1))
            ctx.stackPush(ctx.stackFetch(inst.k + 2))
        }
        register<TvmStackComplexBlkswapInst>(ParserLevel.MANUAL) { ctx, inst ->
            val n = inst.i + 1
            val k = inst.j + 1
            ctx.stackEnsureAtLeast(n + k)

            val topBlock = (0 until k).map { ctx.stackPop() }
            val deepBlock = (0 until n).map { ctx.stackPop() }

            topBlock.reversed().forEach { ctx.stackPush(it) }
            deepBlock.reversed().forEach { ctx.stackPush(it) }
        }
        register<TvmStackComplexRotInst>(ParserLevel.MANUAL) {ctx, inst ->
            ctx.stackEnsureAtLeast(3)
            ctx.stackSwap(1, 2)
            ctx.stackSwap(0, 1)
        }
        register<TvmStackComplexRotrevInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(3)
            ctx.stackSwap(0, 1)
            ctx.stackSwap(1, 2)
        }
        register<TvmStackComplexSwap2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(4)
            ctx.stackSwap(1, 3)
            ctx.stackSwap(0, 2)
        }
        register<TvmStackComplexDrop2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(2)
            ctx.stackPop()
            ctx.stackPop()
        }
        register<TvmStackComplexDup2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(2)
            ctx.stackPush(ctx.stackFetch(1))
            ctx.stackPush(ctx.stackFetch(1))
        }
        register<TvmStackComplexOver2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(4)
            ctx.stackPush(ctx.stackFetch(3))
            ctx.stackPush(ctx.stackFetch(3))
        }
        register<TvmStackComplexReverseInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(inst.i + inst.j + 2)
            ctx.stackReverse(inst.j, inst.i + inst.j + 2)
        }
        register<TvmStackComplexBlkdropInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(inst.i)
            ctx.stackPopMany(inst.i)
        }
        register<TvmStackComplexBlkdrop2Inst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(inst.i + inst.j)
            val keep = (0 until inst.j).map { ctx.stackPop() }
            repeat(inst.i) { ctx.stackPop() }
            keep.reversed().forEach { ctx.stackPush(it) }
        }
        register<TvmStackComplexBlkpushInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureMoreThan(inst.j)
            repeat(inst.i) {
                ctx.stackPush(ctx.stackFetch(inst.j))
            }
        }
        register<TvmStackComplexTuckInst>(ParserLevel.MANUAL) { ctx, inst ->
            ctx.stackEnsureAtLeast(2)
            ctx.stackSwap(0, 1)
            ctx.stackPush(ctx.stackFetch(1))
        }
    }
}
