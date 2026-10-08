import { Address, beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';

const int = value => ({ type: 'int', value: BigInt(value) });
const empty = beginCell().endCell();
const ref = beginCell().storeUint(7, 3).endCell();
const values = [{ type: 'null' }, ...[-7, 0, 1, 255, 1n << 255n].map(int)];
const numbers = values.flatMap(x => [-9, 0, 7].map(y => ({ method: 90041, args: [x, int(y)] })));
const addresses = [
    empty, ref, beginCell().storeUint(0, 1).endCell(), beginCell().storeUint(0, 2).endCell(),
    beginCell().storeAddress(new Address(0, Buffer.alloc(32, 7))).endCell(),
    beginCell().storeAddress(new Address(-1, Buffer.alloc(32, 8))).storeUint(7, 8).storeRef(ref).endCell(),
    beginCell().storeUint(4, 3).endCell(), // truncated addr_std
    beginCell().storeUint(7, 3).storeUint(0, 300).endCell(), // unsupported addr_var
];
const addressProbes = addresses.map(cell => ({ method: 90042, args: [{ type: 'slice', cell }] }));
const load = 'fun load(s:slice):(slice,slice) asm "LDOPTSTDADDR"';
const cases = [
    { id: 'native-int-coalesce', rules: ['null-coalesce'], probes: numbers, source: `
@method_id(90041) fun check(x:int?,y:int):int { return x ?? y; }` },
    { id: 'explicit-null-if', rules: ['null-coalesce'], probes: numbers, source: `
fun nullTest(x:unknown):int asm "ISNULL"
@method_id(90041) fun check(x:int?,y:int):int {
    var n = x as unknown as int;
    if (nullTest(x as unknown) != 0) { n = y; }
    return n;
}` },
    { id: 'constant-fallback', rules: ['null-coalesce'], probes: values.map(x => ({ method: 90041, args: [x] })), source: `
@method_id(90041) fun check(x:int?):int { return x ?? -7; }` },
    { id: 'coalesce-result-live', rules: [], probes: numbers, source: `
@method_id(90041) fun check(x:int?,y:int):int { var n = x ?? y; n += 7; return n + y; }` },
    { id: 'coalesce-erased-runtime-cell', rules: ['null-coalesce'], probes: [{ type: 'null' }, { type: 'cell', cell: ref }].flatMap(x => [{ type: 'cell', cell: empty }, { type: 'cell', cell: ref }].map(y => ({ method: 90041, args: [x, y] }))), source: `
@method_id(90041) fun check(x:cell?,y:cell):cell { return x ?? y; }` },
    { id: 'effectful-fallback-retained', rules: [], probes: numbers, source: `
global g:int;
@inline fun fallback(y:int):int { g += 1; return y; }
@method_id(90041) fun check(x:int?,y:int):(int,int) { g = 0; val n = x ?? fallback(y); return (n,g); }` },
    { id: 'eager-condsel-retained', rules: [], probes: values.map(x => ({ method: 90041, args: [x] })), source: `
fun nullTest(x:unknown):int asm "ISNULL"
fun select(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90041) fun check(x:int?):int { return select(nullTest(x as unknown),7,x as unknown) as int; }` },
    { id: 'optional-address-getter', rules: ['optional-address-getter'], probes: addressProbes, source: `
@method_id(90042) fun check(body:slice):address? { return body.loadAddressOpt(); }` },
    { id: 'optional-address-tuple', rules: ['optional-address-cursor'], probes: addressProbes, source: `
${load}
@method_id(90042) fun check(body:slice):(slice,slice,slice) { var (a,rest) = load(body); return (a,rest,body); }` },
    { id: 'optional-address-check-null', rules: ['optional-address-cursor'], probes: addressProbes, source: `
${load}
fun nullTest(x:unknown):int asm "ISNULL"
@method_id(90042) fun check(body:slice):(int,int) { var (a,rest) = load(body); return (nullTest(a as unknown),rest.remainingBitsCount()); }` },
    { id: 'optional-address-discard-value', rules: ['optional-address-cursor'], probes: addressProbes, source: `
${load}
@method_id(90042) fun check(body:slice):slice { var (_,rest) = load(body); return rest; }` },
    { id: 'optional-address-discard-both', rules: ['optional-address-cursor'], probes: addressProbes, source: `
${load}
@method_id(90042) fun check(body:slice):int { var (_,_) = load(body); return 7; }` },
    { id: 'optional-address-store-again', rules: ['optional-address-cursor'], probes: addressProbes, source: `
${load}
fun store(b:builder,a:slice):builder asm(a b) "STOPTSTDADDR"
@method_id(90042) fun check(body:slice):cell { var(a,rest) = load(body); return store(beginCell().storeSlice(rest),a).endCell(); }` },
    { id: 'optional-address-chain', rules: ['optional-address-cursor'], probes: addresses.map(a => ({ method: 90042, args: [{ type: 'slice', cell: beginCell().storeSlice(a.beginParse()).storeSlice(a.beginParse()).endCell() }] })), source: `
${load}
@method_id(90042) fun check(body:slice):(slice,slice,slice) { var(a,rest) = load(body); var(b,tail) = load(rest); return (a,b,tail); }` },
];
await verifyRecoveryFixtures('tolk-nullable', cases, ['null-coalesce', 'optional-address-getter', 'optional-address-cursor']);
