import { compilerCatalog } from '../fixtures/compiler-catalog.mjs';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { assertCatalogOracle } from './catalog-oracle.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
process.env.FUNC_BACKEND='native';
const rules=['integer-match','nested-integer-match'];
const expected = new Map([
    ['nested-integer-match',['nested-integer-match']],
    ['nested-if-source',['nested-integer-match']],
    ['nested-else-match',['integer-match']],
]);
const report = await verifyRecoveryFixtures('tolk-catalog',compilerCatalog.map(c=>({...c,rules:expected.get(c.id)??[]})),rules);
assertCatalogOracle(report);
// The shared raw parser also serves FunC: exercise the new literal continuation
// and zero-operand NOP on that backend, not only the Tolk normalizer.
const lambda = compilerCatalog.find(c => c.id === 'lambda-inlining');
const target = path.join(root,'artifacts/tolk-catalog',lambda.id);
const boc = await fs.readFile(path.join(target,'input.boc'));
const func = await decompile(boc,path.join(target,'func'),{local:true,language:'func'});
assert.equal(func.complete,true,JSON.stringify(func.diagnostics));
const result = await recompile(func,path.join(target,'func'));
assert.equal(result.status,'ok',result.message);
const funcGetters = await compareGetters(boc,result.boc,lambda.probes);
for (const g of funcGetters) assert.equal(g.sameObservedBehavior,true,JSON.stringify(g));
Object.assign(report.find(e=>e.id===lambda.id),{funcGetters,funcComparison:compareBoc(boc,result.boc)});
await writeJson(path.join(root,'artifacts/tolk-catalog/report.json'),report);
console.log(`lambda-inlining: FunC literal continuation and NOP, ${funcGetters.length} probes passed`);
