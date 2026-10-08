import { beginCell } from '@ton/core';

const int = value => ({ type: 'int', value: BigInt(value) });
const empty = beginCell().endCell();
const ref = beginCell().storeUint(0xab, 8).endCell();
const ints = [-129n,-128n,-1n,0n,1n,2n,127n,128n,255n,256n,(1n<<120n)-1n,1n<<120n];
const scalar = ints.map(int).concat({ type: 'null' }, { type: 'nan' });
const bodies = [0,1,7,8,9,15,16,24,32,128,256].flatMap(width => [0n, (1n<<BigInt(width))-1n].flatMap(value =>
    [beginCell().storeUint(value,width).endCell(), beginCell().storeUint(value,width).storeRef(ref).endCell()]));
const slices = bodies.map(cell => ({ type: 'slice', cell }));
const probe = args => ({ method: 90060, args });
const read = (id, family, declarations, result, expression) => ({ id, family,
    source: `${declarations}\n@method_id(90060) fun check(body:slice):${result} { ${expression} }`,
    probes: slices.map(s => probe([s])),
});
const write = (id, family, type, declarations = '') => ({ id, family,
    source: `${declarations}\nstruct Box { value:${type} }\n@method_id(90060) fun check(x:int):cell { return Box { value:x as ${type} }.toCell(); }`,
    probes: scalar.map(x => probe([x])),
});
export const compilerCatalog = [
    read('nested-integer-match','N11','', 'int', 'val x=body.loadUint(8); if (x==7) { val y=body.loadUint(8); match(y) { 1=>{return 10;} 2=>{return 20;} else=>{return 30;} } } return 40;'),
    read('nested-if-source','N11','','int','val x=body.loadUint(8); if(x==7){val y=body.loadUint(8);if(y==1){return 10;}if(y==2){return 20;}return 30;}return 40;'),
    read('nested-else-match','N11','','int','val x=body.loadUint(8);if(x!=7){return 40;}else{val y=body.loadUint(8);if(y==1){return 10;}if(y==2){return 20;}return 30;}'),
    read('nested-join-retained','N11','','int','val x=body.loadUint(8);if(x==7){val y=body.loadUint(8);var r=30;if(y==1){r=10;}if(y==2){r=20;}return r+body.remainingBitsCount();}return 40;'),
    read('nested-loop-retained','N11','','int','var x=body.loadUint(8);while(x==7){val y=body.loadUint(8);if(y>0){if(y==1){return 10;}if(y==2){return 20;}return 30;}x=body.loadUint(8);}return 40;'),
    read('enum-sequence','N11','enum E:uint8 { A=0, B=1, C=2 }\nstruct Box { value:E }','int','return Box.fromSlice(body).value as int;'),
    read('enum-sparse','N11','enum E:uint8 { A=1, B=7, C=255 }\nstruct Box { value:E }','int','return Box.fromSlice(body).value as int;'),
    ...[['uint8','int'],['int8','int'],['bool','bool'],['coins','int'],['varint16','int'],['varuint32','int'],['bits8','slice']].map(([type,result]) =>
        read(`read-${type}`,'N12',`struct Box { value:${type} }`,result,`return Box.fromSlice(body).value ${type==='bits8'?'as slice':''};`)),
    ...['uint8','int8','coins','varint16','varuint32'].map(type => write(`write-${type}`,'N12',type)),
    read('read-cell','N13','struct Box { value:cell }','cell','return Box.fromSlice(body).value;'),
    read('read-string','N13','struct Box { value:string }','string','return Box.fromSlice(body).value;'),
    read('read-remaining','N13','struct Box { head:uint8, tail:RemainingBitsAndRefs }','(int,slice)','val b=Box.fromSlice(body); return (b.head,b.tail);'),
    { id:'write-inline-slice', family:'N13', probes:slices.map(s=>probe([s])),
        source:'struct Box { head:uint8, tail:slice } @method_id(90060) fun check(tail:slice):cell { return Box {head:7,tail}.toCell(); }' },
    { id:'write-inline-builder', family:'N13', probes:slices.map(s=>probe([s])),
        source:'struct Box { head:uint8, tail:builder } @method_id(90060) fun check(s:slice):cell { return Box {head:7,tail:beginCell().storeSlice(s)}.toCell(); }' },
    read('maybe-scalar','N14','struct Box { value:uint8? }','int','return Box.fromSlice(body).value ?? -1;'),
    read('maybe-tensor','N14','struct Pair { a:uint8,b:int8 }\nstruct Box { value:Pair? }','int','val b=Box.fromSlice(body); if(b.value==null){return -1;} return b.value!.a+b.value!.b;'),
    read('either-primitives','N14','type U=uint8|cell\nstruct Box {value:U}','int','val v=Box.fromSlice(body).value; match(v){ uint8=>{return v;} cell=>{return v.hash();} }'),
    read('constructor-union','N14','struct (0xA) A { value:uint8 }\nstruct (0xBC) B { value:int8 }\ntype U=A|B','int','val v=U.fromSlice(body); match(v){ A=>{return v.value;} B=>{return v.value+100;} }'),
    read('nested-layout','N15','struct Pair {a:uint8,b:coins}\nstruct Outer {v:Pair,c:cell}','(int,int,cell)','val o=Outer.fromSlice(body); return(o.v.a,o.v.b,o.c);'),
    read('lazy-skipped-field','N15','struct Box {a:uint8,b:uint16,c:cell}','int','val b=lazy Box.fromSlice(body); return b.b;'),
    read('custom-serializer','N15','type Encoded=int\nfun Encoded.packToBuilder(self,mutate b:builder){ b.storeUint(self ^ 255,8); }\nfun Encoded.unpackFromSlice(mutate s:slice):Encoded { return (s.loadUint(8)^255) as Encoded; }\nstruct Box {value:Encoded}','int','return Box.fromSlice(body).value;'),
    read('tensor-layout','N16','struct Box {value:(uint8,int8)}','(int,int)','return Box.fromSlice(body).value;'),
    read('shaped-tuple-layout','N16','struct Box {value:[uint8,int8]}','[int,int]','return Box.fromSlice(body).value;'),
    read('array-serialization','N16','struct Box {value:array<uint8>}','int','val b=Box.fromSlice(body); return b.value.size();'),
    { id:'array-mutation', family:'N16',
        source:'@method_id(90060) fun check(a:array<int>,x:int):(array<int>,int){var b=a;b.push(x);val last=b.pop();return(b,last);}',
        probes:[[],[int(1)],[int(1),int(2)]].flatMap(items=>scalar.map(x=>probe([{type:'tuple',items},x]))) },
    { id:'typed-map-get-set', family:'N17',
        source:'@method_id(90060) fun check(d:dict,k:int,x:int):(dict,int){var m=createMapFromLowLevelDict<uint8,uint8>(d);m.set(k as uint8,x as uint8);return(m.toLowLevelDict(),m.mustGet(k as uint8));}',
        probes:[{type:'null'},{type:'cell',cell:empty}].flatMap(d=>[-1,0,1,255,256].flatMap(k=>[-1,0,255,256].map(x=>probe([d,int(k),int(x)])))) },
    { id:'typed-map-iteration', family:'N17',
        source:'@method_id(90060) fun check(k:int,x:int):int{var m=createEmptyMap<int8,uint8>();m.set(k as int8,x as uint8);m.set(0,1);var r=m.findFirst();var total=0;while(r.isFound){total+=r.getKey()+r.loadValue();r=m.iterateNext(r);}return total;}',
        probes:[-129,-128,-1,0,1,127,128].flatMap(k=>[-1,0,255,256].map(x=>probe([int(k),int(x)]))) },
    { id:'arithmetic-rounding', family:'N19',
        source:'@method_id(90060) fun check(x:int,y:int,z:int):(int,int,int,int,int){return(x/y,x ^/ y,x ~/ y,mulDivFloor(x,y,z),mulDivRound(x,y,z));}',
        probes:[-7,-1,0,1,7,1n<<255n].flatMap(x=>[-3,0,3].flatMap(y=>[-2,0,2].map(z=>probe([int(x),int(y),int(z)])))) },
    { id:'generic-inlining', family:'N20',
        source:'fun identity<T>(x:T):T {return x;} @method_id(90060) fun check(x:int):int{return identity<int>(x)+1;}',
        probes:scalar.map(x=>probe([x])) },
    { id:'lambda-inlining', family:'N20',
        source:'@method_id(90060) fun check(x:int):int{val f=fun(a:int):int{return a+1;};return f(x);}',
        probes:scalar.map(x=>probe([x])) },
];

