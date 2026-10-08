import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { beginCell } from '@ton/core';
const int=value=>({type:'int',value:BigInt(value)});
const cell={type:'cell',cell:beginCell().storeUint(0,8).endCell()};
await verifyRecoveryFixtures('tolk-union-conditions',[
    {id:'merged-integer-cell-payload',rules:[],verifyFunc:true,
        probes:[0,-1].flatMap(flag=>[0,1,-1].map(n=>({method:90046,args:[int(flag),int(n),cell]}))),source:`
@method_id(90046)
fun check(flag:bool,n:int,c:cell):int {
    val value:int | cell=flag ? n : c;
    if (value is int) {
        if ((value as int) != 0) { return 5; }
        return 6;
    }
    return 7;
}
`},
    {id:'non-void-final-throw',rules:[],
        probes:[-1,0,1].map(n=>({method:90046,args:[int(n)]})),source:`
@method_id(90046)
fun check(n:int):int {
    if (n > 0) { return n; }
    throw 41;
}
`},
],[]);
