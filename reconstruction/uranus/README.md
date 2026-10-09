# Uranus

The Uranus project contains **five byte-identical recovered Tolk contract families**.
The common build/test project is one directory above: [verification and commands](../README.md).

| Family | Source | Role |
| --- | --- | --- |
| UranusFactoryV3 | [main.tolk](UranusFactoryV3/main.tolk) | Token deployment, curve coefficients, fees and attribution |
| UranusMemeV3 | [main.tolk](UranusMemeV3/main.tolk) | V3 curve trading, mint/burn, claims and liquidity migration |
| UranusMemeV2 | [main.tolk](UranusMemeV2/main.tolk) | Earlier master with legacy fee and migration rules |
| UranusMemeWalletV3 | [main.tolk](UranusMemeWalletV3/main.tolk) | V3 wallet transfer, burn, sell and peer authentication |
| UranusMemeWalletV2 | [main.tolk](UranusMemeWalletV2/main.tolk) | Earlier wallet with legacy address/body policies |

V3 migration uses the DeDust CPMM V2 pool; V2 migration uses the CPMM V1 pool.
Affiliate contracts and these pools belong to [DeDust DEX](../dedust/README.md).
`../Acton.toml` records the cross-project build dependencies. Tests build all peer
code from its source and deliver actual messages across these project boundaries.

Dedicated checks from `regression`: `npm run dedust:uranus-factory`,
`npm run dedust:uranus-meme -- 3` (or `2`) and `npm run dedust:uranus-wallet`.
The `dedust:` command prefix is retained for compatibility with the archive tools.
