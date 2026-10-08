package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.StackEntry
import java.util.IdentityHashMap

object DeadPhiEliminationPass {

    private fun isPure(value: IRNode): Boolean =
        value is IRNode.VariableUsage ||
            value is IRNode.IntLiteral ||
            (value is IRNode.FunctionCall && value.pure)

    fun run(block: IRNode.CodeBlock): IRNode.CodeBlock {
        val readCounts = mutableMapOf<StackEntry, Int>()
        block.accept(object : IRNodeVisitor {
            override fun visitAny(node: IRNode) {
                for (entry in node.directUsedStackEntries()) {
                    readCounts[entry] = readCounts.getOrDefault(entry, 0) + 1
                }
            }
        })

        val declsByEntry = mutableMapOf<StackEntry, MutableList<IRNode.VariableDeclaration>>()
        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                if (node.entries.size != 1) return
                declsByEntry.getOrPut(node.entries.single()) { mutableListOf() }.add(node)
            }
        })

        val removal: MutableSet<IRNode> =
            java.util.Collections.newSetFromMap(IdentityHashMap())
        for ((entry, decls) in declsByEntry) {
            val hasDeclaration = decls.any { !it.reassignment }
            if (!hasDeclaration) continue
            if (readCounts.getOrDefault(entry, 0) != 0) continue
            if (!decls.all { !it.untuple && isPure(it.value) }) continue
            removal.addAll(decls)
        }

        if (removal.isEmpty()) return block

        val transformer = object : IRNodeTransformer {
            override fun transformCodeBlock(node: IRNode.CodeBlock): IRNode.CodeBlock {
                return IRNode.CodeBlock(
                    entries = node.entries.filter { it !in removal }.map { transform(it) },
                    isExpression = node.isExpression
                )
            }
        }
        return transformer.transform(block) as IRNode.CodeBlock
    }
}
