# Regression results, 2026-10-08

Baseline: swiftail/tvm-decompiler commit 2e10e7bbd0ac44c33614c9118774e36e74f2ed80. Public API: https://decompiler.swap.coffee/api/v1/decompile (deployed commit unknown). Both baseline API and patched output were assembled with official TON v2026.08 FunC/Fift, commit 3d478cbde854be03a18ab2a59f8fc3c565cf7d14. Different assembler support does not explain the baseline failures below.

| Check | Public API | Patched local decompiler |
|---|---|---|
| 20 minimal FunC cases | 15 pass; 3 generation errors; 2 incomplete | 18 pass; 2 incomplete; no unexpected failures |
| Identical code-cell hashes in corpus | 12 | 15 |
| Getter probes in passing corpus cases | 68 | 71 |
| Acton Counter | Compilation error | 2/2 getters and 9/9 messages match |
| Acton NFT Item | Compilation error | Compiles; getter matches; 8/8 storage/action results match |
| Acton Jetton Wallet | Compilation error | Compiles; 9/10 storage/action results match |
| Acton Jetton Minter | Compilation error | Compiles; 3/3 getters and 10/10 storage/action results match |

Kotlin unit/CLI tests: 8 passed. Harness unit tests: 4 passed. Original Acton template tests: 77 passed. These counts are separate from emulator comparisons of recompiled contracts. The legacy Gradle roundTripTest had no func_sources fixtures in this snapshot; the committed Node harness performs the actual compilation round trips.

The three newly passing minimal cases reproduce typed BALANCE indexing, embedded GETPARAM selectors, and a PUSHREF cell containing references. Counter also reproduces INMSGPARAM result typing and embedded selectors. The incomplete cases exercise TRY and dynamic EXECUTE and now return structured diagnostics instead of a success-shaped partial result.

## Observable differences still present

Across the archived Acton fixtures, 33/37 message outcomes match including outgoing values; 36/37 match exit code, storage and original actions. All original-message expectations pass. This is finite probe coverage, not a proof of equivalence.

- NFT static-data response uses 2224 gas before and 2248 after. Its outgoing value changes from 999737131 to 999735531 nanotons. Body, destination, storage and the SENDMSG action match; the carried value changes with gas costs.
- Jetton wallet burn and minter discovery also differ in outgoing carried value despite matching original actions.
- Jetton wallet returns its own code and uses MYCODE to build another wallet's state-init. Recompilation changes the code hash, so get_wallet_data returns a different code cell and transfer derives a different destination/state-init. This is a material behavioral difference and is retained as a failed comparison, not normalized away.
- The same differences remain with --exact on these Tolk templates. Exact mode is not a general guarantee of byte-identical recompilation.

Gas is reported separately; remaining account balances are not compared. Every message starts from independent original storage and fixed emulator time/random seed. A code-cell identity comparison is distinct from equality of BOC serialization bytes. No chain deployment is involved in these tests.

TRY/catch and dynamic continuations remain unsupported. Complete means no detected parsing failures, not verified recompilation or equivalence. The CLI's strict mode is intended to let callers reject known partial outputs before compilation.
