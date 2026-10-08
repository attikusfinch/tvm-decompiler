package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkCompilerRecoveryTest {
    private val integers = """
        @method_id(90030)
        fun fn_90030(op: int, body: slice): int {
            if ((op == -1)) { return body.preloadUint(8); }
            if ((0x2 == op)) { return body.preloadUint(16); }
            return -7;
        }
    """.trimIndent()

    @Test
    fun `terminal integer tests become ordered match with the same method and fallback`() {
        val result = TolkNormalizer.normalize(integers)
        assertTrue(result.main.contains("match (op)"))
        assertTrue(result.main.contains("-1 =>"))
        assertTrue(result.main.contains("0x2 =>"))
        assertTrue(result.main.contains("return -7;"))
        assertTrue(result.main.contains("@method_id(90030)"))
        assertEquals(listOf("integer-match"), result.changes.map { it.rule })
        assertEquals("90030", result.changes.single().methodId)
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test
    fun `integer match rejects duplicates nullable or different subjects effects and joins`() {
        for (source in listOf(
            integers.replace("0x2", "-0x1"),
            integers.replace("op: int", "op: int?"),
            integers.replace("0x2 == op", "0x2 == other"),
            integers.replace("0x2 == op", "0x2 == op + 1"),
            integers.replace("if ((0x2", "tvmAcceptMessage();\n    if ((0x2"),
            integers.replace("return body.preloadUint(8);", "body.preloadUint(8);"),
            integers.replace("return body.preloadUint(8);", "if (body.isEmpty()) { return 1; } return 2;"),
            integers.replace("return body.preloadUint(8);", "if (body.isEmpty()) {} return 2;"),
            integers.replace("return body.preloadUint(8);", "/* provenance */ return body.preloadUint(8);"),
        )) assertEquals(source, TolkNormalizer.normalize(source).main, source)
    }

    @Test
    fun `integer facts exclude shadowed bindings and global names`() {
        val source = integers.replace("op: int, ", "").replace("if ((op", "val op = 1;\n    if ((op")
        assertTrue(TolkNormalizer.normalize(source).main.contains("match (op)"))
        assertEquals(source.replace("return -7;", "val op = 2; return -7;"),
            TolkNormalizer.normalize(source.replace("return -7;", "val op = 2; return -7;")).main)
        val global = "global op: int;\n" + integers.replace("op: int, ", "")
        assertEquals(global, TolkNormalizer.normalize(global).main)
        val expired = global.replace("if ((op", "if (body.isEmpty()) { val op = 7; }\n    if ((op")
        assertEquals(expired, TolkNormalizer.normalize(expired).main)
        val future = global.replace("return -7;", "val op = 8; return op;")
        assertEquals(future, TolkNormalizer.normalize(future).main)
    }

    @Test
    fun `CONDSEL becomes native ternary of already computed homogeneous values`() {
        val source = "fun choose(c: int, a: int, b: int): unknown { return tvmCondSelect(c, (a as unknown), (b as unknown)); }"
        val result = TolkNormalizer.normalize(source)
        assertEquals("fun choose(c: int, a: int, b: int): unknown { return (c != 0 ? a : b); }", result.main)
        assertEquals("conditional-select", result.changes.single().rule)
        assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
        val literals = "fun choose(c: int): int { return (tvmCondSelect(c, (2 as unknown), (-1 as unknown)) as int); }"
        assertTrue(TolkNormalizer.normalize(literals).main.contains("((c != 0 ? 2 : -1) as int)"))
    }

    @Test
    fun `CONDSEL does not make effectful computations lazy or infer heterogenous types`() {
        for (source in listOf(
            "fun choose(c: int, a: int, b: slice): unknown { return tvmCondSelect(c, (a as unknown), (b as unknown)); }",
            "fun choose(c: int, a: int, b: int): unknown { return tvmCondSelect(c, (read() as unknown), (b as unknown)); }",
            "fun choose(c: int, a: int, b: int): unknown { return tvmCondSelect(next(), (a as unknown), (b as unknown)); }",
            "fun choose(c: int, a: int?, b: int): unknown { return tvmCondSelect(c, (a as unknown), (b as unknown)); }",
            "fun choose(c: int, a: int, b: int): unknown { return tvmCondSelect(c, /* provenance */ (a as unknown), (b as unknown)); }",
            "fun tvmCondSelect(c: int, a: unknown, b: unknown): unknown { return a; }\nfun choose(c: int): int { return (tvmCondSelect(c, (2 as unknown), (1 as unknown)) as int); }",
        )) assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `all compiler recovery rules identify implicit entrypoints in their audit`() {
        for ((name, id) in listOf("onInternalMessage" to "0", "onExternalMessage" to "-1")) {
            val integer = integers.replace("@method_id(90030)\n", "").replace("fn_90030", name)
            assertEquals(id, TolkNormalizer.normalize(integer).changes.single().methodId)
            val conditional = "fun $name(c: int, a: int, b: int): unknown { return tvmCondSelect(c, (a as unknown), (b as unknown)); }"
            assertEquals(id, TolkNormalizer.normalize(conditional).changes.single().methodId)
            val cursor = "fun $name(body: slice): int { var (_, v) = tvmLoadUint(body, 8); return v; }"
            assertEquals(id, TolkNormalizer.normalize(cursor).changes.single().methodId)
        }
    }

    @Test
    fun `cursor loads preserve snapshots mutability discarded results and exact opcodes`() {
        val source = """
            import "stdlib"
            fun load(body: slice, width: int): int {
                var (rest, value) = tvmLoadUint(body, width);
                value = value + body.preloadUint(1);
                var (rest2, _) = tvmLoadUint(rest, 8);
                var (_, coins) = tvmLoadGrams(rest2);
                return value + coins;
            }
        """.trimIndent()
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("var rest = body;\n    var value = rest.loadUintExact(width);"))
        assertTrue(result.main.contains("var rest2 = rest;\n    rest2.loadUintExact(8);"))
        assertTrue(result.main.contains("var cursor = rest2;\n    var coins = cursor.loadCoinsExact();"))
        assertTrue(result.main.contains("asm (self len -> 1 0) \"LDUX\""))
        assertEquals(1, Regex("fun slice.loadUintExact").findAll(result.main).count())
        assertEquals(listOf("cursor-load"), result.changes.map { it.rule })
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
    }

    @Test
    fun `dead coin loads preserve their throwing instruction instead of a removable pure native call`() {
        val source = "fun load(body: slice): int { var (_, _) = tvmLoadGrams(body); return 7; }"
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("cursor.loadCoinsExact();"))
        assertTrue(result.main.contains("asm ( -> 1 0) \"LDGRAMS\""))
        assertFalse(result.main.contains("@pure"))
    }

    @Test
    fun `cursor rewriting rejects capture shadows comments effectful widths and helper collisions`() {
        val source = "fun load(body: slice): int { var (rest, value) = tvmLoadUint(body, 8); return value; }"
        for (changed in listOf(
            source.replace("(rest, value)", "(body, value)"),
            source.replace("body, 8", "body, value"),
            source.replace("body, 8", "body, next()"),
            source.replace("body, 8", "body, /* width */ 8"),
            source.replace("return value;", "val value = 1; return value;"),
            "fun tvmLoadUint(body: slice, width: int): (slice, int) { return (body, 0); }\n$source",
            "fun slice.loadUintExact(mutate self, width: int): int asm \"DROP\"\n$source",
        )) assertEquals(changed, TolkNormalizer.normalize(changed).main)
    }

    @Test
    fun `discarded cursor uses a fresh name and signed loads share their own helper`() {
        val source = "fun load(body: slice, cursor: int): int { var (_, value) = tvmLoadInt(body, 8); return value + cursor; }"
        val result = TolkNormalizer.normalize(source)
        assertTrue(result.main.contains("var cursor2 = body;"))
        assertTrue(result.main.contains("var value = cursor2.loadIntExact(8);"))
        assertTrue(result.main.contains("\"LDIX\""))
    }
}
