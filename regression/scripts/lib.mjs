import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { compileFunc as compileRaw, compilerVersion } from '@ton-community/func-js';
import { Address, Cell, beginCell, internal } from '@ton/core';
import { Blockchain, SmartContract, GetMethodError } from '@ton/sandbox';
import { initializeStorageStats } from './storage-stat.mjs';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const endpoint = process.env.DECOMPILER_URL ?? 'https://decompiler.swap.coffee/api/v1/decompile';
export const run = promisify(execFile);
export const readJson = async (file) => JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
export const writeJson = (file, value) => fs.writeFile(file, JSON.stringify(value, null, 2) + '\n');
export const version = async (language = 'func') => language === 'tolk'
  ? (await import('./tolk.mjs')).tolkVersion() : process.env.FUNC_BACKEND === 'native'
  ? (await import('./native.mjs')).nativeVersion() : { backend: 'wasm', ...await compilerVersion() };

export async function compile(config) {
  if (process.env.FUNC_BACKEND === 'native') return (await import('./native.mjs')).compileNative(config);
  // func-js instantiates Emscripten per compilation and leaves process listeners behind.
  const events = ['uncaughtException', 'unhandledRejection'];
  const before = new Map(events.map(event => [event, new Set(process.listeners(event))]));
  try { return await compileRaw(config); }
  finally {
    for (const event of events) {
      for (const listener of process.listeners(event)) {
        if (!before.get(event).has(listener)) process.removeListener(event, listener);
      }
    }
  }
}

export function codeCell(boc) {
  const cells = Cell.fromBoc(boc);
  if (cells.length !== 1) throw new Error('Expected a BOC containing exactly one code root');
  return cells[0];
}

export async function jsonRequest(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(45000) });
  const raw = await response.text();
  let body;
  try { body = JSON.parse(raw); } catch { throw new Error(`HTTP ${response.status}: invalid JSON`); }
  if (!response.ok || body.ok === false) throw new Error(`HTTP ${response.status}: ${body.error ?? raw}`);
  return body;
}

export async function decompile(boc, directory, { offline = false, refresh = false, local = false, exact = false, language = 'func', normalize = true } = {}) {
  if (!['func', 'tolk'].includes(language)) throw new Error('Invalid output language');
  if (language !== 'func' && !local) throw new Error('Tolk output requires the local decompiler');
  await fs.mkdir(directory, { recursive: true });
  const responsePath = path.join(directory, 'response.json');
  const hash = codeCell(boc).hash().toString('hex');
  const source = local ? await (await import('./local.mjs')).localIdentity(exact, language, normalize) : endpoint;
  const requestPath = path.join(directory, 'request.json');
  if (!refresh) {
    try {
      const saved = await readJson(requestPath);
      if (saved.codeHash === hash && saved.endpoint === source) {
        if (saved.error) throw new Error(saved.error);
        return await readJson(responsePath);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (offline) throw new Error(`No cached response for ${hash} at ${source}`);
  let body;
  try {
    body = local ? await (await import('./local.mjs')).decompileLocal(boc, directory, { exact, language, normalize }) : await jsonRequest(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boc: boc.toString('base64') }),
    });
  } catch (error) {
    await writeJson(requestPath, { codeHash: hash, endpoint: source, fetchedAt: new Date().toISOString(), error: error.message });
    throw error;
  }
  await writeJson(responsePath, body);
  await writeJson(requestPath, { codeHash: hash, endpoint: source, fetchedAt: new Date().toISOString() });
  return body;
}

