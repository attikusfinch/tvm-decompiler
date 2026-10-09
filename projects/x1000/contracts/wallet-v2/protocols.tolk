// decompiled by @fiscaldev

import "../../../libraries/messages/opcodes"
import "compat"
import "messages"
import "queues"

// Dispatch kind 3; wire predicates and gas boundaries are preserved.
@method_id(22)
fun processToncoTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_EXCESSES)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var dataSlice = secondLeg.beginParse();
            var cursor25 = dataSlice;
            var protocolKind3 = cursor25.loadUint(4);
            var cursor26 = cursor25;
            var sourceAssetKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var targetAssetKind5 = cursor27.loadUint(4);
            val tradeInstruction = (cursor27.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            var instructionTail28 = tradeInstruction.beginParse();
            var tradeAmount6 = instructionTail28.loadCoins();

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);
            val outgoingTrade = prepareTradeMessage(
                protocolKind3,
                sourceAssetKind4,
                targetAssetKind5,
                nextQueryId,
                body,
                instructionTail28,
                tradeAmount6,
            );

            if (((outgoingTrade as unknown) == null)) {
                retriesState7 = retries;
                amountsState8 = amounts;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                val amountsState212 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount6),
                );
                retriesState7 = updatedRetries;
                amountsState8 = amountsState212;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_PTON_TON_TRANSFER)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_PTON_TON_TRANSFER)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_EXCESSES)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                if ((messageValue < 200000000)) {
                    return (programs, amounts, retries);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, tradeAmount8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor29 = dataSlice3;
                var protocolKind9 = cursor29.loadUint(4);
                var cursor210 = cursor29;
                var sourceAssetKind10 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var targetAssetKind11 = cursor211.loadUint(4);
                val tradeInstruction28 = (cursor211.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction28 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState225 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var (instructionTail212, _) = loadCoinsField(tradeInstruction28.beginParse());
                val outgoingTrade22 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail212,
                    tradeAmount8,
                );

                if (((outgoingTrade22 as unknown) == null)) {
                    (
                        programsState4,
                        amountsState5,
                        retriesState3,
                    ) = retainProgramsAmountsRetriesAfterRejection(
                        programsState225,
                        nextQueryId,
                        queryId,
                        tradeAmount8,
                        retries,
                        amounts,
                        outgoingTrade22,
                    );
                } else {
                    val updatedRetries24 = sendOrQueueTrade(retries, queryId, outgoingTrade22);
                    val amountsState226 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(tradeAmount8),
                    );
                    retriesState3 = updatedRetries24;
                    amountsState5 = amountsState226;
                    programsState4 = programsState225;
                }

                (retriesState3, programsState4, amountsState5) = pendingState(
                    retriesState3,
                    programsState4,
                    amountsState5,
                );
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromOneLeg(
                    messageValue,
                    nextQueryId,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    firstLeg,
                );
            }
        } else {
            var selectedValue10: int;

            if ((firstLegMode == 1)) {
                val result16 = ((secondLegMode == 1) as int);
                selectedValue10 = ((result16 != 0) as int);
            } else {
                selectedValue10 = 0;
            }

            if (selectedValue10 != 0) {
                if ((opcode == OP_JETTON_EXCESSES)) {
                    if ((((secondLeg as unknown) == null) as int) != 0) {
                        var (programsAfterDelete16, _) = deleteUnsignedEntry(programs, 64, queryId);
                        var (amountsAfterDelete17, _) = deleteUnsignedEntry(amounts, 64, queryId);
                        var (retriesAfterDelete18, _) = deleteUnsignedEntry(retries, 64, queryId);

                        return (programsAfterDelete16, amountsAfterDelete17, retriesAfterDelete18);
                    }

                    if ((messageValue < 200000000)) {
                        return (programs, amounts, retries);
                    }

                    var dataSlice5 = secondLeg.beginParse();
                    var cursor213 = dataSlice5;
                    var protocolKind12 = cursor213.loadUint(4);
                    var cursor214 = cursor213;
                    var sourceAssetKind13 = cursor214.loadUint(4);
                    var cursor215 = cursor214;
                    var targetAssetKind14 = cursor215.loadUint(4);
                    val tradeInstruction29 = (cursor215.preloadMaybeRef() as unknown as cell);

                    if ((((tradeInstruction29 as unknown) == null) as int) != 0) {
                        var (programsAfterDelete19, _) = deleteUnsignedEntry(programs, 64, queryId);
                        var (amountsAfterDelete20, _) = deleteUnsignedEntry(amounts, 64, queryId);
                        var (retriesAfterDelete21, _) = deleteUnsignedEntry(retries, 64, queryId);

                        return (programsAfterDelete19, amountsAfterDelete20, retriesAfterDelete21);
                    }

                    var instructionTail216 = tradeInstruction29.beginParse();
                    var tradeAmount15 = instructionTail216.loadCoins();

                    val dataSlice6 = secondLeg.beginParse();
                    val programsState233 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice6);
                    val outgoingTrade23 = prepareTradeMessage(
                        protocolKind12,
                        sourceAssetKind13,
                        targetAssetKind14,
                        nextQueryId,
                        body,
                        instructionTail216,
                        tradeAmount15,
                    );

                    if (((outgoingTrade23 as unknown) == null)) {
                        (retriesState3, programsState4, amountsState5) = releasePreparedTrade(
                            retries,
                            nextQueryId,
                            queryId,
                            programsState233,
                            tradeAmount15,
                            amounts,
                            outgoingTrade23,
                        );
                    } else {
                        val updatedRetries25 = sendOrQueueTrade(retries, queryId, outgoingTrade23);
                        amountsState5 = setUnsignedBuilder(
                            amounts,
                            64,
                            nextQueryId,
                            beginCell().storeCoins(tradeAmount15),
                        );
                        retriesState3 = updatedRetries25;

                        programsState4 = programsState233;
                    }

                    (retriesState3, programsState4, amountsState5) = pendingState(
                        retriesState3,
                        programsState4,
                        amountsState5,
                    );
                } else {
                    (
                        retriesState3,
                        programsState4,
                        amountsState5,
                    ) = retainRetriesProgramsAmountsFromOneLeg(
                        messageValue,
                        nextQueryId,
                        queryId,
                        body,
                        programs,
                        amounts,
                        retries,
                        secondLeg,
                    );
                }
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromCallback(
                    messageValue,
                    opcode,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    secondLeg,
                    nextQueryId,
                );
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 12; wire predicates and gas boundaries are preserved.
@method_id(10)
fun processUranusSellTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var selectedValue3: cell;
    var programsState4: cell;
    var selectedValue5: cell;

    if (selectedValue2 != 0) {
        if ((opcode == OP_JETTON_EXCESSES)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var dataSlice = secondLeg.beginParse();
            var cursor25 = dataSlice;
            var protocolKind3 = cursor25.loadUint(4);
            var cursor26 = cursor25;
            var sourceAssetKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var targetAssetKind5 = cursor27.loadUint(4);
            val tradeInstruction = (cursor27.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            var instructionTail28 = tradeInstruction.beginParse();
            var tradeAmount6 = instructionTail28.loadCoins();

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);
            val outgoingTrade = prepareTradeMessage(
                protocolKind3,
                sourceAssetKind4,
                targetAssetKind5,
                nextQueryId,
                body,
                instructionTail28,
                tradeAmount6,
            );

            if (((outgoingTrade as unknown) == null)) {
                (programsState4, selectedValue5, selectedValue3) = releasePreparedTrade(
                    programsState211,
                    nextQueryId,
                    queryId,
                    retries,
                    tradeAmount6,
                    amounts,
                    outgoingTrade,
                );
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                selectedValue3 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount6),
                );
                selectedValue5 = updatedRetries;
                programsState4 = programsState211;
            }

            (selectedValue5, programsState4, selectedValue3) = pendingState(
                selectedValue5,
                programsState4,
                selectedValue3,
            );
        } else {
            (selectedValue5, programsState4, selectedValue3) = keepUnmatchedTrade(
                body,
                secondLeg,
                queryId,
                retries,
                programs,
                amounts,
                nextQueryId,
            );
        }
    } else {
        (selectedValue5, programsState4, selectedValue3) = keepOtherTrade(
            body,
            opcode,
            queryId,
            retries,
            programs,
            amounts,
        );
    }

    return (programsState4, selectedValue3, selectedValue5);
}

