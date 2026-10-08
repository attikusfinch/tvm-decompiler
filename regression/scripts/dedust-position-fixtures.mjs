import assert from 'node:assert/strict';
import { Address, beginCell, Dictionary } from '@ton/core';
import { compareGetters, compareMessages } from './lib.mjs';

const addr = n => new Address(0, Buffer.alloc(32, n));
const a = {pool:addr(20),owner:addr(21),payout:addr(22),receiver:addr(23),outsider:addr(24)};
const Q = 1n << 120n;
const empty = beginCell().endCell();
const payload = beginCell().storeUint(0xabcdef,24).endCell();
const inlineCell = {serialize(value,b){b.storeSlice(value.beginParse());},parse(s){return s.asCell();}};
function dict(entries) {
    const value=Dictionary.empty(Dictionary.Keys.Uint(2),inlineCell);
    for(const [key,cell] of entries) value.set(key,cell);
    return value;
}
const reward=(pending,checkpoint)=>beginCell().storeCoins(pending).storeVarUint(checkpoint,5).endCell();
const poolReward=checkpoint=>beginCell().storeUint(100,40).storeCoins(1000000n)
    .storeVarUint(checkpoint,5).storeUint(200,40).endCell();
const initialRewards=()=>dict([[1,reward(19n,Q)]]);
const poolRewards=()=>dict([[1,poolReward(3n*Q)],[3,poolReward(2n*Q)]]);
const updatedRewards=()=>dict([[1,reward(2019n,3n*Q)],[3,reward(2000n,2n*Q)]]);
function fees({xCheckpoint=Q,xPending=7n,xReserved=11n,yCheckpoint=2n*Q,yPending=13n,yReserved=17n,partial=false,tail=false}={}) {
    const b=beginCell().storeVarUint(xCheckpoint,5).storeCoins(xPending).storeCoins(xReserved)
        .storeVarUint(yCheckpoint,5).storeCoins(yPending);
    if(!partial)b.storeCoins(yReserved);
    if(tail)b.storeBit(1);
    return b.endCell();
}
function storage({liquidity=1000n,locked=200n,feeCell=fees(),rewards=initialRewards(),tail=false,none=false}={}) {
    const b=beginCell().storeAddress(none?null:a.pool).storeAddress(none?null:a.owner)
        .storeCoins(liquidity).storeCoins(locked).storeRef(feeCell).storeDict(rewards);
    if(tail)b.storeBit(1).storeRef(empty);
    return b.endCell();
}
const credit=({amount=400n,share=2500,notify=0n,rewards=poolRewards(),tail=false}={})=>{
    const b=beginCell().storeUint(0x855afcbd,32).storeUint(9,64).storeCoins(amount).storeUint(share,16)
        .storeCoins(notify).storeMaybeRef(payload).storeAddress(a.receiver)
        .storeVarUint(3n*Q,5).storeVarUint(5n*Q,5).storeDict(rewards);
    if(tail)b.storeBit(1);
    return b.endCell();
};
const claimFees=()=>beginCell().storeUint(0x25f19752,32).storeUint(9,64).storeAddress(a.payout)
    .storeVarUint(5n*Q,5).storeVarUint(6n*Q,5).endCell();
const withdraw=({amount=300n,claim=true,rewards=poolRewards()}={})=>beginCell().storeUint(0xbc1531a9,32)
    .storeUint(9,64).storeCoins(amount).storeCoins(2n).storeCoins(3n)
    .storeVarUint(3n*Q,5).storeVarUint(5n*Q,5).storeDict(rewards).storeBit(claim).storeRef(payload).endCell();
const provide=mask=>beginCell().storeUint(0x9e0c2428,32).storeUint(9,64)
    .storeBit(mask&1).storeBit(mask&2).storeBit(mask&4).storeBit(mask&8).endCell();
