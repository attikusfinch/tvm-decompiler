package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.StackEntry

object BranchFoldingPass {

    fun run(block: IRNode.CodeBlock): IRNode.CodeBlock = transformBlock(block)

    private fun transformBlock(block: IRNode.CodeBlock): IRNode.CodeBlock {
        var anyChild = false
        val recursed = block.entries.map { node ->
            val r = recurse(node)
            if (r !== node) anyChild = true
            r
        }
        val entries = recursed.toMutableList()
        var folded = false
        for (i in entries.indices) {
            val node = entries[i]
            if (node is IRNode.IfElse && foldIfElse(entries, i, node)) folded = true
        }
        return if (!anyChild && !folded) block else IRNode.CodeBlock(entries, block.isExpression)
    }

    private fun recurse(node: IRNode): IRNode = when (node) {
        is IRNode.TryCatch -> IRNode.TryCatch(
            transformBlock(node.tryBlock), transformBlock(node.catchBlock), node.exceptionValue, node.exceptionCode
        )
        is IRNode.IfElse -> {
            val c = transformBlock(node.condCodeBlock)
            val i = node.ifCodeBlock?.let { transformBlock(it) }
            val e = node.elseCodeBlock?.let { transformBlock(it) }
            if (c === node.condCodeBlock && i === node.ifCodeBlock && e === node.elseCodeBlock) node
            else IRNode.IfElse(c, i, e, node.ifnot)
        }
        is IRNode.WhileLoop -> {
            val c = node.condCodeBlock?.let { transformBlock(it) }
            val b = node.bodyCodeBlock?.let { transformBlock(it) }
            if (c === node.condCodeBlock && b === node.bodyCodeBlock) node
            else IRNode.WhileLoop(c, b)
        }
        is IRNode.UntilLoop -> {
            val b = transformBlock(node.bodyCodeBlock)
            if (b === node.bodyCodeBlock) node else IRNode.UntilLoop(b, node.condition)
        }
        is IRNode.RepeatLoop -> {
            val b = transformBlock(node.bodyCodeBlock)
            if (b === node.bodyCodeBlock) node else IRNode.RepeatLoop(node.countExpression, b)
        }
        else -> node
    }

    private fun foldIfElse(entries: MutableList<IRNode>, idx: Int, ifElse: IRNode.IfElse): Boolean {
        val ifBlock = ifElse.ifCodeBlock ?: return false
        val elseBlock = ifElse.elseCodeBlock ?: return false

        val ifReassigns = topLevelReassignments(ifBlock)
        val elseReassigns = topLevelReassignments(elseBlock)
        val commonSlots = ifReassigns.keys.filter { it in elseReassigns }
        if (commonSlots.isEmpty()) return false

        val assigned = assignedEntries(ifElse.condCodeBlock) +
            assignedEntries(ifBlock) + assignedEntries(elseBlock)

        val removeFromIf = mutableSetOf<StackEntry>()
        val removeFromElse = mutableSetOf<StackEntry>()
        var changed = false

        for (slot in commonSlots) {
            val declI = defaultDeclIndex(entries, idx, slot) ?: continue
            val elseVal = elseReassigns.getValue(slot).value
            val ifVal = ifReassigns.getValue(slot).value
            val hoisted: IRNode = when {
                isStable(elseVal, assigned) -> { removeFromElse.add(slot); elseVal }
                isStable(ifVal, assigned) -> { removeFromIf.add(slot); ifVal }
                else -> continue
            }
            val decl = entries[declI] as IRNode.VariableDeclaration
            entries[declI] = IRNode.VariableDeclaration(decl.entries, copyValue(hoisted), decl.untuple, decl.reassignment)
            changed = true
        }
        if (!changed) return false

        entries[idx] = IRNode.IfElse(
            ifElse.condCodeBlock,
            ifBlock.withoutReassignments(removeFromIf),
            elseBlock.withoutReassignments(removeFromElse),
            ifElse.ifnot
        )
        return true
    }

    private fun topLevelReassignments(block: IRNode.CodeBlock): Map<StackEntry, IRNode.VariableDeclaration> {
        val m = LinkedHashMap<StackEntry, IRNode.VariableDeclaration>()
        for (e in block.entries) {
            if (e is IRNode.VariableDeclaration && e.reassignment && e.entries.size == 1) {
                m[e.entries.single()] = e
            }
        }
        return m
    }

    private fun IRNode.CodeBlock.withoutReassignments(slots: Set<StackEntry>): IRNode.CodeBlock {
        if (slots.isEmpty()) return this
        return IRNode.CodeBlock(
            entries.filterNot {
                it is IRNode.VariableDeclaration && it.reassignment &&
                    it.entries.size == 1 && it.entries.single() in slots
            },
            isExpression
        )
    }

    private fun defaultDeclIndex(entries: List<IRNode>, beforeIdx: Int, slot: StackEntry): Int? {
        for (j in beforeIdx - 1 downTo 0) {
            val n = entries[j]
            if (n is IRNode.VariableDeclaration && !n.reassignment &&
                n.entries.size == 1 && n.entries.single() == slot
            ) return j
        }
        return null
    }

    private fun isStable(value: IRNode, assigned: Set<StackEntry>): Boolean = when (value) {
        is IRNode.IntLiteral -> true
        is IRNode.VariableUsage -> value.entry !in assigned
        else -> false
    }

    private fun copyValue(value: IRNode): IRNode = when (value) {
        is IRNode.IntLiteral -> IRNode.IntLiteral(value.literal)
        is IRNode.VariableUsage -> IRNode.VariableUsage(value.entry, value.tracked)
        else -> value
    }

    private fun assignedEntries(block: IRNode.CodeBlock): Set<StackEntry> {
        val out = mutableSetOf<StackEntry>()
        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                out.addAll(node.entries)
            }
        })
        return out
    }
}
