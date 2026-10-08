package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkArithmeticNormalizationTest {
    private fun source(call:String)="fun evaluate(x:int,y:int,z:int):int { return $call; }"
    @Test fun `terminal arithmetic preserves rounding and normalizes idempotently`() {
        for ((call, native) in listOf("tvmMin(x,y)" to "min(x, y)", "tvmAbs(x)" to "abs(x)",
            "tvmMuldivr(x,y,z)" to "mulDivRound(x, y, z)", "round_divide(x,y)" to "(x ~/ y)")) {
            val result = TolkNormalizer.normalize(source(call))
            assertTrue(result.main.contains(native),result.main)
            assertEquals(listOf("terminal-native-arithmetic"),result.changes.map{it.rule})
            assertEquals(result.main,TolkNormalizer.normalize(result.main).main)
            assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
        }
    }
    @Test fun `dead nonterminal effectful constant repeated and shadowed operands remain exact`() {
        for(code in listOf(
            source("tvmMin(x,x)"),source("tvmMin(x,7)"),source("tvmMin(x,next())"),
            source("tvmMin(x,y)").replace("return","tvmAcceptMessage(); return"),
            source("tvmMin(x,y)").replace("return tvmMin(x,y);","tvmMin(x,y); return 1;"),
            "global g:int;\n"+source("tvmMin(x,g)"),
            "fun min(x:int,y:int):int{return 7;}\n"+source("tvmMin(x,y)"),
            "fun tvmMin(x:int,y:int):int{return 7;}\n"+source("tvmMin(x,y)"),
            source("tvmMin(x,y)").replace("return","var x=7; return"),
            source("tvmMin(x,/* keep */y)"),
        )) assertEquals(code,TolkNormalizer.normalize(code).main)
    }
    @Test fun `multi-result arithmetic preserves terminal binding and return order`() {
        val code = "fun evaluate(x:int,y:int):(int,int) { var (a,b)=tvmMinmax(x,y); return (a,b); }"
        val result = TolkNormalizer.normalize(code)
        assertTrue(result.main.contains("var (a,b)=minMax(x, y); return (a,b);"), result.main)
        assertEquals(listOf("terminal-native-arithmetic"), result.changes.map { it.rule })
        assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
        for (invalid in listOf(code.replace("return (a,b)", "return (b,a)"),
            code.replace("return (a,b)", "return (a,a)"), code.replace("return (a,b)", "tvmAcceptMessage(); return (a,b)"))) {
            assertEquals(invalid, TolkNormalizer.normalize(invalid).main)
        }
    }
}
