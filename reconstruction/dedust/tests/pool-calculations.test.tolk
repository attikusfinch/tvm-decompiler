import "@acton/emulation/testing"
import "@acton/testing/expect"
import "../CpmmPoolV2/math"
import "../CpmmPoolV2/payout-config"
import "../CpmmPoolV2/reward-config"
import "../CpmmPoolV2/storage"

fun calculationRewardConfig(rewards: map<uint2, PoolRewardConfig>): PoolConfig {
    val asset = testing.treasury("calculation-reward-asset").address as any_address;
    val owner = testing.treasury("calculation-owner").address as any_address;
    return {
        assetX: asset, assetY: asset, creator: owner, baseFee: 30, creatorFee: 5,
        depositActivation: null, swapActivation: null, feeIn: FeeFromBoth {},
        customResolvers: [], allowedRewards: rewards,
    };
}

get fun `test pool liquidity root preserves floor at perfect squares and maximum coin products`() {
    expect(poolLiquiditySqrt(-1)).toEqual(-1);
    expect(poolLiquiditySqrt(0)).toEqual(0);
    expect(poolLiquiditySqrt(1)).toEqual(1);
    expect(poolLiquiditySqrt(8)).toEqual(2);
    expect(poolLiquiditySqrt(9)).toEqual(3);
    expect(poolLiquiditySqrt(10)).toEqual(3);
    val coinMax = (1 << 120) - 1;
    expect(poolLiquiditySqrt(coinMax * coinMax)).toEqual(coinMax);
    expect(poolLiquiditySqrt(1 << 254)).toEqual(1 << 127);
    expect(poolLiquiditySqrt((1 << 254) - 1)).toEqual((1 << 127) - 1);
}

get fun `test pool payout substitutes only nonstandard destinations and retains options`() {
    val fallback = testing.treasury("calculation-fallback").address as any_address;
    val master = address.fromWorkchainAndHash(-1, 17) as any_address;
    val none = beginCell().storeUint(0, 2).endCell().beginParse() as any_address;
    val external = beginCell().storeUint(1, 2).storeUint(16, 9).storeUint(0xabcd, 16).endCell().beginParse() as any_address;
    val payload = beginCell().storeUint(0xabcdef, 24).endCell();
    val payout: PoolExtendedPayout = {
        fulfill: { destination: none, extraGas: 123, payload, wrapPayload: true },
        reject: { destination: master, extraGas: 456, payload: null, wrapPayload: false },
        excessesTo: external,
    };
    val result = normalizePoolPayout(payout, fallback);
    expect(result.fulfill.destination as slice).toEqual(fallback as slice);
    expect(result.reject.destination as slice).toEqual(master as slice);
    expect(result.excessesTo as slice).toEqual(fallback as slice);
    expect(result.fulfill.extraGas).toEqual(123);
    expect(result.fulfill.payload!.hash()).toEqual(payload.hash());
    expect(result.fulfill.wrapPayload).toEqual(true);
    expect(result.reject.extraGas).toEqual(456);
    expect(result.reject.payload == null).toEqual(true);
    expect(result.reject.wrapPayload).toEqual(false);
}

get fun `test pool allowed reward search returns first matching slot and duration`() {
    val asset = testing.treasury("calculation-reward-asset").address as any_address;
    val other = testing.treasury("calculation-other-asset").address as any_address;
    var rewards: map<uint2, PoolRewardConfig> = [];
    rewards.set(0, { asset: other, maxDuration: 999 });
    rewards.set(1, { asset, maxDuration: 100 });
    rewards.set(3, { asset, maxDuration: 900 });
    val (reward, slot) = findAllowedPoolReward(calculationRewardConfig(rewards), asset);
    expect(reward.asset as slice).toEqual(asset as slice);
    expect(reward.maxDuration).toEqual(100);
    expect(slot).toEqual(1);
}

get fun `test pool allowed reward search rejects missing and malformed records`() {
    val asset = testing.treasury("calculation-reward-asset").address as any_address;
    var exit = 0;
    try { findAllowedPoolReward(calculationRewardConfig([]), asset); } catch (e) { exit = e; }
    expect(exit).toEqual(42);
    var raw: map<uint2, RemainingBitsAndRefs> = [];
    raw.set(0, beginCell().endCell().beginParse());
    val invalid = createMapFromLowLevelDict<uint2, PoolRewardConfig>(raw.toLowLevelDict());
    exit = 0;
    try { findAllowedPoolReward(calculationRewardConfig(invalid), asset); } catch (e) { exit = e; }
    expect(exit).toEqual(9);
}
