import assert from 'node:assert/strict';
import { Address, beginCell } from '@ton/core';
import { compareGetters, compareMessages } from './lib.mjs';

const addr = n => new Address(0,Buffer.alloc(32,n));
const addresses = {pool:addr(1),initiator:addr(2),recipient:addr(3),refund:addr(4),excess:addr(5),outsider:addr(6)};
const empty = beginCell().endCell();
const payload = beginCell().storeUint(0x12345678,32).endCell();
function payout({extraBits=false, extraRef=false, payloads=false, noneAddresses=false} = {}) {
    const leg = (b,address,gas,forward) => b.storeAddress(address).storeCoins(gas)
        .storeMaybeRef(payloads?payload:null).storeBit(forward);
    const b = leg(leg(beginCell(),noneAddresses?null:addresses.recipient,0n,false),
        noneAddresses?null:addresses.refund,10000000n,true).storeAddress(noneAddresses?null:addresses.excess);
    if (extraBits) b.storeBit(1);
    if (extraRef) b.storeRef(empty);
    return b.endCell();
}
function config(options = {}) {
    return beginCell().storeCoins(1000n).storeCoins(2000n).storeCoins(100n).storeUint(2500,16)
        .storeRef(options.payout ?? payout(options)).endCell();
}
function storage({balanceX=7n,balanceY=11n,configCell=config(),extraBits=false,noneAddresses=false} = {}) {
    const b=beginCell().storeRef(configCell).storeAddress(noneAddresses?null:addresses.pool)
        .storeAddress(noneAddresses?null:addresses.initiator).storeCoins(balanceX).storeCoins(balanceY);
    if (extraBits) b.storeBit(1);
    return b.endCell();
}
const credit = (isX,amount,query=9n) => beginCell().storeUint(0xdc5ddba1,32).storeUint(query,64).storeBit(isX).storeCoins(amount).endCell();
const cancel = query => beginCell().storeUint(0x3db5f13a,32).storeUint(query,64).endCell();

