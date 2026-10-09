import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Address,Cell,Dictionary,beginCell,external,internal,loadMessageRelaxed} from '@ton/core';
import {Blockchain,SmartContract} from '@ton/sandbox';
import {keyPairFromSeed,sign} from '@ton/crypto';
import {compareGetters,compareMessages} from './lib.mjs';
import {compileTolk} from './tolk.mjs';

// These schemas and expectations are independent of the reconstructed source.
const inlineCell={serialize(value,b){b.storeSlice(value.beginParse());},parse(s){return s.asCell();}};
const dict=entries=>{if(!entries.length)return null;const d=Dictionary.empty(Dictionary.Keys.BigUint(64),inlineCell);for(const [k,v]of entries)d.set(BigInt(k),v);return beginCell().storeDictDirect(d).endCell();};
const coin=n=>beginCell().storeCoins(n).endCell(),ack=n=>beginCell().storeUint(n,64).endCell();
const maybe=(b,c)=>b.storeMaybeRef(c);
const empty=beginCell().endCell(),Q=123n,ID=17,SEQ=5;
const keys=keyPairFromSeed(Buffer.alloc(32,7)),publicKey=BigInt('0x'+keys.publicKey.toString('hex'));
const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(131),sender=addr(132),recipient=addr(133);
const state=({programs=null,amounts=null,retries=null,acks=null,version=1,walletId=ID,seqno=SEQ,key=publicKey,hook=empty}={})=>beginCell()
 .storeUint(version,8).storeUint(walletId,32).storeUint(seqno,32).storeUint(key,256)
 .storeRef(beginCell().storeMaybeRef(programs).storeMaybeRef(amounts).storeMaybeRef(retries).storeMaybeRef(acks).endCell()).storeRef(hook).endCell();
const recipe=(kind,first=0,second=0,left=null,right=null)=>beginCell().storeUint(kind,4).storeUint(first,4).storeUint(second,4)
 .storeMaybeRef(null).storeMaybeRef(left).storeMaybeRef(right).endCell();
const cellArg=c=>c===null?{type:'null'}:{type:'cell',cell:c},sliceArg=c=>({type:'slice',cell:c});
const value=c=>c===null?{type:'null'}:{type:'cell',cellHash:c.hash().toString('hex')};
const header=(op,q=Q)=>beginCell().storeUint(op,32).storeUint(q,64);
const ackBody=q=>header(0xbeaf9617,q).endCell();
const request=({seqno=SEQ,batch=0,retry=false,hookArg=0,mode=3,ton=100000000n,trade=0n,query=Q,program=null,overrides=null,tag=19,refFlag=1,body=empty,key=keys,ignored=0}={})=>{
 const item=beginCell().storeAddress(recipient).storeCoins(ton).storeCoins(trade).storeUint(refFlag,1).storeRef(body)
  .storeMaybeRef(overrides).storeUint(query,64).storeMaybeRef(program).endCell();
 const signed=beginCell().storeUint(seqno,32).storeUint(ignored,32).storeUint(batch,32).storeBit(retry).storeUint(hookArg,16).storeUint(mode,8)
  .storeUint(ignored,32).storeUint(tag,32).storeRef(item).endCell();
 return beginCell().storeBuffer(sign(signed.hash(),key.secretKey)).storeSlice(signed.beginParse()).endCell();
};

