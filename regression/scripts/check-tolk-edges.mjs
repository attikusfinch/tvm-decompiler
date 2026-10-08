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
`;
const original = await compile({ targets: ['main.fc'], sources: { 'main.fc': source } });
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
await writeJson(path.join(directory, 'report.json'), { globalLoop, uninitializedNft: nft });
console.log('Tolk edges: explicit global slot 7, side effects in while conditions, null NFT return values passed (6 getter probes)');
