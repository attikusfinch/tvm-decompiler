import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root, compareBoc, writeJson} from './lib.mjs';
import {compileTolk, loadTolkSources, tolkVersion} from './tolk.mjs';
import {checkX1000} from './dedust-x1000-fixtures.mjs';

const project = path.resolve(root, '../reconstruction/dedust');
const sources = await loadTolkSources(project, 'X1000WalletV2/main.tolk');
const compiled = await compileTolk({sources});
assert.equal(compiled.status, 'ok', compiled.message);

const code = Cell.fromBoc(Buffer.from(compiled.codeBoc, 'base64'))[0];
const candidate = code.toBoc({idx: false, crc32: true});
const original = await fs.readFile(path.join(project, 'oracles/X1000WalletV2.boc'));
const comparison = compareBoc(original, candidate);
assert.equal(comparison.sameSerializedBoc, true, 'X1000 readable BOC must match all bytes');
const tests = await checkX1000(original, candidate);

const build = path.join(project, 'build/X1000WalletV2');
await fs.mkdir(build, {recursive: true});
await fs.writeFile(path.join(build, 'code.boc'), candidate);
await writeJson(path.join(project, 'X1000WalletV2/recovery-verification.json'), {
    scope: 'Complete readable signed wallet, query/receipt/retry dictionaries, fourteen trading dispatch kinds and dynamic amount-hook ABI',
    compiler: await tolkVersion(),
    comparison,
    sourceSha256: Object.fromEntries(Object.entries(sources).map(([name, source]) =>
        [name, createHash('sha256').update(source).digest('hex')])),
    tests,
});
console.log(`X1000WalletV2: exact readable; ${tests.getters.length} getter/hook + ${tests.messages.length} message probes`);
