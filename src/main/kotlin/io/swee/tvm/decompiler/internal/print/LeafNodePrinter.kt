package io.swee.tvm.decompiler.internal.print

import io.swee.tvm.decompiler.internal.DecompilerOptions
import io.swee.tvm.decompiler.internal.FunctionGenerationContext
import io.swee.tvm.decompiler.internal.Literals
import io.swee.tvm.decompiler.internal.StackEntryName
import io.swee.tvm.decompiler.internal.TvmStackEntryType
import io.swee.tvm.decompiler.internal.analyze
import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNode.*
import java.math.BigInteger

class LeafPrinterContext(
    private val sb: StringBuilder,
    val registry: LeafPrinterRegistry,
    val sar: FunctionGenerationContext,
    private var indentLevel: Int
) {

    fun append(value: String): LeafPrinterContext {
        sb.append(value)
        return this
    }

    fun print(node: IRNode) {
        return registry.get(node::class.java).print(this, node)
    }

    fun skip(node: IRNode): Boolean {
        return registry.get(node::class.java).skip(this, node)
    }

    fun <T> indented(block: LeafPrinterContext.() -> T) {
        this.indentLevel++
        try {
            block()
        } finally {
            this.indentLevel--
        }
    }

    fun indent(): String = "\t".repeat(indentLevel)
}

class LeafPrinterRegistry(
    private val printers: Map<Class<out IRNode>, LeafNodePrinter<IRNode>>
) {
    fun get(clazz: Class<out IRNode>): LeafNodePrinter<IRNode> {
        return checkNotNull(printers[clazz]) {
            "Leaf node printer not found for ${clazz.simpleName}"
        }
    }
}

abstract class LeafNodePrinter<T : IRNode>(val clazz: Class<T>) {
    abstract fun print(ctx: LeafPrinterContext, node: T)

    open fun skip(ctx: LeafPrinterContext, node: T): Boolean = false
}

class RootPrinter(private val options: DecompilerOptions = DecompilerOptions()) {
    fun print(root: Root): String {
        val sb = StringBuilder()
        val registry = LeafPrinterRegistry(listOf(
            CodeBlockPrinter(),
            VariableUsagePrinter(),
            VariableDeclarationPrinter(),
            IntLiteralPrinter(),
            SliceLiteralPrinter(),
            SliceConstRefPrinter(),
            CommentPrinter(),
            FunctionReturnStatementPrinter(),
            FunctionCallPrinter(),
            WhileLoopPrinter(),
            RepeatLoopPrinter(),
            UntilLoopPrinter(),
            IfElsePrinter(),
            GlobalWritePrinter(),
            GlobalReadPrinter()
        ).associateBy { it.clazz } as Map<Class<out IRNode>, LeafNodePrinter<IRNode>>)

        val genCtx = analyze(root, options)

        sb.append("#include \"stdlib.fc\";\n")

        for ((num, type) in genCtx.globalVariableTypes.toSortedMap()) {
            val typeName = if (type == TvmStackEntryType.UNKNOWN) "int" else type.funcTypename
            sb.append("global $typeName __global_$num;\n")
        }
        if (genCtx.globalVariableTypes.isNotEmpty()) sb.append("\n")

        for (c in genCtx.node.constants) {
            sb.append("const slice ${c.name} = ${c.literal};\n")
        }
        if (genCtx.node.constants.isNotEmpty()) sb.append("\n")

        for (asmFunction in genCtx.node.asmFunctions) {
            sb.append(asmFunction.returnType.joinToString(separator = ", ", prefix = "(", postfix = ")") { it.type.funcTypename })
            sb.append(" ")
            sb.append(asmFunction.name)
            sb.append(" (")
            sb.append(asmFunction.args.joinToString(", ") { "${it.type.funcTypename} ${(it.name as StackEntryName.Const).value}" })
            sb.append(") asm ")
            sb.append(asmFunction.body)
            sb.append(";\n")
        }

        val nonEntryFunctions = genCtx.functions.keys.filter {
            it.methodId != BigInteger("0") && it.methodId != BigInteger("-1")
        }
        for (function in nonEntryFunctions) {
            val sar = genCtx.functions[function]!!
            val args = function.upstreamStack.getUsedEntries().reversed()
                .joinToString(", ") { "${it.type.funcTypename} ${sar.stackEntryNameResolver(it.name)}" }
            val returnType = inferReturnType(function)
            val inlineRefSpec = if (function.isInlineRef) " inline_ref" else ""
            sb.append("$returnType ${function.name} ($args)$inlineRefSpec;\n")
        }
        if (nonEntryFunctions.isNotEmpty()) sb.append("\n")

        for (function in genCtx.functions) {
            printFunction(sb, registry, function.key, function.value)
            sb.append("\n\n")
        }

        return sb.toString()
    }

