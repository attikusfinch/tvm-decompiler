import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { beginCell } from '@ton/core';
import { root, decompile, recompile, compareBoc, compareGetters, writeJson } from './lib.mjs';
import { compileTolk } from './tolk.mjs';

const directory = path.join(root, 'artifacts/tolk-recovery');
const int = value => ({type:'int',value:BigInt(value)});
const slice = cell => ({type:'slice',cell});
const bodies = [beginCell().endCell(), ...[1,7,8,15,16,24].map(bits => beginCell().storeUint(1,bits).endCell()),
    beginCell().storeUint(0x0102,16).storeRef(beginCell().endCell()).endCell()];
const numberProbes = [-3,-1,0,1,2,3,0x80000000,0x80000001].flatMap(op => bodies.map(body => ({method:90030,args:[int(op),slice(body)]})));
const scalarProbes = [-2,-1,0,1,2,137].flatMap(c => [-7,0,11].map(a => ({method:90031,args:[int(c),int(a),int(a+5)]})));
const loadProbes = [0,1,7,8,16,257,-1].flatMap(width => bodies.map(body => ({method:90032,args:[slice(body),int(width)]})));
const cases = [
    {id:'integer-match',rules:['integer-match'],probes:numberProbes,source:`
@method_id(90030)
fun check(op:int, body:slice):int {
    match (op) {
        -1 => { return body.preloadUint(8); }
        2 => { return body.preloadUint(16) + 1; }
        0x80000000 => { return body.remainingRefsCount(); }
        else => { return -7; }
    }
}`},
    {id:'integer-flat',rules:['integer-match'],probes:numberProbes,source:`
@method_id(90030)
fun check(op:int, body:slice):int {
    if (op == -1) { return body.preloadUint(8); }
    if (op == 2) { return body.preloadUint(16) + 1; }
    if (op == 0x80000000) { return body.remainingRefsCount(); }
    return -7;
}`},
    {id:'integer-local-cursor',rules:['integer-match','cursor-load'],probes:bodies.map(body=>({method:90030,args:[slice(body)]})),source:`
@method_id(90030)
fun check(body:slice):int {
    val op = body.loadUint(8);
    if (op == 1) { return body.preloadUint(8); }
    if (op == 2) { return body.preloadUint(16) + 1; }
    return -7;
}`},
    {id:'integer-join-retained',rules:[],probes:numberProbes,source:`
@method_id(90030)
fun check(op:int, body:slice):int {
    var n = 7;
    if (op == -1) { n = body.preloadUint(8); }
    if (op == 2) { n = body.preloadUint(16) + 1; }
    return n + op;
}`},
    {id:'integer-inner-return-retained',rules:[],probes:numberProbes,source:`
@method_id(90030)
fun check(op:int, body:slice):int {
    if (op == -1) {
        if (body.isEmpty()) { return 42; }
        return body.preloadUint(8);
    }
    if (op == 2) { return body.preloadUint(16) + 1; }
    return -7;
}`},
    {id:'conditional-values',rules:['conditional-select'],probes:scalarProbes,source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(c:int,a:int,b:int):int { return choose(c,a,b) as int; }`},
    {id:'conditional-ternary',rules:['conditional-select'],probes:scalarProbes,source:`
@method_id(90031) fun check(c:int,a:int,b:int):int { return c != 0 ? a : b; }`},
    {id:'conditional-constants',rules:['conditional-select'],probes:scalarProbes.map(p=>({...p,args:[p.args[0]]})),source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(c:int):int { return choose(c,2,-1) as int; }`},
    {id:'conditional-equal-operands',rules:['conditional-select'],probes:scalarProbes.map(p=>({...p,args:p.args.slice(0,2)})),source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(c:int,a:int):int { return choose(c,a,a) as int; }`},
    {id:'conditional-constant-condition-retained',rules:[],probes:[-7,0,11].map(a=>({method:90031,args:[int(a),int(a+1)]})),source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(a:int,b:int):int { return choose(0,a,b) as int; }`},
    {id:'conditional-erased-types',rules:['conditional-select'],probes:bodies.flatMap(body=>[-1,0,1].map(c=>({method:90031,args:[int(c),int(7),slice(body)]}))),source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(c:int,a:int,b:slice):unknown { return choose(c,a,b); }`},
    {id:'conditional-mixed-retained',rules:[],probes:bodies.flatMap(body=>[-1,0,1].map(c=>({method:90031,args:[int(c),int(7),slice(body)]}))),source:`
fun choose(c:int,a:unknown,b:unknown):unknown asm "CONDSEL"
@method_id(90031) fun check(c:int,a:int,b:slice):unknown { return choose(c,a+b.remainingBitsCount(),b); }`},
    {id:'cursor-unsigned-alias',rules:['cursor-load'],probes:loadProbes,source:`
fun load(s:slice,width:int):(slice,int) asm(s width -> 1 0) "LDUX"
@method_id(90032)
fun check(body:slice,width:int):int {
    var (rest,n) = load(body,width);
    n = n + rest.remainingBitsCount();
    return n + body.remainingBitsCount() + body.remainingRefsCount();
}`},
    {id:'cursor-signed-constant',rules:['cursor-load'],probes:bodies.map(body=>({method:90032,args:[slice(body)]})),source:`
fun load(s:slice,width:int):(slice,int) asm(s width -> 1 0) "LDIX"
@method_id(90032) fun check(body:slice):int { var (rest,n) = load(body,8); return n + rest.remainingBitsCount(); }`},
    {id:'cursor-discard-value',rules:['cursor-load'],probes:bodies.map(body=>({method:90032,args:[slice(body)]})),source:`
fun load(s:slice,width:int):(slice,int) asm(s width -> 1 0) "LDUX"
@method_id(90032) fun check(body:slice):int { var (rest,_) = load(body,8); return rest.remainingBitsCount(); }`},
    {id:'cursor-discard-rest',rules:['cursor-load'],probes:bodies.map(body=>({method:90032,args:[slice(body)]})),source:`
fun load(s:slice,width:int):(slice,int) asm(s width -> 1 0) "LDUX"
@method_id(90032) fun check(body:slice):int { var (_,n) = load(body,8); return n; }`},
    {id:'cursor-discard-both',rules:['cursor-load'],probes:bodies.map(body=>({method:90032,args:[slice(body)]})),source:`
fun load(s:slice,width:int):(slice,int) asm(s width -> 1 0) "LDUX"
@method_id(90032) fun check(body:slice):int { var (_,_) = load(body,8); return 7; }`},
    {id:'cursor-coins-discard-both',rules:['cursor-load'],probes:bodies.map(body=>({method:90032,args:[slice(body)]})),source:`
fun load(s:slice):(slice,int) asm( -> 1 0) "LDGRAMS"
@method_id(90032) fun check(body:slice):int { var (_,_) = load(body); return 7; }`},
    {id:'cursor-coins',rules:['cursor-load'],probes:[0n,1n,255n,256n,1n<<119n].flatMap(value=>[false,true].map(ref=>{
        const builder=beginCell().storeCoins(value).storeUint(7,8);
        if (ref) builder.storeRef(beginCell().endCell());
        return {method:90032,args:[slice(builder.endCell())]};
    })).concat(bodies.map(body=>({method:90032,args:[slice(body)]}))),source:`
fun load(s:slice):(slice,int) asm( -> 1 0) "LDGRAMS"
@method_id(90032) fun check(body:slice):int { var (rest,n) = load(body); return n + rest.preloadUint(8); }`},
];
const recoveryRules = new Set(['integer-match','conditional-select','cursor-load']);
const report=[];
for (const fixture of cases) {
    const target=path.join(directory,fixture.id);
    const original=await compileTolk({sources:{'main.tolk':fixture.source}});
    assert.equal(original.status,'ok',original.message);
    const boc=Buffer.from(original.codeBoc,'base64');
    const raw=await decompile(boc,path.join(target,'raw'),{local:true,language:'tolk',normalize:false});
    const normalized=await decompile(boc,target,{local:true,language:'tolk'});
    assert.equal(raw.complete,true,JSON.stringify(raw.diagnostics));
    assert.equal(normalized.complete,true,JSON.stringify(normalized.diagnostics));
    const changes=normalized.normalizations.filter(change=>recoveryRules.has(change.rule));
    assert.deepEqual([...new Set(changes.map(change=>change.rule))].sort(),fixture.rules.toSorted(),fixture.id);
    const rawResult=await recompile(raw,path.join(target,'raw'));
    const result=await recompile(normalized,target);
    assert.equal(rawResult.status,'ok',rawResult.message);
    assert.equal(result.status,'ok',result.message);
    const comparison=compareBoc(rawResult.boc,result.boc);
    assert.equal(comparison.sameCodeCell,true,fixture.id+': normalized code');
    assert.equal(comparison.sameSerializedBoc,true,fixture.id+': serialized BOC');
    const originalComparison=compareBoc(boc,rawResult.boc);
    const getters=await compareGetters(rawResult.boc,result.boc,fixture.probes);
    for (const probe of getters) {
        assert.equal(probe.sameObservedBehavior,true,JSON.stringify(probe));
        assert.equal(probe.before.gasUsed,probe.after.gasUsed,fixture.id+': gas');
    }
    const originalGetters=await compareGetters(boc,result.boc,fixture.probes);
    for (const probe of originalGetters) assert.equal(probe.sameObservedBehavior,true,fixture.id+': original behavior: '+JSON.stringify(probe));
    await fs.writeFile(path.join(target,'original.tolk'),fixture.source);
    await fs.writeFile(path.join(target,'original.fif'),original.fiftCode);
    report.push({id:fixture.id,changes,comparison,originalComparison,getters,originalGetters});
    console.log(`${fixture.id}: ${changes.map(c=>c.rule).join(', ')||'unsafe shape retained'}; raw/normalized TVM identical; ${getters.length} probes including gas passed; original/raw identical=${originalComparison.sameCodeCell}`);
}
await writeJson(path.join(directory,'report.json'),report);
