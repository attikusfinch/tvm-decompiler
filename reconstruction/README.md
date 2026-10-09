# Reconstructed contract projects

The recovered sources are separated by project. Each folder contains that
project's contract families, instruction references and verification records.

| Project | Folder | Families | Contents |
| --- | --- | ---: | --- |
| DeDust DEX | [dedust](dedust/README.md) | 15 | Classic exchange contracts and CPMM pools/positions/deposits |
| Uranus | [uranus](uranus/README.md) | 5 | Factory, token masters and wallets for revisions V2/V3 |
| X1000 | [x1000](x1000/README.md) | 1 | Signed trading wallet, recipes, receipts and retries |

`projects.json` assigns every frozen family to one project. The common
`Acton.toml`, `tests/`, `oracles/`, `func-stdlib.fc` and build tools remain here.
Uranus migration uses DeDust CPMM/affiliate contracts, and integration tests
deliver X1000 transfers into source-built Uranus wallets. Shared tests exercise
these dependencies without copying contract sources into multiple projects.

All 21 code families are available in the official TON Verifier registry as of
2026-10-09. We published 20 recovered source bundles; the service returned
`match` for every compiled code hash, and an independent registry read-back
matched every uploaded source checksum. ClassicLpWallet already had a third-party
publication. [publication.json](publication.json) records the public links,
compiler receipts, source checksums and payment transaction hashes. Payments
used testnet TON; the archived contract code comes from mainnet.

[mainnet-addresses.json](mainnet-addresses.json) maps every recovered family to
real mainnet accounts and Tonscan links. Current code or its embedded library
hash matched 19 families. Blank is documented by a deployment StateInit that
subsequently installed Pool V9; the representative CPMM Deposit is documented
by its successful deployment transaction and has since been destroyed after
liquidity settlement. Their records include the historical transaction hashes.

Readable, byte-identical recovery is verified for **all 21 archived code
families**: CpmmDeposit, CpmmAffiliateAccount, CpmmPosition, CpmmPoolV1, CpmmPoolV2
and ClassicBlank/ClassicOperator/ClassicLpWallet/ClassicLiquidityDeposit/ClassicNativeVault/ClassicJettonVault/ClassicFactory/ClassicVolatilePool/ClassicPoolInstalledV8/V9,
plus UranusFactoryV3, UranusMemeV2/V3, UranusMemeWalletV2/V3 and X1000WalletV2. The eleven CPMM/Uranus/X1000 contracts use Tolk; the ten Classic
contracts use FunC.
The sources describe executable behavior; original names and comments are unknown.

| Contract | Serialized BOC | Getter/hook probes | Message probes |
| --- | ---: | ---: | ---: |
| CpmmDeposit | 522 bytes | 9 | 21 |
| CpmmAffiliateAccount | 306 bytes | 6 | 21 |
| CpmmPosition | 1540 bytes | 14 | 49 |
| CpmmPoolV1 | 10014 bytes | 12 | 116 |
| CpmmPoolV2 | 10032 bytes | 12 | 116 |
| ClassicBlank | 165 bytes | 2 | 33 |
| ClassicOperator | 455 bytes | 40 | 36 |
| ClassicLpWallet | 836 bytes | 17 | 52 |
| ClassicLiquidityDeposit | 2104 bytes | 40 | 57 |
| ClassicNativeVault | 2302 bytes | 28 | 70 |
| ClassicJettonVault | 3811 bytes | 30 | 74 |
| ClassicFactory | 3733 bytes | 34 | 73 |
| ClassicVolatilePool | 5691 bytes | 65 | 71 |
| ClassicPoolInstalledV8 | 5846 bytes | 72 | 84 |
| ClassicPoolInstalledV9 | 5839 bytes | 72 | 84 |
| UranusMemeWalletV2 | 1219 bytes | 15 | 60 |
| UranusMemeWalletV3 | 1156 bytes | 15 | 60 |
| UranusFactoryV3 | 1605 bytes | 0 | 84 |
| UranusMemeV3 | 4719 bytes | 15 | 142 |
| UranusMemeV2 | 4600 bytes | 11 | 132 |
| X1000WalletV2 | 10964 bytes | 93 | 105 |

