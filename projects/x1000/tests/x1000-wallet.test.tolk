import "@acton/build"
import "@acton/crypto"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"

const xPrivate = 0x0707070707070707070707070707070707070707070707070707070707070707
const xPublic = 0xea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c

struct XProgramEntry {
    content: RemainingBitsAndRefs
}

struct (0xbeaf9617) XReceipt {
    query: uint64
}

fun xData(programs: dict = null, acks: dict = null): cell {
    return beginCell()
        .storeUint(1, 8)
        .storeUint(17, 32)
        .storeUint(5, 32)
        .storeUint(xPublic, 256)
        .storeRef(
            beginCell()
                .storeDict(programs)
                .storeBool(false)
                .storeBool(false)
                .storeDict(acks)
                .endCell(),
        )
        .storeRef(createEmptyCell())
        .endCell();
}

fun xExit(result: SendResult, code: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(code);
}

fun xSetup(data: cell): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val owner = testing.treasury("x1000-test-owner");
    val recipient = testing.treasury("x1000-test-recipient");
    val deploy: AutoDeployAddress = { stateInit: { code: build("X1000WalletV2"), data } };
    val target = deploy.calculateAddress();
    testing.setShardAccount(target, null);
    xExit(
        testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("10"), dest: deploy, body: createEmptyCell() }),
        ),
        0,
    );
    return (target, owner, recipient);
}

fun xSigned(
    to: address,
    seqno: int = 5,
    key: int = xPrivate,
    batch: int = 0,
    mode: int = 3,
    value: coins = ton("0.1"),
    program: cell? = null,
): cell {
    val item = beginCell()
        .storeAddress(to)
        .storeCoins(value)
        .storeCoins(0)
        .storeBool(true)
        .storeRef(createEmptyCell())
        .storeBool(false)
        .storeUint(123, 64)
        .storeDict(program)
        .endCell();
    val payload = beginCell()
        .storeUint(seqno, 32)
        .storeUint(0, 32)
        .storeUint(batch, 32)
        .storeBool(false)
        .storeUint(0, 16)
        .storeUint(mode, 8)
        .storeUint(0, 32)
        .storeUint(19, 32)
        .storeRef(item)
        .endCell();
    return beginCell()
        .storeSlice(crypto.sign(key, payload))
        .storeSlice(payload.beginParse())
        .endCell();
}

get fun `test X1000 source build equals the complete frozen code`() {
    expect(build("X1000WalletV2").hash()).toEqual(
        build("x1000-oracle", "../oracles/X1000WalletV2.boc").hash(),
    );
}

get fun `test X1000 signed send updates sequence and delivers actual TON`() {
    val (target, _, recipient) = xSetup(xData());
    val result = net.sendExternal(net.createExternalMessage(target, xSigned(recipient.address)));
    assert (result != null) throw 567;
    xExit(result.at(0), 0);
    expect(net.runGetMethod<int>(target, 85143, [])).toEqual(6);
    val msg = (result.at(0).outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
    expect(msg.info.dest as slice).toEqual(recipient.address as slice);
    expect(msg.info.value.grams).toEqual(ton("0.1"));
    expect(result.at(0).externals.size()).toEqual(1);
}

get fun `test X1000 rejects bad sequence and bad signer before accepting`() {
    val (target, _, recipient) = xSetup(xData());
    val wrongSequence = net.sendExternal(
        net.createExternalMessage(target, xSigned(recipient.address, 6)),
    );
    expect(wrongSequence).toBeNotAccepted();
    expect(wrongSequence).toHaveExternalVmExitCode(102);
    val wrongSigner = net.sendExternal(
        net.createExternalMessage(target, xSigned(recipient.address, 5, xPrivate + 1)),
    );
    expect(wrongSigner).toBeNotAccepted();
    expect(wrongSigner).toHaveExternalVmExitCode(555);
    expect(net.runGetMethod<int>(target, 85143, [])).toEqual(5);
}

get fun `test X1000 accepted request cannot be replayed`() {
    val (target, _, recipient) = xSetup(xData());
    val request = xSigned(recipient.address);
    val first = net.sendExternal(net.createExternalMessage(target, request));
    assert (first != null) throw 567;
    xExit(first.at(0), 0);
    val replay = net.sendExternal(net.createExternalMessage(target, request));
    expect(replay).toBeNotAccepted();
    expect(replay).toHaveExternalVmExitCode(102);
    expect(net.runGetMethod<int>(target, 85143, [])).toEqual(6);
}

get fun `test X1000 batch creates three additional self messages`() {
    val (target, _, recipient) = xSetup(xData());
    val result = net.sendExternal(
        net.createExternalMessage(target, xSigned(recipient.address, 5, xPrivate, 3)),
    );
    assert (result != null) throw 567;
    xExit(result.at(0), 0);
    expect(result.at(0).outMessages.size()).toEqual(5);
    expect(net.runGetMethod<int>(target, 85143, [])).toEqual(6);
}

get fun `test X1000 all balance destroy mode deletes the wallet`() {
    val (target, _, recipient) = xSetup(xData());
    val result = net.sendExternal(
        net.createExternalMessage(
            target,
            xSigned(
                recipient.address,
                5,
                xPrivate,
                0,
                160,
                0,
            ),
        ),
    );
    assert (result != null) throw 567;
    xExit(result.at(0), 0);
    expect(testing.getAccountBalance(target)).toEqual(0);
    expect(result.at(0).externals.size()).toEqual(0);
}

get fun `test X1000 all fourteen dispatch kinds clean completed queries`() {
    var kind = 0;
    repeat (14) {
        val recipe = beginCell().storeUint(kind, 4).storeUint(0, 8).storeUint(0, 3).endCell();
        var programs = createEmptyMap<uint64, XProgramEntry>();
        programs.set(123, { content: recipe.beginParse() });
        var acks = createEmptyMap<uint64, uint64>();
        acks.set(123, 777);
        val (target, owner, _) = xSetup(xData(programs.toLowLevelDict(), acks.toLowLevelDict()));
        expect(net.runGetMethod<int>(target, 97376, [123])).toEqual(1);
        val body = beginCell().storeUint(42, 32).storeUint(123, 64).endCell();
        val result = testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body }),
        );
        xExit(result, 0);
        expect(net.runGetMethod<int>(target, 97376, [123])).toEqual(0);
        expect(result.outMessages.size()).toEqual(1);
        kind += 1;
    }
}

