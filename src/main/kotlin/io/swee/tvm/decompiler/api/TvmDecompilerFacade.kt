package io.swee.tvm.decompiler.api

interface TvmDecompilerFacade {
    fun decompileAddress(address: String): TvmDecompilerResult

    fun decompileBoc(boc: ByteArray, exact: Boolean = false): TvmDecompilerResult

    fun decompileBoc(boc: ByteArray, exact: Boolean, language: OutputLanguage): TvmDecompilerResult {
        require(language == OutputLanguage.FUNC) { "This facade does not support $language output" }
        return decompileBoc(boc, exact)
    }
}