Each source-built contract equals its frozen mainnet oracle, including the complete
cell graph and BOC bytes with `idx=false, crc32=true`. Differential probes compare
exits, storage, raw actions, outgoing messages and amounts, and exact gas. Independent
expectations check decoded results and economic calculations. The shared Acton
project passes **162 native tests**. See `verification.json` for per-family results.

All 21 families also have exact, editable `reference.tasm` instruction references.
Readable acceptance is established separately by source compilation, byte comparison
and behavioral checks; the instruction references are supplementary.

## X1000 Wallet V2

The readable Tolk source recovers signed external requests, replay protection,
batch sends, four query dictionaries, receipts, authenticated retries, all fourteen
trading dispatch kinds and the dynamic amount hook. All 34 method dictionary
values and the complete 10964-byte BOC equal the frozen oracle.

`main.tolk` handles incoming messages; `protocols.tolk` handles each dispatch kind;
`messages.tolk` constructs trade messages and invokes the hook; `queues.tolk`
maintains query/receipt/retry state; `getters.tolk` preserves the eleven public IDs.
`compat.tolk` contains typed wire and stack-lifetime primitives. Trade conditions,
authorization and state changes remain ordinary Tolk. The [module and ABI guide](x1000/X1000WalletV2/README.md)
documents storage, signed requests, method IDs and compiler compatibility details.

`npm run dedust:x1000` checks 93 getter/helper/hook and 105 message probes with
independent storage, wire and authorization expectations and exact gas. Its
source-built amount hook validates all seven argument slots. Nine native Acton
tests verify real signatures, replay rejection, receipts, batching and callback
cleanup. They also deliver an actual trade into a source-built UranusMemeWalletV3:
77 tokens move from the source wallet to a canonical peer, leaving balances 923 and
77. See `x1000/X1000WalletV2/recovery-verification.json`.

## Classic Pool

`dedust/classic/ClassicVolatilePool/main.fc` compiles to all 5691 frozen mainnet bytes and all
25 method dictionary values with pinned FunC 0.4.4-newops.1. Named source recovers
both constant-product and stable-curve swaps, LP mint/burn, canonical Vault/Deposit
proofs, route forwarding, fee accumulation/withdrawal, price collectors, versioned
upgrades, Blank installation and TEP-64 LP metadata.

`npm run dedust:classic-pool` checks 71 messages and 65 getters with exact gas,
independent storage and wire expectations. Stable quotes are checked against a
separate polynomial-root bisection; the recovered contract uses Newton iteration.
Failed swaps restore c4/c5/c7, clear pending actions, refund the full principal,
commit the refund and rethrow. Non-cell exception arguments become null callbacks.
The initial LP rule is preserved: minted liquidity is max(99000, amount0, amount1)
and the initial supply additionally locks 1000 units.

Nine Acton tests install the Pool through real source-built Blank, deliver actual
LP credit and StateInit into the recovered LP wallet, burn through its real notice,
and verify swaps, rollback, collectors and stable-curve rounding. Bounded field,
type-test and operand-staging primitives retain historical compiler layout; all
economic and authorization logic is ordinary FunC. See
`dedust/classic/ClassicVolatilePool/recovery-verification.json`.

`dedust/classic/ClassicPoolInstalledV8/main.fc` and `dedust/classic/ClassicPoolInstalledV9/main.fc` additionally
recover the optional uint32 swap start timestamp. Legacy storage without the field
loads zero; a save writes the extended layout. Operator 10 sets it with opcode
2128082638. Swaps before that timestamp commit full-principal refunds and rethrow
306; equality permits execution. V8 allows setting the time only while it is zero
(otherwise 307); V9 permits repeated changes. Getter 112861 exposes it. Quotes and
liquidity remain available during the time gate. Each revision matches all 27
method cells and all serialized bytes. Per revision, 72 getter and 84 message probes
check the common economics and these differences. Six additional Acton tests cover
both installations, authority, time boundaries, real LP credit/burn and stable swaps.

## Uranus Factory V3

