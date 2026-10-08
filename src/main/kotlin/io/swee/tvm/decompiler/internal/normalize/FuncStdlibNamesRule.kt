package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange

/** Only emitted asm helpers participate; public method IDs and names are never guessed. */
internal class FuncStdlibNamesRule(private val catalog: FuncStdlibCatalog) : FuncNormalizer.Rule {
    override fun edits(source: FuncSource): List<FuncNormalizer.Edit> = buildList {
        for (signature in source.signatures) {
            val old = signature.name.value
            if (!old.startsWith("asm_") || source.signatures.count { it.qualifiedName == old } != 1
                || source.hasComments(signature.header.first().start, signature.header.last().end)) continue
            val wrapper = FuncStdlibCatalog.declaration(signature) ?: continue
            if (wrapper.generics.isNotEmpty()) continue
            val candidates = catalog.candidates(wrapper)
            // Several library names can describe the same opcode/type; don't invent a winner.
            val candidate = candidates.singleOrNull() ?: continue
            val references = source.tokens.filter { it.identifier && it.value == old && it.start != signature.name.start }
            if (references.any { reference ->
                val index = source.tokens.indexOf(reference)
                source.tokens.getOrNull(index + 1)?.value != "(" || source.tokens.getOrNull(index - 1)?.value == "~"
            }) continue
            if (source.functions.any { function -> source.bindings(function).any { it.first.value == old } }) continue
            val inputGenerics = candidate.arguments.flatMap { genericNames(it, candidate.generics) }.toSet()
            val freeResultGeneric = candidate.results.flatMap { genericNames(it, candidate.generics) }.any { it !in inputGenerics }
            val hasBinding = source.functions.any { function -> source.bindings(function).any { it.first.value == candidate.name } } ||
                source.tokens.windowed(3).any { it[0].value in setOf("global", "const") && it[2].value == candidate.name }
            val direct = !candidate.builtin && !freeResultGeneric && !source.defines(candidate.name) && !hasBinding &&
                candidate.impure == wrapper.impure && candidate.inputOrder == wrapper.inputOrder && candidate.outputOrder == wrapper.outputOrder
            val occupied = source.tokens.filter { it.identifier }.map { it.value }.toSet() + catalog.declarations.map { it.name }
            val name = if (direct) candidate.name else generateSequence(1) { it + 1 }
                .map { if (it == 1) "${candidate.name}_tvm" else "${candidate.name}_tvm$it" }.first { it !in occupied }
            val rule = if (direct) "func-stdlib-call" else "func-stdlib-wrapper"
            val change = NormalizationChange(rule, "unknown", candidate.name)
            if (direct) {
                val semicolon = source.tokens.firstOrNull { it.start >= signature.header.last().end } ?: continue
                if (semicolon.value != ";") continue
                val lineStart = source.text.lastIndexOf('\n', signature.header.first().start) + 1
                val lineEnd = source.text.indexOf('\n', semicolon.end).takeIf { it >= 0 } ?: source.text.length
                val wholeLine = source.text.substring(lineStart, signature.header.first().start).all { it.isWhitespace() } &&
                    source.text.substring(semicolon.end, lineEnd).all { it.isWhitespace() }
                add(FuncNormalizer.Edit(if (wholeLine) lineStart else signature.header.first().start,
                    if (wholeLine) (lineEnd + 1).coerceAtMost(source.text.length) else semicolon.end, "", change))
            } else add(FuncNormalizer.Edit(signature.name.start, signature.name.end, name, change))
            for (reference in references) add(FuncNormalizer.Edit(reference.start, reference.end, name, change))
            // Reparse after each helper; another helper can target the same standard name.
            break
        }
    }

    private fun genericNames(type: FuncStdlibCatalog.Type, names: Set<String>): List<String> =
        (if (type.name in names) listOf(type.name) else emptyList()) + type.items.flatMap { genericNames(it, names) }
}
