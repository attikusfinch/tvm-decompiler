package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkMatchNormalizationTest {
    private val dispatch = """
        fun onInternalMessage(body: slice): void {
            var (tail, matched) = matchPrefix_32_2CE05111(body);
            if (matched != 0) {
                tail.loadUint(8);
                return;
            }
            var (_, matched2) = matchPrefix_32_283B4C3F(tail);
            if (matched2 != 0) {
                return;
            }
            assert (body.isEmpty()) throw 65535;
        }
    """.trimIndent()

    @Test
    fun `quiet prefix chain becomes lazy union match with original fallback`() {
        val result = TolkNormalizer.normalize(dispatch)
        assertTrue(result.main.contains("struct (0x2CE05111) Message_32_2CE05111 { tail: RemainingBitsAndRefs }"))
        assertTrue(result.main.contains("type Messages_onInternalMessage = Message_32_2CE05111 | Message_32_283B4C3F"))
        assertTrue(result.main.contains("val message = lazy Messages_onInternalMessage.fromSlice(body);"))
        assertTrue(result.main.contains("var tail = message.tail;\n            tail.loadUint(8);"))
        assertTrue(result.main.contains("else => {\n            assert (body.isEmpty()) throw 65535;"))
        assertFalse(result.main.contains("matched"))
        assertEquals(listOf("prefix-lazy-match"), result.changes.map { it.rule })
        assertEquals("0", result.changes.single().methodId)
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test
    fun `single prefix and empty fallback retain quiet matching`() {
        val source = "fun onInternalMessage(body: slice): void {\n    var (_, found) = matchPrefix_8_00(body); if (found != 0) { return; }\n}"
        val result = TolkNormalizer.normalize(source).main
        assertTrue(result.contains("struct (0x00) Message_8_00"))
        assertTrue(result.contains("lazy Message_8_00.fromSlice(body)"))
        assertTrue(result.contains("else => {\n        }"))
        assertFalse(result.contains(".tail;"))
    }

    @Test
    fun `nonterminal arms else joins and evaluation barriers are excluded`() {
        for (source in listOf(
            dispatch.replace("tail.loadUint(8);\n        return;", "tail.loadUint(8);"),
            dispatch.replace("tail.loadUint(8);", "if (tail.isEmpty()) { return; }\n        tail.loadUint(8);"),
            dispatch.replace("tail.loadUint(8);", "if (!tail.isEmpty()) { tail.loadUint(8); }"),
            dispatch.replace("if (matched != 0)", "tvmAcceptMessage();\n    if (matched != 0)"),
            dispatch.replace("var (_, matched2)", "var phi = 0;\n    var (_, matched2)"),
            dispatch.replace("    var (_, matched2)", "    else { return; }\n    var (_, matched2)"),
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `live flags tails and unrelated receivers prevent reconstructing a union`() {
        for (source in listOf(
            dispatch.replace("assert (body.isEmpty())", "tvmThrow(matched);\n    assert (body.isEmpty())"),
            dispatch.replace("assert (body.isEmpty())", "tail.loadUint(8);\n    assert (body.isEmpty())"),
            dispatch.replace("matchPrefix_32_283B4C3F(tail)", "matchPrefix_32_283B4C3F(body)"),
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `overlapping duplicate malformed and dynamic prefixes stay explicit`() {
        for (source in listOf(
            dispatch.replace("matchPrefix_32_283B4C3F", "matchPrefix_32_2CE05111"),
            dispatch.replace("matchPrefix_32_283B4C3F", "matchPrefix_8_2C"),
            dispatch.replace("matchPrefix_32_2CE05111", "matchPrefix_8_2CE05111"),
            dispatch.replace("matchPrefix_32_2CE05111(body)", "matchPrefix(body, prefix)"),
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `comments strings collisions and custom helper definitions fail closed`() {
        for (source in listOf(
            dispatch.replace("var (tail", "// Keep provenance\n    var (tail").replace("if (matched != 0)", "// Keep guard\n    if (matched != 0)"),
            "struct Message_32_2CE05111 {}\n$dispatch",
            "type Messages_onInternalMessage = int\n$dispatch",
            "fun matchPrefix_32_2CE05111(body: slice): (slice,int) { return (body, 0); }\n$dispatch",
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
        val text = "// import \"not-an-import\"\nval text = \"matchPrefix_32_2CE05111\";\n" + dispatch
        assertTrue(TolkNormalizer.normalize(text).main.contains("val text = \"matchPrefix_32_2CE05111\";"))
    }

    @Test
    fun `type declarations are shared and generated local names avoid collisions`() {
        val source = "import \"stdlib\"\n" + dispatch + "\n" + dispatch.replace("onInternalMessage", "onExternalMessage")
            .replace("tail.loadUint(8);", "val message = tail.loadUint(8);")
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.startsWith("import \"stdlib\"\n// Message names"))
        assertEquals(1, Regex("struct \\(0x2CE05111\\)").findAll(result.main).count())
        assertTrue(result.main.contains("val message2 = lazy"))
        assertEquals(setOf("0", "-1"), result.changes.map { it.methodId }.toSet())
    }

    @Test
    fun `method IDs and return expressions survive match reconstruction`() {
        val source = dispatch.replace("fun onInternalMessage(body: slice): void", "@method_id(90020)\nfun fn_90020(body: slice): int")
            .replace("tail.loadUint(8);\n        return;", "return tail.loadUint(8);")
            .replace("return;", "return 7;").replace("assert (body.isEmpty()) throw 65535;", "return -1;")
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("@method_id(90020)\nfun fn_90020"))
        assertTrue(result.main.contains("return tail.loadUint(8);"))
        assertTrue(result.main.contains("return -1;"))
        assertEquals("90020", result.changes.single().methodId)
    }
}
