import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@acton/types/message"
import "../CpmmDeposit/types"

// Both the frozen mainnet oracle and the candidate are exercised in every test.
fun codeFor(oracle: bool): cell {
    return oracle ? build("oracle", "oracles/CpmmDeposit.boc") : build("CpmmDeposit");
}

fun setup(oracle: bool, balanceX: coins = 0, balanceY: coins = 0): (address, Treasury, Treasury, DepositStorage) {
    testing.setNow(1700000000);
    val pool = testing.treasury("deposit-pool");
    val initiator = testing.treasury("deposit-initiator");
    val payout = ExtendedPayoutConfig {
        recipient: initiator.address as any_address,
        notifyExtraGas: 0,
        payload: null,
        forwardAll: false,
        refundRecipient: initiator.address as any_address,
        refundNotifyExtraGas: 0,
        refundPayload: null,
        refundForwardAll: false,
        excesses: initiator.address as any_address,
    };
    val config = DepositConfig { targetX: 1000, targetY: 2000, minLiquidity: 100,
        lockedShare: 2500, payoutConfig: payout.toCell() };
    val storage = DepositStorage { config: config.toCell(), pool: pool.address as any_address,
        initiator: initiator.address as any_address, balanceX, balanceY };
    val stateInit: ContractState = { code: codeFor(oracle), data: storage.toCell() };
    val dest: AutoDeployAddress = { stateInit };
    val address = dest.calculateAddress();
    testing.setShardAccount(address, null);
    val result = testing.processSingleTraceStep(pool.address, createMessage({
        bounce: BounceMode.NoBounce, value: ton("1"), dest, body: createEmptyCell(),
    }).bounced());
    expect(result.outMessages.size()).toEqual(0);
    return (address, pool, initiator, storage);
}

fun assertExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

get fun `test recovered Deposit code cell equals mainnet`() {
    expect(codeFor(false).hash()).toEqual(codeFor(true).hash());
}

get fun `test deposit getter returns amounts and payout addresses`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, initiator, _) = setup(oracle, 7, 11);
        val result = net.runGetMethod<(any_address, any_address, any_address, int, int, int, int, int, int)>(dest, "get_deposit_data");
        expect(result.0 as slice).toEqual(pool.address as slice);
        expect(result.1 as slice).toEqual(initiator.address as slice);
        expect(result.2 as slice).toEqual(initiator.address as slice);
        expect(result.3).toEqual(1000);
        expect(result.4).toEqual(2000);
        expect(result.5).toEqual(2500);
        expect(result.6).toEqual(100);
        expect(result.7).toEqual(7);
        expect(result.8).toEqual(11);
        oracle = true;
    }
}

get fun `test credit updates one asset and returns excesses`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, initiator, _) = setup(oracle, 7, 11);
        val result = testing.processSingleTraceStep(pool.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: CreditAsset { queryId: 9, isX: true, amount: 13 },
        }));
        assertExit(result, 0);
        expect(result.outMessages.size()).toEqual(1);
        val excesses = result.outMessages.at<Excesses>(0);
        expect(excesses.info.dest as slice).toEqual(initiator.address as slice);
        expect(excesses.loadBody().queryId).toEqual(9);
        val data = net.runGetMethod<(any_address, any_address, any_address, int, int, int, int, int, int)>(dest, "get_deposit_data");
        expect(data.7).toEqual(20);
        expect(data.8).toEqual(11);
        oracle = true;
    }
}

get fun `test both targets trigger join liquidity`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, _, storage) = setup(oracle, 900, 2000);
        val result = testing.processSingleTraceStep(pool.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: CreditAsset { queryId: 19, isX: true, amount: 100 },
        }));
        assertExit(result, 0);
        val body = result.outMessages.at<JoinLiquidity>(0).loadBody();
        expect(body.queryId).toEqual(19);
        expect(body.balanceX).toEqual(1000);
        expect(body.balanceY).toEqual(2000);
        expect(body.config.hash()).toEqual(storage.config.hash());
        expect(body.initiator as slice).toEqual(storage.initiator as slice);
        oracle = true;
    }
}

get fun `test only pool can credit and only initiator can cancel`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, initiator, _) = setup(oracle, 7, 11);
        val wrongCredit = testing.processSingleTraceStep(initiator.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: CreditAsset { queryId: 9, isX: false, amount: 13 },
        }));
        assertExit(wrongCredit, 23);
        val wrongCancel = testing.processSingleTraceStep(pool.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: CancelDeposit { queryId: 9 },
        }));
        assertExit(wrongCancel, 23);
        oracle = true;
    }
}

get fun `test cancel checks attached value and refunds both assets`() {
    var oracle = false;
    repeat (2) {
        val (dest, _, initiator, _) = setup(oracle, 7, 11);
        val lowValue = testing.processSingleTraceStep(initiator.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.05"), dest,
            body: CancelDeposit { queryId: 9 },
        }));
        assertExit(lowValue, 25);
        val result = testing.processSingleTraceStep(initiator.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.3"), dest,
            body: CancelDeposit { queryId: 9 },
        }));
        assertExit(result, 0);
        val body = result.outMessages.at<RefundDeposit>(0).loadBody();
        expect(body.queryId).toEqual(9);
        expect(body.balanceX).toEqual(7);
        expect(body.balanceY).toEqual(11);
        oracle = true;
    }
}

get fun `test malformed and unknown deposit bodies are rejected`() {
    var oracle = false;
    repeat (2) {
        val (dest, pool, _, _) = setup(oracle);
        val unknown = testing.processSingleTraceStep(pool.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: beginCell().storeUint(0x12345678, 32).endCell(),
        }));
        assertExit(unknown, 65535);
        val truncated = testing.processSingleTraceStep(pool.address, createMessage({
            bounce: BounceMode.NoBounce, value: ton("0.2"), dest,
            body: beginCell().storeUint(0xdc5ddba1, 32).endCell(),
        }));
        assertExit(truncated, 9);
        oracle = true;
    }
}
