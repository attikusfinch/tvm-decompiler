package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

/** Runs after complete FunC emission. The support library and raw stage remain untouched. */
internal object FuncNormalizer {
    data class Result(val main:String,val changes:List<NormalizationChange>)
    data class Edit(val start:Int,val end:Int,val replacement:String,val change:NormalizationChange)
    fun interface Rule { fun edits(source:FuncSource):List<Edit> }
    fun normalize(main:String, catalog:FuncStdlibCatalog = FuncStdlib.catalog):Result {
        val rules = listOf(FuncStdlibNamesRule(catalog),FuncPrimitiveNamesRule,FuncPrefixNamesRule,FuncCursorRule(catalog),FuncCursorMergeRule,
            FuncLocalNamesRule,FuncScalarSyntaxRule,FuncGuardSyntaxRule,FuncSendModeRule)
        var code=main; val changes=mutableListOf<NormalizationChange>()
        for(rule in rules) while(true) {
            val edits=rule.edits(FuncSource(code)).sortedByDescending { it.start }
            if(edits.isEmpty()) break
            check(edits.zipWithNext().all { (right,left) -> left.end<=right.start }) { "Overlapping FunC normalization edits" }
            val previous=code
            for(edit in edits) { code=code.replaceRange(edit.start,edit.end,edit.replacement); changes+=edit.change }
            check(code!=previous) { "FunC normalization made no progress" }
        }
        return Result(code,changes.distinct())
    }
}

private object FuncPrimitiveNamesRule:FuncNormalizer.Rule {
    override fun edits(source:FuncSource):List<FuncNormalizer.Edit> = buildList {
        for((name,native,type,body) in listOf(
            listOf("asm_INMSGPARAM_1","incoming_message_is_bounced","int","1 INMSGPARAM"),
            listOf("asm_INMSGPARAM_2","incoming_message_sender","slice","2 INMSGPARAM"),
        )) {
            if(source.references(native)!=0) continue
            val definition=source.signatures.filter { it.name.value==name }.singleOrNull() ?: continue
            if(definition.parameters.isNotEmpty() || source.hasComments(definition.header.first().start,definition.header.last().end)) continue
            val pattern=Regex("^\\(?$type\\)?\\s+$name\\s*\\(\\s*\\)\\s+impure\\s+asm\\s+\"$body\"$")
            if(!pattern.matches(source.code(definition.header))) continue
            for(token in source.tokens.filter { it.identifier && it.value==name }) add(FuncNormalizer.Edit(token.start,token.end,native,
                NormalizationChange("func-primitive-name","unknown",native)))
        }
    }
}

private object FuncScalarSyntaxRule:FuncNormalizer.Rule {
    override fun edits(source:FuncSource):List<FuncNormalizer.Edit> = buildList {
        for(sig in source.signatures) if(sig.result.size==3 && sig.result.first().value=="(" && sig.result.last().value==")"
            && sig.result[1].value in FuncSource.primitiveTypes && !source.hasComments(sig.result.first().start,sig.result.last().end)) {
            add(FuncNormalizer.Edit(sig.result.first().start,sig.result.last().end,sig.result[1].value,
                NormalizationChange("func-scalar-syntax","unknown",sig.name.value)))
        }
        for(function in source.functions) for(statement in source.statements(function)) {
            if(statement.size<5 || statement.first().value!="return" || statement[1].value!="("
                || closingParenthesis(statement,1)!=statement.lastIndex-1 || source.hasComments(statement.first().start,statement.last().end)) continue
            val values=callArguments(statement,1,statement.lastIndex-1)
            if(values.size!=1 || values.single().isEmpty()) continue
            add(FuncNormalizer.Edit(statement[1].start,statement[statement.lastIndex-1].end,source.code(values.single()),function.change("func-scalar-syntax")))
        }
    }
}
