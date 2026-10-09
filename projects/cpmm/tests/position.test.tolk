import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"
import "../contracts/position/types"

const FEE_SCALE = 1 << 120

type PositionGetter = (
    any_address,
    any_address,
    int,
    int,
    dict,
    int,
    int,
    int,
    int,
)

fun positionCode(oracle: bool): cell {
    return oracle ? build("oracle", "../oracles/CpmmPosition.boc") : build("CpmmPosition");
}

fun assertPositionExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

fun setupPosition(oracle: bool): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val pool = testing.treasury("position-pool");
    val owner = testing.treasury("position-owner");
    var rewards: map<uint2, PositionReward> = [];
    rewards.set(
        1,
        PositionReward {
            pending: 19,
            checkpoint: FEE_SCALE,
        },
    );
    val fees = PositionFees {
        xCheckpoint: FEE_SCALE,
        xPending: 7,
        xReserved: 11,
        yCheckpoint: 2 * FEE_SCALE,
        yPending: 13,
        yReserved: 17,
    };
    val storage = PositionStorage {
        pool: pool.address as any_address,
        owner: owner.address as any_address,
        liquidity: 1000,
        lockedLiquidity: 200,
        fees: fees.toCell(),
        rewards,
    };
    val stateInit: ContractState = { code: positionCode(oracle), data: storage.toCell() };
    val destination: AutoDeployAddress = { stateInit };
    val address = destination.calculateAddress();
    testing.setShardAccount(address, null);
    assertPositionExit(
        testing.processSingleTraceStep(
            pool.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("1"),
                dest: destination,
                body: ProvidePositionState {
                    queryId: 0,
                    includePool: false,
                    includeOwner: false,
                    includeFees: false,
                    includeRewards: false,
                },
            }),
        ),
        0,
    );
    return (address, pool, owner);
}

fun positionPoolRewards(): map<uint2, PoolReward> {
    var rewards: map<uint2, PoolReward> = [];
    rewards.set(
        1,
        PoolReward {
            remainingTime: 100,
            remainingBudget: 1000000,
            checkpoint: 3 * FEE_SCALE,
            lastUpdate: 200,
        },
    );
    rewards.set(
        3,
        PoolReward {
            remainingTime: 100,
            remainingBudget: 1000000,
            checkpoint: 2 * FEE_SCALE,
            lastUpdate: 200,
        },
    );
    return rewards;
}

get fun `test recovered Position code equals mainnet`() {
    expect(positionCode(false).hash()).toEqual(positionCode(true).hash());
}

get fun `test position getter and fixed point fees`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        expect(data.0 as slice).toEqual(pool.address as slice);
        expect(data.1 as slice).toEqual(owner.address as slice);
        expect(data.2).toEqual(1000);
        expect(data.3).toEqual(200);
        expect(data.5).toEqual(7);
        expect(data.6).toEqual(13);
        val fees = net.runGetMethod<(int, int)>(
            dest,
            "get_available_fees",
            [3 * FEE_SCALE, 5 * FEE_SCALE],
        );
        expect(fees.0).toEqual(2007);
        expect(fees.1).toEqual(3013);
        oracle = true;
    }
}

get fun `test position credit synchronizes rewards before adding liquidity`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val result = testing.processSingleTraceStep(
            pool.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.3"),
                dest,
                body: CreditLiquidity {
                    queryId: 9,
                    liquidity: 400,
                    lockedShare: 2500,
                    notifyGas: ton("0.01"),
                    payload: null,
                    receiver: pool.address as any_address,
                    xCheckpoint: 3 * FEE_SCALE,
                    yCheckpoint: 5 * FEE_SCALE,
                    rewards: positionPoolRewards(),
                },
            }),
        );
        assertPositionExit(result, 0);
        expect(result.outMessages.size()).toEqual(2);
        val notification = result.outMessages.at<DepositNotification>(0).loadBody();
        expect(notification.liquidity).toEqual(400);
        expect(notification.lockedLiquidity).toEqual(100);
        expect(result.outMessages.at<Excesses>(1).info.dest as slice).toEqual(
            owner.address as slice,
        );
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        expect(data.2).toEqual(1400);
        expect(data.3).toEqual(300);
        expect(data.5).toEqual(2007);
        expect(data.6).toEqual(3013);
        val rewards = createMapFromLowLevelDict<uint2, PositionReward>(data.4);
        expect(rewards.mustGet(1).pending).toEqual(2019);
        expect(rewards.mustGet(3).pending).toEqual(2000);
        oracle = true;
    }
}

