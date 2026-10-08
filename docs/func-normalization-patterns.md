# Нормализация FunC

FunC теперь проходит отдельную стадию после декомпиляции:

```text
BOC → инструкции → общий IR → raw main.fc + stdlib.fc
                                  ↓ только без диагностик
                             FuncNormalizer
                                  ↓
                         main.fc + normalizations
```

`--language func` включает эту стадию по умолчанию. `--no-normalize`
возвращает сырой FunC. Библиотека `stdlib.fc`, method_id, порядок аргументов
и результаты методов сохраняются. Частичный вывод не нормализуется.
Исходники Acton используются только для проверки; правила их не получают.

## Реализованные формы

| Правило | Было → стало | Условия и границы |
|---|---|---|
| `func-primitive-name` | `asm_INMSGPARAM_1/2()` → `incoming_message_is_bounced/sender()` | Точное объявление с селектором 1/2, типом и `impure`; asm-инструкция сохраняется. Конфликт имени запрещает замену. |
| `func-prefix-name` | `__const_00` → `PREFIX_1234ABCD` | Только 32-битный literal, используемый исключительно вторым аргументом `begins_with`. Hex и ASCII получают метку фактических битов. Имя сообщения не угадывается. Нечётные длины, ссылки, escapes и другие использования остаются явными. |
| `func-cursor-load` | `(slice tail, int value) = source.load_uint(n)` → `slice tail = source; int value = tail~load_uint(n)` | Явные уникальные binding-типы, точная арность, отсутствие пользовательского определения load и комментариев внутри замены. Поддерживаются uint, int, bits, grams, ref, std/optional address. Вычисления receiver и аргументов остаются в исходном порядке. |
| `func-cursor-helper` | Адресная пара → `cursor~load_std_addr_cursor()` / `~load_opt_std_addr_cursor()` | У LDSTDADDR/LDOPTSTDADDR адрес предшествует хвосту; маленький asm-помощник меняет только порядок FunC-результатов через `asm(-> 1 0)`. Opcode сохраняется; конфликтующее определение блокирует замену. |
| `func-cursor-merge` | `slice next = cursor; next~load_*()` → `cursor~load_*()` | Уникальные локальные slice, прежний cursor больше нигде не используется. Живые снимки, циклы и try/catch сохраняют копии. Это локальная проверка использования, не полный CFG-анализ. |
| `func-local-name` | `s2_00`, `a_00`, `x_00`, `matched_00` → `cursor`, `address`, `value`, `matched` | Только сгенерированные имена с hex-суффиксом и единственным binding. Роли определяются операцией, а fallback — явным типом. Прототипы и определения согласованы; строки/комментарии не меняются. Конфликты получают числовой суффикс. `phi` остаётся явным `merged_value`. |
| `func-scalar-syntax` | `(int) helper()` → `int helper()`; `return (value)` → `return value` | Пустые и множественные результаты сохраняют tuple-синтаксис. |
| `func-guard-syntax` | `if matched` / `ifnot matched` → `if (matched)` / `ifnot (matched)` | Условие остаётся прежним; целочисленная семантика FunC не превращается в предположение о bool. |
| `func-send-mode` / `func-send-mode-constant` | `send_raw_message(message, 3)` → `..., SEND_MODE_PAY_FEES_SEPARATELY + SEND_MODE_IGNORE_ERRORS` | Literal из битов 1, 2, 16, 32, 64, 128 либо 0. Числовые значения сохраняются, в том числе для недопустимого сочетания 64+128. Неизвестные биты, отрицательные/динамические значения и затенённые имена остаются явными. |

Например, getter Counter вместо пары slice-binding и технических имён получает:

```func
slice fn_83229 () impure method_id(83229) {
    slice cursor = get_data()
        .begin_parse();
    cursor~load_uint(32);
    slice address = cursor~load_std_addr_cursor();
    return address;
}
```

Имя getter здесь остаётся `fn_83229`: нормализатор FunC не выдаёт
кандидата по CRC16 за восстановленное авторское имя. `address` обозначает
результат адресной инструкции, а не предполагаемое поле `owner`.
Builder-цепочки, словари, min/max, null?, throw_unless, циклы и catch уже
имеют нативные FunC формы в raw-выводе; эта стадия сохраняет их.
Динамическая диспетчеризация и другие границы общего парсера продолжают
возвращать диагностики.

## Проверка

`npm run func:normalization` использует официальный нативный FunC/Fift
TON v2026.08 и TVM Sandbox. Оригинал, raw и normalized компилируются отдельно.
Raw/normalized должны иметь одинаковые кодовые ячейки **и байты BOC**;
эмулятор сравнивает весь стек, exit code и газ, включая ошибочные данные.
Поведение оригинала сравнивается отдельно. Тесты охватывают адрес/addr_none,
coins, refs, динамические и ошибочные ширины, NaN/null/неверный тип,
живой slice-снимок, цикл, catch, prefix и send modes. Частичный EXECUTE
проверяется на полное сохранение файлов и диагностик.

`npm run acton -- --local --native --acton` дополнительно сравнивает оба
этапа FunC на всех восьми шаблонах. HTML показывает оба этапа, применённые
правила и отдельное сравнение с оригиналом. Идентичность raw/normalized
не скрывает прежние различия raw-декомпиляции с оригиналом, включая MYCODE
и переносимый остаток, зависящий от газа.

Текущий набор: 31 сценарий (30 полных + один partial), 105 getter-проб
и восемь шаблонов. `npm run func:audit` сверяет SHA-256 JAR, сохранённые
результаты, реальные BOC обоих этапов и считает изменения исходного кода.

Основа mutating-вызовов — стандартный контракт FunC: первый результат
обновляет receiver, второй возвращается как значение; см.
[официальное описание](https://docs.ton.org/develop/func/builtins) и
[stdlib FunC](https://github.com/ton-blockchain/ton/blob/3d478cbde854be03a18ab2a59f8fc3c565cf7d14/crypto/smartcont/stdlib.fc).
Правила проверены на указанной сборке компилятора; эквивалентность для
произвольной версии компилятора не заявляется.
