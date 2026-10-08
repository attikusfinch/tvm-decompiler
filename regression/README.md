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
npm run tolk:recovery
npm run tolk:builders
npm run tolk:nullable
npm run tolk:loops
npm run tolk:again
npm run tolk:exceptions
npm run tolk:dispatch
npm run tolk:messages
npm run dispatch:ambiguity
npm run tolk:audit
npm run tolk:patterns
```

`tolk:edges` requires the Tolk NftItem artifacts from the preceding Acton run. Its 13 getter probes check explicit global slot 7, side effects in loop conditions, branch/argument evaluation order, dynamic exception arguments even when no exception is raised, independent builder snapshots, and null owner/content returned by an uninitialized NFT item. Partial-result rejection applies to both output languages. Public swap.coffee requests support only FunC in this harness.

Tolk's local Acton run also obtains `--no-normalize` output under each case's `raw` directory, compiles both stages and requires identical TVM code for the current presentation/type rules. Requests/cache identities include the normalization setting. `tolk:normalization` has seven complete fixtures for unknown getter IDs, incompatible signatures, nullable returns, successful/failing assertions, integer null values/branches and a counter ABI candidate: 26 probes compare valid/truncated storage. Another fixture checks that the parser's known dynamic EXECUTE in an internal getter call leaves partial files/diagnostics unchanged and skips normalization. `tolk:patterns` regenerates ../docs/tolk-patterns.json from all eight raw/normalized results, including counts for both stages. The [normalization catalog](../docs/tolk-normalization-patterns.md) distinguishes implemented rules from future candidates.

The 20-case corpus compiles fixture source, decompiles it, recompiles the output, and compares code-cell hashes and getter results in a local TON sandbox. Nineteen cases now compile; canonical TRY passes its four probes. Strict corpus mode rejects unexpected failures while recording dynamic EXECUTE as known unsupported. A partial result is never counted as a successful recompilation, even if its generated source could compile.

`tolk:matches` compiles seven compiler-derived prefix fixtures, decompiles/recompiles both stages and checks original/raw/normalized code-cell identity. Its 348 getter probes also require identical gas and cover truncated prefix/payload bits, unknown opcodes, 4/8/32-bit widths, leading zeroes and tail references. Overlapping prefixes, live unmatched tails and nonterminal joins stay explicit. Unit tests additionally reject nested early returns and a conditional/block immediately before the terminal return: wrapping them in a match arm can change the compiler's IFJMP/IFNOT selection. Raw Tolk retains the original embedded SDBEGINSQ through exact asm helpers; actual SDBEGINSXQ instructions remain dynamic helpers.

`tolk:recovery` exercises the first batch of the [compiler recovery specification](../docs/compiler-recovery-spec.md): integer match, CONDSEL/ternary and exact cursor loads. It compiles original/raw/normalized separately, requires raw/normalized code-cell and serialized-BOC identity, compares getter behavior and gas, and compares original behavior independently. It includes signed/large/unknown match values, underflow, different source spellings, retained joins/early returns, erased runtime types, live slice snapshots, dynamic/signed widths, refs, coins and discarded results. Original/raw hash differences are reported separately and do not count as an exact original round trip.

`tolk:builders` exercises N05 with 17 compiler-derived fixtures and 202 getter probes. Functional exact methods cover 13 store operations without changing original builder snapshots, opcodes, argument order or exceptions. Probes include zero/negative/maximum/oversized coins, dynamic widths, nullable refs and addresses, invalid slices, bit/ref overflow, dead results, nested chains and effects in receiver/arguments. Raw/normalized code-cell, serialized BOC and gas must match. Original behavior is checked independently; only 8/17 original/raw code cells are identical, with existing raw differences recorded in the report. The shared recovery runner is reusable by subsequent families.

`npm run acton -- --local --native` checks all eight archived contracts from every built-in template (empty, counter, nft, jetton, w5-extension). All eight now compile in both languages. The command exits 1 because six original/recompiled message outcomes and one getter still differ; see ../docs/regression-results.md. WalletV5 passes 5/5 getters, 10/10 message outcomes and 10/10 state/action comparisons. NftCollection passes 4/4 getters, 11/12 message outcomes with values and 12/12 state/action comparisons. Synthetic storage, senders and messages are defined in fixtures/acton-probes.mjs. Each internal message starts with a fresh contract and identical input state, time and random seed. Original exit codes and successful outgoing-message counts are checked before trusting a comparison. Gas and outgoing values are recorded; remaining account balances are not compared. External-message flows are not compared by this harness. Getters that expose MYCODE are compared without suppressing their differing code hashes.

`tolk:again` covers P02 with six compiler-derived fixtures / 36 probes: infinite loops with scalar/tuple returns, global effects, exceptions, ref-chain cursors and c5 POPCTR/PUSHCTR. Original behavior and raw/normalized BOC plus gas match for every probe; 5/6 original/raw code cells are identical. AGAINBRK/AGAINENDBRK and arbitrary continuation targets remain unsupported. The WalletV5 message probes also catch removal of void effectful calls by FunC when `impure` is missing from asm definitions or inline-ref forward declarations.

`tolk:exceptions` covers P03 with ten compiler-derived fixtures / 75 probes: canonical register-saving TRY envelopes, captured values/snapshots, exception code/value including cell/null, nested rethrow, early return and c4/c5/c7 restoration. Every probe preserves original behavior and raw/normalized BOC plus gas; 1/10 original/raw code cells is identical. Only the proven compiler envelope is recovered. Noncanonical handlers, more than one capture chunk and TRYARGS retain diagnostics; unit/CLI tests use a separate noncanonical TRY fixture for strict rejection.

`tolk:dispatch` covers fixed CALLXARGS and static JMPX with six fixtures /
132 probes on both output languages. Runtime callback slices/cells, invalid
code, null/cell inputs and zero/two results exercise the encoded ABI without
giving callback bodies to the decompiler. Five fixed-call cases preserve the
original code-cell and gas. JMPX drops unreachable caller code, preserving
behavior but changing original code/gas. Raw/normalized BOC and gas are equal.
`dispatch:ambiguity` proves why unbounded EXECUTE/CALLXARGS_VAR/dynamic JMPX
cannot recover a unique return width: three scalar/tensor source pairs compile
to identical code, while runtime callbacks return 0/1/2 slots. Both languages
retain the same partial files/diagnostics with normalization skipped.

`tolk:messages` covers native SENDRAWMSG and exact send-mode constants with
11 fixtures / 197 internal messages. Inline/ref bodies, state-init, bounce,
balance draining, invalid cells/modes, underflow and c4 effects exercise actual
outgoing values. Raw/normalized BOC plus gas and full behavior match; original
state/actions match 197/197, full outcomes 166/197. Original/raw code and gas
differences remain separately recorded. This suite initializes accurate storage
stats for synthetic accounts; Sandbox's default zeros can underflow when the
balance shrinks with unchanged refs. Existing template initialization is preserved.

Optional --acton writes TASM disassembly with cell hashes and bit offsets. On Windows it uses WSL Ubuntu (WSL_DISTRO and ACTON_WSL_PATH override this); on Linux it uses acton from PATH. The emulator tests themselves do not require Acton to be installed.

Example BOC check:

```sh
npm run check -- --boc fixtures/bocs/getparam.boc --local --native
```

Artifacts contain the original and recompiled BOC, request/response metadata, generated sources, compiler errors or diagnostics, and JSON reports. These are ignored by Git. Small reproducing BOCs and their hashes are committed under fixtures/bocs.

`tolk:nullable` covers N07/N08 with 14 compiler-derived fixtures and 144
getter probes. Terminal lazy ISNULL/phi forms become ??; live result,
effectful fallback and eager CONDSEL forms remain explicit. LDOPTSTDADDR
gets exact nullable cursor methods with its reversed tuple order, retained
legacy consumers, snapshots and discarded-result exceptions. Standalone
external getters can expose native address?. Null int/cell slots,
addr_none/std/truncated/var, refs and load/store chains are checked. Both
normalized/raw BOC representations and gas must match, while original
behavior/hash are checked separately. 13/14 original/raw code cells match.

`tolk:loops` exercises WHILE recovery with eight compiler-derived fixtures
and 70 probes: precomputed flags/empty conditions, carried values, arbitrary
initial truthy flags, nesting, global/cursor condition effects, body throws
and dictionary min/next with empty/null dictionaries. Raw/normalized BOC
and gas are identical. Original behavior matches; only the dictionary
fixture is original/raw code-cell identical. Other original/raw differences
are recorded separately. Permanent Kotlin fixtures additionally check the
one-argument loop ABI and NftCollection/CALLREF completeness on both outputs.

`tolk:audit` checks the complete recovery/builders/nullable/loops report
counts, all probe outcomes and raw/normalized gas/BOC identities against
the current JAR SHA-256 in every cached request. It detects stale or partial
suite reports without re-running compilation.

## Standalone HTML report

Run `npm run acton -- --local --native --acton` to generate all eight FunC cases with TASM views, and the same command with `--language tolk` for Tolk. Known differences and partial outputs make both commands exit 1. Then run `npm run report` separately. The exporter validates original/recompiled BOC hashes and saved sources against each response and writes ../reports/acton-contracts.html. It includes a Tolk selector when the tolk/report.json artifact is available. `--artifacts <directory>`, `--tolk-artifacts <directory>` and `--output <file>` override paths. The report is self-contained, works offline, includes original Tolk import dependencies, and supports downloading exact code/BOC and comparison JSON. Each language retains its own JAR SHA-256, compiler metadata and check timestamp. All eight outputs include raw/normalized recompilation and comparison; original/recompiled differences remain visible in the report.
