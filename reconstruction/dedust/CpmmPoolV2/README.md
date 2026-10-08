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
