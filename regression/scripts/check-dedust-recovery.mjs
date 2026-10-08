import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Cell } from '@ton/core';
import { root, compareBoc, writeJson, run } from './lib.mjs';
import { compileTolk, tolkVersion } from './tolk.mjs';
import { assembleExact, disassembleExact, firstCellDifference } from './exact-assembly.mjs';
import { checkDeposit } from './dedust-deposit-fixtures.mjs';
import { checkAffiliate } from './dedust-affiliate-fixtures.mjs';
import { checkPosition } from './dedust-position-fixtures.mjs';

const project=path.resolve(root,'../reconstruction/dedust');
const manifest=JSON.parse(await fs.readFile(path.join(project,'oracles.json'),'utf8'));
const fixtures={CpmmDeposit:checkDeposit,CpmmAffiliateAccount:checkAffiliate,CpmmPosition:checkPosition};
const results=[];
for(const entry of manifest.contracts) {
    const original=await fs.readFile(path.join(project,'oracles',entry.name+'.boc'));
    assert.equal(createHash('sha256').update(original).digest('hex'),entry.bocSha256,entry.name+': frozen BOC');
    assert.equal(Cell.fromBoc(original)[0].hash().toString('hex'),entry.codeHash,entry.name+': frozen code');
    const reference=await fs.readFile(path.join(project,entry.name,'reference.tasm'),'utf8');
    const assembly=compareBoc(original,assembleExact(reference,entry.name+'.tasm'));
    assert.equal(assembly.sameSerializedBoc,true,entry.name+': assembly');
    const result={name:entry.name,assembly,status:'instruction-reference-only'};
    let source;
    try { source=await fs.readFile(path.join(project,entry.name,'main.tolk'),'utf8'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
    if(source) {
        const sources={'main.tolk':source};
        for(const name of await fs.readdir(path.join(project,entry.name))) {
            if(name!=='main.tolk'&&name.endsWith('.tolk')) sources[name]=await fs.readFile(path.join(project,entry.name,name),'utf8');
        }
        const compiled=await compileTolk({sources});
        assert.equal(compiled.status,'ok',entry.name+': '+compiled.message);
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
    results.push(result);
    console.log(`${entry.name}: ${result.status}${result.tests?`; ${result.tests.getters.length} getter + ${result.tests.messages.length} message probes`:''}`);
}
const version=await tolkVersion();
const toWsl=value=>`/mnt/${value[0].toLowerCase()}/${value.slice(3).replaceAll('\\','/')}`;
const command=process.platform==='win32'?'wsl.exe':process.env.ACTON_EXE??'acton';
const args=process.platform==='win32'?['-d',process.env.WSL_DISTRO??'Ubuntu','--exec',process.env.ACTON_WSL_PATH??'/home/fiscaldev/.acton/bin/acton','test',toWsl(path.join(project,'tests')),'--project-root',toWsl(project),'--color','never']:['test',path.join(project,'tests'),'--project-root',project,'--color','never'];
const acton=await run(command,args,{timeout:120000,maxBuffer:8*1024*1024,windowsHide:true});
console.log(acton.stdout);
await writeJson(path.join(project,'verification.json'),{schemaVersion:1,toolchain:version,
    serialization:{idx:false,crc32:true},actonTests:{status:'passed',output:acton.stdout.trim()},
    counts:{families:results.length,exactInstructionReferences:results.filter(r=>r.assembly.sameSerializedBoc).length,
        exactReadable:results.filter(r=>r.status==='exact-readable').length},contracts:results});
