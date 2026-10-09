import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

// Independent protocol serialization and fee formulas; no decompiled expectations.
export async function checkJettonVault(oracle,candidate) {
    const project=path.resolve(root,'../reconstruction/dedust');
    async function compile(entry) {
        const r=await compileLegacyFunc({sources:await loadFuncSources(project,entry),targets:[entry]});
        assert.equal(r.status,'ok',r.message);return Cell.fromBoc(Buffer.from(r.codeBoc,'base64'))[0];
    }
    const blank=await compile('ClassicBlank/main.fc'),installed=await compile('tests/fixtures/jetton-vault-upgrade.fc'),code=Cell.fromBoc(candidate)[0];
    await fs.mkdir(path.join(project,'build/fixtures'),{recursive:true});
    await fs.writeFile(path.join(project,'build/fixtures/jetton-vault-upgrade.boc'),installed.toBoc({idx:false,crc32:true}));
    const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(81),factory=addr(82),owner=addr(83),master=addr(84),wallet=addr(85),stranger=addr(86),recipient=addr(87);
    const empty=beginCell().endCell(),callback=beginCell().storeUint(0xcafe,16).endCell(),Q=123n,VALUE=1000000000n;
    const native=beginCell().storeUint(0,4).endCell(),jetton=a=>beginCell().storeUint(1,4).storeInt(a.workChain,8).storeBuffer(a.hash).endCell();
    const asset=jetton(master),other=jetton(stranger);
    const descriptor=(a=asset)=>beginCell().storeAddress(factory).storeUint(1,8).storeSlice(a.beginParse()).endCell();
    const defaults={ready:true,version:9,wallet,master,asset};
    const state=(patch={},original)=>{const o={...defaults,...patch};return beginCell().storeRef(original??descriptor(o.asset)).storeRef(blank)
        .storeBit(o.ready).storeAddress(o.master).storeAddress(o.wallet).storeUint(o.version,16).endCell();};
    const template=data=>contractAddress(0,{code:blank,data});
    const poolConfig=(f=factory,k=2)=>beginCell().storeAddress(f).storeUint(k,8).storeBit(0).storeSlice(asset.beginParse()).storeSlice(native.beginParse()).endCell();
    const depositConfig=(f=factory,k=3)=>beginCell().storeAddress(f).storeUint(k,8).storeRef(beginCell().storeAddress(owner)
        .storeBit(0).storeSlice(asset.beginParse()).storeSlice(native.beginParse()).endCell()).endCell();
    const operator=template(beginCell().storeAddress(factory).storeUint(4,8).storeUint(9,8).endCell());
    const blockchain=await Blockchain.create(),config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
    const gp=config.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);
    const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
    const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
    const fp=config.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);const lump=fp.loadUintBig(64),bit=fp.loadUintBig(64),cell=fp.loadUintBig(64);
    fp.skip(32);const first=BigInt(fp.loadUint(16)),originalFee=n=>n*65536n/(65536n-first);
    const forwardFee=(cells,bits)=>lump+((BigInt(cells)*cell+BigInt(bits)*bit+65535n)>>16n);
    const swapBudget=(fee,depth)=>10000000n+gas(8258)+2n*originalFee(fee)+(fee+gas(28000)+originalFee(fee))*BigInt(depth)+fee+gas(9289)+50000000n;
    const joinBudget=fee=>gas(11852)+2n*originalFee(fee)+gas(19123)+originalFee(fee)+10000000n+gas(1288)+gas(14701)+2n*originalFee(fee)
        +gas(21984)+originalFee(fee)+gas(22476)+3n*originalFee(fee)+2n*(gas(9888)+originalFee(fee)+50000000n);
    const swapPayload=(route=null)=>beginCell().storeUint(3818968194,32).storeAddress(recipient).storeBit(1).storeCoins(321).storeMaybeRef(route).storeRef(callback).endCell();
    const joinPayload=(a0=asset,a1=native,t0=500n,t1=600n)=>beginCell().storeUint(1088489686,32).storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse())
        .storeCoins(700).storeCoins(t0).storeCoins(t1).storeMaybeRef(callback).storeMaybeRef(null).endCell();
    const notification=(payload=swapPayload(),ref=true,amount=100n,q=Q)=>{const b=beginCell().storeUint(1935855772,32).storeUint(q,64).storeCoins(amount).storeAddress(owner).storeBit(ref);
        return (ref?b.storeRef(payload):b.storeSlice(payload.beginParse())).endCell();};
    const transfer=(to=owner,amount=100n,forwarded=0n,payload=null,q=Q)=>beginCell().storeUint(260734629,32).storeUint(q,64).storeCoins(amount)
        .storeAddress(to).storeAddress(to).storeBit(0).storeCoins(forwarded).storeMaybeRef(payload).endCell();
    const refundSend=to=>({to,value:0n,mode:64,body:transfer()});
    const payout=(config=poolConfig(),payload=callback)=>beginCell().storeUint(2907617013,32).storeUint(Q,64).storeRef(config).storeCoins(100).storeAddress(recipient).storeMaybeRef(payload).endCell();
    const refund=(config=depositConfig(),payload=callback)=>beginCell().storeUint(1795913855,32).storeUint(Q,64).storeRef(config).storeCoins(100).storeMaybeRef(payload).endCell();
    const resolve=(to=wallet,includeOwner=false,ownerData=beginCell().storeAddress(address).endCell())=>{const b=beginCell().storeUint(3513996288,32).storeUint(Q,64).storeAddress(to).storeBit(includeOwner);
        return(includeOwner?b.storeRef(ownerData):b).endCell();};
    const upgrade=(version=10,installedCode=installed)=>beginCell().storeUint(444,32).storeUint(Q,64).storeUint(version,16).storeRef(installedCode).endCell();
    const ready=beginCell().storeUint(3912500665,32).storeUint(Q,64).endCell();
    const withdraw=beginCell().storeUint(650525367,32).storeUint(Q,64).storeAddress(recipient).endCell();
    const cancel=beginCell().storeUint(2640660523,32).endCell(),inactive={ready:false,wallet:null};
    const messages=[],getters=[];
    async function check(label,body,{o={},data=state(o),from=wallet,value=VALUE,fee=0n,bounced=false,exit=0,expectedData=data,deleted=false,sends=[],replacement,reserve,checkValues=true}={}) {
        const [t]=await compareMessages(oracle,candidate,[{label,body,from,value,forwardFee:fee,bounced}],{data,address,accurateStorageStats:reserve!==undefined});
        assert.equal(t.sameObservedBehavior,true,label);assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');const a=t.before;
        assert.equal(a.exitCode,exit,label+': exit');assert.equal(a.dataHash,deleted?null:expectedData.hash().toString('hex'),label+': storage');
        assert.equal(a.codeChanged,replacement!==undefined&&!replacement.equals(code));assert.equal(a.newCodeHash,a.codeChanged?replacement.hash().toString('hex'):null);
        assert.equal(a.actions.length,sends.length+(replacement?1:0)+(reserve!==undefined?1:0),label+': actions');
        if(replacement)assert.deepEqual(a.actions[0],{type:'setCode',newCode:{cellHash:replacement.hash().toString('hex')}});
        if(reserve!==undefined){assert.equal(a.actions[0].type,'reserve');assert.equal(a.actions[0].currency.coins,String(reserve));assert.equal(a.actions[0].mode,0);}
        for(const[i,e]of sends.entries()){
            const s=a.actions[i+(replacement?1:0)+(reserve!==undefined?1:0)];assert.equal(s.type,'sendMsg');assert.equal(s.mode,e.mode??0);
            assert.equal(s.outMsg.info.dest,e.to.toRawString());if(checkValues)assert.equal(s.outMsg.info.value.coins,String(e.value));
            assert.equal(s.outMsg.info.bounce,e.bounce??true);assert.equal(s.outMsg.body.cellHash,e.body.hash().toString('hex'),label+': body');assert.equal(s.outMsg.init,null);
        }
        messages.push(t);return a;
    }
    for(const ref of [false,true])for(const route of [null,callback])for(const fee of [0n,1000001n]) {
        const expected=beginCell().storeUint(1643009069,32).storeUint(Q,64).storeRef(descriptor()).storeCoins(100).storeAddress(owner)
            .storeBit(1).storeCoins(321).storeMaybeRef(route).storeRef(callback).endCell();
        await check('swap inline='+!ref+' route='+Boolean(route)+' fee='+fee,notification(swapPayload(route),ref),{fee,sends:[{to:recipient,value:VALUE-gas(8258),body:expected}]});
    }
    await check('swap insufficient budget refunds instead of throwing',notification(),{value:swapBudget(0n,1)-1n,sends:[refundSend(wallet)]});
    let deep=callback;for(let i=0;i<4;i++)deep=beginCell().storeRef(deep).endCell();
    await check('swap depth limit refunds',notification(swapPayload(deep)),{sends:[refundSend(wallet)]});
    for(const ref of [false,true])for(const[a0,a1]of [[asset,native],[native,asset],[asset,asset]]) {
        const expected=beginCell().storeUint(4031694118,32).storeUint(Q,64).storeRef(descriptor()).storeAddress(owner).storeBit(0)
            .storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).storeRef(beginCell().storeCoins(500).storeCoins(600).storeSlice(asset.beginParse()).storeCoins(100).storeCoins(700).endCell())
            .storeMaybeRef(callback).storeMaybeRef(null).endCell();
        // GASCONSUMED is intentionally dynamic. Exact BOC/gas compares it; assert its independently bounded spend.
        const actual=await check('join inline='+!ref+' first='+a0.hash().toString('hex'),notification(joinPayload(a0,a1),ref),{sends:[{to:factory,body:expected}],checkValues:false});
        const sent=BigInt(actual.actions[0].outMsg.info.value.coins);assert.ok(sent<VALUE&&sent>VALUE-gas(BigInt(actual.gasUsed)+3687n));
    }
    for(const[payload,expectedExit,label]of [[joinPayload(asset,native,0n),276,'zero target'],[joinPayload(other,native),291,'wrong funded asset'],
        [joinPayload(beginCell().storeUint(2,4).endCell()),261,'invalid asset tag'],[empty,9,'empty payload'],[beginCell().storeUint(42,32).endCell(),65535,'unknown payload']])
        await check('caught '+label+' commits refund and rethrows',notification(payload),{exit:expectedExit,sends:[refundSend(wallet)]});
    await check('caught join budget shortfall',notification(joinPayload()),{value:joinBudget(0n)-1n,exit:263,sends:[refundSend(wallet)]});
    await check('notification from non-wallet refunds sender',notification(),{from:stranger,sends:[refundSend(stranger)]});
    await check('unready notification refunds without inspecting payload',notification(empty),{o:inactive,sends:[refundSend(wallet)]});
    await check('unauthorized inline empty payload still refunds',notification(empty,false),{from:stranger,sends:[refundSend(stranger)]});
    await check('missing referenced notification payload fails before refund',beginCell().storeUint(1935855772,32).storeUint(Q,64).storeCoins(100).storeAddress(owner).storeBit(1).endCell(),{exit:9});
    for(const p of [null,callback,empty]) {
        const remaining=VALUE-gas(9289),forwarded=remaining>50000000n?remaining-50000000n:0n;
        await check('pool payout callback='+ (p?p.hash().toString('hex'):'null'),payout(poolConfig(),p),{from:template(poolConfig()),sends:[{to:wallet,value:remaining,body:transfer(recipient,100n,forwarded,p)}]});
        const refundValue=VALUE-gas(9888);
        await check('deposit refund callback='+Boolean(p),refund(depositConfig(),p),{from:template(depositConfig()),sends:[{to:wallet,value:refundValue,body:transfer(owner,100n,refundValue-50000000n,p)}]});
    }
    await check('pool payout rejects unrelated sender',payout(),{exit:265});await check('deposit refund rejects unrelated sender',refund(),{exit:272});
    for(const [build,make,exit]of [[payout,poolConfig,265],[refund,depositConfig,272]])for(const c of [make(stranger),make(factory,7)])await check('config authentication factory/kind '+exit,build(c),{from:template(c),exit});
    for(const includeOwner of [false,true])await check('master resolves wallet include-owner='+includeOwner,resolve(wallet,includeOwner),{o:inactive,from:master,expectedData:state({ready:true,wallet})});
    await check('master optional owner field requires address',resolve(wallet,true,empty),{o:inactive,from:master,exit:9});
    await check('resolution requires master before decoding',beginCell().storeUint(3513996288,32).endCell(),{o:inactive,exit:257});
    await check('already-ready resolution rejected',resolve(),{from:master,exit:274});
    await check('resolution stores supplied none address',resolve(null),{o:inactive,from:master,expectedData:state({ready:true,wallet:null})});
    for(const readyFlag of [true,false])await check('readiness response '+readyFlag,ready,{o:{ready:readyFlag},sends:[{to:wallet,value:VALUE-gas(5792),body:beginCell().storeUint(2836651021,32).storeUint(Q,64).storeBit(readyFlag).endCell()}]});
    await check('readiness underfunded',ready,{value:gas(5792)+forwardFee(1,802)-1n,exit:263});
    await check('operator excess withdrawal',withdraw,{from:operator,reserve:10000000n,sends:[{to:recipient,value:0n,mode:128,bounce:false,body:empty}]});
    await check('excess withdrawal requires operator',withdraw,{exit:296});
    await check('factory cancels inactive resolution',cancel,{o:inactive,from:factory,deleted:true,sends:[{to:factory,value:0n,mode:162,bounce:false,body:empty}]});
    await check('factory cannot cancel active vault',cancel,{from:factory,exit:274});await check('cancel requires factory',cancel,{o:inactive,exit:259});
    for(const readyFlag of [false,true])await check('bounced resolution request deletes vault regardless of readiness '+readyFlag,
        beginCell().storeUint(0,32).storeUint(745978227,32).endCell(),{o:{ready:readyFlag},bounced:true,deleted:true,sends:[{to:factory,value:0n,mode:162,bounce:false,body:empty}]});
    await check('unrelated bounce ignored before storage',beginCell().storeUint(0,32).storeUint(42,32).endCell(),{bounced:true,data:empty});
    for(const version of [0,8,9])await check('nonincreasing version ignored '+version,upgrade(version),{from:factory});
    await check('upgrade requires readiness',upgrade(),{o:inactive,from:factory,exit:273});await check('upgrade requires factory',upgrade(),{exit:259});
    await check('upgrade executes installed hook',upgrade(),{from:factory,replacement:installed,expectedData:beginCell().storeUint(0xdeadbeef,32).storeRef(state({version:10})).endCell()});
    await check('upgrade failure rolls back',upgrade(13),{from:factory,exit:777});await check('self upgrade',upgrade(10,code),{from:factory,replacement:code,expectedData:state({version:10})});
    await check('unknown opcode skips malformed storage',beginCell().storeUint(42,32).endCell(),{data:empty,exit:65535});await check('empty body',empty,{exit:9});
    for(const [op,from,o]of [[1935855772,wallet,{}],[2907617013,wallet,{}],[1795913855,wallet,{}],[3912500665,wallet,{}],[444,factory,{}],[650525367,operator,{}],[3513996288,master,inactive]])
        await check('truncated query '+op,beginCell().storeUint(op,32).storeUint(0,63).endCell(),{from,o,exit:9});
    for(const o of [{},{ready:false,wallet:null,version:0},{asset:native,version:65535}]) {
        const x={...defaults,...o},expected=new Map([[89352,[{type:'slice',cellHash:x.asset.hash().toString('hex')}]],
            [69014,[{type:'slice',cellHash:beginCell().storeAddress(x.wallet).endCell().hash().toString('hex')}]],
            [66908,[{type:'int',value:x.ready?'-1':'0'}]],[82320,[{type:'int',value:String(x.version)}]],
            [89995,[{type:'slice',cellHash:beginCell().storeAddress(factory).endCell().hash().toString('hex')}]]]);
        const tests=await compareGetters(oracle,candidate,[...expected.keys()].map(method=>({method,args:[]})),{data:state(o),address});
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
    const originalBlank=await fs.readFile(path.join(project,'oracles/ClassicBlank.boc'));
    for(const override of [null,stranger]) {
        const b=beginCell().storeUint(2604311546,32).storeUint(Q,64).storeRef(blank).storeUint(9,16).storeRef(code);if(override)b.storeAddress(override);
        const [t]=await compareMessages(originalBlank,blank.toBoc(),[{label:'Blank installs jetton vault override='+Boolean(override),from:factory,body:b.endCell()}],{data:descriptor(),address});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.exitCode,0);assert.equal(t.before.dataHash,state({ready:false,wallet:null,master:override??master}).hash().toString('hex'));
        assert.equal(t.before.newCodeHash,code.hash().toString('hex'));assert.equal(t.before.actions.length,2);assert.equal(t.before.actions[1].mode,64);
        assert.equal(t.before.actions[1].outMsg.info.dest,(override??master).toRawString());assert.equal(t.before.actions[1].outMsg.body.cellHash,
            beginCell().storeUint(745978227,32).storeUint(0,64).storeAddress(address).storeBit(0).endCell().hash().toString('hex'));messages.push(t);
    }
    return {getters,messages};
}