// Dispatch kind 13; wire predicates and gas boundaries are preserved.
@method_id(11)
fun processJettonBurnTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var selectedValue3: cell;
    var programsState4: cell;
    var selectedValue5: cell;

    if (selectedValue2 != 0) {
        if ((opcode == OP_JETTON_EXCESSES)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var dataSlice = secondLeg.beginParse();
            var cursor25 = dataSlice;
            var protocolKind3 = cursor25.loadUint(4);
            var cursor26 = cursor25;
            var sourceAssetKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var targetAssetKind5 = cursor27.loadUint(4);
            val tradeInstruction = (cursor27.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            var instructionTail28 = tradeInstruction.beginParse();
            var tradeAmount6 = instructionTail28.loadCoins();

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);
            val outgoingTrade = prepareTradeMessage(
                protocolKind3,
                sourceAssetKind4,
                targetAssetKind5,
                nextQueryId,
                body,
                instructionTail28,
                tradeAmount6,
            );

            if (((outgoingTrade as unknown) == null)) {
                (programsState4, selectedValue5, selectedValue3) = releasePreparedTrade(
                    programsState211,
                    nextQueryId,
                    queryId,
                    retries,
                    tradeAmount6,
                    amounts,
                    outgoingTrade,
                );
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                selectedValue3 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount6),
                );
                selectedValue5 = updatedRetries;
                programsState4 = programsState211;
            }

            (selectedValue5, programsState4, selectedValue3) = pendingState(
                selectedValue5,
                programsState4,
                selectedValue3,
            );
        } else {
            (selectedValue5, programsState4, selectedValue3) = keepUnmatchedTrade(
                body,
                secondLeg,
                queryId,
                retries,
                programs,
                amounts,
                nextQueryId,
            );
        }
    } else {
        (selectedValue5, programsState4, selectedValue3) = keepOtherTrade(
            body,
            opcode,
            queryId,
            retries,
            programs,
            amounts,
        );
    }

    return (programsState4, selectedValue3, selectedValue5);
}

