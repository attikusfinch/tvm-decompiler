package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.OutputLanguage
import io.swee.tvm.decompiler.internal.StackEntry
import io.swee.tvm.decompiler.internal.StackEntryName
import io.swee.tvm.decompiler.internal.TvmStackEntryType
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path

class UnionStackJoinTest {
    @Test
    fun `union payload kind does not depend on branch order`() {
        val integer = StackEntry.Simple(TvmStackEntryType.INT, StackEntryName.Const("amount"))
        val cell = StackEntry.Simple(TvmStackEntryType.CELL, StackEntryName.Const("payload"))
        for (entries in listOf(listOf(integer, cell), listOf(cell, integer))) {
            assertEquals(TvmStackEntryType.UNKNOWN, StackEntry.merge(entries)!!.type)
        }
        assertSame(integer, StackEntry.merge(listOf(integer, integer)))
    }

    @Test
    fun `real DeDust Position heterogeneous message union is completely decoded in both languages`() {
        val boc = Files.readAllBytes(Path.of("reconstruction/dedust/oracles/CpmmPosition.boc"))
        for (language in OutputLanguage.entries) {
            val result = TvmDecompilerLib.facade().decompileBoc(boc, false, language, false)
            assertTrue(result.complete, result.diagnostics.toString())
            assertTrue(result.diagnostics.isEmpty())
        }
    }
}
