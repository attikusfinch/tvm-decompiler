import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { beginCell } from '@ton/core';
import { root, compile, compareBoc, compareGetters, decompile, writeJson } from './lib.mjs';
process.env.FUNC_BACKEND='native';
const stdlib=await fs.readFile(path.join(root,'fixtures/stdlib.fc'),'utf8');
const directory=path.join(root,'artifacts/dispatch-ambiguity');
await fs.mkdir(directory,{recursive:true});
const report=[];
for(const [id,call,mnemonic] of [
    ['execute','EXECUTE','EXECUTE'],
    ['variable-call','0 -1 CALLXARGS','CALLXARGS_VAR'],
    ['dynamic-jump','JMPX','JMPX'],
]) {
    const originals=[];
    for(const [name,type] of [['scalar','int'],['tensor','(int,int)']]) {
        const source=`#include "stdlib.fc"; () recv_internal() { } ${type} invoke(slice s) impure asm "BLESS" "${call}"; ${type} evaluate(slice s) impure method_id(90048) { return invoke(s); }`;
        const result=await compile({targets:['main.fc'],sources:{'main.fc':source,'stdlib.fc':stdlib}});
        assert.equal(result.status,'ok',result.message);
        const boc=Buffer.from(result.codeBoc,'base64');
        await fs.writeFile(path.join(directory,`${id}-${name}.fc`),source);
        await fs.writeFile(path.join(directory,`${id}-${name}.boc`),boc);
        originals.push(boc);
    }
    const comparison=compareBoc(...originals);
    assert.equal(comparison.sameCodeCell,true,id+': erased source signature');
    const probes=['802a','80078009',''].map(bytes=>({method:90048,args:[{type:'slice',cell:beginCell().storeBuffer(Buffer.from(bytes,'hex')).endCell()}]}));
    const getters=await compareGetters(...originals,probes);
    assert.deepEqual(getters.map(g=>g.before.stack?.length),[1,2,0],id+': runtime width');
    const diagnostics=[];
    for(const language of ['func','tolk']) {
        const raw=await decompile(originals[0],path.join(directory,id,language,'raw'),{local:true,language,normalize:false});
        const normalized=await decompile(originals[0],path.join(directory,id,language),{local:true,language});
        assert.equal(raw.complete,false);
        assert.ok(raw.diagnostics.some(d=>d.mnemonic===mnemonic),id+': '+JSON.stringify(raw.diagnostics));
        assert.deepEqual(raw.files,normalized.files);
        assert.deepEqual(raw.diagnostics,normalized.diagnostics);
        assert.deepEqual(normalized.normalizations,[]);
        diagnostics.push({language,diagnostics:raw.diagnostics});
    }
    report.push({id,comparison,getters,diagnostics});
    console.log(`${id}: scalar/tensor source signatures compile to the same code; runtime widths 1/2/0; explicit diagnostics on both languages`);
}
await writeJson(path.join(directory,'report.json'),report);
