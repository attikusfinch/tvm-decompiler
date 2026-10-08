package io.swee.tvm.decompiler.internal.print

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNode.*
import java.math.BigInteger

/** Emits Tolk directly from the shared IR. Compatibility helpers retain TVM stack layouts. */
class TolkPrinter(private val options: DecompilerOptions, stdlib: String, builtin: String) {
    data class Output(val main: String, val support: String)
    private data class Primitive(val args: List<Pair<String, String>>, val returns: String, val asm: String)
    private val primitives = (builtin + "\n" + stdlib).lineSequence().mapNotNull(::parsePrimitive).toMap()
    private val used = linkedSetOf<String>()
    private val untuples = sortedSetOf<Int>()
    private val raw = linkedMapOf<String, AsmFunction>()
    private val usedRaw = linkedSetOf<String>()
    private val functions = linkedMapOf<String, IRNode.Function>()
    private lateinit var context: FunctionGenerationContext
    private lateinit var presentation: TolkPresentation
    private val output = StringBuilder()
    private var indentation = 0
    private var temporary = 0
    private var returnTypes = emptyList<String>()
    private data class Expression(val code: String, val type: String)

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

    private fun helper(value: String): String = when (value) {
        "begins_with" -> "matchPrefix"
        "load_std_addr" -> "readStdAddress"
        "_+_" -> "add"; "_-_" -> "subtract"; "_*_" -> "multiply"
        "_/_" -> "divide"; "_~/_" -> "round_divide"; "_^/_" -> "ceil_divide"
        "_%_" -> "modulo"; "_==_" -> "equal"; "_!=_" -> "not_equal"
        "_<_" -> "less"; "_>_" -> "greater"; "_<=_" -> "less_equal"; "_>=_" -> "greater_equal"
        "_&_" -> "bit_and"; "_|_" -> "bit_or"; "_^_" -> "bit_xor"
        "_<<_" -> "shift_left"; "_>>_" -> "shift_right"; "-_" -> "negate"; "~_" -> "bit_not"
        else -> "tvm" + value.split('_').joinToString("") { word ->
            word.map { if (it.isLetterOrDigit()) it.toString() else "_x${it.code.toString(16)}_" }
                .joinToString("").replaceFirstChar(Char::uppercaseChar)
        }
    }

    private fun rawName(value: String) = when (value) {
        "asm_INMSGPARAM_1" -> "incomingMessageIsBounced"
        "asm_INMSGPARAM_2" -> "incomingMessageSender"
        else -> raw[value]?.body?.let {
            Regex("^\"x\\{([0-9A-Fa-f]+)} SDBEGINSQ\"$").matchEntire(it)?.groupValues?.get(1)
        }?.let { "matchPrefix_${it.length * 4}_${it.uppercase()}" } ?: value
    }
    private fun variable(entry: StackEntry) = presentation.name(entry)
    private fun line(value: String = "") { output.append("    ".repeat(indentation)).append(value).append('\n') }
    private fun cast(expression: Expression, target: String): String = when {
        expression.type == target -> expression.code
        target == "unknown" -> "(${expression.code} as unknown)"
        expression.type == "unknown" -> "(${expression.code} as $target)"
        expression.type == "bool" && target == "int" -> "(${expression.code} as int)"
        setOf(expression.type, target) == setOf("address", "slice") -> "(${expression.code} as $target)"
        else -> "(${expression.code} as unknown as $target)"
    }
    private fun returns(function: IRNode.Function) = (function.codeBlock.entries.lastOrNull() as? FunctionReturnStatement)
        ?.variables?.reversed()?.map { type(it.entry.type) } ?: emptyList()
    private fun signature(types: List<String>) = when (types.size) {
        0 -> "void"; 1 -> types.single(); else -> types.joinToString(", ", "(", ")")
    }

