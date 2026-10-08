import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Address, beginCell } from '@ton/core';
import { root, compile, decompile, recompile, compareGetters, readJson, writeJson } from './lib.mjs';

// Exercises backend-specific cases beyond the shared instruction corpus.
process.env.FUNC_BACKEND = 'native';
const directory = path.join(root, 'artifacts/tolk-edges');
await fs.mkdir(directory, { recursive: true });
const source = `
#include "stdlib.fc";
() set_global7(int value) impure asm "7 SETGLOB";
int get_global7() impure asm "7 GETGLOB";
int tick(int limit) impure inline {
    int value = get_global7();
    set_global7(value + 1);
    return value < limit;
}
() recv_internal() impure { }
int evaluate(int limit) method_id {
    set_global7(0);
    int count = 0;
    while (tick(limit)) { count += 1; }
    return count * 100 + get_global7();
}
int evaluate_order() method_id {
    set_global7(1);
    int before = get_global7();
    set_global7(9);
    return before * 100 + get_global7();
}
int evaluate_exception(int flag) method_id {
    set_global7(0);
    throw_unless(100 + tick(3), flag);
    return get_global7();
}
(cell, cell) evaluate_builder() method_id {
    builder base = begin_cell().store_uint(7, 8);
    builder left = base.store_uint(1, 8);
    builder right = base.store_uint(2, 8);
    return (left.end_cell(), right.end_cell());
}
int evaluate_branch(int flag) method_id {
    set_global7(0);
    int before = tick(3);
    if (flag) { return before; }
    return get_global7();
}
int evaluate_arguments() method_id {
    set_global7(0);
    int before = tick(3);
    return get_global7() + before;
}
`;
const original = await compile({ targets: ['main.fc'], sources: {
  'main.fc':source, 'stdlib.fc':await fs.readFile(path.join(root, 'fixtures/stdlib.fc'), 'utf8'),
} });
assert.equal(original.status, 'ok', original.message);
const originalBoc = Buffer.from(original.codeBoc, 'base64');
const response = await decompile(originalBoc, directory, { local: true, language: 'tolk' });
assert.equal(response.complete, true, JSON.stringify(response.diagnostics));
const rebuilt = await recompile(response, directory);
assert.equal(rebuilt.status, 'ok', rebuilt.message);
const globalLoop = await compareGetters(originalBoc, rebuilt.boc,
  [-1, 0, 1, 4, 10].map(limit => ({ method: 'evaluate', args: [limit] })));
globalLoop.forEach((probe, index) => {
  assert.equal(probe.sameObservedBehavior, true, JSON.stringify(probe));
  assert.equal(probe.before.exitCode, 0);
  assert.equal(probe.before.stack[0].value, ['1', '1', '102', '405', '1011'][index]);
});
const snapshots = await compareGetters(originalBoc, rebuilt.boc, [
  { method:'evaluate_order', args:[] },
  { method:'evaluate_exception', args:[1] },
  { method:'evaluate_exception', args:[0] },
  { method:'evaluate_builder', args:[] },
  { method:'evaluate_branch', args:[0] },
  { method:'evaluate_branch', args:[1] },
  { method:'evaluate_arguments', args:[] },
]);
snapshots.forEach(probe => assert.equal(probe.sameObservedBehavior, true, JSON.stringify(probe)));
assert.equal(snapshots[0].before.stack[0].value, '109');
assert.equal(snapshots[1].before.stack[0].value, '1');
assert.equal(snapshots[2].before.exitCode, 99);
assert.deepEqual(snapshots[3].before.stack.map(item => item.cellHash), [1,2].map(value =>
  beginCell().storeUint(7,8).storeUint(value,8).endCell().hash().toString('hex')));
assert.equal(snapshots[4].before.stack[0].value, '1');
assert.equal(snapshots[5].before.stack[0].value, '-1');
assert.equal(snapshots[6].before.stack[0].value, '0');
const nftDirectory = path.join(root, 'artifacts/acton-local/default/tolk/NftItem');
const archived = await readJson(path.join(root, 'fixtures/acton/NftItem.json'));
const nft = await compareGetters(Buffer.from(archived.code_boc64, 'base64'),
  await fs.readFile(path.join(nftDirectory, 'recompiled.boc')),
  [{ method: 'get_nft_data', args: [] }], {
    // Uninitialized item: owner and content are TVM null, even though the other branch is typed.
    data: beginCell().storeUint(7, 64).storeAddress(new Address(0, Buffer.alloc(32, 4))).endCell(),
  });
assert.equal(nft[0].sameObservedBehavior, true, JSON.stringify(nft));
assert.equal(nft[0].before.exitCode, 0);
assert.deepEqual(nft[0].before.stack.slice(-2), [{ type: 'null' }, { type: 'null' }]);
await writeJson(path.join(directory, 'report.json'), { globalLoop, snapshots, uninitializedNft: nft });
console.log('Tolk edges: loop/branch/argument evaluation, state-read order, dynamic exception arguments, builder snapshots and null NFT values passed (13 getter probes)');
