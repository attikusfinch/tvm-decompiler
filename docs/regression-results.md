# Regression results, 2026-10-08

Baseline: swiftail/tvm-decompiler commit 2e10e7bbd0ac44c33614c9118774e36e74f2ed80. Public API: https://decompiler.swap.coffee/api/v1/decompile (deployed commit unknown). Both baseline API and patched output were assembled with official TON v2026.08 FunC/Fift, commit 3d478cbde854be03a18ab2a59f8fc3c565cf7d14. Different assembler support does not explain the baseline failures below.

| Check | Public API | Patched local decompiler |
|---|---|---|
| 20 minimal FunC cases | 15 pass; 3 generation errors; 2 incomplete | 18 pass; 2 incomplete; no unexpected failures |
| Identical code-cell hashes in corpus | 12 | 15 |
| Getter probes in passing corpus cases | 68 | 71 |
| Acton Counter | Compilation error | 2/2 getters and 9/9 messages match |
| Acton Empty | Not queried | 1/1 getter and 5/5 internal messages match |
| Acton NFT Collection | Not queried | Partial output: WHILE / Stack depth mismatch; no recompilation or behavior comparison |
| Acton NFT Item | Compilation error | Compiles; getter matches; 8/8 storage/action results match |
| Acton Jetton Wallet | Compilation error | Compiles; 9/10 storage/action results match |
| Acton Jetton Minter | Compilation error | Compiles; 3/3 getters and 10/10 storage/action results match |
| Acton SimpleExtension | Not queried | Compiles; 1/1 getter, 6/7 internal message outcomes and 7/7 storage/action results match |
| Acton WalletV5 | Not queried | Partial output: unsupported AGAINEND; no recompilation or behavior comparison |

Kotlin unit/CLI tests: 10 passed, including Tolk output selection and strict partial-result rejection. Harness unit tests: 4 passed. Original Acton template tests: 85 passed across all five built-in templates. These counts are separate from emulator comparisons of recompiled contracts. The legacy Gradle roundTripTest had no func_sources fixtures in this snapshot; the committed Node harness performs the actual compilation round trips.

The three newly passing minimal cases reproduce typed BALANCE indexing, embedded GETPARAM selectors, and a PUSHREF cell containing references. Counter also reproduces INMSGPARAM result typing and embedded selectors. The incomplete cases exercise TRY and dynamic EXECUTE and now return structured diagnostics instead of a success-shaped partial result.

## Observable differences still present

Across the six recompiled Acton fixtures, 44/49 internal-message outcomes match including outgoing values; 48/49 match exit code, storage and original actions. Eight of nine getter probes match. All original-message expectations pass. NftCollection returns PARSER_ERROR for WHILE at logical location Lambda:#24 in method 0. WalletV5 returns UNSUPPORTED_INSTRUCTION for AGAINEND at Lambda:#2 in method -1000. Their nine getters and twenty-two internal-message probes are not compared because the outputs are incomplete. External messages are not compared. This is finite probe coverage, not a proof of equivalence.

The standalone [HTML report](../reports/acton-contracts.html) contains original Tolk source, TVM disassembly and BOC, generated FunC/Tolk, recompilation hashes, and emulator comparison details for all eight contracts from all five built-in templates. Its language selector switches code and corresponding results; JAR hashes and compiler/check metadata are recorded separately for each language.

- NFT static-data response uses 2224 gas before and 2248 after. Its outgoing value changes from 999737131 to 999735531 nanotons. Body, destination, storage and the SENDMSG action match; the carried value changes with gas costs.
- Jetton wallet burn and minter discovery also differ in outgoing carried value despite matching original actions.
- SimpleExtension cancellation uses 2906 gas before and 3047 after; the carried outgoing value changes from 999708065 to 999698665 nanotons. Storage, body, destination and original actions match.
- Jetton wallet returns its own code and uses MYCODE to build another wallet's state-init. Recompilation changes the code hash, so get_wallet_data returns a different code cell and transfer derives a different destination/state-init. This is a material behavioral difference and is retained as a failed comparison, not normalized away.
- The same differences remain with --exact on these Tolk templates. Exact mode is not a general guarantee of byte-identical recompilation.

Gas is reported separately; remaining account balances are not compared. Every message starts from independent original storage and fixed emulator time/random seed. A code-cell identity comparison is distinct from equality of BOC serialization bytes. No chain deployment is involved in these tests.

TRY/catch and dynamic continuations remain unsupported. Complete means no detected parsing failures, not verified recompilation or equivalence. The CLI's strict mode is intended to let callers reject known partial outputs before compilation.

## Tolk output backend

Tolk recompilation used Acton 1.0.0 (3a4f0dc 2026-05-11). The 20-case corpus has 18 passing recompilations, 71 matching getter probes, four identical code-cell hashes and no unexpected failures. TRY and dynamic EXECUTE are the same two known partial cases. A separate six-probe check passes for global slot 7, repeated side effects in loop conditions and null owner/content on the uninitialized NFT getter branch. The existing FunC corpus still has 18 passing recompilations and 15 identical code-cell hashes.

All six complete Acton template outputs compile as Tolk: Empty, Counter, NftItem, JettonWallet, JettonMinter and SimpleExtension. Eight of nine getter probes match; 44/49 internal-message outcomes match including outgoing values; 48/49 match exit/storage/raw actions. Empty and Counter pass every executed probe. The MYCODE and carried-value differences described above also occur with Tolk, with different gas figures available in the HTML. NftCollection and WalletV5 retain the shared parser's WHILE and AGAINEND diagnostics; neither is counted as a working Tolk recompilation. External-message flows remain untested.

The backend emits from the shared IR, with Tolk control flow and a generated assembly compatibility library. It preserves method IDs, TVM primitive stack order, constant slice bits/references and global slot numbers. It does not recover original source names or Acton storage/message schemas, and it does not guarantee byte-identical output. Compilation and probes establish coverage for these examples only.
