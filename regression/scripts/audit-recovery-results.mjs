import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, readJson } from './lib.mjs';
import { assertCatalogOracle } from './catalog-oracle.mjs';

const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.join(root, '../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
const hash = createHash('sha256').update(await fs.readFile(jar)).digest('hex');
for (const [suite, count, probes] of [['tolk-recovery', 19, 501], ['tolk-builders', 17, 202], ['tolk-nullable', 14, 144], ['tolk-loops', 8, 70], ['tolk-again', 6, 36], ['tolk-exceptions', 10, 75], ['tolk-dispatch', 6, 132], ['tolk-catalog', 40, 1593], ['tolk-arithmetic', 18, 1400], ['tolk-dictionary', 13, 351]]) {
    const directory = path.join(root, 'artifacts', suite);
    const report = await readJson(path.join(directory, 'report.json'));
    assert.equal(report.length, count, suite + ': incomplete suite');
    assert.equal(report.reduce((n, entry) => n + entry.getters.length, 0), probes, suite + ': incomplete probes');
    if (suite === 'tolk-catalog') assertCatalogOracle(report);
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
        if (suite === 'tolk-dispatch' || suite === 'tolk-dictionary'
            || suite === 'tolk-catalog' && entry.id === 'lambda-inlining'
            || suite === 'tolk-arithmetic' && entry.id.startsWith('discarded-')) {
            const request = await readJson(path.join(directory, entry.id, 'func/request.json'));
            assert.ok(request.endpoint.startsWith(`local:${hash}:`), suite + ': stale FunC JAR');
            assert.equal(entry.funcGetters.length, entry.getters.length);
            for (const getter of entry.funcGetters) {
                assert.equal(getter.sameObservedBehavior, true);
                if (suite === 'tolk-dictionary' || suite === 'tolk-arithmetic' || suite === 'tolk-dispatch' && entry.id !== 'static-jump-tail')
                    assert.equal(getter.before.gasUsed, getter.after.gasUsed);
            }
            if (suite === 'tolk-dictionary' || suite === 'tolk-arithmetic' || suite === 'tolk-dispatch' && entry.id !== 'static-jump-tail')
                assert.equal(entry.funcComparison.sameCodeCell, true);
        }
    }
    console.log(`${suite}: current JAR, ${count} cases / ${probes} probes, raw/normalized BOC+gas and original behavior verified`);
}

const ambiguity = path.join(root, 'artifacts/dispatch-ambiguity');
const negativeReport = await readJson(path.join(ambiguity, 'report.json'));
assert.equal(negativeReport.length, 3);
for (const entry of negativeReport) {
    assert.equal(entry.comparison.sameCodeCell, true);
    assert.deepEqual(entry.getters.map(g => g.before.stack.length), [1, 2, 0]);
    for (const language of ['func', 'tolk']) {
        const results = [];
        for (const stage of ['', 'raw']) {
            const folder = path.join(ambiguity, entry.id, language, stage);
            const request = await readJson(path.join(folder, 'request.json'));
            assert.ok(request.endpoint.startsWith(`local:${hash}:`), 'stale ambiguity JAR');
            results.push(await readJson(path.join(folder, 'response.json')));
        }
        assert.equal(results[0].complete, false);
        assert.deepEqual(results[0].files, results[1].files);
        assert.deepEqual(results[0].diagnostics, results[1].diagnostics);
        assert.deepEqual(results[0].normalizations, []);
    }
}
console.log('dispatch-ambiguity: current JAR, 3 identical source pairs / 9 runtime-width probes, partial outputs preserved');

const schemaDirectory = path.join(root, 'artifacts/schema-ambiguity');
const schemaReport = await readJson(path.join(schemaDirectory, 'report.json'));
assert.equal(schemaReport.length, 6);
assert.equal(schemaReport.reduce((n,e)=>n+e.getters.length,0),238);
for (const entry of schemaReport) {
    assert.equal(entry.comparison.sameCodeCell, true);
    assert.equal(entry.comparison.sameSerializedBoc, true);
    for (const getter of entry.getters) {
        assert.equal(getter.sameObservedBehavior, true);
        assert.equal(getter.before.gasUsed, getter.after.gasUsed);
    }
    for (const stage of ['', 'raw']) {
        const folder = path.join(schemaDirectory, entry.id, stage);
        const request = await readJson(path.join(folder, 'request.json'));
        assert.ok(request.endpoint.startsWith(`local:${hash}:`), 'stale schema ambiguity JAR');
        assert.equal((await readJson(path.join(folder, 'response.json'))).complete,true);
    }
}
console.log('schema-ambiguity: current JAR, 6 distinct source pairs / 238 probes, identical compiled BOCs and gas');

const messageDirectory = path.join(root, 'artifacts/tolk-messages');
const messageReport = await readJson(path.join(messageDirectory, 'report.json'));
assert.equal(messageReport.length, 11);
assert.equal(messageReport.reduce((n, e) => n + e.messages.length, 0), 197);
for (const entry of messageReport) {
    for (const stage of ['', 'raw']) {
        const request = await readJson(path.join(messageDirectory, entry.id, stage, 'request.json'));
        assert.ok(request.endpoint.startsWith(`local:${hash}:`), 'stale messages JAR');
        const response = await readJson(path.join(messageDirectory, entry.id, stage, 'response.json'));
        assert.equal(response.complete, true);
        assert.deepEqual(response.diagnostics, []);
    }
    assert.equal(entry.comparison.sameSerializedBoc, true);
    assert.equal(entry.comparison.sameCodeCell, true);
    assert.ok(entry.changes.some(c => c.rule === 'native-message-send'));
    for (const message of entry.messages) {
        assert.equal(message.sameObservedBehavior, true);
        assert.equal(message.before.gasUsed, message.after.gasUsed);
    }
    for (const message of entry.originalMessages) assert.equal(message.sameEffectsAndActions, true);
}
console.log('tolk-messages: current JAR, 11 cases / 197 messages, raw/normalized BOC+gas+outgoing values, original state/actions verified');
