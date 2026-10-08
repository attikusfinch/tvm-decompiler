package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*

private fun StackEntry.continuationInstructions(): List<TvmInst> =
    (concreteValue as? ConcreteValue.ContinuationVal)?.instructions
        ?: error("Dynamic continuation: no concrete instruction list")

fun parseContinuation(
    registry: ParserRegistry,
    parent: IrBlockBuilder,
    instList: List<TvmInst>,
    isExpression: Boolean = false,
    isReturn: Boolean = false
): Pair<IRNode.CodeBlock, IrBlockBuilder> {
    val childCtx = parent.fork(isExpression)
    childCtx.isReturnContext = isReturn
    val block = TvmDecompilerImpl.parseCodeBlock(
        registry,
        childCtx,
        instList,
        isReturn
    )
    return block to childCtx
}

fun parseCallContinuation(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,
    instList: List<TvmInst>
) {
    val parentStackBefore = ctx.stackCopy()
    val childCtx = ctx.fork()
    TvmDecompilerImpl.parseCodeBlock(registry, childCtx, instList, false)

    val childStack = childCtx.stackCopy()

    val parentDepth = parentStackBefore.size
    val childDepth = childStack.size

    var matchCount = 0
    val minDepth = minOf(parentDepth, childDepth)
    for (i in 0 until minDepth) {
        if (parentStackBefore[parentDepth - 1 - i] === childStack[childDepth - 1 - i]) {
            matchCount++
        } else {
            break
        }
    }

    val consumed = parentDepth - matchCount
    val produced = childDepth - matchCount

    if (consumed == 0 && produced == 0) {
        val block = childCtx.build()
        for (entry in block.entries) {
            ctx.appendNode(entry)
        }
        ctx.mergeUpstreams(listOf(childCtx))
        return
    }

    repeat(consumed) { ctx.stackPop() }

    val returnEntries = (0 until produced).map { childStack[it] }

    val block = childCtx.build()
    for (entry in block.entries) {
        ctx.appendNode(entry)
    }

    for (entry in returnEntries.reversed()) {
        ctx.stackPush(entry)
    }
    ctx.mergeUpstreams(listOf(childCtx))
}

fun parseWhileBlock(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,
    condEntry: StackEntry,
    bodyEntry: StackEntry,
) {
    val bodyContinuation = bodyEntry.continuationInstructions()
    val condContinuation = condEntry.continuationInstructions()

    // WHILE executes the condition first and consumes its flag before entering the body.
    // An empty condition continuation consumes a flag already present at the loop head.
    // Starting the body directly from ctx incorrectly retains that flag and shifts every
    // stack slot (notably dictionary iteration in NftCollection).
    fun iteration(): Pair<Pair<IRNode.CodeBlock, IrBlockBuilder>, IrBlockBuilder> {
        val condition = parseContinuation(registry, ctx, condContinuation, isExpression = true)
        condition.second.stackPop(TvmStackEntryType.INT.typename)
        val (_, body) = parseContinuation(registry, condition.second, bodyContinuation)
        return condition to body
    }

    var backwardUpdates: List<ControlFlowResolver.BackwardUpdate>? = null
    var attempts = 0
    while (backwardUpdates == null) {
        check(attempts++ < 32) { "WHILE stack discovery did not converge" }
        val (_, dryBody) = iteration()
        val extraNeeded = dryBody.upstream.getUsedEntries().size - ctx.upstream.getUsedEntries().size
        if (extraNeeded > 0) {
            ctx.stackEnsureAtLeast(ctx.stackDepth() + extraNeeded)
            continue
        }
        backwardUpdates = ControlFlowResolver.preResolveBackward(ctx, dryBody, false)
    }

    val (condition, bodyCtx) = iteration()
    val (condNode, condCtx) = condition
    val exitStack = condCtx.stackCopy()

    ControlFlowResolver.postResolveBackward(
        ctx,
        bodyCtx,
        { newBodyCtx ->
            listOf(IRNode.WhileLoop(
                condNode,
                newBodyCtx.build()
            ) )
        },
        backwardUpdates,
        false
    )
    // On the false edge, the outgoing stack is the condition's stack without its flag.
    // It can differ from the loop head when the condition updates a cursor/carried value.
    ctx.stackReplace(exitStack)
    ctx.mergeUpstreams(listOf(condCtx))
}

