import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"

fun vaultExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

fun vaultNative(): cell {
    return beginCell().storeUint(0, 4).endCell();
}

fun vaultJetton(): cell {
    return beginCell().storeUint(1, 4).storeInt(0, 8).storeUint(76, 256).endCell();
}

fun vaultDescriptor(factory: address): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(1, 8)
        .storeSlice(vaultNative().beginParse())
        .endCell();
}

fun vaultPoolConfig(factory: address): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(2, 8)
        .storeUint(0, 1)
        .storeSlice(vaultNative().beginParse())
        .storeSlice(vaultJetton().beginParse())
        .endCell();
}

fun vaultDepositConfig(factory: address, owner: address): cell {
    return beginCell()
        .storeSlice(factory as slice)
        .storeUint(3, 8)
        .storeRef(
            beginCell()
                .storeSlice(owner as slice)
                .storeUint(0, 1)
                .storeSlice(vaultNative().beginParse())
                .storeSlice(vaultJetton().beginParse())
                .endCell(),
        )
        .endCell();
}

fun vaultTemplate(config: cell): address {
    val target: AutoDeployAddress = { stateInit: { code: build("ClassicBlank"), data: config } };
    return target.calculateAddress();
}

fun vaultSetup(): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val owner = testing.treasury("native-vault-owner");
    val factory = testing.treasury("native-vault-factory");
    val target: AutoDeployAddress = {
        stateInit: { code: build("ClassicBlank"), data: vaultDescriptor(factory.address) },
    };
    testing.setShardAccount(target.calculateAddress(), null);
    val body = beginCell()
        .storeUint(2604311546, 32)
        .storeUint(123, 64)
        .storeRef(build("ClassicBlank"))
        .storeUint(9, 16)
        .storeRef(build("ClassicNativeVault"))
        .endCell();
    vaultExit(
        testing.processSingleTraceStep(
            factory.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("5"), dest: target, body }),
        ),
        0,
    );
    return (target.calculateAddress(), owner, factory);
}

fun vaultLocked(target: address): int {
    return net.runGetMethod<int>(target, 109867, []);
}

fun vaultSend(from: address, target: address, body: cell): SendResult {
    return testing.processSingleTraceStep(
        from,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("0.5"), dest: target, body }),
    );
}

