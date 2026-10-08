import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Address, beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';

process.env.FUNC_BACKEND = 'native';
const directory = path.join(root, 'artifacts/tolk-normalization');
const address = new Address(0, Buffer.alloc(32, 1));
const data = beginCell().storeAddress(address).endCell();
const cases = [
  { id:'unknown-address-id', source:'slice arbitrary() method_id(90001) { (slice a, slice tail) = load_std_addr(get_data().begin_parse()); return a; }',
    methods:[90001], rules:['address-getter-return'], fragment:'fun fn_90001(): address' },
  { id:'hash-with-wrong-signature', source:'int arbitrary() method_id(83229) { return 7; }',
    methods:[83229], rules:[], fragment:'fun fn_83229(): int' },
  { id:'internal-owner-call', source:'slice owner() method_id { (slice a, slice tail) = load_std_addr(get_data().begin_parse()); return a; } slice forward() method_id(90002) { return owner(); }',
    partial:true, rules:[], fragment:'fun fn_83229(): slice' },
  { id:'nullable-address', source:'slice optional(int flag) method_id(90003) { if (flag) { return null(); } (slice a, slice tail) = load_std_addr(get_data().begin_parse()); return a; }',
    probes:[{method:90003,args:[0]},{method:90003,args:[1]}], rules:[], fragment:'fun fn_90003' },
];
const report = [];
for (const fixture of cases) {
  const target = path.join(directory, fixture.id);
  const original = await compile({targets:['main.fc'], sources:{
    'main.fc':'#include "stdlib.fc";\n() recv_internal() impure { }\n' + fixture.source,
    'stdlib.fc':await fs.readFile(path.join(root,'fixtures/stdlib.fc'),'utf8'),
  }});
  assert.equal(original.status,'ok',original.message);
  const boc = Buffer.from(original.codeBoc,'base64');
  const raw = await decompile(boc,path.join(target,'raw'),{local:true,language:'tolk',normalize:false});
  const normalized = await decompile(boc,target,{local:true,language:'tolk'});
  assert.equal(raw.complete,!fixture.partial);
  assert.equal(normalized.complete,!fixture.partial);
  assert.deepEqual(normalized.normalizations.map(change => change.rule), fixture.rules);
  assert.ok(normalized.files[0].content.includes(fixture.fragment));
  if (fixture.partial) {
    // FunC lowers this large method-ID call through c3 + EXECUTE, outside current parser coverage.
    assert.ok(raw.diagnostics.some(diagnostic => diagnostic.mnemonic === 'EXECUTE'));
    assert.deepEqual(raw.files,normalized.files);
    assert.deepEqual(raw.diagnostics,normalized.diagnostics);
    assert.equal((await recompile(raw,path.join(target,'raw'))).status,'incomplete');
    assert.equal((await recompile(normalized,target)).status,'incomplete');
    report.push({id:fixture.id,partial:true,changes:normalized.normalizations,diagnostics:raw.diagnostics});
    console.log(fixture.id + ': known dynamic EXECUTE is partial; all files/diagnostics unchanged, normalization skipped');
    continue;
  }
  const rawResult = await recompile(raw,path.join(target,'raw'));
  const result = await recompile(normalized,target);
  assert.equal(rawResult.status,'ok',rawResult.message);
  assert.equal(result.status,'ok',result.message);
  const comparison = compareBoc(rawResult.boc,result.boc);
  assert.equal(comparison.sameCodeCell,true,fixture.id);
  const probes = fixture.probes ?? fixture.methods.map(method => ({method,args:[]}));
  const getters = await compareGetters(boc,result.boc,probes,{data});
  getters.forEach(probe => assert.equal(probe.sameObservedBehavior,true,JSON.stringify(probe)));
  const truncated = await compareGetters(boc,result.boc,probes,{data:beginCell().endCell()});
  truncated.forEach(probe => assert.equal(probe.sameObservedBehavior,true,JSON.stringify(probe)));
  report.push({id:fixture.id,comparison,changes:normalized.normalizations,getters,truncated});
  console.log(fixture.id + ': raw/normalized TVM identical; normal and truncated storage match original');
}
await writeJson(path.join(directory,'report.json'),report);