get fun `test X1000 bounced query emits the original receipt id`() {
    var acks = createEmptyMap<uint64, uint64>();
    acks.set(123, 777);
    val (target, owner, _) = xSetup(xData(null, acks.toLowLevelDict()));
    val body = beginCell().storeUint(0xffffffff, 32).storeUint(42, 32).storeUint(123, 64).endCell();
    val result = testing.processSingleTraceStep(
        owner.address,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body }).bounced(),
    );
    xExit(result, 0);
    expect(result.outMessages.size()).toEqual(1);
    // Read the external body via the standard message decoder rather than source helpers.
    val message = (result.outMessages.atCell(0) as Cell<TlbExtMessageRelaxed<XReceipt>>).load();
    expect(message.loadBody().query).toEqual(777);
}

fun xTokenData(amount: coins, owner: address, master: address): cell {
    return beginCell().storeCoins(amount).storeAddress(owner).storeAddress(master).endCell();
}

fun xTokenDeployment(owner: address, master: address): AutoDeployAddress {
    return {
        stateInit: { code: build("UranusMemeWalletV3"), data: xTokenData(0, owner, master) },
        toShard: { fixedPrefixLength: 8, closeTo: owner },
    };
}

get fun `test X1000 trade sends an actual transfer through source built jetton wallets`() {
    val (target, owner, recipient) = xSetup(xData());
    val master = testing.treasury("x1000-trade-master");
    val source = xTokenDeployment(target, master.address);
    val wallet = source.calculateAddress();
    testing.setShardAccount(wallet, null);
    val credit = beginCell()
        .storeUint(0x178d4519, 32)
        .storeUint(0, 64)
        .storeCoins(1000)
        .storeAddress(owner.address)
        .storeUint(0, 2)
        .storeCoins(0)
        .storeBool(false)
        .endCell();
    xExit(
        testing.processSingleTraceStep(
            master.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: source, body: credit }),
        ),
        0,
    );
    val instruction = beginCell()
        .storeCoins(0)
        .storeCoins(17)
        .storeRef(beginCell().storeAddress(owner.address).storeAddress(wallet).endCell())
        .storeRef(
            beginCell().storeAddress(recipient.address).storeAddress(recipient.address).endCell(),
        )
        .endCell();
    val leg = beginCell()
        .storeUint(1, 4)
        .storeUint(1, 4)
        .storeUint(0, 4)
        .storeDict(instruction)
        .endCell();
    val program = beginCell()
        .storeUint(1, 4)
        .storeUint(0, 4)
        .storeUint(1, 4)
        .storeBool(false)
        .storeBool(false)
        .storeDict(leg)
        .endCell();
    val prepared = net.sendExternal(
        net.createExternalMessage(
            target,
            xSigned(
                recipient.address,
                5,
                xPrivate,
                0,
                3,
                ton("0.1"),
                program,
            ),
        ),
    );
    assert (prepared != null) throw 567;
    xExit(prepared.at(0), 0);
    val notification = beginCell()
        .storeUint(0x7362d09c, 32)
        .storeUint(123, 64)
        .storeCoins(77)
        .endCell();
    val trade = net.send(
        owner.address,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: target, body: notification }),
    );
    xExit(trade.at(0), 0);
    expect(net.runGetMethod<(int, address, address, cell)>(wallet, 97026, []).0).toEqual(923);
    val peer = xTokenDeployment(recipient.address, master.address).calculateAddress();
    expect(net.runGetMethod<(int, address, address, cell)>(peer, 97026, []).0).toEqual(77);
    expect(net.runGetMethod<int>(target, 97376, [124])).toEqual(1);
}
