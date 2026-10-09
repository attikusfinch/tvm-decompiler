# Каталог обратных форм компилятора

Первый проход по всем 24 семействам из [спецификации](compiler-recovery-spec.md).
База: TON `tolk-1.4.0`, Acton 1.0.0 (3a4f0dc), FunC/Fift v2026.08.
«Проверено» относится к перечисленным формам и конечному набору входов.
Открытая граница не означает, что всё семейство поддержано.

Нормализатор получает только результат `BOC → raw Tolk`. Исходники ниже
компилируются отдельно и служат oracle в эмуляторе. Проверки raw/normalized
требуют одинаковые code-cell, serialized BOC, exit/stack и gas; отличия
original/raw учитываются отдельно. Ни авторские типы, ни схемы шаблонов
не используются как подсказки.

## Все семейства

| ID | Реализованная / воспроизводимая форма | Проверка | Открытая граница |
|---|---|---|---|
| N01 | Отдельные raw/normalized этапы, ID правила, идемпотентность, отказы и SHA запроса | Unit/CLI, `tolk:audit`, все восемь шаблонов | Новая версия компилятора требует нового прогона |
| N02 | Terminal ordered integer equality chain → `match` | `tolk:recovery`: match/if, отрицательные, signed/large values | Joins и изменяемый субъект требуют анализа определений |
| N03 | CONDSEL → ternary для уже вычисленных однородных значений | `tolk:recovery`: truthy int, одинаковые операнды, erased types | Nullable GETPRECOMPILEDGAS и эффектные аргументы остаются helper |
| N04 | Exact LDUX/LDIX/LDGRAMS cursor methods | `tolk:recovery`: aliases, snapshots, dead outputs, boundaries | Не заменять динамический opcode константным по значению аргумента |
| N05 | 13 exact функциональных store-методов | `tolk:builders`: refs/bits overflow, coins, snapshots, effects | Объединение в авторский serializer требует layout proof |
| N06 | Bool guards без утраты TVM -1/0 | Unit, `tolk:normalization`, `tolk:edges` | Arithmetic/bitwise consumers сохраняют int |
| N07 | ISNULL и terminal nullable coalesce | `tolk:nullable`: physical null int/cell, eager/live/effectful fallback | Полное nullable propagation через joins не реализовано |
| N08 | Address getter и reversed LDOPTSTDADDR cursor | `tolk:nullable`, Acton Empty/Counter | addr_none/std/var/anycast нельзя объединять по названию переменной |
| N09 | Getter candidates по ID, сигнатуре и отсутствию внутренних ссылок | `tolk:normalization`, 17 именованных getters шаблонов | get_nft_content не имеет доказанного cell-параметра; имена кандидатов не авторские |
| N10 | SDBEGINSQ → lazy prefix union / `match`, 4..48 bit, nibble-aligned | `tolk:matches`: 7 / 348, overlaps/truncation/tails | Nonterminal/guarded shapes и другие return contexts сохраняются |
| N11 | Terminal integer chains внутри if/else → nested `match`; enum validations сохраняются | `tolk:catalog`: 7 / 336 | Loop/try/lambda/match arms, phi joins; enum names стёрты |
| N12 | UInt/int8, bool, coins, varint16/varuint32, bits8: raw loads/stores + exact cursor/builder формы | `tolk:catalog`: 12 / 391 | Int alias не доказывает semantic type; bool и int1 могут иметь одинаковый BOC |
| N13 | LDREF, inline slice/builder, opaque RemainingBitsAndRefs | `tolk:catalog`: 5 / 220 | Cell/string сериализуются одинаково; LDREF не доказывает текст |
| N14 | Maybe scalar/tensor, Either primitives, explicit constructor union | `tolk:catalog`: 4 / 184 | Serialized tag и runtime tag различаются; автоматическая типизация всего union не доказана |
| N15 | Eager nested layout, lazy skipped fields, custom unpack XOR | `tolk:catalog`: 3 / 133; state/effects в exceptions/messages | Вложенность struct стёрта; custom serializer нельзя заменить обычным чтением |
| N16 | Tensor, shaped tuple, serialized snake array, tuple push/pop snapshots | `tolk:catalog`: 4 / 179 | Tuple/array source type и element types не выводятся только из физических слотов |
| N17 | DICT{I,U,}GET[REF]+THROWIFNOT: fixed surviving result; typed map set/get и min/next iteration | `tolk:dictionary`: 13 / 351 на обоих языках; `tolk:catalog`: 2 / 68 | Unguarded quiet lookup имеет переменную ширину; high-level map value schema требует отдельного доказательства |
| N18 | SENDRAWMSG → sendRawMessage, exact named modes | `tolk:messages`: 11 / 197 транзакций | createMessage/TL-B layout не восстанавливается по похожей builder-цепочке |
| N19 | Terminal min/max/minMax/abs/divMod/mulDiv* и ceil/round division → natives; discarded MIN/MAX/MINMAX/ABS checks сохраняются | `tolk:arithmetic`: 18 / 1400; смешанный arithmetic в `tolk:catalog`: 1 / 54 | Constants/repeated/effectful operands, nonterminal calls сохраняются; общий анализ исключений остальных primitive открыт |
| N20 | Literal single-CALLDICT continuation + NOP + fixed CALLXARGS, generic inlining | `tolk:catalog`: 2 / 28, lambda также FunC | Generic граница может быть стёрта; captures/другие literal bodies требуют ABI и register proof |
| P01 | WHILE condition/pop/body, false edge и carried stack; UNTIL/REPEAT пробы | `tolk:loops`: 8 / 70; NftCollection complete | Общий CFG для произвольного bytecode не реализован |
| P02 | AGAIN/AGAINEND, RETALT и effectful procedures | `tolk:again`: 6 / 36; WalletV5 complete | AGAINBRK/AGAINENDBRK и dynamic exits |
| P03 | FunC/Tolk TRY register envelopes, включая legacy c4/c5/c7; простой stack-only bare TRY; captures, THROWARG, nested joins/returns | `tolk:exceptions`: 10 / 75; `tolk:static-calls`: legacy TRY и cell/null/int validation | Bare TRY с записью регистров, arbitrary handlers, multiple capture chunks, TRYARGS сохраняют diagnostics |
| P04 | Fixed CALLXARGS p/r, uncaptured literal CALLXARGS p/-1 с доказанной сигнатурой, static JMPX | `tolk:dispatch`: 6 / 132; `dispatch:ambiguity`: 3 / 9; `tolk:static-calls`: 8 / 39 | Runtime targets с неизвестной шириной и literal targets с несовместимой isolated ABI сохраняют diagnostics |

