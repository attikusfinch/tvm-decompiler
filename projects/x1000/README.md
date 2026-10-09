# X1000 execution wallet V2

This is its own project: its signed requests, query bookkeeping and protocol dispatcher
are independent of DeDust ownership. The bounded mainnet sample did **not** establish
a direct link to the selected DeDust/Uranus code families. The Uranus wallet dependency
below is a local integration fixture, not a claimed mainnet ownership relationship.

| Module | Responsibility |
| --- | --- |
| [main](contracts/wallet-v2/main.tolk) | Entry-point discovery order |
| [external](contracts/wallet-v2/external.tolk) | Signature, sequence, batch and retry-request processing |
| [internal](contracts/wallet-v2/internal.tolk) | Bounce recovery, receipts, flat protocol dispatch and persistent state |
| [protocols](contracts/wallet-v2/protocols.tolk) | Protocol-specific request stages |
| [queues](contracts/wallet-v2/queues.tolk) | Pending query/program/amount/retry/acknowledgement dictionaries |
| [messages](contracts/wallet-v2/messages.tolk) | Outgoing message serialization and receipts |
| [getters](contracts/wallet-v2/getters.tolk) | Public wallet/query state |
| [compat](contracts/wallet-v2/compat.tolk) | Typed physical ABI primitives required for identical TVM code |

Protocol kind numbers retain their observed meaning; an unproven DEX brand is not
invented for them. Twelve selector predicates and ten intermediate result triples
were simplified without changing any compiled byte.

Run `npm run build` / `npm test` here after installing the workspace dependencies.
The suite checks valid signatures, invalid signer (exit 555), invalid/repeated
sequence (exit 102), batch self-messages, destruction, all fourteen dispatch kinds,
bounce receipts and a real token transfer through source-built Uranus V3 wallets.
The signing key inside tests is a fixed **test fixture**, unrelated to a real wallet.

Exact compilation uses Tolk 1.4; Acton 1.2.1 handles local emulation and structured
external-message acceptance diagnostics. No network submission is performed.
