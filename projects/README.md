# Recovered TON contracts — clean Acton workspace

Four editable projects, 21 deployed code families. These are normalized reconstructions,
not the contracts' original author sources. The published recovery snapshot remains in
[`../reconstruction`](../reconstruction/README.md); new development belongs here.

| Project | Contracts | Responsibility |
| --- | ---: | --- |
| [Classic DEX](classic-dex/README.md) | 10 | Factory, Blank loader, vaults, pool V7/V8/V9, liquidity deposit, LP wallet, operator |
| [CPMM](cpmm/README.md) | 5 | Pool V1/V2, deposit, position and affiliate accounting |
| [Uranus](uranus/README.md) | 5 | Factory V3, bonding-curve masters V2/V3 and their jetton wallets |
| [X1000](x1000/README.md) | 1 | Signed execution wallet, batches, protocol dispatch and retries |

## Quick start

Use Node 22+ and **Acton 1.2.1**. Install Acton using its
[official instructions](https://ton-blockchain.github.io/acton/docs/installation).

```sh
cd projects
npm ci
npm run doctor
npm run verify
```

Windows Node can run these commands against Acton in WSL Ubuntu. Override
`WSL_DISTRO` / `ACTON_WSL_PATH` if necessary. On Linux/macOS, `acton` must be on
`PATH`, or set `ACTON_EXE`. The same lockfile works on Windows and Linux.

Work on one project:

```sh
npm run build -- cpmm
npm test -- cpmm
npm run fmt -- cpmm
# Or from projects/cpmm:
npm run build
npm test
# In a shell with Node and Acton:
acton run test-exact
```

`npm test` builds the requested project and its source dependencies first, installs
Acton's bundled `.acton` library, then runs local emulation. It never broadcasts a
transaction, opens a wallet or publishes an on-chain library. Run `acton test` directly
only after this preparation. `acton build` alone consumes the last prepared artifacts;
use `npm run build` / `acton run build-exact` after source edits.

## Reproducible source builds

Acton 1.2.1 bundles Tolk 1.5, which changes the deployed bytecode. The exact build
therefore pins **Tolk 1.4.0** and **FunC 0.4.4** (newops distribution) in
[`package-lock.json`](package-lock.json). Acton 1.2.1 compiles the tests and executes
the resulting source-built BOCs. A test helper compiled with 1.5 is never used as a
replacement for the deployed contract.

The build compiles every entry from editable files, serializes with `idx=false,
crc32=true`, checks the oracle's SHA256, and compares **every serialized byte**.
On any mismatch it fails. It does not copy oracle code into the candidate, patch
instructions or substitute an embedded original BOC. Proofs containing compiler
versions and hashes of all inputs are written to `<project>/build/<Contract>/proof.json`.

`workspace.json` records ownership and source dependencies. Acton manifests list BOC
inputs without `depends`, as required for precompiled sources in Acton 1.2. Shared
source lives once: Uranus's CPMM dependency and X1000's wallet integration use sibling
projects. Keep the workspace together when cloning it.

## Normalization and libraries

- [Readability rules and experiment results](READABILITY.md) explain opcode names,
  message fields, standard-library replacements and bytecode-sensitive exceptions.
- The reviewed [opcode catalog](libraries/messages/opcodes.json) records naming evidence;
  `npm run opcodes:generate` produces both FunC and Tolk constants and CI checks consistency.
- Canonical four-space layout; a conservative FunC formatter checks token preservation.
- FunC forward declarations use the names from their definitions. Getter signatures
  have concrete types; decoded slice cursors have field-based names where evidenced.
- X1000 external/internal entry points are separate, protocol dispatch is a flat
  `else if` chain, and redundant result triples are removed.
- Uranus masters and wallets share versioned StateInit primitives in `contracts/common`.
- FunC stdlib is shared in `libraries/func`; Tolk stdlib is compiler-pinned;
  Acton stdlib is initialized per project. See [third-party notices](libraries/README.md).
- Assembly compatibility primitives, union layout anchors and evaluation barriers
  are retained where ordinary source changes the exact deployed bytecode.

**Use `npm run fmt`, not unrestricted `acton fmt`.** Acton's normal formatter sorts
imports. Historical Tolk assigns union tags and method IDs in discovery order.
Our formatter uses full-file ranges to keep that order while formatting the code.
Run the byte-exact build after any transformation.

## Chain evidence and tests

[`evidence/interactions.json`](evidence/interactions.json) records a bounded mainnet
sample: **311 transactions, 181 inspected peers, 43 distinct interaction examples**.
Raw transaction and account-code BOCs are included. `npm run chain:check` independently
decodes them and verifies hashes, endpoints, opcodes, values and family classifications.
See [the interaction map](evidence/README.md) for observed and inferred relationships.

The Acton suite includes economic invariants, authorization, fee rounding, real
inter-contract message delivery, migrations, upgrades, rollback, signature validation,
replay protection and token conservation. Additional archived-message tests replay
Classic Factory → Blank → Pool V9, CPMM Deposit's complete two-credit lifecycle,
forged deposit settlement, and Uranus Factory → Meme V3 initialization.

These are local behavioral replays using saved messages and the emulator's blockchain
configuration, not claims of reproducing historical gas fees or whole transaction hashes.
Current peer code identifies families at observation time; only message StateInit
establishes deployed code at a historical step. Consensus proofs were not fetched.

```sh
npm run chain:refresh  # optional, read-only network discovery
npm run chain:check   # offline verification of the saved evidence
```

JUnit reports and console logs are in `<project>/test-results`. See
[`NORMALIZATION.md`](NORMALIZATION.md) for the acceptance criteria and completed work.
The latest successful full run writes a compact [`verification.json`](verification.json).
The [validation record](VALIDATION.md) also covers clean-checkout builds and deliberate hash-mismatch controls.