const claimReward=(id=1,checkpoint=3n*Q)=>beginCell().storeUint(0x2e0cccba,32).storeUint(9,64)
    .storeUint(id,2).storeUint(100,40).storeCoins(1000000n).storeVarUint(checkpoint,5)
    .storeUint(200,40).storeAddress(a.payout).endCell();
const bounced=(opcode,values,{prefix=0xffffffff,tail=true}={})=>{
    const b=beginCell().storeUint(prefix,32).storeUint(opcode,32).storeUint(9,64);
    for(const value of values)b.storeCoins(value);
    if(opcode===0x9e17fbbe)b.storeUint(1,2);
    if(tail)b.storeUint(255,8).storeRef(empty);
    return b.endCell();
};
const excess=()=>beginCell().storeUint(0xd53276db,32).storeUint(9,64).endCell();
const hash=c=>c.hash().toString('hex');
const int=n=>({type:'int',value:String(n)});
const slice=address=>({type:'slice',cellHash:hash(beginCell().storeAddress(address).endCell())});

export async function checkPosition(original,candidate) {
    const getters=[];
    for(const variant of [
        {label:'valid',data:storage(),exit:0,expect:true},
        {label:'partial-fees-getter',data:storage({feeCell:fees({partial:true})}),exit:0,expect:true},
        {label:'trailing-fees-getter',data:storage({feeCell:fees({tail:true})}),exit:0,expect:true},
        {label:'trailing-storage-getter',data:storage({tail:true}),exit:0,expect:true},
        {label:'any-address-none',data:storage({none:true}),exit:0},
        {label:'empty-storage',data:empty,exit:9},
        {label:'empty-fees',data:storage({feeCell:empty}),exit:9},
    ]) {
        for(const method of [89720,80110]) {
            const [result]=await compareGetters(original,candidate,[{method,args:method===80110?[int(3n*Q),int(5n*Q)]:[]}],{data:variant.data});
            assert.equal(result.sameObservedBehavior,true,variant.label+': getter '+method);
            assert.equal(result.before.exitCode,variant.exit);
            assert.equal(result.before.gasUsed,result.after.gasUsed);
            if(variant.expect)assert.deepEqual(result.before.stack,method===80110?[int(2007),int(3013)]:[
                slice(a.pool),slice(a.owner),int(1000),int(200),
                {type:'cell',cellHash:hash(beginCell().storeDictDirect(initialRewards()).endCell())},int(7),int(13),int(Q),int(2n*Q),
            ]);
            getters.push({label:variant.label,...result});
        }
    }
    const credited=storage({liquidity:1400n,locked:300n,feeCell:fees({xCheckpoint:3n*Q,xPending:2007n,yCheckpoint:5n*Q,yPending:3013n}),rewards:updatedRewards()});
    const feeClaimed=storage({feeCell:fees({xCheckpoint:5n*Q,xPending:0n,yCheckpoint:6n*Q,yPending:0n})});
    const withdrawn=claim=>storage({liquidity:700n,rewards:updatedRewards(),feeCell:fees({
        xCheckpoint:3n*Q,xPending:claim?0n:2007n,yCheckpoint:5n*Q,yPending:claim?0n:3013n,
    })});
    const feeClaimBody=beginCell().storeUint(0x29ff1bcf,32).storeUint(9,64)
        .storeCoins(4007n).storeCoins(4013n).storeAddress(a.owner).storeAddress(a.payout).endCell();
    const withdrawalBody=claim=>beginCell().storeUint(0xf6f6a3aa,32).storeUint(9,64)
        .storeCoins(300n).storeCoins(claim?2007n:0n).storeCoins(claim?3013n:0n)
        .storeAddress(a.owner).storeCoins(2n).storeCoins(3n).storeRef(payload).endCell();
    const rewardClaimBody=beginCell().storeUint(0x9e17fbbe,32).storeUint(9,64).storeCoins(2019n)
        .storeUint(1,2).storeAddress(a.owner).storeAddress(a.payout).endCell();
    const probes=[
        {label:'credit-with-rewards',body:credit(),expectExit:0,expectOut:1,state:credited,out:[{body:excess(),to:a.owner}]},
        {label:'credit-notification',body:credit({notify:10000000n}),expectExit:0,expectOut:2,state:credited,out:[
            {body:beginCell().storeUint(0x63554160,32).storeUint(9,64).storeCoins(400n).storeCoins(100n).storeMaybeRef(payload).endCell(),to:a.owner},
            {body:excess(),to:a.owner},
        ]},
        {label:'credit-clamped-share',body:credit({share:65535}),expectExit:0,expectOut:1,
            state:storage({liquidity:1400n,locked:600n,feeCell:fees({xCheckpoint:3n*Q,xPending:2007n,yCheckpoint:5n*Q,yPending:3013n}),rewards:updatedRewards()})},
        {label:'claim-fees',body:claimFees(),expectExit:0,expectOut:1,state:feeClaimed,out:[{body:feeClaimBody,to:a.pool,bounce:true}]},
        ...[true,false].map(claim=>({label:'withdraw-claim-'+claim,body:withdraw({claim}),expectExit:0,expectOut:1,
            state:withdrawn(claim),out:[{body:withdrawalBody(claim),to:a.pool,bounce:true}]})),
        {label:'withdraw-exceeds-unlocked-committed-refund',body:withdraw({amount:801n}),expectExit:36,expectOut:1,
            state:storage(),out:[{body:excess(),to:a.owner}]},
        {label:'claim-reward',body:claimReward(),expectExit:0,expectOut:1,
            state:storage({rewards:dict([[1,reward(0n,3n*Q)]])}),out:[{body:rewardClaimBody,to:a.pool,bounce:true}]},
        {label:'claim-zero-reward',body:claimReward(2,0n),expectExit:0,expectOut:1,
            state:storage({rewards:dict([[1,reward(19n,Q)],[2,reward(0n,0n)]])}),out:[{body:excess(),to:a.payout}]},
        {label:'credit-trailing-body-rejected',body:credit({tail:true}),expectExit:9,expectOut:0},
        {label:'unknown-op',body:beginCell().storeUint(0x12345678,32).endCell(),expectExit:65535,expectOut:0},
        {label:'empty-body',body:empty,expectExit:65535,expectOut:0},
        ...[['credit',credit()],['claim-fees',claimFees()],['withdraw',withdraw()],['claim-reward',claimReward()]]
            .map(([label,body])=>({label:label+'-unauthorized',body,from:a.outsider,expectExit:23,expectOut:0})),
        ...[0x855afcbd,0x25f19752,0xbc1531a9,0x9e0c2428,0x2e0cccba]
            .map(op=>({label:'truncated-'+op.toString(16),body:beginCell().storeUint(op,32).endCell(),expectExit:9,expectOut:0})),
        ...Array.from({length:16},(_,mask)=>{
            const b=beginCell().storeUint(0x52e659c0,32).storeUint(9,64).storeCoins(1000n).storeCoins(200n);
            b.storeBit(mask&1);if(mask&1)b.storeAddress(a.pool);
            b.storeBit(mask&2);if(mask&2)b.storeAddress(a.owner);
            b.storeMaybeRef(mask&4?fees():null);
            b.storeBit(mask&8);if(mask&8)b.storeDict(initialRewards());
            return {label:'provide-state-flags-'+mask,body:provide(mask),from:a.outsider,expectExit:0,expectOut:1,
                state:storage(),out:[{body:b.endCell(),to:a.outsider}]};
        }),
        {label:'bounced-fee-claim',bounced:true,body:bounced(0x29ff1bcf,[4007n,4013n]),expectExit:0,expectOut:1,
            state:storage({feeCell:fees({xPending:4014n,yPending:4026n})}),out:[{body:excess(),to:a.owner}]},
        {label:'bounced-withdrawal',bounced:true,body:bounced(0xf6f6a3aa,[300n,2007n,3013n]),expectExit:0,expectOut:1,
            state:storage({liquidity:1300n,feeCell:fees({xPending:2014n,yPending:3026n})}),out:[{body:excess(),to:a.owner}]},
        {label:'bounced-reward-claim',bounced:true,body:bounced(0x9e17fbbe,[22n]),expectExit:0,expectOut:1,
            state:storage({rewards:dict([[1,reward(41n,Q)]])}),out:[{body:excess(),to:a.owner}]},
        {label:'bounce-prefix-is-not-validated',bounced:true,body:bounced(0x9e17fbbe,[22n],{prefix:0}),expectExit:0,expectOut:1},
        {label:'bounced-unknown',bounced:true,body:beginCell().storeUint(0xffffffff,32).storeUint(0,32).endCell(),expectExit:63,expectOut:0},
        {label:'bounced-empty',bounced:true,body:empty,expectExit:9,expectOut:0},
    ].map(p=>({from:a.pool,...p}));
    const groups=[{label:'valid',data:storage(),probes},
        {label:'partial-fees',data:storage({feeCell:fees({partial:true})}),probes:[
            {label:'credit-validates-entire-fees',from:a.pool,body:credit(),expectExit:9,expectOut:0},
            {label:'withdraw-catches-malformed-fees',from:a.pool,body:withdraw(),expectExit:9,expectOut:1},
            {label:'state-does-not-unpack-fees',from:a.pool,body:provide(4),expectExit:0,expectOut:1},
        ]},
        {label:'trailing-storage',data:storage({tail:true}),probes:[{label:'state-rejects-storage-suffix',from:a.pool,body:provide(0),expectExit:9,expectOut:0}]},
        {label:'zero-liquidity',data:storage({liquidity:0n,locked:0n}),probes:[{label:'first-credit-does-not-accrue-old-fees',from:a.pool,body:credit(),expectExit:0,expectOut:1,
            state:storage({liquidity:400n,locked:100n,feeCell:fees({xCheckpoint:3n*Q,yCheckpoint:5n*Q}),rewards:dict([[1,reward(19n,3n*Q)],[3,reward(0n,2n*Q)]])})}]},
        {label:'huge-liquidity',data:storage({liquidity:(1n<<119n),locked:0n}),probes:[{label:'512-bit-fee-intermediate',from:a.pool,
            body:beginCell().storeUint(0x25f19752,32).storeUint(9,64).storeAddress(a.payout)
                .storeVarUint((1n<<240n),5).storeVarUint(2n*Q,5).endCell(),expectExit:5,expectOut:0}]},
    ];
    const messages=[];
    for(const group of groups) {
        const results=await compareMessages(original,candidate,group.probes,{data:group.data,address:addr(97),accurateStorageStats:true});
        for(let i=0;i<results.length;i++) {
            const result=results[i],probe=group.probes[i];
            assert.equal(result.sameObservedBehavior,true,result.label);
            assert.equal(result.sameEffectsAndActions,true,result.label);
            assert.equal(result.matchesExpectedOriginal,true,JSON.stringify(result));
            assert.equal(result.before.gasUsed,result.after.gasUsed,result.label+': gas');
            if(probe.state)assert.equal(result.before.dataHash,hash(probe.state),result.label+': independent state');
            if(probe.out)for(let j=0;j<probe.out.length;j++) {
                assert.equal(result.before.outMessages[j].body,hash(probe.out[j].body),result.label+': body');
                assert.equal(result.before.outMessages[j].destination,probe.out[j].to.toRawString(),result.label+': recipient');
                assert.equal(result.before.outMessages[j].bounce,probe.out[j].bounce??false,result.label+': bounce');
            }
            messages.push({group:group.label,...result});
        }
    }
    return {getters,messages};
}
