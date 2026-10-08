package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.TvmStackEntryType
import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry.TvmCp0InstValueFlowOutputsEntry
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.*

class StdlibRegistry(
    private val cp0InstructionRegistry: Cp0InstructionRegistry,
    private val stdlibContent: String,
    private val builtinContent: String,
) {


    private companion object {
        private val ASM_FN_REGEX =
            "(?:forall\\s+(?<forallArgs>\\w+(?:\\s*,\\s*\\w+)*)\\s+->\\s+)?(?<returnType>.+?)\\s+(?<fnName>[^\\s\\(\\)]+)\\s*\\((?<fnArgs>(?:\\w+\\s+\\w+)(?:\\s*,\\s*\\w+\\s+\\w+)*)?\\)\\s*(?:\\w+)*\\s*asm(?:\\s*\\((?<asmDescription>.+)\\)\\s*)?\\s*(?<asmExpression>\"[^\"]+\"(?:\\s*\"[^\"]+\")*)\\s*;".toRegex()
        private val ASM_EXP_REGEX = "\"[^\"]+\"".toRegex()
    }

    private fun parseFnReorg(fnArgs: String, asmDescription: String): AsmFunctionFactory.Reorg {
        val fnArgNames = fnArgs.split(',')
            .map { it.trim().split(' ').last() }
            .filter { it.isNotEmpty() }

        val parts = asmDescription.split("->").map { it.trim() }
        val asmInputs = parts[0].takeIf { it.isNotEmpty() }?.split(Regex("\\s+"))?.filter { it.isNotEmpty() }
        val asmOutputs = parts.getOrNull(1)?.split(Regex("\\s+"))?.filter { it.isNotEmpty() }

        val inputMap = asmInputs?.takeIf { it.isNotEmpty() }?.let { inputs ->
            inputs.mapIndexedNotNull { asmIndex, name ->
                val fnIndex = fnArgNames.indexOf(name)
                if (fnIndex >= 0) asmIndex to fnIndex else null
            }.toMap()
        }

        val outputMap = asmOutputs?.takeIf { it.isNotEmpty() }?.let { outputs ->
            outputs.mapIndexed { outIdx, inIdxStr ->
                outIdx to inIdxStr.toInt()
            }.toMap()
        }

        return AsmFunctionFactory.Reorg(input = inputMap, output = outputMap)
    }

    private fun parseStdlibLine(registry: ParserRegistry, line: String) {
        val match = ASM_FN_REGEX.matchEntire(line) ?: return
        val groupForallArgs = match.groups["forallArgs"]?.value // TODO
        val groupReturnType = match.groups["returnType"]?.value ?: return // TODO
        val groupFnName = match.groups["fnName"]?.value ?: return
        val groupFnArgs = match.groups["fnArgs"]?.value
        val groupAsmDescription = match.groups["asmDescription"]?.value
        val groupAsmExpression = match.groups["asmExpression"]?.value ?: return

        if (groupFnName.startsWith("~") && groupFnName != "~_") {
            // TODO tilda function
            return
        }

        val instructions = FiftHelper.parseSequence(groupAsmExpression, cp0InstructionRegistry)

        if (instructions.isEmpty()) {
            return
        }

        val chainClasses = instructions.map { cp0InstructionRegistry.getByOpcode(it.opcodeName)!!.instClass }
        val chainConstraints = instructions.map { it.constraints }
        val firstInstData = cp0InstructionRegistry.getByOpcode(instructions.first().opcodeName)!!

        val explicitFirstConstraints = chainConstraints.firstOrNull() ?: emptyList()
        val implicitFirstConstraints = firstInstData.implicitOperands.map { (k, v) ->
            FiftHelper.AsmConstraint(k, v.toString())
        }
        val allFirstConstraints = explicitFirstConstraints + implicitFirstConstraints

        val finalOutputs = resolveOutputs(firstInstData)

        val functionPure = instructions.all {
            cp0InstructionRegistry.getByOpcode(it.opcodeName)!!.isPure()
        }

        val reorg = groupFnArgs?.let { args ->
            groupAsmDescription?.let { desc -> parseFnReorg(args, desc) }
        }

        val predicate: InstPredicate = { inputs ->
            if (inputs.size < chainConstraints.size) false
            else chainConstraints.withIndex().all { (i, constr) ->
                val effectiveConstraints = if (i == 0) allFirstConstraints else constr
                FiftHelper.createPredicate(effectiveConstraints)(listOf(inputs[i]))
            }
        }

        val parser = AsmFunctionFactory.create(firstInstData, groupFnName, reorg, allFirstConstraints, overrideOutputs = finalOutputs, pure = functionPure)

        if (chainClasses.size == 1) {
            registry.register(chainClasses.first(), ParserLevel.STDLIB, { ctx, inst -> parser(ctx, listOf(inst)) }, predicate)
        } else {
            registry.registerChain(chainClasses, ParserLevel.STDLIB, parser, predicate)
        }
    }

    fun registerStdlibInstructions(
        registry: ParserRegistry,
    ) {
        builtinContent
            .lineSequence()
            .map { it.trim() }
            .forEach { parseStdlibLine(registry, it) }
        stdlibContent
            .lineSequence()
            .map { it.trim() }
            .forEach { parseStdlibLine(registry, it) }
    }

    private fun processConditionalInstruction(
        registry: ParserRegistry,
        instData: Cp0InstructionRegistry.InstructionData
    ) {
        val mnemonic = instData.instDescriptionRaw.mnemonic

        val standardOutputs = resolveOutputs(instData)
        val conditional = instData.instDescriptionRaw.valueFlow.outputs.stack
            ?.filterIsInstance<TvmCp0InstValueFlowOutputsEntry.Conditional>()?.singleOrNull() ?: return
        val absent = conditional.match.singleOrNull { it.value == 0L }?.stack ?: return
        val present = conditional.match.filter { it.value != 0L }.map { it.stack ?: emptyList() }
        if (present.isEmpty() || present.any { it.size != present.first().size }) return
        val padding = present.first().size - absent.size

        fun regChain(suffix: String, opcode: String, count: Int, chain: List<Class<out TvmInst>>) {
            if (padding != count) return
            val fullChain = listOf(instData.instClass) + chain
            val parser = AsmFunctionFactory.create(
                instData,
                "asm_${mnemonic}_$suffix",
                null,
                // NULLSWAPIFNOT inserts missing values below the existing flag;
                // it does not consume the flag or the updated dictionary.
                overrideOutputs = standardOutputs,
                constraints = emptyList(),
                asmSuffix = listOf(opcode),
            )
            @Suppress("UNCHECKED_CAST")
            registry.registerChain(fullChain, ParserLevel.RAW_ASM, parser as InstParserFull<List<*>>)
        }

        regChain("opt", "NULLSWAPIFNOT", 1, listOf(TvmTupleNullswapifnotInst::class.java))
        regChain("opt2", "NULLSWAPIFNOT2", 2, listOf(TvmTupleNullswapifnot2Inst::class.java))

    }

    fun registerSimpleAsmInstructions(
        registry: ParserRegistry,
    ) {
        val processed = mutableSetOf<Class<out TvmInst>>()

        for ((_, instData) in cp0InstructionRegistry.instructions) {
            if (!processed.add(instData.instClass)) continue

            if (instData.instDescriptionRaw.mnemonic == "GETPARAM") {
                registerEmbeddedParameter(registry, instData, mapOf(
                    0 to TvmStackEntryType.INT, 1 to TvmStackEntryType.INT, 2 to TvmStackEntryType.INT,
                    3 to TvmStackEntryType.INT, 4 to TvmStackEntryType.INT, 5 to TvmStackEntryType.INT,
                    6 to TvmStackEntryType.INT,
                    7 to TvmStackEntryType.TUPLE(listOf(TvmStackEntryType.INT, TvmStackEntryType.CELL)),
                    8 to TvmStackEntryType.SLICE, 9 to TvmStackEntryType.CELL, 10 to TvmStackEntryType.CELL,
                    11 to TvmStackEntryType.TUPLE(listOf(TvmStackEntryType.INT, TvmStackEntryType.CELL)),
                    12 to TvmStackEntryType.INT, 13 to TvmStackEntryType.TUPLE(emptyList()),
                    14 to TvmStackEntryType.TUPLE(emptyList()), 15 to TvmStackEntryType.INT
                ))
            }

            if (!registry.hasNonConditionalParser(instData.instClass)) {
                val instDescRaw = instData.instDescriptionRaw
                if (instDescRaw.mnemonic == "INMSGPARAM") {
                    registerInMsgParamInstruction(registry, instData)
                }
                if (instDescRaw.controlFlow.branches.isNotEmpty()) {
                    continue
                }
                if ((instDescRaw.doc?.category == "stack" || instDescRaw.doc?.category == "stack_complex") && instDescRaw.mnemonic !in listOf(
                        "DEPTH",
                        "CHKDEPTH"
                    )
                ) {
                    continue
                }

                val hasConditionalOutputs = (instData.instDescriptionRaw.valueFlow.outputs.stack
                        ?: emptyList()).any { it is TvmCp0InstValueFlowOutputsEntry.Conditional }

                if (hasConditionalOutputs) {
                    processConditionalInstruction(registry, instData)
                    if (!hasUniformConditionalOutputs(instData)) {
                        continue
                    }
                }

                registerAsmFunction(
                    registry,
                    instData,
                    "asm_${instDescRaw.mnemonic}",
                    null,
                    ParserLevel.RAW_ASM,
                    overrideOutputs = if (hasConditionalOutputs) resolveOutputs(instData) else null
                )
            }
        }
    }

    private fun registerInMsgParamInstruction(
        registry: ParserRegistry,
        instData: Cp0InstructionRegistry.InstructionData
    ) {
        // The selector is encoded in the instruction, not supplied on the TVM stack.
        // Different selectors also have different result types, so they must not share
        // a single polymorphic asm wrapper (FunC requires a fixed result width).
        val types = mapOf(
            0 to TvmStackEntryType.INT,
            1 to TvmStackEntryType.INT,
            2 to TvmStackEntryType.SLICE,
            3 to TvmStackEntryType.INT,
            4 to TvmStackEntryType.INT,
            5 to TvmStackEntryType.INT,
            6 to TvmStackEntryType.INT,
            7 to TvmStackEntryType.INT
        )
        registerEmbeddedParameter(registry, instData, types)
    }

    private fun registerEmbeddedParameter(
        registry: ParserRegistry,
        instData: Cp0InstructionRegistry.InstructionData,
        types: Map<Int, TvmStackEntryType>
    ) {
        val mnemonic = instData.instDescriptionRaw.mnemonic
        val selector = instData.instDescriptionRaw.bytecode.operands.single().name
        registry.register(
            instData.instClass,
            ParserLevel.MANUAL,
            { ctx, inst ->
                val index = InstValueAccessor.getValue(inst, selector).toString().toInt()
                val result = StackEntry.Simple(types.getValue(index), StackEntryName.Const("inmsg_$index"))
                ctx.stackPush(result)
                ctx.appendNode(IRNode.VariableDeclaration(
                    listOf(result),
                    IRNode.FunctionCall(
                        "asm_${mnemonic}_$index",
                        emptyList(),
                        "\"$index $mnemonic\"",
                        instData.isPure()
                    )
                ))
                true
            },
            predicate = { instructions ->
                InstValueAccessor.getValue(instructions.first(), selector).toString().toInt() in types
            }
        )
    }

    private fun registerAsmFunction(
        registry: ParserRegistry,
        instData: Cp0InstructionRegistry.InstructionData,
        name: String,
        reorg: AsmFunctionFactory.Reorg?,
        level: ParserLevel,
        overrideOutputs: List<TvmCp0InstValueFlowOutputsEntry>? = null
    ) {
        try {
            val parser = AsmFunctionFactory.create(instData, name, reorg, emptyList(), overrideOutputs = overrideOutputs, pure = instData.isPure())
            registry.register(instData.instClass, level, { ctx, inst -> parser(ctx, listOf(inst)) })
        } catch (e: Throwable) {
            if (e.message?.contains("Inst redefinition") == true) return
            throw e
        }
    }

    private fun hasUniformConditionalOutputs(
        instData: Cp0InstructionRegistry.InstructionData
    ): Boolean {
        val outputs = instData.instDescriptionRaw.valueFlow.outputs.stack ?: return true
        val conditionals = outputs.filterIsInstance<TvmCp0InstValueFlowOutputsEntry.Conditional>()
        return conditionals.all { cond ->
            val branches = cond.match.map { it.stack ?: emptyList() }
            if (branches.size < 2) return@all true
            val first = branches.first()
            branches.drop(1).all { branch ->
                branch.size == first.size &&
                    branch.zip(first).all { (a, b) -> a.contentEquals(b) }
            }
        }
    }

    private fun resolveOutputs(
        instData: Cp0InstructionRegistry.InstructionData
    ): List<TvmCp0InstValueFlowOutputsEntry> {
        val rawOutputs = instData.instDescriptionRaw.valueFlow.outputs.stack ?: return emptyList()

        val condEntry = rawOutputs.filterIsInstance<TvmCp0InstValueFlowOutputsEntry.Conditional>().lastOrNull()

        if (condEntry == null) return rawOutputs

        val prefix = rawOutputs.takeWhile { it !== condEntry }

        val successMatch = condEntry.match.find { it.value == -1L }
            ?: condEntry.match.maxByOrNull { it.stack?.size ?: 0 }
            ?: return prefix

        val successValues = successMatch.stack ?: emptyList()

        val flagOutput = TvmCp0InstValueFlowOutputsEntry.Simple(
            name = condEntry.name,
            valueTypes = listOf(Cp0InstructionRegistry.TvmCp0InstStackEntryType.INT)
        )

        return prefix + successValues + flagOutput
    }
}
