// decompiled by @fiscaldev

type ForwardPayload = cell | RemainingBitsAndRefs

fun ForwardPayload.unpackFromSlice(mutate s: slice): ForwardPayload {
    var result: ForwardPayload;

    if (s.loadUint(1) != 0) {
        result = s.loadRef();
    } else {
        result = s as RemainingBitsAndRefs;
    }

    return result;
}

fun ForwardPayload.packToBuilder(self, mutate b: builder) {
    if (self is cell) {
        b.storeBool(true).storeRef(self);
    } else {
        b.storeBool(false).storeSlice(self);
    }
}

@overflow1023_policy("suppress")
struct (0x178d4519) JettonInternalTransfer {
    queryId: uint64
    jettonAmount: coins
    senderOwner: any_address
    responseAddress: any_address
    forwardTonAmount: coins
    forwardPayload: ForwardPayload
}

@overflow1023_policy("suppress")
struct (0x0f8a7ea5) JettonTransfer {
    queryId: uint64
    jettonAmount: coins
    recipientOwner: any_address
    responseAddress: any_address
    customPayload: cell?
    forwardTonAmount: coins
    forwardPayload: ForwardPayload
}

struct (0x595f07bc) JettonBurn {
    queryId: uint64
    jettonAmount: coins
    responseAddress: any_address
    customPayload: cell?
}

struct (0xb7459e2c) SellJettons {
    queryId: uint64
    jettonAmount: coins
    minTon: coins
    responseAddress: any_address
    partner: cell?
    referrer: cell?
}

type IncomingWalletMessage = JettonInternalTransfer | JettonTransfer | JettonBurn | SellJettons

struct (0x178d4519) BouncedJettonTransfer {
    queryId: uint64
    jettonAmount: coins
    tail: RemainingBitsAndRefs
}

struct (0x7bdd97de) BouncedJettonBurn {
    queryId: uint64
    jettonAmount: coins
    tail: RemainingBitsAndRefs
}

struct (0x646ad424) BouncedJettonSell {
    queryId: uint64
    jettonAmount: coins
    tail: RemainingBitsAndRefs
}

type BouncedWalletMessage = BouncedJettonTransfer | BouncedJettonBurn | BouncedJettonSell

struct (0x7362d09c) JettonTransferNotification {
    queryId: uint64
    jettonAmount: coins
    senderOwner: any_address
    forwardPayload: ForwardPayload
}

@overflow1023_policy("suppress")
struct (0x7bdd97de) JettonBurnNotification {
    queryId: uint64
    jettonAmount: coins
    senderOwner: any_address
    responseAddress: any_address
}

@overflow1023_policy("suppress")
struct (0x646ad424) JettonSellNotification {
    queryId: uint64
    jettonAmount: coins
    minTon: coins
    senderOwner: any_address
    responseAddress: any_address
    partner: cell?
    referrer: cell?
}

@overflow1023_policy("suppress")
struct WalletStorage {
    jettonBalance: coins
    ownerAddress: any_address
    jettonMaster: any_address
}
