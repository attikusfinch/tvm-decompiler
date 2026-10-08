package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNodeVisitor
import org.ton.bytecode.*
import java.math.BigInteger

data class FunctionSignature(
    val nArgs: Int,
    val argTypes: List<TvmStackEntryType>,
    val nReturns: Int,
    val returnTypes: List<TvmStackEntryType>
)

data class CallrefExtractionResult(
    val augmentedMethods: Map<BigInteger, List<TvmInst>>,
    val callrefMapping: Map<List<TvmInst>, BigInteger>,
    val referencedIds: Set<BigInteger>
)

// Only a literal, uncaptured continuation with literal finite argument width.
// Runtime/captured targets and passing the whole caller stack remain unproven.
fun staticVariableCallBody(instructions: List<TvmInst>, index: Int): List<TvmInst>? {
    val body = when (val instruction = instructions.getOrNull(index)) {
        is TvmConstDataPushcontShortInst -> instruction.c.list
        is TvmConstDataPushcontInst -> instruction.c.list
        is TvmConstDataPushrefcontInst -> instruction.c.list
        else -> return null
    }
    fun integerAt(i: Int): Int? = when (val instruction = instructions.getOrNull(i)) {
        is TvmConstIntPushint4Inst -> ((instruction.i + 5) and 15) - 5
        is TvmConstIntPushint8Inst -> instruction.x
        is TvmConstIntPushint16Inst -> instruction.x
        else -> null
    }
    if (integerAt(index + 1) !in 0..254 || integerAt(index + 2) !in -1..254 ||
        instructions.getOrNull(index + 3) !is TvmContBasicCallxvarargsInst) return null
    return body
}

fun extractCallrefBodies(methods: Map<BigInteger, List<TvmInst>>): CallrefExtractionResult {
    val callrefMapping = HashMap<List<TvmInst>, BigInteger>()

    val fingerprintToId = HashMap<String, BigInteger>()
    val referencedIds = mutableSetOf<BigInteger>()
    var nextId = -1000L

    fun fingerprint(instList: List<TvmInst>): String = buildString {
        for (inst in instList) {
            append(inst.mnemonic)
            val s = inst.toString()
            val noLoc = s.replace(Regex("""location=[^,)]+"""), "")
            append(noLoc)
            if (inst is TvmContOperand1Inst) {
                append("{")
                append(fingerprint(inst.c.list))
                append("}")
            }
            if (inst is TvmContOperand2Inst) {
                append("{")
                append(fingerprint(inst.c1.list))
                append("|")
                append(fingerprint(inst.c2.list))
                append("}")
            }
            append(";")
        }
    }

    fun scan(instList: List<TvmInst>) {
        for ((index, inst) in instList.withIndex()) {
            val calledBody = if (inst is TvmContBasicCallrefInst) inst.c.list
                else staticVariableCallBody(instList, index)
            if (calledBody != null) {
                val fp = fingerprint(calledBody)
                val existingId = fingerprintToId[fp]
                if (existingId != null) {
                    callrefMapping[calledBody] = existingId
                } else {
                    val newId = BigInteger.valueOf(nextId--)
                    fingerprintToId[fp] = newId
                    callrefMapping[calledBody] = newId
                }
                if (inst is TvmContBasicCallrefInst) referencedIds += callrefMapping.getValue(calledBody)
            }
            if (inst is TvmContOperand1Inst) {
                scan(inst.c.list)
            }
            if (inst is TvmContOperand2Inst) {
                scan(inst.c1.list)
                scan(inst.c2.list)
            }
        }
    }

    for ((_, instList) in methods) {
        scan(instList)
    }

    val augmentedMethods = methods.toMutableMap()
    for ((instList, id) in callrefMapping) {
        if (id !in augmentedMethods) {
            augmentedMethods[id] = instList
        }
    }

    return CallrefExtractionResult(augmentedMethods, callrefMapping, referencedIds)
}

