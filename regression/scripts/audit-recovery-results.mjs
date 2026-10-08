import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, readJson } from './lib.mjs';

const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.join(root, '../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
const hash = createHash('sha256').update(await fs.readFile(jar)).digest('hex');
for (const [suite, count, probes] of [['tolk-recovery', 19, 501], ['tolk-builders', 17, 202], ['tolk-nullable', 14, 144], ['tolk-loops', 8, 70]]) {
    const directory = path.join(root, 'artifacts', suite);
    const report = await readJson(path.join(directory, 'report.json'));
    assert.equal(report.length, count, suite + ': incomplete suite');
    assert.equal(report.reduce((n, entry) => n + entry.getters.length, 0), probes, suite + ': incomplete probes');
    for (const entry of report) {
        assert.match(entry.id, /^[a-z0-9-]+$/);
        for (const stage of ['', 'raw']) {
            const folder = path.join(directory, entry.id, stage);
            const request = await readJson(path.join(folder, 'request.json'));
            assert.ok(request.endpoint.startsWith(`local:${hash}:`), suite + ': stale JAR: ' + entry.id);
            assert.ok(request.endpoint.endsWith(`:normalize=${stage !== 'raw'}`));
            const response = await readJson(path.join(folder, 'response.json'));
            assert.equal(response.complete, true);
            assert.deepEqual(response.diagnostics, []);
        }
        assert.equal(entry.comparison.sameCodeCell, true);
        assert.equal(entry.comparison.sameSerializedBoc, true);
        for (const getter of entry.getters) {
            assert.equal(getter.sameObservedBehavior, true);
            assert.equal(getter.before.gasUsed, getter.after.gasUsed);
        }
        for (const getter of entry.originalGetters) assert.equal(getter.sameObservedBehavior, true);
    }
    console.log(`${suite}: current JAR, ${count} cases / ${probes} probes, raw/normalized BOC+gas and original behavior verified`);
}
