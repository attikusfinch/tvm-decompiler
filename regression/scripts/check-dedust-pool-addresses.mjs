import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Address, ExternalAddress, Cell, Dictionary, beginCell, storeStateInit } from '@ton/core';
import { root, compareGetters, compareBoc, writeJson } from './lib.mjs';
import { compileTolk, tolkVersion } from './tolk.mjs';
import { assembleExact, disassembleExact } from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction');
const directory=path.join(root,'artifacts/dedust-pool-addresses');
await fs.mkdir(directory,{recursive:true});
const pins={position:'07794cb753547d7a3087db90aa3f6eb53fca322e3571c7e84758f3d9d8130cf3',
    deposit:'40c8629de33bd9ed78e9fa2bead6489e46da9f45b4c10dd92353df7b16c0d613'};
const getterHash='1c35563f6b5c01ca1df9f63c3d898c32347a5b1bbc2c2c0fdaaccc4713d256c4';
function graph(root) {
    const result=new Map();function visit(c){const h=c.hash().toString('hex');if(result.has(h))return;result.set(h,c);c.refs.forEach(visit);}
    visit(root);return result;
}
const original=[];
const originalGetters=[];
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const code=Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0];
    const cells=graph(code);
    for(const hash of Object.values(pins))assert.ok(cells.has(hash),revision+': pinned deployment cell');
    original.push(cells);
    const method=Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},code.refs[0]).get(72157);
    assert.equal(method.hash().toString('hex'),getterHash,revision+': get_position_address');
    originalGetters.push(method);
}
// Original executable cells appear only in the oracle side of this isolated test.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0 => {}\n'+[
    [90046,pins.position],[90047,pins.deposit],
].map(([id,hash])=>`${id} => {CALLREF {\n${disassembleExact(original[0].get(hash).toBoc())}\n}}`).join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','deployment-oracle.tasm');
const module=await fs.readFile(path.join(project,'dedust/cpmm/CpmmPoolV2/addresses.tolk'),'utf8');
const compatibility=await fs.readFile(path.join(project,'dedust/cpmm/CpmmPoolV2/compat-address.tolk'),'utf8');
const legacyStdlib=await fs.readFile(path.join(project,'dedust/cpmm/CpmmPoolV2/stdlib-legacy-stateinit.tolk'),'utf8');
const compiled=await compileTolk({sources:{'addresses.tolk':module,'main.tolk':`
import "addresses"
@method_id(90046) fun position(owner:any_address):AutoDeployAddress {return positionDeployment(owner);}
@method_id(90047) fun deposit(owner:any_address,x:coins,y:coins,l:coins,locked:uint16,payout:cell):AutoDeployAddress {
    return depositDeployment(owner,x,y,l,locked,payout);
}
`}});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'isolated deployment wrappers');
const cells=graph(Cell.fromBoc(candidate)[0]);
for(const hash of Object.values(pins))assert.ok(cells.has(hash),'candidate: exact deployment module');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
const addressCompile=await compileTolk({sources:{'addresses.tolk':module,'compat-address.tolk':compatibility,
    'stdlib-legacy-stateinit.tolk':legacyStdlib,'main.tolk':`
import "addresses"
import "compat-address"
get fun get_position_address(owner:any_address):address {return positionDeployment(owner).calculateArchivedAddress();}
`}});
assert.equal(addressCompile.status,'ok',addressCompile.message);
const addressCandidate=Buffer.from(addressCompile.codeBoc,'base64');
const method=Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},Cell.fromBoc(addressCandidate)[0].refs[0]).get(72157);
assert.equal(method.hash().toString('hex'),getterHash,'candidate: exact get_position_address');
const addressOracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0 => {}\n72157 => {\n'+
    disassembleExact(originalGetters[0].toBoc())+'\n}\n]\nDICTIGETJMPZ\nTHROWARG 11\n','position-address-oracle.tasm');
