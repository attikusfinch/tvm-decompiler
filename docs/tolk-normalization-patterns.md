# Tolk normalization patterns

The pipeline is **BOC → shared TVM IR → emitted Tolk → TolkNormalizer → normalized Tolk**. The normalizer consumes emitted source, independently of TVM parsing and Tolk printing. Its token view recognizes function boundaries and excludes strings/comments from matching. Rules apply in order and return an audit trail; JSON exposes `normalizations`. `--no-normalize` returns the exact input to this stage. Compatibility helpers remain the emitter's responsibility.

The first rules come from the address getter in Empty and Counter. They do not consume the original Acton sources. A separate inventory examines all eight raw outputs; [tolk-patterns.json](tolk-patterns.json) records per-contract counts, examples, raw-source line numbers, applied rules and parser diagnostics. These are observed forms, not a claim that every occurrence can be rewritten safely.

## Implemented rules

### Compiler sources as a pattern catalog

Both compilers are open source in the TON monorepo: [FunC](https://github.com/ton-blockchain/ton/tree/master/crypto/func) and [Tolk](https://github.com/ton-blockchain/ton/tree/master/tolk). The prefix study uses the `tolk-1.4.0` tag, matching the compiler generation verified through Acton here. Compiler lowering provides recognizable families, rather than a unique inverse: optimizations erase names, types, aliases and distinctions between equivalent source constructs.

| Source form | Compiler lowering | Recovery conditions |
|---|---|---|
| Ordinary `match (integer)` | Equality tests and nested IF/ELSE | Prove one stable subject, case values and exact fallback; an ordinary `if` chain can produce the same code. |
| `lazy MessageUnion.fromSlice(body); match (msg)` | Ordered `slice.tryStripPrefix` calls and IF/ELSE | Quiet prefix tests, disjoint widths/values, preserved tails and explicit unmatched behavior. Implemented for the narrow shape below. |
| Struct payload unpacking | Prefix checks followed by loads of bits/refs/coins | Stack positions, widths and cursor consumption can be recovered; semantic field names cannot. Pending schema rules. |
| FunC `if` with an early return | IFJMP/IFNOTJMP or IF/ELSE according to continuation/return context | Branch boundaries matter; wrapping code in a high-level construct can change gas even when outputs agree. |

Sources: Tolk's [`process_match_expression`](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/pipe-ast-to-legacy.cpp#L1253), union [`lazy_match`](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/pack-unpack-serializers.cpp#L991), [`compile_slice_sdbeginsq`](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/builtins.cpp#L1227), and FunC's [`_If` code generation](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/crypto/func/codegen.cpp#L547).

`prefix-lazy-match` reverses the lazy-prefix family after emission. The parser/emitter first retains the original embedded SDBEGINSQ opcode as `matchPrefix_<width>_<hex>(slice)` with an exact asm helper. Previously it expanded SDBEGINSQ into PUSHSLICE + SDBEGINSXQ, adding gas and preventing a byte-identical normalization. Actual dynamic SDBEGINSXQ calls keep their existing representation. The shared parser also refines the input as slice, so prefix-only getters do not acquire an incorrect int parameter.

```tolk
// Before normalization
var (bodyTail, matched) = matchPrefix_32_2CE05111(body);
if (matched != 0) {
    // existing branch statements
    return;
}
assert (body.isEmpty()) throw 65535;

// After normalization (declaration near imports)
struct (0x2CE05111) Message_32_2CE05111 { tail: RemainingBitsAndRefs }
val message = lazy Message_32_2CE05111.fromSlice(body);
match (message) {
    Message_32_2CE05111 => {
        var bodyTail = message.tail;
        // existing branch statements
        return;
    }
    else => {
        assert (body.isEmpty()) throw 65535;
    }
}
```

Multiple variants use an inferred union alias and retain source order. Names follow observed prefix bits and are not claims about the original message ABI. The tail remains opaque, including references; no schema is guessed. Empty/truncated/unknown prefixes reach the original fallback without an eager uint load. Exact widths include leading zeroes. Overlapping/duplicate prefixes, dynamic prefixes, comments, name collisions, nonterminal/joined arms, reused flags and live unmatched tails prevent reconstruction. The implemented path accepts nibble-aligned prefixes through 48 bits. Larger/non-nibble prefixes retain exact helpers. Nested early returns and a conditional/block immediately before the terminal return are excluded: JettonWallet demonstrated an IFJMP→IFNOT change under Tolk's match-arm return handling. Its dispatch stays explicit.

The rule restores five dispatches in four complete templates: Empty, Counter, NftItem and both SimpleExtension entrypoints. JettonWallet and JettonMinter keep exact prefix helpers under the conservative return-context guard. The standalone compiler-derived check exercises 348 getter inputs across seven fixtures, requiring original/raw/normalized TVM identity and equal gas; it covers 4/8/32-bit widths, short bodies, leading zeroes, refs, overlaps, live fallback tails and joins. All six complete templates retain raw/normalized BOC identity. Partial contracts still skip this stage.

`address-getter-return` recognizes an externally identified method returning a single address load through an adjacent immutable binding:

```tolk
@method_id(83229)
fun fn_83229(): slice {
    val address = (contract.getData().beginParse().loadAddress() as slice);
    return address;
}
```

The normalizer changes the return type to `address` and folds those two statements. Storage-reading statements before them retain their exact order. It rejects branches/early returns, intervening statements, reassignment, attached comments and internal references to the function, which could require different call-site types. Unknown getter IDs retain their explicit annotation and generated name.

The getter-name rule checks a registry of 17 ABI candidates, their CRC16 IDs, exact parameter/result stack signatures, anonymous emitted names and identifier collisions. `owner-getter-name` retains its original audit ID; other candidates use `abi-getter-name`. Candidates include common NFT/jetton/wallet methods and the observed `currentCounter`/`extensionInfo` names. No original template source is consumed by the rule. For owner, the required ID is `CRC16/XMODEM("owner") | 0x10000 = 83229`, with no parameters and an address result:

```tolk
// Name inferred from method ID 83229; original name may differ.
get fun owner(): address {
    return contract.getData().beginParse().loadAddress();
}
```

The name is an ABI candidate, not a recovered fact: CRC16 collisions are possible. Native `get fun owner` computes the same method ID. Acton's compiler rejects combining `@method_id` with `get fun`, so the annotation is removed only after verifying the candidate's hash/signature. Unknown IDs, incompatible signatures, internal references and conflicting names remain explicit functions. All nine getters in the six complete templates currently match registry candidates; the remaining nine are in partial contracts, which skip normalization.

`boolean-guard` folds a single-use immutable boolean binding into an immediately following `assert` or `if`, retaining inversion for `== 0` and `!`. It recognizes native `bitsEqual`/`isEmpty` predicates and comparisons, while retaining integer helpers, bitwise expressions and values used elsewhere:

```tolk
// Before
val result = (address.bitsEqual(incomingMessageSender()) as int);
assert (result != 0) throw 100;
// After
assert (address.bitsEqual(incomingMessageSender())) throw 100;
```

Attached comments and intervening statements prevent folding. A binding is never moved into a `while` test: that would repeat a formerly fixed computation. Explicit boolean casts already inside `if`/`assert`/`while` conditions can lose their integer zero-test without moving any evaluation.

`native-null-check` replaces the generated `tvmNull_x3f_`/ISNULL helper with a native null comparison. Integer value contexts retain `as int`, preserving TVM true=-1 and false=0, including bitwise operations and getter return values. A subsequent boolean-guard rewrite simplifies direct conditions:

```tolk
// Before
if (tvmNull_x3f_((a as unknown)) != 0) { /* ... */ }
// After
if ((a as unknown) == null) { /* ... */ }
```

The `unknown` escape is mandatory for legacy slots that can contain null despite their emitted `slice`/`int`/`cell` type. Acton constant-folds `a == null` to false for non-nullable types; `(a as unknown) == null` emits the original ISNULL. Compiler probes verified this distinction. The rule leaves custom helper definitions and commented/unsupported argument forms unchanged. Nested recognized predicates normalize to a fixed point.

All rules are idempotent; the engine repeats each productive rule to a fixed point and checks edit overlap/progress. Applied-rule audit records are deduplicated per rule/function. Partial decompilations skip the entire normalization stage and keep their files/diagnostics. Current rules must preserve the complete TVM code cell; the Acton harness compiles both stages and requires identical code-cell hashes. All six complete templates meet this requirement, with identical serialized BOCs as well. NftCollection and WalletV5 remain partial and unchanged. This compares normalization to the raw decompilation, separately from known differences between original contracts and recompiled output.

## Inventory across all eight templates

The [compiler recovery specification](compiler-recovery-spec.md) tracks 24 families and their dependencies. The first batch adds three separate rules: `integer-match` for terminal ordered equality chains of a proven local int; `conditional-select` for CONDSEL with pre-evaluated local references/literals of the same scalar type; and `cursor-load` for LDUX/LDIX/LDGRAMS tuple bindings. Integer match retains fallback, signed/large constants and method IDs, and rejects joins, shadowing, effects and unsafe return contexts. Ternary selection keeps the surrounding result cast, removes operand casts to unknown (which would select IF/ELSE), and never makes a call or global read conditional. The compiler removes its zero-test before CONDSEL.

Cursor loads retain separate slice snapshots and mutable results. `loadUintExact`/`loadIntExact` preserve dynamic-width instructions at constant widths; `loadCoinsExact` retains LDGRAMS without a pure annotation. Native pure loadCoins can be eliminated when both results are unused, losing an underflow exception. Exact mutating methods are added to main.tolk; stdlib.tolk is unchanged. Unsupported argument forms, custom helpers, comments and binding/method-name collisions retain their raw form. The detailed acceptance suite is `npm run tolk:recovery`.

| Observed form | Raw → normalized count | Contracts | Coverage / next checks |
|---|---:|---|---|
| Anonymous `fn_<method_id>` getters | 18 → 9 | All eight | Candidate naming implemented for nine complete getters. Remaining nine are in partial contracts. Preserve hash/signature/collision checks. |
| Adjacent returned address binding | 2 → 0 | Empty, Counter | Implemented: direct address return and candidate owner getter. |
| Primitive loads destructured into tuples | 113 → 69 | All except Empty | Implemented cursor loads replace 44 bindings in complete contracts. Remaining forms are optional-address loads and partial outputs. Exact LDUX/LDIX/LDGRAMS methods preserve opcode selection, snapshots, mutable values and discarded-result exceptions. |
| CONDSEL compatibility calls | 7 → 5 | JettonWallet, JettonMinter | Two calls become native ternary expressions. Five calls involving values from GETPRECOMPILEDGAS remain explicit until nullable/type propagation is proven. Ordinary integer dispatch is covered by compiler-derived fixtures; these eight templates use prefix dispatch. |
| `matchPrefix` dispatch | 41 → 30 | All eight | Lazy message dispatch implemented for five terminal chains (11 prefix calls). Remaining calls include guarded shapes and partial contracts. Preserve empty/truncated messages, refs, unmatched tails and throw codes. WalletV5 also uses one-byte prefixes. |
| `.loadAddress() as slice` | 43 → 41 | All eight | Direct getter returns implemented; broader address propagation needs checks across comparisons/stores/calls and nullable/joined values. |
| Bindings ending in `as int` | 69 → 52 | All eight | Boolean guards implemented. Integer/tuple casts and values used by bitwise logic remain; integer null-predicate contexts still need `as int`. |
| ISNULL compatibility predicate | 21 → 7 | NftItem, JettonWallet, JettonMinter, SimpleExtension, WalletV5 | Native comparisons implemented. All seven remaining calls are in partial WalletV5. Retain unknown escapes and -1/0 integer semantics. |
| Optional-address compatibility loads | 21 → 21 | NftItem, JettonWallet, JettonMinter | Infer `address?` only with proven null semantics and matching TVM encodings. |
| `tvmNull() as slice/cell/int` | 9 → 9 | NftItem, JettonMinter, SimpleExtension | Recover nullable values across all branches and tuple return slots; test uninitialized NFT state. |
| Raw message sends | 15 → 15 | NftCollection, NftItem, JettonWallet, JettonMinter, SimpleExtension | Recognize builder/message layouts before using native message structures. Preserve refs, flags, modes, c5 actions and gas-sensitive values. |

The counts search emitted code before and after normalization; families overlap. Added integer casts for native null predicates are included in the normalized `as int` count. Entries from partial NftCollection/WalletV5 outputs are discovery evidence only; they are not successful compilation/equivalence tests. WHILE stack recovery and AGAINEND support need parser work before normalizing those full contracts.

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

The Acton command exits 1 for the previously recorded original/recompiled behavioral differences and partial contracts. Its raw/normalized identity checks are independent of that status. The standalone normalization check exercises unknown IDs, a matching owner ID with the wrong signature, nullable returns, successful/failing boolean assertions, integer null flags/branches and the currentCounter candidate: 26 getter probes with valid/truncated storage. An additional internal-owner-call fixture produces the parser's known dynamic EXECUTE diagnostic (FunC lowers the large method-ID call through c3); it verifies unchanged partial files/diagnostics and skipped normalization. Unit tests check internal references, collisions, casts/comments, multi-use values, fixed loop bindings, inversion and nested predicates directly against emitted Tolk.
