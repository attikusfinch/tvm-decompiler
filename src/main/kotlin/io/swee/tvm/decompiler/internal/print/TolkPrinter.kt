package io.swee.tvm.decompiler.internal.print

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNode.*
import io.swee.tvm.decompiler.internal.ir.IRNodeVisitor
import java.math.BigInteger

/** Emits Tolk directly from the shared IR. Compatibility helpers retain TVM stack layouts. */
class TolkPrinter(private val options: DecompilerOptions, stdlib: String, builtin: String) {
    data class Output(val main: String, val support: String)
    private data class Primitive(val args: List<Pair<String, String>>, val returns: String, val asm: String)
    private val primitives = (builtin + "\n" + stdlib).lineSequence().mapNotNull(::parsePrimitive).toMap()
    private val used = linkedSetOf<String>()
    private val untuples = sortedSetOf<Int>()
    private val raw = linkedMapOf<String, AsmFunction>()
    private lateinit var context: FunctionGenerationContext
    private val output = StringBuilder()
    private var indentation = 0
    private var temporary = 0
    private var returnTypes = emptyList<String>()

    private fun parsePrimitive(line: String): Pair<String, Primitive>? {
        val match = Regex("^(?:forall\\s+(.+?)\\s*->\\s*)?(.+?)\\s+([^\\s()]+)\\s*\\((.*?)\\)\\s*(?:impure\\s*)?asm(.*);$").matchEntire(line.trim()) ?: return null
        val (_, returns, name, args, asm) = match.destructured
        if (name.startsWith("~") && name != "~_") return null
        val arguments = if (args.isBlank()) emptyList() else splitArguments(args).map {
            val argument = Regex("^(.+)\\s+(\\w+)$").matchEntire(it.trim()) ?: return null
            argument.groupValues[2] to primitiveType(argument.groupValues[1])
        }
        return name to Primitive(arguments, primitiveType(returns), asm.trim())
    }

    private fun splitArguments(value: String): List<String> {
        var depth = 0
        var start = 0
        val result = mutableListOf<String>()
        value.forEachIndexed { index, char ->
            if (char == '[' || char == '(') depth++
            if (char == ']' || char == ')') depth--
            if (char == ',' && depth == 0) { result += value.substring(start, index); start = index + 1 }
        }
        result += value.substring(start)
        return result
    }

    private fun assembly(value: String) = value.replace(Regex("\\b(LSHIFT|RSHIFT|RSHIFTR|RSHIFTC)_VAR\\b"), "$1")

    private fun primitiveType(value: String): String = when (value.trim()) {
        "()" -> "void"
        "cont" -> "continuation"
        else -> value.trim().replace(Regex("\\b[A-Z]\\w*\\b"), "unknown")
    }

    private fun type(value: TvmStackEntryType): String = when (value) {
        TvmStackEntryType.UNKNOWN -> "unknown"
        TvmStackEntryType.CONTINUATION -> "continuation"
        is TvmStackEntryType.TUPLE -> if (value.elements.isEmpty()) "tuple" else value.elements.joinToString(", ", "[", "]", transform = ::type)
        else -> value.typename
    }

    private fun name(value: String): String = when (value) {
        "recv_internal" -> "onInternalMessage"
        "recv_external" -> "onExternalMessage"
        else -> value
    }

    private fun helper(value: String): String = "__tvm_" + when (value) {
        "_+_" -> "add"; "_-_" -> "subtract"; "_*_" -> "multiply"
        "_/_" -> "divide"; "_~/_" -> "round_divide"; "_^/_" -> "ceil_divide"
        "_%_" -> "modulo"; "_==_" -> "equal"; "_!=_" -> "not_equal"
        "_<_" -> "less"; "_>_" -> "greater"; "_<=_" -> "less_equal"; "_>=_" -> "greater_equal"
        "_&_" -> "bit_and"; "_|_" -> "bit_or"; "_^_" -> "bit_xor"
        "_<<_" -> "shift_left"; "_>>_" -> "shift_right"; "-_" -> "negate"; "~_" -> "bit_not"
        else -> value.map { if (it.isLetterOrDigit() || it == '_') it.toString() else "_x${it.code.toString(16)}_" }.joinToString("")
    }

