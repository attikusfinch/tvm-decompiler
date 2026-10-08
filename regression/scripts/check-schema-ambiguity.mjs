import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { compilerCatalog } from '../fixtures/compiler-catalog.mjs';
import { compileTolk } from './tolk.mjs';
import { root, compareBoc, compareGetters, decompile, writeJson } from './lib.mjs';

// Different author-level types/schemas compile to exactly the same TVM.
// These are compiler oracles; their source never enters normalization.
const fixture = id => compilerCatalog.find(c => c.id === id);
const readCell = fixture('read-cell');
const nested = fixture('nested-layout');
const generic = fixture('generic-inlining');
const uint = fixture('read-uint8');
const enumeration = fixture('enum-sparse');
const boolean = fixture('read-bool');
const cases = [
    { id:'cell-string', sources:[readCell.source,fixture('read-string').source], probes:readCell.probes },
    { id:'nested-flat-layout', sources:[nested.source,
        'struct Flat {a:uint8,b:coins,c:cell} @method_id(90060) fun check(body:slice):(int,int,cell){val o=Flat.fromSlice(body);return(o.a,o.b,o.c);}'], probes:nested.probes },
    { id:'generic-inlining', sources:[generic.source,'@method_id(90060) fun check(x:int):int{return x+1;}'], probes:generic.probes },
    { id:'width-type-alias', sources:[uint.source,uint.source.replace('struct Box { value:uint8 }','type UserId=uint8\nstruct Box { value:UserId }')], probes:uint.probes },
    { id:'enum-member-names', sources:[enumeration.source,enumeration.source.replace('A=1, B=7, C=255','First=1, Second=7, Third=255')], probes:enumeration.probes },
    { id:'bool-int1', sources:[boolean.source,boolean.source.replace('value:bool','value:int1').replace('):bool','):int')], probes:boolean.probes },
];
const report=[];
for (const fixture of cases) {
    const directory=path.join(root,'artifacts/schema-ambiguity',fixture.id);
    await fs.mkdir(directory,{recursive:true});
    const bocs=[];
    for (const [index,source] of fixture.sources.entries()) {
        const result=await compileTolk({sources:{'main.tolk':source}});
        assert.equal(result.status,'ok',fixture.id+': '+result.message);
        const boc=Buffer.from(result.codeBoc,'base64');
        bocs.push(boc);
        await fs.writeFile(path.join(directory,`source-${index}.tolk`),source);
        await fs.writeFile(path.join(directory,`source-${index}.boc`),boc);
    }
    const comparison=compareBoc(...bocs);
    assert.equal(comparison.sameCodeCell,true,fixture.id+': erased source fact');
    assert.equal(comparison.sameSerializedBoc,true,fixture.id+': same compiled BOC');
    const getters=await compareGetters(...bocs,fixture.probes);
    for(const g of getters){assert.equal(g.sameObservedBehavior,true);assert.equal(g.before.gasUsed,g.after.gasUsed);}
    const raw=await decompile(bocs[0],path.join(directory,'raw'),{local:true,language:'tolk',normalize:false});
    const normalized=await decompile(bocs[0],directory,{local:true,language:'tolk'});
    assert.equal(raw.complete,true,fixture.id+': '+JSON.stringify(raw.diagnostics));
    assert.equal(normalized.complete,true);
    report.push({id:fixture.id,comparison,getters,normalizations:normalized.normalizations});
    console.log(`${fixture.id}: different source facts, identical BOC, ${getters.length} runtime probes including gas`);
}
await writeJson(path.join(root,'artifacts/schema-ambiguity/report.json'),report);
