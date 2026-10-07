package io.swee.tvm.decompiler.api

/** A location in the disassembler's logical instruction list, not a BOC bit offset. */
data class DecompilationDiagnostic(
    val kind: Kind,
    val message: String,
    val methodId: String? = null,
    val mnemonic: String? = null,
    val location: String? = null
) {
    enum class Kind { UNSUPPORTED_INSTRUCTION, PARSER_ERROR, FUNCTION_ERROR }
}
