package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.api.TvmDecompiler
import io.swee.tvm.decompiler.api.TvmDecompilerResult
import io.swee.tvm.decompiler.api.DecompilationDiagnostic
import io.swee.tvm.decompiler.api.OutputLanguage
import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import io.swee.tvm.decompiler.internal.ir.BranchFoldingPass
import io.swee.tvm.decompiler.internal.ir.CopyCoalescingPass
import io.swee.tvm.decompiler.internal.ir.DeadPhiEliminationPass
import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNodeVisitor
import io.swee.tvm.decompiler.internal.ir.RedundantStoreEliminationPass
import io.swee.tvm.decompiler.internal.ir.TypeResolutionPass
import io.swee.tvm.decompiler.internal.instructions.*
import io.swee.tvm.decompiler.internal.print.RootPrinter
import io.swee.tvm.decompiler.internal.print.TolkPrinter
import org.ton.bytecode.*
import java.math.BigInteger
import java.nio.charset.Charset
import java.util.Base64
import java.util.HexFormat
import java.util.logging.Logger

val SUBROUTINE_RECV_INTERNAL = 0
val SUBROUTINE_RECV_EXTERNAL = -1

fun Iterator<TvmInst>.checkNext(): TvmInst {
    check(hasNext()) {
        "Unexpected end of instruction list"
    }
    return next()
}

object TvmDecompilerImpl : TvmDecompiler {

    private val logger = Logger.getLogger(TvmDecompilerImpl::class.java.name)

    data class ResultFile(override val name: String, override val content: String) : TvmDecompilerResult.File {
    }

    data class Result(
        override val files: List<ResultFile>,
        override val diagnostics: List<DecompilationDiagnostic> = emptyList(),
        override val normalizations: List<NormalizationChange> = emptyList()
    ) : TvmDecompilerResult {
    }

    data class ParsedFunction(
        val function: IRNode.Function,
        val seeds: Map<StackEntry, TvmStackEntryType>
    )

    private fun parseHeader(
        iterator: Iterator<TvmInst>,
        otherMethods: Map<MethodId, TvmMethod>
    ): ContractHeader {
        val inst = iterator.checkNext()
        if (inst is TvmDictSpecialDictpushconstInst) {
            return parseDictHeader(inst, iterator, otherMethods)
        }

        error("Unknown header")
    }

    private fun parseDictHeader(
        instDictpush: TvmDictSpecialDictpushconstInst,
        iterator: Iterator<TvmInst>,
        otherMethods: Map<MethodId, TvmMethod>
    ): ContractHeader {
        val instDictigetJmpz = iterator.checkNext()
        check(instDictigetJmpz is TvmDictSpecialDictigetjmpzInst)
        val instThrowarg = iterator.checkNext()
        check(instThrowarg is TvmExceptionsThrowargInst)
        check(!iterator.hasNext())

        return ContractHeader(otherMethods.mapValues {
            FunctionData(
                it.key,
                it.value.instList,
                listOf(
                    FunctionArg(TvmStackEntryType.SLICE, "in_msg"),
                    FunctionArg(TvmStackEntryType.CELL, "in_msg_full"),
                    FunctionArg(TvmStackEntryType.INT, "in_msg_value"),
                    FunctionArg(TvmStackEntryType.INT, "balance"),
                )
            )
        })
    }

    private val stdlibContent: String by lazy {
        TvmDecompilerImpl::class.java.getResourceAsStream("/stdlib.fc")!!.use {
            it.readAllBytes().toString(Charset.defaultCharset())
        }
    }