fun parseAgainBlock(registry: ParserRegistry, ctx: IrBlockBuilder, instructions: List<TvmInst>) {
    var updates: List<ControlFlowResolver.BackwardUpdate>? = null
    var attempts = 0
    while (updates == null) {
        check(attempts++ < 32) { "AGAIN stack discovery did not converge" }
        val (_, dryBody) = parseContinuation(registry, ctx, instructions)
        val extra = dryBody.upstream.getUsedEntries().size - ctx.upstream.getUsedEntries().size
        if (extra > 0) { ctx.stackEnsureAtLeast(ctx.stackDepth() + extra); continue }
        updates = ControlFlowResolver.preResolveBackward(ctx, dryBody, false)
    }
    val (_, body) = parseContinuation(registry, ctx, instructions)
    ControlFlowResolver.postResolveBackward(ctx, body, { child ->
        listOf(IRNode.WhileLoop(IRNode.CodeBlock(listOf(IRNode.IntLiteral(-1)), true), child.build()))
    }, updates, false)
    // An infinite back edge has no ordinary fallthrough. Explicit RETALT paths remain in its body.
    ctx.hasDiverged = true
}

fun parseUntilBlock(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,
    bodyEntry: StackEntry
) {
    val bodyContinuation = bodyEntry.continuationInstructions()

    val (_, dryRunBodyCtx) = parseContinuation(
        registry,
        ctx,
        bodyContinuation
    )

    var backwardUpdates = ControlFlowResolver.preResolveBackward(
        ctx,
        dryRunBodyCtx,
        true
    )
    if (backwardUpdates != null &&
        dryRunBodyCtx.upstream.getUsedEntries().size > ctx.upstream.getUsedEntries().size) {
        val extraNeeded = dryRunBodyCtx.upstream.getUsedEntries().size - ctx.upstream.getUsedEntries().size
        ctx.stackEnsureAtLeast(ctx.stackDepth() + extraNeeded)
        backwardUpdates = null
    }
    if (backwardUpdates == null) {
        val (_, dryRunBodyCtxCorrected) = parseContinuation(
            registry,
            ctx,
            bodyContinuation
        )
        backwardUpdates = ControlFlowResolver.preResolveBackward(
            ctx,
            dryRunBodyCtxCorrected,
            true
        ) ?: error("Stack depth mismatch")
    }

    val (_, bodyCtx) = parseContinuation(
        registry,
        ctx,
        bodyContinuation
    )
    val condEntry = bodyCtx.stackFetch(0)

    ControlFlowResolver.postResolveBackward(
        ctx,
        bodyCtx,
        { newBodyCtx ->
            listOf(IRNode.UntilLoop(
                newBodyCtx.build(),
                IRNode.VariableUsage(condEntry, tracked = true)
            ) )
        },
        backwardUpdates,
        true
    )
}

fun parseRepeatBlock(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,
    countEntry: StackEntry,
    bodyEntry: StackEntry
) {
    val bodyContinuation = bodyEntry.continuationInstructions()

    val (_, dryRunBodyCtx) = parseContinuation(
        registry,
        ctx,
        bodyContinuation
    )

    var backwardUpdates = ControlFlowResolver.preResolveBackward(
        ctx,
        dryRunBodyCtx,
        false
    )
    if (backwardUpdates != null &&
        dryRunBodyCtx.upstream.getUsedEntries().size > ctx.upstream.getUsedEntries().size) {
        val extraNeeded = dryRunBodyCtx.upstream.getUsedEntries().size - ctx.upstream.getUsedEntries().size
        ctx.stackEnsureAtLeast(ctx.stackDepth() + extraNeeded)
        backwardUpdates = null
    }
    if (backwardUpdates == null) {
        val (_, dryRunBodyCtxCorrected) = parseContinuation(
            registry,
            ctx,
            bodyContinuation
        )
        backwardUpdates = ControlFlowResolver.preResolveBackward(
            ctx,
            dryRunBodyCtxCorrected,
            false
        ) ?: error("Stack depth mismatch")
    }

    val (_, bodyCtx) = parseContinuation(
        registry,
        ctx,
        bodyContinuation
    )

    ControlFlowResolver.postResolveBackward(
        ctx,
        bodyCtx,
        { newBodyCtx ->
            listOf(IRNode.RepeatLoop(
                IRNode.VariableUsage(countEntry, tracked = true),
                newBodyCtx.build()
            ))
        },
        backwardUpdates,
        false
    )
}

