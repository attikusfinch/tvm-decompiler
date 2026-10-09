# Mainnet interaction evidence

Observed on 2026-10-09: 311 transactions from 21 representative addresses; 181 peers inspected. 85 peer accounts matched the recovered code families.

43 distinct message examples are backed by 37 saved transaction BOCs. The discovery is bounded; it is not a list of every deployed account.

## Grouping

- Classic Factory, Blank, vaults, pools, deposits, LP wallets and operators form one message system.
- CPMM pools exchange liquidity/claim messages with deposits and positions and pay affiliate accounts.
- Uranus Factory deploys meme masters, whose wallets connect to the CPMM pools. V2/V3 migrations are also exercised locally.
- X1000 remains separate. No direct X1000 → recovered-family edge was found in this sample; its Uranus wallet dependency is an emulator integration fixture.

## Evidence strength

Each saved transaction cell hashes to the API transaction ID. Account code BOCs identify a family directly or through a library-reference hash. Account snapshots identify code at observation time; they do not prove the code present at every earlier transaction. A message StateInit additionally establishes which code was carried by that deployment. Consensus proofs were not fetched.

Blank addresses can already run installed pools. Deposits may have been deleted. A `deployed as` value below is deliberately separate from the current family.

Run `npm run chain:check` to decode and verify all stored examples offline. Raw API URLs and retrieval times are in [interactions.json](interactions.json). `npm run chain:refresh` refreshes the bounded sample; it does not broadcast transactions.

## Message examples