    private val registry: ParserRegistry by lazy {
        val builtinContent = TvmDecompilerImpl::class.java.getResourceAsStream("/builtin.fc")!!.use {
            it.readAllBytes().toString(Charset.defaultCharset())
        }

        val cp0InstructionRegistry = Cp0InstructionRegistry.create()
        val registry = ParserRegistry()

        val stdlibRegistry = StdlibRegistry(
            cp0InstructionRegistry,
            stdlibContent,
            builtinContent,
        )

        registerRegistersParsers(registry)
        registerConstParsers(registry)
        registerStackParsers(registry)
        registerContinuationParsers(registry)
        registerGlobalsParsers(registry)
        registerCellParsers(registry)
        registerConstSliceParsers(registry)
        registerEquivParsers(registry)
        registerTupleParsers(registry)
        registerVirtualInstructions(registry)

        stdlibRegistry.registerStdlibInstructions(registry)
        stdlibRegistry.registerSimpleAsmInstructions(registry)

        registry.dumpUnknownInstructions()

        registry
    }

    override fun decompile(boc: ByteArray, options: DecompilerOptions): TvmDecompilerResult {
        val registry = this.registry

        val disassembly = disassembleBoc(boc)

        val mainMethodInstructions = disassembly.mainMethod.instList
        val mainMethodInstructionsIterator = mainMethodInstructions.iterator()

        val firstInstruction = mainMethodInstructionsIterator.checkNext()
        check(firstInstruction is TvmCodepageSetcpInst && firstInstruction.n == 0) {
            "Codepage is not set or is not 0"
        }

        val header = parseHeader(
            mainMethodInstructionsIterator,
            disassembly.methods
        )

        val methodInstructions = header.functions.mapValues { it.value.instructions }

        val callrefResult = extractCallrefBodies(methodInstructions)
        val augmentedMethods = callrefResult.augmentedMethods
        val callrefMapping = callrefResult.callrefMapping

        val entryPointSignatures = ENTRY_POINT_IDS
            .filter { it in header.functions }
            .associateWith {
                FunctionSignature(
                    ENTRY_POINT_ARGS.size,
                    ENTRY_POINT_ARGS.map { arg -> arg.type },
                    0,
                    emptyList()
                )
            }
        val signatures = inferSignatures(augmentedMethods, registry, entryPointSignatures, callrefMapping)

        val parsedCallrefs = callrefMapping.entries
            .distinctBy { it.value }
            .map { (instList, syntheticId) ->
                parseCallrefFunction(registry, instList, syntheticId, signatures, callrefMapping, options)
            }

        val parsedFunctions = header.functions.map {
            parseFunction(registry, it.value, signatures, callrefMapping, options)
        }

        // Collect from the actual IR, before optimization. Speculative loop/branch
        // parses do not leak diagnostics from discarded blocks into the result.
        val diagnostics = mutableListOf<DecompilationDiagnostic>()
        for (parsed in parsedCallrefs + parsedFunctions) {
            parsed.function.accept(object : IRNodeVisitor {
                override fun visit(node: IRNode.Comment) {
                    node.diagnostic?.let {
                        diagnostics += it.copy(methodId = parsed.function.methodId.toString())
                    }
                }
            })
        }

        val allFunctions = (parsedCallrefs + parsedFunctions).map { parsed ->
            val function = parsed.function
            TypeResolutionPass.run(function, parsed.seeds)
            signatures[function.methodId]?.let { sig ->
                val returnStmt = function.codeBlock.entries.lastOrNull()
                if (returnStmt is IRNode.FunctionReturnStatement) {
                    returnStmt.variables.forEachIndexed { i, usage ->
                        val t = sig.returnTypes.getOrNull(i)
                        if (usage.entry.type == TvmStackEntryType.UNKNOWN && t != null && t != TvmStackEntryType.UNKNOWN) {
                            usage.entry.type = t
                        }
                    }
                }
            }

            val base = DeadPhiEliminationPass.run(
                RedundantStoreEliminationPass.run(
                    CopyCoalescingPass.run(DeadPhiEliminationPass.run(function.codeBlock))
                )
            )
            val cleaned = if (options.exact) base else DeadPhiEliminationPass.run(BranchFoldingPass.run(base))
            IRNode.Function(
                function.name,
                function.methodId,
                function.upstreamStack,
                cleaned,
                function.isInlineRef
            )
        }

        val rootNode = IRNode.Root(listOf(), allFunctions)
        if (options.language == OutputLanguage.TOLK) {
            val builtin = TvmDecompilerImpl::class.java.getResourceAsStream("/builtin.fc")!!.use { it.readBytes().toString(Charsets.UTF_8) }
            val output = TolkPrinter(options, stdlibContent, builtin).print(rootNode)
            val normalized = if (options.normalize && diagnostics.isEmpty()) TolkNormalizer.normalize(output.main)
                else TolkNormalizer.Result(output.main, emptyList())
            return Result(listOf(ResultFile("main.tolk", normalized.main), ResultFile("stdlib.tolk", output.support)),
                diagnostics.distinct(), normalized.changes)
        }
        val rootPrinter = RootPrinter(options)

        return Result(
            listOf(
                ResultFile("main.fc", rootPrinter.print(rootNode)),
                ResultFile("stdlib.fc", stdlibContent)
            ),
            diagnostics.distinct()
        )
    }

