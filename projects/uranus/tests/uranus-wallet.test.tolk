import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"

fun uranusCode(version: int): cell {
    return version == 2 ? build("UranusMemeWalletV2") : build("UranusMemeWalletV3");
}

fun uranusExit(result: SendResult, expected: int) {
    val d = result.tx.load().description.load();
    assert (d is TlbTransOrd) throw 567;
    val c = d.computePh;
    assert (c is TlbTrComputeVm) throw 567;
    expect(c.data.load().exitCode).toEqual(expected);
}

fun uranusData(amount: coins, owner: address, master: address): cell {
    return beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).endCell();
}

fun uranusDeployment(version: int, owner: address, master: address): AutoDeployAddress {
    return {
        workchain: 0,
        stateInit: { code: uranusCode(version), data: uranusData(0, owner, master) },
        toShard: { fixedPrefixLength: 8, closeTo: owner },
    };
}

fun uranusCredit(amount: coins, from: address): cell {
    return beginCell()
        .storeUint(0x178d4519, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeAddress(from)
        .storeUint(0, 2)
        .storeCoins(0)
        .storeBool(false)
        .endCell();
}

fun uranusTransfer(amount: coins, to: address): cell {
    return beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeAddress(to)
        .storeUint(0, 2)
        .storeBool(false)
        .storeCoins(0)
        .storeBool(false)
        .endCell();
}

fun uranusSetup(version: int): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val owner = testing.treasury("uranus-owner");
    val master = testing.treasury("uranus-master");
    val deployment = uranusDeployment(version, owner.address, master.address);
    val target = deployment.calculateAddress();
    testing.setShardAccount(target, null);
    uranusExit(
        testing.processSingleTraceStep(
            master.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("1"),
                dest: deployment,
                body: uranusCredit(
                    1000,
                    owner.address,
                ),
            }),
        ),
        0,
    );
    return (target, owner, master);
}

fun uranusBalance(target: address): int {
    return net.runGetMethod<(int, address, address, cell)>(target, 97026, []).0;
}

fun uranusBody(message: TlbMessageRelaxedGeneric): slice {
    var body = message.body;
    if (body.loadBool()) {
        body = body.loadRef().beginParse();
    }
    return body;
}

fun uranusSend(from: address, to: address, body: cell): SendResult {
    return testing.processSingleTraceStep(
        from,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: to, body }),
    );
}

get fun `test both Uranus wallet source builds equal frozen mainnet BOCs`() {
    expect(build("UranusMemeWalletV2").hash()).toEqual(
        build("uranus-wallet-v2-oracle", "../oracles/UranusMemeWalletV2.boc").hash(),
    );
    expect(build("UranusMemeWalletV3").hash()).toEqual(
        build("uranus-wallet-v3-oracle", "../oracles/UranusMemeWalletV3.boc").hash(),
    );
}

