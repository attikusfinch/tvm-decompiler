// Readable incoming handlers; whole-Pool byte identity is still pending.
import "@stdlib/gas-payments"
import "storage"
import "messages"
import "wallets"
import "transfers"
import "processing"
import "settlement"
import "payment"
import "payout-config"
import "routing"
import "liquidity-handlers"
import "claim-handlers"
import "transaction-context"

fun poolExceptionHasContext(value:unknown):bool asm "ISTUPLE"
fun poolExceptionContext(value:unknown):(any_address,PoolPayoutOptions) asm "5 UNTUPLE"

@inline
fun buildPoolInitializationResult(to:any_address,queryId:uint64,exitCode:int):cell {
    val payload:cell?=null;
    val message=beginCell().storeUint(0x10,6).storeSlice(to as slice).storeUint(3457702871,143)
        .storeUint(queryId,64).storeInt(exitCode,32).storeDict(payload).endCell();
    return message;
}

@inline
fun initializePool(storage:PoolStorage,message:InitPool,in:PoolInboundContext) {
    try {
        val initialCost=50000000+calculateGasFee(0,40000)+poolOriginalForwardFee();
        assert(in.valueCoins() >= initialCost) throw 25;
        assert(storage.status is PoolUninitialized) throw 20;
        val config=PoolConfig.fromCell(storage.config);
        assert(!(config.assetX as slice).bitsEqual(config.assetY as slice)) throw 26;
        assert(config.creatorFee <= 5000) throw 35;
        val depositActive=config.depositActivation == null;
        val swapActive=config.swapActivation == null;
        var requested=0;
        var extra=PoolExtra.fromCell(storage.extra);
        if(config.assetX.isInternal()) {
            val (updated,isNew,resolver)=scheduleWalletResolution(extra.wallets.resolutions,config.assetX,config.customResolvers);
            extra.wallets.resolutions=updated;
            if(isNew) {requestPoolWalletAddress(resolver,message.queryId);requested+=1;}
        }
        if(config.assetY.isInternal()) {
            val (updated,isNew,resolver)=scheduleWalletResolution(extra.wallets.resolutions,config.assetY,config.customResolvers);
            extra.wallets.resolutions=updated;
            if(isNew) {requestPoolWalletAddress(resolver,message.queryId);requested+=1;}
        }
        var reward=config.allowedRewards.findFirst();
        while(reward.isFound) {
            val allowed=reward.loadValue();
            if(allowed.asset.isInternal()) {
                val (updated,isNew,resolver)=scheduleWalletResolution(extra.wallets.resolutions,allowed.asset,config.customResolvers);
                extra.wallets.resolutions=updated;
                if(isNew) {requestPoolWalletAddress(resolver,message.queryId);requested+=1;}
            }
            reward=config.allowedRewards.iterateNext(reward);
        }
        val resolverCost=calculateForwardFee(0,1,364)+calculateForwardFee(0,364,1)+
            max(calculateGasFee(0,25000),10000000);
        assert(initialCost+(resolverCost+calculateGasFee(0,14500))*requested <= in.valueCoins()) throw 25;
        storage.extra=extra.toCell();
        reserveToncoinsOnBalance(50000000,2);
        if(requested > 0) {
            storage.status=PoolInitializing{initiator:in.senderAddress() as any_address};
            sendPoolExcesses(in.senderAddress() as any_address,message.queryId,128);
        } else {
            storage.status=PoolInitialized{};
            sendRawMessage(buildPoolInitializationResult(in.senderAddress(),message.queryId,0),128);
        }
        storage.depositActive=depositActive;storage.swapActive=swapActive;
        contract.setData(storage.toCell());
    } catch(code,value) {
        sendRawMessage(buildPoolInitializationResult(in.senderAddress(),message.queryId,code),64);
        commitContractDataAndActions();throw code;
    }
}

@inline
fun receivePoolWallet(storage:PoolStorage,message:TakeWalletAddress,in:PoolInboundContext) {
    assert(storage.status is PoolInitializing) throw 21;
    val initiator=storage.status.initiator;
    assert(message.wallet.isInternal()) throw 24;
    var extra=PoolExtra.fromCell(storage.extra);
    extra.wallets=finishWalletResolution(extra.wallets,in.senderAddress() as any_address,message.wallet);
    storage.extra=extra.toCell();
    if(!extra.wallets.resolutions.isEmpty()) {
        sendPoolExcesses(initiator,message.queryId,64);
    } else {
        sendRawMessage(buildPoolInitializationResult(initiator,message.queryId,0),64);
        storage.status=PoolInitialized{};
    }
    contract.setData(storage.toCell());
}

