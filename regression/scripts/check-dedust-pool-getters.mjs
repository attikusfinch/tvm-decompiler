import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, Cell, Dictionary, beginCell, storeStateInit} from '@ton/core';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction');
const directory=path.join(root,'artifacts/dedust-pool-getters');
await fs.mkdir(directory,{recursive:true});
const pins={72157:'1c35563f6b5c01ca1df9f63c3d898c32347a5b1bbc2c2c0fdaaccc4713d256c4',
    81689:'0b3ae88f9bf57e2e591b9462064cd53d4c3a4db998bb8cef3147768af18599f8',
    112421:'3647ba7c349e6e81721b09bbc8eacefdbe56b735102c9173b4e5205e16e6777d'};
const methods=c=>Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},c.refs[0]);
const originals=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const code=Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0];
    const dict=methods(code);
    for(const [id,hash]of Object.entries(pins))assert.equal(dict.get(Number(id)).hash().toString('hex'),hash,revision+': method '+id);
    originals.push(dict);
}
const sourceFiles=['addresses','compat-address','stdlib-legacy-stateinit','messages','storage','wallets','rewards','getters'];
const sources={'main.tolk':'import "getters"'};
for(const name of sourceFiles)sources[name+'.tolk']=await fs.readFile(path.join(project,'dedust/cpmm/CpmmPoolV2',name+'.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const candidateMethods=methods(Cell.fromBoc(candidate)[0]);
for(const [id,hash]of Object.entries(pins))assert.equal(candidateMethods.get(Number(id)).hash().toString('hex'),hash,'candidate: method '+id);
// Executable oracle cells are used only on the independent test side.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n'+Object.keys(pins).map(id=>
    id+'=>{\n'+disassembleExact(originals[0].get(Number(id)).toBoc())+'\n}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-getters-oracle.tasm');
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated getter wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);

const address=new Address(0,Buffer.alloc(32,37));
const owner=new Address(0,Buffer.alloc(32,41));
const assetY=new Address(0,Buffer.alloc(32,42));
const creator=new Address(-1,Buffer.alloc(32,43));
const controller=new Address(0,Buffer.alloc(32,44));
const wallet=new Address(0,Buffer.alloc(32,45));
const empty=beginCell().endCell();
const int=n=>({type:'int',value:String(n)});
const normalized=(type,c)=>({type,cellHash:c.hash().toString('hex')});
const slice=a=>normalized('slice',beginCell().storeAddress(a).endCell());
const wallets=Dictionary.empty(Dictionary.Keys.BigUint(256),{serialize:(v,b)=>b.storeAddress(v),parse:s=>s.loadAddress()});
wallets.set(7n,wallet);wallets.set(9n,owner);
const walletRoot=beginCell().storeDictDirect(wallets).endCell();
const rewardMap=Dictionary.empty(Dictionary.Keys.Uint(2),{serialize:(v,b)=>b.storeSlice(v.beginParse()),parse:s=>s.asCell()});
rewardMap.set(3,beginCell().storeUint(100,40).storeCoins(10001).storeVarUint(23,5).storeUint(1700000000,40).endCell());
const rewardRoot=beginCell().storeDictDirect(rewardMap).endCell();
const fees=beginCell().storeCoins(11).storeCoins(13).storeCoins(17).storeCoins(19).storeVarUint(23,5).storeVarUint(29,5).endCell();
const extra=beginCell().storeAddress(controller).storeDict(wallets).storeDict(wallets).storeDict(wallets).endCell();
function config(feeIn=0,tail=false) {
    const b=beginCell().storeAddress(null).storeAddress(assetY).storeAddress(creator).storeUint(30,16).storeUint(5,16)
        .storeMaybeRef(empty).storeMaybeRef(null).storeUint(feeIn,2).storeDict(wallets).storeDict(rewardMap);
    if(tail)b.storeBit(1);
    return b.endCell();
}
function storage({status=2,liquidity=1000n,reserveX=10003n,reserveY=20009n,feeIn=0,tail=false,configCell=config(feeIn),feeCell=fees,extraCell=extra}={}) {
    const b=beginCell().storeRef(configCell).storeRef(feeCell).storeRef(extraCell).storeDict(rewardMap).storeUint(status,2);
    if(status===1)b.storeAddress(owner);
    b.storeBit(true).storeBit(false).storeCoins(liquidity).storeCoins(reserveX).storeCoins(reserveY);
    if(tail)b.storeUint(0xab,8);
    return b.endCell();
}
const MAX_COINS=(1n<<120n)-1n;
const library=new Cell({bits:beginCell().storeUint(2,8).storeBuffer(Buffer.from(
    'dd82f24db614798ee7c579f8b3f07f0645d06d65cede368d80d0d74b180d2dd6','hex')).endCell().bits,exotic:true});
