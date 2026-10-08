package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.memberReceiver

/** Functional builder methods preserve snapshots, exact opcodes, argument order and exceptions. */
internal object BuilderStoreRule : TolkNormalizer.Rule {
    private data class Store(val method: String, val parameters: String, val arity: Int, val asm: String)
    private val stores = mapOf(
        "tvmStoreGrams" to Store("storeCoinsExact", "x: int", 2, "\"STGRAMS\""),
        "tvmStoreCoins" to Store("storeVarUint16Exact", "x: int", 2, "\"STVARUINT16\""),
        "tvmStoreVaruint32" to Store("storeVarUint32Exact", "x: int", 2, "\"STVARUINT32\""),
        "tvmStoreMaybeRef" to Store("storeMaybeRefExact", "c: cell", 2, "(c self) \"STOPTREF\""),
        "tvmStoreDict" to Store("storeDictExact", "c: cell", 2, "(c self) \"STDICT\""),
        "tvmStoreOptStdAddr" to Store("storeOptionalAddressExact", "a: slice", 2, "(a self) \"STOPTSTDADDR\""),
        "tvmStoreStdAddr" to Store("storeAddressExact", "a: slice", 2, "(a self) \"STSTDADDR\""),
        "tvmStoreUint" to Store("storeUintExact", "x: int, len: int", 3, "(x self len) \"STUX\""),
        "tvmStoreInt" to Store("storeIntExact", "x: int, len: int", 3, "(x self len) \"STIX\""),
        "tvmStoreSlice" to Store("storeSliceExact", "s: slice", 2, "\"STSLICER\""),
        "tvmStoreSliceDirect" to Store("storeSliceDirectExact", "s: slice", 2, "(s self) \"STSLICE\""),
        "tvmStoreRef" to Store("storeRefExact", "c: cell", 2, "(c self) \"STREF\""),
        "tvmStoreBuilder" to Store("storeBuilderExact", "other: builder", 2, "\"STBR\""),
    )
    private data class Call(val store: Store, val arguments: List<List<Token>>, val end: Int)

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val eligible = stores.filter { (helper, store) -> !source.definesFunction(helper) && source.references(store.method) == 0 }
        val used = linkedSetOf<Store>()
        fun call(tokens: List<Token>, index: Int): Call? {
            val store = eligible[tokens[index].value] ?: return null
            if (index > 0 && tokens[index - 1].value == ".") return null
            val end = closingParenthesis(tokens, index + 1) ?: return null
            if (source.hasComments(tokens[index].start, tokens[end].end)) return null
            val arguments = callArguments(tokens, index + 1, end)
            if (arguments.size != store.arity || arguments.any { it.isEmpty() }) return null
            return Call(store, arguments, end)
        }
        fun render(tokens: List<Token>): String = buildString {
            var cursor = tokens.first().start
            var index = 0
            while (index < tokens.size) {
                val candidate = call(tokens, index)
                if (candidate == null) { index++; continue }
                append(source.text.substring(cursor, tokens[index].start))
                val receiver = render(candidate.arguments.first())
                append(if (memberReceiver(candidate.arguments.first())) receiver else "($receiver)")
                append(".${candidate.store.method}(")
                append(candidate.arguments.drop(1).joinToString(", ") { render(it) })
                append(')')
                used += candidate.store
                cursor = tokens[candidate.end].end
                index = candidate.end + 1
            }
            append(source.text.substring(cursor, tokens.last().end))
        }
        for (function in source.functions) {
            val tokens = function.body
            var index = 0
            while (index < tokens.size) {
                val candidate = call(tokens, index)
                if (candidate == null) { index++; continue }
                add(TolkNormalizer.Edit(tokens[index].start, tokens[candidate.end].end,
                    render(tokens.subList(index, candidate.end + 1)), function.change("builder-store-chain")))
                index = candidate.end + 1
            }
        }
        if (used.isNotEmpty()) {
            val insert = source.tokens.indices.lastOrNull { source.tokens[it].value == "import" }
                ?.let { source.tokens.getOrNull(it + 1)?.end } ?: 0
            val declarations = "\n\n// Functional builder stores preserve input snapshots and exact TVM exceptions.\n" + used.joinToString("\n\n") {
                "fun builder.${it.method}(self, ${it.parameters}): builder\n    asm ${it.asm}"
            } + "\n"
            add(TolkNormalizer.Edit(insert, insert, declarations, first().change))
        }
    }
}
