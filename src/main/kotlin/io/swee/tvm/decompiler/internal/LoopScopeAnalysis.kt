package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.ir.IRNode

class LoopScopeMap(
    val declScope: Map<StackEntry, Int>,
    val useScopes: Map<StackEntry, Set<Int>>
) {
    fun declaredAndUsedInSameScope(entry: StackEntry): Boolean {
        val decl = declScope[entry] ?: return false
        val uses = useScopes[entry] ?: return true
        return uses.all { it == decl }
    }

    companion object {
        val EMPTY = LoopScopeMap(emptyMap(), emptyMap())
    }
}

fun analyzeLoopScopes(node: IRNode): LoopScopeMap {
    val declScope = mutableMapOf<StackEntry, Int>()
    val useScopes = mutableMapOf<StackEntry, MutableSet<Int>>()
    var nextScopeId = 1

    fun fresh(): Int = nextScopeId++

    fun walk(n: IRNode, scope: Int) {
        if (n is IRNode.VariableDeclaration && !n.reassignment) {
            for (e in n.entries) {
                declScope.putIfAbsent(e, scope)
            }
        }
        for (e in n.directUsedStackEntries()) {
            useScopes.getOrPut(e) { mutableSetOf() }.add(scope)
        }

        when (n) {
            is IRNode.TryCatch -> {
                walk(n.tryBlock, fresh())
                walk(n.catchBlock, fresh())
            }
            is IRNode.WhileLoop -> {
                val s = fresh()
                n.condCodeBlock?.let { walk(it, s) }
                n.bodyCodeBlock?.let { walk(it, s) }
            }
            is IRNode.UntilLoop -> {
                val s = fresh()
                walk(n.bodyCodeBlock, s)
                walk(n.condition, s)
            }
            is IRNode.RepeatLoop -> {
                walk(n.countExpression, scope)
                val s = fresh()
                walk(n.bodyCodeBlock, s)
            }
            else -> {
                for (child in n.directChildren()) {
                    walk(child, scope)
                }
            }
        }
    }

    walk(node, 0)
    return LoopScopeMap(declScope, useScopes)
}
