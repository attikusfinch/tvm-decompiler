import {familyDirectory} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {root,writeJson} from './lib.mjs';
import {compileTolk,tolkVersion,loadTolkSources} from './tolk.mjs';
import {checkPool,checkPoolV1} from './dedust-pool-fixtures.mjs';

const revision=process.argv[2]??'V2';assert.ok(['V1','V2'].includes(revision),'Pool revision must be V1 or V2');
const role='CpmmPool'+revision;
const project=path.resolve(root,'../reconstruction'),directory=path.join(root,'artifacts',revision==='V1'?'dedust-pool-handlers-v1':'dedust-pool-handlers');
await fs.mkdir(directory,{recursive:true});
const sources=await loadTolkSources(project,familyDirectory(role)+'/main.tolk');
const compiled=await compileTolk({sources});assert.equal(compiled.status,'ok',compiled.message);
const candidate=Buffer.from(compiled.codeBoc,'base64'),oracle=await fs.readFile(path.join(project,'oracles',role+'.boc'));
await fs.writeFile(path.join(directory,'candidate.boc'),candidate);
await fs.writeFile(path.join(directory,'candidate.fif'),compiled.fiftCode);
const tests=await (revision==='V1'?checkPoolV1:checkPool)(oracle,candidate);
const proof={scope:'Byte-identical readable Pool '+revision+': all 16 incoming variants and all 3 getters; state/actions/outgoing balances/gas and independent expectations',
    exactMethodIds:tests.exactMethodIds,exactIncomingDecoder:tests.incomingDecoderHash,
    toolchain:await tolkVersion(),sourceSha256:Object.fromEntries(Object.entries(sources).map(([n,s])=>[n,createHash('sha256').update(s).digest('hex')])),
    comparison:tests.comparison,limitations:['Finite independent behavior probes; original spelling and variable names are not recoverable from code bytes'],
    getterCases:tests.getterCases,cases:tests.messages};
await writeJson(path.join(directory,'report.json'),proof);
await writeJson(path.join(project,familyDirectory(role),revision==='V1'?'recovery-verification.json':'candidate-progress.json'),{...proof,cases:tests.messages.map(({before,after,...test})=>({...test,
    before:{exitCode:before.exitCode,dataHash:before.dataHash,gasUsed:before.gasUsed},after:{exitCode:after.exitCode,dataHash:after.dataHash,gasUsed:after.gasUsed}}))});
console.log('Byte-identical readable Pool '+revision+': '+tests.messages.length+' exact message probes and '+tests.getters.length+' exact getter probes, including outgoing amounts, gas and own code hash');
