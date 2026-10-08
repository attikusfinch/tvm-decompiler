package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.ton.bytecode.disassembleBoc
import io.swee.tvm.decompiler.internal.extractCallrefBodies
import io.swee.tvm.decompiler.internal.localAlternativeCallBody
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class LocalAlternativeReturnTest {
    private fun boc() = javaClass.getResourceAsStream("/local-alt-return.boc")!!.use { it.readAllBytes() }

    @Test
    fun `literal EXECUTE with local alternate return is extracted without CALLREF attribution`() {
        val methods=disassembleBoc(boc()).methods.mapValues { it.value.instList }
        val result=extractCallrefBodies(methods)
        assertFalse(result.callrefMapping.isEmpty())
        assertTrue(result.referencedIds.isEmpty())
        methods.filterKeys { it.toInt() in 90046..90047 }.values.forEach { code ->
            val body=localAlternativeCallBody(code,0)
            assertNotNull(body)
            assertTrue(body in result.callrefMapping)
            assertNull(localAlternativeCallBody(code,1))
            assertNull(localAlternativeCallBody(code.drop(1),0))
            // The body is not a local call on its own; adjacency to EXECUTE matters.
            assertNull(localAlternativeCallBody(code.take(1),0))
        }
    }

    @Test
    fun `FunC globals use consistent writes even when read before writer in method order`() {
        val result=TvmDecompilerLib.facade().decompileBoc(boc(),false,OutputLanguage.FUNC,false)
        assertTrue(result.complete,result.diagnostics.toString())
        val source=result.files.first().content
        assertTrue(source.contains("global tuple __global_1;"),source)
        assertTrue(source.contains("global cell __global_2;"),source)
    }

    @Test
    fun `local RETALT does not add caller stack slots to helper or outer return types`() {
        for(language in OutputLanguage.entries) {
            val result=TvmDecompilerLib.facade().decompileBoc(boc(),false,language,false)
            assertTrue(result.complete,result.diagnostics.toString())
            val source=result.files.first().content
            val one=if(language==OutputLanguage.TOLK) Regex("fun fn_90046\\(\\w+: slice\\): int")
                else Regex("int fn_90046 \\(slice [^,()]+\\)")
            val two=if(language==OutputLanguage.TOLK) Regex("fun fn_90047\\(\\w+: int, \\w+: slice\\): int")
                else Regex("int fn_90047 \\(int [^,()]+, slice [^,()]+\\)")
            assertTrue(one.containsMatchIn(source),source)
            assertTrue(two.containsMatchIn(source),source)
            assertTrue(source.contains("callref_0"),source)
            assertTrue(source.contains("100"),source)
        }
    }
}
