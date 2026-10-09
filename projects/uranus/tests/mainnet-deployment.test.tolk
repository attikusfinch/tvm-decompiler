import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "../../libraries/testing/chain"

get fun `test archived Uranus Factory deployment initializes a source-built Meme V3 library`() {
    val factoryTx = (build(
        "mainnet-uranus-factory",
        "../evidence/transactions/50615fc88781c08b02e92ac1d34fe644d12fed9cd9b85517b3ccb8546335fcb3.boc",
    ) as Cell<TlbTransaction>).load();
    val deployment = factoryTx.messages.load().outMsgs.mustGet(0).load();
    testing.setNow(factoryTx.now);
    testing.setShardAccount(deployment.info.dest, null);
    testing.registerLibrary(build("UranusMemeV3"));
    testing.registerLibrary(build("UranusMemeWalletV3"));
    testing.registerLibrary(build("CpmmPoolV2"));
    testing.registerLibrary(build("CpmmAffiliateAccount"));
    val initialized = deliverArchived(deployment);
    expectVmExit(initialized, 0);
    val curve = net.runGetMethod<(
            bool,
            int,
            int,
            int,
            int,
            int,
            int,
            int,
            int,
            int,
        )>(deployment.info.dest, 121862, []);
    val state = net.runGetMethod<(
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
        )>(deployment.info.dest, "get_meme_data");
    expect(state.0).toEqual(true);
    expect(state.1).toEqual(false);
    val jetton = net.runGetMethod<(int, int, any_address, cell, cell)>(
        deployment.info.dest,
        "get_jetton_data",
    );
    expect(jetton.0 > 0).toEqual(true);
    expect(jetton.0).toEqual(curve.1);
    // An authenticated Factory cannot initialize the same master twice.
    expectVmExit(deliverArchived(deployment), 24);
    val after = net.runGetMethod<(int, int, any_address, cell, cell)>(
        deployment.info.dest,
        "get_jetton_data",
    );
    expect(after.0).toEqual(jetton.0);
}