fun vaultWire(result: SendResult): TlbMessageRelaxedGeneric {
    return (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
}

fun vaultWireBody(message: TlbMessageRelaxedGeneric): slice {
    var body = message.body;
    if (body.loadBool()) {
        body = body.loadRef().beginParse();
    }
    return body;
}

fun vaultSwap(target: address, owner: address, pool: address, amount: coins): SendResult {
    return vaultSend(
        owner,
        target,
        beginCell()
            .storeUint(3926267997, 32)
            .storeUint(123, 64)
            .storeCoins(amount)
            .storeSlice(pool as slice)
            .storeUint(1, 1)
            .storeCoins(321)
            .storeUint(0, 1)
            .storeRef(beginCell().storeUint(0xcafe, 16).endCell())
            .endCell(),
    );
}

get fun `test source-built ClassicNativeVault equals archived mainnet`() {
    expect(build("ClassicNativeVault").hash()).toEqual(
        build("native-oracle", "../oracles/ClassicNativeVault.boc").hash(),
    );
}

get fun `test Blank initializes vault with canonical storage and fee getters`() {
    val (target, owner, factory) = vaultSetup();
    expect(vaultLocked(target)).toEqual(0);
    expect(net.runGetMethod<int>(target, 82320, [])).toEqual(9);
    expect(net.runGetMethod<slice>(target, 89995, [])).toEqual(factory.address as slice);
    expect(net.runGetMethod<slice>(target, 89352, [])).toEqual(vaultNative().beginParse());
    val first = net.runGetMethod<int>(target, 117300, [0, 1]);
    val second = net.runGetMethod<int>(target, 117300, [0, 2]);
    expect(second > first).toBeTrue();
    expect(net.runGetMethod<int>(target, 109505, [0]) > 0).toBeTrue();
}

get fun `test native swap credits principal and emits canonical pool request`() {
    val (target, owner, factory) = vaultSetup();
    val pool = vaultTemplate(vaultPoolConfig(factory.address));
    val result = vaultSwap(target, owner.address, pool, 1000);
    vaultExit(result, 0);
    expect(vaultLocked(target)).toEqual(1000);
    expect(result.outMessages.size()).toEqual(1);
    val message = vaultWire(result);
    expect(message.info.dest as slice).toEqual(pool as slice);
    val expected = beginCell()
        .storeUint(1643009069, 32)
        .storeUint(123, 64)
        .storeRef(vaultDescriptor(factory.address))
        .storeCoins(1000)
        .storeSlice(owner.address as slice)
        .storeUint(1, 1)
        .storeCoins(321)
        .storeUint(0, 1)
        .storeRef(beginCell().storeUint(0xcafe, 16).endCell())
        .endCell();
    expect(beginCell().storeSlice(vaultWireBody(message)).endCell().hash()).toEqual(
        expected.hash(),
    );
}

get fun `test liquidity funding sends factory the native principal and target pair`() {
    val (target, owner, factory) = vaultSetup();
    val body = beginCell()
        .storeUint(3579725446, 32)
        .storeUint(123, 64)
        .storeCoins(100)
        .storeUint(0, 1)
        .storeSlice(vaultNative().beginParse())
        .storeSlice(vaultJetton().beginParse())
        .storeRef(beginCell().storeCoins(700).storeCoins(500).storeCoins(600).endCell())
        .storeUint(0, 1)
        .storeUint(0, 1)
        .endCell();
    val result = vaultSend(owner.address, target, body);
    vaultExit(result, 0);
    expect(vaultLocked(target)).toEqual(100);
    val message = vaultWire(result);
    expect(message.info.dest as slice).toEqual(factory.address as slice);
    val expected = beginCell()
        .storeUint(4031694118, 32)
        .storeUint(123, 64)
        .storeRef(vaultDescriptor(factory.address))
        .storeSlice(owner.address as slice)
        .storeUint(0, 1)
        .storeSlice(vaultNative().beginParse())
        .storeSlice(vaultJetton().beginParse())
        .storeRef(
            beginCell()
                .storeCoins(500)
                .storeCoins(600)
                .storeSlice(vaultNative().beginParse())
                .storeCoins(100)
                .storeCoins(700)
                .endCell(),
        )
        .storeUint(0, 1)
        .storeUint(0, 1)
        .endCell();
    expect(beginCell().storeSlice(vaultWireBody(message)).endCell().hash()).toEqual(
        expected.hash(),
    );
}

get fun `test authentic pool payouts debit locked TON and forged senders fail`() {
    val (target, owner, factory) = vaultSetup();
    val config = vaultPoolConfig(factory.address);
    val pool = vaultTemplate(config);
    vaultExit(vaultSwap(target, owner.address, pool, 1000), 0);
    val body = beginCell()
        .storeUint(2907617013, 32)
        .storeUint(123, 64)
        .storeRef(config)
        .storeCoins(100)
        .storeSlice(owner.address as slice)
        .storeUint(0, 1)
        .endCell();
    vaultExit(vaultSend(owner.address, target, body), 265);
    expect(vaultLocked(target)).toEqual(1000);
    val result = vaultSend(pool, target, body);
    vaultExit(result, 0);
    expect(vaultLocked(target)).toEqual(900);
    val message = vaultWire(result);
    expect(message.info.dest as slice).toEqual(owner.address as slice);
    var ack = vaultWireBody(message);
    expect(ack.loadUint(32)).toEqual(1196394191);
    expect(ack.loadUint(64)).toEqual(123);
    expect(ack.loadBool()).toBeFalse();
}

get fun `test authenticated deposit refund resolves depositor and debits principal`() {
    val (target, owner, factory) = vaultSetup();
    vaultExit(vaultSwap(target, owner.address, owner.address, 1000), 0);
    val config = vaultDepositConfig(factory.address, owner.address);
    val body = beginCell()
        .storeUint(1795913855, 32)
        .storeUint(123, 64)
        .storeRef(config)
        .storeCoins(100)
        .storeUint(0, 1)
        .endCell();
    vaultExit(vaultSend(owner.address, target, body), 272);
    val result = vaultSend(vaultTemplate(config), target, body);
    vaultExit(result, 0);
    expect(vaultLocked(target)).toEqual(900);
    expect(vaultWire(result).info.dest as slice).toEqual(owner.address as slice);
}

get fun `test operator can withdraw excess while preserving locked TON reserve`() {
    val (target, owner, factory) = vaultSetup();
    vaultExit(vaultSwap(target, owner.address, owner.address, 1000), 0);
    val operatorAddress = vaultTemplate(
        beginCell().storeSlice(factory.address as slice).storeUint(4, 8).storeUint(9, 8).endCell(),
    );
    val body = beginCell()
        .storeUint(650525367, 32)
        .storeUint(123, 64)
        .storeSlice(owner.address as slice)
        .endCell();
    vaultExit(vaultSend(owner.address, target, body), 296);
    val result = vaultSend(operatorAddress, target, body);
    vaultExit(result, 0);
    expect(vaultLocked(target)).toEqual(1000);
    expect(result.outMessages.size()).toEqual(1);
    expect(vaultWire(result).info.dest as slice).toEqual(owner.address as slice);
}

get fun `test factory upgrade executes replacement hook and hook failure rolls back`() {
    val (target, owner, factory) = vaultSetup();
    val replacement = build("native-upgrade", "build/fixtures/native-vault-upgrade.boc");
    val failing = beginCell()
        .storeUint(444, 32)
        .storeUint(123, 64)
        .storeUint(13, 16)
        .storeRef(replacement)
        .endCell();
    vaultExit(vaultSend(factory.address, target, failing), 777);
    expect(net.runGetMethod<int>(target, 82320, [])).toEqual(9);
    val body = beginCell()
        .storeUint(444, 32)
        .storeUint(123, 64)
        .storeUint(10, 16)
        .storeRef(replacement)
        .endCell();
    vaultExit(vaultSend(owner.address, target, body), 259);
    vaultExit(vaultSend(factory.address, target, body), 0);
    var data = net.runGetMethod<cell>(target, 90046, []).beginParse();
    expect(data.loadUint(32)).toEqual(0xdeadbeef);
    var previous = data.loadRef().beginParse();
    previous.loadRef();
    expect(previous.loadAddress() as slice).toEqual(factory.address as slice);
    previous.loadRef();
    expect(previous.loadUint(16)).toEqual(10);
    expect(previous.loadCoins()).toEqual(0);
}
