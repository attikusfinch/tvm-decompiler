// decompiled by @fiscaldev
import "errors"
import "@stdlib/gas-payments"
import "../../../libraries/messages/opcodes"
import "compat"
import "getters"
import "messages"
import "protocols"
import "queues"

fun onExternalMessage(body: slice): void {
    var signedPayload = body;
    var signature = signedPayload.loadBits(512);
    var afterRequestSeqno = signedPayload;
    var requestSeqno = afterRequestSeqno.loadUint(32);
    var (cursor22, _) = loadUint32(afterRequestSeqno);
    var dataSlice = contract.getData().beginParse();
    var afterVersion = dataSlice;
    var version = afterVersion.loadUint(8);
    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
    var afterWalletIdValue = afterVersion;
    var walletIdValue = afterWalletIdValue.loadUint(32);
    var afterStoredSeqno = afterWalletIdValue;
    var storedSeqno = afterStoredSeqno.loadUint(32);
    var afterPublicKey = afterStoredSeqno;
    var publicKey = afterPublicKey.loadUint(256);
    var tail2 = afterPublicKey;
    var dictionaryState = tail2.loadRef();
    var dataSlice2 = dictionaryState.beginParse();
    var tail3 = tail2;
    var hookCode = tail3.loadRef();
    tail3.assertEnd();
    var afterPrograms = dataSlice2;
    var programs = afterPrograms.loadMaybeRef() as unknown as cell;
    var afterAmounts = afterPrograms;
    var amounts = afterAmounts.loadMaybeRef() as unknown as cell;
    var afterRetries = afterAmounts;
    var retries = afterRetries.loadMaybeRef() as unknown as cell;
    var afterAcknowledgements = afterRetries;
    var acknowledgements = afterAcknowledgements.loadMaybeRef() as unknown as cell;
    afterAcknowledgements.assertEnd();
    assert ((requestSeqno == storedSeqno)) throw ERROR_INVALID_SEQNO;
    assert (
        isSignatureValid(beginCell().storeSlice(signedPayload).hash(), signature, publicKey)
    ) throw ERROR_AUTHORIZATION_OR_REQUEST_VALIDATION;
    acceptExternalMessage();
    var nextSeqno = (storedSeqno + 1);
    var afterBatchCount = cursor22;
    var batchCount = afterBatchCount.loadUint(32);
    var (zero, cursor212, saveRetry) = loadRequestFlag(afterBatchCount);
    var afterHookArgument = cursor212;
    var hookArgument = afterHookArgument.loadUint(16);
    var afterSendMode = afterHookArgument;
    var sendMode = afterSendMode.loadUint(8);
    var (cursor215, _) = loadUint32(afterSendMode);
    var afterReceiptTag = cursor215;
    var receiptTag = afterReceiptTag.loadUint(32);
    var tail4 = afterReceiptTag.preloadRef().beginParse();
    var address = (tail4.loadAddress() as slice);
    var afterRequestedTon = tail4;
    var requestedTon = afterRequestedTon.loadCoins();
    var afterTradeAmount = afterRequestedTon;
    var tradeAmount = afterTradeAmount.loadCoins();
    var afterBodyByReference = afterTradeAmount;
    var bodyByReference = afterBodyByReference.loadUint(1);
    assert ((bodyByReference == 1)) throw ERROR_AUTHORIZATION_OR_REQUEST_VALIDATION;
    var tail5 = afterBodyByReference;
    var outgoingBody = tail5.loadRef();
    var afterAmountOverrides = tail5;
    var amountOverrides = afterAmountOverrides.loadMaybeRef() as unknown as cell;
    var afterQueryId = afterAmountOverrides;
    var queryId = afterQueryId.loadUint(64);
    var program = (afterQueryId.preloadMaybeRef() as unknown as cell);
    var programAbsent = (((program as unknown) == null) as int);
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
    var shouldSaveRetry: int;
    if ((saveRetry == 1)) {
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
        if ((tradeAmount > 0)) {
            nextAmounts = setUnsignedBuilder(
                amounts,
                64,
                queryId,
                beginCell().storeCoins(tradeAmount),
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
        var inmsg_8 = (contract.getAddress() as slice);
        var batchIndex = batchSent;
        while ((batchIndex < batchCount)) {
            var result15 = (batchIndex + 1);
            var b2 = beginCell().storeUint(0x18, 6).storeAddress((inmsg_8 as address));
            var c = b2.storeUint(0, 111).endCell();
            sendRawMessage(c, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
            batchIndex = result15;
        }
        batchSent = batchIndex;
    } else {}
    if ((((previousBlockContext() as unknown) == null) as int) != 0) {
        var b22 = beginCell()
            .storeUint(0x18, 6)
            .storeAddress((address as address))
            .storeCoins(
                requestedTon,
            );
        sendRawMessage(b22.storeUint(1, 107).storeRef(outgoingBody).endCell(), sendMode);
        if (needsReceipt != 0) {
            var b = beginCell().storeUint(OP_X1000_EXTERNAL_RECEIPT, 32);
            var b23 = b.storeUint(queryId, 64);
            var c2 = b23.storeUint(receiptTag, 32).endCell();
            var constslice = "2_".hexToSlice();
            var b24 = beginCell().storeUint(0xc, 4).storeSlice(constslice);
            var c3 = b24.storeUint(1, 98).storeRef(c2).endCell();
            sendRawMessage(c3, SEND_MODE_REGULAR);
        } else {}
        var dataSlice4 = contract.getData().beginParse();
        var afterSavedVersion = dataSlice4;
        var savedVersion = afterSavedVersion.loadUint(8);
        assert ((savedVersion == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
        var tail6 = afterSavedVersion.skipBits(320);
        tail6.loadRef();
        var tail7 = tail6;
        var retainedHook = tail7.loadRef();
        tail7.assertEnd();
        var c4 = beginCell()
            .storeMaybeRef(nextPrograms)
            .storeMaybeRef(
                nextAmounts,
            )
            .storeMaybeRef(nextRetries)
            .storeMaybeRef(nextAcknowledgements)
            .endCell();
        var b3 = beginCell().storeUint(0x1, 8);
        var b25 = b3.storeUint(walletIdValue, 32);
        var b26 = b25.storeUint(nextSeqno, 32);
        contract.setData(
            b26.storeUint(publicKey, 256).storeRef(c4).storeRef(retainedHook).endCell(),
        );
        return;
    }
    var inmsg_5 = blockchain.logicalTime();
    var inmsg_3 = blockchain.now();
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

    var b27 = beginCell()
        .storeUint(0x18, 6)
        .storeAddress((address as address))
        .storeCoins(
            sendTon,
        );
    sendRawMessage(b27.storeUint(1, 107).storeRef(outgoingBody).endCell(), sendMode);
    if (needsReceipt != 0) {
        var b4 = beginCell().storeUint(OP_X1000_EXTERNAL_RECEIPT, 32);
        var b28 = b4.storeUint(queryId, 64);
        var c5 = b28.storeUint(receiptTag, 32).endCell();
        var constslice2 = "2_".hexToSlice();
        var b29 = beginCell().storeUint(0xc, 4).storeSlice(constslice2);
        var c6 = b29.storeUint(1, 98).storeRef(c5).endCell();
        sendRawMessage(c6, SEND_MODE_REGULAR);
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
    var afterSavedVersion2 = dataSlice5;
    var savedVersion2 = afterSavedVersion2.loadUint(8);
    assert ((savedVersion2 == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
    var tail8 = afterSavedVersion2.skipBits(320);
    tail8.loadRef();
    var tail9 = tail8;
    var retainedHook2 = tail9.loadRef();
    tail9.assertEnd();
    var c7 = beginCell()
        .storeMaybeRef(finalPrograms)
        .storeMaybeRef(
            finalAmounts,
        )
        .storeMaybeRef(nextRetries)
        .storeMaybeRef(nextAcknowledgements)
        .endCell();
    var b5 = beginCell().storeUint(0x1, 8);
    var b210 = b5.storeUint(walletIdValue, 32);
    var b211 = b210.storeUint(nextSeqno, 32);
    contract.setData(b211.storeUint(publicKey, 256).storeRef(c7).storeRef(retainedHook2).endCell());
}
