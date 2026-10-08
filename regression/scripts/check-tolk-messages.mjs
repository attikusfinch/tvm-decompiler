import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Address, beginCell, internal, storeMessageRelaxed } from '@ton/core';
import { root, compile, decompile, recompile, compareBoc, compareMessages, writeJson } from './lib.mjs';

// Native FunC is the source oracle. Neither TL-B schemas nor mode names reach the normalizer.
process.env.FUNC_BACKEND = 'native';
const stdlib = await fs.readFile(path.join(root, 'fixtures/stdlib.fc'), 'utf8');
const address = new Address(0, Buffer.alloc(32, 11));
const from = new Address(0, Buffer.alloc(32, 12));
const dest = new Address(0, Buffer.alloc(32, 13));
const empty = beginCell().endCell();
const payload = beginCell().storeUint(0xcafe, 16).storeRef(empty).endCell();
const data = beginCell().storeUint(7, 8).endCell();
const outgoing = (options = {}, forceRef = false) => beginCell().store(storeMessageRelaxed(
    internal({ to: dest, value: 20000000n, bounce: false, body: payload, ...options }), { forceRef })).endCell();
const cells = [outgoing(), outgoing({}, true), outgoing({ bounce: true }),
    outgoing({ init: { code: empty, data } }), outgoing({ value: 1000000000000000000n }),
    beginCell().storeUint(7, 3).endCell()];
const modes = [0,1,2,3,16,17,32,64,66,80,128,130,192,243,4,8,256,1024,-1];
const cases = [
    ...[0,17,66,130,243,192,-1,4,1024].map(mode => ({
        id: `static-${mode < 0 ? 'negative' : mode}`, mode: String(mode),
        flags: mode >= 0 && (mode & 243) === mode,
    })),
    { id: 'dynamic-mode', mode: 'mode', dynamic: true },
    { id: 'send-with-storage-effect', mode: '17', flags: true, store: true },
];
const report = [];
for (const fixture of cases.filter(c => !process.env.RECOVERY_FIXTURE || c.id === process.env.RECOVERY_FIXTURE)) {
    const directory = path.join(root, 'artifacts/tolk-messages', fixture.id);
    const source = `#include "stdlib.fc";
() recv_internal(slice body) impure {
    ${fixture.dynamic ? 'int mode = body~load_int(16);' : ''}
    cell outgoing = body~load_ref();
    ${fixture.store ? 'set_data(outgoing);' : ''}
    send_raw_message(outgoing, ${fixture.mode});
}`;
    const original = await compile({ targets: ['main.fc'], sources: { 'main.fc': source, 'stdlib.fc': stdlib } });
    assert.equal(original.status, 'ok', fixture.id + ': ' + original.message);
    const boc = Buffer.from(original.codeBoc, 'base64');
    const raw = await decompile(boc, path.join(directory, 'raw'), { local: true, language: 'tolk', normalize: false });
    const normalized = await decompile(boc, directory, { local: true, language: 'tolk' });
    assert.equal(raw.complete, true, fixture.id + ': ' + JSON.stringify(raw.diagnostics));
    assert.equal(normalized.complete, true);
    const changes = normalized.normalizations.filter(c => ['native-message-send', 'send-mode-flags'].includes(c.rule));
    assert.deepEqual([...new Set(changes.map(c => c.rule))].sort(),
        fixture.flags ? ['native-message-send', 'send-mode-flags'] : ['native-message-send']);
    const before = await recompile(raw, path.join(directory, 'raw'));
    const after = await recompile(normalized, directory);
    assert.equal(before.status, 'ok', fixture.id + ': raw: ' + before.message);
    assert.equal(after.status, 'ok', fixture.id + ': normalized: ' + after.message);
    const comparison = compareBoc(before.boc, after.boc);
    assert.equal(comparison.sameCodeCell, true, fixture.id + ': code cell');
    assert.equal(comparison.sameSerializedBoc, true, fixture.id + ': serialized BOC');
    const probes = (fixture.dynamic ? modes : [null]).flatMap(mode => cells.map((c, index) => {
        const body = beginCell();
        if (mode !== null) body.storeInt(mode, 16);
        return { label: `${mode ?? fixture.mode}/cell-${index}`, from, body: body.storeRef(c).endCell() };
    }));
    probes.push({ label: 'empty-body', from, body: empty },
        { label: 'truncated-body', from, body: beginCell().storeUint(0, 3).endCell() });
    if (fixture.dynamic) probes.push({ label: 'header-without-ref', from, body: beginCell().storeUint(1, 16).endCell() });
    const messages = [];
    const originalMessages = [];
    for (const probe of probes) {
        try {
            messages.push(...await compareMessages(before.boc, after.boc, [probe], { data, address, accurateStorageStats: true }));
            originalMessages.push(...await compareMessages(boc, after.boc, [probe], { data, address, accurateStorageStats: true }));
        } catch (error) {
            throw new Error(`${fixture.id}/${probe.label}: ${error.message}`, { cause: error });
        }
    }
    for (const m of messages) {
        assert.equal(m.sameObservedBehavior, true, fixture.id + ': ' + JSON.stringify(m));
        assert.equal(m.before.gasUsed, m.after.gasUsed, fixture.id + ': gas');
    }
    for (const m of originalMessages) assert.equal(m.sameEffectsAndActions, true, fixture.id + ': original effects: ' + JSON.stringify(m));
    await fs.writeFile(path.join(directory, 'original.fc'), source);
    await fs.writeFile(path.join(directory, 'original.fif'), original.fiftCode);
    const originalComparison = compareBoc(boc, before.boc);
    report.push({ id: fixture.id, changes, comparison, originalComparison, messages, originalMessages });
    console.log(`${fixture.id}: ${messages.length} messages including outgoing values, raw/normalized BOC+gas passed; original/raw code=${originalComparison.sameCodeCell}; original full behavior=${originalMessages.filter(m => m.sameObservedBehavior).length}/${messages.length}`);
}
await writeJson(path.join(root, 'artifacts/tolk-messages/report.json'), report);
