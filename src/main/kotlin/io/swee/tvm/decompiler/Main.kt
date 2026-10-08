@file:OptIn(ExperimentalCli::class)

package io.swee.tvm.decompiler

import io.swee.tvm.decompiler.api.TvmDecompilerResult
import io.swee.tvm.decompiler.api.OutputLanguage
import io.swee.tvm.decompiler.cli.*
import kotlinx.cli.*
import java.io.File
import kotlin.system.exitProcess

fun main(args: Array<String>) {
    val parser = ArgParser("tvm-decompiler")

    class BocCmd : Subcommand("boc", "Decompile from BOC file or literal") {
        val input by argument(ArgType.String, description = "BOC file path or inline BOC data")

        val format by option(ArgType.Choice(listOf("auto", "binary", "base64", "hex"), { it }), shortName = "f", description = "Input format (default: auto)")
            .default("auto")

        val output by option(ArgType.String, shortName = "o", description = "Output directory (default: stdout)")

        val language by option(ArgType.Choice(listOf("func", "tolk"), { it }), fullName = "language",
            description = "Output language: func or tolk (default: func)").default("func")

        val noStdlib by option(ArgType.Boolean, shortName = "n", description = "Exclude the generated support library from output")
            .default(false)

        val noNormalize by option(ArgType.Boolean, fullName = "no-normalize", description = "Return Tolk before the separate normalization stage")
            .default(false)

        val exact by option(ArgType.Boolean, shortName = "e", fullName = "exact", description = "Byte-exact mode: keep asm_* wrappers for constant-slice opcodes")
            .default(false)

        val json by option(ArgType.Boolean, fullName = "json", description = "Output JSON with complete, diagnostics and files (result.json with -o)")
            .default(false)

        val strict by option(ArgType.Boolean, fullName = "strict", description = "Reject partial results with exit code 2; omit partial files")
            .default(false)

        override fun execute() {
            val bocFormat = when (format) {
                "auto" -> BocFormat.AUTO
                "binary" -> BocFormat.BINARY
                "base64" -> BocFormat.BASE64
                "hex" -> BocFormat.HEX
                else -> BocFormat.AUTO
            }

            try {
                val boc = BocDecoder.decode(input, bocFormat)
                val facade = TvmDecompilerLib.facade()
                val result: TvmDecompilerResult = facade.decompileBoc(boc, exact,
                    if (language == "tolk") OutputLanguage.TOLK else OutputLanguage.FUNC, normalize = !noNormalize)

                val outputDir = output?.let { File(it) }
                if (!result.complete) {
                    System.err.println("Partial decompilation: ${result.diagnostics.size} diagnostic(s)")
                    result.diagnostics.forEach {
                        System.err.println("${it.kind}: method=${it.methodId} ${it.mnemonic ?: ""} ${it.location ?: ""}: ${it.message}")
                    }
                }
                if (json) OutputWriter.writeJson(result, outputDir, includeStdlib = !noStdlib, includeFiles = !strict || result.complete)
                else if (!strict || result.complete) OutputWriter.write(result, outputDir, includeStdlib = !noStdlib)
                if (strict && !result.complete) exitProcess(2)
            } catch (e: Exception) {
                System.err.println("Error: ${e.message}")
                exitProcess(1)
            }
        }
    }

    class AddressCmd : Subcommand("address", "Decompile from TON address") {
        val address by argument(ArgType.String, description = "TON address")

        val output by option(ArgType.String, shortName = "o", description = "Output directory (default: stdout)")

        override fun execute() {
            try {
                val facade = TvmDecompilerLib.facade()
                val result: TvmDecompilerResult = facade.decompileAddress(address)

                val outputDir = output?.let { File(it) }
                OutputWriter.write(result, outputDir)
            } catch (e: Exception) {
                System.err.println("Error: ${e.message}")
                exitProcess(1)
            }
        }
    }

    parser.subcommands(BocCmd(), AddressCmd())

    try {
        parser.parse(args)
    } catch (e: IllegalStateException) {
        System.err.println("Error: ${e.message}")
        exitProcess(1)
    }
}
