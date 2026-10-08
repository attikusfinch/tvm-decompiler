package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.Literals
import io.swee.tvm.decompiler.internal.StackEntry

object RedundantStoreEliminationPass {

    fun run(block: IRNode.CodeBlock): IRNode.CodeBlock {
        val removed = mutableListOf<IRNode>()
        val rewritten = transformBlock(block, HashMap(), removed)
        return if (removed.isEmpty()) block else rewritten
    }

    private data class PureCallConst(val name: String)

    private data class SliceConst(val hex: String)

    private fun resolveConst(value: IRNode, known: Map<StackEntry, Any>): Any? = when (value) {
        is IRNode.IntLiteral -> value.literal
        is IRNode.VariableUsage -> known[value.entry]
        is IRNode.FunctionCall ->
            if (value.pure && value.args.isEmpty()) PureCallConst(value.name) else null
        is IRNode.SliceLiteral -> SliceConst(Literals.cellLiteral(value.slice))
        else -> null
    }

    private fun collectAssigned(block: IRNode.CodeBlock?): Set<StackEntry> {
        if (block == null) return emptySet()
        val out = mutableSetOf<StackEntry>()
        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                out.addAll(node.entries)
            }
        })
        return out
    }

    private fun transformBlock(
        block: IRNode.CodeBlock,
        known: MutableMap<StackEntry, Any>,
        removed: MutableList<IRNode>
    ): IRNode.CodeBlock {
        val out = ArrayList<IRNode>(block.entries.size)
        for (node in block.entries) {
            when (node) {
                is IRNode.VariableDeclaration -> {
                    if (node.entries.size == 1) {
                        val slot = node.entries.single()
                        val c = resolveConst(node.value, known)
                        if (node.reassignment && c != null && known[slot] == c) {
                            removed.add(node)
                        } else {
                            if (c != null) known[slot] = c else known.remove(slot)
                            out.add(node)
                        }
                    } else {
                        for (e in node.entries) known.remove(e)
                        out.add(node)
                    }
                }

                is IRNode.TryCatch -> {
                    val tried = transformBlock(node.tryBlock, HashMap(known), removed)
                    val caught = transformBlock(node.catchBlock, HashMap(known), removed)
                    for (e in collectAssigned(node.tryBlock) + collectAssigned(node.catchBlock)) known.remove(e)
                    out.add(IRNode.TryCatch(tried, caught, node.exceptionValue, node.exceptionCode))
                }

                is IRNode.IfElse -> {
                    val newCond = transformBlock(node.condCodeBlock, known, removed)
                    val newIf = node.ifCodeBlock?.let { transformBlock(it, HashMap(known), removed) }
                    val newElse = node.elseCodeBlock?.let { transformBlock(it, HashMap(known), removed) }
                    for (e in collectAssigned(node.ifCodeBlock)) known.remove(e)
                    for (e in collectAssigned(node.elseCodeBlock)) known.remove(e)
                    out.add(IRNode.IfElse(newCond, newIf, newElse, node.ifnot))
                }

                is IRNode.WhileLoop -> {
                    for (e in collectAssigned(node.condCodeBlock)) known.remove(e)
                    for (e in collectAssigned(node.bodyCodeBlock)) known.remove(e)
                    val newCond = node.condCodeBlock?.let { transformBlock(it, HashMap(known), removed) }
                    val newBody = node.bodyCodeBlock?.let { transformBlock(it, HashMap(known), removed) }
                    out.add(IRNode.WhileLoop(newCond, newBody))
                }

                is IRNode.UntilLoop -> {
                    for (e in collectAssigned(node.bodyCodeBlock)) known.remove(e)
                    val newBody = transformBlock(node.bodyCodeBlock, HashMap(known), removed)
                    out.add(IRNode.UntilLoop(newBody, node.condition))
                }

                is IRNode.RepeatLoop -> {
                    for (e in collectAssigned(node.bodyCodeBlock)) known.remove(e)
                    val newBody = transformBlock(node.bodyCodeBlock, HashMap(known), removed)
                    out.add(IRNode.RepeatLoop(node.countExpression, newBody))
                }

                else -> out.add(node)
            }
        }
        return IRNode.CodeBlock(out, block.isExpression)
    }
}