// Targeted valid cases complement underflow/leftover/ref boundaries. In
// particular, all-zero/all-one cells alone would never hit A/BC prefixes.
const bits = (value, width) => beginCell().storeUint(value, width).endCell();
const samples = {
    'nested-integer-match': [bits(0x0701,16),bits(0x0702,16),bits(0x0703,16),bits(0x0801,16)],
    'enum-sequence': [bits(1,8),bits(2,8),bits(3,8)],
    'enum-sparse': [bits(1,8),bits(2,8),bits(7,8)],
    'maybe-scalar': [bits(0x107,9)],
    'maybe-tensor': [bits(0x107fd,17)],
    'either-primitives': [bits(7,9),beginCell().storeBit(true).storeRef(ref).endCell()],
    'constructor-union': [bits(0xa00,12),bits(0xa07,12),bits(0xa7f,12),bits(0xbc80,16),bits(0xbcff,16)],
    'nested-layout': [beginCell().storeUint(7,8).storeCoins(19).storeRef(ref).endCell()],
    'tensor-layout': [bits(0x07fd,16)],
    'shaped-tuple-layout': [bits(0x07fd,16)],
    'read-int8': [bits(127,8),bits(128,8)],
    'read-coins': [beginCell().storeCoins(0).endCell(),beginCell().storeCoins(19).endCell(),beginCell().storeCoins((1n<<120n)-1n).endCell()],
    'read-varint16': [bits(0,4), ...[-1,127,-128].map(value=>beginCell().storeUint(1,4).storeInt(value,8).endCell())],
    'read-varuint32': [bits(0,5), ...[1,255].map(value=>beginCell().storeUint(1,5).storeUint(value,8).endCell()),
        beginCell().storeUint(31,5).storeUint((1n<<248n)-1n,248).endCell()],
};
for (const id of ['nested-if-source','nested-else-match','nested-join-retained','nested-loop-retained'])
    samples[id] = samples['nested-integer-match'];
samples['nested-loop-retained'] = [...samples['nested-loop-retained'],bits(0x07000701,32),bits(0x07000800,32)];
const arrayChunk = beginCell().storeBit(false).storeUint(7,8).storeUint(9,8).endCell();
samples['array-serialization'] = [bits(0,9),
    beginCell().storeUint(2,8).storeBit(true).storeRef(arrayChunk).endCell(),
    beginCell().storeUint(1,8).storeBit(true).storeRef(arrayChunk).endCell(),
    beginCell().storeUint(0,8).storeBit(true).storeRef(empty).endCell()];
for (const fixture of compilerCatalog) {
    for (const cell of samples[fixture.id] ?? []) {
        const hash = cell.hash().toString('hex');
        if (!fixture.probes.some(p => p.args[0]?.cell?.hash().toString('hex') === hash))
            fixture.probes.push(probe([{type:'slice',cell}]));
    }
}
