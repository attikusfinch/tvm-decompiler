package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkBuilderNormalizationTest {
    @Test
    fun `nested stores become fluent methods without mutating the original builder`() {
        val source = """
            import "stdlib"
            @method_id(90040)
            fun fn_90040(b: builder, x: int, c: cell): (cell, cell) {
                val next = tvmStoreMaybeRef(tvmStoreGrams(b, x), c).storeUint(3, 2);
                return (b.endCell(), next.endCell());
            }
        """.trimIndent()
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("b.storeCoinsExact(x).storeMaybeRefExact(c).storeUint(3, 2)"))
        assertTrue(result.main.contains("return (b.endCell(), next.endCell());"))
        assertTrue(result.main.contains("fun builder.storeCoinsExact(self, x: int): builder"))
        assertFalse(result.main.contains("mutate self"))
        assertFalse(result.main.contains("@pure"))
        assertEquals(listOf("builder-store-chain"), result.changes.map { it.rule })
        assertEquals("90040", result.changes.single().methodId)
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test
    fun `argument expressions and their order survive including calls and tuple commas`() {
        val source = "fun check(): builder { return tvmStoreGrams(nextBuilder(), nextAmount((1, 2))); }"
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("nextBuilder().storeCoinsExact(nextAmount((1, 2)))"))
        assertEquals(1, Regex("nextBuilder\\(\\)").findAll(result.main).count())
        assertEquals(1, Regex("nextAmount\\(").findAll(result.main).count())
        val conditional = "fun check(c: int, a: builder, b: builder): builder { return tvmStoreGrams(c != 0 ? a : b, 0); }"
        assertTrue(TolkNormalizer.normalize(conditional).main.contains("(c != 0 ? a : b).storeCoinsExact(0)"))
    }

    @Test
    fun `all supported stores retain their distinct asm argument order`() {
        val expected = mapOf(
            "tvmStoreGrams(b, x)" to "asm \"STGRAMS\"",
            "tvmStoreCoins(b, x)" to "asm \"STVARUINT16\"",
            "tvmStoreVaruint32(b, x)" to "asm \"STVARUINT32\"",
            "tvmStoreMaybeRef(b, c)" to "asm (c self) \"STOPTREF\"",
            "tvmStoreDict(b, c)" to "asm (c self) \"STDICT\"",
            "tvmStoreOptStdAddr(b, a)" to "asm (a self) \"STOPTSTDADDR\"",
            "tvmStoreStdAddr(b, a)" to "asm (a self) \"STSTDADDR\"",
            "tvmStoreUint(b, x, width)" to "asm (x self len) \"STUX\"",
            "tvmStoreInt(b, x, width)" to "asm (x self len) \"STIX\"",
            "tvmStoreSlice(b, s)" to "asm \"STSLICER\"",
            "tvmStoreSliceDirect(b, s)" to "asm (s self) \"STSLICE\"",
            "tvmStoreRef(b, c)" to "asm (c self) \"STREF\"",
            "tvmStoreBuilder(b, other)" to "asm \"STBR\"",
        )
        for ((call, asm) in expected) {
            val result = TolkNormalizer.normalize("fun check(): builder { return $call; }")
            assertTrue(result.main.contains(asm), call)
            assertFalse(result.main.contains(call), call)
        }
    }

    @Test
    fun `comments literals arity custom helpers and method collisions fail closed`() {
        val call = "fun check(b: builder): builder { return tvmStoreGrams(b, 0); }"
        for (source in listOf(
            call.replace("b, 0", "b, /* exact zero */ 0"),
            call.replace("b, 0", "b, 0, 1"),
            "fun tvmStoreGrams(b: builder, x: int): builder { return b; }\n$call",
            "fun builder.storeCoinsExact(self, x: int): builder asm \"DROP\"\n$call",
            "// tvmStoreGrams(b, 0)\nval text = \"tvmStoreGrams(b, 0)\";",
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `shared declarations and discarded calls keep exception behavior and entrypoint audit`() {
        val source = "fun onInternalMessage(b: builder, x: int): void { tvmStoreGrams(b, x); tvmStoreGrams(b, 0); }"
        val result = TolkNormalizer.normalize(source)
        assertEquals(1, Regex("fun builder.storeCoinsExact").findAll(result.main).count())
        assertTrue(result.main.contains("b.storeCoinsExact(x); b.storeCoinsExact(0);"))
        assertEquals("0", result.changes.single().methodId)
    }
}
