import assert from 'node:assert/strict';
import path from 'node:path';
import { beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { compileTolk } from './tolk.mjs';
import { decompile, root } from './lib.mjs';
const int = value => ({type:'int',value:BigInt(value)});
const probes = [-1,0,1,7,100].map(n=>({method:90046,args:[int(n)]}));
await verifyRecoveryFixtures('tolk-static-calls',[
    {id:'literal-callxargs-unlimited',rules:[],verifyFunc:true,probes,source:`
fun isolated(n:int):(int,int)
    asm "99 PUSHINT" "SWAP" "<{ INC }>CONT" "1 -1 CALLXARGS"
@method_id(90046) fun check(n:int):(int,int) { return isolated(n); }
`},
    {id:'literal-callxargs-fixed',rules:[],verifyFunc:true,probes,source:`
fun isolated(n:int):(int,int)
    asm "99 PUSHINT" "SWAP" "<{ INC }>CONT" "1 1 CALLXARGS"
@method_id(90046) fun check(n:int):(int,int) { return isolated(n); }
`},
    {id:'literal-callxargs-legacy-try',rules:[],verifyFunc:true,probes,source:`
fun isolated(n:int):int asm
    "<{ DUP c4 PUSHCTR c5 PUSHCTR c7 PUSHCTR <{ NIP ADD }>CONT c7 SETCONTCTR c5 SETCONTCTR c4 SETCONTCTR 1 PUSHINT -1 PUSHINT SETCONTVARARGS <{ DUP 0 GTINT 401 THROWIFNOT INC }>CONT c1 PUSHCTR COMPOSALT SWAP TRY }>CONT"
    "1 -1 CALLXARGS"
@method_id(90046) fun check(n:int):int { return isolated(n); }
`},
    {id:'literal-bare-try-validates-cell',rules:[],verifyFunc:true,probes:[
        {type:'cell',cell:beginCell().endCell()},
        {type:'cell',cell:beginCell().storeUint(7,8).endCell()},
        {type:'null'},int(7),
    ].map(value=>({method:90046,args:[value]})),source:`
fun isCell(c:cell):bool asm
    "<{ <{ CTOS DROP -1 PUSHINT }>CONT <{ 2DROP 0 PUSHINT }>CONT TRY }>CONT" "1 1 CALLXARGS"
@method_id(90046) fun check(c:cell):bool { return isCell(c); }
`},
    {id:'literal-two-unlimited',rules:[],verifyFunc:true,probes,source:`
fun add(a:int,b:int):int asm "<{ ADD }>CONT" "2 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"
@method_id(90046) fun check(n:int):int { return add(11,n); }
`},
    {id:'literal-saved-caller-tail',rules:[],verifyFunc:true,probes,source:`
fun isolated(n:int):(int,int)
    asm "99 PUSHINT" "SWAP" "<{ INC }>CONT" "1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"
@method_id(90046) fun check(n:int):(int,int) { return isolated(n); }
`},
    {id:'literal-fixed-results',rules:[],verifyFunc:true,probes,source:`
fun isolated(n:int):(int,int)
    asm "99 PUSHINT" "SWAP" "<{ INC }>CONT" "1 PUSHINT" "1 PUSHINT" "CALLXVARARGS"
@method_id(90046) fun check(n:int):(int,int) { return isolated(n); }
`},
    {id:'literal-early-return-keeps-caller',rules:[],probes,source:`
fun isolated(n:int):(int,int)
    asm "99 PUSHINT" "SWAP" "<{ DUP 0 PUSHINT LESS <{ DROP 77 PUSHINT }>CONT IFJMP INC }>CONT"
        "1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"
@method_id(90046) fun check(n:int):(int,int) { return isolated(n); }
`},
],[]);
for (const [id,source] of [
    ['bare-try-register-write',`fun bad(n:int):int asm "<{ DUP 1 SETGLOB 0 PUSHINT 401 THROWIFNOT }>CONT" "<{ NIP }>CONT" "TRY"`],
    ['literal-callxargs-outside-isolation',`fun bad(n:int):int asm "<{ OVER ADD }>CONT" "1 -1 CALLXARGS"`],
    ['literal-fixed-callxargs-outside-isolation',`fun bad(n:int):int asm "<{ OVER ADD }>CONT" "1 1 CALLXARGS"`],
    ['literal-fixed-callxargs-wrong-results',`fun bad(n:int):int asm "<{ INC }>CONT" "1 2 CALLXARGS"`],
    ['reads-outside-isolation',`fun bad(n:int):int asm "<{ OVER ADD }>CONT" "1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"`],
    ['unbounded-argument-width',`fun bad(n:int):int asm "<{ INC }>CONT" "-1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"`],
]) {
    const compiled=await compileTolk({sources:{'main.tolk':source+'\n@method_id(90046) fun check(n:int):int { return bad(n); }'}});
    assert.equal(compiled.status,'ok',compiled.message);
    for(const language of ['tolk','func']) {
        const result=await decompile(Buffer.from(compiled.codeBoc,'base64'),path.join(root,'artifacts/tolk-static-calls',id,language),
            {local:true,language,normalize:false,refresh:true});
        assert.equal(result.complete,false,id+': '+language);
        const mnemonic=id==='bare-try-register-write'?'TRY':id.startsWith('literal-fixed-callxargs')?'CALLXARGS':
            id==='literal-callxargs-outside-isolation'?'CALLXARGS_VAR':'CALLXVARARGS';
        assert.ok(result.diagnostics.some(d=>d.mnemonic===mnemonic),id);
    }
    console.log(id+': remains explicitly partial');
}
