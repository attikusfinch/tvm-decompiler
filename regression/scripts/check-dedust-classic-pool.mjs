import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc,legacyFuncVersion} from './func-legacy.mjs';
import {checkClassicVolatilePool,checkClassicPoolV8,checkClassicPoolV9} from './dedust-classic-pool-fixtures.mjs';
const family=process.argv[2]??'ClassicVolatilePool',project=path.resolve(root,'../reconstruction/dedust'),entry=family+'/main.fc';
const sources=await loadFuncSources(project,entry),compiled=await compileLegacyFunc({sources,targets:[entry]});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles',family+'.boc')),comparison=compareBoc(original,candidate);
assert.equal(comparison.sameSerializedBoc,true,'whole Classic Pool serialized BOC');
await fs.mkdir(path.join(project,'build',family),{recursive:true});await fs.writeFile(path.join(project,'build',family,'code.boc'),candidate);
const checks={ClassicVolatilePool:checkClassicVolatilePool,ClassicPoolInstalledV8:checkClassicPoolV8,ClassicPoolInstalledV9:checkClassicPoolV9};
const tests=await checks[family](original,candidate);
await writeJson(path.join(project,family,'recovery-verification.json'),{
 scope:'Byte-identical readable Classic Pool: volatile/stable quotes, liquidity mint/burn, authenticated swaps, routes, failure refund and rollback, protocol fees, collectors, upgrades, metadata and Blank installation',
 compiler:await legacyFuncVersion(),comparison,
 sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),tests});
console.log(`${family}: exact readable; ${tests.messages.length} message + ${tests.getters.length} getter probes`);