The readable Tolk factory recovers preset/custom deployment, curve coefficients,
fee selection, partner/referrer attribution, liquidity owner and sharded StateInit.
Its full 1605-byte BOC matches the frozen mainnet oracle. The Meme code is an exotic
library reference, never an embedded executable oracle.
`npm run dedust:uranus-factory` runs 84 independent message probes with exact gas,
budget equality/underflow, parameter limits, malformed payloads and strict tails.
The expected initial data includes an independently calculated SHA256/SHA512 seed
at fixed transaction LT and explicit nonzero block seed; zero seed requests fresh
entropy from the transaction emulator. Five Acton tests additionally inspect the
actual deployment message, StateInit address, curve and migration configuration.
Delivery into the source-built Meme library is covered by the native Meme tests.

## Uranus Meme V3

The complete 4719-byte Tolk build and all seven method dictionary values equal
mainnet. Named schemas and handlers recover initialization, bonding-curve buys
and sales, fee attribution, burn, wallet discovery, claims, controller withdrawals
and migration to CPMM Pool V2. Library references contain hashes only.

`npm run dedust:uranus-meme` checks 142 messages and 15 getters with exact gas.
Independent expectations calculate floor/ceiling rounding, capped attribution,
fee splitting, budget boundaries, every outgoing body, sharded StateInit and
the Pool migration data. Exact exhaustion of available tokens does not graduate;
an overshooting buy does. The authenticated migration callback ignores its
reported exit code and accepts repeated callbacks, preserving original behavior.

Eight Acton tests execute actual Factory → Meme → Wallet deployments, sell and
burn notices, fee claims and a full graduation chain. The migration test delivers
the Pool's wallet-resolution request and response, its initialization callback,
TON and token deposits, and Deposit → Pool liquidity joining. The resulting Pool
has independently expected reserves and active deposits. Every executed library
is freshly built from readable source; no executable oracle is substituted.

Small field, StateInit/hash and operand-lifetime primitives preserve compiler
instruction order. Packed zero fields are documented against the recovered CPMM
schemas. See `uranus/UranusMemeV3/recovery-verification.json`.

## Uranus Meme V2

The older readable Tolk revision compiles to all 4600 frozen BOC bytes and all
five dictionary values. It gives protocol 30% of the base fee, has no separate
partner accrual/claim, migrates to Pool V1 and allows controller withdrawal only
after migration. Peer authentication compares the last 248 address bits and
basechain; all incoming message tails remain strict. Metadata snake data is inline.
Buy/sell and positive fee claims discard storage suffixes; burns preserve them.

`npm run dedust:uranus-meme -- 2` verifies 132 messages and 11 getter probes,
including the two methods absent from V2. The shared expectations independently
check revision-dependent fees, libraries, authentication, storage, gas and wire
messages. Five native Acton tests deliver actual old-wallet sell/burn messages,
check claims/withdrawal timing and execute migration through source-built Pool V1
and Deposit to the independently expected final reserves.

The incoming codec retains the legacy callback's union padding, following the
same approach as the already recovered CPMM payment codec. It contains field
loads and null placement; all lifecycle/trading/migration logic is ordinary Tolk.
No original executable methods or byte patches are included. See
`uranus/UranusMemeV2/recovery-verification.json`.

## Uranus Meme Wallet V2/V3

Both named Tolk sources recover sharded wallet deployment, master/peer credit,
owner transfers, notifications, burn, bonding-curve sell, bounce compensation and
the wallet-data getter. Each complete BOC equals its archived mainnet oracle.
`npm run dedust:uranus-wallet` checks 60 messages and 15 getter probes per revision,
including exact gas and independent serialization, balances and TON budgets.

V2 preserves arbitrary message-address codecs, tolerated body suffixes and peer
authentication by the last 248 address bits. V3 uses strict std-address codecs,
checks the end of each decoded message, and requires the full sharded peer address.
Both preserve storage suffixes and the original transfer-budget debug instruction.
Small StateInit/hash, cursor and basechain primitives preserve the archived
compiler's instructions; no executable oracle cells are embedded in either build.

Six native Acton tests execute both revisions, deliver a real transfer and its
StateInit to a newly deployed peer, verify token conservation and authorization,
and restore burned/sold balances using actual outgoing bodies as bounced messages.
See each family's `recovery-verification.json`.

