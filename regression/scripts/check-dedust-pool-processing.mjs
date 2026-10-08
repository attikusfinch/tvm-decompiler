import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address, Cell, Dictionary, beginCell} from '@ton/core';
import {root, compareMessages, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, tolkVersion} from './tolk.mjs';
import {assembleExact, disassembleExact} from './exact-assembly.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const directory=path.join(root,'artifacts/dedust-pool-processing');
await fs.mkdir(directory,{recursive:true});
const sources={'main.tolk':(await fs.readFile(path.join(project,'tests/fixtures/pool-processing.tolk'),'utf8'))
    .replaceAll('../../CpmmPoolV2/','')};
for(const name of await fs.readdir(path.join(project,'CpmmPoolV2')))
    if(name.endsWith('.tolk'))sources[name]=await fs.readFile(path.join(project,'CpmmPoolV2',name),'utf8');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64');
const methods=c=>Dictionary.loadDirect(Dictionary.Keys.Int(19),{serialize(){},parse:s=>s.asCell()},c.refs[0]);
const candidateMethods=methods(Cell.fromBoc(candidate)[0]);
const originalCode=Cell.fromBoc(await fs.readFile(path.join(project,'oracles/CpmmPoolV2.boc')))[0];
const originalMethods=methods(originalCode);
assert.ok(candidateMethods.get(20).equals(originalMethods.get(20)),
    'exact method 20, including dictionary reference placement');
// The oracle side alone contains archived method bodies. Both halves use the
// same source-built probe entrypoint and dictionary layout: DICT lookup gas
// depends on the layout even when a called method's code cell is identical.
// Archived method 20 calls only 21 and 22; other entries are not its oracle.
const oracle=assembleExact('SETCP 0\nDICTPUSHCONST 19 [\n'+
    [...candidateMethods.keys()].sort((a,b)=>a-b).map(id=>id+'=>{\n'+disassembleExact(([20,21,22,23,24].includes(id)?originalMethods:candidateMethods).get(id).toBoc())+'\n}').join('\n')+
    '\n]\nDICTIGETJMPZ\nTHROWARG 11\n','pool-processing-oracle.tasm');
