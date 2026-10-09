import "@acton/build"
import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/transaction"
import "@acton/types/message"

fun jettonExit(result:SendResult,expected:int) {
    val description=result.tx.load().description.load();assert(description is TlbTransOrd) throw 567;
    val compute=description.computePh;assert(compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}
fun jettonAsset(master:address):cell {
    var account=master as slice;account.skipBits(3);return beginCell().storeUint(1,4).storeSlice(account).endCell();
}
fun jettonDescriptor(factory:address,master:address):cell {
    return beginCell().storeSlice(factory as slice).storeUint(1,8).storeSlice(jettonAsset(master).beginParse()).endCell();
}
fun jettonNative():cell {return beginCell().storeUint(0,4).endCell();}
fun jettonSend(from:address,target:address,body:cell):SendResult {
    return testing.processSingleTraceStep(from,createMessage({bounce:BounceMode.NoBounce,value:ton("0.5"),dest:target,body}));
}
fun jettonWire(result:SendResult):TlbMessageRelaxedGeneric {
    return (result.outMessages.atCell(0) as Cell<TlbMessageRelaxedGeneric>).load();
}
fun jettonBody(message:TlbMessageRelaxedGeneric):slice {
    var body=message.body;if(body.loadBool()) {body=body.loadRef().beginParse();}return body;
}
fun jettonResolve(wallet:address):cell {
    return beginCell().storeUint(3513996288,32).storeUint(123,64).storeSlice(wallet as slice).storeUint(0,1).endCell();
}
fun jettonSetup(activate:bool):(address,Treasury,Treasury,Treasury,Treasury) {
    testing.setNow(1700000000);
    val factory=testing.treasury("jetton-vault-factory");val master=testing.treasury("jetton-vault-master");
    val wallet=testing.treasury("jetton-vault-wallet");val owner=testing.treasury("jetton-vault-owner");
    val target:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data:jettonDescriptor(factory.address,master.address)}};
    testing.setShardAccount(target.calculateAddress(),null);
    val body=beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(build("ClassicBlank")).storeUint(9,16).storeRef(build("ClassicJettonVault")).endCell();
    val result=testing.processSingleTraceStep(factory.address,createMessage({bounce:BounceMode.NoBounce,value:ton("5"),dest:target,body}));jettonExit(result,0);
    expect(result.outMessages.size()).toEqual(1);val message=jettonWire(result);expect(message.info.dest as slice).toEqual(master.address as slice);
    var request=jettonBody(message);expect(request.loadUint(32)).toEqual(745978227);expect(request.loadUint(64)).toEqual(0);
    expect(request.loadAddress() as slice).toEqual(target.calculateAddress() as slice);expect(request.loadBool()).toBeFalse();
    if(activate) {jettonExit(jettonSend(master.address,target.calculateAddress(),jettonResolve(wallet.address)),0);}
    return(target.calculateAddress(),factory,master,wallet,owner);
}
fun jettonNotify(payload:cell,owner:address,referenced:bool):cell {
    var body=beginCell().storeUint(1935855772,32).storeUint(123,64).storeCoins(100).storeSlice(owner as slice).storeBool(referenced);
    if(referenced) {body=body.storeRef(payload);}else {body=body.storeSlice(payload.beginParse());}return body.endCell();
}
fun jettonPoolConfig(factory:address,master:address):cell {
    return beginCell().storeSlice(factory as slice).storeUint(2,8).storeUint(0,1).storeSlice(jettonAsset(master).beginParse()).storeSlice(jettonNative().beginParse()).endCell();
}
fun jettonTemplate(data:cell):address {
    val deployment:AutoDeployAddress={stateInit:{code:build("ClassicBlank"),data}};return deployment.calculateAddress();
}