## Pool V2

`dedust/cpmm/CpmmPoolV2/main.tolk` dispatches all 16 incoming variants through named lifecycle,
payment, liquidity, fee, reward, state and upgrade handlers. `candidate.tolk` remains
a compatibility import of that entrypoint. `npm run dedust:pool-handlers` verifies
116 complete-contract message probes and 12 getter probes. Six state responses
independently verify the actual code hash, without rewriting either output.

The full 10032-byte BOC equals mainnet, with code hash
`6045e67b617e73486aac445cfcad0dbead6d315ccc8f4aede3f2e23ad14da4b0`.
All ten dictionary values match: 0, 19–24, 72157, 81689 and 112421. Method 0 includes
the exact incoming union decoder and every handler. `candidate-progress.json`
records source hashes, compilation identity and all behavior comparisons.

Method 20 recovers swaps, deposits, reward funding, activation, continuation
routing and rejection context. `npm run dedust:pool-processing` checks its complete
isolated fixture against archived method bodies in the same dictionary layout:
113 probes compare state, actions, outgoing values and gas. Independent expectations
cover reserve and fee accounting, swap events, reward budget/duration, rounding,
malformed input and failure context. Its complete dictionary value has hash
`33c68c47a272507a261c084d7a6fe14f37a7e1d9ddd7906f419a8017a2aa35f2`.

Compatibility details preserve instruction order and cell placement: referenced
method entries, typed CALLDICT bridges, legacy StateInit primitives, union tags,
nullable codecs and original stack widths. Small typed asm operations contain no
original executable cells or BOC blobs. The wallet-resolution helper carries the
complete wallet-map record, and transaction fields are read at their original
points. Fee/zero tests retain the original branch order. Liquidity and reward
updates preserve eager validation, reserve calculation and message serialization.

The emulator resolves Deposit, Position and AffiliateAccount libraries compiled
from recovered source. Oracle executable bodies appear only on the comparison
side; they are never substituted into a source build.

## Pool V1

`dedust/cpmm/CpmmPoolV1/main.tolk` imports the shared V2 schemas, getters and unchanged
handlers. Separate `handlers.tolk`, `processing.tolk` and `transfers-v1.tolk`
preserve the earlier fee policy and evaluation order. Its complete serialized
BOC equals mainnet, with code hash
`87b566c019a1c6fc691dcc5042559368db755428ef8e0f45eb23ade0118c4c36`.
All ten dictionary values match; 116 complete-message and 12 getter probes
compare exact gas, state, actions and outgoing amounts. Run
`npm run dedust:pool-handlers -- V1`; see `dedust/cpmm/CpmmPoolV1/recovery-verification.json`.

V1 allocates 30% of the swap's base fee to protocol; V2 allocates 20%. Independent
calculations check reserve/fee/checkpoint updates in both directions and all three
fee selectors. A native Acton test executes each complete revision and independently
checks its protocol, creator and LP amounts. The resolver-budget boundary also
distinguishes V1's calculated processing gas fee from V2's 10,000,000 floor.

The build harness collects relative Tolk imports under the reconstruction root,
retains their directory layout and records hashes for every actual source dependency.

## Shared Pool modules

Both Pool revisions share independently verified helpers. Their proof files in
`CpmmPoolV2/` record exact module code and independent probes, including gas:

| Proof | Coverage | Probes |
| --- | --- | ---: |
| rewards-verification.json | Reward accrual and dictionary synchronization | 64 |
| addresses-verification.json | Position/Deposit deployment and address getter | 62 |
| wallets-verification.json | Resolver scheduling and both lookup directions | 39 |
| getters-verification.json | All three public getters | 202 |
| calculations-verification.json | Integer root, payout normalization, reward lookup | 229 |
| events-verification.json | Swap, deposit and withdrawal events | 56 |
| transfers-verification.json | Excesses, payout wallet, resolver requests, reward lookup | 192 |
| payment-verification.json | TON/jetton payouts and callbacks | 160 |
| routing-verification.json | Continuations and AffiliateAccount deployment | 193 |
| settlement-verification.json | Reserve, payouts and excesses | 139 |

