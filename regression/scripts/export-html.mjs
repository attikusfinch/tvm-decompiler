import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { crc16 } from '@ton/core';
import fixtures from '../fixtures/acton-probes.mjs';
import { root, readJson, codeCell } from './lib.mjs';

const { values } = parseArgs({ options: {
  artifacts: { type: 'string' }, output: { type: 'string' }, 'tolk-artifacts': { type: 'string' },
} });
const directory = path.resolve(values.artifacts ?? path.join(root, 'artifacts/acton-local/default'));
const destination = path.resolve(values.output ?? path.join(root, '../reports/acton-contracts.html'));
const summary = await readJson(path.join(directory, 'report.json'));
const tolkDirectory = path.resolve(values['tolk-artifacts'] ?? path.join(directory, 'tolk'));
let tolkSummary;
try { tolkSummary = await readJson(path.join(tolkDirectory, 'report.json')); }
catch (error) { if (error.code !== 'ENOENT' || values['tolk-artifacts']) throw error; }
const descriptions = {
  Empty: 'Минимальный контракт: хранение владельца и смена владельца по сообщению.',
  Counter: 'Счётчик: увеличение, уменьшение и сброс доступны владельцу.',
  NftCollection: 'NFT-коллекция: выпуск предметов, пакетный выпуск, роялти и смена администратора.',
  NftItem: 'NFT-предмет: передача владельца, уведомления и запрос статических данных.',
  JettonWallet: 'Jetton-кошелёк: переводы, сжигание, приём токенов и обработка bounce.',
  JettonMinter: 'Jetton-минтер: выпуск токенов, адреса кошельков, метаданные и управление.',
  SimpleExtension: 'Расширение Wallet V5: подписка, приём платежей и отмена подписки.',
  WalletV5: 'Кошелёк Wallet V5: подписи, seqno, расширения и действия в регистре c5.',
};
const file = (folder, name) => fs.readFile(path.join(folder, name), 'utf8');
const binary = buffer => ({ base64: buffer.toString('base64'), hex: buffer.toString('hex'),
  bytes: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex'),
  codeHash: codeCell(buffer).hash().toString('hex') });
