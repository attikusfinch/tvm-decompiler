import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Address,ExternalAddress,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadTolkSources,compileTolk} from './tolk.mjs';

export const checkUranusMemeV3=(o,c)=>checkUranusMeme(o,c,3);
export const checkUranusMemeV2=(o,c)=>checkUranusMeme(o,c,2);

// Independent integer arithmetic and wire serialization. Dependencies are freshly
// compiled editable sources; frozen library BOCs only verify their identities.
export async function checkUranusMeme(oracle,candidate,version=3) {
    assert.ok(version===2||version===3);
    const project=path.resolve(root,'../reconstruction/dedust'),libs=Dictionary.empty(Dictionary.Keys.Buffer(32),Dictionary.Values.Cell()),codes={};
    for(const family of ['UranusMemeWalletV'+version,'CpmmAffiliateAccount','CpmmPoolV'+(version===3?2:1)]) {
        const compiled=await compileTolk({sources:await loadTolkSources(project,family+'/main.tolk')});assert.equal(compiled.status,'ok',compiled.message);
        const code=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0];assert.ok(code.equals(Cell.fromBoc(await fs.readFile(path.join(project,'oracles',family+'.boc')))[0]));
        codes[family]=code;libs.set(code.hash(),code);
    }
    const libraries=beginCell().storeDictDirect(libs).endCell(),addr=n=>new Address(0,Buffer.alloc(32,n));
    const address=addr(131),creator=addr(132),controller=addr(133),owner=addr(134),receiver=addr(135),partnerOwner=addr(136),stranger=addr(137);
    const authority=Address.parse('EQDDszIM08Ycwx8ycvz5Mn_hQdPj38FtG9bp0XQYw0j5E5D1'),Q=123n,BALANCE=10000000000n,VALUE=2000000000n;
    const empty=beginCell().endCell(),metadata=beginCell().storeStringTail('https://example.invalid/meme.json').endCell();
    const library=code=>beginCell().storeUint(2,8).storeBuffer(code.hash()).endCell({exotic:true});
    const walletCode=library(codes['UranusMemeWalletV'+version]),poolCode=library(codes['CpmmPoolV'+(version===3?2:1)]);
    const walletData=o=>beginCell().storeCoins(0).storeAddress(o).storeAddress(address).endCell();
    const walletInit=o=>({splitDepth:8,code:walletCode,data:walletData(o)});
    const wallet=o=>new Address(0,Buffer.concat([o.hash.subarray(0,1),contractAddress(0,walletInit(o)).hash.subarray(1)]));
    const affiliate=(id,share)=>beginCell().storeUint(id,256).storeUint(share,16).endCell();
    const partner=affiliate(17n,500),referrer=affiliate(19n,8000);
    const defaults={initialized:true,migrated:false,graduated:false,alpha:867796610169491525n,beta:373728813559n,onSell:800000000000000000n,raised:0n,current:0n,
        total:1000000000000000000n,creatorFee:1234567n,partnerFee:2345678n,baseFee:300,partnerShare:400,raising:1000000000000n,liquidity:200000000000000000n,
        poolShare:400,poolFee:50,seed:17n};
    const cfg=o=>beginCell().storeAddress(creator).storeAddress(controller).storeRef(metadata).storeCoins(o.raising).storeCoins(o.liquidity).storeUint(o.seed,128).endCell();
    const migration=o=>beginCell().storeAddress(partnerOwner).storeUint(o.poolShare,16).storeUint(o.poolFee,16).storeAddress(creator).endCell();
    const state=(patch={})=>{const o={...defaults,...patch},b=beginCell().storeBit(o.initialized).storeBit(o.migrated).storeRef(cfg(o)).storeUint(o.baseFee,16)
        .storeBit(o.graduated).storeCoins(o.alpha).storeCoins(o.beta).storeCoins(o.onSell).storeCoins(o.raised).storeCoins(o.current).storeCoins(o.total)
        .storeCoins(o.creatorFee);if(version===3)b.storeCoins(o.partnerFee).storeUint(o.partnerShare,16).storeRef(migration(o));return b.endCell();};
    function poolState(o) {
        const values={serialize(c,b){b.storeSlice(c.beginParse());},parse(s){return beginCell().storeSlice(s).endCell();}};
        const wallets=Dictionary.empty(Dictionary.Keys.Uint(2),values);
        wallets.set(0,beginCell().storeAddress(address).storeUint(0x127500,40).endCell());
        wallets.set(1,beginCell().storeAddress(null).storeUint(0x127500,40).endCell());
        const token=beginCell().storeUint(2,8).storeAddress(address).endCell();
        const config=beginCell().storeAddress(null).storeAddress(address).storeAddress(version===3?partnerOwner:creator).storeUint(version===3?o.poolFee:o.baseFee,16).storeUint(version===3?o.poolShare:0,16)
            .storeMaybeRef(token).storeMaybeRef(null).storeBit(false).storeBit(true).storeMaybeRef(null).storeDict(version===3?wallets:null).endCell();
        const balances=beginCell().storeUint(0,8).storeUint(0,8).storeVarUint(0,5).storeVarUint(0,5).endCell();
        const admin=beginCell().storeAddress(controller).storeMaybeRef(null).storeMaybeRef(null).storeMaybeRef(null).endCell();
        return beginCell().storeRef(config).storeRef(balances).storeRef(admin).storeMaybeRef(null).storeUint(0,16).endCell();
    }
    const poolInit=o=>({code:poolCode,data:poolState(o)}),pool=o=>contractAddress(0,poolInit(o));
    const put=(b,a)=>a?b.storeBit(1).storeSlice(a.beginParse()):b.storeBit(0);
    const init=(amount=0n,p=null,r=null)=>{const b=beginCell().storeUint(0x796f5a0c,32).storeUint(Q,64).storeCoins(amount);put(b,p);put(b,r);return b.endCell();};
    const buy=(amount=1000000000n,min=0n,p=null,r=null)=>beginCell().storeUint(0x94826557,32).storeUint(Q,64).storeCoins(amount).storeCoins(min).storeAddress(receiver).storeMaybeRef(p).storeMaybeRef(r).endCell();
    const sell=(amount,min=0n,p=null,r=null,response=receiver)=>beginCell().storeUint(0x646ad424,32).storeUint(Q,64).storeCoins(amount).storeCoins(min)
        .storeAddress(owner).storeAddress(response).storeMaybeRef(p).storeMaybeRef(r).endCell();
    const burn=(amount,response=receiver)=>beginCell().storeUint(0x7bdd97de,32).storeUint(Q,64).storeCoins(amount).storeAddress(owner).storeAddress(response).endCell();
    const claim=(op,to=receiver,response=receiver)=>beginCell().storeUint(op,32).storeUint(Q,64).storeAddress(to).storeAddress(response).endCell();
    const excess=()=>beginCell().storeUint(0xd53276db,32).storeUint(Q,64).endCell();
    const payment=()=>beginCell().storeUint(0x66c8ad72,32).storeUint(Q,64).endCell();
    const affiliateDest=(a,isPartner)=>{const s=a.beginParse(),id=s.loadUintBig(256),share=s.loadUint(16);
        const data=beginCell().storeBit(0).storeAddress(authority).storeUint(isPartner?1:0,1).storeMaybeRef(null).storeUint(id,256).storeUint(share,16).storeAddress(null).endCell();
        return contractAddress(0,{code:codes.CpmmAffiliateAccount,data});};
    const rate=a=>a?a.beginParse().skip(256).loadUint(16):0;
    const rates=(p,r)=>{const partnerRate=BigInt(Math.min(rate(p),500)),referrerRate=p?BigInt(Math.min(rate(r),8000)):0n;return {partnerRate,referrerRate,effective:referrerRate>0n?partnerRate*5n/6n:partnerRate};};
    function split(fees,o,p,r) {
        const {effective,referrerRate}=rates(p,r),base=fees*BigInt(o.baseFee)/(effective+BigInt(o.baseFee)),protocol=base*BigInt(version===3?20:30)/100n;
        const partnerFee=version===3?base*BigInt(Math.min(o.partnerShare,6000))/10000n:0n,affiliateFees=fees-base,referrerFee=(affiliateFees*6n/5n)*referrerRate/10000n;
        return {creatorFee:base-protocol-partnerFee,partnerFee,protocol,affiliateFee:affiliateFees-referrerFee,referrerFee};
    }
    const ceil=(n,d)=>(n+d-1n)/d;
    function purchase(o,amount,p,r) {
        const totalFee=BigInt(o.baseFee)+rates(p,r).effective;
        let net=amount*10000n/(10000n+totalFee),tokens=net*(o.alpha-o.current)/(o.beta+o.raised+net),charged=amount,graduated=o.graduated;
        const available=o.onSell-o.current;
        if(tokens>available) {net=ceil(available*(o.beta+o.raised),o.alpha-o.current-available);charged=ceil(net*(10000n+totalFee),10000n);tokens=available;graduated=true;}
        const f=split(charged-net,o,p,r),updated={...o,graduated,raised:o.raised+net,current:o.current+tokens,creatorFee:o.creatorFee+f.creatorFee,partnerFee:o.partnerFee+f.partnerFee};
        return {net,tokens,f,updated};
    }
    function sale(o,amount,p,r) {
        const gross=amount*(o.beta+o.raised)/(o.alpha-o.current+amount),received=gross*10000n/(10000n+BigInt(o.baseFee)+rates(p,r).effective);
        const f=split(gross-received,o,p,r),updated={...o,raised:o.raised-gross,current:o.current-amount,creatorFee:o.creatorFee+f.creatorFee,partnerFee:o.partnerFee+f.partnerFee};
        return {received,f,updated};
    }
    const messages=[],getters=[];
    async function check(label,body,{from=owner,storage=state(),value=VALUE,balance=BALANCE,fee=0n,bounced=false,exit=0,expected=storage,actions=[]}={}) {
        const [t]=await compareMessages(oracle,candidate,[{label,body,from,value,forwardFee:fee,bounced}],{data:storage,address,libraries,balance,accurateStorageStats:true});
        assert.equal(t.sameObservedBehavior,true,label+': differential');assert.equal(t.before.gasUsed,t.after.gasUsed,label+': exact gas');
        const a=t.before;assert.equal(a.exitCode,exit,label+': exit');assert.equal(a.codeChanged,false);assert.equal(a.dataHash,expected.hash().toString('hex'),label+': independent storage');
        assert.equal(a.actions.length,actions.length,label+': action count');
        for(let i=0;i<actions.length;i++) {
            const wanted=actions[i],actual=a.actions[i];assert.equal(actual.type,wanted.type??'sendMsg');assert.equal(actual.mode,wanted.mode,label+': action mode');
            if(wanted.type==='reserve')assert.equal(actual.currency.coins,String(wanted.amount),label+': reserved TON');
            else {assert.equal(actual.outMsg.body.cellHash,wanted.body.hash().toString('hex'),label+': message body');
                if(wanted.to) {assert.equal(actual.outMsg.info.dest,wanted.to.toRawString());assert.equal(actual.outMsg.info.value.coins,String(wanted.value??0n));assert.equal(actual.outMsg.info.bounce,wanted.bounce??false);}
                else assert.equal(actual.outMsg.info.type,'external-out');
                if(wanted.init) {assert.equal(actual.outMsg.init.splitDepth,wanted.init.splitDepth??null);assert.equal(actual.outMsg.init.code.cellHash,wanted.init.code.hash().toString('hex'));assert.equal(actual.outMsg.init.data.cellHash,wanted.init.data.hash().toString('hex'));}
            }
        }
        messages.push(t);return t;
    }
    const affiliateActions=(f,p,r)=>f.affiliateFee>0n?[{mode:2,to:affiliateDest(p,true),value:f.affiliateFee,bounce:true,body:beginCell().storeUint(0x773faf30,32).storeUint(Q,64).endCell()},
        ...(f.referrerFee>0n?[{mode:2,to:affiliateDest(r,false),value:f.referrerFee,bounce:true,body:beginCell().storeUint(0x773faf30,32).storeUint(Q,64).endCell()}]:[])]:[];
    function buyActions(o,out,p,r,buyer=owner,balance=BALANCE) {
        const {net,tokens,f,updated:u}=out;
        const event=beginCell().storeUint(0xa0aa6bc2,32).storeAddress(buyer).storeCoins(net).storeCoins(tokens).storeCoins(f.creatorFee).storeCoins(f.protocol)
            .storeCoins(f.affiliateFee).storeCoins(f.referrerFee).storeCoins(u.current).storeCoins(u.raised).storeBit(u.graduated).endCell();
        const credit=beginCell().storeUint(0x178d4519,32).storeUint(Q,64).storeCoins(tokens).storeAddress(null).storeAddress(buyer).storeCoins(0).storeBit(0).endCell();
        const deployment=u.graduated?[{mode:17,to:pool(o),value:300000000n,bounce:true,init:poolInit(o),
            body:beginCell().storeUint(0xde8402ce,32).storeUint(Q,64).storeMaybeRef(null).endCell()}]:[];
        return [...deployment,{mode:1,body:event},...affiliateActions(f,p,r),{type:'reserve',mode:2,amount:balance+net+f.protocol+f.creatorFee-(u.graduated?300000000n:0n)},
            {mode:128,to:wallet(buyer),body:credit,init:walletInit(buyer)}];
    }
    for(const amount of [1n,1000n,1000000000n,10000000000n]) {
        const out=purchase(defaults,amount,null,null);
        if(out.tokens===0n)await check('buy rounds to zero '+amount,buy(amount),{exit:21,value:amount+VALUE});
        else await check('buy integer rounding '+amount,buy(amount),{expected:state(out.updated),actions:buyActions(defaults,out,null,null),value:amount+VALUE});
    }
    for(const p of [null,partner])for(const r of [null,referrer]) {
        const out=purchase(defaults,1000000000n,p,r);
        await check('buy attribution '+Boolean(p)+'/'+Boolean(r),buy(1000000000n,0n,p,r),{expected:state(out.updated),actions:buyActions(defaults,out,p,r)});
        const sold=sale(out.updated,out.tokens/2n,p,r),f=sold.f,u=sold.updated;
        const event=beginCell().storeUint(0x3ab0fccc,32).storeAddress(owner).storeCoins(out.tokens/2n).storeCoins(sold.received).storeCoins(f.creatorFee).storeCoins(f.protocol)
            .storeCoins(f.affiliateFee).storeCoins(f.referrerFee).storeCoins(u.current).storeCoins(u.raised).endCell();
        await check('sell attribution '+Boolean(p)+'/'+Boolean(r),sell(out.tokens/2n,0n,p,r),{from:wallet(owner),storage:state(out.updated),expected:state(u),
            actions:[{mode:1,body:event},...affiliateActions(f,p,r),{type:'reserve',mode:2,amount:BALANCE-sold.received-f.affiliateFee-f.referrerFee},
                {mode:17,to:owner,value:sold.received,body:payment()},{mode:130,to:receiver,body:excess()}]});
    }
    for(const baseFee of [10,100,500,1000])for(const partnerShare of [0,400,6000,65535]) {
        const o={...defaults,baseFee,partnerShare},p=affiliate(17n,65535),r=affiliate(19n,65535),out=purchase(o,1000000000n,p,r);
        await check('buy capped rates base='+baseFee+' share='+partnerShare,buy(1000000000n,0n,p,r),{storage:state(o),expected:state(out.updated),actions:buyActions(o,out,p,r)});
    }
    for(const p of [null,partner])for(const r of [null,referrer]) {
        const amount=10000000000000n,out=purchase(defaults,amount,p,r);
        assert.equal(out.updated.graduated,true);assert.equal(out.tokens,defaults.onSell);
        await check('graduation caps tokens and rounds charge '+Boolean(p)+'/'+Boolean(r),buy(amount,defaults.onSell,p,r),
            {value:amount+VALUE,expected:state(out.updated),actions:buyActions(defaults,out,p,r)});
        await check('graduation cannot satisfy excessive min out '+Boolean(p)+'/'+Boolean(r),buy(amount,defaults.onSell+1n,p,r),{value:amount+VALUE,exit:21});
    }
    const equal={...defaults,alpha:2000n,beta:100n,onSell:1000n,baseFee:100};
    const equalOut=purchase(equal,101n,null,null);assert.equal(equalOut.tokens,1000n);assert.equal(equalOut.updated.graduated,false);
    await check('exact final token amount does not graduate',buy(101n),{storage:state(equal),expected:state(equalOut.updated),actions:buyActions(equal,equalOut,null,null)});
    const exceeded=purchase(equal,103n,null,null);assert.equal(exceeded.updated.graduated,true);
    await check('one additional net coin graduates',buy(103n),{storage:state(equal),expected:state(exceeded.updated),actions:buyActions(equal,exceeded,null,null)});
    const chainConfig=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),(await Blockchain.create()).config);
    const gp=chainConfig.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
    const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
    const fp=chainConfig.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);fp.loadUintBig(64);const bitPrice=fp.loadUintBig(64),cellPrice=fp.loadUintBig(64);fp.skip(32);const first=BigInt(fp.loadUint(16)),orig=n=>n*65536n/(65536n-first);
    const prices=Dictionary.loadDirect(Dictionary.Keys.Uint(32),{serialize(){},parse(s){assert.equal(s.loadUint(8),0xcc);s.skip(32);return {bit:s.loadUintBig(64),cell:s.loadUintBig(64)};}},chainConfig.get(18));
    const price=prices.get(Math.max(...prices.keys().filter(t=>t<=1700000000))),storageFee=((3n*price.cell+970n*price.bit)*157680000n+65535n)>>16n;
    const forwarding=(3n*cellPrice+812n*bitPrice+65535n)>>16n;
    for(const fee of [0n,987654n]) {const required=gas(22492)+gas(version===3?8862:9282)+forwarding+storageFee+orig(fee)+1000000000n,out=purchase(defaults,1000000000n,null,null);
        await check('buy funding inclusive boundary '+fee,buy(),{value:required,fee,expected:state(out.updated),actions:buyActions(defaults,out,null,null)});
        await check('buy funding one coin below '+fee,buy(),{value:required-1n,fee,exit:23});}
    const bought=purchase(defaults,1000000000n,null,null),sold=sale(bought.updated,bought.tokens/2n,null,null);
    await check('buy exact slippage equality',buy(1000000000n,bought.tokens),{expected:state(bought.updated),actions:buyActions(defaults,bought,null,null)});
    await check('buy slippage one over',buy(1000000000n,bought.tokens+1n),{exit:21});
    await check('sell slippage one over',sell(bought.tokens/2n,sold.received+1n),{from:wallet(owner),storage:state(bought.updated),exit:21});
    await check('sell zero tokens',sell(0n),{from:wallet(owner),exit:21});
    await check('sell forged wallet',sell(1000n),{exit:25});
    for(const [patch,exit]of [[{initialized:false},28],[{graduated:true},29]]) {
        await check('buy lifecycle '+exit,buy(),{storage:state(patch),exit});
        await check('sell lifecycle '+exit,sell(1000n),{from:wallet(owner),storage:state(patch),exit});
    }
    for(const response of [null,receiver])await check('burn canonical wallet response='+Boolean(response),burn(700n,response),{from:wallet(owner),expected:state({total:defaults.total-700n}),actions:[{mode:66,to:response??owner,body:excess()}]});
    await check('burn unauthorized',burn(700n),{exit:25});
    await check('burn supply underflow',burn(defaults.total+1n),{from:wallet(owner),exit:5});
    const changedPrefix=wallet(owner).hash;changedPrefix[0]^=0xff;
    await check('wallet authentication sharding prefix revision',burn(700n),{from:new Address(0,changedPrefix),exit:version===2?0:25,
        expected:version===2?state({total:defaults.total-700n}):state(),actions:version===2?[{mode:66,to:receiver,body:excess()}]:[]});
    const withTail=c=>beginCell().storeSlice(c.beginParse()).storeUint(73,8).storeRef(metadata).endCell();
    await check('burn preserves opaque storage suffix',burn(700n),{from:wallet(owner),storage:withTail(state()),
        expected:withTail(state({total:defaults.total-700n})),actions:[{mode:66,to:receiver,body:excess()}]});
    await check('buy storage suffix revision',buy(),{storage:withTail(state()),expected:version===2?state(bought.updated):withTail(state(bought.updated)),actions:buyActions(defaults,bought,null,null)});
    await check('initialize toggles only first bit',init(),{storage:state({initialized:false}),expected:state(),actions:[{type:'reserve',mode:2,amount:10000000n},{mode:130,to:creator,body:excess()}]});
    await check('initialize twice',init(),{exit:24});
    for(const p of [null,partner])for(const r of [null,referrer]) {const o={...defaults,initialized:true},out=purchase(o,1000000000n,p,r);
        await check('initialize initial buy '+Boolean(p)+'/'+Boolean(r),init(1000000000n,p,r),{storage:state({initialized:false}),expected:state(out.updated),
            actions:[{type:'reserve',mode:2,amount:10000000n},...buyActions(o,out,p,r,creator)]});}
    for(const [op,authorized,field]of [[0xad7269a8,creator,'creatorFee'],...(version===3?[[0x7f4bcbf4,partnerOwner,'partnerFee']]:[])])for(const to of [null,receiver])for(const response of [null,receiver])for(const earned of [0n,7654321n]) {
        const o={...defaults,[field]:earned};
        await check('fee claim '+op+' '+Boolean(to)+'/'+Boolean(response)+' earned='+earned,claim(op,to,response),{from:authorized,storage:state(o),expected:state({...o,[field]:0n}),
            actions:[{type:'reserve',mode:2,amount:BALANCE-earned},...(earned>0n?[{mode:17,to:to??authorized,value:earned,body:payment()}]:[]),{mode:130,to:response??authorized,body:excess()}]});
        if(to===null&&response===null)await check('fee claim forged '+op+' '+earned,claim(op,to,response),{storage:state(o),exit:25});
    }
    for(const migrated of [false,true])for(const raised of [0n,defaults.raising,defaults.raising+1n]) {
        const body=beginCell().storeUint(0xf14b54f3,32).storeUint(Q,64).storeAddress(receiver).endCell();
        const allowed=version===3||migrated;
        await check('controller sweep migrated='+migrated+' raised='+raised,body,{from:controller,storage:state({migrated,raised}),exit:allowed?0:32,
            actions:allowed?[{type:'reserve',mode:2,amount:version===3?defaults.partnerFee+defaults.creatorFee+(migrated?10000000n:1010000000n+(raised<defaults.raising?raised:defaults.raising)):defaults.creatorFee+10000000n},{mode:130,to:receiver,body:excess()}]:[]});
        await check('controller sweep unauthorized '+migrated+' '+raised,body,{storage:state({migrated,raised}),exit:25});
    }
    if(version===2)await check('partner claim opcode absent in V2',claim(0x7f4bcbf4),{exit:65535});
    function migrationActions(o) {
        const destination=pool(o),amounts=beginCell().storeUint(0xc9a015da,32).storeCoins(o.raising).storeCoins(o.liquidity).storeUint(0x2710,20).endCell();
        const payout=beginCell().storeAddress(creator).storeUint(0,4).storeMaybeRef(null).storeBit(false).storeAddress(null)
            .storeUint(0,4).storeMaybeRef(null).storeBit(false).storeAddress(address).endCell();
        const ton=beginCell().storeUint(0xa5a7cbf8,32).storeUint(Q,64).storeCoins(o.raising).storeRef(amounts).storeRef(payout).endCell();
        const pair=beginCell().storeUint(0xcbc33949,32).storeRef(amounts).storeRef(payout).endCell();
        const tokens=beginCell().storeUint(0x178d4519,32).storeUint(Q,64).storeCoins(o.liquidity).storeAddress(address).storeAddress(address).storeCoins(150000000n).storeBit(true).storeRef(pair).endCell();
        return [{mode:1,to:destination,value:150000000n+o.raising,bounce:true,body:ton},
            {mode:1,to:wallet(destination),value:200000000n,bounce:true,body:tokens,init:walletInit(destination)}];
    }
    for(const migrated of [false,true])for(const graduated of [false,true])for(const status of [0,42]) {
        const o={...defaults,migrated,graduated},body=beginCell().storeUint(0xce185bd7,32).storeUint(Q,64).storeInt(status,32).storeMaybeRef(status?metadata:null).endCell();
        await check('migration callback authenticates pool, retains status '+migrated+'/'+graduated+'/'+status,body,
            {from:pool(o),storage:state(o),balance:o.raising+BALANCE,expected:state({...o,migrated:true}),actions:migrationActions(o)});
        await check('migration rejects forged callback '+migrated+'/'+graduated+'/'+status,body,{storage:state(o),exit:25});
    }
    for(const o of [owner,new Address(-1,owner.hash),null,new ExternalAddress(17n,16)])for(const include of [false,true]) {
        const body=beginCell().storeUint(0x2c76b973,32).storeUint(Q,64).storeAddress(o).storeBit(include).endCell();
        const reply=beginCell().storeUint(0xd1735400,32).storeUint(Q,64).storeAddress(o instanceof Address&&o.workChain===0?wallet(o):null)
            .storeMaybeRef(include?beginCell().storeAddress(o).endCell():null).endCell();
        await check('wallet discovery '+(o?.toString()??'none')+' include='+include,body,{actions:[{mode:80,to:owner,body:reply}]});
    }
    await check('excesses body ignored',excess());
    for(const op of [0x796f5a0c,0x94826557,0x646ad424,0x7bdd97de,0x2c76b973,0xad7269a8,...(version===3?[0x7f4bcbf4]:[]),0xf14b54f3,0xd53276db,0xce185bd7])
        await check('short recognized body '+op,beginCell().storeUint(op,32).endCell(),{storage:empty,exit:9});
    for(const body of [empty,beginCell().storeUint(42,32).endCell(),beginCell().storeUint(0,31).endCell()])await check('unknown body '+body.bits.length,body,{storage:empty,exit:65535});
    await check('bounce returns before storage and body',empty,{storage:empty,bounced:true});
    for(const body of [buy(),sell(1000n),init(),claim(0xad7269a8),excess()])await check('strict body suffix '+body.hash().toString('hex'),
        beginCell().storeSlice(body.beginParse()).storeBit(1).endCell(),{exit:9});
    for(const p of [beginCell().storeUint(0,271).endCell(),beginCell().storeSlice(partner.beginParse()).storeBit(1).endCell()])
        await check('strict buy partner '+p.bits.length,buy(1000000000n,0n,p),{exit:9});
    const integer=v=>({type:'int',value:String(typeof v==='boolean'?(v?-1:0):v)}),slice=a=>({type:'slice',cellHash:beginCell().storeAddress(a).endCell().hash().toString('hex')}),cell=c=>({type:'cell',cellHash:c.hash().toString('hex')});
    const hashKey=name=>BigInt('0x'+createHash('sha256').update(name).digest('hex'));
    const dict=Dictionary.empty(Dictionary.Keys.BigUint(256),Dictionary.Values.Cell());
    const uri=beginCell().storeUint(0,8),decimals=beginCell().storeUint(0,8);
    if(version===3){uri.storeRef(metadata);decimals.storeRef(beginCell().storeStringTail('9').endCell());}else{uri.storeSlice(metadata.beginParse());decimals.storeStringTail('9');}
    dict.set(hashKey('uri'),uri.endCell());dict.set(hashKey('decimals'),decimals.endCell());
    const content=beginCell().storeUint(0,8).storeDict(dict).endCell();
    for(const patch of [{},{initialized:false,migrated:true,graduated:true,raised:1000000000n,current:999999999999n},{partnerFee:0n,partnerShare:65535,baseFee:1000,seed:(1n<<128n)-1n}]) {
        const o={...defaults,...patch},data=state(o),expectations={
            121862:[o.graduated,o.total,o.current,o.onSell,o.liquidity,o.raising,50000000000n,o.raised,o.alpha,o.beta].map(integer),
            83180:[integer(o.partnerFee),integer(o.partnerShare),slice(partnerOwner),integer(o.poolShare)],
            101289:[integer(o.initialized),integer(o.migrated),slice(controller),slice(creator),integer(o.creatorFee),integer(o.seed),integer(o.graduated),... [o.alpha,o.beta,o.onSell,o.baseFee,o.raised,o.current].map(integer)],
            106029:[integer(o.total),integer(0),slice(null),cell(content),cell(walletCode)]};
        for(const [method,expected]of Object.entries(expectations)) {if(version===2&&['121862','83180'].includes(method))continue;const [t]=await compareGetters(oracle,candidate,[{method:Number(method),args:[]}],{data,address,libraries});
            assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.equal(t.before.exitCode,0);assert.deepEqual(t.before.stack,expected,'independent getter '+method);getters.push(t);}
    }
    for(const o of [owner,creator,new Address(-1,owner.hash)]) {const [t]=await compareGetters(oracle,candidate,[{method:103289,args:[{type:'slice',cell:beginCell().storeAddress(o).endCell()}]}],{data:state(),address,libraries});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);assert.equal(t.before.exitCode,0);assert.deepEqual(t.before.stack,[slice(wallet(o))]);getters.push(t);}
    if(version===2)for(const method of [83180,121862]) {const [t]=await compareGetters(oracle,candidate,[{method,args:[]}],{data:state(),address,libraries});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.exitCode,11);getters.push(t);}
    return {getters,messages,dependencies:Object.fromEntries(Object.entries(codes).map(([n,c])=>[n,c.hash().toString('hex')]))};
}
