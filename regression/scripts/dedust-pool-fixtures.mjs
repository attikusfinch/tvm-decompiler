import {familyDirectory} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address, ExternalAddress, Cell, Dictionary, beginCell, contractAddress} from '@ton/core';
import {root, compareMessages, compareGetters, compareBoc, writeJson} from './lib.mjs';
import {compileTolk} from './tolk.mjs';

const project=path.resolve(root,'../reconstruction');

export const checkPoolV1=(oracle,candidate)=>checkPool(oracle,candidate,{protocolPercent:30});

export async function checkPool(oracle,candidate,{protocolPercent=20}={}) {
assert.ok([20,30].includes(protocolPercent),'known protocol fee revision');
const directory=path.join(root,'artifacts',protocolPercent===30?'dedust-pool-handlers-v1':'dedust-pool-handlers');
await fs.mkdir(directory,{recursive:true});
const methods=c=>Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},c.refs[0]);
const originalMethods=methods(Cell.fromBoc(oracle)[0]),candidateMethods=methods(Cell.fromBoc(candidate)[0]);
const exactMethodIds=[0,19,20,21,22,23,24,72157,81689,112421];
for(const id of exactMethodIds)assert.ok(candidateMethods.get(id).equals(originalMethods.get(id)),`complete candidate: exact dictionary value ${id}`);
const incomingDecoderHash='4d8dcc10bbe8ada52bbcbbe299ae4bd8364d684794a493b303cd048efdb39602';
assert.equal(originalMethods.get(0).refs[0].hash().toString('hex'),incomingDecoderHash,'archived incoming decoder');
assert.equal(candidateMethods.get(0).refs[0].hash().toString('hex'),incomingDecoderHash,'candidate: exact incoming union decoder');
const unwrap=c=>!c.bits.length&&c.refs.length===1?c.refs[0]:c;
assert.equal(unwrap(candidateMethods.get(20)).bits.toString(),unwrap(originalMethods.get(20)).bits.toString(),'candidate: method 20 outer continuation instructions');

