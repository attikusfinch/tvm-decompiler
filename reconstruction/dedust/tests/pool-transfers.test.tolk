import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/out_actions"
import "../CpmmPoolV2/transfers"
import "../CpmmPoolV2/wallets"
import "../CpmmPoolV2/rewards"
import "../CpmmPoolV1/transfers-v1"

get fun `test pool excesses preserves query recipient and adds ignore errors mode`() {
    val recipient = testing.treasury("transfer-excesses").address as any_address;
    sendPoolExcesses(recipient, 9, 128);
    val actions = testing.outActions();
    expect(actions.size()).toEqual(1);
    val action = actions.getSendMessageAt(0)!;
    expect(action.mode).toEqual(130);
    val expected = beginCell().storeUint(0x10, 6).storeSlice(recipient as slice)
        .storeUint(0xd53276db, 143).storeUint(9, 64).endCell();
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool resolver requests preserve owner query and send mode in both revisions`() {
    val resolver = testing.treasury("transfer-resolver").address as any_address;
    requestPoolWalletAddress(resolver, 9);
    requestPoolWalletAddressV1(resolver, 9);
    val actions = testing.outActions();
    expect(actions.size()).toEqual(2);
    var index = 0;
    repeat (2) {
        val action = actions.getSendMessageAt(index)!;
        expect(action.mode).toEqual(1);
        var s = action.outMsg.beginParse();
        expect(s.loadUint(6)).toEqual(0x10);
        expect(s.loadAddress() as slice).toEqual(resolver as slice);
        expect(s.loadCoins()).toBeGreater(0);
        expect(s.loadUint(107)).toEqual(0);
        expect(s.loadUint(32)).toEqual(0x2c76b973);
        expect(s.loadUint(64)).toEqual(9);
        expect(s.loadAddress() as slice).toEqual(contract.getAddress() as slice);
        expect(s.loadBool()).toEqual(false);
        s.assertEnd();
        index += 1;
    }
}

get fun `test pool payout wallet uses asset lookup and rejects missing or nonbasechain keys`() {
    val asset = testing.treasury("transfer-asset").address as any_address;
    val wallet = testing.treasury("transfer-wallet").address as any_address;
    val (_, key) = asset.getWorkchainAndHash();
    var lookup: AddressLookup = [];
    lookup.set(key, wallet);
    val wallets: PoolWallets = { walletsByAssets: lookup, assetsByWallets: [], resolutions: [] };
    expect(poolWalletForAsset(wallets, asset) as slice).toEqual(wallet as slice);
    expect(poolWalletForAsset(wallets, poolNoneAddress()) as slice).toEqual(poolNoneAddress() as slice);
    var exit = 0;
    try { poolWalletForAsset({ walletsByAssets: [], assetsByWallets: [], resolutions: [] }, asset); }
    catch (e) { exit = e; }
    expect(exit).toEqual(40);
    exit = 0;
    try { poolWalletForAsset(wallets, address.fromWorkchainAndHash(-1, 123) as any_address); }
    catch (e) { exit = e; }
    expect(exit).toEqual(32);
}

get fun `test pool reward lookup returns independent zero record and strict stored fields`() {
    var rewards: map<uint2, PoolReward> = [];
    val absent = poolRewardOrEmpty(rewards, 2);
    expect(absent.remainingTime).toEqual(0);
    expect(absent.remainingBudget).toEqual(0);
    expect(absent.checkpoint).toEqual(0);
    expect(absent.lastUpdate).toEqual(0);
    rewards.set(3, { remainingTime: 1000, remainingBudget: (1 << 120) - 1,
        checkpoint: (1 << 248) - 1, lastUpdate: 1700000000 });
    val reward = poolRewardOrEmpty(rewards, 3);
    expect(reward.remainingTime).toEqual(1000);
    expect(reward.remainingBudget).toEqual((1 << 120) - 1);
    expect(reward.checkpoint).toEqual((1 << 248) - 1);
    expect(reward.lastUpdate).toEqual(1700000000);
}
