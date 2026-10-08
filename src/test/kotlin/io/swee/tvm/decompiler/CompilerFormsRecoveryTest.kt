package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class CompilerFormsRecoveryTest {
    private fun boc(name:String)=javaClass.getResourceAsStream("/$name.boc")!!.use{it.readAllBytes()}

    @Test fun `discarded arithmetic checks survive on both output languages`() {
        for (language in OutputLanguage.entries) {
            val result=TvmDecompilerLib.facade().decompileBoc(boc("discarded-min"),false,language,false)
            assertTrue(result.complete,result.diagnostics.toString())
            val main=result.files.first().content
            assertTrue(main.contains(if(language==OutputLanguage.TOLK) "tvmMin(" else "min("),main)
            if (language==OutputLanguage.FUNC) assertTrue(result.files.joinToString("\n"){it.content}.contains("impure asm \"MIN\""))
        }
    }

    @Test fun `typed map mustGet preserves lookup and THROWIFNOT with a fixed result width`() {
        for(language in OutputLanguage.entries){
            val result=TvmDecompilerLib.facade().decompileBoc(boc("typed-map-must-get"),false,language,false)
            assertTrue(result.complete,result.diagnostics.toString())
            val source=result.files.joinToString("\n"){it.content}
            assertTrue(source.contains("asm_DICTUGET_MUST_9"),source)
            assertTrue(source.contains("\"DICTUGET\" \"9 THROWIFNOT\""),source)
        }
    }

    @Test fun `noncapturing lambda preserves literal c3 lookup NOP and fixed CALLXARGS`() {
        for(language in OutputLanguage.entries){
            val result=TvmDecompilerLib.facade().decompileBoc(boc("noncapturing-lambda"),false,language,false)
            assertTrue(result.complete,result.diagnostics.toString())
            val source=result.files.joinToString("\n"){it.content}
            assertTrue(source.contains("asm_PUSHCONT_CALLDICT_"),source)
            assertTrue(source.contains("asm_NOP"),source)
            assertTrue(source.contains("\"1 1 CALLXARGS\""),source)
            assertFalse(source.contains("tvmTouch("),source)
        }
    }
}
