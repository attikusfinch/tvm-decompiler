# DeDust reconstruction

Readable, byte-identical Tolk recovery is verified for **4 of 21 archived code
families**: CpmmDeposit, CpmmAffiliateAccount, CpmmPosition and CpmmPoolV2.
The sources describe executable behavior; original names and comments are unknown.

| Contract | Serialized BOC | Getter probes | Message probes |
| --- | ---: | ---: | ---: |
| CpmmDeposit | 522 bytes | 9 | 21 |
| CpmmAffiliateAccount | 306 bytes | 6 | 21 |
| CpmmPosition | 1540 bytes | 14 | 49 |
| CpmmPoolV2 | 10032 bytes | 12 | 109 |

Each source-built contract equals its frozen mainnet oracle, including the complete
cell graph and BOC bytes with `idx=false, crc32=true`. Differential probes compare
exits, storage, raw actions, outgoing messages and amounts, and exact gas. Independent
expectations check decoded results and economic calculations. The shared Acton
project passes **68 native tests**. See `verification.json` for per-family results.

All 21 families also have exact, editable `reference.tasm` instruction references.
The remaining **17 families** have not passed readable-source acceptance. Their
instruction references do not establish readable recovery.

## Pool V2

`CpmmPoolV2/main.tolk` dispatches all 16 incoming variants through named lifecycle,
payment, liquidity, fee, reward, state and upgrade handlers. `candidate.tolk` remains
a compatibility import of that entrypoint. `npm run dedust:pool-handlers` verifies
109 complete-contract message probes and 12 getter probes. Six state responses
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
it. A low-gas-price configuration verifies this distinction. These shared proofs
alone do not establish complete Pool V1 recovery.

## Reproduce

Install pinned Node dependencies with `npm ci` in `regression/`. Install Acton
1.0.0 with Tolk 1.4.0. On Windows the harness invokes Ubuntu WSL:

```powershell
cd F:\dedust\tvm-decompiler\regression
$env:ACTON_WSL_PATH='/home/fiscaldev/.acton/bin/acton'
npm run dedust:recovery
npm run dedust:pool-handlers
npm run dedust:pool-processing
```

Builds read editable Tolk and serialize the compiler output. Frozen BOCs in
`oracles/` serve only as independent comparisons and local emulator oracles.
Temporary output goes into `build/` and `regression/artifacts/`.

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

See `../../docs/dedust-reconstruction-spec.md` for acceptance and remaining work.

Deposit ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/deposit
Position ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/position
