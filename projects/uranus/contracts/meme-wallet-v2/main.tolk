// decompiled by @fiscaldev
import "../../../libraries/messages/opcodes"
import "@stdlib/gas-payments"
import "deployment-message"
import "matches"
import "types"

// Preserve both archived operations; current Tolk otherwise folds them to THROWIF.
fun requireBasechain(workchain: int): void
    asm "0 EQINT 30 THROWIFNOT"

@inline_ref
fun walletDeployment(
    code: cell,
    jettonMaster: any_address,
    ownerAddress: any_address,
): AutoDeployAddress {
    return {
        workchain: 0,
        stateInit: {
            code,
            data: WalletStorage {
                jettonBalance: 0,
                ownerAddress,
                jettonMaster,
            }.toCell(),
        },
        toShard: { fixedPrefixLength: 8, closeTo: ownerAddress as address },
    };
}

@inline
fun registerAddressVariants(value: ContractState | AddressShardingOptions): int {
    return (value is ContractState) ? 1 : 0;
}

fun onInternalMessage(in: InMessage) {
    val msg = IncomingWalletMessage.fromSlice(
        in.body,
        { throwIfOpcodeDoesNotMatch: 65535, assertEndAfterReading: false },
    );
    match (msg) {
        JettonInternalTransfer => {
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddressAny();
            val jettonMaster = storageCursor.loadAddressAny();
            if (!((in.senderAddress as slice).bitsEqual(jettonMaster as slice))) {
                val peer = walletDeployment(contract.getCode(), jettonMaster, msg.senderOwner);
                assert (peer.matchesArchivedAddress(in.senderAddress)) throw 25;
            }
            val updatedJettonBalance = jettonBalance + msg.jettonAmount;
            contract.setData(
                beginCell()
                    .storeCoins(updatedJettonBalance)
                    .storeSlice(ownerAndMasterTail)
                    .endCell(),
            );
            if (msg.forwardTonAmount != 0) {
                val body = JettonTransferNotification {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    senderOwner: msg.senderOwner,
                    forwardPayload: msg.forwardPayload,
                }.toCell();
                sendRawMessage(
                    beginCell()
                        .storeUint(0x10, 6)
                        .storeSlice(ownerAddress as slice)
                        .storeCoins(msg.forwardTonAmount)
                        .storeUint(1, 107)
                        .storeRef(body)
                        .endCell(),
                    SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
                );
            }
            if (isStandardAddress(msg.responseAddress)) {
                reserveToncoinsOnBalance(
                    max(
                        contract.getOriginalBalance() + contract.getStoragePaidPayment() -
                            in.valueCoins,
                        calculateStorageFee(0, 157680000, 970, 3),
                    ),
                    RESERVE_MODE_AT_MOST,
                );
                sendRawMessage(
                    beginCell()
                        .storeUint(0x10, 6)
                        .storeSlice(msg.responseAddress as slice)
                        .storeUint(OP_JETTON_EXCESSES, 143)
                        .storeUint(msg.queryId, 64)
                        .endCell(),
                    SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_BALANCE,
                );
            }
        }
        JettonTransfer => {
            val required = (msg.forwardTonAmount != 0 ? 2 : 1) * in.originalForwardFee +
                msg.forwardTonAmount +
                calculateGasFee(0, 8628) +
                calculateGasFee(0, 9282) +
                calculateForwardFeeWithoutLumpPrice(0, 812, 3) +
                calculateStorageFee(0, 157680000, 970, 3);
            // This diagnostic instruction is present in the archived executable.
            debug.print(required);
            assert (required <= in.valueCoins) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddressAny();
            val jettonMaster = storageCursor.loadAddressAny();
            assert ((in.senderAddress as slice).bitsEqual(ownerAddress as slice)) throw 25;
            requireBasechain((msg.recipientOwner as address).getWorkchain());
            assert (msg.jettonAmount <= jettonBalance) throw 27;
            val updatedJettonBalance = jettonBalance - msg.jettonAmount;
            contract.setData(
                beginCell()
                    .storeCoins(updatedJettonBalance)
                    .storeSlice(ownerAndMasterTail)
                    .endCell(),
            );
            val target = walletDeployment(contract.getCode(), jettonMaster, msg.recipientOwner);
            val body = JettonInternalTransfer {
                queryId: msg.queryId,
                jettonAmount: msg.jettonAmount,
                senderOwner: ownerAddress,
                responseAddress: msg.responseAddress,
                forwardTonAmount: msg.forwardTonAmount,
                forwardPayload: msg.forwardPayload,
            }.toCell();
            var outgoing = archivedPoolRefDeploymentHeader(target);
            outgoing.storeRef(body);
            sendRawMessage(
                outgoing.endCell(),
                SEND_MODE_BOUNCE_ON_ACTION_FAIL | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
            );
        }
        JettonBurn => {
            assert (
                contract.getStoragePaidPayment() + calculateGasFee(0, 5115) +
                calculateGasFee(0, 7880) +
                in.originalForwardFee <=
                in.valueCoins
            ) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddressAny();
            val jettonMaster = storageCursor.loadAddressAny();
            assert ((in.senderAddress as slice).bitsEqual(ownerAddress as slice)) throw 25;
            assert (msg.jettonAmount <= jettonBalance) throw 27;
            val updatedJettonBalance = jettonBalance - msg.jettonAmount;
            contract.setData(
                beginCell()
                    .storeCoins(updatedJettonBalance)
                    .storeSlice(ownerAndMasterTail)
                    .endCell(),
            );
            val body = JettonBurnNotification {
                queryId: msg.queryId,
                jettonAmount: msg.jettonAmount,
                senderOwner: ownerAddress,
                responseAddress: msg.responseAddress,
            }.toCell();
            sendRawMessage(
                beginCell()
                    .storeUint(0x18, 6)
                    .storeSlice(jettonMaster as slice)
                    .storeUint(1, 111)
                    .storeRef(body)
                    .endCell(),
                SEND_MODE_BOUNCE_ON_ACTION_FAIL | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
            );
        }
        SellJettons => {
            assert (
                contract.getStoragePaidPayment() + calculateGasFee(0, 5588) +
                calculateGasFee(0, 22543) +
                calculateGasFee(0, 1586) +
                (in.originalForwardFee << 1) <=
                in.valueCoins
            ) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddressAny();
            val jettonMaster = storageCursor.loadAddressAny();
            assert ((in.senderAddress as slice).bitsEqual(ownerAddress as slice)) throw 25;
            assert (msg.jettonAmount <= jettonBalance) throw 27;
            val updatedJettonBalance = jettonBalance - msg.jettonAmount;
            contract.setData(
                beginCell()
                    .storeCoins(updatedJettonBalance)
                    .storeSlice(ownerAndMasterTail)
                    .endCell(),
            );
            val body = JettonSellNotification {
                queryId: msg.queryId,
                jettonAmount: msg.jettonAmount,
                minTon: msg.minTon,
                senderOwner: ownerAddress,
                responseAddress: msg.responseAddress,
                partner: msg.partner,
                referrer: msg.referrer,
            }.toCell();
            sendRawMessage(
                beginCell()
                    .storeUint(0x18, 6)
                    .storeSlice(jettonMaster as slice)
                    .storeUint(1, 111)
                    .storeRef(body)
                    .endCell(),
                SEND_MODE_BOUNCE_ON_ACTION_FAIL | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
            );
        }
    }
}

