package io.swee.tvm.decompiler.internal.ir

import io.swee.tvm.decompiler.internal.*
import io.swee.tvm.decompiler.api.DecompilationDiagnostic
import org.ton.bytecode.TvmCell
import java.math.BigInteger

sealed interface IRNode {
    fun directUsedStackEntries(): Collection<StackEntry> = listOf()

    fun directChildren(): Collection<IRNode> = listOf()

    fun accept0(visitor: IRNodeVisitor)

    fun accept(visitor: IRNodeVisitor) {
        accept0(visitor)
        for (directChild in directChildren()) {
            directChild.accept(visitor)
        }
    }

    class Root(
        val asmFunctions: List<AsmFunction>,
        val functions: List<Function>,
        val constants: List<ConstSliceDecl> = emptyList()
    ) : IRNode {
        override fun directChildren() = constants + asmFunctions + functions
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class ConstSliceDecl(val name: String, val literal: String) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class SliceConstRef(val name: String) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class AsmFunction(
        val name: String,
        val args: List<StackEntry>,
        val returnType: List<StackEntry>,
        val body: String,
        val pure: Boolean = true
    ) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class Function(
        val name: String,
        val methodId: BigInteger,
        val upstreamStack: UpstreamStack,
        val codeBlock: CodeBlock,
        val isInlineRef: Boolean = false,
    ) : IRNode {
        override fun directChildren() = listOf(codeBlock)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class CodeBlock(
        val entries: List<IRNode>,
        val isExpression: Boolean = false
    ) : IRNode {
        override fun directChildren() = entries
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class VariableUsage(
        val entry: StackEntry,
        val tracked: Boolean
    ) : IRNode {
        override fun directUsedStackEntries(): Collection<StackEntry> {
            return if (tracked) {
                listOf(entry)
            } else {
                emptyList()
            }
        }
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class VariableDeclaration(
        val entries: List<StackEntry>,
        val value: IRNode,
        val untuple: Boolean = false,
        val reassignment: Boolean = false
    ) : IRNode {
        override fun directChildren() = listOf(value)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class IntLiteral(val literal: Any) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class SliceLiteral(val slice: TvmCell) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class Comment(val comment: String, val diagnostic: DecompilationDiagnostic? = null) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class FunctionReturnStatement(val variables: List<VariableUsage>) : IRNode {
        override fun directChildren() = variables
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class FunctionCall(
        val name: String,
        val args: List<IRNode>,
        val asmBody: String? = null,
        val pure: Boolean = false
    ) : IRNode {
        override fun directChildren() = args
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class TryCatch(
        val tryBlock: CodeBlock,
        val catchBlock: CodeBlock,
        val exceptionValue: StackEntry,
        val exceptionCode: StackEntry
    ) : IRNode {
        override fun directChildren() = listOf(tryBlock, catchBlock)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class IfElse(
        val condCodeBlock: CodeBlock,
        val ifCodeBlock: CodeBlock?,
        val elseCodeBlock: CodeBlock?,
        val ifnot: Boolean
    ) : IRNode {
        override fun directChildren() = listOfNotNull(condCodeBlock, ifCodeBlock, elseCodeBlock)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class WhileLoop(
        val condCodeBlock: CodeBlock?,
        val bodyCodeBlock: CodeBlock?
    ) : IRNode {
        override fun directChildren() = listOfNotNull(condCodeBlock, bodyCodeBlock)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class UntilLoop(
        val bodyCodeBlock: CodeBlock,
        val condition: IRNode
    ) : IRNode {
        override fun directChildren() = listOf(bodyCodeBlock, condition)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class RepeatLoop(
        val countExpression: IRNode,
        val bodyCodeBlock: CodeBlock
    ) : IRNode {
        override fun directChildren() = listOf(countExpression, bodyCodeBlock)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class GlobalRead(
        val number: Int
    ) : IRNode {
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }

    class GlobalWrite(
        val number: Int,
        val value: IRNode
    ) : IRNode {
        override fun directChildren() = listOf(value)
        override fun accept0(visitor: IRNodeVisitor) = visitor.visit(this)
    }
}
