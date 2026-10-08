# Спецификация восстановления конструкций FunC / Tolk

Статус: первый каталогизированный проход по всем 24 семействам; реализованные
формы и открытые границы перечислены в [полном каталоге](compiler-recovery-catalog.md).
Базовая версия компилятора для доказательств —
TON `tolk-1.4.0`, сборка Tolk через Acton 1.0.0 (3a4f0dc). FunC проверяется
отдельно. Это спецификация обратных преобразований, а не копирование C++
компилятора: одно и то же TVM-представление может соответствовать нескольким
исходным программам.

## 1. Результат и границы

Получать из TVM читаемый, компилируемый FunC / Tolk с нативными конструкциями языка.
Сначала декомпилировать в низкоуровневое представление, затем независимо
нормализовать результат. Исходники шаблонов и известные схемы контрактов
используются для проверки, но не передаются правилам восстановления.

«Перенести всё» означает каталогизировать все семейства понижения из указанной
версии компиляторов и дать каждому воспроизводимый пример, обратное правило
либо явную причину, почему обратное преобразование пока не доказано или
неоднозначно. Это не обещание восстановить авторские имена, комментарии,
исчезнувшие типы или код, удалённый оптимизатором.

## 2. Архитектура

```text
BOC → инструкции TVM → стековый IR → raw main.tolk + stdlib.tolk
                                      ↓ только complete=true
                       анализ фактов и отдельные правила
                                      ↓
                         normalized main.tolk + аудит
```

`--no-normalize` возвращает raw-файлы обоих языков. Независимые нормализаторы
не меняют TVM-парсер или поддерживающую библиотеку. FunC имеет свой
[каталог правил](func-normalization-patterns.md). Если для обратного правила нужно
сохранить потерянный факт об инструкции, исправляется raw-представление;
восстановление высокого уровня остаётся отдельным этапом.

Каждое правило: `pattern + preconditions → replacement`, отдельный ID в
`normalizations`, тест положительного случая и тесты отказа. Анализ работает
по токенам и границам блоков, а не заменяет текст внутри строк/комментариев.
Правила не угадывают типы по названиям переменных. Недоказанная предпосылка
означает сохранение raw-кода. Преобразование должно быть идемпотентным.

Факты, которые постепенно добавляются в анализ: тип и ширина значения на
стеке, определения/использования и область видимости, изменяемость,
чистота/эффекты, порядок вычислений, границы веток и циклов, соединения
веток, факты о сериализации. В первой реализации допускаются узкие правила
с локальным доказательством; они не выдаются за полный SSA/CFG-анализ.

## 3. Источники понижения

Все ссылки зафиксированы на `tolk-1.4.0`:

- [Выражения и управление потоком Tolk](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/pipe-ast-to-legacy.cpp):
  `process_ternary_operator`, `process_null_coalesce_operator`,
  `process_match_expression`, присваивания, вызовы и операторы,
  `process_if/while/do_while/repeat/try_catch/throw/return_statement`.
- [Сериализаторы Tolk](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/pack-unpack-serializers.cpp):
  `S_IntN`, `S_VariadicIntN`, `S_BitsN`, `S_Bool`, `S_Coins`,
  `S_RawTVMcell`, `S_RawTVMcellOrNull`, `S_String`,
  `S_AddressInt`, `S_AddressIntOrNull`, `S_AddressAny`,
  `S_RemainingBitsAndRefs`, `S_Builder`, `S_Slice`, `S_Null`, `S_Void`,
  `S_Maybe`, `S_Either`, `S_MultipleConstructors`, `S_Tensor`,
  `S_ShapedTuple`, `S_Array`, `S_CustomStruct`, `S_IntegerEnum`,
  `S_CustomReceiverForPackUnpack`, `auto_generate_opcodes_for_union`,
  `generate_pack/unpack/skip/lazy_match_for_type`.
- [Встроенные операции Tolk](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/builtins.cpp):
  арифметика/округления, сравнения, загрузки/сохранения, словари,
  стек/кортежи, системные регистры, сообщения, проверки и исключения.
- [Lazy-загрузка Tolk](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/tolk/lazy-helpers.cpp)
  и [stdlib](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/crypto/smartcont/tolk-stdlib/common.tolk).