    private fun returnTypeName(type: TvmStackEntryType): String {
        return if (type == TvmStackEntryType.UNKNOWN) "_" else type.funcTypename
    }

    private fun inferReturnType(function: IRNode.Function): String {
        val returnStmt = function.codeBlock.entries.lastOrNull()
        if (returnStmt is FunctionReturnStatement) {
            val reversed = returnStmt.variables.reversed()
            return when (reversed.size) {
                0 -> "()"
                1 -> returnTypeName(reversed[0].entry.type)
                else -> "(${reversed.joinToString(", ") { returnTypeName(it.entry.type) }})"
            }
        }
        return "()"
    }

    private val ENTRY_POINT_IDS = setOf(BigInteger("0"), BigInteger("-1"))

    private fun printFunction(
        sb: StringBuilder,
        registry: LeafPrinterRegistry,
        function: IRNode.Function,
        sar: FunctionGenerationContext
    ) {
        val args = function.upstreamStack.getUsedEntries().reversed()
            .joinToString(", ") { "${it.type.funcTypename} ${sar.stackEntryNameResolver(it.name)}" }

        val returnType = inferReturnType(function)
        val methodIdStr = if (function.isInlineRef) "" else " method_id(${function.methodId})"
        val inlineRefStr = if (function.isInlineRef) " inline_ref" else ""

        sb.append("$returnType ${function.name} ($args) impure$inlineRefStr$methodIdStr {\n")
        registry.get(function.codeBlock.javaClass).print(
            LeafPrinterContext(
                sb,
                registry,
                sar,
                0
            ),
            function.codeBlock
        )
        sb.append("}")
    }
}

class CodeBlockPrinter : LeafNodePrinter<CodeBlock>(CodeBlock::class.java) {
    override fun print(ctx: LeafPrinterContext, node: CodeBlock) {
        val singleLine = isSingleLine(ctx, node)

        val context: (() -> Unit) -> Unit = if (singleLine) {
            { block ->
                block()
            }
        } else {
            { block ->
                ctx.indented {
                    block()
                }
            }
        }

        context {
            for ((idx, entry) in node.entries.withIndex()) {
                if (ctx.skip(entry)) {
                    continue
                }
                if (!singleLine) {
                    ctx.append(ctx.indent())
                }
                ctx.print(entry)

                if (!(node.isExpression && idx == node.entries.size - 1) && isStatement(entry)) {
                    ctx.append(";")
                }
                if (!singleLine) {
                    ctx.append("\n")
                }
            }
        }
    }
}

class VariableUsagePrinter : LeafNodePrinter<VariableUsage>(VariableUsage::class.java) {
    override fun print(ctx: LeafPrinterContext, node: VariableUsage) {
        getInlinedDeclaredElement(node, ctx)?.let {
            ctx.print(it)
            return
        }
        ctx.append(ctx.sar.stackEntryNameResolver(node.entry.name))
    }
}

fun getInlinedDeclaredElement(node: VariableUsage, ctx: LeafPrinterContext): IRNode? {
    if (ctx.sar.stackEntrySources.containsKey(node.entry)) {
        val declaringElements = ctx.sar.stackEntrySources[node.entry]
        if (declaringElements != null && declaringElements.size == 1) {
            val declaringElement = declaringElements.single()
            val fullDeclaration = ctx.sar.stackEntryProducts[declaringElement]
            if (node.tracked && fullDeclaration?.let { isInlined(it, ctx) } == true) {
                return declaringElement
            }
        }
    }
    return null
}

class VariableDeclarationPrinter : LeafNodePrinter<VariableDeclaration>(VariableDeclaration::class.java) {
    override fun skip(ctx: LeafPrinterContext, node: VariableDeclaration): Boolean {
        return isInlined(node, ctx)
    }

    override fun print(ctx: LeafPrinterContext, node: VariableDeclaration) {
        if (isInlined(node, ctx)) {
            return
        }

        print0(ctx, node)
    }

    private fun print0(ctx: LeafPrinterContext, node: VariableDeclaration) {
        val entriesJoined = node.entries.joinToString(", ") { entry ->
            when (ctx.sar.stackEntryUsage.getOrDefault(entry, 0)) {
                0 -> "_"
                else -> if (node.reassignment) {
                    ctx.sar.stackEntryNameResolver(entry.name)
                } else {
                    "${entry.type.funcTypename} ${ctx.sar.stackEntryNameResolver(entry.name)}"
                }
            }
        }

        when {
            node.entries.isEmpty() -> {
                ctx.print(node.value)
            }

            node.untuple -> {
                ctx.append("[$entriesJoined] = ")
                ctx.print(node.value)
            }

            node.entries.size == 1 -> {
                ctx.append("$entriesJoined = ")
                ctx.print(node.value)
            }

            else -> {
                ctx.append("($entriesJoined) = ")
                ctx.print(node.value)
            }
        }
    }
}

