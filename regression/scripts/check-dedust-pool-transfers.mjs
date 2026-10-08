import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, ExternalAddress, Cell, Dictionary, beginCell} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const directory=path.join(root,'artifacts/dedust-pool-transfers');
await fs.mkdir(directory,{recursive:true});
const pins={90046:'be6ced9674109ea1ade56ab60ff079ae2fa788b51d95d846388d0fa5393dcb1c',
    90047:'c2805b77c15311d84818f4f432957abff3e504f44cc260059326a1e5183e32ac',
    90048:'72c88befd5ebb64fb24c9e49ed7063b09e8664b5e474562368676580962e8eb7',
    90049:'bf9c68f99ec174f29dc3ef8ef09646a226fb451376e7787b92e1d5e2ebc8873b',
    90050:'90f8d7b93547e3d6f5168cd30b44edc3c1d217ba5dffb00d771dec9ee15bbf87'};
function graph(root) {
    const map=new Map();function visit(c){const h=c.hash().toString('hex');if(map.has(h))return;map.set(h,c);c.refs.forEach(visit);}visit(root);return map;
}
const originals=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const cells=graph(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    for(const [id,hash]of Object.entries(pins)) {
        if(Number(id)===(revision==='CpmmPoolV1'?90048:90050))continue;
        assert.ok(cells.has(hash),revision+': pinned helper '+hash);
    }
    originals.push(cells);
}
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n'+Object.entries(pins).map(([id,hash])=>
    id+'=>{CALLREF{\n'+disassembleExact(originals[Number(id)===90048?1:0].get(hash).toBoc())+'\n}'+
    ([90046,90048,90050].includes(Number(id))?'\nPUSHCTR c5':'')+'\n}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-transfers-oracle.tasm');
const sources={'main.tolk':`
import "transfers"
import "wallets"
import "rewards"
import "transfers-v1"
fun actions():cell asm "c5 PUSH"
@method_id(90046) fun excesses(r:any_address,q:uint64,m:int):cell {sendPoolExcesses(r,q,m);return actions();}
@method_id(90047) fun wallet(w:PoolWallets,a:any_address):any_address {return poolWalletForAsset(w,a);}
@method_id(90048) fun request(r:any_address,q:uint64):cell {requestPoolWalletAddress(r,q);return actions();}
@method_id(90049) fun reward(r:map<uint2,PoolReward>,k:uint2):PoolReward {return poolRewardOrEmpty(r,k);}
@method_id(90050) fun requestV1(r:any_address,q:uint64):cell {requestPoolWalletAddressV1(r,q);return actions();}
`};
for(const file of ['transfers','wallets','rewards'])sources[file+'.tolk']=await fs.readFile(path.join(project,'CpmmPoolV2',file+'.tolk'),'utf8');
sources['transfers-v1.tolk']=await fs.readFile(path.join(project,'CpmmPoolV1/transfers-v1.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const candidateCells=graph(Cell.fromBoc(candidate)[0]);
for(const hash of Object.values(pins))assert.ok(candidateCells.has(hash),'candidate: exact helper '+hash);
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated transfers wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);

const blockchain=await Blockchain.create();
const config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
const prices=config.get(25).beginParse();assert.equal(prices.loadUint(8),0xea);
const lump=prices.loadUintBig(64),bit=prices.loadUintBig(64),cellPrice=prices.loadUintBig(64);
const gas=config.get(21).beginParse();assert.equal(gas.loadUint(8),0xd1);
const flatLimit=gas.loadUintBig(64),flatPrice=gas.loadUintBig(64);
assert.equal(gas.loadUint(8),0xde);const gasPrice=gas.loadUintBig(64);
const ceil16=n=>(n+65535n)>>16n;
const gasFee=25000n<=flatLimit?flatPrice:flatPrice+ceil16((25000n-flatLimit)*gasPrice);
const processing=gasFee>10000000n?gasFee:10000000n;
const requestAmount=processing+(lump+ceil16(bit*364n+cellPrice))+(lump+ceil16(bit+cellPrice*364n));
const requestAmountV1=requestAmount-processing+gasFee;
const int=n=>({type:'int',value:String(n)}),nil={type:'null'};
const argSlice=c=>({type:'slice',cell:c}),argCell=c=>c?{type:'cell',cell:c}:nil;
const hashCell=c=>({type:'cell',cellHash:c.hash().toString('hex')});
const hashSlice=c=>({type:'slice',cellHash:c.hash().toString('hex')});
const addr=a=>beginCell().storeAddress(a).endCell();
const owner=new Address(0,Buffer.alloc(32,41)),wallet=new Address(0,Buffer.alloc(32,42));
const standard=addr(owner),none=addr(null),master=addr(new Address(-1,Buffer.alloc(32,43))),external=addr(new ExternalAddress(0xabcdn,16));
const empty=beginCell().endCell();
const inline={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
const addressMap=Dictionary.empty(Dictionary.Keys.BigUint(256),inline);addressMap.set(BigInt('0x'+owner.hash.toString('hex')),addr(wallet));
const wallets=beginCell().storeDictDirect(addressMap).endCell();
const action=(mode,message)=>beginCell().storeRef(empty).storeUint(0x0ec3c86d,32).storeUint(mode,8).storeRef(message).endCell();
const sends=[],lookups=[],rewards=[];
async function check(name,method,args,expected,target,exit=0,address=new Address(0,Buffer.alloc(32,37)),configOverride) {
    const [result]=await compareGetters(oracle,candidate,[{method,args}],{address,config:configOverride});
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name);assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,expected,name);
    target.push({name,...result});
}
for(const chain of [0,-1])for(const recipient of [standard,none,master,external])for(const query of [0n,7n,(1n<<64n)-1n]) {
    const address=new Address(chain,Buffer.alloc(32,37));
    for(const mode of [0,1,64,128,160]) {
        const message=beginCell().storeUint(0x10,6).storeSlice(recipient.beginParse()).storeUint(0xd53276db,143).storeUint(query,64).endCell();
        await check(`excesses chain=${chain} query=${query} mode=${mode} recipient=${recipient.hash().toString('hex')}`,90046,
            [argSlice(recipient),int(query),int(mode)],[hashCell(action(mode|2,message))],sends,0,address);
    }
    for(const [method,amount]of [[90048,requestAmount],[90050,requestAmountV1]]) {
        const message=beginCell().storeUint(0x10,6).storeSlice(recipient.beginParse()).storeCoins(amount)
            .storeUint(0x2c76b973,139).storeUint(query,64).storeAddress(address).storeBit(false).endCell();
        await check(`resolve method=${method} chain=${chain} query=${query} recipient=${recipient.hash().toString('hex')}`,method,
            [argSlice(recipient),int(query)],[hashCell(action(1,message))],sends,0,address);
    }
}
// Make the V1/V2 fee-floor difference observable using an otherwise unchanged
// local blockchain config. Keep the original gas limits and credit fields.
const lowGas=beginCell().storeUint(0xd1,8).storeUint(100,64).storeUint(100,64)
    .storeUint(0xde,8).storeUint(65536,64).storeSlice(gas).endCell();
