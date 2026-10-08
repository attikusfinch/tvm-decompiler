import { Dictionary, beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
const int = value => ({ type: 'int', value: BigInt(value) });
const probes = [-3, 0, 1, 2, 7, 16, 32].map(n => ({ method: 90043, args: [int(n)] }));
const dictionaries = [[], [[0, 7]], [[1, 3], [127, 9], [255, 1]]].map(entries => {
    if (!entries.length) return { type: 'null' };
    const dict = Dictionary.empty(Dictionary.Keys.Uint(8), Dictionary.Values.Uint(8));
    for (const [key, value] of entries) dict.set(key, value);
    return { type: 'cell', cell: beginCell().storeDictDirect(dict).endCell() };
});
const cases = [
    { id: 'empty-condition', rules: [], probes, source: `
@method_id(90043) fun check(n:int):int {
    var i = 0; var more = i < n;
    while (more) { i += 1; more = i < n; }
    return i;
}` },
    { id: 'empty-condition-carried-values', rules: [], probes, source: `
@method_id(90043) fun check(n:int):(int,int) {
    var i = 0; var s = 7; var more = i < n;
    while (more) { s = s * 2 + i; i += 1; more = i < n; }
    return (i,s);
}` },
    { id: 'empty-condition-initial-flag', rules: [], probes: probes.flatMap(p => [-7, 0, 1, 123].map(c => ({ ...p, args: [...p.args, int(c)] }))), source: `
@method_id(90043) fun check(n:int,c:int):int {
    var i = 0; var more = c != 0;
    while (more) { i += 1; more = i < n; }
    return i;
}` },
    { id: 'nested-empty-condition', rules: [], probes, source: `
@method_id(90043) fun check(n:int):int {
    var s = 0; var i = 0; var outer = i < n;
    while (outer) {
        var j = 0; var inner = j < i;
        while (inner) { s += i * j; j += 1; inner = j < i; }
        i += 1; outer = i < n;
    }
    return s;
}` },
    { id: 'while-condition-effects', rules: [], probes, source: `
global g:int;
@inline fun more(i:int,n:int):bool { g += 1; return i < n; }
@method_id(90043) fun check(n:int):(int,int) {
    g = 0; var i = 0;
    while (more(i,n)) { i += 1; }
    return (i,g);
}` },
    { id: 'while-cursor-condition', rules: [], probes: [0, 1, 2, 7].map(n => ({ method: 90043, args: [{ type: 'slice', cell: beginCell().storeUint(0, n * 8).endCell() }] })), source: `
global g:int;
@inline fun more(mutate s:slice):bool {
    g += 1;
    if (s.isEmpty()) { return false; }
    s.loadUint(8);
    return true;
}
@method_id(90043) fun check(body:slice):(int,int,int) {
    g = 0; var n = 0;
    while (more(mutate body)) { n += 1; }
    return (n,g,body.remainingBitsCount());
}` },
    { id: 'while-body-throw', rules: [], probes, source: `
@method_id(90043) fun check(n:int):int {
    var i = 0; var more = i < n;
    while (more) { i += 1; assert(i < 7) throw 399; more = i < n; }
    return i;
}` },
    { id: 'while-dictionary-next', rules: [], probes: dictionaries.map(d => ({ method: 90043, args: [d] })), source: `
fun first(d:cell?,len:int):(int,slice,int) asm(->1 0 2) "DICTUMIN" "NULLSWAPIFNOT2"
fun next(d:cell?,len:int,key:int):(int,slice,int) asm(key d len ->1 0 2) "DICTUGETNEXT" "NULLSWAPIFNOT2"
@method_id(90043) fun check(d:cell?):int {
    var (key,value,ok) = first(d,8); var sum = 0;
    while (ok != 0) { sum += key + value.preloadUint(8); (key,value,ok) = next(d,8,key); }
    return sum;
}` },
];
await verifyRecoveryFixtures('tolk-loops', cases, []);