// Dispatch kind 0; wire predicates and gas boundaries are preserved.
@method_id(12)
fun processDefaultTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_EXCESSES)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var dataSlice = secondLeg.beginParse();
            var cursor25 = dataSlice;
            var protocolKind3 = cursor25.loadUint(4);
            var cursor26 = cursor25;
            var sourceAssetKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var targetAssetKind5 = cursor27.loadUint(4);
            val tradeInstruction = (cursor27.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            var instructionTail28 = tradeInstruction.beginParse();
            var tradeAmount6 = instructionTail28.loadCoins();

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);
            val outgoingTrade = prepareTradeMessage(
                protocolKind3,
                sourceAssetKind4,
                targetAssetKind5,
                nextQueryId,
                body,
                instructionTail28,
                tradeAmount6,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount6),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_EXCESSES)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, tradeAmount8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor29 = dataSlice3;
                var protocolKind9 = cursor29.loadUint(4);
                var cursor210 = cursor29;
                var sourceAssetKind10 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var targetAssetKind11 = cursor211.loadUint(4);
                val tradeInstruction25 = (cursor211.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction25 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var (instructionTail212, _) = loadCoinsField(tradeInstruction25.beginParse());
                val outgoingTrade19 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail212,
                    tradeAmount8,
                );

                if (((outgoingTrade19 as unknown) == null)) {
                    amountsState5 = amounts;
                    retriesState3 = retries;
                } else {
                    val updatedRetries21 = sendOrQueueTrade(retries, queryId, outgoingTrade19);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(tradeAmount8),
                    );
                    retriesState3 = updatedRetries21;
                }

                programsState4 = programsState224;
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            var selectedValue10: int;

            if ((firstLegMode == 1)) {
                val result16 = ((secondLegMode == 1) as int);
                selectedValue10 = ((result16 != 0) as int);
            } else {
                selectedValue10 = 0;
            }

            if (selectedValue10 != 0) {
                if ((opcode == OP_JETTON_EXCESSES)) {
                    var (_, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var dataSlice5 = secondLeg.beginParse();
                    var cursor213 = dataSlice5;
                    var protocolKind12 = cursor213.loadUint(4);
                    var cursor214 = cursor213;
                    var sourceAssetKind13 = cursor214.loadUint(4);
                    var cursor215 = cursor214;
                    var targetAssetKind14 = cursor215.loadUint(4);
                    val tradeInstruction26 = (cursor215.preloadMaybeRef() as unknown as cell);

                    if ((((tradeInstruction26 as unknown) == null) as int) != 0) {
                        var (programsAfterDelete16, _) = deleteUnsignedEntry(programs, 64, queryId);
                        var (amountsAfterDelete17, _) = deleteUnsignedEntry(amounts, 64, queryId);
                        var (retriesAfterDelete18, _) = deleteUnsignedEntry(retries, 64, queryId);

                        return (programsAfterDelete16, amountsAfterDelete17, retriesAfterDelete18);
                    }

                    var instructionTail216 = tradeInstruction26.beginParse();
                    var tradeAmount15 = instructionTail216.loadCoins();

                    val dataSlice6 = secondLeg.beginParse();
                    val programsState228 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice6);
                    val outgoingTrade20 = prepareTradeMessage(
                        protocolKind12,
                        sourceAssetKind13,
                        targetAssetKind14,
                        nextQueryId,
                        body,
                        instructionTail216,
                        tradeAmount15,
                    );

                    if (((outgoingTrade20 as unknown) == null)) {
                        (programsState4, retriesState3, amountsState5) = releasePreparedTrade(
                            programsState228,
                            nextQueryId,
                            queryId,
                            retries,
                            tradeAmount15,
                            amounts,
                            outgoingTrade20,
                        );
                    } else {
                        val updatedRetries22 = sendOrQueueTrade(retries, queryId, outgoingTrade20);
                        amountsState5 = setUnsignedBuilder(
                            amounts,
                            64,
                            nextQueryId,
                            beginCell().storeCoins(tradeAmount15),
                        );
                        retriesState3 = updatedRetries22;

                        programsState4 = programsState228;
                    }

                    (retriesState3, programsState4, amountsState5) = pendingState(
                        retriesState3,
                        programsState4,
                        amountsState5,
                    );
                } else {
                    (retriesState3, programsState4, amountsState5) = keepUnmatchedProgram(
                        body,
                        nextQueryId,
                        queryId,
                        retries,
                        programs,
                        amounts,
                        secondLeg,
                    );
                }
            } else {
                (retriesState3, programsState4, amountsState5) = keepOtherTrade(
                    body,
                    opcode,
                    queryId,
                    retries,
                    programs,
                    amounts,
                );
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 1; wire predicates and gas boundaries are preserved.
@method_id(13)
fun processClassicDedustTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_CLASSIC_PAYOUT)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_CLASSIC_PAYOUT)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction36 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction36.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    amountsState5 = amounts;
                    retriesState3 = retries;
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                }

                programsState4 = programsState224;
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction37 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState231 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount14,
                                programsState231,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;

                            programsState4 = programsState231;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction38 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction38 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState238 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction38.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount15,
                                programsState238,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade30,
                            );
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;

                            programsState4 = programsState238;
                        }
                    }
                } else {
                    amountsState5 = amounts;
                    programsState4 = programs;
                    retriesState3 = retries;
                }
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 6; wire predicates and gas boundaries are preserved.
@method_id(14)
fun processCoffeeTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                retriesState7 = retries;
                amountsState8 = amounts;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                val amountsState212 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
                amountsState8 = amountsState212;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_COFFEE_PAYOUT)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_COFFEE_PAYOUT)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_EXCESSES)) {
                if ((messageValue < 100000000)) {
                    return (programs, amounts, retries);
                }

                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction35 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction35 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState225 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction35.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    (
                        programsState4,
                        amountsState5,
                        retriesState3,
                    ) = retainProgramsAmountsRetriesAfterRejection(
                        programsState225,
                        nextQueryId,
                        queryId,
                        selectedValue10,
                        retries,
                        amounts,
                        outgoingTrade28,
                    );
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    val amountsState226 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                    amountsState5 = amountsState226;
                    programsState4 = programsState225;
                }

                (retriesState3, programsState4, amountsState5) = pendingState(
                    retriesState3,
                    programsState4,
                    amountsState5,
                );
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromOneLeg(
                    messageValue,
                    nextQueryId,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    firstLeg,
                );
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction36 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState233 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction36.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (
                                amountsState5,
                                programsState4,
                                retriesState3,
                            ) = retainAmountsProgramsRetriesAfterRejection(
                                nextQueryId,
                                programsState233,
                                queryId,
                                tradeAmount14,
                                retries,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            val amountsState234 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;
                            amountsState5 = amountsState234;
                            programsState4 = programsState233;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction37 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState241 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            amountsState5 = amounts;
                            retriesState3 = retries;
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;
                        }

                        programsState4 = programsState241;
                        (amountsState5, programsState4, retriesState3) = pendingState(
                            amountsState5,
                            programsState4,
                            retriesState3,
                        );
                    }

                    (retriesState3, programsState4, amountsState5) = pendingState(
                        retriesState3,
                        programsState4,
                        amountsState5,
                    );
                } else {
                    (
                        retriesState3,
                        programsState4,
                        amountsState5,
                    ) = retainRetriesProgramsAmountsFromOneLeg(
                        nextQueryId,
                        firstLeg,
                        queryId,
                        body,
                        programs,
                        amounts,
                        retries,
                        secondLeg,
                    );
                }
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromCallback(
                    nextQueryId,
                    opcode,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    secondLeg,
                    firstLeg,
                );
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 7; wire predicates and gas boundaries are preserved.
@method_id(15)
fun processMoonTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_MOON_SWAP_FAILED)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_MOON_SWAP_SUCCEEDED)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction19 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction19 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction19.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade16 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade16 as unknown) == null)) {
                    (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                        selectedValue10,
                        programsState224,
                        queryId,
                        retries,
                        nextQueryId,
                        amounts,
                        outgoingTrade16,
                    );
                } else {
                    val updatedRetries17 = sendOrQueueTrade(retries, queryId, outgoingTrade16);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries17;

                    programsState4 = programsState224;
                }
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            amountsState5 = amounts;
            programsState4 = programs;
            retriesState3 = retries;
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 8; wire predicates and gas boundaries are preserved.
@method_id(16)
fun processExternalAdapter8Trade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_ROUTE_CLOSE_FIRST_VARIANT)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_ROUTE_CLOSE_SECOND_VARIANT)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction36 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction36.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    amountsState5 = amounts;
                    retriesState3 = retries;
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                }

                programsState4 = programsState224;
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction37 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState231 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount14,
                                programsState231,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;

                            programsState4 = programsState231;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction38 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction38 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState238 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction38.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount15,
                                programsState238,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade30,
                            );
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;

                            programsState4 = programsState238;
                        }
                    }
                } else {
                    amountsState5 = amounts;
                    programsState4 = programs;
                    retriesState3 = retries;
                }
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 9; wire predicates and gas boundaries are preserved.
@method_id(17)
fun processMoonClmmTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_ROUTE_CLOSE_FIRST_VARIANT)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_ROUTE_CLOSE_SECOND_VARIANT)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction36 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction36.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    amountsState5 = amounts;
                    retriesState3 = retries;
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                }

                programsState4 = programsState224;
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction37 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState231 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount14,
                                programsState231,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;

                            programsState4 = programsState231;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction38 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction38 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState238 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction38.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount15,
                                programsState238,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade30,
                            );
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;

                            programsState4 = programsState238;
                        }
                    }
                } else {
                    amountsState5 = amounts;
                    programsState4 = programs;
                    retriesState3 = retries;
                }
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 5; wire predicates and gas boundaries are preserved.
@method_id(18)
fun processBidaskDammTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                retriesState7 = retries;
                amountsState8 = amounts;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                val amountsState212 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
                amountsState8 = amountsState212;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_BIDASK_NATIVE_TRANSFER_NOTIFICATION)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_BIDASK_NATIVE_TRANSFER_NOTIFICATION)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_EXCESSES)) {
                if ((messageValue < 100000000)) {
                    return (programs, amounts, retries);
                }

                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction35 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction35 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState225 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction35.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    (
                        programsState4,
                        amountsState5,
                        retriesState3,
                    ) = retainProgramsAmountsRetriesAfterRejection(
                        programsState225,
                        nextQueryId,
                        queryId,
                        selectedValue10,
                        retries,
                        amounts,
                        outgoingTrade28,
                    );
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    val amountsState226 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                    amountsState5 = amountsState226;
                    programsState4 = programsState225;
                }

                (retriesState3, programsState4, amountsState5) = pendingState(
                    retriesState3,
                    programsState4,
                    amountsState5,
                );
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromOneLeg(
                    messageValue,
                    nextQueryId,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    firstLeg,
                );
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction36 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState233 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction36.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (
                                amountsState5,
                                programsState4,
                                retriesState3,
                            ) = retainAmountsProgramsRetriesAfterRejection(
                                nextQueryId,
                                programsState233,
                                queryId,
                                tradeAmount14,
                                retries,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            val amountsState234 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;
                            amountsState5 = amountsState234;
                            programsState4 = programsState233;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction37 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState241 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            amountsState5 = amounts;
                            retriesState3 = retries;
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;
                        }

                        programsState4 = programsState241;
                        (amountsState5, programsState4, retriesState3) = pendingState(
                            amountsState5,
                            programsState4,
                            retriesState3,
                        );
                    }

                    (retriesState3, programsState4, amountsState5) = pendingState(
                        retriesState3,
                        programsState4,
                        amountsState5,
                    );
                } else {
                    (
                        retriesState3,
                        programsState4,
                        amountsState5,
                    ) = retainRetriesProgramsAmountsFromOneLeg(
                        nextQueryId,
                        firstLeg,
                        queryId,
                        body,
                        programs,
                        amounts,
                        retries,
                        secondLeg,
                    );
                }
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromCallback(
                    nextQueryId,
                    opcode,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    secondLeg,
                    firstLeg,
                );
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 10; wire predicates and gas boundaries are preserved.
@method_id(19)
fun processBidaskClmmTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                amountsState8 = amounts;
                retriesState7 = retries;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState8 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_BIDASK_NATIVE_TRANSFER_NOTIFICATION)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_BIDASK_NATIVE_TRANSFER_NOTIFICATION)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, x8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction36 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction36 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState224 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var instructionTail213 = tradeInstruction36.beginParse();
                var x12 = instructionTail213.loadCoins();
                val result12 = ((x12 > 0) as int);
                var selectedValue10 = x8;

                if (result12 != 0) {
                    selectedValue10 = x12;
                } else {}

                val outgoingTrade28 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    selectedValue10,
                );

                if (((outgoingTrade28 as unknown) == null)) {
                    amountsState5 = amounts;
                    retriesState3 = retries;
                } else {
                    val updatedRetries31 = sendOrQueueTrade(retries, queryId, outgoingTrade28);
                    amountsState5 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(selectedValue10),
                    );
                    retriesState3 = updatedRetries31;
                }

                programsState4 = programsState224;
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        } else {
            var selectedValue11: int;

            if ((firstLegMode == 1)) {
                val result17 = ((secondLegMode == 1) as int);
                selectedValue11 = ((result17 != 0) as int);
            } else {
                selectedValue11 = 0;
            }

            if (selectedValue11 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x13, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount14) = loadCoinsField(x13);
                    var callbackTail214 = body;
                    var tradeAmount15 = callbackTail214.loadCoins();

                    if ((tradeAmount14 == tradeAmount15)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind16 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind17 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind18 = cursor217.loadUint(4);
                        val tradeInstruction37 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction37 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState231 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction37.beginParse(),
                        );
                        val outgoingTrade29 = prepareTradeMessage(
                            protocolKind16,
                            sourceAssetKind17,
                            targetAssetKind18,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount14,
                        );

                        if (((outgoingTrade29 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount14,
                                programsState231,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade29,
                            );
                        } else {
                            val updatedRetries32 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade29,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState3 = updatedRetries32;

                            programsState4 = programsState231;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind19 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind20 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind21 = cursor221.loadUint(4);
                        val tradeInstruction38 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction38 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete25, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete26, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete27, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete25,
                                amountsAfterDelete26,
                                retriesAfterDelete27,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState238 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction38.beginParse(),
                        );
                        val outgoingTrade30 = prepareTradeMessage(
                            protocolKind19,
                            sourceAssetKind20,
                            targetAssetKind21,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount15,
                        );

                        if (((outgoingTrade30 as unknown) == null)) {
                            (retriesState3, programsState4, amountsState5) = releaseRejectedTrade(
                                tradeAmount15,
                                programsState238,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade30,
                            );
                        } else {
                            val updatedRetries33 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade30,
                            );
                            amountsState5 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount15),
                            );
                            retriesState3 = updatedRetries33;

                            programsState4 = programsState238;
                        }
                    }
                } else {
                    amountsState5 = amounts;
                    programsState4 = programs;
                    retriesState3 = retries;
                }
            } else {
                amountsState5 = amounts;
                programsState4 = programs;
                retriesState3 = retries;
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}

