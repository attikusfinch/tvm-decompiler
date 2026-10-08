package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkNullableNormalizationTest {
    private val coalesce = """
        @method_id(90041)
        fun fn_90041(x: int, y: int): int {
            val result = tvmNull_x3f_((x as unknown));
            var phi = x;
            if (result != 0) { phi = y; }
            return phi;
        }
    """.trimIndent()

    @Test
    fun `lazy null fallback becomes coalesce retaining unknown escape and mutable result`() {
        for (fallback in listOf("y", "-7", "0x80000000")) {
            val result = TolkNormalizer.normalize(coalesce.replace("phi = y", "phi = $fallback"))
            assertTrue(result.main.contains("var phi = ((x as unknown) ?? $fallback) as int;"))
            assertEquals(listOf("null-coalesce"), result.changes.map { it.rule })
            assertEquals("90041", result.changes.single().methodId)
            assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
            assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
        }
        assertTrue(TolkNormalizer.normalize(coalesce.replace("phi = y; }", "phi = y; } else { }")).main.contains("?? y"))
    }

    @Test
    fun `coalesce keeps physical legacy cell slice and builder slots`() {
        for (type in listOf("cell", "slice", "builder")) {
            val source = coalesce.replace(": int", ": $type")
            assertTrue(TolkNormalizer.normalize(source).main.contains("((x as unknown) ?? y) as $type"))
        }
    }

    @Test
    fun `eager selection effects joins comments flags and scope ambiguity are rejected`() {
        val unsafe = listOf(
            coalesce.replace("phi = y", "phi = next()"),
            coalesce.replace("phi = y", "phi = y; other()"),
            coalesce.replace("return phi", "return phi + result"),
            coalesce.replace("return phi", "return phi + y"),
            coalesce.replace("var phi = x", "var phi = y"),
            coalesce.replace("phi = y", "phi = /* default */ y"),
            coalesce.replace("var phi = x", "effect(); var phi = x"),
            coalesce.replace("return phi", "if (y != 0) { val x = 7; } return phi"),
            coalesce.replace("y: int", "y: cell"),
            coalesce.replace("if (result != 0) { phi = y; }", "if (result != 0) { phi = y; } else { phi = x; }"),
            "fun tvmNull_x3f_(x: unknown): int { return 0; }\n$coalesce",
            "fun check(x: int): int { val flag = tvmNull_x3f_((x as unknown)); return (tvmCondSelect(flag, (7 as unknown), (x as unknown)) as int); }",
        )
        for (source in unsafe) assertFalse(TolkNormalizer.normalize(source).changes.any { it.rule == "null-coalesce" }, source)
    }

    private val getter = """
        @method_id(90042)
        fun fn_90042(body: slice): slice {
            var (a, _) = tvmLoadOptStdAddr(body);
            return a;
        }
    """.trimIndent()

    @Test
    fun `optional address getter gets native nullable return`() {
        val result = TolkNormalizer.normalize(getter)
        assertTrue(result.main.contains("fun fn_90042(body: slice): address?"))
        assertTrue(result.main.contains("return body.loadAddressOpt();"))
        assertEquals(listOf("optional-address-getter"), result.changes.map { it.rule })
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
    }

    @Test
    fun `optional address getter rejects internal callers live tails comments and nongetters`() {
        for (source in listOf(
            getter + "\nfun caller(body: slice): slice { return fn_90042(body); }",
            getter.replace("(a, _)", "(a, tail)"),
            getter.replace("return a;", "return /* owner */ a;"),
            getter.replace("90042", "5"),
            getter.replace("return a;", "if (a.isEmpty()) { return body; } return a;"),
            "fun tvmLoadOptStdAddr(body: slice): (slice, slice) { return (body, body); }\n$getter",
        )) assertFalse(TolkNormalizer.normalize(source).changes.any { it.rule == "optional-address-getter" }, source)
    }

    @Test
    fun `optional cursor has opposite tuple order and preserves snapshot nullable slots and discarded errors`() {
        val source = "fun check(body: slice): slice { var (a, rest) = tvmLoadOptStdAddr(body); return body; }"
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("var rest = body;\nvar a = (rest.loadOptionalAddressExact() as unknown as slice);"))
        assertTrue(result.main.contains("fun slice.loadOptionalAddressExact(mutate self): slice?"))
        assertTrue(result.main.contains("asm ( -> 1 0) \"LDOPTSTDADDR\""))
        assertFalse(result.main.contains("@pure"))
        assertEquals(listOf("optional-address-cursor"), result.changes.map { it.rule })
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
        val discarded = TolkNormalizer.normalize(source.replace("(a, rest)", "(_, _)"))
        assertTrue(discarded.main.contains("var cursor = body;\ncursor.loadOptionalAddressExact();"))
        val live = TolkNormalizer.normalize(source.replace("(a, rest)", "(a, _)"))
        assertTrue(live.main.contains("var cursor = body;\nvar a = (cursor.loadOptionalAddressExact() as unknown as slice);"))
    }
}
