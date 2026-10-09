import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadTolkSources,compileTolk,tolkVersion} from './tolk.mjs';
import {checkUranusFactory} from './dedust-uranus-factory-fixtures.mjs';
const project=path.resolve(root,'../reconstruction/dedust'),family='UranusFactoryV3';
const sources=await loadTolkSources(project,family+'/main.tolk'),compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles',family+'.boc')),comparison=compareBoc(original,candidate);assert.equal(comparison.sameSerializedBoc,true);
await fs.mkdir(path.join(project,'build',family),{recursive:true});await fs.writeFile(path.join(project,'build',family,'code.boc'),candidate);
const tests=await checkUranusFactory(original,candidate);
await writeJson(path.join(project,family,'recovery-verification.json'),{scope:'Byte-identical readable Uranus Factory: preset/custom deploy, initial curve, fees, attribution and deterministic StateInit',compiler:await tolkVersion(),comparison,
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')])),tests});
console.log(`${family}: exact; ${tests.messages.length} message probes`);
