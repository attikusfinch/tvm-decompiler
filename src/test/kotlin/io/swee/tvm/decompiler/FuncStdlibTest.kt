package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.FuncNormalizer
import io.swee.tvm.decompiler.internal.normalize.FuncSource
import io.swee.tvm.decompiler.internal.normalize.FuncStdlib
import io.swee.tvm.decompiler.internal.normalize.FuncStdlibCatalog
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.security.MessageDigest

class FuncStdlibTest {
    private fun normalize(source: String, library: String) = FuncNormalizer.normalize(source, FuncStdlibCatalog(library))
    private val clock = """
        int asm_read_clock() asm "3 GETPARAM";
        int fn_90090() method_id(90090) {
            return asm_read_clock();
        }
    """.trimIndent()

    @Test fun `standard names follow declarations rather than a hardcoded function-name map`() {
        for (name in listOf("now", "context_time", "custom_clock_name")) {
            val result = normalize(clock, "int $name() asm \"NOW\";")
            assertTrue(result.main.contains("return $name();"), result.main)
            assertFalse(result.main.contains("asm_read_clock"))
            assertFalse(result.main.contains("asm \"3 GETPARAM\""))
            assertEquals(listOf("func-stdlib-call"), result.changes.map { it.rule })
            assertTrue(result.main.contains("method_id(90090)"))
            assertEquals(result.main, normalize(result.main, "int $name() asm \"NOW\";").main)
        }
    }

    @Test fun `effect mismatch keeps the exact typed opcode wrapper under a library-derived name`() {
        val result = normalize(clock.replace("() asm", "() impure asm"), "int now() asm \"NOW\";")
        assertTrue(result.main.contains("int now_tvm() impure asm \"3 GETPARAM\";"), result.main)
        assertTrue(result.main.contains("return now_tvm();"), result.main)
        assertEquals(listOf("func-stdlib-wrapper"), result.changes.map { it.rule })
        val sameEffects = normalize(clock.replace("() asm", "() impure asm"), "int now() impure asm \"NOW\";")
        assertTrue(sameEffects.main.contains("return now();"), sameEffects.main)
        assertFalse(sameEffects.main.contains("now_tvm"))
    }

    @Test fun `argument and result permutations match physical types and retain FunC API order`() {
        val input = """
            builder asm_store(cell a, builder b) asm "STREF";
            builder fn_90090(cell c, builder b) method_id(90090) {
                return asm_store(c, b);
            }
        """.trimIndent()
        val stored = normalize(input, "builder store_ref(builder b, cell c) asm(c b) \"STREF\";").main
        assertTrue(stored.contains("builder store_ref_tvm(cell a, builder b) asm \"STREF\";"), stored)
        assertTrue(stored.contains("return store_ref_tvm(c, b);"), stored)
        val output = """
            (cell, slice) asm_read(slice s) asm "LDREF";
            (cell, slice) fn_90090(slice s) method_id(90090) {
                return asm_read(s);
            }
        """.trimIndent()
        val loaded = normalize(output, "(slice, cell) load_ref(slice s) asm(-> 1 0) \"LDREF\";").main
        assertTrue(loaded.contains("(cell, slice) load_ref_tvm(slice s) asm \"LDREF\";"), loaded)
        assertTrue(loaded.contains("return load_ref_tvm(s);"), loaded)
    }

    @Test fun `selector type and incomplete-asm mismatches cannot borrow a standard name`() {
        for (source in listOf(clock.replace("3 GETPARAM", "4 GETPARAM"), clock.replace("int asm_", "slice asm_"),
            clock.replace("3 GETPARAM", "99 NOW"), clock.replace("3 GETPARAM", "NOW 7"), clock.replace("3 GETPARAM", "UNKNOWN NOW"))) {
            assertEquals(source, normalize(source, "int now() asm \"NOW\";").main)
        }
        assertEquals(clock, normalize(clock, "int now() asm \"NOW\"; int timestamp() asm \"NOW\";").main)
    }

    @Test fun `polymorphic bindings are consistent and unconstrained result types retain specialization`() {
        val source = """
            tuple asm_cons(cell value, tuple tail) asm "CONS";
            tuple fn_90090(cell c, tuple t) method_id(90090) {
                return asm_cons(c, t);
            }
        """.trimIndent()
        val library = "forall X -> tuple cons(X head, tuple tail) asm \"CONS\";"
        val normalized = normalize(source, library)
        assertTrue(normalized.main.contains("return cons(c, t);"), normalized.main + "\n" + FuncStdlibCatalog(library).declarations)
        val free = """
            cell asm_head(tuple t) asm "CAR";
            cell fn_90090(tuple t) method_id(90090) {
                return asm_head(t);
            }
        """.trimIndent()
        val result = normalize(free, "forall X -> X car(tuple t) asm \"CAR\";").main
        assertTrue(result.contains("cell car_tvm(tuple t) asm \"CAR\";"), result)
        val unequal = "[cell, int] asm_pair(cell x, int y) asm \"PAIR\";"
        assertEquals(unequal, normalize(unequal, "forall X -> [X, X] same_pair(X x, X y) asm \"PAIR\";").main)
    }

