# Publish recovered source bundles to TON Verifier

The live verifier uses the ticket API. Its website displays published sources;
wallet approval and multipart upload happen through this local publication queue.
The queue supports our ten FunC and eleven Tolk families, without deployment.

Run from `regression`:

```sh
npm ci
node scripts/verifier-publication.mjs
node scripts/check-verifier-publication.mjs
node scripts/check-verifier-upload.mjs
node scripts/serve-verifier-publication.mjs
```

Open `http://127.0.0.1:8099`. Connect a **mainnet** wallet and click the next
publication button when a mainnet ticket is available. Each payment requires the wallet owner's confirmation.
After finalization, the queue uploads the frozen, checksum-checked source files.
It reads back the public source bundle and checks every source checksum before
marking a contract published. The admission check sends the source files without
a payment transaction: new bundles must return HTTP 402 after request validation.

The compiler preflight uses the server's JS compiler versions:
`@ton-community/func-js@0.9.1` with `func-js-bin@0.4.4-newops.1`, and
`@ton/tolk-js@1.4.0`. All 21 code hashes matched in the initial preflight.
The observed tickets asked for 5 testnet TON per new hash. ClassicLpWallet was
already verified; the remaining 20 tickets totaled 100 testnet TON plus gas.
Fresh tickets are requested immediately before wallet approval.

The recovered contracts and the requested payment network are **mainnet**.
The queue enforces `-239` at wallet connection, payment preparation and the
transaction request, and tracks finalized transactions through mainnet TON Center.
A testnet ticket cannot authorize a mainnet payment. The page shows mismatched
tickets separately and does not quote their testnet amounts as a mainnet cost.
The refresh button requests fresh tickets without initiating any payment.

As checked on 2026-10-09, `/api/v1/take_ticket` still returned **testnet** tickets.
Its request schema has no network selector: the payment network is configured
by the verifier operator. The old mainnet backend listed in the official web UI,
`https://verifier-mainnet.tonstudio.io/source`, rejected our FunC
`0.4.4-newops.1` and Tolk `1.4.0` sources as unsupported. The central verifier
configuration now directs both networks to `https://verifier.ton.org` and
lists no legacy compiler versions. Mainnet publication remains blocked until
the official service issues mainnet tickets or offers a working mainnet backend.
The checked responses and queue counts are summarized in `mainnet-availability.json`.

Prepared files, payment progress and server logs live in the Git-ignored
`regression/artifacts/verifier-publication/`. TON Connect session material stays
in browser local storage. The backend never receives a seed phrase or private key.
It does not rebroadcast the signed external message returned by the wallet.

The payment tracker follows TEP-467 and waits for the complete finalized trace,
then checks the recipient, payer, amount, comment, bounce and abort flags.
An interrupted upload is reconciled against the registry; an unknown wallet
result blocks another charge until it has been investigated. Explicitly rejected
wallet requests may be retried. Server rejections do not automatically charge again.

Public TON Connect metadata is hosted in this repository as
`regression/verifier/tonconnect-manifest.json`. The wallet displays
**Fiscaldev Contract Recovery**. It is our local uploader, which sends the reviewed
bundles to the official API at `https://verifier.ton.org`.

For a public HTTPS tunnel, run `ngrok http http://127.0.0.1:8099 --inspect=false`,
set `VERIFIER_PUBLIC_ORIGIN` to its assigned HTTPS origin and restart the local
server. Update the public TON Connect manifest's `url` to the same origin. Open
the operator URL from the Git-ignored `artifacts/verifier-publication/access.json`.
The fragment credential stays in the browser session and is omitted from the
public HTML; source publication and payment progress require this credential.
Restarting on the same local and public origins preserves the operator link.
The manifest and PNG icon remain publicly readable for wallets. A new manifest
revision changes its URL query to avoid stale wallet metadata.

Protocol references:

- [Acton verifier command](https://ton-blockchain.github.io/acton/docs/commands/verify)
- [Verifier API implementation](https://github.com/ton-blockchain/acton/tree/1fbf951ff3bfe7460c88ee20ee4dd31c1ea7feac/apps/verifier)
- [Official legacy mainnet backend mapping](https://github.com/ton-blockchain/verifier/blob/master/src/lib/useSubmitSources.ts)
- [Current central backend configuration](https://github.com/ton-community/contract-verifier-config/blob/main/config.json)
- [TEP-467](https://github.com/ton-blockchain/TEPs/blob/master/text/0467-normalized-message-hash.md)
- [TON Connect integration](https://docs.ton.org/applications/ton-connect/get-started)
