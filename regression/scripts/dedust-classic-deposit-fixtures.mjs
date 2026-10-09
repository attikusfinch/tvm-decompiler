import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,Cell,beginCell,contractAddress} from '@ton/core';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

// Expectations come from independently serialized messages/state, not decompiler output.
export async function checkClassicDeposit(oracle,candidate) {
    const project=path.resolve(root,'../reconstruction');
    const addr=n=>new Address(0,Buffer.alloc(32,n));
    const address=addr(61),factory=addr(62),owner=addr(63),stranger=addr(64);
    const empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell();
    const native=beginCell().storeUint(0,4).endCell();
    const jetton=n=>beginCell().storeUint(1,4).storeInt(0,8).storeBuffer(Buffer.alloc(32,n)).endCell();
    const asset0=native,asset1=jetton(65),otherAsset=jetton(66);
    const blankEntry='dedust/classic/ClassicBlank/main.fc';
    const blankBuild=await compileLegacyFunc({sources:await loadFuncSources(project,blankEntry),targets:[blankEntry]});
    assert.equal(blankBuild.status,'ok',blankBuild.message);
    const blank=Cell.fromBoc(Buffer.from(blankBuild.codeBoc,'base64'))[0];
    const Q=123n,TON=10000000000n,VALUE=1000000000n;
    const defaults={a0:asset0,a1:asset1,kind:0,b0:100n,b1:200n,t0:500n,t1:600n,pending:false,min:700n,success:payload,failure:null};
    const poolConfig=(o=defaults,f=factory,k=2)=>beginCell().storeAddress(f).storeUint(k,8).storeUint(o.kind,1)
        .storeSlice(o.a0.beginParse()).storeSlice(o.a1.beginParse()).endCell();
    const templateAddress=data=>contractAddress(0,{code:blank,data});
    const poolAddress=o=>templateAddress(poolConfig(o));
    const vaultAddress=asset=>templateAddress(beginCell().storeAddress(factory).storeUint(1,8).storeSlice(asset.beginParse()).endCell());
    const descriptor=o=>beginCell().storeAddress(factory).storeUint(3,8).storeRef(beginCell().storeAddress(owner).storeUint(o.kind,1)
        .storeSlice(o.a0.beginParse()).storeSlice(o.a1.beginParse()).endCell()).endCell();
    const state=(patch={},original)=>{
        const o={...defaults,...patch},details=beginCell().storeMaybeRef(o.success).storeMaybeRef(o.failure).storeUint(o.kind,1)
            .storeSlice(o.a0.beginParse()).storeSlice(o.a1.beginParse()).storeCoins(o.t0).storeCoins(o.t1).endCell();
        return beginCell().storeRef(original??descriptor(o)).storeAddress(factory).storeRef(blank).storeAddress(owner)
            .storeCoins(o.b0).storeCoins(o.b1).storeInt(o.pending?-1:0,1).storeCoins(o.min).storeRef(details).endCell();
    };
    const deposit=(asset=asset0,amount=100n,query=Q)=>beginCell().storeUint(1411649509,32).storeUint(query,64)
        .storeSlice(asset.beginParse()).storeCoins(amount).endCell();
    const cancel=(p=null,query=Q)=>beginCell().storeUint(376237550,32).storeUint(query,64).storeMaybeRef(p).endCell();
    const success=(used0=100n,used1=200n,config=poolConfig(),query=Q)=>beginCell().storeUint(2867302998,32)
        .storeUint(query,64).storeRef(config).storeCoins(used0).storeCoins(used1).endCell();
    const failure=(p=null,config=poolConfig(),query=Q)=>beginCell().storeUint(3785583828,32).storeUint(query,64).storeRef(config).storeMaybeRef(p).endCell();
    const bounce=(op=3043726744,prefix=0xffffffff,query=Q)=>beginCell().storeUint(prefix,32).storeUint(op,32).storeUint(query,64).endCell();
    const refundBody=(o,amount,p=null,query=Q)=>beginCell().storeUint(1795913855,32).storeUint(query,64).storeRef(descriptor(o))
        .storeCoins(amount).storeMaybeRef(p).endCell();
    const refund=(o,asset,amount,value,mode=0,p=null,query=Q)=>({to:vaultAddress(asset),value,mode,bounce:true,body:refundBody(o,amount,p,query)});
    const emptySend=mode=>({to:owner,value:0n,mode,bounce:false,body:empty});
    const refunds=(o,p=null,fee=0n,query=Q)=>{
        const half=(TON+VALUE-30000000n-fee*3n/2n)>>1n;
        return [refund(o,o.a0,o.b0,half,0,p,query),refund(o,o.a1,o.b1,half,0,p,query),emptySend(162)];
    };
    const poolSend=(o,b0,b1,query=Q)=>({to:poolAddress(o),value:TON+VALUE-15500000n,mode:0,bounce:true,
        body:beginCell().storeUint(3043726744,32).storeUint(query,64).storeRef(descriptor(o)).storeAddress(owner).storeCoins(o.min)
            .storeRef(beginCell().storeSlice(o.a0.beginParse()).storeCoins(b0).storeSlice(o.a1.beginParse()).storeCoins(b1).endCell())
            .storeMaybeRef(o.success).storeMaybeRef(o.failure).endCell()});
    const messages=[],getters=[];
    async function check(label,body,{o=defaults,from=factory,data=state(o),exit=0,expectedData=data,deleted=false,bounced=false,forwardFee=0n,sends=[]}={}) {
        const [test]=await compareMessages(oracle,candidate,[{label,from,body,bounced,forwardFee,value:VALUE}],{data,address,balance:TON});
        assert.equal(test.sameObservedBehavior,true,label+': differential behavior');
        const actual=test.before;assert.equal(actual.gasUsed,test.after.gasUsed,label+': exact gas');
        assert.equal(actual.exitCode,exit,label+': independent exit');
        assert.equal(actual.dataHash,deleted?null:expectedData.hash().toString('hex'),label+': independent state');
        if(deleted)assert.equal(actual.stateType,null,label+': account deleted');
        assert.equal(actual.actions.length,sends.length,label+': action count');
        for(const [i,expected]of sends.entries()) {
            const action=actual.actions[i];assert.equal(action.type,'sendMsg');assert.equal(action.mode,expected.mode);
            assert.equal(action.outMsg.info.dest,expected.to.toRawString(),label+': recipient '+i);
            assert.equal(action.outMsg.info.value.coins,String(expected.value),label+': amount '+i);
            assert.equal(action.outMsg.info.bounce,expected.bounce);assert.equal(action.outMsg.init,null);
            assert.equal(action.outMsg.body.cellHash,expected.body.hash().toString('hex'),label+': body '+i);
        }
        messages.push(test);
    }
    for(const [asset,key,amount]of [[asset0,'b0',0n],[asset0,'b0',100n],[asset1,'b1',100n],[otherAsset,'b0',100n]]) {
        const patch=asset===otherAsset?{}:{[key]:defaults[key]+amount};
        await check('collect asset='+asset.hash().toString('hex')+' amount='+amount,deposit(asset,amount),{expectedData:state(patch)});
    }
    for(const kind of [0,1]) {
        const o={...defaults,kind,b0:500n,b1:599n,failure:payload};
        await check('threshold triggers pool request kind='+kind,deposit(asset1,1n),{o,expectedData:state({...o,b1:600n,pending:true}),sends:[poolSend(o,500n,600n)]});
        await check('below second threshold stays collecting kind='+kind,deposit(asset1,0n),{o});
    }
    const equalAssets={...defaults,a1:asset0};
    await check('identical assets credit first balance only',deposit(asset0,100n),{o:equalAssets,expectedData:state({...equalAssets,b0:200n})});
    await check('factory authorization precedes decoding',empty,{from:stranger,exit:9});
    await check('deposit rejects non-factory',deposit(),{from:owner,exit:259});
    await check('factory authorization before malformed asset',beginCell().storeUint(1411649509,32).endCell(),{from:stranger,exit:259});
    await check('asset tag 2 rejected',deposit(beginCell().storeUint(2,4).endCell()),{exit:261});
    await check('deposit surplus bits rejected',beginCell().storeSlice(deposit().beginParse()).storeBit(1).endCell(),{exit:9});
    await check('deposit surplus ref rejected',beginCell().storeSlice(deposit().beginParse()).storeRef(empty).endCell(),{exit:9});
    await check('coin overflow rejected',deposit(asset0,1n),{o:{...defaults,b0:(1n<<120n)-1n},exit:5});
    const pending={...defaults,pending:true};
    for(const asset of [asset0,asset1,otherAsset])await check('pending deposit refunded asset='+asset.hash().toString('hex'),deposit(asset,99n),{
        o:pending,sends:[refund(pending,asset,99n,0n,64)]});
    await check('max query ID retained',deposit(asset0,99n,(1n<<64n)-1n),{o:pending,sends:[refund(pending,asset0,99n,0n,64,null,(1n<<64n)-1n)]});
    for(const p of [null,payload])for(const fee of [0n,1000001n])await check('cancel returns both assets payload='+Boolean(p)+' fee='+fee,cancel(p),{
        from:owner,forwardFee:fee,deleted:true,sends:refunds(defaults,p,fee)});
    await check('cancel unauthorized',cancel(),{from:stranger,exit:257});
    await check('cancel pending rejected before truncated body',beginCell().storeUint(376237550,32).endCell(),{o:pending,from:owner,exit:276});
    await check('cancel surplus bits rejected',beginCell().storeSlice(cancel().beginParse()).storeBit(1).endCell(),{from:owner,exit:9});
    for(const p of [null,payload])await check('pool failure returns both deposits payload='+Boolean(p),failure(p),{
        o:pending,from:poolAddress(defaults),deleted:true,sends:refunds(pending,p)});
    for(const [u0,u1,which]of [[100n,200n,-1],[90n,200n,0],[100n,180n,1],[90n,180n,0],[101n,201n,-1]]) {
        const excess=which===0?100n-u0:200n-u1,sends=which<0?[]:[refund(pending,which===0?asset0:asset1,excess,61000000n,1)];
        await check('success excess priority used='+u0+','+u1,success(u0,u1),{o:pending,from:poolAddress(defaults),deleted:true,sends:[...sends,emptySend(160)]});
    }
    await check('success applies forward fee twice with flooring',success(90n,200n),{o:pending,from:poolAddress(defaults),forwardFee:1000001n,deleted:true,
        sends:[refund(pending,asset0,10n,61000000n+(1000001n*3n/2n)*3n/2n,1),emptySend(160)]});
    for(const make of [success,failure]) {
        const body=make();await check('response requires pending opcode='+body.beginParse().loadUint(32),body,{from:poolAddress(defaults),exit:276});
        await check('response verifies sender opcode='+body.beginParse().loadUint(32),body,{o:pending,from:stranger,exit:265});
    }
    for(const config of [poolConfig(defaults,stranger),poolConfig(defaults,factory,1)])await check('response rejects factory or template kind',failure(null,config),{
        o:pending,from:templateAddress(config),exit:265});
    const alternative={...defaults,a0:otherAsset,kind:1},alternativeConfig=poolConfig(alternative);
    await check('response authenticates supplied config without comparing stored assets',failure(null,alternativeConfig),{
        o:pending,from:templateAddress(alternativeConfig),deleted:true,sends:refunds(pending)});
    await check('response config extra bits rejected',failure(null,beginCell().storeSlice(poolConfig().beginParse()).storeBit(1).endCell()),{
        o:pending,from:poolAddress(defaults),exit:9});
    for(const prefix of [0xffffffff,0])await check('bounced join restores deposits prefix='+prefix,bounce(3043726744,prefix),{
        o:pending,from:poolAddress(defaults),bounced:true,deleted:true,sends:refunds(pending)});
    await check('bounce from unrelated sender ignored',bounce(),{o:pending,from:stranger,bounced:true});
    await check('bounce of other opcode ignored',bounce(42),{o:pending,from:poolAddress(defaults),bounced:true});
    await check('bounce while not pending ignored',bounce(),{from:poolAddress(defaults),bounced:true});
    await check('install opcode ignored before malformed storage',beginCell().storeUint(2604311546,32).endCell(),{data:empty});
    await check('unknown opcode avoids malformed storage',beginCell().storeUint(42,32).endCell(),{data:empty,exit:65535});
    await check('empty body rejected',empty,{exit:9});
    await check('truncated query ID',beginCell().storeUint(1411649509,32).storeUint(0,63).endCell(),{exit:9});
    await check('truncated jetton asset',beginCell().storeUint(1411649509,32).storeUint(Q,64).storeUint(1,4).endCell(),{exit:9});
    await check('empty storage rejected by deposit',deposit(),{data:empty,exit:9});
    await check('storage surplus bit rejected',deposit(),{data:beginCell().storeSlice(state().beginParse()).storeBit(1).endCell(),exit:9});
    const getterResults=o=>new Map([[106125,[{type:'int',value:String(o.kind)},...['a0','a1'].map(k=>({type:'slice',cellHash:o[k].hash().toString('hex')}))]],
        [108752,[{type:'int',value:o.pending?'-1':'0'}]],[95132,[{type:'slice',cellHash:beginCell().storeAddress(owner).endCell().hash().toString('hex')}]],
        [87878,[o.b0,o.b1].map(v=>({type:'int',value:String(v)}))],[84232,[o.t0,o.t1].map(v=>({type:'int',value:String(v)}))],
        [84365,[{type:'slice',cellHash:beginCell().storeAddress(poolAddress(o)).endCell().hash().toString('hex')}]],
        [89995,[{type:'slice',cellHash:beginCell().storeAddress(factory).endCell().hash().toString('hex')}]],[85296,[{type:'int',value:String(o.min)}]]]);
    for(const o of [defaults,pending,{...defaults,kind:1,a0:asset1,a1:native,b0:0n,b1:(1n<<120n)-1n,min:0n},equalAssets]) {
        const expected=getterResults(o),tests=await compareGetters(oracle,candidate,[...expected.keys()].map(method=>({method,args:[]})),{data:state(o),address});
        for(const test of tests) {
            assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.gasUsed,test.after.gasUsed);assert.equal(test.before.exitCode,0);
            assert.deepEqual(test.before.stack,expected.get(test.method));getters.push(test);
        }
    }
    for(const method of getterResults(defaults).keys()) {
        const [test]=await compareGetters(oracle,candidate,[{method,args:[]}],{data:empty,address});
        assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.exitCode,9);assert.equal(test.before.gasUsed,test.after.gasUsed);getters.push(test);
    }
    // Invoke the real seven-argument constructor via the separately rebuilt Blank.
    const originalBlank=await fs.readFile(path.join(project,'oracles/ClassicBlank.boc'));
    for(const kind of [0,1]) {
        const o={...defaults,kind,b0:0n,b1:0n},data=descriptor(o);
        const body=beginCell().storeUint(2604311546,32).storeUint(Q,64).storeRef(blank).storeUint(9,16).storeRef(Cell.fromBoc(candidate)[0])
            .storeCoins(o.min).storeCoins(o.t0).storeCoins(o.t1).storeMaybeRef(o.success).storeMaybeRef(o.failure).endCell();
        const [test]=await compareMessages(originalBlank,blank.toBoc(),[{label:'Blank initializes liquidity deposit kind='+kind,from:factory,body}],{data,address});
        assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.exitCode,0);assert.equal(test.before.gasUsed,test.after.gasUsed);
        assert.equal(test.before.newCodeHash,Cell.fromBoc(candidate)[0].hash().toString('hex'));
        assert.equal(test.before.dataHash,state(o,data).hash().toString('hex'));assert.equal(test.before.actions.length,1);
        assert.equal(test.before.actions[0].type,'setCode');messages.push(test);
    }
    return {getters,messages};
}
