# DeDust source reconstruction

Target: readable source for the archived DeDust code families that compiles to the
same executable cell graph **and the same serialized BOC**. The archive in
`F:/dedust/dedust-mainnet` is the independent oracle and must not be replaced by a
candidate's compilation output. The original programming language, compiler
version, variable names and comments are unknown.

## Acceptance gates

1. Pin each oracle's code-cell hash, BOC SHA-256, library dependencies and public ABI.
2. Export an editable instruction reference, assemble it without reading the oracle
   during the build, and compare cell graphs and BOC bytes. This gate verifies the
   instruction reference only; it does **not** establish readable Tolk recovery.
3. Recover storage, message layouts, authorization, calculations, outgoing messages
   and getter semantics in named Tolk source. Preserve eager reads, overflow checks,
   exceptions, reference order, bounces and transaction effects.
4. Use Acton's installed Tolk compiler to build candidates. Run local differential
   tests against the original code, using identical data, messages, config, time,
   balance and libraries. Compare getter stacks, exits, state and actions. Report
   gas and monetary differences rather than hiding them behind normalized output.
5. Compare candidate instructions, cell boundaries, library-cell flags, code hash
   and serialized BOC. Compiler optimizations and layout are part of this gate.
6. Only label a contract `exact-readable` after gates 3–5 pass. An exact assembler
   reference and a behaviorally matching Tolk candidate remain different results.

No original BOC embedding, post-compilation substitution of original code, or
runtime `setCode` from the oracle can satisfy the final gate. Typed asm for an
individual operation may be used when documented and independently tested.

## Work order

| Portion | Contracts / work | Required proof |
| --- | --- | --- |
| 1 | CPMM Deposit and AffiliateAccount; independent build/comparison tools | ABI, adversarial local tests, byte differences |
| 2 | CPMM Position; fix branch joins in the decompiler | Liquidity, fee, reward and authorization paths |
| 3 | CPMM Pool V1/V2; calls, loops, dynamic dispatch | Swap, liquidity, fees, admin and library dependencies |
| 4 | Classic factory, vaults, deposit, LP wallet, operator and pool revisions | Per-role storage/messages and behavioral checks |
| 5 | Uranus factory, meme and wallet revisions; related X1000 wallet | Deployment, trading, graduation and dependencies |
| 6 | Close instruction/layout differences for every family | All unique families pass both byte comparisons |

Commit and push verified portions to the authorized fork. Keep an explicit status
for every family and unresolved difference; do not mark all recovered because a
single role or its assembler reference passes.

## Current baseline

- Archive: 21 unique executable code families (22 folders including an alias).
- Decompiled Tolk: 10 complete, 8 compile, 0 byte-identical.
- Installed toolchain: Acton 1.0.0, Tolk 1.4.0; reference assembler `@ton/tasm` 0.6.1.
- Assembler round-trip: all 21 identical. The local encoder adapter preserves
  explicit exotic declarations instead of guessing library cells from their bytes.
- CPMM Deposit: named, typed source in `reconstruction/dedust/CpmmDeposit` passes
  both byte comparisons, 9 getter probes, 21 message probes (including gas), and
  7 native Acton tests. Union-ID allocation and one referenced storage helper are
  explicit compatibility details. No original executable code bytes are embedded.
- CPMM AffiliateAccount: named source without asm inserts passes both byte
  comparisons, 6 getter probes, 21 message probes (including gas), and 5 Acton tests.
  Internal suffix handling, strict getter parsing and bitsN packing are preserved.
- CPMM Position: named source passes both byte comparisons, 14 getter probes,
  49 message probes and 8 Acton tests. All incoming dispatch, fee and reward
  arithmetic, dictionary iteration, withdrawal exceptions, public state queries
  and bounce compensation are recovered. Four small typed asm helpers preserve
  individual VM operations; nullable reward packing is otherwise ordinary Tolk.
  The decompiler now joins heterogeneous branch-slot types instead of taking the
  first branch's type. The real Position fixture decodes fully in both languages.
- Readable byte-identical recovery: 3/21 families. Remaining families have exact
  instruction references only; both CPMM Pool revisions are next.
- Both CPMM Pool revisions now decode without diagnostics. The fixes preserve
  untouched arguments across early returns, recover statically known finite-width
  `CALLXVARARGS`, and retain the dictionary, previous value and flag returned by
  `DICTUSETGETB NULLSWAPIFNOT`. Synthetic differential tests cover early exits,
  isolated caller stacks and existing/missing dictionary keys in both languages.
  Encoded tuple widths remain Fift operands; merged conditions cast to integer
  and terminal throws retain their `never` return type in Tolk. Literal library
  references preserve the BOC exotic descriptor by physical reference order,
  including literals in dictionary method bodies and referenced slices. Tests
  distinguish a real library reference from ordinary data with identical bits.
  Full raw Tolk for both Pool revisions compiles and passes 33 getter probes each:
  all lifecycle states, zero/nonzero liquidity, signed withdrawal estimates,
  malformed storage, and an independently constructed Position StateInit/address.
  The recompiled Pool code is not yet byte-identical. Complete decoding and these
  getter checks are not the readable-source or full-behavior acceptance gates.
- Pool reward accrual and dictionary synchronization are recovered in named Tolk.
  Both compiled helper cells equal the pinned shared cells in PoolV1 and PoolV2;
  64 independent probes including gas and 5 native Acton module tests pass. This
  advances portion 3 but does not increase the count of exact complete contracts.
  The recovered semantics identify Position's reward fields as remaining duration,
  remaining budget, checkpoint and last-update time; its names now reflect those
  meanings while its complete compiled BOC remains identical.
- Position/Deposit deployment helpers and `get_position_address` are now exact in
  both Pool revisions. The getter uses the official old Tolk stdlib StateInit hash
  primitives, with source attribution and LGPL retained, and named Tolk address
  logic. Its entire dictionary value matches, not just its returned address.
  Isolated builds pass serialized BOC comparisons, 62 independent differential
  probes including gas, and 4 native Acton module tests. Full Pool message paths
  and whole-contract byte equality remain outstanding.
- Four shared wallet registry helpers are exact: schedule resolution, register
  both lookup directions, map wallet to asset, consume resolution and register.
  The isolated complete BOC matches; 39 differential probes including gas and
  independent dictionary/error expectations plus 4 Acton tests pass. Pending
  overwrite semantics, strict records and validation order are preserved. This
  brings the project to 33 native tests without claiming a complete Pool yet.
- All three public Pool getters now match their complete method cells in both
  revisions. Named storage/config/fee/extra schemas, direct typed-map returns and
  lazy withdrawal-estimate decoding reproduce the original bytecode. The isolated
  three-method build is byte-identical; 202 independent differential probes with
  exact gas and 4 Acton tests pass. There are now 37 native tests. Method 112421 is
  descriptively named `estimateWithdrawal`, without claiming its original name.
  Message layouts preserve allocation order, but full message handlers, swap and
  liquidity logic and whole-Pool byte equality remain outstanding.
- Pool initial-liquidity integer root, payout address normalization and allowed
  reward lookup are exact implementations shared by both revisions. The isolated
  BOC matches; 229 independent differential probes including gas and 4 native
  tests pass, bringing the project to 41 tests. Method 21's implementation matches
  the original referenced cell; full dictionary placement remains part of the
  whole-Pool gate. The numeric correction uses one typed `CONDSELCHK` primitive;
  the remaining algorithm, address checks and map search are ordinary Tolk.
