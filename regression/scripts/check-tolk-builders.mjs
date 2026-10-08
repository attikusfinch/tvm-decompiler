import { Address, beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';

const int = value => ({ type: 'int', value: BigInt(value) });
const cell = value => ({ type: 'cell', cell: value });
const slice = value => ({ type: 'slice', cell: value });
const empty = beginCell().endCell();
const ref = beginCell().storeUint(7, 3).endCell();
const coins = [-1n, 0n, 1n, 255n, 256n, (1n << 120n) - 1n, 1n << 120n];
const coinProbes = coins.map(x => ({ method: 90040, args: [int(x)] }));
const bodies = [empty, ref, beginCell().storeRef(ref).endCell(), beginCell().storeUint(7, 1023).endCell()];
const cases = [
    { id: 'coins-snapshot', rules: ['builder-store-chain'], probes: coinProbes, source: `
fun put(b:builder,x:int):builder asm "STGRAMS"
@method_id(90040) fun check(x:int):(cell,cell) {
    val b = beginCell().storeUint(7,8);
    val next = put(b,x);
    return (b.endCell(), next.endCell());
}` },
    { id: 'coins-zero-and-dead', rules: ['builder-store-chain'], probes: coinProbes, source: `
fun put(b:builder,x:int):builder asm "STGRAMS"
@method_id(90040) fun check(x:int):cell {
    put(beginCell(),x);
    return put(put(beginCell().storeUint(7,8),0),x).endCell();
}` },
    { id: 'coins-bit-overflow', rules: ['builder-store-chain'], probes: [0, 7, 1010, 1019, 1020, 1023].flatMap(n => coins.map(x => ({ method: 90040, args: [int(n), int(x)] }))), source: `
fun put(b:builder,x:int):builder asm "STGRAMS"
@method_id(90040) fun check(n:int,x:int):(cell,cell) {
    val b = beginCell().storeUint(0,n);
    return (b.endCell(), put(b,x).endCell());
}` },
    { id: 'maybe-ref-nested', rules: ['builder-store-chain'], probes: coins.flatMap(x => [{ type: 'null' }, cell(ref)].map(c => ({ method: 90040, args: [int(x), c] }))), source: `
fun put(b:builder,x:int):builder asm "STGRAMS"
fun optional(b:builder,c:cell?):builder asm(c b) "STOPTREF"
@method_id(90040) fun check(x:int,c:cell?):(cell,cell) {
    val b = beginCell().storeUint(7,8);
    return (b.endCell(), optional(put(b,x),c).endCell());
}` },
    { id: 'maybe-ref-capacity', rules: ['builder-store-chain'], probes: [{ type: 'null' }, cell(ref)].map(c => ({ method: 90040, args: [c] })), source: `
fun optional(b:builder,c:cell?):builder asm(c b) "STOPTREF"
@method_id(90040) fun check(c:cell?):(cell,cell) {
    val c0 = beginCell().endCell();
    val b = beginCell().storeRef(c0).storeRef(c0).storeRef(c0).storeRef(c0);
    return (b.endCell(), optional(b,c).endCell());
}` },
    { id: 'dict-ref', rules: ['builder-store-chain'], probes: [{ type: 'null' }, cell(ref)].map(c => ({ method: 90040, args: [c] })), source: `
fun put(b:builder,c:cell?):builder asm(c b) "STDICT"
@method_id(90040) fun check(c:cell?):(cell,cell) { val b = beginCell(); return (b.endCell(),put(b,c).endCell()); }` },
    ...[['STVARUINT16', coins], ['STVARUINT32', [-1n, 0n, 1n, (1n << 248n) - 1n, 1n << 248n]]].map(([opcode, values]) => ({
        id: opcode.toLowerCase(), rules: ['builder-store-chain'], probes: values.map(x => ({ method: 90040, args: [int(x)] })), source: `
fun put(b:builder,x:int):builder asm "${opcode}"
@method_id(90040) fun check(x:int):(cell,cell) { val b = beginCell(); return (b.endCell(),put(b,x).endCell()); }` })),
    ...[['STUX', 'x b n'], ['STIX', 'x b n']].map(([opcode, order]) => ({
        id: opcode.toLowerCase() + '-dynamic', rules: ['builder-store-chain'], probes: [-1n, 0n, 1n, 255n, 256n, 1n << 255n].flatMap(x => [-1, 0, 1, 8, 256, 257, 1024].map(n => ({ method: 90040, args: [int(x), int(n)] }))), source: `
fun put(b:builder,x:int,n:int):builder asm(${order}) "${opcode}"
@method_id(90040) fun check(x:int,n:int):(cell,cell) { val b = beginCell(); return (b.endCell(),put(b,x,n).endCell()); }` })),
    ...[['STSLICER', 'b s'], ['STSLICE', 's b']].map(([opcode, order]) => ({
        id: opcode.toLowerCase(), rules: ['builder-store-chain'], probes: bodies.map(s => ({ method: 90040, args: [slice(s)] })), source: `
fun put(b:builder,s:slice):builder asm(${order}) "${opcode}"
@method_id(90040) fun check(s:slice):(cell,cell) { val b = beginCell().storeUint(7,8); return (b.endCell(),put(b,s).endCell()); }` })),
    { id: 'stbr-snapshot', rules: ['builder-store-chain'], probes: bodies.map(s => ({ method: 90040, args: [slice(s)] })), source: `
fun put(b:builder,other:builder):builder asm "STBR"
@method_id(90040) fun check(s:slice):(cell,cell,cell) {
    val b = beginCell().storeUint(7,8);
    val other = beginCell().storeSlice(s);
    return (b.endCell(),other.endCell(),put(b,other).endCell());
}` },
    { id: 'stref-snapshot', rules: ['builder-store-chain'], probes: bodies.map(c => ({ method: 90040, args: [cell(c)] })), source: `
fun put(b:builder,c:cell):builder asm(c b) "STREF"
@method_id(90040) fun check(c:cell):(cell,cell) { val b = beginCell().storeUint(7,8); return (b.endCell(),put(b,c).endCell()); }` },
    ...[['STSTDADDR', false], ['STOPTSTDADDR', true]].map(([opcode, optional]) => ({
        id: opcode.toLowerCase(), rules: ['builder-store-chain'], probes: [
            ...(optional ? [{ type: 'null' }] : []),
            slice(beginCell().storeAddress(new Address(0, Buffer.alloc(32, 7))).endCell()),
            slice(empty), slice(ref), slice(beginCell().storeUint(0,2).endCell()),
        ].map(s => ({ method: 90040, args: [s] })), source: `
fun put(b:builder,a:slice${optional ? '?' : ''}):builder asm(a b) "${opcode}"
@method_id(90040) fun check(a:slice${optional ? '?' : ''}):(cell,cell) { val b = beginCell().storeUint(7,8); return (b.endCell(),put(b,a).endCell()); }` })),
    { id: 'effects-order', rules: ['builder-store-chain'], probes: coinProbes, source: `
global g:int;
fun put(b:builder,x:int):builder asm "STGRAMS"
@inline fun receiver():builder { g = g * 10 + 1; return beginCell(); }
@inline fun value(x:int):int { g = g * 10 + 2; return x; }
@method_id(90040) fun check(x:int):(cell,int) {
    g = 0;
    val result = put(receiver(),value(x));
    return (result.endCell(),g);
}` },
];
await verifyRecoveryFixtures('tolk-builders', cases, ['builder-store-chain']);
