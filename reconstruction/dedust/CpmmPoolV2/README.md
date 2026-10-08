# CPMM Pool reconstruction in progress

The whole Pool is not yet recovered to readable byte-identical Tolk.
`reference.tasm` is its independent, exact instruction reference. Complete raw
Tolk output currently compiles and passes selected getter checks, but its code
hash differs from the oracle.

`rewards.tolk` recovers two shared referenced code cells that are identical in
both mainnet PoolV1 and PoolV2:

| Function | Exact code-cell hash |
| --- | --- |
| `accruePoolReward` | `91b8179608f2d2eae5e7bbd931e8c77438aa07a086bfa241c506ee036338fdc3` |
| `synchronizePoolRewards` | `ee562ba27741d0e1f9e29911c487988ef4b5fa89e0b2fd2bee8dd4b096a6fa15` |

The first function distributes the elapsed fraction of the remaining budget,
caps elapsed time at the remaining program duration, and adds the distribution
per unit of liquidity to a Q120 checkpoint. A zero-liquidity interval advances
only `lastUpdate`; it does not consume the budget or duration. Equal/future
timestamps leave the complete reward unchanged. Dictionary records are loaded
strictly and their updated fields are serialized with the original widths.

The module uses one typed `EQINT 0` helper; all arithmetic, iteration and
serialization are Tolk. Taking the key before decoding its value preserves the
original stack layout. No original code blob is used to build the candidate.

From `regression/`, run `npm run dedust:pool-rewards`. It checks each helper's
compiled cell hash against both frozen revisions and runs 64 differential probes
with independent arithmetic/storage expectations, including gas, rounding,
expired programs, empty dictionaries, malformed records and varuint overflow.
Five native Acton tests cover the recovered module. The proof is in
`rewards-verification.json`; it establishes these two modules only.

`addresses.tolk` recovers the shared Position and Deposit deployment functions;
their compiled cells equal hashes `07794cb753547d7a3087db90aa3f6eb53fca322e3571c7e84758f3d9d8130cf3`
and `40c8629de33bd9ed78e9fa2bead6489e46da9f45b4c10dd92353df7b16c0d613`.
`compat-address.tolk` expresses the old address calculation in Tolk and uses the
StateInit hash primitives from the official Tolk 1.1 standard library, preserved
in `stdlib-legacy-stateinit.tolk` with its source attribution and LGPL license.
The full `get_position_address` dictionary value now equals its original cell
`1c35563f6b5c01ca1df9f63c3d898c32347a5b1bbc2c2c0fdaaccc4713d256c4`.

Run `npm run dedust:pool-addresses` to reproduce 62 differential probes with gas
and independent storage/address expectations, plus complete serialized BOC equality
for isolated deployment/getter wrappers. Four native Acton tests verify these
modules. Tests include different workchains, none/external owners, maximum coin
amounts, shard-prefix preservation and rejected field-width overflows. The proof
is in `addresses-verification.json`. Matching old library primitives does not
prove which exact compiler version the original author used.

`wallets.tolk` recovers four shared wallet registry helpers: scheduling resolution,
registering both asset/wallet lookup directions, looking up an incoming wallet's
asset, and consuming a pending resolution before registration. Their hashes and
39 independent differential probes including gas are in `wallets-verification.json`.
The isolated four-method build matches the complete oracle BOC. Four native Acton
tests check success paths and errors 32 (workchain), 39 (duplicate), 40 (unknown
wallet) and 41 (unknown resolver request). Repeated scheduling keeps the original
overwrite behavior and returns whether a new request must be sent.

Four short typed primitives preserve the old workchain check and nullable query/
delete stack layouts. Routing, updates, duplicate rejection and strict record
decoding are Tolk; no executable code blob is included. Run
`npm run dedust:pool-wallets` to reproduce this module proof.

`storage.tolk` recovers the Pool root and its strict config/fees/extra references.
`getters.tolk` now compiles all three public getters to their exact dictionary
values in both revisions. An isolated build containing all three methods is
byte-identical to the independent oracle wrapper. The two additional hashes are
`0b3ae88f9bf57e2e591b9462064cd53d4c3a4db998bb8cef3147768af18599f8`
(`get_pool_data`) and
`3647ba7c349e6e81721b09bbc8eacefdbe56b735102c9173b4e5205e16e6777d`
(method 112421, descriptively named `estimateWithdrawal`; its original name is
unknown). The estimate returns floor-rounded reserve shares and zero when the
Pool has no liquidity. Signed getter arguments retain their original behavior.

Returning typed maps directly preserves the original wide-stack result layout;
converting them to low-level dictionaries changes compiler register lifetimes.
Lazy decoding in the estimate skips unused dictionaries/flags and intentionally
does not inspect config/fee/extra payloads. The data getter eagerly validates
those references and permits a root suffix, just like the archived code.

Run `npm run dedust:pool-getters`: 202 differential probes compare stack values,
exit codes and exact gas with independent expectations. They cover every lifecycle
and fee selector, populated maps, maximum coin fields, signed estimates, zero
liquidity, malformed tags and strict nested suffixes. Four Acton tests exercise
the readable getter/storage logic. The proof is `getters-verification.json`.
`messages.tolk` currently provides ABI layouts and compiler tag allocation;
complete message handlers and full Pool byte equality remain pending.

`math.tolk`, `payout-config.tolk` and `reward-config.tolk` recover three more
implementations shared by both revisions: initial-liquidity integer square root,
fallback substitution for payout addresses and allowed-reward lookup (method 21).
They match the original implementation cells, and their isolated complete BOC
matches as well. Method 21 is stored through a reference in the full original
dictionary; this isolated build inlines its same implementation. The final Pool
gate must still reproduce the complete dictionary placement.