fun parseIfBlock(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,

    ifEntry: StackEntry?,
    ifReturn: Boolean,

    elseEntry: StackEntry?,
    elseReturn: Boolean,

    condEntry: StackEntry,
    ifnot: Boolean
) {
    val ifContinuation = ifEntry?.continuationInstructions()
    val elseContinuation = elseEntry?.continuationInstructions()
    val condNode = IRNode.CodeBlock(listOf(IRNode.VariableUsage(condEntry, tracked = true)), isExpression = true)

    fun parseBranches(): Pair<Pair<IRNode.CodeBlock?, IrBlockBuilder?>, Pair<IRNode.CodeBlock?, IrBlockBuilder?>> {
        val ifRes = ifContinuation?.let {
            parseContinuation(registry, ctx, it, isReturn = ifReturn)
        } ?: (null to null)
        val elseRes = elseContinuation?.let {
            parseContinuation(registry, ctx, it, isReturn = elseReturn)
        } ?: (null to null)
        return ifRes to elseRes
    }

    var (ifPair, elsePair) = parseBranches()
    val baseUsed = ctx.upstream.getUsedEntries().size
    val extraNeeded = listOfNotNull(ifPair.second, elsePair.second)
        .maxOfOrNull { it.upstream.getUsedEntries().size - baseUsed } ?: 0
    if (extraNeeded > 0) {
        ctx.stackEnsureAtLeast(ctx.stackDepth() + extraNeeded)
        val reparsed = parseBranches()
        ifPair = reparsed.first
        elsePair = reparsed.second
    }

    val (ifNode, ifCtx) = ifPair
    val (elseNode, elseCtx) = elsePair
    val fallthroughCtx = ctx.fork()

    val ifDiverged = ifCtx?.hasDiverged == true
    val elseDiverged = elseCtx?.hasDiverged == true

    val finalized = buildList {
        if (ifCtx != null && !ifReturn && !ifDiverged) {
            add(ifCtx)
        }
        if (elseCtx != null && !elseReturn && !elseDiverged) {
            add(elseCtx)
        }
    }

    if (ifCtx != null && elseCtx != null && (ifDiverged || ifReturn) && (elseDiverged || elseReturn)) {
        ctx.appendNode(IRNode.IfElse(condNode, ifNode, elseNode, ifnot))
        ctx.hasDiverged = true
        return
    }

    val ifSurvives = ifCtx != null && !ifReturn && !ifDiverged
    val elseSurvives = elseCtx != null && !elseReturn && !elseDiverged
    if (ifCtx != null && elseCtx != null && ((elseDiverged && ifSurvives) || (ifDiverged && elseSurvives))) {
        val (survivor, splicedNodes) = if (elseDiverged) {
            ifCtx to buildList {
                add(IRNode.IfElse(condNode, elseNode, null, !ifnot))
                ifNode?.entries?.let(::addAll)
            }
        } else {
            elseCtx to buildList {
                add(IRNode.IfElse(condNode, ifNode, null, ifnot))
                elseNode?.entries?.let(::addAll)
            }
        }
        ControlFlowResolver.resolveForward(
            ctx,
            splicedNodes,
            listOf(survivor),
            null,
            listOfNotNull(ifCtx, elseCtx)
        )
        return
    }

    ControlFlowResolver.resolveForward(
        ctx,
        listOf(
            IRNode.IfElse(
                condNode,
                ifNode,
                elseNode,
                ifnot
            ),
        ),
        finalized,
        if (finalized.size < 2 && !(ifReturn && elseEntry != null) && !(elseEntry != null && (ifDiverged || elseDiverged))) {
            fallthroughCtx
        } else {
            null
        },
        listOfNotNull(ifCtx, elseCtx)
    )
}

