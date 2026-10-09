import "../pool-v2/getters"
// decompiled by @fiscaldev
// Byte-identical readable recovery of the archived mainnet CPMM Pool V1.
// Compiler/BOC/behavior evidence is recorded by the reconstruction gate.
import "handlers"
import "../pool-v2/messages"
import "../pool-v2/storage"
import "../pool-v2/transaction-context"

fun onInternalMessage(in: InMessage) {
    val message = PoolMessage.fromSlice(
        in.body,
        { assertEndAfterReading: false, throwIfOpcodeDoesNotMatch: 65535 },
    );
    val storage = PoolStorage.fromCell(contract.getData(), { assertEndAfterReading: false });
    handlePoolMessage(storage, message, PoolInboundContext {});
}