@inline
fun receivePoolNativePayment(storage:PoolStorage,message:PayNative,in:PoolInboundContext) {
    try {
        assert(storage.status is PoolInitialized) throw 22;
        assert(calculateGasFee(0,10000)+poolOriginalForwardFee() <= in.valueCoins()) throw 25;
        processPoolPayment(storage,in.senderAddress() as any_address,message.queryId,message.payout,
            message.payment,poolNoneAddress(),message.amount,poolOriginalForwardFee());
    } catch(code,value) {
        var excessesTo=in.senderAddress() as any_address;
        var reject:PoolPayoutOptions={destination:in.senderAddress() as any_address,extraGas:0,payload:null,wrapPayload:false};
        if(poolExceptionHasContext(value)) {(excessesTo,reject)=poolExceptionContext(value);}
        reserveToncoinsOnBalance(contract.getStoragePaidPayment(),4);
        val valueToSend=code == 25 ? 0 as coins : message.amount+reject.extraGas;
        val callback=beginCell().storeUint(0x10,6).storeSlice(reject.destination as slice).storeCoins(valueToSend)
            .storeUint(0x3216ca09,139).storeUint(message.queryId,64).storeCoins(message.amount)
            .storeInt(code,32).storeDict(reject.payload).endCell();
        sendRawMessage(callback,code == 25 ? 128 : 1);
        if(code != 25) {sendPoolExcesses(excessesTo,message.queryId,128);}
        commitContractDataAndActions();throw code;
    }
}

@inline
fun receivePoolJettonPayment(storage:PoolStorage,message:JettonNotification,in:PoolInboundContext) {
    try {
        assert(storage.status is PoolInitialized) throw 22;
        assert(calculateGasFee(0,15000)+poolOriginalForwardFee()+50000000 <= in.valueCoins()) throw 25;
        val forward=(message.payload is cell) ? message.payload.beginParse() : message.payload as slice;
        val routed=PoolRoutedJettonPayment.fromSlice(forward);
        val wallets=PoolExtra.fromCell(storage.extra).wallets;
        val asset=assetForRegisteredWallet(wallets,in.senderAddress() as any_address);
        processPoolPayment(storage,message.sender,message.queryId,routed.payout,routed.payment,asset,message.amount,poolOriginalForwardFee());
    } catch(code,value) {
        var excessesTo=message.sender;
        var reject:PoolPayoutOptions={destination:message.sender,extraGas:0,payload:null,wrapPayload:false};
        if(poolExceptionHasContext(value)) {(excessesTo,reject)=poolExceptionContext(value);}
        val forward=poolNotificationPayload(reject.payload,reject.wrapPayload,code);
        reserveToncoinsOnBalance(contract.getStoragePaidPayment(),4);
        val valueToSend=code == 25 ? 0 : 50000000+reject.extraGas;
        val customPayload:cell?=null;
        var transfer=beginCell().storeUint(0x0f8a7ea5,32).storeUint(message.queryId,64).storeCoins(message.amount)
            .storeSlice(reject.destination as slice).storeSlice(excessesTo as slice).storeDict(customPayload).storeCoins(reject.extraGas);
        forward.packToBuilder(mutate transfer);
        val body=transfer.endCell();
        val callback=beginCell().storeUint(0x10,6).storeSlice(in.senderAddress() as slice).storeCoins(valueToSend)
            .storeUint(1,107).storeRef(body).endCell();
        sendRawMessage(callback,code == 25 ? 128 : 1);
        if(code != 25) {sendPoolExcesses(excessesTo,message.queryId,128);}
        commitContractDataAndActions();throw code;
    }
}

// The caller still eagerly decodes the full message union and root storage.
@inline
fun handlePoolMessage(storage:PoolStorage,message:PoolMessage,in:PoolInboundContext) {
    match(message) {
        InitPool => initializePool(storage,message,in),
        TakeWalletAddress => receivePoolWallet(storage,message,in),
        PayNative => receivePoolNativePayment(storage,message,in),
        JettonNotification => receivePoolJettonPayment(storage,message,in),
        JoinLiquidity => joinPoolLiquidity(storage,message,in.senderAddress()),
        RefundDeposit => refundPoolDeposit(storage,message,in.senderAddress()),
        ClaimPositionFees => claimPoolPositionFees(storage,message,in.senderAddress(),in.valueCoins()),
        PayoutPositionFees => payoutPoolPositionFees(storage,message,in.senderAddress()),
        ClaimProtocolFees => claimPoolProtocolFees(storage,message,in.senderAddress(),in.valueCoins()),
        ClaimCreatorFees => claimPoolCreatorFees(storage,message,in.senderAddress(),in.valueCoins()),
        Withdraw => requestPoolWithdrawal(storage,message,in.senderAddress(),in.valueCoins()),
        ExitLiquidity => exitPoolLiquidity(storage,message,in.senderAddress()),
        ProvidePoolState => providePoolState(storage,message,in.senderAddress()),
        ClaimReward => claimPoolReward(storage,message,in.senderAddress(),in.valueCoins()),
        PayoutReward => payoutPoolReward(storage,message,in.senderAddress()),
        UpgradePool => upgradePool(storage,message,in.senderAddress()),
    }
}
