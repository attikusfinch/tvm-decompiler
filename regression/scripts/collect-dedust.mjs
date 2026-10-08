import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Address, Cell, CellType, Dictionary, crc16 } from '@ton/core';
import { root, writeJson, actonDisasm, decompile, recompile, compareBoc } from './lib.mjs';

export const output = path.resolve(process.env.DEDUST_OUTPUT ?? path.join(root, '../../dedust-mainnet'));
const chain = 'https://tonapi.io';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequest = 0;

// Public, read-only calls. Cache the exact response and its retrieval time.
export async function download(url, relative, { refresh = false } = {}) {
  const file = path.join(output, relative);
  if (!refresh) {
    try {
      const raw = await fs.readFile(file, 'utf8');
      try { await fs.access(`${file}.source.json`); }
      catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await writeJson(`${file}.source.json`, { url, savedAt: (await fs.stat(file)).mtime.toISOString(),
          timestampBasis: 'Existing snapshot file modification time', network: 'mainnet',
          sha256: createHash('sha256').update(raw).digest('hex') });
      }
      return JSON.parse(raw);
    }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    await pause(Math.max(0, 1200 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      await pause(2000 * (attempt + 1));
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const body = await response.json();
    await fs.mkdir(path.dirname(file), { recursive: true });
    await writeJson(file, body);
    await writeJson(`${file}.source.json`, {
      url, retrievedAt: new Date().toISOString(), network: 'mainnet',
      sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    });
    return body;
  }
  throw new Error(`API unavailable after retries: ${url}`);
}

export function libraryHash(cell) {
  return cell.type === CellType.Library ? cell.beginParse(true).skip(8).loadBuffer(32).toString('hex') : null;
}

export async function resolveLibrary(hash) {
  const body = await download(`${chain}/v2/blockchain/libraries/${hash}`, `libraries/${hash}/api.json`);
  const boc = Buffer.from(body.boc, 'hex');
  const [code, ...extra] = Cell.fromBoc(boc);
  if (extra.length || code.hash().toString('hex') !== hash) throw new Error(`Library hash mismatch: ${hash}`);
  await fs.writeFile(path.join(output, 'libraries', hash, 'code.boc'), boc);
  return code;
}

export async function account(name, address, source) {
  const parsed = Address.parse(address);
  const body = await download(`${chain}/v2/blockchain/accounts/${parsed.toRawString()}`, `accounts/${name}/account.json`);
  if (Address.parse(body.address).toRawString() !== parsed.toRawString()) throw new Error('Account address mismatch');
  if (body.status !== 'active' || !body.code) throw new Error(`Inactive account: ${name} (${body.status})`);
  const directory = path.join(output, 'accounts', name);
  const accountBoc = Buffer.from(body.code, 'hex');
  const cells = Cell.fromBoc(accountBoc);
  if (cells.length !== 1) throw new Error(`Unexpected account code root count: ${name}`);
  const [accountCode] = cells;
  const hash = libraryHash(accountCode);
  const code = hash ? await resolveLibrary(hash) : accountCode;
  await fs.writeFile(path.join(directory, 'account-code.boc'), accountBoc);
  await fs.writeFile(path.join(directory, 'code.boc'), code.toBoc());
  if (body.data) await fs.writeFile(path.join(directory, 'data.boc'), Buffer.from(body.data, 'hex'));
  const record = {
    name, address: parsed.toString(), rawAddress: parsed.toRawString(), source,
    snapshot: JSON.parse(await fs.readFile(path.join(directory, 'account.json.source.json'), 'utf8')),
    status: body.status, accountCodeHash: accountCode.hash().toString('hex'),
    codeHash: code.hash().toString('hex'), libraryHash: hash,
    lastTransactionLt: String(body.last_transaction_lt), lastTransactionHash: body.last_transaction_hash,
    codeBytes: code.toBoc().length,
  };
  if (/^Classic.*Pool/.test(name)) {
    const data = Cell.fromBoc(Buffer.from(body.data, 'hex'))[0].beginParse();
    for (let i = 0; i < 4; i++) data.loadRef();
    record.version = data.loadUint(16);
  }
  await writeJson(path.join(directory, 'metadata.json'), record);
  console.log(`${name}: ${record.codeHash} (${record.codeBytes} bytes)`);
  return { record, code };
}

const abi = 'https://github.com/ton-blockchain/abis/blob/master/data/dedust/info.toml';
export const seeds = [
  ['ClassicFactory', 'EQBfBWT7X2BHg9tXAxzhz2aKiNTU1tpt5NsiK0uSDW_YAJ67', 'https://hub-beta.dedust.io/docs/cpmm-v1/reference/core/factory'],
  ['ClassicNativeVault', 'EQDa4VOnTYlLvDJ0gZjNYm5PXfSmmtL6Vs6A_CZEtXCNICq_', abi],
  ['ClassicJettonVault', 'EQAYqo4u7VF0fa4DPAebk4g9lBytj2VFny7pzXR0trjtXQaO', abi],
  ['ClassicVolatilePool', 'EQA-X_yo3fzzbDbJ_0bzFWKqtRuZFIRa1sJsveZJ1YpViO3r', abi],
  ['ClassicStablePool', 'EQABt8YegyD7VJnZdFVwom8wwqp0E0X8tN2Y6NhrDmbrnSXP', abi],
  ['CpmmPoolV1', 'EQAEGspJNRpLvMDXeLrD8QcUNSNAP61jwgFQIJlOEPDCtwwi', abi],
  ['CpmmPoolV2', 'EQD026kOv4j6-56O6y8kbaaFZdQhVkh4RbEGrQND7XJMlgLf', abi],
  ['UranusFactoryV3', 'EQA6ivhIOBQJvqO1SY3IvutmluM1d817gZDeEjiaVNBLePd3', abi],
  ['UranusMemeV2', 'EQAO_1qemostkDtMfhp7XU0nOsAkQ_tLUO5YJeNMrj3dRAaH', abi],
  ['UranusMemeV3', 'EQA6dGeKIcHUVQghKGmGe1fEfyfYaYyLC594PkYO5uIbEqT4', abi],
  ['UranusMemeWalletV3', 'EQAIQw-od7Nq8ZJrn40VQHzXOFm3N7XteVgF4ITp-GiiBjzG', abi],
  ['X1000WalletV2', 'EQAFixgyPnv8ejzC5jjobQmbAZxpe1Sbh_rKlk7FsnZPUFZn', abi],
];

async function exportCode(name, code, evidence, version = null) {
  const hash = code.hash().toString('hex');
  const lib = libraryHash(code);
  const resolved = lib ? await resolveLibrary(lib) : code;
  const dir = path.join(output, 'contracts', name);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'code.boc'), resolved.toBoc());
  if (lib) await fs.writeFile(path.join(dir, 'library-reference.boc'), code.toBoc());
  const record = { name, codeHash: resolved.hash().toString('hex'), referenceHash: lib ? hash : null, version, evidence };
  await writeJson(path.join(dir, 'metadata.json'), record);
  return { record, code: resolved };
}