export async function recompile(response, directory) {
  if (!Array.isArray(response.files) || !response.files.length) throw new Error('Response has no files');
  const sources = {};
  for (const file of response.files) {
    // API names are untrusted. Do not allow traversal, absolute paths or duplicate files.
    if (typeof file.name !== 'string' || !/^[\w.-]+(?:\/[\w.-]+)*\.(?:fc|tolk)$/.test(file.name)
        || file.name.split('/').some(p => p === '.' || p === '..')
        || typeof file.content !== 'string' || Object.hasOwn(sources, file.name)) {
      throw new Error('Invalid or duplicate source file in response');
    }
    sources[file.name] = file.content;
    const destination = path.join(directory, 'sources', file.name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, file.content);
  }
  const main = sources['main.tolk'] ? 'main.tolk' : 'main.fc';
  if (!sources[main]) throw new Error('Response has no main.fc or main.tolk');
  if (Object.keys(sources).some(name => name.endsWith('.tolk') !== main.endsWith('.tolk'))) throw new Error('Response mixes output languages');
  for (const name of ['recompiled.boc', 'recompiled.fif', 'recompiled.tasm', 'compile-error.txt']) {
    await fs.rm(path.join(directory, name), { force: true });
  }
  const legacyMarkers = [...sources[main].matchAll(/^\s*(?:;;|\/\/)\s*(unparsed:|exception:|unresolved call).*$/gm)].map(match => match[0].trim());
  if (response.complete === false || response.diagnostics?.length || legacyMarkers.length) {
    const diagnostics = response.diagnostics?.length ? response.diagnostics : legacyMarkers;
    await writeJson(path.join(directory, 'diagnostics.json'), diagnostics);
    return { status: 'incomplete', message: 'Decompiler reported an unsupported instruction or parsing failure', diagnostics };
  }
  await fs.rm(path.join(directory, 'diagnostics.json'), { force: true });
  const result = main.endsWith('.tolk')
    ? await (await import('./tolk.mjs')).compileTolk({ sources }) : await compile({ targets: ['main.fc'], sources });
  if (result.status !== 'ok') {
    await fs.writeFile(path.join(directory, 'compile-error.txt'), result.message);
    const oldAssembler = main.endsWith('.fc') && process.env.FUNC_BACKEND !== 'native' && /(?:undefined|not defined|unknown)/i.test(result.message)
      && /(?:INMSGPARAM|LDSTDADDR|STSTDADDR)/.test(result.message);
    return { status: oldAssembler ? 'compiler-unsupported-instruction' : 'compile-error', message: result.message };
  }
  const boc = Buffer.from(result.codeBoc, 'base64');
  await fs.rm(path.join(directory, 'compile-error.txt'), { force: true });
  await fs.writeFile(path.join(directory, 'recompiled.boc'), boc);
  await fs.writeFile(path.join(directory, 'recompiled.fif'), result.fiftCode);
  return { status: 'ok', boc };
}

export function compareBoc(original, recompiled) {
  return {
    originalHash: codeCell(original).hash().toString('hex'),
    recompiledHash: codeCell(recompiled).hash().toString('hex'),
    sameCodeCell: codeCell(original).equals(codeCell(recompiled)),
    sameSerializedBoc: original.equals(recompiled),
    originalBytes: original.length, recompiledBytes: recompiled.length,
  };
}

function normalizeStack(stack) {
  return stack.map(item => {
    if (item.type === 'int') return { type: 'int', value: item.value.toString() };
    if (item.type === 'tuple') return { type: 'tuple', items: normalizeStack(item.items) };
    if (item.type === 'cell' || item.type === 'slice' || item.type === 'builder') {
      return { type: item.type, cellHash: item.cell.hash().toString('hex') };
    }
    if (item.type === 'null' || item.type === 'nan') return { type: item.type };
    throw new Error(`Unsupported stack type ${item.type}`);
  });
}

export async function compareGetters(original, recompiled, probes, {
  data = beginCell().endCell(), address = new Address(0, Buffer.alloc(32, 7)),
} = {}) {
  const blockchain = await Blockchain.create();
  blockchain.verbosity = { print: false, blockchainLogs: false, vmLogs: 'none', debugLogs: false };
  const create = boc => SmartContract.create(blockchain, {
    address, code: codeCell(boc), data, balance: 10000000000n,
  });
  const contracts = [create(original), create(recompiled)];
  const evaluate = async (contract, probe) => {
    const args = probe.args.map(value => typeof value === 'object' ? value : { type: 'int', value: BigInt(value) });
    try {
      const result = await contract.get(probe.method, args, { now: 1700000000, randomSeed: Buffer.alloc(32), gasLimit: 10000000n });
      return { exitCode: result.exitCode, stack: normalizeStack(result.stack), gasUsed: result.gasUsed.toString() };
    } catch (error) {
      if (!(error instanceof GetMethodError)) throw error;
      return { exitCode: error.exitCode, stack: null, gasUsed: error.gasUsed.toString() };
    }
  };
  const results = [];
  for (const probe of probes) {
    const [before, after] = await Promise.all(contracts.map(c => evaluate(c, probe)));
    results.push({ method: probe.method, args: probe.args.map(v => typeof v === 'object' ? v.type : String(v)),
      sameObservedBehavior: before.exitCode === after.exitCode && JSON.stringify(before.stack) === JSON.stringify(after.stack),
      before, after });
  }
  return results;
}

