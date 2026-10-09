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
   and getter semantics in named Tolk or FunC source. Preserve eager reads, overflow checks,
   exceptions, reference order, bounces and transaction effects.
4. Use Acton's installed Tolk compiler or a pinned historical FunC compiler to build candidates. Run local differential
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

## Current accepted results

Readable byte-identical recovery is **17/21 families**: CPMM Deposit,
AffiliateAccount, Position, Pool V1, Pool V2, ClassicBlank, ClassicOperator,
ClassicLpWallet, ClassicLiquidityDeposit, ClassicNativeVault, ClassicJettonVault,
ClassicFactory, UranusFactoryV3, UranusMemeV2/V3 and UranusMemeWalletV2/V3.
Pool V2's complete 10032-byte serialized
BOC and all ten method dictionary values equal the frozen mainnet oracle.
The shared Acton project passes **138 tests**. Each whole-Pool fixture compares
116 message probes and 12 getter probes, including outgoing amounts, exact gas
and six independently expected self-code responses. No output normalization or
original executable embedding is used to obtain identity.

Pool V2's production entrypoint is `CpmmPoolV2/main.tolk`; `candidate.tolk` is a
compatibility import. The exact dispatcher fixture adds 113 isolated probes.
Wallet scheduling retains the full map record's original stack width; handler
branches, lazy transaction reads, liquidity updates, optional state fields,
refunds and callback evaluation now preserve the original instructions and
reference boundaries.

Pool V1 also passes complete serialized BOC equality and all ten method dictionary
comparisons. It shares unchanged modules through relative source imports, keeping
separate incoming handlers, method 20 and resolver sender for revision differences.
Protocol fee share is 30% in V1 and 20% in V2; V1 lacks V2's minimum resolver fee.
Independent swap calculations cover both directions and all fee selectors, while
native Acton tests execute both full revisions and check fee/checkpoint/reserve
updates. Source dependency collection retains directory layout and hashes every
imported file.

ClassicBlank passes complete 165-byte BOC identity, 33 message probes and two
seven-argument constructor-hook probes with exact gas. Its readable FunC recovers
owner authorization, SETCODE/c3 constructor handoff, rollback and full-balance
refund/deletion. Two narrow codecs preserve fixed-width field stack order; a
STZEROES primitive preserves the outgoing header. The pinned FunC 0.4.4 package
includes its own Fift; there is no post-compilation instruction substitution.
The standard library retains its license. Acton consumes the source-built BOC
generated by the gate, with three native identity/installation/failure tests.
ClassicOperator passes complete 455-byte BOC identity, 36 message probes and
40 getter probes with exact gas and outgoing values. Named FunC recovers strict
storage, versioned owner upgrades with immediate c3 hook, 48-hour beneficiary
delay and authorized payload withdrawal. Independent expectations cover fees,
time boundaries, authorization, malformed input, hook rollback and constructor
arguments through source-built Blank. Four native Acton tests pass. The pinned
0.4.4-newops.1 distribution adds modern Fift instructions to the old code generator;
the package lock and proof record its distribution, and Blank is reverified too.
ClassicLpWallet passes complete 836-byte BOC identity, 52 message and 17 getter
probes, including exact gas and all outgoing amounts. Named FunC recovers transfer,
pool/peer credit, canonical wallet derivation, burn, TON notification/excesses and
bounce restoration. Budget boundaries, forward-fee rounding, overflow, malformed
input, authorization and ignored suffixes have independent expectations. Five
native tests deliver the actual outgoing transfer body and amount to a canonical
recipient wallet and verify token conservation, plus burn/bounce and rejection.
ClassicLiquidityDeposit passes complete 2104-byte BOC identity and all 18 method
dictionary values. Named FunC recovers constructor/storage, both asset codecs,
factory collection, thresholds, pool/vault derivation, pending refunds, cancellation,
success/failure/bounce and eight getters. 57 message and 40 getter probes check exact
gas/actions/amounts with independent state and serialization expectations. Seven Acton
tests install it through source-built Blank and execute the collection/request/refund
flow. Local alternative returns preserve the native/jetton decoder's original scope;
opaque throw/tuple/field/builder primitives retain the old code generator's ABI and
unreachable null slots. All candidate executable code is generated from readable source.
Tests also preserve first-asset surplus priority and supplied-config authentication.
ClassicNativeVault passes complete 2302-byte BOC identity and all 14 method
values. Named FunC recovers TON funding, swap routing, authentic pool/deposit
payouts, readiness, operator reserve/excess withdrawal, initialization, version
migration and factory upgrade with the installed zero-argument hook. Seventy
message and 28 getter/hook probes verify independent serialization/state/fees,
raw actions, outgoing amounts and exact gas. Eight native Acton tests pass.
Narrow typed codecs retain legacy stack transfers and inline cell boundaries;
all executable cells come from source compilation.
ClassicJettonVault passes complete 3811-byte BOC identity and all 18 method
values. Named FunC recovers wallet resolution/activation, TEP74 notification,
swap/funding, authenticated payouts, cleanup, operator reserve and installed-hook
upgrade. A normal try/catch clears actions, refunds, commits and rethrows; native
Acton confirms the outgoing refund survives its nonzero exit. Seventy-four message
and 30 getter probes verify exact gas and independent wire/state/fee expectations;
nine native tests pass. A callback hash's preimage is unknown, while its exact
condition and ordinary callback variants are preserved and tested.
ClassicFactory passes complete 3733-byte BOC identity and all 34 dictionary entries.
Its FunC source restores ownership, versioned registries and deterministic deployment
codecs. 73 independent message probes and 34 getters validate the schema and protocol
behavior. Eight native Acton tests execute Factory-to-Blank-to-Vault/Operator/Deposit
lifecycles, including two-step funding and failed migration rollback.