    fun print(root: Root): Output {
        // FunC slice constants have different syntax from Tolk. Exact slice helpers preserve all bits/refs.
        val generation = analyze(root, options.copy(exact = true))
        generation.node.asmFunctions.forEach { raw[it.name] = it }
        generation.functions.keys.forEach { functions[it.name] = it }
        line("// Decompiled TVM code. Source names and storage schemas were not present in the BOC.")
        line("import \"stdlib\"")
        line()
        for ((function, analysis) in generation.functions) {
            context = analysis
            presentation = TolkPresentation(function, analysis)
            temporary = 0
            if (function.isInlineRef) line("@inline_ref")
            if (function.methodId != BigInteger.ZERO && function.methodId != BigInteger.valueOf(-1)) line("@method_id(${function.methodId})")
            val args = function.upstreamStack.getUsedEntries().reversed().joinToString(", ") { "${variable(it)}: ${type(it.type)}" }
            val returns = returns(function)
            returnTypes = returns
            line("fun ${name(function.name)}($args): ${signature(returns)} {")
            indentation++
            val statements = function.codeBlock.entries
            val last = statements.lastOrNull() as? FunctionReturnStatement
            (if (last?.variables?.isEmpty() == true) statements.dropLast(1) else statements).forEach(::statement)
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
            for (fn in raw.values.filter { it.name in usedRaw }) {
                val args = fn.args.joinToString(", ") { "${(it.name as StackEntryName.Const).value}: ${type(it.type)}" }
                append("fun ${rawName(fn.name)}($args): ${signature(fn.returnType.map { type(it.type) })}\n    asm ${assembly(fn.body)}\n\n")
            }
            for (arity in untuples) append("fun __tvm_untuple_$arity(value: tuple): ${signature(List(arity) { "unknown" })}\n    asm \"$arity UNTUPLE\"\n\n")
            for (number in generation.globalVariableTypes.keys.sorted()) {
                append("fun __tvm_get_global_$number(): unknown\n    asm \"$number GETGLOB\"\n\n")
                append("fun __tvm_set_global_$number(value: unknown): void\n    asm \"$number SETGLOB\"\n\n")
            }
        }
        return Output(output.toString(), support)
    }

    private fun expression(node: IRNode): Expression = when (node) {
        is IntLiteral -> Expression(node.literal.toString(), "int")
        is VariableUsage -> presentation.inline[node.entry]?.let(::expression) ?: Expression(variable(node.entry), type(node.entry.type))
        is GlobalRead -> Expression("__tvm_get_global_${node.number}()", "unknown")
        is FunctionCall -> call(node)
        is CodeBlock -> expression(node.entries.last())
        else -> error("No Tolk expression for ${node.javaClass.simpleName}")
    }

