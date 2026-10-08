import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { Address, Cell, beginCell } from '@ton/core';
import { root, readJson, writeJson, jsonRequest, codeCell, decompile, recompile, compareBoc, compareGetters, actonDisasm, version } from './lib.mjs';

try {
const { values } = parseArgs({ options: {
  address: { type: 'string' }, boc: { type: 'string' }, response: { type: 'string' },
  offline: { type: 'boolean' }, refresh: { type: 'boolean' }, acton: { type: 'boolean' },
  native: { type: 'boolean' },
  local: { type: 'boolean' }, exact: { type: 'boolean' }, language: { type: 'string', default: 'func' },
} });
if (values.native) process.env.FUNC_BACKEND = 'native';
if (!values.address && !values.boc) throw new Error('Use --address <TON address> or --boc <binary code.boc>');
if (values.address && values.boc) throw new Error('Choose either --address or --boc');
if (values.address && values.offline) throw new Error('Offline mode requires --boc; address lookup needs a network');
let info, original;
if (values.address) {
  info = await jsonRequest(`https://toncenter.com/api/v2/getAddressInformation?address=${encodeURIComponent(values.address)}`);
  if (!info.result?.code) throw new Error('Address has no deployed code');
  original = Buffer.from(info.result.code, 'base64');
} else original = await fs.readFile(values.boc);
const directory = path.join(root, 'artifacts', values.local ? 'checks-local' : 'checks', ...(values.language === 'tolk' ? ['tolk'] : []), codeCell(original).hash().toString('hex'));
await fs.mkdir(directory, { recursive: true });
await fs.writeFile(path.join(directory, 'original.boc'), original);
if (info) await writeJson(path.join(directory, 'account.json'), info);
const response = values.response ? await readJson(values.response) : await decompile(original, directory, values);
const result = await recompile(response, directory);
const report = { checkedAt: new Date().toISOString(), compiler: await version(values.language), address: values.address ?? null,
  compilation: result.status, originalHash: codeCell(original).hash().toString('hex') };
if (result.diagnostics) report.diagnostics = result.diagnostics;
if (result.status === 'ok') {
  Object.assign(report, compareBoc(original, result.boc));
  // Probe only getters known for the announcement's example. Never infer an ABI for arbitrary code.
  if (values.address === 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs') {
    report.getters = await compareGetters(original, result.boc, [
      { method: 78683, args: [] }, { method: 106029, args: [] },
      { method: 103289, args: [{ type: 'slice', cell: beginCell().storeAddress(new Address(0, Buffer.alloc(32, 1))).endCell() }] },
    ], { data: Cell.fromBase64(info.result.data), address: Address.parse(values.address) });
  }
  if (values.acton) {
    for (const name of ['original', 'recompiled']) await actonDisasm(path.join(directory, `${name}.boc`), path.join(directory, `${name}.tasm`));
    report.actonDisassembly = true;
  }
} else { report.message = result.message; process.exitCode = 1; }
await writeJson(path.join(directory, 'report.json'), report);
console.log(JSON.stringify(report, null, 2));
console.log(`Artifacts: ${directory}`);
} catch (error) { console.error(error.message); process.exitCode = 1; }
