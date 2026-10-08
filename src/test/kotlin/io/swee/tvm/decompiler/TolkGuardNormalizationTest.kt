package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkGuardNormalizationTest {
    private fun normalize(body: String) = TolkNormalizer.normalize("fun onInternalMessage(a: slice, b: slice): void {\n$body\n}")

    @Test
    fun `boolean assertion folds only its adjacent single-use binding`() {
        val result = normalize("val result = (a.bitsEqual(b) as int);\nassert (result != 0) throw 100;")
        assertTrue(result.main.contains("assert (a.bitsEqual(b)) throw 100;"))
        assertFalse(result.main.contains("val result"))
        assertEquals(listOf("boolean-guard"), result.changes.map { it.rule })
        assertEquals("0", result.changes.single().methodId)
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test
    fun `zero tests preserve inversion and comparison operands`() {
        val result = normalize("val result = ((1 + 2 > -1) as int);\nif (!(result == 0)) { return; }")
        assertTrue(result.main.contains("if (1 + 2 > -1)"))
        val inverse = normalize("val result = (a.isEmpty() as int);\nif (result == 0) { return; }")
        assertTrue(inverse.main.contains("if (!(a.isEmpty()))"))
    }

    @Test
    fun `integer helpers bitwise values and multi-use bindings retain integer semantics`() {
        for (body in listOf(
            "val result = (tvmHashBuilder(beginCell()) as int);\nassert (result != 0) throw 100;",
            "val result = ((1 & 2) as int);\nassert (result != 0) throw 100;",
            "val result = (a.bitsEqual(b) as int);\nassert (result != 0) throw 100;\ntvmThrow(result);",
            "val result = (a.bitsEqual(b) as int);\ntvmThrow(1);\nif (result != 0) { return; }",
            "val result = (a.bitsEqual(b) as int);\nwhile (result != 0) { return; }",
        )) {
            val result = normalize(body)
            assertTrue(result.main.contains(body), result.main)
            assertTrue(result.changes.isEmpty())
        }
    }

    @Test
    fun `explicit boolean casts in existing loop guards keep repeated evaluation`() {
        val result = normalize("while ((a.isEmpty() as int) != 0) { a.loadUint(8); }")
        assertTrue(result.main.contains("while (a.isEmpty())"))
    }

    @Test
    fun `comments prevent statement folding and strings do not count as uses`() {
        val body = "val result = (a.bitsEqual(b) as int);\n// Preserve guard provenance\nassert (result != 0) throw 100;"
        assertTrue(normalize(body).main.contains(body))
        val result = normalize("val text = \"result val result = predicate;\";\nval result = (a.bitsEqual(b) as int);\nassert (result != 0) throw 100;")
        assertTrue(result.main.contains("assert (a.bitsEqual(b))"))
        assertTrue(result.main.contains("\"result val result = predicate;\""))
    }

    @Test
    fun `native null checks retain unknown escape and integer values`() {
        val result = normalize("val flag = tvmNull_x3f_((a as unknown));\ntvmThrow(~flag);\nif (tvmNull_x3f_((b as unknown)) != 0) { return; }")
        assertTrue(result.main.contains("val flag = (((a as unknown) == null) as int);"))
        assertTrue(result.main.contains("tvmThrow(~flag);"))
        assertTrue(result.main.contains("if ((b as unknown) == null)"))
        assertFalse(result.main.contains("tvmNull_x3f_"))
        assertEquals(setOf("native-null-check", "boolean-guard"), result.changes.map { it.rule }.toSet())
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test
    fun `nested null checks converge and custom helpers are not rewritten`() {
        val nested = normalize("if (tvmNull_x3f_((tvmNull_x3f_((a as unknown)) as unknown)) != 0) { return; }")
        assertFalse(nested.main.contains("tvmNull_x3f_"))
        assertTrue(TolkNormalizer.normalize(nested.main).changes.isEmpty())
        val custom = "fun tvmNull_x3f_(x: unknown): int { return 7; }\nfun caller(): int { return tvmNull_x3f_((1 as unknown)); }"
        assertEquals(custom, TolkNormalizer.normalize(custom).main)
    }

    @Test
    fun `candidate getter signatures collisions and internal references are checked`() {
        val counter = "@method_id(117456)\nfun fn_117456(): int { return 7; }"
        val result = TolkNormalizer.normalize(counter)
        assertTrue(result.main.contains("get fun currentCounter(): int"))
        assertEquals("abi-getter-name", result.changes.single().rule)
        for (source in listOf(
            counter.replace("(): int", "(argument: int): int"),
            counter.replace(": int", ": slice"),
            "fun currentCounter(): int { return 0; }\n$counter",
            "$counter\nfun caller(): int { return fn_117456(); }",
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }
}