Pool V2 adds a 10,000,000 minimum processing fee to wallet resolution; V1 lacks
it. A low-gas-price configuration verifies this distinction. Complete Pool V1
acceptance additionally uses the whole-contract proofs above.

## ClassicBlank

`dedust/classic/ClassicBlank/main.fc` recovers owner authorization, code installation and immediate
handoff to the installed constructor (method 58662, seven arguments). Failure
restores data/actions and sends an empty full-balance refund with mode 160, deleting
the emptied account. The loader preserves template and body suffixes for the
constructor; it does not suppress bounced messages. The complete 165-byte BOC has
hash `b0c7b8d5323cc9ba90fef98f9220fd86bee9382a8910b84f2926c4c9c986ebaf`.

The reproducible build uses pinned FunC 0.4.4 from `func-bin-044`
(`@ton-community/func-js-bin@0.4.4-newops.1`), including its extended Fift instruction
library. Ordinary FunC expresses the whole flow; two fixed-width field codecs
retain the archived loader's physical result order. A single STZEROES primitive
retains the refund header. There are no original executable blobs or byte patches.
`func-stdlib.fc` retains the TON standard library and its LGPL notice.

`npm run dedust:classic-blank` compares complete BOC bytes, 33 message probes and
two constructor-hook probes, including exact gas and refund amounts. An independent
source-built constructor records all seven arguments and deliberately changes data
and sends before throwing, verifying rollback. Three native Acton tests additionally
verify code identity, immediate construction and deletion after failure.
See `dedust/classic/ClassicBlank/recovery-verification.json`.

## ClassicOperator

`dedust/classic/ClassicOperator/main.fc` recovers strict storage, owner-authorized versioned
upgrades, beneficiary changes with a 172800-second delay and authorized withdrawals.
An upgrade saves its version, installs the code and immediately runs method 43092
in the new c3 dictionary. Failed hooks roll back code, data and actions. Beneficiary
changes refund attached funds after the archived 5181-gas estimate; withdrawal
forwards a referenced payload with bounce enabled after the 4133-gas estimate.

The complete 455-byte BOC has hash
`2dbbf4ce98dd9d41e2eba5b88f74faed0ffe50136930617bf5973e4972977cc9`.
`npm run dedust:classic-operator` checks 36 message and 40 getter probes with exact
gas, outgoing amounts, independent storage/authorization/time/error expectations,
and real construction through source-built ClassicBlank. Four native Acton tests
cover identity, initialization, delayed withdrawal and failed/successful upgrades.
See `dedust/classic/ClassicOperator/recovery-verification.json`.

## ClassicLpWallet

`dedust/classic/ClassicLpWallet/main.fc` recovers canonical peer derivation, owner transfers,
pool/peer credits, owner notification, TON excesses, burn and bounce compensation.
The complete 836-byte BOC equals mainnet. Storage suffixes are accepted and bounce
prefixes are skipped without validation, matching the archived implementation.
Fee checks retain strict inequalities and the original forward-fee calculation.
Small typed primitives preserve opcode evaluation, arithmetic and builder order.

`npm run dedust:classic-lp-wallet` checks 52 message and 17 getter probes with
independent amounts, state and wire payload expectations, and exact gas. Five
native Acton tests also deliver an actual transfer body/amount between two
canonical wallets and check token conservation, authorization, burn and bounce.
See `dedust/classic/ClassicLpWallet/recovery-verification.json`.

## ClassicJettonVault

`dedust/classic/ClassicJettonVault/main.fc` recovers jetton-wallet resolution and activation,
TEP74 notifications with inline/referenced forward payloads, swap routing,
liquidity funding, authenticated pool/deposit payouts, readiness, cleanup,
operator excess withdrawal and factory upgrades. The complete 3811-byte BOC
and all 18 dictionary values equal mainnet, with hash
`a30f0486b813dfe55f549fa986272349a96335e1e44e7276d4878c870083306f`.

Ordinary FunC `try/catch` expresses the protected notification. Its catch clears
pending actions, sends the jetton refund, commits and rethrows the original error.
The refund survives the exception. Underfunded/deep swap requests refund without
throwing; failed liquidity requests refund and report the original exit. Resolution
checks the master and inactive state, validates optional owner data and preserves
the supplied wallet. Constructor master overrides and bounce/cleanup behavior
retain the archive's validation and suffix rules.

