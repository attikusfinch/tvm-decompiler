import {familyDirectory, familyProject, projectCatalog} from './reconstruction-projects.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Cell } from '@ton/core';
import { root, compareBoc, writeJson, run } from './lib.mjs';
import { compileTolk, tolkVersion, loadTolkSources } from './tolk.mjs';
import { assembleExact, disassembleExact, firstCellDifference } from './exact-assembly.mjs';
import { checkDeposit } from './dedust-deposit-fixtures.mjs';
import { checkAffiliate } from './dedust-affiliate-fixtures.mjs';
import { checkPosition } from './dedust-position-fixtures.mjs';
import { checkPool, checkPoolV1 } from './dedust-pool-fixtures.mjs';
import { checkBlank } from './dedust-blank-fixtures.mjs';
import { checkOperator } from './dedust-operator-fixtures.mjs';
import { checkLpWallet } from './dedust-lp-wallet-fixtures.mjs';
import { checkClassicDeposit } from './dedust-classic-deposit-fixtures.mjs';
import { checkNativeVault } from './dedust-native-vault-fixtures.mjs';
import { checkJettonVault } from './dedust-jetton-vault-fixtures.mjs';
import { checkFactory } from './dedust-factory-fixtures.mjs';
import { checkUranusWalletV2, checkUranusWalletV3 } from './dedust-uranus-wallet-fixtures.mjs';
import { checkUranusFactory } from './dedust-uranus-factory-fixtures.mjs';
import { checkUranusMemeV2, checkUranusMemeV3 } from './dedust-uranus-meme-fixtures.mjs';
import { checkClassicVolatilePool, checkClassicPoolV8, checkClassicPoolV9 } from './dedust-classic-pool-fixtures.mjs';
import { checkX1000 } from './dedust-x1000-fixtures.mjs';
import { loadFuncSources, compileLegacyFunc, legacyFuncVersion } from './func-legacy.mjs';

