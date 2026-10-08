package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TolkMessageNormalizerTest {
    private fun source(mode: String) = "fun emit(c: cell): void { tvmSendRawMessage(c, $mode); }"

    @Test fun `send modes retain values and normalization is idempotent`() {
        for ((mode, expected) in listOf(
            "0" to "SEND_MODE_REGULAR",
            "17" to "(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL)",
            "0x82" to "(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_BALANCE)",
            "192" to "(SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_CARRY_ALL_BALANCE)",
        )) {
            val result = TolkNormalizer.normalize(source(mode))
            assertTrue(result.main.contains("sendRawMessage(c, $expected)"), result.main)
            assertEquals(setOf("native-message-send", "send-mode-flags"), result.changes.map { it.rule }.toSet())
            assertEquals(result.main, TolkNormalizer.normalize(result.main).main)
            assertTrue(TolkNormalizer.normalize(result.main).changes.isEmpty())
        }
    }

    @Test fun `dynamic unknown negative modes and argument effects retain evaluation`() {
        for (mode in listOf("n", "-1", "4", "8", "256", "1024", "nextMode()")) {
            val code = source(mode).replace("tvmSendRawMessage(c,", "tvmSendRawMessage(nextMessage(c),")
            val result = TolkNormalizer.normalize(code)
            assertEquals(code.replace("tvmSendRawMessage", "sendRawMessage"), result.main)
            assertEquals(listOf("native-message-send"), result.changes.map { it.rule })
        }
    }

    @Test fun `declarations shadowing comments strings and malformed calls are excluded`() {
        for (code in listOf(
            "fun tvmSendRawMessage(c:cell,n:int):void { }\n" + source("1"),
            "fun sendRawMessage(c:cell,n:int):void { }\n" + source("1"),
            source("1").replace("c: cell", "c: cell, tvmSendRawMessage: unknown"),
            source("1").replace("tvmSendRawMessage(c", "c.tvmSendRawMessage(c"),
            source("1").replace("c, 1", "c, /* keep */ 1"),
            source("1").replace("c, 1", "c"),
            "// ${source("1")}\nfun test(): slice { return \"tvmSendRawMessage(c, 1)\".hexToSlice(); }",
        )) assertEquals(code, TolkNormalizer.normalize(code).main)
        val collision = "const SEND_MODE_PAY_FEES_SEPARATELY = 7;\n" + source("1")
        assertEquals(collision.replace("tvmSendRawMessage", "sendRawMessage"), TolkNormalizer.normalize(collision).main)
    }
}
