// decompiled by @fiscaldev
import "@stdlib/tvm-dicts"
import "../../../libraries/messages/opcodes"
// Wire codecs and bounded stack-lifetime primitives. No trade branch or whole method is assembly.
fun releaseNoHook(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        cell,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        int,
        slice,
        int,
        int,
        cell,
        int,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    cell,
    int,
    int,
    slice,
)
    asm "DROP s2 s10 XCHG s6 POP s7 POP DROP"

fun hookState(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        cell,
        int,
        int,
        slice,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    cell,
    int,
    int,
    slice,
)
    asm "nop"

fun ackValue(key: int): (int, int, builder)
    asm "64 PUSHINT OVER NEWC 64 STU"

@inline
fun setWithWidth(dictionary: cell, key: int, width: int, value: builder): cell {
    var entries = dictionary as dict;
    entries.uDictSetBuilder(width, key, value);
    return entries as unknown as cell;
}

fun ackState(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        cell,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        int,
        slice,
        int,
        int,
        cell,
        cell,
        int,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    cell,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    int,
    slice,
    int,
    int,
    cell,
    cell,
    int,
)
    asm "nop"

fun feeState(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        int,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        int,
        slice,
        int,
        cell,
        cell,
        cell,
        int,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    int,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    int,
    slice,
    int,
    cell,
    cell,
    cell,
    int,
)
    asm "nop"

fun releaseNoProgram(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        cell,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        int,
        slice,
        int,
        int,
        cell,
        cell,
        int,
        cell,
        int,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    cell,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    int,
    slice,
    int,
    int,
    cell,
    cell,
    int,
)
    asm "s5 POP DROP"

fun stage8<
    T0,
    T1,
    T2,
    T3,
    T4,
    T5,
    T6,
    T7,
>(
    f0: T0,
    f1: T1,
    f2: T2,
    f3: T3,
    f4: T4,
    f5: T5,
    f6: T6,
    f7: T7,
): (
    T0,
    T1,
    T2,
    T3,
    T4,
    T5,
    T6,
    T7,
)
    asm "nop"

fun stage22(
    fields: (
        cell,
        cell,
        cell,
        int,
        int,
        cell,
        int,
        cell,
        int,
        int,
        int,
        int,
        int,
        int,
        slice,
        int,
        int,
        cell,
        cell,
        int,
        cell,
        int,
    ),
): (
    cell,
    cell,
    cell,
    int,
    int,
    cell,
    int,
    cell,
    int,
    int,
    int,
    int,
    int,
    int,
    slice,
    int,
    int,
    cell,
    cell,
    int,
    cell,
    int,
)
    asm "nop"

fun completeBounce(): void
    asm "nop"

fun fallbackDispatch(
    ack: cell,
    value: int,
    opcode: int,
    query: int,
    body: slice,
    walletId: int,
    seqno: int,
    key: int,
    parameters: cell,
    fees: cell,
    messages: cell,
    recipe: slice,
): (
    cell,
    cell,
    cell,
    int,
    cell,
    int,
    int,
    int,
)
    asm "DROP s2 s9 XCHG s6 POP s7 POP DROP"

fun discardBounceState(
    messages: cell,
    walletId: int,
    seqno: int,
    key: int,
    parameters: cell,
    fees: cell,
    ack: cell,
): void
    asm "7 BLKDROP"

fun loadRequestFlag(s: slice): (int, slice, int)
    asm( -> 0 2 1) "0 PUSHINT SWAP 1 LDU"

fun twoStageState(
    value: int,
    opcode: int,
    query: int,
    body: slice,
    parameters: cell,
    fees: cell,
    messages: cell,
    nextQuery: int,
    program: cell,
): (
    int,
    int,
    int,
    slice,
    cell,
    cell,
    cell,
    int,
    cell,
)
    asm "nop"

fun retainRetriesProgramsAmountsFromTwoLegs(
    value: int,
    opcode: int,
    query: int,
    body: slice,
    parameters: cell,
    fees: cell,
    messages: cell,
    nextQuery: int,
    program: cell,
    otherProgram: cell,
): (cell, cell, cell)
    asm "3 BLKDROP s6 POP 3 2 BLKDROP2"

fun retainAmountsProgramsRetriesAfterRejection(
    nextQuery: int,
    parameters: cell,
    query: int,
    amount: int,
    messages: cell,
    fees: cell,
    rejected: cell,
): (cell, cell, cell)
    asm "DROP s5 POP 2 1 BLKDROP2"

fun retainProgramsAmountsRetriesAfterRejection(
    parameters: cell,
    nextQuery: int,
    query: int,
    amount: int,
    messages: cell,
    fees: cell,
    rejected: cell,
): (cell, cell, cell)
    asm "DROP s4 POP 2 1 BLKDROP2"

fun retainRetriesProgramsAmountsFromOneLeg(
    first: int,
    second: unknown,
    query: int,
    body: slice,
    parameters: cell,
    fees: cell,
    messages: cell,
    program: unknown,
): (cell, cell, cell)
    asm "DROP s6 POP 3 2 BLKDROP2"

fun retainRetriesProgramsAmountsFromCallback(
    first: int,
    second: int,
    query: int,
    body: slice,
    parameters: cell,
    fees: cell,
    messages: cell,
    program: cell,
    otherProgram: unknown,
): (cell, cell, cell)
    asm "DROP2 s6 POP 3 2 BLKDROP2"