Числа после `/` — входные пробы, не число доказанных программ.
`tolk:catalog` содержит 40 compiler-derived примеров / 1593 пробы.
Данные по группам автоматически сверяются с
[`compiler-catalog.mjs`](../regression/fixtures/compiler-catalog.mjs).
Полноту reports и текущий JAR проверяет `tolk:audit`.

## Новые отдельные правила

`nested-integer-match` действует только внутри if/else с function-return
контекстом. Все ветви должны завершаться возвратом, сравнения — проверять
тот же доказанный локальный int по разным константам; fallback заканчивается
в ближайшей родительской ветке. Текст внутри loops, try, lambda, match arms
и bare blocks не переносится. Тесты включают настоящий исполняемый loop:
компилятор может удалить цикл, если body безусловно возвращает результат.

```tolk
if (outer == 7) {
    if (op == 1) { return 10; }
    if (op == 2) { return 20; }
    return 30;
}
// После отдельной нормализации:
if (outer == 7) {
    match (op) {
        1 => { return 10; }
        2 => { return 20; }
        else => { return 30; }
    }
}
```

`terminal-native-arithmetic` использует только distinct локальные int
аргументы в единственном terminal call или binding + точный ordered return.
Это ограничение сохраняет уже вычисленные операнды и препятствует
constant-folding/algebraic rewrites Tolk. Tuple binding остаётся на месте.
Никакой чистый native не подставляется для неиспользуемого результата:
MIN/MAX/MINMAX/ABS могут бросить type/overflow exception. Их raw IR и FunC
compatibility declarations сохраняют эффектные проверки.

```tolk
var (quotient, remainder) = tvm_x2f__x25_(x, y);
return (quotient, remainder);
// После отдельной нормализации:
var (quotient, remainder) = divMod(x, y);
return (quotient, remainder);
```

На текущих восьми шаблонах новые nested/terminal-arithmetic правила не
применяются. Это покрытие compiler-derived примеров, а не добавленный
подсчёт изменений настоящих шаблонов.

## Неоднозначность, доказанная одинаковым BOC

`schema:ambiguity` компилирует шесть пар разных исходников. У каждой пары
одинаковы code-cell и serialized BOC; 238 runtime probes совпадают вместе
с gas. Нормализатор получает только BOC.

| Пара | Утраченный факт |
|---|---|
| `cell` / `string` поле | Оба loader используют LDREF без проверки UTF-8 |
| Nested struct / flat struct | Группировка полей и границы вложенного типа |
| Generic identity / inline `x+1` | Generic-вызов и author-level function boundary |
| `uint8` / alias `UserId` | Semantic alias и его имя |
| Enum с разными именами members | Авторские enum labels |
| `bool` / `int1` поле | Source type при одинаковом signed one-bit encoding |

Это не запрещает вывод нейтрального восстановленного layout. Для такого
нового правила всё равно нужны доказанные load/store/skip boundaries,
nullable/stack widths, effects и равенство raw/normalized BOC. Текущий проход
сохраняет низкоуровневые формы, где этих фактов ещё нет.

Другая неоднозначность проверена `dispatch:ambiguity`: разные объявленные
return signatures дают тот же BOC, а runtime callbacks возвращают 0/1/2 слота.
Для этих форм partial diagnostics сохраняются на обоих языках. Новые исправления
не подменяют неизвестную ширину одним guessed `int`.

## Воспроизведение новых групп

Сначала собрать `shadowJar test`, затем из `regression`:

```sh
npm run tolk:catalog
npm run tolk:dictionary
npm run tolk:arithmetic
npm run schema:ambiguity
npm run tolk:audit
```

Переменные для локального Java, Acton/WSL и native FunC/Fift описаны в
[regression README](../regression/README.md). Audit требует также reports
всех предыдущих recovery suites и messages. Acton HTML остаётся отдельным
отчётом по восьми настоящим шаблонам и содержит точные raw/normalized файлы.
