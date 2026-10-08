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
