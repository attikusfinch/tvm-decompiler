package io.swee.tvm.decompiler

import com.fasterxml.jackson.databind.ObjectMapper
import io.swee.tvm.decompiler.internal.normalize.TolkNormalizer
import io.swee.tvm.decompiler.internal.normalize.TolkStdlibCatalog
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.security.MessageDigest

class TolkStdlibTest {
    private val main = "@method_id(90097)\nfun fn_90097(): int { return asm_clock(); }"
    private val helper = "fun asm_clock(): int\n    asm \"3 GETPARAM\"\n"
    private fun normalize(main: String, helper: String, library: String, module: String = "common") =
        TolkNormalizer.normalize(main,helper,TolkStdlibCatalog(mapOf(module to library)))

    @Test fun `qualified standard names follow declarations and selectors rather than a name table`() {
        for (name in listOf("blockchain.now", "context.time", "customClock")) {
            val result = normalize(main,"@pure\n$helper","@pure\nfun $name(): int asm \"NOW\"")
            assertTrue(result.main.contains("return $name();"),result.main)
            assertFalse(result.support!!.contains("asm_clock"))
            assertEquals(listOf("tolk-stdlib-call"),result.changes.map { it.rule })
            assertTrue(result.main.contains("@method_id(90097)"))
            val repeated = normalize(result.main,result.support!!,"@pure\nfun $name(): int asm \"NOW\"")
            assertEquals(result.main,repeated.main); assertEquals(result.support,repeated.support)
        }
    }

    @Test fun `pure mismatch retains the exact effectful declaration in both files`() {
        val result = normalize(main,helper,"@pure\nfun blockchain.now(): int asm \"NOW\"")
        assertTrue(result.main.contains("return blockchainNowTvm();"),result.main)
        assertEquals("fun blockchainNowTvm(): int\n    asm \"3 GETPARAM\"\n",result.support)
        assertEquals(listOf("tolk-stdlib-wrapper"),result.changes.map { it.rule })
    }

    @Test fun `mutating APIs and physical stack permutations retain the original wrapper`() {
        val loaded = normalize("fun check(s: slice): (cell, slice) { return asm_read(s); }",
            "fun asm_read(s: slice): (cell, slice) asm \"LDREF\"",
            "@pure\nfun slice.loadRef(mutate self): cell asm(-> 1 0) \"LDREF\"")
        assertTrue(loaded.main.contains("sliceLoadRefTvm(s)"),loaded.main)
        assertTrue(loaded.support!!.contains("(cell, slice) asm \"LDREF\""))
        val stored = normalize("fun check(c: cell, b: builder): builder { return asm_store(c,b); }",
            "fun asm_store(c: cell, b: builder): builder asm \"STREF\"",
            "@pure\nfun builder.storeRef(mutate self, c: cell): self asm(c self) \"STREF\"")
        assertTrue(stored.main.contains("builderStoreRefTvm(c,b)"),stored.main)
        assertTrue(stored.support!!.contains("(c: cell, b: builder): builder asm \"STREF\""))
    }

    @Test fun `nonmutating receiver calls preserve evaluation order and get required module imports`() {
        val result = normalize("fun check(s: slice): void { tvmAssert(s); }",
            "fun tvmAssert(s: slice): void asm \"ENDS\"",
            "fun slice.assertEnd(self): void asm \"ENDS\"")
        assertTrue(result.main.contains("s.assertEnd();"),result.main)
        assertFalse(result.support!!.contains("tvmAssert"))
        val gas = normalize("fun check(n: int): void { tvmLimit(n); }",
            "fun tvmLimit(n: int): void asm \"SETGASLIMIT\"",
            "fun setGasLimit(limit: int): void asm \"SETGASLIMIT\"","gas-payments")
        assertTrue(gas.main.startsWith("import \"@stdlib/gas-payments\"\n"),gas.main)
        assertTrue(gas.main.contains("setGasLimit(n);"))
        assertFalse(gas.support!!.contains("tvmLimit"))
    }

    @Test fun `runtime aliases provide names without injecting address nullable bool or map schemas`() {
        for ((oldType,newType,opcode,name) in listOf(
            listOf("slice","address","MYADDR","contract.getAddress"),
            listOf("int","coins","DUEPAYMENT","contract.getStorageDuePayment"),
            listOf("int","bool","SEMPTY","slice.isEmpty"),
            listOf("cell","cell?","CONFIGOPTPARAM","blockchain.configParam"))) {
            val args = if (opcode == "MYADDR" || opcode == "DUEPAYMENT") "" else if (opcode == "SEMPTY") "s: slice" else "n: int"
            val params = if (opcode == "SEMPTY") "self" else args
            val callArgs = if (opcode == "SEMPTY") "s" else if (args.isNotEmpty()) "n" else ""
            val result = normalize("fun check($args): $oldType { return asm_read($callArgs); }",
                "fun asm_read($args): $oldType asm \"$opcode\"","fun $name($params): $newType asm \"$opcode\"")
            assertEquals("tolk-stdlib-wrapper",result.changes.single().rule,result.main)
            assertTrue(result.support!!.contains(": $oldType asm \"$opcode\""),result.support)
        }
        val pair = normalize("fun check(): [int,cell] { return asm_pair(); }",
            "fun asm_pair(): [int,cell] asm \"BALANCE\"",
            "type dict = cell?\nstruct map<K,V> { private tvmDict: dict }\ntype ExtraCurrenciesMap = map<int32,varuint32>\nfun contract.getOriginalBalanceWithExtraCurrencies(): [coins,ExtraCurrenciesMap] asm \"BALANCE\"")
        assertTrue(pair.main.contains("contractGetOriginalBalanceWithExtraCurrenciesTvm()"),pair.main)
        assertTrue(pair.support!!.contains("[int,cell]"))
    }

