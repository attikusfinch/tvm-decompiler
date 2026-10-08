import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Address, beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';

process.env.FUNC_BACKEND = 'native';
const directory = path.join(root, 'artifacts/func-normalization');
const stdlib = await fs.readFile(path.join(root, 'fixtures/stdlib.fc'), 'utf8');
const address = new Address(0, Buffer.alloc(32, 1));
const ref = beginCell().storeUint(123, 32).endCell();
const integer = value => ({ type:'int', value:BigInt(value) });
const widths = [-1, 0, 1, 8, 32, 256, 257].map(integer).concat({type:'null'}, {type:'nan'}, {type:'cell', cell:ref});
const cases = [
  { id:'uint', source:'int check() method_id(90080) { slice s = get_data().begin_parse(); return s~load_uint(32); }',
    data:beginCell().storeUint(123,32).endCell(), fragment:'~load_uint(32)' },
  { id:'signed', source:'int check() method_id(90080) { slice s = get_data().begin_parse(); return s~load_int(32); }',
    data:beginCell().storeInt(-123,32).endCell(), fragment:'~load_int(32)' },
  { id:'bits', source:'slice check() method_id(90080) { slice s = get_data().begin_parse(); return s~load_bits(32); }',
    data:beginCell().storeUint(123,32).endCell(), fragment:'~load_bits(32)' },
  { id:'grams', source:'int check() method_id(90080) { slice s = get_data().begin_parse(); return s~load_grams(); }',
    data:beginCell().storeCoins(123456).endCell(), fragment:'coins' },
  { id:'ref', source:'cell check() method_id(90080) { slice s = get_data().begin_parse(); return s~load_ref(); }',
    data:beginCell().storeRef(ref).endCell(), fragment:'reference' },
  { id:'address', source:'slice check() method_id(90080) { (slice a, _) = get_data().begin_parse().load_std_addr(); return a; }',
    data:beginCell().storeAddress(address).endCell(), fragment:'~load_std_addr_cursor()' },
  { id:'optional-address', source:'slice check() method_id(90080) { (slice a, _) = get_data().begin_parse().load_opt_std_addr(); return a; }',
    data:beginCell().storeAddress(address).endCell(), extraData:[beginCell().storeAddress(null).endCell()], fragment:'~load_opt_std_addr_cursor()' },
  { id:'storage-chain', source:'(int, slice, int, cell) check() method_id(90080) { slice s = get_data().begin_parse(); int x = s~load_uint(32); (slice a, slice tail) = s.load_std_addr(); int c = tail~load_grams(); cell r = tail~load_ref(); return (x,a,c,r); }',
    data:beginCell().storeUint(7,32).storeAddress(address).storeCoins(123).storeRef(ref).endCell(), fragment:'~load_std_addr_cursor()' },
  { id:'live-snapshot', source:'(int,int) check() method_id(90080) { slice s = get_data().begin_parse(); slice saved = s; int a = s~load_uint(8); int b = saved~load_uint(16); return (a,b); }',
    data:beginCell().storeUint(0x1234,16).endCell(), fragment:'~load_uint' },
  { id:'dynamic-width', source:'int check(int n) method_id(90080) { slice s = get_data().begin_parse(); return s~load_uint(n); }',
    data:beginCell().storeUint(123,32).endCell(), args:widths.map(n=>[n]), fragment:'~load_uint(arg0)' },
  { id:'discarded-value', source:'int check(int n) method_id(90080) { slice s = get_data().begin_parse(); s~load_uint(n); return s.slice_bits(); }',
    data:beginCell().storeUint(123,32).endCell(), args:widths.map(n=>[n]), fragment:'~load_uint(arg0)' },
  { id:'receiver-and-argument-effects', source:'global int g; slice receiver() impure inline { g = 1; return get_data().begin_parse(); } int width() impure inline { g = g * 10 + 2; return 8; } (int,int) check() impure method_id(90080) { g = 0; (slice tail,int x) = receiver().load_uint(width()); return (x,g); }',
    data:beginCell().storeUint(123,32).endCell(), fragment:'~load_uint' },
  { id:'loop', source:'int check(int n) method_id(90080) { slice s = get_data().begin_parse(); int total = 0; repeat (n) { total += s~load_uint(8); } return total; }',
    data:beginCell().storeUint(0x010203,24).endCell(), args:[0,1,3,4].map(n=>[n]), fragment:'repeat' },
  { id:'handler', source:'int check() method_id(90080) { int result = 7; try { slice s = get_data().begin_parse(); result = s~load_uint(32); } catch (_, int code) { result = code; } return result; }',
    data:beginCell().storeUint(123,32).endCell(), fragment:'catch' },
  { id:'hex-prefix', source:'const slice prefix = "1234ABCD"s; int check() method_id(90080) { (_, int matched) = begins_with(get_data().begin_parse(), prefix); if matched { return 7; } return 9; }',
    data:beginCell().storeUint(0x1234abcd,32).endCell(), extraData:[beginCell().storeUint(123,32).endCell()], fragment:'PREFIX_1234ABCD' },
  { id:'ascii-prefix', source:'const slice prefix = "(;L?"; int check() method_id(90080) { (_, int matched) = begins_with(get_data().begin_parse(), prefix); ifnot matched { return 9; } return 7; }',
    data:beginCell().storeUint(0x283b4c3f,32).endCell(), extraData:[beginCell().storeUint(123,32).endCell()], fragment:'PREFIX_283B4C3F' },
  { id:'odd-prefix', source:'const slice prefix = "42_"s; int check() method_id(90080) { (_, int matched) = begins_with(get_data().begin_parse(), prefix); if matched { return 7; } return 9; }',
    data:beginCell().storeUint(16,5).endCell(), fragment:'__const_00' },
  ...[0,1,2,3,16,32,64,128,160,192,243,4,-1].map(mode => ({ id:'send-mode-'+mode,
    source:`int check() impure method_id(90080) { send_raw_message(begin_cell().end_cell(), ${mode}); return 7; }`,
    fragment:mode>=0 && (mode&243)===mode ? 'SEND_MODE_' : `, ${mode})` })),
  { id:'partial-internal-call', source:'int owner() method_id { return 7; } int check() method_id(90080) { return owner(); }', partial:true },
];
await fs.mkdir(directory, { recursive:true });
const report = { checkedAt:new Date().toISOString(), cases:[] };
for (const fixture of cases) {
  const target = path.join(directory, fixture.id);
  const original = await compile({targets:['main.fc'], sources:{'main.fc':'#include "stdlib.fc";\n() recv_internal() impure { }\n'+fixture.source, 'stdlib.fc':stdlib}});
  assert.equal(original.status,'ok',fixture.id+': '+original.message);
  const boc = Buffer.from(original.codeBoc,'base64');
  const raw = await decompile(boc,path.join(target,'raw'),{local:true,language:'func',normalize:false});
  const normalized = await decompile(boc,target,{local:true,language:'func'});
  assert.deepEqual(raw.diagnostics,normalized.diagnostics);
  assert.equal(raw.files[1].content,normalized.files[1].content);
  const requests = await Promise.all([target,path.join(target,'raw')].map(folder=>fs.readFile(path.join(folder,'request.json'),'utf8').then(JSON.parse)));
  assert.notEqual(requests[0].endpoint,requests[1].endpoint,'Raw and normalized cache identities must differ');
  const rawResult = await recompile(raw,path.join(target,'raw'));
  const result = await recompile(normalized,target);
  if (fixture.partial) {
    assert.equal(normalized.complete,false);
    assert.equal(result.status,'incomplete');
    assert.deepEqual(raw.files,normalized.files);
    assert.deepEqual(normalized.normalizations,[]);
    report.cases.push({id:fixture.id,partial:true,request:requests[0],diagnostics:normalized.diagnostics});
    console.log(fixture.id+': partial files and diagnostics unchanged');
    continue;
  }
  assert.equal(normalized.complete,true,fixture.id+': '+JSON.stringify(normalized.diagnostics));
  assert.equal(rawResult.status,'ok',fixture.id+': '+rawResult.message);
  assert.equal(result.status,'ok',fixture.id+': '+result.message);
  assert.ok(normalized.files[0].content.includes(fixture.fragment),fixture.id+': '+normalized.files[0].content);
  const comparison = compareBoc(rawResult.boc,result.boc);
  assert.equal(comparison.sameCodeCell,true,fixture.id+': normalization changed TVM code');
  assert.equal(comparison.sameSerializedBoc,true,fixture.id+': normalization changed serialized BOC');
  const probes = (fixture.args ?? [[]]).map(args=>({method:90080,args}));
  const executions = [];
  for (const data of [fixture.data ?? beginCell().endCell(), ...(fixture.extraData ?? []), beginCell().endCell()]) {
    const beforeAfter = await compareGetters(rawResult.boc,result.boc,probes,{data});
    beforeAfter.forEach(probe=>assert.deepEqual(probe.before,probe.after,fixture.id+': raw/normalized stack, exit or gas mismatch'));
    const originalAfter = await compareGetters(boc,result.boc,probes,{data});
    originalAfter.forEach(probe=>assert.equal(probe.sameObservedBehavior,true,fixture.id+': '+JSON.stringify(probe)));
    executions.push({data:data.toBoc().toString('base64'),beforeAfter,originalAfter});
  }
  report.cases.push({id:fixture.id,request:requests[0],comparison,changes:normalized.normalizations,executions});
  console.log(fixture.id+': identical raw/normalized BOC, exit, stack and gas; original behavior verified');
}
await writeJson(path.join(directory,'report.json'),report);
