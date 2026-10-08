import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, ExternalAddress, Cell, Dictionary, beginCell} from '@ton/core';
import {root, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust'),directory=path.join(root,'artifacts/dedust-pool-routing');
await fs.mkdir(directory,{recursive:true});
const pins={90046:'2e42ab82b0b9f6808936c22b848d55c7923e6b81112165a5fe843e53eb0c51c7',
    90047:'222fbc0735a27641c95bed5033c953cb02e4746351c3f38d988511fcf785d215',
    90048:'b5fc109b457318c5a085ead006265b22fb10e8b2033e97a6a067b5f7ed78d168'};
function graph(root) {
    const map=new Map();function visit(c){const h=c.hash().toString('hex');if(map.has(h))return;map.set(h,c);c.refs.forEach(visit);}visit(root);return map;
}
let original;
for(const revision of ['CpmmPoolV1','CpmmPoolV2']) {
    const cells=graph(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',revision+'.boc')))[0]);
    for(const hash of Object.values(pins))assert.ok(cells.has(hash),revision+': pinned helper '+hash);
    original=cells;
}
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n0=>{}\n'+Object.entries(pins).map(([id,hash])=>
    id+'=>{CALLREF{\n'+disassembleExact(original.get(hash).toBoc())+'\n}'+(Number(id)===90046?'\nPUSHCTR c5':'')+'\n}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-routing-oracle.tasm');
const sources={'main.tolk':`
import "affiliate-deployment"
import "routing"
import "payout-basic"
fun routeActions():cell asm "c5 PUSH"
@method_id(90046) fun route(a:any_address,n:any_address,w:any_address,e:any_address,q:uint64,v:coins,p:PoolSwapPayload,z:cell,g:coins):cell {
    routePoolSwap(a,n,w,e,q,v,p,z,g);return routeActions();
}
@method_id(90047) fun payout(p:PoolBasicPayout,f:any_address):PoolBasicPayout {return normalizePoolBasicPayout(p,f);}
@method_id(90048) fun affiliate(k:int,i:uint256,f:uint16):AutoDeployAddress {return affiliateDeployment(k,i,f);}
`};
for(const f of ['affiliate-deployment','addresses','routing','payment','payout-config','payout-basic'])
    sources[f+'.tolk']=await fs.readFile(path.join(project,'CpmmPoolV2',f+'.tolk'),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64'),candidateCells=graph(Cell.fromBoc(candidate)[0]);
for(const hash of Object.values(pins))assert.ok(candidateCells.has(hash),'candidate exact helper '+hash);
const wrapperComparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(wrapperComparison.sameSerializedBoc,true,'complete isolated routing/deployment wrapper');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
// Register a source-built library in the emulator; it is never embedded into
// the candidate's code or substituted into any compiled candidate cell.
const affiliateSources={};
for(const f of ['main','types'])affiliateSources[f+'.tolk']=await fs.readFile(path.join(project,'CpmmAffiliateAccount',f+'.tolk'),'utf8');
const affiliateBuild=await compileTolk({sources:affiliateSources});assert.equal(affiliateBuild.status,'ok',affiliateBuild.message);
const affiliateCode=Cell.fromBoc(Buffer.from(affiliateBuild.codeBoc,'base64'))[0];
assert.equal(affiliateCode.hash().toString('hex'),'4456fad12a434c4898b05ac65bab5de80db33f275c6020746de8e111a5cda4e6');
const libs=Dictionary.empty(Dictionary.Keys.Buffer(32),Dictionary.Values.Cell());libs.set(affiliateCode.hash(),affiliateCode);
const libraries=beginCell().storeDictDirect(libs).endCell();
const int=n=>({type:'int',value:String(n)}),nil={type:'null'},cell=c=>c?{type:'cell',cell:c}:nil;
const addr=a=>beginCell().storeAddress(a).endCell(),slice=c=>({type:'slice',cell:c});
const hashCell=c=>({type:'cell',cellHash:c.hash().toString('hex')}),hashSlice=c=>({type:'slice',cellHash:c.hash().toString('hex')});
const owner=addr(new Address(0,Buffer.alloc(32,41))),master=addr(new Address(-1,Buffer.alloc(32,42)));
const wallet=addr(new Address(0,Buffer.alloc(32,43))),asset=addr(new Address(0,Buffer.alloc(32,44)));
const excesses=addr(new Address(0,Buffer.alloc(32,45))),none=addr(null),external=addr(new ExternalAddress(0xabcdn,16));
const variable=beginCell().storeUint(3,2).storeBit(false).storeUint(256,9).storeInt(0,32).storeUint(99,256).endCell();
const empty=beginCell().endCell(),leaf=beginCell().storeUint(0x1234,16).endCell(),nested=beginCell().storeRef(leaf).endCell();
const MAX=(1n<<120n)-1n,MAX_ID=(1n<<256n)-1n;
const routing=[],payouts=[],deployments=[];
async function check(name,method,args,expected,target,exit=0,chain=0,withLibrary=true) {
    const [result]=await compareGetters(oracle,candidate,[{method,args}],{address:new Address(chain,Buffer.alloc(32,37)),libraries:withLibrary?libraries:undefined});
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name+': '+JSON.stringify(result));assert.equal(result.before.gasUsed,result.after.gasUsed,name+': gas');
    if(expected)assert.deepEqual(result.before.stack,expected,name);target.push({name,...result});
}
function routeArgs(native,query,amount,minimal,deadline,next,partner,referrer,payout,gas) {
    return[slice(native?none:asset),slice(owner),slice(wallet),slice(excesses),int(query),int(amount),int(minimal),int(deadline),cell(next),
        ...(partner?[int(MAX_ID),int(65535),int(132)]:[nil,nil,int(0)]),
        ...(referrer?[int(7),int(19),int(163)]:[nil,nil,int(0)]),cell(payout),int(gas)];
}
function routedMessage(native,query,amount,minimal,deadline,next,partner,referrer,payout,gas) {
    const payload=beginCell().storeUint(0xc442500f,32).storeCoins(minimal).storeUint(deadline,40).storeMaybeRef(next).storeBit(partner);
    if(partner)payload.storeUint(MAX_ID,256).storeUint(65535,16);
    payload.storeBit(referrer);if(referrer)payload.storeUint(7,256).storeUint(19,16);
    const payment=payload.endCell();let body;
    if(native)body=beginCell().storeUint(0xa5a7cbf8,32).storeUint(query,64).storeCoins(amount).storeRef(payment).storeRef(payout).endCell();
    else {
        const notification=beginCell().storeUint(0xcbc33949,32).storeRef(payment).storeRef(payout).endCell();
        body=beginCell().storeUint(0x0f8a7ea5,32).storeUint(query,64).storeCoins(amount)
            .storeSlice(owner.beginParse()).storeSlice(excesses.beginParse()).storeMaybeRef(null).storeCoins(gas-50000000n)
            .storeBit(true).storeRef(notification).endCell();
    }
    return beginCell().storeUint(0x10,6).storeSlice((native?owner:wallet).beginParse()).storeUint(1,111).storeRef(body).endCell();
}
for(const chain of [0,-1])for(const native of [false,true])for(const amount of [0n,11n,MAX])for(const next of [null,nested])
for(const partner of [false,true])for(const referrer of [false,true]) {
    const q=routing.length%2?0n:(1n<<64n)-1n,deadline=routing.length%2?0n:(1n<<40n)-1n,minimal=amount;
    const gas=amount===MAX?MAX:50000000n;
    const message=routedMessage(native,q,amount,minimal,deadline,next,partner,referrer,nested,gas);
    const action=beginCell().storeRef(empty).storeUint(0x0ec3c86d,32).storeUint(144,8).storeRef(message).endCell();
    await check(`chain=${chain} ${native?'TON':'jetton'} amount=${amount} next=${Boolean(next)} partner=${partner} referrer=${referrer}`,90046,
        routeArgs(native,q,amount,minimal,deadline,next,partner,referrer,nested,gas),[hashCell(action)],routing,0,chain);
}
for(const native of [false,true])for(const [field,bad]of [[4,-1n],[4,1n<<64n],[5,-1n],[5,1n<<120n],
    [6,-1n],[6,1n<<120n],[7,-1n],[7,1n<<40n],[9,-1n],[10,-1n],[10,1n<<16n]]) {
    const args=routeArgs(native,9n,11n,17n,1000n,null,true,true,nested,50000000n);args[field]=int(bad);
    await check(`invalid field=${field} value=${bad} native=${native}`,90046,args,null,routing,5);
}
await check('jetton forward budget too small',90046,routeArgs(false,9n,11n,17n,1000n,null,false,false,nested,49999999n),null,routing,5);
const ignored=routeArgs(true,9n,11n,17n,1000n,null,false,false,nested,-1n);
const ignoredMessage=routedMessage(true,9n,11n,17n,1000n,null,false,false,nested,-1n);
await check('native ignores jetton forward budget',90046,ignored,
    [hashCell(beginCell().storeRef(empty).storeUint(0x0ec3c86d,32).storeUint(144,8).storeRef(ignoredMessage).endCell())],routing);
const unsupported=routeArgs(false,9n,11n,17n,1000n,null,false,false,nested,50000000n);unsupported[0]=slice(external);
await check('unsupported external asset',90046,unsupported,null,routing,31);
for(const destination of [owner,none,external,variable])for(const refund of [master,none,external,variable])for(const fallback of [owner,external]) {
    const valid=c=>c.beginParse().preloadUint(2)===2;
    await check('basic payout '+[destination,refund,fallback].map(c=>c.hash().toString('hex')).join('/'),90047,
        [slice(destination),int(MAX),cell(nested),int(-1),slice(refund),slice(fallback)],
        [hashSlice(valid(destination)?destination:fallback),int(MAX),hashCell(nested),int(-1),hashSlice(valid(refund)?refund:fallback)],payouts);
}
const literal=BigInt('0x80187666419A78C39863E64E5F9F264FFC283A7C7BF82DA37ADD3A2E8318691F227')>>1n;
assert.equal(literal>>256n,4n<<8n);
const authority=new Address(0,Buffer.from((literal&MAX_ID).toString(16).padStart(64,'0'),'hex'));
for(const kind of [132,163,0,150])for(const identity of [0n,7n,MAX_ID])for(const fee of [0,19,65535]) {
    const data=beginCell().storeBit(false).storeAddress(authority).storeBit(kind!==132).storeMaybeRef(null)
        .storeUint(identity,256).storeUint(fee,16).storeAddress(null).endCell();
    await check(`affiliate kind=${kind} identity=${identity} fee=${fee}`,90048,[int(kind),int(identity),int(fee)],
        [int(0),hashCell(affiliateCode),hashCell(data),int(130),nil,nil,int(0)],deployments);
}
for(const [identity,fee]of [[-1n,0],[0n,-1],[0n,65536]])
    await check('invalid affiliate fields '+identity+'/'+fee,90048,[int(132),int(identity),int(fee)],null,deployments,5);
await check('missing public affiliate library',90048,[int(132),int(7),int(19)],null,deployments,9,0,false);
const proof={scope:'Exact shared swap continuation, basic payout normalization and affiliate deployment helpers; complete Pool remains pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    librarySourceSha256:Object.fromEntries(Object.entries(affiliateSources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),
    revisions:['CpmmPoolV1','CpmmPoolV2'],helperHashes:pins,wrapperComparison,affiliateLibraryHash:affiliateCode.hash().toString('hex'),
    affiliateAuthority:authority.toRawString(),routing,payouts,deployments};
await writeJson(path.join(directory,'report.json'),proof);await writeJson(path.join(project,'CpmmPoolV2/routing-verification.json'),proof);
console.log('Both Pool revisions: three exact helpers and byte-identical isolated BOC; '+(routing.length+payouts.length+deployments.length)+' probes include gas, action/ABI bodies, address normalization and source-built library deployment');
