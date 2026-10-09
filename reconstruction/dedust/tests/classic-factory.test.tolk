import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@acton/types/message"
import "@stdlib/tvm-dicts"

fun factoryExit(result:SendResult,expected:int) {
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}
fun factoryNative():cell {return beginCell().storeUint(0,4).endCell();}
fun factoryJetton():cell {return beginCell().storeUint(1,4).storeInt(0,8).storeUint(75,256).endCell();}
fun factoryData(owner:address,version:int=9):cell {
    var codes=createEmptyDict();
    codes.uDictSetBuilder(4,0,beginCell().storeUint(6,16).storeRef(build("ClassicNativeVault")));
    codes.uDictSetBuilder(4,1,beginCell().storeUint(7,16).storeRef(build("ClassicJettonVault")));
    // The selected Pool implementation is test data; this test never executes it as a Pool.
    val config=beginCell().storeUint(8,16).storeRef(build("ClassicOperator")).storeUint(4,16)
        .storeRef(build("ClassicLiquidityDeposit")).storeDict(codes).storeRef(build("ClassicLpWallet")).endCell();
    return beginCell().storeSlice(owner as slice).storeUint(0,2).storeUint(0,32).storeUint(version,16)
        .storeRef(build("ClassicBlank")).storeRef(config).storeUint(5,16).storeMaybeRef(build("ClassicOperator")).endCell();
}
fun factorySetup(version:int=9):(address,Treasury) {
    testing.setNow(1700000000);val owner=testing.treasury("factory-owner");
    val deployment:AutoDeployAddress={stateInit:{code:build("ClassicFactory"),data:factoryData(owner.address,version)}};
    val target=deployment.calculateAddress();testing.setShardAccount(target,null);
    factoryExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("5"),dest:deployment,body:createEmptyCell()})),0);
    return(target,owner);
}
fun factorySend(from:address,target:address,body:cell):SendResult {
    return testing.processSingleTraceStep(from,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:target,body}));
}
fun factoryWire(result:SendResult,index:int=0):TlbMessageRelaxedGeneric {
    return (result.outMessages.atCell(index) as Cell<TlbMessageRelaxedGeneric>).load();
}
fun factoryBody(message:TlbMessageRelaxedGeneric):slice {
    var body=message.body;if(body.loadBool()) {body=body.loadRef().beginParse();}return body;
}
fun factoryTemplate(config:cell):AutoDeployAddress {return {stateInit:{code:build("ClassicBlank"),data:config}};}
fun factoryOperator(target:address,role:int):address {
    return factoryTemplate(beginCell().storeSlice(target as slice).storeUint(4,8).storeUint(role,8).endCell()).calculateAddress();
}

