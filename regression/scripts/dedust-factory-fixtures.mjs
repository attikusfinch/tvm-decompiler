import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

// Storage and message expectations are authored from the protocol schema.
export async function checkFactory(oracle,candidate) {
    const project=path.resolve(root,'../reconstruction/dedust');
    async function compile(entry) {
        const r=await compileLegacyFunc({sources:await loadFuncSources(project,entry),targets:[entry]});
        assert.equal(r.status,'ok',r.message);return Cell.fromBoc(Buffer.from(r.codeBoc,'base64'))[0];
    }
    const blank=await compile('ClassicBlank/main.fc'),native=await compile('ClassicNativeVault/main.fc'),
        jettonVault=await compile('ClassicJettonVault/main.fc'),deposit=await compile('ClassicLiquidityDeposit/main.fc'),
        operatorCode=await compile('ClassicOperator/main.fc'),lp=await compile('ClassicLpWallet/main.fc'),
        replacement=await compile('tests/fixtures/factory-upgrade.fc');
    await fs.mkdir(path.join(project,'build/fixtures'),{recursive:true});
    await fs.writeFile(path.join(project,'build/fixtures/factory-upgrade.boc'),replacement.toBoc({idx:false,crc32:true}));
    const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(71),owner=addr(72),next=addr(73),stranger=addr(74),master=addr(75),resolver=addr(76);
    const empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell(),poolCode=payload;
    const asset0=beginCell().storeUint(0,4).endCell(),asset1=beginCell().storeUint(1,4).storeInt(0,8).storeBuffer(master.hash).endCell();
    const Q=123n,VALUE=1000000000n,NOW=1700000000;
    const defaults={owner,pending:null,unlock:0,version:9,poolVersion:8,poolCode,depositVersion:4,depositCode:deposit,operatorVersion:5,operatorCode};
    const vaultEntries=new Map([[0,{version:6,code:native}],[1,{version:7,code:jettonVault}]]);
    function vaultDictionary(entries=vaultEntries) {
        // The dictionary value is inline uint16 + ref, not a referenced value cell.
        const codec={serialize:(v,b)=>b.storeUint(v.version,16).storeRef(v.code),parse:s=>({version:s.loadUint(16),code:s.loadRef()})};
        const inline=Dictionary.empty(Dictionary.Keys.Uint(4),codec);for(const[k,v]of entries)inline.set(k,v);return inline;
    }
    function state(o={}) {
        o={...defaults,...o};
        const config=beginCell().storeUint(o.poolVersion,16).storeRef(o.poolCode).storeUint(o.depositVersion,16).storeRef(o.depositCode)
            .storeDict(vaultDictionary(o.entries)).storeRef(lp).endCell();
        const root=beginCell().storeAddress(o.owner).storeAddress(o.pending).storeUint(o.unlock,32).storeUint(o.version,16).storeRef(blank).storeRef(config);
        if(!o.legacy)root.storeUint(o.operatorVersion,16).storeMaybeRef(o.operatorCode);return root.endCell();
    }
    const descriptor=(kind,params,f=address)=>beginCell().storeAddress(f).storeUint(kind,8).storeBuilder(params).endCell();
    const template=data=>({code:blank,data}),target=data=>contractAddress(0,template(data));
    const operator=k=>target(descriptor(4,beginCell().storeUint(k,8)));
    const vaultConfig=(asset=asset0,f=address,k=1)=>descriptor(k,beginCell().storeSlice(asset.beginParse()),f);
    const poolConfig=(stable=0,a0=asset0,a1=asset1)=>descriptor(2,beginCell().storeBit(stable).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()));
    const depositConfig=(stable=0,a0=asset0,a1=asset1)=>descriptor(3,beginCell().storeRef(beginCell().storeAddress(owner).storeBit(stable).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).endCell()));
    const op=(n,q=Q)=>beginCell().storeUint(n,32).storeUint(q,64);
    const upgrade=(opcode,version,code=payload)=>op(opcode).storeUint(version,16).storeRef(code).endCell();
    const install=(version,code,tail=beginCell())=>op(2604311546).storeRef(blank).storeUint(version,16).storeRef(code).storeBuilder(tail).endCell();
    const upgradeBody=(version,code)=>op(444).storeUint(version,16).storeRef(code).endCell();
    const transfer=op(0xca61554e).storeAddress(next).endCell();
    const createVault=asset=>op(0x21cfe02b).storeSlice(asset.beginParse()).endCell();
    const createPool=(stable=0,a0=asset0,a1=asset1,p0=9,p1=6)=>stable?op(0x7c40ac87).storeSlice(a0.beginParse()).storeUint(p0,8).storeSlice(a1.beginParse()).storeUint(p1,8).endCell():op(0x97d51f2f).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).endCell();
    const poolUpgrade=(a0=asset0,a1=asset1)=>op(1407341230).storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse()).endCell();
    const fund=(config=vaultConfig(),a0=asset0,a1=asset1,t0=500n,t1=600n,funded=asset0)=>op(4031694118).storeRef(config).storeAddress(owner)
        .storeBit(0).storeSlice(a0.beginParse()).storeSlice(a1.beginParse())
        .storeRef(beginCell().storeCoins(t0).storeCoins(t1).storeSlice(funded.beginParse()).storeCoins(100).storeCoins(700).endCell())
        .storeMaybeRef(payload).storeMaybeRef(null).endCell();
    const net=await Blockchain.create(),cfg=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),net.config);
    const gp=cfg.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);const limit=gp.loadUintBig(64),flat=gp.loadUintBig(64);
    assert.equal(gp.loadUint(8),0xde);const price=gp.loadUintBig(64),gas=n=>{n=BigInt(n);return n<=limit?flat:flat+((n-limit)*price+65535n)/65536n;};
    const messages=[],getters=[];
    async function check(label,body,{data=state(),from=owner,value=VALUE,exit=0,expectedData=data,sends=[],code,reserve,bounced=false}={}) {
        const[t]=await compareMessages(oracle,candidate,[{label,body,from,value,bounced}],{data,address,accurateStorageStats:reserve!==undefined});
        assert.equal(t.sameObservedBehavior,true,label);assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');
        const actual=t.before;assert.equal(actual.exitCode,exit,label+': exit');assert.equal(actual.dataHash,expectedData.hash().toString('hex'),label+': storage');
        const actions=actual.actions;assert.equal(actions.length,sends.length+(code?1:0)+(reserve!==undefined?1:0),label+': actions');
        let index=0;
        if(code){assert.deepEqual(actions[index++],{type:'setCode',newCode:{cellHash:code.hash().toString('hex')}});assert.equal(actual.newCodeHash,code.equals(Cell.fromBoc(candidate)[0])?null:code.hash().toString('hex'));}
        if(reserve!==undefined){assert.equal(actions[index].type,'reserve');assert.equal(actions[index].mode,0);assert.equal(actions[index++].currency.coins,String(reserve));}
        for(const send of sends){const a=actions[index++];assert.equal(a.type,'sendMsg');assert.equal(a.mode,send.mode??64);assert.equal(a.outMsg.info.dest,send.to.toRawString());
            assert.equal(a.outMsg.info.bounce,send.bounce??true);assert.equal(a.outMsg.body.cellHash,send.body.hash().toString('hex'),label+': wire body');
            if(send.amount!==undefined)assert.equal(a.outMsg.info.value.coins,String(send.amount),label+': value');
            else {const v=BigInt(a.outMsg.info.value.coins);assert(v>0n&&v<VALUE-gas(BigInt(actual.gasUsed)+2399n),label+': independently bounded forwarded TON');}
            assert.deepEqual(a.outMsg.init,send.init?{splitDepth:null,special:null,libraries:null,code:{cellHash:blank.hash().toString('hex')},data:{cellHash:send.init.hash().toString('hex')}}:null,label+': StateInit');
        }
        messages.push(t);
    }
    await check('ownership transfer schedules 48 hours',transfer,{expectedData:state({pending:next,unlock:NOW+172800})});
    await check('ownership transfer rejects stranger',transfer,{from:stranger,exit:256});
    await check('pending owner cannot accept early',op(0xdee60404).endCell(),{data:state({pending:next,unlock:NOW+1}),from:next,exit:258});
    await check('pending owner accepts at exact boundary',op(0xdee60404).endCell(),{data:state({pending:next,unlock:NOW}),from:next,expectedData:state({owner:next})});
    await check('accept requires pending owner',op(0xdee60404).endCell(),{exit:257});
    await check('owner cancels pending transfer',op(0x16cb7fc2).endCell(),{data:state({pending:next,unlock:NOW+1}),expectedData:state()});
    for(const[opcode,from,previous,field,codeField]of [[0xa3e45df1,operator(1),8,'poolVersion','poolCode'],[2577941265,operator(1),4,'depositVersion','depositCode'],[0xe505d21a,owner,5,'operatorVersion','operatorCode']]){
        await check('install implementation opcode='+opcode,upgrade(opcode,previous+1),{from,expectedData:state({[field]:previous+1,[codeField]:payload})});
        await check('install rejects skipped version opcode='+opcode,upgrade(opcode,previous+2),{from,exit:275});
        await check('install rejects unauthorized sender opcode='+opcode,upgrade(opcode,previous+1),{from:stranger,exit:opcode===0xe505d21a?256:296});
    }
    for(const[tag,previous]of [[0,6],[1,7],[2,0]]){
        const entries=new Map(vaultEntries);entries.set(tag,{version:previous+1,code:payload});
        const body=op(0xbc3f26f6).storeUint(tag,4).storeUint(previous+1,16).storeRef(payload).endCell();
        await check('install Vault dictionary tag='+tag,body,{from:operator(1),expectedData:state({entries})});
        await check('install Vault rejects wrong sender tag='+tag,body,{from:owner,exit:296});
    }
    for(const[asset,version,code]of [[asset0,6,native],[asset1,7,jettonVault]]){
        const config=vaultConfig(asset);
        await check('create Vault tag='+asset.beginParse().preloadUint(4),createVault(asset),{sends:[{to:target(config),amount:0n,init:config,body:install(version,code)}]});
        await check('Vault deployment budget strict',createVault(asset),{value:99999999n,exit:263});
        await check('upgrade Vault',op(0x25d66911).storeSlice(asset.beginParse()).endCell(),{from:operator(2),sends:[{to:target(config),amount:0n,body:upgradeBody(version,code)}]});
        await check('reset Vault gas',op(2320600333).storeSlice(asset.beginParse()).endCell(),{sends:[{to:target(config),amount:0n,body:op(2640660523).endCell()}]});
    }
    await check('legacy Jetton uses resolver tail',op(0xc9a5752d).storeAddress(master).storeAddress(resolver).endCell(),{from:operator(6),sends:[{to:target(vaultConfig(asset1)),amount:0n,init:vaultConfig(asset1),body:install(7,jettonVault,beginCell().storeAddress(resolver))}]});
    for(const stable of [0,1])for(const reversed of [false,true]){
        const a0=reversed?asset1:asset0,a1=reversed?asset0:asset1,config=poolConfig(stable);
        const p0=stable?(reversed?6:9):0,p1=stable?(reversed?9:6):0;
        await check('Pool deployment stable='+stable+' reversed='+reversed,createPool(stable,a0,a1),{from:stable?operator(5):owner,sends:[{to:target(config),amount:0n,init:config,body:install(8,poolCode,beginCell().storeUint(stable?5:25,16).storeRef(lp).storeUint(p0,8).storeUint(p1,8))}]});
        await check('Pool deployment shortfall stable='+stable,createPool(stable,a0,a1),{from:stable?operator(5):owner,value:249999999n,exit:263});
    }
    await check('Pool rejects equal assets',createPool(0,asset0,asset0),{exit:262});
    await check('Pool upgrade sorts assets',poolUpgrade(asset1,asset0),{from:operator(2),sends:[{to:target(poolConfig()),amount:0n,body:upgradeBody(8,poolCode)}]});
    for(const role of [0,9,255]){
        const config=descriptor(4,beginCell().storeUint(role,8));
        await check('Operator deployment role='+role,op(0xb9d29997).storeUint(role,8).storeAddress(next).endCell(),{sends:[{to:target(config),amount:VALUE-gas(9959),mode:0,init:config,body:install(5,operatorCode,beginCell().storeAddress(next))}]});
        await check('Operator user change role='+role,op(0x1be6df93).storeUint(role,8).storeAddress(next).endCell(),{sends:[{to:target(config),amount:VALUE-gas(9222),mode:0,body:op(1223010653).storeAddress(next).endCell()}]});
        await check('Operator upgrade role='+role,op(0x0085f5a3).storeUint(role,8).endCell(),{from:operator(2),sends:[{to:target(config),amount:0n,body:upgradeBody(5,operatorCode)}]});
    }
    for(const reversed of [false,true]){
        const config=depositConfig(),body=fund(vaultConfig(),reversed?asset1:asset0,reversed?asset0:asset1);
        const t0=reversed?600:500,t1=reversed?500:600;
        await check('Deposit funding swapped='+reversed,body,{from:target(vaultConfig()),sends:[
            {to:target(config),amount:10000000n+gas(1288),mode:1,init:config,body:install(4,deposit,beginCell().storeCoins(700).storeCoins(t0).storeCoins(t1).storeMaybeRef(payload).storeMaybeRef(null))},
            {to:target(config),mode:0,body:op(1411649509).storeSlice(asset0.beginParse()).storeCoins(100).endCell()}]});
    }
    await check('Deposit rejects unrelated sender',fund(),{exit:264});
    await check('Deposit binds funded asset',fund(vaultConfig(),asset0,asset1,500n,600n,asset1),{from:target(vaultConfig()),exit:264});
    await check('Deposit binds factory',fund(vaultConfig(asset0,stranger)),{from:target(vaultConfig(asset0,stranger)),exit:264});
    await check('Deposit binds template kind',fund(vaultConfig(asset0,address,7)),{from:target(vaultConfig(asset0,address,7)),exit:264});
    await check('self Factory upgrade increments version',upgrade(0xdf4a27aa,10,Cell.fromBoc(candidate)[0]),{expectedData:state({version:10}),code:Cell.fromBoc(candidate)[0]});
    await check('Factory upgrade calls new hook',upgrade(0xdf4a27aa,10,replacement),{expectedData:beginCell().storeUint(0xdeadbeef,32).storeRef(state({version:10})).endCell(),code:replacement});
    await check('Factory upgrade rollback on failing hook',upgrade(0xdf4a27aa,13,replacement),{data:state({version:12}),exit:777});
    await check('Factory upgrade rejects skipped version',upgrade(0xdf4a27aa,11,replacement),{exit:275});
    await check('reset Factory reserves one TON',op(0x9f3f0937).endCell(),{reserve:1000000000n,sends:[{to:owner,amount:0n,mode:128,bounce:false,body:empty}]});
    await check('bounced empty ignores malformed storage',empty,{data:empty,bounced:true});
    await check('unknown opcode',op(42).endCell(),{exit:65535});
    await check('empty message is a funding-only no-op',empty);
    for(const[body,from]of [[transfer,owner],[createVault(asset0),owner],[createPool(),owner],[upgrade(0xa3e45df1,9),operator(1)],[fund(),target(vaultConfig())]]){
        await check('truncated query opcode='+body.beginParse().loadUint(32),beginCell().storeBits(body.beginParse().loadBits(95)).endCell(),{from,exit:9});
        await check('strict suffix opcode='+body.beginParse().loadUint(32),beginCell().storeSlice(body.beginParse()).storeBit(1).endCell(),{from,exit:9});
    }
    const I=value=>({type:'int',value:String(value)}),C=c=>({type:'cell',cellHash:c.hash().toString('hex')}),S=c=>({type:'slice',cellHash:c.hash().toString('hex')}),A=a=>S(beginCell().storeAddress(a).endCell());
    async function getter(method,args,expected,{data=state(),exit=0}={}) {
        const[t]=await compareGetters(oracle,candidate,[{method,args}],{data,address});assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);
        assert.equal(t.before.exitCode,exit);if(!exit)assert.deepEqual(t.before.stack,expected);getters.push(t);
    }
    for(const legacy of [false,true]){
        const data=state({pending:next,unlock:NOW+172800,legacy});
        await getter(110004,[],[A(owner),A(next),I(NOW+172800)],{data});await getter(82320,[],[I(9)],{data});
        await getter(79554,[],[I(8),C(poolCode)],{data});await getter(120195,[],[I(4),C(deposit)],{data});
        await getter(78248,[],legacy?[I(0),{type:'null'}]:[I(5),C(operatorCode)],{data});
    }
    for(const[tag,e]of vaultEntries)await getter(129291,[tag],[I(e.version),C(e.code)]);
    await getter(129291,[2],null,{exit:260});
    for(const role of [0,1,2,9,255])await getter(126188,[role],[A(operator(role))]);
    for(const asset of [asset0,asset1])await getter(76695,[{type:'slice',cell:asset}],[A(target(vaultConfig(asset)))]);
    for(const stable of [0,1])for(const reversed of [false,true]){
        const a0=reversed?asset1:asset0,a1=reversed?asset0:asset1,args=[stable,{type:'slice',cell:a0},{type:'slice',cell:a1}];
        await getter(101789,args,[A(target(poolConfig(stable)))]);
        await getter(84481,[{type:'slice',cell:beginCell().storeAddress(owner).endCell()},...args],[A(target(depositConfig(stable)))]);
    }
    await getter(101789,[0,{type:'slice',cell:asset0},{type:'slice',cell:asset0}],null,{exit:262});
    for(const method of [110004,82320,79554,120195,78248])await getter(method,[],null,{data:empty,exit:9});
    return {getters,messages};
}
