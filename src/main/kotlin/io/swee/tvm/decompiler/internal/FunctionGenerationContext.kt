package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNode.VariableDeclaration
import io.swee.tvm.decompiler.internal.ir.IRNodeTransformer
import io.swee.tvm.decompiler.internal.ir.IRNodeVisitor
import io.swee.tvm.decompiler.internal.ir.StackEntryVisitor

data class RootGenerationContext(
    val functions: Map<IRNode.Function, FunctionGenerationContext>,
    val node: IRNode.Root,
    val globalVariableTypes: Map<Int, TvmStackEntryType> = emptyMap()
)

data class FunctionGenerationContext(
    val stackEntryNameResolver: (entry: StackEntryName) -> String,
    val stackEntryUsage: Map<StackEntry, Int>,
    val stackEntrySources: Map<StackEntry, List<IRNode>>,
    val stackEntryProducts: Map<IRNode, VariableDeclaration>,
    val expressionDeclarations: Set<VariableDeclaration>,
    val loopScopes: LoopScopeMap,
)

fun analyzeFunction(
    function: IRNode.Function
): FunctionGenerationContext {
    val stackEntryUsage: MutableMap<StackEntry, Int> = mutableMapOf()
    val stackEntrySources: MutableMap<StackEntry, MutableList<IRNode>> = mutableMapOf()
    val stackEntryProducts: MutableMap<IRNode, VariableDeclaration> = mutableMapOf()
    val stackEntryNameCache: MutableMap<StackEntryName, String> = mutableMapOf()
    val usedVariableNames: MutableMap<String, Int> = mutableMapOf()

    function.accept(object : IRNodeVisitor {
        override fun visit(node: VariableDeclaration) {
            node.entries.forEach { entry ->
                if (!stackEntrySources.containsKey(entry)) {
                    stackEntrySources[entry] = mutableListOf()
                }
                stackEntrySources[entry]!!.add(node.value)
            }
            if (stackEntryProducts.containsKey(node.value)) {
                error("Duplicate product for IR node: ${node.value} already maps to ${stackEntryProducts[node.value]}")
            }
            stackEntryProducts[node.value] = node
        }
    })
    function.accept(object : StackEntryVisitor {
        override fun visitEntry(node: IRNode, entry: StackEntry) {
            stackEntryUsage[entry] = stackEntryUsage.getOrDefault(entry, 0) + 1
        }
    })

    fun stackEntryNameResolver(entry: StackEntryName): String {
        if (entry in stackEntryNameCache) {
            return stackEntryNameCache[entry]!!
        }

        val notCountedName = when (entry) {
            is StackEntryName.Const -> entry.value
            is StackEntryName.Parent -> stackEntryNameResolver(entry.parent) + "_" + entry.suffix
        }
        val usedTimes = usedVariableNames.getOrDefault(notCountedName, 0)
        val finalName = "${notCountedName}_${usedTimes.toBigInteger().toString(16).padStart(2, '0')}"

        usedVariableNames[notCountedName] = usedTimes + 1
        stackEntryNameCache[entry] = finalName
        return finalName
    }

    return FunctionGenerationContext(
        ::stackEntryNameResolver,
        stackEntryUsage,
        stackEntrySources,
        stackEntryProducts,
        setOf(),
        analyzeLoopScopes(function.codeBlock),
    )
}

class SliceConstantPool {
    private val names = LinkedHashMap<String, String>()

    fun intern(literal: String): String =
        names.getOrPut(literal) { "__const_${names.size.toString(16).padStart(2, '0')}" }

    fun declarations(): List<Pair<String, String>> =
        names.entries.map { it.value to it.key }
}