fun parseIfjmpBlock(
    registry: ParserRegistry,
    ctx: IrBlockBuilder,
    ifEntry: StackEntry,
    condEntry: StackEntry,
    ifnot: Boolean,
    forceReturn: Boolean = false
) {
    val bodyIsReturn = ctx.isReturnContext || forceReturn ||
        (ctx.hasAltReturn && containsAltReturn(ifEntry.continuationInstructions()))

    if (ctx.isReturnContext) {
        parseIfBlock(registry, ctx, ifEntry, true, null, false, condEntry, ifnot)
    } else {
        val remaining = ctx.remainingInstructions!!
        val elseInstructions = remaining.toList()
        remaining.clear()

        val elseEntry = if (elseInstructions.isNotEmpty()) {
            newContinuation(name("continuation"), elseInstructions)
        } else null

        parseIfBlock(registry, ctx, ifEntry, bodyIsReturn, elseEntry, false, condEntry, ifnot)
    }
}

private fun containsAltReturn(instructions: List<TvmInst>): Boolean {
    return instructions.any {
        it is TvmContBasicRetaltInst ||
        it is TvmContConditionalIfretaltInst ||
        it is TvmContConditionalIfnotretaltInst
    }
}

fun registerContinuationParsers(registry: ParserRegistry) {
    fun pushLiteral(ctx: IrBlockBuilder, instructions: List<TvmInst>) {
        val entry = newContinuation(name("continuation"), instructions)
        // Tolk's non-capturing lambda is a PUSHCONT containing one CALLDICT.
        // Preserve construction at its original position and the c3 lookup;
        // do not inline a runtime callback or change CALLXARGS stack isolation.
        (instructions.singleOrNull() as? TvmContDictCalldictInst)?.let { target ->
            ctx.appendNode(IRNode.VariableDeclaration(listOf(entry), IRNode.FunctionCall(
                "asm_PUSHCONT_CALLDICT_${target.n}", emptyList(), "\"<{ ${target.n} CALLDICT }>CONT\"", pure = true)))
        }
        ctx.stackPush(entry)
    }
    with(registry) {
        register<TvmConstDataPushcontShortInst>(ParserLevel.MANUAL) { ctx, inst ->
            pushLiteral(ctx, inst.c.list)
        }
        register<TvmConstDataPushrefcontInst>(ParserLevel.MANUAL) { ctx, inst ->
            pushLiteral(ctx, inst.c.list)
        }
        register<TvmConstDataPushcontInst> (ParserLevel.MANUAL){ ctx, inst ->
            pushLiteral(ctx, inst.c.list)
        }
        register<TvmContLoopsWhileInst>(ParserLevel.MANUAL) { ctx, inst ->
            val bodyEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)

            parseWhileBlock(registry, ctx, condEntry, bodyEntry)
        }
        register<TvmContLoopsAgainInst>(ParserLevel.MANUAL) { ctx, _ ->
            val body = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            parseAgainBlock(registry, ctx, body.continuationInstructions())
            ctx.remainingInstructions?.clear()
        }
        register<TvmContLoopsAgainendInst>(ParserLevel.MANUAL) { ctx, _ ->
            val tail = checkNotNull(ctx.remainingInstructions).toList()
            ctx.remainingInstructions!!.clear()
            parseAgainBlock(registry, ctx, tail)
        }
        register<TvmContLoopsUntilInst>(ParserLevel.MANUAL) { ctx, inst ->
            val bodyEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)

            parseUntilBlock(registry, ctx, bodyEntry)
        }
        register<TvmContLoopsRepeatInst>(ParserLevel.MANUAL) { ctx, inst ->
            val bodyEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val countEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseRepeatBlock(registry, ctx, countEntry, bodyEntry)
        }
        register<TvmContConditionalIfjmpInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, false)
        }
        register<TvmContConditionalIfjmprefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = newContinuation(name("continuation"), inst.c.list)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, false)
        }
        register<TvmContConditionalIfrefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), inst.c.list)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                null,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfelserefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val elseEntry = newContinuation(name("continuation"), inst.c.list)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                elseEntry,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfelseInst>(ParserLevel.MANUAL) { ctx, inst ->
            val elseEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                elseEntry,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                null,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfnotInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfBlock(
                registry, ctx, ifEntry, false, null, false, condEntry, true
            )
        }
        register<TvmContConditionalIfnotrefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), inst.c.list)

            parseIfBlock(
                registry, ctx, ifEntry, false, null, false, condEntry, true
            )
        }
        register<TvmContConditionalIfnotjmprefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = newContinuation(name("continuation"), inst.c.list)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, true)
        }
        register<TvmContConditionalIfnotretInst>(ParserLevel.MANUAL) { ctx, inst ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            val retEntry = newContinuation(name("continuation"), emptyList())

            parseIfjmpBlock(registry, ctx, retEntry, condEntry, true, forceReturn = true)
        }
        register<TvmContConditionalIfrefelserefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val elseEntry = newContinuation(name("continuation"), inst.c2.list)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), inst.c1.list)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                elseEntry,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfrefelseInst>(ParserLevel.MANUAL) { ctx, inst ->
            val elseEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), inst.c.list)

            parseIfBlock(
                registry,
                ctx,
                ifEntry,
                false,
                elseEntry,
                false,
                condEntry,
                false
            )
        }
        register<TvmContConditionalIfretInst> (ParserLevel.MANUAL){ ctx, inst ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), listOf())

            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, false, forceReturn = true)
        }
        register<TvmContConditionalIfnotjmpInst>(ParserLevel.MANUAL) { ctx, inst ->
            val ifEntry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)

            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, true)
        }
        register<TvmContBasicCallrefInst>(ParserLevel.MANUAL) { ctx, inst ->
            val syntheticId = ctx.callRefMapping?.get(inst.c.list)
            if (syntheticId != null) {
                val idx = (-syntheticId.toLong() - 1000).toInt()
                handleCallById(ctx, syntheticId, "callref_$idx")
            } else {
                parseCallContinuation(registry, ctx, inst.c.list)
            }
        }
        register<TvmContBasicExecuteInst>(ParserLevel.MANUAL) { ctx, inst ->
            val entry = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val contInsts = entry.continuationInstructions()
            val syntheticId = ctx.callRefMapping?.get(contInsts)
            if (syntheticId != null) {
                val idx = (-syntheticId.toLong() - 1000).toInt()
                handleCallById(ctx, syntheticId, "callref_$idx")
            } else {
                parseCallContinuation(registry, ctx, contInsts)
            }
        }
        register<TvmContBasicCallxargsInst>(ParserLevel.MANUAL) { ctx, inst ->
            // CALLXARGS encodes its complete stack-width ABI even when the target
            // is dynamic. Keep the call opcode and opaque slot types; do not infer
            // the target's source signature or inline its body.
            val target = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            (target.concreteValue as? ConcreteValue.ContinuationVal)?.let {
                check(it.instructions.singleOrNull() is TvmContDictCalldictInst) {
                    "Literal continuation: exact runtime materialization requires a single CALLDICT"
                }
            }
            val arguments = (0 until inst.p).map { ctx.stackPop() }.reversed() + target
            val results = (0 until inst.r).map { StackEntry.Simple(TvmStackEntryType.UNKNOWN, name("call_result")) }
            val call = IRNode.FunctionCall("asm_CALLXARGS_${inst.p}_${inst.r}",
                arguments.map { IRNode.VariableUsage(it, tracked = true) }, "\"${inst.p} ${inst.r} CALLXARGS\"")
            ctx.appendNode(IRNode.VariableDeclaration(results, call))
            results.forEach { ctx.stackPush(it) }
        }
        register<TvmContBasicJmpxInst>(ParserLevel.MANUAL) { ctx, _ ->
            val target = ctx.stackPop(TvmStackEntryType.CONTINUATION.typename)
            val (block, jumped) = parseContinuation(registry, ctx, target.continuationInstructions(), isReturn = true)
            block.entries.forEach { ctx.appendNode(it) }
            ctx.mergeUpstreams(listOf(jumped))
            ctx.hasDiverged = true
            ctx.remainingInstructions?.clear()
        }
        register<TvmContBasicCallxargsVarInst>(ParserLevel.MANUAL) { _, _ ->
            error("Dynamic continuation: CALLXARGS_VAR does not encode a fixed return width")
        }
        register<TvmContDictCalldictInst>(ParserLevel.MANUAL) { ctx, inst ->
            handleCalldict(ctx, inst.n)
        }
        register<TvmContDictCalldictLongInst>(ParserLevel.MANUAL) { ctx, inst ->
            handleCalldict(ctx, inst.n)
        }

        register(
            TvmContRegistersSaveInst::class.java,
            ParserLevel.MANUAL,
            parser = { ctx, inst ->
                if (inst.i == 2) {
                    val remaining = ctx.remainingInstructions
                    if (remaining != null && remaining.isNotEmpty() && remaining[0] is TvmContRegistersSamealtsaveInst) {
                        remaining.removeFirst()
                        ctx.hasAltReturn = true
                    }
                }
                true
            }
        )

        register<TvmContRegistersSamealtsaveInst>(ParserLevel.MANUAL) { _, _ -> }

        register<TvmContBasicRetaltInst>(ParserLevel.MANUAL) { ctx, _ ->
            ctx.appendNode(IRNode.FunctionReturnStatement(ctx.stackCopy().map {
                IRNode.VariableUsage(it, tracked = true)
            }))
            ctx.hasDiverged = true
            ctx.remainingInstructions?.clear()
        }

        register<TvmContConditionalIfretaltInst>(ParserLevel.MANUAL) { ctx, _ ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), listOf())
            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, false, forceReturn = true)
        }

        register<TvmContConditionalIfnotretaltInst>(ParserLevel.MANUAL) { ctx, _ ->
            val condEntry = ctx.stackPop(TvmStackEntryType.INT.typename)
            val ifEntry = newContinuation(name("continuation"), listOf())
            parseIfjmpBlock(registry, ctx, ifEntry, condEntry, true, forceReturn = true)
        }

        register<TvmExceptionsThrowanyInst>(ParserLevel.MANUAL) { ctx, _ ->
            val excno = ctx.stackPop()
            ctx.appendNode(IRNode.FunctionCall("throw", listOf(IRNode.VariableUsage(excno, tracked = true))))
            ctx.hasDiverged = true
            ctx.remainingInstructions?.clear()
        }
        register<TvmExceptionsThrowarganyInst>(ParserLevel.MANUAL) { ctx, _ ->
            val code = ctx.stackPop(TvmStackEntryType.INT.typename)
            val value = ctx.stackPop()
            ctx.appendNode(IRNode.FunctionCall("throw_arg", listOf(
                IRNode.VariableUsage(value, tracked = true), IRNode.VariableUsage(code, tracked = true)
            )))
            ctx.hasDiverged = true
            ctx.remainingInstructions?.clear()
        }
    }
}

