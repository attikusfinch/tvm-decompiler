package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.DecompilerOptions
import io.swee.tvm.decompiler.internal.TvmDecompilerImpl
import io.swee.tvm.decompiler.internal.normalize.FuncNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class FuncNormalizerTest {
    private val owner = """
        #include "stdlib.fc";
        slice fn_83229 () impure;
        slice fn_83229 () impure method_id(83229) {
            (slice s2_00, _) = get_data().begin_parse().load_uint(32);
            (slice a_00, slice s2_01) = s2_00.load_std_addr();
            return (a_00);
        }
    """.trimIndent()

    @Test fun `loads become a single explicit cursor without guessing a getter name`() {
        val result = FuncNormalizer.normalize(owner)
        assertTrue(result.main.contains("slice cursor = get_data().begin_parse();"), result.main)
        assertTrue(result.main.contains("cursor~load_uint(32);"), result.main)
        assertTrue(result.main.contains("slice address = cursor~load_std_addr_cursor();"), result.main)
        assertTrue(result.main.contains("return address;"), result.main)
        assertTrue(result.main.contains("asm(-> 1 0) \"LDSTDADDR\";"), result.main)
        assertTrue(result.main.contains("fn_83229 () impure method_id(83229)"))
        assertFalse(result.main.contains("s2_00"))
        assertEquals(result.main, FuncNormalizer.normalize(result.main).main)
        assertTrue(FuncNormalizer.normalize(result.main).changes.isEmpty())
    }

    @Test fun `snapshot used later prevents merging and loops and handlers keep cursor copies`() {
        for (extra in listOf("return (s2_00);", "while (0) { return (s2_00); } return (a_00);", "try { throw(1); } catch (_, _) { } return (a_00);")) {
            val result = FuncNormalizer.normalize(owner.replace("return (a_00);", extra)).main
            assertTrue(result.contains("slice cursor2 = cursor;"), result)
        }
    }

    @Test fun `native helpers retain their opcode and strings and nested comments stay literal`() {
        val source = """
            (int) asm_INMSGPARAM_1 () impure asm "1 INMSGPARAM";
            (slice) asm_INMSGPARAM_2 () impure asm "2 INMSGPARAM";
            () recv_internal(slice in_msg_00) impure method_id(0) {
                {- asm_INMSGPARAM_1 {- in_msg_00 -} -}
                slice a_00 = "asm_INMSGPARAM_1 in_msg_00"s;
                int x_00 = asm_INMSGPARAM_1();
                send_raw_message(begin_cell().end_cell(), 3);
                return ();
            }
        """.trimIndent()
        val result = FuncNormalizer.normalize(source).main
        assertTrue(result.contains("int incoming_message_is_bounced () impure asm \"1 INMSGPARAM\";"), result)
        assertTrue(result.contains("slice incoming_message_sender () impure asm \"2 INMSGPARAM\";"), result)
        assertTrue(result.contains("slice body"), result)
        assertTrue(result.contains("{- asm_INMSGPARAM_1 {- in_msg_00 -} -}"), result)
        assertTrue(result.contains("\"asm_INMSGPARAM_1 in_msg_00\"s"), result)
        assertTrue(result.contains("SEND_MODE_PAY_FEES_SEPARATELY + SEND_MODE_IGNORE_ERRORS"), result)
        assertTrue(result.contains("return ();"), result)
    }

    @Test fun `comments custom loads and helper collisions prevent cursor rewrites`() {
        val comments = owner.replace("= get_data()", "= {- preserve -} get_data()")
        assertTrue(Regex("\\(slice \\w+, _\\) = \\{- preserve -} get_data\\(\\)").containsMatchIn(FuncNormalizer.normalize(comments).main))
        val custom = "(slice, int) load_uint(slice s, int n) { return (s, n); }\n" + owner
        assertTrue(FuncNormalizer.normalize(custom).main.contains(".load_uint(32)"))
        val collision = "int load_std_addr_cursor() { return 1; }\n" + owner
        assertFalse(FuncNormalizer.normalize(collision).main.contains("~load_std_addr_cursor"))
        val shadow = owner.replace("slice s2_00", "slice a_00")
        assertTrue(FuncNormalizer.normalize(shadow).main.contains("(slice a_00, _)"))
    }

    @Test fun `unknown send bits and custom sends and scalar tuples stay explicit`() {
        val source = """
            (int, int) fn_70000 () method_id(70000) {
                send_raw_message(begin_cell().end_cell(), 4);
                send_raw_message(begin_cell().end_cell(), -1);
                return (1, 2);
            }
        """.trimIndent()
        assertEquals(source, FuncNormalizer.normalize(source).main)
        val custom = "() send_raw_message(cell c, int mode) { return (); }\n" + source.replace(", 4)", ", 3)")
        assertEquals(custom, FuncNormalizer.normalize(custom).main)
        val conflict = "global int SEND_MODE_PAY_FEES_SEPARATELY;\n" + source.replace(", 4)", ", 3)")
        assertEquals(conflict, FuncNormalizer.normalize(conflict).main)
        val shadow = "const int SEND_MODE_PAY_FEES_SEPARATELY = 1;\n" + source.replace("fn_70000 ()", "fn_70000 (int SEND_MODE_PAY_FEES_SEPARATELY)").replace(", 4)", ", 3)")
        assertEquals(shadow, FuncNormalizer.normalize(shadow).main)
    }

    @Test fun `only four byte constants used exclusively as prefix checks receive a bit label`() {
        val source = """
            const slice __const_00 = "1234abcd"s;
            const slice __const_01 = "(;L?";
            const slice __const_02 = "42_"s;
            () recv_internal(slice in_msg_00) impure {
                (slice s_00, int matched_00) = begins_with(in_msg_00, __const_00);
                if matched_00 { return (); }
                (_, int matched_01) = begins_with(s_00, __const_01);
                ifnot matched_01 { return (); }
                (_, int matched_02) = begins_with(s_00, __const_02);
            }
        """.trimIndent()
        val result = FuncNormalizer.normalize(source).main
        assertTrue(result.contains("const slice PREFIX_1234ABCD = \"1234abcd\"s;"), result)
        assertTrue(result.contains("const slice PREFIX_283B4C3F = \"(;L?\";"), result)
        assertTrue(result.contains("if (matched) {"), result)
        assertTrue(result.contains("ifnot (matched2) {"), result)
        assertTrue(result.contains("const slice __const_02"), result)
        val shared = source.replace("if matched_00", "store_slice(begin_cell(), __const_00);\n    if matched_00")
        assertTrue(FuncNormalizer.normalize(shared).main.contains("const slice __const_00"))
        val escaped = source.replace("\"(;L?\"", "\"\\\\abc\"")
        assertTrue(FuncNormalizer.normalize(escaped).main.contains("const slice __const_01"))
        assertEquals(result, FuncNormalizer.normalize(result).main)
    }

    @Test fun `facade separates raw func and skips partial output`() {
        val boc = javaClass.getResourceAsStream("/acton-counter.boc")!!.readBytes()
        val raw = TvmDecompilerImpl.decompile(boc, DecompilerOptions(normalize = false))
        val normalized = TvmDecompilerImpl.decompile(boc, DecompilerOptions())
        assertTrue(raw.normalizations.isEmpty())
        assertTrue(normalized.normalizations.isNotEmpty())
        assertEquals(raw.files[1].content, normalized.files[1].content)
        assertEquals(FuncNormalizer.normalize(raw.files[0].content).main, normalized.files[0].content)
        val partial = javaClass.getResourceAsStream("/dynamic-continuation.boc")!!.readBytes()
        val rawPartial = TvmDecompilerImpl.decompile(partial, DecompilerOptions(normalize = false))
        val normalizedPartial = TvmDecompilerImpl.decompile(partial, DecompilerOptions())
        assertFalse(normalizedPartial.complete)
        assertEquals(rawPartial.files, normalizedPartial.files)
        assertTrue(normalizedPartial.normalizations.isEmpty())
    }
}
