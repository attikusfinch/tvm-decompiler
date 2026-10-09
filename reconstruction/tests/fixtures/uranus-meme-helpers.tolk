import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"
import "../../dedust/cpmm/CpmmPoolV2/storage"

fun memeExit(result: SendResult, expected: int) {
    val d = result.tx.load().description.load();
    assert (d is TlbTransOrd) throw 567;
    val c = d.computePh;
    assert (c is TlbTrComputeVm) throw 567;
    expect(c.data.load().exitCode).toEqual(expected);
}

fun memeBody(message: TlbMessageRelaxedGeneric): slice {
    var body = message.body;
    if (body.loadBool()) {
        body = body.loadRef().beginParse();
    }
    return body;
}

fun memeMessage(result: SendResult, opcode: int): TlbMessageRelaxedGeneric {
    var index = 0;
    repeat (result.outMessages.size()) {
        val raw = result.outMessages.atCell(index);
        if (raw.beginParse().preloadUint(1) == 0) {
            val message = (raw as Cell<TlbMessageRelaxedGeneric>).load();
            val found = message.loadOpcode();
            if (found != null && found! == opcode) {
                return message;
            }
        }
        index += 1;
    }
    throw 567;
}

// Deliver the actual emitted body, TON value and StateInit. All exotic libraries
// resolve to editable source builds registered by setup, including Pool/Deposit.
fun memeDeliver(from: address, message: TlbMessageRelaxedGeneric): SendResult {
    if (message.init is TlbNone) {
        return testing.processSingleTraceStep(
            from,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: message.info.value.grams,
                dest: message.info.dest,
                body: memeBody(message),
            }),
        );
    }
    val init = message.init.unwrap();
    val state = match (init) {
        TlbEitherLeft => init.value,
        TlbEitherRight => init.value.load(),
    };
    val deployment: AutoDeployAddress = {
        workchain: 0,
        stateInit: state.toCell(),
        toShard: state.fixedPrefixLength == null
            ? null
            : { fixedPrefixLength: state.fixedPrefixLength!, closeTo: message.info.dest },
    };
    expect(deployment.calculateAddress() as slice).toEqual(message.info.dest as slice);
    return testing.processSingleTraceStep(
        from,
        createMessage({
            bounce: BounceMode.NoBounce,
            value: message.info.value.grams,
            dest: deployment,
            body: memeBody(message),
        }),
    );
}

fun memeSend(from: address, to: address, body: cell, value: coins = ton("2")): SendResult {
    return testing.processSingleTraceStep(
        from,
        createMessage({
            bounce: BounceMode.NoBounce,
            value,
            dest: to,
            body,
        }),
    );
}

fun memeFactorySetup(initialBuy: coins = 0, custom: bool = false): (
    address,
    Treasury,
    Treasury,
    SendResult,
) {
    testing.setNow(1700000000);
    testing.registerLibrary(build("UranusMemeV3"));
    testing.registerLibrary(build("UranusMemeWalletV3"));
    testing.registerLibrary(build("CpmmPoolV2"));
    testing.registerLibrary(build("CpmmDeposit"));
    testing.registerLibrary(build("CpmmPosition"));
    testing.registerLibrary(build("CpmmAffiliateAccount"));
    val creator = testing.treasury("meme-chain-creator");
    val controller = testing.treasury("meme-chain-controller");
    val factory: AutoDeployAddress = {
        stateInit: {
            code: build("UranusFactoryV3"),
            data: beginCell().storeAddress(controller.address).endCell(),
        },
    };
    val f = factory.calculateAddress();
    testing.setShardAccount(f, null);
    memeExit(
        testing.processSingleTraceStep(
            creator.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("5"),
                dest: factory,
                body: beginCell().endCell(),
            }),
        ),
        0,
    );
    var b = beginCell();
    if (custom) {
        b
            .storeUint(0x632f5d1c, 32)
            .storeUint(123, 64)
            .storeUint(1, 4)
            .storeUint(3, 4)
            .storeCoins(1000000000000)
            .storeUint(80, 8)
            .storeAddress(controller.address)
            .storeUint(400, 16)
            .storeUint(320, 16)
            .storeUint(2, 16)
            .storeAddressOpt(null);
    } else {
        b.storeUint(0x6ff416dc, 32).storeUint(123, 64).storeUint(3, 4);
    }
    b.storeRef(beginCell().storeUint(42, 8).endCell()).storeCoins(initialBuy).storeUint(0, 2);
    val deployed = memeSend(creator.address, f, b.endCell(), initialBuy + ton("2"));
    memeExit(deployed, 0);
    val message = memeMessage(deployed, 0x796f5a0c);
    testing.setShardAccount(message.info.dest, null);
    val initialized = memeDeliver(f, message);
    memeExit(initialized, 0);
    return (message.info.dest, creator, controller, initialized);
}

