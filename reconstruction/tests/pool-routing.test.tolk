import "@acton/build"
import "@acton/emulation/testing"
import "@acton/emulation/network"
import "@acton/testing/expect"
import "@acton/types/out_actions"
import "../dedust/cpmm/CpmmPoolV2/routing"
import "../dedust/cpmm/CpmmPoolV2/affiliate-deployment"
import "../dedust/cpmm/CpmmPoolV2/payout-basic"
import "../dedust/cpmm/CpmmPoolV2/payout-config"

fun routingNone(): any_address asm "b{00} PUSHSLICE"

get fun `test pool native routed swap carries typed limits and both configuration refs`() {
    val nextPool=testing.treasury("route-native").address as any_address;
    val payout=beginCell().storeUint(7,8).endCell();
    val payload: PoolSwapPayload={minimalAmountOut:17,deadline:1000,next:null,partner:null,referrer:null};
    routePoolSwap(routingNone(),nextPool,routingNone(),routingNone(),9,100,payload,payout,-1);
    val payment=beginCell().storeUint(0xc442500f,32).storeCoins(17).storeUint(1000,40)
        .storeDict(null).storeBool(false).storeBool(false).endCell();
    val body=beginCell().storeUint(0xa5a7cbf8,32).storeUint(9,64).storeCoins(100).storeRef(payment).storeRef(payout).endCell();
    val expected=beginCell().storeUint(0x10,6).storeSlice(nextPool as slice).storeUint(1,111).storeRef(body).endCell();
    val actions=testing.outActions();expect(actions.size()).toEqual(1);
    val action=actions.getSendMessageAt(0)!;expect(action.mode).toEqual(144);
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool jetton routed swap retains partner referrer next and gas reserve`() {
    val asset=testing.treasury("route-jetton-asset").address as any_address;
    val wallet=testing.treasury("route-jetton-wallet").address as any_address;
    val nextPool=testing.treasury("route-jetton-pool").address as any_address;
    val excesses=testing.treasury("route-jetton-excesses").address as any_address;
    val next=beginCell().storeUint(7,8).endCell();
    val payout=beginCell().storeUint(13,8).endCell();
    val payload:PoolSwapPayload={minimalAmountOut:17,deadline:1000,next,
        partner:{identity:123,fee:250},referrer:{identity:456,fee:300}};
    routePoolSwap(asset,nextPool,wallet,excesses,9,100,payload,payout,50000017);
    val payment=beginCell().storeUint(0xc442500f,32).storeCoins(17).storeUint(1000,40).storeDict(next)
        .storeBool(true).storeUint(123,256).storeUint(250,16)
        .storeBool(true).storeUint(456,256).storeUint(300,16).endCell();
    val notification=beginCell().storeUint(0xcbc33949,32).storeRef(payment).storeRef(payout).endCell();
    val body=beginCell().storeUint(0x0f8a7ea5,32).storeUint(9,64).storeCoins(100)
        .storeSlice(nextPool as slice).storeSlice(excesses as slice).storeDict(null).storeCoins(17)
        .storeBool(true).storeRef(notification).endCell();
    val expected=beginCell().storeUint(0x10,6).storeSlice(wallet as slice).storeUint(1,111).storeRef(body).endCell();
    val action=testing.outActions().getSendMessageAt(0)!;expect(action.mode).toEqual(144);
    expect(action.outMsg.hash()).toEqual(expected.hash());
}

get fun `test pool routed swap rejects negative remaining forward gas and unsupported assets`() {
    val asset=testing.treasury("route-error-asset").address as any_address;
    val payload:PoolSwapPayload={minimalAmountOut:0,deadline:0,next:null,partner:null,referrer:null};
    var exit=0;
    try {routePoolSwap(asset,asset,asset,asset,9,1,payload,createEmptyCell(),49999999);}
    catch(e){exit=e;}
    expect(exit).toEqual(5);
    exit=0;
    val external=beginCell().storeUint(1,2).storeUint(16,9).storeUint(0xabcd,16).endCell().beginParse() as any_address;
    try {routePoolSwap(external,asset,asset,asset,9,1,payload,createEmptyCell(),50000000);}
    catch(e){exit=e;}
    expect(exit).toEqual(31);
}

get fun `test pool basic payout replaces invalid addresses without changing options`() {
    val fallback=testing.treasury("route-payout-fallback").address as any_address;
    val payload=beginCell().storeUint(7,8).endCell();
    val result=normalizePoolBasicPayout({options:{destination:routingNone(),extraGas:17,payload,wrapPayload:true},excessesTo:routingNone()},fallback);
    expect(result.options.destination as slice).toEqual(fallback as slice);
    expect(result.excessesTo as slice).toEqual(fallback as slice);
    expect(result.options.extraGas).toEqual(17);expect(result.options.payload!.hash()).toEqual(payload.hash());
    expect(result.options.wrapPayload).toEqual(true);
}

get fun `test pool affiliate deployment loads source built library and serializes both kinds`() {
    val library=build("CpmmAffiliateAccount");testing.registerLibrary(library);
    // Registering a library affects subsequent emulators, so invoke this
    // helper through a separate contract instead of the already running test VM.
    val sender=testing.treasury("route-affiliate-probe");
    val probe:AutoDeployAddress={stateInit:{code:build("AffiliateProbe","tests/fixtures/pool-affiliate.tolk"),data:createEmptyCell()}};
    val destination=probe.calculateAddress();testing.setShardAccount(destination,null);
    testing.processSingleTraceStep(sender.address,createMessage({
        bounce:BounceMode.NoBounce,value:ton("1"),dest:probe,body:createEmptyCell(),
    }));
    var kind=132;
    repeat(2) {
        val (workchain,code,initialData)=net.runGetMethod<(int,cell,cell)>(destination,90046,[kind,123,250]);
        expect(workchain).toEqual(0);expect(code.hash()).toEqual(library.hash());
        var data=initialData.beginParse();
        expect(data.loadBool()).toEqual(false);
        val authority=data.loadAddress();
        val expectedAuthority=address.fromWorkchainAndHash(0,0xc3b3320cd3c61cc31f3272fcf9327fe141d3e3dfc16d1bd6e9d17418c348f913);
        expect(authority as slice).toEqual(expectedAuthority as slice);
        expect(data.loadBool()).toEqual(kind != 132);
        expect(data.loadDict()).toEqual(null);
        expect(data.loadUint(256)).toEqual(123);expect(data.loadUint(16)).toEqual(250);
        expect(data.loadUint(2)).toEqual(0);data.assertEnd();
        kind=163;
    }
}
