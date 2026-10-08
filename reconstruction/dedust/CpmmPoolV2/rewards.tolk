// Recovered shared PoolV1/PoolV2 reward logic. This module is not a complete Pool.
struct PoolReward {
    remainingTime: uint40
    remainingBudget: coins
    checkpoint: varuint32
    lastUpdate: uint40
}

// Preserve the original EQINT instead of folding equality into IFNOT.
fun isZero(value: int): bool
    asm "0 EQINT"

@inline_ref
fun accruePoolReward(reward: PoolReward, liquidity: coins): PoolReward {
    if (blockchain.now() <= reward.lastUpdate) {
        return reward;
    }
    if (isZero(liquidity)) {
        reward.lastUpdate = blockchain.now();
        return reward;
    }
    val elapsed = min(blockchain.now() - reward.lastUpdate, reward.remainingTime);
    val distributed = reward.remainingTime > 0
        ? min(mulDivFloor(elapsed, reward.remainingBudget, reward.remainingTime), reward.remainingBudget)
        : 0;
    reward.remainingTime -= elapsed;
    reward.remainingBudget -= distributed;
    reward.checkpoint += mulDivFloor(distributed, 1 << 120, liquidity);
    reward.lastUpdate = blockchain.now();
    return reward;
}

@inline_ref
fun synchronizePoolRewards(rewards: map<uint2, PoolReward>, liquidity: coins): map<uint2, PoolReward> {
    var updated = rewards;
    var entry = updated.findFirst();
    while (entry.isFound) {
        val key = entry.getKey();
        val reward = accruePoolReward(entry.loadValue(), liquidity);
        updated.set(key, reward);
        entry = updated.iterateNext(entry);
    }
    return updated;
}