const getterComparison=compareBoc(addressOracle,Cell.fromBoc(addressCandidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(getterComparison.sameSerializedBoc,true);
const int=n=>({type:'int',value:String(n)});
const normalized=(type,c)=>({type,cellHash:c.hash().toString('hex')});
const lib=hash=>new Cell({bits:beginCell().storeUint(2,8).storeBuffer(Buffer.from(hash,'hex')).endCell().bits,exotic:true});
const positionLib=lib('dd82f24db614798ee7c579f8b3f07f0645d06d65cede368d80d0d74b180d2dd6');
const depositLib=lib('2cac3fddd30969d08df036067108c6e7d69780a9459d931d2eb63d95d5ff6825');
const owners=[null,new Address(0,Buffer.alloc(32,41)),new Address(-1,Buffer.alloc(32,42)),new ExternalAddress(0xabcdn,16)];
const pools=[new Address(0,Buffer.alloc(32,0)),new Address(0,Buffer.alloc(32,0xff)),new Address(-1,Buffer.alloc(32,0x37))];
const payload=beginCell().storeUint(0xabcdef,24).endCell();
const fees=beginCell().storeVarUint(0,5).storeCoins(0).storeCoins(0).storeVarUint(0,5).storeCoins(0).storeCoins(0).endCell();
function expected(code,data,pool) {
    return [int(0),normalized('cell',code),normalized('cell',data),int(130),int(8),
        normalized('slice',beginCell().storeAddress(pool).endCell()),int(131)];
}
const positions=[],deposits=[],addresses=[],errors=[];
for(const pool of pools)for(const owner of owners) {
    const ownerCell=beginCell().storeAddress(owner).endCell();
    const positionData=beginCell().storeAddress(pool).storeSlice(ownerCell.beginParse()).storeCoins(0).storeCoins(0)
        .storeRef(fees).storeDict(null).endCell();
    const [result]=await compareGetters(oracle,candidate,[{method:90046,args:[{type:'slice',cell:ownerCell}]}],{address:pool});
    assert.equal(result.sameObservedBehavior,true);
    assert.equal(result.before.exitCode,0);
    assert.equal(result.before.gasUsed,result.after.gasUsed);
    assert.deepEqual(result.before.stack,expected(positionLib,positionData,pool));
    positions.push({pool:pool.toRawString(),owner:String(owner),...result});
    for(const [x,y,l,locked] of [[1n,2n,3n,2500n],[(1n<<120n)-1n,0n,1n,65535n],[0n,0n,0n,0n]]) {
        const config=beginCell().storeCoins(x).storeCoins(y).storeCoins(l).storeUint(locked,16).storeRef(payload).endCell();
        const data=beginCell().storeRef(config).storeAddress(pool).storeSlice(ownerCell.beginParse()).storeCoins(0).storeCoins(0).endCell();
        const [deposit]=await compareGetters(oracle,candidate,[{method:90047,args:[{type:'slice',cell:ownerCell},
            int(x),int(y),int(l),int(locked),{type:'cell',cell:payload}]}],{address:pool});
        assert.equal(deposit.sameObservedBehavior,true);
        assert.equal(deposit.before.exitCode,0);
        assert.equal(deposit.before.gasUsed,deposit.after.gasUsed);
        assert.deepEqual(deposit.before.stack,expected(depositLib,data,pool));
        deposits.push({pool:pool.toRawString(),owner:String(owner),...deposit});
    }
    const init=beginCell().store(storeStateInit({splitDepth:8,code:positionLib,data:positionData})).endCell().hash();
    const hash=Buffer.from(init);hash[0]=pool.hash[0];
    const [address]=await compareGetters(addressOracle,addressCandidate,[{method:72157,args:[{type:'slice',cell:ownerCell}]}],{address:pool});
    assert.equal(address.before.exitCode,0);
    assert.equal(address.sameObservedBehavior,true);
    assert.equal(address.before.gasUsed,address.after.gasUsed);
    assert.deepEqual(address.before.stack,[normalized('slice',beginCell().storeAddress(new Address(0,hash)).endCell())]);
    addresses.push({pool:pool.toRawString(),owner:String(owner),...address});
}
for(const [x,locked,exit]of [[-1n,0n,5],[1n,65536n,5]]) {
    const [result]=await compareGetters(oracle,candidate,[{method:90047,args:[{type:'slice',cell:beginCell().storeAddress(owners[1]).endCell()},
        int(x),int(1),int(1),int(locked),{type:'cell',cell:payload}]}]);
    assert.equal(result.sameObservedBehavior,true);
    assert.equal(result.before.exitCode,exit);
    assert.equal(result.before.gasUsed,result.after.gasUsed);
    errors.push(result);
}
const proof={scope:'Exact Position/Deposit deployment modules and get_position_address; whole Pool recovery remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries({
        'addresses.tolk':module,'compat-address.tolk':compatibility,'stdlib-legacy-stateinit.tolk':legacyStdlib,
    }).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],moduleHashes:pins,getterHash,wrapperComparison,getterComparison,positions,deposits,addresses,errors};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'dedust/cpmm/CpmmPoolV2/addresses-verification.json'),proof);
console.log('Both Pool revisions: two exact deployment modules and exact get_position_address; '+
    (positions.length+deposits.length+addresses.length+errors.length)+' differential probes including gas and independent expectations passed');