const positionFees=beginCell().storeVarUint(0,5).storeCoins(0).storeCoins(0).storeVarUint(0,5).storeCoins(0).storeCoins(0).endCell();
const positionData=beginCell().storeAddress(address).storeAddress(owner).storeCoins(0).storeCoins(0).storeRef(positionFees).storeDict(null).endCell();
const positionHash=beginCell().store(storeStateInit({splitDepth:8,code:library,data:positionData})).endCell().hash();
positionHash[0]=address.hash[0];
const expectedPosition=slice(new Address(0,positionHash));
const cases=[];
async function check(name,data,method,args,expected,exit=0) {
    const [result]=await compareGetters(oracle,candidate,[{method,args}],{address,data});
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name);
    assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,expected,name);
    cases.push({name,...result});
}
for(const status of [0,1,2])for(const feeIn of [0,1,2])for(const [liquidity,x,y]of [[1000n,10003n,20009n],[0n,7n,11n],[MAX_COINS,MAX_COINS,0n]]) {
    const data=storage({status,feeIn,liquidity,reserveX:x,reserveY:y});
    const name=`status=${status},feeIn=${feeIn},liquidity=${liquidity}`;
    await check(name+': data',data,81689,[],[int(status),int(-1),int(0),slice(null),slice(assetY),
        normalized('cell',walletRoot),normalized('cell',walletRoot),normalized('cell',walletRoot),int(30),int(x),int(y),int(liquidity),
        int(11),int(13),int(17),int(19),int(23),int(29),normalized('cell',rewardRoot)]);
    for(const amount of [-1n,0n,1n,37n,liquidity,2n*liquidity]) {
        const floor=(n,d)=>n>=0n?n/d:-((-n+d-1n)/d);
        await check(name+': estimate '+amount,data,112421,[int(amount)],
            [int(liquidity?floor(x*amount,liquidity):0n),int(liquidity?floor(y*amount,liquidity):0n)]);
    }
}
await check('position address',empty,72157,[{type:'slice',cell:beginCell().storeAddress(owner).endCell()}],[expectedPosition]);
for(const method of [81689,112421]) {
    const args=method===81689?[]:[int(1)];
    await check('ignored root suffix '+method,storage({tail:true}),method,args,null);
    await check('invalid status '+method,storage({status:3}),method,args,null,63);
    await check('empty root '+method,empty,method,args,null,9);
}
await check('invalid fee selector',storage({feeIn:3}),81689,[],null,63);
await check('config suffix',storage({configCell:config(0,true)}),81689,[],null,9);
await check('fees suffix',storage({feeCell:beginCell().storeSlice(fees.beginParse()).storeBit(true).endCell()}),81689,[],null,9);
await check('extra suffix',storage({extraCell:beginCell().storeSlice(extra.beginParse()).storeBit(true).endCell()}),81689,[],null,9);
await check('estimate ignores config payload',storage({configCell:empty}),112421,[int(37)],[int(370),int(740)]);
await check('getter rejects empty config',storage({configCell:empty}),81689,[],null,9);
const proof={scope:'All three exact public getters in both Pool revisions; full message-path recovery remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],methodHashes:pins,wrapperComparison,cases};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'dedust/cpmm/CpmmPoolV2/getters-verification.json'),proof);
console.log('Both Pool revisions: three exact public getters and byte-identical isolated BOC; '+cases.length+' independent differential probes including gas passed');
