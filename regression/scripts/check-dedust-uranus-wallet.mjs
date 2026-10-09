import {familyDirectory} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {root,compareBoc,writeJson} from './lib.mjs';
import {loadTolkSources,compileTolk,tolkVersion} from './tolk.mjs';
import {checkUranusWalletV2,checkUranusWalletV3} from './dedust-uranus-wallet-fixtures.mjs';
const project=path.resolve(root,'../reconstruction');
for(const version of [2,3]) {
    const family=`UranusMemeWalletV${version}`,sources=await loadTolkSources(project,familyDirectory(family)+'/main.tolk');
    const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
    const candidate=Cell.fromBoc(Buffer.from(compiled.codeBoc,'base64'))[0].toBoc({idx:false,crc32:true});
    const original=await fs.readFile(path.join(project,'oracles',family+'.boc')),comparison=compareBoc(original,candidate);
    assert.equal(comparison.sameSerializedBoc,true,family+': whole BOC');
    await fs.mkdir(path.join(project,'build',family),{recursive:true});await fs.writeFile(path.join(project,'build',family,'code.boc'),candidate);
    const tests=await (version===2?checkUranusWalletV2:checkUranusWalletV3)(original,candidate);
    await writeJson(path.join(project,familyDirectory(family),'recovery-verification.json'),{scope:'Byte-identical readable wallet: transfer, credit, burn, sell, bounce and getter',compiler:await tolkVersion(),comparison,
        sourceSha256:Object.fromEntries(Object.entries(sources).map(([name,s])=>[name,createHash('sha256').update(s).digest('hex')])),tests});
    console.log(`${family}: exact; ${tests.messages.length} message + ${tests.getters.length} getter probes`);
}
