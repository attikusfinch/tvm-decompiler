package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LoopRecoveryTest {
    private fun boc(name: String) = javaClass.getResourceAsStream("/$name.boc")!!.use { it.readAllBytes() }

    @Test
    fun `AGAINEND keeps the explicit loop and nested return type`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("again-return"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            assertTrue(source.contains("while"), source)
            val signature = if (language == OutputLanguage.TOLK) Regex("fun fn_90044\\(\\w+: int\\): int")
                else Regex("int fn_90044 \\(int [^,()]+\\)")
            assertTrue(signature.containsMatchIn(source), source)
            if (language == OutputLanguage.TOLK) assertTrue(source.contains("while (true)"), source)
        }
    }

    @Test
    fun `WalletV5 is complete and FunC effectful procedures retain impure declarations`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("acton-wallet-v5"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            if (language == OutputLanguage.FUNC) {
                assertTrue(Regex("\\(\\) callref_0 .* impure inline_ref;").containsMatchIn(source), source)
                assertTrue(Regex("\\(\\) asm_POPCTR_\\w+ \\(cell a\\) impure asm \"c5 POPCTR\";").containsMatchIn(source), source)
            }
            assertFalse(source.contains("method_id(-1000)"), source)
        }
    }

    @Test
    fun `empty WHILE condition consumes its existing flag and keeps the one argument ABI`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("while-empty-condition"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            val signature = if (language == OutputLanguage.TOLK) Regex("fun fn_90043\\(\\w+: int\\): int")
                else Regex("int fn_90043 \\(int [^,()]+\\)")
            assertTrue(signature.containsMatchIn(source), source)
            assertTrue(source.contains("while"))
        }
    }

    @Test
    fun `NftCollection is complete and extracted CALLREF helper is a procedure not a public method`() {
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc("acton-nft-collection"), false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            val source = result.files.first().content
            assertTrue(source.contains("callref_0"))
            assertTrue(source.contains("inline_ref"))
            assertFalse(source.contains("method_id(-1000)"), source)
        }
    }
}
