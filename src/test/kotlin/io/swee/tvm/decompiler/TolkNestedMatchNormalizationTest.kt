package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkNestedMatchNormalizationTest {
    private val arms = """
            if (x == 1) { return 10; }
            if (x == 2) { return 20; }
            return 30;
    """.trimIndent().prependIndent("        ")
    private fun route(body: String) = "fun route(c:int,x:int):int {\n$body\n}"

    @Test fun `terminal chains inside if and else retain outer flow and normalize idempotently`() {
        for (body in listOf("    if(c!=0) {\n$arms\n    }\n    return 40;",
            "    if(c!=0) { return 40; } else {\n$arms\n    }")) {
            val result = TolkNormalizer.normalize(route(body))
            assertTrue(result.main.contains("match (x)"), result.main)
            assertEquals(listOf("nested-integer-match"), result.changes.map { it.rule })
            assertTrue(result.main.contains("return 40;"))
            assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
            assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
        }
    }

    @Test fun `loop try lambda match-arm and bare block return contexts are retained`() {
        for ((open, close) in listOf(
            "while(c!=0) {" to "}", "try {" to "} catch(code,value) { return 40; }",
            "val f=fun():int {" to "};", "match(c){ 0=>{" to "} else=>{return 40;} }",
            "{" to "}",
        )) {
            val code = route("    $open\n$arms\n    $close\n    return 40;")
            assertEquals(code, TolkNormalizer.normalize(code).main)
        }
    }

    @Test fun `nested joins duplicates shadows comments and unsafe returns are retained`() {
        for (chain in listOf(
            arms.replace("return 10;", "x = 10;"),
            arms.replace("x == 2", "x == 0x1"),
            "        var x=7;\n$arms",
            arms.replace("return 20;", "/* keep */ return 20;"),
            arms.replace("return 30;", "if(c>0){return 30;} return 50;"),
        )) {
            val code=route("    if(c!=0) {\n$chain\n    }\n    return 40;")
            assertEquals(code,TolkNormalizer.normalize(code).main)
        }
    }
}
