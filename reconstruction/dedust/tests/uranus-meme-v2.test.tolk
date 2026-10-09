import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "fixtures/uranus-meme-helpers"

fun memeV2Setup(initialBuy: coins = 0): (address, Treasury, Treasury, SendResult) {
    testing.setNow(1700000000);
    testing.registerLibrary(build("UranusMemeWalletV2"));
    testing.registerLibrary(build("CpmmPoolV1"));
    testing.registerLibrary(build("CpmmDeposit"));
    testing.registerLibrary(build("CpmmPosition"));
    testing.registerLibrary(build("CpmmAffiliateAccount"));
    val creator = testing.treasury("meme-v2-creator");
    val controller = testing.treasury("meme-v2-controller");
    val raising = 1000000000000;
    val supply = 1000000000000000000;
    val onSell = 800000000000000000;
    val liquidity = supply - onSell;
    val denominator = raising * onSell / liquidity - (raising + 50000000000);
    val alpha = (raising * onSell * onSell / liquidity) / denominator;
    val beta = (raising + 50000000000) * (raising + 50000000000) / denominator;
    val config = beginCell()
        .storeAddress(creator.address)
        .storeAddress(controller.address)
        .storeRef(beginCell().storeUint(42, 8).endCell())
        .storeCoins(raising)
        .storeCoins(liquidity)
        .storeUint(17, 128)
        .endCell();
    val data = beginCell()
        .storeUint(0, 2)
        .storeRef(config)
        .storeUint(100, 16)
        .storeBool(false)
        .storeCoins(alpha)
        .storeCoins(beta)
        .storeCoins(onSell)
        .storeCoins(0)
        .storeCoins(0)
        .storeCoins(supply)
        .storeCoins(0)
        .endCell();
    val deployment: AutoDeployAddress = { stateInit: { code: build("UranusMemeV2"), data } };
    val target = deployment.calculateAddress();
    testing.setShardAccount(target, null);
    val init = beginCell()
        .storeUint(0x796f5a0c, 32)
        .storeUint(123, 64)
        .storeCoins(initialBuy)
        .storeUint(0, 2)
        .endCell();
    val initialized = testing.processSingleTraceStep(
        creator.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            value: initialBuy + ton("2"),
            dest: deployment,
            body: init,
        }),
    );
    memeExit(initialized, 0);
    return (target, creator, controller, initialized);
}

get fun `test Uranus Meme V2 editable build equals all frozen mainnet bytes`() {
    expect(build("UranusMemeV2").hash()).toEqual(
        build("meme-v2-oracle", "oracles/UranusMemeV2.boc").hash(),
    );
}

get fun `test V2 initialization and initial buy mint actual old wallet with 30 percent protocol fee`() {
    val (target, creator, controller, initialized) = memeV2Setup(1000000000);
    val data = net.runGetMethod<(
        bool,
        bool,
        address,
        address,
        int,
        int,
        bool,
        int,
        int,
        int,
        int,
        int,
        int,
    )>(target, 101289, []);
    val netPayment = 1000000000 * 10000 / 10100;
    val tokens = netPayment * data.7 / (data.8 + netPayment);
    expect(data.0).toEqual(true);
    expect(data.1).toEqual(false);
    expect(data.11).toEqual(netPayment);
    expect(data.12).toEqual(tokens);
    val fees = 1000000000 - netPayment;
    expect(data.4).toEqual(fees - fees * 30 / 100);
    val credit = memeMessage(initialized, 0x178d4519);
    testing.setShardAccount(credit.info.dest, null);
    memeExit(memeDeliver(target, credit), 0);
    expect(memeWalletBalance(credit.info.dest)).toEqual(tokens);
    expect(credit.info.dest as slice).toEqual(
        net.runGetMethod<address>(target, 103289, [creator.address]) as slice,
    );
}

get fun `test V2 real wallet sell and burn preserve independent master accounting`() {
    val (target, creator, controller, initialized) = memeV2Setup(1000000000);
    val credit = memeMessage(initialized, 0x178d4519);
    val wallet = credit.info.dest;
    testing.setShardAccount(wallet, null);
    memeExit(memeDeliver(target, credit), 0);
    val data = net.runGetMethod<(
        bool,
        bool,
        address,
        address,
        int,
        int,
        bool,
        int,
        int,
        int,
        int,
        int,
        int,
    )>(target, 101289, []);
    val amount = data.12 / 2;
    val sell = beginCell()
        .storeUint(0xb7459e2c, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeCoins(0)
        .storeAddressOpt(null)
        .storeUint(0, 2)
        .endCell();
    val result = memeSend(creator.address, wallet, sell);
    memeExit(result, 0);
    val sold = memeDeliver(wallet, memeMessage(result, 0x646ad424));
    memeExit(sold, 0);
    val gross = amount * (data.8 + data.11) / (data.7 - data.12 + amount);
    expect(memeMessage(sold, 0x66c8ad72).info.value.grams).toEqual(gross * 10000 / 10100);
    expect(memeWalletBalance(wallet)).toEqual(data.12 - amount);
    val burn = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(123, 64)
        .storeCoins(700)
        .storeAddressOpt(null)
        .storeBool(false)
        .endCell();
    val burned = memeSend(creator.address, wallet, burn);
    memeExit(burned, 0);
    memeExit(memeDeliver(wallet, memeMessage(burned, 0x7bdd97de)), 0);
    expect(net.runGetMethod<(int, int, any_address, cell, cell)>(target, 106029, []).0).toEqual(
        1000000000000000000 - 700,
    );
    expect(memeWalletBalance(wallet)).toEqual(data.12 - amount - 700);
}

get fun `test V2 controller cannot withdraw before migration and creator claims accrued fee`() {
    val (target, creator, controller, initialized) = memeV2Setup(1000000000);
    val sweep = beginCell()
        .storeUint(0xf14b54f3, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(controller.address, target, sweep), 32);
    memeExit(memeSend(creator.address, target, sweep), 25);
    val claim = beginCell()
        .storeUint(0xad7269a8, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(controller.address, target, claim), 25);
    val fees = 1000000000 - 1000000000 * 10000 / 10100;
    val result = memeSend(creator.address, target, claim);
    memeExit(result, 0);
    expect(memeMessage(result, 0x66c8ad72).info.value.grams).toEqual(fees - fees * 30 / 100);
    expect(
        net
            .runGetMethod<(
                bool,
                bool,
                address,
                address,
                int,
                int,
                bool,
                int,
                int,
                int,
                int,
                int,
                int,
            )>(target, 101289, [])
            .4,
    ).toEqual(0);
}

get fun `test V2 migrates real Pool V1 through both assets and joins liquidity`() {
    val (target, creator, controller, initialized) = memeV2Setup();
    memeGraduateAndMigrate(target, creator);
    val sweep = beginCell()
        .storeUint(0xf14b54f3, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(controller.address, target, sweep), 0);
}
