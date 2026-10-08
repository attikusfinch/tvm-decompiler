package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.memberReceiver

/** Runs last, after the existing main-only rules. Raw output never enters this stage. */
internal object TolkStdlibNames {
    private data class Edit(val start: Int, val end: Int, val value: String)
    fun normalize(main: String, support: String, catalog: TolkStdlibCatalog): TolkNormalizer.Result {
        var code = main; var library = support
        val changes = mutableListOf<NormalizationChange>(); val imports = sortedSetOf<String>()
        while (true) {
            val source = TolkSource(code); val helpers = TolkSource(library)
            val declarations = TolkStdlibCatalog.read(library)
            val mainEdits = mutableListOf<Edit>(); val libraryEdits = mutableListOf<Edit>()
            for (wrapper in declarations) {
                val old = wrapper.name
                if (!old.startsWith("tvm") && !old.startsWith("asm_")) continue
                if (wrapper.nameTokens.size != 1 || wrapper.generics.isNotEmpty() || wrapper.mutated.isNotEmpty() ||
                    declarations.count { it.name == old } != 1 || old in TolkStdlibCatalog.functionNames(source) ||
                    helpers.hasComments(wrapper.start,wrapper.end)) continue
                val references = source.tokens.filter { it.identifier && it.value == old }
                if (references.isEmpty() || references.any { token -> !isCall(source.tokens,token) } || old in boundNames(source)) continue
                val extraReferences = helpers.tokens.filter { it.identifier && it.value == old && it.start != wrapper.nameTokens.single().start }
                if (extraReferences.any { !isCall(helpers.tokens,it) } || old in boundNames(helpers)) continue
                val candidate = catalog.candidates(wrapper).singleOrNull() ?: continue
                val occupied = (source.tokens + helpers.tokens).filter { it.identifier }.map { it.value }.toSet() + catalog.declarations.map { it.name }
                val candidateRoot = candidate.name.substringBefore('.')
                val direct = candidate.mutated.isEmpty() && candidate.generics.isEmpty() &&
                    candidate.arguments == wrapper.arguments && candidate.results == wrapper.results && candidate.pure == wrapper.pure &&
                    candidate.inputOrder == wrapper.inputOrder && candidate.outputOrder == wrapper.outputOrder &&
                    candidate.name !in TolkStdlibCatalog.functionNames(source) + TolkStdlibCatalog.functionNames(helpers) &&
                    candidateRoot !in boundNames(source) + boundNames(helpers)
                val instance = candidate.names.firstOrNull() == "self"
                if (direct && instance && references.any { token ->
                    val index = source.tokens.indexOf(token); val end = closingParenthesis(source.tokens,index+1)
                    end == null || source.hasComments(token.start,source.tokens[end].end) ||
                        callArguments(source.tokens,index+1,end).size != wrapper.arguments.size
                }) continue
                if (direct && extraReferences.isNotEmpty()) continue // Generated support contains only asm declarations.
                val name = if (direct) candidate.name else {
                    val base = candidate.name.split('.').mapIndexed { index, part ->
                        if (index == 0) part.replaceFirstChar(Char::lowercaseChar) else part.replaceFirstChar(Char::uppercaseChar)
                    }.joinToString("") + "Tvm"
                    generateSequence(1) { it+1 }.map { if (it == 1) base else base+it }.first { it !in occupied }
                }
                for (reference in references) {
                    if (direct && instance) {
                        val index = source.tokens.indexOf(reference); val end = closingParenthesis(source.tokens,index+1)!!
                        val arguments = callArguments(source.tokens,index+1,end)
                        // Nested helper calls would make ranges intersect. Keep their exact wrapper instead.
                        if (arguments.any { argument -> argument.any { it.identifier && it.value == old } }) { mainEdits.clear(); break }
                        val receiver = source.code(arguments.first())
                        val value = (if (memberReceiver(arguments.first())) receiver else "($receiver)") + ".${candidate.name.substringAfterLast('.')}(${arguments.drop(1).joinToString(", ") { source.code(it) }})"
                        mainEdits += Edit(reference.start,source.tokens[end].end,value)
                    } else mainEdits += Edit(reference.start,reference.end,name)
                }
                if (mainEdits.isEmpty()) continue
                if (direct) {
                    val start = library.lastIndexOf('\n',wrapper.start)+1
                    val end = library.indexOf('\n',wrapper.end).takeIf { it >= 0 } ?: library.length
                    val wholeLine = library.substring(start,wrapper.start).all(Char::isWhitespace) && library.substring(wrapper.end,end).all(Char::isWhitespace)
                    libraryEdits += Edit(if (wholeLine) start else wrapper.start,if (wholeLine) (end+1).coerceAtMost(library.length) else wrapper.end,"")
                    if (candidate.module !in setOf("", "common")) imports += candidate.module
                } else {
                    libraryEdits += Edit(wrapper.nameTokens.single().start,wrapper.nameTokens.single().end,name)
                    extraReferences.forEach { libraryEdits += Edit(it.start,it.end,name) }
                }
                changes += NormalizationChange(if (direct) "tolk-stdlib-call" else "tolk-stdlib-wrapper","unknown",candidate.name)
                break
            }
            if (mainEdits.isEmpty()) break
            code = apply(code,mainEdits); library = apply(library,libraryEdits)
        }
        for (module in imports) {
            val import = "import \"@stdlib/$module\""
            if (TolkSource(code).tokens.windowed(2).none { it[0].value == "import" && it[1].value == "\"@stdlib/$module\"" })
                code = "$import\n$code"
        }
        return TolkNormalizer.Result(code,changes.distinct(),library)
    }

    private fun isCall(tokens: List<Token>, token: Token): Boolean {
        val index = tokens.indexOf(token)
        return tokens.getOrNull(index+1)?.value == "(" && tokens.getOrNull(index-1)?.value != "."
    }
    private fun apply(text: String, edits: List<Edit>): String {
        val sorted = edits.sortedByDescending { it.start }
        check(sorted.zipWithNext().all { (right,left) -> left.end <= right.start }) { "Overlapping stdlib edits" }
        var result = text
        sorted.forEach { result = result.replaceRange(it.start,it.end,it.value) }
        return result
    }
    private fun boundNames(source: TolkSource): Set<String> = buildSet {
        val tokens = source.tokens
        for (index in tokens.indices) {
            if (tokens[index].value in setOf("val", "var", "global", "const")) {
                val end = (index+1 until tokens.size).firstOrNull { tokens[it].value in setOf("=", ";", "{", "}") } ?: continue
                addAll(tokens.subList(index+1,end).filter { it.identifier }.map { it.value })
            }
            if (tokens[index].identifier && tokens.getOrNull(index+1)?.value == ":") add(tokens[index].value)
        }
    }
}
