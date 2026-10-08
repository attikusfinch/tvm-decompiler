import assert from 'node:assert/strict';
import path from 'node:path';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { compileTolk } from './tolk.mjs';
import { decompile, root } from './lib.mjs';
const int = value => ({type:'int',value:BigInt(value)});
const probes = [-1,0,1,7,100].map(n=>({method:90046,args:[int(n)]}));
await verifyRecoveryFixtures('tolk-static-calls',[
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
    ['reads-outside-isolation',`fun bad(n:int):int asm "<{ OVER ADD }>CONT" "1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"`],
    ['unbounded-argument-width',`fun bad(n:int):int asm "<{ INC }>CONT" "-1 PUSHINT" "-1 PUSHINT" "CALLXVARARGS"`],
]) {
    const compiled=await compileTolk({sources:{'main.tolk':source+'\n@method_id(90046) fun check(n:int):int { return bad(n); }'}});
    assert.equal(compiled.status,'ok',compiled.message);
    for(const language of ['tolk','func']) {
        const result=await decompile(Buffer.from(compiled.codeBoc,'base64'),path.join(root,'artifacts/tolk-static-calls',id,language),
            {local:true,language,normalize:false,refresh:true});
        assert.equal(result.complete,false,id+': '+language);
        assert.ok(result.diagnostics.some(d=>d.mnemonic==='CALLXVARARGS'),id);
    }
    console.log(id+': remains explicitly partial');
}
