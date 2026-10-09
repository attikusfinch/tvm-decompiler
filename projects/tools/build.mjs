import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {FuncCompiler} from '@ton-community/func-js';
import {object} from 'func-bin-044';
import {runTolkCompiler, getTolkCompilerVersion} from '@ton/tolk-js';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const workspace = JSON.parse(await fs.readFile(path.join(root, 'workspace.json')));
export const sha256 = value => createHash('sha256').update(value).digest('hex');
const compiler = new FuncCompiler(object);
const slash = value => value.replaceAll('\\', '/');

export function withinRoot(filename) {
  const full = path.resolve(root, filename);
  assert.ok(full.startsWith(root), 'Source must stay inside this workspace: ' + filename);
  return full;
}

async function funcSources(entry) {
  const sources = {};
  const pending = [entry];
  while (pending.length) {
    const name = slash(path.relative(root, withinRoot(pending.pop())));
    if (Object.hasOwn(sources, name)) continue;
    const source = await fs.readFile(path.join(root, name), 'utf8');
    sources[name] = source;
    for (const [, include] of source.matchAll(/^\s*#include\s+"([^"]+)"/gm)) {
      pending.push(path.join(path.dirname(name), include));
    }
  }
  return sources;
}

export async function compile(entry, language) {
  let result, sources;
  if (language === 'func') {
    sources = await funcSources(entry);
    const events = ['uncaughtException', 'unhandledRejection'];
    const before = new Map(events.map(event => [event, new Set(process.listeners(event))]));
    try {
      result = await compiler.compileFunc({targets: [entry], sources, optLevel: 2});
    } finally {
      for (const event of events) for (const listener of process.listeners(event)) {
        if (!before.get(event).has(listener)) process.removeListener(event, listener);
      }
    }
  } else {
    result = await runTolkCompiler({
      entrypointFileName: entry,
      optimizationLevel: 2,
      fsReadCallback: filename => readFileSync(withinRoot(filename), 'utf8'),
    });
    sources = Object.fromEntries((result.sourcesSnapshot ?? []).map(s => [s.filename, s.contents]));
  }
  assert.equal(result.status, 'ok', `${entry}: ${result.message}`);
  const cell = Cell.fromBase64(result.codeBoc ?? result.codeBoc64);
  return {
    boc: cell.toBoc({idx: false, crc32: true}),
    codeHash: cell.hash().toString('hex'),
    fift: result.fiftCode,
    sources: Object.fromEntries(Object.entries(sources).map(([name, content]) => [slash(name), sha256(content)])),
  };
}

export function selectProjects(requested) {
  const ids = requested.length ? requested : Object.keys(workspace.projects);
  for (const id of ids) assert.ok(Object.hasOwn(workspace.projects, id), 'Unknown project: ' + id);
  return [...new Set(ids)];
}

export function selectContracts(projects) {
  const selected = new Set();
  const add = name => {
    if (selected.has(name)) return;
    const c = workspace.contracts.find(c => c.name === name);
    assert.ok(c, 'Unknown dependency: ' + name);
    selected.add(name);
    c.depends.forEach(add);
  };
  for (const id of projects) {
    workspace.projects[id].contracts.forEach(add);
    workspace.projects[id].dependencies.forEach(add);
  }
  return workspace.contracts.filter(c => selected.has(c.name));
}

export async function build(projects) {
  const tolk = await getTolkCompilerVersion();
  const func = await compiler.compilerVersion();
  assert.equal(tolk, workspace.toolchain.tolk);
  assert.equal(func.funcVersion, workspace.toolchain.func);
  const results = [];
  for (const contract of selectContracts(projects)) {
    const entry = `${contract.directory}/main.${contract.language === 'func' ? 'fc' : 'tolk'}`;
    const built = await compile(entry, contract.language);
    const oracle = await fs.readFile(path.join(root, 'oracles', contract.name + '.boc'));
    assert.equal(sha256(oracle), contract.bocSha256, contract.name + ': frozen oracle SHA256');
    assert.equal(built.codeHash, contract.codeHash, contract.name + ': mainnet code hash');
    assert.ok(built.boc.equals(oracle), contract.name + ': serialized BOC must match byte for byte');
    const directory = path.join(root, contract.project, 'build', contract.name);
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(path.join(directory, 'code.boc'), built.boc);
    await fs.writeFile(path.join(directory, 'main.fif'), built.fift);
    const result = {name: contract.name, entry, compiler: contract.language === 'func' ? func : {tolk},
      codeHash: built.codeHash, bocSha256: sha256(built.boc), sameSerializedBoc: true, sourceSha256: built.sources};
    await fs.writeFile(path.join(directory, 'proof.json'), JSON.stringify(result, null, 2) + '\n');
    results.push(result);
    console.log(`${contract.project}/${contract.name}: byte-exact (${built.boc.length} bytes)`);
  }
  for (const id of projects) {
    const directory = path.join(root, id, 'tests', 'fixtures');
    let files = [];
    try { files = await fs.readdir(directory); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    for (const filename of files.filter(f => f.endsWith('.fc'))) {
      const built = await compile(`${id}/tests/fixtures/${filename}`, 'func');
      const dest = path.join(root, id, 'build', 'fixtures');
      await fs.mkdir(dest, {recursive: true});
      await fs.writeFile(path.join(dest, filename.replace(/\.fc$/, '.boc')), built.boc);
    }
  }
  return results;
}
