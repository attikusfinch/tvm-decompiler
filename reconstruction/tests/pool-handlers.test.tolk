import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "../dedust/cpmm/CpmmPoolV2/storage"
import "../dedust/cpmm/CpmmPoolV2/wallets"
import "../dedust/cpmm/CpmmPoolV2/messages"
import "../dedust/cpmm/CpmmPoolV2/payout-config"

fun handlerNone():any_address asm "b{00} PUSHSLICE"

get fun `test recovered Pool V2 code equals mainnet`() {
    expect(build("CpmmPoolV2").hash()).toEqual(build("pool-v2-oracle","oracles/CpmmPoolV2.boc").hash());
}

get fun `test recovered Pool V1 code equals mainnet`() {
    expect(build("CpmmPoolV1").hash()).toEqual(build("pool-v1-oracle","oracles/CpmmPoolV1.boc").hash());
}

fun handlerState(status:PoolStatus,owner:any_address,asset:any_address,wallet:any_address):PoolStorage {
    val (_,assetHash)=asset.getWorkchainAndHash();
    val (_,walletHash)=wallet.getWorkchainAndHash();
    var wallets:PoolWallets={walletsByAssets:[],assetsByWallets:[],resolutions:[]};
    wallets.walletsByAssets.set(assetHash,wallet);wallets.assetsByWallets.set(walletHash,asset);
    val config:PoolConfig={assetX:handlerNone(),assetY:asset,creator:owner,baseFee:30,creatorFee:2500,
        depositActivation:null,swapActivation:null,feeIn:FeeFromBoth{},customResolvers:[],allowedRewards:[]};
    val fees:PoolFees={protocolX:7,protocolY:11,creatorX:13,creatorY:17,xCheckpoint:19,yCheckpoint:23};
    return {config:config.toCell(),fees:fees.toCell(),extra:PoolExtra{controller:owner,wallets}.toCell(),rewards:[],status,
        depositActive:false,swapActive:false,liquidity:1000000,reserveX:100000000000,reserveY:200000000000};
}

fun handlerExit(result:SendResult,code:int) {
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(code);
}

fun deployHandlerCandidate(storage:PoolStorage,revision:int=2):address {
    testing.setNow(1700000000);
    testing.registerLibrary(build("CpmmDeposit"));testing.registerLibrary(build("CpmmPosition"));testing.registerLibrary(build("CpmmAffiliateAccount"));
    val sender=testing.treasury("handler-deployer");
    val code=revision == 1 ? build("CpmmPoolV1") : build("CpmmPoolV2");
    val destination:AutoDeployAddress={stateInit:{code,data:storage.toCell()}};
    val result=destination.calculateAddress();testing.setShardAccount(result,null);
    handlerExit(testing.processSingleTraceStep(sender.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:destination,
        body:ProvidePoolState{queryId:0,includeConfig:false,includeFees:false,includeCodeHash:false,includeRewards:false}})),0);
    return result;
}

get fun `test complete Pool revisions allocate different protocol shares with independently calculated swap state`() {
    val owner=testing.treasury("handler-swap-owner");
    val asset=testing.treasury("handler-swap-asset").address as any_address;
    val wallet=testing.treasury("handler-swap-wallet").address as any_address;
    val options:PoolPayoutOptions={destination:owner.address as any_address,extraGas:0,payload:null,wrapPayload:false};
    val payout=PoolExtendedPayout{fulfill:options,reject:options,excessesTo:owner.address as any_address}.toCell();
    val payment=beginCell().storeUint(0xc442500f,32).storeCoins(0).storeUint(0,40).storeDict(null).storeBool(false).storeBool(false).endCell();
    val netInput=100000000*10000/10030;
    val output=netInput*200000000000/(100000000000+netInput);
    val baseFee=100000000-netInput;
    var revision=1;
    while(revision <= 2) {
        var initial=handlerState(PoolInitialized{},owner.address as any_address,asset,wallet);
        initial.depositActive=true;initial.swapActive=true;
        val pool=deployHandlerCandidate(initial,revision);
        handlerExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("5"),dest:pool,
            body:PayNative{queryId:9,amount:100000000,payment,payout}})),0);
        val state=net.runGetMethod<PoolData>(pool,81689,[]);
        val protocol=baseFee*(revision == 1 ? 30 : 20)/100;
        val creator=(baseFee-protocol)*2500/10000;
        val lp=baseFee-protocol-creator;
        expect(state.reserveX).toEqual(100000000000+netInput);expect(state.reserveY).toEqual(200000000000-output);
        expect(state.protocolX).toEqual(7+protocol);expect(state.creatorX).toEqual(13+creator);
        expect(state.xCheckpoint).toEqual(19+lp*(1<<120)/1000000);
        expect(state.protocolY).toEqual(11);expect(state.creatorY).toEqual(17);expect(state.yCheckpoint).toEqual(23);
        revision+=1;
    }
}

