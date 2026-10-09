import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"
import "fixtures/classic-pool-helpers"

fun setPoolStartTime(target: address, sender: address, timestamp: int): SendResult {
    return classicPoolSend(
        sender,
        target,
        beginCell().storeUint(2128082638, 32).storeUint(123, 64).storeUint(timestamp, 32).endCell(),
    );
}

get fun `test installed V8 and V9 source builds match frozen code hashes`() {
    expect(
        build("ClassicPoolInstalledV8").hash(),
    ).toEqual(0xc0f9d14fbc8e14f0d72cba2214165eee35836ab174130912baf9dbfa43ead562);
    expect(
        build("ClassicPoolInstalledV9").hash(),
    ).toEqual(0x778f0d3fe6482c50888970df5e787f40f3a4ab282170c035a5920877058c99d3);
}

get fun `test Blank installs both revisions with optional start timestamp`() {
    var revision = 8;
    repeat (2) {
        val (target, owner, factory) = classicPoolSetup(0, revision);
        expect(net.runGetMethod<int>(target, 112861, [])).toEqual(0);
        expect(classicPoolReserves(target)).toEqual((0, 0));
        val (timed, unused, unusedFactory) = classicPoolSetup(0, revision, 1700000001);
        expect(net.runGetMethod<int>(timed, 112861, [])).toEqual(1700000001);
        revision += 1;
    }
}

get fun `test operator ten authorization and revision-specific repeated timestamp update`() {
    var revision = 8;
    repeat (2) {
        val (target, owner, factory) = classicPoolSetup(0, revision);
        classicPoolExit(setPoolStartTime(target, owner.address, 1700000001), 296);
        expect(net.runGetMethod<int>(target, 112861, [])).toEqual(0);
        val controller = classicPoolOperator(factory.address, 10);
        classicPoolExit(setPoolStartTime(target, controller, 1700000001), 0);
        classicPoolExit(setPoolStartTime(target, controller, 0), revision == 8 ? 307 : 0);
        expect(net.runGetMethod<int>(target, 112861, [])).toEqual(revision == 8 ? 1700000001 : 0);
        revision += 1;
    }
}

get fun `test blocked swaps commit full refund and start at exact timestamp`() {
    var revision = 8;
    repeat (2) {
        val (target, owner, factory) = classicPoolSetup(0, revision, 1700000001);
        classicPoolExit(classicPoolDeposit(target, factory.address, owner.address), 0);
        val rejected = classicPoolSwap(target, factory.address, owner.address);
        classicPoolExit(rejected, 306);
        expect(classicPoolReserves(target)).toEqual((1000000, 2000000));
        expect(net.runGetMethod<(int, int)>(target, 112792, [])).toEqual((0, 0));
        var refund = classicPoolBody(classicPoolMessage(rejected, 2907617013));
        refund.skipBits(96);
        refund.loadRef();
        expect(refund.loadCoins()).toEqual(10000);
        testing.setNow(1700000001);
        classicPoolExit(classicPoolSwap(target, factory.address, owner.address), 0);
        expect(classicPoolReserves(target).0).toEqual(1009994);
        revision += 1;
    }
}

get fun `test installed pools mint real LP wallets and settle their burn notices`() {
    var revision = 8;
    repeat (2) {
        val (target, owner, factory) = classicPoolSetup(0, revision);
        val deposited = classicPoolDeposit(target, factory.address, owner.address);
        classicPoolExit(deposited, 0);
        val credit = classicPoolMessage(deposited, 395134233);
        testing.setShardAccount(credit.info.dest, null);
        classicPoolExit(classicPoolDeliver(target, credit), 0);
        expect(
            net.runGetMethod<(int, any_address, any_address, cell)>(credit.info.dest, 97026, []).0,
        ).toEqual(2000000);
        val request = beginCell()
            .storeUint(0x595f07bc, 32)
            .storeUint(124, 64)
            .storeCoins(500000)
            .storeSlice(owner.address as slice)
            .endCell();
        val burned = classicPoolSend(owner.address, credit.info.dest, request);
        classicPoolExit(burned, 0);
        classicPoolExit(
            classicPoolDeliver(credit.info.dest, classicPoolMessage(burned, 2078119902)),
            0,
        );
        expect(classicPoolSupply(target)).toEqual(1501000);
        expect(classicPoolReserves(target)).toEqual(
            (1000000 - 1000000 * 500000 / 2001000, 2000000 - 2000000 * 500000 / 2001000),
        );
        revision += 1;
    }
}

get fun `test installed stable pools preserve quotes and timed swap execution`() {
    var revision = 8;
    repeat (2) {
        val (target, owner, factory) = classicPoolSetup(1, revision, 1700000000);
        classicPoolExit(
            classicPoolDeposit(
                target,
                factory.address,
                owner.address,
                1000000,
                1000000,
                0,
                1,
            ),
            0,
        );
        val received = net
            .runGetMethod<(slice, int, int)>(
                target,
                70754,
                [classicPoolNative().beginParse(), 10000],
            )
            .1;
        val input = 9970;
        expect(received > input * 1000000 / (1000000 + input)).toBeTrue();
        expect(received <= input).toBeTrue();
        // Vault proof and pool descriptor remain bound to the stable flag only
        // where that field is part of their respective schemas.
        classicPoolExit(classicPoolSwap(target, factory.address, owner.address), 0);
        expect(classicPoolReserves(target)).toEqual((1009994, 1000000 - received));
        revision += 1;
    }
}
