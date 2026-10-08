package io.swee.tvm.decompiler.cli

import io.swee.tvm.decompiler.api.TvmDecompilerResult
import com.fasterxml.jackson.databind.ObjectMapper
import java.io.File

object OutputWriter {

    private fun isStdlib(name: String) = name == "stdlib.fc" || name == "stdlib.tolk"

    fun json(result: TvmDecompilerResult, includeStdlib: Boolean = true, includeFiles: Boolean = true): String =
        ObjectMapper().writerWithDefaultPrettyPrinter().writeValueAsString(mapOf(
            "complete" to result.complete,
            "diagnostics" to result.diagnostics,
            "normalizations" to result.normalizations,
            "files" to if (includeFiles) result.files.filter { includeStdlib || !isStdlib(it.name) } else emptyList()
        ))

    fun writeJson(result: TvmDecompilerResult, outputDir: File? = null, includeStdlib: Boolean = true, includeFiles: Boolean = true) {
        val content = json(result, includeStdlib, includeFiles)
        if (outputDir == null) writeUtf8(content + "\n") else {
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
            if (!includeStdlib && isStdlib(file.name)) continue
            writeUtf8(";;;; file: ${file.name}\n${file.content}\n\n")
        }
    }

    private fun writeUtf8(content: String) {
        System.out.write(content.toByteArray(Charsets.UTF_8))
        System.out.flush()
    }

    private fun writeToDirectory(result: TvmDecompilerResult, outputDir: File, includeStdlib: Boolean = true) {
        outputDir.mkdirs()

        for (file in result.files) {
            if (!includeStdlib && isStdlib(file.name)) continue
            val outputFile = File(outputDir, file.name)
            outputFile.writeText(file.content)
            System.err.println("Wrote: ${outputFile.path}")
        }
    }
}