export async function checkX1000(oracle,candidate){
 const getters=[],messages=[];
 async function get(label,method,args,expected,{data=state(),exit=0}={}){
  const [t]=await compareGetters(oracle,candidate,[{method,args}],{data,address});
  assert.equal(t.sameObservedBehavior,true,label);assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');
  assert.equal(t.before.exitCode,exit,label+': exit');if(exit===0)assert.deepEqual(t.before.stack,expected,label+': independent result');getters.push({...t,label});
 }
 async function message(label,body,{data=state(),expected=data,from=sender,bounced=false,exit=0,sends=[],valueCoins=1000000000n}={}){
  const [t]=await compareMessages(oracle,candidate,[{label,body,from,bounced,value:valueCoins}],{data,address});
  assert.equal(t.sameObservedBehavior,true,label);assert.equal(t.before.gasUsed,t.after.gasUsed,label+': gas');
  assert.equal(t.before.exitCode,exit,label+': exit');assert.equal(t.before.dataHash,expected.hash().toString('hex'),label+': storage');
  assert.equal(t.before.actions.length,sends.length,label+': actions');
  sends.forEach((want,i)=>{const a=t.before.actions[i];assert.equal(a.type,'sendMsg');assert.equal(a.mode,want.mode);
   assert.equal(a.outMsg.body.cellHash,want.body.hash().toString('hex'));if(want.to)assert.equal(a.outMsg.info.dest,want.to.toRawString());
   if(want.coins!==undefined)assert.equal(a.outMsg.info.value.coins,String(want.coins));});messages.push(t);
 }
 const int=n=>({type:'int',value:String(n)});
 for(const version of [0,1,2])for(const populated of [false,true]){
  const p=populated?dict([[Q,recipe(0)]]):null,a=populated?dict([[Q,coin(7n)]]):null,r=populated?dict([[Q,beginCell().storeRef(empty).endCell()]]):null;
  const data=state({version,programs:p,amounts:a,retries:r});
  for(const [id,n]of [[95507,version],[97027,ID],[85143,SEQ],[91459,SEQ],[89828,BigInt('0x'+empty.hash().toString('hex'))],
   [85802,populated?0:-1],[118999,populated?0:-1],[98121,populated?0:-1],[94056,populated?0:-1],[97376,populated?1:0]])
   await get('storage getter '+id+' version='+version+' populated='+populated,id,id===97376?[Q]:[],[int(n)],{data,exit:version!==1&&id!==95507?104:0});
 }
 await get('wallet balance',83648,[],[int(10000000000n)]);
 await get('missing query',97376,[Q+1n],[int(0)],{data:state({programs:dict([[Q,recipe(0)]])})});
 for(const count of [0,1,10,11,12]){const queue=dict(Array.from({length:count},(_,i)=>[i,ack(i+100)]));await get('ack queue cap '+count,3,[cellArg(queue)],[value(count>10?null:queue)]);}
 for(const n of [0,31,127,128,159]){const b=beginCell().storeUint(0,n).endCell();await get('short/invalid bounce '+n,5,[sliceArg(b)],[int(0),int(0)]);}
 await get('valid bounce query',5,[sliceArg(beginCell().storeUint(0xffffffff,32).storeUint(42,32).storeUint(Q,64).endCell())],[int(Q),int(1)]);
 for(const q of [0n,Q,(1n<<64n)-1n])for(const response of [null,sender]){
  const responseArg=response?sliceArg(beginCell().storeAddress(response).endCell()):{type:'null'};
  const transfer=header(0xf8a7ea5,q).storeCoins(700n).storeAddress(recipient).storeAddress(response).storeMaybeRef(null).storeCoins(200000000n).storeMaybeRef(empty).endCell();
  await get('jetton transfer body q='+q+' response='+Boolean(response),2,[q,700n,sliceArg(beginCell().storeAddress(recipient).endCell()),responseArg,cellArg(null),200000000n,cellArg(empty)],[value(transfer)]);
 }
 const methodByKind=[12,13,21,22,20,18,14,15,16,17,19,9,10,11];
 const untouched=recipe(15),pOther=dict([[Q+9n,untouched]]),aOther=dict([[Q+9n,coin(900n)]]),rOther=dict([[Q+9n,beginCell().storeRef(empty).endCell()]]);
 for(const [kind,method]of methodByKind.entries()){
  const p=dict([[Q,recipe(kind)],[Q+9n,untouched]]),a=dict([[Q,coin(77n)],[Q+9n,coin(900n)]]),r=dict([[Q,beginCell().storeRef(empty).endCell()],[Q+9n,beginCell().storeRef(empty).endCell()]]);
  await get('protocol '+kind+' cleanup',method,[1000000000n,42,Q,sliceArg(beginCell().storeSlice(recipe(kind).beginParse().skip(4)).endCell()),cellArg(p),cellArg(a),cellArg(r),sliceArg(empty)],[value(pOther),value(aOther),value(rOther)]);
  await message('internal protocol '+kind+' cleanup',header(42).endCell(),{data:state({programs:p,amounts:a,retries:r,acks:dict([[Q,ack(777n)]])}),expected:state({programs:pOther,amounts:aOther,retries:rOther}),sends:[{mode:0,body:ackBody(777n)}]});
  const instruction=beginCell().storeCoins(17n).endCell(),leg=beginCell().storeUint(15,4).storeUint(0,4).storeUint(0,4).storeMaybeRef(instruction).endCell();
  for(const [first,second]of [[0,1],[1,0],[1,1],[0,0]]){
   const program=recipe(kind,first,second,leg,leg),programs=dict([[Q,program]]),amounts=dict([[Q,coin(77n)]]);
   const body=header(42).endCell();await message('protocol '+kind+' unknown opcode modes='+first+second,body,{data:state({programs,amounts})});
  }
  const primary=[0xd53276db,0x7362d09c,0x7362d09c,0xd53276db,0x7362d09c,0x7362d09c,0x7362d09c,0x7362d09c,0x7362d09c,0x7362d09c,0x7362d09c,0x7362d09c,0xd53276db,0xd53276db][kind];
  const program=recipe(kind,0,1,leg,leg),programs=dict([[Q,program]]),amounts=dict([[Q,coin(77n)]]);
  const nextPrograms=dict([[Q,program],[Q+1n,leg]]);
  await message('protocol '+kind+' accepted callback advances recipe',header(primary).storeCoins(77n).endCell(),{
   data:state({programs,amounts,acks:dict([[Q,ack(777n)]])}),expected:state({programs:nextPrograms,amounts,acks:dict([[Q+1n,ack(777n)]])})});
 }
 await message('empty body bypasses malformed storage',empty,{data:empty});
 await message('version check',header(42).endCell(),{data:state({version:2}),exit:104});
 for(const bounced of [false,true])await message('short body bounced='+bounced,beginCell().storeUint(7,31).endCell(),{bounced,exit:bounced?0:9});
 const tracked=state({acks:dict([[Q,ack(777n)]])});
 await message('bounce acknowledges tracked query',beginCell().storeUint(0xffffffff,32).storeUint(42,32).storeUint(Q,64).endCell(),{bounced:true,data:tracked,expected:state(),sends:[{mode:0,body:ackBody(777n)}]});
 await message('unknown normal query acknowledges',header(42).endCell(),{data:tracked,expected:state(),sends:[{mode:0,body:ackBody(777n)}]});
 const helperHex='9FF1C20FAD211DB1A2CF8EB1F9ADFE00FDBAE1DA1D95045A3F286262FC347B25835';
 const helper=beginCell().storeUint(BigInt('0x'+helperHex)>>1n,helperHex.length*4-1).endCell().beginParse().loadAddress();
 const retryBody=header(0xface).endCell(),outgoing=beginCell().storeUint(0x18,6).storeAddress(recipient).storeCoins(100000000n).storeUint(1,107).storeRef(retryBody).endCell();
 const retries=dict([[Q,beginCell().storeRef(outgoing).endCell()]]);
 await message('retry rejects unrelated sender',header(0x01010202).endCell(),{data:state({retries}),exit:555});
 await message('retry missing query',header(0x01010202).endCell(),{from:helper,exit:103});
 await message('retry consumes stored send',header(0x01010202).endCell(),{from:helper,data:state({retries}),expected:state(),sends:[{mode:3,to:recipient,coins:100000000n,body:retryBody}]});
 const tokenWallet=addr(134),vault=addr(135),swapAsset=addr(136);
 const swapParameters=beginCell().storeCoins(0n).storeCoins(17n)
  .storeRef(beginCell().storeAddress(sender).storeAddress(tokenWallet).endCell())
  .storeRef(beginCell().storeAddress(vault).storeAddress(swapAsset).endCell()).endCell();
 const tradeLeg=beginCell().storeUint(1,4).storeUint(1,4).storeUint(0,4).storeMaybeRef(swapParameters).endCell();
 const tradeProgram=recipe(1,0,1,null,tradeLeg),programs=dict([[Q,tradeProgram]]);
 const swapStep=beginCell().storeUint(0,32).storeAddress(null).storeAddress(null).storeMaybeRef(null).storeMaybeRef(null).endCell();
 const swap=beginCell().storeUint(0xe3a0d482,32).storeAddress(swapAsset).storeBit(0).storeCoins(17n).storeMaybeRef(null).storeRef(swapStep).endCell();
 const transfer=header(0xf8a7ea5,Q+1n).storeCoins(77n).storeAddress(vault).storeAddress(sender).storeMaybeRef(null).storeCoins(200000000n).storeMaybeRef(swap).endCell();
 await message('real DeDust jetton-swap leg serializes transfer',header(0x7362d09c).storeCoins(77n).endCell(),{
  data:state({programs}),expected:state({programs:dict([[Q,tradeProgram],[Q+1n,tradeLeg]]),amounts:dict([[Q+1n,coin(77n)]])}),
  sends:[{mode:3,to:tokenWallet,coins:250000000n,body:transfer}]});

 const hookSource=await fs.readFile('../reconstruction/tests/fixtures/x1000-amount-hook.tolk','utf8');
 const compiled=await compileTolk({sources:{'main.tolk':hookSource}});assert.equal(compiled.status,'ok',compiled.message);const hook=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0];
 async function signed(label,options={},checks={}){
  const body=request(options),data=checks.data??state({hook}),results=[];
  for(const boc of [oracle,candidate]){
   const chain=await Blockchain.create();chain.now=1700000000;chain.verbosity={print:false,blockchainLogs:false,vmLogs:'none',debugLogs:false};
   if(checks.chainContext)chain.prevBlocks={lastMcBlocks:[],prevKeyBlock:{workchain:-1,shard:0n,seqno:1,rootHash:Buffer.alloc(32),fileHash:Buffer.alloc(32)}};
   const c=SmartContract.create(chain,{address,code:Cell.fromBoc(boc)[0],data,balance:10000000000n});
   try{const tx=await c.receiveMessage(external({to:address,body}),{now:1700000000,randomSeed:Buffer.alloc(32,1)}),d=tx.description;
    const st=c.accountState?.type==='active'?c.accountState.state.data:null;results.push({exit:d.computePhase.exitCode,gas:String(d.computePhase.gasUsed),data:st?.hash().toString('hex')??null,
     actions:(tx.outActions??[]).map(a=>({type:a.type,mode:a.mode,body:a.outMsg?.body.hash().toString('hex'),to:a.outMsg?.info.dest?.toRawString(),coins:a.outMsg?.info.value?.coins?.toString()}))});
   }catch(e){if(e.exitCode===undefined)throw e;results.push({exit:e.exitCode,data:c.accountState.state.data.hash().toString('hex'),actions:[]});}
  }
  assert.deepEqual(results[0],results[1],label+': differential including gas');const a=results[0];assert.equal(a.exit,checks.exit??0,label+': exit');
  if((checks.exit??0)!==0)assert.equal(a.data,data.hash().toString('hex'),label+': rejected request state');
  else{
   const program=options.program??null,query=options.query??Q,mode=options.mode??3;
   const needed=!(program===null&&(options.ton??100000000n)===0n&&[128,160].includes(mode));
   const expected=state({hook,seqno:SEQ+1,acks:needed?dict([[query,ack(query)]]):null,
    programs:program===null?null:dict([[query,program]]),amounts:program&&(options.trade??0n)>0n?dict([[query,coin(options.trade)]]):null,
    retries:program&&options.retry?dict([[query,empty]]):null});
   assert.equal(a.data,mode===160?null:expected.hash().toString('hex'),label+': independently encoded state');
   assert.equal(a.actions.length,(options.batch??0)+1+(needed?1:0),label+': action count');
   const send=a.actions[options.batch??0];assert.equal(send.to,recipient.toRawString());assert.equal(send.mode,mode);
   assert.equal(send.coins,String(checks.expectedTon??options.ton??100000000n),label+': TON');assert.equal(send.body,(options.body??empty).hash().toString('hex'));
  }
  messages.push({label,type:'external-in',sameObservedBehavior:true,before:results[0],after:results[1]});
 }
 await signed('signed ordinary send');await signed('signed batch of three',{batch:3});
 await signed('wrong sequence',{seqno:SEQ+1},{exit:102});await signed('wrong signer',{key:keyPairFromSeed(Buffer.alloc(32,8))},{exit:555});
 await signed('bad referenced-body flag',{refFlag:0},{exit:555});await signed('ignored legacy words',{ignored:0xfeed});
 for(const mode of [128,160])await signed('untracked all-balance mode '+mode,{mode,ton:0n});
 await signed('track and queue trade',{program:recipe(0),trade:77n,retry:true});
 await signed('chain-context amount hook',{hookArg:7},{chainContext:true,expectedTon:100000007n});
 await signed('chain-context hook disabled',{}, {chainContext:true});
 return {getters,messages};
}
