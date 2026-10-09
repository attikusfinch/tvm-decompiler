import assert from 'node:assert/strict';
import {Address,ExternalAddress,Cell,Dictionary,beginCell,contractAddress} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {compareMessages,compareGetters} from './lib.mjs';

// Expected serialization, balances, addresses and fee arithmetic are independent.
export const checkUranusWalletV2=(o,c)=>checkUranusWallet(o,c,2);
export const checkUranusWalletV3=(o,c)=>checkUranusWallet(o,c,3);
async function checkUranusWallet(oracle,candidate,version) {
    const addr=n=>new Address(0,Buffer.alloc(32,n));
    const address=addr(111),owner=addr(112),master=addr(113),recipient=addr(114),other=addr(115);
    const code=Cell.fromBoc(candidate)[0],empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell();
    const Q=123n,A=700n,B=1000n,VALUE=1000000000n;
    const storage=(amount=B,o=owner,m=master)=>beginCell().storeCoins(amount).storeAddress(o).storeAddress(m).endCell();
    const init=o=>({splitDepth:8,code,data:storage(0n,o)});
    const peer=o=>new Address(0,Buffer.concat([o.hash.subarray(0,1),contractAddress(0,init(o)).hash.subarray(1)]));
    const either=(ref=false)=>ref?beginCell().storeBit(1).storeRef(payload).endCell():beginCell().storeBit(0).storeSlice(payload.beginParse()).endCell();
    const transfer=({amount=A,to=recipient,response=owner,forward=0n,tail=either(),custom=null,q=Q}={})=>beginCell().storeUint(0xf8a7ea5,32)
        .storeUint(q,64).storeCoins(amount).storeAddress(to).storeAddress(response).storeMaybeRef(custom).storeCoins(forward).storeSlice(tail.beginParse()).endCell();
    const credit=({amount=A,from=other,response=null,forward=0n,tail=either(),q=Q}={})=>beginCell().storeUint(0x178d4519,32)
        .storeUint(q,64).storeCoins(amount).storeAddress(from).storeAddress(response).storeCoins(forward).storeSlice(tail.beginParse()).endCell();
    const burn=({amount=A,response=owner,custom=null,q=Q}={})=>beginCell().storeUint(0x595f07bc,32).storeUint(q,64).storeCoins(amount).storeAddress(response).storeMaybeRef(custom).endCell();
    const sell=({amount=A,response=owner,partner=null,referrer=null,minTon=321n,q=Q}={})=>beginCell().storeUint(0xb7459e2c,32)
        .storeUint(q,64).storeCoins(amount).storeCoins(minTon).storeAddress(response).storeMaybeRef(partner).storeMaybeRef(referrer).endCell();
    const bounce=(op,amount=A,prefix=0xffffffff)=>beginCell().storeUint(prefix,32).storeUint(op,32).storeUint(Q,64).storeCoins(amount).endCell();
    const cfg=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),(await Blockchain.create()).config);
    const gp=cfg.get(21).beginParse();assert.equal(gp.loadUint(8),0xd1);
    const flatLimit=gp.loadUintBig(64),flatPrice=gp.loadUintBig(64);assert.equal(gp.loadUint(8),0xde);const gasPrice=gp.loadUintBig(64);
    const gas=n=>{n=BigInt(n);return n<=flatLimit?flatPrice:flatPrice+(((n-flatLimit)*gasPrice+65535n)>>16n);};
    const fp=cfg.get(25).beginParse();assert.equal(fp.loadUint(8),0xea);
    fp.loadUintBig(64);const bitPrice=fp.loadUintBig(64),cellPrice=fp.loadUintBig(64);fp.skip(32);const first=BigInt(fp.loadUint(16));
    const originalFee=n=>n*65536n/(65536n-first),forward=()=>((3n*cellPrice+812n*bitPrice+65535n)>>16n);
    const prices=Dictionary.loadDirect(Dictionary.Keys.Uint(32),{serialize(){},parse(s){assert.equal(s.loadUint(8),0xcc);s.skip(32);return {bit:s.loadUintBig(64),cell:s.loadUintBig(64)};}},cfg.get(18));
    const latest=prices.get(Math.max(...prices.keys().filter(since=>since<=1700000000))),storageFee=((970n*latest.bit+3n*latest.cell)*157680000n+65535n)>>16n;
    const transferBudget=(fee,fwd)=>(fwd>0n?2n:1n)*originalFee(fee)+fwd+gas(version===3?8526:8628)+gas(version===3?8862:9282)+forward()+storageFee;
    const burnBudget=fee=>gas(version===3?5253:5115)+gas(version===3?7518:7880)+originalFee(fee);
    const sellBudget=fee=>gas(version===3?5760:5588)+gas(version===3?22320:22543)+gas(1586)+2n*originalFee(fee);
    const messages=[],getters=[];
    async function check(label,body,{from=owner,data=storage(),balance=B,value=VALUE,fee=0n,bounced=false,exit=0,expectedData,sends=[],reserve=false}={}) {
        const [test]=await compareMessages(oracle,candidate,[{label,body,from,value,forwardFee:fee,bounced}],{data,address});
        assert.equal(test.sameObservedBehavior,true,label+': differential behavior');assert.equal(test.before.gasUsed,test.after.gasUsed,label+': gas');
        const a=test.before;assert.equal(a.exitCode,exit,label+': exit');
        assert.equal(a.dataHash,(expectedData??(exit===0?storage(balance):data)).hash().toString('hex'),label+': storage');
        assert.equal(a.codeChanged,false);assert.equal(a.actions.length,sends.length+(reserve?1:0),label+': actions');
        let offset=0;
        for(const expected of sends) {
            if(reserve&&a.actions[offset].type==='reserve') {assert.equal(a.actions[offset].mode,2);assert.equal(a.actions[offset].currency.coins,'10000000000');offset++;}
            const action=a.actions[offset++];assert.equal(action.type,'sendMsg');assert.equal(action.mode,expected.mode);
            assert.equal(action.outMsg.info.dest,expected.to.toRawString());assert.equal(action.outMsg.info.value.coins,String(expected.value??0n));
            assert.equal(action.outMsg.info.bounce,expected.bounce??true);assert.equal(action.outMsg.body.cellHash,expected.body.hash().toString('hex'));
            if(expected.init) {
                assert.equal(action.outMsg.init.splitDepth,8);assert.equal(action.outMsg.init.code.cellHash,code.hash().toString('hex'));
                assert.equal(action.outMsg.init.data.cellHash,storage(0n,recipient).hash().toString('hex'));
            } else assert.equal(action.outMsg.init,null);
        }
        messages.push(test);
    }
    const transferSend=({amount=A,forward=0n,tail=either(),response=owner,q=Q}={})=>({to:peer(recipient),mode:80,init:true,
        body:credit({amount,from:owner,response,forward,tail,q})});
    const burnSend=({amount=A,response=owner,q=Q}={})=>({to:master,mode:80,
        body:beginCell().storeUint(0x7bdd97de,32).storeUint(q,64).storeCoins(amount).storeAddress(owner).storeAddress(response).endCell()});
    const sellSend=({amount=A,response=owner,partner=null,referrer=null,minTon=321n,q=Q}={})=>({to:master,mode:80,
        body:beginCell().storeUint(0x646ad424,32).storeUint(q,64).storeCoins(amount).storeCoins(minTon).storeAddress(owner).storeAddress(response)
            .storeMaybeRef(partner).storeMaybeRef(referrer).endCell()});
    for(const amount of [0n,A,B]) {
        await check('transfer amount='+amount,transfer({amount}),{balance:B-amount,sends:[transferSend({amount})]});
        await check('burn amount='+amount,burn({amount}),{balance:B-amount,sends:[burnSend({amount})]});
        await check('sell amount='+amount,sell({amount}),{balance:B-amount,sends:[sellSend({amount})]});
    }
    for(const ref of [false,true])await check('forward payload ref='+ref,transfer({forward:100000000n,tail:either(ref),custom:payload}),{
        balance:B-A,sends:[transferSend({forward:100000000n,tail:either(ref)})]});
    for(const p of [null,payload])for(const r of [null,payload])await check('sell affiliate refs='+Boolean(p)+'/'+Boolean(r),sell({partner:p,referrer:r}),{
        balance:B-A,sends:[sellSend({partner:p,referrer:r})]});
    for(const q of [0n,(1n<<64n)-1n])await check('max/min query='+q,transfer({q}),{balance:B-A,sends:[transferSend({q})]});
    for(const [name,make,send,budget]of [['transfer',transfer,transferSend,transferBudget],['burn',burn,burnSend,burnBudget],['sell',sell,sellSend,sellBudget]]) {
        await check(name+' owner authorization',make(),{from:master,exit:25});
        await check(name+' insufficient tokens',make({amount:B+1n}),{exit:27});
        for(const fee of [0n,1000001n]) {
            const bound=budget(fee,0n);
            await check(name+' budget below boundary fee='+fee,make(),{fee,value:bound-1n,exit:23});
            await check(name+' exact inclusive budget fee='+fee,make(),{fee,value:bound,balance:B-A,sends:[send()]});
        }
    }
    await check('transfer basechain restriction',transfer({to:new Address(-1,recipient.hash)}),{exit:30});
    await check('master credit',credit(),{from:master,balance:B+A});
    await check('canonical peer credit',credit(),{from:peer(other),balance:B+A});
    await check('credit rejects unrelated sender',credit(),{from:other,exit:25});
    const wrongPrefix=new Address(0,Buffer.concat([Buffer.from([other.hash[0]^1]),peer(other).hash.subarray(1)]));
    await check('peer prefix policy differs by revision',credit(),{from:wrongPrefix,exit:version===2?0:25,balance:B+A});
    for(const ref of [false,true])await check('credit notification ref='+ref,credit({forward:100000000n,tail:either(ref)}),{
        from:master,balance:B+A,sends:[{to:owner,mode:17,bounce:false,value:100000000n,
            body:beginCell().storeUint(0x7362d09c,32).storeUint(Q,64).storeCoins(A).storeAddress(other).storeSlice(either(ref).beginParse()).endCell()}]});
    await check('credit reserves balance and returns excess',credit({response:recipient}),{from:master,balance:B+A,reserve:true,
        sends:[{to:recipient,mode:130,bounce:false,body:beginCell().storeUint(0xd53276db,32).storeUint(Q,64).endCell()}]});
    for(const op of [0x178d4519,0x7bdd97de,0x646ad424])for(const prefix of [0xffffffff,0])await check('bounce op='+op+' prefix='+prefix,bounce(op,A,prefix),{
        from:other,bounced:true,balance:B+A});
    await check('unsupported bounce opcode',bounce(0x595f07bc),{bounced:true,exit:63});
    for(const body of [empty,beginCell().storeUint(0,31).endCell(),beginCell().storeUint(42,32).endCell()])await check('unsupported short body bits='+body.bits.length,body,{exit:65535});
    await check('bounce truncated prefix',empty,{bounced:true,exit:9});
    for(const [name,body]of [['burn',burn()],['sell',sell()]]) {
        const tailed=beginCell().storeSlice(body.beginParse()).storeBit(1).storeRef(empty).endCell();
        await check(name+' trailing data revision policy',tailed,{exit:version===3?9:0,balance:B-A,sends:version===3?[]:[name==='burn'?burnSend():sellSend()]});
    }
    const missingRef=beginCell().storeBit(1).endCell();
    await check('transfer referenced payload missing cell',transfer({tail:missingRef}),{exit:9});
    await check('credit referenced payload missing cell',credit({tail:missingRef}),{from:master,exit:9});
    const suffix=beginCell().storeBit(1).storeRef(empty).endCell(),tailedStorage=beginCell().storeSlice(storage().beginParse()).storeSlice(suffix.beginParse()).endCell();
    await check('transfer preserves storage suffix',transfer(),{data:tailedStorage,expectedData:beginCell().storeSlice(storage(B-A).beginParse()).storeSlice(suffix.beginParse()).endCell(),sends:[transferSend()]});
    await check('credit overflow rolls back',credit({amount:1n}),{from:master,data:storage((1n<<120n)-1n),exit:5});
    for(const balance of [0n,B,1n<<119n])for(const o of [owner,null,new Address(-1,owner.hash),new ExternalAddress(17n,16)]) {
        const data=storage(balance,o),[t]=await compareGetters(oracle,candidate,[{method:97026,args:[]}],{data,address});
        assert.equal(t.sameObservedBehavior,true);assert.equal(t.before.gasUsed,t.after.gasUsed);
        const exit=version===3&&(o===null||o instanceof ExternalAddress)?9:0;assert.equal(t.before.exitCode,exit);
        if(exit===0)assert.deepEqual(t.before.stack,[{type:'int',value:String(balance)},
            {type:'slice',cellHash:beginCell().storeAddress(o).endCell().hash().toString('hex')},
            {type:'slice',cellHash:beginCell().storeAddress(master).endCell().hash().toString('hex')},{type:'cell',cellHash:code.hash().toString('hex')}]);
        getters.push(t);
    }
    for(const data of [empty,beginCell().storeCoins(1n).endCell(),beginCell().storeCoins(1n).storeAddress(owner).endCell()]) {
        const [t]=await compareGetters(oracle,candidate,[{method:97026,args:[]}],{data,address});assert.equal(t.sameObservedBehavior,true);
        assert.equal(t.before.exitCode,9);assert.equal(t.before.gasUsed,t.after.gasUsed);getters.push(t);
    }
    return {getters,messages};
}
