import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Cell, beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { root } from './lib.mjs';

const hash='DD82F24DB614798EE7C579F8B3F07F0645D06D65CEDE368D80D0D74B180D2DD6';
const bits=beginCell().storeUint(2,8).storeBuffer(Buffer.from(hash,'hex')).endCell().bits;
const library=new Cell({bits,exotic:true});
const ordinary=new Cell({bits});
const nested=beginCell().storeUint(7,3).storeRef(library).storeRef(ordinary).endCell();
assert.notEqual(library.hash().toString('hex'),ordinary.hash().toString('hex'));
await verifyRecoveryFixtures('tolk-library-literals',[
    {id:'same-bytes-different-descriptors',rules:[],verifyFunc:true,
        probes:[{method:90046,args:[]}],source:`
fun constants():(cell,cell,cell)
    asm "<b x{02${hash}} s, b>spec PUSHREF"
        "<b x{02${hash}} s, b> PUSHREF"
        "<b x{F_} s, <b x{02${hash}} s, b>spec ref, <b x{02${hash}} s, b> ref, b> PUSHREF"
@method_id(90046) fun check():(int,int,int) {
    val (library,ordinary,nested)=constants();
    return (library.hash(),ordinary.hash(),nested.hash());
}
`},
    {id:'slice-references-with-equal-bits',rules:[],verifyFunc:true,
        probes:[{method:90046,args:[]}],source:`
fun constants():(slice,slice)
    asm "<b x{F_} s, <b x{02${hash}} s, b>spec ref, b> <s PUSHSLICE"
        "<b x{F_} s, <b x{02${hash}} s, b> ref, b> <s PUSHSLICE"
@method_id(90046) fun check():(int,int) {
    val (special,ordinary)=constants();
    return (beginCell().storeSlice(special).endCell().hash(),beginCell().storeSlice(ordinary).endCell().hash());
}
`},
],[]);
const report=JSON.parse(await fs.readFile(path.join(root,'artifacts/tolk-library-literals/report.json'),'utf8'));
assert.deepEqual(report[0].originalGetters[0].before.stack,
    [library,ordinary,nested].map(c=>({type:'int',value:BigInt('0x'+c.hash().toString('hex')).toString()})));
assert.deepEqual(report[1].originalGetters[0].before.stack,
    [library,ordinary].map(ref=>beginCell().storeUint(7,3).storeRef(ref).endCell())
        .map(c=>({type:'int',value:BigInt('0x'+c.hash().toString('hex')).toString()})));
