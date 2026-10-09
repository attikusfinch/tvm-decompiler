import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Address, Cell, beginCell, storeStateInit } from '@ton/core';
import { root, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';

// This checks complete raw decoding and selected getter semantics, not readable
// source recovery or exact Pool bytecode. The archived executable is independent.
const project=path.resolve(root,'../reconstruction');
const manifest=JSON.parse(await fs.readFile(path.join(project,'oracles.json'),'utf8'));
const output=path.join(root,'artifacts/dedust-pool-decompile');
const address=new Address(0,Buffer.alloc(32,37));
const owner=new Address(0,Buffer.alloc(32,41));
const assetY=new Address(0,Buffer.alloc(32,42));
const creator=new Address(0,Buffer.alloc(32,43));
const controller=new Address(0,Buffer.alloc(32,44));
const empty=beginCell().endCell();
const feeCell=beginCell().storeCoins(11).storeCoins(13).storeCoins(17).storeCoins(19)
    .storeVarUint(23,5).storeVarUint(29,5).endCell();
const config=beginCell().storeAddress(null).storeAddress(assetY).storeAddress(creator)
    .storeUint(30,16).storeUint(5,16).storeMaybeRef(null).storeMaybeRef(null)
    .storeUint(0,2).storeDict(null).storeDict(null).endCell();
const extra=beginCell().storeAddress(controller).storeDict(null).storeDict(null).storeDict(null).endCell();
const int=value=>({type:'int',value:String(value)});
const nullStack={type:'null'};
const slice=addr=>({type:'slice',cellHash:beginCell().storeAddress(addr).endCell().hash().toString('hex')});
function storage(status,liquidity=1000n) {
    const b=beginCell().storeRef(config).storeRef(feeCell).storeRef(extra).storeDict(null).storeUint(status,2);
    if(status===1)b.storeAddress(owner);
    return b.storeBit(true).storeBit(false).storeCoins(liquidity).storeCoins(10003).storeCoins(20009).endCell();
}

const library=new Cell({bits:beginCell().storeUint(2,8).storeBuffer(Buffer.from(
    manifest.contracts.find(c=>c.name==='CpmmPosition').codeHash,'hex')).endCell().bits,exotic:true});
const positionFees=beginCell().storeVarUint(0,5).storeCoins(0).storeCoins(0)
    .storeVarUint(0,5).storeCoins(0).storeCoins(0).endCell();
const positionData=beginCell().storeAddress(address).storeAddress(owner).storeCoins(0).storeCoins(0)
    .storeRef(positionFees).storeDict(null).endCell();
const initHash=beginCell().store(storeStateInit({splitDepth:8,code:library,data:positionData})).endCell().hash();
// Position addresses share their pool's first eight address bits.
const positionHash=Buffer.from(initHash);positionHash[0]=address.hash[0];
const expectedPosition=slice(new Address(0,positionHash));
const probes=[{method:81689,args:[]},{method:72157,args:[{type:'slice',cell:beginCell().storeAddress(owner).endCell()}]},
    ...[-1,0,1,100,1000,2000].map(n=>({method:112421,args:[int(n)]}))];
const report=[];
for(const name of ['CpmmPoolV1','CpmmPoolV2']) {
    const oracle=manifest.contracts.find(c=>c.name===name);
    const boc=await fs.readFile(path.join(project,'oracles',name+'.boc'));
    assert.equal(createHash('sha256').update(boc).digest('hex'),oracle.bocSha256);
    const folder=path.join(output,name);
    const raw=await decompile(boc,folder,{local:true,language:'tolk',normalize:false});
    assert.equal(raw.complete,true,JSON.stringify(raw.diagnostics));
    assert.deepEqual(raw.diagnostics,[]);
    const compiled=await recompile(raw,folder);
    assert.equal(compiled.status,'ok',compiled.message);
    const getters=[];
    for(const [status,liquidity] of [[0,1000n],[1,1000n],[2,1000n],[2,0n]]) {
        const results=await compareGetters(boc,compiled.boc,probes,{address,data:storage(status,liquidity)});
        for(const result of results) {
            assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
            assert.equal(result.before.exitCode,0);
        }
        assert.deepEqual(results[0].before.stack,[int(status),int(-1),int(0),slice(null),slice(assetY),
            nullStack,nullStack,nullStack,int(30),int(10003),int(20009),int(liquidity),
            int(11),int(13),int(17),int(19),int(23),int(29),nullStack]);
        assert.deepEqual(results[1].before.stack,[expectedPosition]);
        for(let i=2;i<results.length;i++) {
            const amount=BigInt(probes[i].args[0].value);
            const floor=(a,b)=>a>=0n?a/b:-((-a+b-1n)/b);
            assert.deepEqual(results[i].before.stack,[
                int(liquidity>0n?floor(10003n*amount,liquidity):0n),
                int(liquidity>0n?floor(20009n*amount,liquidity):0n)]);
        }
        getters.push({status,liquidity:String(liquidity),results});
    }
    const [invalid]=await compareGetters(boc,compiled.boc,[{method:81689,args:[]}],{data:empty,address});
    assert.equal(invalid.sameObservedBehavior,true);
    assert.equal(invalid.before.exitCode,9);
    report.push({name,comparison:compareBoc(boc,compiled.boc),getters,invalid});
    console.log(name+': complete raw Tolk compiles; 33 independent getter probes passed; exact source recovery remains pending');
}
await writeJson(path.join(output,'report.json'),report);
