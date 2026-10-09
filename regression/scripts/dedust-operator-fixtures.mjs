import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,ExternalAddress,Cell,Dictionary,beginCell} from '@ton/core';
import {Blockchain} from '@ton/sandbox';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

const project=path.resolve(root,'../reconstruction'),NOW=1700000000;
export async function checkOperator(oracle,candidate) {
    const fixture='tests/fixtures/classic-upgrade.fc';
    const build=await compileLegacyFunc({sources:await loadFuncSources(project,fixture),targets:[fixture]});
    assert.equal(build.status,'ok',build.message);
    const installed=Cell.fromBoc(Buffer.from(build.codeBoc,'base64'))[0],operator=Cell.fromBoc(candidate)[0];
    await fs.mkdir(path.join(project,'build/fixtures'),{recursive:true});
    await fs.writeFile(path.join(project,'build/fixtures/classic-upgrade.boc'),installed.toBoc({idx:false,crc32:true}));
    const addr=n=>new Address(0,Buffer.alloc(32,n)),address=addr(37),owner=addr(41),beneficiary=addr(42),next=addr(43),recipient=addr(44);
    const empty=beginCell().endCell(),payload=beginCell().storeUint(0xcafe,16).endCell(),VALUE=1000000000n;
    const defaults={owner,version:9,kind:17,beneficiary,unlockAt:NOW};
    const state=o=>beginCell().storeAddress(o.owner).storeUint(o.version,16).storeUint(o.kind,8)
        .storeAddress(o.beneficiary).storeUint(o.unlockAt,32).endCell();
    const upgrade=(version=10,code=installed)=>beginCell().storeUint(444,32).storeUint(123,64).storeUint(version,16).storeRef(code).endCell();
    const setBeneficiary=to=>beginCell().storeUint(1223010653,32).storeUint(123,64).storeAddress(to).endCell();
    const withdraw=(to=recipient,body=payload)=>beginCell().storeUint(4053307989,32).storeUint(123,64).storeAddress(to).storeRef(body).endCell();
    const blockchain=await Blockchain.create(),config=Dictionary.loadDirect(Dictionary.Keys.Int(32),Dictionary.Values.Cell(),blockchain.config);
    const prices=config.get(21).beginParse();assert.equal(prices.loadUint(8),0xd1);
    const flatLimit=prices.loadUintBig(64),flatPrice=prices.loadUintBig(64);
    assert.equal(prices.loadUint(8),0xde);const gasPrice=prices.loadUintBig(64);
    const gasFee=units=>units<=flatLimit?flatPrice:flatPrice+(((units-flatLimit)*gasPrice+65535n)>>16n);
    const messages=[],getters=[];
    async function check(label,o,body,{from=owner,exit=0,bounced=false,value=VALUE,data,expectedData,expectedCode,send}={}) {
        const initial=data??state(o);
        const [test]=await compareMessages(oracle,candidate,[{label,from,body,bounced,value}],{data:initial,address});
        assert.equal(test.sameObservedBehavior,true,label+': '+JSON.stringify(test));
        assert.equal(test.before.exitCode,exit,label+': independent exit');
        assert.equal(test.before.gasUsed,test.after.gasUsed,label+': exact gas');
        assert.equal(test.before.dataHash,(expectedData??initial).hash().toString('hex'),label+': independent storage');
        const codeChanged=expectedCode!==undefined && !expectedCode.equals(operator);
        assert.equal(test.before.codeChanged,codeChanged,label+': code replacement');
        assert.equal(test.before.newCodeHash,codeChanged?expectedCode.hash().toString('hex'):null);
        if(send) {
            assert.equal(test.before.actions.length,1);
            const action=test.before.actions[0];assert.equal(action.type,'sendMsg');assert.equal(action.mode,0);
            assert.equal(action.outMsg.info.dest,send.to.toRawString());
            assert.equal(action.outMsg.info.value.coins,String(send.amount));
            assert.equal(action.outMsg.info.bounce,send.bounce);
            assert.equal(action.outMsg.body.cellHash,send.body.hash().toString('hex'));assert.equal(action.outMsg.init,null);
        } else if(expectedCode) {
            assert.equal(test.before.actions.length,1);assert.equal(test.before.actions[0].type,'setCode');
            assert.equal(test.before.actions[0].newCode.cellHash,expectedCode.hash().toString('hex'));
        } else {assert.deepEqual(test.before.actions,[],label+': no actions');}
        messages.push(test);
    }
    await check('owner changes beneficiary and refunds reserved gas',defaults,setBeneficiary(next),{
        expectedData:state({...defaults,beneficiary:next,unlockAt:NOW+172800}),
        send:{to:owner,amount:VALUE-gasFee(5181n),body:empty,bounce:false}});
    await check('owner can choose itself as beneficiary',defaults,setBeneficiary(owner),{
        expectedData:state({...defaults,beneficiary:owner,unlockAt:NOW+172800}),
        send:{to:owner,amount:VALUE-gasFee(5181n),body:empty,bounce:false}});
    await check('beneficiary change rejects unauthorized sender',defaults,setBeneficiary(next),{from:beneficiary,exit:257});
    await check('beneficiary change rejects trailing data',defaults,beginCell().storeSlice(setBeneficiary(next).beginParse()).storeBit(1).endCell(),{exit:9});
    await check('beneficiary change insufficient attached coins rolls back stored state',defaults,setBeneficiary(next),{value:gasFee(5181n)-1n,exit:5});
    for(const unlockAt of [0,NOW-1,NOW])await check('beneficiary withdrawal unlock='+unlockAt,{...defaults,unlockAt},withdraw(),{
        from:beneficiary,send:{to:recipient,amount:VALUE-gasFee(4133n),body:payload,bounce:true}});
    await check('beneficiary withdrawal before unlock',{...defaults,unlockAt:NOW+1},withdraw(),{from:beneficiary,exit:297});
    await check('owner cannot withdraw for a different beneficiary',defaults,withdraw(),{exit:257});
    await check('withdrawal rejects trailing ref',defaults,beginCell().storeSlice(withdraw().beginParse()).storeRef(empty).endCell(),{from:beneficiary,exit:9});
    await check('withdrawal insufficient coins',defaults,withdraw(),{from:beneficiary,value:gasFee(4133n)-1n,exit:5});
    const upgraded=state({...defaults,version:10});
    await check('upgrade executes installed hook against updated version',defaults,upgrade(),{
        expectedCode:installed,expectedData:beginCell().storeUint(0xdeadbeef,32).storeRef(upgraded).endCell()});
    await check('upgrade hook failure rolls back code data and actions',defaults,upgrade(13),{exit:777});
    await check('self upgrade retains code and updates version',defaults,upgrade(10,operator),{expectedCode:operator,expectedData:upgraded});
    await check('empty upgrade code returns with saved version',defaults,upgrade(10,empty),{expectedCode:empty,expectedData:upgraded});
    await check('upgrade requires owner',defaults,upgrade(),{from:beneficiary,exit:257});
    for(const version of [0,8,9])await check('upgrade rejects nonincreasing version '+version,defaults,upgrade(version),{exit:295});
    await check('upgrade rejects body suffix',defaults,beginCell().storeSlice(upgrade().beginParse()).storeBit(1).endCell(),{exit:9});
    await check('unknown opcode',defaults,beginCell().storeUint(0,32).endCell(),{exit:65535});
    await check('empty body',defaults,empty,{exit:9});
    await check('bounced empty body skips storage and dispatch',defaults,empty,{bounced:true});
    await check('bounced message ignores malformed storage',defaults,empty,{bounced:true,data:empty});
    for(const [opcode,from]of [[444,owner],[1223010653,owner],[4053307989,beneficiary]]) {
        await check('truncated query opcode='+opcode,defaults,beginCell().storeUint(opcode,32).storeUint(0,63).endCell(),{from,exit:9});
        await check('malformed storage opcode='+opcode,defaults,beginCell().storeUint(opcode,32).endCell(),{from,data:empty,exit:9});
    }
    await check('missing upgrade code reference',defaults,beginCell().storeUint(444,32).storeUint(123,64).storeUint(10,16).endCell(),{exit:9});
    await check('missing withdrawal payload reference',defaults,beginCell().storeUint(4053307989,32).storeUint(123,64).storeAddress(recipient).endCell(),{from:beneficiary,exit:9});
    for(const ownerField of [owner,new Address(-1,Buffer.alloc(32,45)),null,new ExternalAddress(17n,16)])for(const version of [0,9,65535]) {
        const o={...defaults,owner:ownerField,version,kind:version===0?0:version===9?17:255,unlockAt:version===65535?0xffffffff:NOW};
        const expected=[{type:'slice',cellHash:beginCell().storeAddress(ownerField).endCell().hash().toString('hex')},
            {type:'int',value:String(o.kind)},{type:'slice',cellHash:beginCell().storeAddress(beneficiary).endCell().hash().toString('hex')},
            {type:'int',value:String(o.unlockAt)}];
        const tests=await compareGetters(oracle,candidate,[{method:79987,args:[]},{method:82320,args:[]}],{data:state(o),address});
        for(const test of tests){assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.gasUsed,test.after.gasUsed);assert.equal(test.before.exitCode,0);}
        assert.deepEqual(tests[0].before.stack,expected);assert.deepEqual(tests[1].before.stack,[{type:'int',value:String(version)}]);getters.push(...tests);
    }
    const stored=state(defaults);
    const bad=[empty,...[266,282,290,557,589].map(bits=>beginCell().storeBits(stored.beginParse().loadBits(bits)).endCell()),
        beginCell().storeSlice(stored.beginParse()).storeBit(1).endCell(),beginCell().storeSlice(stored.beginParse()).storeRef(empty).endCell()];
    for(const data of bad) {
        const tests=await compareGetters(oracle,candidate,[{method:79987,args:[]},{method:82320,args:[]}],{data,address});
        for(const test of tests){assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.gasUsed,test.after.gasUsed);assert.equal(test.before.exitCode,9);}getters.push(...tests);
    }
    // Exercise the real constructor through the separately source-built Blank.
    const blankEntry='dedust/classic/ClassicBlank/main.fc';
    const blankBuild=await compileLegacyFunc({sources:await loadFuncSources(project,blankEntry),targets:[blankEntry]});
    assert.equal(blankBuild.status,'ok',blankBuild.message);
    const blank=Buffer.from(blankBuild.codeBoc,'base64'),originalBlank=await fs.readFile(path.join(project,'oracles/ClassicBlank.boc'));
    assert.ok(Cell.fromBoc(blank)[0].equals(Cell.fromBoc(originalBlank)[0]));
    for(const kind of [0,17,255]) {
        const data=beginCell().storeAddress(owner).storeUint(42,8).storeUint(kind,8).endCell();
        const body=beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(payload).storeUint(7,16)
            .storeRef(operator).storeAddress(beneficiary).endCell();
        const [test]=await compareMessages(originalBlank,blank,[{label:'Blank installs Operator kind='+kind,from:owner,body}],{data,address});
        assert.equal(test.sameObservedBehavior,true);assert.equal(test.before.gasUsed,test.after.gasUsed);assert.equal(test.before.exitCode,0);
        assert.equal(test.before.newCodeHash,operator.hash().toString('hex'));
        assert.equal(test.before.dataHash,state({...defaults,version:7,kind,unlockAt:0}).hash().toString('hex'));messages.push(test);
    }
    return {getters,messages};
}
