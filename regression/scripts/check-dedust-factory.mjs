import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc,legacyFuncVersion} from './func-legacy.mjs';
import {checkFactory} from './dedust-factory-fixtures.mjs';
const project=path.resolve(root,'../reconstruction'),entry='dedust/classic/ClassicFactory/main.fc';
const sources=await loadFuncSources(project,entry),compiled=await compileLegacyFunc({sources,targets:[entry]});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles/ClassicFactory.boc')),comparison=compareBoc(original,candidate);
assert.equal(comparison.sameSerializedBoc,true,'whole Factory serialized BOC');
await fs.mkdir(path.join(project,'build/ClassicFactory'),{recursive:true});
await fs.writeFile(path.join(project,'build/ClassicFactory/code.boc'),candidate);
const tests=await checkFactory(original,candidate);
await writeJson(path.join(project,'dedust/classic/ClassicFactory/recovery-verification.json'),{
    scope:'Byte-identical readable Factory: ownership, versioned code registry, deterministic deployments, operators and two-step deposit funding',
    compiler:await legacyFuncVersion(),comparison,
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),tests});
console.log(`ClassicFactory: exact readable; ${tests.messages.length} message + ${tests.getters.length} getter probes`);
