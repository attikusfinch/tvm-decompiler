import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"

fun assertBlankExit(result: SendResult) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(0);
}

get fun `test source-built ClassicBlank code equals mainnet`() {
    expect(build("ClassicBlank").hash()).toEqual(
        build("blank-oracle", "../oracles/ClassicBlank.boc").hash(),
    );
}

get fun `test ClassicBlank immediately executes the installed seven-argument constructor`() {
    val owner = testing.treasury("blank-owner");
    val parameters = beginCell().storeUint(0xcafe, 16).endCell();
    val template = beginCell().storeUint(0xaabb, 16).endCell();
    val suffix = beginCell().storeUint(7, 3).endCell();
    val installed = build("install-fixture", "build/fixtures/classic-install.boc");
    val initial = beginCell()
        .storeSlice(owner.address as slice)
        .storeUint(17, 8)
        .storeSlice(template.beginParse())
        .endCell();
    val deployment: AutoDeployAddress = {
        stateInit: { code: build("ClassicBlank"), data: initial },
    };
    val destination = deployment.calculateAddress();
    testing.setShardAccount(destination, null);
    val body = beginCell()
        .storeUint(2604311546, 32)
        .storeUint(123, 64)
        .storeRef(parameters)
        .storeUint(9, 16)
        .storeRef(installed)
        .storeSlice(suffix.beginParse())
        .endCell();
    assertBlankExit(
        testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: deployment, body: body.beginParse() }),
        ),
    );
    val data = net.runGetMethod<cell>(destination, 90046, []);
    val expected = beginCell()
        .storeSlice(owner.address as slice)
        .storeUint(17, 8)
        .storeUint(9, 16)
        .storeUint(installed.hash(), 256)
        .storeRef(template)
        .storeRef(parameters)
        .storeRef(suffix)
        .endCell();
    expect(data.hash()).toEqual(expected.hash());
}

get fun `test ClassicBlank constructor failure refunds balance and deletes the account`() {
    val owner = testing.treasury("blank-reject-owner");
    val installed = build("install-fixture", "build/fixtures/classic-install.boc");
    val initial = beginCell().storeSlice(owner.address as slice).storeUint(17, 8).endCell();
    val deployment: AutoDeployAddress = {
        stateInit: { code: build("ClassicBlank"), data: initial },
    };
    val destination = deployment.calculateAddress();
    testing.setShardAccount(destination, null);
    val body = beginCell()
        .storeUint(2604311546, 32)
        .storeUint(123, 64)
        .storeRef(createEmptyCell())
        .storeUint(13, 16)
        .storeRef(installed)
        .endCell();
    assertBlankExit(
        testing.processSingleTraceStep(
            owner.address,
            createMessage({ bounce: BounceMode.NoBounce, value: ton("1"), dest: deployment, body: body.beginParse() }),
        ),
    );
    expect(testing.getAccountBalance(destination)).toEqual(0);
}
