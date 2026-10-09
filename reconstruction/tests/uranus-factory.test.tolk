import "@stdlib/exotic-cells"
import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"

fun factoryExit(result: SendResult, code: int) {
    val d = result.tx.load().description.load();
    assert (d is TlbTransOrd) throw 567;
    val c = d.computePh;
    assert (c is TlbTrComputeVm) throw 567;
    expect(c.data.load().exitCode).toEqual(code);
}

fun factorySetup(): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val creator = testing.treasury("meme-creator");
    val controller = testing.treasury("meme-controller");
    val deployment: AutoDeployAddress = {
        workchain: 0,
        stateInit: {
            code: build("UranusFactoryV3"),
            data: beginCell().storeAddress(controller.address).endCell(),
        },
    };
    val target = deployment.calculateAddress();
    testing.setShardAccount(target, null);
    factoryExit(
        testing.processSingleTraceStep(
            creator.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("5"),
                dest: deployment,
                body: beginCell().endCell(),
            }),
        ),
        0,
    );
    return (target, creator, controller);
}

fun factorySend(
    target: address,
    creator: address,
    body: cell,
    value: coins = ton("2"),
): SendResult {
    return testing.processSingleTraceStep(
        creator,
        createMessage({ bounce: BounceMode.NoBounce, value, dest: target, body }),
    );
}

fun factoryPreset(preset: int, buy: coins = 0): cell {
    return beginCell()
        .storeUint(0x6ff416dc, 32)
        .storeUint(123, 64)
        .storeUint(preset, 4)
        .storeRef(beginCell().storeUint(42, 8).endCell())
        .storeCoins(buy)
        .storeUint(0, 2)
        .endCell();
}

fun factoryCustom(
    partner: address,
    owner: address?,
    percent: int = 75,
    partnerShare: int = 400,
    poolShare: int = 320,
): cell {
    return beginCell()
        .storeUint(0x632f5d1c, 32)
        .storeUint(123, 64)
        .storeUint(1, 4)
        .storeUint(3, 4)
        .storeCoins(1000000000000)
        .storeUint(percent, 8)
        .storeAddress(partner)
        .storeUint(partnerShare, 16)
        .storeUint(poolShare, 16)
        .storeUint(2, 16)
        .storeAddressOpt(owner)
        .storeRef(beginCell().storeUint(42, 8).endCell())
        .storeCoins(0)
        .storeUint(0, 2)
        .endCell();
}

