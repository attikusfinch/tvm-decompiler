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

`--offline` only uses a cached response; --refresh replaces it. Cache identity includes the input code hash, endpoint or JAR SHA-256, and exact mode. Public and local results use separate artifact directories. `--filter` selects cases by name. `--exact` tests the alternative decompilation mode.

The 20-case corpus compiles fixture source, decompiles it, recompiles the output, and compares code-cell hashes and getter results in a local TON sandbox. Strict corpus mode rejects unexpected failures while recording TRY and dynamic EXECUTE as known unsupported cases. A partial result is never counted as a successful recompilation, even if its generated source could compile.

`npm run acton -- --local --native` checks all eight archived contracts from every built-in template (empty, counter, nft, jetton, w5-extension). This currently exits 1 because some observable effects differ, NftCollection returns a WHILE stack-depth diagnostic, and WalletV5 uses unsupported AGAINEND; see ../docs/regression-results.md. Synthetic storage, senders and messages are defined in fixtures/acton-probes.mjs. Each internal message starts with a fresh contract and identical input state, time and random seed. Original exit codes and successful outgoing-message counts are checked before trusting a comparison. Gas and outgoing values are recorded; remaining account balances are not compared. External-message flows are not compared by this harness. Getters that expose MYCODE are compared without suppressing their differing code hashes.

Optional --acton writes TASM disassembly with cell hashes and bit offsets. On Windows it uses WSL Ubuntu (WSL_DISTRO and ACTON_WSL_PATH override this); on Linux it uses acton from PATH. The emulator tests themselves do not require Acton to be installed.

Example BOC check:

```sh
npm run check -- --boc fixtures/bocs/getparam.boc --local --native
```

Artifacts contain the original and recompiled BOC, request/response metadata, FunC, compiler errors or diagnostics, and JSON reports. These are ignored by Git. Small reproducing BOCs and their hashes are committed under fixtures/bocs.

## Standalone HTML report

Run `npm run acton -- --local --native --acton` to generate all eight cases with TASM views (the known differences and partial outputs make this command exit 1). Then run `npm run report` separately. The exporter validates BOC hashes and saved FunC against the response and writes ../reports/acton-contracts.html. `--artifacts <directory>` and `--output <file>` override the input/output paths. The report is self-contained, works offline, includes the original Tolk import dependencies, and supports downloading exact code/BOC and comparison JSON. NftCollection and WalletV5 are visibly partial and have no recompiled BOC or comparison results.
