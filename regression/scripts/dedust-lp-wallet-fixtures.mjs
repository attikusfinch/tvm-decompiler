import assert from 'node:assert/strict';
import {Address,ExternalAddress,Cell,beginCell,contractAddress} from '@ton/core';
import {compareMessages,compareGetters} from './lib.mjs';

export async function checkLpWallet(oracle,candidate) {
    const addr=n=>new Address(0,Buffer.alloc(32,n));
    const address=addr(51),owner=addr(52),pool=addr(53),recipient=addr(54),other=addr(55);
    const code=Cell.fromBoc(candidate)[0],empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell();
    const Q=123n,AMOUNT=700n,BALANCE=1000n,VALUE=1000000000n;
    const storage=(balance=BALANCE,o=owner,p=pool,c=code)=>beginCell().storeCoins(balance).storeAddress(o).storeAddress(p).storeRef(c).endCell();
    const walletInit=o=>({code,data:storage(0n,o)}),peer=o=>contractAddress(0,walletInit(o));
    const tail=(referenced=false)=>referenced?beginCell().storeBit(1).storeRef(payload).endCell():beginCell().storeBit(0).storeSlice(payload.beginParse()).endCell();
    const transfer=({amount=AMOUNT,to=recipient,response=owner,forward=0n,custom=null,forwardBody=tail(),query=Q}={})=>beginCell()
        .storeUint(0xf8a7ea5,32).storeUint(query,64).storeCoins(amount).storeAddress(to).storeAddress(response)
        .storeMaybeRef(custom).storeCoins(forward).storeSlice(forwardBody.beginParse()).endCell();
    const credit=({amount=AMOUNT,from=other,response=null,forward=0n,forwardBody=tail(),query=Q}={})=>beginCell()
        .storeUint(0x178d4519,32).storeUint(query,64).storeCoins(amount).storeAddress(from).storeAddress(response)
        .storeCoins(forward).storeSlice(forwardBody.beginParse()).endCell();
    const burn=({amount=AMOUNT,response=owner,query=Q}={})=>beginCell().storeUint(0x595f07bc,32)
        .storeUint(query,64).storeCoins(amount).storeAddress(response).endCell();
    const bounce=(opcode,amount=AMOUNT,prefix=0xffffffff)=>beginCell().storeUint(prefix,32).storeUint(opcode,32).storeUint(Q,64).storeCoins(amount).endCell();
    const messages=[],getters=[];
    async function check(label,body,{from=owner,data=storage(),balance=BALANCE,exit=0,bounced=false,value=VALUE,forwardFee=0n,tonBalance=10000000000n,expectedData,sends=[]}={}) {
        const [test]=await compareMessages(oracle,candidate,[{label,from,body,value,bounced,forwardFee}],{data,address,balance:tonBalance});
        assert.equal(test.sameObservedBehavior,true,label+': differential behavior');
        const actual=test.before;assert.equal(actual.gasUsed,test.after.gasUsed,label+': exact gas');
        assert.equal(actual.exitCode,exit,label+': independent exit');
        assert.equal(actual.dataHash,(expectedData??(exit===0?storage(balance):data)).hash().toString('hex'),label+': independent storage');
        assert.equal(actual.codeChanged,false,label+': retained code');
        assert.equal(actual.actions.length,sends.length,label+': action count');
        for(let i=0;i<sends.length;i++) {
            const action=actual.actions[i],expected=sends[i];assert.equal(action.type,'sendMsg');
            assert.equal(action.mode,expected.mode);assert.equal(action.outMsg.info.dest,expected.to.toRawString());
            assert.equal(action.outMsg.info.value.coins,String(expected.value));assert.equal(action.outMsg.info.bounce,expected.bounce);
            assert.equal(action.outMsg.body.cellHash,expected.body.hash().toString('hex'));
            if(expected.init) {
                assert.equal(action.outMsg.init.code.cellHash,code.hash().toString('hex'));
                assert.equal(action.outMsg.init.data.cellHash,storage(0n,recipient).hash().toString('hex'));
            } else assert.equal(action.outMsg.init,null);
        }
        messages.push(test);
    }
    const transferSend=(amount=AMOUNT,forward=0n,forwardBody=tail(),query=Q)=>({to:peer(recipient),value:0n,mode:64,bounce:true,init:true,
        body:beginCell().storeUint(0x178d4519,32).storeUint(query,64).storeCoins(amount).storeAddress(owner).storeAddress(owner)
            .storeCoins(forward).storeSlice(forwardBody.beginParse()).endCell()});
    const burnSend=(amount=AMOUNT,query=Q)=>({to:pool,value:0n,mode:64,bounce:true,
        body:beginCell().storeUint(0x7bdd97de,32).storeUint(query,64).storeCoins(amount).storeAddress(owner).storeAddress(owner).endCell()});
    for(const amount of [0n,AMOUNT,BALANCE])await check('owner transfer amount='+amount,transfer({amount}),{balance:BALANCE-amount,sends:[transferSend(amount)]});
    for(const referenced of [false,true])await check('transfer forwards payload ref='+referenced,transfer({forward:100000000n,forwardBody:tail(referenced),custom:payload}),{
        balance:BALANCE-AMOUNT,sends:[transferSend(AMOUNT,100000000n,tail(referenced))]});
    await check('transfer retains max query ID',transfer({query:(1n<<64n)-1n}),{balance:BALANCE-AMOUNT,sends:[transferSend(AMOUNT,0n,tail(),(1n<<64n)-1n)]});
    await check('transfer requires owner',transfer(),{from:other,exit:705});
    await check('transfer rejects excess tokens',transfer({amount:BALANCE+1n}),{exit:706});
    await check('transfer validates basechain before malformed storage',transfer({to:new Address(-1,Buffer.alloc(32,54))}),{data:empty,exit:333});
    await check('transfer requires forward payload selector',transfer({forwardBody:empty}),{exit:708});
    for(const encodedFee of [0n,1000001n])for(const forward of [0n,10000000n]) {
        const originalFee=encodedFee*3n/2n,budget=forward+(forward===0n?1n:2n)*originalFee+40000000n;
        await check('transfer exact budget rejects fee='+encodedFee+' forward='+forward,transfer({forward}),{value:budget,forwardFee:encodedFee,exit:709});
        await check('transfer budget plus one fee='+encodedFee+' forward='+forward,transfer({forward}),{value:budget+1n,forwardFee:encodedFee,balance:BALANCE-AMOUNT,sends:[transferSend(AMOUNT,forward)]});
    }
    for(const amount of [0n,AMOUNT,BALANCE])await check('owner burn amount='+amount,burn({amount}),{balance:BALANCE-amount,sends:[burnSend(amount)]});
    await check('burn requires owner',burn(),{from:other,exit:705});
    await check('burn rejects excess tokens',burn({amount:BALANCE+1n}),{exit:706});
    for(const encodedFee of [0n,1000001n]) {
        const budget=encodedFee*3n/2n+30000000n;
        await check('burn exact budget rejects fee='+encodedFee,burn(),{value:budget,forwardFee:encodedFee,exit:707});
        await check('burn budget plus one fee='+encodedFee,burn(),{value:budget+1n,forwardFee:encodedFee,balance:BALANCE-AMOUNT,sends:[burnSend()]});
    }
    const notification=(forwardBody=tail())=>({to:owner,value:100000000n,mode:1,bounce:false,
        body:beginCell().storeUint(0x7362d09c,32).storeUint(Q,64).storeCoins(AMOUNT).storeAddress(other).storeSlice(forwardBody.beginParse()).endCell()});
    const excesses=value=>({to:recipient,value,mode:2,bounce:false,body:beginCell().storeUint(0xd53276db,32).storeUint(Q,64).endCell()});
    await check('pool mints wallet credit',credit(),{from:pool,balance:BALANCE+AMOUNT});
    await check('derived peer credits wallet',credit(),{from:peer(other),balance:BALANCE+AMOUNT});
    await check('unrelated sender rejected',credit(),{from:other,exit:707});
    for(const referenced of [false,true])await check('credit sends owner notification ref='+referenced,credit({forward:100000000n,forwardBody:tail(referenced)}),{
        from:pool,balance:BALANCE+AMOUNT,sends:[notification(tail(referenced))]});
    await check('credit returns remaining TON',credit({response:recipient}),{from:pool,balance:BALANCE+AMOUNT,sends:[excesses(VALUE-15000000n)]});
    await check('credit subtracts reserve shortfall',credit({response:recipient}),{from:pool,tonBalance:5000000n,balance:BALANCE+AMOUNT,sends:[excesses(VALUE-20000000n)]});
    await check('credit notification plus excesses uses original forward fee',credit({response:recipient,forward:100000000n}),{
        from:pool,forwardFee:1000001n,balance:BALANCE+AMOUNT,sends:[notification(),excesses(VALUE-15000000n-100000000n-1500001n)]});
    await check('zero TON remainder suppresses excesses',credit({response:recipient}),{from:pool,value:15000000n,balance:BALANCE+AMOUNT});
    await check('negative TON remainder suppresses excesses',credit({response:recipient}),{from:pool,value:14000000n,balance:BALANCE+AMOUNT});
    await check('credit coin overflow rolls back',credit({amount:1n}),{from:pool,data:storage((1n<<120n)-1n),exit:5});
    for(const opcode of [0x178d4519,0x7bdd97de])for(const prefix of [0xffffffff,0])await check('bounce restores opcode='+opcode+' prefix='+prefix,bounce(opcode,AMOUNT,prefix),{from:other,bounced:true,balance:BALANCE+AMOUNT});
    await check('unsupported bounced opcode',bounce(0x595f07bc),{bounced:true,exit:709});
    await check('bounce amount underflow',beginCell().storeUint(0xffffffff,32).storeUint(0x178d4519,32).storeUint(Q,64).endCell(),{bounced:true,exit:9});
    await check('empty body ignores malformed storage',empty,{data:empty,expectedData:empty});
    await check('empty bounce ignores malformed storage',empty,{bounced:true,data:empty,expectedData:empty});
    await check('unknown opcode ignores malformed storage',beginCell().storeUint(42,32).endCell(),{data:empty,exit:65535});
    await check('truncated opcode',beginCell().storeUint(0,31).endCell(),{exit:9});
    for(const body of [transfer(),burn(),credit()])await check('malformed wallet storage opcode='+body.beginParse().loadUint(32),body,{from:pool,data:empty,exit:9});
    await check('storage suffix tolerated on transfer',transfer(),{data:beginCell().storeSlice(storage().beginParse()).storeBit(1).storeRef(empty).endCell(),balance:BALANCE-AMOUNT,sends:[transferSend()]});
    for(const balance of [0n,1000n,(1n<<119n)])for(const o of [owner,null,new Address(-1,Buffer.alloc(32,56)),new ExternalAddress(17n,16)]) {
        const data=storage(balance,o),[test]=await compareGetters(oracle,candidate,[{method:97026,args:[]}],{data,address});
        assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.gasUsed,test.after.gasUsed);assert.equal(test.before.exitCode,0);
        assert.deepEqual(test.before.stack,[{type:'int',value:String(balance)},
            {type:'slice',cellHash:beginCell().storeAddress(o).endCell().hash().toString('hex')},
            {type:'slice',cellHash:beginCell().storeAddress(pool).endCell().hash().toString('hex')},
            {type:'cell',cellHash:code.hash().toString('hex')}]);getters.push(test);
    }
    for(const data of [empty,beginCell().storeCoins(1n).endCell(),beginCell().storeCoins(1n).storeAddress(owner).endCell(),beginCell().storeCoins(1n).storeAddress(owner).storeAddress(pool).endCell()]) {
        const [test]=await compareGetters(oracle,candidate,[{method:97026,args:[]}],{data,address});
        assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.exitCode,9);assert.equal(test.before.gasUsed,test.after.gasUsed);getters.push(test);
    }
    const suffix=beginCell().storeSlice(storage().beginParse()).storeBit(1).storeRef(empty).endCell();
    const [test]=await compareGetters(oracle,candidate,[{method:97026,args:[]}],{data:suffix,address});
    assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.exitCode,0);getters.push(test);
    return {getters,messages};
}
