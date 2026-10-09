// Independent seven-argument hook, built from source for dynamic C3 ABI tests.
fun onInternalMessage(_: InMessage) {}

@method_id(83527)
fun amountHook(
    logicalTime: int,
    timestamp: int,
    amount: int,
    destination: slice,
    body: cell,
    argument: int,
): int {
    assert (logicalTime > 0) throw 701;
    assert (timestamp == 1700000000) throw 702;
    assert (destination.remainingBitsCount() == 267) throw 703;
    assert (body.beginParse().isEmpty()) throw 704;
    return amount + argument;
}