private fun isInlined(node: VariableDeclaration, ctx: LeafPrinterContext): Boolean {
    val actual = node.entries.size == 1 && node.entries.all {
        val source = ctx.sar.stackEntrySources[it]!!.singleOrNull() ?: return@all false

        if (source is IntLiteral) {
            return@all true
        }

        if (!ctx.sar.loopScopes.declaredAndUsedInSameScope(it)) {
            return@all false
        }

        ctx.sar.stackEntryUsage.getOrDefault(
            it,
            0
        ) == 1
    }

    return actual
}

class IntLiteralPrinter : LeafNodePrinter<IntLiteral>(IntLiteral::class.java) {
    override fun print(ctx: LeafPrinterContext, node: IntLiteral) {
        ctx.append(node.literal.toString())
    }
}

class SliceLiteralPrinter : LeafNodePrinter<SliceLiteral>(SliceLiteral::class.java) {
    override fun print(ctx: LeafPrinterContext, node: SliceLiteral) {
        ctx.append("/* slice literal: ${Literals.cellLiteral(node.slice)} */")
    }
}

class SliceConstRefPrinter : LeafNodePrinter<SliceConstRef>(SliceConstRef::class.java) {
    override fun print(ctx: LeafPrinterContext, node: SliceConstRef) {
        ctx.append(node.name)
    }
}

class CommentPrinter : LeafNodePrinter<Comment>(Comment::class.java) {
    override fun print(ctx: LeafPrinterContext, node: Comment) {
        val lines = node.comment.lines()
        val head = lines.first()
        val tail = lines.drop(1)
        ctx.append(";; $head")
        for (s in tail) {
            ctx.append("\n")
            ctx.append(ctx.indent())
            ctx.append(";; $s")
        }
    }
}

class FunctionReturnStatementPrinter : LeafNodePrinter<FunctionReturnStatement>(FunctionReturnStatement::class.java) {
    override fun print(ctx: LeafPrinterContext, node: FunctionReturnStatement) {
        val reversed = node.variables.reversed()
        ctx.append("return (")
        for ((idx, variable) in reversed.withIndex()) {
            if (idx != 0) {
                ctx.append(", ")
            }
            ctx.print(variable)
        }
        ctx.append(")")
    }
}

class FunctionCallPrinter : LeafNodePrinter<FunctionCall>(FunctionCall::class.java) {
    override fun print(ctx: LeafPrinterContext, node: FunctionCall) {
        when {
            node.name.startsWith("_")
                    && node.name.endsWith("_")
                    && node.args.size == 2 -> {
                // infix
                ctx.append("(")
                ctx.print(node.args[0])
                ctx.append(" ")
                ctx.append(node.name.removePrefix("_").removeSuffix("_"))
                ctx.append(" ")
                ctx.print(node.args[1])
                ctx.append(")")
            }

            node.name.endsWith("_")
                    && !node.name.startsWith("_")
                    && node.args.size == 1 -> {
                // prefix
                ctx.append("(")
                ctx.append(node.name.removeSuffix("_"))
                ctx.append(" ")
                ctx.print(node.args[0])
                ctx.append(")")
            }

            node.args.isEmpty() -> {
                ctx.append(node.name)
                ctx.append("()")
            }
            // TODO
            (node.name.startsWith("store_") || node.name.startsWith("load_") || node.name.startsWith("end_") ||
                    node.name.startsWith("slice_") || node.name.startsWith("begin_") || node.name.startsWith("parse_")
                    || node.name.startsWith("skip_") || node.name.startsWith("preload_") || node.name.startsWith("hash_")) -> {

                val src = node.args[0]
                var multiline = false

                if (src is VariableUsage) {
                    val declaringElement = getInlinedDeclaredElement(src, ctx)
                    if (declaringElement != null) {
                        multiline = true
                    }
                }

                val context: ((() -> Unit) -> Unit) = if (multiline) {
                    { block ->
                        ctx.indented {
                            block()
                        }
                    }
                } else {
                    { block -> block() }
                }

                ctx.print(src)
                context {
                    if (multiline) {
                        ctx.append("\n")
                    }
                    if (multiline) {
                        ctx.append(ctx.indent())
                    }
                    ctx.append(".")
                    ctx.append(node.name)
                    ctx.append("(")
                    for ((idx, arg) in node.args.drop(1).withIndex()) {
                        if (idx != 0) {
                            ctx.append(", ")
                        }
                        ctx.print(arg)
                    }
                    ctx.append(")")
                }
            }

            else -> {
                // INDEXVAR also returns cells/slices/tuples in heterogeneous opaque tuples.
                // FunC's generic builtin keeps the same opcode selection as int_at while
                // letting the consuming operation infer the actual stack-slot type.
                ctx.append(if (node.name == "int_at") "at" else node.name)
                ctx.append("(")
                for ((idx, arg) in node.args.withIndex()) {
                    if (idx != 0) {
                        ctx.append(", ")
                    }
                    ctx.print(arg)
                }
                ctx.append(")")
            }
        }
    }
}

