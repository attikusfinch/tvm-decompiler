import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Address, beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
import { compileTolk, tolkVersion } from './tolk.mjs';

process.env.FUNC_BACKEND = 'native';
const directory = path.join(root,'artifacts/tolk-stdlib');
const stdlib = await fs.readFile(path.join(root,'fixtures/stdlib.fc'),'utf8');
const empty = beginCell().endCell();
const ref = beginCell().storeUint(123,32).endCell();
const address = new Address(0,Buffer.alloc(32,1));
const int = value => ({type:'int',value:BigInt(value)});
const cases = [
  { id:'clock', source:'int check() method_id(90097) { return now(); }', fragment:'blockchainNowTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'address', source:'slice check() method_id(90097) { return my_address(); }', fragment:'contractGetAddressTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'balance', source:'[int, cell] check() method_id(90097) { return get_balance(); }', fragment:'contractGetOriginalBalanceWithExtraCurrenciesTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'logical-time', source:'int check() method_id(90097) { return cur_lt(); }', fragment:'blockchainLogicalTimeTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'block-time', source:'int check() method_id(90097) { return block_lt(); }', fragment:'blockchainCurrentBlockLogicalTimeTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'seed', source:'int check() impure method_id(90097) { return get_seed(); }', fragment:'randomGetSeedTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'code', source:'cell code() asm "MYCODE"; int check() method_id(90097) { return code().cell_depth(); }', fragment:'contractGetCodeTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'repeated-context', source:'(int, int, slice) check() method_id(90097) { return (now(),now(),my_address()); }', fragment:'blockchainNowTvm()', rule:'tolk-stdlib-wrapper' },
  { id:'slice-depth', source:'int check(slice s) method_id(90097) { return s.slice_depth(); }', fragment:'sliceDepthTvm(', rule:'tolk-stdlib-wrapper', args:[[{type:'slice',cell:empty}],[{type:'slice',cell:beginCell().storeRef(ref).endCell()}],[{type:'null'}],[{type:'nan'}],[{type:'cell',cell:ref}]] },
  { id:'assert-end', source:'int check() method_id(90097) { get_data().begin_parse().end_parse(); return 7; }', fragment:'.assertEnd()', rule:'tolk-stdlib-call', extraData:[ref] },
  { id:'random-range', source:'int check(int limit) impure method_id(90097) { return rand(limit); }', fragment:'random.range(', rule:'tolk-stdlib-call', args:[-1,0,1,100].map(v=>[int(v)]).concat([[{type:'null'}],[{type:'nan'}]]) },
  { id:'gas-limit', source:'int check(int limit) impure method_id(90097) { set_gas_limit(limit); return 7; }', fragment:'setGasLimit(', rule:'tolk-stdlib-call', import:'@stdlib/gas-payments', args:[1000000,-1,0,100].map(v=>[int(v)]) },
  { id:'fee-order', source:'int check(int gas_used, int mc) method_id(90097) { return get_gas_fee(gas_used,mc); }', fragment:'calculateGasFeeTvm(', rule:'tolk-stdlib-wrapper', args:[[int(100),int(0)],[int(100),int(-1)],[int(-1),int(0)],[{type:'null'},int(0)]] },
  { id:'builder-to-slice', source:'slice check() method_id(90097) { return begin_cell().store_uint(7,8).builder_to_slice(); }', fragment:'builderToSliceTvm(', rule:'tolk-stdlib-wrapper' },
  { id:'dictionary-null', source:'cell check() method_id(90097) { return get_data().begin_parse().preload_dict(); }', fragment:'tvmPreloadDict(', noRule:true, data:beginCell().storeMaybeRef(ref).endCell(), extraData:[beginCell().storeMaybeRef(null).endCell(),beginCell().storeBit(1).endCell()] },
  { id:'unknown-builtin', source:'int size(tuple t) asm "TLEN"; int check(tuple t) method_id(90097) { return size(t); }', fragment:'asm_TLEN(', noRule:true, args:[[{type:'tuple',items:[]}],[{type:'tuple',items:[int(1)]}],[{type:'null'}],[int(1)]] },
  { id:'native-tolk-source', tolk:'@method_id(90097)\nfun check(): int { return blockchain.now(); }', fragment:'blockchainNowTvm()', rule:'tolk-stdlib-wrapper' },
];
await fs.mkdir(directory,{recursive:true});
const report = { checkedAt:new Date().toISOString(), compiler:await tolkVersion(), cases:[] };
for (const fixture of cases) {
  const target = path.join(directory,fixture.id);
  const original = fixture.tolk ? await compileTolk({sources:{'main.tolk':fixture.tolk}}) : await compile({targets:['main.fc'],sources:{'main.fc':'#include "stdlib.fc";\n() recv_internal() impure { }\n'+fixture.source,'stdlib.fc':stdlib}});
  assert.equal(original.status,'ok',fixture.id+': '+original.message);
  const boc = Buffer.from(original.codeBoc,'base64');
  const raw = await decompile(boc,path.join(target,'raw'),{local:true,language:'tolk',normalize:false});
  const normalized = await decompile(boc,target,{local:true,language:'tolk'});
  assert.equal(normalized.complete,true,fixture.id+': '+JSON.stringify(normalized.diagnostics));
  assert.deepEqual(raw.diagnostics,normalized.diagnostics);
  const main = normalized.files[0].content;
  assert.ok(main.includes(fixture.fragment),fixture.id+': '+main+'\n'+normalized.files[1].content);
  if (fixture.rule) assert.ok(normalized.normalizations.some(change=>change.rule===fixture.rule),main);
  if (fixture.noRule) assert.ok(!normalized.normalizations.some(change=>change.rule.startsWith('tolk-stdlib-')),main);
  if (fixture.import) assert.ok(main.includes(`import "${fixture.import}"`));
  const before = await recompile(raw,path.join(target,'raw'));
  const after = await recompile(normalized,target);
  assert.equal(before.status,'ok',fixture.id+': raw: '+before.message);
  assert.equal(after.status,'ok',fixture.id+': normalized: '+after.message);
  const comparison = compareBoc(before.boc,after.boc);
  assert.equal(comparison.sameCodeCell,true,fixture.id+': TVM code changed');
  assert.equal(comparison.sameSerializedBoc,true,fixture.id+': BOC bytes changed');
  const executions = [];
  for (const [index,data] of [fixture.data ?? empty,...(fixture.extraData ?? []),empty].entries()) {
    const probes = (fixture.args ?? [[]]).map(args=>({method:90097,args}));
    const beforeAfter = await compareGetters(before.boc,after.boc,probes,{data});
    beforeAfter.forEach(probe=>assert.deepEqual(probe.before,probe.after,fixture.id+': stack, exit or gas'));
    const originalAfter = await compareGetters(boc,after.boc,probes,{data});
    originalAfter.forEach(probe=>assert.equal(probe.sameObservedBehavior,true,fixture.id+': '+JSON.stringify(probe)));
    if (index===0) assert.equal(originalAfter[0].before.exitCode,0,fixture.id+': first input must execute successfully');
    executions.push({data:data.toBoc().toString('base64'),beforeAfter,originalAfter});
  }
  const request = JSON.parse(await fs.readFile(path.join(target,'request.json'),'utf8'));
  report.cases.push({id:fixture.id,request,comparison,originalComparison:compareBoc(boc,after.boc),changes:normalized.normalizations,executions});
  console.log(`${fixture.id}: raw/normalized BOC, exit, stack and gas identical; original behavior verified`);
}
report.getterProbes = report.cases.reduce((sum,entry)=>sum+entry.executions.reduce((n,execution)=>n+execution.beforeAfter.length,0),0);
await writeJson(path.join(directory,'report.json'),report);
console.log(`${report.cases.length} stdlib fixtures, ${report.getterProbes} getter probes passed`);
