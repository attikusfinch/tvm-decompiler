import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {beginCell} from '@ton/core';
import {root,decompile,recompile,compareGetters,writeJson} from './lib.mjs';
import {assembleExact} from './exact-assembly.mjs';
const original=await fs.readFile(path.resolve(root,'../src/test/resources/local-alt-return.boc'));
assert.ok(original.equals(assembleExact(await fs.readFile(path.join(root,'fixtures/local-alt-return.tasm'),'utf8'))),'independent instruction fixture');
const native=marker=>beginCell().storeUint(0,4).storeUint(marker,8).endCell();
const jetton=marker=>beginCell().storeUint(1,4).storeInt(0,8).storeUint(123,256).storeUint(marker,8).endCell();
const malformed=[beginCell().storeUint(2,4).endCell(),beginCell().storeUint(0,3).endCell(),
    beginCell().storeUint(1,4).storeUint(0,263).endCell(),beginCell().storeUint(0,4).endCell(),
    beginCell().storeUint(1,4).storeUint(0,264).endCell()];
const probes=[],expected=[];
for(const [method,value] of [[90048,12],[90049,7],[90056,12]]) {
    probes.push({method,args:[]});expected.push({value,exit:0});
}
for(const marker of [0,7,255]) {
    probes.push({method:90055,args:[{type:'tuple',items:[{type:'slice',cell:native(marker)}]}]});expected.push({value:12,exit:0});
}
for(const items of [[],[{type:'int',value:0n}],[{type:'cell',cell:native(7)}],[{type:'slice',cell:native(7)},{type:'int',value:0n}]]) {
    probes.push({method:90055,args:[{type:'tuple',items}]});expected.push({value:null,exit:7});
}
for(const [method,width] of [[90050,0],[90051,1],[90052,2],[90053,3],[90054,15]]) {
    for(const item of [
        {type:'tuple',items:Array.from({length:width},(_,i)=>({type:'int',value:BigInt(i)}))},
        {type:'tuple',items:Array.from({length:width+1},(_,i)=>({type:'int',value:BigInt(i)}))},
        {type:'int',value:0n},
    ]) {
        probes.push({method,args:[item]});expected.push({value:7,exit:item.type==='tuple'&&item.items.length===width?0:7});
    }
}
for(const method of [90046,90047])for(const prefix of method===90046?[0]:[-999,0,99]) {
    const add=(cell,value,exit=0)=>{probes.push({method,args:[...(method===90047?[prefix]:[]),{type:'slice',cell}]});expected.push({value,exit});};
    for(const marker of [0,7,255]) {add(native(marker),100+4+marker+prefix);add(jetton(marker),100+268+marker+prefix);}
    malformed.forEach((cell,i)=>add(cell,null,i===0?261:9));
}
const results=[];
const rawBocs=new Map();
for(const language of ['func','tolk'])for(const normalize of [false,true]) {
    const directory=path.join(root,'artifacts/local-alt-return',language,normalize?'normalized':'raw');
    const output=await decompile(original,directory,{local:true,refresh:true,language,normalize});
    assert.equal(output.complete,true,JSON.stringify(output.diagnostics));
    const compiled=await recompile(output,directory);assert.equal(compiled.status,'ok',compiled.message);
    if(normalize)assert.ok(rawBocs.get(language).equals(compiled.boc),language+': normalization preserves serialized BOC');
    else rawBocs.set(language,compiled.boc);
    const tests=await compareGetters(original,compiled.boc,probes);
    tests.forEach((test,i)=>{
        assert.equal(test.sameObservedBehavior,true,language+': '+JSON.stringify(test));
        assert.equal(test.before.exitCode,expected[i].exit);
        if(expected[i].exit===0)assert.deepEqual(test.before.stack,[{type:'int',value:String(expected[i].value)}]);
    });
    results.push({language,normalize,probes:tests.length,passed:true,exactGas:tests.filter(t=>t.before.gasUsed===t.after.gasUsed).length});
    console.log(`${language} ${normalize?'normalized':'raw'}: ${tests.length} local-return probes passed`);
}
await writeJson(path.join(root,'artifacts/local-alt-return/results.json'),results);
