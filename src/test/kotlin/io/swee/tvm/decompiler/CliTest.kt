package io.swee.tvm.decompiler

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import java.util.concurrent.TimeUnit

class CliTest {
    private fun runBoc(name: String, strict: Boolean): Pair<Int, String> {
        val input = Files.createTempFile("tvm-cli-", ".boc")
        val stdout = Files.createTempFile("tvm-cli-", ".json")
        val stderr = Files.createTempFile("tvm-cli-", ".log")
        try {
            javaClass.getResourceAsStream("/$name.boc")!!.use { Files.write(input, it.readAllBytes()) }
            val java = Path.of(System.getProperty("java.home"), "bin", "java").toString()
            val args = mutableListOf(java, "-jar", "build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar",
                "boc", input.toString(), "--json")
            if (strict) args += "--strict"
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
        val (exitCode, stdout) = runBoc("try-catch", strict = true)
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
    }

    @Test
    fun `strict CLI accepts supported Acton counter`() {
        val (exitCode, stdout) = runBoc("acton-counter", strict = true)
        assertEquals(0, exitCode)
        val tree = ObjectMapper().readTree(stdout)
        assertTrue(tree["complete"].asBoolean())
        assertEquals(2, tree["files"].size())
    }
}
