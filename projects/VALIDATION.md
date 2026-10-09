# Validation

## Readability pass — 2026-10-10 (Asia/Tashkent)

Baseline: `da0347b`. See [the change log](READABILITY.md) and
[source inventory](READABILITY-AUDIT.md).

`npm run verify` passed after the final readability edits:

- 96 reviewed opcode entries produce consistent FunC and Tolk constants.
- 21 / 21 source-built code hashes and complete serialized BOCs match the frozen oracles.
- 166 Acton tests passed: Classic 60, CPMM 72, Uranus 25, X1000 9.
- 4 offline chain-evidence checks passed; formatting preserves import order.
- `reconstruction/` has no changes.

The accepted changes remove 125 local ASM declarations. In X1000, explicit
`as unknown` null checks and the constant two-zero-bit compatibility writer remain:
removing them changes the BOC. Two typed-map substitutions in CPMM also changed
the BOC and were restored. These were checked as isolated source transformations,
not accepted solely because an emulation test happened to pass.

## Workspace baseline — 2026-10-09

Source/tooling revision: `ccda200`.

| Check | Result |
| --- | --- |
| Source-built contract code hashes | 21 / 21 equal frozen mainnet code |
| Serialized BOCs (`idx=false`, `crc32=true`) | 21 / 21 byte-identical |
| Classic DEX Acton tests | 60 passed |
| CPMM Acton tests | 72 passed |
| Uranus Acton tests | 25 passed |
| X1000 Acton tests | 9 passed |
| Offline chain evidence checks | 4 passed |
| Formatting with import order preserved | Passed |

The full `npm run verify` command passed with Windows Node **22.12.0** plus WSL Acton
**1.2.1**, then passed again from a clean `git archive ccda200 projects` export using
Linux Node **22.23.3**. That export contained no `node_modules`, `.acton`, generated
code or compiled candidates. `npm ci` installed dependencies before the second run.
Both runs compiled editable sources with pinned Tolk 1.4.0 / FunC 0.4.4.

Two deliberate mutations were made only in the isolated export after the positive run:

| Contract | Mutation | Build outcome |
| --- | --- | --- |
| CpmmDeposit | Unknown-opcode exception `65535` → `65534` | Rejected: mainnet code hash differs |
| ClassicLpWallet | Minimum reserve `10000000` → `10000001` | Rejected: mainnet code hash differs |

The original source files in the export were restored in `finally` blocks. The
working projects and published `reconstruction` archive were never changed by these
negative controls. This checks that a validly compiling semantic change cannot pass
the byte-exact build merely because the behavioral tests still happen to pass.

The check proves equality with the archived original code, not discovery of every
historical deployment or identical historical fees. See [evidence limitations](evidence/README.md).
