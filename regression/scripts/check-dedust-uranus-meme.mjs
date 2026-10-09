import {familyDirectory} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadTolkSources,compileTolk,tolkVersion} from './tolk.mjs';
import {checkUranusMeme} from './dedust-uranus-meme-fixtures.mjs';
const version=Number(process.argv[2]??3);assert.ok(version===2||version===3);
const project=path.resolve(root,'../reconstruction'),family='UranusMemeV'+version;
const sources=await loadTolkSources(project,familyDirectory(family)+'/main.tolk'),compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles',family+'.boc')),comparison=compareBoc(original,candidate);assert.equal(comparison.sameSerializedBoc,true);
await fs.mkdir(path.join(project,'build',family),{recursive:true});await fs.writeFile(path.join(project,'build',family,'code.boc'),candidate);
const tests=await checkUranusMeme(original,candidate,version);
await writeJson(path.join(project,familyDirectory(family),'recovery-verification.json'),{scope:`Readable byte-identical Uranus Meme V${version}: lifecycle, curve trading, attribution, fee claims and migration`,compiler:await tolkVersion(),comparison,
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')])),tests});
console.log(`${family}: exact; ${tests.messages.length} message and ${tests.getters.length} getter probes`);
