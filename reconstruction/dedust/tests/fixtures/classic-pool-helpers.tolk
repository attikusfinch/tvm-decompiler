import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"

fun classicPoolExit(result: SendResult, expected: int) {
    val d = result.tx.load().description.load();
    assert (d is TlbTransOrd) throw 567;
    val c = d.computePh;
    assert (c is TlbTrComputeVm) throw 567;
    expect(c.data.load().exitCode).toEqual(expected);
}

fun classicPoolNative(): cell {
    return beginCell().storeUint(0, 4).endCell();
}

fun classicPoolJetton(): cell {
    return beginCell().storeUint(1, 4).storeInt(0, 8).storeUint(88, 256).endCell();
}

fun classicPoolDescriptor(factory: address, stable: int = 0): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(2, 8)
        .storeUint(stable, 1)
        .storeSlice(classicPoolNative().beginParse())
        .storeSlice(classicPoolJetton().beginParse())
        .endCell();
}

fun classicPoolVault(factory: address, asset: cell): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(1, 8)
        .storeSlice(asset.beginParse())
        .endCell();
}

fun classicPoolTemplate(data: cell): address {
    val init: AutoDeployAddress = { stateInit: { code: build("ClassicBlank"), data } };
    return init.calculateAddress();
}

fun classicPoolOperator(factory: address, kind: int): address {
    return classicPoolTemplate(
        beginCell().storeSlice(factory as slice).storeUint(4, 8).storeUint(kind, 8).endCell(),
    );
}

fun classicPoolProof(factory: address, owner: address, stable: int = 0): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(3, 8)
        .storeRef(
            beginCell()
                .storeSlice(owner as slice)
                .storeUint(stable, 1)
                .storeSlice(classicPoolNative().beginParse())
                .storeSlice(classicPoolJetton().beginParse())
                .endCell(),
        )
        .endCell();
}

fun classicPoolSetup(stable: int = 0, revision: int = 0, startTime: int? = null): (
    address,
    Treasury,
    Treasury,
) {
    testing.setNow(1700000000);
    val factory = testing.treasury("classic-pool-factory");
    val owner = testing.treasury("classic-pool-owner");
    val init: AutoDeployAddress = {
        stateInit: {
            code: build("ClassicBlank"),
            data: classicPoolDescriptor(factory.address, stable),
        },
    };
    val target = init.calculateAddress();
    testing.setShardAccount(target, null);
    var installBuilder = beginCell()
        .storeUint(2604311546, 32)
        .storeUint(123, 64)
        .storeRef(build("ClassicBlank"))
        .storeUint(9, 16)
        .storeRef(
            revision == 8
                ? build("ClassicPoolInstalledV8")
                : revision == 9 ? build("ClassicPoolInstalledV9") : build("ClassicVolatilePool"),
        )
        .storeUint(30, 16)
        .storeRef(build("ClassicLpWallet"))
        .storeUint(9, 8)
        .storeUint(9, 8);
    if (startTime != null) {
        installBuilder.storeUint(startTime!, 32);
    }
    val install = installBuilder.endCell();
    classicPoolExit(
        testing.processSingleTraceStep(
            factory.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("5"), dest: init, body: install }),
        ),
        0,
    );
    return (target, owner, factory);
}

fun classicPoolSend(from: address, to: address, body: cell): SendResult {
    return testing.processSingleTraceStep(
        from,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: to, body }),
    );
}

fun classicPoolBody(message: TlbMessageRelaxedGeneric): slice {
    var body = message.body;
    if (body.loadBool()) {
        body = body.loadRef().beginParse();
    }
    return body;
}

fun classicPoolMessage(result: SendResult, opcode: int): TlbMessageRelaxedGeneric {
    var i = 0;
    repeat (result.outMessages.size()) {
        val raw = result.outMessages.atCell(i);
        if (raw.beginParse().preloadUint(1) == 0) {
            val message = (raw as Cell<TlbMessageRelaxedGeneric>).load();
            val op = message.loadOpcode();
            if (op != null && op! == opcode) {
                return message;
            }
        }
        i += 1;
    }
    throw 567;
}

fun classicPoolDeliver(from: address, message: TlbMessageRelaxedGeneric): SendResult {
    if (message.init is TlbNone) {
        return testing.processSingleTraceStep(
            from,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: message.info.value.grams,
                dest: message.info.dest,
                body: classicPoolBody(message),
            }),
        );
    }
    val init = message.init.unwrap();
    val state = match (init) {
        TlbEitherLeft => init.value,
        TlbEitherRight => init.value.load(),
    };
    val target: AutoDeployAddress = { stateInit: state.toCell() };
    expect(target.calculateAddress() as slice).toEqual(message.info.dest as slice);
    return testing.processSingleTraceStep(
        from,
        createMessage({
            bounce: BounceMode.NoBounce,
            value: message.info.value.grams,
            dest: target,
            body: classicPoolBody(message),
        }),
    );
}

fun classicPoolDeposit(
    target: address,
    factory: address,
    owner: address,
    amount0: int = 1000000,
    amount1: int = 2000000,
    minimum: int = 0,
    stable: int = 0,
): SendResult {
    val proof = classicPoolProof(factory, owner, stable);
    val body = beginCell()
        .storeUint(3043726744, 32)
        .storeUint(123, 64)
        .storeRef(proof)
        .storeSlice(owner as slice)
        .storeCoins(minimum)
        .storeRef(
            beginCell()
                .storeSlice(classicPoolNative().beginParse())
                .storeCoins(amount0)
                .storeSlice(classicPoolJetton().beginParse())
                .storeCoins(amount1)
                .endCell(),
        )
        .storeUint(0, 1)
        .storeUint(0, 1)
        .endCell();
    return classicPoolSend(classicPoolTemplate(proof), target, body);
}

fun classicPoolSwap(
    target: address,
    factory: address,
    owner: address,
    minimum: int = 0,
    deadline: int = 0,
): SendResult {
    val proof = classicPoolVault(factory, classicPoolNative());
    val parameters = beginCell()
        .storeUint(deadline, 32)
        .storeSlice(owner as slice)
        .storeSlice(owner as slice)
        .storeUint(0, 1)
        .storeUint(0, 1)
        .endCell();
    val body = beginCell()
        .storeUint(1643009069, 32)
        .storeUint(123, 64)
        .storeRef(proof)
        .storeCoins(10000)
        .storeSlice(owner as slice)
        .storeUint(0, 1)
        .storeCoins(minimum)
        .storeUint(0, 1)
        .storeRef(parameters)
        .endCell();
    return classicPoolSend(classicPoolTemplate(proof), target, body);
}

fun classicPoolReserves(target: address): (int, int) {
    return net.runGetMethod<(int, int)>(target, 65971, []);
}

fun classicPoolSupply(target: address): int {
    return net.runGetMethod<(int, int, any_address, cell, cell)>(target, 106029, []).0;
}
