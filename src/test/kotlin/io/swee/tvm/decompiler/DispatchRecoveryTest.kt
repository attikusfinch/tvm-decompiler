package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class DispatchRecoveryTest {
    private fun boc(name: String) = javaClass.getResourceAsStream("/$name.boc")!!.use { it.readAllBytes() }

    @Test
    fun `fixed CALLXARGS preserves two opaque output slots and compiles without a continuation type in Tolk`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("fixed-call-one-two"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.joinToString("\n") { it.content }
            assertTrue(source.contains("\"1 2 CALLXARGS\""), source)
            assertTrue(source.contains("asm_CALLXARGS_1_2"), source)
            if (language == OutputLanguage.TOLK) {
                assertTrue(source.contains(": (unknown, unknown)"), source)
                assertFalse(source.contains(": continuation"), source)
            }
        }
    }

    @Test
    fun `static JMPX returns target stack and discards the caller tail`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("static-jump-tail"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            assertFalse(Regex("\\b99\\b").containsMatchIn(result.files.first().content))
        }
    }

    @Test
    fun `variable return width CALLXARGS remains explicitly partial`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("variable-call"), false, language)
            assertFalse(result.complete)
            assertTrue(result.diagnostics.any { it.mnemonic == "CALLXARGS_VAR" && it.message.contains("fixed return width") })
            assertTrue(result.normalizations.isEmpty())
        }
    }
}