class WhileLoopPrinter : LeafNodePrinter<WhileLoop>(WhileLoop::class.java) {
    override fun print(ctx: LeafPrinterContext, node: WhileLoop) {
        ctx.append("while ")
        if (!isSingleLine(ctx, node.condCodeBlock!!)) {
            ctx.append("\n")
        }
        ctx.print(node.condCodeBlock!!)
        if (!isSingleLine(ctx, node.condCodeBlock!!)) {
            ctx.append(ctx.indent())
        }
        ctx.append(" {\n")
        node.bodyCodeBlock?.let { ctx.print(it) }
        ctx.append(ctx.indent())
        ctx.append("}")
    }

}

class RepeatLoopPrinter : LeafNodePrinter<RepeatLoop>(RepeatLoop::class.java) {
    override fun print(ctx: LeafPrinterContext, node: RepeatLoop) {
        ctx.append("repeat (")
        ctx.print(node.countExpression)
        ctx.append(") {\n")
        ctx.print(node.bodyCodeBlock)
        ctx.append(ctx.indent())
        ctx.append("}")
    }
}

class UntilLoopPrinter : LeafNodePrinter<UntilLoop>(UntilLoop::class.java) {
    override fun print(ctx: LeafPrinterContext, node: UntilLoop) {
        ctx.append("do {\n")
        ctx.print(node.bodyCodeBlock)
        ctx.append(ctx.indent())
        ctx.append("} until ")
        ctx.print(node.condition)
        ctx.append("")
    }
}

class IfElsePrinter : LeafNodePrinter<IfElse>(IfElse::class.java) {
    override fun print(ctx: LeafPrinterContext, node: IfElse) {
        val ifHasContent = hasPrintableContent(ctx, node.ifCodeBlock)
        val elseHasContent = hasPrintableContent(ctx, node.elseCodeBlock)

        val flip = !ifHasContent && elseHasContent
        val ifnot = node.ifnot != flip
        val body = if (flip) node.elseCodeBlock else node.ifCodeBlock
        val trailingElse = if (flip) null else node.elseCodeBlock?.takeIf { elseHasContent }

        ctx.append("${if (ifnot) "ifnot" else "if"} ")
        if (!isSingleLine(ctx, node.condCodeBlock)) {
            ctx.append("\n")
        }
        ctx.print(node.condCodeBlock)
        if (!isSingleLine(ctx, node.condCodeBlock)) {
            ctx.append(ctx.indent())
        }
        ctx.append(" {\n")
        body?.let { ctx.print(it) }
        ctx.append(ctx.indent())
        trailingElse?.let {
            ctx.append("} else {\n")
            ctx.print(it)
            ctx.append(ctx.indent())
        }
        ctx.append("}")
    }

}

private fun hasPrintableContent(ctx: LeafPrinterContext, block: CodeBlock?): Boolean =
    block != null && block.entries.any { !ctx.skip(it) }

class GlobalWritePrinter : LeafNodePrinter<GlobalWrite>(GlobalWrite::class.java) {
    override fun print(ctx: LeafPrinterContext, node: GlobalWrite) {
        ctx.append("__global_${node.number} = ")
        ctx.print(node.value)
    }
}

class GlobalReadPrinter : LeafNodePrinter<GlobalRead>(GlobalRead::class.java) {
    override fun print(ctx: LeafPrinterContext, node: GlobalRead) {
        ctx.append("__global_${node.number}")
    }

}

fun isSingleLine(ctx: LeafPrinterContext, node: CodeBlock): Boolean {
    return node.isExpression && node.entries.count { !ctx.skip(it) } == 1
}

fun isStatement(node: IRNode): Boolean {
    return when (node) {
        is IfElse, is WhileLoop, is RepeatLoop, is Comment -> false
        else -> true
    }
}
