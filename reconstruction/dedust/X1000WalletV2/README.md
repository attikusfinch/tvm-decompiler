# X1000 Wallet V2 source recovery

This related trading wallet is part of the frozen DeDust archive. Its Tolk source
compiles to all **10964 BOC bytes**, including the original cell boundaries and
all 34 method dictionary values. Descriptive names identify recovered roles;
the author's symbols and original compiler are unknown.

Code-cell hash: `4609b587ae70c1a4e65550377492cd8e13b4bcc8770d3e49b65aca90c26c56f2`.
BOC SHA-256: `cec5f1a4028f54ba74342f8daa27543aff39474e668f88bead3d73b36d33fc2d`.
Serialization: `idx=false, crc32=true`.

## Reading the source

| Module | Responsibility |
| --- | --- |
| `main.tolk` | Signature/replay checks, external batching, internal dispatch and state saves |
| `getters.tolk` | Eleven public getter IDs, including two pairs of semantic aliases |
| `messages.tolk` | Jetton transfer codec, protocol-specific trade payloads and dynamic amount hook |
| `protocols.tolk` | Fourteen separate callback handlers, recipe advancement and token amount accounting |
| `queues.tolk` | Query acknowledgement, bounded receipt queue, bounce decoding and retries |
| `compat.tolk` | Typed VM operations, wire codecs and bounded stack-lifetime/order primitives |

Protocol selectors and opcodes remain explicit where their publisher is unknown.
Branches deliberately retain the original evaluation order, eager field reads and
exception behavior. Replacing them with equivalent-looking expressions can change
gas, jump selection or cell layout.

## Storage and request format

The root stores version `uint8`, wallet ID `uint32`, sequence number `uint32`,
public key `uint256`, a reference to dictionary state and a reference to amount
hook code. Version 1 is required by the main handlers and validating getters;
the version getter only preloads the first byte. Root and dictionary tails are
checked strictly.

Dictionary state contains four `HashmapE 64` fields in this order:

| Dictionary | Value |
| --- | --- |
| Programs | Inline recipe bits/references, rather than a reference to each value |
| Amounts | `Coins` |
| Retries | Reference to a saved outgoing message; reservation starts as an empty entry |
| Acknowledgements | Original query ID `uint64` |

An external body begins with a 512-bit Ed25519 signature. The signed remainder
contains sequence `uint32`, ignored legacy `uint32`, batch count `uint32`, retry
flag, hook argument `uint16`, send mode `uint8`, ignored `uint32`, receipt tag
`uint32`, and a reference to the request. Its cell hash is checked with the stored
public key before `ACCEPT`; a valid request increments the sequence number.

The referenced request contains a destination address, requested TON `Coins`,
trade amount `Coins`, a body-by-reference flag (must equal 1), a body reference,
an optional `HashmapE 28` TON-override dictionary with `uint64` values, query
`uint64`, and an optional program reference. Legacy ignored fields and permissive
request suffixes are preserved rather than assigned invented meanings.

With chain context, the override key combines 24 bits of the next logical time
with the low four timestamp bits. The optional amount hook receives logical time,
timestamp, requested amount, destination, body, hook argument and method ID 83527
as seven stack slots. The saved c3 continuation is restored afterward. Without
chain context, the requested amount is used directly.

## Public getters

| Method ID | Source name | Result |
| ---: | --- | --- |
| 95507 | `storageVersion` | First storage byte |
| 97027 | `walletId` | Wallet ID |
| 85143 | `seqno` | Sequence number |
| 91459 | `sequenceNumberAlias` | Same sequence number |
| 83648 | `walletBalance` | TON balance |
| 89828 | `amountHookHash` | Stored hook code-cell hash |
| 85802 | `programsEmpty` | VM null flag for program dictionary |
| 118999 | `programsEmptyAlias` | Same program-empty flag |
| 98121 | `amountsEmpty` | VM null flag for amount dictionary |
| 94056 | `retriesEmpty` | VM null flag for retry dictionary |
| 97376 | `hasProgram` | 1/0 for a supplied uint64 query |

Explicit IDs retain the original ABI; names are not inferred from an arbitrary
hash match. In particular, getter 91459 reads the sequence field, not the public key.

## Internal dispatch and receipts

A recipe starts with a four-bit dispatch kind, two four-bit modes, a dictionary
field and two optional leg references. Each leg carries protocol/source-asset/
target-asset selectors and optional parameters. The recovered method mapping is:

| Kind | Method ID | Handler |
| ---: | ---: | --- |
| 0 | 12 | `processProtocol0` |
| 1 | 13 | `processProtocol1` |
| 2 | 21 | `processProtocol2` |
| 3 | 22 | `processProtocol3` |
| 4 | 20 | `processProtocol4` |
| 5 | 18 | `processProtocol5` |
| 6 | 14 | `processProtocol6` |
| 7 | 15 | `processProtocol7` |
| 8 | 16 | `processProtocol8` |
| 9 | 17 | `processProtocol9` |
| 10 | 19 | `processProtocol10` |
| 11 | 9 | `processProtocol11` |
| 12 | 10 | `processProtocol12` |
| 13 | 11 | `processProtocol13` |

The external-send receipt uses opcode `0x10937847`, query `uint64` and tag
`uint32`. Acknowledgements and valid bounced queries emit `0xbeaf9617` with the
original query ID. Retry trigger `0x01010201` goes to the literal helper address
in source; incoming `0x01010202` accepts only that sender and consumes a stored
message. Empty internal bodies return before storage validation.

For a prepared DeDust jetton-to-native leg, the parameter cell contains two
distinct coin fields: the handler's amount override and the trade payload's
minimum output. It produces jetton transfer `0x0f8a7ea5` with nested swap body
`0xe3a0d482`, preserving query increment, destination, TON budget, references and
swap-step field widths.

## Compiler compatibility and verification

Small typed codecs preserve stack order for loads, stores, dictionaries and VM
register operations. Bounded release helpers discard explicitly listed stale
fields at branch joins. The Fift `nop` staging primitive emits no TVM opcode;
it preserves the compiler's live-field order. None implements a trading branch
or embeds a whole original method. No original BOC is read by the source compiler
or substituted after compilation.

From `regression`, run `npm run dedust:x1000` for 93 getter/helper/hook and 105
message probes. The signed fixtures use a deterministic public test key and real
signature verification. Independently constructed expectations check data hashes,
receipts, retries, callbacks, outgoing wire formats and exact gas. A separately
compiled amount hook validates its argument context and returns amount plus 7.

`npm run dedust:recovery` additionally runs all source builds and native tests.
The nine X1000 Acton tests include actual message delivery through source-built
jetton wallets: a 77-token trade leaves source balance 923 and recipient balance
77. See `recovery-verification.json`, the shared `../verification.json`,
`../tests/x1000-wallet.test.tolk` and
`../../../regression/scripts/dedust-x1000-fixtures.mjs`.
