import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, ExternalAddress, Cell, Dictionary, beginCell} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust'),directory=path.join(root,'artifacts/dedust-pool-settlement');
await fs.mkdir(directory,{recursive:true});
const hash='c36d44dbe543d3dc6890e484f1827cb15798f2c2f149b429f8c963fe1bf102fd';
const dictionaryHash='b1867598da3ab19adde6cefea2cf5b842b05b91ca851d593822cb566b879e66b';
const methods=c=>Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},c.refs[0]);
const implementation=c=>!c.bits.length&&c.refs.length===1?c.refs[0]:c;
let original;
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const method=methods(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]).get(19);
    assert.equal(method.hash().toString('hex'),dictionaryHash,revision+': method 19 placement');
    original=implementation(method);assert.equal(original.hash().toString('hex'),hash,revision+': implementation 19');
}
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n19=>{ref{\n'+disassembleExact(original.toBoc())+
    '\n}}\n90046=>{CALLDICT 19\nPUSHCTR c5\n}\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-settlement-oracle.tasm');
const sources={'main.tolk':`
import "settlement"
import "wallets"
import "payout-config"
fun settlementActions():cell asm "c5 PUSH"
@method_id(90046) fun settle(q:uint64,c:cell,w:PoolWallets,x:coins,y:coins,p:PoolPayoutOptions,e:any_address,s:bool):cell {
    settlePoolAssets(q,c,w,x,y,p,e,s);return settlementActions();
}
`};
for(const f of ['settlement','transfers','wallets','payment','payout-config'])sources[f+'.tolk']=await fs.readFile(path.join(project,'CpmmPoolV2',f+'.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
assert.equal(implementation(methods(Cell.fromBoc(candidate)[0]).get(19)).hash().toString('hex'),hash);
assert.equal(methods(Cell.fromBoc(candidate)[0]).get(19).hash().toString('hex'),dictionaryHash);
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated settlement wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
const blockchain=await Blockchain.create();
const config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
function feeFor(message,masterchain) {
    const s=config.get(masterchain?24:25).beginParse();assert.equal(s.loadUint(8),0xea);
    const lump=s.loadUintBig(64),bit=s.loadUintBig(64),cellPrice=s.loadUintBig(64);
    const unique=new Map();function visit(c){const h=c.hash().toString('hex');if(unique.has(h))return;unique.set(h,c);c.refs.forEach(visit);}
    message.refs.forEach(visit);
    const bits=[...unique.values()].reduce((n,c)=>n+BigInt(c.bits.length),0n);
    return lump+((bit*bits+cellPrice*BigInt(unique.size)+65535n)>>16n);
}
const int=n=>({type:'int',value:String(n)}),nil={type:'null'},cell=c=>c?{type:'cell',cell:c}:nil;
const addr=a=>beginCell().storeAddress(a).endCell(),slice=a=>({type:'slice',cell:addr(a)});
const a=new Address(0,Buffer.alloc(32,41)),b=new Address(0,Buffer.alloc(32,42));
const walletA=new Address(0,Buffer.alloc(32,43)),walletB=new Address(0,Buffer.alloc(32,44));
const recipient=new Address(0,Buffer.alloc(32,45)),master=new Address(-1,Buffer.alloc(32,46));
const excesses=new Address(0,Buffer.alloc(32,47)),external=new ExternalAddress(0xabcdn,16);
const empty=beginCell().endCell(),payload=beginCell().storeUint(0xabcdef,24).endCell(),nested=beginCell().storeRef(payload).endCell();
const inline={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
const lookup=Dictionary.empty(Dictionary.Keys.BigUint(256),inline);
for(const [asset,wallet]of [[a,walletA],[b,walletB]])lookup.set(BigInt('0x'+asset.hash.toString('hex')),addr(wallet));
const wallets=beginCell().storeDictDirect(lookup).endCell();
const assetConfig=(x,y)=>beginCell().storeAddress(x).storeAddress(y).storeBit(true).storeRef(nested).endCell();
const sendAction=(previous,mode,message)=>beginCell().storeRef(previous).storeUint(0x0ec3c86d,32).storeUint(mode,8).storeRef(message).endCell();
function payment(asset,wallet,amount,destination,extra,p,wrap,query) {
    if(asset===null)return beginCell().storeUint(0x10,6).storeAddress(destination).storeCoins(amount+extra)
        .storeUint(0x3216ca09,139).storeUint(query,64).storeCoins(amount).storeInt(0,32).storeMaybeRef(p).endCell();
    const forward=wrap?beginCell().storeUint(0xe8db4696,32).storeInt(0,32).storeMaybeRef(p).endCell():p;
    const body=beginCell().storeUint(0x0f8a7ea5,32).storeUint(query,64).storeCoins(amount).storeAddress(destination)
        .storeAddress(excesses).storeMaybeRef(null).storeCoins(extra).storeBit(Boolean(forward));if(forward)body.storeRef(forward);
    return beginCell().storeUint(0x10,6).storeAddress(wallet).storeCoins(50000000n+extra).storeUint(1,107).storeRef(body.endCell()).endCell();
}
function expectedActions(xAsset,yAsset,x,y,destination,p,wrap,skip,q,chain) {
    let actions=empty,reserved=10000000000n;
    for(const [asset,amount]of [[xAsset,x],[yAsset,y]])if(amount>0n) {
        const wallet=asset===a?walletA:walletB;
        const message=payment(asset,wallet,amount,destination,17n,p,wrap,q);
        const mc=chain===-1||(asset===null&&destination.workChain===-1);
        reserved+=feeFor(message,mc)-(asset===null?amount:0n);
        actions=sendAction(actions,17,message);
    }
    actions=beginCell().storeRef(actions).storeUint(0x36e6b809,32).storeUint(2,8).storeCoins(reserved).storeMaybeRef(null).endCell();
    if(!skip)actions=sendAction(actions,130,beginCell().storeUint(0x10,6).storeAddress(excesses).storeUint(0xd53276db,143).storeUint(q,64).endCell());
    return {actions,reserved};
}
const cases=[];
function args(c,x,y,d,p,wrap,skip,q=9n,w=wallets){return[int(q),cell(c),cell(w),nil,cell(nested),int(x),int(y),slice(d),int(17),cell(p),int(wrap?-1:0),slice(excesses),int(skip?-1:0)];}
async function check(name,params,expected,exit=0,chain=0,reserved) {
    const [result]=await compareGetters(oracle,candidate,[{method:90046,args:params}],{address:new Address(chain,Buffer.alloc(32,37))});
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name+': '+JSON.stringify(result));assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,[{type:'cell',cellHash:expected.hash().toString('hex')}],name);
    cases.push({name,expectedReserve:reserved?.toString(),...result});
}
for(const chain of [0,-1])for(const [xAsset,yAsset]of [[null,b],[a,null],[a,b],[null,null]])
for(const [x,y]of [[0n,0n],[11n,0n],[0n,13n],[11n,13n]])for(const skip of [false,true])for(const p of [null,nested]) {
    const wrap=cases.length%4<2,destination=cases.length%3===0?master:recipient;
    const q=cases.length%2?0n:(1n<<64n)-1n;
    const expected=expectedActions(xAsset,yAsset,x,y,destination,p,wrap,skip,q,chain);
    await check(`chain=${chain} assets=${xAsset===null?'TON':'jetton'}/${yAsset===null?'TON':'jetton'} amounts=${x}/${y} skip=${skip} payload=${Boolean(p)} wrap=${wrap}`,args(assetConfig(xAsset,yAsset),x,y,destination,p,wrap,skip,q),expected.actions,0,chain,expected.reserved);
}
for(const q of [-1n,1n<<64n])for(const skip of [false,true]) {
    const c=assetConfig(null,b);const expected=skip?expectedActions(null,b,0n,0n,recipient,null,false,true,q,0):null;
    await check('query only validated when sent '+q+' skip='+skip,args(c,0n,0n,recipient,null,false,skip,q),expected?.actions,skip?0:5,0,expected?.reserved);
}
const negative=expectedActions(null,b,-1n,-1n,recipient,null,false,false,9n,0);
await check('nonpositive amounts skipped',args(assetConfig(null,b),-1n,-1n,recipient,null,false,false),negative.actions,0,0,negative.reserved);
await check('missing wallet when paid',args(assetConfig(null,b),0n,13n,recipient,null,false,false,9n,null),null,40);
const unused=expectedActions(null,b,11n,0n,recipient,null,false,false,9n,0);
await check('missing wallet ignored for zero amount',args(assetConfig(null,b),11n,0n,recipient,null,false,false,9n,null),unused.actions,0,0,unused.reserved);
await check('unsupported external asset paid',args(assetConfig(external,b),11n,0n,recipient,null,false,false),null,31);
const externalSkipped=expectedActions(external,b,0n,0n,recipient,null,false,false,9n,0);
await check('unsupported asset ignored for zero amount',args(assetConfig(external,b),0n,0n,recipient,null,false,false),externalSkipped.actions,0,0,externalSkipped.reserved);
await check('malformed config read even without payout',args(empty,0n,0n,recipient,null,false,true),null,9);
await check('reserve underflow after huge native principal',args(assetConfig(null,b),100000000000n,0n,recipient,null,false,true),null,5);
const proof={scope:'Exact shared method 19 dictionary value and implementation, including payout action chain and RAWRESERVE; complete Pool reconstruction remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],implementationHash:hash,originalDictionaryValueHash:dictionaryHash,wrapperComparison,
    getterContext:{balance:'10000000000',incomingValue:'0',storagePaid:'0'},cases};
await writeJson(path.join(directory,'report.json'),proof);await writeJson(path.join(project,'CpmmPoolV2/settlement-verification.json'),proof);
console.log('Both Pool revisions: exact method 19 implementation and byte-identical isolated BOC; '+cases.length+' probes include gas, full action chains and independent reserve amounts');