UranusMemeWalletV2/V3 pass complete 1219/1156-byte serialized BOC identity.
Each revision has 60 independent message probes and 15 getter probes; six native
Acton tests execute both revisions, deploy a peer using a real transfer, verify
token conservation, and restore burned/sold tokens through real bounced bodies.
The recovered schemas preserve V2's permissive address/body policies and V3's
strict std-address/end-of-message checks. V2 peer authentication masks the first
eight hash bits; V3 compares the complete sharded address. Independent network
config calculations check inclusive TON-budget boundaries and exact gas.

UranusFactoryV3 passes complete 1605-byte BOC identity, 84 independent message
probes and five native Acton tests. Named Tolk recovers preset/custom deployment,
curve initialization, attribution, fee selection, liquidity owner and sharded
StateInit. Explicit nonzero block seed makes RNG probes reproducible; a separate
SHA256/SHA512/LT calculation checks the full expected initial data hash. Tests cover
inclusive deployment funding, strict parameter limits and all affiliate combinations.

UranusMemeV3 passes complete 4719-byte BOC identity and all seven dictionary
methods. Independent arithmetic and wire checks cover 142 messages and 15 getters
with exact gas, attribution caps, inclusive budgets, graduation and authenticated
migration. Eight Acton tests execute real Factory/Wallet/Pool/Deposit deliveries,
including the entire liquidity migration and independently expected final reserves.
Compiler bridges retain field order, StateInit hashing and operand snapshots;
no original executable code is embedded or substituted.

UranusMemeV2 passes complete 4600-byte BOC identity and all five methods, with
132 independent message and 11 getter probes. Its 30% protocol fee, absent partner
claim, legacy suffix/address rules and Pool V1 migration are independently checked.
Five native Acton tests deliver real wallet messages and complete both migration
deposits and liquidity joining. A dedicated codec preserves legacy union padding;
protocol logic remains ordinary Tolk and dependencies are built from source.

Next: X1000WalletV2 and three Classic pool revisions; **4 families remain**.

## Recovery history

The milestones below record intermediate states. Their earlier counts and open
Pool V2 differences were superseded by the accepted result above.

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
  the original referenced cell. Its dictionary placement now also matches the
  whole-Pool oracle. The numeric correction uses one typed `CONDSELCHK` primitive;
  the remaining algorithm, address checks and map search are ordinary Tolk.
