import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

// All expected storage, bodies and fees below are authored independently of the recovery.
export async function checkNativeVault(oracle,candidate) {
    const project=path.resolve(root,'../reconstruction/dedust');
    async function compile(entry) {
        const r=await compileLegacyFunc({sources:await loadFuncSources(project,entry),targets:[entry]});
        assert.equal(r.status,'ok',r.message);return Cell.fromBoc(Buffer.from(r.codeBoc,'base64'))[0];
    }
    const blank=await compile('ClassicBlank/main.fc'),installed=await compile('tests/fixtures/native-vault-upgrade.fc');
    await fs.mkdir(path.join(project,'build/fixtures'),{recursive:true});
    await fs.writeFile(path.join(project,'build/fixtures/native-vault-upgrade.boc'),installed.toBoc({idx:false,crc32:true}));
    const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(71),factory=addr(72),owner=addr(73),recipient=addr(74),stranger=addr(75);
    const empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell();
    const native=beginCell().storeUint(0,4).endCell(),jetton=n=>beginCell().storeUint(1,4).storeInt(0,8).storeBuffer(Buffer.alloc(32,n)).endCell();
    const asset1=jetton(76),asset2=jetton(77),Q=123n,VALUE=1000000000n;
    const descriptor=beginCell().storeAddress(factory).storeUint(1,8).storeSlice(native.beginParse()).endCell();
    const state=(amount=10000n,version=9)=>beginCell().storeRef(descriptor).storeAddress(factory).storeRef(blank).storeUint(version,16).storeCoins(amount).endCell();
    const template=data=>contractAddress(0,{code:blank,data});
    const poolConfig=(f=factory,k=2,a0=native,a1=asset1)=>beginCell().storeAddress(f).storeUint(k,8).storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).endCell();
    const depositConfig=(f=factory,k=3,a0=native,a1=asset1)=>beginCell().storeAddress(f).storeUint(k,8)
        .storeRef(beginCell().storeAddress(owner).storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).endCell()).endCell();
    const operator=template(beginCell().storeAddress(factory).storeUint(4,8).storeUint(9,8).endCell());
    const blockchain=await Blockchain.create(),config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
    const gp=config.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);
    const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
    const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
    const fp=config.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);
    const lump=fp.loadUintBig(64),bitPrice=fp.loadUintBig(64),cellPrice=fp.loadUintBig(64);fp.skip(32);const firstFraction=BigInt(fp.loadUint(16));
    const originalFee=n=>n*65536n/(65536n-firstFraction);
    const fwd=(cells,bits)=>lump+((BigInt(cells)*cellPrice+BigInt(bits)*bitPrice+65535n)>>16n);
    const swapBudget=(fee,depth)=>10000000n+gas(6481)+2n*originalFee(fee)+(fee+gas(28000)+originalFee(fee))*BigInt(depth)+fee+gas(9289)+50000000n;
    const joinBudget=fee=>gas(11852)+2n*originalFee(fee)+gas(19123)+originalFee(fee)+10000000n+gas(1288)+gas(14701)+2n*originalFee(fee)
        +gas(22084)+originalFee(fee)+gas(22476)+3n*originalFee(fee)+2n*(gas(9888)+originalFee(fee)+50000000n);
    const swap=(amount=100n,route=null,p=payload,q=Q)=>beginCell().storeUint(3926267997,32).storeUint(q,64).storeCoins(amount).storeAddress(recipient)
        .storeBit(1).storeCoins(321).storeMaybeRef(route).storeRef(p).endCell();
    const swapBody=(amount,route,p,q=Q)=>beginCell().storeUint(1643009069,32).storeUint(q,64).storeRef(descriptor).storeCoins(amount)
        .storeAddress(owner).storeBit(1).storeCoins(321).storeMaybeRef(route).storeRef(p).endCell();
    const join=(a0=native,a1=asset1,t0=500n,t1=600n,amount=100n,success=payload,failure=null)=>beginCell().storeUint(3579725446,32).storeUint(Q,64)
        .storeCoins(amount).storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse())
        .storeRef(beginCell().storeCoins(700).storeCoins(t0).storeCoins(t1).endCell()).storeMaybeRef(success).storeMaybeRef(failure).endCell();
    const joinBody=(a0,a1,success,failure)=>beginCell().storeUint(4031694118,32).storeUint(Q,64).storeRef(descriptor).storeAddress(owner)
        .storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).storeRef(beginCell().storeCoins(500).storeCoins(600)
            .storeSlice(native.beginParse()).storeCoins(100).storeCoins(700).endCell()).storeMaybeRef(success).storeMaybeRef(failure).endCell();
    const payout=(config=poolConfig(),amount=100n,p=payload)=>beginCell().storeUint(2907617013,32).storeUint(Q,64).storeRef(config).storeCoins(amount).storeAddress(recipient).storeMaybeRef(p).endCell();
    const refund=(config=depositConfig(),amount=100n,p=payload)=>beginCell().storeUint(1795913855,32).storeUint(Q,64).storeRef(config).storeCoins(amount).storeMaybeRef(p).endCell();
    const ack=p=>beginCell().storeUint(1196394191,32).storeUint(Q,64).storeMaybeRef(p).endCell();
    const ready=beginCell().storeUint(3912500665,32).storeUint(Q,64).endCell();
    const withdraw=beginCell().storeUint(650525367,32).storeUint(Q,64).storeAddress(recipient).endCell();
    const upgrade=(version=10,code=installed)=>beginCell().storeUint(444,32).storeUint(Q,64).storeUint(version,16).storeRef(code).endCell();
    const messages=[],getters=[];
    async function check(label,body,{data=state(),from=owner,value=VALUE,forwardFee=0n,bounced=false,exit=0,expectedData=data,sends=[],replacement,reserve}={}) {
        const [test]=await compareMessages(oracle,candidate,[{label,body,from,value,forwardFee,bounced}],{data,address,accurateStorageStats:reserve!==undefined});
        assert.equal(test.sameObservedBehavior,true,label);assert.equal(test.before.gasUsed,test.after.gasUsed,label+': gas');
        const actual=test.before;assert.equal(actual.exitCode,exit,label+': exit');assert.equal(actual.dataHash,expectedData.hash().toString('hex'),label+': storage');
        assert.equal(actual.codeChanged,replacement!==undefined&&!replacement.equals(Cell.fromBoc(candidate)[0]));
        assert.equal(actual.newCodeHash,actual.codeChanged?replacement.hash().toString('hex'):null);
        const actions=actual.actions;
        assert.equal(actions.length,sends.length+(replacement?1:0)+(reserve!==undefined?1:0),label+': action count');
        if(replacement)assert.deepEqual(actions[0],{type:'setCode',newCode:{cellHash:replacement.hash().toString('hex')}});
        if(reserve!==undefined){const a=actions[0];assert.equal(a.type,'reserve');assert.equal(a.currency.coins,String(reserve));assert.equal(a.mode,0);}
        for(const [i,s]of sends.entries()) {
            const a=actions[i+(replacement?1:0)+(reserve!==undefined?1:0)];assert.equal(a.type,'sendMsg');assert.equal(a.mode,s.mode??0);
            assert.equal(a.outMsg.info.dest,s.to.toRawString());assert.equal(a.outMsg.info.value.coins,String(s.amount));assert.equal(a.outMsg.info.bounce,s.bounce??true);
            assert.equal(a.outMsg.body.cellHash,s.body.hash().toString('hex'),label+': body');assert.equal(a.outMsg.init,null);
        }
        messages.push(test);
    }
    for(const route of [null,payload,beginCell().storeRef(beginCell().storeRef(payload).endCell()).endCell()])for(const fee of [0n,1000001n]) {
        await check('swap route depth='+ (route?.depth()??0)+' fee='+fee,swap(100n,route),{forwardFee:fee,expectedData:state(10100n),
            sends:[{to:recipient,amount:VALUE-gas(6481)-100n,body:swapBody(100n,route,payload)}]});
    }
    await check('swap zero principal',swap(0n),{sends:[{to:recipient,amount:VALUE-gas(6481),body:swapBody(0n,null,payload)}]});
    await check('swap max query',swap(100n,null,payload,(1n<<64n)-1n),{expectedData:state(10100n),sends:[{to:recipient,amount:VALUE-gas(6481)-100n,body:swapBody(100n,null,payload,(1n<<64n)-1n)}]});
    await check('swap budget shortfall',swap(),{value:100n+swapBudget(0n,1)-1n,exit:263});
    let deep=payload;for(let i=0;i<4;i++)deep=beginCell().storeRef(deep).endCell();
    await check('swap route depth limit',swap(100n,deep),{exit:278});
    await check('swap coin overflow rollback',swap(1n),{data:state((1n<<120n)-1n),exit:5});
    for(const [a0,a1]of [[native,asset1],[asset1,native],[native,native]])for(const success of [null,payload]) {
        await check('join native asset placement '+a0.hash().toString('hex')+' callbacks='+Boolean(success),join(a0,a1,500n,600n,100n,success,payload),{
            expectedData:state(10100n),sends:[{to:factory,amount:VALUE-gas(10993)-100n,body:joinBody(a0,a1,success,payload)}]});
    }
    await check('join budget shortfall',join(),{value:100n+joinBudget(0n)-1n,exit:263});
    await check('join both targets must be positive',join(native,asset1,0n),{exit:276});
    await check('join second target zero',join(native,asset1,500n,0n),{exit:276});
    await check('join must include TON',join(asset1,asset2),{exit:291});
    await check('join invalid asset tag',join(beginCell().storeUint(2,4).endCell()),{exit:261});
    for(const p of [null,payload]) {
        await check('pool payout payload='+Boolean(p),payout(poolConfig(),100n,p),{from:template(poolConfig()),expectedData:state(9900n),
            sends:[{to:recipient,amount:VALUE-gas(8234)+100n,bounce:false,body:ack(p)}]});
        await check('deposit refund payload='+Boolean(p),refund(depositConfig(),100n,p),{from:template(depositConfig()),expectedData:state(9900n),
            sends:[{to:owner,amount:VALUE-gas(9093)+100n,bounce:false,body:ack(p)}]});
    }
    for(const [label,build,makeConfig,code]of [['pool',payout,poolConfig,265],['deposit',refund,depositConfig,272]]) {
        await check(label+' rejects stranger',build(),{exit:code});
        for(const config of [makeConfig(stranger),makeConfig(factory,7)])await check(label+' binds factory and template kind',build(config),{from:template(config),exit:code});
        await check(label+' subtraction below zero rolls back',build(makeConfig(),10001n),{from:template(makeConfig()),exit:5});
    }
    await check('readiness response',ready,{sends:[{to:owner,amount:VALUE-gas(4924),body:beginCell().storeUint(2836651021,32).storeUint(Q,64).storeBit(1).endCell()}]});
    await check('readiness budget shortfall',ready,{value:gas(4924)+fwd(1,802)-1n,exit:263});
    await check('operator withdrawal reserves locked TON and sends excess',withdraw,{from:operator,reserve:10010000n,sends:[{to:recipient,amount:0n,mode:128,bounce:false,body:empty}]});
    await check('withdrawal requires derived operator',withdraw,{exit:296});
    for(const version of [0,8,9])await check('nonincreasing upgrade is ignored '+version,upgrade(version),{from:factory});
    await check('upgrade requires factory before body decoding',beginCell().storeUint(444,32).endCell(),{exit:259});
    const updated=state(10000n,10);
    await check('upgrade runs newly installed hook',upgrade(),{from:factory,replacement:installed,expectedData:beginCell().storeUint(0xdeadbeef,32).storeRef(updated).endCell(),
        sends:[{to:factory,amount:0n,mode:64,bounce:false,body:empty}]});
    await check('upgrade hook failure rolls back data code and actions',upgrade(13),{from:factory,exit:777});
    await check('self upgrade invokes hook with updated data',upgrade(10,Cell.fromBoc(candidate)[0]),{from:factory,replacement:Cell.fromBoc(candidate)[0],expectedData:updated,
        sends:[{to:factory,amount:0n,mode:64,bounce:false,body:empty}]});
    await check('bounced message ignores malformed storage',empty,{bounced:true,data:empty});
    await check('unknown opcode ignores malformed storage',beginCell().storeUint(42,32).endCell(),{data:empty,exit:65535});
    await check('empty body rejected',empty,{exit:9});
    for(const [op,from]of [[3926267997,owner],[2907617013,owner],[3579725446,owner],[1795913855,owner],[3912500665,owner],[444,factory],[650525367,operator]]) {
        await check('truncated query opcode='+op,beginCell().storeUint(op,32).storeUint(0,63).endCell(),{from,exit:9});
        await check('malformed storage opcode='+op,beginCell().storeUint(op,32).endCell(),{from,data:empty,exit:9});
    }
    for(const body of [swap(),join(),payout(),refund(),ready,upgrade(),withdraw]) {
        const op=body.beginParse().loadUint(32),from=op===444?factory:op===650525367?operator:op===2907617013?template(poolConfig()):op===1795913855?template(depositConfig()):owner;
        await check('body suffix opcode='+op,beginCell().storeSlice(body.beginParse()).storeBit(1).endCell(),{from,exit:9});
    }
    for(const [amount,version]of [[0n,0],[10000n,9],[(1n<<120n)-1n,65535]]) {
        const expected=new Map([[89352,[{type:'slice',cellHash:native.hash().toString('hex')}]],
            [109867,[{type:'int',value:String(amount)}]],[82320,[{type:'int',value:String(version)}]],
            [89995,[{type:'slice',cellHash:beginCell().storeAddress(factory).endCell().hash().toString('hex')}] ]]);
        const tests=await compareGetters(oracle,candidate,[...expected.keys()].map(method=>({method,args:[]})),{data:state(amount,version),address});
        for(const t of tests){assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.exitCode,0);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.deepEqual(t.before.stack,expected.get(t.method));getters.push(t);}
    }
    for(const fee of [0n,1n,1000001n])for(const depth of [0,1,4,5]) {
        const [t]=await compareGetters(oracle,candidate,[{method:117300,args:[fee,BigInt(depth)]}],{address});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.deepEqual(t.before.stack,[{type:'int',value:String(swapBudget(fee,depth))}]);getters.push(t);
    }
    for(const fee of [0n,1n,1000001n]) {
        const [t]=await compareGetters(oracle,candidate,[{method:109505,args:[fee]}],{address});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.deepEqual(t.before.stack,[{type:'int',value:String(joinBudget(fee))}]);getters.push(t);
    }
    const legacy=beginCell().storeRef(descriptor).storeAddress(factory).storeRef(blank).storeUint(4,16).endCell();
    const hook=await compareGetters(oracle,candidate,[{method:43092,args:[]}],{data:legacy,address});
    assert.equal(hook[0].sameObservedBehavior,true);assert.equal(hook[0].before.exitCode,0);assert.deepEqual(hook[0].before.stack,[]);getters.push(...hook);
    const originalBlank=await fs.readFile(path.join(project,'oracles/ClassicBlank.boc'));
    const installation=beginCell().storeUint(2604311546,32).storeUint(Q,64).storeRef(blank).storeUint(9,16).storeRef(Cell.fromBoc(candidate)[0]).endCell();
    const [ctor]=await compareMessages(originalBlank,blank.toBoc(),[{label:'Blank initializes TON vault',from:factory,body:installation}],{data:descriptor,address});
    assert.equal(ctor.sameObservedBehavior,true);assert.equal(ctor.before.exitCode,0);assert.equal(ctor.before.dataHash,state(0n).hash().toString('hex'));
    assert.equal(ctor.before.newCodeHash,Cell.fromBoc(candidate)[0].hash().toString('hex'));assert.equal(ctor.before.actions.length,1);messages.push(ctor);
    return {getters,messages};
}