    private val ENTRY_POINT_IDS = setOf(BigInteger("0"), BigInteger("-1"))

    private val ENTRY_POINT_ARGS = listOf(
        FunctionArg(TvmStackEntryType.SLICE, "in_msg"),
        FunctionArg(TvmStackEntryType.CELL, "in_msg_full"),
        FunctionArg(TvmStackEntryType.INT, "in_msg_value"),
        FunctionArg(TvmStackEntryType.INT, "balance"),
    )

    private fun parseFunction(
        registry: ParserRegistry,
        data: FunctionData,
        signatures: Map<BigInteger, FunctionSignature>,
        callrefMapping: Map<List<TvmInst>, BigInteger> = emptyMap(),
        options: DecompilerOptions = DecompilerOptions()
    ): ParsedFunction {
        val isEntryPoint = data.id in ENTRY_POINT_IDS
        val upstream: UpstreamStack = if (isEntryPoint) {
            DiscoveryUpstreamStack(ENTRY_POINT_ARGS)
        } else {
            val sig = signatures[data.id]
            if (sig != null && sig.nArgs > 0) {
                DiscoveryUpstreamStack(sig.argTypes.mapIndexed { i, type ->
                    val resolvedType = if (type == TvmStackEntryType.UNKNOWN) TvmStackEntryType.INT else type
                    FunctionArg(resolvedType, "arg_$i")
                })
            } else {
                DiscoveryUpstreamStack()
            }
        }
        val builder = IrBlockBuilder(upstream)
        builder.callSignatures = signatures
        builder.callRefMapping = callrefMapping
        builder.options = options
        builder.registry = registry

        val functionName = when (data.id) {
            BigInteger("-1") -> "recv_external"
            BigInteger("0") -> "recv_internal"
            else -> "fn_${data.id}"
        }

        logger.fine("Parsing function $functionName")

        val codeBlock = try {
            parseCodeBlock(registry, builder, data.instructions, true)
        } catch (e: Exception) {
            logger.warning("Exception during parsing of $functionName: ${e.message}")
            failedFunctionBlock(e)
        }

        return ParsedFunction(
            IRNode.Function(
                functionName,
                data.id,
                upstream,
                codeBlock
            ),
            builder.typeRefinements.toMap()
        )
    }

    private fun parseCallrefFunction(
        registry: ParserRegistry,
        instList: List<TvmInst>,
        syntheticId: BigInteger,
        signatures: Map<BigInteger, FunctionSignature>,
        callrefMapping: Map<List<TvmInst>, BigInteger>,
        options: DecompilerOptions = DecompilerOptions()
    ): ParsedFunction {
        val idx = (-syntheticId.toLong() - 1000).toInt()
        val functionName = "callref_$idx"

        val sig = signatures[syntheticId]
        val upstream: UpstreamStack = if (sig != null && sig.nArgs > 0) {
            DiscoveryUpstreamStack(sig.argTypes.mapIndexed { i, type ->
                FunctionArg(type, "arg_$i")
            })
        } else {
            DiscoveryUpstreamStack()
        }
        val builder = IrBlockBuilder(upstream)
        builder.callSignatures = signatures
        builder.callRefMapping = callrefMapping
        builder.options = options
        builder.registry = registry

        logger.fine("Parsing callref function $functionName")

        val codeBlock = try {
            parseCodeBlock(registry, builder, instList, true)
        } catch (e: Exception) {
            logger.warning("Exception during parsing of $functionName: ${e.message}")
            failedFunctionBlock(e)
        }

        return ParsedFunction(
            IRNode.Function(
                functionName,
                syntheticId,
                upstream,
                codeBlock,
                isInlineRef = true
            ),
            builder.typeRefinements.toMap()
        )
    }

