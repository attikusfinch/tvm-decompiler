import { beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
const int = value => ({ type: 'int', value: BigInt(value) });
const probes = [-7, -1, 0, 1, 2, 7, 100].map(n => ({ method: 90046, args: [int(n)] }));
const cases = [
    { id: 'try-join', rules: [], probes, source: `
@method_id(90046) fun check(n:int):int {
    var r = 7;
    try { assert(n != 0) throw 401; r = 100 / n; }
    catch (code, arg) { r = code; }
    return r;
}` },
    { id: 'try-captured', rules: [], probes, source: `
@method_id(90046) fun check(n:int):int {
    var r = 7;
    try { assert(n > 0) throw 401; r = 100 / n; }
    catch (code, arg) { r = code + n; }
    return r;
}` },
    { id: 'try-value', rules: [], probes, source: `
@method_id(90046) fun check(n:int):(int,int) {
    var r = 7; var v = 9;
    try { if (n <= 0) { throw (403, n); } r = 100 / n; }
    catch (code, arg) { r = code; v = arg as int; }
    return (r,v);
}` },
    { id: 'try-global-restore', rules: [], probes, source: `
global g:int;
@method_id(90046) fun check(n:int):(int,int) {
    g = 7; var r = 9;
    try { g = n; assert(n > 0) throw 401; r = 100 / n; }
    catch (code, arg) { r = g + code; }
    return (r,g);
}` },
    { id: 'try-data-restore', rules: [], probes, source: `
@method_id(90046) fun check(n:int):(int,int) {
    var r = 9;
    try { contract.setData(beginCell().storeInt(n,32).endCell()); assert(n > 0) throw 401; r = n; }
    catch (code, arg) { r = code; }
    return (r,contract.getData().beginParse().loadInt(32));
}`, environment: { data: beginCell().storeInt(77,32).endCell() } },
    { id: 'try-nested', rules: [], probes, source: `
@method_id(90046) fun check(n:int):int {
    var r = 9;
    try {
        try { assert(n != 0) throw 401; r = 100 / n; }
        catch (code, arg) { throw (402,code); }
    } catch (code, arg) { r = code + (arg as int); }
    return r;
}` },
    { id: 'try-return', rules: [], probes, source: `
@method_id(90046) fun check(n:int):int {
    try { assert(n > 0) throw 401; return 100 / n; }
    catch (code, arg) { return code + n; }
}` },
    { id: 'try-captured-snapshots', rules: [], probes, source: `
global g:int;
@method_id(90046) fun check(n:int):(int,int,int) {
    var r = n + 3; var s = n + 5; var v = 9;
    try { r = n * 7; s = r + 5; g = r + s; assert(n > 0) throw 401; }
    catch (code, arg) { v = r + s + code; }
    return (r,s,v);
}` },
    { id: 'try-actions-restore', rules: [], probes, source: `
fun setActions(c:cell):void asm "c5 POPCTR"
fun actions():cell asm "c5 PUSHCTR"
@method_id(90046) fun check(n:int):(int,cell) {
    setActions(beginCell().storeUint(7,8).endCell()); var r = 9;
    try { setActions(beginCell().storeInt(n,32).endCell()); assert(n > 0) throw 401; r = n; }
    catch (code, arg) { r = code; }
    return (r,actions());
}` },
    { id: 'try-cell-value', rules: [], probes: [
        { type:'cell', cell:beginCell().endCell() },
        { type:'cell', cell:beginCell().storeUint(7,8).storeRef(beginCell().endCell()).endCell() },
        { type:'null' }, int(7),
    ].flatMap(value => [-1,0,1].map(n => ({ method:90046, args:[value,int(n)] }))), source: `
@method_id(90046) fun check(value:cell,n:int):cell {
    var result = value;
    try { if (n <= 0) { throw (403, value); } }
    catch (code, arg) { result = arg as cell; }
    return result;
}` },
];
await verifyRecoveryFixtures('tolk-exceptions', cases, []);
