package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry
import io.swee.tvm.decompiler.internal.ir.IRNode

object AsmFunctionFactory {
    data class Reorg(
        val input: Map<Int, Int>?,
        val output: Map<Int, Int>?,
    )

    fun create(
        instData: Cp0InstructionRegistry.InstructionData,
        fnName: String,
        reorg: Reorg?,
        constraints: List<FiftHelper.AsmConstraint>,
        overrideOutputs: List<Cp0InstructionRegistry.TvmCp0InstValueFlowOutputsEntry>? = null,
        pure: Boolean = false,
        asmSuffix: List<String> = emptyList()
    ): InstParser {
        return { ctx, instList ->
            val primaryInst = instList.first()

            val inputStack = instData.instDescriptionRaw.valueFlow.inputs.stack ?: emptyList()

            val arrayLengthVarNames = inputStack
                .filter { it.type == "array" }
                .mapNotNull { it.lengthVar }
                .toSet()

            val stackLengthVars = mutableMapOf<String, Pair<Int, StackEntry>>()
            for (entry in inputStack.asReversed()) {
                if (entry.type == "simple" && entry.name in arrayLengthVarNames) {
                    val popped = ctx.stackPop(TvmStackEntryType.INT.typename)
                    val n = (popped.concreteValue as? ConcreteValue.IntVal)?.value?.toInt()
                        ?: error("${instData.instDescriptionRaw.mnemonic}: array length '${entry.name}' must be a concrete integer on stack")
                    stackLengthVars[entry.name!!] = n to popped
                }
            }

            fun resolveArrayLength(lengthVar: String): Int {
                stackLengthVars[lengthVar]?.let { return it.first }
                return InstValueAccessor.getValue(primaryInst, lengthVar).toString().toInt()
            }

            val poppedEntries = inputStack.flatMap { entry ->
                when (entry.type) {
                    "simple" -> {
                        if (entry.name in stackLengthVars) emptyList()
                        else listOf(ctx.stackPop())
                    }
                    "array" -> {
                        val toPop = resolveArrayLength(entry.lengthVar!!)
                        (0 until toPop).map { ctx.stackPop() }
                    }
                    else -> error("Unexpected input stack entry type: ${entry.type}")
                }
            }.reversed()

            val args = poppedEntries + stackLengthVars.values.map { it.second }

            var typeIdx = 0
            for (entry in inputStack) {
                val popType = entry.valueTypes?.let { types ->
                    val nonNull = types.filter { it != Cp0InstructionRegistry.TvmCp0InstStackEntryType.NULL }
                    TvmStackEntryType.fromTvmStackEntryType(nonNull.singleOrNull())
                } ?: TvmStackEntryType.UNKNOWN
                val count = when (entry.type) {
                    "simple" -> 1
                    "array" -> resolveArrayLength(entry.lengthVar!!)
                    else -> 0
                }
                for (j in 0 until count) {
                    if (typeIdx < args.size) {
                        val popped = args[typeIdx]
                        if (popped.type == TvmStackEntryType.UNKNOWN && popType != TvmStackEntryType.UNKNOWN) {
                            ctx.typeRefinements.putIfAbsent(popped, popType)
                        }
                        typeIdx++
                    }
                }
            }

            val virtualArgs = mutableListOf<StackEntry>()
            val embeddedFiftLiterals = mutableListOf<String>()

            for (operand in instData.instDescriptionRaw.bytecode.operands) {
                if (constraints.any { it.fieldName == operand.name }) {
                    continue
                }

                val value = InstValueAccessor.getValue(primaryInst, operand.name)

                // An array's encoded width (e.g. TUPLE 5) is a Fift operand,
                // not an additional value on the runtime stack. Distinguish it
                // from variable-width instructions that consume n themselves.
                if (operand.name in arrayLengthVarNames && operand.name !in stackLengthVars) {
                    embeddedFiftLiterals.add(value.toString())
                    continue
                }

                // A control-register operand is encoded in the opcode, not passed on the
                // TVM stack. Fift expects a register object (c5), not a runtime integer.
                if (operand.displayHints?.any { it is Cp0InstructionRegistry.TvmCp0InstBytecodeOperandDisplayHint.Register } == true) {
                    embeddedFiftLiterals.add("c$value")
                    continue
                }

                if (operand.type == Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.SUBSLICE ||
                    operand.type == Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.REF) {
                    val cell = value as org.ton.bytecode.TvmCell
                    embeddedFiftLiterals.add(if (operand.type == Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.REF)
                        Literals.cellReferenceLiteral(cell) else Literals.cellLiteral(cell))
                    continue
                }

                val virtualEntry = StackEntry.Simple(
                    TvmStackEntryType.fromTvmBytecodeOperandDescription(operand),
                    StackEntryName.Const("virtual")
                )
                ctx.pushVirtual(virtualEntry)

                ctx.appendNode(IRNode.VariableDeclaration(listOf(virtualEntry), IRNode.IntLiteral(value)))
                ctx.stackPop()

                virtualArgs.add(virtualEntry)
            }

            val allArgs = virtualArgs + args

            val finalArgs = if (reorg?.input != null) {
                check(reorg.input.size == allArgs.size) { "Reorg input size mismatch in $fnName" }
                allArgs.indices.map { i ->
                    val originalIdx = reorg.input.entries.find { it.value == i }?.key ?: i
                    allArgs[originalIdx]
                }
            } else {
                allArgs
            }

            val mnemonic = instData.instDescriptionRaw.mnemonic
            val arraySuffix = if (stackLengthVars.isNotEmpty()) {
                "_" + stackLengthVars.values.joinToString("_") { it.first.toString() }
            } else ""
            val (effectiveName, asmBody) = if (embeddedFiftLiterals.isNotEmpty()) {
                val suffix = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256")
                    .digest(embeddedFiftLiterals.joinToString(" ").toByteArray(Charsets.UTF_8)))
                val fiftPrefix = embeddedFiftLiterals.joinToString(" ")
                "${fnName}${arraySuffix}_$suffix" to "\"$fiftPrefix $mnemonic\""
            } else if (arraySuffix.isNotEmpty()) {
                "${fnName}${arraySuffix}" to "\"$mnemonic\""
            } else {
                fnName to null
            }

            // CTOS is often intentionally discarded inside TRY to test whether an
            // opaque exception value really is a cell. Retain its type exception.
            val validation = ctx.preserveCellValidation && mnemonic == "CTOS"
            val callNode = IRNode.FunctionCall(
                if (validation) "asm_checked_CTOS" else effectiveName,
                finalArgs.map { IRNode.VariableUsage(it, true) },
                if (validation) "\"CTOS\"" else if (asmSuffix.isEmpty()) asmBody else
                    (listOf(asmBody ?: "\"$mnemonic\"") + asmSuffix.map { "\"$it\"" }).joinToString(" "),
                pure && !validation
            )

            val outputDescs = overrideOutputs ?: (instData.instDescriptionRaw.valueFlow.outputs.stack ?: emptyList())

            val stackResults = outputDescs.map { desc ->
                when (desc) {
                    is Cp0InstructionRegistry.TvmCp0InstValueFlowOutputsEntry.Simple -> StackEntry.Simple(
                        TvmStackEntryType.fromTvmStackEntryDescription(desc),
                        StackEntryName.Const(desc.name ?: "res")
                    )

                    is Cp0InstructionRegistry.TvmCp0InstValueFlowOutputsEntry.Const -> StackEntry.Simple(
                        TvmStackEntryType.fromTvmStackEntryType(desc.valueType),
                        StackEntryName.Const("const")
                    )

                    else -> error("Unknown output type in $fnName: $desc")
                }
            }

            stackResults.forEach { ctx.stackPush(it) }

            if (stackResults.isEmpty()) {
                ctx.appendNode(callNode)
            } else {
                val finalResults = if (reorg?.output != null) {
                    stackResults.indices.map { i ->
                        val originalIdx = reorg.output.entries.find { it.value == i }?.key ?: i
                        stackResults[originalIdx]
                    }
                } else {
                    stackResults
                }

                ctx.appendNode(IRNode.VariableDeclaration(finalResults, callNode))
            }

            true
        }
    }
}
