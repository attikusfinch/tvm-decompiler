import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { beginCell } from '@ton/core';
import { root, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
import { compileTolk } from './tolk.mjs';

// Compiler-derived fixtures. No original message names/schemas are passed to the normalizer.
const directory = path.join(root, 'artifacts/tolk-matches');
const cases = [
  {id:'union-32',prefixes:['2CE05111','283B4C3F'],normalized:true,source:`
struct (0x2CE05111) Change { tail: RemainingBitsAndRefs }
struct (0x283B4C3F) Other { tail: RemainingBitsAndRefs }
type Input = Change | Other
@method_id(90020)
fun check(body: slice): int {
    val msg = lazy Input.fromSlice(body);
    match (msg) {
        Change => { return msg.tail.preloadUint(8); }
        Other => { return msg.tail.preloadUint(8) + 10; }
        else => { return -1; }
    }
}`},
  {id:'mixed-width-tail-refs',prefixes:['A','BC'],normalized:true,source:`
struct (0xA) Short { tail: RemainingBitsAndRefs }
struct (0xBC) Long { tail: RemainingBitsAndRefs }
type Input = Short | Long
@method_id(90020)
fun check(body: slice): int {
    val msg = lazy Input.fromSlice(body);
    match (msg) {
        Short => { return msg.tail.remainingBitsCount() * 100 + msg.tail.remainingRefsCount(); }
        Long => { return msg.tail.preloadUint(8); }
        else => { return -1; }
    }
}`},
  {id:'leading-zero-prefix',prefixes:['00','01'],normalized:true,source:`
struct (0x00) Zero { tail: RemainingBitsAndRefs }
struct (0x01) One { tail: RemainingBitsAndRefs }
type Input = Zero | One
@method_id(90020)
fun check(body: slice): int {
    val msg = lazy Input.fromSlice(body);
    match (msg) {
        Zero => { return msg.tail.preloadUint(8); }
        One => { return 7; }
        else => { return -1; }
    }
}`},
  {id:'overlapping-prefixes',prefixes:['2C','2CE05111'],normalized:false,source:`
fun shortPrefix(s: slice): (slice, int) asm "x{2C} SDBEGINSQ"
fun longPrefix(s: slice): (slice, int) asm "x{2CE05111} SDBEGINSQ"
@method_id(90020)
fun check(body: slice): int {
    var (tail, found) = shortPrefix(body);
    if (found != 0) { return 1; }
    var (_, found2) = longPrefix(tail);
    if (found2 != 0) { return 2; }
    return -1;
}`},
  {id:'live-unmatched-tail',prefixes:['2CE05111'],normalized:false,source:`
fun prefix(s: slice): (slice, int) asm "x{2CE05111} SDBEGINSQ"
@method_id(90020)
fun check(body: slice): int {
    var (tail, found) = prefix(body);
    if (found != 0) { return tail.preloadUint(8); }
    return tail.remainingBitsCount();
}`},
  {id:'nonterminal-join',prefixes:['2CE05111'],normalized:false,source:`
fun prefix(s: slice): (slice, int) asm "x{2CE05111} SDBEGINSQ"
@method_id(90020)
fun check(body: slice): int {
    var (tail, found) = prefix(body);
    var value = 0;
    if (found != 0) { value = tail.preloadUint(8); }
    return value + found;
}`},
  {id:'conditional-before-return',prefixes:['2CE05111'],normalized:false,source:`
fun prefix(s: slice): (slice, int) asm "x{2CE05111} SDBEGINSQ"
@method_id(90020)
fun check(body: slice): int {
    var (tail, found) = prefix(body);
    if (found != 0) {
        if (tail.isEmpty()) {
        } else {
            contract.setData(beginCell().storeSlice(tail).endCell());
        }
        return 7;
    }
    return -1;
}`},
];
const report = [];
for (const fixture of cases) {
  const target = path.join(directory, fixture.id);
  const original = await compileTolk({sources:{'main.tolk':fixture.source}});
  assert.equal(original.status,'ok',original.message);
  const boc = Buffer.from(original.codeBoc,'base64');
  const raw = await decompile(boc,path.join(target,'raw'),{local:true,language:'tolk',normalize:false});
  const normalized = await decompile(boc,target,{local:true,language:'tolk'});
  assert.equal(raw.complete,true,JSON.stringify(raw.diagnostics));
  assert.equal(normalized.complete,true);
  assert.ok(raw.files[0].content.includes('fun fn_90020(arg_0: slice): int'),fixture.id + ': prefix input must be a slice');
  const changes = normalized.normalizations.filter(change => change.rule === 'prefix-lazy-match');
  assert.equal(changes.length,fixture.normalized ? 1 : 0,fixture.id);
  if (fixture.normalized) {
    assert.ok(normalized.files[0].content.includes('match (message)'));
    assert.ok(normalized.files[0].content.includes('RemainingBitsAndRefs'));
  }
  const rawResult = await recompile(raw,path.join(target,'raw'));
  const result = await recompile(normalized,target);
  assert.equal(rawResult.status,'ok',rawResult.message);
  assert.equal(result.status,'ok',result.message);
  const comparison = compareBoc(rawResult.boc,result.boc);
  assert.equal(comparison.sameCodeCell,true,fixture.id);
  assert.equal(comparison.sameSerializedBoc,true,fixture.id);
  const originalComparison = compareBoc(boc,rawResult.boc);
  assert.equal(originalComparison.sameCodeCell,true,fixture.id + ': exact prefix emission');
  // All truncated prefix lengths, incomplete payloads, unknown opcodes and reference tails.
  const cells = [beginCell().endCell(),beginCell().storeUint(0xffff,16).endCell(),beginCell().storeRef(beginCell().endCell()).endCell()];
  for (const hex of fixture.prefixes) {
    const bits = hex.length * 4;
    const prefix = BigInt('0x' + hex);
    for (let width = 1; width < bits; width++) cells.push(beginCell().storeUint(prefix >> BigInt(bits - width),width).endCell());
    for (let width = 0; width <= 8; width++) cells.push(beginCell().storeUint(prefix,bits).storeUint(width === 8 ? 7 : 0,width).endCell());
    cells.push(beginCell().storeUint(prefix,bits).storeUint(7,8).storeRef(beginCell().storeUint(9,8).endCell()).endCell());
  }
  const probes = cells.map(cell => ({method:90020,args:[{type:'slice',cell}]}));
  const getters = await compareGetters(boc,result.boc,probes);
  for (const probe of getters) {
    assert.equal(probe.sameObservedBehavior,true,JSON.stringify(probe));
    assert.equal(probe.before.gasUsed,probe.after.gasUsed,fixture.id + ': gas changed');
  }
  await fs.writeFile(path.join(target,'original.tolk'),fixture.source);
  await fs.writeFile(path.join(target,'original.fif'),original.fiftCode);
  report.push({id:fixture.id,changes,comparison,originalComparison,getters});
  console.log(`${fixture.id}: ${changes.length ? 'lazy match restored' : 'unsafe shape retained'}; original/raw/normalized TVM identical; ${getters.length} probes including gas passed`);
}
await writeJson(path.join(directory,'report.json'),report);
