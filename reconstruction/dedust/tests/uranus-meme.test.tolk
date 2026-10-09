import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/tlb/either"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"
import "fixtures/uranus-meme-helpers"
import "../CpmmPoolV2/storage"


get fun `test Uranus Meme V3 editable build equals complete mainnet code`() {
    expect(build("UranusMemeV3").hash()).toEqual(
        build("meme-v3-oracle", "oracles/UranusMemeV3.boc").hash(),
    );
}

get fun `test real Factory to Meme library deployment initializes preserved curve`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
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
    expect(data.0).toEqual(true);
    expect(data.1).toEqual(false);
    expect(data.2 as slice).toEqual(controller.address as slice);
    expect(data.3 as slice).toEqual(creator.address as slice);
    expect(data.4).toEqual(0);
    expect(data.6).toEqual(false);
    expect(data.10).toEqual(100);
    val curve = memeCurve(target);
    expect(curve.1).toEqual(1000000000000000000);
    expect(curve.2).toEqual(0);
    expect(curve.3).toEqual(800000000000000000);
    expect(curve.4).toEqual(200000000000000000);
    expect(curve.7).toEqual(0);
    expect(initialized.outMessages.size()).toEqual(1);
}

get fun `test Factory initial buy mints actual source-built wallet at independent sharded address`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val curve = memeCurve(target);
    val netPayment = 1000000000 * 10000 / 10100;
    val tokens = netPayment * curve.8 / (curve.9 + netPayment);
    expect(curve.2).toEqual(tokens);
    expect(curve.7).toEqual(netPayment);
    val credit = memeMessage(initialized, 0x178d4519);
    val derived = net.runGetMethod<address>(target, 103289, [creator.address]);
    expect(credit.info.dest as slice).toEqual(derived as slice);
    testing.setShardAccount(derived, null);
    memeExit(memeDeliver(target, credit), 0);
    expect(memeWalletBalance(derived)).toEqual(tokens);
}

get fun `test real Wallet sell notice updates curve with independent rounding and pays owner`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val credit = memeMessage(initialized, 0x178d4519);
    val wallet = credit.info.dest;
    testing.setShardAccount(wallet, null);
    memeExit(memeDeliver(target, credit), 0);
    val before = memeCurve(target);
    val amount = before.2 / 2;
    val sell = beginCell()
        .storeUint(0xb7459e2c, 32)
        .storeUint(123, 64)
        .storeCoins(amount)
        .storeCoins(0)
        .storeAddressOpt(null)
        .storeUint(0, 2)
        .endCell();
    val walletResult = memeSend(creator.address, wallet, sell);
    memeExit(walletResult, 0);
    expect(memeWalletBalance(wallet)).toEqual(before.2 - amount);
    val received = memeDeliver(wallet, memeMessage(walletResult, 0x646ad424));
    memeExit(received, 0);
    val gross = amount * (before.9 + before.7) / (before.8 - before.2 + amount);
    val payout = gross * 10000 / 10100;
    expect(memeCurve(target).7).toEqual(before.7 - gross);
    expect(memeCurve(target).2).toEqual(before.2 - amount);
    val paid = memeMessage(received, 0x66c8ad72);
    expect(paid.info.dest as slice).toEqual(creator.address as slice);
    expect(paid.info.value.grams).toEqual(payout);
}

get fun `test real Wallet burn notice reduces master supply without altering curve inventory`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000);
    val credit = memeMessage(initialized, 0x178d4519);
    val wallet = credit.info.dest;
    testing.setShardAccount(wallet, null);
    memeExit(memeDeliver(target, credit), 0);
    val before = memeCurve(target);
    val burn = beginCell()
        .storeUint(0x595f07bc, 32)
        .storeUint(123, 64)
        .storeCoins(700)
        .storeAddressOpt(null)
        .storeBool(false)
        .endCell();
    val result = memeSend(creator.address, wallet, burn);
    memeExit(result, 0);
    memeExit(memeDeliver(wallet, memeMessage(result, 0x7bdd97de)), 0);
    expect(memeCurve(target).1).toEqual(before.1 - 700);
    expect(memeCurve(target).2).toEqual(before.2);
    expect(memeWalletBalance(wallet)).toEqual(before.2 - 700);
}

get fun `test master rejects forged wallet and slippage and preserves initialized state`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
    val before = memeCurve(target);
    val forged = beginCell()
        .storeUint(0x7bdd97de, 32)
        .storeUint(123, 64)
        .storeCoins(1)
        .storeAddress(creator.address)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(creator.address, target, forged), 25);
    memeExit(memeSend(creator.address, target, memeBuy(1000000000, creator.address, before.1)), 21);
    memeExit(
        memeSend(creator.address, target, memeBuy(1000000000, creator.address), ton("0.01")),
        23,
    );
    expect(memeCurve(target).2).toEqual(0);
    expect(memeCurve(target).1).toEqual(before.1);
}

get fun `test creator and partner claim exact independently split accrued fees`() {
    val (target, creator, controller, initialized) = memeFactorySetup(1000000000, true);
    val fee = 1000000000 - 1000000000 * 10000 / 10100;
    val partnerFee = fee * 400 / 10000;
    val creatorFee = fee - fee * 20 / 100 - partnerFee;
    expect(net.runGetMethod<(int, int, address, int)>(target, 83180, []).0).toEqual(partnerFee);
    val claim = beginCell()
        .storeUint(0xad7269a8, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .storeAddressOpt(null)
        .endCell();
    memeExit(memeSend(controller.address, target, claim), 25);
    val c = memeSend(creator.address, target, claim);
    memeExit(c, 0);
    expect(memeMessage(c, 0x66c8ad72).info.value.grams).toEqual(creatorFee);
    val partnerClaim = beginCell()
        .storeUint(0x7f4bcbf4, 32)
        .storeUint(123, 64)
        .storeAddressOpt(null)
        .storeAddressOpt(null)
        .endCell();
    val p = memeSend(controller.address, target, partnerClaim);
    memeExit(p, 0);
    expect(memeMessage(p, 0x66c8ad72).info.value.grams).toEqual(partnerFee);
    expect(net.runGetMethod<(int, int, address, int)>(target, 83180, []).0).toEqual(0);
    expect(memeSend(controller.address, target, partnerClaim).outMessages.size()).toEqual(1);
}

get fun `test graduation resolves real Pool wallet and emits authenticated liquidity migration`() {
    val (target, creator, controller, initialized) = memeFactorySetup();
    memeGraduateAndMigrate(target, creator);
}
