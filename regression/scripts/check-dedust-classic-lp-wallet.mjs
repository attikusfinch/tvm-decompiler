import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadFuncSources,compileLegacyFunc,legacyFuncVersion} from './func-legacy.mjs';
import {checkLpWallet} from './dedust-lp-wallet-fixtures.mjs';
const project=path.resolve(root,'../reconstruction/dedust'),entry='ClassicLpWallet/main.fc';
const sources=await loadFuncSources(project,entry),compiled=await compileLegacyFunc({sources,targets:[entry]});
assert.equal(compiled.status,'ok',compiled.message);
const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
const original=await fs.readFile(path.join(project,'oracles/ClassicLpWallet.boc')),comparison=compareBoc(original,candidate);
assert.equal(comparison.sameSerializedBoc,true,'whole LP-wallet serialized BOC');
await fs.mkdir(path.join(project,'build/ClassicLpWallet'),{recursive:true});
await fs.writeFile(path.join(project,'build/ClassicLpWallet/code.boc'),candidate);
const tests=await checkLpWallet(original,candidate);
await writeJson(path.join(project,'ClassicLpWallet/recovery-verification.json'),{
    scope:'Byte-identical readable LP-wallet: transfers, pool/peer credits, burn, bounce and wallet data',
    compiler:await legacyFuncVersion(),comparison,
    sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,source])=>[name,createHash('sha256').update(source).digest('hex')])),tests});
console.log(`ClassicLpWallet: exact readable; ${tests.messages.length} message + ${tests.getters.length} getter probes`);
