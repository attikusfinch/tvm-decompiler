import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
import { compileTolk } from './tolk.mjs';

// Original sources belong to the oracle only. The normalizer receives the compiled BOC.
export async function verifyRecoveryFixtures(suite, cases, rules) {
    const directory = path.join(root, 'artifacts', suite);
    const testedRules = new Set(rules);
    const report = [];
    for (const fixture of cases) {
        const target = path.join(directory, fixture.id);
        const original = await compileTolk({ sources: { 'main.tolk': fixture.source } });
        assert.equal(original.status, 'ok', fixture.id + ': ' + original.message);
        const boc = Buffer.from(original.codeBoc, 'base64');
        const raw = await decompile(boc, path.join(target, 'raw'), { local: true, language: 'tolk', normalize: false });
        const normalized = await decompile(boc, target, { local: true, language: 'tolk' });
        assert.equal(raw.complete, true, fixture.id + ': ' + JSON.stringify(raw.diagnostics));
        assert.equal(normalized.complete, true, fixture.id + ': ' + JSON.stringify(normalized.diagnostics));
        const changes = normalized.normalizations.filter(change => testedRules.has(change.rule));
        assert.deepEqual([...new Set(changes.map(change => change.rule))].sort(), fixture.rules.toSorted(), fixture.id);
        const rawResult = await recompile(raw, path.join(target, 'raw'));
        const result = await recompile(normalized, target);
        assert.equal(rawResult.status, 'ok', fixture.id + ': raw: ' + rawResult.message);
        assert.equal(result.status, 'ok', fixture.id + ': normalized: ' + result.message);
        const comparison = compareBoc(rawResult.boc, result.boc);
        assert.equal(comparison.sameCodeCell, true, fixture.id + ': normalized code');
        assert.equal(comparison.sameSerializedBoc, true, fixture.id + ': serialized BOC');
        const originalComparison = compareBoc(boc, rawResult.boc);
        if (fixture.originalIdentical) assert.equal(originalComparison.sameCodeCell, true, fixture.id + ': original code');
        const getters = await compareGetters(rawResult.boc, result.boc, fixture.probes, fixture.environment);
        for (const probe of getters) {
            assert.equal(probe.sameObservedBehavior, true, fixture.id + ': ' + JSON.stringify(probe));
            assert.equal(probe.before.gasUsed, probe.after.gasUsed, fixture.id + ': gas');
        }
        const originalGetters = await compareGetters(boc, result.boc, fixture.probes, fixture.environment);
        for (const probe of originalGetters) assert.equal(probe.sameObservedBehavior, true, fixture.id + ': original: ' + JSON.stringify(probe));
        let func = {};
        if (fixture.verifyFunc) {
            const folder = path.join(target, 'func');
            const source = await decompile(boc, folder, { local: true, language: 'func' });
            assert.equal(source.complete, true, fixture.id + ': FunC: ' + JSON.stringify(source.diagnostics));
            const compiled = await recompile(source, folder);
            assert.equal(compiled.status, 'ok', fixture.id + ': FunC: ' + compiled.message);
            const funcGetters = await compareGetters(boc, compiled.boc, fixture.probes, fixture.environment);
            for (const probe of funcGetters) assert.equal(probe.sameObservedBehavior, true, fixture.id + ': FunC: ' + JSON.stringify(probe));
            func = { funcGetters, funcComparison: compareBoc(boc, compiled.boc) };
        }
        await fs.writeFile(path.join(target, 'original.tolk'), fixture.source);
        await fs.writeFile(path.join(target, 'original.fif'), original.fiftCode);
        report.push({ id: fixture.id, changes, comparison, originalComparison, getters, originalGetters, ...func });
        console.log(`${fixture.id}: ${changes.map(c => c.rule).join(', ') || 'raw shape retained'}; raw/normalized TVM identical; ${getters.length} probes including gas passed; original/raw identical=${originalComparison.sameCodeCell}`);
    }
    await writeJson(path.join(directory, 'report.json'), report);
    return report;
}
