import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {compareGetters,compareMessages,root} from './lib.mjs';
import {compileLegacyFunc,loadFuncSources} from './func-legacy.mjs';

// Independent wire/state builders and integer economic expectations. Executed
// peers are compiled from recovered source, never substituted with oracle BOCs.
export async function checkClassicVolatilePool(oracle,candidate,{revision=0}={}) {
 const project=path.resolve(root,'../reconstruction/dedust');
 const compile=async name=>{const entry=name+'/main.fc',r=await compileLegacyFunc({targets:[entry],sources:await loadFuncSources(project,entry)});assert.equal(r.status,'ok',r.message);return Cell.fromBoc(Buffer.from(r.codeBoc,'base64'))[0];};
 const blank=await compile('ClassicBlank'),wallet=await compile('ClassicLpWallet');
 const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(81),factory=addr(82),owner=addr(83),recipient=addr(84),stranger=addr(85),collector0=addr(86),collector1=addr(87);
 const empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell(),native=beginCell().storeUint(0,4).endCell();
 const jetton=n=>beginCell().storeUint(1,4).storeInt(0,8).storeBuffer(Buffer.alloc(32,n)).endCell();
 const asset1=jetton(88),other=jetton(89),Q=123n,VALUE=1000000000n,UNIT=10n**18n;
 const blockchain=await Blockchain.create(),config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
 const gp=config.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
 const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
 const fp=config.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);const lump=fp.loadUintBig(64),bitPrice=fp.loadUintBig(64),cellPrice=fp.loadUintBig(64);
 const fwd=(cells,bits)=>lump+((BigInt(cells)*cellPrice+BigInt(bits)*bitPrice+65535n)>>16n);
 const template=data=>contractAddress(0,{code:blank,data});
 const vaultDescriptor=(asset=native,f=factory,k=1)=>beginCell().storeAddress(f).storeUint(k,8).storeSlice(asset.beginParse()).endCell();
 const vault0=template(vaultDescriptor()),vault1=template(vaultDescriptor(asset1));
 const operator=kind=>template(beginCell().storeAddress(factory).storeUint(4,8).storeUint(kind,8).endCell());
 const descriptor=(stable=0,f=factory,k=2)=>beginCell().storeAddress(f).storeUint(k,8).storeBit(stable).storeSlice(native.beginParse()).storeSlice(asset1.beginParse()).endCell();
 const defaults={r0:1000000000n,r1:2000000000n,supply:1000000000n,fee0:700n,fee1:900n,fee:30,version:9,stable:0,p0:9,p1:9,c0:null,c1:null,scale0:UNIT*10n**9n,scale1:UNIT*10n**9n,startTime:0,legacyTail:false};
 const state=(patch={})=>{
  const o={...defaults,...patch},collectors=o.c0?beginCell().storeAddress(o.c0).storeAddress(o.c1).endCell():null;
  const config=beginCell().storeUint(o.p0,8).storeUint(o.p1,8).storeAddress(vault0).storeAddress(vault1).storeAddress(null).storeMaybeRef(collectors).endCell();
  const b=beginCell().storeRef(descriptor(o.stable)).storeRef(blank).storeRef(wallet).storeRef(config).storeUint(o.version,16).storeUint(o.fee,16)
   .storeCoins(o.supply).storeCoins(o.r0).storeCoins(o.r1).storeCoins(o.fee0).storeCoins(o.fee1).storeUint(o.scale0,128).storeUint(o.scale1,128);
  if(revision&&!o.legacyTail)b.storeUint(o.startTime,32);
  return b.endCell();
 };
 const addressCell=a=>beginCell().storeAddress(a).endCell(),int=n=>({type:'int',value:String(n)}),slice=c=>({type:'slice',cellHash:c.hash().toString('hex')}),cell=c=>({type:'cell',cellHash:c.hash().toString('hex')});
 const messages=[],getters=[];
 async function getter(method,args=[],{patch={},exit=0,expected,inspect}={}) {
  const [t]=await compareGetters(oracle,candidate,[{method,args}],{data:state(patch),address});assert.equal(t.sameObservedBehavior,true,'getter '+method);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.equal(t.before.exitCode,exit);
  if(expected)assert.deepEqual(t.before.stack,expected);if(inspect)inspect(t.before.stack);getters.push(t);
 }
 async function message(label,body,{patch={},from=owner,value=VALUE,exit=0,expectedPatch=patch,bounced=false,sends,inspect}={}) {
  const [t]=await compareMessages(oracle,candidate,[{label,body,from,value,bounced}],{data:state(patch),address,accurateStorageStats:body.bits.length>=32&&body.beginParse().loadUint(32)===650525367});assert.equal(t.sameObservedBehavior,true,label);assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');assert.equal(t.before.exitCode,exit,label+': exit');
  assert.equal(t.before.dataHash,state(expectedPatch).hash().toString('hex'),label+': storage');
  if(sends!==undefined)assert.equal(t.before.actions.length,sends,label+': actions');if(inspect)inspect(t.before);messages.push(t);
 }
 const expectSend=(actual,i,to,body,mode=0,amount)=>{
  const a=actual.actions[i];assert.equal(a.type,'sendMsg');assert.equal(a.mode,mode);assert.equal(a.outMsg.info.dest,to.toRawString());assert.equal(a.outMsg.body.cellHash,body.hash().toString('hex'));
  if(amount!==undefined)assert.equal(a.outMsg.info.value.coins,String(amount));else {const v=BigInt(a.outMsg.info.value.coins);assert.ok(v>0n&&v<VALUE,'bounded remaining TON');}
 };
 const payout=(amount,to,callback=null,query=Q)=>beginCell().storeUint(2907617013,32).storeUint(query,64).storeRef(descriptor()).storeCoins(amount).storeAddress(to).storeMaybeRef(callback).endCell();
 const parameters=(deadline=0,to=recipient,success=payload,failure=payload)=>beginCell().storeUint(deadline,32).storeAddress(to).storeAddress(owner).storeMaybeRef(success).storeMaybeRef(failure).endCell();
 const swap=(asset=native,amount=10000000n,minimum=0n,route=null,p=parameters(),proof=vaultDescriptor(asset))=>beginCell().storeUint(1643009069,32).storeUint(Q,64).storeRef(proof).storeCoins(amount).storeAddress(owner).storeBit(0).storeCoins(minimum).storeMaybeRef(route).storeRef(p).endCell();
 const depositProof=(f=factory,k=3)=>beginCell().storeAddress(f).storeUint(k,8).storeRef(beginCell().storeAddress(owner).storeBit(0).storeSlice(native.beginParse()).storeSlice(asset1.beginParse()).endCell()).endCell();
 const deposit=(a0=10000000n,a1=30000000n,minimum=0n,proof=depositProof(),success=payload,failure=payload)=>beginCell().storeUint(3043726744,32).storeUint(Q,64).storeRef(proof).storeAddress(owner).storeCoins(minimum)
  .storeRef(beginCell().storeSlice(native.beginParse()).storeCoins(a0).storeSlice(asset1.beginParse()).storeCoins(a1).endCell()).storeMaybeRef(success).storeMaybeRef(failure).endCell();
 const feeWithdrawal=(a0=100n,a1=200n)=>beginCell().storeUint(188915538,32).storeUint(Q,64).storeCoins(a0).storeAddress(owner).storeMaybeRef(payload).storeCoins(a1).storeAddress(recipient).storeMaybeRef(null).endCell();
 const setCollector=(asset=native,to=collector0)=>beginCell().storeUint(2880727869,32).storeUint(Q,64).storeSlice(asset.beginParse()).storeAddress(to).endCell();
 const requestPrice=(asset=native)=>beginCell().storeUint(1752418572,32).storeUint(Q,64).storeSlice(asset.beginParse()).endCell();
 const price=(n=3n,d=2n)=>beginCell().storeUint(172098648,32).storeUint(Q,64).storeUint(n,128).storeUint(d,128).storeMaybeRef(payload).endCell();
 const upgrade=(v=10,code=Cell.fromBoc(candidate)[0])=>beginCell().storeUint(444,32).storeUint(Q,64).storeUint(v,16).storeRef(code).endCell();

 for(const patch of [{},{version:0,fee:0,r0:0n,r1:0n,supply:0n},{version:65535,fee:9999,r0:(1n<<119n),r1:(1n<<119n)-1n,supply:(1n<<119n)}]) {
  const o={...defaults,...patch};
  for(const [id,values]of [[82320,[o.version]],[103723,[o.stable]],[96780,[o.fee,10000]],[106049,[o.p0,o.p1]],[111021,[o.scale0,o.scale1]],[112792,[o.fee0,o.fee1]],[65971,[o.r0,o.r1]]])await getter(id,[],{patch,expected:values.map(int)});
  await getter(118188,[],{patch,expected:[slice(native),slice(asset1)]});await getter(66722,[],{patch,expected:[slice(addressCell(null)),slice(addressCell(null))]});
 }
 await getter(66722,[],{patch:{c0:collector0,c1:collector1},expected:[slice(addressCell(collector0)),slice(addressCell(collector1))]});
 for(const own of [owner,stranger]) {
  const lpData=beginCell().storeCoins(0).storeAddress(own).storeAddress(address).storeRef(wallet).endCell();
  await getter(103289,[{type:'slice',cell:addressCell(own)}],{expected:[slice(addressCell(contractAddress(0,{code:wallet,data:lpData})))]});
 }
 for(const input of [native,asset1])for(const amount of [1n,10000000n,1000000000n])for(const fee of [0,30,9999]) {
  const same=input.equals(native),x=same?defaults.r0:defaults.r1,y=same?defaults.r1:defaults.r0,f=amount*BigInt(fee)/10000n,out=(amount-f)*y/(x+amount-f);
  await getter(70754,[{type:'slice',cell:input},amount],{patch:{fee},expected:[slice(same?asset1:native),int(out),int(f)]});
 }
 for(const amount of [0n,-1n])await getter(70754,[{type:'slice',cell:native},amount],{exit:292});
 await getter(70754,[{type:'slice',cell:other},1n],{exit:291});
 // Find the stable curve root by bisection, independently of the contract's
 // Newton iteration and its derivative. Allow one base unit for floor rounding.
 for(const input of [native,asset1])for(const amount of [1000000n,10000000n,500000000n]) {
  const first=input.equals(native),x=first?defaults.r0:defaults.r1,y=first?defaults.r1:defaults.r0,fee=amount*30n/10000n,newX=x+amount-fee;
  const invariant=(a,b)=>a*b*(a*a+b*b),k=invariant(x,y);let low=0n,high=y;
  while(high-low>1n){const mid=(low+high)/2n;if(invariant(newX,mid)<k)low=mid;else high=mid;}
  const expected=y-high;
  await getter(70754,[{type:'slice',cell:input},amount],{patch:{stable:1},inspect:stack=>{
   assert.deepEqual(stack[0],slice(first?asset1:native));assert.deepEqual(stack[2],int(fee));const actual=BigInt(stack[1].value);assert.ok(actual>=expected&&actual<=expected+1n,'stable polynomial root');
  }});
 }
 for(const [a,b,supply]of [[10000000n,30000000n,defaults.supply],[50000000n,2000000n,defaults.supply],[1n,1n,0n],[100000n,200000n,0n]]) {
  const used0=supply===0n?a:(a<b*defaults.r0/defaults.r1?a:b*defaults.r0/defaults.r1),used1=supply===0n?b:(b<a*defaults.r1/defaults.r0?b:a*defaults.r1/defaults.r0);
  const m0=supply*used0/defaults.r0,m1=supply*used1/defaults.r1,minted=supply===0n?(a>b?(a>99000n?a:99000n):(b>99000n?b:99000n)):(m0<m1?m0:m1);
  await getter(119877,[a,b],{patch:{supply},expected:[int(used0),int(used1),int(minted)]});
 }
 await getter(119877,[0n,1n],{exit:292});await getter(119877,[1n,0n],{exit:292});
 await getter(106029,[],{inspect:stack=>{
  assert.deepEqual(stack.slice(0,3),[int(defaults.supply),int(-1),slice(addressCell(null))]);assert.deepEqual(stack[4],cell(wallet));
  const uri=beginCell().storeUint(0,8).storeStringTail('https://api.dedust.io/v2/pools/'+address.toRawString()+'/metadata').endCell();
  const dict=Dictionary.empty(Dictionary.Keys.BigUint(256),Dictionary.Values.Cell());
  for(const [name,value]of [['uri',uri],['decimals',beginCell().storeUint(0,8).storeStringTail('9').endCell()],['symbol',beginCell().storeUint(0,8).storeStringTail('LP').endCell()]])dict.set(BigInt('0x'+createHash('sha256').update(name).digest('hex')),value);
  assert.deepEqual(stack[3],cell(beginCell().storeUint(0,8).storeDict(dict).endCell()));
 }});
 for(const asset of [native,asset1])for(const amount of [1n,10000000n]) {
  const first=asset.equals(native),x=first?defaults.r0:defaults.r1,y=first?defaults.r1:defaults.r0,fee=amount*30n/10000n,protocol=fee/5n,out=(amount-fee)*y/(x+amount-fee);
  const changed=first?{r0:x+amount-protocol,r1:y-out,fee0:defaults.fee0+protocol}:{r0:y-out,r1:x+amount-protocol,fee1:defaults.fee1+protocol};
  await message('swap direction '+first+' amount '+amount,swap(asset,amount),{from:template(vaultDescriptor(asset)),expectedPatch:changed,sends:2,inspect:a=>expectSend(a,1,first?vault1:vault0,payout(out,recipient,payload))});
 }
 for(const [label,p,minimum,exit,callback]of [['expired',parameters(1699999999),0n,305,payload],['minimum',parameters(),1000000000n,304,payload],['malformed parameters',empty,0n,9,null]]) {
  await message('failed swap '+label,swap(native,10000000n,minimum,null,p),{from:vault0,exit,sends:1,inspect:a=>expectSend(a,0,vault0,payout(10000000n,owner,callback))});
 }
 await message('uninitialized swap refunds full principal',swap(),{patch:{supply:0n},from:vault0,exit:294,sends:1,inspect:a=>expectSend(a,0,vault0,payout(10000000n,owner,payload))});
 await message('forged vault rejected before swap',swap(),{exit:264,sends:0});
 for(const proof of [vaultDescriptor(native,stranger),vaultDescriptor(native,factory,7)])await message('vault proof factory and kind bound',swap(native,1n,0n,null,parameters(),proof),{from:template(proof),exit:264,sends:0});
 const route=beginCell().storeAddress(stranger).storeBit(1).storeCoins(7).storeMaybeRef(payload).endCell(),fee=10000000n*30n/10000n,out=(10000000n-fee)*defaults.r1/(defaults.r0+10000000n-fee);
 const routedBody=beginCell().storeUint(1923917994,32).storeUint(Q,64).storeRef(descriptor()).storeSlice(asset1.beginParse()).storeCoins(out).storeAddress(owner).storeBit(1).storeCoins(7).storeMaybeRef(payload).storeRef(parameters()).endCell();
 await message('route forwards output asset and original parameters',swap(native,10000000n,0n,route),{from:vault0,expectedPatch:{r0:defaults.r0+10000000n-fee/5n,r1:defaults.r1-out,fee0:defaults.fee0+fee/5n},sends:2,inspect:a=>expectSend(a,1,stranger,routedBody)});
 for(const [a,b,minimum,supply]of [[10000000n,30000000n,0n,defaults.supply],[1n,1n,0n,0n],[10000000n,30000000n,1000000000n,defaults.supply]]) {
  const used0=supply===0n?a:(a<b*defaults.r0/defaults.r1?a:b*defaults.r0/defaults.r1),used1=supply===0n?b:(b<a*defaults.r1/defaults.r0?b:a*defaults.r1/defaults.r0);
  const minted=supply===0n?99000n:(supply*used0/defaults.r0<supply*used1/defaults.r1?supply*used0/defaults.r0:supply*used1/defaults.r1),ok=minted>=minimum;
  await message('liquidity '+a+','+b+' minimum '+minimum,deposit(a,b,minimum),{patch:{supply},from:template(depositProof()),expectedPatch:ok?{r0:defaults.r0+used0,r1:defaults.r1+used1,supply:(supply||1000n)+minted}:{supply},sends:ok?3:1,inspect:actual=>{
   if(!ok){expectSend(actual,0,template(depositProof()),beginCell().storeUint(3785583828,32).storeUint(Q,64).storeRef(descriptor()).storeMaybeRef(payload).endCell());return;}
   expectSend(actual,1,template(depositProof()),beginCell().storeUint(2867302998,32).storeUint(Q,64).storeRef(descriptor()).storeCoins(used0).storeCoins(used1).endCell());
   const data=beginCell().storeCoins(0).storeAddress(owner).storeAddress(address).storeRef(wallet).endCell(),init={code:wallet,data},a=actual.actions[2];
   assert.equal(a.outMsg.info.dest,contractAddress(0,init).toRawString());assert.equal(a.outMsg.init.code.cellHash,wallet.hash().toString('hex'));assert.equal(a.outMsg.init.data.cellHash,data.hash().toString('hex'));
  }});
 }
 await message('deposit authentication',deposit(),{exit:272,sends:0});
 for(const proof of [depositProof(stranger),depositProof(factory,7)])await message('deposit proof factory and kind bound',deposit(1n,1n,0n,proof),{from:template(proof),exit:272,sends:0});
 const walletData=beginCell().storeCoins(0).storeAddress(owner).storeAddress(address).storeRef(wallet).endCell(),lpAddress=contractAddress(0,{code:wallet,data:walletData});
 const burn=(amount=50000000n)=>beginCell().storeUint(2078119902,32).storeUint(Q,64).storeCoins(amount).storeAddress(owner).storeAddress(recipient).endCell();
 for(const amount of [0n,50000000n,defaults.supply]) {
  const a0=defaults.r0*amount/defaults.supply,a1=defaults.r1*amount/defaults.supply;
  await message('LP burn '+amount,burn(amount),{from:lpAddress,expectedPatch:{r0:defaults.r0-a0,r1:defaults.r1-a1,supply:defaults.supply-amount},sends:3,inspect:a=>{expectSend(a,1,vault0,payout(a0,owner));expectSend(a,2,vault1,payout(a1,owner));}});
 }
 await message('LP burn canonical wallet authority',burn(),{exit:257,sends:0});
 await message('LP burn reserve underflow rollback',burn(defaults.supply+1n),{from:lpAddress,exit:5,sends:0});
 for(const [a0,a1]of [[0n,0n],[100n,200n],[700n,900n]])await message('withdraw fee split '+a0+','+a1,feeWithdrawal(a0,a1),{from:operator(3),expectedPatch:{fee0:defaults.fee0-a0,fee1:defaults.fee1-a1},sends:Number(a0>0n)+Number(a1>0n),inspect:a=>{
  let i=0;if(a0>0n)expectSend(a,i++,vault0,payout(a0,owner,payload),1,(VALUE-30000000n)/2n);if(a1>0n)expectSend(a,i,vault1,payout(a1,recipient),1,(VALUE-30000000n)/2n);
 }});
 await message('fee withdrawal authority',feeWithdrawal(),{exit:296,sends:0});await message('fee withdrawal bounds',feeWithdrawal(701n),{from:operator(3),exit:293,sends:0});
 for(const fee of [0,9999])await message('fee update '+fee,beginCell().storeUint(3222612351,32).storeUint(Q,64).storeUint(fee,16).endCell(),{from:operator(4),expectedPatch:{fee},sends:0});
 await message('fee update upper bound',beginCell().storeUint(3222612351,32).storeUint(Q,64).storeUint(10000,16).endCell(),{from:operator(4),exit:279,sends:0});
 await message('collector setter',setCollector(),{from:operator(8),expectedPatch:{c0:collector0,c1:null},sends:0});
 await message('collector second asset',setCollector(asset1,collector1),{patch:{c0:collector0,c1:null},from:operator(8),expectedPatch:{c0:collector0,c1:collector1},sends:0});
 await message('collector unknown asset',setCollector(other),{from:operator(8),exit:288,sends:0});
 await message('missing collector',requestPrice(),{from:operator(7),exit:289,sends:0});
 await message('price query body',requestPrice(),{patch:{c0:collector0,c1:collector1},from:operator(7),sends:1,inspect:a=>expectSend(a,0,collector0,beginCell().storeUint(2911080767,32).storeUint(Q,64).storeMaybeRef(null).endCell(),64,0n)});
 await message('authenticated price response',price(),{patch:{c0:collector0,c1:collector1},from:collector0,expectedPatch:{c0:collector0,c1:collector1,scale0:defaults.scale0*3n/2n},sends:0});
 await message('price response rejects unknown sender',price(),{patch:{c0:collector0,c1:collector1},exit:290,sends:0});
 await message('price response division zero rollback',price(3n,0n),{patch:{c0:collector0,c1:collector1},from:collector1,exit:4,sends:0});
 for(const include of [0,1]) {
  const response=beginCell().storeUint(3185396052,32).storeUint(Q,64).storeCoins(defaults.r0).storeCoins(defaults.r1).storeCoins(defaults.supply)
   .storeMaybeRef(include?beginCell().storeSlice(native.beginParse()).storeSlice(asset1.beginParse()).endCell():null).endCell();
  await message('public state response assets '+include,beginCell().storeUint(1847882381,32).storeUint(Q,64).storeInt(include?-1:0,1).endCell(),{sends:1,inspect:a=>expectSend(a,0,owner,response)});
 }
 await message('public state budget shortfall',beginCell().storeUint(1847882381,32).storeUint(Q,64).storeBit(0).endCell(),{value:gas(9366)+fwd(3,1710)-1n,exit:263,sends:0});
 await message('TON withdrawal',beginCell().storeUint(650525367,32).storeUint(Q,64).storeAddress(recipient).endCell(),{from:operator(9),sends:2,inspect:a=>{assert.equal(a.actions[0].type,'reserve');assert.equal(a.actions[0].currency.coins,'100000000');expectSend(a,1,recipient,empty,128,0n);}});
 for(const v of [0,8,9])await message('nonincreasing upgrade '+v,upgrade(v),{from:factory,sends:0});
 await message('self upgrade invokes installed zero-argument hook',upgrade(10),{from:factory,expectedPatch:{version:10},sends:1,inspect:a=>assert.deepEqual(a.actions[0],{type:'setCode',newCode:{cellHash:Cell.fromBoc(candidate)[0].hash().toString('hex')}})});
 await message('upgrade authentication before parsing',beginCell().storeUint(444,32).endCell(),{exit:259,sends:0});
 await message('bounced message',empty,{bounced:true,sends:0});await message('unknown message',beginCell().storeUint(42,32).endCell(),{exit:65535,sends:0});
 for(const [op,from]of [[1643009069,vault0],[1923917994,owner],[3043726744,owner],[2078119902,owner],[1847882381,owner],[188915538,operator(3)],[1752418572,operator(7)],[172098648,collector0],[444,factory],[3222612351,operator(4)],[2880727869,operator(8)],[650525367,operator(9)]])await message('truncated query '+op,beginCell().storeUint(op,32).storeUint(0,63).endCell(),{from,exit:9,sends:0});
 for(const [body,from]of [[swap(),vault0],[deposit(),template(depositProof())],[feeWithdrawal(),operator(3)],[setCollector(),operator(8)],[requestPrice(),operator(7)],[price(),collector0],[upgrade(),factory]])await message('strict body tail '+body.beginParse().loadUint(32),beginCell().storeSlice(body.beginParse()).storeBit(1).endCell(),{from,exit:9,sends:0});
 await message('fee update preserves permissive legacy tail',beginCell().storeUint(3222612351,32).storeUint(Q,64).storeUint(123,16).storeBit(1).endCell(),{from:operator(4),expectedPatch:{fee:123},sends:0});
 await getter(43092,[],{expected:[]});
 const installation=beginCell().storeUint(2604311546,32).storeUint(Q,64).storeRef(blank).storeUint(9,16).storeRef(Cell.fromBoc(candidate)[0]).storeUint(30,16).storeRef(wallet).storeUint(9,8).storeUint(9,8).endCell();
 const [ctor]=await compareMessages(await fs.readFile(path.join(project,'oracles/ClassicBlank.boc')),blank.toBoc(),[{label:'Blank installs Pool with canonical state',body:installation,from:factory}],{data:descriptor(),address,accurateStorageStats:true});
 assert.equal(ctor.sameObservedBehavior,true);assert.equal(ctor.before.exitCode,0);assert.equal(ctor.before.dataHash,state({r0:0n,r1:0n,supply:0n,fee0:0n,fee1:0n}).hash().toString('hex'));assert.equal(ctor.before.newCodeHash,Cell.fromBoc(candidate)[0].hash().toString('hex'));messages.push(ctor);
 if(revision) {
  const pause=(timestamp,tail=false)=>{const b=beginCell().storeUint(2128082638,32).storeUint(Q,64).storeUint(timestamp,32);if(tail)b.storeBit(1);return b.endCell();};
  for(const startTime of [0,1699999999,1700000000,1700000001,0xffffffff])await getter(112861,[],{patch:{startTime},expected:[int(startTime)]});
  await getter(112861,[],{patch:{legacyTail:true},expected:[int(0)]});
  await getter(70754,[{type:'slice',cell:native},10000000n],{patch:{startTime:0xffffffff},expected:[slice(asset1),int(out),int(fee)]});
  for(const startTime of [1700000001,0xffffffff])await message('time gate refunds full principal '+startTime,swap(),{patch:{startTime},from:vault0,exit:306,sends:1,inspect:a=>expectSend(a,0,vault0,payout(10000000n,owner,payload))});
  for(const startTime of [1699999999,1700000000])await message('swap begins at timestamp boundary '+startTime,swap(),{patch:{startTime},from:vault0,expectedPatch:{startTime,r0:defaults.r0+10000000n-fee/5n,r1:defaults.r1-out,fee0:defaults.fee0+fee/5n},sends:2});
  for(const startTime of [0,1700000001,0xffffffff])await message('operator sets start time '+startTime,pause(startTime),{from:operator(10),expectedPatch:{startTime},sends:0});
  await message('time setter authority before parsing',beginCell().storeUint(2128082638,32).endCell(),{exit:296,sends:0});
  await message('time setter uint32 underflow',beginCell().storeUint(2128082638,32).storeUint(Q,64).storeUint(0,31).endCell(),{from:operator(10),exit:9,sends:0});
  await message('time setter preserves permissive tail',pause(5,true),{from:operator(10),expectedPatch:{startTime:5},sends:0});
  await message('repeated time setter revision '+revision,pause(0),{patch:{startTime:1700000001},from:operator(10),exit:revision===8?307:0,expectedPatch:{startTime:revision===8?1700000001:0},sends:0});
  await message('legacy data gains timestamp on first save',pause(7),{patch:{legacyTail:true},from:operator(10),expectedPatch:{startTime:7},sends:0});
  const timedInstall=beginCell().storeSlice(installation.beginParse()).storeUint(1700000001,32).endCell();
  const [timed]=await compareMessages(await fs.readFile(path.join(project,'oracles/ClassicBlank.boc')),blank.toBoc(),[{label:'Blank installs Pool with explicit swap start time',body:timedInstall,from:factory}],{data:descriptor(),address,accurateStorageStats:true});
  assert.equal(timed.sameObservedBehavior,true);assert.equal(timed.before.exitCode,0);assert.equal(timed.before.dataHash,state({r0:0n,r1:0n,supply:0n,fee0:0n,fee1:0n,startTime:1700000001}).hash().toString('hex'));messages.push(timed);
 }
 return {getters,messages};
}

export const checkClassicPoolV8=(oracle,candidate)=>checkClassicVolatilePool(oracle,candidate,{revision:8});
export const checkClassicPoolV9=(oracle,candidate)=>checkClassicVolatilePool(oracle,candidate,{revision:9});
