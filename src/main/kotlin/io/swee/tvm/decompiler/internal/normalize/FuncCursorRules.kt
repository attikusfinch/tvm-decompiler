package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

internal object FuncCursorRule:FuncNormalizer.Rule {
    private data class Load(val result:String,val arity:Int,val reverse:Boolean=false,val helper:String?=null)
    private val loads=mapOf(
        "load_uint" to Load("int",1), "load_int" to Load("int",1), "load_bits" to Load("slice",1),
        "load_grams" to Load("int",0), "load_ref" to Load("cell",0),
        "load_std_addr" to Load("slice",0,true,"load_std_addr_cursor"),
        "load_opt_std_addr" to Load("slice",0,true,"load_opt_std_addr_cursor"),
    )
    private fun helper(name:String)= "(slice, slice) $name(slice body) asm(-> 1 0) \"${if(name=="load_std_addr_cursor") "LDSTDADDR" else "LDOPTSTDADDR"}\";\n"
    override fun edits(source:FuncSource):List<FuncNormalizer.Edit> = buildList {
        val needed=linkedSetOf<String>(); val occupied=source.tokens.filter { it.identifier }.map { it.value }.toMutableSet()
        for(function in source.functions) for(statement in source.statements(function)) {
            if(statement.firstOrNull()?.value!="(") continue
            val close=closingParenthesis(statement,0) ?: continue
            if(statement.getOrNull(close+1)?.value!="=" || statement.last().value!=";") continue
            val binding=callArguments(statement,0,close)
            if(binding.size!=2) continue
            val expression=statement.subList(close+2,statement.lastIndex)
            val open=expression.indices.lastOrNull { expression[it].value=="(" && closingParenthesis(expression,it)==expression.lastIndex } ?: continue
            if(open<3 || expression[open-2].value!=".") continue
            val method=expression[open-1].value
            val load=loads[method] ?: continue
            if(source.defines(method) || source.defines("~$method")) continue
            val args=callArguments(expression,open,expression.lastIndex)
            if(args.size!=load.arity) continue
            val receiver=expression.take(open-2)
            val rest=binding[if(load.reverse) 1 else 0]; val value=binding[if(load.reverse) 0 else 1]
            fun valid(tokens:List<Token>,type:String)=tokens.map { it.value }==listOf("_") ||
                tokens.size==2 && tokens[0].value==type && tokens[1].identifier
            if(!valid(rest,"slice") || !valid(value,load.result) || rest.singleOrNull()?.value=="_" && value.singleOrNull()?.value=="_") continue
            val names=(binding.flatMap { it }.filter { it.identifier && it.value !in FuncSource.primitiveTypes && it.value!="_" }.map { it.value }).toSet()
            if(expression.any { it.identifier && it.value in names } || source.hasComments(statement.first().start,statement.last().end)) continue
            if(names.any { name -> source.bindings(function).count { it.first.value==name }!=1 }) continue
            if(load.helper!=null && source.references(load.helper)!=0 &&
                source.signatures.none { source.code(it.header)+";\n"==helper(load.helper) }) continue
            val cursor=if(rest.size==2) rest[1].value else generateSequence(0) { it+1 }.map { "cursor_"+it.toString(16).padStart(2,'0') }.first { occupied.add(it) }
            val name=load.helper ?: method
            val indentation=source.text.substring(source.text.lastIndexOf('\n',statement.first().start)+1,statement.first().start)
            if(indentation.any { !it.isWhitespace() }) continue
            val target=if(value.size==2) "${value[0].value} ${value[1].value} = " else ""
            val replacement="slice $cursor = ${source.code(receiver)};\n${indentation}$target$cursor~$name(${args.joinToString(", ") { source.code(it) }});"
            add(FuncNormalizer.Edit(statement.first().start,statement.last().end,replacement,function.change("func-cursor-load")))
            load.helper?.let { needed+=it }
        }
        val helpers=needed.filter { source.references(it)==0 }
        if(helpers.isNotEmpty()) add(FuncNormalizer.Edit(0,0,helpers.joinToString("") { helper(it) }+"\n",
            io.swee.tvm.decompiler.api.NormalizationChange("func-cursor-helper","unknown","storage_cursor")))
    }
}

internal object FuncCursorMergeRule:FuncNormalizer.Rule {
    override fun edits(source:FuncSource):List<FuncNormalizer.Edit> = buildList {
        for(function in source.functions) {
            // No lexical last-use proof across a back edge or exception handler.
            if(source.hasLoop(function) || function.body.any { it.value in setOf("try","catch") }) continue
            val statements=source.statements(function)
            for((index,statement) in statements.withIndex()) {
                if(statement.size!=5 || statement[0].value!="slice" || !statement[1].identifier
                    || statement[2].value!="=" || !statement[3].identifier || statement[4].value!=";") continue
                val destination=statement[1]; val previous=statement[3]
                if(destination.value==previous.value || source.localType(function,previous.value)!="slice"
                    || source.localType(function,destination.value)!="slice"
                    || source.hasComments(statement.first().start,statement.last().end)) continue
                val next=statements.getOrNull(index+1) ?: continue
                if(next.windowed(2).none { it[0].value==destination.value && it[1].value=="~" }) continue
                val tail=function.body.filter { it.start>=statement.last().end }
                if(tail.any { it.identifier && it.value==previous.value }) continue
                if(function.body.any { it.start<statement.first().start && it.identifier && it.value==destination.value }) continue
                val lineStart=source.text.lastIndexOf('\n',statement.first().start)+1
                val lineEnd=source.text.indexOf('\n',statement.last().end).takeIf { it>=0 } ?: source.text.length
                val wholeLine=source.text.substring(lineStart,statement.first().start).all { it.isWhitespace() }
                    && source.text.substring(statement.last().end,lineEnd).all { it.isWhitespace() }
                add(FuncNormalizer.Edit(if(wholeLine) lineStart else statement.first().start,
                    if(wholeLine) (lineEnd+1).coerceAtMost(source.text.length) else statement.last().end,"",function.change("func-cursor-merge")))
                for(token in tail.filter { it.identifier && it.value==destination.value })
                    add(FuncNormalizer.Edit(token.start,token.end,previous.value,function.change("func-cursor-merge")))
                // Reparse after each merge to avoid intersecting rename ranges.
                break
            }
        }
    }
}
