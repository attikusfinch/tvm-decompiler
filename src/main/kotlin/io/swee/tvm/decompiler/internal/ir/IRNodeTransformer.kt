package io.swee.tvm.decompiler.internal.ir

interface IRNodeTransformer {
    fun transform(node: IRNode): IRNode {
        return when (node) {
            is IRNode.Root -> transformRoot(node)
            is IRNode.Function -> transformFunction(node)
            is IRNode.CodeBlock -> transformCodeBlock(node)
            is IRNode.VariableDeclaration -> transformVariableDeclaration(node)
            is IRNode.FunctionCall -> transformFunctionCall(node)
            is IRNode.SliceLiteral -> transformSliceLiteral(node)
            is IRNode.ConstSliceDecl -> transformConstSliceDecl(node)
            is IRNode.SliceConstRef -> transformSliceConstRef(node)
            is IRNode.IfElse -> transformIfElse(node)
            is IRNode.TryCatch -> transformTryCatch(node)
            is IRNode.WhileLoop -> transformWhileLoop(node)
            is IRNode.UntilLoop -> transformUntilLoop(node)
            is IRNode.RepeatLoop -> transformRepeatLoop(node)
            is IRNode.GlobalWrite -> transformGlobalWrite(node)
            is IRNode.AsmFunction -> transformAsmFunction(node)
            is IRNode.Comment -> transformComment(node)
            is IRNode.FunctionReturnStatement -> transformFunctionReturnStatement(node)
            is IRNode.GlobalRead -> transformGlobalRead(node)
            is IRNode.IntLiteral -> transformIntLiteral(node)
            is IRNode.VariableUsage -> transformVariableUsage(node)
        }
    }

    fun transformSliceLiteral(node: IRNode.SliceLiteral): IRNode = node
    fun transformConstSliceDecl(node: IRNode.ConstSliceDecl): IRNode = node
    fun transformSliceConstRef(node: IRNode.SliceConstRef): IRNode = node
    fun transformAsmFunction(node: IRNode.AsmFunction): IRNode = node
    fun transformTryCatch(node: IRNode.TryCatch): IRNode = IRNode.TryCatch(
        transformCodeBlock(node.tryBlock), transformCodeBlock(node.catchBlock), node.exceptionValue, node.exceptionCode
    )
    fun transformComment(node: IRNode.Comment): IRNode = node
    fun transformFunctionReturnStatement(node: IRNode.FunctionReturnStatement): IRNode = node
    fun transformGlobalRead(node: IRNode.GlobalRead): IRNode = node
    fun transformIntLiteral(node: IRNode.IntLiteral): IRNode = node
    fun transformVariableUsage(node: IRNode.VariableUsage): IRNode = node

    fun transformRoot(node: IRNode.Root): IRNode.Root {
        return IRNode.Root(
            node.asmFunctions,
            node.functions.map { transform(it) as IRNode.Function },
            node.constants
        )
    }

    fun transformFunction(node: IRNode.Function): IRNode.Function {
        return IRNode.Function(
            node.name,
            node.methodId,
            node.upstreamStack,
            transform(node.codeBlock) as IRNode.CodeBlock,
            node.isInlineRef
        )
    }

    fun transformCodeBlock(node: IRNode.CodeBlock): IRNode.CodeBlock {
        return IRNode.CodeBlock(
            entries = node.entries.map { transform(it) },
            isExpression = node.isExpression
        )
    }

    fun transformVariableDeclaration(node: IRNode.VariableDeclaration): IRNode {
        return IRNode.VariableDeclaration(
            node.entries,
            transform(node.value),
            node.untuple,
            node.reassignment
        )
    }

    fun transformFunctionCall(node: IRNode.FunctionCall): IRNode {
        return IRNode.FunctionCall(
            node.name,
            node.args.map { transform(it) },
            node.asmBody,
            node.pure,
        )
    }

    fun transformIfElse(node: IRNode.IfElse): IRNode {
        return IRNode.IfElse(
            transformCodeBlock(node.condCodeBlock),
            node.ifCodeBlock?.let { transformCodeBlock(it) },
            node.elseCodeBlock?.let { transformCodeBlock(it) },
            node.ifnot
        )
    }

    fun transformWhileLoop(node: IRNode.WhileLoop): IRNode {
        return IRNode.WhileLoop(
            node.condCodeBlock?.let { transform(it) as IRNode.CodeBlock },
            node.bodyCodeBlock?.let { transform(it) as IRNode.CodeBlock }
        )
    }

    fun transformUntilLoop(node: IRNode.UntilLoop): IRNode {
        return IRNode.UntilLoop(
            bodyCodeBlock = transform(node.bodyCodeBlock) as IRNode.CodeBlock,
            condition = transform(node.condition)
        )
    }

    fun transformRepeatLoop(node: IRNode.RepeatLoop): IRNode {
        return IRNode.RepeatLoop(
            countExpression = transform(node.countExpression),
            bodyCodeBlock = transform(node.bodyCodeBlock) as IRNode.CodeBlock
        )
    }

    fun transformGlobalWrite(node: IRNode.GlobalWrite): IRNode {
        return IRNode.GlobalWrite(
            node.number,
            transform(node.value)
        )
    }
}