`npm run dedust:jetton-vault` checks 74 messages and 30 getter probes with exact
gas and independent wire/state/fee expectations. Nine native Acton tests cover
installation, activation, swap, liquidity, committed error refund, authenticated
payout, cancellation and upgrade rollback. Liquidity forwarding uses GASCONSUMED;
its amount is bounded independently and compared exactly between complete codes.
A fixed callback hash suppresses forward TON on pool payout. Its original payload
preimage remains unknown; the hash condition is preserved exactly and ordinary
null, empty and nonempty callbacks are tested. Small typed primitives preserve
legacy stack/field ABI, empty action-list construction and the static method-138
PREPAREDICT/CALLXARGS bridge. No archived executable blob is included.
See `dedust/classic/ClassicJettonVault/recovery-verification.json`.

## ClassicNativeVault

`dedust/classic/ClassicNativeVault/main.fc` recovers TON swap routing, liquidity funding,
authenticated pool payouts and deposit refunds, readiness, operator excess
withdrawal and factory upgrades with immediate execution of the new code's hook.
The full 2302-byte BOC and all 14 dictionary values equal mainnet, with hash
`875fac5e08e5062f0f7c5c9f4c989607108e35a9ad88dc563e3e4fc7a3d3e75c`.

Named storage and wire helpers expose the template descriptor, factory/blank-code
base, version and locked TON. Fee getters retain the archived gas estimates and
original-forward-fee rounding. A version-4 migration hook retains its historical
locked balance of 1792093259305502. The known upgrade hook ABI is zero arguments
and zero results; generic dynamic dispatch is not assumed to share that ABI.

`npm run dedust:native-vault` checks 70 messages and 28 getter/hook probes,
including independent bodies, amounts, state, fee calculations and exact gas.
Eight native Acton tests cover Blank initialization, swap and liquidity wire
formats, authenticated payout/refund, operator reserve and successful/failed
upgrade hooks. Typed field, tuple, evaluation and bool-serializer operations retain
the legacy stack ABI and inline cell boundaries. They include no archived
executable cells. See `dedust/classic/ClassicNativeVault/recovery-verification.json`.

## ClassicLiquidityDeposit

`dedust/classic/ClassicLiquidityDeposit/main.fc` recovers the factory-authorized collection of two
assets, threshold-triggered pool requests, pending-deposit refunds, owner cancellation,
authenticated pool success/failure responses, bounce compensation and all eight getters.
Its complete 2104-byte BOC and all 18 dictionary methods equal the frozen mainnet
code, hash `80edc8d7bbbb6526c3b06ccb7c2d02a82c20d8ccdf431bf4088b1f1470cc94cc`.

`npm run dedust:classic-deposit` verifies 57 message and 40 getter probes. Independent
expectations cover asset tags, threshold boundaries, original fee rounding, full-balance
refund/deletion, message bodies, authorization, overflow, strict storage parsing and real
initialization through source-built Blank. Seven Acton tests execute this complete
initialization/collection/request/refund flow and inspect actual outgoing wire messages.

Compatibility primitives preserve fixed-width field order and old builder/tuple ABI.
Asset parsing uses ordinary control flow with local alternative returns; the decoder is
shared and inlined. An opaque throw preserves unreachable null slots from the archived
compiler. No original executable cells, assembly method bodies or BOC substitutions are
included in the readable source build.

Observed details are preserved: successful responses refund at most one surplus asset
(asset0 takes priority); response authentication binds the sender to the supplied pool
config and validates factory/template kind without comparing its assets to stored assets;
unknown collected assets leave balances unchanged; bounce prefixes are skipped without
validation. Tests establish these behaviors, without asserting original source names.
See `dedust/classic/ClassicLiquidityDeposit/recovery-verification.json`.

Typed field/equality primitives preserve the archived evaluation and stack order;
inline message codecs retain query values until strict end-of-slice validation.
No original method cells are embedded. The extended Fift distribution supports
STORAGEFEES/GETGASFEE while retaining the FunC 0.4.4 code generator. Both FunC
contracts are rebuilt and rechecked when that distribution changes.