| From | To | Opcode | Deployed as | Transaction BOC |
| --- | --- | --- | --- | --- |
| [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | `0x7bdd97de` | — | [a9ee81b21efe](transactions/a9ee81b21efeb41615bb82ff953eefb5047158116834026304d5f3594df48630.boc) |
| [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | `0xad4eb6f5` | — | [a9ee81b21efe](transactions/a9ee81b21efeb41615bb82ff953eefb5047158116834026304d5f3594df48630.boc) |
| [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | `0xad4eb6f5` | — | [a9ee81b21efe](transactions/a9ee81b21efeb41615bb82ff953eefb5047158116834026304d5f3594df48630.boc) |
| [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | `0x178d4519` | ClassicLpWallet | [6f918df947b2](transactions/6f918df947b2c8fa53e8d6262985643f3fab5cdf7b596c04af1427a3c6b3b09a.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | `0x9b3aa3fa` | ClassicBlank | [44eff5681d3e](transactions/44eff5681d3e0ff16356af12d51689be4761b03cea2d756ee657f4c911507b88.boc) |
| [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | [ClassicFactory](../classic-dex/contracts/factory/main.fc) | `empty` | — | [44eff5681d3e](transactions/44eff5681d3e0ff16356af12d51689be4761b03cea2d756ee657f4c911507b88.boc) |
| [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | `0x61ee542d` | — | [7207a3307431](transactions/7207a3307431d25bbc96a0d10b8f3ab5422e2ae7f3918f7675f032d9141b5ea2.boc) |
| [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | `0x61ee542d` | — | [a3cef2cbf71a](transactions/a3cef2cbf71a95d28a34b5ae94127cafda8f8fb57fd5a24c79b37c3ab6fb316c.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicLiquidityDeposit](../classic-dex/contracts/liquidity-deposit/main.fc) | `0x54240fe5` | — | [8865e2c7c58c](transactions/8865e2c7c58cf38eab1c528c35d9d31902bbe1c4241d3d6787f152bbb5e856a6.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicLiquidityDeposit](../classic-dex/contracts/liquidity-deposit/main.fc) | `0x9b3aa3fa` | ClassicBlank | [f71b29c47dc4](transactions/f71b29c47dc4346e827fc71eae2e9a170ee6d8c6ded9f71976e7f6eb7e6344ed.boc) |
| [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | `0x178d4519` | ClassicLpWallet | [4fbfacca4e07](transactions/4fbfacca4e073a137f99fb49bdba0cb3fe82004adf8217ea4b21024b568207dd.boc) |
| [ClassicOperator](../classic-dex/contracts/operator/main.fc) | [ClassicPoolInstalledV9](../classic-dex/contracts/pool-v9/main.fc) | `0x7ed7f6ce` | — | [cdfc7329f0d9](transactions/cdfc7329f0d97fb56780fb41b3ca0ca757f98428a209116457cb4a1d4d4f1139.boc) |
| [ClassicOperator](../classic-dex/contracts/operator/main.fc) | [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | `0x7ed7f6ce` | — | [5a6398196f7e](transactions/5a6398196f7ee428fde8ab58aac695fdc074358d02fa37bb568b25358a9912fe.boc) |
| [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | `0xad4eb6f5` | — | [ade5cd3e3fbd](transactions/ade5cd3e3fbdd501ce1a199ea04537e023c1163ac5492fd884cfe4d1096f004c.boc) |
| [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | `0x61ee542d` | — | [e741ac22664c](transactions/e741ac22664c8bdabac6ff912de85127f0fb50c861185644dbd6377f718ab597.boc) |
| [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | `0xad4eb6f5` | — | [1f274c765815](transactions/1f274c7658150acdbc1472d25d11acda1538f2972676dd6ef8c9fe7abc80af1d.boc) |
| [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | [ClassicFactory](../classic-dex/contracts/factory/main.fc) | `0xf04ec526` | — | [9b7de9c968dc](transactions/9b7de9c968dc147eb13f8d98fbf89f60992c92d872005eb8e7943d8589ba4fdc.boc) |
| [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | `0xad4eb6f5` | — | [353f1601d4d0](transactions/353f1601d4d0790e5232415dcd14d7a262d872de0a8f9087adf77aa9073267cc.boc) |
| [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | `0x61ee542d` | — | [1fe3d9d78450](transactions/1fe3d9d78450ff010d4381e308228f18b6622bf14c1e20762161a5896f49951b.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicBlank](../classic-dex/contracts/blank/main.fc) | `0x9b3aa3fa` | ClassicBlank | [a649a47482f2](transactions/a649a47482f2c4aa2336cb51a3d4693364eef3ed2080f328d41114233395083a.boc) |
| [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | [ClassicFactory](../classic-dex/contracts/factory/main.fc) | `0xf04ec526` | — | [c1b95fc83e07](transactions/c1b95fc83e0742f2677124b38800e821a0fd2ca1de74895b3913472348e60c16.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | `0x9b3aa3fa` | ClassicBlank | [329284b796aa](transactions/329284b796aaf7830c513ad5556fb19b58e5f55f33761ca1fd11775b7cce8b89.boc) |
| [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | [ClassicVolatilePool](../classic-dex/contracts/pool-v7/main.fc) | `0x72aca8aa` | — | [df872b5716bc](transactions/df872b5716bcae6d33a54c8eff5b45d25bad0a3318fe6b0643aeb9372a5d3000.boc) |
| [UranusMemeWalletV3](../uranus/contracts/meme-wallet-v3/main.tolk) | [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | `0x7362d09c` | — | [f8e9e00e3e91](transactions/f8e9e00e3e91f7696559b5c68472757724aa686f78dee55cce7cbf14412ebada.boc) |
| [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | [UranusMemeWalletV3](../uranus/contracts/meme-wallet-v3/main.tolk) | `0x0f8a7ea5` | — | [b49a6d80724d](transactions/b49a6d80724d3edeb71eac3ff48e07414e2dd9a7e7bf74cf12fa6da4e2e9639e.boc) |
| [UranusFactoryV3](../uranus/contracts/factory-v3/main.tolk) | [UranusMemeV3](../uranus/contracts/meme-v3/main.tolk) | `0x796f5a0c` | UranusMemeV3 | [50615fc88781](transactions/50615fc88781c08b02e92ac1d34fe644d12fed9cd9b85517b3ccb8546335fcb3.boc) |
| [UranusMemeWalletV2](../uranus/contracts/meme-wallet-v2/main.tolk) | [UranusMemeV2](../uranus/contracts/meme-v2/main.tolk) | `0x646ad424` | — | [c7442658bbfb](transactions/c7442658bbfb9f96c707731e6329bdb42269dc47d8adc7cf379f6165352a66b7.boc) |
| [UranusMemeV2](../uranus/contracts/meme-v2/main.tolk) | [CpmmAffiliateAccount](../cpmm/contracts/affiliate-account/main.tolk) | `0x773faf30` | — | [c7442658bbfb](transactions/c7442658bbfb9f96c707731e6329bdb42269dc47d8adc7cf379f6165352a66b7.boc) |
| [UranusMemeV2](../uranus/contracts/meme-v2/main.tolk) | [UranusMemeWalletV2](../uranus/contracts/meme-wallet-v2/main.tolk) | `0x178d4519` | UranusMemeWalletV2 | [35e8209b9dea](transactions/35e8209b9deabba51bca547abc73941e8f90369d7f26ca0db492317e5b942010.boc) |
| [UranusMemeWalletV3](../uranus/contracts/meme-wallet-v3/main.tolk) | [UranusMemeV3](../uranus/contracts/meme-v3/main.tolk) | `0x646ad424` | — | [8bea2414882b](transactions/8bea2414882bba0874794cd60ef71b67faded67aabd75d3a16e3f14c4fd5e0bc.boc) |
| [UranusMemeV3](../uranus/contracts/meme-v3/main.tolk) | [CpmmAffiliateAccount](../cpmm/contracts/affiliate-account/main.tolk) | `0x773faf30` | — | [78096f5097de](transactions/78096f5097de15363578c2b8c89270ea48c6c70081bbca60e86b4345129b625d.boc) |
| [UranusMemeV3](../uranus/contracts/meme-v3/main.tolk) | [UranusMemeWalletV3](../uranus/contracts/meme-wallet-v3/main.tolk) | `0x178d4519` | UranusMemeWalletV3 | [b9cb22cdd322](transactions/b9cb22cdd322b06589cc38a98ef3b12e9ae4c7bd380fe20b2fbe973d6650ba06.boc) |
| [ClassicNativeVault](../classic-dex/contracts/native-vault/main.fc) | [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | `0x61ee542d` | — | [4c6e66943659](transactions/4c6e669436596ddcc55b93e6e508f7f0a3bb5438599ed9468c985c70aebfbc58.boc) |
| [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | [ClassicJettonVault](../classic-dex/contracts/jetton-vault/main.fc) | `0xad4eb6f5` | — | [4c6e66943659](transactions/4c6e669436596ddcc55b93e6e508f7f0a3bb5438599ed9468c985c70aebfbc58.boc) |
| [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | `0x7bdd97de` | — | [990f6ad01009](transactions/990f6ad0100926e9d3cc2e15b17f0bf2e405f80ca434955f420b8c175df31931.boc) |
| [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | [ClassicLpWallet](../classic-dex/contracts/lp-wallet/main.fc) | `0x178d4519` | ClassicLpWallet | [7fb959f8644e](transactions/7fb959f8644ea039fc6659849f7666dab903da3577902edbe41d3735ec3dca99.boc) |
| [ClassicFactory](../classic-dex/contracts/factory/main.fc) | [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | `0x9b3aa3fa` | ClassicBlank | [a7ae5d58c891](transactions/a7ae5d58c891ba09e218bd2df8f785bac67239b96a5b481c3e1aa07a2eb772fd.boc) |
| [ClassicPoolInstalledV8](../classic-dex/contracts/pool-v8/main.fc) | [ClassicFactory](../classic-dex/contracts/factory/main.fc) | `empty` | — | [a7ae5d58c891](transactions/a7ae5d58c891ba09e218bd2df8f785bac67239b96a5b481c3e1aa07a2eb772fd.boc) |
| [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | [CpmmPosition](../cpmm/contracts/position/main.tolk) | `0x25f19752` | — | [e9fe8d21f98b](transactions/e9fe8d21f98b6aff58818cda1af5b6635914522cc237899df0ae65d3eab85dbc.boc) |
| [CpmmPosition](../cpmm/contracts/position/main.tolk) | [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | `0x29ff1bcf` | — | [e9fe8d21f98b](transactions/e9fe8d21f98b6aff58818cda1af5b6635914522cc237899df0ae65d3eab85dbc.boc) |
| [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | [CpmmPosition](../cpmm/contracts/position/main.tolk) | `0x855afcbd` | CpmmPosition | [0c38d0da870b](transactions/0c38d0da870ba7ebade25a3a67a8a0cc5d9b507a331c4a5b83fcd81917cbdb37.boc) |
| [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | [CpmmDeposit](../cpmm/contracts/deposit/main.tolk) | `0xdc5ddba1` | CpmmDeposit | [f0570c50ef5b](transactions/f0570c50ef5b57b2a5b8cae36de4f3fb41a178744cfb1a025427b77c93cfec99.boc) |
| [CpmmPoolV2](../cpmm/contracts/pool-v2/main.tolk) | [CpmmAffiliateAccount](../cpmm/contracts/affiliate-account/main.tolk) | `0x773faf30` | — | [75cfdbe2337b](transactions/75cfdbe2337b5afeae85b8466b118f8f137c0b3bb8150e2188a1282ad27fced5.boc) |

## Local replay fixtures

- Classic: the original install message executes Blank and installs the source-built V9 Pool.
- CPMM: original X/Y credit messages recreate the deposit lifecycle and byte-identical outgoing join body; forged settlement is refused.
- Uranus: the original Factory deployment activates the source-built Meme V3 library and repeat initialization is refused.

The emulator uses its local configuration. Replay assertions cover message bodies, state and authorization, not historical transaction hashes, consensus or identical network fees.
