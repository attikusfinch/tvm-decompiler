import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/out_actions"
import "@acton/types/message"
import "../CpmmPoolV2/events"

fun eventTestFields(): (any_address, any_address, cell) {
    return (testing.treasury("event-initiator").address as any_address,
        testing.treasury("event-recipient").address as any_address,
        beginCell().storeUint(0xabcdef, 24).endCell());
}

fun assertEventMessage(expectedBody: cell): void {
    val actions = testing.outActions();
    expect(actions.size()).toEqual(1);
    val action = actions.getSendMessageAt(0)!;
    expect(action.mode).toEqual(1);
    val expected = beginCell().storeUint(0xc, 4).storeUint(0, 2)
        .storeUint(1, 98).storeRef(expectedBody).endCell();
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool swap event sends exact external message and retains both references`() {
    val (initiator, recipient, state) = eventTestFields();
    val fees = beginCell().storeUint(0x1234, 16).endCell();
    val fee = emitPoolSwap({ xToY: true, amountIn: 11, amountOut: 13, initiator, recipient, nextState: state, fees });
    expect(fee).toBeGreater(0);
    val body = beginCell().storeUint(0x78e79ba4, 32).storeBool(true).storeCoins(11).storeCoins(13)
        .storeSlice(initiator as slice).storeSlice(recipient as slice).storeRef(state).storeRef(fees).endCell();
    assertEventMessage(body);
}

get fun `test pool deposit event preserves amounts minted liquidity and next state`() {
    val (initiator, recipient, state) = eventTestFields();
    val fee = emitPoolDeposit({ amountX: 11, amountY: 13, liquidity: 17, initiator, recipient, nextState: state });
    expect(fee).toBeGreater(0);
    val body = beginCell().storeUint(0x35df2e12, 32).storeCoins(11).storeCoins(13).storeCoins(17)
        .storeSlice(initiator as slice).storeSlice(recipient as slice).storeRef(state).endCell();
    assertEventMessage(body);
}

get fun `test pool withdrawal event orders burned liquidity before asset amounts`() {
    val (initiator, recipient, state) = eventTestFields();
    val fee = emitPoolWithdrawal({ liquidity: 17, amountX: 11, amountY: 13, initiator, recipient, nextState: state });
    expect(fee).toBeGreater(0);
    val body = beginCell().storeUint(0xc0d77b54, 32).storeCoins(17).storeCoins(11).storeCoins(13)
        .storeSlice(initiator as slice).storeSlice(recipient as slice).storeRef(state).endCell();
    assertEventMessage(body);
}