fun onBouncedMessage(in: InMessageBounced) {
    var body = in.bouncedBody;
    body.loadUint(32);
    val msg = lazy BouncedWalletMessage.fromSlice(
        body,
        { throwIfOpcodeDoesNotMatch: 63, assertEndAfterReading: false },
    );
    val jettonAmount = match (msg) {
        BouncedJettonTransfer => msg.jettonAmount,
        BouncedJettonBurn => msg.jettonAmount,
        BouncedJettonSell => msg.jettonAmount,
    };
    var storageCursor = contract.getData().beginParse();
    val jettonBalance = storageCursor.loadCoins();
    val updatedJettonBalance = jettonBalance + jettonAmount;
    contract.setData(
        beginCell().storeCoins(updatedJettonBalance).storeSlice(storageCursor).endCell(),
    );
}

get fun get_wallet_data(): (int, any_address, any_address, cell) {
    val storage = WalletStorage.fromCell(contract.getData(), { assertEndAfterReading: false });
    return (storage.jettonBalance, storage.ownerAddress, storage.jettonMaster, contract.getCode());
}
// Recovered from mainnet eefce5ce3d1e555a5010a309348c965dfaf72ebdf3233b4f691fa3d37bdb5605.
// V2 deliberately preserves its permissive payload/address decoding.
