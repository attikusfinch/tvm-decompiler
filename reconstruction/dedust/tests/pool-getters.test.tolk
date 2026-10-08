import "@acton/emulation/testing"
import "@acton/testing/expect"
import "../CpmmPoolV2/getters"
import "../CpmmPoolV2/storage"

fun poolGetterState(status: int, liquidity: int, feeIn: int = 0, badConfig: bool = false, tail: bool = false): cell {
    val owner = testing.treasury("pool-getter-owner").address;
    val assetY = testing.treasury("pool-getter-asset").address;
    var config = beginCell().storeUint(0, 2).storeSlice(assetY as slice).storeSlice(owner as slice)
        .storeUint(30, 16).storeUint(5, 16).storeBool(false).storeBool(false).storeUint(feeIn, 2)
        .storeDict(null).storeDict(null);
    if (badConfig) { config.storeBool(true); }
    val fees = beginCell().storeCoins(11).storeCoins(13).storeCoins(17).storeCoins(19)
        .storeUint(1, 5).storeUint(23, 8).storeUint(1, 5).storeUint(29, 8).endCell();
    val extra = beginCell().storeSlice(owner as slice).storeDict(null).storeDict(null).storeDict(null).endCell();
    var b = beginCell().storeRef(config.endCell()).storeRef(fees).storeRef(extra).storeDict(null).storeUint(status, 2);
    if (status == 1) { b.storeSlice(owner as slice); }
    b.storeBool(true).storeBool(false).storeCoins(liquidity).storeCoins(10003).storeCoins(20009);
    if (tail) { b.storeUint(0xab, 8); }
    return b.endCell();
}

fun poolDataForTest(data: cell): PoolData {
    val previous = contract.getData();
    contract.setData(data);
    val result = get_pool_data();
    contract.setData(previous);
    return result;
}

fun poolEstimateForTest(data: cell, amount: int): (int, int) {
    val previous = contract.getData();
    contract.setData(data);
    val result = estimateWithdrawal(amount);
    contract.setData(previous);
    return result;
}

fun poolGetterExitForTest(data: cell): int {
    val previous = contract.getData();
    contract.setData(data);
    var exit = 0;
    try { get_pool_data(); } catch (e) { exit = e; }
    contract.setData(previous);
    return exit;
}

get fun `test pool getter returns typed maps flags reserves fees and checkpoints`() {
    val data = poolDataForTest(poolGetterState(2, 1000));
    expect(data.status).toEqual(2);
    expect(data.depositActive).toEqual(true);
    expect(data.swapActive).toEqual(false);
    expect(data.assetX as slice).toEqual(beginCell().storeUint(0, 2).endCell().beginParse());
    expect(data.baseFee).toEqual(30);
    expect(data.reserveX).toEqual(10003);
    expect(data.reserveY).toEqual(20009);
    expect(data.liquidity).toEqual(1000);
    expect(data.protocolX).toEqual(11);
    expect(data.protocolY).toEqual(13);
    expect(data.creatorX).toEqual(17);
    expect(data.creatorY).toEqual(19);
    expect(data.xCheckpoint).toEqual(23);
    expect(data.yCheckpoint).toEqual(29);
    expect(data.walletsByAssets.isEmpty()).toEqual(true);
    expect(data.assetsByWallets.isEmpty()).toEqual(true);
    expect(data.resolutions.isEmpty()).toEqual(true);
    expect(data.rewards.isEmpty()).toEqual(true);
}

get fun `test pool withdrawal estimate floors signed amounts and handles no liquidity`() {
    val data = poolGetterState(2, 1000);
    val positive = poolEstimateForTest(data, 37);
    expect(positive.0).toEqual(370);
    expect(positive.1).toEqual(740);
    val negative = poolEstimateForTest(data, -1);
    expect(negative.0).toEqual(-11);
    expect(negative.1).toEqual(-21);
    val empty = poolEstimateForTest(poolGetterState(2, 0), 37);
    expect(empty.0).toEqual(0);
    expect(empty.1).toEqual(0);
}

get fun `test pool getter decodes every lifecycle and fee selector`() {
    var status = 0;
    repeat (3) {
        var feeIn = 0;
        repeat (3) {
            expect(poolDataForTest(poolGetterState(status, 1000, feeIn)).status).toEqual(status);
            feeIn += 1;
        }
        status += 1;
    }
}

get fun `test pool getter allows root suffix but rejects invalid tagged and nested data`() {
    expect(poolDataForTest(poolGetterState(2, 1000, 0, false, true)).liquidity).toEqual(1000);
    expect(poolGetterExitForTest(poolGetterState(3, 1000))).toEqual(63);
    expect(poolGetterExitForTest(poolGetterState(2, 1000, 3))).toEqual(63);
    expect(poolGetterExitForTest(poolGetterState(2, 1000, 0, true))).toEqual(9);
    expect(poolGetterExitForTest(createEmptyCell())).toEqual(9);
}
