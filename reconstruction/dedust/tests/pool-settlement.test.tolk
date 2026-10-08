import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@acton/types/out_actions"
import "../CpmmPoolV2/settlement"
import "../CpmmPoolV2/wallets"
import "../CpmmPoolV2/payout-config"

fun settlementNone():any_address asm "b{00} PUSHSLICE"

get fun `test pool settlement emits X then Y reserve and excesses with preserved modes`() {
    val asset=testing.treasury("settlement-asset").address as any_address;
    val wallet=testing.treasury("settlement-wallet").address as any_address;
    val recipient=testing.treasury("settlement-recipient").address as any_address;
    val excesses=testing.treasury("settlement-excesses").address as any_address;
    val config=beginCell().storeUint(0,2).storeSlice(asset as slice).storeBool(true).endCell();
    val (_,key)=asset.getWorkchainAndHash();
    var lookup:AddressLookup=[];lookup.set(key,wallet);
    val wallets:PoolWallets={walletsByAssets:lookup,assetsByWallets:[],resolutions:[]};
    settlePoolAssets(9,config,wallets,11,13,{destination:recipient,extraGas:17,payload:null,wrapPayload:false},excesses,false);
    val actions=testing.outActions();expect(actions.size()).toEqual(4);
    expect(actions.getSendMessageAt(0)!.mode).toEqual(130);
    val reserve=actions.at(1);assert(reserve is TlbOutActionReserveCurrency) throw 567;
    expect(reserve.mode).toEqual(2);
    expect(actions.getSendMessageAt(2)!.mode).toEqual(17);
    expect(actions.getSendMessageAt(3)!.mode).toEqual(17);
    val native=beginCell().storeUint(0x10,6).storeSlice(recipient as slice).storeCoins(28)
        .storeUint(0x3216ca09,139).storeUint(9,64).storeCoins(11).storeInt(0,32).storeDict(null).endCell();
    expect(actions.getSendMessageAt(3)!.outMsg.hash()).toEqual(native.hash());
    var jetton=actions.getSendMessageAt(2)!.outMsg.beginParse();
    expect(jetton.loadUint(6)).toEqual(0x10);expect(jetton.loadAddressAny() as slice).toEqual(wallet as slice);
    expect(jetton.loadCoins()).toEqual(50000017);jetton.skipBits(107);
    var body=jetton.loadRef().beginParse();jetton.assertEnd();
    expect(body.loadUint(32)).toEqual(0x0f8a7ea5);expect(body.loadUint(64)).toEqual(9);expect(body.loadCoins()).toEqual(13);
    expect(body.loadAddressAny() as slice).toEqual(recipient as slice);expect(body.loadAddressAny() as slice).toEqual(excesses as slice);
    expect(body.loadDict()).toEqual(null);expect(body.loadCoins()).toEqual(17);expect(body.loadBool()).toEqual(false);body.assertEnd();
}

get fun `test pool settlement skips nonpositive payouts and can suppress excesses`() {
    val asset=testing.treasury("settlement-empty-asset").address as any_address;
    val config=beginCell().storeUint(0,2).storeSlice(asset as slice).storeUint(0xff,8).endCell();
    settlePoolAssets(-1,config,{walletsByAssets:[],assetsByWallets:[],resolutions:[]},-1,0,
        {destination:settlementNone(),extraGas:17,payload:null,wrapPayload:true},settlementNone(),true);
    val actions=testing.outActions();expect(actions.size()).toEqual(1);
    val reserve=actions.at(0);assert(reserve is TlbOutActionReserveCurrency) throw 567;
    expect(reserve.mode).toEqual(2);
}

get fun `test pool settlement reads config eagerly and resolves only positive asset payouts`() {
    val asset=testing.treasury("settlement-error-asset").address as any_address;
    val wallets:PoolWallets={walletsByAssets:[],assetsByWallets:[],resolutions:[]};
    val payout:PoolPayoutOptions={destination:asset,extraGas:0,payload:null,wrapPayload:false};
    var exit=0;
    try{settlePoolAssets(9,createEmptyCell(),wallets,0,0,payout,asset,true);}
    catch(e){exit=e;}
    expect(exit).toEqual(9);
    exit=0;
    val config=beginCell().storeSlice(asset as slice).storeUint(0,2).endCell();
    try{settlePoolAssets(9,config,wallets,1,0,payout,asset,true);}
    catch(e){exit=e;}
    expect(exit).toEqual(40);
}