const project=path.resolve(root,'../reconstruction');
const manifest=JSON.parse(await fs.readFile(path.join(project,'oracles.json'),'utf8'));
const fixtures={UranusMemeV3:checkUranusMemeV3,UranusFactoryV3:checkUranusFactory,UranusMemeWalletV2:checkUranusWalletV2,UranusMemeWalletV3:checkUranusWalletV3,ClassicBlank:checkBlank,ClassicOperator:checkOperator,ClassicLpWallet:checkLpWallet,ClassicLiquidityDeposit:checkClassicDeposit,ClassicNativeVault:checkNativeVault,ClassicJettonVault:checkJettonVault,ClassicFactory:checkFactory,CpmmDeposit:checkDeposit,CpmmAffiliateAccount:checkAffiliate,CpmmPosition:checkPosition,CpmmPoolV1:checkPoolV1,CpmmPoolV2:checkPool};
const results=[];
fixtures.UranusMemeV2=checkUranusMemeV2;
fixtures.ClassicVolatilePool=checkClassicVolatilePool;
fixtures.ClassicPoolInstalledV8=checkClassicPoolV8;
fixtures.ClassicPoolInstalledV9=checkClassicPoolV9;
fixtures.X1000WalletV2=checkX1000;
for(const entry of manifest.contracts) {
    const original=await fs.readFile(path.join(project,'oracles',entry.name+'.boc'));
    assert.equal(createHash('sha256').update(original).digest('hex'),entry.bocSha256,entry.name+': frozen BOC');
    assert.equal(Cell.fromBoc(original)[0].hash().toString('hex'),entry.codeHash,entry.name+': frozen code');
    const reference=await fs.readFile(path.join(project,familyDirectory(entry.name),'reference.tasm'),'utf8');
    const assembly=compareBoc(original,assembleExact(reference,entry.name+'.tasm'));
    assert.equal(assembly.sameSerializedBoc,true,entry.name+': assembly');
    const result={name:entry.name,project:familyProject(entry.name),sourceDirectory:familyDirectory(entry.name),assembly,status:'instruction-reference-only'};
    let source,language;
    for(const extension of ['tolk','fc']) {
        try { source=await fs.readFile(path.join(project,familyDirectory(entry.name),'main.'+extension),'utf8');language=extension;break; }
        catch(error) { if(error.code!=='ENOENT') throw error; }
    }
    if(source) {
        const filename=familyDirectory(entry.name)+'/main.'+language;
        const sources=language==='tolk'?await loadTolkSources(project,filename):await loadFuncSources(project,filename);
        const compiled=language==='tolk'?await compileTolk({sources}):await compileLegacyFunc({sources,targets:[filename]});
        assert.equal(compiled.status,'ok',entry.name+': '+compiled.message);
        result.language=language==='fc'?'func':'tolk';
        result.compiler=language==='fc'?await legacyFuncVersion():await tolkVersion();
        const raw=Buffer.from(compiled.codeBoc,'base64');
        // Explicit BOC wire format: no index, CRC32. Acton's --boc uses no CRC32.
        // This serializes the candidate cell; it never copies any oracle bytes.
        const boc=Cell.fromBoc(raw)[0].toBoc({idx:false,crc32:true});
        const build=path.join(project,'build',entry.name);
        await fs.mkdir(build,{recursive:true});
        await fs.writeFile(path.join(build,'code.boc'),boc);
        await fs.writeFile(path.join(build,'main.fif'),compiled.fiftCode);
        await fs.writeFile(path.join(build,'code.tasm'),disassembleExact(boc));
        result.comparison=compareBoc(original,boc);
        result.firstDifference=firstCellDifference(Cell.fromBoc(original)[0],Cell.fromBoc(boc)[0]);
        result.sourceSha256=Object.fromEntries(Object.entries(sources).map(([name,content])=>[name,createHash('sha256').update(content).digest('hex')]));
        if(fixtures[entry.name]) result.tests=await fixtures[entry.name](original,boc);
        result.status=result.comparison.sameSerializedBoc&&result.tests?'exact-readable':'candidate';
        assert.equal(result.comparison.sameSerializedBoc,true,entry.name+': readable source must match bytes');
        assert.ok(result.tests,entry.name+': missing independent behavior fixtures');
    }
    assert.equal(result.status,'exact-readable',entry.name+': missing accepted readable source');
    results.push(result);
    console.log(`${result.project}/${entry.name}: ${result.status}${result.tests?`; ${result.tests.getters.length} getter + ${result.tests.messages.length} message probes`:''}`);
}
const version=await tolkVersion();
const toWsl=value=>`/mnt/${value[0].toLowerCase()}/${value.slice(3).replaceAll('\\','/')}`;
const command=process.platform==='win32'?'wsl.exe':process.env.ACTON_EXE??'acton';
const args=process.platform==='win32'?['-d',process.env.WSL_DISTRO??'Ubuntu','--exec',process.env.ACTON_WSL_PATH??'/home/fiscaldev/.acton/bin/acton','test',toWsl(path.join(project,'tests')),'--project-root',toWsl(project),'--color','never']:['test',path.join(project,'tests'),'--project-root',project,'--color','never'];
const acton=await run(command,args,{timeout:120000,maxBuffer:8*1024*1024,windowsHide:true});
console.log(acton.stdout);
await writeJson(path.join(project,'verification.json'),{schemaVersion:1,toolchain:version,
    serialization:{idx:false,crc32:true},actonTests:{status:'passed',output:acton.stdout.trim()},
    projects:projectCatalog.projects.map(({id,name,directory})=>({id,name,directory,
        families:results.filter(r=>r.project===id).length,
        exactReadable:results.filter(r=>r.project===id&&r.status==='exact-readable').length})),
    counts:{families:results.length,exactInstructionReferences:results.filter(r=>r.assembly.sameSerializedBoc).length,
        exactReadable:results.filter(r=>r.status==='exact-readable').length},contracts:results});