async function factoryChildren() {
  const data = Cell.fromBoc(await fs.readFile(path.join(output, 'accounts/ClassicFactory/data.boc')))[0];
  const s = data.beginParse();
  s.loadAddress(); s.loadMaybeAddress(); s.loadUint(32);
  const factoryVersion = s.loadUint(16);
  const blank = s.loadRef(), config = s.loadRef().beginParse();
  const operatorVersion = s.loadUint(16), operator = s.loadMaybeRef();
  s.endParse();
  const poolVersion = config.loadUint(16), pool = config.loadRef();
  const depositVersion = config.loadUint(16), deposit = config.loadRef();
  const vaults = config.loadDict(Dictionary.Keys.Uint(4), {
    parse(slice) { const version = slice.loadUint(16), code = slice.loadRef(); slice.endParse(); return { version, code }; },
    serialize() { throw new Error('Read-only parser'); },
  });
  const lpWallet = config.loadRef();
  config.endParse();
  const names = { 0: 'ClassicNativeVault', 1: 'ClassicJettonVault', 2: 'ClassicExtraCurrencyVault' };
  const records = [];
  const emit = async (name, code, version, field) => records.push(await exportCode(name, code, {
    account: 'ClassicFactory', address: seeds[0][1], dataHash: data.hash().toString('hex'), field,
    schema: 'https://github.com/ton-blockchain/abis/blob/master/data/dedust/factory/types/dedust_factory_v2.types.tolk',
  }, version));
  await emit('ClassicBlank', blank, null, 'blankCode');
  await emit(`ClassicPoolInstalledV${poolVersion}`, pool, poolVersion, 'config.poolCode');
  await emit('ClassicLiquidityDeposit', deposit, depositVersion, 'config.liquidityDepositCode');
  await emit('ClassicLpWallet', lpWallet, null, 'config.lpWalletCode');
  if (operator) await emit('ClassicOperator', operator, operatorVersion, 'operatorCode');
  for (const [type, { version, code }] of vaults) await emit(names[type] ?? `ClassicVaultAssetType${type}`, code, version, `config.vaultCodeByAssetType[${type}]`);
  await writeJson(path.join(output, 'discovery/factory-configuration.json'), { factoryVersion, poolVersion, depositVersion, operatorVersion, vaults: [...vaults].map(([type, value]) => ({ type, version: value.version, codeHash: value.code.hash().toString('hex') })) });
  return records;
}

