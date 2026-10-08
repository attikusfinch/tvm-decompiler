import { Cell } from '@ton/core';
import { runtime, text } from '@ton/tasm';

// @ton/tasm 0.6.1 stores the body of PSEUDO_EXOTIC in an ordinary CodeBuilder.
// Preserve the cell kind declared by the assembly source. Do not guess from bits:
// an ordinary constant may contain exactly the same bytes as a library reference.
export function assembleExact(source, filename = 'reference.tasm') {
    const parsed = text.parse(filename, source);
    if (parsed.$ !== 'ParseSuccess') throw new Error(`${filename}:${parsed.error.loc.line}: ${parsed.error.message}`);
    validateExoticBlocks(parsed.instructions);
    const marked = new WeakSet();
    const store = runtime.util.PSEUDO_EXOTIC.store;
    const proto = runtime.CodeBuilder.prototype;
    const ownAsCell = Object.hasOwn(proto, 'asCell');
    const asCell = proto.asCell;
    try {
        runtime.util.PSEUDO_EXOTIC.store = (builder, instruction, options) => {
            if (builder.bits !== 0 || builder.refs !== 0) throw new Error('Exotic cell must occupy a complete cell');
            marked.add(builder);
            store(builder, instruction, options);
        };
        proto.asCell = function () {
            const cell = asCell.call(this);
            return marked.has(this) ? new Cell({bits:cell.bits, refs:cell.refs, exotic:true}) : cell;
        };
        return runtime.compileCell(parsed.instructions).toBoc({idx:false, crc32:true});
    } finally {
        runtime.util.PSEUDO_EXOTIC.store = store;
        if (ownAsCell) proto.asCell = asCell;
        else delete proto.asCell;
    }
}

function validateExoticBlocks(instructions) {
    if (instructions.some(i => i.$ === 'PSEUDO_EXOTIC') && instructions.length !== 1) {
        throw new Error('Exotic declaration cannot share a cell with instructions');
    }
    const visit = value => {
        if (!value || typeof value !== 'object') return;
        if (value.$ === 'Instructions') { validateExoticBlocks(value.instructions); return; }
        if (value.$ === 'DecompiledDict') {
            for (const method of value.methods) validateExoticBlocks(method.instructions);
            return;
        }
        if (Array.isArray(value)) { for (const item of value) visit(item); return; }
        // Instruction arguments only; Slice/Cell internals are opaque constants.
        if ('remainingBits' in value || value instanceof Cell) return;
        for (const [key, item] of Object.entries(value)) if (key !== 'loc') visit(item);
    };
    for (const instruction of instructions) visit(instruction);
}

export function disassembleExact(boc) {
    const roots = Cell.fromBoc(boc);
    if (roots.length !== 1) throw new Error('Expected one executable code root');
    return text.print(runtime.decompileCell(roots[0]));
}

export function firstCellDifference(a, b, route = 'root') {
    if (a.equals(b)) return null;
    if (a.isExotic !== b.isExotic || a.bits.toString() !== b.bits.toString() || a.refs.length !== b.refs.length) {
        return {route, originalBits:a.bits.toString(), candidateBits:b.bits.toString(),
            originalExotic:a.isExotic, candidateExotic:b.isExotic,
            originalRefs:a.refs.length, candidateRefs:b.refs.length};
    }
    for (let i = 0; i < a.refs.length; i++) {
        const diff = firstCellDifference(a.refs[i], b.refs[i], `${route}/${i}`);
        if (diff) return diff;
    }
}
