package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.ir.IRNode
import java.util.*

object ControlFlowResolver {

    private fun appendDefault(ctx: IrBlockBuilder, merged: StackEntry, type: TvmStackEntryType) {
        val registry = ctx.registry
        val insts = type.default()
        if (registry == null || insts.isEmpty()) {
            ctx.appendNode(IRNode.VariableDeclaration(listOf(merged), IRNode.IntLiteral("null()")))
            return
        }
        val probe = IrBlockBuilder(FixedUpstreamStack(listOf()))
        probe.registry = registry
        for (inst in insts) registry.parse(probe, inst)
        val nodes = probe.build().entries
        nodes.forEachIndexed { i, node ->
            if (i == nodes.lastIndex && node is IRNode.VariableDeclaration) {
                ctx.appendNode(IRNode.VariableDeclaration(listOf(merged), node.value, node.untuple, node.reassignment))
            } else {
                ctx.appendNode(node)
            }
        }
    }

    // if else
    fun resolveForward(
        ctx: IrBlockBuilder,
        newNodes: List<IRNode>,
        finalized: List<IrBlockBuilder>,
        fallthrough: IrBlockBuilder? = null,
        used: List<IrBlockBuilder> = listOf(),
        scopeLocal: Set<StackEntry> = emptySet()
    ) {
        val allBranches = buildList {
            fallthrough?.let(::add)
            addAll(finalized)
        }
        val headBranch = allBranches.firstOrNull() ?: error("No finalized entry")
        val tailBranches = allBranches.drop(1)

        for (branch in (allBranches + used).distinct()) {
            ctx.upstream.trackDiscoveries(branch.upstream)
        }

        ensureStackDepths(headBranch, tailBranches)

        val mergedStack = LinkedList<StackEntry>()

        val sampleDepth = headBranch.stackDepth()

        for (i in 0 until sampleDepth) {
            val entriesAtPosition = allBranches.map { it.stackFetch(i) }
            val sampleEntry = headBranch.stackFetch(i)

            val joined = StackEntry.merge(entriesAtPosition)!!
            val merged = if (joined in scopeLocal) StackEntry.Simple(joined.type, StackEntryName.Const("phi")) else joined
            if (merged === entriesAtPosition.first()) {
                mergedStack.add(merged)
            } else {
                mergedStack.add(merged)

                if (fallthrough == null) {
                    appendDefault(ctx, merged, merged.type)
                } else {
                    ctx.appendNode(
                        IRNode.VariableDeclaration(
                            entries = listOf(merged),
                            value = IRNode.VariableUsage(sampleEntry, tracked = true)
                        )
                    )
                }

                allBranches.forEachIndexed { branchIndex, branchBuilder ->
                    val valueInBranch = entriesAtPosition[branchIndex]

                    branchBuilder.appendNode(
                        IRNode.VariableDeclaration(
                            listOf(merged),
                            IRNode.VariableUsage(valueInBranch, tracked = true),
                            reassignment = true
                        )
                    )
                }
            }
        }

        ctx.stackReplace(mergedStack)
        ctx.mergeUpstreams(finalized, fallthrough, used)

        for (newNode in newNodes) {
            ctx.appendNode(newNode)
        }
    }

    data class BackwardUpdate(
        val entry: StackEntry,
        val i: Int
    )
    // while
    fun preResolveBackward(
        ctx: IrBlockBuilder,
        after: IrBlockBuilder,
        until: Boolean
    ): List<BackwardUpdate>? {
        val afterStack = if (until) {
            after.stackCopy().drop(1)
        } else {
            after.stackCopy()
        }

        if (afterStack.size > ctx.stackDepth()) {
            ctx.stackEnsureAtLeast(afterStack.size)
            return null
        }

        check(ctx.stackDepth() == afterStack.size) {
            "Backward flow stack depth mismatch"
        }

        val mergedStack = LinkedList<StackEntry>()
        val updates = mutableListOf<BackwardUpdate>()

        val stackDepth = ctx.stackDepth()
        for (i in 0 until stackDepth) {
            val startVal = ctx.stackFetch(i)
            val endVal = afterStack[i]

            val merged = StackEntry.merge(listOf(startVal, endVal))!!
            if (merged === startVal) {
                mergedStack.add(startVal)
            } else {
                mergedStack.add(merged)

                ctx.appendNode(IRNode.VariableDeclaration(
                    entries = listOf(merged),
                    value = IRNode.VariableUsage(startVal, tracked = true)
                ))

                updates.add(BackwardUpdate(merged, i))
            }
        }

        ctx.stackReplace(mergedStack)

        return updates
    }

    fun postResolveBackward(
        ctx: IrBlockBuilder,
        after: IrBlockBuilder,
        newNodes: (IrBlockBuilder) -> List<IRNode>,
        backwardUpdate: List<BackwardUpdate>,
        until: Boolean
    ) {
        val afterStack = if (until) {
            after.stackCopy().drop(1)
        } else {
            after.stackCopy()
        }

        for (update in backwardUpdate.reversed()) {
            val newValue = afterStack[update.i]

            after.appendNode(IRNode.VariableDeclaration(
                entries = listOf(update.entry),
                value = IRNode.VariableUsage(newValue, tracked = true),
                reassignment = true
            ))
        }

        for (newNode in newNodes(after)) {
            ctx.appendNode(newNode)
        }
        ctx.mergeUpstreams(listOf(after))
    }

    private fun ensureStackDepths(
        head: IrBlockBuilder,
        tail: List<IrBlockBuilder>
    ) {
        val allBranches = listOf(head) + tail
        val maxDepth = allBranches.maxOf { it.stackDepth() }

        for (item in tail) {
            check(head.stackDepth() == item.stackDepth()) {
                "Stack size mismatch: head: ${head.stackDepth()}, tail: ${item.stackDepth()}"
            }
        }
    }
}