    private fun parseInstruction(
        registry: ParserRegistry,
        inst: TvmInst,
        ctx: IrBlockBuilder,
        nextElements: MutableList<TvmInst>
    ) {
        if (!io.swee.tvm.decompiler.internal.instructions.tryParseCompilerTry(registry, ctx, inst, nextElements) &&
            !registry.parse(ctx, inst, nextElements)) {
            ctx.appendNode(IRNode.Comment("unparsed: ${inst.mnemonic} $inst",
                DecompilationDiagnostic(
                    DecompilationDiagnostic.Kind.UNSUPPORTED_INSTRUCTION,
                    "No parser for ${inst.mnemonic}",
                    mnemonic = inst.mnemonic,
                    location = inst.location.toString()
                )))
        }
    }

    fun parseInlinedCodeBlock(
        registry: ParserRegistry,
        instList2: List<TvmInst>
    ): IRNode.CodeBlock {
        val builder = IrBlockBuilder(FixedUpstreamStack(listOf()))
        builder.registry = registry
        return parseCodeBlock(
            registry,
            builder,
            instList2,
            false
        )
    }

    fun parseCodeBlock(
        registry: ParserRegistry,
        ctx: IrBlockBuilder,
        instList2: List<TvmInst>,
        ret: Boolean
    ): IRNode.CodeBlock {
        val instList = instList2.toMutableList()

        var i = 0
        while (i < instList.size) {
            val inst = instList[i++]
            val nextElements = instList.subList(i, instList.size).toMutableList()
            try {
                ctx.remainingInstructions = nextElements
                val nextElementsSizePrev = nextElements.size
                parseInstruction(registry, inst, ctx, nextElements)
                ctx.remainingInstructions = null
                logger.finer("stack after ${inst.mnemonic}: ${ctx.stackDepth()} (upu: ${ctx.upstream.getUsedEntries().size})")
                logger.finer(ctx.stackDump())
                if (nextElements.size != nextElementsSizePrev) {
                    i += (nextElementsSizePrev - nextElements.size)
                }
                if (ctx.hasDiverged) break
            } catch (ex: Exception) {
                logger.warning("Exception during instruction parsing: ${inst.mnemonic} $inst — ${ex.message}")
                ctx.appendNode(IRNode.Comment("exception: ${inst.mnemonic}\n${ex.message}",
                    DecompilationDiagnostic(
                        DecompilationDiagnostic.Kind.PARSER_ERROR,
                        ex.message ?: ex.javaClass.simpleName,
                        mnemonic = inst.mnemonic,
                        location = inst.location.toString()
                    )))
                break
            } finally {
                ctx.remainingInstructions = null
            }
        }
        if (ctx.isExpression && !ctx.hasDiverged) {
            ctx.appendNode(IRNode.VariableUsage(ctx.stackFetch(0), true))
        }
        if (ret && !ctx.hasDiverged) {
            ctx.appendNode(IRNode.FunctionReturnStatement(ctx.stackCopy().map {
                IRNode.VariableUsage(it, tracked = true)
            }.toList()))
        }

        return ctx.build()
    }

    private fun failedFunctionBlock(error: Exception) = IRNode.CodeBlock(listOf(
        IRNode.Comment("exception: function parsing failed\n${error.message}",
            DecompilationDiagnostic(
                DecompilationDiagnostic.Kind.FUNCTION_ERROR,
                error.message ?: error.javaClass.simpleName
            ))
    ))
}
