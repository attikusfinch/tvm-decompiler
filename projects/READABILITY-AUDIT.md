# Аудит читаемости

Сравнение с коммитом `da0347b`. Только прикладные исходники
в `*/contracts/`; stdlib, тесты и опубликованный архив не входят в счётчик.

Число ASM — количество объявлений с `asm` в исходниках, **не** число TVM-инструкций.
Изменение читаемости исходника не меняет BOC: это проверяется отдельно.

| Проект | ASM до | ASM после | Убрано | Вхождения технических временных имён до / после |
| --- | ---: | ---: | ---: | ---: |
| classic-dex | 336 | 315 | 21 | 15 / 15 |
| cpmm | 65 | 65 | 0 | 19 / 19 |
| uranus | 56 | 46 | 10 | 31 / 31 |
| x1000 | 131 | 37 | 94 | 2193 / 521 |
| **Всего** | **588** | **463** | **125** | **2258 / 586** |

Технические имена — вхождения `result`, `resultN`, `selectedValueN`, `constValueN`,
`D`, `DN`; счётчик показывает масштаб уборки, а не доказывает семантику новых имён.

## Где остаются совместимые ASM

| Исходник | Объявления | Причина / роль |
| --- | ---: | --- |
| [classic-dex/contracts/blank/main.fc](classic-dex/contracts/blank/main.fc) | 3 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/factory/main.fc](classic-dex/contracts/factory/main.fc) | 39 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/jetton-vault/main.fc](classic-dex/contracts/jetton-vault/main.fc) | 32 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/liquidity-deposit/main.fc](classic-dex/contracts/liquidity-deposit/main.fc) | 16 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/lp-wallet/main.fc](classic-dex/contracts/lp-wallet/main.fc) | 5 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/native-vault/main.fc](classic-dex/contracts/native-vault/main.fc) | 24 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/operator/main.fc](classic-dex/contracts/operator/main.fc) | 9 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/pool-v7/main.fc](classic-dex/contracts/pool-v7/main.fc) | 61 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/pool-v8/main.fc](classic-dex/contracts/pool-v8/main.fc) | 63 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [classic-dex/contracts/pool-v9/main.fc](classic-dex/contracts/pool-v9/main.fc) | 63 | FunC 0.4.4: legacy codec, стек/порядок вычисления и операции вне закреплённой stdlib |
| [cpmm/contracts/deposit/main.tolk](cpmm/contracts/deposit/main.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v1/handlers.tolk](cpmm/contracts/pool-v1/handlers.tolk) | 2 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v1/processing.tolk](cpmm/contracts/pool-v1/processing.tolk) | 10 | Диспетчеризация префиксов, nullable/union layout, закреплённые method ID |
| [cpmm/contracts/pool-v2/addresses.tolk](cpmm/contracts/pool-v2/addresses.tolk) | 3 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/affiliate-deployment.tolk](cpmm/contracts/pool-v2/affiliate-deployment.tolk) | 3 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/claim-handlers.tolk](cpmm/contracts/pool-v2/claim-handlers.tolk) | 2 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/compat-address.tolk](cpmm/contracts/pool-v2/compat-address.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/events.tolk](cpmm/contracts/pool-v2/events.tolk) | 4 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/handlers.tolk](cpmm/contracts/pool-v2/handlers.tolk) | 2 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/liquidity-handlers.tolk](cpmm/contracts/pool-v2/liquidity-handlers.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/math.tolk](cpmm/contracts/pool-v2/math.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/payment.tolk](cpmm/contracts/pool-v2/payment.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/processing.tolk](cpmm/contracts/pool-v2/processing.tolk) | 10 | Диспетчеризация префиксов, nullable/union layout, закреплённые method ID |
| [cpmm/contracts/pool-v2/reward-config.tolk](cpmm/contracts/pool-v2/reward-config.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/rewards.tolk](cpmm/contracts/pool-v2/rewards.tolk) | 2 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/routing.tolk](cpmm/contracts/pool-v2/routing.tolk) | 3 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/settlement.tolk](cpmm/contracts/pool-v2/settlement.tolk) | 4 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/stdlib-legacy-stateinit.tolk](cpmm/contracts/pool-v2/stdlib-legacy-stateinit.tolk) | 2 | Исторический алгоритм StateInit; обновлённая stdlib меняет адреса/код |
| [cpmm/contracts/pool-v2/transaction-context.tolk](cpmm/contracts/pool-v2/transaction-context.tolk) | 3 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/transfers.tolk](cpmm/contracts/pool-v2/transfers.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/pool-v2/wallets.tolk](cpmm/contracts/pool-v2/wallets.tolk) | 4 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [cpmm/contracts/position/main.tolk](cpmm/contracts/position/main.tolk) | 4 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/common/state-init-v2.tolk](uranus/contracts/common/state-init-v2.tolk) | 2 | Исторический алгоритм StateInit; обновлённая stdlib меняет адреса/код |
| [uranus/contracts/common/state-init-v3.tolk](uranus/contracts/common/state-init-v3.tolk) | 2 | Исторический алгоритм StateInit; обновлённая stdlib меняет адреса/код |
| [uranus/contracts/factory-v3/main.tolk](uranus/contracts/factory-v3/main.tolk) | 5 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-v2/compat-address.tolk](uranus/contracts/meme-v2/compat-address.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-v2/incoming-codec.tolk](uranus/contracts/meme-v2/incoming-codec.tolk) | 10 | Диспетчеризация префиксов, nullable/union layout, закреплённые method ID |
| [uranus/contracts/meme-v2/main.tolk](uranus/contracts/meme-v2/main.tolk) | 10 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-v2/matches.tolk](uranus/contracts/meme-v2/matches.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-v3/main.tolk](uranus/contracts/meme-v3/main.tolk) | 12 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-wallet-v2/main.tolk](uranus/contracts/meme-wallet-v2/main.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-wallet-v2/matches.tolk](uranus/contracts/meme-wallet-v2/matches.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [uranus/contracts/meme-wallet-v3/types.tolk](uranus/contracts/meme-wallet-v3/types.tolk) | 1 | Сохранённый физический ABI, checked stack layout и границы вычисления |
| [x1000/contracts/wallet-v2/compat.tolk](x1000/contracts/wallet-v2/compat.tolk) | 37 | Стековые снимки и перестановки, continuation/hook ABI, остаточные кодеки |

См. [правила, источники имён и журнал отклонённых замен](READABILITY.md).
Для всех 21 семейств критерий приёмки — одинаковые hash **и байты BOC**,
а затем полный прогон Acton и проверка сохранённых on-chain доказательств.
Итог прогона сохраняется в [verification.json](verification.json).
