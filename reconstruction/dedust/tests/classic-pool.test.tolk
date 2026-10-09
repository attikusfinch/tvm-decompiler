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

fun classicPoolSetup(stable: int = 0): (address, Treasury, Treasury) {
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
    val install = beginCell()
        .storeUint(2604311546, 32)
        .storeUint(123, 64)
        .storeRef(build("ClassicBlank"))
        .storeUint(9, 16)
        .storeRef(build("ClassicVolatilePool"))
        .storeUint(30, 16)
        .storeRef(build("ClassicLpWallet"))
        .storeUint(9, 8)
        .storeUint(9, 8)
        .endCell();
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
            createMessage({ bounce: BounceMode.NoBounce, value: message
                    .info
                    .value
                    .grams, dest: message.info.dest, body: classicPoolBody(message) }),
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
        createMessage({ bounce: BounceMode.NoBounce, value: message
                .info
                .value
                .grams, dest: target, body: classicPoolBody(message) }),
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

get fun `test readable Classic Pool equals every frozen code byte`() {
    expect(build("ClassicVolatilePool").hash()).toEqual(
        build("classic-pool-oracle", "oracles/ClassicVolatilePool.boc").hash(),
    );
}

get fun `test Blank installs Classic Pool with canonical precisions and vaults`() {
    val (target, owner, factory) = classicPoolSetup();
    expect(net.runGetMethod<int>(target, 82320, [])).toEqual(9);
    expect(net.runGetMethod<(int, int)>(target, 96780, [])).toEqual((30, 10000));
    expect(net.runGetMethod<(int, int)>(target, 106049, [])).toEqual((9, 9));
    expect(net.runGetMethod<(int, int)>(target, 111021, [])).toEqual(
        (1000000000000000000000000000, 1000000000000000000000000000),
    );
    expect(classicPoolReserves(target)).toEqual((0, 0));
    expect(classicPoolSupply(target)).toEqual(0);
    expect(net.runGetMethod<(slice, slice)>(target, 118188, [])).toEqual(
        (classicPoolNative().beginParse(), classicPoolJetton().beginParse()),
    );
}

get fun `test first liquidity deposit deploys and credits actual source-built LP wallet`() {
    val (target, owner, factory) = classicPoolSetup();
    val result = classicPoolDeposit(target, factory.address, owner.address);
    classicPoolExit(result, 0);
    expect(classicPoolReserves(target)).toEqual((1000000, 2000000));
    expect(classicPoolSupply(target)).toEqual(2001000);
    val credit = classicPoolMessage(result, 395134233);
    val wallet = net.runGetMethod<slice>(target, 103289, [owner.address as slice]);
    expect(credit.info.dest as slice).toEqual(wallet);
    testing.setShardAccount(credit.info.dest, null);
    classicPoolExit(classicPoolDeliver(target, credit), 0);
    expect(
        net.runGetMethod<(int, any_address, any_address, cell)>(credit.info.dest, 97026, []).0,
    ).toEqual(2000000);
    val ack = classicPoolMessage(result, 2867302998);
    var body = classicPoolBody(ack);
    body.skipBits(96);
    body.loadRef();
    expect(body.loadCoins()).toEqual(1000000);
    expect(body.loadCoins()).toEqual(2000000);
    body.assertEnd();
}

get fun `test funded pool swap matches constant-product rounding and protocol fee`() {
    val (target, owner, factory) = classicPoolSetup();
    classicPoolExit(classicPoolDeposit(target, factory.address, owner.address), 0);
    val fee = 10000 * 30 / 10000;
    val received = (10000 - fee) * 2000000 / (1000000 + 10000 - fee);
    val quote = net.runGetMethod<(slice, int, int)>(
        target,
        70754,
        [classicPoolNative().beginParse(), 10000],
    );
    expect(quote.1).toEqual(received);
    expect(quote.2).toEqual(fee);
    val result = classicPoolSwap(target, factory.address, owner.address);
    classicPoolExit(result, 0);
    expect(classicPoolReserves(target)).toEqual((1010000 - fee / 5, 2000000 - received));
    expect(net.runGetMethod<(int, int)>(target, 112792, [])).toEqual((fee / 5, 0));
    val payout = classicPoolMessage(result, 2907617013);
    expect(payout.info.dest as slice).toEqual(
        classicPoolTemplate(classicPoolVault(factory.address, classicPoolJetton())) as slice,
    );
    var body = classicPoolBody(payout);
    body.skipBits(96);
    expect(body.loadRef().hash()).toEqual(classicPoolDescriptor(factory.address).hash());
    expect(body.loadCoins()).toEqual(received);
    expect(body.loadAddress() as slice).toEqual(owner.address as slice);
}

get fun `test rejected swap commits refund and restores reserves and accrued fees`() {
    val (target, owner, factory) = classicPoolSetup();
    classicPoolExit(classicPoolDeposit(target, factory.address, owner.address), 0);
    val minimum = classicPoolSwap(target, factory.address, owner.address, 2000000);
    classicPoolExit(minimum, 304);
    expect(classicPoolReserves(target)).toEqual((1000000, 2000000));
    expect(net.runGetMethod<(int, int)>(target, 112792, [])).toEqual((0, 0));
    val refund = classicPoolMessage(minimum, 2907617013);
    expect(refund.info.dest as slice).toEqual(
        classicPoolTemplate(classicPoolVault(factory.address, classicPoolNative())) as slice,
    );
    var body = classicPoolBody(refund);
    body.skipBits(96);
    body.loadRef();
    expect(body.loadCoins()).toEqual(10000);
    val expired = classicPoolSwap(target, factory.address, owner.address, 0, 1699999999);
    classicPoolExit(expired, 305);
    expect(classicPoolReserves(target)).toEqual((1000000, 2000000));
}

get fun `test LP burn traverses real wallet notice and returns both reserves`() {
    val (target, owner, factory) = classicPoolSetup();
    val deposited = classicPoolDeposit(target, factory.address, owner.address);
    classicPoolExit(deposited, 0);
    val credit = classicPoolMessage(deposited, 395134233);
    testing.setShardAccount(credit.info.dest, null);
    classicPoolExit(classicPoolDeliver(target, credit), 0);
    val request = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(124, 64)
        .storeCoins(500000)
        .storeSlice(owner.address as slice)
        .endCell();
    val burned = classicPoolSend(owner.address, credit.info.dest, request);
    classicPoolExit(burned, 0);
    val notice = classicPoolMessage(burned, 2078119902);
    val settled = classicPoolDeliver(credit.info.dest, notice);
    classicPoolExit(settled, 0);
    val out0 = 1000000 * 500000 / 2001000;
    val out1 = 2000000 * 500000 / 2001000;
    expect(classicPoolReserves(target)).toEqual((1000000 - out0, 2000000 - out1));
    expect(classicPoolSupply(target)).toEqual(1501000);
    expect(
        net.runGetMethod<(int, any_address, any_address, cell)>(credit.info.dest, 97026, []).0,
    ).toEqual(1500000);
}

get fun `test deposit minimum rejects without changing reserves or minting`() {
    val (target, owner, factory) = classicPoolSetup();
    val failed = classicPoolDeposit(
        target,
        factory.address,
        owner.address,
        1000000,
        2000000,
        3000000,
    );
    classicPoolExit(failed, 0);
    expect(classicPoolReserves(target)).toEqual((0, 0));
    expect(classicPoolSupply(target)).toEqual(0);
    val message = classicPoolMessage(failed, 3785583828);
    expect(message.info.dest as slice).toEqual(
        classicPoolTemplate(classicPoolProof(factory.address, owner.address)) as slice,
    );
}

get fun `test collectors require derived operator and authenticated price reply`() {
    val (target, owner, factory) = classicPoolSetup();
    val body = beginCell()
        .storeUint(2880727869, 32)
        .storeUint(123, 64)
        .storeSlice(classicPoolNative().beginParse())
        .storeSlice(owner.address as slice)
        .endCell();
    classicPoolExit(classicPoolSend(owner.address, target, body), 296);
    classicPoolExit(classicPoolSend(classicPoolOperator(factory.address, 8), target, body), 0);
    val collectors = net.runGetMethod<(slice, slice)>(target, 66722, []);
    expect(collectors.0).toEqual(owner.address as slice);
    val reply = beginCell()
        .storeUint(172098648, 32)
        .storeUint(123, 64)
        .storeUint(3, 128)
        .storeUint(2, 128)
        .storeUint(0, 1)
        .endCell();
    classicPoolExit(classicPoolSend(factory.address, target, reply), 290);
    classicPoolExit(classicPoolSend(owner.address, target, reply), 0);
    expect(
        net.runGetMethod<(int, int)>(target, 111021, []).0,
    ).toEqual(1500000000000000000000000000);
}

get fun `test stable swap follows polynomial invariant with bounded rounding`() {
    val (target, owner, factory) = classicPoolSetup(1);
    classicPoolExit(
        classicPoolDeposit(
            target,
            factory.address,
            owner.address,
            1000000,
            1000000,
            0,
            1,
        ),
        0,
    );
    expect(net.runGetMethod<int>(target, 103723, [])).toEqual(1);
    val received = net
        .runGetMethod<(slice, int, int)>(target, 70754, [classicPoolNative().beginParse(), 10000])
        .1;
    val input = 10000 - 10000 * 30 / 10000;
    expect(received > input * 1000000 / (1000000 + input)).toBeTrue();
    expect(received <= input).toBeTrue();
    val x = 1000000 + input;
    val y = 1000000 - received;
    val before = 1000000 * 1000000 * (1000000 * 1000000 + 1000000 * 1000000);
    val after = x * y * (x * x + y * y);
    expect(abs(after - before) < before / 100000).toBeTrue();
}