export async function checkDeposit(original, candidate) {
    const getters=[];
    for (const variant of [
        {label:'valid',data:storage(),expectedExit:0},
        {label:'payload-refs',data:storage({configCell:config({payloads:true})}),expectedExit:0},
        {label:'none-addresses-are-valid-any-address',data:storage({noneAddresses:true,configCell:config({noneAddresses:true})}),expectedExit:0},
        {label:'empty-storage',data:empty,expectedExit:9},
        {label:'empty-config',data:storage({configCell:empty}),expectedExit:9},
        {label:'empty-payout',data:storage({configCell:config({payout:empty})}),expectedExit:9},
        {label:'trailing-storage-bits',data:storage({extraBits:true}),expectedExit:9},
        {label:'trailing-payout-bits',data:storage({configCell:config({extraBits:true})}),expectedExit:9},
        {label:'trailing-payout-ref',data:storage({configCell:config({extraRef:true})}),expectedExit:9},
    ]) {
        const [result] = await compareGetters(original,candidate,[{method:70330,args:[]}],{data:variant.data});
        assert.equal(result.sameObservedBehavior,true,variant.label);
        assert.equal(result.before.exitCode,variant.expectedExit,variant.label);
        assert.equal(result.before.gasUsed,result.after.gasUsed,variant.label+': gas');
        if(variant.label==='valid') {
            const slice = address => ({type:'slice',cellHash:beginCell().storeAddress(address).endCell().hash().toString('hex')});
            const int = n => ({type:'int',value:String(n)});
            assert.deepEqual(result.before.stack,[slice(addresses.pool),slice(addresses.recipient),slice(addresses.refund),
                ...[1000,2000,2500,100,7,11].map(int)]);
        }
        getters.push({label:variant.label,...result});
    }
    const base=[
        {label:'credit-x',body:credit(true,13n),expectExit:0,expectOut:1,expectedX:20n,expectedY:11n},
        {label:'credit-y',body:credit(false,13n),expectExit:0,expectOut:1,expectedX:7n,expectedY:24n},
        {label:'credit-zero',body:credit(true,0n),expectExit:0,expectOut:1,expectedX:7n,expectedY:11n},
        {label:'credit-wrong-sender',body:credit(true,13n),from:addresses.outsider,expectExit:23,expectOut:0},
        {label:'cancel-wrong-sender',body:cancel(9n),expectExit:23,expectOut:0},
        {label:'cancel',body:cancel(9n),from:addresses.initiator,expectExit:0,expectOut:1,expectedOpcode:0x0d299e12},
        {label:'cancel-low-value',body:cancel(9n),from:addresses.initiator,value:50000000n,expectExit:25,expectOut:0},
        {label:'unknown',body:beginCell().storeUint(0x12345678,32).endCell(),expectExit:65535,expectOut:0},
        {label:'empty',body:empty,expectExit:65535,expectOut:0},
        {label:'truncated-credit',body:beginCell().storeUint(0xdc5ddba1,32).endCell(),expectExit:9,expectOut:0},
        {label:'missing-amount',body:beginCell().storeUint(0xdc5ddba1,32).storeUint(9,64).storeBit(1).endCell(),expectExit:9,expectOut:0},
        {label:'truncated-cancel',body:beginCell().storeUint(0x3db5f13a,32).endCell(),expectExit:9,expectOut:0},
        {label:'credit-trailing-bit',body:beginCell().storeSlice(credit(true,13n).beginParse()).storeBit(1).endCell(),expectExit:9,expectOut:0},
        {label:'credit-trailing-ref',body:beginCell().storeSlice(credit(true,13n).beginParse()).storeRef(empty).endCell(),expectExit:9,expectOut:0},
        {label:'cancel-trailing-bit',body:beginCell().storeSlice(cancel(9n).beginParse()).storeBit(1).endCell(),from:addresses.initiator,expectExit:9,expectOut:0},
        {label:'bounced-empty',body:empty,bounced:true,expectExit:0,expectOut:0},
        {label:'bounced-credit',body:credit(true,13n),bounced:true,expectExit:0,expectOut:0},
    ].map(p=>({from:addresses.pool,...p}));
    const groups=[{label:'base',data:storage(),probes:base},
        {label:'threshold',data:storage({balanceX:900n,balanceY:2000n}),probes:[
            {label:'join-on-x',from:addresses.pool,body:credit(true,100n),expectExit:0,expectOut:1,expectedOpcode:0x25251ee0},
            {label:'still-below-x',from:addresses.pool,body:credit(true,99n),expectExit:0,expectOut:1,expectedX:999n,expectedY:2000n},
        ]},
        {label:'overflow',data:storage({balanceX:(1n<<120n)-1n}),probes:[
            {label:'coin-storage-overflow',from:addresses.pool,body:credit(true,1n),expectExit:5,expectOut:0},
        ]},
        {label:'invalid-payout',data:storage({configCell:config({payout:empty})}),probes:[
            {label:'credit-reads-payout-eagerly',from:addresses.pool,body:credit(true,1n),expectExit:9,expectOut:0},
        ]},
    ];
    const messages=[];
    for (const group of groups) {
        const results=await compareMessages(original,candidate,group.probes,{data:group.data,address:addr(99),accurateStorageStats:true});
        for(let i=0;i<results.length;i++) {
            const result=results[i],probe=group.probes[i];
            assert.equal(result.sameObservedBehavior,true,result.label);
            assert.equal(result.sameEffectsAndActions,true,result.label);
            assert.equal(result.matchesExpectedOriginal,true,JSON.stringify(result));
            assert.equal(result.before.gasUsed,result.after.gasUsed,result.label+': gas');
            if(probe.expectedX!==undefined) {
                assert.equal(result.before.dataHash,storage({balanceX:probe.expectedX,balanceY:probe.expectedY}).hash().toString('hex'));
                const excess=beginCell().storeUint(0xd53276db,32).storeUint(9,64).endCell();
                assert.equal(result.before.outMessages[0].body,excess.hash().toString('hex'));
                assert.equal(result.before.outMessages[0].destination,addresses.excess.toRawString());
            }
            if(probe.expectedOpcode) {
                const s=group.data.beginParse(); const cfg=s.loadRef(); s.loadAddress(); const initiator=s.loadAddress();
                const x=s.loadCoins(),y=s.loadCoins();
                const body=beginCell().storeUint(probe.expectedOpcode,32).storeUint(9,64).storeRef(cfg)
                    .storeCoins(probe.expectedOpcode===0x25251ee0?1000n:x).storeCoins(y).storeAddress(initiator).endCell();
                assert.equal(result.before.outMessages[0].body,body.hash().toString('hex'));
                assert.equal(result.before.outMessages[0].destination,addresses.pool.toRawString());
            }
            messages.push({group:group.label,...result});
        }
    }
    return {getters,messages};
}