// Dispatch kind 11; wire predicates and gas boundaries are preserved.
@method_id(9)
fun processStonksPumpSellTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var amountsState3: cell;
    var programsState4: cell;
    var retriesState5: cell;

    if (selectedValue2 != 0) {
        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                (retriesState5, programsState4, amountsState3) = releaseRejectedTrade(
                    nextQueryId,
                    programsState211,
                    queryId,
                    retries,
                    tradeAmount3,
                    amounts,
                    outgoingTrade,
                );
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                amountsState3 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState5 = updatedRetries;
                programsState4 = programsState211;
            }
        } else {
            amountsState3 = amounts;
            programsState4 = programs;
            retriesState5 = retries;
        }
    } else {
        amountsState3 = amounts;

        programsState4 = programs;

        retriesState5 = retries;
    }

    return (programsState4, amountsState3, retriesState5);
}

// Dispatch kind 4; wire predicates and gas boundaries are preserved.
@method_id(20)
fun processCpmmTrade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var amountsState3: cell;
    var retriesState4: cell;
    var programsState5: cell;

    if (selectedValue2 != 0) {
        var retriesState6: cell;
        var amountsState7: cell;
        var programsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                (programsState8, opcode, amountsState7, retriesState6) = releaseCompletedTrade(
                    programsState211,
                    opcode,
                    queryId,
                    retries,
                    tradeAmount3,
                    amounts,
                    nextQueryId,
                    outgoingTrade,
                );
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                val amountsState212 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState6 = updatedRetries;
                amountsState7 = amountsState212;
                programsState8 = programsState211;
            }
        } else {
            retriesState6 = retries;

            amountsState7 = amounts;

            programsState8 = programs;
        }

        if ((opcode == OP_JETTON_EXCESSES)) {
            return (programsState8, amountsState7, retriesState6);
        }

        amountsState3 = amountsState7;
        retriesState4 = retriesState6;
        programsState5 = programsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, tradeAmount8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction33 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction33 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState219 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var (instructionTail213, _) = loadCoinsField(tradeInstruction33.beginParse());
                val outgoingTrade25 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    tradeAmount8,
                );

                if (((outgoingTrade25 as unknown) == null)) {
                    amountsState3 = amounts;
                    retriesState4 = retries;
                } else {
                    val updatedRetries28 = sendOrQueueTrade(retries, queryId, outgoingTrade25);
                    amountsState3 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(tradeAmount8),
                    );
                    retriesState4 = updatedRetries28;
                }

                programsState5 = programsState219;
            } else {
                amountsState3 = amounts;
                programsState5 = programs;
                retriesState4 = retries;
            }
        } else {
            var selectedValue10: int;

            if ((firstLegMode == 1)) {
                val result16 = ((secondLegMode == 1) as int);
                selectedValue10 = ((result16 != 0) as int);
            } else {
                selectedValue10 = 0;
            }

            if (selectedValue10 != 0) {
                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    var (x12, status2) = findUnsignedEntry(amounts, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programs, amounts, retries);
                    }

                    var (_, tradeAmount13) = loadCoinsField(x12);
                    var callbackTail214 = body;
                    var tradeAmount14 = callbackTail214.loadCoins();

                    if ((tradeAmount13 == tradeAmount14)) {
                        if ((((firstLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete13, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete14, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete15, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete13,
                                amountsAfterDelete14,
                                retriesAfterDelete15,
                            );
                        }

                        var dataSlice5 = firstLeg.beginParse();
                        var cursor215 = dataSlice5;
                        var protocolKind15 = cursor215.loadUint(4);
                        var cursor216 = cursor215;
                        var sourceAssetKind16 = cursor216.loadUint(4);
                        var cursor217 = cursor216;
                        var targetAssetKind17 = cursor217.loadUint(4);
                        val tradeInstruction34 = (cursor217.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction34 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete16, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete17, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete18, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete16,
                                amountsAfterDelete17,
                                retriesAfterDelete18,
                            );
                        }

                        val dataSlice6 = firstLeg.beginParse();
                        val programsState226 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice6,
                        );
                        var (instructionTail218, _) = loadCoinsField(
                            tradeInstruction34.beginParse(),
                        );
                        val outgoingTrade26 = prepareTradeMessage(
                            protocolKind15,
                            sourceAssetKind16,
                            targetAssetKind17,
                            nextQueryId,
                            callbackTail214,
                            instructionTail218,
                            tradeAmount13,
                        );

                        if (((outgoingTrade26 as unknown) == null)) {
                            (retriesState4, programsState5, amountsState3) = releaseRejectedTrade(
                                tradeAmount13,
                                programsState226,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade26,
                            );
                        } else {
                            val updatedRetries29 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade26,
                            );
                            amountsState3 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount13),
                            );
                            retriesState4 = updatedRetries29;

                            programsState5 = programsState226;
                        }
                    } else {
                        if ((((secondLeg as unknown) == null) as int) != 0) {
                            var (programsAfterDelete19, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete20, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete21, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete19,
                                amountsAfterDelete20,
                                retriesAfterDelete21,
                            );
                        }

                        var dataSlice7 = secondLeg.beginParse();
                        var cursor219 = dataSlice7;
                        var protocolKind18 = cursor219.loadUint(4);
                        var cursor220 = cursor219;
                        var sourceAssetKind19 = cursor220.loadUint(4);
                        var cursor221 = cursor220;
                        var targetAssetKind20 = cursor221.loadUint(4);
                        val tradeInstruction35 = (cursor221.preloadMaybeRef() as unknown as cell);

                        if ((((tradeInstruction35 as unknown) == null) as int) != 0) {
                            var (programsAfterDelete22, _) = deleteUnsignedEntry(
                                programs,
                                64,
                                queryId,
                            );
                            var (amountsAfterDelete23, _) = deleteUnsignedEntry(
                                amounts,
                                64,
                                queryId,
                            );
                            var (retriesAfterDelete24, _) = deleteUnsignedEntry(
                                retries,
                                64,
                                queryId,
                            );

                            return (
                                programsAfterDelete22,
                                amountsAfterDelete23,
                                retriesAfterDelete24,
                            );
                        }

                        val dataSlice8 = secondLeg.beginParse();
                        val programsState233 = setUnsignedSlice(
                            programs,
                            64,
                            nextQueryId,
                            dataSlice8,
                        );
                        var (instructionTail222, _) = loadCoinsField(
                            tradeInstruction35.beginParse(),
                        );
                        val outgoingTrade27 = prepareTradeMessage(
                            protocolKind18,
                            sourceAssetKind19,
                            targetAssetKind20,
                            nextQueryId,
                            callbackTail214,
                            instructionTail222,
                            tradeAmount14,
                        );

                        if (((outgoingTrade27 as unknown) == null)) {
                            (retriesState4, programsState5, amountsState3) = releaseRejectedTrade(
                                tradeAmount14,
                                programsState233,
                                queryId,
                                retries,
                                nextQueryId,
                                amounts,
                                outgoingTrade27,
                            );
                        } else {
                            val updatedRetries30 = sendOrQueueTrade(
                                retries,
                                queryId,
                                outgoingTrade27,
                            );
                            amountsState3 = setUnsignedBuilder(
                                amounts,
                                64,
                                nextQueryId,
                                beginCell().storeCoins(tradeAmount14),
                            );
                            retriesState4 = updatedRetries30;

                            programsState5 = programsState233;
                        }
                    }
                } else {
                    amountsState3 = amounts;
                    programsState5 = programs;
                    retriesState4 = retries;
                }
            } else {
                amountsState3 = amounts;
                programsState5 = programs;
                retriesState4 = retries;
            }
        }
    }

    return (programsState5, amountsState3, retriesState4);
}

