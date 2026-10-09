import {familyDirectory} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Cell } from '@ton/core';
import { root, writeJson } from './lib.mjs';
import { disassembleExact, assembleExact } from './exact-assembly.mjs';

const archive = path.resolve(process.argv[2] ?? path.join(root,'../../dedust-mainnet'));
const target = path.resolve(root,'../reconstruction');
const manifest = JSON.parse(await fs.readFile(path.join(archive,'manifest.json'),'utf8'));
let frozen;
try { frozen = JSON.parse(await fs.readFile(path.join(target,'oracles.json'),'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const entries = [];
for (const entry of manifest.contracts.filter(c => !c.sameCodeAs)) {
    const boc = await fs.readFile(path.join(archive,'contracts',entry.name,'code.boc'));
    const hash = Cell.fromBoc(boc)[0].hash().toString('hex');
    assert.equal(hash, entry.codeHash, entry.name);
    const sha256 = createHash('sha256').update(boc).digest('hex');
    const pinned = frozen?.contracts.find(c => c.name === entry.name);
    if (pinned) assert.equal(sha256,pinned.bocSha256, `${entry.name}: frozen oracle changed`);
    const assembly = disassembleExact(boc);
    assert.deepEqual(assembleExact(assembly),boc,`${entry.name}: instruction reference is not exact`);
    await fs.mkdir(path.join(target,'oracles'),{recursive:true});
    await fs.mkdir(path.join(target,familyDirectory(entry.name)),{recursive:true});
    await fs.writeFile(path.join(target,'oracles',entry.name+'.boc'),boc);
    await fs.writeFile(path.join(target,familyDirectory(entry.name),'reference.tasm'),
        `// Independent TVM instruction reference; not recovered high-level source.\n// Mainnet executable code hash: ${hash}\n`+assembly);
    entries.push({name:entry.name,codeHash:hash,bocSha256:sha256,codeBytes:boc.length,
        evidence:entry.evidence ?? entry.source ?? null});
    console.log(`${entry.name}: editable instruction reference compiles byte-for-byte (${boc.length} bytes)`);
}
await writeJson(path.join(target,'oracles.json'),{schemaVersion:1,network:'mainnet',
    archiveGeneratedAt:manifest.generatedAt,scope:manifest.scope,limitations:manifest.limitations,contracts:entries});
