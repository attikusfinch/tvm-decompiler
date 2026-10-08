package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.api.NormalizationChange
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Token
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingBrace
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis

/** A conservative view of generated FunC, including its native comment/string syntax. */
internal class FuncSource(val text: String) {
    data class Function(val name: Token, val parameters: List<Token>, val result: List<Token>,
        val body: List<Token>, val methodId: Int?, val header: List<Token>) {
        fun change(rule: String) = NormalizationChange(rule, methodId?.toString() ?: when(name.value) {
            "recv_internal" -> "0"; "recv_external" -> "-1"; else -> "unknown"
        }, name.value)
    }
    data class Signature(val name: Token, val parameters: List<Token>, val result: List<Token>, val header: List<Token>)
    val tokens = tokenize(text)
    val signatures = mutableListOf<Signature>()
    val functions = parseFunctions()
    fun code(tokens: List<Token>) = text.substring(tokens.first().start, tokens.last().end)
    fun references(name: String) = tokens.count { it.identifier && it.value == name }
    fun hasComments(start: Int, end: Int) = text.substring(start,end).let { ";;" in it || "{-" in it || "//" in it || "/*" in it }
    fun defines(name: String) = signatures.any { it.name.value == name }

    fun statements(function: Function): List<List<Token>> {
        val result = mutableListOf<List<Token>>()
        var start=0; var parentheses=0; var brackets=0
        for((index,token) in function.body.withIndex()) when(token.value) {
            "(" -> parentheses++
            ")" -> parentheses--
            "[" -> brackets++
            "]" -> brackets--
            "{", "}" -> if(parentheses==0 && brackets==0) start=index+1
            ";" -> if(parentheses==0 && brackets==0) {
                result += function.body.subList(start,index+1)
                start=index+1
            }
        }
        return result
    }

    /** Only explicit primitive bindings/parameters; no type guesses from an identifier. */
    fun bindings(function: Function): List<Pair<Token,String>> = buildList {
        for(arg in callArguments(listOf(Token("(",0,0))+function.parameters+Token(")",0,0),0,function.parameters.size+1)) {
            if(arg.size==2 && arg[0].value in primitiveTypes && arg[1].identifier) add(arg[1] to arg[0].value)
        }
        val body=function.body
        for(index in 1 until body.size) if(body[index].identifier && body[index-1].value in primitiveTypes
            && body.getOrNull(index+1)?.value in setOf("=", ",", ")")) add(body[index] to body[index-1].value)
    }
    fun localType(function: Function,name:String):String? = bindings(function).filter { it.first.value==name }.singleOrNull()?.second
    fun hasLoop(function: Function) = function.body.any { it.value in setOf("while","do","repeat","until") }

    private fun signature(header: List<Token>): Signature? {
        for(index in 1 until header.size-1) {
            if(!header[index].identifier || header[index+1].value!="(" || header[index].value=="method_id") continue
            val close=closingParenthesis(header,index+1) ?: continue
            val tail=header.drop(close+1)
            if(tail.firstOrNull()?.value !in setOf(null,"impure","inline","inline_ref","method_id","asm")) continue
            val result=header.take(index)
            if(result.isEmpty() || result.any { it.value in setOf("=","const","global") }) continue
            return Signature(header[index],header.subList(index+2,close),result,header)
        }
        return null
    }
    private fun parseFunctions():List<Function> = buildList {
        var start=0; var index=0
        while(index<tokens.size) {
            if(tokens[index].value==";") {
                signature(tokens.subList(start,index))?.let { signatures += it }
                start=++index
            } else if(tokens[index].value=="{") {
                val end=closingBrace(tokens,index) ?: return emptyList()
                val header=tokens.subList(start,index)
                signature(header)?.let { sig ->
                    signatures += sig
                    val idIndex=header.indexOfFirst { it.value=="method_id" }
                    val methodId=if(idIndex>=0) closingParenthesis(header,idIndex+1)?.let { close ->
                        header.subList(idIndex+2,close).joinToString("") { it.value }.toIntOrNull()
                    } else null
                    add(Function(sig.name,sig.parameters,sig.result,tokens.subList(index+1,end),methodId,header))
                }
                index=end+1; start=index
            } else index++
        }
    }

    companion object {
        val primitiveTypes = setOf("int","slice","cell","builder","tuple","cont")
        private fun tokenize(source:String):List<Token> = buildList {
            var index=0
            while(index<source.length) {
                val start=index
                when {
                    source[index].isWhitespace() -> index++
                    source[index]=='#' || source.startsWith(";;",index) || source.startsWith("//",index) ->
                        index=source.indexOf('\n',index).takeIf { it>=0 } ?: source.length
                    source.startsWith("{-",index) -> {
                        var depth=1; index+=2
                        while(index<source.length && depth>0) when {
                            source.startsWith("{-",index) -> { depth++; index+=2 }
                            source.startsWith("-}",index) -> { depth--; index+=2 }
                            else -> index++
                        }
                        if(depth!=0) return emptyList()
                    }
                    source.startsWith("/*",index) -> {
                        val end=source.indexOf("*/",index+2)
                        if(end<0) return emptyList()
                        index=end+2
                    }
                    source[index]=='"' -> {
                        index++
                        while(index<source.length && source[index]!='"') {
                            if(source[index]=='\\') index++
                            index++
                        }
                        if(index>=source.length) return emptyList()
                        index++
                        // A FunC slice/hash/string literal suffix is part of the literal.
                        if(index<source.length && source[index].isLetter()) index++
                        add(Token(source.substring(start,index),start,index))
                    }
                    source[index].isLetter() || source[index]=='_' -> {
                        while(index<source.length && (source[index].isLetterOrDigit() || source[index] in "_?$")) index++
                        add(Token(source.substring(start,index),start,index,true))
                    }
                    source[index].isDigit() -> {
                        while(index<source.length && source[index].isLetterOrDigit()) index++
                        add(Token(source.substring(start,index),start,index))
                    }
                    else -> { index++; add(Token(source.substring(start,index),start,index)) }
                }
            }
        }
    }
}
