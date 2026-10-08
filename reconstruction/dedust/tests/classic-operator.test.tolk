import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@acton/types/message"

fun operatorExit(result:SendResult,expected:int) {
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}

fun createOperator():(address,Treasury,Treasury) {
    testing.setNow(1700000000);
    val owner=testing.treasury("target-owner");
    val beneficiary=testing.treasury("target-beneficiary");
    val data=beginCell().storeSlice(owner.address as slice).storeUint(42,8).storeUint(17,8).endCell();
    val deployment:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data}};
    val address=deployment.calculateAddress();testing.setShardAccount(address,null);
    val body=beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(createEmptyCell()).storeUint(7,16)
        .storeRef(build("ClassicOperator")).storeSlice(beneficiary.address as slice).endCell();
    operatorExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:deployment,body:body.beginParse()})),0);
    return(address,owner,beneficiary);
}

get fun `test source-built ClassicOperator equals mainnet`() {
    expect(build("ClassicOperator").hash()).toEqual(build("target-oracle","oracles/ClassicOperator.boc").hash());
}

get fun `test ClassicBlank initializes Operator owner version kind beneficiary and unlock`() {
    val (target,owner,beneficiary)=createOperator();
    val data=net.runGetMethod<(any_address,int,any_address,int)>(target,79987,[]);
    expect(data.0 as slice).toEqual(owner.address as slice);expect(data.1).toEqual(17);
    expect(data.2 as slice).toEqual(beneficiary.address as slice);expect(data.3).toEqual(0);
    expect(net.runGetMethod<int>(target,82320,[])).toEqual(7);
}

struct(0xcafe1122) OperatorForwardedPayload {value:uint8}

get fun `test Operator beneficiary changes enforce authorization and 48 hour withdrawal boundary`() {
    val (target,owner,oldBeneficiary)=createOperator();
    val next=testing.treasury("target-next");
    val change=beginCell().storeUint(1223010653,32).storeUint(123,64).storeSlice(next.address as slice).endCell();
    operatorExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("1"),dest:target,body:change.beginParse()})),0);
    val data=net.runGetMethod<(any_address,int,any_address,int)>(target,79987,[]);
    expect(data.2 as slice).toEqual(next.address as slice);expect(data.3).toEqual(1700172800);
    val payload=OperatorForwardedPayload{value:7}.toCell();
    val withdrawal=beginCell().storeUint(4053307989,32).storeUint(123,64).storeSlice(owner.address as slice).storeRef(payload).endCell();
    val message=createMessage({bounce:BounceMode.NoBounce,value:ton("0.1"),dest:target,body:withdrawal.beginParse()});
    operatorExit(testing.processSingleTraceStep(oldBeneficiary.address,message),257);
    operatorExit(testing.processSingleTraceStep(next.address,message),297);
    testing.setNow(1700172800);
    val result=testing.processSingleTraceStep(next.address,message);operatorExit(result,0);
    expect(result.outMessages.at<OperatorForwardedPayload>(0).loadBody().value).toEqual(7);
}

get fun `test Operator upgrade failure rolls back and successful upgrade runs installed hook`() {
    val (target,owner,beneficiary)=createOperator();
    val installed=build("upgrade-fixture","build/fixtures/classic-upgrade.boc");
    val reject=beginCell().storeUint(444,32).storeUint(123,64).storeUint(13,16).storeRef(installed).endCell();
    operatorExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("0.1"),dest:target,body:reject.beginParse()})),777);
    expect(net.runGetMethod<int>(target,82320,[])).toEqual(7);
    val accept=beginCell().storeUint(444,32).storeUint(123,64).storeUint(8,16).storeRef(installed).endCell();
    operatorExit(testing.processSingleTraceStep(owner.address,createMessage({bounce:BounceMode.NoBounce,value:ton("0.1"),dest:target,body:accept.beginParse()})),0);
    val data=net.runGetMethod<cell>(target,90046,[]);
    val saved=beginCell().storeSlice(owner.address as slice).storeUint(8,16).storeUint(17,8).storeSlice(beneficiary.address as slice).storeUint(0,32).endCell();
    expect(data.hash()).toEqual(beginCell().storeUint(0xdeadbeef,32).storeRef(saved).endCell().hash());
}
