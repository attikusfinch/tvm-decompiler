import "@acton/emulation/testing"
import "@acton/testing/expect"
import "../contracts/pool-v2/rewards"

const NOW = 1700000000
const Q120 = 1 << 120

fun assertReward(actual: PoolReward, time: int, budget: int, checkpoint: int, last: int) {
    expect(actual.remainingTime).toEqual(time);
    expect(actual.remainingBudget).toEqual(budget);
    expect(actual.checkpoint).toEqual(checkpoint);
    expect(actual.lastUpdate).toEqual(last);
}

fun initialReward(): PoolReward {
    return {
        remainingTime: 1000,
        remainingBudget: 100000,
        checkpoint: 2 * Q120,
        lastUpdate: NOW - 250,
    };
}

get fun `test pool reward accrues elapsed budget and Q120 checkpoint`() {
    testing.setNow(NOW);
    assertReward(accruePoolReward(initialReward(), 1000), 750, 75000, 27 * Q120, NOW);
    val fractional: PoolReward = {
        remainingTime: 17,
        remainingBudget: 101,
        checkpoint: 1,
        lastUpdate: NOW - 3,
    };
    assertReward(accruePoolReward(fractional, 13), 14, 84, 1 + mulDivFloor(17, Q120, 13), NOW);
}

get fun `test pool reward pauses budget and duration without liquidity`() {
    testing.setNow(NOW);
    val paused = accruePoolReward(initialReward(), 0);
    assertReward(paused, 1000, 100000, 2 * Q120, NOW);
    testing.setNow(NOW + 10);
    assertReward(accruePoolReward(paused, 1000), 990, 99000, 3 * Q120, NOW + 10);
}

get fun `test pool reward preserves future checkpoints and caps elapsed duration`() {
    testing.setNow(NOW - 300);
    assertReward(accruePoolReward(initialReward(), 1000), 1000, 100000, 2 * Q120, NOW - 250);
    testing.setNow(NOW - 250);
    assertReward(accruePoolReward(initialReward(), 0), 1000, 100000, 2 * Q120, NOW - 250);
    testing.setNow(NOW + 2000);
    assertReward(accruePoolReward(initialReward(), 1000), 0, 0, 102 * Q120, NOW + 2000);
}

get fun `test pool reward dictionary updates every occupied slot`() {
    testing.setNow(NOW);
    var rewards: map<uint2, PoolReward> = [];
    rewards.set(0, initialReward());
    rewards.set(
        3,
        {
            remainingTime: 17,
            remainingBudget: 101,
            checkpoint: 1,
            lastUpdate: NOW - 3,
        },
    );
    val updated = synchronizePoolRewards(rewards, 1000);
    assertReward(updated.mustGet(0), 750, 75000, 27 * Q120, NOW);
    assertReward(updated.mustGet(3), 14, 84, 1 + mulDivFloor(17, Q120, 1000), NOW);
    expect(updated.get(1).isFound).toEqual(false);
    expect(updated.get(2).isFound).toEqual(false);
    val empty: map<uint2, PoolReward> = [];
    expect(synchronizePoolRewards(empty, 1).isEmpty()).toEqual(true);
}

get fun `test pool reward serialization rejects checkpoint overflow`() {
    testing.setNow(NOW);
    var rewards: map<uint2, PoolReward> = [];
    rewards.set(
        2,
        {
            remainingTime: 1,
            remainingBudget: 1,
            checkpoint: (1 << 248) - 1,
            lastUpdate: NOW - 1,
        },
    );
    var exit = 0;
    try {
        synchronizePoolRewards(rewards, 1);
    } catch (e) {
        exit = e;
    }
    expect(exit).toEqual(5);
}
