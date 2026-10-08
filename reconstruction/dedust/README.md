# DeDust reconstruction

This directory separates frozen mainnet oracles, editable TVM instruction
references, and recovered Tolk logic. It is **not** the original DeDust source.
Names and layout descriptions are inferred from the public ABI and the code.

Current verified results: **CpmmDeposit**, **CpmmAffiliateAccount** and **CpmmPosition** compile with Acton 1.0.0 / Tolk 1.4.0.
Deposit compiles
to executable code `2cac3fddd30969d08df036067108c6e7d69780a9459d931d2eb63d95d5ff6825`.
With BOC serialization `idx=false, crc32=true`, the complete 522-byte file equals
the frozen mainnet oracle byte-for-byte. Its 9 getter probes, 21 message probes and
7 Acton tests pass. AffiliateAccount's complete 306-byte BOC also equals mainnet
(`4456fad12a434c4898b05ac65bab5de80db33f275c6020746de8e111a5cda4e6`);
its 6 getter probes, 21 message probes and 5 Acton tests pass. State, actions,
outgoing messages, exits and gas are compared.

Position's complete 1540-byte BOC equals mainnet
(`dd82f24db614798ee7c579f8b3f07f0645d06d65cede368d80d0d74b180d2dd6`);
14 getter probes, 49 message probes and 8 Acton tests pass. Together the three
contracts have 120 differential probes and 20 native Acton tests.

The Pool's reward accrual and reward-dictionary modules now compile to their
original shared code cells in both revisions. They add 64 independent probes and
5 native Acton module tests, bringing the Acton project to 25 tests. Their module
proof is in `CpmmPoolV2/rewards-verification.json`; the complete Pool remains open.

Position/Deposit deployment and the entire `get_position_address` getter also
match their cells in both Pool revisions. Their 62 differential probes include
gas and independent expectations; four Acton module tests bring the project to
29 native tests. See `CpmmPoolV2/addresses-verification.json`. The compatibility
module retains the attributed LGPL-licensed old Tolk stdlib StateInit primitives.

Four wallet registry helpers also match both Pool revisions. Their isolated build
is byte-identical and 39 differential probes with gas plus four native module tests
pass (`CpmmPoolV2/wallets-verification.json`). The project now has 33 Acton tests.

All three public Pool getters are now exact in both revisions. The typed storage
and getter sources pass a complete isolated BOC comparison and 202 independent
differential probes including gas. Four Acton tests bring the project to 37 native
tests. See `CpmmPoolV2/getters-verification.json`; full Pool recovery is still open.

Initial-liquidity integer square root, payout address normalization and allowed
reward lookup also match both Pool revisions' implementations. Their isolated
BOC is exact; 229 independent probes with gas and four Acton tests pass. The
project now has 41 native tests. See `CpmmPoolV2/calculations-verification.json`.

The three Pool event methods are exact as well. An isolated complete BOC and 56
probes verify raw action lists, ABI bodies, gas and independent forwarding fees.
Three Acton tests bring the project to 44 native tests. See
`CpmmPoolV2/events-verification.json`. Getter/math bounds now include the full
120-bit maximum of `VarUInteger 16`.

Both CPMM Pool revisions now decode completely and their full raw Tolk compiles.
`npm run dedust:pool-decompile` checks 33 getter cases per revision against the
frozen code and independent expectations, including the Position address derived
from an exotic library reference. Pool bytecode and readable recovery remain
unfinished; these getter checks do not establish full message-path equivalence.

All 21 unique code families have exact, editable `reference.tasm` files. Those
files are instruction references, **not** evidence that the remaining 18 contracts
have readable recovered Tolk. See `verification.json` for per-contract status and
`../../docs/dedust-reconstruction-spec.md` for acceptance gates and remaining work.

## Reproduce

Install the pinned Node dependencies with `npm ci` in `regression/`. Install Acton
1.0.0 and use its Tolk 1.4.0 compiler and SDK. On Windows the harness uses Ubuntu
WSL; set `ACTON_WSL_PATH` if the binary is not `/home/fiscaldev/.acton/bin/acton`.

```powershell
cd F:\dedust\tvm-decompiler\regression
$env:ACTON_WSL_PATH='/home/fiscaldev/.acton/bin/acton'
npm run dedust:recovery
```

The build reads Tolk sources, invokes Acton, and serializes the resulting cell.
It never substitutes code from `oracles/`. The frozen BOCs are used only for
independent comparisons and the oracle half of local emulation tests. Temporary
build output goes into `build/`; the full proof report is `verification.json`.

## Exact layout details in Deposit

- Addresses use `any_address`: the original reads `LDMSGADDR`, including legal
  non-standard/none encodings. Narrowing them to `address` emits different checks.
- Config and payout loading remains eager. Discarded fields are still decoded and
  trailing bits/references are rejected, as in the original.
- A compile-time outgoing-union registration function preserves incoming union
  IDs 132/133. The function emits no runtime code. Those IDs are compiler details,
  not public opcodes or guessed original type names.
- One typed asm helper packs the declared `DepositStorage` field order and sets
  c4 in a referenced code cell, preserving the physical layout of dictionary entry
  2. Its instructions are explicit; it contains no BOC/base64 executable blob.
- Manual message headers preserve the original combined stores and their modes.

The exact instruction-reference assembler uses a scoped compatibility adapter for
`@ton/tasm` 0.6.1's exotic-cell encoder. Its tests distinguish an actual library
reference from ordinary data containing identical bytes.

AffiliateAccount requires no asm inserts. It keeps incoming/storage suffix handling
separate from the strict getter. `bits1` and `bits272` are loaded eagerly with fixed
widths; storing them skips added compiler validation to preserve the original
instruction sequence. An unused union-registration function fixes the getter's
132/133 type IDs. The inferred names `authority`, `owner` and message names describe
the executable behavior and are not asserted to be original identifiers.

## Exact layout details in Position

The source recovers liquidity locking, 120-bit fixed-point fee/reward accrual,
reward dictionary iteration, public state responses, authorization and three
bounce compensation paths. The failed-withdrawal handler sends excesses, commits
the actions and rethrows. Getters deliberately accept partial fee records that
the mutation paths reject.

Four small typed asm helpers preserve specific operations: two independent zero
constants for an empty reward, `EQINT 0`, `CONDSEL` for optional fees, and `NIP`
to select a wide nullable struct's variant slot. The optional reward serializer
is written in Tolk and keeps the original zero-variant-first branch order. These
helpers contain no original executable cells or BOC payloads. Arithmetic uses
`mulDivFloor(..., 1 << 120)` so its intermediate multiplication remains 512-bit.

The decompiler's branch merge now joins the types of all incoming slots. A tagged
union may reuse one physical slot for an integer in one arm and a cell in another;
assuming the first arm's type incorrectly rejected the original Position code.

## Oracle provenance

`oracles.json` pins every code hash and BOC SHA-256 and preserves discovery
evidence. Scope: current DeDust mainnet configuration, representative deployed
revisions, and recursively resolved library code. This is 21 executable code
families, not all pool/wallet instances. Snapshots were retrieved at different
times; consensus proofs and the original author's source/compiler were not
obtained. The related X1000 wallet remains labelled separately from core DeDust.

Deposit ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/deposit
Position ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/position
