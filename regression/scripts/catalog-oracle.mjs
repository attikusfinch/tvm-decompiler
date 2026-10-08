import assert from 'node:assert/strict';

// Avoid vacuous serializer coverage: targeted valid samples must reach the
// expected success paths, not merely agree on underflow/unknown-prefix errors.
export function assertCatalogOracle(report) {
    const expected = new Map([
        ...['nested-integer-match','nested-if-source','nested-else-match'].map(id=>[id,['10','20','30','40']]),
        ['enum-sequence',['0','1','2']], ['enum-sparse',['1','7','255']],
        ['read-uint8',['0','255']], ['read-int8',['0','-1','127','-128']], ['read-bool',['0','-1']],
        ['read-coins',['0','19',String((1n<<120n)-1n)]],
        ['read-varint16',['0','-1','127','-128']],
        ['read-varuint32',['0','1','255',String((1n<<248n)-1n)]],
        ['maybe-scalar',['-1','7']], ['maybe-tensor',['-1','4']],
        ['either-primitives',['0','7']], ['constructor-union',['0','7','127','-28','99']],
        ['array-serialization',['0','2']], ['typed-map-get-set',['0','255']],
        ['typed-map-iteration',['1','257','383']],
    ]);
    for (const [id,values] of expected) {
        const entry=report.find(e=>e.id===id);
        assert.ok(entry,id+': missing case');
        const observed=entry.originalGetters.filter(g=>g.before.exitCode===0)
            .flatMap(g=>g.before.stack).filter(x=>x.type==='int').map(x=>x.value);
        for (const value of values) assert.ok(observed.includes(value),id+': missing success value '+value);
    }
    const layout=report.find(e=>e.id==='nested-layout');
    assert.ok(layout.originalGetters.some(g=>g.before.exitCode===0
        && g.before.stack.length===3 && g.before.stack[0].value==='7'
        && g.before.stack[1].value==='19' && g.before.stack[2].type==='cell'), 'nested-layout: missing valid nested fields/ref');
}
