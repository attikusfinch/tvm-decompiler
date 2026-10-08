import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { beginCell } from '@ton/core';
import fixtures from '../fixtures/corpus.mjs';
import { root, writeJson, compile, codeCell, decompile, recompile, compareBoc, compareGetters, actonDisasm, version } from './lib.mjs';

try {
const { values } = parseArgs({ options: {
  offline: { type: 'boolean' }, refresh: { type: 'boolean' }, acton: { type: 'boolean' },
  strict: { type: 'boolean' }, filter: { type: 'string' },
  native: { type: 'boolean' },
  local: { type: 'boolean' }, exact: { type: 'boolean' }, language: { type: 'string', default: 'func' },
} });
if (values.native) process.env.FUNC_BACKEND = 'native';
const stdlib = await fs.readFile(path.join(root, 'fixtures', 'stdlib.fc'), 'utf8');
const report = { checkedAt: new Date().toISOString(), compiler: await version(values.language), inputCompiler: await version(), cases: [] };
for (const fixture of fixtures.filter(f => !values.filter || f.id.includes(values.filter))) {
  const directory = path.join(root, 'artifacts', values.local ? 'corpus-local' : 'corpus', ...(values.language === 'tolk' ? ['tolk'] : []), fixture.id);
  await fs.mkdir(directory, { recursive: true });
  const entry = { id: fixture.id, knownUnsupported: fixture.knownUnsupported ?? false };
  await fs.writeFile(path.join(directory, 'original.fc'), fixture.source);
  const compiled = await compile({ targets: ['main.fc'], sources: { 'main.fc': fixture.source, 'stdlib.fc': stdlib } });
  if (compiled.status !== 'ok') throw new Error(`Invalid fixture ${fixture.id}: ${compiled.message}`);
  const original = Buffer.from(compiled.codeBoc, 'base64');
  entry.originalHash = codeCell(original).hash().toString('hex');
  await fs.writeFile(path.join(directory, 'original.boc'), original);
  try {
    const response = await decompile(original, directory, values);
    const result = await recompile(response, directory);
    entry.status = result.status;
    entry.diagnostics = result.diagnostics ?? [];
    if (result.status === 'ok') {
      Object.assign(entry, compareBoc(original, result.boc));
      entry.probes = await compareGetters(original, result.boc, fixture.probes,
        { data: fixture.dataHex ? beginCell().storeBuffer(Buffer.from(fixture.dataHex, 'hex')).endCell() : beginCell().storeUint(fixture.dataUint32 ?? 0, 32).endCell() });
      entry.sameObservedBehavior = entry.probes.every(probe => probe.sameObservedBehavior);
      entry.status = entry.sameObservedBehavior ? 'passed' : 'behavior-mismatch';
    } else entry.message = result.message;
  } catch (error) {
    entry.status = 'error'; entry.message = error.message;
    await fs.writeFile(path.join(directory, 'error.txt'), error.message + '\n');
  }
  if (values.acton) {
    try {
      await actonDisasm(path.join(directory, 'original.boc'), path.join(directory, 'original.tasm'));
      if (entry.recompiledHash) await actonDisasm(path.join(directory, 'recompiled.boc'), path.join(directory, 'recompiled.tasm'));
    } catch (error) { entry.actonError = error.message; }
  }
  await writeJson(path.join(directory, 'report.json'), entry);
  report.cases.push(entry);
  console.log(`${entry.id}: ${entry.status}${entry.sameCodeCell !== undefined ? `; same code cell=${entry.sameCodeCell}` : ''}`);
}
if (!report.cases.length) throw new Error('No fixtures matched --filter');
report.summary = {
  total: report.cases.length,
  compiled: report.cases.filter(c => c.recompiledHash).length,
  identicalCodeCells: report.cases.filter(c => c.sameCodeCell).length,
  behaviorPassed: report.cases.filter(c => c.sameObservedBehavior).length,
  unexpectedFailures: report.cases.filter(c => c.status !== 'passed' && !c.knownUnsupported).length,
};
await writeJson(path.join(root, 'artifacts', values.local ? 'corpus-local' : 'corpus', ...(values.language === 'tolk' ? ['tolk'] : []), values.filter ? 'filtered-report.json' : 'report.json'), report);
console.log(JSON.stringify(report.summary, null, 2));
if (values.strict && report.summary.unexpectedFailures) process.exitCode = 1;
} catch (error) { console.error(error.message); process.exitCode = 1; }
