import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@acton/types/message"

fun liquidityExit(result:SendResult,expected:int) {
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}
fun liquidityAsset0():cell {return beginCell().storeUint(0,4).endCell();}
fun liquidityAsset1():cell {return beginCell().storeUint(1,4).storeInt(0,8).storeUint(65,256).endCell();}
fun liquidityDescriptor(factory:address,owner:address):cell {
    return beginCell().storeSlice(factory as slice).storeUint(3,8)
        .storeRef(beginCell().storeSlice(owner as slice).storeUint(0,1)
            .storeSlice(liquidityAsset0().beginParse()).storeSlice(liquidityAsset1().beginParse()).endCell()).endCell();
}
fun liquidityPoolConfig(factory:address):cell {
    return beginCell().storeSlice(factory as slice).storeUint(2,8).storeUint(0,1)
        .storeSlice(liquidityAsset0().beginParse()).storeSlice(liquidityAsset1().beginParse()).endCell();
}
fun liquidityPool(factory:address):address {
    val target:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data:liquidityPoolConfig(factory)}};
    return target.calculateAddress();
}
fun liquidityVault(factory:address,asset:cell):address {
    val target:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data:beginCell()
        .storeSlice(factory as slice).storeUint(1,8).storeSlice(asset.beginParse()).endCell()}};
    return target.calculateAddress();
}
fun liquiditySetup():(address,Treasury,Treasury) {
    testing.setNow(1700000000);
    val owner=testing.treasury("classic-deposit-owner");val factory=testing.treasury("classic-deposit-factory");
    val target:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data:liquidityDescriptor(factory.address,owner.address)}};
    testing.setShardAccount(target.calculateAddress(),null);
    val body=beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(build("ClassicBlank"))
        .storeUint(9,16).storeRef(build("ClassicLiquidityDeposit")).storeCoins(700).storeCoins(500).storeCoins(600)
        .storeUint(0,1).storeUint(0,1).endCell();
    liquidityExit(testing.processSingleTraceStep(factory.address,createMessage({bounce:BounceMode.NoBounce,value:ton("5"),dest:target,body})),0);
    return(target.calculateAddress(),owner,factory);
}
fun liquidityCredit(target:address,factory:address,asset:cell,amount:coins):SendResult {
    val body=beginCell().storeUint(1411649509,32).storeUint(123,64).storeSlice(asset.beginParse()).storeCoins(amount).endCell();
    return testing.processSingleTraceStep(factory,createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body}));
}
fun liquidityAmounts(target:address):(int,int) {return net.runGetMethod<(int,int)>(target,87878,[]);}
fun liquidityPending(target:address):int {return net.runGetMethod<int>(target,108752,[]);}
fun liquidityWire(result:SendResult,index:int):TlbMessageRelaxedGeneric {
    return (result.outMessages.atCell(index) as Cell<TlbMessageRelaxedGeneric>).load();
}
fun liquidityBody(message:TlbMessageRelaxedGeneric):slice {
    var body=message.body;if(body.loadBool()) {body=body.loadRef().beginParse();}return body;
}
fun liquidityReady():(address,Treasury,Treasury) {
    val (target,owner,factory)=liquiditySetup();
    liquidityExit(liquidityCredit(target,factory.address,liquidityAsset0(),500),0);
    liquidityExit(liquidityCredit(target,factory.address,liquidityAsset1(),600),0);
    expect(liquidityPending(target)).toEqual(-1);return(target,owner,factory);
}

