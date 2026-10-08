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
const directory=path.join(root,'artifacts/dedust-pool-payment');
await fs.mkdir(directory,{recursive:true});
const helperHash='6c6ac69613082d653edca6da9a4121af14c37c8855f38cac713059cfd1de6fe5';
function graph(root) {
    const map=new Map();function visit(c){const h=c.hash().toString('hex');if(map.has(h))return;map.set(h,c);c.refs.forEach(visit);}visit(root);return map;
}
let original;
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const cells=graph(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    assert.ok(cells.has(helperHash),revision+': pinned payment helper');
    original=cells.get(helperHash);
}
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n90046=>{CALLREF{\n'+
    disassembleExact(original.toBoc())+'\n}\nPUSHCTR c5\n}\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-payment-oracle.tasm');
const sources={'main.tolk':`
import "payment"
import "payout-config"
fun paymentActions():cell asm "c5 PUSH"
@method_id(90046) fun payment(a:any_address,w:any_address,n:coins,p:PoolPayoutOptions,e:any_address,q:uint64,x:int32):(coins,coins,cell) {
    val (principal,fee)=sendPoolPayment(a,w,n,p,e,q,x);return(principal,fee,paymentActions());
}
`};
for(const f of ['payment','payout-config'])sources[f+'.tolk']=await fs.readFile(path.join(project,'CpmmPoolV2',f+'.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
assert.ok(graph(Cell.fromBoc(candidate)[0]).has(helperHash),'compiled exact payment helper');
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated payment wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
const blockchain=await Blockchain.create();
const config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
function feeFor(message,masterchain) {
    const s=config.get(masterchain?24:25).beginParse();assert.equal(s.loadUint(8),0xea);
    const lump=s.loadUintBig(64),bit=s.loadUintBig(64),cellPrice=s.loadUintBig(64);
    s.loadUint(32);const firstFraction=s.loadUintBig(16);
    const unique=new Map();function visit(c){const h=c.hash().toString('hex');if(unique.has(h))return;unique.set(h,c);c.refs.forEach(visit);}
    message.refs.forEach(visit);
    let bits=[...unique.values()].reduce((n,c)=>n+BigInt(c.bits.length),0n),cells=BigInt(unique.size);
    const compute=()=>lump+((bit*bits+cellPrice*cells+65535n)>>16n);
    let fee=compute();
    // Independent SENDMSG sizing: filling MYADDR and the retained forwarding
    // fee can move an inline body into a new cell. Official pinned TVM source:
    // https://github.com/ton-blockchain/ton/blob/4539cfabf2877e09d13032861f36c1490d13a941/crypto/vm/tonops.cpp
    const m=message.beginParse();assert.equal(m.loadUint(4),4);assert.equal(m.loadAddressAny(),null);
    const before=m.remainingBits;m.loadAddress();const destinationBits=before-m.remainingBits;
    const value=m.loadCoins();assert.equal(m.loadMaybeRef(),null);
    assert.equal(m.loadCoins(),0n);assert.equal(m.loadCoins(),0n);m.skip(96);
    assert.equal(m.loadBit(),false);const bodyRef=m.loadBit();
    const gramsBits=n=>4+(n===0n?0:8*Math.ceil(n.toString(2).length/8));
    const rootBits=4+267+destinationBits+gramsBits(value)+1+96+
        gramsBits(fee-((fee*firstFraction)>>16n))+4+2+(bodyRef?0:m.remainingBits);
    if(!bodyRef&&(rootBits>1023||m.remainingRefs>4)) {bits+=BigInt(m.remainingBits);cells+=1n;fee=compute();}
    return fee;
}
const int=n=>({type:'int',value:String(n)}),nil={type:'null'};
const cell=c=>c?{type:'cell',cell:c}:nil;
const slice=a=>({type:'slice',cell:beginCell().storeAddress(a).endCell()});
const owner=new Address(0,Buffer.alloc(32,41)),master=new Address(-1,Buffer.alloc(32,42));
const wallet=new Address(0,Buffer.alloc(32,43)),asset=new Address(0,Buffer.alloc(32,44));
const excesses=new Address(0,Buffer.alloc(32,45));
const empty=beginCell().endCell(),payload=beginCell().storeUint(0xabcdef,24).endCell();
const nested=beginCell().storeUint(0x1234,16).storeRef(payload).storeRef(payload).endCell();
const MAX=(1n<<120n)-1n;
const cases=[];
async function check(name,args,expected,exit=0,chain=0) {
    const [result]=await compareGetters(oracle,candidate,[{method:90046,args}],{address:new Address(chain,Buffer.alloc(32,37))});
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name+': '+JSON.stringify(result));
    assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,expected,name);
    cases.push({name,...result});
}
function args(a,w,n,d,g,p,wrap,e,q,x) {return[slice(a),slice(w),int(n),slice(d),int(g),cell(p),int(wrap?-1:0),slice(e),int(q),int(x)];}
function expectedMessage(native,wallet,amount,destination,extra,payload,wrap,excessesTo,query,exit) {
    if(native)return beginCell().storeUint(0x10,6).storeAddress(destination).storeCoins(amount+extra)
        .storeUint(0x3216ca09,139).storeUint(query,64).storeCoins(amount).storeInt(exit,32).storeMaybeRef(payload).endCell();
    const forward=wrap?beginCell().storeUint(0xe8db4696,32).storeInt(exit,32).storeMaybeRef(payload).endCell():payload;
    const transfer=beginCell().storeUint(0x0f8a7ea5,32).storeUint(query,64).storeCoins(amount)
        .storeAddress(destination).storeAddress(excessesTo).storeMaybeRef(null).storeCoins(extra).storeBit(Boolean(forward));
    if(forward)transfer.storeRef(forward);
    return beginCell().storeUint(0x10,6).storeAddress(wallet).storeCoins(50000000n+extra)
        .storeUint(1,107).storeRef(transfer.endCell()).endCell();
}
for(const chain of [0,-1])for(const native of [false,true])for(const amount of [0n,11n,MAX])
for(const p of [null,empty,nested])for(const wrap of [false,true])for(const recipient of [owner,master]) {
    const extra=amount===MAX&&native?0n:17n;
    const query=cases.length%2?0n:(1n<<64n)-1n,exit=cases.length%3===0?-(1n<<31n):cases.length%3===1?0n:(1n<<31n)-1n;
    const targetWallet=recipient===master?master:wallet;
    const message=expectedMessage(native,targetWallet,amount,recipient,extra,p,wrap,excesses,query,exit);
    const action=beginCell().storeRef(empty).storeUint(0x0ec3c86d,32).storeUint(17,8).storeRef(message).endCell();
    const masterchain=chain===-1||recipient===master;
    await check(`chain=${chain} ${native?'TON':'jetton'} amount=${amount} payload=${p?.hash().toString('hex')??'null'} wrap=${wrap} master=${recipient===master}`,
        args(native?null:asset,targetWallet,amount,recipient,extra,p,wrap,excesses,query,exit),
        [int(native?amount:0),int(feeFor(message,masterchain)),{type:'cell',cellHash:action.hash().toString('hex')}],0,chain);
}
for(const native of [false,true])for(const q of [-1n,1n<<64n])await check('invalid query '+q+' native='+native,
    args(native?null:asset,wallet,11n,owner,17n,nested,true,excesses,q,0),null,5);
for(const native of [false,true])for(const n of [-1n,1n<<120n])await check('invalid amount '+n+' native='+native,
    args(native?null:asset,wallet,n,owner,17n,nested,true,excesses,0,0),null,5);
for(const native of [false,true])await check('message value overflow native='+native,
    args(native?null:asset,wallet,MAX,owner,MAX,nested,true,excesses,0,0),null,5);
for(const native of [false,true])for(const x of [-(1n<<31n)-1n,1n<<31n])await check('invalid status '+x+' native='+native,
    args(native?null:asset,wallet,11n,owner,17n,nested,true,excesses,0,x),null,5);
await check('external asset rejected',args(new ExternalAddress(0xabcdn,16),wallet,11n,owner,17n,nested,true,excesses,0,0),null,31);
// The raw (unwrapped) jetton payload never serializes exitCode.
const rawMessage=expectedMessage(false,wallet,11n,owner,0n,nested,false,excesses,0n);
const rawAction=beginCell().storeRef(empty).storeUint(0x0ec3c86d,32).storeUint(17,8).storeRef(rawMessage).endCell();
await check('raw payload ignores out-of-range status',args(asset,wallet,11n,owner,0n,nested,false,excesses,0,1n<<40n),
    [int(0),int(feeFor(rawMessage,false)),{type:'cell',cellHash:rawAction.hash().toString('hex')}]);
const proof={scope:'Exact shared TON/jetton payout helper; complete Pool is still pending',toolchain:await tolkVersion(),
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],helperHash,wrapperComparison,cases};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/payment-verification.json'),proof);
console.log('Both Pool revisions: exact payment helper and byte-identical isolated BOC; '+cases.length+' probes include gas, actions, independent TON/jetton bodies and fees');
