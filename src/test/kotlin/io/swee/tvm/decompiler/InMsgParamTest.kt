package io.swee.tvm.decompiler

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class InMsgParamTest {
    @Test
    fun `Acton counter uses typed wrappers with embedded message selectors`() {
        val boc = javaClass.getResourceAsStream("/acton-counter.boc")!!.use { it.readAllBytes() }
        val source = TvmDecompilerLib.facade().decompileBoc(boc).files.single { it.name == "main.fc" }.content
        assertFalse(source.contains("(var) asm_INMSGPARAM"), source)
        assertFalse(source.contains("asm_INMSGPARAM(1)"), source)
        assertFalse(source.contains("asm_INMSGPARAM(2)"), source)
        assertTrue(source.contains("(int) asm_INMSGPARAM_1 () asm \"1 INMSGPARAM\";"), source)
        assertTrue(source.contains("(slice) asm_INMSGPARAM_2 () asm \"2 INMSGPARAM\";"), source)
    }
}
