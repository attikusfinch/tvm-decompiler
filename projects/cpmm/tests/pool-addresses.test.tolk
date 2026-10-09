import "@acton/emulation/testing"
import "@acton/testing/expect"
import "../contracts/pool-v2/addresses"
import "../contracts/pool-v2/compat-address"
import "../contracts/pool-v2/stdlib-legacy-stateinit"

get fun `test pool position deployment initializes typed empty state`() {
    val owner = testing.treasury("pool-position-owner").address;
    val deployment = positionDeployment(owner as any_address);
    val state = deployment.stateInit;
    assert (state is ContractState) throw 567;
    val storage = InitialPositionStorage.fromCell(state.data);
    expect(storage.pool as slice).toEqual(contract.getAddress() as slice);
    expect(storage.owner as slice).toEqual(owner as slice);
    expect(storage.liquidity).toEqual(0);
    expect(storage.lockedLiquidity).toEqual(0);
    expect(storage.rewards == null).toEqual(true);
    val fees = InitialPositionFees.fromCell(storage.fees);
    expect(fees.xCheckpoint + fees.xPending + fees.xReserved).toEqual(0);
    expect(fees.yCheckpoint + fees.yPending + fees.yReserved).toEqual(0);
    expect(state.code.hash()).toEqual(positionLibrary().hash());
    expect(deployment.workchain).toEqual(0);
    expect(deployment.toShard!.fixedPrefixLength).toEqual(8);
    expect(deployment.toShard!.closeTo as slice).toEqual(contract.getAddress() as slice);
}

get fun `test pool deposit deployment preserves amounts payout and initiator`() {
    val initiator = testing.treasury("pool-deposit-initiator").address;
    val payout = beginCell().storeUint(0xabcdef, 24).endCell();
    val deployment = depositDeployment(
        initiator as any_address,
        11,
        13,
        17,
        2500,
        payout,
    );
    val state = deployment.stateInit;
    assert (state is ContractState) throw 567;
    val storage = InitialDepositStorage.fromCell(state.data);
    expect(storage.pool as slice).toEqual(contract.getAddress() as slice);
    expect(storage.initiator as slice).toEqual(initiator as slice);
    expect(storage.amountX + storage.amountY).toEqual(0);
    val config = InitialDepositConfig.fromCell(storage.config);
    expect(config.targetX).toEqual(11);
    expect(config.targetY).toEqual(13);
    expect(config.minimalLiquidity).toEqual(17);
    expect(config.lockedShare).toEqual(2500);
    expect(config.payout.hash()).toEqual(payout.hash());
    expect(state.code.hash()).toEqual(depositLibrary().hash());
}

get fun `test pool position address matches independently serialized StateInit`() {
    val owner = testing.treasury("pool-address-owner").address;
    val deployment = positionDeployment(owner as any_address);
    val state = deployment.stateInit;
    assert (state is ContractState) throw 567;
    val stateHash = beginCell()
        .storeBool(true)
        .storeUint(8, 5)
        .storeUint(6, 4)
        .storeRef(state.code)
        .storeRef(state.data)
        .endCell()
        .hash();
    val prefix = (contract.getAddress() as slice).getMiddleBits(11, 8);
    val expected = beginCell()
        .storeUint(4, 3)
        .storeInt(0, 8)
        .storeSlice(prefix)
        .storeUint(stateHash & ((1 << 248) - 1), 248)
        .endCell()
        .beginParse();
    expect(deployment.calculateArchivedAddress() as slice).toEqual(expected);
}

get fun `test legacy stdlib StateInit hashes equal canonical cell serialization`() {
    val code = positionLibrary();
    val data = beginCell().storeUint(0xabcd, 16).storeRef(beginCell().endCell()).endCell();
    val ordinary = beginCell().storeUint(6, 5).storeRef(code).storeRef(data).endCell();
    expect(archivedStateHash(code, data)).toEqual(ordinary.hash());
    var depth = 0;
    repeat (4) {
        val canonical = beginCell()
            .storeBool(true)
            .storeUint(depth, 5)
            .storeUint(6, 4)
            .storeRef(code)
            .storeRef(data)
            .endCell();
        expect(archivedStateHashPrefix(depth, code, data)).toEqual(canonical.hash());
        depth += 10;
    }
}
