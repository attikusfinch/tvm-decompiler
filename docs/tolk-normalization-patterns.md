# Tolk normalization patterns

The pipeline is **BOC → shared TVM IR → emitted Tolk → TolkNormalizer → normalized Tolk**. The normalizer consumes emitted source, independently of TVM parsing and Tolk printing. Its token view recognizes function boundaries and excludes strings/comments from matching. Rules apply in order and return an audit trail; JSON exposes `normalizations`. `--no-normalize` returns the exact input to this stage. Compatibility helpers remain the emitter's responsibility.

The first rules come from the address getter in Empty and Counter. They do not consume the original Acton sources. A separate inventory examines all eight raw outputs; [tolk-patterns.json](tolk-patterns.json) records per-contract counts, examples, raw-source line numbers, applied rules and parser diagnostics. These are observed forms, not a claim that every occurrence can be rewritten safely.

## First implemented rules

`address-getter-return` recognizes an externally identified method returning a single address load through an adjacent immutable binding:

```tolk
@method_id(83229)
fun fn_83229(): slice {
    val address = (contract.getData().beginParse().loadAddress() as slice);
    return address;
}
```

The normalizer changes the return type to `address` and folds those two statements. Storage-reading statements before them retain their exact order. It rejects branches/early returns, intervening statements, reassignment, attached comments and internal references to the function, which could require different call-site types. Unknown getter IDs retain their explicit annotation and generated name.

`owner-getter-name` requires method ID `CRC16/XMODEM("owner") | 0x10000 = 83229`, no parameters, an address result, an anonymous emitted name and no identifier collision. It produces:

```tolk
// Name inferred from method ID 83229; original name may differ.
get fun owner(): address {
    return contract.getData().beginParse().loadAddress();
}
```

The name is an ABI candidate, not a recovered fact: CRC16 collisions are possible. Native `get fun owner` computes the same method ID. Acton's compiler rejects combining `@method_id` with `get fun`, so the annotation is removed only after verifying the candidate's hash/signature. Other IDs and incompatible signatures remain explicit functions.

Both rules are idempotent. Partial decompilations skip the entire normalization stage and keep their files/diagnostics. Current rules must preserve the complete TVM code cell; the Acton harness compiles both stages and requires identical code-cell hashes. All six complete templates meet this requirement, with identical serialized BOCs as well. NftCollection and WalletV5 remain partial and unchanged. This compares normalization to the raw decompilation, separately from known differences between original contracts and recompiled output.

## Inventory across all eight templates

| Observed form | Count | Contracts | Next rule / checks needed |
|---|---:|---|---|
| Anonymous `fn_<method_id>` getters | 18 | All eight | Extend the ABI-candidate registry with hash, signature and collision checks. Never infer a source name from ID alone. |
| Adjacent returned address binding | 2 | Empty, Counter | Implemented: direct address return and candidate owner getter. |
| Primitive loads destructured into tuples | 113 | All except Empty | Native cursor loads with explicit receiver snapshots. Verify order, live aliases, result positions and underflow. Both storage and message loads occur here. |
| `matchPrefix` dispatch | 41 | All eight | Structured opcode dispatch after proving prefix width and fallback behavior. Preserve empty/truncated messages, unmatched tails and throw codes. WalletV5 also uses one-byte prefixes. |
| `.loadAddress() as slice` | 43 | All eight | Propagate address types across comparisons/stores/calls. Handle nullable/joined values and slice operations separately. |
| Bindings ending in `as int` | 69 | All eight | Distinguish boolean conversions from unknown/tuple-to-int casts. TVM true is -1; bitwise logic must retain integer semantics. |
| Optional-address compatibility loads | 21 | NftItem, JettonWallet, JettonMinter | Infer `address?` only with proven null semantics and matching TVM encodings. |
| `tvmNull() as slice/cell/int` | 9 | NftItem, JettonMinter, SimpleExtension | Recover nullable values across all branches and tuple return slots; test uninitialized NFT state. |
| Raw message sends | 15 | NftCollection, NftItem, JettonWallet, JettonMinter, SimpleExtension | Recognize builder/message layouts before using native message structures. Preserve refs, flags, modes, c5 actions and gas-sensitive values. |

The counts are searches of raw emitter output, before these new rules. Families overlap. Entries from partial NftCollection/WalletV5 outputs are discovery evidence only; they are not successful compilation/equivalence tests. WHILE stack recovery and AGAINEND support need parser work before normalizing those full contracts.

## Adding the next rule

1. Record representative raw fragments and their source-independent facts in this inventory, including negative examples.
2. Implement a separate `TolkNormalizer.Rule` with narrowly checked preconditions and an audit record. The emitter's output remains accessible with `--no-normalize`.
3. Check idempotence, comments/literals, aliases, nullable branches, evaluation order and preserved method IDs.
4. Compile raw and normalized code. For presentation/type rules, require TVM identity. For rules that intentionally change instruction selection, add explicit emulator comparisons of getter stacks, exit codes, storage, actions and outgoing values before relaxing this requirement.
5. Regenerate the template report, which exposes both stages, their request identities and applied rules.

```sh
npm run acton -- --local --native --language tolk --acton
npm run tolk:normalization
npm run tolk:edges
npm run tolk:patterns
npm run report
```

The Acton command exits 1 for the previously recorded original/recompiled behavioral differences and partial contracts. Its raw/normalized identity checks are independent of that status. The standalone normalization check exercises unknown IDs, a matching owner ID with the wrong signature and nullable returns: eight getter probes with valid/truncated storage. An additional internal-owner-call fixture produces the parser's known dynamic EXECUTE diagnostic (FunC lowers the large method-ID call through c3); it verifies unchanged partial files/diagnostics and skipped normalization. Unit tests also check internal references directly against emitted Tolk.
