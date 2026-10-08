import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc,legacyFuncVersion} from './func-legacy.mjs';
import {checkBlank} from './dedust-blank-fixtures.mjs';

const project=path.resolve(root,'../reconstruction/dedust'),entry='ClassicBlank/main.fc';
const sources=await loadFuncSources(project,entry),compiled=await compileLegacyFunc({sources,targets:[entry]});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles/ClassicBlank.boc')),comparison=compareBoc(original,candidate);
assert.equal(comparison.sameSerializedBoc,true,'whole ClassicBlank serialized BOC');
await fs.mkdir(path.join(project,'build/ClassicBlank'),{recursive:true});
await fs.writeFile(path.join(project,'build/ClassicBlank/code.boc'),candidate);
const tests=await checkBlank(original,candidate);
await writeJson(path.join(project,'ClassicBlank/recovery-verification.json'),{
    scope:'Byte-identical readable ClassicBlank: constructor handoff, authorization, rollback and full-balance refund',
    compiler:await legacyFuncVersion(),comparison,
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),tests});
console.log(`ClassicBlank: exact readable; ${tests.messages.length} message + ${tests.getters.length} constructor-hook probes`);