const isolatedComparison=compareBoc(oracle,candidate);
assert.equal(isolatedComparison.sameCodeCell,true,'exact complete isolated fixture with archived method bodies');
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
await fs.writeFile(path.join(directory,'original20.tasm'),disassembleExact(originalMethods.get(20).toBoc()));
await fs.writeFile(path.join(directory,'candidate20.tasm'),disassembleExact(candidateMethods.get(20).toBoc()));
const libs=Dictionary.empty(Dictionary.Keys.Buffer(32),Dictionary.Values.Cell());
for(const role of ['CpmmDeposit','CpmmPosition','CpmmAffiliateAccount']) {
    const libSources={};
    for(const name of await fs.readdir(path.join(project,role)))if(name.endsWith('.tolk'))
        libSources[name]=await fs.readFile(path.join(project,role,name),'utf8');
    const result=await compileTolk({sources:libSources});assert.equal(result.status,'ok',result.message);
    const code=Cell.fromBoc(Buffer.from(result.codeBoc,'base64'))[0];
    assert.ok(code.equals(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',role+'.boc')))[0]));
    libs.set(code.hash(),code);
}
const libraries=beginCell().storeDictDirect(libs).endCell();
const addr=n=>new Address(0,Buffer.alloc(32,n));
const pool=addr(37),initiator=addr(41),recipient=addr(42),excesses=addr(43),creator=addr(44);
const jettonX=addr(45),jettonY=addr(46),walletX=addr(47),walletY=addr(48),controller=addr(49);
const empty=beginCell().endCell(),leaf=beginCell().storeUint(0xabcd,16).endCell();
const inline={serialize:(c,b)=>b.storeSlice(c.beginParse()),parse:s=>s.asCell()};
const lookup=Dictionary.empty(Dictionary.Keys.BigUint(256),inline);
lookup.set(BigInt('0x'+jettonX.hash.toString('hex')),beginCell().storeAddress(walletX).endCell());
lookup.set(BigInt('0x'+jettonY.hash.toString('hex')),beginCell().storeAddress(walletY).endCell());
const extra=beginCell().storeAddress(controller).storeDict(lookup).storeDict(null).storeDict(null).endCell();
const Q=1n<<120n,NOW=1700000000;
const defaults={x:null,y:jettonY,feeIn:0,baseFee:30,creatorFee:2500,liquidity:1000000n,
    reserveX:100000000000n,reserveY:200000000000n,swapActive:true,depositActive:true,
    depositActivation:null,swapActivation:null,status:2,protocolX:7n,protocolY:11n,creatorX:13n,creatorY:17n,xCheckpoint:19n,yCheckpoint:23n};
function config(o) {
    const rewards=Dictionary.empty(Dictionary.Keys.Uint(2),inline);
    rewards.set(2,beginCell().storeAddress(o.rewardAsset??o.y).storeUint(o.maxDuration??86400,40).endCell());
    return beginCell().storeAddress(o.x).storeAddress(o.y).storeAddress(creator).storeUint(o.baseFee,16)
        .storeUint(o.creatorFee,16).storeMaybeRef(o.depositActivation).storeMaybeRef(o.swapActivation).storeUint(o.feeIn,2)
        .storeDict(null).storeDict(rewards).endCell();
}
function fees(o) {return beginCell().storeCoins(o.protocolX).storeCoins(o.protocolY).storeCoins(o.creatorX).storeCoins(o.creatorY)
    .storeVarUint(o.xCheckpoint,5).storeVarUint(o.yCheckpoint,5).endCell();}
function state(o) {
    const b=beginCell().storeRef(o.configCell??config(o)).storeRef(o.feesCell??fees(o)).storeRef(o.extraCell??extra)
        .storeDict(o.rewards??null).storeUint(o.status,2);
    if(o.status===1)b.storeAddress(initiator);
    return b.storeBit(o.depositActive).storeBit(o.swapActive).storeCoins(o.liquidity).storeCoins(o.reserveX).storeCoins(o.reserveY).endCell();
}
function payout(o={}) {return beginCell().storeAddress(o.destination===undefined?recipient:o.destination).storeCoins(o.extraGas??17n)
    .storeMaybeRef(o.payload??null).storeBit(o.wrap??false)
    .storeAddress(o.rejectDestination===undefined?recipient:o.rejectDestination).storeCoins(o.rejectExtraGas??19n)
    .storeMaybeRef(o.rejectPayload??leaf).storeBit(o.rejectWrap??true)
    .storeAddress(o.excesses===undefined?excesses:o.excesses).endCell();}
function paymentSwap(o={}) {
    const b=beginCell().storeUint(0xc442500f,32).storeCoins(o.minimum??0n).storeUint(o.deadline??0,40).storeMaybeRef(o.next??null)
        .storeBit(Boolean(o.partner));if(o.partner)b.storeUint(7,256).storeUint(o.partner,16);
    b.storeBit(Boolean(o.referrer));if(o.referrer)b.storeUint(9,256).storeUint(o.referrer,16);
    return b.endCell();
}
const deposit=o=>beginCell().storeUint(0xc9a015da,32).storeCoins(o.targetX??100n).storeCoins(o.targetY??200n)
    .storeCoins(o.minimum??1n).storeUint(o.lockedShare??250,16).endCell();
const funding=t=>beginCell().storeUint(0x2eb87df9,32).storeUint(t,40).endCell();
const time=t=>beginCell().storeUint(1,8).storeUint(t,40).endCell();
const owner=a=>beginCell().storeUint(2,8).storeAddress(a).endCell();
function probeBody(payment,asset,amount,p=payout()) {return beginCell().storeUint(9,64).storeCoins(amount).storeAddress(asset)
    .storeCoins(1000000n).storeRef(p).storeRef(payment).endCell();}
function rejectData(code,p={}) {
    const valid=a=>a!==null;
    const destination=p.rejectDestination===undefined?recipient:p.rejectDestination;
    const refund=p.excesses===undefined?excesses:p.excesses;
    return beginCell().storeUint(0xdeadbeef,32).storeInt(code,32).storeBit(true)
        .storeAddress(valid(refund)?refund:initiator).storeAddress(valid(destination)?destination:initiator)
        .storeCoins(p.rejectExtraGas??19n).storeMaybeRef(p.rejectPayload??leaf).storeBit(p.rejectWrap??true).endCell();
}
function swapExpectation(o,asset,amount,s) {
    const xToY=asset===o.x,feeFromInput=o.feeIn===0||(o.feeIn===1?xToY:!xToY);
    const fromY=xToY!==feeFromInput,feeAsset=fromY?o.y:o.x;
    const partner=feeAsset===null&&s.partner?Math.min(s.partner,500):0;
    const referrer=partner&&s.referrer?Math.min(s.referrer,8000):0;
    const rate=BigInt(o.baseFee+(referrer?Math.floor(partner*5/6):partner));
    const netIn=feeFromInput?amount*10000n/(10000n+rate):amount;
    const input=xToY?o.reserveX:o.reserveY,output=xToY?o.reserveY:o.reserveX;
    const gross=netIn*output/(input+netIn),netOut=feeFromInput?gross:gross*10000n/(10000n+rate);
    const totalFee=feeFromInput?amount-netIn:gross-netOut,base=totalFee*BigInt(o.baseFee)/rate;
    const protocol=base*20n/100n,creatorFee=(base-protocol)*BigInt(o.creatorFee)/10000n,lp=base-protocol-creatorFee;
    const affiliate=totalFee-base,referrerFee=(affiliate*6n/5n)*BigInt(referrer)/10000n,partnerFee=affiliate-referrerFee;
    const next={...o,swapActive:o.swapActive||Boolean(o.swapActivation)};
    if(fromY){next.protocolY+=protocol;next.creatorY+=creatorFee;next.yCheckpoint+=lp*Q/o.liquidity;}
    else{next.protocolX+=protocol;next.creatorX+=creatorFee;next.xCheckpoint+=lp*Q/o.liquidity;}
    if(xToY){next.reserveX+=netIn;next.reserveY-=gross;}else{next.reserveX-=gross;next.reserveY+=netIn;}
    const updated=beginCell().storeCoins(next.reserveX).storeCoins(next.reserveY).storeCoins(next.liquidity).storeRef(fees(next)).endCell();
    const breakdown=beginCell().storeBit(!fromY).storeCoins(lp).storeCoins(creatorFee).storeCoins(protocol).storeCoins(partnerFee).storeCoins(referrerFee).endCell();
    const event=beginCell().storeUint(0x78e79ba4,32).storeBit(xToY).storeCoins(amount).storeCoins(netOut)
        .storeAddress(initiator).storeAddress(s.destination===null?initiator:recipient).storeRef(updated).storeRef(breakdown).endCell();
    return {state:state(next),event,netOut,partnerFee,referrerFee};
}
const cases=[];
async function check(name,o,payment,asset,amount,{expectedState,expectedEvent,expectedError,wrapped=true,value=5000000000n,payoutOptions={},payoutCell}={}) {
    const [result]=await compareMessages(oracle,candidate,[{label:name,from:initiator,value,body:probeBody(payment,asset,amount,payoutCell??payout(payoutOptions))}],
        {data:state(o),address:pool,libraries});
    if(!result.sameObservedBehavior)await writeJson(path.join(directory,'failure.json'),result);
    assert.equal(result.sameObservedBehavior,true,name+': '+JSON.stringify(result));
    assert.equal(result.after.gasUsed,result.before.gasUsed,name+': exact gas');
    assert.equal(result.before.exitCode,0,name+': unexpected outer error');
    if(expectedError!==undefined)expectedState=wrapped?rejectData(expectedError,payoutOptions):
        beginCell().storeUint(0xdeadbeef,32).storeInt(expectedError,32).storeBit(false).endCell();
    if(expectedState)assert.equal(result.before.dataHash,expectedState.hash().toString('hex'),name+': independently expected state');
    if(expectedEvent)assert.ok(result.before.outMessages.some(m=>m.info==='external-out'&&m.body===expectedEvent.hash().toString('hex')),name+': independently expected swap event');
    cases.push({name,expectedError:expectedError??null,...result});
}
for(const [x,y]of [[null,jettonY],[jettonX,null],[jettonX,jettonY]])for(const direction of [true,false])for(const feeIn of [0,1,2])
for(const [partner,referrer]of [[0,0],[500,0],[600,9000],[500,1]]) {
    const o={...defaults,x,y,feeIn},s={partner,referrer},asset=direction?x:y,amount=100000000n;
    const expected=swapExpectation(o,asset,amount,s);
    await check(`swap xTON=${x===null} yTON=${y===null} xToY=${direction} feeIn=${feeIn} partner=${partner} referrer=${referrer}`,
        o,paymentSwap(s),asset,amount,{expectedState:expected.state,expectedEvent:expected.event});
}
for(const gate of [time(NOW),time(NOW-1),owner(initiator)]) {
    const o={...defaults,swapActive:false,swapActivation:gate},amount=100000000n;
    const expected=swapExpectation(o,null,amount,{});
    await check('swap activation accepted '+gate.hash().toString('hex'),o,paymentSwap(),null,amount,{expectedState:expected.state,expectedEvent:expected.event});
}
for(const [name,changes,s,asset,amount,error,value]of [
    ['zero payment',{}, {},null,0n,47],['low gas',{}, {},null,100000000n,25,100000001n],
    ['unsupported asset',{}, {},jettonX,100000000n,28],['zero liquidity',{liquidity:0n}, {},null,100000000n,34],
    ['expired swap',{}, {deadline:NOW},null,100000000n,33],['minimum output',{}, {minimum:999999999999n},null,100000000n,30],
    ['activation future',{swapActive:false,swapActivation:time(NOW+1)}, {},null,100000000n,37],
    ['activation wrong owner',{swapActive:false,swapActivation:owner(recipient)}, {},null,100000000n,37],
    ['zero fee division',{baseFee:0}, {},null,100000000n,4],
])await check(name,{...defaults,...changes},paymentSwap(s),asset,amount,{expectedError:error,value});
for(const asset of [null,jettonY])for(const active of [false,true]) {
    const o={...defaults,depositActive:active,depositActivation:time(NOW)};
    await check(`deposit ${asset===null?'TON':'jetton'} active=${active}`,o,deposit({}),asset,100000000n,{expectedState:state(o)});
}
await check('deposit future gate',{...defaults,depositActive:false,depositActivation:time(NOW+1)},deposit({}),null,100000000n,{expectedError:38});
await check('reward funding new slot',defaults,funding(NOW+100),jettonY,100000000n,{
    expectedState:state({...defaults,rewards:Dictionary.empty(Dictionary.Keys.Uint(2),inline).set(2,
        beginCell().storeUint(100,40).storeCoins(100000000n).storeVarUint(0,5).storeUint(NOW,40).endCell())})});
await check('reward asset not allowed',defaults,funding(NOW+100),jettonX,100000000n,{expectedError:42});
await check('reward deadline too far',defaults,funding(NOW+86401),jettonY,100000000n,{expectedError:43});
await check('reward zero duration',defaults,funding(NOW),jettonY,100000000n,{expectedError:44});
for(const [duration,amount,error]of [[150,499n,45],[150,500n,null],[0,100n,null],[100,1n,null]]) {
    const reward=b=>beginCell().storeUint(b.time,40).storeCoins(b.budget).storeVarUint(23n,5).storeUint(NOW,40).endCell();
    const old=Dictionary.empty(Dictionary.Keys.Uint(2),inline).set(2,reward({time:100,budget:1000n}));
    const o={...defaults,rewards:old};
    const expected=error===null?state({...o,rewards:Dictionary.empty(Dictionary.Keys.Uint(2),inline)
        .set(2,reward({time:Math.max(duration,100),budget:1000n+amount}))}):undefined;
    await check(`reward extension duration=${duration} amount=${amount}`,o,funding(NOW+duration),jettonY,amount,
        error===null?{expectedState:expected}:{expectedError:error});
}
const step=beginCell().storeAddress(addr(50)).storeCoins(3n).storeUint(NOW+100,40).storeMaybeRef(null).endCell();
for(const [x,y]of [[null,jettonY],[jettonX,null]])for(const direction of [true,false]) {
    const o={...defaults,x,y},asset=direction?x:y,s={next:step,partner:500,referrer:1000},amount=100000000n;
    const expected=swapExpectation(o,asset,amount,s);
    await check(`continued swap inputTON=${asset===null}`,o,paymentSwap(s),asset,amount,{expectedState:expected.state,expectedEvent:expected.event});
}
const invalidPayout={destination:null,rejectDestination:null,excesses:null};
const normalExpected=swapExpectation(defaults,null,100000000n,invalidPayout);
await check('normalize all three payout addresses',defaults,paymentSwap(),null,100000000n,
    {expectedState:normalExpected.state,expectedEvent:normalExpected.event,payoutOptions:invalidPayout});
await check('normalized rejection context',defaults,paymentSwap(),null,0n,{expectedError:47,payoutOptions:invalidPayout});
await check('payment unknown opcode',defaults,empty,null,1n,{expectedError:63,wrapped:false});
await check('payment known opcode truncated',defaults,beginCell().storeUint(0xc442500f,32).endCell(),null,1n,{expectedError:9,wrapped:false});
await check('payment trailing bits',defaults,beginCell().storeSlice(paymentSwap().beginParse()).storeBit(true).endCell(),null,1n,{expectedError:9,wrapped:false});
await check('payment trailing reference',defaults,beginCell().storeSlice(funding(NOW+1).beginParse()).storeRef(empty).endCell(),jettonY,1n,{expectedError:9,wrapped:false});
await check('payout trailing bits',defaults,paymentSwap(),null,1n,{expectedError:9,wrapped:false,
    payoutCell:beginCell().storeSlice(payout().beginParse()).storeBit(true).endCell()});
await check('config missing address', {...defaults,configCell:empty},paymentSwap(),null,1n,{expectedError:9});
await check('fees malformed', {...defaults,feesCell:empty},paymentSwap(),null,100000000n,{expectedError:9});
await check('extra malformed after swap state update', {...defaults,extraCell:empty},paymentSwap(),null,100000000n,{expectedError:9});
for(const status of [0,1]) {
    const o={...defaults,status},expected=swapExpectation(o,null,100000000n,{});
    await check('dispatcher preserves lifecycle state '+status,o,paymentSwap(),null,100000000n,
        {expectedState:expected.state,expectedEvent:expected.event});
}
const comparison={originalMethodHash:originalMethods.get(20).hash().toString('hex'),candidateMethodHash:candidateMethods.get(20).hash().toString('hex'),
    sameMethodCode:originalMethods.get(20).equals(candidateMethods.get(20))};
const proof={scope:'Byte-identical readable V2 method 20, including dictionary placement; isolated state/actions/outgoing amounts/gas and independent expectations. Whole Pool recovery pending',
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')])),comparison,isolatedComparison,cases};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,'CpmmPoolV2/processing-progress.json'),{
    ...proof,cases:cases.map(({before,after,...test})=>({...test,before:{exitCode:before.exitCode,dataHash:before.dataHash,gasUsed:before.gasUsed},
        after:{exitCode:after.exitCode,dataHash:after.dataHash,gasUsed:after.gasUsed}}))});
console.log('Pool payment dispatcher: '+cases.length+' message probes pass; exact method code='+comparison.sameMethodCode);