    private fun call(node: FunctionCall): Expression {
            val args = node.args.map(::expression)
            val operators = mapOf("_+_" to "+", "_-_" to "-", "_*_" to "*", "_/_" to "/", "_%_" to "%",
                "_<<_" to "<<", "_>>_" to ">>", "_&_" to "&", "_|_" to "|", "_^_" to "^",
                "_==_" to "==", "_!=_" to "!=", "_<_" to "<", "_>_" to ">", "_<=_" to "<=", "_>=_" to ">=")
            operators[node.name]?.let { operator ->
                val boolean = operator in setOf("==", "!=", "<", ">", "<=", ">=")
                return Expression("(${cast(args[0], "int")} $operator ${cast(args[1], "int")})", if (boolean) "bool" else "int")
            }
            if (node.name in setOf("-_", "~_")) return Expression("(${node.name[0]}${cast(args.single(), "int")})", "int")
            when (node.name) {
                "get_data" -> return Expression("contract.getData()", "cell")
                "set_data" -> return Expression("contract.setData(${cast(args.single(), "cell")})", "void")
                "begin_cell" -> return Expression("beginCell()", "builder")
                "begin_parse" -> return Expression("${cast(args.single(), "cell")}.beginParse()", "slice")
                "end_cell" -> return Expression("${cast(args.single(), "builder")}.endCell()", "cell")
                "slice_empty?" -> return Expression("${cast(args.single(), "slice")}.isEmpty()", "bool")
                "slice_bits" -> return Expression("${cast(args.single(), "slice")}.remainingBitsCount()", "int")
                "slice_refs" -> return Expression("${cast(args.single(), "slice")}.remainingRefsCount()", "int")
                "equal_slices" -> return Expression("${cast(args[0], "slice")}.bitsEqual(${cast(args[1], "slice")})", "bool")
                "preload_uint" -> return Expression("${cast(args[0], "slice")}.preloadUint(${cast(args[1], "int")})", "int")
                "preload_int" -> return Expression("${cast(args[0], "slice")}.preloadInt(${cast(args[1], "int")})", "int")
                "preload_ref" -> return Expression("${cast(args.single(), "slice")}.preloadRef()", "cell")
                "cell_hash" -> return Expression("${cast(args.single(), "cell")}.hash()", "int")
                "now" -> return Expression("blockchain.now()", "int")
            }
            val builderMethods = mapOf("store_uint" to "storeUint", "store_int" to "storeInt", "store_ref" to "storeRef",
                "store_slice" to "storeSlice", "store_slice_direct" to "storeSlice", "store_builder" to "storeBuilder",
                "store_coins" to "storeCoins", "store_std_addr" to "storeAddress")
            builderMethods[node.name]?.let { method ->
                if (consumable(node.args.first())) {
                    val argumentTypes = primitives[node.name]?.args?.map { it.second } ?: return@let
                    val remaining = args.drop(1).mapIndexed { index, arg ->
                        cast(arg, if (node.name == "store_std_addr") "address" else argumentTypes[index + 1])
                    }
                    return Expression("${cast(args[0], "builder")}.$method(${remaining.joinToString(", ")})", "builder")
                }
            }
            val primitive = primitives[node.name]
            val asm = raw[node.name]
            if (node.name.startsWith("__slice_")) {
                // hexToSlice accepts complete nibbles. Odd-bit slices and references stay in exact asm helpers.
                Regex("^\"x\\{([0-9A-Fa-f]*)} PUSHSLICE\"$").matchEntire(asm?.body ?: "")?.let {
                    return Expression("\"${it.groupValues[1]}\".hexToSlice()", "slice")
                }
            }
            val target = when {
                primitive != null -> { used += node.name; helper(node.name) }
                asm != null -> { usedRaw += node.name; rawName(node.name) }
                else -> name(node.name)
            }
            val argumentTypes = primitive?.args?.map { it.second } ?: asm?.args?.map { type(it.type) }
                ?: functions[node.name]?.upstreamStack?.getUsedEntries()?.reversed()?.map { type(it.type) }
            if (argumentTypes != null) check(argumentTypes.size == node.args.size) { "Argument count mismatch for ${node.name}" }
            val resultType = primitive?.returns ?: asm?.returnType?.map { type(it.type) }?.let(::signature)
                ?: functions[node.name]?.let { signature(returns(it)) } ?: "unknown"
            return Expression("$target(${args.mapIndexed { index, arg -> argumentTypes?.get(index)?.let { cast(arg, it) } ?: arg.code }.joinToString(", ")})", resultType)
    }

    private fun condition(node: CodeBlock): String {
        check(node.isExpression && node.entries.isNotEmpty()) { "Expected an IR condition expression" }
        node.entries.dropLast(1).forEach(::statement)
        return truth(expression(node.entries.last()))
    }

    private fun truth(value: Expression) = if (value.type == "bool") value.code else "${value.code} != 0"

    private fun block(node: CodeBlock) = node.entries.forEach(::statement)

    private fun declaration(node: VariableDeclaration, assignment: Boolean = node.reassignment) {
        if (node.entries.singleOrNull()?.let { it in presentation.inline } == true) return
        val call = node.value as? FunctionCall
        if (node.entries.isEmpty() && call != null && assertion(call)) return
        if (!assignment && nativeLoad(node)) return
        val value = if (node.untuple) {
            untuples += node.entries.size
            Expression("__tvm_untuple_${node.entries.size}(${cast(expression(node.value), "tuple")})", signature(List(node.entries.size) { "unknown" }))
        } else expression(node.value)
        if (node.entries.isEmpty()) line("${value.code};")
        else if (node.entries.size == 1) {
            val entry = node.entries.single()
            val keyword = if (entry in presentation.mutable || entry in presentation.receivers) "var" else "val"
            val left = if (assignment) variable(entry) else "$keyword ${variable(entry)}"
            line("$left = ${cast(value, type(entry.type))};")
        } else {
            val resultTypes = if (value.type.startsWith("(")) splitArguments(value.type.drop(1).dropLast(1)) else emptyList()
            if (!assignment && resultTypes.size == node.entries.size && node.entries.zip(resultTypes).all { type(it.first.type) == it.second.trim() }) {
                line("var (${node.entries.joinToString(", ") { if (context.stackEntryUsage.getOrDefault(it, 0) == 0) "_" else variable(it) }}) = ${value.code};")
                return
            }
            val id = temporary++
            val temporaries = node.entries.indices.map { "__result_${id}_$it" }
            line("var (${temporaries.joinToString(", ")}) = ${value.code};")
            node.entries.forEachIndexed { index, entry ->
                val left = if (assignment) variable(entry) else "var ${variable(entry)}: ${type(entry.type)}"
                line("$left = ${cast(Expression(temporaries[index], resultTypes.getOrElse(index) { "unknown" }), type(entry.type))};")
            }
        }
    }

