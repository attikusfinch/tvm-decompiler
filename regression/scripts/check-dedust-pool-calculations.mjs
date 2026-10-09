import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, ExternalAddress, Cell, Dictionary, beginCell} from '@ton/core';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction');
const directory=path.join(root,'artifacts/dedust-pool-calculations');
await fs.mkdir(directory,{recursive:true});
const pins={sqrt:'2aae715d7fb79da8c6846b61872cfb250808942886d5c321a93758c8a00ea900',
    payout:'de7d326c49d36e2a73d7dd829c374796b161e1918c4a02dbbff5cc7eb2fd213a',
    rewardConfig:'89956c96972a0149a0afc9a8b17282e1f41ad3d388bc42d6f980598aa20997b9'};
function graph(root) {
    const map=new Map();function visit(c){const hash=c.hash().toString('hex');if(map.has(hash))return;map.set(hash,c);c.refs.forEach(visit);}
    visit(root);return map;
}
const original=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const cells=graph(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    for(const hash of Object.values(pins))assert.ok(cells.has(hash),revision+': original helper');
    original.push(cells);
}
// Preserve the original reference around dictionary entry 21 as well as its body.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n21=>{ref{\n'+
    disassembleExact(original[0].get(pins.rewardConfig).toBoc())+'\n}}\n'+
    [[90046,pins.sqrt],[90047,pins.payout]].map(([id,hash])=>id+'=>{CALLREF{\n'+
        disassembleExact(original[0].get(hash).toBoc())+'\n}}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-calculations-oracle.tasm');
const sources={'main.tolk':`
import "math"
import "reward-config"
import "storage"
import "payout-config"
@method_id(90046) fun sqrt(value:int):int {return poolLiquiditySqrt(value);}
@method_id(90047) fun normalize(p:PoolExtendedPayout,f:any_address):PoolExtendedPayout {return normalizePoolPayout(p,f);}
`};
for(const file of ['math','reward-config','storage','wallets','rewards','payout-config'])
    sources[file+'.tolk']=await fs.readFile(path.join(project,'dedust/cpmm/CpmmPoolV2',file+'.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const candidateCells=graph(Cell.fromBoc(candidate)[0]);
for(const hash of [pins.sqrt,pins.payout])assert.ok(candidateCells.has(hash),'candidate: exact helper '+hash);
const candidateMethods=Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},Cell.fromBoc(candidate)[0].refs[0]);
assert.equal(candidateMethods.get(21).refs[0].hash().toString('hex'),pins.rewardConfig,'candidate: exact reward-configuration implementation');
assert.equal(candidateMethods.get(21).hash().toString('hex'),'832097c7478448f35b42035888ecab47b3b7e7783e656c51f9ee58fd04dd3079','candidate: original dictionary placement');
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated calculation wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);

const int=value=>({type:'int',value:String(value)});
const nil={type:'null'};
const argSlice=c=>({type:'slice',cell:c});
const slice=c=>({type:'slice',cellHash:c.hash().toString('hex')});
const addr=a=>beginCell().storeAddress(a).endCell();
const owner=addr(new Address(0,Buffer.alloc(32,41)));
const base=addr(new Address(0,Buffer.alloc(32,42)));
const master=addr(new Address(-1,Buffer.alloc(32,43)));
const absent=addr(null);
const external=addr(new ExternalAddress(0xabcdn,16));
const variable=beginCell().storeUint(3,2).storeBit(false).storeUint(256,9).storeInt(0,32).storeUint(7,256).endCell();
const payload=beginCell().storeUint(0xabcdef,24).endCell();
const sqrtCases=[],payoutCases=[],rewardCases=[];
async function check(name,method,args,expected,dest,exit=0) {
    const [result]=await compareGetters(oracle,candidate,[{method,args}]);
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name);
    assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,expected,name);
    dest.push({name,...result});
}
function integerSqrt(n) {
    if(n<2n)return n;
    let lo=0n,hi=1n<<128n;
    while(lo+1n<hi){const mid=(lo+hi)/2n;if(mid*mid<=n)lo=mid;else hi=mid;}
    return lo;
}
const limit=(1n<<256n)-1n;
const numbers=new Set([-1n,-2n,-(1n<<256n),0n,1n,2n,3n,4n,8n,9n,10n,limit,((1n<<120n)-1n)**2n]);
for(const bits of [4n,8n,16n,32n,64n,128n,160n,238n,255n])for(const offset of [-1n,0n,1n])numbers.add((1n<<bits)+offset);
let seed=0xdeadbeefn;
for(let i=0;i<40;i++){seed=(seed*6364136223846793005n+1442695040888963407n)&limit;numbers.add(seed);}
for(const n of numbers)await check('sqrt '+n,90046,[int(n)],[int(integerSqrt(n))],sqrtCases);