The root calculation keeps six unrolled Newton steps and one typed `CONDSELCHK`
correction primitive. It returns inputs below two unchanged, including negatives,
and floor square roots for the tested nonnegative range. Payout normalization
recognizes `addr_std$10`; none, external and variable addresses use the supplied
fallback without changing gas, payloads or wrapper flags. Reward lookup scans
slots in ascending order, returns the first matching asset and rejects absent
or malformed entries with the original exits.

Run `npm run dedust:pool-calculations` for 229 differential probes with exact gas
and independent numeric/address/dictionary expectations, plus four native Acton
tests. `calculations-verification.json` contains the proof. Full swap, liquidity,
payout sends and message dispatch remain outstanding.

`events.tolk` recovers methods 22–24: swap, deposit and withdrawal external-out
events. Their implementation hashes match both revisions and the complete
isolated build is byte-identical. Event structures are serialized in Tolk; one
typed literal supplies the two-bit `addr_none` destination. Standard
`OutMessage.sendAndEstimateFee` preserves `SENDMSG` and its returned fee.

Run `npm run dedust:pool-events` for 56 probes comparing exact gas, complete raw
TVM action-list hashes, manually encoded public-ABI bodies and independently
calculated forwarding fees in basechain/masterchain contexts. Tests include
maximum `VarUInteger 16` amounts, nested/shared references and invalid coin
values. The fee formula follows the pinned official validator's
[`MsgPrices` implementation](https://github.com/ton-blockchain/ton/blob/4539cfabf2877e09d13032861f36c1490d13a941/crypto/block/transaction.cpp).
Three native Acton tests inspect the actual send actions. The proof is
`events-verification.json`; full Pool transaction paths remain pending.

`transfers.tolk` recovers excesses, payout-wallet selection and the V2 wallet
resolver request. `rewards.tolk` also recovers strict lookup with a zero default;
one typed four-slot zero constructor preserves the archived constant layout.
V1's request lives in `../CpmmPoolV1/transfers-v1.tolk`: it retains the same two
asymmetric forwarding-size estimates but has no 10,000,000 processing-fee floor.
The V2 helper adds that floor. Other recovered helper implementations are shared.

Run `npm run dedust:pool-transfers`. Its isolated BOC and five implementation
cells (three shared and two request revisions) match the original code. The 192
probes compare exact gas, raw send actions, independently calculated resolver
amounts, strict dictionary records and errors. A lowered local gas-price config
makes the request revisions observably different. Four native Acton tests bring
the full project to 48 tests. The proof is `transfers-verification.json`.

`payment.tolk` recovers the complete referenced TON/jetton payment function,
shared by both revisions. Its compiled cell equals
`6c6ac69613082d653edca6da9a4121af14c37c8855f38cac713059cfd1de6fe5`.
TON payments attach principal plus extra gas and an inline signed status/payload
notification. Jetton transfers attach 50,000,000 plus extra gas, preserve the
recipient and excesses address, and select an absent, raw-reference or wrapped
callback payload. The result contains native principal spent and `SENDMSG`'s
forwarding-fee estimate; both sends retain mode 17.

The readable source updates a union variable inside the payload branches. A
fresh expression changes compiler variable lifetimes and stack moves. One typed
two-slot empty-slice constructor preserves the original union representation;
all branching and message serialization remain Tolk.

Run `npm run dedust:pool-payment`: the isolated complete BOC is byte-identical,
and 160 probes check gas, action hashes, independently encoded messages and
fees, maximum coin/query values, signed status bounds and invalid assets. The
independent fee calculation includes `SENDMSG` moving an inline body to a new
cell after filling the source address and forwarding-fee header, following the
pinned official [`exec_send_message` implementation](https://github.com/ton-blockchain/ton/blob/4539cfabf2877e09d13032861f36c1490d13a941/crypto/vm/tonops.cpp).
Four native Acton tests bring the project to 52 passing tests. The proof is
`payment-verification.json`; complete Pool dispatch and swap/liquidity paths
remain pending.

`routing.tolk`, `payout-basic.tolk` and `affiliate-deployment.tolk` recover three
more shared referenced functions. Swap continuation preserves native/jetton ABI
fields, both optional fee recipients, their original null-first codecs, and send
mode 144. A jetton route deducts 50,000,000 from forward gas; a native route does
not inspect that field. Basic payout normalization substitutes nonstandard
destination/excesses addresses without changing the other options. Affiliate
deployment resolves the public library at runtime, initializes its fixed
authority, selects partner versus referrer and retains no sharding hint.

Run `npm run dedust:pool-routing`. All three implementation cells and the entire
isolated BOC match both revisions. The 193 probes independently check message
bodies and actions, strict integer bounds, exact gas, address fallbacks and the
seven-slot deployment result, including missing-library failure. The emulator
receives the AffiliateAccount library compiled from our already exact readable
source; it is not inserted into the Pool candidate's executable code. Five Acton
tests cover these modules. Global libraries are registered before starting the
separate test getter VM. The full project now passes 57 Acton tests; whole-Pool
dispatch, liquidity changes and initial swap processing remain pending.
`routing-verification.json` records the pinned hashes and full module proof.
The Pool's first `partnerConfig` is passed to affiliate deployment with tag 163,
which stores kind bit 1; the second `referrerConfig` uses tag 132 and bit 0. These
behavior-derived names correct the earlier tentative AffiliateAccount labels.
The readable AffiliateAccount still compiles to its identical complete BOC and
its getter continues to return the same numeric values.
