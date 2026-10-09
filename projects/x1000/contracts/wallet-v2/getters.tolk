// decompiled by @fiscaldev

import "errors"
import "../../../libraries/messages/opcodes"
import "compat"

@method_id(97376)
fun hasProgram(queryId: int): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    val queueState = tail.loadRef();
    var tail2 = tail;
    tail2.loadRef();
    tail2.assertEnd();

    val programs = (queueState.beginParse().preloadMaybeRef() as unknown as cell);
    var (_, programFound) = findUnsignedEntry(programs, 64, queryId);

    if (!(programFound != 0)) {
        return 0;
    }

    return 1;
}

@method_id(98121)
fun amountsEmpty(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    val refCell = tail.loadRef();
    var tail2 = tail;
    tail2.loadRef();
    tail2.assertEnd();

    return ((((refCell.beginParse().skipDict().preloadMaybeRef() as unknown as cell) as unknown) ==
        null) as int);
}

@method_id(95507)
fun storageVersion(): int {
    val dataSlice = contract.getData().beginParse();

    return dataSlice.preloadUint(8);
}

@method_id(97027)
fun walletId(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    return cursor2.preloadUint(32);
}

@method_id(118999)
fun programsEmptyAlias(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    val refCell = tail.loadRef();
    var tail2 = tail;
    tail2.loadRef();
    tail2.assertEnd();

    return ((((refCell.beginParse().preloadMaybeRef() as unknown as cell) as unknown) ==
        null) as int);
}

@method_id(94056)
fun retriesEmpty(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    val refCell = tail.loadRef();
    var tail2 = tail;
    tail2.loadRef();
    tail2.assertEnd();

    return ((((refCell
        .beginParse()
        .skipDict()
        .skipDict()
        .preloadMaybeRef() as unknown as cell) as unknown) ==
        null) as int);
}

@method_id(83648)
fun walletBalance(): int {
    var (__result_0_0, __result_0_1) = unpackBalanceTuple(
        (contract.getOriginalBalanceWithExtraCurrencies() as unknown as tuple),
    );
    var element_0: int = (__result_0_0 as int);
    var element_1: cell = (__result_0_1 as unknown as cell);

    return element_0;
}

@method_id(89828)
fun amountHookHash(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    tail.loadRef();
    var tail2 = tail;
    val amountHookCode = tail2.loadRef();
    tail2.assertEnd();

    return amountHookCode.hash();
}

@method_id(85802)
fun programsEmpty(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var tail = cursor2.skipBits(320);
    val refCell = tail.loadRef();
    var tail2 = tail;
    tail2.loadRef();
    tail2.assertEnd();

    return ((((refCell.beginParse().preloadMaybeRef() as unknown as cell) as unknown) ==
        null) as int);
}

@method_id(91459)
fun sequenceNumberAlias(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var (cursor22, _) = loadUint32(cursor2);

    return cursor22.preloadUint(32);
}

@method_id(85143)
fun seqno(): int {
    var dataSlice = contract.getData().beginParse();
    var cursor2 = dataSlice;
    var version = cursor2.loadUint(8);

    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;

    var (cursor22, _) = loadUint32(cursor2);

    return cursor22.preloadUint(32);
}
