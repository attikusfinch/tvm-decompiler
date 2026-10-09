# Normalization specification

## Scope and invariant

The scope is the 21 code families in `workspace.json`. A normalized contract is
accepted only when its source-built, canonical serialized BOC is identical to its
frozen mainnet oracle and its behavioral tests pass. Names describe recovered roles;
they do not claim knowledge of private author symbols. Published archive files are
kept separately, so verifier source digests remain reproducible.

## Completed steps

1. Update Acton to stable 1.2.1; retain a separately pinned historical source compiler.
2. Scaffold Classic DEX, CPMM, Uranus and X1000 with independent Acton manifests,
   package commands, tests, source folders and explicit cross-project dependencies.
3. Install pinned npm compilers/core/crypto and initialize Acton's bundled library.
4. Normalize all contract layouts without sorting compiler-sensitive imports.
5. Recover 213 forward-declaration parameter names from definitions, name 81 decoded
   cursors, and replace unresolved public FunC getter return types with their proven types.
6. Separate X1000 entry points, flatten its 12 selector predicates and remove ten
   redundant result triples while keeping the same code bytes.
7. Deduplicate the two Uranus StateInit variants by revision, retaining original
   third-party notices and the physical ABI expected by each code family.
8. Move the 162 existing behavioral tests into their owning projects and migrate
   external-message rejection assertions to Acton's structured result API. Assert
   precise VM error codes for invalid sequence, bad signature and replay.
9. Inspect representative mainnet transactions; retain raw BOCs and verify every
   saved graph edge offline. Keep X1000's emulated integration distinct from an
   observed mainnet relationship.
10. Add four archived-message tests, including a forged-sender case and repeat
    initialization refusal; provide reproducible local commands and CI checks.

## Required checks for future changes

`npm run verify` checks formatting, evidence and project builds/tests. A clean checkout
must need only `npm ci` and the pinned Acton release. The build must fail if an entry is
missing, a compiler version differs, the oracle was altered, or the new BOC differs.
No automatic deployment, wallet access, on-chain library publication or verification
upload is part of this workflow.

## Deliberate compatibility boundaries

Do not reorder function discovery, replace opcode/evaluation barriers blindly,
reinterpret optional cell/null ABI slots, or rewrite union layouts merely for style.
Any further cleanup of these primitives needs a successful exact build, independent
behavior checks, and a documented explanation. Updating Tolk to 1.5 produces a new
contract implementation and must be treated as a separate migration.
