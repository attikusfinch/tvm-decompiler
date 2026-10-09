// decompiled by @fiscaldev
import "compat"
import "getters"
import "messages"
import "protocols"
import "queues"

fun onInternalMessage(balance: int, messageValue: int, message: cell, body: slice): void {
    if (body.isEmpty()) {
        return;
    }
    var dataSlice = message.beginParse();
    var (afterMessageFlags, messageFlags) = loadUint4(dataSlice);
    if ((messageFlags & 1) != 0) {
        var (result, result2) = bouncedQuery(body);
        if (result2 != 0) {
            var dataSlice2 = contract.getData().beginParse();
            var (afterVersionBounce, versionBounce) = loadUint8(dataSlice2);
            val result3 = ((versionBounce == 1) as int);
            assert (result3 != 0) throw 104;
            var (afterWalletIdBounce, walletIdBounce) = loadUint32(afterVersionBounce);
            var (afterSeqnoBounce, seqnoBounce) = loadUint32(afterWalletIdBounce);
            var (afterKeyBounce, keyBounce) = loadUint256(afterSeqnoBounce);
            var tail = afterKeyBounce;
            val refCell = tail.loadRef();
            var dataSlice3 = refCell.beginParse();
            var tail2 = tail;
            tail2.loadRef();
            requireEndOfSlice(tail2);
            var (afterProgramsBounce, programsBounce) = loadMaybeDictionary(dataSlice3);
            var (afterAmountsBounce, amountsBounce) = loadMaybeDictionary(afterProgramsBounce);
            var (afterRetriesBounce, retriesBounce) = loadMaybeDictionary(afterAmountsBounce);
            var (afterAcksBounce, acksBounce) = loadMaybeDictionary(afterRetriesBounce);
            requireEndOfSlice(afterAcksBounce);
            var (result4, result5) = acknowledgeQuery(acksBounce, result);
            if (result5 != 0) {
                var dataSlice4 = contract.getData().beginParse();
                var (afterSavedVersionBounce, savedVersionBounce) = loadUint8(dataSlice4);
                val result6 = ((savedVersionBounce == 1) as int);
                assert (result6 != 0) throw 104;
                var tail3 = skipBitsField(afterSavedVersionBounce, 320);
                tail3.loadRef();
                var tail4 = tail3;
                val refCell2 = tail4.loadRef();
                requireEndOfSlice(tail4);
                val c = storeNullableReference(
                    storeNullableReference(
                        storeNullableReference(
                            storeNullableReference(beginCell(), programsBounce),
                            amountsBounce,
                        ),
                        retriesBounce,
                    ),
                    result4,
                ).endCell();
                var b = begin_01();
                var b2 = b.storeUint(walletIdBounce, 32);
                var b22 = b2.storeUint(seqnoBounce, 32);
                contract.setData(
                    b22.storeUint(keyBounce, 256).storeRef(c).storeRef(refCell2).endCell(),
                );
            } else {
                discardBounceState(
                    retriesBounce,
                    walletIdBounce,
                    seqnoBounce,
                    keyBounce,
                    programsBounce,
                    amountsBounce,
                    result4,
                );
            }
            completeBounce();
            return;
        }
        return;
    }
    var (afterOpcode, opcode) = loadUint32(body);
    var (afterQueryId, queryId) = loadUint64(afterOpcode);
    var dataSlice5 = contract.getData().beginParse();
    var (afterVersion, version) = loadUint8(dataSlice5);
    val result7 = ((version == 1) as int);
    assert (result7 != 0) throw 104;
    var (afterWalletIdValue, walletIdValue) = loadUint32(afterVersion);
    var (afterStoredSeqno, storedSeqno) = loadUint32(afterWalletIdValue);
    var (afterPublicKey, publicKey) = loadUint256(afterStoredSeqno);
    var tail5 = afterPublicKey;
    val refCell3 = tail5.loadRef();
    var dataSlice6 = refCell3.beginParse();
    var tail6 = tail5;
    tail6.loadRef();
    requireEndOfSlice(tail6);
    var (afterPrograms, programs) = loadMaybeDictionary(dataSlice6);
    if ((opcode == 16843266)) {
        var (afterAmountsRetry, amountsRetry) = loadMaybeDictionary(afterPrograms);
        var (afterRetriesRetry, retriesRetry) = loadMaybeDictionary(afterAmountsRetry);
        var (afterAcksRetry, acksRetry) = loadMaybeDictionary(afterRetriesRetry);
        requireEndOfSlice(afterAcksRetry);
        val address = (afterMessageFlags.loadAddress() as slice);
        if (
            !(address.bitsEqual(
                "9FF1C20FAD211DB1A2CF8EB1F9ADFE00FDBAE1DA1D95045A3F286262FC347B25835_".hexToSlice(),
            ))
        ) {
            throw 555;
        }
        var (D22, retryEntry, status) = removeUnsignedEntry(retriesRetry, 64, queryId);
        if (!(status != 0)) {
            throw 103;
        }
        val c2 = retryEntry.preloadRef();
        sendArchivedMessage(c2, 3);
        var dataSlice7 = contract.getData().beginParse();
        var (afterSavedVersionRetry, savedVersionRetry) = loadUint8(dataSlice7);
        val result8 = ((savedVersionRetry == 1) as int);
        assert (result8 != 0) throw 104;
        var tail7 = skipBitsField(afterSavedVersionRetry, 320);
        tail7.loadRef();
        var tail8 = tail7;
        val refCell4 = tail8.loadRef();
        requireEndOfSlice(tail8);
        val c3 = storeNullableReference(
            storeNullableReference(
                storeNullableReference(storeNullableReference(beginCell(), programs), amountsRetry),
                D22,
            ),
            acksRetry,
        ).endCell();
        var b3 = begin_01();
        var b23 = b3.storeUint(walletIdValue, 32);
        var b24 = b23.storeUint(storedSeqno, 32);
        contract.setData(b24.storeUint(publicKey, 256).storeRef(c3).storeRef(refCell4).endCell());
        return;
    }
    var (recipeEntry, status2) = findUnsignedEntry(programs, 64, queryId);
    if (!(status2 != 0)) {
        var (afterAmountsAck, amountsAck) = loadMaybeDictionary(afterPrograms);
        var (afterRetriesAck, retriesAck) = loadMaybeDictionary(afterAmountsAck);
        var (afterAcksAck, acksAck) = loadMaybeDictionary(afterRetriesAck);
        requireEndOfSlice(afterAcksAck);
        var (result9, result10) = acknowledgeQuery(acksAck, queryId);
        if (result10 != 0) {
            var dataSlice8 = contract.getData().beginParse();
            var (afterSavedVersionAck, savedVersionAck) = loadUint8(dataSlice8);
            val result11 = ((savedVersionAck == 1) as int);
            assert (result11 != 0) throw 104;
            var tail9 = skipBitsField(afterSavedVersionAck, 320);
            tail9.loadRef();
            var tail10 = tail9;
            val refCell5 = tail10.loadRef();
            requireEndOfSlice(tail10);
            val c4 = storeNullableReference(
                storeNullableReference(
                    storeNullableReference(
                        storeNullableReference(beginCell(), programs),
                        amountsAck,
                    ),
                    retriesAck,
                ),
                result9,
            ).endCell();
            var b4 = begin_01();
            var b25 = b4.storeUint(walletIdValue, 32);
            var b26 = b25.storeUint(storedSeqno, 32);
            contract.setData(
                b26.storeUint(publicKey, 256).storeRef(c4).storeRef(refCell5).endCell(),
            );
            return;
        }
        return;
    }
    var (afterAmounts, amounts) = loadMaybeDictionary(afterPrograms);
    var (afterRetries, retries) = loadMaybeDictionary(afterAmounts);
    var (afterAcknowledgements, acknowledgements) = loadMaybeDictionary(afterRetries);
    requireEndOfSlice(afterAcknowledgements);
    var (afterProtocolKind, protocolKind) = loadUint4(recipeEntry);
    var nextRetries: cell;
    var nextAmounts: cell;
    var nextPrograms: cell;
    if (protocolKind != 0) {
        if (protocolKind == 1) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol1(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 2) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol2(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 3) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol3(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 4) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol4(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 5) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol5(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 10) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol10(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 6) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol6(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 7) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol7(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 8) {
            (nextPrograms, nextAmounts, nextRetries) = processProtocol8(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == 9) {
            var (result49, result50, result51) = processProtocol9(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
            nextRetries = result51;
            nextAmounts = result50;
            nextPrograms = result49;
        } else if (protocolKind == 11) {
            var (result53, result54, result55) = processProtocol11(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
            nextRetries = result55;
            nextAmounts = result54;
            nextPrograms = result53;
        } else if (protocolKind == 12) {
            var (result57, result58, result59) = processProtocol12(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
            nextRetries = result59;
            nextAmounts = result58;
            nextPrograms = result57;
        } else {
            val result60 = ((protocolKind == 13) as int);

            if (result60 != 0) {
                var (result61, result62, result63) = processProtocol13(
                    messageValue,
                    opcode,
                    queryId,
                    afterProtocolKind,
                    programs,
                    amounts,
                    retries,
                    afterQueryId,
                );
                nextRetries = result63;
                nextAmounts = result62;
                nextPrograms = result61;
                (
                    acknowledgements,
                    nextPrograms,
                    nextAmounts,
                    queryId,
                    nextRetries,
                    walletIdValue,
                    storedSeqno,
                    publicKey,
                ) = stage8(
                    acknowledgements,
                    nextPrograms,
                    nextAmounts,
                    queryId,
                    nextRetries,
                    walletIdValue,
                    storedSeqno,
                    publicKey,
                );
            } else {
                (
                    acknowledgements,
                    nextPrograms,
                    nextAmounts,
                    queryId,
                    nextRetries,
                    walletIdValue,
                    storedSeqno,
                    publicKey,
                ) = fallbackDispatch(
                    acknowledgements,
                    messageValue,
                    opcode,
                    queryId,
                    afterQueryId,
                    walletIdValue,
                    storedSeqno,
                    publicKey,
                    programs,
                    amounts,
                    retries,
                    afterProtocolKind,
                );
            }
        }
    } else {
        (nextPrograms, nextAmounts, nextRetries) = processProtocol0(
            messageValue,
            opcode,
            queryId,
            afterProtocolKind,
            programs,
            amounts,
            retries,
            afterQueryId,
        );
    }
    val result67 = advanceAcknowledgement(acknowledgements, nextPrograms, queryId);
    var dataSlice9 = contract.getData().beginParse();
    var (afterSavedVersionTrade, savedVersionTrade) = loadUint8(dataSlice9);
    val result68 = ((savedVersionTrade == 1) as int);
    assert (result68 != 0) throw 104;
    var tail11 = skipBitsField(afterSavedVersionTrade, 320);
    tail11.loadRef();
    var tail12 = tail11;
    val refCell6 = tail12.loadRef();
    requireEndOfSlice(tail12);
    val c5 = storeNullableReference(
        storeNullableReference(
            storeNullableReference(storeNullableReference(beginCell(), nextPrograms), nextAmounts),
            nextRetries,
        ),
        result67,
    ).endCell();
    var b5 = begin_01();
    var b27 = b5.storeUint(walletIdValue, 32);
    var b28 = b27.storeUint(storedSeqno, 32);
    contract.setData(b28.storeUint(publicKey, 256).storeRef(c5).storeRef(refCell6).endCell());
}
