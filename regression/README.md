# Decompiler regression harness

Requires Node 22+, a built decompiler JAR, and FunC/Fift capable of assembling TVM 11 instructions. Dependencies are pinned in package-lock.json. Native tool download URLs and SHA-256 digests are recorded in toolchain-lock.json; downloaded executables are not committed.

From the repository root:

```sh
./gradlew --no-daemon shadowJar test
cd regression
npm ci --ignore-scripts
npm test
npm run corpus -- --local --native --strict
npm run acton -- --local --native --filter Counter
```

Native tools are found in PATH by default. Set FUNC_EXE, FIFT_EXE and FIFT_LIB when necessary. On Windows, for example:

```powershell
$env:JAVA_EXE="$env:JAVA_HOME\bin\java.exe"
$env:FUNC_EXE='C:\ton\func.exe'
$env:FIFT_EXE='C:\ton\fift.exe'
$env:FIFT_LIB='C:\ton\lib'
npm run corpus -- --local --native --strict
```

`--local` runs the patched JAR under ../build/libs. LOCAL_DECOMPILER_JAR and JAVA_EXE override its location and runtime. Without --local, scripts query the public swap.coffee API; API requests are sequential and cached. DECOMPILER_URL selects another endpoint. Omit --native to use the pinned WASM compiler, whose older Fift does not support some TVM 11 mnemonics.

`--offline` only uses a cached response; --refresh replaces it. Cache identity includes the input code hash, endpoint or JAR SHA-256, exact mode and output language. Public and local results use separate artifact directories. `--filter` selects cases by name. `--exact` tests the alternative decompilation mode.

Use `--language tolk --local` for the Tolk backend. Recompilation uses Acton's embedded compiler; Acton 1.0.0 (3a4f0dc) is the verified version. Linux/macOS use acton from PATH, or ACTON_EXE. Windows uses WSL Ubuntu unless ACTON_EXE selects a native executable; ACTON_WSL_PATH and WSL_DISTRO override the WSL executable and distribution. `--native` still selects the compiler for the original FunC corpus fixtures. Tolk artifacts are saved in a separate tolk subdirectory so FunC results remain available.

```sh
npm run verify:tolk
npm run acton -- --local --native --language tolk --acton
npm run tolk:edges
npm run tolk:normalization
npm run tolk:matches
npm run tolk:patterns
```

`tolk:edges` requires the Tolk NftItem artifacts from the preceding Acton run. Its 13 getter probes check explicit global slot 7, side effects in loop conditions, branch/argument evaluation order, dynamic exception arguments even when no exception is raised, independent builder snapshots, and null owner/content returned by an uninitialized NFT item. Partial-result rejection applies to both output languages. Public swap.coffee requests support only FunC in this harness.

Tolk's local Acton run also obtains `--no-normalize` output under each case's `raw` directory, compiles both stages and requires identical TVM code for the current presentation/type rules. Requests/cache identities include the normalization setting. `tolk:normalization` has seven complete fixtures for unknown getter IDs, incompatible signatures, nullable returns, successful/failing assertions, integer null values/branches and a counter ABI candidate: 26 probes compare valid/truncated storage. Another fixture checks that the parser's known dynamic EXECUTE in an internal getter call leaves partial files/diagnostics unchanged and skips normalization. `tolk:patterns` regenerates ../docs/tolk-patterns.json from all eight raw/normalized results, including counts for both stages. The [normalization catalog](../docs/tolk-normalization-patterns.md) distinguishes implemented rules from future candidates.

The 20-case corpus compiles fixture source, decompiles it, recompiles the output, and compares code-cell hashes and getter results in a local TON sandbox. Strict corpus mode rejects unexpected failures while recording TRY and dynamic EXECUTE as known unsupported cases. A partial result is never counted as a successful recompilation, even if its generated source could compile.

`tolk:matches` compiles seven compiler-derived prefix fixtures, decompiles/recompiles both stages and checks original/raw/normalized code-cell identity. Its 348 getter probes also require identical gas and cover truncated prefix/payload bits, unknown opcodes, 4/8/32-bit widths, leading zeroes and tail references. Overlapping prefixes, live unmatched tails and nonterminal joins stay explicit. Unit tests additionally reject nested early returns and a conditional/block immediately before the terminal return: wrapping them in a match arm can change the compiler's IFJMP/IFNOT selection. Raw Tolk retains the original embedded SDBEGINSQ through exact asm helpers; actual SDBEGINSXQ instructions remain dynamic helpers.

`npm run acton -- --local --native` checks all eight archived contracts from every built-in template (empty, counter, nft, jetton, w5-extension). This currently exits 1 because some observable effects differ, NftCollection returns a WHILE stack-depth diagnostic, and WalletV5 uses unsupported AGAINEND; see ../docs/regression-results.md. Synthetic storage, senders and messages are defined in fixtures/acton-probes.mjs. Each internal message starts with a fresh contract and identical input state, time and random seed. Original exit codes and successful outgoing-message counts are checked before trusting a comparison. Gas and outgoing values are recorded; remaining account balances are not compared. External-message flows are not compared by this harness. Getters that expose MYCODE are compared without suppressing their differing code hashes.

Optional --acton writes TASM disassembly with cell hashes and bit offsets. On Windows it uses WSL Ubuntu (WSL_DISTRO and ACTON_WSL_PATH override this); on Linux it uses acton from PATH. The emulator tests themselves do not require Acton to be installed.

Example BOC check:

```sh
npm run check -- --boc fixtures/bocs/getparam.boc --local --native
```

Artifacts contain the original and recompiled BOC, request/response metadata, generated sources, compiler errors or diagnostics, and JSON reports. These are ignored by Git. Small reproducing BOCs and their hashes are committed under fixtures/bocs.

## Standalone HTML report

Run `npm run acton -- --local --native --acton` to generate all eight FunC cases with TASM views, and the same command with `--language tolk` for Tolk. Known differences and partial outputs make both commands exit 1. Then run `npm run report` separately. The exporter validates original/recompiled BOC hashes and saved sources against each response and writes ../reports/acton-contracts.html. It includes a Tolk selector when the tolk/report.json artifact is available. `--artifacts <directory>`, `--tolk-artifacts <directory>` and `--output <file>` override paths. The report is self-contained, works offline, includes original Tolk import dependencies, and supports downloading exact code/BOC and comparison JSON. Each language retains its own JAR SHA-256, compiler metadata and check timestamp. NftCollection and WalletV5 are visibly partial and have no recompiled BOC or comparison results.