fun factoryInspect(
    result: SendResult,
    factory: address,
    creator: address,
    controller: address,
    onSell: coins,
    fee: int,
    partner: address,
    partnerShare: int,
    poolShare: int,
    poolFee: int,
    owner: address,
) {
    factoryExit(result, 0);
    expect(result.outMessages.size()).toEqual(1);
    val message = (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
    expect(message.info.bounce).toEqual(false);
    val init = message.init.unwrap();
    val state = match (init) {
        TlbEitherLeft => init.value,
        TlbEitherRight => init.value.load(),
    };
    expect(state.fixedPrefixLength).toEqual(8);
    val code = state.code!;
    var (lib, exotic) = code.beginParseSpecial();
    expect(exotic).toEqual(true);
    expect(lib.loadUint(8)).toEqual(2);
    expect(
        lib.loadUint(256),
    ).toEqual(0xa63e4a802c8b982cd888a357b2c9ee5a722644c2d7e7cdaed350f24fc96eca3d);
    lib.assertEnd();
    val expected: AutoDeployAddress = {
        workchain: 0,
        stateInit: state.toCell(),
        toShard: { fixedPrefixLength: 8, closeTo: factory },
    };
    expect(message.info.dest as slice).toEqual(expected.calculateAddress() as slice);
    var root = state.data!.beginParse();
    expect(root.loadUint(2)).toEqual(0);
    var config = root.loadRef().beginParse();
    expect(config.loadAddress() as slice).toEqual(creator as slice);
    expect(config.loadAddress() as slice).toEqual(controller as slice);
    expect(config.loadRef().hash()).toEqual(beginCell().storeUint(42, 8).endCell().hash());
    expect(config.loadCoins()).toEqual(1000000000000);
    val remaining = 1000000000000000000 - onSell;
    expect(config.loadCoins()).toEqual(remaining);
    config.loadUint(128); // The independent Node probes additionally check the exact RNG seed.
    config.assertEnd();
    expect(root.loadUint(16)).toEqual(fee);
    expect(root.loadBool()).toEqual(false);
    val sum = 1050000000000;
    val denominator = 1000000000000 * onSell / remaining - sum;
    expect(root.loadCoins()).toEqual((1000000000000 * onSell * onSell / remaining) / denominator);
    expect(root.loadCoins()).toEqual(sum * sum / denominator);
    expect(root.loadCoins()).toEqual(onSell);
    expect(root.loadCoins()).toEqual(0);
    expect(root.loadCoins()).toEqual(0);
    expect(root.loadCoins()).toEqual(1000000000000000000);
    expect(root.loadCoins()).toEqual(0);
    expect(root.loadCoins()).toEqual(0);
    expect(root.loadUint(16)).toEqual(partnerShare);
    var migration = root.loadRef().beginParse();
    expect(migration.loadAddress() as slice).toEqual(partner as slice);
    expect(migration.loadUint(16)).toEqual(poolShare);
    expect(migration.loadUint(16)).toEqual(poolFee);
    expect(migration.loadAddress() as slice).toEqual(owner as slice);
    migration.assertEnd();
    root.assertEnd();
    var body = message.body;
    if (body.loadBool()) {
        body = body.loadRef().beginParse();
    }
    expect(body.loadUint(32)).toEqual(0x796f5a0c);
    expect(body.loadUint(64)).toEqual(123);
    expect(body.loadCoins()).toEqual(0);
    expect(body.loadUint(2)).toEqual(0);
    body.assertEnd();
}

get fun `test Uranus factory source equals frozen mainnet BOC`() {
    expect(build("UranusFactoryV3").hash()).toEqual(
        build("uranus-factory-oracle", "oracles/UranusFactoryV3.boc").hash(),
    );
}

get fun `test Uranus preset deploys sharded StateInit with independent curve and migration config`() {
    val (target, creator, controller) = factorySetup();
    factoryInspect(
        factorySend(target, creator.address, factoryPreset(3)),
        target,
        creator.address,
        controller.address,
        800000000000000000,
        100,
        controller.address,
        0,
        0,
        100,
        creator.address,
    );
}

get fun `test Uranus custom deploy scales pool partner share and selects liquidity owner`() {
    val (target, creator, controller) = factorySetup();
    val partner = testing.treasury("meme-partner");
    val owner = testing.treasury("meme-pool-owner");
    factoryInspect(
        factorySend(target, creator.address, factoryCustom(partner.address, owner.address)),
        target,
        creator.address,
        controller.address,
        750000000000000000,
        100,
        partner.address,
        400,
        400,
        50,
        owner.address,
    );
    factoryInspect(
        factorySend(target, creator.address, factoryCustom(partner.address, null)),
        target,
        creator.address,
        controller.address,
        750000000000000000,
        100,
        partner.address,
        400,
        400,
        50,
        creator.address,
    );
}

get fun `test Uranus factory rejects unsupported parameters and insufficient deployment funding`() {
    val (target, creator, controller) = factorySetup();
    factoryExit(factorySend(target, creator.address, factoryPreset(2)), 22);
    factoryExit(factorySend(target, creator.address, factoryPreset(3), ton("0.01")), 23);
    factoryExit(
        factorySend(target, creator.address, factoryPreset(3, 1000000000000), ton("1002")),
        26,
    );
    factoryExit(
        factorySend(target, creator.address, factoryCustom(controller.address, null, 59)),
        38,
    );
    factoryExit(
        factorySend(target, creator.address, factoryCustom(controller.address, null, 75, 6001)),
        37,
    );
    factoryExit(
        factorySend(
            target,
            creator.address,
            factoryCustom(controller.address, null, 75, 400, 4001),
        ),
        39,
    );
}

get fun `test Uranus factory enforces message tails and ignores bounced deployments`() {
    val (target, creator, controller) = factorySetup();
    val body = factoryPreset(3);
    factoryExit(
        factorySend(
            target,
            creator.address,
            beginCell().storeSlice(body.beginParse()).storeBool(true).endCell(),
        ),
        9,
    );
    val result = testing.processSingleTraceStep(
        creator.address,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("2"), dest: target, body }).bounced(),
    );
    factoryExit(result, 0);
    expect(result.outMessages.size()).toEqual(0);
}