    private fun variable(entry: StackEntry) = context.stackEntryNameResolver(entry.name)
    private fun line(value: String = "") { output.append("    ".repeat(indentation)).append(value).append('\n') }
    private fun cast(expression: String, target: String) = "($expression as unknown as $target)"
    private fun signature(types: List<String>) = when (types.size) {
        0 -> "void"; 1 -> types.single(); else -> types.joinToString(", ", "(", ")")
    }

    fun print(root: Root): Output {
        // FunC slice constants have different syntax from Tolk. Exact slice helpers preserve all bits/refs.
        val generation = analyze(root, options.copy(exact = true))
        generation.node.asmFunctions.forEach { raw[it.name] = it }
        line("// Decompiled TVM code. Source names and storage schemas were not present in the BOC.")
        line("import \"stdlib\"")
        line()
        for ((function, analysis) in generation.functions) {
            context = analysis
            temporary = 0
            if (function.isInlineRef) line("@inline_ref")
            if (function.methodId != BigInteger.ZERO && function.methodId != BigInteger.valueOf(-1)) line("@method_id(${function.methodId})")
            val args = function.upstreamStack.getUsedEntries().reversed().joinToString(", ") { "${variable(it)}: ${type(it.type)}" }
            val returns = (function.codeBlock.entries.lastOrNull() as? FunctionReturnStatement)?.variables?.reversed()?.map { type(it.entry.type) } ?: emptyList()
            returnTypes = returns
            line("fun ${name(function.name)}($args): ${signature(returns)} {")
            indentation++
            block(function.codeBlock)
            indentation--
            line("}")
            line()
        }
        val support = buildString {
            append("// TVM compatibility primitives used by this decompilation.\n")
            for (fn in used) {
                val primitive = primitives[fn] ?: error("No Tolk primitive for $fn")
                append("fun ${helper(fn)}(${primitive.args.joinToString(", ") { "${it.first}: ${it.second}" }}): ${primitive.returns}\n    asm ${assembly(primitive.asm)}\n\n")
            }
            for (fn in raw.values) {
                val args = fn.args.joinToString(", ") { "${(it.name as StackEntryName.Const).value}: ${type(it.type)}" }
                append("fun ${fn.name}($args): ${signature(fn.returnType.map { type(it.type) })}\n    asm ${assembly(fn.body)}\n\n")
            }
            for (arity in untuples) append("fun __tvm_untuple_$arity(value: tuple): ${signature(List(arity) { "unknown" })}\n    asm \"$arity UNTUPLE\"\n\n")
            for (number in generation.globalVariableTypes.keys.sorted()) {
                append("fun __tvm_get_global_$number(): unknown\n    asm \"$number GETGLOB\"\n\n")
                append("fun __tvm_set_global_$number(value: unknown): void\n    asm \"$number SETGLOB\"\n\n")
            }
        }
        return Output(output.toString(), support)
    }

    private fun expression(node: IRNode): String = when (node) {
        is IntLiteral -> node.literal.toString()
        is VariableUsage -> variable(node.entry)
        is GlobalRead -> "__tvm_get_global_${node.number}()"
        is FunctionCall -> {
            val primitive = primitives[node.name]
            val asm = raw[node.name]
            val target = when {
                primitive != null -> { used += node.name; helper(node.name) }
                else -> name(node.name)
            }
            val argumentTypes = primitive?.args?.map { it.second } ?: asm?.args?.map { type(it.type) }
            if (argumentTypes != null) check(argumentTypes.size == node.args.size) { "Argument count mismatch for ${node.name}" }
            "$target(${node.args.mapIndexed { index, arg -> argumentTypes?.get(index)?.let { cast(expression(arg), it) } ?: expression(arg) }.joinToString(", ")})"
        }
        is CodeBlock -> expression(node.entries.last())
        else -> error("No Tolk expression for ${node.javaClass.simpleName}")
    }