const addresses=[absent,base,master,external,variable];
const standard=c=>c.beginParse().preloadUint(2)===2;
for(const fulfill of addresses)for(const reject of addresses)for(const excess of addresses) {
    const args=[argSlice(fulfill),int(123),{type:'cell',cell:payload},int(-1),
        argSlice(reject),int(456),nil,int(0),argSlice(excess),argSlice(owner)];
    const expected=[slice(standard(fulfill)?fulfill:owner),int(123),{type:'cell',cellHash:payload.hash().toString('hex')},int(-1),
        slice(standard(reject)?reject:owner),int(456),nil,int(0),slice(standard(excess)?excess:owner)];
    await check('payout '+[fulfill,reject,excess].map(c=>c.hash().toString('hex').slice(0,8)).join('/'),90047,args,expected,payoutCases);
}
for(const fallback of [absent,external])await check('fallback encoding '+fallback.hash().toString('hex'),90047,
    [argSlice(absent),int(0),nil,int(0),argSlice(absent),int(0),nil,int(0),argSlice(absent),argSlice(fallback)],
    [slice(fallback),int(0),nil,int(0),slice(fallback),int(0),nil,int(0),slice(fallback)],payoutCases);

const inline={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
const record=(a,duration,tail=false)=>{const b=beginCell().storeSlice(a.beginParse()).storeUint(duration,40);if(tail)b.storeBit(1);return b.endCell();};
function rewardDictionary(entries) {
    const d=Dictionary.empty(Dictionary.Keys.Uint(2),inline);
    for(const [key,c]of entries)d.set(key,c);
    return d.size?beginCell().storeDictDirect(d).endCell():null;
}
function configArguments(dict,asset) {
    return [argSlice(absent),argSlice(base),argSlice(owner),int(30),int(5),nil,nil,int(152),nil,
        dict?{type:'cell',cell:dict}:nil,argSlice(asset)];
}
for(const entries of [[],[[0,base,100n]],[[0,base,100n],[1,master,200n],[2,absent,300n],[3,external,400n]],
    [[1,base,100n],[3,base,900n]]])for(const asset of [base,master,absent,external,variable]) {
    const match=entries.find(([,a])=>a.equals(asset));
    const dict=rewardDictionary(entries.map(([id,a,t])=>[id,record(a,t)]));
    await check('reward keys '+entries.map(([id])=>id).join(',')+' asset '+asset.hash().toString('hex').slice(0,8),
        21,configArguments(dict,asset),match?[slice(match[1]),int(match[2]),int(match[0])]:null,rewardCases,match?0:42);
}
for(const bad of [beginCell().endCell(),record(base,1n,true)]) {
    await check('malformed reward '+bad.hash().toString('hex'),21,configArguments(rewardDictionary([[0,bad]]),base),null,rewardCases,9);
}
const proof={scope:'Exact integer root, payout normalization and reward-configuration implementation cells in both Pool revisions; full Pool remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],implementationHashes:pins,wrapperComparison,sqrtCases,payoutCases,rewardCases};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'dedust/cpmm/CpmmPoolV2/calculations-verification.json'),proof);
console.log('Both Pool revisions: three exact implementation cells and byte-identical isolated BOC; '+
    (sqrtCases.length+payoutCases.length+rewardCases.length)+' independent differential probes including gas passed');