const lowConfig=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
lowConfig.set(21,lowGas);
const lowRoot=beginCell().storeDictDirect(lowConfig).endCell();
for(const [method,amount]of [[90048,requestAmount-processing+10000000n],[90050,requestAmount-processing+25000n]]) {
    const address=new Address(0,Buffer.alloc(32,37));
    const message=beginCell().storeUint(0x10,6).storeSlice(standard.beginParse()).storeCoins(amount)
        .storeUint(0x2c76b973,139).storeUint(9,64).storeAddress(address).storeBit(false).endCell();
    await check('low gas price method '+method,method,[argSlice(standard),int(9)],[hashCell(action(1,message))],sends,0,address,lowRoot);
}
for(const [name,asset,dict,exit,expected]of [
    ['mapped asset',standard,wallets,0,addr(wallet)],['native',none,empty,0,none],['external',external,empty,0,none],
    ['wrong workchain',master,wallets,32,null],['missing wallet',standard,null,40,null],
])await check(name,90047,[argCell(dict),argCell(empty),argCell(empty),argSlice(asset)],expected?[hashSlice(expected)]:null,lookups,exit);
const broken=Dictionary.empty(Dictionary.Keys.BigUint(256),inline);broken.set(BigInt('0x'+owner.hash.toString('hex')),empty);
await check('malformed wallet',90047,[argCell(beginCell().storeDictDirect(broken).endCell()),nil,nil,argSlice(standard)],null,lookups,9);
const rewardMap=Dictionary.empty(Dictionary.Keys.Uint(2),inline);
const record=beginCell().storeUint(1000,40).storeCoins((1n<<120n)-1n).storeVarUint((1n<<248n)-1n,5).storeUint(1700000000,40).endCell();
rewardMap.set(0,record);rewardMap.set(3,record);
const rewardRoot=beginCell().storeDictDirect(rewardMap).endCell();
for(const dict of [null,rewardRoot])for(const key of [0,1,2,3])await check('reward key '+key+' dictionary '+Boolean(dict),90049,
    [argCell(dict),int(key)],dict&&(key===0||key===3)?[int(1000),int((1n<<120n)-1n),int((1n<<248n)-1n),int(1700000000)]:[int(0),int(0),int(0),int(0)],rewards);
for(const bad of [empty,beginCell().storeSlice(record.beginParse()).storeBit(true).endCell()]) {
    const d=Dictionary.empty(Dictionary.Keys.Uint(2),inline);d.set(0,bad);
    await check('malformed reward '+bad.hash().toString('hex'),90049,[argCell(beginCell().storeDictDirect(d).endCell()),int(0)],null,rewards,9);
}
for(const method of [90046,90048,90050])for(const q of [-1n,1n<<64n])await check('invalid query '+q+' method '+method,method,
    [argSlice(standard),int(q),...(method===90046?[int(0)]:[])],null,sends,5);
const proof={scope:'Exact excesses sender, wallet selection, resolver request and reward lookup in both Pool revisions; full Pool remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],helperHashes:pins,wrapperComparison,
    independentRequestAmounts:{V1:String(requestAmountV1),V2:String(requestAmount)},sends,lookups,rewards};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/transfers-verification.json'),proof);
console.log('Both Pool revisions: five exact helper cells (including distinct resolver versions) and byte-identical isolated BOC; '+
    (sends.length+lookups.length+rewards.length)+' probes include gas, action lists, independent resolver amount and dictionary/error expectations');
