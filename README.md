# TVM → FunC / Tolk decompiler

Requires JDK 17+. Build the runnable JAR and run the unit/CLI tests:

```sh
./gradlew --no-daemon shadowJar test
java -jar build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar boc contract.boc -o output
java -jar build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar boc contract.boc --json --strict
java -jar build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar boc contract.boc --language tolk --strict -o output-tolk
```

`boc` accepts a file or literal; `--format` chooses binary, base64, hex or auto detection. `--json` returns complete, diagnostics and files. With -o, JSON is saved as result.json. `-n` excludes stdlib from output. `--exact` preserves some assembly forms; it does not guarantee identical bytecode for every input. The address subcommand is not implemented in this snapshot.

`--language func|tolk` selects the output language; FunC remains the default. Tolk output consists of main.tolk and stdlib.tolk. Both files are required for recompilation. The library exposes the same choice with `TvmDecompilerLib.facade().decompileBoc(boc, exact = false, language = OutputLanguage.TOLK)`.

The alpha Tolk generator uses the shared TVM IR and emits Tolk functions, branches, loops and method IDs. Assembly compatibility helpers preserve primitive argument/result order, constant slice bits/references and explicit global-register numbers. It emits onInternalMessage/onExternalMessage entrypoints and keeps generated getter names. Storage schemas, original names and high-level message types cannot be reconstructed from these BOCs. Compile the result with Acton: `acton compile output-tolk/main.tolk --allow-no-entrypoint --json`. This backend was checked with Acton 1.0.0 (3a4f0dc); other compiler versions have not been verified.

The library result exposes structured diagnostics for unsupported instructions, parser failures and function failures. Instruction diagnostics identify the method, mnemonic and logical instruction location. Complete means no such failures were detected, not that recompilation or equivalence has been proven.

The default CLI retains partial files for inspection and writes warnings to stderr. `--strict` exits with code 2 for incomplete decompilation, omitting partial source files; JSON still contains diagnostics. Fatal input/disassembly errors exit with code 1. Logs stay off stdout so JSON can be consumed by another process.

TRY/catch and dynamic continuations remain unsupported. MYCODE can change behavior if recompilation changes the code hash: derived addresses and returned code cells may change. Different gas usage can affect outgoing values in carry-value send modes.

The local improvements cover typed embedded INMSGPARAM/GETPARAM selectors, typed balance-pair access and executable Fift literals for referenced cells. Unit/CLI fixtures exercise an Acton Tolk counter, unsupported TRY and a dynamic EXECUTE.

Full BOC → decompile → FunC/Fift or Tolk/Acton → emulator checks are in [regression](regression/README.md). The corpus includes minimal examples of generation bugs and transaction probes for all eight contracts from Acton's empty, counter, nft, jetton and w5-extension templates. Use a TVM 11 capable Fift for FunC recompilation of these modern contracts. The legacy Gradle roundTripTest only runs source files supplied under func_sources. See the [measured results and limitations](docs/regression-results.md).

The [standalone HTML report](reports/acton-contracts.html) shows original Tolk, compiled TVM/BOC, generated FunC or Tolk and comparison results for all eight template contracts. Use the language selector to switch the generated code, recompiled artifacts and test results together. Download it and open it in a browser; it works offline and includes exact artifact downloads. Regeneration instructions are in the regression README.
