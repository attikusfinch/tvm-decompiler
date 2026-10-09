// decompiled by @fiscaldev
import "../../../libraries/messages/opcodes"
import "@stdlib/gas-payments"
import "compat-address"
import "deployment-message"
import "types"

@inline_ref
fun walletDeployment(code: cell, jettonMaster: address, ownerAddress: address): AutoDeployAddress {
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
        toShard: { fixedPrefixLength: 8, closeTo: ownerAddress },
    };
}

@inline
fun registerAddressVariants(value: ContractState | AddressShardingOptions): int {
    return (value is ContractState) ? 1 : 0;
}

fun onInternalMessage(in: InMessage) {
    val msg = IncomingWalletMessage.fromSlice(in.body, { throwIfOpcodeDoesNotMatch: 65535 });
    match (msg) {
        JettonInternalTransfer => {
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddress();
            val jettonMaster = storageCursor.loadAddress();
            if (!(in.senderAddress == jettonMaster)) {
                val peer = walletDeployment(contract.getCode(), jettonMaster, msg.senderOwner!);
                assert (peer.calculateArchivedAddress() == in.senderAddress) throw 25;
            }
            val updatedJettonBalance = jettonBalance + msg.jettonAmount;
            contract.setData(
                beginCell()
                    .storeCoins(updatedJettonBalance)
                    .storeSlice(ownerAndMasterTail)
                    .endCell(),
            );
            if (msg.forwardTonAmount > 0) {
                val body = JettonTransferNotification {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    senderOwner: msg.senderOwner,
                    forwardPayload: msg.forwardPayload,
                }.toCell();
                sendRawMessage(
                    beginCell()
                        .storeUint(0x10, 6)
                        .storeAddress(ownerAddress)
                        .storeCoins(msg.forwardTonAmount)
                        .storeUint(1, 107)
                        .storeRef(body)
                        .endCell(),
                    SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
                );
            }
            if (msg.responseAddress != null) {
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
                        .storeAddress(msg.responseAddress!)
                        .storeUint(OP_JETTON_EXCESSES, 143)
                        .storeUint(msg.queryId, 64)
                        .endCell(),
                    SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_BALANCE,
                );
            }
        }
        JettonTransfer => {
            val required = (msg.forwardTonAmount > 0 ? 2 : 1) * in.originalForwardFee +
                msg.forwardTonAmount +
                calculateGasFee(0, 8526) +
                calculateGasFee(0, 8862) +
                calculateForwardFeeWithoutLumpPrice(0, 812, 3) +
                calculateStorageFee(0, 157680000, 970, 3);
            // This diagnostic instruction is present in the archived executable.
            debug.print(required);
            assert (required <= in.valueCoins) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddress();
            val jettonMaster = storageCursor.loadAddress();
            assert (in.senderAddress == ownerAddress) throw 25;
            assert (msg.recipientOwner.getWorkchain() == 0) throw 30;
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
                contract.getStoragePaidPayment() + calculateGasFee(0, 5253) +
                calculateGasFee(0, 7518) +
                in.originalForwardFee <=
                in.valueCoins
            ) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddress();
            val jettonMaster = storageCursor.loadAddress();
            assert (in.senderAddress == ownerAddress) throw 25;
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
                    .storeAddress(jettonMaster)
                    .storeUint(1, 111)
                    .storeRef(body)
                    .endCell(),
                SEND_MODE_BOUNCE_ON_ACTION_FAIL | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE,
            );
        }
        SellJettons => {
            assert (
                contract.getStoragePaidPayment() + calculateGasFee(0, 5760) +
                calculateGasFee(0, 22320) +
                calculateGasFee(0, 1586) +
                (in.originalForwardFee << 1) <=
                in.valueCoins
            ) throw 23;
            var storageCursor = contract.getData().beginParse();
            val jettonBalance = storageCursor.loadCoins();
            val ownerAndMasterTail = storageCursor;
            val ownerAddress = storageCursor.loadAddress();
            val jettonMaster = storageCursor.loadAddress();
            assert (in.senderAddress == ownerAddress) throw 25;
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
                    .storeAddress(jettonMaster)
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

get fun get_wallet_data(): (int, address, address, cell) {
    val storage = WalletStorage.fromCell(contract.getData(), { assertEndAfterReading: false });
    return (storage.jettonBalance, storage.ownerAddress, storage.jettonMaster, contract.getCode());
}
// Recovered from mainnet 891e5228e4300ae3ff22583163bbd50e3e1e8cd2304c0d57164f5318f9da1266.
// Names describe behavior; original author identifiers are unknown.
