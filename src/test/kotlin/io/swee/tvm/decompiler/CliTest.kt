package io.swee.tvm.decompiler

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

class CliTest {
    private fun runBoc(name: String, strict: Boolean, language: String = "func", noStdlib: Boolean = false, normalize: Boolean = true): Pair<Int, String> {
        val input = Files.createTempFile("tvm-cli-", ".boc")
        val stdout = Files.createTempFile("tvm-cli-", ".json")
        val stderr = Files.createTempFile("tvm-cli-", ".log")
        try {
            javaClass.getResourceAsStream("/$name.boc")!!.use { Files.write(input, it.readAllBytes()) }
            val java = Path.of(System.getProperty("java.home"), "bin", "java").toString()
            val args = mutableListOf(java, "-jar", "build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar",
                "boc", input.toString(), "--json")
            if (strict) args += "--strict"
            args += listOf("--language", language)
            if (noStdlib) args += "-n"
            if (!normalize) args += "--no-normalize"
            val process = ProcessBuilder(args).redirectOutput(stdout.toFile()).redirectError(stderr.toFile()).start()
            if (!process.waitFor(30, TimeUnit.SECONDS)) {
                process.destroyForcibly()
                fail<Nothing>("CLI timed out")
            }
            return process.exitValue() to Files.readString(stdout)
        } finally {
            Files.deleteIfExists(input)
            Files.deleteIfExists(stdout)
            Files.deleteIfExists(stderr)
        }
    }

    @Test
    fun `strict CLI rejects partial BOC and returns clean diagnostic JSON`() {
        val (exitCode, stdout) = runBoc("raw-try", strict = true)
        assertEquals(2, exitCode)
        val tree = ObjectMapper().readTree(stdout)
        assertFalse(tree["complete"].asBoolean())
        assertTrue(tree["diagnostics"].size() > 0)
        assertEquals(0, tree["files"].size())
    }

    @Test
    fun `normal CLI retains partial files for inspection`() {
        val (exitCode, stdout) = runBoc("dynamic-continuation", strict = false)
        assertEquals(0, exitCode)
        val tree = ObjectMapper().readTree(stdout)
        assertFalse(tree["complete"].asBoolean())
        assertEquals(2, tree["files"].size())
        assertTrue(tree["files"][1]["content"].asText().contains("“persistent data”"), stdout)
    }

    @Test
    fun `strict CLI accepts supported Acton counter`() {
        val (exitCode, stdout) = runBoc("acton-counter", strict = true)
        assertEquals(0, exitCode)
        val tree = ObjectMapper().readTree(stdout)
        assertTrue(tree["complete"].asBoolean())
        assertEquals(2, tree["files"].size())
    }

    @Test
    fun `Tolk CLI emits Tolk entrypoints and compatibility library`() {
        val (exitCode, stdout) = runBoc("acton-counter", strict = true, language = "tolk")
        assertEquals(0, exitCode)
        val result = ObjectMapper().readTree(stdout)
        assertTrue(result["complete"].asBoolean())
        assertEquals(listOf("main.tolk", "stdlib.tolk"), result["files"].map { it["name"].asText() })
        assertTrue(result["files"][0]["content"].asText().contains("fun onInternalMessage"))
    }

    @Test
    fun `Tolk strict mode rejects unsupported code and no stdlib applies to both languages`() {
        val (partialExit, partialOutput) = runBoc("raw-try", strict = true, language = "tolk")
        assertEquals(2, partialExit)
        val partial = ObjectMapper().readTree(partialOutput)
        assertFalse(partial["complete"].asBoolean())
        assertEquals(0, partial["files"].size())
        val (exitCode, stdout) = runBoc("acton-counter", strict = true, language = "tolk", noStdlib = true)
        assertEquals(0, exitCode)
        assertEquals(listOf("main.tolk"), ObjectMapper().readTree(stdout)["files"].map { it["name"].asText() })
    }

    @Test
    fun `Tolk normalization is separate from raw output and preserves the support library`() {
        val (normalizedExit, normalizedJson) = runBoc("acton-counter", strict = true, language = "tolk")
        val (rawExit, rawJson) = runBoc("acton-counter", strict = true, language = "tolk", normalize = false)
        assertEquals(0, normalizedExit)
        assertEquals(0, rawExit)
        val mapper = ObjectMapper()
        val normalized = mapper.readTree(normalizedJson)
        val raw = mapper.readTree(rawJson)
        assertTrue(normalized["files"][0]["content"].asText().contains("get fun owner(): address"))
        assertTrue(raw["files"][0]["content"].asText().contains("@method_id(83229)\nfun fn_83229(): slice"))
        assertEquals(raw["files"][1], normalized["files"][1])
        assertTrue(normalized["normalizations"].map { it["rule"].asText() }.containsAll(
            listOf("address-getter-return", "owner-getter-name", "abi-getter-name", "boolean-guard")))
        assertEquals(0, raw["normalizations"].size())
        assertEquals(raw["diagnostics"], normalized["diagnostics"])
    }
}
