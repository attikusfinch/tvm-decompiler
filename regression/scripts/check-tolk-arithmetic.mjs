import { beginCell } from '@ton/core';
import { verifyRecoveryFixtures } from './recovery-fixtures.mjs';
const int = value => ({type:'int',value:BigInt(value)});
const values = [-7n,-1n,0n,1n,7n,-(1n<<256n),(1n<<256n)-1n].map(int)
    .concat({type:'null'},{type:'nan'},{type:'cell',cell:beginCell().endCell()});
const rule = ['terminal-native-arithmetic'];
process.env.FUNC_BACKEND='native';
const cases = [
    ...[['min',2,'int'],['max',2,'int'],['minMax',2,'(int,int)'],['abs',1,'int'],['divMod',2,'(int,int)'],
        ['mulDivFloor',3,'int'],['mulDivRound',3,'int'],['mulDivCeil',3,'int'],['mulDivMod',3,'(int,int)']].map(([name,arity,result])=>({
        id:name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()), rules:rule,
        source:`@method_id(90062) fun check(${['x:int','y:int','z:int'].slice(0,arity).join(',')}):${result}{return ${name}(${['x','y','z'].slice(0,arity).join(',')});}`,
        probes:arity===1?values.map(x=>({method:90062,args:[x]})):arity===2?values.flatMap(x=>values.map(y=>({method:90062,args:[x,y]}))):
            values.flatMap(x=>[-3,0,3].flatMap(y=>[-2,0,2].map(z=>({method:90062,args:[x,int(y),int(z)]})))),
    })),
    ...[['ceil-divide','^/'],['round-divide','~/']].map(([id,operator])=>({id,rules:rule,
        source:`@method_id(90062) fun check(x:int,y:int):int{return x ${operator} y;}`,
        probes:values.flatMap(x=>values.map(y=>({method:90062,args:[x,y]}))),
    })),
    {id:'repeated-min-retained',rules:[],source:'fun low(x:int,y:int):int asm "MIN" @method_id(90062) fun check(x:int):int{return low(x,x);}',probes:values.map(x=>({method:90062,args:[x]}))},
    {id:'constant-operand-retained',rules:[],source:'fun low(x:int,y:int):int asm "MIN" @method_id(90062) fun check(x:int):int{return low(x,7);}',probes:values.map(x=>({method:90062,args:[x]}))},
    ...[['min','MIN',2,'int'],['max','MAX',2,'int'],['minmax','MINMAX',2,'(int,int)'],['abs','ABS',1,'int']].map(([id,opcode,arity,type])=>({
        id:`discarded-${id}-retained`,rules:[],verifyFunc:true,
        source:`fun low(${['x:int','y:int'].slice(0,arity).join(',')}):${type} asm "${opcode}" @method_id(90062) fun check(${['x:int','y:int'].slice(0,arity).join(',')}):int{low(${['x','y'].slice(0,arity).join(',')});return 7;}`,
        probes:arity===1?values.map(x=>({method:90062,args:[x]})):values.flatMap(x=>values.map(y=>({method:90062,args:[x,y]}))),
    })),
    {id:'nonterminal-divide-retained',rules:[],source:'@method_id(90062) fun check(x:int,y:int):int{return (x ~/ y)+1;}',probes:values.flatMap(x=>values.map(y=>({method:90062,args:[x,y]})))},
];
await verifyRecoveryFixtures('tolk-arithmetic',cases,rule);
