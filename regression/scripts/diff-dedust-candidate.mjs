import fs from 'node:fs/promises';
import path from 'node:path';
import { Cell } from '@ton/core';
import { root, compareBoc, run } from './lib.mjs';
import { disassembleExact, firstCellDifference } from './exact-assembly.mjs';
const [name,input]=process.argv.slice(2);
if(!/^[A-Za-z][A-Za-z0-9]+$/.test(name??'')||!input) throw new Error('Usage: diff-dedust-candidate.mjs ContractName candidate.boc');
const original=await fs.readFile(path.resolve(root,'../reconstruction/oracles',name+'.boc'));
const candidate=Cell.fromBoc(await fs.readFile(input))[0].toBoc({idx:false,crc32:true});
const folder=path.join(root,'artifacts/dedust-diff',name);
await fs.mkdir(folder,{recursive:true});
const a=path.join(folder,'original.tasm'),b=path.join(folder,'candidate.tasm');
await fs.writeFile(a,disassembleExact(original)); await fs.writeFile(b,disassembleExact(candidate));
console.log(JSON.stringify({...compareBoc(original,candidate),firstDifference:firstCellDifference(Cell.fromBoc(original)[0],Cell.fromBoc(candidate)[0])}));
try { console.log((await run('git',['-c','core.autocrlf=false','diff','--no-index','--',a,b],{maxBuffer:16*1024*1024})).stdout); }
catch(error) { if(error.code!==1) throw error; console.log(error.stdout); }
