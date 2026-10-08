package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.StackEntry
import io.swee.tvm.decompiler.internal.analyzeLoopScopes
import java.util.IdentityHashMap

object CopyCoalescingPass {

    fun run(block: IRNode.CodeBlock): IRNode.CodeBlock {
        val loopScopes = analyzeLoopScopes(block)
        val readCounts = mutableMapOf<StackEntry, Int>()
        block.accept(object : IRNodeVisitor {
            override fun visitAny(node: IRNode) {
                for (entry in node.directUsedStackEntries()) {
                    readCounts[entry] = readCounts.getOrDefault(entry, 0) + 1
                }
            }
        })

        val declCount = mutableMapOf<StackEntry, Int>()
        val reassignCount = mutableMapOf<StackEntry, Int>()
        val declOrder = mutableMapOf<StackEntry, Int>()
        var order = 0
        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                val idx = order++
                if (node.entries.size != 1) return
                val entry = node.entries.single()
                if (node.reassignment) {
                    reassignCount[entry] = reassignCount.getOrDefault(entry, 0) + 1
                } else {
                    declCount[entry] = declCount.getOrDefault(entry, 0) + 1
                    declOrder.putIfAbsent(entry, idx)
                }
            }
        })

        val parent = mutableMapOf<StackEntry, StackEntry>()
        val copyNodes: MutableSet<IRNode> =
            java.util.Collections.newSetFromMap(IdentityHashMap())
        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                if (!node.reassignment) return
                if (node.untuple) return
                if (node.entries.size != 1) return
                val value = node.value
                if (value !is IRNode.VariableUsage || !value.tracked) return
                val a = node.entries.single()
                val b = value.entry
                if (a == b) return
                if (declCount.getOrDefault(b, 0) != 1) return
                if (reassignCount.getOrDefault(b, 0) < 1) return
                if (readCounts.getOrDefault(b, 0) != 1) return
                val ao = declOrder[a] ?: return
                val bo = declOrder[b] ?: return
                if (ao >= bo) return
                if (loopScopes.declScope[a] != loopScopes.declScope[b]) return
                parent[b] = a
                copyNodes.add(node)
            }
        })

        if (copyNodes.isEmpty()) return block

        fun root(entry: StackEntry): StackEntry {
            var cur = entry
            while (true) {
                cur = parent[cur] ?: return cur
            }
        }

        val transformer = object : IRNodeTransformer {
            override fun transformCodeBlock(node: IRNode.CodeBlock): IRNode.CodeBlock {
                return IRNode.CodeBlock(
                    entries = node.entries.filter { it !in copyNodes }.map { transform(it) },
                    isExpression = node.isExpression
                )
            }

            override fun transformVariableUsage(node: IRNode.VariableUsage): IRNode {
                val r = root(node.entry)
                return if (r == node.entry) node else IRNode.VariableUsage(r, node.tracked)
            }

            override fun transformVariableDeclaration(node: IRNode.VariableDeclaration): IRNode {
                val renamed = node.entries.map { root(it) }
                val eliminated = node.entries.size == 1 &&
                    root(node.entries.single()) != node.entries.single()
                return IRNode.VariableDeclaration(
                    renamed,
                    transform(node.value),
                    node.untuple,
                    node.reassignment || eliminated
                )
            }

            override fun transformFunctionReturnStatement(node: IRNode.FunctionReturnStatement): IRNode {
                return IRNode.FunctionReturnStatement(
                    node.variables.map { transformVariableUsage(it) as IRNode.VariableUsage }
                )
            }
        }
        return transformer.transform(block) as IRNode.CodeBlock
    }
}
