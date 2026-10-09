import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"

fun lpExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

fun lpData(owner: address, pool: address): cell {
    return beginCell()
        .storeCoins(0)
        .storeSlice(owner as slice)
        .storeSlice(pool as slice)
        .storeRef(build("ClassicLpWallet"))
        .endCell();
}

fun lpCredit(amount: coins, senderOwner: address): cell {
    return beginCell()
        .storeUint(0x178d4519, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeSlice(senderOwner as slice)
        .storeUint(0, 2)
        .storeCoins(0)
        .storeUint(0, 1)
        .endCell();
}

fun lpSetup(): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val owner = testing.treasury("lp-owner");
    val pool = testing.treasury("lp-pool");
    val deployment: AutoDeployAddress = {
        stateInit: { code: build("ClassicLpWallet"), data: lpData(owner.address, pool.address) },
    };
    val target = deployment.calculateAddress();
    testing.setShardAccount(target, null);
    lpExit(
        testing.processSingleTraceStep(
            pool.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: deployment, body: lpCredit(
                    1000,
                    owner.address,
                ) }),
        ),
        0,
    );
    return (target, owner, pool);
}

fun lpBalance(target: address): int {
    return net.runGetMethod<(int, any_address, any_address, cell)>(target, 97026, []).0;
}

fun lpTransfer(recipient: address, amount: coins): cell {
    return beginCell()
        .storeUint(0xf8a7ea5, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeSlice(recipient as slice)
        .storeUint(0, 2)
        .storeUint(0, 1)
        .storeCoins(0)
        .storeUint(0, 1)
        .endCell();
}

struct (0x7bdd97de) LpBurnNotice {
    queryId: uint64
    amount: coins
    owner: address
    response: address
}

get fun `test source-built ClassicLpWallet equals mainnet`() {
    expect(build("ClassicLpWallet").hash()).toEqual(
        build("lp-oracle", "../oracles/ClassicLpWallet.boc").hash(),
    );
}

get fun `test LP transfer deploys recipient wallet and conserves token balances`() {
    val (target, owner, pool) = lpSetup();
    val recipient = testing.treasury("lp-recipient");
    val result = testing.processSingleTraceStep(
        owner.address,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body: lpTransfer(
                recipient.address,
                700,
            ) }),
    );
    lpExit(result, 0);
    expect(lpBalance(target)).toEqual(300);
    val message = (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
    val next: AutoDeployAddress = {
        stateInit: {
            code: build("ClassicLpWallet"),
            data: lpData(recipient.address, pool.address),
        },
    };
    expect(message.info.dest as slice).toEqual(next.calculateAddress() as slice);
    expect(message.loadOpcode()).toEqual(0x178d4519);
    // Deliver the actual outgoing wire body and amount from the canonical wallet.
    var wireBody = message.body;
    if (wireBody.loadBool()) {
        wireBody = wireBody.loadRef().beginParse();
    }
    expect(beginCell().storeSlice(wireBody).endCell().hash()).toEqual(
        lpCredit(700, owner.address).hash(),
    );
    testing.setShardAccount(next.calculateAddress(), null);
    lpExit(
        testing.processSingleTraceStep(
            target,
            createMessage({ bounce: BounceMode.NoBounce, value: message
                    .info
                    .value
                    .grams, dest: next, body: wireBody }),
        ),
        0,
    );
    expect(lpBalance(next.calculateAddress())).toEqual(700);
    expect(lpBalance(target) + lpBalance(next.calculateAddress())).toEqual(1000);
}

get fun `test LP transfer enforces owner amount and strict attached TON budget`() {
    val (target, owner, pool) = lpSetup();
    val stranger = testing.treasury("lp-stranger");
    val body = lpTransfer(stranger.address, 700);
    lpExit(
        testing.processSingleTraceStep(
            pool.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body }),
        ),
        705,
    );
    lpExit(
        testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body: lpTransfer(
                    stranger.address,
                    1001,
                ) }),
        ),
        706,
    );
    lpExit(
        testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.04"), dest: target, body }),
        ),
        709,
    );
    expect(lpBalance(target)).toEqual(1000);
}

get fun `test LP burn notifies pool and bounced burn restores balance`() {
    val (target, owner, pool) = lpSetup();
    val body = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(123, 64)
        .storeCoins(700)
        .storeSlice(owner.address as slice)
        .endCell();
    val result = testing.processSingleTraceStep(
        owner.address,
        createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: target, body }),
    );
    lpExit(result, 0);
    expect(lpBalance(target)).toEqual(300);
    val notice = result.outMessages.at<LpBurnNotice>(0).loadBody();
    expect(notice.queryId).toEqual(123);
    expect(notice.amount).toEqual(700);
    val bounced = beginCell()
        .storeUint(0, 32)
        .storeUint(0x7bdd97de, 32)
        .storeUint(123, 64)
        .storeCoins(700)
        .endCell();
    lpExit(
        testing.processSingleTraceStep(
            pool.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.1"), dest: target, body: bounced }).bounced(),
        ),
        0,
    );
    expect(lpBalance(target)).toEqual(1000);
}

get fun `test LP credit rejects unrelated sender and exposes complete wallet data`() {
    val (target, owner, pool) = lpSetup();
    val stranger = testing.treasury("lp-stranger");
    lpExit(
        testing.processSingleTraceStep(
            stranger.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("0.1"), dest: target, body: lpCredit(
                    700,
                    owner.address,
                ) }),
        ),
        707,
    );
    val data = net.runGetMethod<(int, any_address, any_address, cell)>(target, 97026, []);
    expect(data.0).toEqual(1000);
    expect(data.1 as slice).toEqual(owner.address as slice);
    expect(data.2 as slice).toEqual(pool.address as slice);
    expect(data.3.hash()).toEqual(build("ClassicLpWallet").hash());
}
