# Regression results, 2026-10-08

Baseline: swiftail/tvm-decompiler commit 2e10e7bbd0ac44c33614c9118774e36e74f2ed80. Public API: https://decompiler.swap.coffee/api/v1/decompile (deployed commit unknown). Both baseline API and patched output were assembled with official TON v2026.08 FunC/Fift, commit 3d478cbde854be03a18ab2a59f8fc3c565cf7d14. Different assembler support does not explain the baseline failures below.

| Check | Public API | Patched local decompiler |
|---|---|---|
| 20 minimal FunC cases | 15 pass; 3 generation errors; 2 incomplete | 19 pass; 1 incomplete; no unexpected failures |
| Identical code-cell hashes in corpus | 12 | 15 |
| Getter probes in passing corpus cases | 68 | 75 |
| Acton Counter | Compilation error | 2/2 getters and 9/9 messages match |
| Acton Empty | Not queried | 1/1 getter and 5/5 internal messages match |
| Acton NFT Collection | Not queried | Compiles on FunC/Tolk; 4/4 getters, 11/12 messages with values, 12/12 state/action results match |
| Acton NFT Item | Compilation error | Compiles; getter matches; 8/8 storage/action results match |
| Acton Jetton Wallet | Compilation error | Compiles; 9/10 storage/action results match |
| Acton Jetton Minter | Compilation error | Compiles; 3/3 getters and 10/10 storage/action results match |
| Acton SimpleExtension | Not queried | Compiles; 1/1 getter, 6/7 internal message outcomes and 7/7 storage/action results match |
| Acton WalletV5 | Not queried | Compiles on FunC/Tolk; 5/5 getters, 10/10 message outcomes and state/action comparisons |

Kotlin unit/CLI tests: 62 passed, including WHILE/AGAINEND/CALLREF/TRY recovery, effectful FunC declarations, normalization rules, raw/normalized output selection and strict partial-result rejection. Harness unit tests: 4 passed. Original Acton template tests: 85 passed across all five built-in templates. These counts are separate from emulator comparisons of recompiled contracts. The legacy Gradle roundTripTest had no func_sources fixtures in this snapshot; the committed Node harness performs the actual compilation round trips.

The newly passing minimal cases reproduce typed BALANCE indexing, embedded GETPARAM selectors, a PUSHREF cell containing references and canonical TRY/catch. Counter also reproduces INMSGPARAM result typing and embedded selectors. Dynamic EXECUTE remains incomplete with structured diagnostics. Noncanonical TRY has a separate negative unit/CLI fixture.

## Observable differences still present

Across all eight recompiled Acton fixtures, 65/71 internal-message outcomes match including outgoing values; 70/71 match exit code, storage and original actions. Seventeen of eighteen getter probes match. All original-message expectations pass. NftCollection's WHILE failure is fixed: 4/4 getters and 12/12 storage/action comparisons now pass. Its royalty response preserves the action/body/destination but changes outgoing value with gas. WalletV5 is complete after AGAINEND recovery and passes all five getters and ten internal messages on both languages. External messages are not compared. This is finite probe coverage, not a proof of equivalence.

The standalone [HTML report](../reports/acton-contracts.html) contains original Tolk source, TVM disassembly and BOC, generated FunC/Tolk, recompilation hashes, and emulator comparison details for all eight contracts from all five built-in templates. Its language selector switches code and corresponding results; JAR hashes and compiler/check metadata are recorded separately for each language.

- NFT static-data response uses 2224 gas before and 2248 after. Its outgoing value changes from 999737131 to 999735531 nanotons. Body, destination, storage and the SENDMSG action match; the carried value changes with gas costs.
- Jetton wallet burn and minter discovery also differ in outgoing carried value despite matching original actions.
- SimpleExtension cancellation uses 2906 gas before and 3047 after; the carried outgoing value changes from 999708065 to 999698665 nanotons. Storage, body, destination and original actions match.
- Jetton wallet returns its own code and uses MYCODE to build another wallet's state-init. Recompilation changes the code hash, so get_wallet_data returns a different code cell and transfer derives a different destination/state-init. This is a material behavioral difference and is retained as a failed comparison, not normalized away.
- The same differences remain with --exact on these Tolk templates. Exact mode is not a general guarantee of byte-identical recompilation.

Gas is reported separately; remaining account balances are not compared. Every message starts from independent original storage and fixed emulator time/random seed. A code-cell identity comparison is distinct from equality of BOC serialization bytes. No chain deployment is involved in these tests.

Noncanonical TRY/TRYARGS and dynamic continuations remain unsupported. Complete means no detected parsing failures, not verified recompilation or equivalence. The CLI's strict mode is intended to let callers reject known partial outputs before compilation.

## Tolk output backend

P01 fixes WHILE's phase ordering: condition runs before the body, its flag
is consumed, and the false edge keeps the resulting stack without the flag.
This recovers NftCollection's dictionary loop and the correct one-argument
ABI of a minimal precomputed-flag loop. Extracted CALLREF cells no longer
receive synthetic public method IDs, and FunC prints generic tuple indexing
instead of assuming every indexed slot is int. Eight compiler-derived
loop fixtures exercise 70 inputs; raw/normalized BOC and gas match, as does
original behavior. Original/raw code-cell identity holds for the dictionary
fixture only; gas/code differences are recorded separately. The HTML now
contains complete original/raw/normalized/recompiled NftCollection views
for both languages. P02 also recovers WalletV5's AGAINEND loop: explicit
returns retain their ABI and no ordinary fallthrough is invented. Embedded
c5 operands and FunC `impure` declarations preserve POPCTR and void CALLREF
effects. Six additional fixtures / 36 probes compare loops, returns,
exceptions, ref chains and action-register writes; original behavior and
raw/normalized BOC + gas match. Five of six original/raw code cells match.