export async function actonDisasm(bocPath, outputPath) {
  const args = ['disasm', bocPath, '--show-hashes', '--show-offsets', '-o', outputPath];
  const opts = { timeout: 30000, maxBuffer: 4 * 1024 * 1024 };
  if (process.platform !== 'win32') return run('acton', args, opts);
  const toWsl = value => {
    const absolute = path.resolve(value).replaceAll('\\', '/');
    if (!/^[A-Za-z]:\//.test(absolute)) throw new Error('Only local drive paths are supported in WSL');
    return `/mnt/${absolute[0].toLowerCase()}/${absolute.slice(3)}`;
  };
  args[1] = toWsl(bocPath); args[5] = toWsl(outputPath);
  const distro = process.env.WSL_DISTRO ?? 'Ubuntu';
  const located = process.env.ACTON_WSL_PATH ?? (await run('wsl.exe', ['-d', distro, '--exec', '/bin/bash', '-lc', 'command -v acton'], opts)).stdout.trim();
  if (!located.startsWith('/') || located.includes('\n')) throw new Error('Cannot locate Acton in WSL; set ACTON_WSL_PATH');
  return run('wsl.exe', ['-d', distro, '--exec', located, ...args], opts);
}

export async function compareMessages(original, recompiled, probes, { data, address, accurateStorageStats = false }) {
  const blockchain = await Blockchain.create();
  blockchain.now = 1700000000;
  blockchain.verbosity = { print: false, blockchainLogs: false, vmLogs: 'none', debugLogs: false };
  const results = [];
  for (const probe of probes) {
    const outcomes = [];
    for (const boc of [original, recompiled]) {
      const contract = SmartContract.create(blockchain, { address, code: codeCell(boc), data, balance: 10000000000n });
      if (accurateStorageStats) initializeStorageStats(contract);
      const message = internal({ to: address, value: probe.value ?? 1000000000n, bounce: probe.bounce ?? false, body: probe.body });
      message.info.src = probe.from;
      message.info.bounced = probe.bounced ?? false;
      const transaction = await contract.receiveMessage(message, { now: 1700000000, randomSeed: Buffer.alloc(32) });
      const description = transaction.description;
      if (description.type !== 'generic' || description.computePhase.type !== 'vm') throw new Error('Expected VM transaction');
      const state = contract.accountState;
      const active = state?.type === 'active' ? state.state : null;
      const updatedCode = active?.code;
      outcomes.push({ exitCode: description.computePhase.exitCode, aborted: description.aborted,
        stateType: state?.type ?? null,
        dataHash: active?.data?.hash().toString('hex') ?? null,
        codeChanged: updatedCode ? !updatedCode.equals(codeCell(boc)) : false,
        newCodeHash: updatedCode && !updatedCode.equals(codeCell(boc)) ? updatedCode.hash().toString('hex') : null,
        actions: normalizeValue(transaction.outActions ?? []),
        outMessages: [...transaction.outMessages.values()].map(message => ({
          info: message.info.type, body: message.body.hash().toString('hex'),
          destination: message.info.dest?.toRawString(), source: message.info.src?.toRawString(),
          bounce: message.info.bounce, bounced: message.info.bounced,
          value: message.info.value?.coins.toString(),
          extraCurrency: normalizeValue(message.info.value?.other),
          init: normalizeValue(message.init),
        })),
        actionResultCode: description.actionPhase?.resultCode ?? null,
        gasUsed: description.computePhase.gasUsed.toString(),
      });
    }
    const observable = ({ gasUsed, ...rest }) => rest;
    const effects = ({ gasUsed, outMessages, ...rest }) => rest;
    results.push({ label: probe.label,
      sameObservedBehavior: JSON.stringify(observable(outcomes[0])) === JSON.stringify(observable(outcomes[1])),
      sameEffectsAndActions: JSON.stringify(effects(outcomes[0])) === JSON.stringify(effects(outcomes[1])),
      expectedOriginalExit: probe.expectExit ?? null,
      matchesExpectedOriginal: (probe.expectExit === undefined || outcomes[0].exitCode === probe.expectExit)
        && (probe.expectOut === undefined || outcomes[0].outMessages.length === probe.expectOut),
      before: outcomes[0], after: outcomes[1] });
  }
  return results;
}

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Cell) return { cellHash: value.hash().toString('hex') };
  if (value instanceof Address) return value.toRawString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    // Dictionaries expose an iterator; do not include private implementation fields.
    if (typeof value[Symbol.iterator] === 'function') return [...value].map(normalizeValue);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeValue(item)]));
  }
  return value;
}
