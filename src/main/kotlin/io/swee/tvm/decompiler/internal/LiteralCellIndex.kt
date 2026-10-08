package io.swee.tvm.decompiler.internal

import io.swee.tvm.decompiler.internal.instructions.Cp0InstructionRegistry
import org.ton.bytecode.*
import org.ton.ton4j.cell.Cell
import org.ton.ton4j.cell.CellSlice
import java.util.IdentityHashMap

/** Restore BOC descriptors omitted by the disassembler's TvmCell model. */
class LiteralCellIndex private constructor(private val literals: IdentityHashMap<TvmCell, String>) {
    fun reference(cell: TvmCell): String? = literals[cell]

    companion object {
        fun create(boc: ByteArray, code: TvmContractCode, registry: Cp0InstructionRegistry): LiteralCellIndex {
            val source = mutableMapOf<String, Cell>()
            fun visit(cell: Cell) {
                val hash = java.util.HexFormat.of().formatHex(cell.hash()).uppercase()
                if (source.putIfAbsent(hash, cell) != null) return
                cell.refs.forEach(::visit)
            }
            Cell.fromBocMultiRoots(boc).forEach(::visit)
            // The disassembler hashes dictionary values after removing their
            // edge labels. Those physical method-body cells are absent from
            // the serialized BOC tree, but retain its original ordered refs.
            for (dictionary in code.mainMethod.instList.filterIsInstance<TvmDictSpecialDictpushconstInst>()) {
                val parent = source[dictionary.physicalLocation.cellHashHex.uppercase()] ?: continue
                val map = CellSlice.beginParse(parent.refs.first()).loadDict(dictionary.n,
                    { it.toBitString() }, { it })
                map.elements.values.forEach { visit(it as Cell) }
            }
            val instructions = mutableMapOf<String, MutableMap<Int, MutableList<TvmRealInst>>>()
            val seenInstructions = IdentityHashMap<TvmInst, Boolean>()
            fun scan(list: List<TvmInst>) {
                for (inst in list) {
                    if (seenInstructions.put(inst, true) != null) continue
                    if (inst is TvmRealInst) {
                        val location = inst.physicalLocation
                        instructions.getOrPut(location.cellHashHex.uppercase()) { mutableMapOf() }
                            .getOrPut(location.offset) { mutableListOf() }.add(inst)
                    }
                    if (inst is TvmContOperand1Inst) scan(inst.c.list)
                    if (inst is TvmContOperand2Inst) { scan(inst.c1.list); scan(inst.c2.list) }
                }
            }
            scan(code.mainMethod.instList)
            code.methods.values.forEach { scan(it.instList) }
            val literals = IdentityHashMap<TvmCell, String>()
            fun matches(model: TvmCell, cell: Cell): Boolean = model.data.bits == cell.toBitString() &&
                model.refs.size == cell.refs.size && model.refs.indices.all { matches(model.refs[it], cell.refs[it]) }
            fun bind(model: TvmCell, cell: Cell) {
                check(matches(model, cell)) { "Physical BOC reference does not match decoded literal" }
                literals[model] = Literals.sourceCellReferenceLiteral(cell)
                model.refs.indices.forEach { bind(model.refs[it], cell.refs[it]) }
            }
            for ((hash, byOffset) in instructions) {
                val parent = source[hash] ?: continue
                var nextReference = 0
                for (aliases in byOffset.toSortedMap().values) {
                    val inst = aliases.first()
                    val description = registry.getByClass(inst.javaClass)?.instDescriptionRaw ?: continue
                    for (operand in description.bytecode.operands) {
                        when (operand.type) {
                            Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.REF -> {
                                val cell = parent.refs.getOrNull(nextReference++)
                                    ?: error("Missing physical reference at ${inst.physicalLocation}")
                                for (alias in aliases) {
                                    val model = InstValueAccessor.getValue(alias, operand.name)
                                    if (model is TvmCell) bind(model, cell)
                                }
                            }
                            Cp0InstructionRegistry.TvmCp0InstBytecodeOperandType.SUBSLICE -> {
                                val model = InstValueAccessor.getValue(inst, operand.name)
                                // Inline continuation instructions are scanned at their own
                                // physical offsets; their references must not be counted twice.
                                if (model is TvmCell) {
                                    val refs = model.refs.indices.map {
                                        parent.refs.getOrNull(nextReference++)
                                            ?: error("Missing subslice reference at ${inst.physicalLocation}")
                                    }
                                    for (alias in aliases) {
                                        val slice = InstValueAccessor.getValue(alias, operand.name) as TvmCell
                                        slice.refs.indices.forEach { bind(slice.refs[it], refs[it]) }
                                        literals[slice] = buildString {
                                            append("<b ${Literals.bitLiteral(slice)} s,")
                                            for (ref in slice.refs) append(" ${literals.getValue(ref)} ref,")
                                            append(" b>")
                                        }
                                    }
                                }
                            }
                            else -> Unit
                        }
                    }
                }
            }
            return LiteralCellIndex(literals)
        }
    }
}
