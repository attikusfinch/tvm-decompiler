package io.swee.tvm.decompiler.internal.instructions

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.internal.ir.IRNode
import org.ton.bytecode.TvmTupleUntupleInst
import org.ton.bytecode.TvmTupleIndexInst

fun registerTupleParsers(registry: ParserRegistry) {
   with(registry) {
       register(TvmTupleIndexInst::class.java, ParserLevel.MANUAL, parser = { ctx, inst ->
           val tuple = ctx.stackFetch(0)
           val type = tuple.type as? TvmStackEntryType.TUPLE
           // FunC's typed pairs are distinct from opaque tuple. int_at(tuple, n)
           // cannot accept get_balance(): [int, cell]. Preserve the element type.
           if (type?.elements?.size == 2 && inst.k in 0..1) {
               ctx.stackPop()
               val result = StackEntry.Simple(type.elements[inst.k], name("element_${inst.k}"))
               ctx.stackPush(result)
               ctx.appendNode(IRNode.VariableDeclaration(listOf(result), IRNode.FunctionCall(
                   if (inst.k == 0) "pair_first" else "pair_second",
                   listOf(IRNode.VariableUsage(tuple, true))
               )))
               true
           } else false
       })
       register<TvmTupleUntupleInst>(ParserLevel.MANUAL) { ctx, inst ->
           val tuple = ctx.stackPop(TvmStackEntryType.TUPLE.typename)
           val tupleType = tuple.type

           val entries = if (tupleType is TvmStackEntryType.TUPLE && tupleType.elements.size == inst.n) {
               tupleType.elements.mapIndexed { index, el ->
                   StackEntry.Simple(el, name("element_$index"))
               }
           } else {
               (0 until inst.n).map { index ->
                   StackEntry.Simple(TvmStackEntryType.UNKNOWN, name("element_$index"))
               }
           }
           for (entry in entries) {
               ctx.stackPush(entry)
           }

           ctx.appendNode(
               IRNode.VariableDeclaration(entries, IRNode.VariableUsage(tuple, true), untuple = true)
           )
       }
   }
}
