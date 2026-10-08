// Complete readable Pool V2 candidate. Exact byte/gas acceptance is pending;
// use main.tolk only after the full reconstruction gate succeeds.
import "getters"
import "handlers"
import "messages"
import "storage"
import "transaction-context"

fun onInternalMessage(in:InMessage) {
    val message=PoolMessage.fromSlice(in.body,{assertEndAfterReading:false,throwIfOpcodeDoesNotMatch:65535});
    val storage=PoolStorage.fromCell(contract.getData(),{assertEndAfterReading:false});
    handlePoolMessage(storage,message,PoolInboundContext{});
}
