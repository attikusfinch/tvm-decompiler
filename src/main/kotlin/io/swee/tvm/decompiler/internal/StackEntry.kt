package io.swee.tvm.decompiler.internal

import org.ton.bytecode.TvmCell
import org.ton.bytecode.TvmInst

sealed interface ConcreteValue {
    data class IntVal(val value: String) : ConcreteValue
    data class SliceVal(val value: TvmCell) : ConcreteValue
    data class ContinuationVal(val instructions: List<TvmInst>) : ConcreteValue
}

sealed interface StackEntry {
    var type: TvmStackEntryType
    val name: StackEntryName
    val concreteValue: ConcreteValue?

    data class Simple(
        override var type: TvmStackEntryType,
        override val name: StackEntryName,
        override val concreteValue: ConcreteValue? = null
    ) : StackEntry

    companion object {
        fun merge(entries: List<StackEntry>, name: StackEntryName = StackEntryName.Const("phi")): StackEntry? {
            if (entries.isEmpty()) return null
            val first = entries.first()
            if (entries.all { it === first }) return first

            val agreedValue = entries.map { it.concreteValue }.distinct().singleOrNull()
            return Simple(
                // Tagged-union payload slots may hold different TVM kinds in each
                // branch. Taking the first branch's kind rejects valid later uses.
                type = entries.map { it.type }.reduce { a, b -> TypeLattice.join(a, b)!! },
                name = name,
                concreteValue = agreedValue
            )
        }
    }
}
