// decompiled by @fiscaldev
import "../../../libraries/messages/opcodes"
import "@stdlib/gas-payments"

// V1 has no minimum processing fee; V2 adds max(gasFee, 10_000_000).
@inline_ref
fun requestPoolWalletAddressV1(resolver: any_address, queryId: uint64) {
    val owner = contract.getAddress();
    val amount = (calculateForwardFee(0, 364, 1) + calculateGasFee(0, 25000)) +
        calculateForwardFee(0, 1, 364);
    val message = beginCell()
        .storeUint(0x10, 6)
        .storeSlice(resolver as slice)
        .storeCoins(amount)
        .storeUint(OP_PROVIDE_WALLET_ADDRESS, 139)
        .storeUint(queryId, 64)
        .storeSlice(owner as slice)
        .storeBool(false)
        .endCell();
    sendRawMessage(message, SEND_MODE_PAY_FEES_SEPARATELY);
}