get fun `test source-built Factory equals archived mainnet`() {
    expect(build("ClassicFactory").hash()).toEqual(build("factory-oracle","oracles/ClassicFactory.boc").hash());
}
get fun `test Factory ownership transfer enforces authorization and 48 hour boundary`() {
    val (target,owner)=factorySetup();val next=testing.treasury("factory-next");
    val transfer=beginCell().storeUint(0xca61554e,32).storeUint(123,64).storeSlice(next.address as slice).endCell();
    factoryExit(factorySend(next.address,target,transfer),256);factoryExit(factorySend(owner.address,target,transfer),0);
    val pending=net.runGetMethod<(any_address,any_address,int)>(target,110004,[]);
    expect(pending.1 as slice).toEqual(next.address as slice);expect(pending.2).toEqual(1700172800);
    val accept=beginCell().storeUint(0xdee60404,32).storeUint(123,64).endCell();
    factoryExit(factorySend(next.address,target,accept),258);testing.setNow(1700172800);
    factoryExit(factorySend(next.address,target,accept),0);
    val accepted=net.runGetMethod<(any_address,any_address,int)>(target,110004,[]);
    expect(accepted.0 as slice).toEqual(next.address as slice);expect(accepted.2).toEqual(0);
}
get fun `test Factory deploys source-built native Vault through actual Blank message`() {
    val (target,owner)=factorySetup();val asset=factoryNative();
    val result=factorySend(owner.address,target,beginCell().storeUint(0x21cfe02b,32).storeUint(123,64).storeSlice(asset.beginParse()).endCell());
    factoryExit(result,0);expect(result.outMessages.size()).toEqual(1);
    val config=beginCell().storeSlice(target as slice).storeUint(1,8).storeSlice(asset.beginParse()).endCell();
    val deployment=factoryTemplate(config);val outgoing=factoryWire(result);
    expect(outgoing.info.dest as slice).toEqual(deployment.calculateAddress() as slice);
    expect(net.runGetMethod<any_address>(target,76695,[asset.beginParse()]) as slice).toEqual(deployment.calculateAddress() as slice);
    testing.setShardAccount(deployment.calculateAddress(),null);
    factoryExit(testing.processSingleTraceStep(target,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:deployment,body:factoryBody(outgoing)})),0);
    expect(net.runGetMethod<int>(deployment.calculateAddress(),82320,[])).toEqual(6);
    expect(net.runGetMethod<int>(deployment.calculateAddress(),109867,[])).toEqual(0);
    expect(net.runGetMethod<any_address>(deployment.calculateAddress(),89995,[]) as slice).toEqual(target as slice);
}
get fun `test Factory sorts Pool assets and serializes installed code fee and wallet`() {
    val (target,owner)=factorySetup();val native=factoryNative();val jetton=factoryJetton();
    val result=factorySend(owner.address,target,beginCell().storeUint(0x97d51f2f,32).storeUint(123,64)
        .storeSlice(jetton.beginParse()).storeSlice(native.beginParse()).endCell());factoryExit(result,0);
    val expected=beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(build("ClassicBlank"))
        .storeUint(8,16).storeRef(build("ClassicOperator")).storeUint(25,16).storeRef(build("ClassicLpWallet"))
        .storeUint(0,8).storeUint(0,8).endCell();
    expect(beginCell().storeSlice(factoryBody(factoryWire(result))).endCell().hash()).toEqual(expected.hash());
    val config=beginCell().storeSlice(target as slice).storeUint(2,8).storeUint(0,1)
        .storeSlice(native.beginParse()).storeSlice(jetton.beginParse()).endCell();
    expect(factoryWire(result).info.dest as slice).toEqual(factoryTemplate(config).calculateAddress() as slice);
}
get fun `test Factory registry binds Operator proof and advances exactly one version`() {
    val (target,owner)=factorySetup();val payload=beginCell().storeUint(0xcafe,16).endCell();
    val upgrade=beginCell().storeUint(0xa3e45df1,32).storeUint(123,64).storeUint(9,16).storeRef(payload).endCell();
    factoryExit(factorySend(owner.address,target,upgrade),296);
    factoryExit(factorySend(factoryOperator(target,1),target,upgrade),0);
    val code=net.runGetMethod<(int,cell)>(target,79554,[]);expect(code.0).toEqual(9);expect(code.1.hash()).toEqual(payload.hash());
    factoryExit(factorySend(factoryOperator(target,1),target,upgrade),275);
}
get fun `test Factory funds canonical Deposit in two actual peer messages`() {
    val (target,owner)=factorySetup();val native=factoryNative();val jetton=factoryJetton();
    val descriptor=beginCell().storeSlice(target as slice).storeUint(1,8).storeSlice(native.beginParse()).endCell();
    val request=beginCell().storeUint(4031694118,32).storeUint(123,64).storeRef(descriptor).storeSlice(owner.address as slice)
        .storeUint(0,1).storeSlice(native.beginParse()).storeSlice(jetton.beginParse())
        .storeRef(beginCell().storeCoins(500).storeCoins(600).storeSlice(native.beginParse()).storeCoins(100).storeCoins(700).endCell())
        .storeMaybeRef(null).storeMaybeRef(null).endCell();
    val vault=factoryTemplate(descriptor).calculateAddress();val result=factorySend(vault,target,request);factoryExit(result,0);
    expect(result.outMessages.size()).toEqual(2);
    val config=beginCell().storeSlice(target as slice).storeUint(3,8).storeRef(beginCell().storeSlice(owner.address as slice)
        .storeUint(0,1).storeSlice(native.beginParse()).storeSlice(jetton.beginParse()).endCell()).endCell();
    val deployment=factoryTemplate(config);val address=deployment.calculateAddress();testing.setShardAccount(address,null);
    val install=factoryWire(result);val credit=factoryWire(result,1);
    expect(install.info.dest as slice).toEqual(address as slice);expect(credit.info.dest as slice).toEqual(address as slice);
    factoryExit(testing.processSingleTraceStep(target,createMessage({bounce:BounceMode.NoBounce,value:install.info.value.grams,dest:deployment,body:factoryBody(install)})),0);
    factoryExit(testing.processSingleTraceStep(target,createMessage({bounce:BounceMode.NoBounce,value:credit.info.value.grams,dest:address,body:factoryBody(credit)})),0);
    val amounts=net.runGetMethod<(int,int)>(address,87878,[]);expect(amounts.0).toEqual(100);expect(amounts.1).toEqual(0);
    expect(net.runGetMethod<any_address>(address,89995,[]) as slice).toEqual(target as slice);
}
get fun `test Factory deploys actual Operator and assigns beneficiary`() {
    val (target,owner)=factorySetup();val user=testing.treasury("factory-user");
    val result=factorySend(owner.address,target,beginCell().storeUint(0xb9d29997,32).storeUint(123,64).storeUint(9,8).storeSlice(user.address as slice).endCell());
    factoryExit(result,0);val config=beginCell().storeSlice(target as slice).storeUint(4,8).storeUint(9,8).endCell();
    val deployment=factoryTemplate(config);val outgoing=factoryWire(result);testing.setShardAccount(deployment.calculateAddress(),null);
    factoryExit(testing.processSingleTraceStep(target,createMessage({bounce:BounceMode.NoBounce,value:outgoing.info.value.grams,dest:deployment,body:factoryBody(outgoing)})),0);
    val data=net.runGetMethod<(any_address,int,any_address,int)>(deployment.calculateAddress(),79987,[]);
    expect(data.0 as slice).toEqual(target as slice);expect(data.1).toEqual(9);expect(data.2 as slice).toEqual(user.address as slice);
}
get fun `test Factory upgrade calls installed hook and rolls back failed migration`() {
    val (target,owner)=factorySetup();val replacement=build("factory-upgrade","build/fixtures/factory-upgrade.boc");
    val accepted=beginCell().storeUint(0xdf4a27aa,32).storeUint(123,64).storeUint(10,16).storeRef(replacement).endCell();
    factoryExit(factorySend(owner.address,target,accepted),0);
    expect(net.runGetMethod<cell>(target,90046,[]).hash()).toEqual(beginCell().storeUint(0xdeadbeef,32).storeRef(factoryData(owner.address,10)).endCell().hash());
    val (failingTarget,failingOwner)=factorySetup(12);
    val rejected=beginCell().storeUint(0xdf4a27aa,32).storeUint(123,64).storeUint(13,16).storeRef(replacement).endCell();
    factoryExit(factorySend(failingOwner.address,failingTarget,rejected),777);expect(net.runGetMethod<int>(failingTarget,82320,[])).toEqual(12);
}
