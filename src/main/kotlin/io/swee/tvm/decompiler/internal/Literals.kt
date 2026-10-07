package io.swee.tvm.decompiler.internal

import org.ton.bytecode.TvmCell
import org.ton.ton4j.cell.Cell
import org.ton.ton4j.cell.CellBuilder

object Literals {
    fun cellLiteral(cell: TvmCell): String {
        return if (cell.refs.isEmpty()) bitLiteral(cell) else "${cellReferenceLiteral(cell)} <s"
    }

    /** A single-line executable Fift cell expression, including all references. */
    fun cellReferenceLiteral(cell: TvmCell): String = buildString {
        append("<b ${bitLiteral(cell)} s,")
        for (ref in cell.refs) append(" ${cellReferenceLiteral(ref)} ref,")
        append(" b>")
    }

    private fun bitLiteral(cell: TvmCell): String {
        val bits = cell.data.bits
        val remainder = bits.length % 4
        val padded = if (remainder == 0) bits else bits + "1" + "0".repeat(3 - remainder)
        val hex = padded.chunked(4).joinToString("") { it.toInt(2).toString(16).uppercase() }
        return "x{$hex${if (remainder == 0) "" else "_"}}"
    }

    private fun convertCell(tvmCell: TvmCell): Cell {
        val cb = CellBuilder.beginCell()
        cb.storeBits(tvmCell.data.bits)
        cb.storeRefs(tvmCell.refs.map { convertCell(it) })
        return cb.endCell()
    }
}
