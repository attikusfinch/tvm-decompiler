// Isolated method 20 message entrypoint. Production recovery has no entrypoint yet.
import "../../CpmmPoolV2/getters"
import "../../CpmmPoolV2/processing"
import "../../CpmmPoolV2/storage"
import "../../CpmmPoolV2/payout-config"

struct PoolProcessingProbe {
    queryId: uint64
    amount: coins
    asset: any_address
    originalForwardFee: coins
    payout: cell
    payment: cell
}

fun poolProbeIsTuple(value: unknown): bool asm "ISTUPLE"
fun poolProbeRejectContext(value: unknown): (any_address, PoolPayoutOptions) asm "5 UNTUPLE"
@method_id(90046)
fun probeStorage():cell {return contract.getData();}

fun onInternalMessage(in: InMessage) {
    val request=PoolProcessingProbe.fromSlice(in.body);
    val storage=PoolStorage.fromCell(contract.getData(),{assertEndAfterReading:false});
    try {
        processPoolPayment(storage,in.senderAddress as any_address,request.queryId,request.payout,
            request.payment,request.asset,request.amount,request.originalForwardFee);
    } catch(code,value) {
        var result=beginCell().storeUint(0xdeadbeef,32).storeInt(code,32);
        if(poolProbeIsTuple(value)) {
            val (excesses,options)=poolProbeRejectContext(value);
            result.storeBool(true).storeSlice(excesses as slice).storeSlice(options.destination as slice)
                .storeCoins(options.extraGas).storeDict(options.payload).storeBool(options.wrapPayload);
        } else {result.storeBool(false);}
        contract.setData(result.endCell());
    }
}
