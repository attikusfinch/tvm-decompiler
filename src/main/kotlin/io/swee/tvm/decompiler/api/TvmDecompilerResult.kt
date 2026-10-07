package io.swee.tvm.decompiler.api

interface TvmDecompilerResult {
    interface File {
        val name: String
        val content: String
    }
    val files: List<File>
    val diagnostics: List<DecompilationDiagnostic> get() = emptyList()
    /** No known parsing failures; this does not prove recompilation or equivalence. */
    val complete: Boolean get() = diagnostics.isEmpty()
}
