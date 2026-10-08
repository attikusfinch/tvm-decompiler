package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class DedustPoolRecoveryTest {
    @Test
    fun `both real Pool revisions decode calls reward loops and wallet dictionary updates`() {
        for (contract in listOf("CpmmPoolV1", "CpmmPoolV2")) {
            val boc = Files.readAllBytes(Path.of("reconstruction/dedust/oracles/$contract.boc"))
            for (language in OutputLanguage.entries) {
                val result = TvmDecompilerLib.facade().decompileBoc(boc, false, language, false)
                assertTrue(result.complete, "$contract $language: ${result.diagnostics}")
                assertTrue(result.diagnostics.isEmpty(), "$contract $language")
            }
        }
    }
}
