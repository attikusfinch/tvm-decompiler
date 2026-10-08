import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';

// CP0 callback bytes arrive only as runtime arguments. Decompilation gets
// the contract BOC, with no callback body or source signature as a hint.
process.env.FUNC_BACKEND = 'native';
const stdlib = await fs.readFile(path.join(root, 'fixtures/stdlib.fc'), 'utf8');
const code = bytes => beginCell().storeBuffer(Buffer.from(bytes,'hex')).endCell();
const int = n => ({type:'int',value:BigInt(n)});
const slice = bytes => ({type:'slice',cell:code(bytes)});
const values = [-3,0,1,7,100].map(int).concat({type:'null'}, {type:'cell',cell:code('cafe')});
const cases = [
    { id:'fixed-zero-one', args:'slice s', asm:'BLESS" "0 1 CALLXARGS', returns:'int', probes:[
        '802a','807f','80078009','', '30', 'f2c191',
    ].map(bytes=>({method:90047,args:[slice(bytes)]})) },
    { id:'fixed-one-one', args:'int n, slice s', asm:'BLESS" "1 1 CALLXARGS', returns:'int', probes:
        ['','a4','a5','30','802a','807fa0'].flatMap(bytes=>values.map(n=>({method:90047,args:[n,slice(bytes)]}))) },
    { id:'fixed-one-two', args:'int n, slice s', asm:'BLESS" "1 2 CALLXARGS', returns:'(int,int)', probes:
        ['20','a4','80078009','30'].flatMap(bytes=>values.map(n=>({method:90047,args:[n,slice(bytes)]}))) },
    { id:'fixed-one-zero', args:'int n, slice s', asm:'BLESS" "1 0 CALLXARGS', returns:'()', probes:
        ['','30','802a'].flatMap(bytes=>values.map(n=>({method:90047,args:[n,slice(bytes)]}))) },
    { id:'fixed-cell-code', args:'int n, cell c', asm:'CTOS" "BLESS" "1 1 CALLXARGS', returns:'int', probes:
        ['a4','30','802a',''].flatMap(bytes=>values.map(n=>({method:90047,args:[n,{type:'cell',cell:code(bytes)}]}))) },
    { id:'static-jump-tail', args:'int n', asm:'<{ INC }>CONT" "JMPX', returns:'int', after:'+ 99', originalExact:false,
        probes:values.map(n=>({method:90047,args:[n]})) },
];
const report=[];
for (const fixture of cases) {
    const directory=path.join(root,'artifacts/tolk-dispatch',fixture.id);
    const source=`#include "stdlib.fc"; () recv_internal() { } ${fixture.returns} invoke(${fixture.args}) impure asm "${fixture.asm}"; ${fixture.returns} evaluate(${fixture.args}) impure method_id(90047) { return invoke(${fixture.args.split(', ').map(p=>p.split(' ').at(-1)).join(', ')}) ${fixture.after??''}; }`;
    const original=await compile({targets:['main.fc'],sources:{'main.fc':source,'stdlib.fc':stdlib}});
    assert.equal(original.status,'ok',fixture.id+': '+original.message);
    const boc=Buffer.from(original.codeBoc,'base64');
    const raw=await decompile(boc,path.join(directory,'raw'),{local:true,language:'tolk',normalize:false});
    const normalized=await decompile(boc,directory,{local:true,language:'tolk'});
    assert.equal(raw.complete,true,fixture.id+': '+JSON.stringify(raw.diagnostics));
    assert.equal(normalized.complete,true);
    const before=await recompile(raw,path.join(directory,'raw'));
    const after=await recompile(normalized,directory);
    assert.equal(before.status,'ok',fixture.id+': '+before.message);
    assert.equal(after.status,'ok',fixture.id+': '+after.message);
    const comparison=compareBoc(before.boc,after.boc);
    assert.equal(comparison.sameSerializedBoc,true);
    const getters=await compareGetters(before.boc,after.boc,fixture.probes);
    const originalGetters=await compareGetters(boc,after.boc,fixture.probes);
    for(const g of getters){assert.equal(g.sameObservedBehavior,true);assert.equal(g.before.gasUsed,g.after.gasUsed);}
    for(const g of originalGetters)assert.equal(g.sameObservedBehavior,true,fixture.id+': '+JSON.stringify(g));
    const originalComparison=compareBoc(boc,before.boc);
    if(fixture.originalExact!==false){
        assert.equal(originalComparison.sameCodeCell,true,fixture.id+': original Tolk code');
        for(const g of originalGetters)assert.equal(g.before.gasUsed,g.after.gasUsed,fixture.id+': original Tolk gas');
    }
    const func=await decompile(boc,path.join(directory,'func'),{local:true,language:'func'});
    assert.equal(func.complete,true,fixture.id+': FunC diagnostics');
    const compiledFunc=await recompile(func,path.join(directory,'func'));
    assert.equal(compiledFunc.status,'ok',fixture.id+': FunC: '+compiledFunc.message);
    const funcComparison=compareBoc(boc,compiledFunc.boc);
    if(fixture.originalExact!==false)assert.equal(funcComparison.sameCodeCell,true,fixture.id+': original FunC code');
    const funcGetters=await compareGetters(boc,compiledFunc.boc,fixture.probes);
    for(const g of funcGetters){assert.equal(g.sameObservedBehavior,true,fixture.id+': FunC: '+JSON.stringify(g));if(fixture.originalExact!==false)assert.equal(g.before.gasUsed,g.after.gasUsed,fixture.id+': FunC gas');}
    await fs.writeFile(path.join(directory,'original.fc'),source);
    await fs.writeFile(path.join(directory,'original.fif'),original.fiftCode);
    report.push({id:fixture.id,comparison,originalComparison,getters,originalGetters,funcComparison,funcGetters});
    console.log(`${fixture.id}: ${getters.length} probes, original behavior and raw/normalized BOC+gas passed; original/raw identical=${originalComparison.sameCodeCell}`);
}
await writeJson(path.join(root,'artifacts/tolk-dispatch/report.json'),report);