export async function buildArchive() {
  const discovery = JSON.parse(await fs.readFile(path.join(output, 'discovery/accounts.json'), 'utf8'));
  if (discovery.errors.length) throw new Error('Account discovery contains errors; inspect discovery/accounts.json');
  try {
    const extra = JSON.parse(await fs.readFile(path.join(output, 'discovery/extra-accounts.json'), 'utf8'));
    for (const record of extra) if (!discovery.records.some(r => r.name === record.name)) discovery.records.push(record);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const entries = await factoryChildren();
  for (const record of discovery.records) {
    const canonical = { ClassicLpWalletLive: 'ClassicLpWallet', CpmmPositionLive: 'CpmmPosition',
      ClassicPoolV9Live: 'ClassicPoolInstalledV9', ClassicPoolRevisionSample: 'ClassicPoolInstalledV8' }[record.name] ?? record.name;
    const proof = { account: record.name, address: record.address, rawAddress: record.rawAddress, source: record.source,
      accountCodeHash: record.accountCodeHash, libraryHash: record.libraryHash, lastTransactionLt: record.lastTransactionLt };
    const code = Cell.fromBoc(await fs.readFile(path.join(output, 'accounts', record.name, 'code.boc')))[0];
    const existing = entries.find(entry => entry.record.name === canonical);
    if (existing) {
      if (existing.record.codeHash !== record.codeHash) throw new Error(`Installed and live code differ for ${record.name}`);
      existing.record.liveAccount = proof;
    } else entries.push(await exportCode(canonical, code, proof, record.version ?? null));
  }
  // Fixed point: libraries can themselves contain further library references.
  const known = new Set(entries.map(entry => entry.record.codeHash));
  for (let index = 0; index < entries.length; index++) {
    const { record, code } = entries[index], seen = new Set(), references = [];
    function walk(cell, trail) {
      const hash = cell.hash().toString('hex');
      if (seen.has(hash)) return; seen.add(hash);
      const lib = libraryHash(cell);
      if (lib) references.push({ hash: lib, trail });
      cell.refs.forEach((child, i) => walk(child, [...trail, i]));
    }
    walk(code, []);
    for (const { hash, trail } of references) {
      if (known.has(hash)) continue;
      known.add(hash);
      const code = await resolveLibrary(hash);
      const file = path.join(output, 'libraries', hash, 'code.tasm');
      await actonDisasm(path.join(output, 'libraries', hash, 'code.boc'), file);
      const assembly = await fs.readFile(file, 'utf8');
      const methods = new Set([...assembly.matchAll(/│\s+(-?\d+) =>/g)].map(match => Number(match[1])));
      const methodId = name => crc16(Buffer.from(name)).readUInt16BE() | 65536;
      let name = `Library_${hash.slice(0, 12)}`, role = null;
      if (methods.has(methodId('get_deposit_data')) && /DC5DDBA1/i.test(assembly) && /3DB5F13A/i.test(assembly)) {
        name = 'CpmmDeposit'; role = { getters: ['get_deposit_data'], operations: ['dc5ddba1', '3db5f13a'], docs: 'https://hub-beta.dedust.io/docs/cpmm-v2/reference/deposit' };
      } else if (methods.has(methodId('get_position_data')) && methods.has(methodId('get_available_fees'))) {
        name = 'CpmmPosition'; role = { getters: ['get_position_data', 'get_available_fees'], docs: 'https://hub-beta.dedust.io/docs/cpmm-v2/reference/position' };
      } else if (methods.has(methodId('get_affiliate_account_data'))) {
        name = 'CpmmAffiliateAccount'; role = { getters: ['get_affiliate_account_data'], docs: 'https://hub-beta.dedust.io/docs/cpmm-v2/concepts', inferred: true };
      } else if (record.name === 'UranusMemeV2' && methods.has(methodId('get_wallet_data'))) {
        name = 'UranusMemeWalletV2'; role = { getters: ['get_wallet_data'], docs: 'https://hub-beta.dedust.io/docs/uranus/reference/meme-wallet', inferred: true };
      }
      const collision = entries.find(entry => entry.record.name === name);
      if (collision && collision.record.codeHash !== hash) name += `_${hash.slice(0, 12)}`;
      entries.push(await exportCode(name, code,
        { parent: record.name, parentCodeHash: record.codeHash, cellReferencePath: trail, source: `${chain}/v2/blockchain/libraries/${hash}`, roleAssignment: role }));
    }
  }
  // Deduplicate by both name and code. Alias folders still contain readable sources.
  const preferred = new Map();
  for (const entry of entries) {
    const previous = preferred.get(entry.record.codeHash);
    const isLiveAlias = /Live$/.test(entry.record.name);
    if (!previous || (/Live$/.test(previous.record.name) && !isLiveAlias)) preferred.set(entry.record.codeHash, entry);
  }
  entries.sort((a, b) => Number(preferred.get(b.record.codeHash) === b) - Number(preferred.get(a.record.codeHash) === a));
  const unique = new Map();
  for (const { record } of entries) {
    if (unique.has(record.codeHash)) {
      record.sameCodeAs = unique.get(record.codeHash).name;
      continue;
    }
    unique.set(record.codeHash, record);
    const dir = path.join(output, 'contracts', record.name), boc = await fs.readFile(path.join(dir, 'code.boc'));
    try { await actonDisasm(path.join(dir, 'code.boc'), path.join(dir, 'code.tasm')); }
    catch (error) { await fs.writeFile(path.join(dir, 'disassembly-error.txt'), error.stderr ?? error.message); }
    record.languages = {};
    for (const language of ['func', 'tolk']) {
      const langDir = path.join(dir, language);
      try {
        const response = await decompile(boc, langDir, { local: true, language });
        for (const file of response.files ?? []) {
          if (!/^[\w.-]+\.(fc|tolk)$/.test(file.name)) throw new Error('Unsafe decompiled filename');
          await fs.writeFile(path.join(langDir, file.name), file.content);
        }
        const compilation = await recompile(response, path.join(langDir, 'validation'));
        record.languages[language] = {
          complete: response.complete === true, diagnosticCount: response.diagnostics?.length ?? 0,
          diagnostics: response.diagnostics ?? [], normalizations: response.normalizations ?? [],
          compilation: { status: compilation.status, ...(compilation.message ? { message: compilation.message } : {}) },
          ...(compilation.status === 'ok' ? { comparison: compareBoc(boc, compilation.boc) } : {}),
        };
        console.log(`${record.name} ${language}: complete=${response.complete}, ${compilation.status}`);
      } catch (error) { record.languages[language] = { error: error.message }; console.error(`${record.name} ${language}: ${error.message}`); }
    }
    await writeJson(path.join(dir, 'metadata.json'), record);
  }
  for (const { record } of entries.filter(entry => entry.record.sameCodeAs)) {
    const source = path.join(output, 'contracts', record.sameCodeAs), destination = path.join(output, 'contracts', record.name);
    for (const language of ['func', 'tolk']) await fs.cp(path.join(source, language), path.join(destination, language), { recursive: true });
    await fs.copyFile(path.join(source, 'code.tasm'), path.join(destination, 'code.tasm'));
    record.languages = unique.get(record.codeHash).languages;
    await writeJson(path.join(destination, 'metadata.json'), record);
  }
  const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.resolve(root, '../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
  const manifest = { schemaVersion: 1, generatedAt: new Date().toISOString(), network: 'mainnet',
    scope: 'Current on-chain DeDust factory configuration; live representative classic, CPMM v2, Uranus and x1000 accounts; recursively resolved referenced libraries. This is a code-family archive, not an enumeration of every deployed account.',
    decompilerJarSha256: createHash('sha256').update(await fs.readFile(jar)).digest('hex'),
    limitations: [
      'Classic discovery samples the first 60 registry entries; it does not prove absence of additional historical pool revisions.',
      'Standalone Classic FeeCollector has no authenticated deployment address in the configured seeds and inspected official registry sample.',
      'API snapshots were retrieved at different times, not at one pinned masterchain block. Cell hashes are verified; consensus proofs were not fetched.',
      'Complete decompilation and successful compilation do not establish behavioral equivalence. Recompiled code hashes are compared separately.',
    ],
    accounts: discovery.records, contracts: entries.map(entry => entry.record), uniqueCodeCount: unique.size };
  await writeJson(path.join(output, 'manifest.json'), manifest);
  return manifest;
}

async function collect() {
  const records = [], errors = [], libraryRefs = new Map();
  for (const [name, address, source] of seeds) {
    try {
      const { record, code } = await account(name, address, source);
      records.push(record);
      const seen = new Set();
      function walk(cell, trail) {
        const hash = cell.hash().toString('hex');
        if (seen.has(hash)) return;
        seen.add(hash);
        const lib = libraryHash(cell);
        if (lib) libraryRefs.set(lib, [...(libraryRefs.get(lib) ?? []), { name, trail }]);
        cell.refs.forEach((child, index) => walk(child, [...trail, index]));
      }
      walk(code, []);
    } catch (error) { errors.push({ name, address, error: error.message }); console.error(`${name}: ${error.message}`); }
  }
  for (const [hash, parents] of libraryRefs) {
    try { await resolveLibrary(hash); } catch (error) { errors.push({ library: hash, parents, error: error.message }); }
  }
  // Registries establish protocol membership; they do not imply that each listed
  // account is active or that the sample below enumerates every deployed revision.
  const api = 'https://mainnet.api.dedust.io/v4/api';
  for (const [name, endpoint] of [['classic', 'allclassic'], ['stable', 'allstable'], ['cpmm', 'allcpmm'], ['uranus', 'alluranus']]) {
    await download(`${api}/get_pools_${endpoint}`, `discovery/${name}-pools.json`);
  }
  const pools = JSON.parse(await fs.readFile(path.join(output, 'discovery/classic-pools.json'), 'utf8'));
  const query = new URLSearchParams({ include_boc: 'true' });
  for (const pool of pools.slice(0, 60)) query.append('address', pool.pool_address);
  const sampled = await download(`https://toncenter.com/api/v3/accountStates?${query}`, 'discovery/classic-sample-boc-states.json');
  const seen = new Set(records.filter(r => /Classic.*Pool/.test(r.name)).map(r => r.codeHash)), extra = [];
  for (const state of sampled.accounts) {
    if (state.status !== 'active' || !state.code_hash) continue;
    const hash = Buffer.from(state.code_hash, 'base64').toString('hex');
    if (seen.has(hash)) continue;
    seen.add(hash);
    const name = hash === '778f0d3fe6482c50888970df5e787f40f3a4ab282170c035a5920877058c99d3' ? 'ClassicPoolV9Live'
      : hash === 'c0f9d14fbc8e14f0d72cba2214165eee35836ab174130912baf9dbfa43ead562' ? 'ClassicPoolRevisionSample' : `ClassicPoolRevision_${hash.slice(0, 12)}`;
    extra.push((await account(name, state.address, 'discovery/classic-sample-boc-states.json')).record);
  }
  const holders = await download(`${chain}/v2/jettons/${seeds.find(seed => seed[0] === 'ClassicVolatilePool')[1]}/holders?limit=1`, 'discovery/classic-lp-holders.json');
  if (holders.addresses[0]) extra.push((await account('ClassicLpWalletLive', holders.addresses[0].address, 'discovery/classic-lp-holders.json')).record);
  const pool = seeds.find(seed => seed[0] === 'CpmmPoolV2')[1];
  const providers = await download(`${api}/pools/${Address.parse(pool).toRawString()}/providers`, 'discovery/cpmm-providers.json');
  if (providers.providers[0]) {
    const args = new URLSearchParams({ args: providers.providers[0].wallet_address });
    const getter = await download(`${chain}/v2/blockchain/accounts/${pool}/methods/get_position_address?${args}`, 'discovery/cpmm-position-address.json');
    if (!getter.success || getter.exit_code !== 0) throw new Error('Position address getter failed');
    const [slice] = Cell.fromBoc(Buffer.from(getter.stack[0].cell, 'hex'));
    const address = slice.beginParse().loadAddress();
    extra.push((await account('CpmmPositionLive', address.toString(), 'discovery/cpmm-position-address.json')).record);
  }
  await writeJson(path.join(output, 'discovery/extra-accounts.json'), extra);
  await writeJson(path.join(output, 'discovery', 'accounts.json'), { records, errors, embeddedLibraryReferences: Object.fromEntries(libraryRefs) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--archive')) await buildArchive();
  else await collect();
}
