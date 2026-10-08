package io.swee.tvm.decompiler.cli

import io.swee.tvm.decompiler.api.TvmDecompilerFacade
import io.swee.tvm.decompiler.api.TvmDecompilerResult
import io.swee.tvm.decompiler.api.OutputLanguage
import io.swee.tvm.decompiler.internal.DecompilerOptions
import io.swee.tvm.decompiler.internal.TvmDecompilerImpl

object TvmDecompilerFacadeImpl : TvmDecompilerFacade {

    override fun decompileBoc(boc: ByteArray, exact: Boolean): TvmDecompilerResult {
        return decompileBoc(boc, exact, OutputLanguage.FUNC)
    }

    override fun decompileBoc(boc: ByteArray, exact: Boolean, language: OutputLanguage): TvmDecompilerResult =
        decompileBoc(boc, exact, language, normalize = true)

    override fun decompileBoc(boc: ByteArray, exact: Boolean, language: OutputLanguage, normalize: Boolean): TvmDecompilerResult =
        TvmDecompilerImpl.decompile(boc, DecompilerOptions(exact = exact, language = language, normalize = normalize))

    override fun decompileAddress(address: String): TvmDecompilerResult {
        throw UnsupportedOperationException(
            "Address-based decompilation is not yet implemented. " +
            "Use the 'boc' subcommand with a BOC file or literal."
        )
    }
}
