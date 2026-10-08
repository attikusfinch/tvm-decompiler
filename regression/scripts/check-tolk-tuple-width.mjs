import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { beginCell } from '@ton/core';
const int=value=>({type:'int',value:BigInt(value)});
const c=beginCell().storeUint(123,8).endCell();
await verifyRecoveryFixtures('tolk-tuple-width',[
    {id:'encoded-mixed-arities',rules:[],verifyFunc:true,
        probes:[-1,0,1].flatMap(n=>[0,-1].map(flag=>({method:90046,
            args:[int(n),{type:'cell',cell:c},int(flag)]}))),source:`
fun pack5(a:int,b:cell,c:slice,d:int,e:int):tuple asm "5 TUPLE"
fun pack6(a:int,b:cell,c:slice,d:int,e:int,f:int):tuple asm "6 TUPLE"
@method_id(90046)
fun check(n:int,c:cell,wide:bool):tuple {
    if (wide) { return pack6(n,c,c.beginParse(),11,22,33); }
    return pack5(n,c,c.beginParse(),11,22);
}
`},
],[]);
