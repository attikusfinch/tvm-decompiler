package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TryRecoveryTest {
    private fun boc(name: String) = javaClass.getResourceAsStream("/$name.boc")!!.use { it.readAllBytes() }

    @Test
    fun `literal bare TRY recovers both arms without a register envelope`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("raw-try"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            assertTrue(result.files.first().content.contains("try {"))
            assertTrue(result.files.first().content.contains("catch ("))
        }
    }

    @Test
    fun `FunC register envelope recovers a typed TRY join in both languages`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("try-catch"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            assertTrue(source.contains("try {"), source)
            assertTrue(source.contains("catch ("), source)
            assertFalse(source.contains("continuation"), source)
        }
    }

    @Test
    fun `compact Tolk TRY keeps captured arguments and one integer parameter`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("tolk-try-captured"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            val signature = if (language == OutputLanguage.TOLK) Regex("fun fn_90046\\(\\w+: int\\): int")
                else Regex("int fn_90046 \\(int [^,()]+\\)")
            assertTrue(signature.containsMatchIn(source), source)
            assertTrue(source.contains("try {"), source)
        }
    }
}