fun keepUnmatchedProgram(
    body: slice,
    nextQuery: int,
    query: int,
    messages: cell,
    parameters: cell,
    fees: cell,
    program: cell,
): (cell, cell, cell)
    asm "DROP 3 3 BLKDROP2"

fun releaseCompletedTrade(
    parameters: cell,
    opcode: int,
    query: int,
    messages: cell,
    amount: int,
    fees: cell,
    nextQuery: int,
    rejected: cell,
): (cell, int, cell, cell)
    asm "DROP2 s3 POP DROP"

fun activeState(fees: cell, opcode: int, query: int, messages: cell, parameters: cell): (
    cell,
    int,
    int,
    cell,
    cell,
)
    asm "nop"

fun pendingState(messages: cell, parameters: cell, fees: cell): (cell, cell, cell)
    asm "nop"

fun releasePreparedTrade(
    parameters: cell,
    nextQuery: int,
    query: int,
    messages: cell,
    amount: int,
    fees: cell,
    rejected: cell,
): (cell, cell, cell)
    asm "DROP s2 s4 XCHG 3 1 BLKDROP2"

fun keepUnmatchedTrade(
    body: slice,
    program: cell,
    query: int,
    messages: cell,
    parameters: cell,
    fees: cell,
    nextQuery: int,
): (cell, cell, cell)
    asm "DROP 3 3 BLKDROP2"

fun keepOtherTrade(
    body: slice,
    opcode: int,
    query: int,
    messages: cell,
    parameters: cell,
    fees: cell,
): (cell, cell, cell)
    asm "3 3 BLKDROP2"

fun releaseRejectedTrade(
    nextQuery: int,
    parameters: cell,
    query: int,
    messages: cell,
    amount: int,
    fees: cell,
    rejected: cell,
): (cell, cell, cell)
    asm "DROP s2 s5 XCHG 3 1 BLKDROP2"

// Keep STSLICECONST here: replacing every use with storeUint(0, 2) changes the BOC.
fun builder.storeTwoZeroBitsCompat(self): builder
    asm "x{2_} STSLICECONST"

fun loadUint32(s: slice): (slice, int)
    asm( -> 1 0) "32 LDU"

fun storeTwoZeroBitsCompat(b: builder): builder
    asm "x{2_} STSLICECONST"

// TVM compatibility primitives used by this decompilation.
fun getExecutionContinuation(): unknown
    asm "c3 PUSH"

fun blessCode(s: slice): unknown
    asm "BLESS"

fun setExecutionContinuation(c: unknown): void
    asm "c3 POP"

fun loadMaybeDictionary(s: slice): (slice, cell)
    asm( -> 1 0) "LDDICT"

@inline
fun deleteUnsignedEntry(dictionary: cell, keyWidth: int, key: int): (cell, int) {
    var entries = dictionary as dict;
    val changed = entries.uDictDelete(keyWidth, key);
    return (entries as unknown as cell, changed as int);
}

fun loadCoinsField(s: slice): (slice, int)
    asm( -> 1 0) "LDGRAMS"

@inline
fun setUnsignedSlice(dictionary: cell, keyWidth: int, key: int, value: slice): cell {
    var entries = dictionary as dict;
    entries.uDictSet(keyWidth, key, value);
    return entries as unknown as cell;
}

@inline
fun setUnsignedBuilder(dictionary: cell, keyWidth: int, key: int, value: builder): cell {
    var entries = dictionary as dict;
    entries.uDictSetBuilder(keyWidth, key, value);
    return entries as unknown as cell;
}

@inline
fun findUnsignedEntry(dictionary: cell, keyWidth: int, key: int): (slice, int) {
    val (value, found) = (dictionary as dict).uDictGet(keyWidth, key);
    return (value as unknown as slice, found as int);
}

@inline
fun removeUnsignedEntry(dictionary: cell, keyWidth: int, key: int): (cell, slice, int) {
    var entries = dictionary as dict;
    val (value, changed) = entries.uDictDeleteAndGet(keyWidth, key);
    return (entries as unknown as cell, value as unknown as slice, changed as int);
}

@inline
fun firstUnsignedEntry(dictionary: cell, keyWidth: int): (int, slice, int) {
    var entries = dictionary as dict;
    val (key, value, found) = entries.uDictGetFirst(keyWidth);
    return (key as unknown as int, value as unknown as slice, found as int);
}

@inline
fun nextUnsignedEntry(dictionary: cell, keyWidth: int, pivot: int): (int, slice, int) {
    var entries = dictionary as dict;
    val (key, value, found) = entries.uDictGetNext(keyWidth, pivot);
    return (key as unknown as int, value as unknown as slice, found as int);
}

@inline
fun replaceUnsignedBuilder(dictionary: cell, keyWidth: int, key: int, value: builder): (cell, int) {
    var entries = dictionary as dict;
    val changed = entries.uDictSetBuilderIfExists(keyWidth, key, value);
    return (entries as unknown as cell, changed as int);
}

fun callAmountHookAbi(
    logicalTime: unknown,
    timestamp: unknown,
    tonAmount: unknown,
    destination: unknown,
    messageBody: unknown,
    hookArgument: unknown,
    methodId: int,
    continuation: unknown,
): unknown
    asm "7 1 CALLXARGS"

fun previousBlockContext(): tuple
    asm "13 GETPARAM"

fun unpackBalanceTuple(value: tuple): (unknown, unknown)
    asm "2 UNTUPLE"
