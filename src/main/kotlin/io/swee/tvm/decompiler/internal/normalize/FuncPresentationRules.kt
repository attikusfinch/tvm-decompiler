package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

/** A prefix label says what bits were compared; it does not invent a message/schema name. */
internal object FuncPrefixNamesRule : FuncNormalizer.Rule {
    override fun edits(source: FuncSource): List<FuncNormalizer.Edit> = buildList {
        if (source.defines("begins_with")) return@buildList
        val prefixes = mutableListOf<String>()
        for ((index, token) in source.tokens.withIndex()) {
            if (token.value != "begins_with" || source.tokens.getOrNull(index + 1)?.value != "(") continue
            val close = closingParenthesis(source.tokens, index + 1) ?: continue
            val args = callArguments(source.tokens, index + 1, close)
            if (args.size == 2 && args.last().size == 1 && args.last().single().identifier) prefixes += args.last().single().value
        }
        val occupied = source.tokens.filter { it.identifier }.map { it.value }.toMutableSet()
        for (declaration in source.tokens.windowed(6)) {
            if (declaration.take(2).map { it.value } != listOf("const", "slice") || declaration[3].value != "=" || declaration[5].value != ";") continue
            val token = declaration[2]
            if (!token.value.matches(Regex("__const_[0-9a-f]+")) || source.references(token.value) != prefixes.count { it == token.value } + 1
                || token.value !in prefixes || source.hasComments(declaration.first().start, declaration.last().end)) continue
            val literal = declaration[4].value
            val hex = when {
                literal.matches(Regex("\"[0-9A-Fa-f]{8}\"s")) -> literal.substring(1, 9).uppercase()
                literal.matches(Regex("\"[ !#-\\[\\]-~]{4}\"")) -> literal.substring(1, 5).map { it.code.toString(16).padStart(2, '0') }.joinToString("").uppercase()
                else -> continue
            }
            val base = "PREFIX_$hex"
            val name = generateSequence(1) { it + 1 }.map { if (it == 1) base else "${base}_$it" }.first { occupied.add(it) }
            for (reference in source.tokens.filter { it.identifier && it.value == token.value })
                add(FuncNormalizer.Edit(reference.start, reference.end, name, NormalizationChange("func-prefix-name", "unknown", name)))
        }
    }
}

internal object FuncGuardSyntaxRule : FuncNormalizer.Rule {
    override fun edits(source: FuncSource): List<FuncNormalizer.Edit> = buildList {
        for (function in source.functions) for ((index, token) in function.body.withIndex()) {
            if (token.value !in setOf("if", "ifnot") || function.body.getOrNull(index + 1)?.value == "(") continue
            val end = (index + 1 until function.body.size).firstOrNull { function.body[it].value in setOf("{", "}", ";") } ?: continue
            if (function.body[end].value != "{") continue
            val condition = function.body.subList(index + 1, end)
            if (condition.isEmpty() || source.hasComments(token.end, function.body[end].start)) continue
            add(FuncNormalizer.Edit(condition.first().start, condition.last().end, "(${source.code(condition)})", function.change("func-guard-syntax")))
        }
    }
}

