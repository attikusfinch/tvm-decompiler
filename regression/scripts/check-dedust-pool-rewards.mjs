import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Cell, Dictionary, beginCell } from '@ton/core';
import { root, compareGetters, writeJson } from './lib.mjs';
import { compileTolk, tolkVersion } from './tolk.mjs';
import { assembleExact, disassembleExact } from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const folder=path.join(root,'artifacts/dedust-pool-rewards');
await fs.mkdir(folder,{recursive:true});
const pins={accrue:'91b8179608f2d2eae5e7bbd931e8c77438aa07a086bfa241c506ee036338fdc3',
    synchronize:'ee562ba27741d0e1f9e29911c487988ef4b5fa89e0b2fd2bee8dd4b096a6fa15'};
function cells(root) {
    const result=new Map();
    function visit(c) {const h=c.hash().toString('hex');if(result.has(h))return;result.set(h,c);c.refs.forEach(visit);}
    visit(root);return result;
}
const oracleGraphs=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const graph=cells(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    for(const hash of Object.values(pins))assert.ok(graph.has(hash),revision+': pinned module');
    oracleGraphs.push(graph);
}
// Only the oracle test harness extracts original code. The candidate build
// below receives named Tolk sources and does not read original executable cells.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0 => {}\n'+[
    [90046,pins.accrue],[90047,pins.synchronize],
].map(([method,hash])=>`${method} => { CALLREF {\n${disassembleExact(oracleGraphs[0].get(hash).toBoc())}\n} }`).join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','reward-oracle.tasm');
const module=await fs.readFile(path.join(project,'CpmmPoolV2/rewards.tolk'),'utf8');
const compiled=await compileTolk({sources:{'rewards.tolk':module,'main.tolk':`
import "rewards"
@method_id(90046) fun check(reward:PoolReward,liquidity:coins):PoolReward {
    return accruePoolReward(reward,liquidity);
}
@method_id(90047) fun checkAll(rewards:map<uint2,PoolReward>,liquidity:coins):map<uint2,PoolReward> {
    return synchronizePoolRewards(rewards,liquidity);
}
`}});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const candidateGraph=cells(Cell.fromBoc(candidate)[0]);
for(const hash of Object.values(pins))assert.ok(candidateGraph.has(hash),'candidate: exact module '+hash);
await fs.writeFile(path.join(folder,'candidate.boc'),candidate);
await fs.writeFile(path.join(folder,'candidate.fif'),compiled.fiftCode);
const NOW=1700000000n,Q=1n<<120n;
const int=n=>({type:'int',value:String(n)});
const fields=r=>[r.time,r.budget,r.checkpoint,r.last];
const reward=(time,budget,checkpoint,last)=>({time:BigInt(time),budget:BigInt(budget),checkpoint:BigInt(checkpoint),last:BigInt(last)});
function expected(r,liquidity) {
    if(NOW<=r.last)return r;
    if(liquidity===0n)return {...r,last:NOW};
    const elapsed=NOW-r.last<r.time?NOW-r.last:r.time;
    const distributed=r.time>0n?elapsed*r.budget/r.time:0n;
    return {time:r.time-elapsed,budget:r.budget-distributed,checkpoint:r.checkpoint+distributed*Q/liquidity,last:NOW};
}
const samples=[
    reward(1000,100000,2n*Q,NOW-250n),reward(1000,100000,0,NOW-2000n),
    reward(0,100000,3n*Q,NOW-1n),reward(1000,0,7,NOW-250n),
    reward(17,101,1,NOW-3n),reward(1,1,0,NOW-1n),
    reward(1000,100000,7,NOW),reward(1000,100000,7,NOW+100n),
    reward((1n<<40n)-1n,(1n<<119n)-1n,1n<<240n,0),
];
const single=[];
for(const r of samples)for(const liquidity of [0n,1n,13n,1000n,1n<<119n]) {
    const [result]=await compareGetters(oracle,candidate,[{method:90046,args:[...fields(r).map(int),int(liquidity)]}]);
    assert.equal(result.sameObservedBehavior,true,JSON.stringify(result));
    assert.equal(result.before.exitCode,0);
    assert.equal(result.before.gasUsed,result.after.gasUsed);
    assert.deepEqual(result.before.stack,fields(expected(r,liquidity)).map(int));
    single.push({reward:fields(r).map(String),liquidity:String(liquidity),...result});
}
const inlineCell={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
function pack(r,tail=false) {
    const b=beginCell().storeUint(r.time,40).storeCoins(r.budget).storeVarUint(r.checkpoint,5).storeUint(r.last,40);
    if(tail)b.storeBit(true);return b.endCell();
}
function dictionary(entries) {
    const d=Dictionary.empty(Dictionary.Keys.Uint(2),inlineCell);
    for(const [key,value] of entries)d.set(key,value);return d.size?beginCell().storeDictDirect(d).endCell():null;
}
const dicts=[];
for(const entries of [[],[[0,samples[0]]],[[0,samples[0]],[1,samples[6]],[2,samples[2]],[3,samples[4]]],[[3,samples[1]]]]) {
    for(const liquidity of [0n,1n,13n,1000n]) {
        const data=dictionary(entries.map(([k,r])=>[k,pack(r)]));
        const updated=dictionary(entries.map(([k,r])=>[k,pack(expected(r,liquidity))]));
        const [result]=await compareGetters(oracle,candidate,[{method:90047,args:[data?{type:'cell',cell:data}:{type:'null'},int(liquidity)]}]);
        assert.equal(result.sameObservedBehavior,true,JSON.stringify(result));
        assert.equal(result.before.exitCode,0);
        assert.equal(result.before.gasUsed,result.after.gasUsed);
        assert.deepEqual(result.before.stack,[updated?{type:'cell',cellHash:updated.hash().toString('hex')}:{type:'null'}]);
        dicts.push({keys:entries.map(([k])=>k),liquidity:String(liquidity),...result});
    }
}
const errors=[];
for(const [label,value,liquidity,exit] of [
    ['empty-record',beginCell().endCell(),1n,9],
    ['trailing-record',pack(samples[0],true),1n,9],
    ['varuint32-overflow',pack(reward(1,1,(1n<<248n)-1n,NOW-1n)),1n,5],
]) {
    const [result]=await compareGetters(oracle,candidate,[{method:90047,args:[{type:'cell',cell:dictionary([[2,value]])},int(liquidity)]}]);
    assert.equal(result.sameObservedBehavior,true);
    assert.equal(result.before.exitCode,exit);
    assert.equal(result.before.gasUsed,result.after.gasUsed);
    errors.push({label,...result});
}
const proof={scope:'Exact shared reward modules only; complete readable Pool recovery remains pending',
    toolchain:await tolkVersion(),sourceSha256:createHash('sha256').update(module).digest('hex'),
    revisions:['CpmmPoolV1','CpmmPoolV2'],moduleHashes:pins,single,dicts,errors};
await writeJson(path.join(folder,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/rewards-verification.json'),proof);
console.log('Both Pool revisions: two byte-identical reward modules; '+(single.length+dicts.length+errors.length)+' independent probes including gas passed');
