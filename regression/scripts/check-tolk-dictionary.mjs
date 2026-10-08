import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { beginCell, Dictionary } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
process.env.FUNC_BACKEND='native';
const stdlib=await fs.readFile(path.join(root,'fixtures/stdlib.fc'),'utf8');
const int=value=>({type:'int',value:BigInt(value)});
const empty=beginCell().endCell();
const value=beginCell().storeUint(0xab,8).endCell();
const cases=[];
for(const opcode of ['DICTGET','DICTIGET','DICTUGET','DICTGETREF','DICTIGETREF','DICTUGETREF'])
    for(const code of [9,501])cases.push({opcode,code});
cases.push({opcode:'DICTUGET',code:9,discard:true});
const report=[];
for(const fixture of cases){
    const {opcode,code,discard}=fixture;
    const sliceKey=opcode==='DICTGET'||opcode==='DICTGETREF';
    const signed=opcode.startsWith('DICTI');
    const refResult=opcode.endsWith('REF');
    const keyCodec=sliceKey?Dictionary.Keys.Buffer(1):signed?Dictionary.Keys.Int(8):Dictionary.Keys.Uint(8);
    const dict=Dictionary.empty(keyCodec,refResult?Dictionary.Values.Cell():{
        serialize:(_,b)=>b.storeUint(7,8).storeRef(value),parse:s=>s.asCell(),
    });
    dict.set(sliceKey?Buffer.from([0]):0,value);
    const valid=beginCell().storeDictDirect(dict).endCell();
    const keys=sliceKey?[0,7,255].map(k=>({type:'slice',cell:beginCell().storeUint(k,8).endCell()})):
        (signed?[-129,0,127]:[-1,0,255]).map(int);
    const probes=[{type:'null'},{type:'cell',cell:valid},{type:'cell',cell:empty}].flatMap(d=>
        keys.flatMap(key=>[-1,8,257].map(width=>({method:90063,args:[d,int(width),key]}))));
    const id=opcode.toLowerCase()+'-'+code+(discard?'-discard':'');
    const directory=path.join(root,'artifacts/tolk-dictionary',id);
    const keyType=sliceKey?'slice':'int';
    const resultType=refResult?'cell':'slice';
    const source=`#include "stdlib.fc"; () recv_internal() { }
${resultType} lookup(cell d,int width,${keyType} key) impure asm(key d width) "${opcode}" "${code} THROWIFNOT";
${discard?'int':resultType} check(cell d,int width,${keyType} key) impure method_id(90063) { ${discard?'lookup(d,width,key); return 7;':'return lookup(d,width,key);'} }`;
    const original=await compile({targets:['main.fc'],sources:{'main.fc':source,'stdlib.fc':stdlib}});
    assert.equal(original.status,'ok',id+': '+original.message);
    const boc=Buffer.from(original.codeBoc,'base64');
    const raw=await decompile(boc,path.join(directory,'raw'),{local:true,language:'tolk',normalize:false});
    const normalized=await decompile(boc,directory,{local:true,language:'tolk'});
    assert.equal(raw.complete,true,id+': '+JSON.stringify(raw.diagnostics));
    assert.equal(normalized.complete,true);
    const before=await recompile(raw,path.join(directory,'raw'));
    const after=await recompile(normalized,directory);
    assert.equal(before.status,'ok',id+': '+before.message);
    assert.equal(after.status,'ok',id+': '+after.message);
    const comparison=compareBoc(before.boc,after.boc);
    assert.equal(comparison.sameSerializedBoc,true);
    const getters=await compareGetters(before.boc,after.boc,probes);
    const originalGetters=await compareGetters(boc,after.boc,probes);
    for(const g of getters){assert.equal(g.sameObservedBehavior,true);assert.equal(g.before.gasUsed,g.after.gasUsed);}
    for(const g of originalGetters)assert.equal(g.sameObservedBehavior,true,id+': '+JSON.stringify(g));
    const func=await decompile(boc,path.join(directory,'func'),{local:true,language:'func'});
    assert.equal(func.complete,true);
    const compiledFunc=await recompile(func,path.join(directory,'func'));
    assert.equal(compiledFunc.status,'ok',id+': FunC: '+compiledFunc.message);
    const funcGetters=await compareGetters(boc,compiledFunc.boc,probes);
    for(const g of funcGetters)assert.equal(g.sameObservedBehavior,true,id+': FunC: '+JSON.stringify(g));
    await fs.writeFile(path.join(directory,'original.fc'),source);
    await fs.writeFile(path.join(directory,'original.fif'),original.fiftCode);
    const originalComparison=compareBoc(boc,before.boc);
    report.push({id,comparison,originalComparison,getters,originalGetters,funcComparison:compareBoc(boc,compiledFunc.boc),funcGetters});
    console.log(`${id}: ${getters.length} probes on both languages; raw/normalized BOC+gas and original behavior passed; original code=${originalComparison.sameCodeCell}`);
}
await writeJson(path.join(root,'artifacts/tolk-dictionary/report.json'),report);