fun inferSignatures(
    methods: Map<BigInteger, List<TvmInst>>,
    registry: ParserRegistry,
    knownSignatures: Map<BigInteger, FunctionSignature>,
    callrefMapping: Map<List<TvmInst>, BigInteger> = emptyMap()
): Map<BigInteger, FunctionSignature> {
    val incomingArgs = mutableMapOf<BigInteger, MutableMap<Int, TvmStackEntryType>>()
    val incomingReturns = mutableMapOf<BigInteger, MutableMap<Int, TvmStackEntryType>>()
    var result = knownSignatures.toMutableMap()
    val maxOuter = 10
    repeat(maxOuter) {
        val readArgs: Map<BigInteger, Map<Int, TvmStackEntryType>> = incomingArgs.mapValues { it.value.toMap() }
        val readReturns: Map<BigInteger, Map<Int, TvmStackEntryType>> = incomingReturns.mapValues { it.value.toMap() }
        val argObserver: (BigInteger, Int, TvmStackEntryType) -> Unit = { id, idx, t ->
            val m = incomingArgs.getOrPut(id) { mutableMapOf() }
            m[idx] = TypeLattice.join(m[idx], t) ?: t
        }
        val returnObserver: (BigInteger, Int, TvmStackEntryType) -> Unit = { id, idx, t ->
            val m = incomingReturns.getOrPut(id) { mutableMapOf() }
            m[idx] = TypeLattice.join(m[idx], t) ?: t
        }
        result = inferSignaturesOnce(
            methods, registry, knownSignatures, callrefMapping,
            readArgs, readReturns, argObserver, returnObserver
        )
        val afterArgs = incomingArgs.mapValues { it.value.toMap() }
        val afterReturns = incomingReturns.mapValues { it.value.toMap() }
        if (afterArgs == readArgs && afterReturns == readReturns) return result
    }
    return result
}

private fun callNameToId(name: String): BigInteger? = when {
    name == "recv_external" -> BigInteger.valueOf(-1)
    name == "recv_internal" -> BigInteger.ZERO
    name.startsWith("callref_") ->
        name.removePrefix("callref_").toLongOrNull()?.let { BigInteger.valueOf(-(it + 1000)) }
    name.startsWith("fn_") -> name.removePrefix("fn_").toBigIntegerOrNull()
    else -> null
}

private fun inferSignaturesOnce(
    methods: Map<BigInteger, List<TvmInst>>,
    registry: ParserRegistry,
    knownSignatures: Map<BigInteger, FunctionSignature>,
    callrefMapping: Map<List<TvmInst>, BigInteger>,
    readArgs: Map<BigInteger, Map<Int, TvmStackEntryType>>,
    readReturns: Map<BigInteger, Map<Int, TvmStackEntryType>>,
    argObserver: (BigInteger, Int, TvmStackEntryType) -> Unit,
    returnObserver: (BigInteger, Int, TvmStackEntryType) -> Unit
): MutableMap<BigInteger, FunctionSignature> {
    val result = knownSignatures.toMutableMap()

    val callGraph = buildCallGraph(methods, callrefMapping)

    val sccs = tarjanSCC(methods.keys, callGraph)

    for (scc in sccs) {
        if (scc.size == 1) {
            val id = scc.single()
            if (id in result) continue
            val instList = methods[id] ?: continue
            val selfRecursive = callGraph[id]?.contains(id) == true
            if (!selfRecursive) {
                val sig = simulateFunction(
                    instList, registry, result, callrefMapping,
                    readArgs[id] ?: emptyMap(), readReturns[id] ?: emptyMap(),
                    argObserver, returnObserver
                )
                if (sig != null) result[id] = sig
            } else {
                fixedPointInfer(scc, methods, registry, result, callrefMapping, readArgs, readReturns, argObserver, returnObserver)
            }
        } else {
            fixedPointInfer(scc, methods, registry, result, callrefMapping, readArgs, readReturns, argObserver, returnObserver)
        }
    }

    return result
}

