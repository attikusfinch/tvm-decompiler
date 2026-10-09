// decompiled by @fiscaldev
import "errors"
import "protocol-kinds"
import "../../../libraries/messages/opcodes"
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
    var afterMessageFlags = dataSlice;
    var messageFlags = afterMessageFlags.loadUint(4);
    if ((messageFlags & 1) != 0) {
        var (result, result2) = bouncedQuery(body);
        if (result2 != 0) {
            var dataSlice2 = contract.getData().beginParse();
            var afterVersionBounce = dataSlice2;
            var versionBounce = afterVersionBounce.loadUint(8);
            assert ((versionBounce == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
            var afterWalletIdBounce = afterVersionBounce;
            var walletIdBounce = afterWalletIdBounce.loadUint(32);
            var afterSeqnoBounce = afterWalletIdBounce;
            var seqnoBounce = afterSeqnoBounce.loadUint(32);
            var afterKeyBounce = afterSeqnoBounce;
            var keyBounce = afterKeyBounce.loadUint(256);
            var tail = afterKeyBounce;
            val refCell = tail.loadRef();
            var dataSlice3 = refCell.beginParse();
            var tail2 = tail;
            tail2.loadRef();
            tail2.assertEnd();
            var afterProgramsBounce = dataSlice3;
            var programsBounce = afterProgramsBounce.loadMaybeRef() as unknown as cell;
            var afterAmountsBounce = afterProgramsBounce;
            var amountsBounce = afterAmountsBounce.loadMaybeRef() as unknown as cell;
            var afterRetriesBounce = afterAmountsBounce;
            var retriesBounce = afterRetriesBounce.loadMaybeRef() as unknown as cell;
            var afterAcksBounce = afterRetriesBounce;
            var acksBounce = afterAcksBounce.loadMaybeRef() as unknown as cell;
            afterAcksBounce.assertEnd();
            var (result4, result5) = acknowledgeQuery(acksBounce, result);
            if (result5 != 0) {
                var dataSlice4 = contract.getData().beginParse();
                var afterSavedVersionBounce = dataSlice4;
                var savedVersionBounce = afterSavedVersionBounce.loadUint(8);
                assert ((savedVersionBounce == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
                var tail3 = afterSavedVersionBounce.skipBits(320);
                tail3.loadRef();
                var tail4 = tail3;
                val refCell2 = tail4.loadRef();
                tail4.assertEnd();
                val c = beginCell()
                    .storeMaybeRef(programsBounce)
                    .storeMaybeRef(
                        amountsBounce,
                    )
                    .storeMaybeRef(retriesBounce)
                    .storeMaybeRef(result4)
                    .endCell();
                var b = beginCell().storeUint(0x1, 8);
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
    var afterOpcode = body;
    var opcode = afterOpcode.loadUint(32);
    var afterQueryId = afterOpcode;
    var queryId = afterQueryId.loadUint(64);
    var dataSlice5 = contract.getData().beginParse();
    var afterVersion = dataSlice5;
    var version = afterVersion.loadUint(8);
    assert ((version == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
    var afterWalletIdValue = afterVersion;
    var walletIdValue = afterWalletIdValue.loadUint(32);
    var afterStoredSeqno = afterWalletIdValue;
    var storedSeqno = afterStoredSeqno.loadUint(32);
    var afterPublicKey = afterStoredSeqno;
    var publicKey = afterPublicKey.loadUint(256);
    var tail5 = afterPublicKey;
    val refCell3 = tail5.loadRef();
    var dataSlice6 = refCell3.beginParse();
    var tail6 = tail5;
    tail6.loadRef();
    tail6.assertEnd();
    var afterPrograms = dataSlice6;
    var programs = afterPrograms.loadMaybeRef() as unknown as cell;
    if ((opcode == OP_X1000_RETRY)) {
        var afterAmountsRetry = afterPrograms;
        var amountsRetry = afterAmountsRetry.loadMaybeRef() as unknown as cell;
        var afterRetriesRetry = afterAmountsRetry;
        var retriesRetry = afterRetriesRetry.loadMaybeRef() as unknown as cell;
        var afterAcksRetry = afterRetriesRetry;
        var acksRetry = afterAcksRetry.loadMaybeRef() as unknown as cell;
        afterAcksRetry.assertEnd();
        val address = (afterMessageFlags.loadAddress() as slice);
        if (
            !(address.bitsEqual(
                "9FF1C20FAD211DB1A2CF8EB1F9ADFE00FDBAE1DA1D95045A3F286262FC347B25835_".hexToSlice(),
            ))
        ) {
            throw ERROR_AUTHORIZATION_OR_REQUEST_VALIDATION;
        }
        var (D22, retryEntry, status) = removeUnsignedEntry(retriesRetry, 64, queryId);
        if (!(status != 0)) {
            throw ERROR_PENDING_OPERATION_NOT_FOUND;
        }
        val c2 = retryEntry.preloadRef();
        sendRawMessage(c2, SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
        var dataSlice7 = contract.getData().beginParse();
        var afterSavedVersionRetry = dataSlice7;
        var savedVersionRetry = afterSavedVersionRetry.loadUint(8);
        assert ((savedVersionRetry == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
        var tail7 = afterSavedVersionRetry.skipBits(320);
        tail7.loadRef();
        var tail8 = tail7;
        val refCell4 = tail8.loadRef();
        tail8.assertEnd();
        val c3 = beginCell()
            .storeMaybeRef(programs)
            .storeMaybeRef(
                amountsRetry,
            )
            .storeMaybeRef(D22)
            .storeMaybeRef(acksRetry)
            .endCell();
        var b3 = beginCell().storeUint(0x1, 8);
        var b23 = b3.storeUint(walletIdValue, 32);
        var b24 = b23.storeUint(storedSeqno, 32);
        contract.setData(b24.storeUint(publicKey, 256).storeRef(c3).storeRef(refCell4).endCell());
        return;
    }
    var (recipeEntry, status2) = findUnsignedEntry(programs, 64, queryId);
    if (!(status2 != 0)) {
        var afterAmountsAck = afterPrograms;
        var amountsAck = afterAmountsAck.loadMaybeRef() as unknown as cell;
        var afterRetriesAck = afterAmountsAck;
        var retriesAck = afterRetriesAck.loadMaybeRef() as unknown as cell;
        var afterAcksAck = afterRetriesAck;
        var acksAck = afterAcksAck.loadMaybeRef() as unknown as cell;
        afterAcksAck.assertEnd();
        var (result9, result10) = acknowledgeQuery(acksAck, queryId);
        if (result10 != 0) {
            var dataSlice8 = contract.getData().beginParse();
            var afterSavedVersionAck = dataSlice8;
            var savedVersionAck = afterSavedVersionAck.loadUint(8);
            assert ((savedVersionAck == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
            var tail9 = afterSavedVersionAck.skipBits(320);
            tail9.loadRef();
            var tail10 = tail9;
            val refCell5 = tail10.loadRef();
            tail10.assertEnd();
            val c4 = beginCell()
                .storeMaybeRef(programs)
                .storeMaybeRef(
                    amountsAck,
                )
                .storeMaybeRef(retriesAck)
                .storeMaybeRef(result9)
                .endCell();
            var b4 = beginCell().storeUint(0x1, 8);
            var b25 = b4.storeUint(walletIdValue, 32);
            var b26 = b25.storeUint(storedSeqno, 32);
            contract.setData(
                b26.storeUint(publicKey, 256).storeRef(c4).storeRef(refCell5).endCell(),
            );
            return;
        }
        return;
    }
    var afterAmounts = afterPrograms;
    var amounts = afterAmounts.loadMaybeRef() as unknown as cell;
    var afterRetries = afterAmounts;
    var retries = afterRetries.loadMaybeRef() as unknown as cell;
    var afterAcknowledgements = afterRetries;
    var acknowledgements = afterAcknowledgements.loadMaybeRef() as unknown as cell;
    afterAcknowledgements.assertEnd();
    var afterProtocolKind = recipeEntry;
    var protocolKind = afterProtocolKind.loadUint(4);
    var nextRetries: cell;
    var nextAmounts: cell;
    var nextPrograms: cell;
    if (protocolKind != PROTOCOL_DEFAULT) {
        if (protocolKind == PROTOCOL_CLASSIC_DEDUST) {
            (nextPrograms, nextAmounts, nextRetries) = processClassicDedustTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_STONFI_V2) {
            (nextPrograms, nextAmounts, nextRetries) = processStonfiV2Trade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_TONCO) {
            (nextPrograms, nextAmounts, nextRetries) = processToncoTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_CPMM) {
            (nextPrograms, nextAmounts, nextRetries) = processCpmmTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_BIDASK_DAMM) {
            (nextPrograms, nextAmounts, nextRetries) = processBidaskDammTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_BIDASK_CLMM) {
            (nextPrograms, nextAmounts, nextRetries) = processBidaskClmmTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_COFFEE) {
            (nextPrograms, nextAmounts, nextRetries) = processCoffeeTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_MOON) {
            (nextPrograms, nextAmounts, nextRetries) = processMoonTrade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_EXTERNAL_8) {
            (nextPrograms, nextAmounts, nextRetries) = processExternalAdapter8Trade(
                messageValue,
                opcode,
                queryId,
                afterProtocolKind,
                programs,
                amounts,
                retries,
                afterQueryId,
            );
        } else if (protocolKind == PROTOCOL_MOON_CLMM) {
            var (result49, result50, result51) = processMoonClmmTrade(
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
        } else if (protocolKind == PROTOCOL_STONKS_PUMP_SELL) {
            var (result53, result54, result55) = processStonksPumpSellTrade(
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
        } else if (protocolKind == PROTOCOL_URANUS_SELL) {
            var (result57, result58, result59) = processUranusSellTrade(
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
            if ((protocolKind == PROTOCOL_JETTON_BURN)) {
                var (result61, result62, result63) = processJettonBurnTrade(
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
        (nextPrograms, nextAmounts, nextRetries) = processDefaultTrade(
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
    var afterSavedVersionTrade = dataSlice9;
    var savedVersionTrade = afterSavedVersionTrade.loadUint(8);
    assert ((savedVersionTrade == 1)) throw ERROR_UNSUPPORTED_STORAGE_VERSION;
    var tail11 = afterSavedVersionTrade.skipBits(320);
    tail11.loadRef();
    var tail12 = tail11;
    val refCell6 = tail12.loadRef();
    tail12.assertEnd();
    val c5 = beginCell()
        .storeMaybeRef(nextPrograms)
        .storeMaybeRef(
            nextAmounts,
        )
        .storeMaybeRef(nextRetries)
        .storeMaybeRef(result67)
        .endCell();
    var b5 = beginCell().storeUint(0x1, 8);
    var b27 = b5.storeUint(walletIdValue, 32);
    var b28 = b27.storeUint(storedSeqno, 32);
    contract.setData(b28.storeUint(publicKey, 256).storeRef(c5).storeRef(refCell6).endCell());
}
