import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/message"
import "@acton/types/transaction"
import "../contracts/affiliate-account/types"

fun affiliateCode(oracle: bool): cell {
    return oracle
        ? build("oracle", "../oracles/CpmmAffiliateAccount.boc")
        : build("CpmmAffiliateAccount");
}

fun setupAffiliate(oracle: bool, activated: bool = false): (address, Treasury, Treasury) {
    testing.setNow(1700000000);
    val authority = testing.treasury("affiliate-authority");
    val owner = testing.treasury("affiliate-owner");
    val data = beginCell()
        .storeBool(activated)
        .storeSlice(authority.address as slice)
        .storeUint(0, 1)
        .storeUint(0, 1)
        .storeUint(123, 256)
        .storeUint(250, 16)
        .storeSlice(owner.address as slice)
        .endCell();
    val stateInit: ContractState = { code: affiliateCode(oracle), data };
    val destination: AutoDeployAddress = { stateInit };
    val address = destination.calculateAddress();
    testing.setShardAccount(address, null);
    testing.processSingleTraceStep(
        authority.address,
        createMessage({
            bounce: BounceMode.NoBounce,
            value: ton("1"),
            dest: destination,
            body: createEmptyCell(),
        }).bounced(),
    );
    return (address, authority, owner);
}

fun assertAffiliateExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

get fun `test recovered AffiliateAccount code equals mainnet`() {
    expect(affiliateCode(false).hash()).toEqual(affiliateCode(true).hash());
}

get fun `test affiliate getter decodes activation kind metadata and fee`() {
    var oracle = false;
    repeat (2) {
        val (dest, authority, owner) = setupAffiliate(oracle);
        val data = net.runGetMethod<(
                bool,
                any_address,
                any_address,
                int,
                cell?,
                int,
            )>(dest, "get_affiliate_account_data");
        expect(data.0).toBeFalse();
        expect(data.1 as slice).toEqual(authority.address as slice);
        expect(data.2 as slice).toEqual(owner.address as slice);
        expect(data.3).toEqual(0);
        expect(data.4 == null).toBeTrue();
        expect(data.5).toEqual(250);
        oracle = true;
    }
}

get fun `test activation requires authority and sets owner metadata`() {
    var oracle = false;
    repeat (2) {
        val (dest, authority, owner) = setupAffiliate(oracle);
        val metadata = beginCell().storeUint(0x12345678, 32).endCell();
        val body = beginCell()
            .storeUint(0xe5d596b3, 32)
            .storeUint(9, 64)
            .storeRef(metadata)
            .storeSlice(owner.address as slice)
            .storeSlice(owner.address as slice)
            .endCell();
        val outgoing = createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest, body });
        assertAffiliateExit(testing.processSingleTraceStep(owner.address, outgoing), 18);
        val result = testing.processSingleTraceStep(authority.address, outgoing);
        assertAffiliateExit(result, 0);
        expect(result.outMessages.at<Excesses>(0).loadBody().queryId).toEqual(9);
        val data = net.runGetMethod<(
                bool,
                any_address,
                any_address,
                int,
                cell?,
                int,
            )>(dest, "get_affiliate_account_data");
        expect(data.0).toBeTrue();
        expect(data.4!.hash()).toEqual(metadata.hash());
        expect(testing.getAccountBalance(dest)).toEqual(100000000);
        assertAffiliateExit(testing.processSingleTraceStep(authority.address, outgoing), 16);
        oracle = true;
    }
}

get fun `test withdrawal requires activation and owner`() {
    var oracle = false;
    repeat (2) {
        val (dest, authority, owner) = setupAffiliate(oracle);
        val body = beginCell()
            .storeUint(0xa43314ff, 32)
            .storeUint(19, 64)
            .storeSlice(owner.address as slice)
            .storeSlice(owner.address as slice)
            .endCell();
        val outgoing = createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest, body });
        assertAffiliateExit(testing.processSingleTraceStep(owner.address, outgoing), 17);
        val (active, _, _) = setupAffiliate(oracle, true);
        val activeMessage = createMessage({ bounce: BounceMode.NoBounce, value: ton("0.2"), dest: active, body });
        assertAffiliateExit(testing.processSingleTraceStep(authority.address, activeMessage), 18);
        val result = testing.processSingleTraceStep(owner.address, activeMessage);
        assertAffiliateExit(result, 0);
        expect(result.outMessages.size()).toEqual(2);
        val transfer = (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
        expect(transfer.info.value.grams).toBeGreater(0);
        expect(transfer.loadOpcode() == null).toBeTrue();
        expect(result.outMessages.at<Excesses>(1).loadBody().queryId).toEqual(19);
        expect(testing.getAccountBalance(active)).toEqual(100000000);
        oracle = true;
    }
}

get fun `test fee notification ignores body tail while unknown messages fail`() {
    var oracle = false;
    repeat (2) {
        val (dest, authority, _) = setupAffiliate(oracle);
        val ignored = testing.processSingleTraceStep(
            authority.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.2"),
                dest,
                body: beginCell().storeUint(0x773faf30, 32).storeUint(255, 8).endCell(),
            }),
        );
        assertAffiliateExit(ignored, 0);
        expect(ignored.outMessages.size()).toEqual(0);
        val unknown = testing.processSingleTraceStep(
            authority.address,
            createMessage({
                bounce: BounceMode.NoBounce,
                value: ton("0.2"),
                dest,
                body: beginCell().storeUint(0x12345678, 32).endCell(),
            }),
        );
        assertAffiliateExit(unknown, 65535);
        oracle = true;
    }
}