private fun fixedPointInfer(
    scc: List<BigInteger>,
    methods: Map<BigInteger, List<TvmInst>>,
    registry: ParserRegistry,
    result: MutableMap<BigInteger, FunctionSignature>,
    callrefMapping: Map<List<TvmInst>, BigInteger>,
    readArgs: Map<BigInteger, Map<Int, TvmStackEntryType>>,
    readReturns: Map<BigInteger, Map<Int, TvmStackEntryType>>,
    argObserver: (BigInteger, Int, TvmStackEntryType) -> Unit,
    returnObserver: (BigInteger, Int, TvmStackEntryType) -> Unit
) {
    for (id in scc) {
        if (id !in result) {
            result[id] = FunctionSignature(0, emptyList(), 0, emptyList())
        }
    }

    var changed = true
    var iterations = 0
    val maxIterations = 20
    while (changed && iterations < maxIterations) {
        changed = false
        iterations++
        for (id in scc) {
            val instList = methods[id] ?: continue
            val sig = simulateFunction(
                instList, registry, result, callrefMapping,
                readArgs[id] ?: emptyMap(), readReturns[id] ?: emptyMap(),
                argObserver, returnObserver
            ) ?: continue
            val old = result[id]
            if (old != sig) {
                result[id] = sig
                changed = true
            }
        }
    }
}

private fun simulateFunction(
    instList: List<TvmInst>,
    registry: ParserRegistry,
    signatures: Map<BigInteger, FunctionSignature>,
    callrefMapping: Map<List<TvmInst>, BigInteger>,
    incomingArgsForFn: Map<Int, TvmStackEntryType>,
    incomingReturnsForFn: Map<Int, TvmStackEntryType>,
    argObserver: (BigInteger, Int, TvmStackEntryType) -> Unit,
    returnObserver: (BigInteger, Int, TvmStackEntryType) -> Unit
): FunctionSignature? {
    return try {
        // A branch can return before another branch discovers deeper arguments.
        // Replay with the complete entry stack so those untouched slots are part
        // of every return, rather than reporting an accidental one-slot ABI.
        var minimumArgs = 0
        var builder: IrBlockBuilder
        var codeBlock: IRNode.CodeBlock
        var attempts = 0
        while (true) {
            check(attempts++ < 32) { "Function argument discovery did not converge" }
            builder = IrBlockBuilder(DiscoveryUpstreamStack())
            builder.callSignatures = signatures
            builder.callRefMapping = callrefMapping
            builder.callArgObserver = argObserver
            builder.stackEnsureAtLeast(minimumArgs)
            codeBlock = TvmDecompilerImpl.parseCodeBlock(registry, builder, instList, false)
            val discovered = builder.upstream.getUsedEntries().size
            if (discovered <= minimumArgs) break
            minimumArgs = discovered
        }
        val upstream = builder.upstream
        val usedEntries = upstream.getUsedEntries()

        val resolved = io.swee.tvm.decompiler.internal.ir.TypeSolver.solve(codeBlock, builder.typeRefinements)
        val paramIncoming = java.util.IdentityHashMap<StackEntry, TvmStackEntryType>()
        usedEntries.forEachIndexed { i, e -> incomingArgsForFn[i]?.let { paramIncoming[e] = it } }
        fun typeOf(e: StackEntry): TvmStackEntryType =
            resolved[e] ?: builder.typeRefinements[e] ?: paramIncoming[e] ?: e.type

        codeBlock.accept(object : IRNodeVisitor {
            override fun visit(node: IRNode.VariableDeclaration) {
                val call = node.value as? IRNode.FunctionCall ?: return
                val calleeId = callNameToId(call.name) ?: return
                val n = node.entries.size
                node.entries.forEachIndexed { k, e ->
                    val t = typeOf(e)
                    if (t != TvmStackEntryType.UNKNOWN) returnObserver(calleeId, n - 1 - k, t)
                }
            }
        })

        val earlyReturns = collectEarlyReturns(codeBlock)

        val nReturns: Int
        val rawReturnTypes: List<TvmStackEntryType>
        if (earlyReturns.isNotEmpty()) {
            nReturns = earlyReturns.first().variables.size
            rawReturnTypes = earlyReturns.first().variables.map { typeOf(it.entry) }
        } else {
            nReturns = builder.stackDepth()
            rawReturnTypes = builder.stackCopy().map { typeOf(it) }
        }
        val returnTypes = rawReturnTypes.mapIndexed { i, t ->
            if (t == TvmStackEntryType.UNKNOWN) incomingReturnsForFn[i] ?: t else t
        }

        FunctionSignature(
            nArgs = usedEntries.size,
            argTypes = usedEntries.map { typeOf(it) },
            nReturns = nReturns,
            returnTypes = returnTypes
        )
    } catch (_: Throwable) {
        null
    }
}

