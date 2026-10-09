package io.swee.tvm.decompiler

import com.fasterxml.jackson.databind.ObjectMapper
import io.swee.tvm.decompiler.api.DecompilationDiagnostic.Kind
import io.swee.tvm.decompiler.cli.OutputWriter
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class DiagnosticsTest {
    private fun decompile(name: String) = TvmDecompilerLib.facade().decompileBoc(
        javaClass.getResourceAsStream("/$name.boc")!!.use { it.readAllBytes() }
    )

    @Test
    fun `dynamic variable-width call produces an incomplete result with instruction and method`() {
        val result = decompile("variable-call")
        assertFalse(result.complete)
        val diagnostic = result.diagnostics.single { it.mnemonic == "CALLXARGS_VAR" }
        assertEquals(Kind.PARSER_ERROR, diagnostic.kind)
        assertEquals("90048", diagnostic.methodId)
        assertFalse(diagnostic.location.isNullOrBlank())
        assertTrue(result.files.single { it.name == "main.fc" }.content.contains("exception: CALLXARGS_VAR"))
    }

    @Test
    fun `strict JSON keeps diagnostic evidence and excludes partial files`() {
        val tree = ObjectMapper().readTree(OutputWriter.json(decompile("variable-call"), includeFiles = false))
        assertFalse(tree["complete"].asBoolean())
        assertTrue(tree["diagnostics"].size() > 0)
        assertEquals(0, tree["files"].size())
    }

    @Test
    fun `dynamic continuation reports EXECUTE parser error instead of success`() {
        val result = decompile("dynamic-continuation")
        assertFalse(result.complete)
        val diagnostic = result.diagnostics.single { it.mnemonic == "EXECUTE" }
        assertEquals(Kind.PARSER_ERROR, diagnostic.kind)
        assertEquals("115448", diagnostic.methodId)
        assertEquals("115448:#3", diagnostic.location)
        assertTrue(diagnostic.message.contains("Dynamic continuation"))
    }

    @Test
    fun `diagnostics do not leak between independent requests`() {
        assertFalse(decompile("variable-call").complete)
        val result = decompile("acton-counter")
        assertTrue(result.complete, result.diagnostics.toString())
        assertTrue(result.diagnostics.isEmpty())
    }
}
