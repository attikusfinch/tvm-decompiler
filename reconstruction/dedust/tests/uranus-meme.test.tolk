import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"
import "../CpmmPoolV2/storage"

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

get fun `test Uranus Meme V3 editable build equals complete mainnet code`() {
    expect(build("UranusMemeV3").hash()).toEqual(
        build("meme-v3-oracle", "oracles/UranusMemeV3.boc").hash(),
    );
}

get fun `test real Factory to Meme library deployment initializes preserved curve`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
    val data = net.runGetMethod<(
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
    expect(data.0).toEqual(true);
    expect(data.1).toEqual(false);
    expect(data.2 as slice).toEqual(controller.address as slice);
    expect(data.3 as slice).toEqual(creator.address as slice);
    expect(data.4).toEqual(0);
    expect(data.6).toEqual(false);
    expect(data.10).toEqual(100);
    val curve = memeCurve(target);
    expect(curve.1).toEqual(1000000000000000000);
    expect(curve.2).toEqual(0);
    expect(curve.3).toEqual(800000000000000000);
    expect(curve.4).toEqual(200000000000000000);
    expect(curve.7).toEqual(0);
    expect(initialized.outMessages.size()).toEqual(1);
}

get fun `test Factory initial buy mints actual source-built wallet at independent sharded address`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val curve = memeCurve(target);
    val netPayment = 1000000000 * 10000 / 10100;
    val tokens = netPayment * curve.8 / (curve.9 + netPayment);
    expect(curve.2).toEqual(tokens);
    expect(curve.7).toEqual(netPayment);
    val credit = memeMessage(initialized, 0x178d4519);
    val derived = net.runGetMethod<address>(target, 103289, [creator.address]);
    expect(credit.info.dest as slice).toEqual(derived as slice);
    testing.setShardAccount(derived, null);
    memeExit(memeDeliver(target, credit), 0);
    expect(memeWalletBalance(derived)).toEqual(tokens);
}

get fun `test real Wallet sell notice updates curve with independent rounding and pays owner`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val credit = memeMessage(initialized, 0x178d4519);
    val wallet = credit.info.dest;
    testing.setShardAccount(wallet, null);
    memeExit(memeDeliver(target, credit), 0);
    val before = memeCurve(target);
    val amount = before.2 / 2;
    val sell = beginCell()
        .storeUint(0xb7459e2c, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeCoins(0)
        .storeAddressOpt(null)
        .storeUint(0, 2)
        .endCell();
    val walletResult = memeSend(creator.address, wallet, sell);
    memeExit(walletResult, 0);
    expect(memeWalletBalance(wallet)).toEqual(before.2 - amount);
    val received = memeDeliver(wallet, memeMessage(walletResult, 0x646ad424));
    memeExit(received, 0);
    val gross = amount * (before.9 + before.7) / (before.8 - before.2 + amount);
    val payout = gross * 10000 / 10100;
    expect(memeCurve(target).7).toEqual(before.7 - gross);
    expect(memeCurve(target).2).toEqual(before.2 - amount);
    val paid = memeMessage(received, 0x66c8ad72);
    expect(paid.info.dest as slice).toEqual(creator.address as slice);
    expect(paid.info.value.grams).toEqual(payout);
}

get fun `test real Wallet burn notice reduces master supply without altering curve inventory`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val credit = memeMessage(initialized, 0x178d4519);
    val wallet = credit.info.dest;
    testing.setShardAccount(wallet, null);
    memeExit(memeDeliver(target, credit), 0);
    val before = memeCurve(target);
    val burn = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(123, 64)
        .storeCoins(700)
        .storeAddressOpt(null)
        .storeBool(false)
        .endCell();
    val result = memeSend(creator.address, wallet, burn);
    memeExit(result, 0);
    memeExit(memeDeliver(wallet, memeMessage(result, 0x7bdd97de)), 0);
    expect(memeCurve(target).1).toEqual(before.1 - 700);
    expect(memeCurve(target).2).toEqual(before.2);
    expect(memeWalletBalance(wallet)).toEqual(before.2 - 700);
}

get fun `test master rejects forged wallet and slippage and preserves initialized state`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
    val before = memeCurve(target);
    val forged = beginCell()
        .storeUint(0x7bdd97de, 32)
        .storeUint(123, 64)
        .storeCoins(1)
        .storeAddress(creator.address)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(creator.address, target, forged), 25);
    memeExit(memeSend(creator.address, target, memeBuy(1000000000, creator.address, before.1)), 21);
    memeExit(
        memeSend(creator.address, target, memeBuy(1000000000, creator.address), ton("0.01")),
        23,
    );
    expect(memeCurve(target).2).toEqual(0);
    expect(memeCurve(target).1).toEqual(before.1);
}

get fun `test creator and partner claim exact independently split accrued fees`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000, true);
    val fee = 1000000000 - 1000000000 * 10000 / 10100;
    val partnerFee = fee * 400 / 10000;
    val creatorFee = fee - fee * 20 / 100 - partnerFee;
    expect(net.runGetMethod<(int, int, address, int)>(target, 83180, []).0).toEqual(partnerFee);
    val claim = beginCell()
        .storeUint(0xad7269a8, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(controller.address, target, claim), 25);
    val c = memeSend(creator.address, target, claim);
    memeExit(c, 0);
    expect(memeMessage(c, 0x66c8ad72).info.value.grams).toEqual(creatorFee);
    val partnerClaim = beginCell()
        .storeUint(0x7f4bcbf4, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .storeAddressOpt(null)
        .endCell();
    val p = memeSend(controller.address, target, partnerClaim);
    memeExit(p, 0);
    expect(memeMessage(p, 0x66c8ad72).info.value.grams).toEqual(partnerFee);
    expect(net.runGetMethod<(int, int, address, int)>(target, 83180, []).0).toEqual(0);
    expect(memeSend(controller.address, target, partnerClaim).outMessages.size()).toEqual(1);
}

get fun `test graduation resolves real Pool wallet and emits authenticated liquidity migration`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
    val purchased = memeSend(
        creator.address,
        target,
        memeBuy(2000000000000, creator.address),
        ton("2002"),
    );
    memeExit(purchased, 0);
    expect(memeCurve(target).0).toEqual(true);
    expect(memeCurve(target).2).toEqual(800000000000000000);
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
