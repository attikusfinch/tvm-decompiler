import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Address, beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson, version } from './lib.mjs';

process.env.FUNC_BACKEND = 'native';
const directory = path.join(root, 'artifacts/func-stdlib');
const stdlib = await fs.readFile(path.join(root, 'fixtures/stdlib.fc'), 'utf8');
const empty = beginCell().endCell();
const ref = beginCell().storeUint(123, 32).endCell();
const address = new Address(0, Buffer.alloc(32, 1));
const cases = [
  { id:'clock', source:'int check() method_id(90090) { return now(); }', fragment:'now_tvm()', rule:'func-stdlib-wrapper' },
  { id:'address', source:'slice check() method_id(90090) { return my_address(); }', fragment:'my_address_tvm()', rule:'func-stdlib-wrapper' },
  { id:'balance', source:'[int, cell] check() method_id(90090) { return get_balance(); }', fragment:'get_balance_tvm()', rule:'func-stdlib-wrapper' },
  { id:'current-logical-time', source:'int check() method_id(90090) { return cur_lt(); }', fragment:'cur_lt_tvm()', rule:'func-stdlib-wrapper' },
  { id:'block-logical-time', source:'int check() method_id(90090) { return block_lt(); }', fragment:'block_lt_tvm()', rule:'func-stdlib-wrapper' },
  { id:'random-seed', source:'int check() impure method_id(90090) { return get_seed(); }', fragment:'get_seed()', rule:'func-stdlib-call' },
  // The shared raw IR can discard an unused context read; normalization must preserve that stage too.
  { id:'discarded-context-read', source:'int effectful_clock() impure asm "NOW"; int check() impure method_id(90090) { effectful_clock(); return 7; }', fragment:'return 7;' },
  { id:'repeated-context-reads', source:'(int, int, slice, [int, cell]) check() method_id(90090) { return (now(), now(), my_address(), get_balance()); }', fragment:'get_balance_tvm()', rule:'func-stdlib-wrapper' },
  { id:'mycode-outside-library', source:'cell original_code() asm "MYCODE"; int check() method_id(90090) { return original_code().cell_depth(); }', fragment:'asm_GETPARAM_10', noName:'my_code_tvm' },
  { id:'dictionary-cursor', source:'cell check() method_id(90090) { slice s = get_data().begin_parse(); return s~load_dict(); }', fragment:'~load_dict()', data:beginCell().storeMaybeRef(ref).endCell(), extraData:[beginCell().storeMaybeRef(null).endCell(), beginCell().storeBit(1).endCell()] },
  // LDDICT/LDOPTREF have identical encoding; the existing raw registry chooses load_dict.
  { id:'optional-ref-cursor', source:'cell check() method_id(90090) { slice s = get_data().begin_parse(); return s~load_maybe_ref(); }', fragment:'~load_dict()', sameOriginalAs:'dictionary-cursor', data:beginCell().storeMaybeRef(ref).endCell(), extraData:[beginCell().storeMaybeRef(null).endCell(), beginCell().storeBit(1).endCell()] },
  { id:'message-address-cursor', source:'slice check() method_id(90090) { slice s = get_data().begin_parse(); return s~load_msg_addr(); }', fragment:'~load_msg_addr()', data:beginCell().storeAddress(address).endCell(), extraData:[beginCell().storeAddress(null).endCell(), beginCell().storeUint(2, 2).endCell()] },
  { id:'library-load-chain', source:'(cell, cell, slice, int) check() method_id(90090) { slice s = get_data().begin_parse(); cell d = s~load_dict(); cell r = s~load_maybe_ref(); slice a = s~load_msg_addr(); int c = s~load_coins(); return (d,r,a,c); }', fragment:'~load_msg_addr()', data:beginCell().storeMaybeRef(ref).storeMaybeRef(ref).storeAddress(address).storeCoins(123).endCell(), extraData:[beginCell().storeMaybeRef(null).storeMaybeRef(null).storeAddress(null).storeCoins(0).endCell()] },
  { id:'live-dictionary-snapshot', source:'(cell, cell) check() method_id(90090) { slice s = get_data().begin_parse(); slice saved = s; cell first = s~load_dict(); cell same = saved~load_dict(); return (first,same); }', fragment:'~load_dict()', data:beginCell().storeMaybeRef(ref).endCell(), extraData:[beginCell().storeMaybeRef(null).endCell()] },
];
await fs.mkdir(directory, { recursive:true });
const report = { checkedAt:new Date().toISOString(), compiler:await version(), cases:[] };
const originalBocs = new Map();
for (const fixture of cases) {
  const target = path.join(directory, fixture.id);
  const original = await compile({targets:['main.fc'], sources:{'main.fc':'#include "stdlib.fc";\n() recv_internal() impure { }\n'+fixture.source, 'stdlib.fc':stdlib}});
  assert.equal(original.status,'ok',fixture.id+': '+original.message);
  const boc = Buffer.from(original.codeBoc,'base64');
  if (fixture.sameOriginalAs) assert.deepEqual(boc,originalBocs.get(fixture.sameOriginalAs),fixture.id+': alias forms must compile identically');
  originalBocs.set(fixture.id,boc);
  const raw = await decompile(boc,path.join(target,'raw'),{local:true,language:'func',normalize:false});
  const normalized = await decompile(boc,target,{local:true,language:'func'});
  assert.deepEqual(raw.diagnostics,normalized.diagnostics);
  assert.equal(normalized.complete,true,fixture.id+': '+JSON.stringify(normalized.diagnostics));
  assert.equal(raw.files[1].content,normalized.files[1].content);
  assert.ok(normalized.files[1].content.includes('FunC Standard Library is free software'));
  assert.ok(normalized.files[1].content.includes('“persistent data”'), 'CLI must preserve UTF-8 library comments');
  const main = normalized.files[0].content;
  assert.ok(main.includes(fixture.fragment),fixture.id+': '+main);
  if (fixture.noName) assert.ok(!main.includes(fixture.noName),main);
  if (fixture.rule) assert.ok(normalized.normalizations.some(change=>change.rule===fixture.rule),main);
  const rawResult = await recompile(raw,path.join(target,'raw'));
  const result = await recompile(normalized,target);
  assert.equal(rawResult.status,'ok',fixture.id+': '+rawResult.message);
  assert.equal(result.status,'ok',fixture.id+': '+result.message);
  const comparison = compareBoc(rawResult.boc,result.boc);
  assert.equal(comparison.sameCodeCell,true,fixture.id+': normalization changed TVM code');
  assert.equal(comparison.sameSerializedBoc,true,fixture.id+': normalization changed serialized BOC');
  const executions = [];
  for (const [index,data] of [fixture.data ?? empty, ...(fixture.extraData ?? []), empty].entries()) {
    const probes = [{method:90090,args:[]}];
    const beforeAfter = await compareGetters(rawResult.boc,result.boc,probes,{data});
    beforeAfter.forEach(probe=>assert.deepEqual(probe.before,probe.after,fixture.id+': stack, exit or gas mismatch'));
    const originalAfter = await compareGetters(boc,result.boc,probes,{data});
    originalAfter.forEach(probe=>assert.equal(probe.sameObservedBehavior,true,fixture.id+': '+JSON.stringify(probe)));
    if (index===0) assert.equal(originalAfter[0].before.exitCode,0,fixture.id+': valid input must execute successfully');
    executions.push({data:data.toBoc().toString('base64'),beforeAfter,originalAfter});
  }
  const request = JSON.parse(await fs.readFile(path.join(target,'request.json'),'utf8'));
  report.cases.push({id:fixture.id,request,comparison,originalComparison:compareBoc(boc,result.boc),sameOriginalAs:fixture.sameOriginalAs,changes:normalized.normalizations,executions});
  console.log(fixture.id+': raw/normalized BOC, stack, exit and gas identical; original behavior verified');
}
report.getterProbes = report.cases.reduce((sum,entry)=>sum+entry.executions.reduce((n,execution)=>n+execution.beforeAfter.length,0),0);
await writeJson(path.join(directory,'report.json'),report);
console.log(`${report.cases.length} stdlib fixtures, ${report.getterProbes} getter probes passed`);