private fun collectEarlyReturns(node: IRNode): List<IRNode.FunctionReturnStatement> {
    val result = mutableListOf<IRNode.FunctionReturnStatement>()
    node.accept(object : IRNodeVisitor {
        override fun visit(node: IRNode.FunctionReturnStatement) {
            result.add(node)
        }
    })
    return result
}

private fun buildCallGraph(
    methods: Map<BigInteger, List<TvmInst>>,
    callrefMapping: Map<List<TvmInst>, BigInteger>
): Map<BigInteger, Set<BigInteger>> {
    val graph = mutableMapOf<BigInteger, MutableSet<BigInteger>>()
    for ((id, instList) in methods) {
        val callees = graph.getOrPut(id) { mutableSetOf() }
        collectCallees(instList, callees, callrefMapping)
    }
    return graph
}

private fun collectCallees(
    instList: List<TvmInst>,
    callees: MutableSet<BigInteger>,
    callrefMapping: Map<List<TvmInst>, BigInteger>
) {
    for ((index, inst) in instList.withIndex()) {
        staticVariableCallBody(instList, index)?.let { body ->
            callrefMapping[body]?.let(callees::add)
        }
        when (inst) {
            is TvmContDictCalldictInst -> callees.add(BigInteger.valueOf(inst.n.toLong()))
            is TvmContDictCalldictLongInst -> callees.add(BigInteger.valueOf(inst.n.toLong()))
            is TvmContBasicCallrefInst -> {
                val syntheticId = callrefMapping[inst.c.list]
                if (syntheticId != null) callees.add(syntheticId)
            }
            else -> {}
        }
        if (inst is TvmContOperand1Inst) {
            collectCallees(inst.c.list, callees, callrefMapping)
        }
        if (inst is TvmContOperand2Inst) {
            collectCallees(inst.c1.list, callees, callrefMapping)
            collectCallees(inst.c2.list, callees, callrefMapping)
        }
    }
}

private fun tarjanSCC(
    nodes: Set<BigInteger>,
    graph: Map<BigInteger, Set<BigInteger>>
): List<List<BigInteger>> {
    var index = 0
    val nodeIndex = mutableMapOf<BigInteger, Int>()
    val nodeLowlink = mutableMapOf<BigInteger, Int>()
    val onStack = mutableSetOf<BigInteger>()
    val stack = ArrayDeque<BigInteger>()
    val result = mutableListOf<List<BigInteger>>()

    fun strongConnect(v: BigInteger) {
        nodeIndex[v] = index
        nodeLowlink[v] = index
        index++
        stack.addLast(v)
        onStack.add(v)

        for (w in graph[v] ?: emptySet()) {
            if (w !in nodes) continue
            if (w !in nodeIndex) {
                strongConnect(w)
                nodeLowlink[v] = minOf(nodeLowlink[v]!!, nodeLowlink[w]!!)
            } else if (w in onStack) {
                nodeLowlink[v] = minOf(nodeLowlink[v]!!, nodeIndex[w]!!)
            }
        }

        if (nodeLowlink[v] == nodeIndex[v]) {
            val scc = mutableListOf<BigInteger>()
            do {
                val w = stack.removeLast()
                onStack.remove(w)
                scc.add(w)
            } while (w != v)
            result.add(scc)
        }
    }

    for (v in nodes) {
        if (v !in nodeIndex) {
            strongConnect(v)
        }
    }

    return result
}