    /** A mutating Tolk method must not overwrite a still-live IR snapshot of its receiver. */
    private fun consumable(node: IRNode): Boolean = when (node) {
        is VariableUsage -> presentation.inline[node.entry]?.let(::consumable)
            ?: (context.stackEntryUsage[node.entry] == 1 && context.loopScopes.declaredAndUsedInSameScope(node.entry))
        is FunctionCall -> true
        else -> false
    }

    private fun nativeLoad(node: VariableDeclaration): Boolean {
        if (node.untuple || node.entries.size != 2) return false
        val call = node.value as? FunctionCall ?: return false
        val method = when (call.name) {
            "load_std_addr" -> "loadAddress"
            "load_ref" -> "loadRef"
            "load_coins" -> "loadCoins"
            "load_bits" -> "loadBits"
            else -> return false
        }
        val valueIndex = if (call.name == "load_std_addr") 0 else 1
        val valueEntry = node.entries[valueIndex]
        val tailEntry = node.entries[1 - valueIndex]
        val valueUsed = context.stackEntryUsage.getOrDefault(valueEntry, 0) > 0
        val tailUsed = context.stackEntryUsage.getOrDefault(tailEntry, 0) > 0
        if (!valueUsed && !tailUsed) return false // Keep the effectful asm fallback, including validation exceptions.
        val input = expression(call.args.first())
        val receiver = if (tailUsed) {
            line("var ${variable(tailEntry)} = ${cast(input, "slice")};")
            variable(tailEntry)
        } else if (consumable(call.args.first())) cast(input, "slice") else {
            val cursor = "cursor${temporary++}"
            line("var $cursor = ${cast(input, "slice")};")
            cursor
        }
        val args = call.args.drop(1).joinToString(", ") { cast(expression(it), "int") }
        val valueType = if (call.name == "load_std_addr") "address" else type(valueEntry.type)
        val result = Expression("$receiver.$method($args)", valueType)
        if (valueUsed) {
            val keyword = if (valueEntry in presentation.mutable || valueEntry in presentation.receivers) "var" else "val"
            line("$keyword ${variable(valueEntry)} = ${cast(result, type(valueEntry.type))};")
        } else line("${result.code};")
        return true
    }

    private fun stableException(node: IRNode): Boolean = when (node) {
        is IntLiteral -> true
        is VariableUsage -> presentation.inline[node.entry]?.let(::stableException) ?: true
        else -> false
    }

    private fun assertion(call: FunctionCall): Boolean {
        if (call.name != "throw_unless" || !stableException(call.args[0])) return false
        line("assert (${truth(expression(call.args[1]))}) throw ${expression(call.args[0]).code};")
        return true
    }

    private fun statement(node: IRNode) {
        when (node) {
            is VariableDeclaration -> declaration(node)
            is FunctionReturnStatement -> {
                val values = node.variables.reversed().mapIndexed { index, usage ->
                    val target = returnTypes.getOrNull(index) ?: type(usage.entry.type)
                    cast(expression(usage), target)
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
                line("repeat (${expression(node.countExpression).code}) {")
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
            is FunctionCall -> if (!assertion(node)) line("${expression(node).code};")
            else -> line("${expression(node).code};")
        }
    }
}
