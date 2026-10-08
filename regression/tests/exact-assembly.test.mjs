import assert from 'node:assert/strict';
import test from 'node:test';
import { beginCell, Cell } from '@ton/core';
import { assembleExact, disassembleExact } from '../scripts/exact-assembly.mjs';

test('library declarations keep their exotic flag; identical ordinary data stays ordinary', () => {
    const hash = '01'.repeat(32);
    const body = beginCell().storeUint(2,8).storeBuffer(Buffer.from(hash,'hex')).endCell();
    const exotic = new Cell({bits:body.bits, exotic:true});
    const code = beginCell().storeUint(0x88,8).storeRef(exotic)
        .storeUint(0x88,8).storeRef(body).endCell();
    const source = disassembleExact(code.toBoc());
    assert.match(source, /exotic library/);
    const rebuilt = assembleExact(source);
    assert.deepEqual(rebuilt, code.toBoc());
    const root = Cell.fromBoc(rebuilt)[0];
    assert.equal(root.refs[0].isExotic,true);
    assert.equal(root.refs[1].isExotic,false);
});

test('exotic cell encoding does not leak into later ordinary assembly', () => {
    const source = `exotic library x{${'02'.repeat(32)}}`;
    assert.equal(Cell.fromBoc(assembleExact(source))[0].isExotic,true);
    assert.equal(Cell.fromBoc(assembleExact('PUSHINT_4 2\nRET'))[0].isExotic,false);
    assert.throws(() => assembleExact(`${source}\nRET`), /cannot share/);
    assert.equal(Cell.fromBoc(assembleExact('PUSHINT_4 2\nRET'))[0].isExotic,false);
});
