import "@acton/emulation/testing"
import "@acton/emulation/network"
import "@acton/testing/expect"
import "@acton/tlb/maybe"
import "@acton/types/message"
import "@acton/types/transaction"

// Decode saved mainnet messages without rebuilding their payload or StateInit.
fun archivedBody(message: TlbMessageRelaxedGeneric): cell {
    var body = message.body;
    return body.loadBool() ? body.loadRef() : beginCell().storeSlice(body).endCell();
}

fun archivedIncoming(tx: TlbTransaction): TlbMessageRelaxedGeneric {
    return tx.messages.load().inMsg.unwrap().load();
}

fun deliverArchived(message: TlbMessageRelaxedGeneric): SendResult {
    return testing.processSingleTraceStep(
        message.info.src as address,
        OutMessage { messageCell: message.toCell() },
    );
}

fun expectVmExit(result: SendResult, expected: int) {
    val description = result.tx.load().description.load();
    assert (description is TlbTransOrd) throw 567;
    val compute = description.computePh;
    assert (compute is TlbTrComputeVm) throw 567;
    expect(compute.data.load().exitCode).toEqual(expected);
}
