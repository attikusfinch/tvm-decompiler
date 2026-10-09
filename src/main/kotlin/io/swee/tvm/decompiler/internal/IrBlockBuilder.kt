package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.TvmInst
import java.math.BigInteger
import java.util.*

class IrBlockBuilder(
    var upstream: UpstreamStack,
    private val stack: LinkedList<StackEntry> = LinkedList<StackEntry>(),
    val isExpression: Boolean = false
) {
    private val buffer = mutableListOf<IRNode>()
    var callSignatures: Map<BigInteger, FunctionSignature>? = null
    var callRefMapping: Map<List<TvmInst>, BigInteger>? = null
    val typeRefinements: MutableMap<StackEntry, TvmStackEntryType> = mutableMapOf()
    var isReturnContext: Boolean = true
    var hasAltReturn: Boolean = false
    var hasDiverged: Boolean = false
    var preserveCellValidation: Boolean = false
    var remainingInstructions: MutableList<TvmInst>? = null
    var options: DecompilerOptions = DecompilerOptions()
    var registry: ParserRegistry? = null

    var callArgObserver: ((BigInteger, Int, TvmStackEntryType) -> Unit)? = null

    fun appendNode(node: IRNode): IrBlockBuilder {
        buffer += node
        return this
    }

    fun stackEnsureAtLeast(depth: Int) {
        val diff = depth - stack.size
        repeat(diff) {
            stack.addLast(upstream.pop())
        }
    }

    fun stackEnsureAtLeast(vararg depth: Int) {
        stackEnsureAtLeast(depth.max())
    }

    fun stackEnsureMoreThan(vararg depth: Int) {
        stackEnsureAtLeast(depth.max() + 1)
    }

    private fun stackPop0(n: Int): StackEntry {
        return stack.removeAt(n)
    }

    fun stackDump(): String = stack.withIndex().joinToString("\n") { it.index.toString() + " " + it.value }

    fun stackPop(n: Int, typename: String): StackEntry {
        stackEnsureAtLeast(n + 1)

        val entry = stackPop0(n)
        check(entry.type.typename == typename || entry.type.typename == TvmStackEntryType.UNKNOWN.typename || typename == TvmStackEntryType.UNKNOWN.typename) {
            "Expected entry to be $typename, was ${entry.type.typename}. Stack:\n${stackDump()}"
        }
        if (entry.type == TvmStackEntryType.UNKNOWN && typename != TvmStackEntryType.UNKNOWN.typename) {
            typeRefinements.putIfAbsent(entry, TvmStackEntryType.fromTypename(typename))
        }
        return entry
    }

    fun stackPop(typename: String): StackEntry {
        return stackPop(0, typename)
    }

    fun stackPop(n: Int): StackEntry {
        return stackPop(n, TvmStackEntryType.UNKNOWN.typename)
    }

    fun stackPop(): StackEntry {
        return stackPop(0, TvmStackEntryType.UNKNOWN.typename)
    }

    fun stackPush(entry: StackEntry): IrBlockBuilder {
        stack.addFirst(entry)
        return this
    }

    fun stackFetch(n: Int): StackEntry {
        stackEnsureAtLeast(n + 1)
        return stack[n]
    }

    fun stackSet(n: Int, entry: StackEntry) {
        stackEnsureAtLeast(n + 1)
        stack[n] = entry
    }

    fun stackDepth(): Int {
        return stack.size
    }

    fun stackReplace(newStack: List<StackEntry>) {
        stack.clear()
        stack.addAll(newStack)
    }

    fun stackCopy(): List<StackEntry> {
        return stack.toList()
    }

    fun pushVirtual(entry: StackEntry): IrBlockBuilder {
        return stackPush(entry) // todo track (?)
    }

    fun build(): IRNode.CodeBlock {
        return IRNode.CodeBlock(buffer, isExpression)
    }

    fun fork(isExpression: Boolean = false): IrBlockBuilder {
        val childStack = LinkedList(this.stack)
        val childParent = this.upstream.fork()
        val childBuilder = IrBlockBuilder(childParent, childStack, isExpression)
        childBuilder.callSignatures = this.callSignatures
        childBuilder.callRefMapping = this.callRefMapping
        childBuilder.isReturnContext = this.isReturnContext
        childBuilder.hasAltReturn = this.hasAltReturn
        childBuilder.preserveCellValidation = this.preserveCellValidation
        childBuilder.options = this.options
        childBuilder.registry = this.registry
        childBuilder.typeRefinements.putAll(this.typeRefinements)
        childBuilder.callArgObserver = this.callArgObserver
        return childBuilder
    }

    fun mergeUpstreams(
        finalized: List<IrBlockBuilder>,
        fallthrough: IrBlockBuilder? = null,
        used: List<IrBlockBuilder> = listOf()
    ) {
        val parentMergeSources = buildList {
            addAll(finalized)
            fallthrough?.let(::add)
            addAll(used)
        }.distinct()
        for (item in parentMergeSources) {
            stack.addAll(upstream.merge(item.upstream))
            for ((entry, type) in item.typeRefinements) {
                val joined = TypeLattice.join(typeRefinements[entry], type)
                if (joined != null) typeRefinements[entry] = joined
            }
        }
    }
}
