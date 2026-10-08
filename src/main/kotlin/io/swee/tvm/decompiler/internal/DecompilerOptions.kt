package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.api.OutputLanguage

data class DecompilerOptions(
    val exact: Boolean = false,
    val language: OutputLanguage = OutputLanguage.FUNC
)
