import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/out_actions"
import "../contracts/pool-v2/payment"
import "../contracts/pool-v2/payout-config"

fun paymentNone(): any_address
    asm "b{00} PUSHSLICE"

get fun `test pool native payout carries principal extra gas and signed callback`() {
    val recipient = testing.treasury("payment-ton").address as any_address;
    val payload = beginCell().storeUint(7, 8).endCell();
    val (principal, fee) = sendPoolPayment(
        paymentNone(),
        paymentNone(),
        100,
        {
            destination: recipient,
            extraGas: 17,
            payload,
            wrapPayload: true,
        },
        paymentNone(),
        9,
        -13,
    );
    expect(principal).toEqual(100);
    expect(fee).toBeGreater(0);
    val actions = testing.outActions();
    expect(actions.size()).toEqual(1);
    val action = actions.getSendMessageAt(0)!;
    expect(action.mode).toEqual(17);
    val expected = beginCell()
        .storeUint(0x10, 6)
        .storeSlice(recipient as slice)
        .storeCoins(117)
        .storeUint(0x3216ca09, 139)
        .storeUint(9, 64)
        .storeCoins(100)
        .storeInt(-13, 32)
        .storeDict(payload)
        .endCell();
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool jetton payout wraps callback and distinguishes absent forward payload`() {
    val asset = testing.treasury("payment-asset").address as any_address;
    val wallet = testing.treasury("payment-wallet").address as any_address;
    val recipient = testing.treasury("payment-recipient").address as any_address;
    val excesses = testing.treasury("payment-excesses").address as any_address;
    val (principal, fee) = sendPoolPayment(
        asset,
        wallet,
        100,
        {
            destination: recipient,
            extraGas: 17,
            payload: null,
            wrapPayload: true,
        },
        excesses,
        9,
        -13,
    );
    expect(principal).toEqual(0);
    expect(fee).toBeGreater(0);
    val wrapped = beginCell().storeUint(0xe8db4696, 32).storeInt(-13, 32).storeDict(null).endCell();
    val body = beginCell()
        .storeUint(0x0f8a7ea5, 32)
        .storeUint(9, 64)
        .storeCoins(100)
        .storeSlice(recipient as slice)
        .storeSlice(excesses as slice)
        .storeDict(null)
        .storeCoins(17)
        .storeBool(true)
        .storeRef(wrapped)
        .endCell();
    val expected = beginCell()
        .storeUint(0x10, 6)
        .storeSlice(wallet as slice)
        .storeCoins(50000017)
        .storeUint(1, 107)
        .storeRef(body)
        .endCell();
    val action = testing.outActions().getSendMessageAt(0)!;
    expect(action.mode).toEqual(17);
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool jetton empty and raw payload keep TEP74 selector and original ref`() {
    val asset = testing.treasury("payment-raw-asset").address as any_address;
    val wallet = testing.treasury("payment-raw-wallet").address as any_address;
    val recipient = testing.treasury("payment-raw-recipient").address as any_address;
    val payload = beginCell().storeUint(7, 8).endCell();
    sendPoolPayment(
        asset,
        wallet,
        100,
        {
            destination: recipient,
            extraGas: 0,
            payload: null,
            wrapPayload: false,
        },
        recipient,
        9,
        0,
    );
    sendPoolPayment(
        asset,
        wallet,
        100,
        {
            destination: recipient,
            extraGas: 0,
            payload,
            wrapPayload: false,
        },
        recipient,
        9,
        1 << 40,
    );
    val actions = testing.outActions();
    expect(actions.size()).toEqual(2);
    var i = 0;
    repeat (2) {
        var message = actions.getSendMessageAt(i)!.outMsg.beginParse();
        message.skipBits(6);
        message.loadAddress();
        message.loadCoins();
        message.skipBits(107);
        var body = message.loadRef().beginParse();
        message.assertEnd();
        expect(body.loadUint(32)).toEqual(0x0f8a7ea5);
        expect(body.loadUint(64)).toEqual(9);
        expect(body.loadCoins()).toEqual(100);
        body.loadAddress();
        body.loadAddress();
        expect(body.loadDict()).toEqual(null);
        expect(body.loadCoins()).toEqual(0);
        // TVM's c5 linked list starts with the most recently appended action.
        expect(body.loadBool()).toEqual(i == 0);
        if (i == 0) {
            expect(body.loadRef().hash()).toEqual(payload.hash());
        }
        body.assertEnd();
        i += 1;
    }
}

get fun `test pool payout rejects overflowing coins and unsupported asset address`() {
    val recipient = testing.treasury("payment-errors").address as any_address;
    var exit = 0;
    try {
        sendPoolPayment(
            paymentNone(),
            recipient,
            (1 << 120) - 1,
            {
                destination: recipient,
                extraGas: 1,
                payload: null,
                wrapPayload: false,
            },
            recipient,
            0,
            0,
        );
    } catch (e) {
        exit = e;
    }
    expect(exit).toEqual(5);
    exit = 0;
    val external = beginCell()
        .storeUint(1, 2)
        .storeUint(16, 9)
        .storeUint(0xabcd, 16)
        .endCell()
        .beginParse() as any_address;
    try {
        sendPoolPayment(
            external,
            recipient,
            1,
            {
                destination: recipient,
                extraGas: 0,
                payload: null,
                wrapPayload: false,
            },
            recipient,
            0,
            0,
        );
    } catch (e) {
        exit = e;
    }
    expect(exit).toEqual(31);
}
