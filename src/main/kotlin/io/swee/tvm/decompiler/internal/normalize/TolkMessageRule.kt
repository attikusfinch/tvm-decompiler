package io.swee.tvm.decompiler.internal.normalize

import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.callArguments
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.closingParenthesis
import io.swee.tvm.decompiler.internal.normalize.TolkSource.Companion.integer

/** SENDRAWMSG has the same argument order and effects in the native stdlib. */
internal object NativeMessageSendRule : TolkNormalizer.Rule {
    private val flags = listOf(
        1 to "SEND_MODE_PAY_FEES_SEPARATELY",
        2 to "SEND_MODE_IGNORE_ERRORS",
        16 to "SEND_MODE_BOUNCE_ON_ACTION_FAIL",
        32 to "SEND_MODE_DESTROY",
        64 to "SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE",
        128 to "SEND_MODE_CARRY_ALL_BALANCE",
    )

    override fun edits(source: TolkSource): List<TolkNormalizer.Edit> = buildList {
        val helper = "tvmSendRawMessage"
        val native = "sendRawMessage"
        // User declarations or local shadows cannot be treated as compiler primitives.
        if (source.references(native) != 0 || source.definesFunction(helper)
            || source.functions.any { f -> f.parameters.any { it.value == helper } }
            || source.tokens.zipWithNext().any { (a, b) -> a.value in setOf("val", "var", "const") && b.value == helper }) return@buildList
        for (function in source.functions) {
            val tokens = function.body
            for (index in tokens.indices) {
                if (tokens[index].value != helper || tokens.getOrNull(index - 1)?.value == ".") continue
                val close = closingParenthesis(tokens, index + 1) ?: continue
                val arguments = callArguments(tokens, index + 1, close)
                if (arguments.size != 2 || arguments.any { it.isEmpty() }
                    || source.hasComments(tokens[index].start, tokens[close].end)) continue
                add(TolkNormalizer.Edit(tokens[index].start, tokens[index].end, native,
                    function.change("native-message-send")))
                val mode = arguments[1]
                val value = integer(mode)?.takeIf { it.signum() >= 0 && it.bitLength() <= 8 }?.toInt() ?: continue
                // Unknown/reserved bits retain their literal spelling, including invalid modes.
                if (value and 243 != value) continue
                val names = if (value == 0) listOf("SEND_MODE_REGULAR")
                    else flags.filter { value and it.first != 0 }.map { it.second }
                if (names.any { source.references(it) != 0 }) continue
                val replacement = if (names.size == 1) names.single() else names.joinToString(" | ", "(", ")")
                add(TolkNormalizer.Edit(mode.first().start, mode.last().end, replacement,
                    function.change("send-mode-flags")))
            }
        }
    }
}
