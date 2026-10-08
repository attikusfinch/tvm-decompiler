package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry
import org.ton.bytecode.TvmCell
import org.ton.bytecode.TvmCellBuildEndcInst
import org.ton.bytecode.TvmCellBuildNewcInst
import org.ton.bytecode.TvmCellData
import org.ton.bytecode.TvmConstDataPushsliceInst
import org.ton.bytecode.TvmConstIntPushint4Inst
import org.ton.bytecode.TvmInst
import org.ton.bytecode.TvmInstLocation
import org.ton.bytecode.TvmMainMethodLocation
import org.ton.bytecode.TvmTupleNullInst
import org.ton.disasm.TvmPhysicalInstLocation

private val DEFAULT_LOC: TvmInstLocation = TvmMainMethodLocation(0)
private val DEFAULT_PHYS = TvmPhysicalInstLocation("", 0)

private fun newc() = TvmCellBuildNewcInst(DEFAULT_LOC, DEFAULT_PHYS)
private fun endc() = TvmCellBuildEndcInst(DEFAULT_LOC, DEFAULT_PHYS)
private fun pushNull() = TvmTupleNullInst(DEFAULT_LOC, DEFAULT_PHYS)
private fun pushInt0() = TvmConstIntPushint4Inst(DEFAULT_LOC, DEFAULT_PHYS, 0)
private fun pushEmptySlice() =
    TvmConstDataPushsliceInst(DEFAULT_LOC, DEFAULT_PHYS, TvmCell(TvmCellData(""), emptyList()))

sealed class TvmStackEntryType(val typename: String) {

    open val funcTypename: String get() = typename

    data object SLICE : TvmStackEntryType("slice") {
        override fun default(): List<TvmInst> = listOf(pushEmptySlice())
    }
    data object CELL : TvmStackEntryType("cell") {
        override fun default(): List<TvmInst> = listOf(newc(), endc())
    }
    data object INT : TvmStackEntryType("int") {
        override fun default(): List<TvmInst> = listOf(pushInt0())
    }
    data object BUILDER : TvmStackEntryType("builder") {
        override fun default(): List<TvmInst> = listOf(newc())
    }
    data object CONTINUATION : TvmStackEntryType("continuation") {
        override val funcTypename: String get() = "cont"
        override fun default(): List<TvmInst> = listOf(pushNull())
    }

    data class TUPLE(
        val elements: List<TvmStackEntryType>,
    ) : TvmStackEntryType(typename) {
        companion object {
            const val typename = "tuple"
        }

        override val funcTypename: String
            get() = if (elements.isNotEmpty()) "[${elements.joinToString(", ") { it.funcTypename }}]" else "tuple"

        override fun default(): List<TvmInst> = listOf(pushNull())
    }

    data object UNKNOWN : TvmStackEntryType("var") {
        override fun default(): List<TvmInst> = listOf(pushNull())
    }

    abstract fun default(): List<TvmInst>

    companion object {
        fun fromTvmStackEntryDescription(value: Cp0InstructionRegistry.TvmCp0InstValueFlowOutputsEntry.Simple): TvmStackEntryType {
            val types = value.valueTypes ?: return UNKNOWN
            if (types.size == 2) {
                val nonNull = types.filter { it != Cp0InstructionRegistry.TvmCp0InstStackEntryType.NULL }
                if (nonNull.size == 1) return fromTvmStackEntryType(nonNull.single(), value.tupleElements)
            }
            return fromTvmStackEntryType(types.singleOrNull(), value.tupleElements)
        }
        fun fromTvmStackEntryType(
            value: Cp0InstructionRegistry.TvmCp0InstStackEntryType?,
            tupleElements: List<Cp0InstructionRegistry.TvmCp0InstStackEntryType>? = null
        ): TvmStackEntryType {
            return when (value) {
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.INT -> INT
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.CELL -> CELL
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.SLICE -> SLICE
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.TUPLE -> TUPLE(
                    tupleElements?.map { fromTvmStackEntryType(it) } ?: listOf()
                )
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.BUILDER -> BUILDER
                Cp0InstructionRegistry.TvmCp0InstStackEntryType.CONTINUATION -> CONTINUATION
                else -> UNKNOWN
            }
        }
        fun fromTypename(typename: String): TvmStackEntryType {
            return when (typename) {
                "int" -> INT
                "cell" -> CELL
                "slice" -> SLICE
                "builder" -> BUILDER
                "continuation" -> CONTINUATION
                "tuple" -> TUPLE(listOf())
                else -> UNKNOWN
            }
        }

        fun fromTvmBytecodeOperandDescription(value: Cp0InstructionRegistry.TvmCp0InstBytecodeOperand): TvmStackEntryType {
            return when (value.type) {
                Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.UINT -> INT
                Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.INT -> INT
                Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.SUBSLICE -> SLICE
                else -> UNKNOWN
            }
        }
    }
}
