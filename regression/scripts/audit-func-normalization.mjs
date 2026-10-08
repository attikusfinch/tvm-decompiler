import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, readJson, writeJson, compareBoc } from './lib.mjs';

const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.join(root, '../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
const hash = createHash('sha256').update(await fs.readFile(jar)).digest('hex');
const templates = path.join(root, 'artifacts/acton-local/default');
const before = {}, after = {}, rules = {};
const patterns = {
  generatedBindings:/(?<!const )\b(?:int|slice|cell|builder|tuple|cont)\s+[a-zA-Z][\w]*_[0-9a-f]{2,}(?=\s*[=,)])/g,
  tupleLoads:/\([^;\n]*\)\s*=\s*[^;]*\.(?:load_uint|load_int|load_bits|load_grams|load_ref|load_std_addr|load_opt_std_addr)\s*\(/g,
  opaqueMessagePrimitives:/\basm_INMSGPARAM_[12]\b/g,
  mutatingLoads:/~load_(?:uint|int|bits|grams|ref|std_addr_cursor|opt_std_addr_cursor)\(/g,
  prefixLabels:/\bconst slice PREFIX_[A-F0-9]{8}/g,
  namedSendModes:/\bsend_raw_message\([^;]*,\s*SEND_MODE_\w+/g,
};
const summary = await readJson(path.join(templates, 'report.json'));
assert.equal(summary.cases.length, 8);
for (const entry of summary.cases) {
  const folder = path.join(templates, entry.id);
  const raw = await readJson(path.join(folder, 'raw/response.json'));
  const normalized = await readJson(path.join(folder, 'response.json'));
  assert.equal(normalized.complete, true);
  assert.deepEqual(raw.normalizations, []);
  assert.equal(raw.files[1].content, normalized.files[1].content);
  for (const [stage, normalize] of [['raw',false], ['',true]]) {
    const request = await readJson(path.join(folder, stage, 'request.json'));
    assert.equal(request.endpoint, `local:${hash}:exact=false:language=func:normalize=${normalize}`);
  }
  const rawBoc = await fs.readFile(path.join(folder, 'raw/recompiled.boc'));
  const boc = await fs.readFile(path.join(folder, 'recompiled.boc'));
  const identity = compareBoc(rawBoc,boc);
  assert.equal(identity.sameCodeCell,true);
  assert.equal(identity.sameSerializedBoc,true);
  assert.equal(entry.normalization.comparison.sameSerializedBoc,true);
  for (const [name, pattern] of Object.entries(patterns)) {
    before[name] = (before[name] ?? 0) + [...raw.files[0].content.matchAll(pattern)].length;
    after[name] = (after[name] ?? 0) + [...normalized.files[0].content.matchAll(pattern)].length;
  }
  for (const change of normalized.normalizations) rules[change.rule] = (rules[change.rule] ?? 0) + 1;
  console.log(entry.id+': current JAR, raw/normalized code cell and BOC bytes identical');
}
const fixtures = await readJson(path.join(root, 'artifacts/func-normalization/report.json'));
assert.equal(fixtures.cases.length,31);
let getterProbes = 0;
for (const entry of fixtures.cases) {
  assert.equal(entry.request.endpoint, `local:${hash}:exact=false:language=func:normalize=true`);
  if (entry.partial) {
    assert.ok(entry.diagnostics.length);
    continue;
  }
  assert.equal(entry.comparison.sameCodeCell,true);
  assert.equal(entry.comparison.sameSerializedBoc,true);
  for (const execution of entry.executions) {
    for (const probe of execution.beforeAfter) assert.deepEqual(probe.before,probe.after);
    for (const probe of execution.originalAfter) assert.equal(probe.sameObservedBehavior,true);
    getterProbes += execution.beforeAfter.length;
  }
}
const result = { checkedAt:new Date().toISOString(), jarSha256:hash, templates:8,
  fixtures:fixtures.cases.length, completeFixtures:fixtures.cases.filter(c=>!c.partial).length,
  getterProbes, before, after, rules };
await writeJson(path.join(root, 'artifacts/func-normalization/audit.json'),result);
console.log(JSON.stringify(result,null,2));
