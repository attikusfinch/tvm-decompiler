import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, Cell, Dictionary, beginCell} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const directory=path.join(root,'artifacts/dedust-pool-events');
await fs.mkdir(directory,{recursive:true});
const pins={22:'641ca563cb60368b62bd72620d6fbe7579da1c39b41c1e2d75cc113805637035',
    23:'0d4f17aef7a5044487465863765ab72aeb35afde663151f1ec73375238c86eb8',
    24:'ec800e0b33bc37e655cda6b8b4efa6f01990806899ecd9e0e7e11e7b7f0d432b'};
const methods=c=>Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},c.refs[0]);
const implementation=m=>!m.bits.length&&m.refs.length===1?m.refs[0]:m;
const original=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const code=Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0];
    const entries=methods(code);
    for(const [id,hash]of Object.entries(pins))assert.equal(implementation(entries.get(Number(id))).hash().toString('hex'),hash,revision+': event '+id);
    original.push(entries);
}
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n'+Object.keys(pins).map(id=>
    id+'=>{\n'+disassembleExact(implementation(original[0].get(Number(id))).toBoc())+'\n}').join('\n')+'\n'+
    [22,23,24].map((id,i)=>(90046+i)+'=>{CALLDICT '+id+'\nPUSHCTR c5\n}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-events-oracle.tasm');
const source=await fs.readFile(path.join(project,'CpmmPoolV2/events.tolk'),'utf8');
const sources={'events.tolk':source,'main.tolk':`
import "events"
fun eventActions():cell asm "c5 PUSH"
@method_id(90046) fun swap(e:PoolSwapEvent):(coins,cell) {val fee=emitPoolSwap(e);return(fee,eventActions());}
@method_id(90047) fun deposit(e:PoolDepositEvent):(coins,cell) {val fee=emitPoolDeposit(e);return(fee,eventActions());}
@method_id(90048) fun withdrawal(e:PoolWithdrawalEvent):(coins,cell) {val fee=emitPoolWithdrawal(e);return(fee,eventActions());}
`};
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
for(const [id,hash]of Object.entries(pins))assert.equal(implementation(methods(Cell.fromBoc(candidate)[0]).get(Number(id))).hash().toString('hex'),hash,'candidate: event '+id);
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated event wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);

const blockchain=await Blockchain.create();
const config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
function forwardPrices(chain) {
    const s=config.get(chain===-1?24:25).beginParse();assert.equal(s.loadUint(8),0xea);
    return {lump:s.loadUintBig(64),bit:s.loadUintBig(64),cell:s.loadUintBig(64)};
}
// Independent fee formula from the pinned official validator MsgPrices source:
// https://github.com/ton-blockchain/ton/blob/4539cfabf2877e09d13032861f36c1490d13a941/crypto/block/transaction.cpp
function feeFor(message,chain) {
    const unique=new Map();function visit(c){const h=c.hash().toString('hex');if(unique.has(h))return;unique.set(h,c);c.refs.forEach(visit);}
    message.refs.forEach(visit); // the lump price covers the message root
    const p=forwardPrices(chain),bits=[...unique.values()].reduce((n,c)=>n+BigInt(c.bits.length),0n);
    return p.lump+((p.bit*bits+p.cell*BigInt(unique.size)+65535n)>>16n);
}
const int=n=>({type:'int',value:String(n)});
const cell=c=>({type:'cell',cell:c});
const slice=c=>({type:'slice',cell:c});
const owner=beginCell().storeAddress(new Address(0,Buffer.alloc(32,41))).endCell();
const master=beginCell().storeAddress(new Address(-1,Buffer.alloc(32,42))).endCell();
const absent=beginCell().storeAddress(null).endCell();
const payload=beginCell().storeUint(0xabcdef,24).endCell();
const nested=beginCell().storeUint(0x1234,16).storeRef(payload).endCell();
const MAX=(1n<<120n)-1n;
const cases=[];
for(const chain of [0,-1])for(const [x,y,z]of [[0n,0n,0n],[11n,13n,17n],[MAX,MAX,MAX]])for(const recipient of [owner,master,absent]) {
    const address=new Address(chain,Buffer.alloc(32,37));
    for(const [id,opcode,args,body]of [
        [90046,0x78e79ba4,[int(-1),int(x),int(y),slice(owner),slice(recipient),cell(nested),cell(payload)],
            beginCell().storeUint(0x78e79ba4,32).storeBit(true).storeCoins(x).storeCoins(y)
                .storeSlice(owner.beginParse()).storeSlice(recipient.beginParse()).storeRef(nested).storeRef(payload).endCell()],
        [90047,0x35df2e12,[int(x),int(y),int(z),slice(owner),slice(recipient),cell(nested)],
            beginCell().storeUint(0x35df2e12,32).storeCoins(x).storeCoins(y).storeCoins(z)
                .storeSlice(owner.beginParse()).storeSlice(recipient.beginParse()).storeRef(nested).endCell()],
        [90048,0xc0d77b54,[int(x),int(y),int(z),slice(owner),slice(recipient),cell(nested)],
            beginCell().storeUint(0xc0d77b54,32).storeCoins(x).storeCoins(y).storeCoins(z)
                .storeSlice(owner.beginParse()).storeSlice(recipient.beginParse()).storeRef(nested).endCell()],
    ]) {
        const message=beginCell().storeUint(0xc,4).storeAddress(null).storeUint(1,98).storeRef(body).endCell();
        const action=beginCell().storeRef(beginCell().endCell()).storeUint(0x0ec3c86d,32).storeUint(1,8).storeRef(message).endCell();
        const [result]=await compareGetters(oracle,candidate,[{method:id,args}],{address});
        assert.equal(result.sameObservedBehavior,true,JSON.stringify(result));assert.equal(result.before.exitCode,0);
        assert.equal(result.before.gasUsed,result.after.gasUsed);
        assert.deepEqual(result.before.stack,[int(feeFor(message,chain)),{type:'cell',cellHash:action.hash().toString('hex')}]);
        cases.push({chain,opcode,amounts:[x,y,z].map(String),recipient:recipient.hash().toString('hex'),bodyHash:body.hash().toString('hex'),...result});
    }
}
for(const amount of [-1n,1n<<120n]) {
    const [result]=await compareGetters(oracle,candidate,[{method:90047,args:[int(amount),int(0),int(0),slice(owner),slice(owner),cell(payload)]}]);
    assert.equal(result.sameObservedBehavior,true);assert.equal(result.before.exitCode,5);
    assert.equal(result.before.gasUsed,result.after.gasUsed);cases.push({invalidAmount:String(amount),...result});
}
const proof={scope:'Exact Pool event implementations and raw SENDMSG action lists; full Pool recovery remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],implementationHashes:pins,wrapperComparison,cases};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/events-verification.json'),proof);
console.log('Both Pool revisions: three exact event implementations and byte-identical isolated BOC; '+cases.length+' probes include gas, raw action list and independent forwarding fees');
