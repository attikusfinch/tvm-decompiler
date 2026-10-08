package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.StackEntry

interface IRNodeVisitor {
    fun visitAny(node: IRNode) {
    }
    fun visit(node: IRNode.Root) = visitAny(node)
    fun visit(node: IRNode.AsmFunction) = visitAny(node)
    fun visit(node: IRNode.Function) = visitAny(node)
    fun visit(node: IRNode.CodeBlock) = visitAny(node)
    fun visit(node: IRNode.VariableUsage) = visitAny(node)
    fun visit(node: IRNode.VariableDeclaration) = visitAny(node)
    fun visit(node: IRNode.IntLiteral) = visitAny(node)
    fun visit(node: IRNode.SliceLiteral) = visitAny(node)
    fun visit(node: IRNode.ConstSliceDecl) = visitAny(node)
    fun visit(node: IRNode.SliceConstRef) = visitAny(node)
    fun visit(node: IRNode.Comment) = visitAny(node)
    fun visit(node: IRNode.FunctionReturnStatement) = visitAny(node)
    fun visit(node: IRNode.FunctionCall) = visitAny(node)
    fun visit(node: IRNode.IfElse) = visitAny(node)
    fun visit(node: IRNode.TryCatch) = visitAny(node)
    fun visit(node: IRNode.WhileLoop) = visitAny(node)
    fun visit(node: IRNode.UntilLoop) = visitAny(node)
    fun visit(node: IRNode.RepeatLoop) = visitAny(node)
    fun visit(node: IRNode.GlobalRead) = visitAny(node)
    fun visit(node: IRNode.GlobalWrite) = visitAny(node)
}

interface StackEntryVisitor : IRNodeVisitor {
    override fun visitAny(node: IRNode) {
        for (entry in node.directUsedStackEntries()) {
            visitEntry(node, entry)
        }
    }

    fun visitEntry(node: IRNode, entry: StackEntry)
}

