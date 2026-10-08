import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
const int = value => ({type:'int',value:BigInt(value)});
const probes = [-1,0,1,2,20].map(n=>({method:90046,args:[int(n)]}));
await verifyRecoveryFixtures('tolk-early-return',[
    {id:'callref-untouched-arguments',rules:[],verifyFunc:true,probes,source:`
@inline_ref
fun update(a:int,b:int,c:int,last:int,liquidity:int):(int,int,int,int) {
    if (liquidity < 0) { return (a,b,c,last); }
    if (liquidity == 0) { return (a,b,c,last + 1); }
    return (a-liquidity,b-liquidity,c+liquidity,last+liquidity);
}
@method_id(90046)
fun check(n:int):(int,int,int,int) { return update(11,22,33,44,n); }
`},
    {id:'dictionary-call-untouched-arguments',rules:[],verifyFunc:true,probes,source:`
@noinline
fun update(a:int,b:int,c:int,last:int,liquidity:int):(int,int,int,int) {
    if (liquidity < 0) { return (a,b,c,last); }
    if (liquidity == 0) { return (a,b,c,last + 1); }
    return (a-liquidity,b-liquidity,c+liquidity,last+liquidity);
}
@method_id(90046)
fun check(n:int):(int,int,int,int) { return update(11,22,33,44,n); }
`},
],[]);
