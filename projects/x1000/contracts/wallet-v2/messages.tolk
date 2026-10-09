// decompiled by @fiscaldev
import "protocol-kinds"
import "../../../libraries/messages/opcodes"
import "compat"

@inline_ref
fun invokeAmountHook(
    hookCode: cell,
    logicalTime: unknown,
    timestamp: unknown,
    tonAmount: unknown,
    destination: unknown,
    messageBody: unknown,
    hookArgument: unknown,
): unknown {
    val savedContinuation = getExecutionContinuation();
    val hookContinuation = blessCode(hookCode.beginParse());
    setExecutionContinuation(hookContinuation);
    val hookResult = callAmountHookAbi(
        logicalTime,
        timestamp,
        tonAmount,
        destination,
        messageBody,
        hookArgument,
        83527,
        hookContinuation,
    );
    setExecutionContinuation(savedContinuation);
    return hookResult;
}

@method_id(2)
fun jettonTransferBody(
    queryId: int,
    jettonAmount: int,
    recipientOwner: slice,
    responseAddress: int,
    customPayload: cell,
    forwardTonAmount: int,
    forwardPayload: cell,
): cell {
    var messageBody = beginCell().storeUint(OP_JETTON_TRANSFER, 32);
    var bodyWithRecipient = messageBody
        .storeUint(queryId, 64)
        .storeCoins(jettonAmount)
        .storeAddress(
            (recipientOwner as address),
        );
    val responseAddressAbsent = (((responseAddress as unknown) == null) as int);
    var builder = beginCell();
    if (responseAddressAbsent != 0) {
        builder = storeTwoZeroBitsCompat(bodyWithRecipient);
    } else {
        builder = bodyWithRecipient.storeAddress((responseAddress as unknown as slice) as address);
    }
    return (builder.storeMaybeRef(customPayload).storeCoins(forwardTonAmount))
        .storeMaybeRef(forwardPayload)
        .endCell();
}