- Pool swap/deposit/withdrawal event methods match their implementations in both
  revisions. The isolated BOC matches; 56 probes include exact gas, full raw send
  action lists, public-ABI body expectations and forwarding fees independently
  calculated from the pinned validator formula. Three Acton tests bring the
  project to 44 tests. Getter/math bounds cover `(1 << 120) - 1`, the full maximum
  of the original `VarUInteger 16` coin encoding. Message-path recovery continues.
- Pool excesses sender, payout-wallet selection, default reward lookup and both
  resolver-request revisions are exact. V2 adds a minimum processing fee of
  10,000,000; V1 lacks it. A low-gas-price local config makes this difference
  observable. Five implementation cells and the complete isolated BOC match;
  192 independent probes with exact gas/actions/fee/dictionary expectations and
  four Acton tests pass. There are 48 native tests. Reward lookup uses one small
  typed zero constructor; no original executable blob is included.
- The shared TON/jetton payout helper is exact, with a byte-identical complete
  isolated build, 160 differential probes and four Acton tests. Signed callbacks,
  raw/wrapped/absent payloads, coin/query bounds, raw actions and forwarding fees
  (including body relocation after header filling) are independently checked.
- Swap continuation, basic payout normalization and AffiliateAccount deployment
  are exact shared functions. The isolated BOC matches; 193 independent probes
  and five Acton tests include nullable partner/referrer codecs, native/jetton
  routing, library resolution and its missing-library error. The library is
  source-built for local emulation. The project now has 57 passing Acton tests.
  Whole readable contract recovery remains 3/21; complete Pool handlers and
  swap/liquidity accounting remain pending.
- Method 19's shared settlement implementation is exact. The isolated complete
  BOC matches, 139 differential probes compare gas, action chains and independent
  reserve calculations, and three Acton tests verify sends/reserve/excesses and
  validation order. Its full-Pool dictionary reference placement now also
  matches. The project has 60 native Acton tests; whole readable
  recovery remains 3/21.
- Method 20 now has a readable V2 candidate covering swaps, deposits, reward
  funding, activation and rejected-payment context. Its 113 isolated message
  probes match state and raw actions and verify independent economic/event/error
  expectations. Four native tests bring the suite to 64. Gas and carry-balance
  outgoing values differ and its method hash does not match, so it is explicitly
  excluded from exact acceptance. Whole readable recovery remains 3/21.
- Pool V2 now has a complete readable `candidate.tolk`, covering every incoming
  variant and all public getters. Against the whole frozen V2, 99 probes match
  state/actions and 12 getter probes match gas plus independent results. Six
  state responses separately validate each actual code root's hash; they remain
  declared identity differences. Gas, carry-balance amounts and serialized BOC
  differ, so the candidate remains outside the exact gate. Three native whole-
  candidate integration tests bring the project to 67. Whole exact count: 3/21.
- The complete Pool V2 candidate now verifies all eight exact public dictionary
  values (19, 21–24 and the three getters) directly against the frozen whole code.
  Typed CALLDICT bridges retain calls to readable referenced entry bodies;
  isolated settlement/calculation/event proofs preserve the same placement.
  Entry point 0 and payment dispatcher 20 still require exact reconstruction.
- The complete 16-variant incoming decoder now matches its archived code cell.
  Jetton forwarding payloads use the TEP74 ref/inline selector, with malformed
  references rejected before handler execution or storage decoding. Four added
  outer-message probes and the bounced path match gas and empty action lists.
  Method 20's outer 18-argument continuation instructions also match; its body
  remains pending. Forwarding-fee reads in withdrawal/reward handlers occur
  after the lifecycle check. Full-candidate state/action probes now total 103,
  alongside 6 explicitly different self-code responses and 12 exact getters.
- Pool V2 method 20 is now byte-identical in the complete candidate, including
  its referenced 18-argument wrapper, all continuations and dictionary placement.
  Deposit deployment uses the legacy typed message header; reward funding uses
  a one-field codec preserving the archived union's nine-slot runtime layout.
  No original executable blob is included. The isolated complete fixture also
  matches its archived-method oracle: all 113 probes now compare outgoing values
  and exact gas as well as state/actions and independent economic expectations.
  All nine public method dictionary values match; entry point 0 remains pending.
  The whole readable count is still 3/21, with 67 native Acton tests passing.
