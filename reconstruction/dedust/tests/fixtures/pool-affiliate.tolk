import "../../CpmmPoolV2/affiliate-deployment"

fun onInternalMessage(in: InMessage) {}

@method_id(90046)
fun deployment(kind: int, identity: uint256, fee: uint16): (int, cell, cell) {
    val result=affiliateDeployment(kind,identity,fee);
    val state=result.stateInit;
    assert(state is ContractState) throw 567;
    assert(result.toShard == null) throw 567;
    return(result.workchain,state.code,state.data);
}
