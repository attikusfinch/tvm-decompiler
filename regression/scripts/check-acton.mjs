import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { Address } from '@ton/core';
import fixtures from '../fixtures/acton-probes.mjs';
import { root, readJson, writeJson, decompile, recompile, compareBoc, compareGetters, compareMessages, actonDisasm, version } from './lib.mjs';

try {
  const { values } = parseArgs({ options: { local: { type: 'boolean' }, native: { type: 'boolean' }, exact: { type: 'boolean' },
    offline: { type: 'boolean' }, refresh: { type: 'boolean' }, acton: { type: 'boolean' }, filter: { type: 'string' }, language: { type: 'string', default: 'func' } } });
  if (values.native) process.env.FUNC_BACKEND = 'native';
  const directory = path.join(root, 'artifacts', values.local ? 'acton-local' : 'acton-public', values.exact ? 'exact' : 'default', ...(values.language === 'tolk' ? ['tolk'] : []));
  await fs.mkdir(directory, { recursive: true });
  const report = { checkedAt: new Date().toISOString(), compiler: await version(values.language), cases: [] };
  for (const fixture of fixtures().filter(f => !values.filter || f.id.includes(values.filter))) {
    const target = path.join(directory, fixture.id);
    await fs.mkdir(target, { recursive: true });
    const compiled = await readJson(path.join(root, 'fixtures', 'acton', fixture.id + '.json'));
    const original = Buffer.from(compiled.code_boc64, 'base64');
    await fs.writeFile(path.join(target, 'original.boc'), original);
    const entry = { id: fixture.id, project: fixture.project };
    try {
      const response = await decompile(original, target, values);
      const result = await recompile(response, target);
      if (values.local) {
        const rawTarget = path.join(target, 'raw');
        const raw = await decompile(original, rawTarget, { ...values, normalize:false });
        const rawResult = await recompile(raw, rawTarget);
        assert.deepEqual(raw.diagnostics, response.diagnostics, fixture.id + ': normalization changed parser diagnostics');
        assert.equal(rawResult.status, result.status, fixture.id + ': normalization changed compilability');
        const support = values.language === 'tolk' ? 'stdlib.tolk' : 'stdlib.fc';
        assert.equal(raw.files.find(file => file.name === support).content,
          response.files.find(file => file.name === support).content, 'Normalization changed compatibility helpers');
        entry.normalization = { changes:response.normalizations ?? [], rawRequest:await readJson(path.join(rawTarget, 'request.json')) };
        if (result.status === 'ok') {
          entry.normalization.comparison = compareBoc(rawResult.boc, result.boc);
          // Current rules change only presentation/types; require full TVM identity, including gas and MYCODE.
          assert.equal(entry.normalization.comparison.sameCodeCell, true, fixture.id + ': normalization changed TVM code');
          assert.equal(entry.normalization.comparison.sameSerializedBoc, true, fixture.id + ': normalization changed serialized BOC');
        } else if (response.complete === false) assert.deepEqual(raw.files, response.files, fixture.id + ': partial output was normalized');
      }
      entry.status = result.status;
      entry.diagnostics = result.diagnostics ?? [];
      if (result.status === 'ok') {
        Object.assign(entry, compareBoc(original, result.boc));
        const config = { data: fixture.data, address: new Address(0, Buffer.alloc(32, 7)) };
        entry.getters = await compareGetters(original, result.boc, fixture.getters, config);
        entry.messages = await compareMessages(original, result.boc, fixture.messages, config);
        entry.status = [...entry.getters, ...entry.messages].every(p => p.sameObservedBehavior) ? 'passed' : 'behavior-mismatch';
        if (entry.messages.some(p => !p.matchesExpectedOriginal)) entry.status = 'invalid-probe';
      } else entry.message = result.message;
      if (values.acton) {
        await actonDisasm(path.join(target, 'original.boc'), path.join(target, 'original.tasm'));
        if (result.status === 'ok') await actonDisasm(path.join(target, 'recompiled.boc'), path.join(target, 'recompiled.tasm'));
      }
    } catch (error) { entry.status = 'error'; entry.message = error.message; }
    await writeJson(path.join(target, 'report.json'), entry);
    report.cases.push(entry);
    console.log(`${fixture.id}: ${entry.status}; getters=${entry.getters?.filter(p => p.sameObservedBehavior).length ?? 0}/${fixture.getters.length}; messages=${entry.messages?.filter(p => p.sameObservedBehavior).length ?? 0}/${fixture.messages.length}; actions=${entry.messages?.filter(p => p.sameEffectsAndActions).length ?? 0}/${fixture.messages.length}`);
  }
  if (!report.cases.length) throw new Error('No fixtures matched --filter');
  await writeJson(path.join(directory, values.filter ? 'filtered-report.json' : 'report.json'), report);
  if (report.cases.some(c => c.status !== 'passed')) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
