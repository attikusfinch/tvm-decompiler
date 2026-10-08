import { beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
const int = value => ({ type: 'int', value: BigInt(value) });
const probes = [-3, 0, 1, 2, 7, 16, 32].map(n => ({ method: 90044, args: [int(n)] }));
const cases = [
    { id: 'again-return', rules: [], probes, source: `
@method_id(90044) fun check(n:int):int {
    var i = 0;
    while (true) { if (i >= n) { return i; } i += 1; }
}` },
    { id: 'again-tuple-return', rules: [], probes, source: `
@method_id(90044) fun check(n:int):(int,int) {
    var i = 0; var sum = 7;
    while (true) { if (i >= n) { return (i,sum); } sum += i; i += 1; }
}` },
    { id: 'again-effects', rules: [], probes, source: `
global g:int;
@method_id(90044) fun check(n:int):(int,int) {
    g = 0; var i = 0;
    while (true) { g += 1; if (i >= n) { return (i,g); } i += 1; }
}` },
    { id: 'again-throw', rules: [], probes, source: `
@method_id(90044) fun check(n:int):int {
    var i = 0;
    while (true) { if (i >= n) { return i; } i += 1; assert(i < 7) throw 399; }
}` },
    { id: 'again-slice-chain', rules: [], probes: [0, 1, 2, 3].map(n => {
        let body = beginCell().storeUint(7,8).endCell();
        for (let i = 0; i < n; i++) body = beginCell().storeUint(i,8).storeRef(body).endCell();
        return { method: 90044, args: [{ type: 'slice', cell: body }] };
    }), source: `
@method_id(90044) fun check(body:slice):(int,slice) {
    var n = 0;
    while (true) { if (body.remainingRefsCount() == 0) { return (n,body); } body = body.loadRef().beginParse(); n += 1; }
}` },
    { id: 'control-register-actions', rules: [], probes: [
        { type: 'cell', cell: beginCell().endCell() },
        { type: 'cell', cell: beginCell().storeUint(7,8).endCell() },
        { type: 'null' }, int(7),
    ].map(c => ({ method: 90045, args: [c] })), source: `
fun setActions(c:cell):void asm "c5 POPCTR"
fun actions():cell asm "c5 PUSHCTR"
@method_id(90045) fun check(c:cell):cell { setActions(c); return actions(); }` },
];
await verifyRecoveryFixtures('tolk-again', cases, []);
