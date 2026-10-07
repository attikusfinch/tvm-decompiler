package io.swee.tvm.decompiler.cli

import io.swee.tvm.decompiler.api.TvmDecompilerResult
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.File

object OutputWriter {

    fun json(result: TvmDecompilerResult, includeStdlib: Boolean = true, includeFiles: Boolean = true): String =
        ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(mapOf(
            "complete" to result.complete,
            "diagnostics" to result.diagnostics,
            "files" to if (includeFiles) result.files.filter { includeStdlib || it.name != "stdlib.fc" } else emptyList()
        ))

    fun writeJson(result: TvmDecompilerResult, outputDir: File? = null, includeStdlib: Boolean = true, includeFiles: Boolean = true) {
        val content = json(result, includeStdlib, includeFiles)
        if (outputDir == null) println(content) else {
            outputDir.mkdirs()
            File(outputDir, "result.json").writeText(content + "\n")
        }
    }

    fun write(result: TvmDecompilerResult, outputDir: File? = null, includeStdlib: Boolean = true) {
        if (outputDir == null) {
            writeToStdout(result, includeStdlib)
        } else {
            writeToDirectory(result, outputDir, includeStdlib)
        }
    }

    private fun writeToStdout(result: TvmDecompilerResult, includeStdlib: Boolean = true) {
        for (file in result.files) {
            if (!includeStdlib && file.name == "stdlib.fc") continue
            println(";;;; file: ${file.name}")
            println(file.content)
            println()
        }
    }

    private fun writeToDirectory(result: TvmDecompilerResult, outputDir: File, includeStdlib: Boolean = true) {
        outputDir.mkdirs()

        for (file in result.files) {
            if (!includeStdlib && file.name == "stdlib.fc") continue
            val outputFile = File(outputDir, file.name)
            outputFile.writeText(file.content)
            System.err.println("Wrote: ${outputFile.path}")
        }
    }
}