fun memeCurve(target: address): (
    bool,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
    int,
) {
    return net.runGetMethod<(
        bool,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
    )>(target, 121862, []);
}

fun memeWalletBalance(target: address): int {
    return net.runGetMethod<(int, address, address, cell)>(target, 97026, []).0;
}

fun memeBuy(amount: coins, receiver: address, minOut: coins = 0): cell {
    return beginCell()
        .storeUint(0x94826557, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeCoins(minOut)
        .storeAddress(receiver)
        .storeUint(0, 2)
        .endCell();
}

fun memeGraduateAndMigrate(target: address, creator: Treasury) {
    val purchased = memeSend(
        creator.address,
        target,
        memeBuy(2000000000000, creator.address),
        ton("2002"),
    );
    memeExit(purchased, 0);
    val graduated = net.runGetMethod<(
        bool,
        bool,
        address,
        address,
        int,
        int,
        bool,
        int,
        int,
        int,
        int,
        int,
        int,
    )>(target, 101289, []);
    expect(graduated.6).toEqual(true);
    expect(graduated.12).toEqual(800000000000000000);
    val poolDeployment = memeMessage(purchased, 0xde8402ce);
    val pool = poolDeployment.info.dest;
    testing.setShardAccount(pool, null);
    val poolInit = memeDeliver(target, poolDeployment);
    memeExit(poolInit, 0);
    val resolution = memeDeliver(pool, memeMessage(poolInit, 0x2c76b973));
    memeExit(resolution, 0);
    val resolved = memeDeliver(target, memeMessage(resolution, 0xd1735400));
    memeExit(resolved, 0);
    val migration = memeDeliver(pool, memeMessage(resolved, 0xce185bd7));
    memeExit(migration, 0);
    val flags = net.runGetMethod<(
        bool,
        bool,
        address,
        address,
        int,
        int,
        bool,
        int,
        int,
        int,
        int,
        int,
        int,
    )>(target, 101289, []);
    expect(flags.1).toEqual(true);
    val tonPayment = memeMessage(migration, 0xa5a7cbf8);
    expect(tonPayment.info.value.grams).toEqual(1000150000000);
    val depositedTon = memeDeliver(target, tonPayment);
    memeExit(depositedTon, 0);
    val tokens = memeMessage(migration, 0x178d4519);
    val poolWallet = tokens.info.dest;
    testing.setShardAccount(poolWallet, null);
    val credited = memeDeliver(target, tokens);
    memeExit(credited, 0);
    expect(memeWalletBalance(poolWallet)).toEqual(200000000000000000);
    val tokenPayment = memeMessage(credited, 0x7362d09c);
    expect(tokenPayment.info.dest as slice).toEqual(pool as slice);
    val depositedTokens = memeDeliver(poolWallet, tokenPayment);
    memeExit(depositedTokens, 0);
    val depositTon = memeMessage(depositedTon, 0xdc5ddba1);
    val depositTokens = memeMessage(depositedTokens, 0xdc5ddba1);
    expect(depositTon.info.dest as slice).toEqual(depositTokens.info.dest as slice);
    val deposit = depositTon.info.dest;
    testing.setShardAccount(deposit, null);
    memeExit(memeDeliver(pool, depositTon), 0);
    val joined = memeDeliver(pool, depositTokens);
    memeExit(joined, 0);
    val funded = memeDeliver(deposit, memeMessage(joined, 0x25251ee0));
    memeExit(funded, 0);
    val state = net.runGetMethod<PoolData>(pool, 81689, []);
    expect(state.reserveX).toEqual(1000000000000);
    expect(state.reserveY).toEqual(200000000000000000);
    expect(state.liquidity > 0).toEqual(true);
    expect(state.depositActive).toEqual(true);
}