Tolk recompilation used Acton 1.0.0 (3a4f0dc 2026-05-11). The 20-case corpus has 19 passing recompilations, 75 matching getter probes, eight identical code-cell hashes and no unexpected failures. Canonical TRY now passes; dynamic EXECUTE remains partial. A separate 13-probe check passes for global slot 7, repeated loop-condition side effects, branch/argument order, dynamic exception arguments, independent builder snapshots and null owner/content on the uninitialized NFT getter branch. The FunC corpus has 19 passing recompilations and 15 identical code-cell hashes.

P03 recovers the compiler's TRY register envelope, including captured stack
values and snapshots, two exception slots, nested rethrow/early return and
c4/c5/c7 restoration. FunC and Tolk print their respective catch argument
orders. Each TRY arm is an inlining barrier; a single surviving arm still
exports its local result through an outer phi. Ten compiler-derived fixtures
exercise 75 probes with matching original behavior and identical
raw/normalized BOC plus gas. Only 1/10 original/raw code cells is identical;
the raw emitter's remaining code/gas differences are reported separately.
Arbitrary handlers, multiple capture chunks and TRYARGS retain diagnostics.

All eight Acton template outputs compile as Tolk. Seventeen of eighteen getter probes match; 65/71 internal-message outcomes match including outgoing values; 70/71 match exit/storage/raw actions. Empty, Counter and WalletV5 pass every executed probe. The MYCODE and carried-value differences described above also occur with Tolk, with different gas figures available in the HTML. External-message flows remain untested.

The backend emits from the shared IR, with Tolk control flow and a generated assembly compatibility library. It preserves method IDs, TVM primitive stack order, constant slice bits/references and global slot numbers. It does not recover original source names or Acton storage/message schemas, and it does not guarantee byte-identical output. Compilation and probes establish coverage for these examples only.

The readability pass replaces known primitive wrappers with standard Tolk operations, avoids redundant unknown casts and intermediate tuple bindings, folds constants/adjacent expressions and chooses names from recovered operations. That pass decreased Empty's main.tolk from 45 to 24 lines, Counter from 133 to 69 lines. Both contain zero `as unknown` casts and zero `__result_*` temporaries (previously 39/169 unknown casts). Counts use trimmed source text, including blank lines within the file. The HTML contains exact generated output, without manually rewriting the contract logic.

A separate post-emission normalizer folds address returns and boolean guards, replaces ISNULL helpers, recovers terminal coalesce, exact cursor loads and functional builder chains, and selects getter-name candidates when ID/signature checks pass. Current Empty/Counter outputs have 30/82 lines including inferred message declarations and exact methods. Seventeen of eighteen getters have candidate names; get_nft_content lacks its required cell parameter fact. Anonymous getters decrease 18 to 1, integer-cast bindings 71 to 33, ISNULL calls 21 to 0, prefix helpers 41 to 30, primitive-load tuples 114 to 13, builder-store helpers 45 to 0, optional-address helpers 21 to 0 and CONDSEL helpers 7 to 5. The remaining tuple bindings are WalletV5 loads with unsupported normalization shapes. Unknown escapes preserve physical legacy nulls. All eight outputs have identical raw/normalized code cells and serialized BOCs. Original/recompiled differences above remain separate.

Compiler-derived prefix reconstruction restores five `lazy`/`match` dispatches in Empty, Counter, NftItem and both SimpleExtension entrypoints. Payloads remain `RemainingBitsAndRefs`; names follow observed prefixes. The emitter retains SDBEGINSQ through exact asm helpers, avoiding the previous PUSHSLICE + SDBEGINSXQ expansion, and the shared parser infers slice parameters for prefix-only getters. Seven fixtures exercise 348 getter inputs with original/raw/normalized bytecode identity and equal gas. These include 4/8/32-bit prefixes, leading zeroes, truncated bodies/payloads and tail refs, plus excluded overlaps, live fallback tails, joins and a conditional immediately before return. A separate 48-bit boundary round trip also preserves the BOC. JettonWallet and JettonMinter retain explicit dispatch under the conservative return-context guard: wrapping a conditional before return in a match arm can change IFJMP/IFNOT selection. Existing original/recompiled template differences and partial parser diagnostics remain.

The first batch of the [compiler recovery specification](compiler-recovery-spec.md), N01–N04, adds `integer-match`, `conditional-select` and `cursor-load` as separate normalization rules. Nineteen compiler-derived fixtures pass 501 getter probes with identical raw/normalized code cells, serialized BOCs and gas; original/normalized getter behavior also matches on all probes. Seventeen original/raw code cells are identical; the local constant-width load and joined-branch fixtures retain existing decompiler hash differences, reported separately. Coverage includes signed/large/unknown integer match values, two source spellings, retained joins/early returns, homogeneous and erased runtime types, equal CONDSEL operands, a retained constant condition, dynamic/signed load widths, live slice snapshots, refs, large coins and discarded results. Exact LDUX/LDIX/LDGRAMS cursor methods preserve instructions and exceptions: a native pure loadCoins call would be eliminated when both outputs are unused. The templates contain no ordinary integer-dispatch chain; they demonstrate 44 cursor binding rewrites and two ternary rewrites. All existing prefix/normalization/edge probes, both corpora and HTML text/download checks passed again. Original/recompiled template differences and the two known partial outputs are unchanged.