    @Test fun `builtins collisions comments and strings preserve identity and namespace`() {
        val custom = "int now() { return 7; }\n" + clock
        val result = normalize(custom, "int now() asm \"NOW\";").main
        assertTrue(result.contains("int now() { return 7; }"))
        assertTrue(result.contains("return now_tvm();"))
        val shadow = clock.replace("fn_90090()", "fn_90090(int now)")
        assertTrue(normalize(shadow, "int now() asm \"NOW\";").main.contains("return now_tvm();"))
        val collision = "global int now_tvm;\n" + clock.replace("() asm", "() impure asm")
        assertTrue(normalize(collision, "int now() asm \"NOW\";").main.contains("return now_tvm2();"))
        val commented = clock.replace("asm \"3 GETPARAM\"", "asm {- retain -} \"3 GETPARAM\"")
        assertEquals(commented, normalize(commented, "int now() asm \"NOW\";").main)
        val text = clock.replace("return asm_read_clock();", "slice text = \"asm_read_clock\"s;\n    return asm_read_clock();")
        assertTrue(normalize(text, "int now() asm \"NOW\";").main.contains("\"asm_read_clock\"s"))
        val builtin = FuncStdlibCatalog("", "int clock_builtin() asm \"NOW\";")
        assertTrue(FuncNormalizer.normalize(clock, builtin).main.contains("return clock_builtin_tvm();"))
    }

    @Test fun `canonical snapshot is pinned and compatibility signatures survive the full-library merge`() {
        val upstream = javaClass.getResourceAsStream("/func-stdlib/stdlib.fc")!!.readBytes()
        assertEquals("2522b7757d2429a1bc647985817e853d699b86f8662aa957d6cbb1724b3611eb",
            MessageDigest.getInstance("SHA-256").digest(upstream).joinToString("") { "%02x".format(it) })
        val compatibility = javaClass.getResourceAsStream("/stdlib.fc")!!.readBytes().toString(Charsets.UTF_8)
        val old = FuncSource(compatibility)
        val merged = FuncSource(FuncStdlib.support)
        for (signature in old.signatures) {
            val actual = merged.signatures.single { it.qualifiedName == signature.qualifiedName }
            assertEquals(old.code(signature.header), merged.code(actual.header), signature.qualifiedName)
        }
        assertTrue(FuncStdlib.support.contains("FunC Standard Library is free software"))
        assertTrue(FuncStdlib.catalog.declarations.any { it.name == "get_balance" })
        assertTrue(FuncStdlib.catalog.declarations.any { it.name == "load_msg_addr" })
        assertTrue(merged.defines("~udict::delete_get_min"))
    }

    @Test fun `cursor loaders come from the actual standard library declarations`() {
        val library = "(slice, cell) load_reference(slice body) asm(-> 1 0) \"LDREF\";"
        val source = """
            cell fn_90090(slice s) method_id(90090) {
                (_, cell c_00) = s.load_reference();
                return (c_00);
            }
        """.trimIndent()
        val result = normalize(source, library).main
        assertTrue(result.contains("~load_reference()"), result)
        assertFalse(normalize(source, "").main.contains("~load_reference()"))
    }

    @Test fun `partially bound result generics keep the exact typed wrapper`() {
        val source = """
            [cell, int] asm_pair(cell x, tuple t) asm "PAIR";
            [cell, int] fn_90090(cell c, tuple t) method_id(90090) {
                return asm_pair(c, t);
            }
        """.trimIndent()
        val result = normalize(source, "forall X, Y -> [X, Y] pair_head(X x, tuple t) asm \"PAIR\";").main
        assertTrue(result.contains("[cell, int] pair_head_tvm(cell x, tuple t) asm \"PAIR\";"), result)
        assertTrue(result.contains("return pair_head_tvm(c, t);"), result)
    }

    @Test fun `a modifying library overload must preserve loader semantics`() {
        val source = """
            cell fn_90090(slice s) method_id(90090) {
                (_, cell c_00) = s.load_reference();
                return c_00;
            }
        """.trimIndent()
        val regular = "(slice, cell) load_reference(slice s) asm(-> 1 0) \"LDREF\";"
        val matching = regular + " (slice, cell) ~load_reference(slice s) asm(-> 1 0) \"LDREF\";"
        assertTrue(normalize(source, matching).main.contains("~load_reference()"))
        val different = matching.replace("~load_reference(slice s) asm(-> 1 0) \"LDREF\"", "~load_reference(slice s) asm(-> 1 0) \"LDDICT\"")
        assertFalse(normalize(source, different).main.contains("~load_reference()"))
        val unknown = matching.replace("~load_reference(slice s) asm(-> 1 0) \"LDREF\"", "~load_reference(slice s) { return (s, null()); }")
        assertFalse(normalize(source, unknown).main.contains("~load_reference()"))
    }
}