const libs=Dictionary.empty(Dictionary.Keys.Buffer(32),Dictionary.Values.Cell());
for(const role of ['CpmmDeposit','CpmmPosition','CpmmAffiliateAccount']) {
    const libSources={};for(const name of await fs.readdir(path.join(project,familyDirectory(role))))if(name.endsWith('.tolk'))
        libSources[name]=await fs.readFile(path.join(project,familyDirectory(role),name),'utf8');
    const result=await compileTolk({sources:libSources});assert.equal(result.status,'ok',result.message);
    const code=Cell.fromBoc(Buffer.from(result.codeBoc,'base64'))[0];
    assert.ok(code.equals(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',role+'.boc')))[0]));libs.set(code.hash(),code);
}
const libraries=beginCell().storeDictDirect(libs).endCell();
const addr=n=>new Address(0,Buffer.alloc(32,n));
const pool=addr(37),sender=addr(41),recipient=addr(42),excesses=addr(43),creator=addr(44),jettonX=addr(45),jettonY=addr(46),walletX=addr(47),walletY=addr(48),controller=addr(49),resolver=addr(50);
const empty=beginCell().endCell(),leaf=beginCell().storeUint(7,8).endCell();
const inline={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
const dict=()=>Dictionary.empty(Dictionary.Keys.BigUint(256),inline);
const key=a=>BigInt('0x'+a.hash.toString('hex')),addressCell=a=>beginCell().storeAddress(a).endCell();
const rewards=()=>Dictionary.empty(Dictionary.Keys.Uint(2),inline);
const defaults={x:null,y:jettonY,feeIn:0,baseFee:30,creatorFee:2500,liquidity:1000000n,reserveX:100000000000n,reserveY:200000000000n,
    swapActive:true,depositActive:true,swapActivation:null,depositActivation:null,status:2,custom:null,allowed:null,pending:null};
function poolConfig(o) {return beginCell().storeAddress(o.x).storeAddress(o.y).storeAddress(creator).storeUint(o.baseFee,16).storeUint(o.creatorFee,16)
    .storeMaybeRef(o.depositActivation).storeMaybeRef(o.swapActivation).storeUint(o.feeIn,2).storeDict(o.custom).storeDict(o.allowed).endCell();}
const fees=beginCell().storeCoins(7).storeCoins(11).storeCoins(13).storeCoins(17).storeVarUint(19,5).storeVarUint(23,5).endCell();
function poolExtra(o) {
    const byAssets=dict(),byWallets=dict();
    for(const [asset,wallet]of [[jettonX,walletX],[jettonY,walletY]]) {byAssets.set(key(asset),addressCell(wallet));byWallets.set(key(wallet),addressCell(asset));}
    return beginCell().storeAddress(controller).storeDict(o.byAssets??byAssets).storeDict(o.byWallets??byWallets).storeDict(o.pending).endCell();
}
function state(o) {
    const b=beginCell().storeRef(o.configCell??poolConfig(o)).storeRef(o.feesCell??fees).storeRef(o.extraCell??poolExtra(o)).storeDict(o.rewards??null).storeUint(o.status,2);
    if(o.status===1)b.storeAddress(sender);
    return b.storeBit(o.depositActive).storeBit(o.swapActive).storeCoins(o.liquidity).storeCoins(o.reserveX).storeCoins(o.reserveY).endCell();
}
function payout(o={}) {return beginCell().storeAddress(o.to===undefined?recipient:o.to).storeCoins(17).storeMaybeRef(o.payload??null).storeBit(o.wrap??false)
    .storeAddress(o.rejectTo===undefined?recipient:o.rejectTo).storeCoins(19).storeMaybeRef(o.rejectPayload??leaf).storeBit(o.rejectWrap??true)
    .storeAddress(o.excesses===undefined?excesses:o.excesses).endCell();}
function swap(o={}) {return beginCell().storeUint(0xc442500f,32).storeCoins(o.minimum??0n).storeUint(o.deadline??0,40)
    .storeMaybeRef(null).storeBit(false).storeBit(false).endCell();}
const funding=t=>beginCell().storeUint(0x2eb87df9,32).storeUint(t,40).endCell();
const init=q=>beginCell().storeUint(0xde8402ce,32).storeUint(q,64).storeMaybeRef(null).endCell();
const walletReply=(q,wallet,owner=null)=>beginCell().storeUint(0xd1735400,32).storeUint(q,64).storeAddress(wallet).storeMaybeRef(owner).endCell();
const native=(payment=swap(),amount=100000000n,p=payout())=>beginCell().storeUint(0xa5a7cbf8,32).storeUint(9,64).storeCoins(amount).storeRef(payment).storeRef(p).endCell();
function jetton(payment=swap(),amount=100000000n,p=payout(),asRef=true,malformed=false) {
    const forward=malformed?leaf:beginCell().storeUint(0xcbc33949,32).storeRef(payment).storeRef(p).endCell();
    const b=beginCell().storeUint(0x7362d09c,32).storeUint(9,64).storeCoins(amount).storeAddress(sender).storeBit(asRef);
    if(asRef)b.storeRef(forward);else b.storeSlice(forward.beginParse());return b.endCell();
}
const cases=[];
async function check(name,o,body,{from=sender,value=5000000000n,exit=0,expectedState,bounced=false,data,selfIdentityBodies,sameGas=false,noActions=false}={}) {
    const [result]=await compareMessages(oracle,candidate,[{label:name,from,value,body,bounced,expectExit:exit}],{data:data??state(o),address:pool,libraries});
    if(selfIdentityBodies) {
        for(const [outcome,expectedBody] of [[result.before,selfIdentityBodies[0]],[result.after,selfIdentityBodies[1]]]) {
            const sends=outcome.actions.filter(a=>a.type==='sendMsg');assert.equal(sends.length,1,name);
            assert.equal(sends[0].outMsg.body.cellHash,expectedBody.hash().toString('hex'),name+': independently expected self-code body');
        }
    }
    if(!result.sameObservedBehavior)await writeJson(path.join(directory,'failure.json'),result);
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.before.exitCode,exit,name+': unexpected original exit');
    assert.equal(result.after.gasUsed,result.before.gasUsed,name+': exact gas');
    if(noActions)assert.deepEqual(result.before.actions,[],name+': no refund from malformed outer message');
    if(expectedState)assert.equal(result.before.dataHash,expectedState.hash().toString('hex'),name+': independent expected state');
    cases.push({name,...result});
}
await check('init all noninternal assets',{...defaults,status:0,y:new ExternalAddress(17n,16)},init(9));
await check('init one jetton resolution',{...defaults,status:0},init(9));
await check('init two jetton resolutions',{...defaults,status:0,x:jettonX},init(9));
const shared=dict().set(key(jettonX),addressCell(resolver)).set(key(jettonY),addressCell(resolver));
await check('init custom resolver collision',{...defaults,status:0,x:jettonX,custom:shared},init(9));
const allowed=rewards().set(1,beginCell().storeAddress(jettonY).storeUint(100,40).endCell())
    .set(2,beginCell().storeAddress(jettonX).storeUint(100,40).endCell());
await check('init allowed rewards share and add resolution',{...defaults,status:0,allowed},init(9));
await check('init bad creator fee',{...defaults,status:0,creatorFee:5001},init(9),{exit:35});
await check('init equal assets',{...defaults,status:0,y:null},init(9),{exit:26});
await check('init already initialized',defaults,init(9),{exit:20});
await check('init insufficient upfront gas',{...defaults,status:0},init(9),{exit:25,value:1000000n});
await check('init insufficient final gas after resolver send',{...defaults,status:0},init(9),{exit:25,value:57000000n});
await check('init resolver-fee revision boundary',{...defaults,status:0},init(9),{exit:protocolPercent===30?0:25,value:60000000n});
await check('init malformed config',{...defaults,status:0,configCell:empty},init(9),{exit:9});

// Independently calculate the complete swap state for both directions and all
// fee selectors. V1 allocates 30% of base fees to protocol; V2 allocates 20%.
for(const feeIn of [0,1,2])for(const xToY of [true,false]) {
    const amount=100000000n,feeFromInput=feeIn===0 || (feeIn===1?xToY:!xToY);
    const netInput=feeFromInput?amount*10000n/10030n:amount;
    const input=xToY?defaults.reserveX:defaults.reserveY,output=xToY?defaults.reserveY:defaults.reserveX;
    const grossOutput=netInput*output/(input+netInput);
    const totalFee=feeFromInput?amount-netInput:grossOutput-grossOutput*10000n/10030n;
    const protocol=totalFee*BigInt(protocolPercent)/100n,creator=(totalFee-protocol)*2500n/10000n;
    const checkpoint=(totalFee-protocol-creator)*(1n<<120n)/defaults.liquidity,fromY=xToY!==feeFromInput;
    const updatedFees=beginCell().storeCoins(7n+(fromY?0n:protocol)).storeCoins(11n+(fromY?protocol:0n))
        .storeCoins(13n+(fromY?0n:creator)).storeCoins(17n+(fromY?creator:0n))
        .storeVarUint(19n+(fromY?0n:checkpoint),5).storeVarUint(23n+(fromY?checkpoint:0n),5).endCell();
    const o={...defaults,feeIn};
    const expected=state({...o,feesCell:updatedFees,reserveX:defaults.reserveX+(xToY?netInput:-grossOutput),
        reserveY:defaults.reserveY+(xToY?-grossOutput:netInput)});
    await check(`independent swap fee=${feeIn} xToY=${xToY} protocol=${protocolPercent}%`,o,xToY?native():jetton(),
        {from:xToY?sender:walletY,expectedState:expected});
}
await check('wallet reply wrong status',defaults,walletReply(9,walletY),{from:resolver,exit:21});
const pending=dict().set(key(resolver),addressCell(jettonY));
const unregistered={...defaults,status:1,byAssets:dict(),byWallets:dict(),pending};
await check('wallet reply final resolution',unregistered,walletReply(9,walletY),{from:resolver});
await check('wallet reply none address',unregistered,walletReply(9,null),{from:resolver,exit:24});
await check('wallet reply unknown resolver',unregistered,walletReply(9,walletY),{from:creator,exit:41});
await check('wallet reply duplicate registration',{...defaults,status:1,pending},walletReply(9,walletY),{from:resolver,exit:39});
const pendingTwo=dict().set(key(resolver),addressCell(jettonY)).set(key(creator),addressCell(jettonX));
await check('wallet reply leaves another resolution',{...unregistered,pending:pendingTwo},walletReply(9,walletY),{from:resolver});
for(const status of [0,1,2])for(const amount of [0n,100000000n])await check(`native payment lifecycle=${status} amount=${amount}`,
    {...defaults,status},native(swap(),amount),{exit:status===2?(amount===0n?47:0):22});
await check('native payment low gas',defaults,native(),{exit:25,value:1000000n});
await check('native payment expired',defaults,native(swap({deadline:1700000000})),{exit:33});
await check('native payment malformed inner payment',defaults,native(empty),{exit:63});
await check('native payment invalid payout fallback',defaults,native(swap(),0n,payout({to:null,rejectTo:null,excesses:null})),{exit:47});
for(const asRef of [false,true])for(const status of [0,1,2])for(const amount of [0n,100000000n]) {
    await check(`jetton payment reference=${asRef} lifecycle=${status} amount=${amount}`,{...defaults,status},jetton(swap(),amount,payout(),asRef),
        {from:walletY,exit:status===2?(amount===0n?47:0):22});
}
await check('jetton unknown wallet',defaults,jetton(),{from:resolver,exit:40});
await check('jetton payment low gas',defaults,jetton(),{from:walletY,exit:25,value:1000000n});
await check('jetton notification malformed forwarding body',defaults,jetton(swap(),1n,payout(),true,true),{from:walletY,exit:63});
await check('jetton payment unknown payload',defaults,jetton(empty),{from:walletY,exit:63});
await check('jetton payment failed swap wraps reject callback',defaults,jetton(swap({minimum:999999999999n})),{from:walletY,exit:30});
await check('jetton reward funding',defaults,jetton(funding(1700000100)),{from:walletY,exit:42});
await check('unknown message opcode',defaults,beginCell().storeUint(0,32).endCell(),{exit:65535});
await check('bounced malformed message ignores even malformed storage',defaults,empty,{bounced:true,data:empty,sameGas:true,noActions:true});
const missingJettonRef=beginCell().storeUint(0x7362d09c,32).storeUint(9,64).storeCoins(1).storeAddress(sender).storeBit(true).endCell();
await check('jetton reference selector without payload fails before handler',defaults,missingJettonRef,{from:walletY,exit:9,sameGas:true,noActions:true});
await check('malformed jetton reference wins over malformed root storage',defaults,missingJettonRef,{from:walletY,data:empty,exit:9,sameGas:true,noActions:true});
const shortJettonHeader=beginCell().storeUint(0x7362d09c,32).storeUint(9,32).endCell();
await check('truncated jetton query fails before handler',defaults,shortJettonHeader,{from:walletY,exit:9,sameGas:true,noActions:true});
await check('truncated native payment refs fail before handler',defaults,beginCell().storeUint(0xa5a7cbf8,32).storeUint(9,64).storeCoins(1).endCell(),{exit:9,sameGas:true,noActions:true});
for(const body of [native(),init(9),walletReply(9,walletY)]) {
    const withTail=beginCell().storeSlice(body.beginParse()).storeUint(0xbeef,16).storeRef(leaf).endCell();
    const isInit=body.beginParse().preloadUint(32)===0xde8402ce;
    const isReply=body.beginParse().preloadUint(32)===0xd1735400;
    await check('ignored incoming suffix opcode='+body.beginParse().preloadUint(32),isInit?{...defaults,status:0}:isReply?unregistered:defaults,withTail,{from:isReply?resolver:sender});
}
const positionLibraryHash='dd82f24db614798ee7c579f8b3f07f0645d06d65cede368d80d0d74b180d2dd6';
const depositLibraryHash='2cac3fddd30969d08df036067108c6e7d69780a9459d931d2eb63d95d5ff6825';
function library(hash) {return new Cell({bits:beginCell().storeUint(2,8).storeBuffer(Buffer.from(hash,'hex')).endCell().bits,exotic:true});}
function sharded(code,data,prefix=pool.hash[0]) {
    const hash=Buffer.from(contractAddress(0,{splitDepth:8,code,data}).hash);hash[0]=prefix;return new Address(0,hash);
}
function positionFor(owner,prefix) {
    const initialFees=beginCell().storeVarUint(0,5).storeCoins(0).storeCoins(0).storeVarUint(0,5).storeCoins(0).storeCoins(0).endCell();
    const data=beginCell().storeAddress(pool).storeAddress(owner).storeCoins(0).storeCoins(0).storeRef(initialFees).storeMaybeRef(null).endCell();
    return sharded(library(positionLibraryHash),data,prefix);
}
function depositConfig(minimum=1n) {return beginCell().storeCoins(100000000n).storeCoins(200000000n).storeCoins(minimum).storeUint(250,16).storeRef(payout()).endCell();}
function depositFor(config,prefix) {
    const data=beginCell().storeRef(config).storeAddress(pool).storeAddress(sender).storeCoins(0).storeCoins(0).endCell();
    return sharded(library(depositLibraryHash),data,prefix);
}
const position=positionFor(sender),config=depositConfig(),depositAddress=depositFor(config);
const join=(c=config,x=100000000n,y=200000000n)=>beginCell().storeUint(0x25251ee0,32).storeUint(9,64).storeRef(c).storeCoins(x).storeCoins(y).storeAddress(sender).endCell();
const refund=(c=config)=>beginCell().storeUint(0x0d299e12,32).storeUint(9,64).storeRef(c).storeCoins(100000000n).storeCoins(200000000n).storeAddress(sender).endCell();
await check('join established pool',defaults,join(),{from:depositAddress,
    expectedState:state({...defaults,reserveX:100100000000n,reserveY:200200000000n,liquidity:1001000n})});
await check('join refunds asymmetric leftover',defaults,join(config,100000000n,250000000n),{from:depositAddress,
    expectedState:state({...defaults,reserveX:100100000000n,reserveY:200200000000n,liquidity:1001000n})});
await check('join initial liquidity uses integer root',{...defaults,liquidity:0n,reserveX:0n,reserveY:0n},join(),{from:depositAddress,
    expectedState:state({...defaults,reserveX:100000000n,reserveY:200000000n,liquidity:141421356n})});
const impossible=depositConfig(1001n);
await check('join minimum rejects and commits full refund',defaults,join(impossible),{from:depositFor(impossible),exit:30});
await check('join authenticates deposit',defaults,join(),{exit:23});
await check('join accepts authenticated different shard prefix',defaults,join(),{from:depositFor(config,0x7f)});
await check('refund authenticated deposit',defaults,refund(),{from:depositAddress,expectedState:state(defaults)});
await check('refund rejects impostor',defaults,refund(),{exit:23});
const feeRequest=beginCell().storeUint(0x5652f1df,32).storeUint(9,64).storeAddress(null).endCell();
await check('claim position fees normalizes excesses',defaults,feeRequest);
await check('claim position fees low gas',defaults,feeRequest,{value:1000000n,exit:25});
const feePayout=beginCell().storeUint(0x29ff1bcf,32).storeUint(9,64).storeCoins(7n).storeCoins(11n).storeAddress(sender).storeAddress(excesses).endCell();
await check('position fee payout',defaults,feePayout,{from:position});
await check('position fee payout authenticates owner',defaults,feePayout,{exit:23});
const claim=(opcode,to=null,e=null)=>beginCell().storeUint(opcode,32).storeUint(9,64).storeAddress(to).storeAddress(e).endCell();
const clearedProtocol=beginCell().storeCoins(0).storeCoins(0).storeCoins(13).storeCoins(17).storeVarUint(19,5).storeVarUint(23,5).endCell();
const clearedCreator=beginCell().storeCoins(7).storeCoins(11).storeCoins(0).storeCoins(0).storeVarUint(19,5).storeVarUint(23,5).endCell();
await check('controller claims protocol fees',defaults,claim(0x419a17b3),{from:controller,expectedState:state({...defaults,feesCell:clearedProtocol})});
await check('protocol fees unauthorized',defaults,claim(0x419a17b3),{exit:23});
await check('creator claims creator fees',defaults,claim(0xbe3e3179),{from:creator,expectedState:state({...defaults,feesCell:clearedCreator})});
await check('creator fees unauthorized',defaults,claim(0xbe3e3179),{exit:23});
const basic=beginCell().storeAddress(recipient).storeCoins(17).storeMaybeRef(leaf).storeBit(true).storeAddress(excesses).endCell();
const withdraw=beginCell().storeUint(0x20b5ef89,32).storeUint(9,64).storeCoins(100).storeCoins(1).storeCoins(1).storeBit(true).storeRef(basic).endCell();
await check('withdraw forwards checkpoints limits and normalized config',defaults,withdraw);
await check('withdraw insufficient gas',defaults,withdraw,{value:1000000n,exit:25});
const exit=min=>beginCell().storeUint(0xf6f6a3aa,32).storeUint(9,64).storeCoins(100n).storeCoins(7n).storeCoins(11n).storeAddress(sender)
    .storeCoins(min).storeCoins(1n).storeRef(basic).endCell();
await check('exit authenticated position pays proportional reserves and fees',defaults,exit(1n),{from:position,
    expectedState:state({...defaults,reserveX:99990000000n,reserveY:199980000000n,liquidity:999900n})});
await check('exit output minimum',defaults,exit(10000001n),{from:position,exit:30});
await check('exit zero supply divides by zero',{...defaults,liquidity:0n},exit(0n),{from:position,exit:4});
await check('exit impostor',defaults,exit(0n),{exit:23});
for(const status of [0,1,2])for(const mask of [0,1,2,3,8,11]) {
    const body=beginCell().storeUint(0x00d8d379,32).storeUint(9,64).storeBit(mask&1).storeBit(mask&2).storeBit(false).storeBit(mask&8).endCell();
    await check(`public state lifecycle=${status} fields=${mask}`,{...defaults,status},body,{expectedState:state({...defaults,status})});
}
const rewardRecord=beginCell().storeUint(100,40).storeCoins(1000).storeVarUint(23,5).storeUint(1699999950,40).endCell();
const rewardMap=rewards().set(2,rewardRecord);
const accrued=rewards().set(2,beginCell().storeUint(50,40).storeCoins(500).storeVarUint(23n+500n*(1n<<120n)/1000000n,5).storeUint(1700000000,40).endCell());
const rewardClaim=id=>beginCell().storeUint(0x909fdb65,32).storeUint(9,64).storeUint(id,2).storeAddress(null).endCell();
await check('claim reward accrues and forwards selected slot',{...defaults,rewards:rewardMap},rewardClaim(2),{expectedState:state({...defaults,rewards:accrued})});
await check('claim reward missing slot',defaults,rewardClaim(2),{exit:46});
await check('claim reward low gas',defaults,rewardClaim(2),{exit:25,value:1000000n});
const rewardAllowed=rewards().set(2,beginCell().storeAddress(jettonY).storeUint(86400,40).endCell());
const rewardPayout=amount=>beginCell().storeUint(0x9e17fbbe,32).storeUint(9,64).storeCoins(amount).storeUint(2,2).storeAddress(sender).storeAddress(excesses).endCell();
await check('position reward payout',{...defaults,allowed:rewardAllowed},rewardPayout(100n),{from:position});
await check('position reward sends zero amount',{...defaults,allowed:rewardAllowed},rewardPayout(0n),{from:position});
await check('position reward missing configured slot',defaults,rewardPayout(100n),{from:position,exit:42});
await check('position reward impostor',{...defaults,allowed:rewardAllowed},rewardPayout(100n),{exit:23});
const newCode=beginCell().storeUint(0x90,8).endCell();
const upgrade=beginCell().storeUint(0xf287e089,32).storeUint(9,64).storeRef(newCode).endCell();
await check('authorized code replacement',defaults,upgrade,{from:controller});
await check('code replacement unauthorized',defaults,upgrade,{exit:23});
function publicStateWithCode(o,mask,hash) {
    const b=beginCell().storeUint(0x870a9579,32).storeUint(9,64).storeUint(o.status,2);
    if(o.status===1)b.storeAddress(sender);
    b.storeBit(o.depositActive).storeBit(o.swapActive).storeCoins(o.liquidity).storeCoins(o.reserveX).storeCoins(o.reserveY)
        .storeMaybeRef(mask&1?poolConfig(o):null).storeMaybeRef(mask&2?fees:null).storeBit(Boolean(mask&8));
    if(mask&8)b.storeDict(o.rewards??null);
    return b.storeBit(true).storeBuffer(hash).endCell();
}
for(const status of [0,1,2])for(const mask of [4,15]) {
    const o={...defaults,status},body=beginCell().storeUint(0x00d8d379,32).storeUint(9,64).storeBit(mask&1).storeBit(mask&2).storeBit(true).storeBit(mask&8).endCell();
    await check(`public state reports actual own code lifecycle=${status} fields=${mask}`,o,body,{expectedState:state(o),
        selfIdentityBodies:[publicStateWithCode(o,mask,Cell.fromBoc(oracle)[0].hash()),publicStateWithCode(o,mask,Cell.fromBoc(candidate)[0].hash())]});
}
const getterCases=[];
for(const [status,liquidity]of [[0,1000000n],[1,1000000n],[2,1000000n],[2,0n]]) {
    const o={...defaults,status,liquidity};
    const result=await compareGetters(oracle,candidate,[{method:81689,args:[]},{method:112421,args:[100n]},
        {method:72157,args:[{type:'slice',cell:addressCell(sender)}]}],{data:state(o),address:pool,libraries});
    for(const test of result) {assert.equal(test.sameObservedBehavior,true,JSON.stringify(test));assert.equal(test.before.gasUsed,test.after.gasUsed,'exact public getter gas');}
    assert.equal(result[0].before.stack[0].value,String(status));
    assert.deepEqual(result[1].before.stack,[{type:'int',value:liquidity?'10000000':'0'},{type:'int',value:liquidity?'20000000':'0'}]);
    assert.deepEqual(result[2].before.stack,[{type:'slice',cellHash:addressCell(position).hash().toString('hex')}]);
    getterCases.push({status,liquidity:String(liquidity),result});
}

const comparison=compareBoc(oracle,Cell.fromBoc(candidate)[0].toBoc({idx:false,crc32:true}));
assert.equal(comparison.sameSerializedBoc,true,'whole Pool serialized BOC bytes');
return {getters:getterCases.flatMap(c=>c.result),messages:cases,getterCases,exactMethodIds,incomingDecoderHash,comparison};
}
