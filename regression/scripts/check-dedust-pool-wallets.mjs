import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Address, Cell, Dictionary, beginCell } from '@ton/core';
import { root, compareBoc, compareGetters, writeJson } from './lib.mjs';
import { compileTolk, tolkVersion } from './tolk.mjs';
import { assembleExact, disassembleExact } from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const folder=path.join(root,'artifacts/dedust-pool-wallets');
await fs.mkdir(folder,{recursive:true});
const pins={schedule:'1e116ad471dd6fe396ee8e453e4f6386a540c26ebf4b44183e91088501900e99',
    register:'ef097f39008d40fc7cdf735f753e3e28997ffc3b17b39d341276a59a5e02bb6e',
    lookup:'7ba07b9a1a9c2f3f645eb7bfb47a7a58c1964110cc0d187e8d7b2d3f28b3dd95',
    finish:'543ba3036edbdff20448624f465cfc2a76401be06bbec9950d0f0fac46e28f45'};
function graph(root) {
    const result=new Map();function visit(c){const h=c.hash().toString('hex');if(result.has(h))return;result.set(h,c);c.refs.forEach(visit);}
    visit(root);return result;
}
let original;
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const cells=graph(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    for(const hash of Object.values(pins))assert.ok(cells.has(hash),revision+': pinned wallet module');
    original??=cells;
}
// The oracle harness extracts code cells. The candidate receives only named Tolk.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0 => {}\n'+Object.values(pins)
    .map((hash,i)=>`${90046+i} => {CALLREF {\n${disassembleExact(original.get(hash).toBoc())}\n}}`).join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','wallet-oracle.tasm');