get fun `test position fee claim clears pending and retains checkpoints`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val result = testing.processSingleTraceStep(
            pool.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.3"),
                dest,
                body: ClaimAvailableFees {
                    queryId: 9,
                    payout: owner.address as any_address,
                    xCheckpoint: 5 * FEE_SCALE,
                    yCheckpoint: 6 * FEE_SCALE,
                },
            }),
        );
        assertPositionExit(result, 0);
        val msg = (result
            .outMessages
            .atCell(0) as Cell<TlbMessageRelaxed<RemainingBitsAndRefs>>).load();
        expect(msg.info.bounce).toBeTrue();
        var body = msg.loadBody() as slice;
        expect(body.loadUint(32)).toEqual(0x29ff1bcf);
        expect(body.loadUint(64)).toEqual(9);
        expect(body.loadCoins()).toEqual(4007);
        expect(body.loadCoins()).toEqual(4013);
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        expect(data.5).toEqual(0);
        expect(data.6).toEqual(0);
        expect(data.7).toEqual(5 * FEE_SCALE);
        oracle = true;
    }
}

get fun `test position withdrawal enforces unlocked liquidity and commits excess on failure`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val message = createMessage({
            bounce: BounceMode.NoBounce,
            value: ton("0.3"),
            dest,
            body: WithdrawLiquidity {
                queryId: 9,
                liquidity: 801,
                minX: 2,
                minY: 3,
                xCheckpoint: 3 * FEE_SCALE,
                yCheckpoint: 5 * FEE_SCALE,
                rewards: positionPoolRewards(),
                claimFees: true,
                config: createEmptyCell(),
            },
        });
        assertPositionExit(testing.processSingleTraceStep(owner.address, message), 23);
        val result = testing.processSingleTraceStep(pool.address, message);
        assertPositionExit(result, 36);
        expect(result.outMessages.size()).toEqual(1);
        expect(result.outMessages.at<Excesses>(0).loadBody().queryId).toEqual(9);
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        expect(data.2).toEqual(1000);
        expect(data.5).toEqual(7);
        oracle = true;
    }
}

get fun `test position reward claim returns accrued amount and clears only that reward`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val result = testing.processSingleTraceStep(
            pool.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.3"),
                dest,
                body: ClaimPositionReward {
                    queryId: 9,
                    rewardId: 1,
                    remainingTime: 100,
                    remainingBudget: 1000000,
                    checkpoint: 3 * FEE_SCALE,
                    lastUpdate: 200,
                    payout: owner.address as any_address,
                },
            }),
        );
        assertPositionExit(result, 0);
        val msg = (result
            .outMessages
            .atCell(0) as Cell<TlbMessageRelaxed<RemainingBitsAndRefs>>).load();
        var body = msg.loadBody() as slice;
        expect(body.loadUint(32)).toEqual(0x9e17fbbe);
        expect(body.loadUint(64)).toEqual(9);
        expect(body.loadCoins()).toEqual(2019);
        expect(body.loadUint(2)).toEqual(1);
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        val rewards = createMapFromLowLevelDict<uint2, PositionReward>(data.4);
        expect(rewards.mustGet(1).pending).toEqual(0);
        expect(rewards.mustGet(1).checkpoint).toEqual(3 * FEE_SCALE);
        expect(data.5).toEqual(7);
        oracle = true;
    }
}

get fun `test position bounce restores withdrawn liquidity and fee amounts`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, _) = setupPosition(oracle);
        val body = beginCell()
            .storeUint(0xffffffff, 32)
            .storeUint(0xf6f6a3aa, 32)
            .storeUint(9, 64)
            .storeCoins(300)
            .storeCoins(2007)
            .storeCoins(3013)
            .endCell();
        val result = testing.processSingleTraceStep(
            pool.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.3"),
                dest,
                body,
            }).bounced(),
        );
        assertPositionExit(result, 0);
        val data = net.runGetMethod<PositionGetter>(dest, "get_position_data");
        expect(data.2).toEqual(1300);
        expect(data.3).toEqual(200);
        expect(data.5).toEqual(2014);
        expect(data.6).toEqual(3026);
        oracle = true;
    }
}

get fun `test position state response is public and includes requested fields`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, owner) = setupPosition(oracle);
        val result = testing.processSingleTraceStep(
            owner.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.3"),
                dest,
                body: ProvidePositionState {
                    queryId: 9,
                    includePool: true,
                    includeOwner: true,
                    includeFees: true,
                    includeRewards: true,
                },
            }),
        );
        assertPositionExit(result, 0);
        val state = result.outMessages.at<PositionState>(0).loadBody();
        expect(state.pool! as slice).toEqual(pool.address as slice);
        expect(state.owner! as slice).toEqual(owner.address as slice);
        expect(state.liquidity).toEqual(1000);
        expect(state.rewards!.rewards.mustGet(1).pending).toEqual(19);
        oracle = true;
    }
}