get fun `test source-built ClassicLiquidityDeposit equals mainnet`() {
    expect(build("ClassicLiquidityDeposit").hash()).toEqual(build("liquidity-oracle","oracles/ClassicLiquidityDeposit.boc").hash());
}
get fun `test Blank constructs liquidity deposit and all getters expose its schema`() {
    val (target,owner,factory)=liquiditySetup();
    expect(net.runGetMethod<any_address>(target,95132,[]) as slice).toEqual(owner.address as slice);
    expect(net.runGetMethod<any_address>(target,89995,[]) as slice).toEqual(factory.address as slice);
    expect(net.runGetMethod<int>(target,85296,[])).toEqual(700);
    val targets=net.runGetMethod<(int,int)>(target,84232,[]);expect(targets.0).toEqual(500);expect(targets.1).toEqual(600);
    val assets=net.runGetMethod<(int,slice,slice)>(target,106125,[]);expect(assets.0).toEqual(0);
    expect(assets.1).toEqual(liquidityAsset0().beginParse());expect(assets.2).toEqual(liquidityAsset1().beginParse());
    expect(net.runGetMethod<any_address>(target,84365,[]) as slice).toEqual(liquidityPool(factory.address) as slice);
    expect(liquidityAmounts(target).0).toEqual(0);expect(liquidityAmounts(target).1).toEqual(0);expect(liquidityPending(target)).toEqual(0);
}
get fun `test collecting both assets emits canonical pool deposit request`() {
    val (target,owner,factory)=liquiditySetup();
    val first=liquidityCredit(target,factory.address,liquidityAsset0(),500);liquidityExit(first,0);expect(first.outMessages.size()).toEqual(0);
    expect(liquidityAmounts(target).0).toEqual(500);expect(liquidityPending(target)).toEqual(0);
    val second=liquidityCredit(target,factory.address,liquidityAsset1(),600);liquidityExit(second,0);expect(second.outMessages.size()).toEqual(1);
    expect(liquidityAmounts(target).1).toEqual(600);expect(liquidityPending(target)).toEqual(-1);
    val message=liquidityWire(second,0);expect(message.info.dest as slice).toEqual(liquidityPool(factory.address) as slice);
    val expected=beginCell().storeUint(3043726744,32).storeUint(123,64).storeRef(liquidityDescriptor(factory.address,owner.address))
        .storeSlice(owner.address as slice).storeCoins(700).storeRef(beginCell().storeSlice(liquidityAsset0().beginParse()).storeCoins(500)
            .storeSlice(liquidityAsset1().beginParse()).storeCoins(600).endCell()).storeUint(0,1).storeUint(0,1).endCell();
    expect(beginCell().storeSlice(liquidityBody(message)).endCell().hash()).toEqual(expected.hash());
}
get fun `test owner cancellation returns both assets and deletes deposit`() {
    val (target,owner,factory)=liquiditySetup();liquidityExit(liquidityCredit(target,factory.address,liquidityAsset0(),100),0);
    val cancel=beginCell().storeUint(376237550,32).storeUint(123,64).storeUint(0,1).endCell();
    val result=testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body:cancel}));
    liquidityExit(result,0);expect(result.outMessages.size()).toEqual(3);
    expect(liquidityWire(result,0).info.dest as slice).toEqual(liquidityVault(factory.address,liquidityAsset0()) as slice);
    expect(liquidityWire(result,1).info.dest as slice).toEqual(liquidityVault(factory.address,liquidityAsset1()) as slice);
    expect(liquidityWire(result,2).info.dest as slice).toEqual(owner.address as slice);
    var refund=liquidityBody(liquidityWire(result,0));expect(refund.loadUint(32)).toEqual(1795913855);expect(refund.loadUint(64)).toEqual(123);
    expect(refund.loadRef().hash()).toEqual(liquidityDescriptor(factory.address,owner.address).hash());expect(refund.loadCoins()).toEqual(100);
    expect(testing.getAccountState(target) == null).toBeTrue();
}
get fun `test pending deposit refunds extra asset and enforces authorization`() {
    val (target,owner,factory)=liquidityReady();
    val result=liquidityCredit(target,factory.address,liquidityAsset0(),99);liquidityExit(result,0);expect(result.outMessages.size()).toEqual(1);
    var refund=liquidityBody(liquidityWire(result,0));expect(refund.loadUint(32)).toEqual(1795913855);refund.skipBits(64);refund.loadRef();expect(refund.loadCoins()).toEqual(99);
    expect(liquidityAmounts(target).0).toEqual(500);expect(liquidityAmounts(target).1).toEqual(600);
    liquidityExit(liquidityCredit(target,owner.address,liquidityAsset0(),1),259);
    val cancel=beginCell().storeUint(376237550,32).endCell();
    liquidityExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body:cancel})),276);
    expect(liquidityPending(target)).toEqual(-1);
}
get fun `test pool success refunds first excess and returns remainder to owner`() {
    val (target,owner,factory)=liquidityReady();
    val body=beginCell().storeUint(2867302998,32).storeUint(123,64).storeRef(liquidityPoolConfig(factory.address)).storeCoins(450).storeCoins(580).endCell();
    val result=testing.processSingleTraceStep(liquidityPool(factory.address),createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body}));
    liquidityExit(result,0);expect(result.outMessages.size()).toEqual(2);
    expect(liquidityWire(result,0).info.dest as slice).toEqual(liquidityVault(factory.address,liquidityAsset0()) as slice);
    var refund=liquidityBody(liquidityWire(result,0));refund.skipBits(96);refund.loadRef();expect(refund.loadCoins()).toEqual(50);
    expect(liquidityWire(result,1).info.dest as slice).toEqual(owner.address as slice);expect(testing.getAccountState(target) == null).toBeTrue();
}
get fun `test forged response fails and authentic bounced request returns both deposits`() {
    val (target,owner,factory)=liquidityReady();
    val failure=beginCell().storeUint(3785583828,32).storeUint(123,64).storeRef(liquidityPoolConfig(factory.address)).storeUint(0,1).endCell();
    liquidityExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body:failure})),265);
    expect(liquidityPending(target)).toEqual(-1);
    val bounced=beginCell().storeUint(0,32).storeUint(3043726744,32).storeUint(123,64).endCell();
    val result=testing.processSingleTraceStep(liquidityPool(factory.address),createMessage({bounce:BounceMode.NoBounce,value:ton("0.2"),dest:target,body:bounced}).bounced());
    liquidityExit(result,0);expect(result.outMessages.size()).toEqual(3);expect(testing.getAccountState(target) == null).toBeTrue();
}