// Dispatch kind 2; wire predicates and gas boundaries are preserved.
@method_id(21)
fun processStonfiV2Trade(
    messageValue: int,
    opcode: int,
    queryId: int,
    recipe: slice,
    programs: cell,
    amounts: cell,
    retries: cell,
    body: slice,
): (cell, cell, cell) {
    var cursor2 = recipe;
    var firstLegMode = cursor2.loadUint(4);
    var cursor22 = cursor2;
    var secondLegMode = cursor22.loadUint(4);
    var (cursor23, _) = loadMaybeDictionary(cursor22);
    var cursor24 = cursor23;
    var firstLeg = cursor24.loadMaybeRef() as unknown as cell;
    val secondLeg = (cursor24.preloadMaybeRef() as unknown as cell);
    var selectedValue0: int;

    if (((secondLeg as unknown) == null)) {
        val firstLegAbsent = (((firstLeg as unknown) == null) as int);
        selectedValue0 = ((firstLegAbsent != 0) as int);
    } else {
        selectedValue0 = 0;
    }

    if (selectedValue0 != 0) {
        var (programsAfterDelete, _) = deleteUnsignedEntry(programs, 64, queryId);
        var (amountsAfterDelete, _) = deleteUnsignedEntry(amounts, 64, queryId);
        var (retriesAfterDelete, _) = deleteUnsignedEntry(retries, 64, queryId);

        return (programsAfterDelete, amountsAfterDelete, retriesAfterDelete);
    }

    var nextQueryId = (queryId + 1);
    var selectedValue2: int;

    if (firstLegMode != 0) {
        selectedValue2 = 0;
    } else {
        val result4 = ((secondLegMode == 1) as int);
        selectedValue2 = ((result4 != 0) as int);
    }

    var retriesState3: cell;
    var programsState4: cell;
    var amountsState5: cell;

    if (selectedValue2 != 0) {
        var programsState6: cell;
        var retriesState7: cell;
        var amountsState8: cell;

        if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
            if ((((secondLeg as unknown) == null) as int) != 0) {
                var (programsAfterDelete1, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete2, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete3, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete1, amountsAfterDelete2, retriesAfterDelete3);
            }

            var callbackTail25 = body;
            var tradeAmount3 = callbackTail25.loadCoins();

            var dataSlice = secondLeg.beginParse();
            var cursor26 = dataSlice;
            var protocolKind4 = cursor26.loadUint(4);
            var cursor27 = cursor26;
            var sourceAssetKind5 = cursor27.loadUint(4);
            var cursor28 = cursor27;
            var targetAssetKind6 = cursor28.loadUint(4);
            val tradeInstruction = (cursor28.preloadMaybeRef() as unknown as cell);

            if ((((tradeInstruction as unknown) == null) as int) != 0) {
                var (programsAfterDelete4, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete5, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete6, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete4, amountsAfterDelete5, retriesAfterDelete6);
            }

            val dataSlice2 = secondLeg.beginParse();
            val programsState211 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice2);

            var (instructionTail29, _) = loadCoinsField(tradeInstruction.beginParse());
            val outgoingTrade = prepareTradeMessage(
                protocolKind4,
                sourceAssetKind5,
                targetAssetKind6,
                nextQueryId,
                callbackTail25,
                instructionTail29,
                tradeAmount3,
            );

            if (((outgoingTrade as unknown) == null)) {
                retriesState7 = retries;
                amountsState8 = amounts;
            } else {
                val updatedRetries = sendOrQueueTrade(retries, queryId, outgoingTrade);
                val amountsState212 = setUnsignedBuilder(
                    amounts,
                    64,
                    nextQueryId,
                    beginCell().storeCoins(tradeAmount3),
                );
                retriesState7 = updatedRetries;
                amountsState8 = amountsState212;
            }

            programsState6 = programsState211;
            (amountsState8, opcode, queryId, retriesState7, programsState6) = activeState(
                amountsState8,
                opcode,
                queryId,
                retriesState7,
                programsState6,
            );
        } else {
            programsState6 = programs;

            retriesState7 = retries;

            amountsState8 = amounts;
        }

        if ((opcode == OP_PTON_TON_TRANSFER)) {
            var (programsState6AfterDelete, _) = deleteUnsignedEntry(programsState6, 64, queryId);
            var (amountsState8AfterDelete, _) = deleteUnsignedEntry(amountsState8, 64, queryId);
            var (retriesState7AfterDelete, _) = deleteUnsignedEntry(retriesState7, 64, queryId);

            return (programsState6AfterDelete, amountsState8AfterDelete, retriesState7AfterDelete);
        }

        retriesState3 = retriesState7;
        programsState4 = programsState6;
        amountsState5 = amountsState8;
    } else {
        var selectedValue9: int;

        if ((firstLegMode == 1)) {
            val result10 = ((secondLegMode == 0) as int);
            selectedValue9 = ((result10 != 0) as int);
        } else {
            selectedValue9 = 0;
        }

        if (selectedValue9 != 0) {
            if ((opcode == OP_PTON_TON_TRANSFER)) {
                var (programsAfterDelete7, _) = deleteUnsignedEntry(programs, 64, queryId);
                var (amountsAfterDelete8, _) = deleteUnsignedEntry(amounts, 64, queryId);
                var (retriesAfterDelete9, _) = deleteUnsignedEntry(retries, 64, queryId);

                return (programsAfterDelete7, amountsAfterDelete8, retriesAfterDelete9);
            }

            if ((opcode == OP_JETTON_EXCESSES)) {
                if ((messageValue < 100000000)) {
                    return (programs, amounts, retries);
                }

                if ((((firstLeg as unknown) == null) as int) != 0) {
                    var (programsAfterDelete10, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete11, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete12, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete10, amountsAfterDelete11, retriesAfterDelete12);
                }

                var (x7, status) = findUnsignedEntry(amounts, 64, queryId);

                if (!(status != 0)) {
                    return (programs, amounts, retries);
                }

                var (_, tradeAmount8) = loadCoinsField(x7);

                var dataSlice3 = firstLeg.beginParse();
                var cursor210 = dataSlice3;
                var protocolKind9 = cursor210.loadUint(4);
                var cursor211 = cursor210;
                var sourceAssetKind10 = cursor211.loadUint(4);
                var cursor212 = cursor211;
                var targetAssetKind11 = cursor212.loadUint(4);
                val tradeInstruction33 = (cursor212.preloadMaybeRef() as unknown as cell);

                if ((((tradeInstruction33 as unknown) == null) as int) != 0) {
                    var (programsAfterDelete13, _) = deleteUnsignedEntry(programs, 64, queryId);
                    var (amountsAfterDelete14, _) = deleteUnsignedEntry(amounts, 64, queryId);
                    var (retriesAfterDelete15, _) = deleteUnsignedEntry(retries, 64, queryId);

                    return (programsAfterDelete13, amountsAfterDelete14, retriesAfterDelete15);
                }

                val dataSlice4 = firstLeg.beginParse();
                val programsState225 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice4);

                var (instructionTail213, _) = loadCoinsField(tradeInstruction33.beginParse());
                val outgoingTrade25 = prepareTradeMessage(
                    protocolKind9,
                    sourceAssetKind10,
                    targetAssetKind11,
                    nextQueryId,
                    body,
                    instructionTail213,
                    tradeAmount8,
                );

                if (((outgoingTrade25 as unknown) == null)) {
                    (
                        programsState4,
                        amountsState5,
                        retriesState3,
                    ) = retainProgramsAmountsRetriesAfterRejection(
                        programsState225,
                        nextQueryId,
                        queryId,
                        tradeAmount8,
                        retries,
                        amounts,
                        outgoingTrade25,
                    );
                } else {
                    val updatedRetries28 = sendOrQueueTrade(retries, queryId, outgoingTrade25);
                    val amountsState226 = setUnsignedBuilder(
                        amounts,
                        64,
                        nextQueryId,
                        beginCell().storeCoins(tradeAmount8),
                    );
                    retriesState3 = updatedRetries28;
                    amountsState5 = amountsState226;
                    programsState4 = programsState225;
                }

                (retriesState3, programsState4, amountsState5) = pendingState(
                    retriesState3,
                    programsState4,
                    amountsState5,
                );
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromOneLeg(
                    messageValue,
                    nextQueryId,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    firstLeg,
                );
            }
        } else {
            var selectedValue10: int;

            if ((firstLegMode == 1)) {
                val result16 = ((secondLegMode == 1) as int);
                selectedValue10 = ((result16 != 0) as int);
            } else {
                selectedValue10 = 0;
            }

            if (selectedValue10 != 0) {
                var retriesState11: cell;
                var amountsState12: cell;
                var programsState13: cell;
                var selectedValue14: slice;

                if ((opcode == OP_JETTON_TRANSFER_NOTIFICATION)) {
                    if ((((secondLeg as unknown) == null) as int) != 0) {
                        var (programsAfterDelete16, _) = deleteUnsignedEntry(programs, 64, queryId);
                        var (amountsAfterDelete17, _) = deleteUnsignedEntry(amounts, 64, queryId);
                        var (retriesAfterDelete18, _) = deleteUnsignedEntry(retries, 64, queryId);

                        return (programsAfterDelete16, amountsAfterDelete17, retriesAfterDelete18);
                    }

                    var callbackTail214 = body;
                    var tradeAmount12 = callbackTail214.loadCoins();

                    var dataSlice5 = secondLeg.beginParse();
                    var cursor215 = dataSlice5;
                    var protocolKind13 = cursor215.loadUint(4);
                    var cursor216 = cursor215;
                    var sourceAssetKind14 = cursor216.loadUint(4);
                    var cursor217 = cursor216;
                    var targetAssetKind15 = cursor217.loadUint(4);
                    val tradeInstruction34 = (cursor217.preloadMaybeRef() as unknown as cell);

                    if ((((tradeInstruction34 as unknown) == null) as int) != 0) {
                        var (programsAfterDelete19, _) = deleteUnsignedEntry(programs, 64, queryId);
                        var (amountsAfterDelete20, _) = deleteUnsignedEntry(amounts, 64, queryId);
                        var (retriesAfterDelete21, _) = deleteUnsignedEntry(retries, 64, queryId);

                        return (programsAfterDelete19, amountsAfterDelete20, retriesAfterDelete21);
                    }

                    val dataSlice6 = secondLeg.beginParse();
                    val programsState233 = setUnsignedSlice(programs, 64, nextQueryId, dataSlice6);

                    var (instructionTail218, _) = loadCoinsField(tradeInstruction34.beginParse());
                    val outgoingTrade26 = prepareTradeMessage(
                        protocolKind13,
                        sourceAssetKind14,
                        targetAssetKind15,
                        nextQueryId,
                        callbackTail214,
                        instructionTail218,
                        tradeAmount12,
                    );

                    if (((outgoingTrade26 as unknown) == null)) {
                        retriesState11 = retries;
                        amountsState12 = amounts;
                    } else {
                        val updatedRetries29 = sendOrQueueTrade(retries, queryId, outgoingTrade26);
                        val amountsState234 = setUnsignedBuilder(
                            amounts,
                            64,
                            nextQueryId,
                            beginCell().storeCoins(tradeAmount12),
                        );
                        retriesState11 = updatedRetries29;
                        amountsState12 = amountsState234;
                    }

                    programsState13 = programsState233;
                    selectedValue14 = callbackTail214;
                    (
                        messageValue,
                        opcode,
                        queryId,
                        selectedValue14,
                        programsState13,
                        amountsState12,
                        retriesState11,
                        nextQueryId,
                        firstLeg,
                    ) = twoStageState(
                        messageValue,
                        opcode,
                        queryId,
                        selectedValue14,
                        programsState13,
                        amountsState12,
                        retriesState11,
                        nextQueryId,
                        firstLeg,
                    );
                } else {
                    retriesState11 = retries;

                    amountsState12 = amounts;

                    programsState13 = programs;

                    selectedValue14 = body;
                }

                if ((opcode == OP_JETTON_EXCESSES)) {
                    if ((messageValue < 170000000)) {
                        return (programsState13, amountsState12, retriesState11);
                    }

                    if ((((firstLeg as unknown) == null) as int) != 0) {
                        var (programsState13AfterDelete, _) = deleteUnsignedEntry(
                            programsState13,
                            64,
                            queryId,
                        );
                        var (amountsState12AfterDelete, _) = deleteUnsignedEntry(
                            amountsState12,
                            64,
                            queryId,
                        );
                        var (retriesState11AfterDelete, _) = deleteUnsignedEntry(
                            retriesState11,
                            64,
                            queryId,
                        );

                        return (
                            programsState13AfterDelete,
                            amountsState12AfterDelete,
                            retriesState11AfterDelete,
                        );
                    }

                    var (x16, status2) = findUnsignedEntry(amountsState12, 64, queryId);

                    if (!(status2 != 0)) {
                        return (programsState13, amountsState12, retriesState11);
                    }

                    var (_, tradeAmount17) = loadCoinsField(x16);

                    var dataSlice7 = firstLeg.beginParse();
                    var cursor219 = dataSlice7;
                    var protocolKind18 = cursor219.loadUint(4);
                    var cursor220 = cursor219;
                    var sourceAssetKind19 = cursor220.loadUint(4);
                    var cursor221 = cursor220;
                    var targetAssetKind20 = cursor221.loadUint(4);
                    val tradeInstruction35 = (cursor221.preloadMaybeRef() as unknown as cell);

                    if ((((tradeInstruction35 as unknown) == null) as int) != 0) {
                        var (programsState13AfterDelete22, _) = deleteUnsignedEntry(
                            programsState13,
                            64,
                            queryId,
                        );
                        var (amountsState12AfterDelete23, _) = deleteUnsignedEntry(
                            amountsState12,
                            64,
                            queryId,
                        );
                        var (retriesState11AfterDelete24, _) = deleteUnsignedEntry(
                            retriesState11,
                            64,
                            queryId,
                        );

                        return (
                            programsState13AfterDelete22,
                            amountsState12AfterDelete23,
                            retriesState11AfterDelete24,
                        );
                    }

                    val dataSlice8 = firstLeg.beginParse();
                    val programsState13AfterUpdate = setUnsignedSlice(
                        programsState13,
                        64,
                        nextQueryId,
                        dataSlice8,
                    );

                    var (instructionTail222, _) = loadCoinsField(tradeInstruction35.beginParse());
                    val outgoingTrade27 = prepareTradeMessage(
                        protocolKind18,
                        sourceAssetKind19,
                        targetAssetKind20,
                        nextQueryId,
                        selectedValue14,
                        instructionTail222,
                        tradeAmount17,
                    );

                    if (((outgoingTrade27 as unknown) == null)) {
                        (
                            amountsState5,
                            programsState4,
                            retriesState3,
                        ) = retainAmountsProgramsRetriesAfterRejection(
                            nextQueryId,
                            programsState13AfterUpdate,
                            queryId,
                            tradeAmount17,
                            retriesState11,
                            amountsState12,
                            outgoingTrade27,
                        );
                    } else {
                        val updatedRetries30 = sendOrQueueTrade(
                            retriesState11,
                            queryId,
                            outgoingTrade27,
                        );
                        val D242 = setUnsignedBuilder(
                            amountsState12,
                            64,
                            nextQueryId,
                            beginCell().storeCoins(tradeAmount17),
                        );
                        retriesState3 = updatedRetries30;
                        amountsState5 = D242;

                        programsState4 = programsState13AfterUpdate;
                    }

                    (retriesState3, programsState4, amountsState5) = pendingState(
                        retriesState3,
                        programsState4,
                        amountsState5,
                    );
                } else {
                    (
                        retriesState3,
                        programsState4,
                        amountsState5,
                    ) = retainRetriesProgramsAmountsFromOneLeg(
                        messageValue,
                        firstLeg,
                        queryId,
                        selectedValue14,
                        programsState13,
                        amountsState12,
                        retriesState11,
                        nextQueryId,
                    );
                }
            } else {
                (
                    retriesState3,
                    programsState4,
                    amountsState5,
                ) = retainRetriesProgramsAmountsFromTwoLegs(
                    messageValue,
                    opcode,
                    queryId,
                    body,
                    programs,
                    amounts,
                    retries,
                    nextQueryId,
                    secondLeg,
                    firstLeg,
                );
            }
        }
    }

    return (programsState4, amountsState5, retriesState3);
}