- [Встроенные операции FunC](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/crypto/func/builtins.cpp)
  и [генерация TVM FunC](https://github.com/ton-blockchain/ton/blob/tolk-1.4.0/crypto/func/codegen.cpp):
  дополнительный источник тех же TVM-форм, включая IFJMP/IFNOTJMP,
  порядок аргументов asm и оптимизацию стека.

Обновление версии компилятора — отдельная задача: новые формы сначала
проходят существующие и новые round-trip-проверки. Сходство C++-кода само по
себе не доказывает эквивалентность.

## 4. Порядок переноса

Обозначения: **готово** — указанная ограниченная область уже проверена;
**частично** — есть реализованные случаи и перечисленные ограничения;
**очередь** — код восстановления не внедрён. Статус обновляется только после
проверок. Зависимость означает необходимый анализ, а не запрет на отдельные
локально доказанные случаи.

| Пункт | Семейство / целевая форма | Обязательные условия и отрицательные случаи | Зависимости | Статус |
|---|---|---|---|---|
| N01 | Инвентаризация и контракт правил | Источник понижения, raw-пример, предпосылки, отказ, независимые результаты raw/normalized/original | — | Готово: эта спецификация и существующий каталог |
| N02 | Числовой `match` | Один int-субъект, константные различающиеся значения, исходный порядок, тот же fallback; не объединять разные субъекты, эффектные сравнения или соединяющиеся ветки | N01 | Частично: integer-match, terminal top-level equality chains |
| N03 | Тернарные выражения / CONDSEL | Отличать ленивый IF от выбора уже вычисленных значений; не делать эффектные аргументы условными и не переводить IF в CONDSEL с иным газом | N01 | Частично: conditional-select, локальные значения/константы одинакового типа |
| N04 | Нативные cursor-load / preload | Знать позиции результата/остатка, ширину, знак и snapshot получателя; живые алиасы, underflow и порядок проверок сохраняются; LDUX и LDU не взаимозаменять без доказательства | N01 | Частично: cursor-load для LDUX, LDIX, LDGRAMS; exact mutating-методы |
| N05 | Builder/store-цепочки | Порядок битов и refs, исходные snapshots, лимиты 1023/4, переполнение; не переносить побочные эффекты внутрь цепочки | N04 | Готово для 13 store-helpers: функциональные exact-методы, snapshots и исключения |
| N06 | Простые bool-предикаты | TVM true=-1/false=0, значения в арифметике/битовых операциях остаются int; не переносить вычисление из binding в цикл | N01 | Готово: boolean-guard в ограниченной области |
| N07 | Null / nullable / `??` | Отличать физический null от статического non-nullable-типа; сохранить unknown escape, короткое замыкание, типы всех веток и ширину стека | N01, N03 | Частично: native-null-check и terminal null-coalesce; полное nullable propagation в очереди |
| N08 | Адреса / optional address | Различать addr_none, стандартный/переменный/anycast адрес, семантику LDSTDADDR и nullable-encoding; не угадывать address по одному имени | N04, N07 | Частично: standalone address/optional-address getters; все LDOPTSTDADDR tuple-loads; общая address propagation в очереди |
| N09 | Getter ABI и entrypoints | CRC16 + точная сигнатура + отсутствие коллизий и внутренних ссылок; имена явно помечены как предположенные | N01 | Частично: registry из 17 кандидатов, entrypoints; расширение по независимым ABI |
| N10 | Lazy prefix / union `match` | Quiet-проверки, точные битовые ширины, prefix-free-набор, тот же хвост/refs/fallback, безопасный контекст return | N01 | Частично: terminal top-level dispatch, 4..48 бит, nibble alignment |
| N11 | Расширение match: вложенность / joins / enums / type tests | Анализ CFG и доминирования, живые значения и phi, enum throw=5; не превращать неполный enum в исчерпывающий и не придумывать утраченный union type | N02, N07, N10, P01 | Частично: nested terminal if/else match; joins/loop/try/lambda сохраняются; enum validation проверена, member names доказанно стёрты |
| N12 | Фиксированные/переменные int и bits, bool, coins | Точная ширина/знак/rounding, диапазоны, zero-width, underflow, остаток; bool не путать с uint1 или произвольным int | N04 | Частично: raw/exact cursor/store формы проверены; bool/int1 и semantic aliases доказанно неоднозначны |
| N13 | Cell, string, slice, builder, RemainingBitsAndRefs | Ref против inline, признак presence, хвосты битов/refs, BOC/hash; не считать произвольный slice текстом | N04, N05, N07 | Частично: opaque tail и ref/inline raw формы проверены; cell/string дают одинаковый BOC |
| N14 | Maybe / Either / constructor unions | Различать битовый tag и runtime union tag; порядок полей, null representation, произвольные opcode-width и default throw | N07, N10, N12, N13 | Частично: scalar/tensor Maybe, Either и constructor union raw round trips; общая high-level union типизация не доказана |
| N15 | Struct/storage/message schemas, pack/unpack/skip | Восстанавливать только доказанный layout с нейтральными именами; c4 load/save, lazy-поля, пропуски/endParse и пользовательские сериализаторы нельзя объединять по сходству | N04, N05, N12..N14 | Частично: nested/eager/lazy/custom serializer проверены; nested/flat grouping доказанно стёрта; общий layout normalizer открыт |
| N16 | Tensor / shaped tuple / arrays | Различать многозначный стек и один TVM tuple; ширина, null-заполнение, индекс, мутация, лимиты и типы в joins | N07, P01 | Частично: tensor/tuple, snake array serialization и push/pop snapshots проверены; общий element type propagation открыт |
| N17 | Dict / map и итерация | Key width, signed/unsigned/slice key, value slice/ref, quiet-флаг, пустой/null словарь, порядок min/next/delete и ошибочные ключи | N04, N07, N16, P01 | Частично: 6 lookup+THROWIFNOT forms с fixed result; typed map set/get/iteration проверены; unguarded quiet width и value schema открыты |
| N18 | Нативные сообщения и send modes | Доказанный TL-B-layout, адреса/coins, inline/ref body/stateInit, c5 actions, bounce, flags и режим; проверять фактические исходящие значения | N05, N08, N12..N15 | Частично: native SENDRAWMSG и exact send-mode constants; createMessage/layout recovery требует отдельного доказательства |
| N19 | Арифметика / сравнения / casts | Div/mod floor/ceil/round, muldiv overflow, shifts, -1/0 и unsigned bounds; не менять округление или последовательность эффектов ради красоты | N01, N06 | Частично: terminal native arithmetic, exact rounding, discarded MIN/MAX/MINMAX/ABS checks; constants/repeated/nonterminal/effects сохраняются |
| N20 | Вызовы, методы, generics, lambda/inlining | Stack ABI, порядок вычисления и результирующие слоты; стёртые generics и авторские границы inline обычно не восстановимы однозначно | N16, P01, P04 | Частично: single-CALLDICT lambda continuation, NOP и fixed CALLXARGS; erased generic boundary доказана одинаковым BOC, captures открыты |
| P01 | CFG: stack joins, WHILE / UNTIL / REPEAT | Стек до/после каждой дуги, эффектные условия, сохранённые значения и exits; сначала исправить неполный raw IR | N01 | Частично: исправлен WHILE condition/pop/body и false edge; NftCollection complete на обоих языках; продолжение CFG анализа |
| P02 | AGAINEND и другие continuation-формы | Не терять хвост continuation или выход; явная диагностика до реализации | P01 | Частично: AGAIN/AGAINEND, loop-carried stack и RETALT; WalletV5 complete на обоих языках. AGAINBRK/AGAINENDBRK и динамические exits остаются открытыми |
| P03 | TRY / catch / THROWARG | Catch stack, exception value/code, c0/c1/c2, успешный и аварийный путь; нормализатор не маскирует unsupported parser | P01 | Частично: canonical FunC/Tolk register envelopes, captured stack до 255, nested joins/returns и THROWARG; arbitrary handlers/TRYARGS остаются с диагностикой |
| P04 | Динамические continuations / dispatch | CALLX/EXECUTE/JMPX, c3 и динамическая цель, stack ABI и return; без доказанной цели сохранять явный low-level вызов/диагностику | P01..P03 | Частично: fixed CALLXARGS p/r с opaque continuation и static JMPX; variable return width доказан неоднозначным, сохраняется диагностика |

N01–N04 — первый проход. Затем N05–N10 и анализ блокеров P01/P02,
после них сериализация, схемы и сложные CFG-правила. TRY и динамические вызовы
требуют работы декомпилятора до нормализации; это отдельные пункты P03/P04.
Уже реализованные пункты расширяются новыми безопасными формами, а не
помечаются полностью завершёнными по одному шаблону.

## 5. Первые обратные правила

### N02: числовой match

```tolk
// Raw: terminal comparisons of the same integer.
if (op == 1) { return first(); }
if (op == 2) { return second(); }
return fallback();

// Normalized: ordered arms and the original fallback.
match (op) {
    1 => { return first(); }
    2 => { return second(); }
    else => { return fallback(); }
}
```

Первая область: top-level terminal-цепочки как минимум из двух equality
проверок; int-параметр или локально доказанное int-значение. Константы
нормализуются для сравнения дубликатов (`1` и `0x1` — одно значение), но в
выводе сохраняется исходное написание. Fallback не удаляется. Ветки,
которые продолжают общий код, переопределяют subject до следующей проверки,
имеют вложенные early return либо опасный контекст перед return, пока
остаются явными. Порядок других операций не меняется. Nested else-if можно
подключить только с отдельными проверками результата компиляции.

### N03: выбор значения

Для CONDSEL восстанавливается `cond ? x : y` только если `cond`, `x`, `y`
уже вычислены и их использование не меняет порядок/количество вычислений.
Смена lazy IF на eager CONDSEL запрещена. Преобразование return-веток в
тернарное выражение проверяется отдельно: компилятор может выбрать другую
TVM-инструкцию даже при одинаковом обычном результате.

Реализованная форма: `tvmCondSelect(c, (a as unknown), (b as unknown))` →
`(c != 0 ? a : b)`. Аргументы веток — литералы или локальные ссылки с
доказанным одинаковым скалярным типом; вызовы/глобальные ссылки не переносятся
в ветки. В Tolk 1.4.0 zero-test перед CONDSEL удаляется компилятором. Если
сохранить casts `as unknown` внутри веток, компилятор вместо CONDSEL создаёт
IF/ELSE — такие casts при восстановлении снимаются, окружающий result cast
сохраняется. Неизвестные типы, несовместимые типы и shadowing означают отказ.
Физические значения в legacy int-слотах могут быть slice/null; правило
сохраняет CONDSEL и не добавляет runtime-проверку типа. Это проверяется
отдельной пробой с утраченными исходными типами.

### N04: cursor-load

```tolk
// Candidate, not an unconditional text rewrite.
var (rest, value) = tvmLoadUint(body, width);
// Possible native form, after checking output order and alias liveness.
var rest = body;
val value = rest.loadUint(width);
```

Константная ширина способна заменить `PUSHINT + LDUX` на `LDU`: если raw
использует LDUX, такое правило не проходит требование идентичности. Нужна
форма, сохраняющая исходную инструкцию, либо отказ. `body` не мутируется,
если жив исходный snapshot. Для discarded rest возможен preload лишь при
идентичном результате компиляции и исключениях.

Первый перенос использует `loadUintExact`, `loadIntExact`, `loadCoinsExact`
с точными asm-инструкциями в main.tolk. Методы не помечаются `@pure`:
нативный `loadCoins` удаляется оптимизатором при отброшенных результатах,
из-за чего исчезает исключение на коротком slice. Exact-метод сохраняет
операцию и газ, в том числе для `(_, _)`. Поддерживающая stdlib.tolk
остаётся неизменной. Rest получает отдельный snapshot, результат остаётся
`var`, если исходный tuple-binding был `var`. Коллизии, повторные binding,
захват receiver/width, комментарии и эффектные аргументы блокируют замену.

### N05: builder/store-цепочки

`builder-store-chain` переводит 13 compatibility-store вызовов в методы
builder, включая вложенные цепочки. Методы функциональные: `self` не
мутируется, результат — новый builder. Так исходный snapshot остаётся
доступен, если используется позднее. Receiver и аргументы вычисляются
ровно по одному разу, в прежнем порядке. Методы добавляются в main.tolk;
stdlib не изменяется. Коллизии, пользовательские helpers, комментарии и
неподходящая арность блокируют преобразование.

Используются exact asm для STGRAMS, STVARUINT16/32, STOPTREF/STDICT,
STSTDADDR/STOPTSTDADDR, STUX/STIX, STSLICER/STSLICE, STREF/STBR. Порядок
аргументов каждой инструкции сохранён. Нативный storeCoins не заменяет
STGRAMS: для нулевой константы компилятор может выбрать storeUint(0, 4) и
объединить его с соседними stores. Методы impure, поэтому даже отброшенный
результат сохраняет проверку границ и исключение. Сериализационные схемы
сообщений остаются отдельным пунктом N15/N18.

### N07/N08: nullable-значения и optional address

`null-coalesce` распознаёт соседние ISNULL-binding, snapshot `var phi = x`
и единственное присваивание простого fallback в null-ветке, за которыми
сразу следует `return phi`. Пустая ELSE допустима. Получается
`var phi = ((x as unknown) ?? fallback) as T`; локальные значения должны
иметь одинаковый известный scalar-тип. Escape через unknown обязателен:
legacy int/slice/cell может физически содержать null. Вызовы, эффекты,
комментарии, переопределённые helpers, shadowing, непустая ELSE и дальнейшее
использование результата блокируют замену. Последний случай доказан:
Tolk переносит общий SWAP внутрь ELSE, меняя код и газ. ISNULL+CONDSEL
также не заменяется на `??`: eager CONDSEL превращается в lazy IF.

`optional-address-cursor` учитывает обратный порядок tuple-результатов
LDOPTSTDADDR: `(address, rest)` вместо `(rest, value)`. Exact impure
mutating-метод возвращает `slice?`; legacy consumers получают значение
через `as unknown as slice`, сохраняя физический null и прежние типы всех
вызовов. Живые исходные slices и отброшенные результаты сохраняются.
Это локальная нормализация, не полное nullable propagation.

`optional-address-getter` сворачивает соседние load + return в
`return body.loadAddressOpt()` с результатом `address?`, если getter
внешний, остаток отброшен, body — доказанный локальный slice, отсутствуют
внутренние вызовы, ветки и комментарии. Имя остаётся anonymous при
неизвестном ABI ID. Ширина стека и opcode остаются теми же.

## 6. Приёмка каждого пункта

1. **Статический тест:** точное преобразование, аудит и идемпотентность;
   отрицательные примеры для каждой предпосылки, комментариев/строк,
   коллизий/областей видимости и неполных форм.
2. **Compiler round trip:** source → BOC → raw/normalized → recompilation.
   Правило видит только raw-код. Минимум два разных исходных написания
   по возможности дают общий распознаваемый случай.
3. **Обязательная идентичность raw/normalized:** TVM code-cell и
   serialized BOC. Без неё новое правило по умолчанию не включается.
   Original/raw-сравнение отдельно: старый дефект декомпиляции нельзя
   ошибочно представить как дефект или успех нормализатора.
4. **Эмулятор:** boundary/invalid inputs, exit codes, stack и gas;
   stateful-правила также c4, c5/actions и реальные outgoing values.
   MYCODE и адреса производных контрактов входят в идентичность кода.
5. **Шаблоны:** все восемь Acton-контрактов, оба языка; для partial
   сохраняются файлы/диагностики и отсутствие нормализации.
6. **Отчёт:** каталог применений и HTML с raw/normalized и скачиваемыми
   артефактами. Нулевая применимость нового правила на текущих восьми
   шаблонах допустима и явно записывается; synthetic-проба не считается
   покрытием настоящего шаблона.
7. **Форк:** пункт получает проверенный commit в пользовательском fork;
   обновляются статус и результаты, оставшиеся пункты сохраняются в очереди.

## 7. Журнал исполнения

| Дата | Пункт | Изменение / измеримый результат |
|---|---|---|
| 2026-10-08 | N01 | Зафиксированы источники, 24 семейства, порядок, зависимости и критерии приёмки. Существующие формы и ограничения описаны в [каталоге](tolk-normalization-patterns.md). |
| 2026-10-08 | N02 | integer-match: terminal top-level цепочки по int-параметру/локальному int. Сохраняются порядок, знаковые/большие значения и fallback. Joins, вложенные early returns, shadowing и эффектные проверки исключены. В восьми текущих шаблонах обычных числовых диспетчеров нет; проверены compiler-derived формы match и if. |
| 2026-10-08 | N03 | conditional-select: CONDSEL → нативный ternary для заранее вычисленных однородных значений. В шаблонах 7 → 5 вызовов helper; остальные пять требуют анализа nullable GETPRECOMPILEDGAS. Проверены также одинаковые операнды, неканонические truthy int и утраченные runtime-типы. |
| 2026-10-08 | N04 | cursor-load: LDUX/LDIX/LDGRAMS через exact mutating-методы с сохранением snapshots и исключений. В шаблонах 113 → 69 tuple-loads (44 преобразованы); оставшиеся — optional address и partial-контракты. |
| 2026-10-08 | N05 | builder-store-chain: 13 exact функциональных store-методов; 44 → 3 helper-вызова в шаблонах, оставшиеся три в partial. 17 compiler-derived сценариев / 202 пробы, raw/normalized code-cell + serialized BOC + gas совпадают. Проверены нулевые/отрицательные/предельные coins, dynamic int widths, nullable refs/addresses, snapshots, отброшенный результат, 1023 бит / 4 refs и порядок побочных эффектов. Original/normalized поведение совпадает; 8/17 original/raw code-cell идентичны, остальные расхождения raw фиксируются отдельно. |
| 2026-10-08 | N07/N08 | terminal null-coalesce, optional-address-getter и optional-address-cursor. 14 compiler-derived сценариев / 144 пробы с идентичными raw/normalized code-cell, serialized BOC и gas; original/normalized поведение совпадает, 13/14 original/raw code-cell идентичны. Проверены null в int/cell slots, эффектный fallback и eager CONDSEL без coalesce, addr_none/std/truncated/var, refs, snapshots, цепочки и оба отброшенных результата. В шаблонах 21 → 0 LDOPTSTDADDR helpers и 113 → 48 primitive tuple-loads; оставшиеся tuple-loads только в partial. ?? и optional getter применяются в synthetic-примерах, в текущих шаблонах их точной формы нет. |
| 2026-10-08 | P01 | WHILE сначала выполняет condition, снимает флаг, затем выполняет body; false edge возвращает condition stack без флага. Discovery и back edge учитывают обе фазы. Восстановлен NftCollection: компилируется на FunC/Tolk, 4/4 getter, 11/12 messages с values, 12/12 state/actions; royalty value отличается из-за газа. Дополнительно исправлены synthetic CALLREF method IDs и generic FunC tuple indexing, необходимые для его компиляции. Восемь compiler-derived loop-сценариев / 70 проб, raw/normalized BOC + gas идентичны, original behavior совпадает; 1/8 original/raw code-cell идентичен. |
| 2026-10-08 | P02 | AGAIN/AGAINEND сохраняют бесконечный back edge и явные RETALT, вложенные возвраты задают тип функции. Embedded control register печатается как c5, purity asm переносится в FunC, forward declarations inline_ref сохраняют impure. WalletV5 complete на обоих языках: 5/5 getters, 10/10 messages, 10/10 state/actions. Шесть compiler-derived сценариев / 36 проб, raw/normalized BOC + gas и original behavior совпадают, 5/6 original/raw code-cell идентичны. AGAINBRK/AGAINENDBRK и динамические exits остаются открытыми. |
| 2026-10-08 | P03 | Native try/catch из доказанных envelopes: FunC PUSHCTR/SETCONTCTR c1/c3/c4/c5/c7 и compact Tolk SETCONTCTRMANY 186. Catch stack содержит captured slots, exception value/code, без живого try stack. Сохранены lexical joins, nested rethrow, early returns и THROWARGANY divergence. Десять compiler-derived сценариев / 75 проб проверяют captured snapshots, cell/null exception values, c4/c5/c7 restoration; raw/normalized BOC + gas и original behavior совпадают, 1/10 original/raw code-cell идентичен. Noncanonical TRY не считается complete. |
| 2026-10-08 | P04 | Fixed CALLXARGS сохраняет encoded p/r, порядок входов/выходов и impure low-level вызов; Tolk использует unknown для opaque continuation, FunC — cont и однослотовый asm ABI. Static JMPX удаляет недостижимый хвост. Шесть сценариев / 132 пробы на обоих языках; original behavior и raw/normalized BOC + gas совпадают, 5/6 original/raw code-cell и gas идентичны. Три пары исходников с разными return signatures дают одинаковый BOC, но runtime callback возвращает 0/1/2 слота: EXECUTE, CALLXARGS_VAR и dynamic JMPX не имеют однозначно восстанавливаемой ширины. |
| 2026-10-08 | N18 | SENDRAWMSG → нативный sendRawMessage, constant flags 0/1/2/16/32/64/128 без изменения числа или валидности режима. Неизвестные/отрицательные/dynamic modes сохраняют выражение. 16 → 0 wrapper-вызовов в пяти шаблонах. 11 compiler-derived сценариев / 197 messages проверяют inline/ref body, StateInit, bounce, исчерпание баланса, invalid modes/cells, truncated body и c4 effects; raw/normalized BOC + gas + outgoing values совпадают, original state/actions — 197/197, full values — 166/197. Прежняя разница original/raw gas меняет carried values и не скрывается. |
| 2026-10-08 | N11–N16/N20 | Полная compiler matrix: 40 сценариев / 1593 пробы, включая обязательные успешные prefix/enum/nullable/array/variable-int пути. Nested terminal if/else match — отдельное правило; joins/loop/try/lambda/match-arm контексты исключены. 14/40 original/raw code-cell идентичны, поведение original/normalized совпадает на всех пробах. Raw lambda исправлен: single-CALLDICT continuation, NOP, fixed CALLXARGS; 14 проб также на FunC. |
| 2026-10-08 | N17 | Lookup+THROWIFNOT доказывает fixed surviving width для DICTGET/DICTIGET/DICTUGET и REF-вариантов. 13 сценариев / 351 пробы на обоих языках: короткий/длинный throw code, null/malformed/missing dict, sign/key/width boundaries, discarded result. Все original/raw и raw/normalized code-cell идентичны, gas и наблюдаемое поведение совпадают. Typed map set/get/iteration дополнительно проверены в compiler matrix. |
| 2026-10-08 | N19 | terminal-native-arithmetic: distinct proven local int operands, direct return либо binding + ordered return. 18 сценариев / 1400 проб, все original/raw и raw/normalized code-cell идентичны, gas и поведение совпадают. Discarded MIN/MAX/MINMAX/ABS checks сохраняются в IR и FunC stdlib; null/NaN/cell/overflow проверены также на FunC. Constants/repeated/nonterminal/effectful forms не переписываются. |
| 2026-10-08 | Границы N11–N20 | Шесть пар разных source facts дают одинаковый serialized BOC: cell/string, nested/flat layout, generic/inline, semantic alias, enum member names, bool/int1. 238 проб с идентичным gas. Все 24 семейства имеют реализованные формы/воспроизводимые примеры и явно перечисленные открытые границы; это завершение первого каталога, не заявление о полном schema/CFG recovery. |

Приёмка первого прохода: 45 Kotlin-тестов; 19 compiler-derived сценариев,
501 входная проба с равенством raw/normalized code-cell, serialized BOC и
gas. Original/normalized поведение совпадает на этих пробах; два сценария
имеют ранее существовавшее original/raw расхождение hash, которое записано
отдельно. Повторно прошли 348 prefix-, 26 normalization- и 13 edge-проб,
четыре теста стенда. Оба 20-case corpus сохранили 18 успешных случаев,
два известных partial и ноль неожиданных ошибок. Все восемь шаблонов
проверены; шесть complete сохраняют raw/normalized BOC, два partial —
файлы/диагностики. HTML обновлён и проверен для обоих языков.

Следующие порции первого прохода перечислены ниже. Полный текущий статус —
в таблице и [каталоге](compiler-recovery-catalog.md); nullable/address
propagation за пределами локальных форм остаётся открытой.

Порция N05 также прошла 50 Kotlin-тестов и проверки всех восьми шаблонов
на обоих языках. HTML и raw/normalized каталог обновлены; шесть complete
сохраняют BOC identity, два partial сохраняют файлы и диагностики.

Порция N07/N08 прошла 56 Kotlin-тестов, четыре теста стенда и все предыдущие
recovery/builders/matches/normalization/edges suites (501/202/348/26/13 проб).
Оба 20-case corpus сохраняют 18 passing, два известных partial и ноль
unexpected failures. Все восемь шаблонов проверены на обоих языках;
raw/normalized идентичность шести complete и неизменность двух partial
подтверждены. HTML обновлён и проверен, включая скачиваемые raw/normalized
артефакты и мобильную верстку.

Порция P01 прошла 58 Kotlin-тестов и все предыдущие suites плюс 70 новых
loop-проб. Оба corpus сохраняют 18 passing / 2 известных partial и прежние
8 Tolk / 15 FunC original code-cell identities. Все восемь шаблонов
проверены; теперь семь complete raw/normalized BOC идентичны, только
WalletV5 сохраняет partial-файлы/диагностики. Для семи complete результаты
original/recompiled: 12/13 getter, 55/61 messages с values, 60/61
state/actions. HTML обновлён и проверен. `tolk:audit` дополнительно
проверяет полноту suite reports и совпадение request SHA-256 с текущим JAR.

Порция P02: 60 Kotlin-тестов и четыре теста стенда. Все восемь шаблонов
компилируются на обоих языках; все восемь Tolk raw/normalized BOC идентичны.
Original/recompiled: 17/18 getters, 65/71 messages с values, 70/71
state/actions. Новый WalletV5 проходит все свои пробы; прежние MYCODE и
gas/carried-value расхождения сохранены в отчёте. Каталог и HTML обновлены.

Порция P03 прошла 62 Kotlin-теста, четыре теста стенда, шесть основных
recovery suites / 1028 проб, а также prefix/normalization/edges. Оба corpus
теперь 19 passing / 1 известный dynamic EXECUTE partial, 75 getter-проб;
original code-cell identities остаются 8 Tolk / 15 FunC. Все восемь шаблонов
проверены, их raw/normalized BOC идентичны; прежние original/recompiled
расхождения сохранены. HTML обновлён и проверен для обоих языков.

Результаты предыдущих правил и известные original/recompiled-расхождения
содержатся в [regression-results.md](regression-results.md). Эта спецификация
не меняет их статус.

Порция P04 прошла 65 Kotlin-тестов, четыре теста стенда, семь основных
recovery suites / 1160 проб и три доказательства ambiguous dispatch / девять
проб. Prefix/normalization/edges и оба 20-case corpus проходят с прежними
19 passing / 1 partial. Все восемь шаблонов проверены на обоих языках;
raw/normalized BOC идентичность и прежние original/recompiled различия
сохранены. HTML прошёл проверки точного текста, downloads, keyboard/mobile,
отсутствия сетевых запросов и ошибок JavaScript.

Порция N18: 68 Kotlin-тестов, пять тестов стенда, 1160 основных getter-проб
и 197 новых транзакционных проб, dispatch ambiguity и prefix/normalization/edges.
Оба corpus сохраняют 19 passing / 1 partial, 75 getter-проб, 8 Tolk / 15 FunC
original code-cell identities. Все восемь шаблонов, каталог и HTML проверены
повторно; их raw/normalized BOC идентичность и прежние original differences
сохранены. Нормализатор меняет только вызов отправки и spelling режима,
восстановление createMessage остаётся отдельным пунктом.

Заключительная порция первого каталога: 77 Kotlin-тестов, пять тестов стенда,
151 compiler-derived getter-сценарий / 4504 входные пробы, 197 message-проб,
dispatch/schema ambiguity (9/238), prefix/normalization/edges (348/26/13).
Все применённые новые правила сохраняют raw/normalized code-cell, serialized
BOC и gas. На текущих восьми шаблонах nested/terminal-arithmetic формы не
встречаются; compiler coverage не считается улучшением их статистики.
Оба corpus, все восемь шаблонов на обоих языках и HTML проверены повторно.
Прежние original/recompiled различия сохранены. Текущий полный каталог —
[compiler-recovery-catalog.md](compiler-recovery-catalog.md); открытые границы
даны по каждому семейству, без угадывания стёртых типов и author schemas.