get fun `test readable full pool init schedules wallet then reply completes both lookup directions`() {
    val owner=testing.treasury("handler-init-owner");
    val asset=testing.treasury("handler-init-asset").address as any_address;
    val wallet=testing.treasury("handler-init-wallet").address as any_address;
    var initial=handlerState(PoolUninitialized{},owner.address as any_address,asset,wallet);
    initial.extra=PoolExtra{controller:owner.address as any_address,wallets:{walletsByAssets:[],assetsByWallets:[],resolutions:[]}}.toCell();
    val pool=deployHandlerCandidate(initial);
    handlerExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:pool,body:InitPool{queryId:9,payload:null}})),0);
    val pending=net.runGetMethod<PoolData>(pool,81689,[]);
    expect(pending.status).toEqual(1);expect(pending.resolutions.isEmpty()).toEqual(false);
    handlerExit(testing.processSingleTraceStep(asset as address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:pool,
        body:TakeWalletAddress{queryId:9,wallet,owner:null}})),0);
    val ready=net.runGetMethod<PoolData>(pool,81689,[]);
    expect(ready.status).toEqual(2);expect(ready.resolutions.isEmpty()).toEqual(true);
    val (_,assetHash)=asset.getWorkchainAndHash();val (_,walletHash)=wallet.getWorkchainAndHash();
    expect(ready.walletsByAssets.mustGet(assetHash) as slice).toEqual(wallet as slice);
    expect(ready.assetsByWallets.mustGet(walletHash) as slice).toEqual(asset as slice);
    expect(ready.depositActive).toEqual(true);expect(ready.swapActive).toEqual(true);
}

get fun `test readable full pool controller clears protocol counters and creator clears its own counters`() {
    val owner=testing.treasury("handler-fees-owner");
    val asset=testing.treasury("handler-fees-asset").address as any_address;
    val wallet=testing.treasury("handler-fees-wallet").address as any_address;
    val pool=deployHandlerCandidate(handlerState(PoolInitialized{},owner.address as any_address,asset,wallet));
    handlerExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:pool,
        body:ClaimProtocolFees{queryId:9,to:handlerNone(),excessesTo:handlerNone()}})),0);
    val afterProtocol=net.runGetMethod<PoolData>(pool,81689,[]);
    expect(afterProtocol.protocolX).toEqual(0);expect(afterProtocol.protocolY).toEqual(0);
    expect(afterProtocol.creatorX).toEqual(13);expect(afterProtocol.creatorY).toEqual(17);
    handlerExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:pool,
        body:ClaimCreatorFees{queryId:10,to:handlerNone(),excessesTo:handlerNone()}})),0);
    val afterCreator=net.runGetMethod<PoolData>(pool,81689,[]);
    expect(afterCreator.creatorX).toEqual(0);expect(afterCreator.creatorY).toEqual(0);
    expect(afterCreator.xCheckpoint).toEqual(19);expect(afterCreator.yCheckpoint).toEqual(23);
}

get fun `test readable full pool failed native payment commits refund without altering reserves`() {
    val owner=testing.treasury("handler-refund-owner");
    val asset=testing.treasury("handler-refund-asset").address as any_address;
    val wallet=testing.treasury("handler-refund-wallet").address as any_address;
    val pool=deployHandlerCandidate(handlerState(PoolInitialized{},owner.address as any_address,asset,wallet));
    val payment=beginCell().storeUint(0x2eb87df9,32).storeUint(1700000100,40).endCell();
    val payout=beginCell().storeSlice(owner.address as slice).storeCoins(0).storeDict(null).storeBool(false)
        .storeSlice(owner.address as slice).storeCoins(0).storeDict(null).storeBool(false).storeSlice(owner.address as slice).endCell();
    handlerExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:pool,
        body:PayNative{queryId:9,amount:0,payment,payout}})),47);
    val data=net.runGetMethod<PoolData>(pool,81689,[]);
    expect(data.reserveX).toEqual(100000000000);expect(data.reserveY).toEqual(200000000000);expect(data.liquidity).toEqual(1000000);
}
