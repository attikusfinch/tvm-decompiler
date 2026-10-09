import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "../dedust/cpmm/CpmmPoolV2/storage"
import "../dedust/cpmm/CpmmPoolV2/wallets"
import "../dedust/cpmm/CpmmPoolV2/rewards"
import "../dedust/cpmm/CpmmPoolV2/payout-config"

fun processingNone():any_address asm "b{00} PUSHSLICE"

fun processingInitialState(asset:any_address,wallet:any_address,owner:any_address):PoolStorage {
    val (_,hash)=asset.getWorkchainAndHash();
    var wallets:PoolWallets={walletsByAssets:[],assetsByWallets:[],resolutions:[]};
    wallets.walletsByAssets.set(hash,wallet);
    var allowed:map<uint2,PoolRewardConfig> = [];
    allowed.set(2,{asset,maxDuration:86400});
    val config:PoolConfig={assetX:processingNone(),assetY:asset,creator:owner,baseFee:30,creatorFee:2500,
        depositActivation:null,swapActivation:null,feeIn:FeeFromBoth{},customResolvers:[],allowedRewards:allowed};
    val fees:PoolFees={protocolX:7,protocolY:11,creatorX:13,creatorY:17,xCheckpoint:19,yCheckpoint:23};
    return {config:config.toCell(),fees:fees.toCell(),extra:PoolExtra{controller:owner,wallets}.toCell(),rewards:[],
        status:PoolInitialized{},depositActive:true,swapActive:true,liquidity:1000000,reserveX:100000000000,reserveY:200000000000};
}

fun runProcessingProbe(storage:PoolStorage,payment:cell,asset:any_address,amount:coins):cell {
    testing.setNow(1700000000);
    testing.registerLibrary(build("CpmmDeposit"));
    testing.registerLibrary(build("CpmmPosition"));
    testing.registerLibrary(build("CpmmAffiliateAccount"));
    val sender=testing.treasury("processing-sender");
    val options:PoolPayoutOptions={destination:sender.address as any_address,extraGas:17,payload:null,wrapPayload:false};
    val payout=PoolExtendedPayout{fulfill:options,reject:options,excessesTo:sender.address as any_address}.toCell();
    val body=beginCell().storeUint(9,64).storeCoins(amount).storeSlice(asset as slice).storeCoins(1000000)
        .storeRef(payout).storeRef(payment).endCell();
    val probe:AutoDeployAddress={stateInit:{code:build("ProcessingProbe","tests/fixtures/pool-processing.tolk"),data:storage.toCell()}};
    val destination=probe.calculateAddress();testing.setShardAccount(destination,null);
    val result=testing.processSingleTraceStep(sender.address,createMessage({bounce:BounceMode.NoBounce,value:ton("5"),dest:probe,body:body.beginParse()}));
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(0);
    return net.runGetMethod<cell>(destination,90046,[]);
}

get fun `test pool dispatcher independently calculates swap reserves protocol creator and LP fees`() {
    val asset=testing.treasury("processing-asset").address as any_address;
    val wallet=testing.treasury("processing-wallet").address as any_address;
    val owner=testing.treasury("processing-owner").address as any_address;
    val initial=processingInitialState(asset,wallet,owner);
    val payment=beginCell().storeUint(0xc442500f,32).storeCoins(0).storeUint(0,40).storeDict(null).storeBool(false).storeBool(false).endCell();
    val data=runProcessingProbe(initial,payment,processingNone(),100000000);
    val updated=PoolStorage.fromCell(data);
    val netInput=100000000*10000/10030;
    val amountOut=netInput*200000000000/(100000000000+netInput);
    val fee=100000000-netInput;
    val protocol=fee*20/100;
    val creator=(fee-protocol)*2500/10000;
    val lp=fee-protocol-creator;
    expect(updated.reserveX).toEqual(100000000000+netInput);expect(updated.reserveY).toEqual(200000000000-amountOut);
    val fees=PoolFees.fromCell(updated.fees);
    expect(fees.protocolX).toEqual(7+protocol);expect(fees.creatorX).toEqual(13+creator);
    expect(fees.xCheckpoint).toEqual(19+lp*(1<<120)/1000000);
    expect(fees.protocolY).toEqual(11);expect(fees.creatorY).toEqual(17);expect(updated.liquidity).toEqual(1000000);
}

get fun `test pool dispatcher keeps decoded rejection tuple context for zero payment`() {
    val asset=testing.treasury("processing-zero-asset").address as any_address;
    val owner=testing.treasury("processing-zero-owner").address as any_address;
    val payment=beginCell().storeUint(0x2eb87df9,32).storeUint(1700000100,40).endCell();
    var data=runProcessingProbe(processingInitialState(asset,owner,owner),payment,asset,0).beginParse();
    expect(data.loadUint(32)).toEqual(0xdeadbeef);expect(data.loadInt(32)).toEqual(47);expect(data.loadBool()).toEqual(true);
    val sender=testing.treasury("processing-sender").address;
    expect(data.loadAddressAny() as slice).toEqual(sender as slice);expect(data.loadAddressAny() as slice).toEqual(sender as slice);
    expect(data.loadCoins()).toEqual(17);expect(data.loadDict()).toEqual(null);expect(data.loadBool()).toEqual(false);data.assertEnd();
}

get fun `test pool dispatcher funds reward budget and extends duration in its configured slot`() {
    val asset=testing.treasury("processing-reward-asset").address as any_address;
    val owner=testing.treasury("processing-reward-owner").address as any_address;
    var initial=processingInitialState(asset,owner,owner);
    initial.rewards.set(2,{remainingTime:100,remainingBudget:1000,checkpoint:23,lastUpdate:1700000000});
    val payment=beginCell().storeUint(0x2eb87df9,32).storeUint(1700000150,40).endCell();
    val updated=PoolStorage.fromCell(runProcessingProbe(initial,payment,asset,500));
    val reward=updated.rewards.mustGet(2);
    expect(reward.remainingTime).toEqual(150);expect(reward.remainingBudget).toEqual(1500);
    expect(reward.checkpoint).toEqual(23);expect(reward.lastUpdate).toEqual(1700000000);
    expect(updated.reserveX).toEqual(initial.reserveX);expect(updated.reserveY).toEqual(initial.reserveY);
}

get fun `test pool dispatcher rejects underfunded reward extension at exact rounding boundary`() {
    val asset=testing.treasury("processing-extension-asset").address as any_address;
    val owner=testing.treasury("processing-extension-owner").address as any_address;
    var initial=processingInitialState(asset,owner,owner);
    initial.rewards.set(2,{remainingTime:100,remainingBudget:1000,checkpoint:23,lastUpdate:1700000000});
    val payment=beginCell().storeUint(0x2eb87df9,32).storeUint(1700000150,40).endCell();
    var data=runProcessingProbe(initial,payment,asset,499).beginParse();
    expect(data.loadUint(32)).toEqual(0xdeadbeef);expect(data.loadInt(32)).toEqual(45);expect(data.loadBool()).toEqual(true);
}