/** Names describe observed operations, never an inferred storage schema or author symbol. */
internal object FuncLocalNamesRule : FuncNormalizer.Rule {
    private val generated = Regex("[A-Za-z][A-Za-z0-9_]*_[0-9a-f]{2,}")
    override fun edits(source: FuncSource): List<FuncNormalizer.Edit> = buildList {
        for (function in source.functions) {
            val scope = (source.signatures.filter { it.name.value == function.name.value }.flatMap { it.parameters }
                + function.body).distinctBy { it.start }
            val bindings = source.bindings(function)
            val occupied = (scope.filter { it.identifier }.map { it.value } + source.signatures.map { it.name.value }
                + source.tokens.windowed(3).filter { it[0].value in setOf("const", "global") }.map { it[2].value }).toMutableSet()
            val roles = mutableMapOf<String, String>()
            for (statement in source.statements(function)) {
                if (statement.firstOrNull()?.value == "(") {
                    val close = closingParenthesis(statement, 0)
                    if (close != null && statement.getOrNull(close + 1)?.value == "=" && statement.getOrNull(close + 2)?.value == "begins_with") {
                        val pair = callArguments(statement, 0, close)
                        if (pair.size == 2) {
                            if (pair[0].size == 2 && pair[0][0].value == "slice") roles[pair[0][1].value] = "body_tail"
                            if (pair[1].size == 2 && pair[1][0].value == "int") roles[pair[1][1].value] = "matched"
                        }
                    }
                }
                for (index in 1 until statement.size - 1) if (statement[index].value == "~" && statement[index - 1].identifier
                    && statement[index + 1].value.startsWith("load_")) {
                    roles[statement[index - 1].value] = "cursor"
                    if (statement.size > 4 && statement[0].value in FuncSource.primitiveTypes && statement[1].identifier && statement[2].value == "=") {
                        roles[statement[1].value] = when (statement[index + 1].value) {
                            "load_std_addr_cursor" -> "address"
                            "load_opt_std_addr_cursor" -> "optional_address"
                            "load_ref" -> "reference"
                            "load_maybe_ref" -> "optional_reference"
                            "load_dict" -> "dictionary"
                            "load_msg_addr" -> "message_address"
                            "load_grams", "load_coins" -> "coins"
                            "load_bits" -> "bits"
                            else -> "value"
                        }
                    }
                }
            }
            for ((token, type) in bindings) {
                val old = token.value
                if (!generated.matches(old) || bindings.count { it.first.value == old } != 1 || source.defines(old)) continue
                val base = roles[old] ?: when {
                    function.name.value in setOf("recv_internal", "recv_external") && old.startsWith("in_msg_full_") -> "full_message"
                    function.name.value in setOf("recv_internal", "recv_external") && old.startsWith("in_msg_value_") -> "message_value"
                    function.name.value in setOf("recv_internal", "recv_external") && old.startsWith("in_msg_") -> "body"
                    old.matches(Regex("arg_[0-9]+_[0-9a-f]{2,}")) -> "arg" + old.split('_')[1]
                    old.startsWith("phi_") -> "merged_value"
                    type == "slice" -> "slice_value"
                    type == "cell" -> "cell_value"
                    type == "builder" -> "builder_value"
                    type == "tuple" -> "tuple_value"
                    type == "cont" -> "continuation"
                    else -> "value"
                }
                val name = generateSequence(1) { it + 1 }.map { if (it == 1) base else "${base}$it" }.first { occupied.add(it) }
                for (reference in scope.filter { it.identifier && it.value == old })
                    add(FuncNormalizer.Edit(reference.start, reference.end, name, function.change("func-local-name")))
            }
        }
    }
}

internal object FuncSendModeRule : FuncNormalizer.Rule {
    private val modes = linkedMapOf(
        1 to "SEND_MODE_PAY_FEES_SEPARATELY", 2 to "SEND_MODE_IGNORE_ERRORS", 16 to "SEND_MODE_BOUNCE_ON_ACTION_ERROR",
        32 to "SEND_MODE_DESTROY_IF_ZERO", 64 to "SEND_MODE_CARRY_REMAINING_MESSAGE_VALUE", 128 to "SEND_MODE_CARRY_ALL_BALANCE"
    )
    override fun edits(source: FuncSource): List<FuncNormalizer.Edit> = buildList {
        if (source.defines("send_raw_message")) return@buildList
        val needed = linkedMapOf<String, Int>()
        for (function in source.functions) {
            if (source.bindings(function).any { it.first.value == "send_raw_message" }) continue
            for ((index, token) in function.body.withIndex()) {
                if (token.value != "send_raw_message" || function.body.getOrNull(index + 1)?.value != "(") continue
                val close = closingParenthesis(function.body, index + 1) ?: continue
                val args = callArguments(function.body, index + 1, close)
                if (args.size != 2 || args.last().size != 1 || source.hasComments(token.start, function.body[close].end)) continue
                val literal = args.last().single()
                val value = literal.value.toIntOrNull() ?: continue
                if (value < 0 || value and 243 != value) continue
                val selected = if (value == 0) linkedMapOf("SEND_MODE_REGULAR" to 0)
                    else modes.filterKeys { value and it != 0 }.entries.associate { it.value to it.key }
                if (source.bindings(function).any { it.first.value in selected }) continue
                if (selected.any { (name, number) -> source.references(name) > 0 &&
                    !Regex("(?m)^const int $name = $number;$").containsMatchIn(source.text) }) continue
                needed.putAll(selected)
                add(FuncNormalizer.Edit(literal.start, literal.end, selected.keys.joinToString(" + "), function.change("func-send-mode")))
            }
        }
        val declarations = needed.filterKeys { source.references(it) == 0 }
        if (declarations.isNotEmpty()) add(FuncNormalizer.Edit(0, 0,
            declarations.entries.joinToString("\n", postfix = "\n\n") { (name, value) -> "const int $name = $value;" },
            NormalizationChange("func-send-mode-constant", "unknown", "send_modes")))
    }
}