## Reproduce

Install pinned Node dependencies with `npm ci` in `regression/`. Install Acton
1.0.0 with Tolk 1.4.0. On Windows the harness invokes Ubuntu WSL:

```powershell
cd F:\dedust\tvm-decompiler\regression
$env:ACTON_WSL_PATH='/home/fiscaldev/.acton/bin/acton'
npm --script-shell=cmd.exe run dedust:recovery
npm --script-shell=cmd.exe run dedust:x1000
npm --script-shell=cmd.exe run dedust:pool-handlers
npm --script-shell=cmd.exe run dedust:pool-processing
```

The explicit Windows script shell avoids Git Bash converting the Unix Acton
path into a Windows path. On Linux, use ordinary `npm run` commands and Acton
from `PATH` (or `ACTON_EXE`).

Builds read editable Tolk and serialize the compiler output. Frozen BOCs in
`oracles/` serve only as independent comparisons and local emulator oracles.
Temporary output goes into `build/` and `regression/artifacts/`.

The recovery gate also builds FunC 0.4.4 contracts from editable sources. Acton
consumes those generated BOCs in `build/`, after byte comparison, because its
default FunC compiler differs. Run the gate before running the native tests directly;
the tracked oracle files never supply a reconstructed build artifact.

## Other recovered contracts

Deposit preserves any-address decoding, eager configuration reads, strict nested
records and message headers. A typed storage helper retains the referenced c4
write. Its code hash is
`2cac3fddd30969d08df036067108c6e7d69780a9459d931d2eb63d95d5ff6825`.

AffiliateAccount requires no asm inserts. It preserves suffix handling, strict
getters and fixed-width metadata. Its code hash is
`4456fad12a434c4898b05ac65bab5de80db33f275c6020746de8e111a5cda4e6`.

Position recovers liquidity locking, Q120 fee/reward accounting, dictionary
iteration, authorization, state responses and bounce compensation. Failed
withdrawals commit excesses and rethrow. Four typed primitive helpers preserve
individual VM operations. Its code hash is
`dd82f24db614798ee7c579f8b3f07f0645d06d65cede368d80d0d74b180d2dd6`.
The decompiler now joins heterogeneous branch-slot types; the real Position
fixture decodes completely in both output languages.

## Oracle provenance

`oracles.json` pins code hashes, BOC SHA-256 and discovery evidence. The archive
covers current DeDust mainnet configuration, representative revisions and
recursively resolved library code: 21 families, not every deployed instance.
Snapshots were retrieved at different times. Consensus proofs and original
source/compiler were not obtained. The related X1000 wallet is labelled separately.
The scoped `@ton/tasm` 0.6.1 encoder adapter preserves explicit exotic library
cells. Legacy Tolk stdlib StateInit primitives retain attribution and LGPL licensing.

See `../docs/dedust-reconstruction-spec.md` for acceptance and recovery history.

Deposit ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/deposit
Position ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/position

## ClassicFactory

`dedust/classic/ClassicFactory/main.fc` restores the complete code registry, delayed ownership
transfer, deterministic Blank-backed Vault/Pool/Deposit/Operator deployments and
version upgrades. All 34 method dictionary entries and the entire 3733-byte BOC
match. Typed codec/ABI helpers preserve legacy stack order and code-cell boundaries;
all contract logic is expressed in FunC.

Independent fixtures cover 73 messages and 34 getters, including inline Vault code
dictionary entries, legacy storage without Operator fields, sorted Pool assets and
precision fields, strict deployment budgets, sender proofs, canonical StateInit,
code/version registries, upgrade rollback, and the two-step Deposit installation
and funding sequence. The second funding amount is checked against an independent
fee bound; exact observed amount, actions and gas also match the frozen oracle.

Eight native Acton tests deliver actual Factory-to-Blank messages into the recovered
NativeVault, Operator and LiquidityDeposit implementations. They verify ownership's
48-hour boundary, canonical deployment messages, registry authorization, deposited
balances and installed upgrade-hook rollback. See
`dedust/classic/ClassicFactory/recovery-verification.json`.
