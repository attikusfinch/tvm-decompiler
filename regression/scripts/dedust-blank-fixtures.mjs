import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Address,Cell,beginCell} from '@ton/core';
import {root,compareMessages,compareGetters} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc} from './func-legacy.mjs';

const project=path.resolve(root,'../reconstruction/dedust');

export async function checkBlank(oracle,candidate) {
    const entry='tests/fixtures/classic-install.fc';
    const sources=await loadFuncSources(project,entry);
    const compiled=await compileLegacyFunc({sources,targets:[entry]});
    assert.equal(compiled.status,'ok',compiled.message);
    const installed=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0];
    await fs.mkdir(path.join(project,'build/fixtures'),{recursive:true});
    await fs.writeFile(path.join(project,'build/fixtures/classic-install.boc'),installed.toBoc({idx:false,crc32:true}));
    const addr=n=>new Address(0,Buffer.alloc(32,n)),pool=addr(37),owner=addr(41),stranger=addr(42);
    const empty=beginCell().endCell(),parameters=beginCell().storeUint(0xcafe,16).storeRef(empty).endCell();
    const template=beginCell().storeUint(0xaabb,16).storeRef(parameters).endCell();
    const suffix=beginCell().storeUint(7,3).storeRef(empty).endCell();
    const data=(kind=17,tail=template)=>beginCell().storeAddress(owner).storeUint(kind,8).storeSlice(tail.beginParse()).endCell();
    const body=(version=9,code=installed,tail=empty)=>beginCell().storeUint(2604311546,32).storeUint(123,64)
        .storeRef(parameters).storeUint(version,16).storeRef(code).storeSlice(tail.beginParse()).endCell();
    const expected=(kind,version,tail=empty)=>beginCell().storeAddress(owner).storeUint(kind,8).storeUint(version,16)
        .storeBuffer(installed.hash()).storeRef(template).storeRef(parameters).storeRef(tail).endCell();
    const messages=[];
    async function check(label,state,payload,{from=owner,bounced=false,success=false,expectedData,expectedCode=installed}={}) {
        const [test]=await compareMessages(oracle,candidate,[{label,from,bounced,body:payload,expectExit:0}],{data:state,address:pool});
        assert.equal(test.sameObservedBehavior,true,label+': '+JSON.stringify(test));
        assert.equal(test.before.exitCode,0,label+': caught errors return normally');
        assert.equal(test.after.gasUsed,test.before.gasUsed,label+': exact gas');
        if(success) {
            assert.equal(test.before.newCodeHash,expectedCode.hash().toString('hex'),label+': installed code');
            assert.equal(test.before.dataHash,expectedData.hash().toString('hex'),label+': independently serialized constructor arguments');
            assert.equal(test.before.outMessages.length,0,label+': no refund on installation');
        } else {
            assert.equal(test.before.actions.length,1,label+': discard constructor actions and SETCODE on failure');
            const action=test.before.actions[0];
            assert.equal(action.type,'sendMsg');assert.equal(action.mode,160,label+': carry balance and destroy if empty');
            // outMsg includes the independently constructed empty body and header.
            assert.equal(action.outMsg.body.cellHash,empty.hash().toString('hex'));
            assert.equal(action.outMsg.info.dest,from.toRawString());
            assert.equal(action.outMsg.info.value.coins,'0');
            assert.equal(action.outMsg.info.ihrDisabled,true);assert.equal(action.outMsg.info.bounce,false);
            assert.equal(action.outMsg.info.bounced,false);assert.equal(action.outMsg.init,null);
            assert.equal(test.before.codeChanged,false,label+': no installed code after refund');
            assert.equal(test.before.stateType,null,label+': refund deletes emptied account');
            assert.equal(test.before.dataHash,null,label+': no surviving storage');
            assert.equal(test.before.outMessages.length,1);assert.ok(BigInt(test.before.outMessages[0].value)>10000000000n);
        }
        messages.push(test);
    }
    for(const kind of [0,17,255])for(const version of [0,9,65535])
        await check(`install kind=${kind} version=${version}`,data(kind),body(version),{success:true,expectedData:expected(kind,version)});
    await check('constructor receives trailing body bits and reference',data(),body(9,installed,suffix),{success:true,expectedData:expected(17,9,suffix)});
    await check('bounced flag does not suppress authorized installation',data(),body(),{bounced:true,success:true,expectedData:expected(17,9)});
    await check('constructor exception rolls back installed code data and previous sends',data(),body(13));
    await check('unauthorized sender',data(),body(),{from:stranger});
    await check('unauthorized malformed body',data(),empty,{from:stranger});
    await check('unknown opcode',data(),beginCell().storeUint(0,32).endCell());
    await check('empty message',data(),empty);
    await check('bounced empty message still refunds',data(),empty,{bounced:true});
    await check('missing first reference',data(),beginCell().storeUint(2604311546,32).storeUint(123,64).endCell());
    await check('missing version after parameters',data(),beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(parameters).endCell());
    await check('missing installed code reference',data(),beginCell().storeUint(2604311546,32).storeUint(123,64).storeRef(parameters).storeUint(9,16).endCell());
    await check('installed empty code returns without initialization',data(),body(9,empty),{success:true,expectedCode:empty,expectedData:data()});
    await check('empty storage',empty,body());
    await check('storage owner without kind',beginCell().storeAddress(owner).endCell(),body());
    await check('nonstandard stored owner',beginCell().storeAddress(null).storeUint(17,8).endCell(),body());
    for(const bits of [1,7,31,33,63,95,97,103,111]) {
        const complete=body().beginParse();
        const partial=beginCell().storeBits(complete.loadBits(bits)).endCell();
        await check(`truncated install body bits=${bits}`,data(),partial);
    }
    const hookArgs=[{type:'slice',cell:beginCell().storeAddress(owner).endCell()},17n,{type:'slice',cell:template},
        {type:'cell',cell:parameters},9n,{type:'cell',cell:installed},{type:'slice',cell:empty}];
    const getters=await compareGetters(oracle,candidate,[{method:58662,args:hookArgs},{method:58662,args:hookArgs.slice(1)}],{data:data(),address:pool});
    for(const [index,test]of getters.entries()) {
        assert.equal(test.sameObservedBehavior,true,'constructor hook '+index);
        assert.equal(test.before.gasUsed,test.after.gasUsed,'constructor hook exact gas');
        assert.equal(test.before.exitCode,index===0?0:2,'constructor hook seven-value ABI');
    }
    assert.deepEqual(getters[0].before.stack,[],'blank hook discards all seven values');
    return {getters,messages};
}
