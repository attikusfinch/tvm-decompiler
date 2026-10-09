import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"
import "../contracts/deposit/types"
import "../../libraries/testing/chain"

fun depositDeploymentTransaction(): TlbTransaction {
    return (build(
        "mainnet-deposit-deploy",
        "../evidence/transactions/f7e8ea9e3996f965e59dcf10188b0bbd1ca271fe72ce18507eb304573e38578f.boc",
    ) as Cell<TlbTransaction>).load();
}

fun depositSettlementTransaction(): TlbTransaction {
    return (build(
        "mainnet-deposit-settle",
        "../evidence/transactions/f0570c50ef5b57b2a5b8cae36de4f3fb41a178744cfb1a025427b77c93cfec99.boc",
    ) as Cell<TlbTransaction>).load();
}

get fun `test mainnet deposit messages credit both assets and reproduce the exact join body`() {
    val first = depositDeploymentTransaction();
    val last = depositSettlementTransaction();
    val creditX = archivedIncoming(first);
    val creditY = archivedIncoming(last);
    val target = creditX.info.dest;
    testing.setNow(first.now);
    testing.setShardAccount(target, null);
    testing.registerLibrary(build("CpmmDeposit"));
    expectVmExit(deliverArchived(creditX), 0);
    val firstCredit = CreditAsset.fromCell(archivedBody(creditX));
    val balances = net.runGetMethod<(
            any_address,
            any_address,
            any_address,
            int,
            int,
            int,
            int,
            int,
            int,
        )>(target, "get_deposit_data");
    expect(firstCredit.isX ? balances.7 : balances.8).toEqual(firstCredit.amount);
    expect(firstCredit.isX ? balances.8 : balances.7).toEqual(0);

    testing.setNow(last.now);
    val settlement = deliverArchived(creditY);
    expectVmExit(settlement, 0);
    expect(settlement.outMessages.size()).toEqual(1);
    val actual = (settlement.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
    val expected = last.messages.load().outMsgs.mustGet(0).load();
    expect(actual.info.dest as slice).toEqual(expected.info.dest as slice);
    expect(archivedBody(actual).hash()).toEqual(archivedBody(expected).hash());
    expect(settlement.tx.load().endStatus).toEqual(TlbAccountStatus.NonExisting);
}

get fun `test a forged sender cannot settle the archived mainnet deposit`() {
    val first = depositDeploymentTransaction();
    val credit = archivedIncoming(first);
    testing.setNow(first.now);
    testing.setShardAccount(credit.info.dest, null);
    testing.registerLibrary(build("CpmmDeposit"));
    expectVmExit(deliverArchived(credit), 0);
    val before = net.runGetMethod<(
            any_address,
            any_address,
            any_address,
            int,
            int,
            int,
            int,
            int,
            int,
        )>(credit.info.dest, "get_deposit_data");
    val attacker = testing.treasury("archived-deposit-forged-pool");
    val forged = testing.processSingleTraceStep(
        attacker.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            value: grams("1"),
            dest: credit.info.dest,
            body: archivedBody(archivedIncoming(depositSettlementTransaction())),
        }),
    );
    expectVmExit(forged, 23);
    expect(forged.outMessages.size()).toEqual(0);
    val after = net.runGetMethod<(
            any_address,
            any_address,
            any_address,
            int,
            int,
            int,
            int,
            int,
            int,
        )>(credit.info.dest, "get_deposit_data");
    expect(after.7).toEqual(before.7);
    expect(after.8).toEqual(before.8);
}
