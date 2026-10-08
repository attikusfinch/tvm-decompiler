package io.swee.tvm.decompiler.internal.normalize

/** Keep the pinned upstream library intact; compatibility declarations win by qualified name. */
internal object FuncStdlib {
    val builtin: String by lazy { resource("/builtin.fc") }
    private val upstream: String by lazy { resource("/func-stdlib/stdlib.fc") }
    val support: String by lazy { merge(upstream, resource("/stdlib.fc")) }
    val catalog: FuncStdlibCatalog by lazy { FuncStdlibCatalog(support, builtin) }

    private fun resource(path: String) = FuncStdlib::class.java.getResourceAsStream(path)!!.use {
        it.readBytes().toString(Charsets.UTF_8)
    }

    fun merge(upstream: String, compatibility: String): String {
        val original = FuncSource(upstream)
        val replacements = FuncSource(compatibility).let { source ->
            source.signatures.associate { it.qualifiedName to source.code(it.header) }
        }
        var result = upstream
        for (signature in original.signatures.sortedByDescending { it.header.first().start }) {
            val replacement = replacements[signature.qualifiedName] ?: continue
            result = result.replaceRange(signature.header.first().start, signature.header.last().end, replacement)
        }
        val names = original.signatures.map { it.qualifiedName }.toSet()
        val extra = replacements.filterKeys { it !in names }.values.joinToString("\n") { "$it;" }
        return result + if (extra.isEmpty()) "" else "\n;; TVM decompiler compatibility extensions.\n$extra\n"
    }
}