@method_id(7)
fun prepareTradeMessage(
    protocolKind: int,
    sourceAssetKind: int,
    targetAssetKind: int,
    queryId: int,
    callbackBody: slice,
    instruction: slice,
    amount: int,
): cell {
    val noOutgoingMessage = (null as unknown as cell);
    var outgoingMessage: cell;
    if ((protocolKind == PROTOCOL_CLASSIC_DEDUST)) {
        val isJettonToNative2 = ((sourceAssetKind == ASSET_JETTON &&
            targetAssetKind == ASSET_NATIVE) as int);
        var candidateMessage3 = noOutgoingMessage;
        if (isJettonToNative2 != 0) {
            var cursor2 = instruction;
            var instructionAmount = cursor2.loadCoins();
            var tail = cursor2;
            val refCell = tail.loadRef();
            var dataSlice = refCell.beginParse();
            var dataSlice2 = tail.preloadRef().beginParse();
            var tail2 = dataSlice;
            val address = (tail2.loadAddress() as slice);
            val address2 = (tail2.loadAddress() as slice);
            var tail3 = dataSlice2;
            val address3 = (tail3.loadAddress() as slice);
            val address4 = (tail3.loadAddress() as slice);
            var b = beginCell()
                .storeUint(0x0, 32)
                .storeTwoZeroBitsCompat()
                .storeTwoZeroBitsCompat();
            var b2 = b.storeMaybeRef((null as unknown as cell));
            val c = b2.storeMaybeRef((null as unknown as cell)).endCell();
            var b22 = beginCell()
                .storeUint(OP_CLASSIC_JETTON_SWAP, 32)
                .storeAddress((address4 as address))
                .storeUint(0, 1)
                .storeCoins(instructionAmount);
            val c2 = b22.storeMaybeRef((null as unknown as cell)).storeRef(c).endCell();
            val constValue2 = (null as unknown as cell);
            val result4 = jettonTransferBody(
                queryId,
                amount,
                address3,
                (address as unknown as int),
                constValue2,
                200000000,
                c2,
            );
            var b23 = beginCell().storeUint(0x18, 6).storeAddress((address2 as address));
            var b24 = b23.storeCoins(250000000);
            candidateMessage3 = b24.storeUint(0, 106).storeMaybeRef(result4).endCell();
        }
        if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
            var cursor22 = instruction;
            var instructionAmount2 = cursor22.loadCoins();
            var tail4 = cursor22;
            val refCell2 = tail4.loadRef();
            var dataSlice3 = refCell2.beginParse();
            var dataSlice4 = tail4.preloadRef().beginParse();
            var tail5 = dataSlice3;
            tail5.loadAddress();
            val address5 = (tail5.loadAddress() as slice);
            var tail6 = dataSlice4;
            val address6 = (tail6.loadAddress() as slice);
            val address7 = (tail6.loadAddress() as slice);
            var b3 = beginCell()
                .storeUint(0x0, 32)
                .storeTwoZeroBitsCompat()
                .storeTwoZeroBitsCompat();
            var b25 = b3.storeMaybeRef((null as unknown as cell));
            val c3 = b25.storeMaybeRef((null as unknown as cell)).endCell();
            var b26 = beginCell()
                .storeUint(OP_CLASSIC_JETTON_SWAP, 32)
                .storeAddress((address7 as address))
                .storeUint(0, 1)
                .storeCoins(instructionAmount2);
            val c4 = b26.storeMaybeRef((null as unknown as cell)).storeRef(c3).endCell();
            val constValue3 = (null as unknown as int);
            val constValue4 = (null as unknown as cell);
            val result7 = jettonTransferBody(
                queryId,
                amount,
                address6,
                constValue3,
                constValue4,
                200000000,
                c4,
            );
            var b27 = beginCell().storeUint(0x18, 6).storeAddress((address5 as address));
            var b28 = b27.storeCoins(250000000);
            outgoingMessage = b28.storeUint(0, 106).storeMaybeRef(result7).endCell();
        } else {
            outgoingMessage = candidateMessage3;
        }
    } else {
        if ((protocolKind == PROTOCOL_STONFI_V2)) {
            val isJettonToNative5 = ((sourceAssetKind == ASSET_JETTON &&
                targetAssetKind == ASSET_NATIVE) as int);
            var candidateMessage6 = noOutgoingMessage;
            if (isJettonToNative5 != 0) {
                var cursor23 = instruction;
                var instructionAmount3 = cursor23.loadCoins();
                var tail7 = cursor23;
                val refCell3 = tail7.loadRef();
                var dataSlice5 = refCell3.beginParse();
                var dataSlice6 = tail7.preloadRef().beginParse();
                var tail8 = dataSlice5;
                val address8 = (tail8.loadAddress() as slice);
                val address9 = (tail8.loadAddress() as slice);
                var tail9 = dataSlice6;
                val address10 = (tail9.loadAddress() as slice);
                val address11 = (tail9.loadAddress() as slice);
                var b29 = beginCell()
                    .storeCoins(instructionAmount3)
                    .storeAddress((address8 as address));
                var b210 = b29.storeCoins(70000000);
                var b4 = b210.storeMaybeRef((null as unknown as cell)).storeUint(0, 4);
                val c5 = b4
                    .storeMaybeRef((null as unknown as cell))
                    .storeUint(0, 16)
                    .storeTwoZeroBitsCompat()
                    .endCell();
                var b211 = beginCell()
                    .storeUint(OP_STONFI_V2_SWAP, 32)
                    .storeAddress((address11 as address))
                    .storeAddress((address8 as address))
                    .storeAddress((address8 as address));
                val inmsg_3 = blockchain.now();
                val result10 = (inmsg_3 + 300);
                val c6 = b211.storeUint(result10, 64).storeRef(c5).endCell();
                val constValue5 = (null as unknown as cell);
                val result11 = jettonTransferBody(
                    queryId,
                    amount,
                    address10,
                    (address8 as unknown as int),
                    constValue5,
                    0x1ad27480,
                    c6,
                );
                var b212 = beginCell().storeUint(0x18, 6).storeAddress((address9 as address));
                var b213 = b212.storeCoins(0x26be3680);
                candidateMessage6 = b213.storeUint(0, 106).storeMaybeRef(result11).endCell();
            }
            if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                var cursor24 = instruction;
                var instructionAmount4 = cursor24.loadCoins();
                var tail10 = cursor24;
                val refCell4 = tail10.loadRef();
                var dataSlice7 = refCell4.beginParse();
                var dataSlice8 = tail10.preloadRef().beginParse();
                var tail11 = dataSlice7;
                val address12 = (tail11.loadAddress() as slice);
                val address13 = (tail11.loadAddress() as slice);
                var tail12 = dataSlice8;
                val address14 = (tail12.loadAddress() as slice);
                val address15 = (tail12.loadAddress() as slice);
                var b214 = beginCell()
                    .storeCoins(instructionAmount4)
                    .storeAddress((address12 as address));
                var b215 = b214.storeCoins(70000000);
                var b5 = b215.storeMaybeRef((null as unknown as cell)).storeUint(0, 4);
                val c7 = b5
                    .storeMaybeRef((null as unknown as cell))
                    .storeUint(0, 16)
                    .storeTwoZeroBitsCompat()
                    .endCell();
                var b216 = beginCell()
                    .storeUint(OP_STONFI_V2_SWAP, 32)
                    .storeAddress((address15 as address))
                    .storeAddress((address12 as address))
                    .storeAddress((address12 as address));
                val inmsg_32 = blockchain.now();
                val result14 = (inmsg_32 + 300);
                val c8 = b216.storeUint(result14, 64).storeRef(c7).endCell();
                val constValue6 = (null as unknown as cell);
                val result15 = jettonTransferBody(
                    queryId,
                    amount,
                    address14,
                    (address12 as unknown as int),
                    constValue6,
                    0x1ad27480,
                    c8,
                );
                var b217 = beginCell().storeUint(0x18, 6).storeAddress((address13 as address));
                var b218 = b217.storeCoins(0x26be3680);
                outgoingMessage = b218.storeUint(0, 106).storeMaybeRef(result15).endCell();
            } else {
                outgoingMessage = candidateMessage6;
            }
        } else if (protocolKind != PROTOCOL_DEFAULT) {
            if ((protocolKind == PROTOCOL_TONCO)) {
                val isJettonToNative8 = ((sourceAssetKind == ASSET_JETTON &&
                    targetAssetKind == ASSET_NATIVE) as int);
                var candidateMessage9 = noOutgoingMessage;
                if (isJettonToNative8 != 0) {
                    var cursor25 = instruction;
                    var instructionAmount5 = cursor25.loadCoins();
                    var tail13 = cursor25.preloadRef().beginParse();
                    val address16 = (tail13.loadAddress() as slice);
                    val address17 = (tail13.loadAddress() as slice);
                    var b6 = beginCell().storeUint(OP_TONCO_SWAP, 32);
                    var b219 = b6.storeAddress(
                        ("8010E3B5242B6292042CDE1D4542DB6AC4F1AA502106EFF02B18BE999FBFBA45C2F_".hexToSlice() as address),
                    );
                    val c9 = b219
                        .storeUint(0, 160)
                        .storeCoins(instructionAmount5)
                        .storeAddress((address16 as address))
                        .storeUint(0, 1)
                        .endCell();
                    val constslice = "8017FF5BA4E14E70A63B4F627751F880704D84B0C2E7F3DBD3862DF56A778B3590D_".hexToSlice();
                    val constValue7 = (null as unknown as cell);
                    val result18 = jettonTransferBody(
                        queryId,
                        amount,
                        constslice,
                        (address16 as unknown as int),
                        constValue7,
                        0x1dcd6500,
                        c9,
                    );
                    var b220 = beginCell().storeUint(0x18, 6).storeAddress((address17 as address));
                    var b221 = b220.storeCoins(0x23c34600);
                    candidateMessage9 = b221.storeUint(0, 106).storeMaybeRef(result18).endCell();
                }
                if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                    var cursor26 = instruction;
                    var instructionAmount6 = cursor26.loadCoins();
                    var tail14 = cursor26;
                    val refCell5 = tail14.loadRef();
                    var dataSlice9 = refCell5.beginParse();
                    var dataSlice10 = tail14.preloadRef().beginParse();
                    var tail15 = dataSlice9;
                    val address18 = (tail15.loadAddress() as slice);
                    val address19 = (tail15.loadAddress() as slice);
                    val address20 = (dataSlice10.loadAddress() as slice);
                    var b222 = beginCell()
                        .storeUint(OP_TONCO_SWAP, 32)
                        .storeAddress((address20 as address));
                    val c10 = b222
                        .storeUint(0, 160)
                        .storeCoins(instructionAmount6)
                        .storeAddress((address18 as address))
                        .storeUint(0, 1)
                        .endCell();
                    val constslice2 = "8017FF5BA4E14E70A63B4F627751F880704D84B0C2E7F3DBD3862DF56A778B3590D_".hexToSlice();
                    val constValue8 = (null as unknown as cell);
                    val result21 = jettonTransferBody(
                        queryId,
                        amount,
                        constslice2,
                        (address18 as unknown as int),
                        constValue8,
                        0x1dcd6500,
                        c10,
                    );
                    var b223 = beginCell().storeUint(0x18, 6).storeAddress((address19 as address));
                    var b224 = b223.storeCoins(0x23c34600);
                    outgoingMessage = b224.storeUint(0, 106).storeMaybeRef(result21).endCell();
                } else {
                    outgoingMessage = candidateMessage9;
                }
            } else {
                if ((protocolKind == PROTOCOL_CPMM)) {
                    val isJettonToNative11 = ((sourceAssetKind == ASSET_JETTON &&
                        targetAssetKind == ASSET_NATIVE) as int);
                    var candidateMessage12 = noOutgoingMessage;
                    if (isJettonToNative11 != 0) {
                        var cursor27 = instruction;
                        var instructionAmount7 = cursor27.loadCoins();
                        var tail16 = cursor27;
                        val refCell6 = tail16.loadRef();
                        var dataSlice11 = refCell6.beginParse();
                        var dataSlice12 = tail16.preloadRef().beginParse();
                        var tail17 = dataSlice11;
                        val address21 = (tail17.loadAddress() as slice);
                        val address22 = (tail17.loadAddress() as slice);
                        val address23 = (dataSlice12.loadAddress() as slice);
                        var b225 = beginCell()
                            .storeAddress((address21 as address))
                            .storeUint(1, 6)
                            .storeAddress((address21 as address));
                        val c11 = b225
                            .storeCoins(200000000)
                            .storeTwoZeroBitsCompat()
                            .storeAddress((address21 as address))
                            .endCell();
                        var b226 = beginCell()
                            .storeUint(OP_CPMM_SWAP_PAYLOAD, 32)
                            .storeCoins(instructionAmount7);
                        val inmsg_33 = blockchain.now();
                        val result24 = (inmsg_33 + 300);
                        val c12 = b226.storeUint(result24, 40).storeUint(0, 3).endCell();
                        val c13 = beginCell()
                            .storeUint(OP_CPMM_PAY_JETTON, 32)
                            .storeRef(c12)
                            .storeRef(c11)
                            .endCell();
                        val constValue9 = (null as unknown as cell);
                        val result25 = jettonTransferBody(
                            queryId,
                            amount,
                            address23,
                            (address21 as unknown as int),
                            constValue9,
                            0x17d78400,
                            c13,
                        );
                        var b227 = beginCell()
                            .storeUint(0x18, 6)
                            .storeAddress((address22 as address));
                        var b228 = b227.storeCoins(0x1ad27480);
                        candidateMessage12 = b228
                            .storeUint(0, 106)
                            .storeMaybeRef(result25)
                            .endCell();
                    }
                    if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                        var cursor28 = instruction;
                        var instructionAmount8 = cursor28.loadCoins();
                        var tail18 = cursor28;
                        val refCell7 = tail18.loadRef();
                        var dataSlice13 = refCell7.beginParse();
                        var dataSlice14 = tail18.preloadRef().beginParse();
                        var tail19 = dataSlice13;
                        val address24 = (tail19.loadAddress() as slice);
                        val address25 = (tail19.loadAddress() as slice);
                        val address26 = (dataSlice14.loadAddress() as slice);
                        var b229 = beginCell().storeAddress((address24 as address));
                        var b230 = b229
                            .storeCoins(0x11e1a300)
                            .storeUint(1, 2)
                            .storeAddress((address24 as address));
                        val c14 = b230
                            .storeCoins(200000000)
                            .storeTwoZeroBitsCompat()
                            .storeAddress((address24 as address))
                            .endCell();
                        var b231 = beginCell()
                            .storeUint(OP_CPMM_SWAP_PAYLOAD, 32)
                            .storeCoins(instructionAmount8);
                        val inmsg_34 = blockchain.now();
                        val result28 = (inmsg_34 + 300);
                        val c15 = b231.storeUint(result28, 40).storeUint(0, 3).endCell();
                        val c16 = beginCell()
                            .storeUint(OP_CPMM_PAY_JETTON, 32)
                            .storeRef(c15)
                            .storeRef(c14)
                            .endCell();
                        val constValue10 = (null as unknown as cell);
                        val result29 = jettonTransferBody(
                            queryId,
                            amount,
                            address26,
                            (address24 as unknown as int),
                            constValue10,
                            0x17d78400,
                            c16,
                        );
                        var b232 = beginCell()
                            .storeUint(0x18, 6)
                            .storeAddress((address25 as address));
                        var b233 = b232.storeCoins(0x1ad27480);
                        outgoingMessage = b233.storeUint(0, 106).storeMaybeRef(result29).endCell();
                    } else {
                        outgoingMessage = candidateMessage12;
                    }
                } else if ((protocolKind == PROTOCOL_BIDASK_DAMM)) {
                    val isJettonToNative14 = ((sourceAssetKind == ASSET_JETTON &&
                        targetAssetKind == ASSET_NATIVE) as int);
                    var candidateMessage15 = noOutgoingMessage;
                    if (isJettonToNative14 != 0) {
                        var cursor29 = instruction;
                        var instructionAmount9 = cursor29.loadCoins();
                        var tail20 = cursor29;
                        val refCell8 = tail20.loadRef();
                        var dataSlice15 = refCell8.beginParse();
                        var dataSlice16 = tail20.preloadRef().beginParse();
                        var tail21 = dataSlice15;
                        val address27 = (tail21.loadAddress() as slice);
                        val address28 = (tail21.loadAddress() as slice);
                        val address29 = (dataSlice16.loadAddress() as slice);
                        var b7 = beginCell()
                            .storeUint(OP_BIDASK_DAMM_SWAP, 32)
                            .storeAddress((address27 as address))
                            .storeCoins(instructionAmount9)
                            .storeAddress((address27 as address))
                            .storeUint(0, 4);
                        var b234 = b7.storeMaybeRef((null as unknown as cell));
                        var b235 = b234.storeMaybeRef((null as unknown as cell));
                        val c17 = b235.storeMaybeRef((null as unknown as cell)).endCell();
                        val constValue11 = (null as unknown as cell);
                        val result32 = jettonTransferBody(
                            queryId,
                            amount,
                            address29,
                            (address27 as unknown as int),
                            constValue11,
                            0x1dcd6500,
                            c17,
                        );
                        var b236 = beginCell()
                            .storeUint(0x18, 6)
                            .storeAddress((address28 as address));
                        var b237 = b236.storeCoins(0x2160ec00);
                        candidateMessage15 = b237
                            .storeUint(0, 106)
                            .storeMaybeRef(result32)
                            .endCell();
                    }
                    if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                        var cursor210 = instruction;
                        var instructionAmount10 = cursor210.loadCoins();
                        var tail22 = cursor210;
                        val refCell9 = tail22.loadRef();
                        var dataSlice17 = refCell9.beginParse();
                        var dataSlice18 = tail22.preloadRef().beginParse();
                        var tail23 = dataSlice17;
                        val address30 = (tail23.loadAddress() as slice);
                        val address31 = (tail23.loadAddress() as slice);
                        val address32 = (dataSlice18.loadAddress() as slice);
                        val c18 = beginCell().storeUint(0x0, 32).endCell();
                        var b8 = beginCell()
                            .storeUint(OP_BIDASK_DAMM_SWAP, 32)
                            .storeAddress((address30 as address))
                            .storeCoins(instructionAmount10)
                            .storeAddress((address30 as address))
                            .storeUint(0, 4);
                        val c19 = b8
                            .storeMaybeRef((null as unknown as cell))
                            .storeMaybeRef(
                                c18,
                            )
                            .storeMaybeRef(c18)
                            .endCell();
                        val constValue12 = (null as unknown as cell);
                        val result35 = jettonTransferBody(
                            queryId,
                            amount,
                            address32,
                            (address30 as unknown as int),
                            constValue12,
                            0x1dcd6500,
                            c19,
                        );
                        var b238 = beginCell()
                            .storeUint(0x18, 6)
                            .storeAddress((address31 as address));
                        var b239 = b238.storeCoins(0x2160ec00);
                        outgoingMessage = b239.storeUint(0, 106).storeMaybeRef(result35).endCell();
                    } else {
                        outgoingMessage = candidateMessage15;
                    }
                } else {
                    if ((protocolKind == PROTOCOL_BIDASK_CLMM)) {
                        val isJettonToNative17 = ((sourceAssetKind == ASSET_JETTON &&
                            targetAssetKind == ASSET_NATIVE) as int);
                        var candidateMessage18 = noOutgoingMessage;
                        if (isJettonToNative17 != 0) {
                            var cursor211 = instruction;
                            var instructionAmount11 = cursor211.loadCoins();
                            var tail24 = cursor211;
                            val refCell10 = tail24.loadRef();
                            var dataSlice19 = refCell10.beginParse();
                            var dataSlice20 = tail24.preloadRef().beginParse();
                            var tail25 = dataSlice19;
                            val address33 = (tail25.loadAddress() as slice);
                            val address34 = (tail25.loadAddress() as slice);
                            val address35 = (dataSlice20.loadAddress() as slice);
                            val c20 = beginCell()
                                .storeAddress((address33 as address))
                                .storeTwoZeroBitsCompat()
                                .endCell();
                            val c21 = beginCell().storeUint(0x0, 32).endCell();
                            var b240 = beginCell()
                                .storeUint(OP_BIDASK_CLMM_SWAP, 32)
                                .storeAddress((address33 as address))
                                .storeUint(0, 1)
                                .storeCoins(instructionAmount11)
                                .storeUint(0, 4)
                                .storeMaybeRef(c20)
                                .storeMaybeRef(c21);
                            val c22 = b240.storeMaybeRef((null as unknown as cell)).endCell();
                            val constValue13 = (null as unknown as cell);
                            val result38 = jettonTransferBody(
                                queryId,
                                amount,
                                address35,
                                (address33 as unknown as int),
                                constValue13,
                                0x1dcd6500,
                                c22,
                            );
                            var b241 = beginCell()
                                .storeUint(0x18, 6)
                                .storeAddress((address34 as address));
                            var b242 = b241.storeCoins(0x2160ec00);
                            candidateMessage18 = b242
                                .storeUint(0, 106)
                                .storeMaybeRef(result38)
                                .endCell();
                        }
                        if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                            var cursor212 = instruction;
                            var instructionAmount12 = cursor212.loadCoins();
                            var tail26 = cursor212;
                            val refCell11 = tail26.loadRef();
                            var dataSlice21 = refCell11.beginParse();
                            var dataSlice22 = tail26.preloadRef().beginParse();
                            var tail27 = dataSlice21;
                            val address36 = (tail27.loadAddress() as slice);
                            val address37 = (tail27.loadAddress() as slice);
                            val address38 = (dataSlice22.loadAddress() as slice);
                            val c23 = beginCell()
                                .storeAddress((address36 as address))
                                .storeTwoZeroBitsCompat()
                                .endCell();
                            val c24 = beginCell().storeUint(0x0, 32).endCell();
                            val c25 = beginCell()
                                .storeUint(OP_BIDASK_CLMM_SWAP, 32)
                                .storeAddress((address36 as address))
                                .storeUint(0, 1)
                                .storeCoins(instructionAmount12)
                                .storeUint(0, 4)
                                .storeMaybeRef(c23)
                                .storeMaybeRef(c24)
                                .storeMaybeRef(c24)
                                .endCell();
                            val constValue14 = (null as unknown as cell);
                            val result41 = jettonTransferBody(
                                queryId,
                                amount,
                                address38,
                                (address36 as unknown as int),
                                constValue14,
                                0x1dcd6500,
                                c25,
                            );
                            var b243 = beginCell()
                                .storeUint(0x18, 6)
                                .storeAddress((address37 as address));
                            var b244 = b243.storeCoins(0x2160ec00);
                            outgoingMessage = b244
                                .storeUint(0, 106)
                                .storeMaybeRef(result41)
                                .endCell();
                        } else {
                            outgoingMessage = candidateMessage18;
                        }
                    } else if ((protocolKind == PROTOCOL_COFFEE)) {
                        val isJettonToNative20 = ((sourceAssetKind == ASSET_JETTON &&
                            targetAssetKind == ASSET_NATIVE) as int);
                        var candidateMessage21 = noOutgoingMessage;
                        if (isJettonToNative20 != 0) {
                            var cursor213 = instruction;
                            var instructionAmount13 = cursor213.loadCoins();
                            var tail28 = cursor213;
                            val refCell12 = tail28.loadRef();
                            var dataSlice23 = refCell12.beginParse();
                            var dataSlice24 = tail28.preloadRef().beginParse();
                            var tail29 = dataSlice23;
                            val address39 = (tail29.loadAddress() as slice);
                            val address40 = (tail29.loadAddress() as slice);
                            var tail30 = dataSlice24;
                            val address41 = (tail30.loadAddress() as slice);
                            val x14 = tail30.preloadUint(256);
                            val inmsg_35 = blockchain.now();
                            val result44 = (inmsg_35 + 60);
                            var builder = beginCell();
                            var b9 = builder
                                .storeUint(result44, 32)
                                .storeAddress((address39 as address))
                                .storeTwoZeroBitsCompat();
                            val c26 = b9.storeMaybeRef((null as unknown as cell)).endCell();
                            var b10 = beginCell().storeUint(OP_COFFEE_SWAP, 32);
                            var b245 = b10.storeUint(x14, 256).storeCoins(instructionAmount13);
                            val c27 = b245
                                .storeMaybeRef((null as unknown as cell))
                                .storeMaybeRef(c26)
                                .endCell();
                            val constValue15 = (null as unknown as cell);
                            val result45 = jettonTransferBody(
                                queryId,
                                amount,
                                address41,
                                (address39 as unknown as int),
                                constValue15,
                                0x14dc9380,
                                c27,
                            );
                            var b246 = beginCell()
                                .storeUint(0x18, 6)
                                .storeAddress((address40 as address));
                            var b247 = b246.storeCoins(0x17d78400);
                            candidateMessage21 = b247
                                .storeUint(0, 106)
                                .storeMaybeRef(result45)
                                .endCell();
                        }
                        if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                            var cursor214 = instruction;
                            var instructionAmount15 = cursor214.loadCoins();
                            var tail31 = cursor214;
                            val refCell13 = tail31.loadRef();
                            var dataSlice25 = refCell13.beginParse();
                            var dataSlice26 = tail31.preloadRef().beginParse();
                            var tail32 = dataSlice25;
                            val address42 = (tail32.loadAddress() as slice);
                            val address43 = (tail32.loadAddress() as slice);
                            var tail33 = dataSlice26;
                            val address44 = (tail33.loadAddress() as slice);
                            val x16 = tail33.preloadUint(256);
                            var b248 = beginCell().storeAddress((address42 as address));
                            var b249 = b248.storeCoins(100000000);
                            val c28 = b249
                                .storeRef(beginCell().storeUint(0x3039, 32).endCell())
                                .endCell();
                            val c29 = beginCell().storeMaybeRef(c28).storeMaybeRef(c28).endCell();
                            val inmsg_36 = blockchain.now();
                            val result48 = (inmsg_36 + 60);
                            var builder2 = beginCell();
                            val c30 = builder2
                                .storeUint(result48, 32)
                                .storeAddress((address42 as address))
                                .storeTwoZeroBitsCompat()
                                .storeMaybeRef(c29)
                                .endCell();
                            var b11 = beginCell().storeUint(OP_COFFEE_SWAP, 32);
                            var b250 = b11.storeUint(x16, 256).storeCoins(instructionAmount15);
                            val c31 = b250
                                .storeMaybeRef((null as unknown as cell))
                                .storeMaybeRef(c30)
                                .endCell();
                            val constValue16 = (null as unknown as cell);
                            val result49 = jettonTransferBody(
                                queryId,
                                amount,
                                address44,
                                (address42 as unknown as int),
                                constValue16,
                                0x14dc9380,
                                c31,
                            );
                            var b251 = beginCell()
                                .storeUint(0x18, 6)
                                .storeAddress((address43 as address));
                            var b252 = b251.storeCoins(0x17d78400);
                            outgoingMessage = b252
                                .storeUint(0, 106)
                                .storeMaybeRef(result49)
                                .endCell();
                        } else {
                            outgoingMessage = candidateMessage21;
                        }
                    } else {
                        if ((protocolKind == PROTOCOL_MOON)) {
                            if (
                                (sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_NATIVE)
                            ) {
                                var cursor215 = instruction;
                                var instructionAmount17 = cursor215.loadCoins();
                                var tail34 = cursor215;
                                val refCell14 = tail34.loadRef();
                                var dataSlice27 = refCell14.beginParse();
                                var dataSlice28 = tail34.preloadRef().beginParse();
                                var tail35 = dataSlice27;
                                val address45 = (tail35.loadAddress() as slice);
                                val address46 = (tail35.loadAddress() as slice);
                                val address47 = (dataSlice28.loadAddress() as slice);
                                var b12 = beginCell().storeUint(OP_MOON_SWAP_SUCCEEDED, 32);
                                val c32 = b12.storeUint(queryId, 64).endCell();
                                var b13 = beginCell().storeUint(OP_MOON_SWAP_FAILED, 32);
                                val c33 = b13.storeUint(queryId, 64).endCell();
                                val c34 = beginCell()
                                    .storeAddress((address45 as address))
                                    .storeMaybeRef(c32)
                                    .endCell();
                                val c35 = beginCell()
                                    .storeAddress((address45 as address))
                                    .storeMaybeRef(c33)
                                    .endCell();
                                var b253 = beginCell()
                                    .storeUint(OP_MOON_SWAP, 32)
                                    .storeCoins(
                                        instructionAmount17,
                                    );
                                val inmsg_37 = blockchain.now();
                                val result52 = (inmsg_37 + 300);
                                val c36 = b253
                                    .storeUint(result52, 64)
                                    .storeAddress((address45 as address))
                                    .storeTwoZeroBitsCompat()
                                    .storeMaybeRef(c34)
                                    .storeMaybeRef(c35)
                                    .endCell();
                                val constValue17 = (null as unknown as cell);
                                val result53 = jettonTransferBody(
                                    queryId,
                                    amount,
                                    address47,
                                    (address45 as unknown as int),
                                    constValue17,
                                    150000000,
                                    c36,
                                );
                                var b254 = beginCell()
                                    .storeUint(0x18, 6)
                                    .storeAddress(
                                        (address46 as address),
                                    );
                                var b255 = b254.storeCoins(0x17d78400);
                                outgoingMessage = b255
                                    .storeUint(0, 106)
                                    .storeMaybeRef(result53)
                                    .endCell();
                            } else {
                                outgoingMessage = noOutgoingMessage;
                            }
                        } else if ((protocolKind == PROTOCOL_EXTERNAL_8)) {
                            val isJettonToNative24 = ((sourceAssetKind == ASSET_JETTON &&
                                targetAssetKind == ASSET_NATIVE) as int);
                            var candidateMessage25 = noOutgoingMessage;
                            if (isJettonToNative24 != 0) {
                                var cursor216 = instruction;
                                var instructionAmount18 = cursor216.loadCoins();
                                var tail36 = cursor216;
                                val refCell15 = tail36.loadRef();
                                var dataSlice29 = refCell15.beginParse();
                                var dataSlice30 = tail36.preloadRef().beginParse();
                                var tail37 = dataSlice29;
                                val address48 = (tail37.loadAddress() as slice);
                                val address49 = (tail37.loadAddress() as slice);
                                val address50 = (dataSlice30.loadAddress() as slice);
                                val c37 = beginCell()
                                    .storeAddress((address48 as address))
                                    .endCell();
                                val c38 = beginCell()
                                    .storeUint(OP_ADAPTER_8_SWAP, 32)
                                    .storeAddress(
                                        (address48 as address),
                                    )
                                    .storeCoins(instructionAmount18)
                                    .storeMaybeRef(c37)
                                    .storeMaybeRef(c37)
                                    .endCell();
                                val constValue18 = (null as unknown as cell);
                                val result56 = jettonTransferBody(
                                    queryId,
                                    amount,
                                    address50,
                                    (address48 as unknown as int),
                                    constValue18,
                                    150000000,
                                    c38,
                                );
                                var b256 = beginCell()
                                    .storeUint(0x18, 6)
                                    .storeAddress(
                                        (address49 as address),
                                    );
                                var b257 = b256.storeCoins(200000000);
                                candidateMessage25 = b257
                                    .storeUint(0, 106)
                                    .storeMaybeRef(result56)
                                    .endCell();
                            }
                            if (
                                (sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)
                            ) {
                                var cursor217 = instruction;
                                var instructionAmount19 = cursor217.loadCoins();
                                var tail38 = cursor217;
                                val refCell16 = tail38.loadRef();
                                var dataSlice31 = refCell16.beginParse();
                                var dataSlice32 = tail38.preloadRef().beginParse();
                                var tail39 = dataSlice31;
                                val address51 = (tail39.loadAddress() as slice);
                                val address52 = (tail39.loadAddress() as slice);
                                val address53 = (dataSlice32.loadAddress() as slice);
                                val c39 = beginCell()
                                    .storeAddress((address51 as address))
                                    .endCell();
                                val c40 = beginCell()
                                    .storeUint(OP_ADAPTER_8_SWAP, 32)
                                    .storeAddress(
                                        (address51 as address),
                                    )
                                    .storeCoins(instructionAmount19)
                                    .storeMaybeRef(c39)
                                    .storeMaybeRef(c39)
                                    .endCell();
                                val constValue19 = (null as unknown as cell);
                                val result59 = jettonTransferBody(
                                    queryId,
                                    amount,
                                    address53,
                                    (address51 as unknown as int),
                                    constValue19,
                                    150000000,
                                    c40,
                                );
                                var b258 = beginCell()
                                    .storeUint(0x18, 6)
                                    .storeAddress(
                                        (address52 as address),
                                    );
                                var b259 = b258.storeCoins(200000000);
                                outgoingMessage = b259
                                    .storeUint(0, 106)
                                    .storeMaybeRef(result59)
                                    .endCell();
                            } else {
                                outgoingMessage = candidateMessage25;
                            }
                        } else {
                            if ((protocolKind == PROTOCOL_MOON_CLMM)) {
                                val isJettonToNative27 = ((sourceAssetKind == ASSET_JETTON &&
                                    targetAssetKind == ASSET_NATIVE) as int);
                                var candidateMessage28 = noOutgoingMessage;
                                if (isJettonToNative27 != 0) {
                                    var cursor218 = instruction;
                                    var x20 = cursor218.loadUint(256);
                                    var tail40 = cursor218;
                                    val refCell17 = tail40.loadRef();
                                    var dataSlice33 = refCell17.beginParse();
                                    var dataSlice34 = tail40.preloadRef().beginParse();
                                    var tail41 = dataSlice33;
                                    val address54 = (tail41.loadAddress() as slice);
                                    val address55 = (tail41.loadAddress() as slice);
                                    val address56 = (dataSlice34.loadAddress() as slice);
                                    val c41 = beginCell()
                                        .storeAddress((address54 as address))
                                        .endCell();
                                    var b260 = beginCell()
                                        .storeUint(OP_MOON_CLMM_SWAP, 32)
                                        .storeAddress(
                                            (address54 as address),
                                        );
                                    val c42 = b260
                                        .storeUint(x20, 256)
                                        .storeMaybeRef(c41)
                                        .storeMaybeRef(c41)
                                        .endCell();
                                    val constValue20 = (null as unknown as cell);
                                    val result62 = jettonTransferBody(
                                        queryId,
                                        amount,
                                        address56,
                                        (address54 as unknown as int),
                                        constValue20,
                                        250000000,
                                        c42,
                                    );
                                    var b261 = beginCell()
                                        .storeUint(0x18, 6)
                                        .storeAddress(
                                            (address55 as address),
                                        );
                                    var b262 = b261.storeCoins(0x11e1a300);
                                    candidateMessage28 = b262
                                        .storeUint(0, 106)
                                        .storeMaybeRef(result62)
                                        .endCell();
                                }
                                if (
                                    (sourceAssetKind == ASSET_JETTON &&
                                        targetAssetKind == ASSET_JETTON)
                                ) {
                                    var cursor219 = instruction;
                                    var x21 = cursor219.loadUint(256);
                                    var tail42 = cursor219;
                                    val refCell18 = tail42.loadRef();
                                    var dataSlice35 = refCell18.beginParse();
                                    var dataSlice36 = tail42.preloadRef().beginParse();
                                    var tail43 = dataSlice35;
                                    val address57 = (tail43.loadAddress() as slice);
                                    val address58 = (tail43.loadAddress() as slice);
                                    val address59 = (dataSlice36.loadAddress() as slice);
                                    val c43 = beginCell()
                                        .storeAddress((address57 as address))
                                        .endCell();
                                    var b263 = beginCell()
                                        .storeUint(OP_MOON_CLMM_SWAP, 32)
                                        .storeAddress(
                                            (address57 as address),
                                        );
                                    val c44 = b263
                                        .storeUint(x21, 256)
                                        .storeMaybeRef(c43)
                                        .storeMaybeRef(c43)
                                        .endCell();
                                    val constValue21 = (null as unknown as cell);
                                    val result65 = jettonTransferBody(
                                        queryId,
                                        amount,
                                        address59,
                                        (address57 as unknown as int),
                                        constValue21,
                                        250000000,
                                        c44,
                                    );
                                    var b264 = beginCell()
                                        .storeUint(0x18, 6)
                                        .storeAddress(
                                            (address58 as address),
                                        );
                                    var b265 = b264.storeCoins(0x11e1a300);
                                    outgoingMessage = b265
                                        .storeUint(0, 106)
                                        .storeMaybeRef(result65)
                                        .endCell();
                                } else {
                                    outgoingMessage = candidateMessage28;
                                }
                            } else if ((protocolKind == PROTOCOL_STONKS_PUMP_SELL)) {
                                if (
                                    (sourceAssetKind == ASSET_JETTON &&
                                        targetAssetKind == ASSET_NATIVE)
                                ) {
                                    var cursor220 = instruction;
                                    var instructionAmount22 = cursor220.loadCoins();
                                    var tail44 = cursor220.preloadRef().beginParse();
                                    val address60 = (tail44.loadAddress() as slice);
                                    val address61 = (tail44.loadAddress() as slice);
                                    var b14 = beginCell().storeUint(OP_STONKS_PUMP_SELL, 32);
                                    val c45 = b14
                                        .storeUint(queryId, 64)
                                        .storeCoins(amount)
                                        .storeAddress((address60 as address))
                                        .storeCoins(instructionAmount22)
                                        .endCell();
                                    var b266 = beginCell()
                                        .storeUint(0x18, 6)
                                        .storeAddress(
                                            (address61 as address),
                                        );
                                    var b267 = b266.storeCoins(80000000);
                                    outgoingMessage = b267
                                        .storeUint(0, 106)
                                        .storeMaybeRef(c45)
                                        .endCell();
                                } else {
                                    outgoingMessage = noOutgoingMessage;
                                }
                            } else {
                                if ((protocolKind == PROTOCOL_URANUS_SELL)) {
                                    if (
                                        (sourceAssetKind == ASSET_JETTON &&
                                            targetAssetKind == ASSET_NATIVE)
                                    ) {
                                        var cursor221 = instruction;
                                        var instructionAmount23 = cursor221.loadCoins();
                                        var tail45 = cursor221.preloadRef().beginParse();
                                        val address62 = (tail45.loadAddress() as slice);
                                        val address63 = (tail45.loadAddress() as slice);
                                        var b15 = beginCell().storeUint(OP_URANUS_SELL, 32);
                                        var b268 = b15
                                            .storeUint(queryId, 64)
                                            .storeCoins(amount)
                                            .storeCoins(instructionAmount23)
                                            .storeAddress((address62 as address));
                                        var b269 = b268.storeMaybeRef((null as unknown as cell));
                                        val c46 = b269
                                            .storeMaybeRef((null as unknown as cell))
                                            .endCell();
                                        var b270 = beginCell()
                                            .storeUint(0x18, 6)
                                            .storeAddress(
                                                (address63 as address),
                                            );
                                        var b271 = b270.storeCoins(80000000);
                                        outgoingMessage = b271
                                            .storeUint(0, 106)
                                            .storeMaybeRef(c46)
                                            .endCell();
                                    } else {
                                        outgoingMessage = noOutgoingMessage;
                                    }
                                } else if ((protocolKind == PROTOCOL_JETTON_BURN)) {
                                    if (
                                        (sourceAssetKind == ASSET_JETTON &&
                                            targetAssetKind == ASSET_NATIVE)
                                    ) {
                                        var cursor222 = instruction;
                                        var instructionAmount24 = cursor222.loadCoins();
                                        var tail46 = cursor222.preloadRef().beginParse();
                                        val address64 = (tail46.loadAddress() as slice);
                                        val address65 = (tail46.loadAddress() as slice);
                                        var b16 = beginCell()
                                            .storeCoins(instructionAmount24)
                                            .storeTwoZeroBitsCompat();
                                        val c47 = b16
                                            .storeMaybeRef((null as unknown as cell))
                                            .endCell();
                                        var b17 = beginCell().storeUint(OP_JETTON_BURN, 32);
                                        val c48 = b17
                                            .storeUint(queryId, 64)
                                            .storeCoins(amount)
                                            .storeAddress(
                                                (address64 as address),
                                            )
                                            .storeMaybeRef(c47)
                                            .endCell();
                                        var b272 = beginCell()
                                            .storeUint(0x18, 6)
                                            .storeAddress(
                                                (address65 as address),
                                            );
                                        var b273 = b272.storeCoins(80000000);
                                        outgoingMessage = b273
                                            .storeUint(0, 106)
                                            .storeMaybeRef(c48)
                                            .endCell();
                                    } else {
                                        outgoingMessage = noOutgoingMessage;
                                    }
                                } else {
                                    outgoingMessage = noOutgoingMessage;
                                }
                            }
                        }
                    }
                }
            }
        } else {
            val isJettonToNative33 = ((sourceAssetKind == ASSET_JETTON &&
                targetAssetKind == ASSET_NATIVE) as int);
            var candidateMessage34 = noOutgoingMessage;
            if (isJettonToNative33 != 0) {
                var cursor223 = instruction;
                var instructionAmount25 = cursor223.loadCoins();
                var tail47 = cursor223.preloadRef().beginParse();
                val address66 = (tail47.loadAddress() as slice);
                val address67 = (tail47.loadAddress() as slice);
                var b18 = beginCell().storeUint(OP_STONFI_V1_SWAP, 32);
                val c49 = b18
                    .storeAddress(
                        ("80022A16A3164C4D5AA3133F3110FF10496E00CA8AC8ABEFFC5027E024D33480C3F_".hexToSlice() as address),
                    )
                    .storeCoins(instructionAmount25)
                    .storeAddress((address66 as address))
                    .storeUint(0, 1)
                    .endCell();
                val constslice3 = "800EF3B9902A271B2A01C8938A523CFE24E71847AAEB6A620001ED44A77AC0E709D_".hexToSlice();
                val constValue22 = (null as unknown as int);
                val constValue23 = (null as unknown as cell);
                val result74 = jettonTransferBody(
                    queryId,
                    amount,
                    constslice3,
                    constValue22,
                    constValue23,
                    250000000,
                    c49,
                );
                var b274 = beginCell().storeUint(0x18, 6).storeAddress((address67 as address));
                var b275 = b274.storeCoins(0x11e1a300);
                candidateMessage34 = b275.storeUint(0, 106).storeMaybeRef(result74).endCell();
            }
            if ((sourceAssetKind == ASSET_JETTON && targetAssetKind == ASSET_JETTON)) {
                var cursor224 = instruction;
                var instructionAmount26 = cursor224.loadCoins();
                var tail48 = cursor224;
                val refCell19 = tail48.loadRef();
                var dataSlice37 = refCell19.beginParse();
                var dataSlice38 = tail48.preloadRef().beginParse();
                var tail49 = dataSlice37;
                val address68 = (tail49.loadAddress() as slice);
                val address69 = (tail49.loadAddress() as slice);
                val address70 = (dataSlice38.loadAddress() as slice);
                val c50 = beginCell()
                    .storeUint(OP_STONFI_V1_SWAP, 32)
                    .storeAddress((address70 as address))
                    .storeCoins(instructionAmount26)
                    .storeAddress((address68 as address))
                    .storeUint(0, 1)
                    .endCell();
                val constslice4 = "800EF3B9902A271B2A01C8938A523CFE24E71847AAEB6A620001ED44A77AC0E709D_".hexToSlice();
                val constValue24 = (null as unknown as int);
                val constValue25 = (null as unknown as cell);
                val result77 = jettonTransferBody(
                    queryId,
                    amount,
                    constslice4,
                    constValue24,
                    constValue25,
                    250000000,
                    c50,
                );
                var b276 = beginCell().storeUint(0x18, 6).storeAddress((address69 as address));
                var b277 = b276.storeCoins(0x11e1a300);
                outgoingMessage = b277.storeUint(0, 106).storeMaybeRef(result77).endCell();
            } else {
                outgoingMessage = candidateMessage34;
            }
        }
    }
    return outgoingMessage;
}