    private fun condition(node: CodeBlock): String {
        check(node.isExpression && node.entries.isNotEmpty()) { "Expected an IR condition expression" }
        node.entries.dropLast(1).forEach(::statement)
        return "(${expression(node.entries.last())}) != 0"
    }

    private fun block(node: CodeBlock) = node.entries.forEach(::statement)

    private fun declaration(node: VariableDeclaration, assignment: Boolean = node.reassignment) {
        val value = if (node.untuple) {
            untuples += node.entries.size
            "__tvm_untuple_${node.entries.size}(${cast(expression(node.value), "tuple")})"
        } else expression(node.value)
        if (node.entries.isEmpty()) line("$value;")
        else if (node.entries.size == 1) {
            val entry = node.entries.single()
            val left = if (assignment) variable(entry) else "var ${variable(entry)}: ${type(entry.type)}"
            line("$left = ${cast(value, type(entry.type))};")
        } else {
            val id = temporary++
            val temporaries = node.entries.indices.map { "__result_${id}_$it" }
            line("var (${temporaries.joinToString(", ")}) = $value;")
            node.entries.forEachIndexed { index, entry ->
                val left = if (assignment) variable(entry) else "var ${variable(entry)}: ${type(entry.type)}"
                line("$left = ${cast(temporaries[index], type(entry.type))};")
            }
        }
    }

    private fun statement(node: IRNode) {
        when (node) {
            is VariableDeclaration -> declaration(node)
            is FunctionReturnStatement -> {
                val values = node.variables.reversed().mapIndexed { index, usage ->
                    val target = returnTypes.getOrNull(index) ?: type(usage.entry.type)
                    if (target == type(usage.entry.type)) variable(usage.entry) else cast(variable(usage.entry), target)
                }
                line(when (values.size) { 0 -> "return;"; 1 -> "return ${values.single()};"; else -> "return (${values.joinToString(", ")});" })
            }
            is IfElse -> {
                val test = condition(node.condCodeBlock)
                line("if (${if (node.ifnot) "!($test)" else test}) {")
                indentation++; node.ifCodeBlock?.let(::block); indentation--
                if (node.elseCodeBlock != null) {
                    line("} else {"); indentation++; block(node.elseCodeBlock); indentation--
                }
                line("}")
            }
            is WhileLoop -> {
                val condition = checkNotNull(node.condCodeBlock)
                val test = condition(condition)
                line("while ($test) {"); indentation++
                node.bodyCodeBlock?.let(::block)
                // Re-evaluate the condition prefix; its variables were declared before the loop.
                condition.entries.dropLast(1).forEach { if (it is VariableDeclaration) declaration(it, true) else statement(it) }
                indentation--; line("}")
            }
            is RepeatLoop -> {
                line("repeat (${expression(node.countExpression)}) {")
                indentation++; block(node.bodyCodeBlock); indentation--; line("}")
            }
            is UntilLoop -> {
                val flag = "__until_${temporary++}"
                line("var $flag: int = 0;")
                line("do {"); indentation++; block(node.bodyCodeBlock)
                val value = if (node.condition is CodeBlock) {
                    node.condition.entries.dropLast(1).forEach(::statement)
                    expression(node.condition.entries.last())
                } else expression(node.condition)
                line("$flag = ${cast(value, "int")};")
                indentation--; line("} while ($flag == 0);")
            }
            is GlobalWrite -> line("__tvm_set_global_${node.number}(${cast(expression(node.value), "unknown")});")
            is Comment -> node.comment.lines().forEach { line("// $it") }
            is CodeBlock -> block(node)
            else -> line("${expression(node)};")
        }
    }
}