fun analyze(root: IRNode.Root, options: DecompilerOptions = DecompilerOptions()): RootGenerationContext {
    // The upstream TvmCell equality omits exotic descriptors. Use the full
    // physical literal so equal bits with different reference kinds stay apart.
    val sliceDeclarations = mutableMapOf<String, Int>()
    val constPool = SliceConstantPool()

    val transformer = object : IRNodeTransformer {
        override fun transformSliceLiteral(node: IRNode.SliceLiteral): IRNode {
            if (!options.exact) {
                val literal = SliceLiteralChooser.sliceToFuncLiteral(node.slice)
                if (literal != null) {
                    return IRNode.SliceConstRef(constPool.intern(literal))
                }
            }
            val sliceIndex = sliceDeclarations.merge(
                Literals.cellLiteral(node.slice),
                sliceDeclarations.size,
                { a, b -> a }
            )
            return IRNode.FunctionCall(
                "__slice_$sliceIndex",
                listOf()
            )
        }
    }
    val transformedRoot = transformer.transformRoot(root)

    val newAsmFunctions = sliceDeclarations.entries.map { entry ->
        IRNode.AsmFunction(
            "__slice_${entry.value}",
            listOf(),
            listOf(StackEntry.Simple(TvmStackEntryType.SLICE, StackEntryName.Const("slice"))),
            "\"${entry.key} PUSHSLICE\""
        )
    }

    val argNames = listOf("a", "b", "c", "d", "e", "f", "g", "h")
    val asmBody = LinkedHashMap<String, String>()
    val asmArgTypes = mutableMapOf<String, MutableMap<Int, TvmStackEntryType?>>()
    val asmArgCount = mutableMapOf<String, Int>()
    val asmRetTypes = mutableMapOf<String, MutableMap<Int, TvmStackEntryType?>>()
    val asmRetCount = mutableMapOf<String, Int>()
    val asmPurity = mutableMapOf<String, Boolean>()

    fun normalize(t: TvmStackEntryType?): TvmStackEntryType? =
        t?.takeUnless { it == TvmStackEntryType.UNKNOWN }

    fun recordAsmCall(name: String, body: String, argNodes: List<IRNode>, retEntries: List<StackEntry>, pure: Boolean) {
        asmBody.putIfAbsent(name, body)
        asmPurity[name] = asmPurity.getOrDefault(name, true) && pure
        asmArgCount[name] = maxOf(asmArgCount.getOrDefault(name, 0), argNodes.size)
        val am = asmArgTypes.getOrPut(name) { mutableMapOf() }
        argNodes.forEachIndexed { i, arg ->
            val t = (arg as? IRNode.VariableUsage)?.entry?.type
            am[i] = TypeLattice.join(am[i], normalize(t))
        }
        if (retEntries.isNotEmpty()) {
            asmRetCount[name] = maxOf(asmRetCount.getOrDefault(name, 0), retEntries.size)
            val rm = asmRetTypes.getOrPut(name) { mutableMapOf() }
            retEntries.forEachIndexed { i, e -> rm[i] = TypeLattice.join(rm[i], normalize(e.type)) }
        }
    }

    transformedRoot.accept(object : IRNodeVisitor {
        override fun visit(node: VariableDeclaration) {
            val call = node.value as? IRNode.FunctionCall ?: return
            if (!call.name.startsWith("asm_")) return
            val body = call.asmBody ?: "\"${call.name.removePrefix("asm_")}\""
            recordAsmCall(call.name, body, call.args, node.entries, call.pure)
        }
        override fun visit(node: IRNode.FunctionCall) {
            if (!node.name.startsWith("asm_")) return
            val body = node.asmBody ?: "\"${node.name.removePrefix("asm_")}\""
            recordAsmCall(node.name, body, node.args, listOf(), node.pure)
        }
    })

    val asmFunctionUsages: Map<String, IRNode.AsmFunction> = asmBody.keys.associateWith { name ->
        val args = (0 until asmArgCount.getOrDefault(name, 0)).map { i ->
            val t = asmArgTypes[name]?.get(i) ?: TvmStackEntryType.UNKNOWN
            StackEntry.Simple(t, StackEntryName.Const(argNames.getOrElse(i) { "x$i" }))
        }
        val rets = (0 until asmRetCount.getOrDefault(name, 0)).map { i ->
            val t = asmRetTypes[name]?.get(i) ?: TvmStackEntryType.UNKNOWN
            StackEntry.Simple(t, StackEntryName.Const("r"))
        }
        IRNode.AsmFunction(name, args, rets, asmBody.getValue(name), asmPurity.getValue(name))
    }

    val newRoot = IRNode.Root(
        transformedRoot.asmFunctions + newAsmFunctions + asmFunctionUsages.values,
        transformedRoot.functions,
        transformedRoot.constants +
            constPool.declarations().map { (name, literal) -> IRNode.ConstSliceDecl(name, literal) }
    )

    val functionContexts = newRoot.functions.associateWith { analyzeFunction(it) }

    val globalTypes = mutableMapOf<Int, TvmStackEntryType>()
    val globalWrites = mutableMapOf<Int, MutableSet<TvmStackEntryType>>()
    newRoot.accept(object : IRNodeVisitor {
        override fun visit(node: IRNode.GlobalWrite) {
            val writeType = (node.value as? IRNode.VariableUsage)?.entry?.type ?: TvmStackEntryType.UNKNOWN
            globalWrites.getOrPut(node.number) { mutableSetOf() }.add(writeType)
            globalTypes.putIfAbsent(node.number, TvmStackEntryType.UNKNOWN)
        }
        override fun visit(node: IRNode.GlobalRead) {
            globalTypes.putIfAbsent(node.number, TvmStackEntryType.UNKNOWN)
        }
    })
    // A read carries no new type evidence. In particular, an early unknown read
    // must not lock a later consistently written tuple/cell field to `int`.
    // Unknown or conflicting writes remain unknown rather than choosing a writer.
    for ((number, writes) in globalWrites) {
        globalTypes[number] = writes.singleOrNull() ?: TvmStackEntryType.UNKNOWN
    }

    return RootGenerationContext(
        functionContexts,
        newRoot,
        globalTypes
    )
}