get fun `test source-built ClassicJettonVault equals archived mainnet`() {
    expect(build("ClassicJettonVault").hash()).toEqual(build("jetton-vault-oracle","oracles/ClassicJettonVault.boc").hash());
}
get fun `test constructor requests wallet and master alone can activate vault`() {
    val (target,factory,master,wallet,owner)=jettonSetup(false);expect(net.runGetMethod<int>(target,66908,[])).toEqual(0);
    expect(net.runGetMethod<int>(target,82320,[])).toEqual(9);expect(net.runGetMethod<slice>(target,89352,[])).toEqual(jettonAsset(master.address).beginParse());
    expect(net.runGetMethod<slice>(target,89995,[])).toEqual(factory.address as slice);
    jettonExit(jettonSend(owner.address,target,jettonResolve(wallet.address)),257);
    jettonExit(jettonSend(master.address,target,jettonResolve(wallet.address)),0);expect(net.runGetMethod<int>(target,66908,[])).toEqual(-1);
    expect(net.runGetMethod<slice>(target,69014,[])).toEqual(wallet.address as slice);jettonExit(jettonSend(master.address,target,jettonResolve(wallet.address)),274);
}
get fun `test authorized jetton swap preserves inline forward payload and body`() {
    val (target,factory,master,wallet,owner)=jettonSetup(true);val pool=jettonTemplate(jettonPoolConfig(factory.address,master.address));
    val callback=beginCell().storeUint(0xcafe,16).endCell();
    val payload=beginCell().storeUint(3818968194,32).storeSlice(pool as slice).storeUint(1,1).storeCoins(321).storeUint(0,1).storeRef(callback).endCell();
    val result=jettonSend(wallet.address,target,jettonNotify(payload,owner.address,false));jettonExit(result,0);expect(result.outMessages.size()).toEqual(1);
    val message=jettonWire(result);expect(message.info.dest as slice).toEqual(pool as slice);
    val expected=beginCell().storeUint(1643009069,32).storeUint(123,64).storeRef(jettonDescriptor(factory.address,master.address)).storeCoins(100)
        .storeSlice(owner.address as slice).storeUint(1,1).storeCoins(321).storeUint(0,1).storeRef(callback).endCell();
    expect(beginCell().storeSlice(jettonBody(message)).endCell().hash()).toEqual(expected.hash());
}
get fun `test jetton liquidity notification sends factory funded asset and targets`() {
    val (target,factory,master,wallet,owner)=jettonSetup(true);
    val asset=jettonAsset(master.address);val payload=beginCell().storeUint(1088489686,32).storeUint(0,1).storeSlice(asset.beginParse())
        .storeSlice(jettonNative().beginParse()).storeCoins(700).storeCoins(500).storeCoins(600).storeUint(0,1).storeUint(0,1).endCell();
    val result=jettonSend(wallet.address,target,jettonNotify(payload,owner.address,true));jettonExit(result,0);val message=jettonWire(result);
    expect(message.info.dest as slice).toEqual(factory.address as slice);
    val expected=beginCell().storeUint(4031694118,32).storeUint(123,64).storeRef(jettonDescriptor(factory.address,master.address)).storeSlice(owner.address as slice)
        .storeUint(0,1).storeSlice(asset.beginParse()).storeSlice(jettonNative().beginParse())
        .storeRef(beginCell().storeCoins(500).storeCoins(600).storeSlice(asset.beginParse()).storeCoins(100).storeCoins(700).endCell()).storeUint(0,1).storeUint(0,1).endCell();
    expect(beginCell().storeSlice(jettonBody(message)).endCell().hash()).toEqual(expected.hash());
}
get fun `test unknown notification payload commits refund despite exception`() {
    val (target,factory,master,wallet,owner)=jettonSetup(true);
    val result=jettonSend(wallet.address,target,jettonNotify(beginCell().storeUint(42,32).endCell(),owner.address,true));
    jettonExit(result,65535);expect(result.outMessages.size()).toEqual(1);val message=jettonWire(result);
    expect(message.info.dest as slice).toEqual(wallet.address as slice);var body=jettonBody(message);
    expect(body.loadUint(32)).toEqual(260734629);expect(body.loadUint(64)).toEqual(123);expect(body.loadCoins()).toEqual(100);
    expect(body.loadAddress() as slice).toEqual(owner.address as slice);expect(body.loadAddress() as slice).toEqual(owner.address as slice);
    expect(body.loadBool()).toBeFalse();expect(body.loadCoins()).toEqual(0);expect(body.loadBool()).toBeFalse();
    expect(net.runGetMethod<int>(target,66908,[])).toEqual(-1);
}
get fun `test inactive notification refunds without decoding malformed payload`() {
    val (target,factory,master,wallet,owner)=jettonSetup(false);
    val result=jettonSend(wallet.address,target,jettonNotify(createEmptyCell(),owner.address,false));jettonExit(result,0);
    expect(result.outMessages.size()).toEqual(1);expect(jettonWire(result).info.dest as slice).toEqual(wallet.address as slice);
    expect(net.runGetMethod<int>(target,66908,[])).toEqual(0);
}
get fun `test authentic pool payout sends TEP74 request to resolved wallet`() {
    val (target,factory,master,wallet,owner)=jettonSetup(true);val config=jettonPoolConfig(factory.address,master.address);
    val body=beginCell().storeUint(2907617013,32).storeUint(123,64).storeRef(config).storeCoins(100).storeSlice(owner.address as slice).storeUint(0,1).endCell();
    jettonExit(jettonSend(owner.address,target,body),265);
    val result=jettonSend(jettonTemplate(config),target,body);jettonExit(result,0);expect(jettonWire(result).info.dest as slice).toEqual(wallet.address as slice);
    var transfer=jettonBody(jettonWire(result));expect(transfer.loadUint(32)).toEqual(260734629);expect(transfer.loadUint(64)).toEqual(123);
    expect(transfer.loadCoins()).toEqual(100);expect(transfer.loadAddress() as slice).toEqual(owner.address as slice);
    expect(transfer.loadAddress() as slice).toEqual(owner.address as slice);expect(transfer.loadBool()).toBeFalse();expect(transfer.loadCoins() > 0).toBeTrue();
}
get fun `test factory cancels unready vault and sends balance refund`() {
    val (target,factory,master,wallet,owner)=jettonSetup(false);val cancel=beginCell().storeUint(2640660523,32).endCell();
    jettonExit(jettonSend(owner.address,target,cancel),259);val result=jettonSend(factory.address,target,cancel);jettonExit(result,0);
    expect(result.outMessages.size()).toEqual(1);expect(jettonWire(result).info.dest as slice).toEqual(factory.address as slice);expect(testing.getAccountState(target) == null).toBeTrue();
}
get fun `test jetton vault upgrade hook failure rolls back and successful hook executes`() {
    val (target,factory,master,wallet,owner)=jettonSetup(true);val replacement=build("jetton-vault-upgrade","build/fixtures/jetton-vault-upgrade.boc");
    val failing=beginCell().storeUint(444,32).storeUint(123,64).storeUint(13,16).storeRef(replacement).endCell();
    jettonExit(jettonSend(factory.address,target,failing),777);expect(net.runGetMethod<int>(target,82320,[])).toEqual(9);
    val body=beginCell().storeUint(444,32).storeUint(123,64).storeUint(10,16).storeRef(replacement).endCell();
    jettonExit(jettonSend(owner.address,target,body),259);jettonExit(jettonSend(factory.address,target,body),0);
    var data=net.runGetMethod<cell>(target,90046,[]).beginParse();expect(data.loadUint(32)).toEqual(0xdeadbeef);
    var previous=data.loadRef().beginParse();previous.loadRef();previous.loadRef();expect(previous.loadBool()).toBeTrue();
    expect(previous.loadAddress() as slice).toEqual(master.address as slice);expect(previous.loadAddress() as slice).toEqual(wallet.address as slice);expect(previous.loadUint(16)).toEqual(10);
}
