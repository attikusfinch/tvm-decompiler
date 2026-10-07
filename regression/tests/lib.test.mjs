import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beginCell } from '@ton/core';
import { compile, compareBoc, compareGetters, recompile } from '../scripts/lib.mjs';

test('BOC serialization flags do not change code cell identity', () => {
  const cell = beginCell().storeUint(42,8).endCell();
  const comparison = compareBoc(cell.toBoc({ idx: true, crc32: true }), cell.toBoc({ idx: false, crc32: false }));
  assert.equal(comparison.sameCodeCell, true);
  assert.equal(comparison.sameSerializedBoc, false);
  assert.equal(compareBoc(cell.toBoc(), beginCell().storeUint(43,8).endCell().toBoc()).sameCodeCell, false);
});

test('semantic check detects changed getter results', async () => {
  const before = await compile({ targets: ['main.fc'], sources: { 'main.fc': '() recv_internal() impure { } int evaluate(int x) method_id { return x; }' } });
  const after = await compile({ targets: ['main.fc'], sources: { 'main.fc': '() recv_internal() impure { } int evaluate(int x) method_id { return x + 1; }' } });
  assert.equal(before.status, 'ok'); assert.equal(after.status, 'ok');
  const results = await compareGetters(Buffer.from(before.codeBoc,'base64'), Buffer.from(after.codeBoc,'base64'), [{ method: 'evaluate', args: [42] }]);
  assert.equal(results[0].sameObservedBehavior, false);
  assert.equal(results[0].before.stack[0].value, '42');
  assert.equal(results[0].after.stack[0].value, '43');
});

test('remote response cannot write paths outside its source directory', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tvm-response-'));
  try {
    for (const name of ['../escaped.fc', '/absolute.fc', 'C:/absolute.fc', 'dir/../escaped.fc']) {
      await assert.rejects(recompile({ files: [{ name, content: '' }] }, directory), /Invalid/);
    }
  } finally { await fs.rmdir(directory); }
});

test('partial JSON and legacy failure comments cannot become successful compilations', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tvm-partial-'));
  try {
    for (const response of [
      { complete: false, diagnostics: [{ mnemonic: 'TRY' }], files: [{ name: 'main.fc', content: '() recv_internal() impure { }' }] },
      { files: [{ name: 'main.fc', content: '() recv_internal() impure {\n;; unparsed: TRY\n}' }] },
    ]) {
      const result = await recompile(response, directory);
      assert.equal(result.status, 'incomplete');
      assert.ok(result.diagnostics.length);
      await assert.rejects(fs.access(path.join(directory, 'recompiled.boc')));
    }
  } finally {
    const resolved = path.resolve(directory);
    assert.ok(resolved.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(resolved, { recursive: true, force: true });
  }
});