get fun `test Uranus transfer deploys sharded peer and conserves tokens in both versions`() {
    var version = 2;
    repeat (2) {
        val (target, owner, master) = uranusSetup(version);
        val recipient = testing.treasury("uranus-recipient");
        val result = uranusSend(owner.address, target, uranusTransfer(700, recipient.address));
        uranusExit(result, 0);
        expect(uranusBalance(target)).toEqual(300);
        val message = (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
        val deployment = uranusDeployment(version, recipient.address, master.address);
        val next = deployment.calculateAddress();
        expect(message.info.dest as slice).toEqual(next as slice);
        expect(message.info.bounce).toEqual(true);
        testing.setShardAccount(next, null);
        uranusExit(
            testing.processSingleTraceStep(
                target,
                createMessage({
                    bounce: BounceMode.NoBounce,
                    value: message.info.value.grams,
                    dest: deployment,
                    body: uranusBody(message),
                }),
            ),
            0,
        );
        expect(uranusBalance(next)).toEqual(700);
        expect(uranusBalance(target) + uranusBalance(next)).toEqual(1000);
        version += 1;
    }
}

get fun `test Uranus wallet owner and balance checks prevent unauthorized transfer burn and sell`() {
    var version = 2;
    repeat (2) {
        val (target, owner, master) = uranusSetup(version);
        val stranger = testing.treasury("uranus-stranger");
        uranusExit(uranusSend(master.address, target, uranusTransfer(700, stranger.address)), 25);
        uranusExit(uranusSend(owner.address, target, uranusTransfer(1001, stranger.address)), 27);
        uranusExit(uranusSend(stranger.address, target, uranusCredit(700, owner.address)), 25);
        val burn = beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(123, 64)
            .storeCoins(700)
            .storeUint(0, 2)
            .storeBool(false)
            .endCell();
        val sell = beginCell()
            .storeUint(0xb7459e2c, 32)
            .storeUint(123, 64)
            .storeCoins(700)
            .storeCoins(321)
            .storeUint(0, 2)
            .storeBool(false)
            .storeBool(false)
            .endCell();
        uranusExit(uranusSend(stranger.address, target, burn), 25);
        uranusExit(uranusSend(stranger.address, target, sell), 25);
        expect(uranusBalance(target)).toEqual(1000);
        version += 1;
    }
}

get fun `test Uranus burn notice and sell notice roll balances back through actual bounced bodies`() {
    var version = 2;
    repeat (2) {
        val (target, owner, master) = uranusSetup(version);
        val burn = beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(123, 64)
            .storeCoins(700)
            .storeUint(0, 2)
            .storeBool(false)
            .endCell();
        val burned = uranusSend(owner.address, target, burn);
        uranusExit(burned, 0);
        expect(uranusBalance(target)).toEqual(300);
        val burnNotice = (burned.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
        expect(burnNotice.loadOpcode()).toEqual(0x7bdd97de);
        val bounceBurn = beginCell()
            .storeUint(0xffffffff, 32)
            .storeSlice(uranusBody(burnNotice))
            .endCell();
        uranusExit(
            testing.processSingleTraceStep(
                master.address,
                createMessage({ bounce: BounceMode.NoBounce, value: ton("0.1"), dest: target, body: bounceBurn }).bounced(),
            ),
            0,
        );
        expect(uranusBalance(target)).toEqual(1000);
        val sell = beginCell()
            .storeUint(0xb7459e2c, 32)
            .storeUint(123, 64)
            .storeCoins(500)
            .storeCoins(321)
            .storeUint(0, 2)
            .storeBool(false)
            .storeBool(false)
            .endCell();
        val sold = uranusSend(owner.address, target, sell);
        uranusExit(sold, 0);
        expect(uranusBalance(target)).toEqual(500);
        val sellNotice = (sold.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
        expect(sellNotice.loadOpcode()).toEqual(0x646ad424);
        val bounceSell = beginCell().storeUint(0, 32).storeSlice(uranusBody(sellNotice)).endCell();
        uranusExit(
            testing.processSingleTraceStep(
                master.address,
                createMessage({ bounce: BounceMode.NoBounce, value: ton("0.1"), dest: target, body: bounceSell }).bounced(),
            ),
            0,
        );
        expect(uranusBalance(target)).toEqual(1000);
        version += 1;
    }
}

get fun `test Uranus V3 rejects message tails accepted by V2`() {
    var version = 2;
    repeat (2) {
        val (target, owner, master) = uranusSetup(version);
        val body = beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(123, 64)
            .storeCoins(700)
            .storeUint(0, 2)
            .storeBool(false)
            .storeBool(true)
            .endCell();
        uranusExit(uranusSend(owner.address, target, body), version == 2 ? 0 : 9);
        expect(uranusBalance(target)).toEqual(version == 2 ? 300 : 1000);
        version += 1;
    }
}

get fun `test Uranus wallet getter exposes complete source-built code and identity`() {
    var version = 2;
    repeat (2) {
        val (target, owner, master) = uranusSetup(version);
        val data = net.runGetMethod<(int, address, address, cell)>(target, 97026, []);
        expect(data.0).toEqual(1000);
        expect(data.1 as slice).toEqual(owner.address as slice);
        expect(data.2 as slice).toEqual(master.address as slice);
        expect(data.3.hash()).toEqual(uranusCode(version).hash());
        version += 1;
    }
}
