// decompiled by @fiscaldev
import "compat"
import "getters"
import "messages"
import "protocols"
import "queues"

fun onExternalMessage(body: slice): void {
    var signedPayload = body;
    var signature = signedPayload.loadBits(512);
    var (afterRequestSeqno, requestSeqno) = loadUint32(signedPayload);
    var (cursor22, _) = loadUint32(afterRequestSeqno);
    var dataSlice = contract.getData().beginParse();
    var (afterVersion, version) = loadUint8(dataSlice);
    var validVersion = ((version == 1) as int);
    assert (validVersion != 0) throw 104;
    var (afterWalletIdValue, walletIdValue) = loadUint32(afterVersion);
    var (afterStoredSeqno, storedSeqno) = loadUint32(afterWalletIdValue);
    var (afterPublicKey, publicKey) = loadUint256(afterStoredSeqno);
    var tail2 = afterPublicKey;
    var dictionaryState = tail2.loadRef();
    var dataSlice2 = dictionaryState.beginParse();
    var tail3 = tail2;
    var hookCode = tail3.loadRef();
    requireEndOfSlice(tail3);
    var (afterPrograms, programs) = loadMaybeDictionary(dataSlice2);
    var (afterAmounts, amounts) = loadMaybeDictionary(afterPrograms);
    var (afterRetries, retries) = loadMaybeDictionary(afterAmounts);
    var (afterAcknowledgements, acknowledgements) = loadMaybeDictionary(afterRetries);
    requireEndOfSlice(afterAcknowledgements);
    var validSequence = ((requestSeqno == storedSeqno) as int);
    assert (validSequence != 0) throw 102;
    var validSignature = verifyArchivedSignature(
        hashArchivedBuilder(beginCell().storeSlice(signedPayload)),
        signature,
        publicKey,
    );
    assert (validSignature != 0) throw 555;
    acceptExternalMessage();
    var nextSeqno = (storedSeqno + 1);
    var (afterBatchCount, batchCount) = loadUint32(cursor22);
    var (zero, cursor212, saveRetry) = loadRequestFlag(afterBatchCount);
    var (afterHookArgument, hookArgument) = loadUint16(cursor212);
    var (afterSendMode, sendMode) = loadUint8(afterHookArgument);
    var (cursor215, _) = loadUint32(afterSendMode);
    var (afterReceiptTag, receiptTag) = loadUint32(cursor215);
    var tail4 = afterReceiptTag.preloadRef().beginParse();
    var address = (tail4.loadAddress() as slice);
    var (afterRequestedTon, requestedTon) = loadCoinsField(tail4);
    var (afterTradeAmount, tradeAmount) = loadCoinsField(afterRequestedTon);
    var (afterBodyByReference, bodyByReference) = loadUint1(afterTradeAmount);
    var hasReferencedBody = ((bodyByReference == 1) as int);
    assert (hasReferencedBody != 0) throw 555;
    var tail5 = afterBodyByReference;
    var outgoingBody = tail5.loadRef();
    var (afterAmountOverrides, amountOverrides) = loadMaybeDictionary(tail5);
    var (afterQueryId, queryId) = loadUint64(afterAmountOverrides);
    var program = preloadMaybeDictionary(afterQueryId);
    var programAbsent = isVmNull((program as unknown));
    var carriesAllBalance = ((sendMode == 128) as int);
    var carriesOrDestroys = 0;
    if (carriesAllBalance != 0) {
        carriesOrDestroys = -1;
    } else {
        var destroysAccount = ((sendMode == 160) as int);
        carriesOrDestroys = ((destroysAccount != 0) as int);
    }
    var drainsWithoutAmount: int;
    if (carriesOrDestroys != 0) {
        var zeroRequestedTon = ((requestedTon == 0) as int);
        drainsWithoutAmount = ((zeroRequestedTon != 0) as int);
    } else {
        drainsWithoutAmount = zero;
    }
    var drainsWithoutProgram: int;
    if (drainsWithoutAmount != 0) {
        drainsWithoutProgram = ((programAbsent != 0) as int);
    } else {
        drainsWithoutProgram = zero;
    }
    var needsReceipt = (~drainsWithoutProgram);
    var retryRequested = ((saveRetry == 1) as int);
    var shouldSaveRetry: int;
    if (retryRequested != 0) {
        var programPresent = (~programAbsent);
        shouldSaveRetry = ((programPresent != 0) as int);
    } else {
        shouldSaveRetry = zero;
    }
    var nextRetries: cell;
    if (shouldSaveRetry != 0) {
        var builder = beginCell();
        nextRetries = setUnsignedBuilder(retries, 64, queryId, builder);
        (
            amounts,
            nextRetries,
            acknowledgements,
            nextSeqno,
            walletIdValue,
            programs,
            publicKey,
            hookCode,
            batchCount,
            zero,
            needsReceipt,
            hookArgument,
            sendMode,
            receiptTag,
            address,
            requestedTon,
            tradeAmount,
            outgoingBody,
            amountOverrides,
            queryId,
            program,
            programAbsent,
        ) = stage22(
            (
                amounts,
                nextRetries,
                acknowledgements,
                nextSeqno,
                walletIdValue,
                programs,
                publicKey,
                hookCode,
                batchCount,
                zero,
                needsReceipt,
                hookArgument,
                sendMode,
                receiptTag,
                address,
                requestedTon,
                tradeAmount,
                outgoingBody,
                amountOverrides,
                queryId,
                program,
                programAbsent,
            ),
        );
    } else {
        nextRetries = retries;
    }
    var nextPrograms: cell;
    var nextAmounts: cell;
    if (programAbsent != 0) {
        (
            nextAmounts,
            nextRetries,
            acknowledgements,
            nextSeqno,
            walletIdValue,
            nextPrograms,
            publicKey,
            hookCode,
            batchCount,
            zero,
            needsReceipt,
            hookArgument,
            sendMode,
            receiptTag,
            address,
            requestedTon,
            programAbsent,
            outgoingBody,
            amountOverrides,
            queryId,
        ) = releaseNoProgram(
            (
                amounts,
                nextRetries,
                acknowledgements,
                nextSeqno,
                walletIdValue,
                programs,
                publicKey,
                hookCode,
                batchCount,
                zero,
                needsReceipt,
                hookArgument,
                sendMode,
                receiptTag,
                address,
                requestedTon,
                tradeAmount,
                outgoingBody,
                amountOverrides,
                queryId,
                program,
                programAbsent,
            ),
        );
    } else {
        var dataSlice3 = program.beginParse();
        var D22 = setUnsignedSlice(programs, 64, queryId, dataSlice3);
        var result13 = ((tradeAmount > 0) as int);

        if (result13 != 0) {
            nextAmounts = setUnsignedBuilder(
                amounts,
                64,
                queryId,
                storeCoinsField(beginCell(), tradeAmount),
            );
            (
                nextAmounts,
                nextRetries,
                acknowledgements,
                nextSeqno,
                walletIdValue,
                programAbsent,
                publicKey,
                hookCode,
                batchCount,
                zero,
                needsReceipt,
                hookArgument,
                sendMode,
                receiptTag,
                address,
                requestedTon,
                D22,
                outgoingBody,
                amountOverrides,
                queryId,
            ) = feeState(
                (
                    nextAmounts,
                    nextRetries,
                    acknowledgements,
                    nextSeqno,
                    walletIdValue,
                    programAbsent,
                    publicKey,
                    hookCode,
                    batchCount,
                    zero,
                    needsReceipt,
                    hookArgument,
                    sendMode,
                    receiptTag,
                    address,
                    requestedTon,
                    D22,
                    outgoingBody,
                    amountOverrides,
                    queryId,
                ),
            );
        } else {
            nextAmounts = amounts;
        }
        nextPrograms = D22;
    }
    var nextAcknowledgements: cell;
    if (needsReceipt != 0) {
        var ackWidth: int;
        var builder2: builder;
        (queryId, ackWidth, builder2) = ackValue(queryId);
        nextAcknowledgements = setWithWidth(acknowledgements, queryId, ackWidth, builder2);
        (
            nextAmounts,
            nextRetries,
            nextAcknowledgements,
            nextSeqno,
            walletIdValue,
            nextPrograms,
            publicKey,
            hookCode,
            batchCount,
            zero,
            needsReceipt,
            hookArgument,
            sendMode,
            receiptTag,
            address,
            requestedTon,
            programAbsent,
            outgoingBody,
            amountOverrides,
            queryId,
        ) = ackState(
            (
                nextAmounts,
                nextRetries,
                nextAcknowledgements,
                nextSeqno,
                walletIdValue,
                nextPrograms,
                publicKey,
                hookCode,
                batchCount,
                zero,
                needsReceipt,
                hookArgument,
                sendMode,
                receiptTag,
                address,
                requestedTon,
                programAbsent,
                outgoingBody,
                amountOverrides,
                queryId,
            ),
        );
    } else {
        nextAcknowledgements = acknowledgements;
    }
    var result14 = ((batchCount > 0) as int);
    var batchSent = zero;
    if (result14 != 0) {
        var inmsg_8 = ownAddressSlice();
        var batchIndex = batchSent;
        while ((batchIndex < batchCount)) {
            var result15 = (batchIndex + 1);
            var b2 = begin_62_().storeAddress((inmsg_8 as address));
            var c = b2.storeUint(0, 111).endCell();
            sendArchivedMessage(c, 3);
            batchIndex = result15;
        }
        batchSent = batchIndex;
    } else {}
    if (isVmNull((previousBlockContext() as unknown)) != 0) {
        var b22 = storeCoinsField(begin_62_().storeAddress((address as address)), requestedTon);
        sendArchivedMessage(b22.storeUint(1, 107).storeRef(outgoingBody).endCell(), sendMode);
        if (needsReceipt != 0) {
            var b = begin_10937847();
            var b23 = b.storeUint(queryId, 64);
            var c2 = b23.storeUint(receiptTag, 32).endCell();
            var constslice = "2_".hexToSlice();
            var b24 = begin_C().storeSlice(constslice);
            var c3 = b24.storeUint(1, 98).storeRef(c2).endCell();
            sendArchivedMessage(c3, 0);
        } else {}
        var dataSlice4 = contract.getData().beginParse();
        var (afterSavedVersion, savedVersion) = loadUint8(dataSlice4);
        var result16 = ((savedVersion == 1) as int);
        assert (result16 != 0) throw 104;
        var tail6 = skipBitsField(afterSavedVersion, 320);
        tail6.loadRef();
        var tail7 = tail6;
        var retainedHook = tail7.loadRef();
        requireEndOfSlice(tail7);
        var c4 = storeNullableReference(
            storeNullableReference(
                storeNullableReference(
                    storeNullableReference(beginCell(), nextPrograms),
                    nextAmounts,
                ),
                nextRetries,
            ),
            nextAcknowledgements,
        ).endCell();
        var b3 = begin_01();
        var b25 = b3.storeUint(walletIdValue, 32);
        var b26 = b25.storeUint(nextSeqno, 32);
        contract.setData(
            b26.storeUint(publicKey, 256).storeRef(c4).storeRef(retainedHook).endCell(),
        );
        return;
    }
    var inmsg_5 = transactionLogicalTime();
    var inmsg_3 = currentUnixTime();
    var outgoingLogicalTime = ((inmsg_5 + 1) + batchSent);
    var result18 = (outgoingLogicalTime & 16777215);
    var result19 = (inmsg_3 & 15);
    var overrideKey = (result18 + (result19 << 24));
    var (amountOverride, status) = findUnsignedEntry(amountOverrides, 28, overrideKey);
    var sendTon: int;
    if (status != 0) {
        sendTon = amountOverride.preloadUint(64);
    } else if ((hookArgument > 0)) {
        sendTon = (invokeAmountHook(
            hookCode,
            (outgoingLogicalTime as unknown),
            (inmsg_3 as unknown),
            (requestedTon as unknown),
            (address as unknown),
            (outgoingBody as unknown),
            (hookArgument as unknown),
        ) as int);
        (
            nextAmounts,
            nextRetries,
            nextAcknowledgements,
            nextSeqno,
            walletIdValue,
            nextPrograms,
            publicKey,
            sendTon,
            queryId,
            programAbsent,
            needsReceipt,
            outgoingBody,
            sendMode,
            receiptTag,
            address,
        ) = hookState(
            (
                nextAmounts,
                nextRetries,
                nextAcknowledgements,
                nextSeqno,
                walletIdValue,
                nextPrograms,
                publicKey,
                sendTon,
                queryId,
                programAbsent,
                needsReceipt,
                outgoingBody,
                sendMode,
                receiptTag,
                address,
            ),
        );
    } else {
        (
            nextAmounts,
            nextRetries,
            nextAcknowledgements,
            nextSeqno,
            walletIdValue,
            nextPrograms,
            publicKey,
            sendTon,
            queryId,
            programAbsent,
            needsReceipt,
            outgoingBody,
            sendMode,
            receiptTag,
            address,
        ) = releaseNoHook(
            (
                nextAmounts,
                nextRetries,
                nextAcknowledgements,
                nextSeqno,
                walletIdValue,
                nextPrograms,
                publicKey,
                hookCode,
                queryId,
                inmsg_3,
                needsReceipt,
                hookArgument,
                sendMode,
                receiptTag,
                address,
                requestedTon,
                programAbsent,
                outgoingBody,
                outgoingLogicalTime,
            ),
        );
    }

    var b27 = storeCoinsField(begin_62_().storeAddress((address as address)), sendTon);
    sendArchivedMessage(b27.storeUint(1, 107).storeRef(outgoingBody).endCell(), sendMode);
    if (needsReceipt != 0) {
        var b4 = begin_10937847();
        var b28 = b4.storeUint(queryId, 64);
        var c5 = b28.storeUint(receiptTag, 32).endCell();
        var constslice2 = "2_".hexToSlice();
        var b29 = begin_C().storeSlice(constslice2);
        var c6 = b29.storeUint(1, 98).storeRef(c5).endCell();
        sendArchivedMessage(c6, 0);
    } else {}
    var finalPrograms = nextPrograms;
    var finalAmounts = nextAmounts;
    if (programAbsent != 0) {
        var constValue = (null as unknown as cell);
        var constValue2 = (null as unknown as cell);
        finalPrograms = constValue;
        finalAmounts = constValue2;
    }
    var dataSlice5 = contract.getData().beginParse();
    var (afterSavedVersion2, savedVersion2) = loadUint8(dataSlice5);
    var result21 = ((savedVersion2 == 1) as int);
    assert (result21 != 0) throw 104;
    var tail8 = skipBitsField(afterSavedVersion2, 320);
    tail8.loadRef();
    var tail9 = tail8;
    var retainedHook2 = tail9.loadRef();
    requireEndOfSlice(tail9);
    var c7 = storeNullableReference(
        storeNullableReference(
            storeNullableReference(
                storeNullableReference(beginCell(), finalPrograms),
                finalAmounts,
            ),
            nextRetries,
        ),
        nextAcknowledgements,
    ).endCell();
    var b5 = begin_01();
    var b210 = b5.storeUint(walletIdValue, 32);
    var b211 = b210.storeUint(nextSeqno, 32);
    contract.setData(b211.storeUint(publicKey, 256).storeRef(c7).storeRef(retainedHook2).endCell());
}
