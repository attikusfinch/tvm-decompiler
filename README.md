# TVM → FunC decompiler

Requires JDK 17+. Build the runnable JAR and run the unit/CLI tests:

```sh
./gradlew --no-daemon shadowJar test
java -jar build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar boc contract.boc -o output
java -jar build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar boc contract.boc --json --strict
```

`boc` accepts a file or literal; `--format` chooses binary, base64, hex or auto detection. `--json` returns complete, diagnostics and files. With -o, JSON is saved as result.json. `-n` excludes stdlib from output. `--exact` preserves some assembly forms; it does not guarantee identical bytecode for every input. The address subcommand is not implemented in this snapshot.

The library result exposes structured diagnostics for unsupported instructions, parser failures and function failures. Instruction diagnostics identify the method, mnemonic and logical instruction location. Complete means no such failures were detected, not that recompilation or equivalence has been proven.

The default CLI retains partial files for inspection and writes warnings to stderr. `--strict` exits with code 2 for incomplete decompilation, omitting partial source files; JSON still contains diagnostics. Fatal input/disassembly errors exit with code 1. Logs stay off stdout so JSON can be consumed by another process.

TRY/catch and dynamic continuations remain unsupported. MYCODE can change behavior if recompilation changes the code hash: derived addresses and returned code cells may change. Different gas usage can affect outgoing values in carry-value send modes.

The local improvements cover typed embedded INMSGPARAM/GETPARAM selectors, typed balance-pair access and executable Fift literals for referenced cells. Unit/CLI fixtures exercise an Acton Tolk counter, unsupported TRY and a dynamic EXECUTE.

Full BOC → decompile → FunC/Fift → emulator checks are in [regression](regression/README.md). The corpus includes minimal examples of generation bugs and transaction probes for all eight contracts from Acton's empty, counter, nft, jetton and w5-extension templates. Use a TVM 11 capable Fift for these modern Tolk outputs. The legacy Gradle roundTripTest only runs source files supplied under func_sources. See the [measured results and limitations](docs/regression-results.md).

The [standalone HTML report](reports/acton-contracts.html) shows original Tolk, compiled TVM/BOC, generated FunC and comparison results for all eight template contracts. Download it and open it in a browser; it works offline and includes exact artifact downloads. Regeneration instructions are in the regression README.
