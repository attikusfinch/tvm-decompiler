package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkNormalizerTest {
    private val owner = """
        @method_id(83229)
        fun fn_83229(): slice {
            val address = (contract.getData().beginParse().loadAddress() as slice);
            return address;
        }
    """.trimIndent()

    @Test
    fun `address getter becomes native getter and normalization is idempotent`() {
        val result = TolkNormalizer.normalize(owner)
        assertTrue(result.main.contains("get fun owner(): address"))
        assertTrue(result.main.contains("return contract.getData().beginParse().loadAddress();"))
        assertFalse(result.main.contains("as slice"))
        assertFalse(result.main.contains("@method_id"))
        assertEquals(setOf("address-getter-return", "owner-getter-name"), result.changes.map { it.rule }.toSet())
        val second = TolkNormalizer.normalize(result.main)
        assertEquals(result.main, second.main)
        assertTrue(second.changes.isEmpty())
    }

    @Test
    fun `storage prefix is retained exactly`() {
        val prefix = "var (tail, _) = tvmLoadUint(contract.getData().beginParse(), 32);"
        val source = owner.replace("val address", "$prefix\n    val address").replace("contract.getData().beginParse().loadAddress()", "tail.loadAddress()")
        val result = TolkNormalizer.normalize(source).main
        assertTrue(result.contains(prefix))
        assertTrue(result.contains("return tail.loadAddress();"))
    }

    @Test
    fun `internal references prevent changing the called function type or name`() {
        val source = owner + "\nfun caller(): slice { return fn_83229(); }"
        assertEquals(source, TolkNormalizer.normalize(source).main)
    }

    @Test
    fun `nullable branches and reassigned return values are not refined`() {
        val branch = owner.replace("val address", "if (contract.getData().beginParse().isEmpty()) { return (tvmNull() as slice); }\n    val address")
        assertEquals(branch, TolkNormalizer.normalize(branch).main)
        val reassignment = owner.replace("return address;", "address = \"\".hexToSlice();\n    return address;")
        assertEquals(reassignment, TolkNormalizer.normalize(reassignment).main)
    }

    @Test
    fun `unknown IDs retain explicit ID and conflicting owner identifiers prevent renaming`() {
        val unknown = TolkNormalizer.normalize(owner.replace("83229", "90001")).main
        assertTrue(unknown.contains("@method_id(90001)\nfun fn_90001(): address"))
        val conflict = TolkNormalizer.normalize("fun owner(): int { return 1; }\n" + owner).main
        assertTrue(conflict.contains("@method_id(83229)\nfun fn_83229(): address"))
    }

    @Test
    fun `matching hash alone does not establish the owner ABI`() {
        val wrongReturn = "@method_id(83229)\nfun fn_83229(): int { return 7; }"
        assertEquals(wrongReturn, TolkNormalizer.normalize(wrongReturn).main)
        val withArgument = TolkNormalizer.normalize(owner.replace("fn_83229()", "fn_83229(argument: int)")).main
        assertTrue(withArgument.contains("@method_id(83229)\nfun fn_83229(argument: int): address"))
    }

    @Test
    fun `strings and comments cannot impersonate function syntax and comments are preserved`() {
        val comment = "// @method_id(83229) fun fn_83229(): slice { return x; }\n"
        val source = comment + owner.replace("val address", "val ignored = \"owner fun fn_83229() { return x; }\".hexToSlice();\n    val address")
        val result = TolkNormalizer.normalize(source).main
        assertTrue(result.startsWith(comment))
        assertTrue(result.contains("get fun owner(): address"))
        val attached = owner.replace("return address;", "// Address provenance\n    return address;")
        assertEquals(attached, TolkNormalizer.normalize(attached).main)
        val annotationComment = owner.replace("fun fn_", "// Annotation comment\nfun fn_")
        assertTrue(TolkNormalizer.normalize(annotationComment).main.contains("// Annotation comment"))
    }

    @Test
    fun `empty and malformed bodies fail closed`() {
        for (source in listOf("", "@method_id(83229)\nfun fn_83229(): slice { return x; }", owner.dropLast(1)))
            assertEquals(source, TolkNormalizer.normalize(source).main)
    }
}
