# DeDust DEX

The exchange project contains **15 byte-identical recovered contract families**.
The common build/test project is one directory above: [verification and commands](../README.md).

## Classic exchange — FunC

| Family | Source | Role |
| --- | --- | --- |
| ClassicFactory | [main.fc](classic/ClassicFactory/main.fc) | Versioned code registry, ownership and deployment |
| ClassicBlank | [main.fc](classic/ClassicBlank/main.fc) | Initial installation and constructor handoff |
| ClassicOperator | [main.fc](classic/ClassicOperator/main.fc) | Operator authority and delayed beneficiary changes |
| ClassicNativeVault | [main.fc](classic/ClassicNativeVault/main.fc) | TON funding, swap routing and payouts |
| ClassicJettonVault | [main.fc](classic/ClassicJettonVault/main.fc) | Jetton funding, swap routing and payouts |
| ClassicLiquidityDeposit | [main.fc](classic/ClassicLiquidityDeposit/main.fc) | Two-asset collection, refunds and liquidity requests |
| ClassicLpWallet | [main.fc](classic/ClassicLpWallet/main.fc) | LP transfers, credit, burn and bounce restoration |
| ClassicVolatilePool | [main.fc](classic/ClassicVolatilePool/main.fc) | Swap, stable/constant-product quotes, liquidity and fees |
| ClassicPoolInstalledV8 | [main.fc](classic/ClassicPoolInstalledV8/main.fc) | Installed pool revision with one-time swap start setting |
| ClassicPoolInstalledV9 | [main.fc](classic/ClassicPoolInstalledV9/main.fc) | Installed pool revision with repeatable swap start setting |

## CPMM exchange — Tolk

| Family | Source | Role |
| --- | --- | --- |
| CpmmPoolV1 | [main.tolk](cpmm/CpmmPoolV1/main.tolk) | Earlier pool revision and protocol fee rules |
| CpmmPoolV2 | [main.tolk](cpmm/CpmmPoolV2/main.tolk) | Pool swaps, liquidity, rewards, routing and settlement |
| CpmmPosition | [main.tolk](cpmm/CpmmPosition/main.tolk) | Position ownership, liquidity, fees and reward checkpoints |
| CpmmDeposit | [main.tolk](cpmm/CpmmDeposit/main.tolk) | Deposit lifecycle and callbacks |
| CpmmAffiliateAccount | [main.tolk](cpmm/CpmmAffiliateAccount/main.tolk) | Affiliate activation and fee withdrawal |

Pool V1 imports unchanged modules from the adjacent V2 family. Each family keeps
its own oracle comparison record and editable `reference.tasm`. The shared frozen
oracles remain in `../oracles`; legacy FunC builds use `../func-stdlib.fc` and the
pinned compiler. Run the full gate from `regression` with `npm run dedust:recovery`.
