import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, readJson, writeJson, compareBoc } from './lib.mjs';

const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.join(root,'../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
const hash = createHash('sha256').update(await fs.readFile(jar)).digest('hex');
const directory = path.join(root,'artifacts/acton-local/default/tolk');
const before = {}, after = {}, rules = {};
const patterns = {
  opaqueContextPrimitives:/\basm_GETPARAM_(?:3|4|5|6|7|8|10)\b/g,
  legacyPrimitiveCalls:/\btvm[A-Z][A-Za-z0-9_]*\s*\(/g,
  libraryNamedWrappers:/\b[A-Za-z][A-Za-z0-9_]*Tvm\d*\s*\(/g,
};
const summary = await readJson(path.join(directory,'report.json'));
assert.equal(summary.cases.length,8);
for (const entry of summary.cases) {
  const folder = path.join(directory,entry.id);
  const raw = await readJson(path.join(folder,'raw/response.json'));
  const normalized = await readJson(path.join(folder,'response.json'));
  assert.equal(normalized.complete,true);
  assert.deepEqual(raw.normalizations,[]);
  for (const [stage,normalize] of [['raw',false],['',true]]) {
    const request = await readJson(path.join(folder,stage,'request.json'));
    assert.equal(request.endpoint,`local:${hash}:exact=false:language=tolk:normalize=${normalize}`);
  }
  for (const [stage,response] of [['raw',raw],['',normalized]]) for (const file of response.files)
    assert.equal(await fs.readFile(path.join(folder,stage,'sources',file.name),'utf8'),file.content);
  const identity = compareBoc(await fs.readFile(path.join(folder,'raw/recompiled.boc')),await fs.readFile(path.join(folder,'recompiled.boc')));
  assert.equal(identity.sameSerializedBoc,true);
  assert.equal(entry.normalization.comparison.sameSerializedBoc,true);
  for (const [name,pattern] of Object.entries(patterns)) {
    before[name] = (before[name] ?? 0)+[...raw.files[0].content.matchAll(pattern)].length;
    after[name] = (after[name] ?? 0)+[...normalized.files[0].content.matchAll(pattern)].length;
  }
  for (const change of normalized.normalizations.filter(change=>change.rule.startsWith('tolk-stdlib-')))
    rules[change.rule] = (rules[change.rule] ?? 0)+1;
  console.log(entry.id+': current JAR, both sources and raw/normalized BOC verified');
}
const report = await readJson(path.join(root,'artifacts/tolk-stdlib/report.json'));
assert.equal(report.cases.length,17);
let getterProbes = 0;
for (const entry of report.cases) {
  assert.equal(entry.request.endpoint,`local:${hash}:exact=false:language=tolk:normalize=true`);
  assert.equal(entry.comparison.sameSerializedBoc,true);
  const folder = path.join(root,'artifacts/tolk-stdlib',entry.id);
  const identity = compareBoc(await fs.readFile(path.join(folder,'raw/recompiled.boc')),await fs.readFile(path.join(folder,'recompiled.boc')));
  assert.equal(identity.sameSerializedBoc,true);
  for (const execution of entry.executions) {
    execution.beforeAfter.forEach(probe=>assert.deepEqual(probe.before,probe.after));
    execution.originalAfter.forEach(probe=>assert.equal(probe.sameObservedBehavior,true));
    getterProbes += execution.beforeAfter.length;
  }
}
assert.equal(getterProbes,report.getterProbes);
const result = { checkedAt:new Date().toISOString(), jarSha256:hash, templates:8, fixtures:17, getterProbes, before, after, rules };
await writeJson(path.join(root,'artifacts/tolk-stdlib/audit.json'),result);
console.log(JSON.stringify(result,null,2));
