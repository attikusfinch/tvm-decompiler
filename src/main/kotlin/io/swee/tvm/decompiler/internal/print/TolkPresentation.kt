package io.swee.tvm.decompiler.internal.print

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import io.swee.tvm.decompiler.internal.ir.IRNode.*
import io.swee.tvm.decompiler.internal.ir.IRNodeVisitor

/** Calls only move into adjacent uses, across stable local reads, never across another evaluation. */
internal class TolkPresentation(function: IRNode.Function, private val context: FunctionGenerationContext) {
    val inline = mutableMapOf<StackEntry, IRNode>()
    val mutable = mutableSetOf<StackEntry>()
    val receivers = mutableSetOf<StackEntry>()
    private val names = mutableMapOf<StackEntryName, String>()
    private val usedNames = mutableSetOf<String>()
    private val hints = mutableMapOf<StackEntryName, String>()

    init {
        function.accept(object : IRNodeVisitor {
            override fun visit(node: WhileLoop) {
                // The printer repeats condition-prefix declarations as assignments at the loop tail.
                node.condCodeBlock?.entries?.dropLast(1)?.filterIsInstance<VariableDeclaration>()
                    ?.forEach { receivers += it.entries }
            }
            override fun visit(node: FunctionCall) {
                if (node.name.startsWith("store_") || node.name.startsWith("load_"))
                    (node.args.firstOrNull() as? VariableUsage)?.entry?.let { receivers += it }
            }
            override fun visit(node: VariableDeclaration) {
                if (node.reassignment) mutable += node.entries
                val call = node.value as? FunctionCall
                node.entries.forEachIndexed { index, entry ->
                    val hint = when (call?.name) {
                        "get_data" -> "data"
                        "begin_parse" -> "dataSlice"
                        "begin_cell" -> "builder"
                        "begins_with" -> if (index == 0) "bodyTail" else "matched"
                        "load_std_addr", "load_msg_addr" -> if (index == 0) "address" else "tail"
                        "load_bits" -> if (index == 0) "tail" else "bits"
                        "load_ref" -> if (index == 0) "tail" else "refCell"
                        "load_coins" -> if (index == 0) "tail" else "coins"
                        "asm_INMSGPARAM_1" -> "isBounced"
                        "asm_INMSGPARAM_2" -> "sender"
                        else -> if (call?.name?.startsWith("asm_SDBEGINSQ_") == true)
                            if (index == 0) "bodyTail" else "matched" else null
                    }
                    if (hint != null) hints.putIfAbsent(entry.name, hint)
                }
            }
        })
        function.accept(object : IRNodeVisitor {
            override fun visit(node: VariableDeclaration) {
                val entry = node.entries.singleOrNull() ?: return
                if (node.value is IntLiteral && context.stackEntrySources[entry]?.size == 1 && entry !in mutable) inline[entry] = node.value
            }
        })
        function.accept(object : IRNodeVisitor {
            override fun visit(node: CodeBlock) {
                for ((declaration, next) in node.entries.zipWithNext()) {
                    if (declaration !is VariableDeclaration || declaration.untuple) continue
                    val entry = declaration.entries.singleOrNull() ?: continue
                    if (entry !in mutable && context.stackEntrySources[entry]?.size == 1
                        && context.stackEntryUsage[entry] == 1 && context.loopScopes.declaredAndUsedInSameScope(entry)
                        && evaluationBefore(next, entry) == Evaluation.USE) inline[entry] = declaration.value
                }
            }
        })
    }

    private enum class Evaluation { NONE, USE, BARRIER }

    private fun evaluationBefore(node: IRNode, target: StackEntry): Evaluation {
        fun sequence(nodes: List<IRNode>) = nodes.asSequence().map { evaluationBefore(it, target) }
            .firstOrNull { it != Evaluation.NONE } ?: Evaluation.NONE
        return when (node) {
            is VariableUsage -> if (node.entry == target) Evaluation.USE
                else inline[node.entry]?.let { evaluationBefore(it, target) } ?: Evaluation.NONE
            is GlobalRead, is GlobalWrite -> Evaluation.BARRIER
            is IntLiteral, is Comment -> Evaluation.NONE
            is FunctionCall -> sequence(node.args).takeUnless { it == Evaluation.NONE } ?: Evaluation.BARRIER
            is FunctionReturnStatement -> sequence(node.variables.asReversed())
            is VariableDeclaration -> evaluationBefore(node.value, target).let {
                if (it == Evaluation.NONE && node.reassignment) Evaluation.BARRIER else it
            }
            is IfElse -> evaluationBefore(node.condCodeBlock, target) // Never sink an unconditional call into a branch.
            is WhileLoop -> node.condCodeBlock?.let { evaluationBefore(it, target) } ?: Evaluation.BARRIER
            is RepeatLoop -> evaluationBefore(node.countExpression, target)
            is UntilLoop, is TryCatch -> Evaluation.BARRIER
            else -> sequence(node.directChildren().toList())
        }
    }

    fun name(entry: StackEntry): String = names.getOrPut(entry.name) {
        fun base(name: StackEntryName): String = when (name) {
            is StackEntryName.Const -> when (name.value) {
                "in_msg" -> "body"; "in_msg_full" -> "message"; "in_msg_value" -> "messageValue"
                else -> name.value.replace(Regex("[^a-zA-Z0-9_]"), "_")
            }
            is StackEntryName.Parent -> base(name.parent) + name.suffix.replaceFirstChar(Char::uppercaseChar)
        }
        var desired = hints[entry.name] ?: base(entry.name)
        if (desired in setOf("in", "self", "var", "val", "fun", "get", "null", "true", "false", "const", "type",
                "struct", "enum", "match", "import", "global", "return", "if", "else", "while", "repeat", "do",
                "throw", "assert", "builtin", "asm", "private", "readonly", "mutate", "export", "contract", "lazy")) desired += "Value"
        var result = desired
        var suffix = 2
        while (!usedNames.add(result)) result = desired + suffix++
        result
    }
}