    @Test fun `polymorphic output binding is consistent and exact specializations stay explicit`() {
        val library = "@pure\nfun pair<X>(x: X, y: X): [X,X] asm \"PAIR\""
        val result = normalize("fun check(a: cell,b: cell): [cell,cell] { return asm_pair(a,b); }",
            "@pure\nfun asm_pair(a: cell,b: cell): [cell,cell] asm \"PAIR\"",library)
        assertTrue(result.main.contains("pairTvm(a,b)"),result.main)
        val wrong = normalize("fun check(a: cell,b: int): [cell,int] { return asm_pair(a,b); }",
            "@pure\nfun asm_pair(a: cell,b: int): [cell,int] asm \"PAIR\"",library)
        assertTrue(wrong.main.contains("asm_pair(a,b)"))
        val free = normalize("fun check(t: tuple): cell { return asm_head(t); }",
            "fun asm_head(t: tuple): cell asm \"CAR\"","fun head<X>(t: tuple): X asm \"CAR\"")
        assertTrue(free.main.contains("headTvm(t)"),free.main)
    }

    @Test fun `ambiguity unknown operands and wrong selectors do not borrow a standard name`() {
        for (library in listOf("fun now(): int asm \"4 GETPARAM\"",
            "fun now(): slice asm \"NOW\"","fun now(): int asm \"UNKNOWN NOW\"",
            "fun now(): int asm \"99 NOW\"","fun now(): int asm \"NOW 7\"",
            "fun now(): int asm \"NOW\"\nfun time(): int asm \"NOW\"")) {
            val result = normalize(main,helper,library)
            assertEquals(main,result.main); assertEquals(helper,result.support); assertTrue(result.changes.isEmpty())
        }
    }

    @Test fun `bound namespaces conflicting declarations and wrapper names get safe fallbacks`() {
        val library = "fun context.time(): int asm \"NOW\""
        val shadow = normalize(main.replace("fn_90097()","fn_90097(context: int)"),helper,library)
        assertTrue(shadow.main.contains("contextTimeTvm()"),shadow.main)
        val collision = normalize("global contextTimeTvm: int\n"+main,helper,"@pure\n$library")
        assertTrue(collision.main.contains("contextTimeTvm2()"))
        val definition = normalize("fun context.time(): int { return 7; }\n"+main,helper,library)
        assertTrue(definition.main.contains("return contextTimeTvm();"))
        val functionValue = normalize(main.replace("asm_clock()","asm_clock"),helper,library)
        assertEquals(helper,functionValue.support)
    }

    @Test fun `strings comments and unsupported annotations are preserved`() {
        val text = main.replace("return asm_clock();","val text = \"asm_clock\"; return asm_clock();")
        val result = normalize(text,helper,"@pure\nfun now(): int asm \"NOW\"")
        assertTrue(result.main.contains("\"asm_clock\""))
        val commented = helper.replace("asm ","asm /* retain */ ")
        assertEquals(commented,normalize(main,commented,"fun now(): int asm \"NOW\"").support)
        assertEquals("@inline\n$helper",normalize(main,"@inline\n$helper","fun now(): int asm \"NOW\"").support)
    }

    @Test fun `builtin implementations function bodies and unused helpers remain untouched`() {
        for (library in listOf("fun now(): int builtin","fun now(): int { return 7; }"))
            assertEquals(helper,normalize(main,helper,library).support)
        val unused = normalize("fun check(): int { return 7; }",helper,"fun now(): int asm \"NOW\"")
        assertEquals(helper,unused.support); assertTrue(unused.changes.isEmpty())
    }

    @Test fun `all eight unmodified official modules are pinned with hashes and license`() {
        val manifest = javaClass.getResourceAsStream("/tolk-stdlib/source.json")!!.use { ObjectMapper().readTree(it) }
        assertEquals("4539cfabf2877e09d13032861f36c1490d13a941",manifest["commit"].asText())
        assertEquals(8,manifest["files"].size())
        for (file in manifest["files"]) {
            val bytes = javaClass.getResourceAsStream("/tolk-stdlib/${file["name"].asText()}")!!.readBytes()
            assertEquals(file["sha256"].asText(),MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) })
        }
        assertTrue(javaClass.getResourceAsStream("/tolk-stdlib/LICENSE.LGPL")!!.readBytes().toString(Charsets.UTF_8).contains("GNU LIBRARY GENERAL PUBLIC LICENSE"))
        assertTrue(TolkStdlibCatalog.standard.declarations.any { it.name == "contract.getAddress" })
        assertTrue(TolkStdlibCatalog.standard.declarations.any { it.name == "slice.loadRef" && it.mutated == listOf(0) })
        assertTrue(TolkStdlibCatalog.standard.declarations.any { it.name == "calculateGasFee" && it.module == "gas-payments" })
        assertFalse(TolkStdlibCatalog.standard.declarations.any { it.name == "array.last" })
    }
}
