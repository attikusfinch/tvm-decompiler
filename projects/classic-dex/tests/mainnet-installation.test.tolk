import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "../../libraries/testing/chain"

get fun `test archived Factory message installs the exact V9 Pool through Blank`() {
    val archived = (build(
        "mainnet-pool-v9-install",
        "../evidence/transactions/44eff5681d3e0ff16356af12d51689be4761b03cea2d756ee657f4c911507b88.boc",
    ) as Cell<TlbTransaction>).load();
    val message = archivedIncoming(archived);
    testing.setNow(archived.now);
    testing.setShardAccount(message.info.dest, null);
    val result = deliverArchived(message);
    expectVmExit(result, 0);
    val account = testing.getAccountState(message.info.dest)!;
    val state = account.storage.state;
    assert (state is TlbAccountStateActive) throw 567;
    expect(state.stateInit.code!.hash()).toEqual(build("ClassicPoolInstalledV9").hash());
    expect(net.runGetMethod<int>(message.info.dest, "is_stable")).toEqual(0);
}
