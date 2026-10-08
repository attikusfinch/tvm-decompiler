import assert from 'node:assert/strict';
import { Address, beginCell } from '@ton/core';
import { compareGetters, compareMessages } from './lib.mjs';

const addr=n=>new Address(0,Buffer.alloc(32,n));
const a={authority:addr(10),owner:addr(11),recipient:addr(12),excesses:addr(13),newOwner:addr(14),outsider:addr(15)};
const metadata=beginCell().storeUint(0x12345678,32).endCell();
const empty=beginCell().endCell();
function storage({activated=false,kind=0,meta=null,owner=a.owner,tail=false,none=false}={}) {
    const b=beginCell().storeBit(activated).storeAddress(none?null:a.authority).storeBit(kind)
        .storeMaybeRef(meta).storeUint(123,256).storeUint(250,16).storeAddress(none?null:owner);
    if(tail) b.storeUint(255,8).storeRef(empty);
    return b.endCell();
}
const activate=(tail=false)=>{
    const b=beginCell().storeUint(0xe5d596b3,32).storeUint(9,64).storeRef(metadata).storeAddress(a.newOwner).storeAddress(a.excesses);
    if(tail) b.storeUint(255,8).storeRef(empty);
    return b.endCell();
};
const withdraw=(tail=false)=>{
    const b=beginCell().storeUint(0xa43314ff,32).storeUint(9,64).storeAddress(a.recipient).storeAddress(a.excesses);
    if(tail) b.storeUint(255,8).storeRef(empty);
    return b.endCell();
};
const notification=beginCell().storeUint(0x773faf30,32).endCell();
export async function checkAffiliate(original,candidate) {
    const getters=[];
    for(const v of [
        {label:'inactive-partner',data:storage(),exit:0,activated:0,kind:0,meta:null},
        {label:'active-referrer',data:storage({activated:true,kind:1,meta:metadata}),exit:0,activated:-1,kind:1,meta:metadata},
        {label:'none-addresses',data:storage({none:true}),exit:0},
        {label:'empty-storage',data:empty,exit:9},
        {label:'missing-kind',data:beginCell().storeBit(0).storeAddress(a.authority).endCell(),exit:63},
        {label:'trailing-storage',data:storage({tail:true}),exit:9},
    ]) {
        const [result]=await compareGetters(original,candidate,[{method:119665,args:[]}],{data:v.data});
        assert.equal(result.sameObservedBehavior,true,v.label);
        assert.equal(result.before.exitCode,v.exit,v.label);
        assert.equal(result.before.gasUsed,result.after.gasUsed,v.label+': gas');
        if(v.activated!==undefined) {
            const int=n=>({type:'int',value:String(n)});
            const slice=address=>({type:'slice',cellHash:beginCell().storeAddress(address).endCell().hash().toString('hex')});
            assert.deepEqual(result.before.stack,[int(v.activated),slice(a.authority),slice(a.owner),int(v.kind),
                v.meta?{type:'cell',cellHash:v.meta.hash().toString('hex')}:{type:'null'},int(250)]);
        }
        getters.push({label:v.label,...result});
    }
    const activationProbes=[
        {label:'notification',body:notification,expectExit:0,expectOut:0},
        {label:'activate',body:activate(),expectExit:0,expectOut:1,activated:true},
        {label:'activate-trailing-payload',body:activate(true),expectExit:0,expectOut:1,activated:true},
        {label:'activate-wrong-authority',body:activate(),from:a.outsider,expectExit:18,expectOut:0},
        {label:'activation-truncated-after-auth',body:beginCell().storeUint(0xe5d596b3,32).endCell(),expectExit:9,expectOut:0},
        {label:'activation-auth-precedes-payload',body:beginCell().storeUint(0xe5d596b3,32).endCell(),from:a.outsider,expectExit:18,expectOut:0},
        {label:'withdraw-before-activation',body:withdraw(),from:a.owner,expectExit:17,expectOut:0},
        {label:'unknown',body:beginCell().storeUint(0x12345678,32).endCell(),expectExit:65535,expectOut:0},
        {label:'empty',body:empty,expectExit:65535,expectOut:0},
        {label:'bounced-empty',body:empty,bounced:true,expectExit:0,expectOut:0},
    ].map(p=>({from:a.authority,...p}));
    const withdrawalProbes=[
        {label:'withdraw',body:withdraw(),expectExit:0,expectOut:2,withdraw:true},
        {label:'withdraw-trailing-payload',body:withdraw(true),expectExit:0,expectOut:2,withdraw:true},
        {label:'withdraw-wrong-owner',body:withdraw(),from:a.authority,expectExit:18,expectOut:0},
        {label:'withdraw-truncated-after-auth',body:beginCell().storeUint(0xa43314ff,32).endCell(),expectExit:9,expectOut:0},
        {label:'withdraw-auth-precedes-payload',body:beginCell().storeUint(0xa43314ff,32).endCell(),from:a.outsider,expectExit:18,expectOut:0},
        {label:'activation-on-active',body:activate(),from:a.authority,expectExit:16,expectOut:0},
    ].map(p=>({from:a.owner,...p}));
    const groups=[
        {label:'inactive',data:storage(),probes:activationProbes},
        {label:'active',data:storage({activated:true}),probes:withdrawalProbes},
        {label:'trailing-storage',data:storage({tail:true}),probes:[
            {label:'notification-allows-storage-suffix',from:a.authority,body:notification,expectExit:0,expectOut:0},
            {label:'activation-removes-storage-suffix',from:a.authority,body:activate(),expectExit:0,expectOut:1,activated:true},
        ]},
        {label:'low-balance',data:storage({activated:true}),balance:50000000n,probes:[
            {label:'no-accumulated-balance',from:a.owner,body:withdraw(),expectExit:0,expectOut:1},
        ]},
        {label:'malformed-storage',data:empty,probes:[
            {label:'notification-still-reads-storage',from:a.authority,body:notification,expectExit:9,expectOut:0},
            {label:'bounce-ignores-malformed-storage',from:a.authority,body:empty,bounced:true,expectExit:0,expectOut:0},
        ]},
    ];
    const messages=[];
    for(const group of groups) {
        const results=await compareMessages(original,candidate,group.probes,{data:group.data,address:addr(98),accurateStorageStats:true,balance:group.balance});
        for(let i=0;i<results.length;i++) {
            const result=results[i],probe=group.probes[i];
            assert.equal(result.sameObservedBehavior,true,result.label);
            assert.equal(result.sameEffectsAndActions,true,result.label);
            assert.equal(result.matchesExpectedOriginal,true,JSON.stringify(result));
            assert.equal(result.before.gasUsed,result.after.gasUsed,result.label+': gas');
            if(probe.activated) assert.equal(result.before.dataHash,storage({activated:true,meta:metadata,owner:a.newOwner}).hash().toString('hex'));
            if(probe.activated||probe.withdraw||group.label==='low-balance') {
                const excess=beginCell().storeUint(0xd53276db,32).storeUint(9,64).endCell();
                const last=result.before.outMessages.at(-1);
                assert.equal(last.body,excess.hash().toString('hex'));
                assert.equal(last.destination,a.excesses.toRawString());
            }
            if(probe.withdraw) {
                assert.equal(result.before.outMessages[0].destination,a.recipient.toRawString());
                assert.equal(result.before.outMessages[0].value,'9900000000');
                assert.equal(result.before.outMessages[0].body,empty.hash().toString('hex'));
            }
            messages.push({group:group.label,...result});
        }
    }
    return {getters,messages};
}