private fun handleCalldict(ctx: IrBlockBuilder, methodId: Int) {
    val bigId = java.math.BigInteger.valueOf(methodId.toLong())
    val functionName = when (bigId) {
        java.math.BigInteger("-1") -> "recv_external"
        java.math.BigInteger("0") -> "recv_internal"
        else -> "fn_$methodId"
    }
    handleCallById(ctx, bigId, functionName)
}

private fun handleCallById(ctx: IrBlockBuilder, methodId: java.math.BigInteger, functionName: String) {
    val sig = ctx.callSignatures?.get(methodId)

    if (sig == null) {
        error("Unresolved call $functionName")
    }

    val args = (0 until sig.nArgs).map { i ->
        val entry = ctx.stackPop()
        val argType = sig.argTypes.getOrNull(i)
        if (entry.type == TvmStackEntryType.UNKNOWN && argType != null && argType != TvmStackEntryType.UNKNOWN) {
            ctx.typeRefinements.putIfAbsent(entry, argType)
        }
        if (entry.type != TvmStackEntryType.UNKNOWN) {
            ctx.callArgObserver?.invoke(methodId, i, entry.type)
        }
        IRNode.VariableUsage(entry, tracked = true)
    }.reversed()

    val returnEntries = sig.returnTypes.mapIndexed { idx, type ->
        StackEntry.Simple(type, name("result"))
    }

    val call = IRNode.FunctionCall(functionName, args)

    if (returnEntries.isEmpty()) {
        ctx.appendNode(IRNode.VariableDeclaration(listOf(), call))
    } else {
        ctx.appendNode(IRNode.VariableDeclaration(returnEntries.reversed(), call))
        for (entry in returnEntries.reversed()) {
            ctx.stackPush(entry)
        }
    }
}
