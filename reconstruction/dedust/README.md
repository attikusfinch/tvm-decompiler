# DeDust reconstruction

This directory separates frozen mainnet oracles, editable TVM instruction
references, and recovered Tolk logic. It is **not** the original DeDust source.
Names and layout descriptions are inferred from the public ABI and the code.

Current verified result: **CpmmDeposit** compiles with Acton 1.0.0 / Tolk 1.4.0
to executable code `2cac3fddd30969d08df036067108c6e7d69780a9459d931d2eb63d95d5ff6825`.
With BOC serialization `idx=false, crc32=true`, the complete 522-byte file equals
the frozen mainnet oracle byte-for-byte. Its 9 getter probes, 21 message probes and
7 Acton tests pass. State, actions, outgoing messages, exits and gas are compared.

All 21 unique code families have exact, editable `reference.tasm` files. Those
files are instruction references, **not** evidence that the remaining 20 contracts
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

## Oracle provenance

`oracles.json` pins every code hash and BOC SHA-256 and preserves discovery
evidence. Scope: current DeDust mainnet configuration, representative deployed
revisions, and recursively resolved library code. This is 21 executable code
families, not all pool/wallet instances. Snapshots were retrieved at different
times; consensus proofs and the original author's source/compiler were not
obtained. The related X1000 wallet remains labelled separately from core DeDust.

Deposit ABI: https://hub-beta.dedust.io/docs/cpmm-v2/reference/deposit
