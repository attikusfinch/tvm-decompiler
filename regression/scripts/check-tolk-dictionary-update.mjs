import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
import { beginCell, Dictionary } from '@ton/core';
const int=value=>({type:'int',value:BigInt(value)});
const dict=Dictionary.empty(Dictionary.Keys.Uint(8),Dictionary.Values.Int(16));
dict.set(7,123);
const dictionary=beginCell().storeDictDirect(dict).endCell();
const probes=[{type:'null'},{type:'cell',cell:dictionary}].flatMap(d=>[7,8,255].map(k=>({method:90046,args:[d,int(k),int(456)]})));
await verifyRecoveryFixtures('tolk-dictionary-update',[
    {id:'set-get-builder-unsigned',rules:[],verifyFunc:true,probes,source:`
fun replace(b:builder,key:int,d:dict,width:int):(dict,slice?,int)
    asm "DICTUSETGETB" "NULLSWAPIFNOT"
@method_id(90046)
fun check(d:dict,key:int,value:int):(dict,int,int) {
    val (updated,previous,found)=replace(beginCell().storeInt(value,16),key,d,8);
    return (updated,found,found != 0 ? previous!.preloadInt(16) : -1);
}
`},
    {id:'map-set-and-get-previous',rules:[],verifyFunc:true,probes,source:`
@method_id(90046)
fun check(d:dict,key:int,value:int):(dict,int,int) {
    var m=createMapFromLowLevelDict<uint8,int16>(d);
    val previous=m.setAndGetPrevious(key as uint8,value as int16);
    return (m.toLowLevelDict(),previous.isFound as int,previous.isFound ? previous.loadValue() : -1);
}
`},
],[]);
