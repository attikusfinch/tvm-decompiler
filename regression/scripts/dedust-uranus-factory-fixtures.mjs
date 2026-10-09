import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Address,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {compareMessages} from './lib.mjs';

export async function checkUranusFactory(oracle,candidate) {
    const addr=n=>new Address(0,Buffer.alloc(32,n));
    const address=addr(121),owner=addr(122),controller=addr(123),partnerAddress=addr(124),recipient=addr(125);
    const data=beginCell().storeAddress(controller).endCell(),empty=beginCell().endCell(),metadata=beginCell().storeStringTail('https://example.invalid/token.json').endCell();
    const library=beginCell().storeUint(2,8).storeUint(BigInt('0xa63e4a802c8b982cd888a357b2c9ee5a722644c2d7e7cdaed350f24fc96eca3d'),256).endCell({exotic:true});
    const randomSeed=Buffer.alloc(32,1),hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest();
    const lt=Buffer.alloc(32);lt.writeBigUInt64BE(1000000n,24);
    // TON transaction.cpp prepare_rand_seed; tonops.cpp ADDRAND and RANDU256.
    const vmSeed=hash('sha256',Buffer.concat([randomSeed,address.hash]));
    const mixed=hash('sha256',Buffer.concat([vmSeed,lt]));
    const seed=BigInt('0x'+hash('sha512',mixed).subarray(32,48).toString('hex'));
    const Q=123n,VALUE=2000000000000n;
    const affiliate=(id=17n,share=37)=>beginCell().storeUint(id,256).storeUint(share,16).endCell();
    const partner=affiliate(),referrer=affiliate(19n,43);
    const putAffiliate=(b,a)=>a?b.storeBit(1).storeSlice(a.beginParse()):b.storeBit(0);
    const preset=({id=3,buy=0n,p=null,r=null,q=Q,meta=metadata}={})=>{
        const b=beginCell().storeUint(0x6ff416dc,32).storeUint(q,64).storeUint(id,4).storeRef(meta).storeCoins(buy);
        putAffiliate(b,p);putAffiliate(b,r);return b.endCell();
    };
    const defaults={supply:1,fee:3,raising:1000000000000n,percent:75,partnerAddress,partnerShare:400,poolShare:320,poolFee:2,liquidityOwner:null,meta:metadata,buy:0n,p:null,r:null,q:Q};
    const custom=(patch={})=>{const o={...defaults,...patch};return beginCell().storeUint(0x632f5d1c,32).storeUint(o.q,64).storeUint(o.supply,4).storeUint(o.fee,4)
        .storeCoins(o.raising).storeUint(o.percent,8).storeAddress(o.partnerAddress).storeUint(o.partnerShare,16).storeUint(o.poolShare,16).storeUint(o.poolFee,16)
        .storeAddress(o.liquidityOwner).storeRef(o.meta).storeCoins(o.buy).storeMaybeRef(o.p).storeMaybeRef(o.r).endCell();};
    const presets={3:[100,1000000000000n,800000000000000000n],4:[300,1000000000000n,800000000000000000n],5:[500,1000000000000n,800000000000000000n],
        6:[100,1500000000000n,750000000000000000n],7:[300,1500000000000n,750000000000000000n],8:[100,2500000000000n,750000000000000000n],9:[300,2500000000000n,750000000000000000n]};
    const fees=[10,25,50,100,200,300,500,1000],supplies=[100000000000000000n,1000000000000000000n,10000000000000000000n];
    function expectedState({total=1000000000000000000n,sold=800000000000000000n,raising=1000000000000n,fee=100,partnerAddress:pa=controller,partnerShare=0,poolShare=0,poolFee=fee,liquidityOwner=owner,meta=metadata}={}) {
        const virtual=50000000000n,remaining=total-sold,sum=raising+virtual,denominator=raising*sold/remaining-sum;
        const alpha=(raising*sold*sold/remaining)/denominator,beta=sum*sum/denominator;
        const config=beginCell().storeAddress(owner).storeAddress(controller).storeRef(meta).storeCoins(raising).storeCoins(remaining).storeUint(seed,128).endCell();
        const migration=beginCell().storeAddress(pa).storeUint(poolShare,16).storeUint(poolFee,16).storeAddress(liquidityOwner).endCell();
        return beginCell().storeBit(0).storeBit(0).storeRef(config).storeUint(fee,16).storeBit(0).storeCoins(alpha).storeCoins(beta).storeCoins(sold)
            .storeCoins(0).storeCoins(0).storeCoins(total).storeCoins(0).storeCoins(0).storeUint(partnerShare,16).storeRef(migration).endCell();
    }
    function initBody({buy=0n,p=null,r=null,q=Q}={}) {const b=beginCell().storeUint(0x796f5a0c,32).storeUint(q,64).storeCoins(buy);putAffiliate(b,p);putAffiliate(b,r);return b.endCell();}
    const cfg=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),(await Blockchain.create()).config);
    const gp=cfg.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
    const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
    const fp=cfg.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);fp.loadUintBig(64);const bit=fp.loadUintBig(64),cell=fp.loadUintBig(64);fp.skip(32);const first=BigInt(fp.loadUint(16)),orig=n=>n*65536n/(65536n-first);
    const prices=Dictionary.loadDirect(Dictionary.Keys.Uint(32),{serialize(){},parse(s){assert.equal(s.loadUint(8),0xcc);s.skip(32);return {bit:s.loadUintBig(64),cell:s.loadUintBig(64)};}},cfg.get(18));
    const price=prices.get(Math.max(...prices.keys().filter(t=>t<=1700000000))),store=((3n*price.cell+970n*price.bit)*157680000n+65535n)>>16n;
    const fwd=(3n*cell+812n*bit+65535n)>>16n;
    const budget=(custom,buy,fee)=>gas(custom?12458:10253)+10000000n+(buy>0n?gas(22492)+gas(8862)+fwd+store+2n*orig(fee)+buy:gas(16450)+orig(fee));
    const messages=[];
    async function check(label,body,{exit=0,storage=data,value=VALUE,fee=0n,bounced=false,state,init}={}) {
        const [t]=await compareMessages(oracle,candidate,[{label,body,from:owner,value,forwardFee:fee,bounced}],{data:storage,address,randomSeed});
        assert.equal(t.sameObservedBehavior,true,label+': differential');assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');const a=t.before;
        assert.equal(a.exitCode,exit,label+': exit');assert.equal(a.dataHash,storage.hash().toString('hex'));assert.equal(a.codeChanged,false);
        assert.equal(a.actions.length,state?2:0,label+': action count');
        if(state) {
            assert.deepEqual(a.actions[0],{type:'reserve',mode:4,currency:{coins:'0'}});
            const action=a.actions[1];assert.equal(action.type,'sendMsg');assert.equal(action.mode,128);assert.equal(action.outMsg.info.bounce,false);assert.equal(action.outMsg.info.value.coins,'0');
            const expectedInit={splitDepth:8,code:library,data:state};
            const target=contractAddress(0,expectedInit),dest=new Address(0,Buffer.concat([address.hash.subarray(0,1),target.hash.subarray(1)]));
            assert.equal(action.outMsg.info.dest,dest.toRawString());assert.equal(action.outMsg.init.splitDepth,8);
            assert.equal(action.outMsg.init.code.cellHash,library.hash().toString('hex'));assert.equal(action.outMsg.init.data.cellHash,state.hash().toString('hex'),label+': complete initial storage and random seed');
            assert.equal(action.outMsg.body.cellHash,init.hash().toString('hex'));
        }
        messages.push(t);
    }
    for(const [id,[fee,raising,sold]]of Object.entries(presets))for(const buy of [0n,1000000000n])await check('preset '+id+' buy='+buy,preset({id:Number(id),buy}),{
        state:expectedState({fee,raising,sold}),init:initBody({buy})});
    for(const p of [null,partner])for(const r of [null,referrer])await check('preset attribution '+Boolean(p)+'/'+Boolean(r),preset({p,r}),{state:expectedState(),init:initBody({p,r})});
    for(const id of [0,1,2,10,15])await check('invalid preset '+id,preset({id}),{exit:22});
    await check('initial buy strict upper limit',preset({buy:1000000000000n}),{exit:26});
    for(const supply of [0,1,2])for(const percent of [60,75,80]) {
        const sold=supplies[supply]*BigInt(percent)/100n;
        await check('custom supply='+supply+' percent='+percent,custom({supply,percent}),{state:expectedState({total:supplies[supply],sold,fee:100,partnerAddress,partnerShare:400,poolShare:400,poolFee:50}),init:initBody()});
    }
    for(const fee of [0,1,2,3,4,5,6,7])await check('custom fee preset '+fee,custom({fee,poolFee:fee}),{state:expectedState({sold:750000000000000000n,fee:fees[fee],partnerAddress,partnerShare:400,poolShare:400,poolFee:fees[fee]}),init:initBody()});
    for(const liquidityOwner of [null,recipient])for(const p of [null,partner])for(const r of [null,referrer])await check('custom owner and attribution '+Boolean(liquidityOwner)+'/'+Boolean(p)+'/'+Boolean(r),custom({liquidityOwner,p,r,buy:1000000000n}),{
        state:expectedState({sold:750000000000000000n,partnerAddress,partnerShare:400,poolShare:400,poolFee:50,liquidityOwner:liquidityOwner??owner}),init:initBody({p,r,buy:1000000000n})});
    for(const [patch,exit]of [[{raising:799999999999n},36],[{raising:1000000000000001n},36],[{partnerShare:6001},37],[{poolShare:4001},39],[{percent:59},38],[{percent:81},38],[{buy:1000000000000n},26],[{supply:3},35],[{fee:8},34],[{poolFee:8},34]])await check('custom invalid '+JSON.stringify(patch,(_,v)=>typeof v==='bigint'?String(v):v),custom(patch),{exit});
    for(const customPath of [false,true])for(const buy of [0n,1000000000n])for(const fee of [0n,1000001n]) {
        const body=customPath?custom({buy}):preset({buy}),bound=budget(customPath,buy,fee);
        await check('budget below custom='+customPath+' buy='+buy+' fee='+fee,body,{value:bound-1n,fee,exit:23});
        await check('budget equality custom='+customPath+' buy='+buy+' fee='+fee,body,{value:bound,fee,state:expectedState(customPath?{sold:750000000000000000n,partnerAddress,partnerShare:400,poolShare:400,poolFee:50}:{}),init:initBody({buy})});
    }
    for(const p of [beginCell().storeUint(0,271).endCell(),beginCell().storeSlice(partner.beginParse()).storeBit(1).endCell()])await check('strict referenced partner '+p.bits.length,custom({p}),{exit:9});
    const trailing=beginCell().storeSlice(preset().beginParse()).storeBit(1).endCell();await check('preset rejects tail',trailing,{exit:9});
    await check('custom rejects tail',beginCell().storeSlice(custom().beginParse()).storeRef(empty).endCell(),{exit:9});
    await check('empty funding ignores malformed storage',empty,{storage:empty});
    await check('bounced deployment ignored before parsing',custom(),{storage:empty,bounced:true});
    await check('storage controller tail rejected',preset(),{storage:beginCell().storeAddress(controller).storeBit(1).endCell(),exit:9});
    await check('storage controller missing',preset(),{storage:empty,exit:9});
    await check('unknown opcode before storage',beginCell().storeUint(42,32).endCell(),{storage:empty,exit:65535});
    return {getters:[],messages,randomness:{blockSeed:randomSeed.toString('hex'),transactionLt:'1000000',memeSeed:String(seed)}};
}