function cellStats(boc) {
  const seen = new Set(); let bits = 0, refs = 0;
  const walk = cell => {
    const hash = cell.hash().toString('hex');
    if (seen.has(hash)) return;
    seen.add(hash); bits += cell.bits.length; refs += cell.refs.length;
    cell.refs.forEach(walk);
  };
  walk(codeCell(boc));
  return { cells: seen.size, bits, refs };
}
async function loadOutput(folder, id, language, original, summary) {
  if (!(await fs.readFile(path.join(folder, 'original.boc'))).equals(original)) throw new Error(id + ': output variant uses a different original');
  const report = await readJson(path.join(folder, 'report.json'));
  const response = await readJson(path.join(folder, 'response.json'));
  const request = await readJson(path.join(folder, 'request.json'));
  const originalInfo = binary(original);
  if (report.originalHash && report.originalHash !== originalInfo.codeHash) throw new Error(id + ': original hash mismatch');
  let recompiled = null;
  if (report.recompiledHash) {
    recompiled = binary(await fs.readFile(path.join(folder, 'recompiled.boc')));
    if (recompiled.codeHash !== report.recompiledHash) throw new Error(id + ': recompiled hash mismatch');
  }
  const compiledViews = [{ name: 'original.tasm', content: await file(folder, 'original.tasm'), language: 'tvm' },
    { name: 'original.boc · Base64', content: originalInfo.base64, language: 'plain' },
    { name: 'original.boc · hex', content: originalInfo.hex.match(/.{1,64}/g).join('\n'), language: 'plain' }];
  if (recompiled) compiledViews.push(
    { name: 'recompiled.tasm', content: await file(folder, 'recompiled.tasm'), language: 'tvm' },
    { name: 'recompiled.fif', content: await file(folder, 'recompiled.fif'), language: 'tvm' });
  const decompiled = [];
  for (const entry of response.files) {
    const saved = await file(path.join(folder, 'sources'), entry.name);
    if (saved !== entry.content) throw new Error(id + ': generated source differs from response');
    decompiled.push({ name: entry.name, content: saved, language });
  }
  const main = language === 'tolk' ? 'main.tolk' : 'main.fc';
  decompiled.sort((a, b) => (a.name === main ? -1 : b.name === main ? 1 : a.name.localeCompare(b.name)));
  return { outputLanguage:language, decompiled, recompiled, compiledViews, report, request,
    checkedAt:summary.checkedAt, compiler:summary.compiler,
    complete:response.complete !== false && !report.diagnostics?.length };
}
const contracts = [];
for (const fixture of fixtures()) {
  const folder = path.join(directory, fixture.id);
  const sourceRoot = path.join(root, 'fixtures/acton-sources', fixture.project);
  // A contract's local import closure; the other entry point has its own report.
  const sources = [];
  const seen = new Set();
  const visit = async name => {
    if (seen.has(name)) return;
    seen.add(name);
    const content = await file(sourceRoot, name);
    sources.push({ name, content, language: 'tolk' });
    for (const match of content.matchAll(/^import\s+"([^"]+)"/gm)) {
      const imported = match[1];
      if (imported.startsWith('@gen/')) await visit('gen/' + imported.slice(5) + '.tolk');
      else if (imported.startsWith('@contracts/')) await visit('contracts/' + imported.slice(11) + '.tolk');
      else if (!imported.startsWith('@')) await visit(path.posix.join(path.posix.dirname(name), imported + '.tolk'));
    }
  };
  await visit(fixture.source ?? 'contracts/' + fixture.id + '.tolk');
  const original = await fs.readFile(path.join(folder, 'original.boc'));
  const archived = await readJson(path.join(root, 'fixtures/acton', fixture.id + '.json'));
  if (!original.equals(Buffer.from(archived.code_boc64, 'base64'))) throw new Error(fixture.id + ': original differs from archived fixture');
  const originalInfo = binary(original);
  const outputs = { func:await loadOutput(folder, fixture.id, 'func', original, summary) };
  if (tolkSummary) outputs.tolk = await loadOutput(path.join(tolkDirectory, fixture.id), fixture.id, 'tolk', original, tolkSummary);
  const getters = [...sources[0].content.matchAll(/get fun\s+(\w+)\s*\(/g)].map(match => ({
    name: match[1], methodId: crc16(Buffer.from(match[1])).readUInt16BE(0) | 0x10000,
  }));
  contracts.push({ id: fixture.id, project: fixture.project, description: descriptions[fixture.id],
    sources, outputs, original: originalInfo, cells: cellStats(original), getters,
    license: await file(sourceRoot, 'LICENSE'), config: await file(sourceRoot, 'Acton.toml'),
    inputs: {
      address: '0:' + '07'.repeat(32), storageBoc: fixture.data.toBoc().toString('base64'),
      initialBalanceNanotons: '10000000000', now: 1700000000, randomSeedHex: '00'.repeat(32),
      getters: fixture.getters.map(probe => ({ ...probe, args: probe.args.map(arg => typeof arg === 'object'
        ? { type: arg.type, boc: arg.cell.toBoc().toString('base64') } : String(arg)) })),
      messages: fixture.messages.map(probe => ({ label: probe.label, from: probe.from.toRawString(),
        bodyBoc: probe.body.toBoc().toString('base64'), valueNanotons: (probe.value ?? 1000000000n).toString(),
        bounce: probe.bounce ?? false, bounced: probe.bounced ?? false,
        expectExit: probe.expectExit, expectOut: probe.expectOut ?? null })),
    },
  });
}
const data = { languages:tolkSummary ? ['func','tolk'] : ['func'], acton:'1.0.0 (3a4f0dc)',
  repo: 'https://github.com/attikusfinch/tvm-decompiler', contracts };
// Escape HTML parser metacharacters in embedded JSON, including a literal </script> in source code.
const json = JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
const template = await file(path.dirname(fileURLToPath(import.meta.url)), 'report-template.html');
if (template.split('__REPORT_DATA__').length !== 2) throw new Error('Expected one report data placeholder');
await fs.mkdir(path.dirname(destination), { recursive: true });
await fs.writeFile(destination, template.replace('__REPORT_DATA__', () => json));
console.log(`${destination}: ${contracts.length} contracts, ${(await fs.stat(destination)).size} bytes`);