const source=await fs.readFile(path.join(project,'CpmmPoolV2/wallets.tolk'),'utf8');
const compiled=await compileTolk({sources:{'wallets.tolk':source,'main.tolk':`import "wallets"
@method_id(90046) fun schedule(r:AddressLookup,a:any_address,c:AddressLookup):(AddressLookup,bool,any_address){return scheduleWalletResolution(r,a,c);}
@method_id(90047) fun register(x:AddressLookup,y:AddressLookup,r:AddressLookup,a:any_address,w:any_address):PoolWallets{return registerPoolWallet(x,y,r,a,w);}
@method_id(90048) fun lookup(w:PoolWallets,a:any_address):any_address{return assetForRegisteredWallet(w,a);}
@method_id(90049) fun finish(w:PoolWallets,r:any_address,a:any_address):PoolWallets{return finishWalletResolution(w,r,a);}
`}});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const cells=graph(Cell.fromBoc(candidate)[0]);
for(const hash of Object.values(pins))assert.ok(cells.has(hash),'candidate: exact wallet module');
const comparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(comparison.sameSerializedBoc,true,'isolated wallet wrappers');
await fs.writeFile(path.join(folder,'candidate.boc'),candidate);
await fs.writeFile(path.join(folder,'candidate.fif'),compiled.fiftCode);
const addr=n=>new Address(0,Buffer.alloc(32,n));
const a={asset:addr(21),other:addr(22),wallet:addr(23),resolver:addr(24),otherWallet:addr(25),wrong:new Address(-1,Buffer.alloc(32,21))};
const key=address=>BigInt('0x'+address.hash.toString('hex'));
const addressCell=(address,tail=false)=>{const b=beginCell().storeAddress(address);if(tail)b.storeBit(1);return b.endCell();};
const empty=beginCell().endCell();
const codec={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
function dict(entries=[]) {
    const value=Dictionary.empty(Dictionary.Keys.BigUint(256),codec);
    for(const [k,address]of entries)value.set(typeof k==='bigint'?k:key(k),address instanceof Cell?address:addressCell(address));
    return value.size?beginCell().storeDictDirect(value).endCell():null;
}
const argDict=c=>c?{type:'cell',cell:c}:{type:'null'};
const argAddr=a=>({type:'slice',cell:addressCell(a)});
const normDict=c=>c?{type:'cell',cellHash:c.hash().toString('hex')}:{type:'null'};
const normAddr=a=>({type:'slice',cellHash:addressCell(a).hash().toString('hex')});
const nil={type:'null'};
const examples=[];
function add(label,method,args,exit,stack) {examples.push({label,method,args,exit,stack});}
const pending=dict([[a.resolver,a.asset]]);
const custom=dict([[a.asset,a.resolver]]);
for(const [label,requests,resolvers,expectedRequests,isNew,resolver]of [
    ['default-new',null,null,dict([[a.asset,a.asset]]),true,a.asset],
    ['default-repeated',dict([[a.asset,a.asset]]),null,dict([[a.asset,a.asset]]),false,a.asset],
    ['custom-new',null,custom,pending,true,a.resolver],
    ['custom-repeated',pending,custom,pending,false,a.resolver],
    ['custom-collision-overwrites',dict([[a.resolver,a.other]]),custom,pending,false,a.resolver],
    ['unrelated-pending-preserved',dict([[a.other,a.other]]),custom,dict([[a.other,a.other],[a.resolver,a.asset]]),true,a.resolver],
]) add(label,90046,[argDict(requests),argAddr(a.asset),argDict(resolvers)],0,
    [normDict(expectedRequests),{type:'int',value:isNew?'-1':'0'},normAddr(resolver)]);
add('asset-wrong-workchain',90046,[nil,argAddr(a.wrong),nil],32);
add('asset-none',90046,[nil,argAddr(null),nil],9);
for(const [label,value,exit]of [['resolver-wrong-workchain',a.wrong,32],['resolver-empty-record',empty,9],
    ['resolver-record-suffix',addressCell(a.resolver,true),9],['resolver-none',null,9]]) {
    add(label,90046,[nil,argAddr(a.asset),argDict(dict([[a.asset,value]]))],exit);
}
const byAsset=dict([[a.asset,a.wallet]]),byWallet=dict([[a.wallet,a.asset]]);
add('register-empty',90047,[nil,nil,nil,argAddr(a.asset),argAddr(a.wallet)],0,[normDict(byAsset),normDict(byWallet),nil]);
add('register-with-existing-entries',90047,[argDict(dict([[a.other,a.otherWallet]])),argDict(dict([[a.otherWallet,a.other]])),argDict(pending),argAddr(a.asset),argAddr(a.wallet)],0,
    [normDict(dict([[a.other,a.otherWallet],[a.asset,a.wallet]])),normDict(dict([[a.otherWallet,a.other],[a.wallet,a.asset]])),normDict(pending)]);
for(const [label,x,y,asset,wallet,exit]of [
    ['duplicate-asset',byAsset,null,a.asset,a.wallet,39],['duplicate-wallet',null,byWallet,a.asset,a.wallet,39],
    ['duplicate-asset-precedes-wallet-validation',byAsset,null,a.asset,a.wrong,39],
    ['stored-previous-value-not-decoded',dict([[a.asset,empty]]),null,a.asset,a.wallet,39],
    ['registration-asset-workchain',null,null,a.wrong,a.wallet,32],['registration-wallet-workchain',null,null,a.asset,a.wrong,32],
    ['registration-none',null,null,null,a.wallet,9],
]) add(label,90047,[argDict(x),argDict(y),nil,argAddr(asset),argAddr(wallet)],exit);
add('lookup-middle-registry',90048,[argDict(dict([[a.wallet,a.other]])),argDict(byWallet),nil,argAddr(a.wallet)],0,[normAddr(a.asset)]);
add('lookup-any-none-value',90048,[nil,argDict(dict([[a.wallet,null]])),nil,argAddr(a.wallet)],0,[normAddr(null)]);
for(const [label,m,w,exit]of [['lookup-missing',null,a.wallet,40],['lookup-wrong-workchain',byWallet,a.wrong,32],
    ['lookup-none',byWallet,null,9],['lookup-empty-record',dict([[a.wallet,empty]]),a.wallet,9],
    ['lookup-trailing-record',dict([[a.wallet,addressCell(a.asset,true)]]),a.wallet,9]]) {
    add(label,90048,[nil,argDict(m),nil,argAddr(w)],exit);
}
add('finish-resolver-request',90049,[nil,nil,argDict(pending),argAddr(a.resolver),argAddr(a.wallet)],0,[normDict(byAsset),normDict(byWallet),nil]);
add('finish-preserves-unrelated-request',90049,[nil,nil,argDict(dict([[a.resolver,a.asset],[a.other,a.other]])),argAddr(a.resolver),argAddr(a.wallet)],0,
    [normDict(byAsset),normDict(byWallet),normDict(dict([[a.other,a.other]]))]);
for(const [label,x,y,r,resolver,wallet,exit]of [
    ['finish-missing-request',null,null,null,a.resolver,a.wallet,41],
    ['missing-request-precedes-wallet-validation',null,null,null,a.resolver,null,41],
    ['finish-resolver-workchain',null,null,pending,a.wrong,a.wallet,32],
    ['finish-empty-record',null,null,dict([[a.resolver,empty]]),a.resolver,a.wallet,9],
    ['finish-record-suffix',null,null,dict([[a.resolver,addressCell(a.asset,true)]]),a.resolver,a.wallet,9],
    ['finish-asset-workchain',null,null,dict([[a.resolver,a.wrong]]),a.resolver,a.wallet,32],
    ['finish-wallet-workchain',null,null,pending,a.resolver,a.wrong,32],
    ['finish-duplicate-asset',byAsset,null,pending,a.resolver,a.wallet,39],
    ['finish-duplicate-wallet',null,byWallet,pending,a.resolver,a.wallet,39],
])add(label,90049,[argDict(x),argDict(y),argDict(r),argAddr(resolver),argAddr(wallet)],exit);
const results=await compareGetters(oracle,candidate,examples.map(({method,args})=>({method,args})));
for(let i=0;i<results.length;i++) {
    const r=results[i],expected=examples[i];
    assert.equal(r.sameObservedBehavior,true,expected.label);
    assert.equal(r.before.exitCode,expected.exit,expected.label);
    assert.equal(r.before.gasUsed,r.after.gasUsed,expected.label+': gas');
    if(expected.stack)assert.deepEqual(r.before.stack,expected.stack,expected.label+': independent state');
}
const proof={scope:'Four exact wallet modules only; whole Pool recovery remains pending',toolchain:await tolkVersion(),
    sourceSha256:createHash('sha256').update(source).digest('hex'),revisions:['CpmmPoolV1','CpmmPoolV2'],moduleHashes:pins,comparison,
    results:results.map((r,i)=>({label:examples[i].label,...r}))};
await writeJson(path.join(folder,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/wallets-verification.json'),proof);
console.log('Both Pool revisions: four exact wallet modules; '+results.length+' independent differential probes including gas passed');
