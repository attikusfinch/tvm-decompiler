package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.StackEntry
import io.swee.tvm.decompiler.internal.TvmStackEntryType
import io.swee.tvm.decompiler.internal.TypeLattice
import java.util.IdentityHashMap

object TypeSolver {

    fun solve(
        block: IRNode.CodeBlock,
        seeds: Map<StackEntry, TvmStackEntryType>
    ): Map<StackEntry, TvmStackEntryType> {
        val parent = IdentityHashMap<StackEntry, StackEntry>()

        fun find(e: StackEntry): StackEntry {
            var root = e
            while (parent[root] != null && parent[root] !== root) root = parent[root]!!
            return root
        }
        fun register(e: StackEntry) { if (parent[e] == null) parent[e] = e }
        fun union(a: StackEntry, b: StackEntry) {
            register(a); register(b)
            val ra = find(a); val rb = find(b)
            if (ra !== rb) parent[rb] = ra
        }

        fun isNull(value: IRNode): Boolean =
            (value is IRNode.FunctionCall && value.name == "null") ||
            (value is IRNode.IntLiteral && value.literal == "null()")

        fun literalType(value: IRNode): TvmStackEntryType? = when {
            isNull(value) -> null
            value is IRNode.IntLiteral -> TvmStackEntryType.INT
            value is IRNode.SliceLiteral -> TvmStackEntryType.SLICE
            else -> null
        }

        val contributions = IdentityHashMap<StackEntry, TvmStackEntryType?>()
        fun contribute(e: StackEntry, t: TvmStackEntryType?) {
            register(e)
            val info = t?.takeUnless { it == TvmStackEntryType.UNKNOWN }
            contributions[e] = TypeLattice.join(contributions[e], info)
        }

        block.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                for (e in node.entries) {
                    contribute(e, e.type)
                    seeds[e]?.let { contribute(e, it) }
                }
                if (node.entries.size == 1 && !node.untuple) {
                    val lhs = node.entries.single()
                    val rhs = node.value
                    if (rhs is IRNode.VariableUsage) union(lhs, rhs.entry)
                    else contribute(lhs, literalType(rhs))
                }
            }
            override fun visit(node: IRNode.VariableUsage) {
                contribute(node.entry, node.entry.type)
                seeds[node.entry]?.let { contribute(node.entry, it) }
            }
        })

        val classType = IdentityHashMap<StackEntry, TvmStackEntryType?>()
        for ((e, t) in contributions) {
            val r = find(e)
            classType[r] = TypeLattice.join(classType[r], t)
        }

        val result = IdentityHashMap<StackEntry, TvmStackEntryType>()
        for (e in parent.keys) {
            val t = classType[find(e)] ?: continue
            result[e] = t
        }
        return result
    }
}
