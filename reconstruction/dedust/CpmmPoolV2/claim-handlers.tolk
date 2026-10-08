// Readable fee/reward/state handlers; whole-Pool byte identity is still pending.
import "@stdlib/gas-payments"
import "storage"
import "messages"
import "addresses"
import "compat-address"
import "liquidity-handlers"
import "rewards"
import "wallets"
import "settlement"
import "payment"
import "transfers"
import "payout-config"

@inline
fun poolStandardAddressOrFallback(value:any_address,fallback:any_address):any_address {
    return value.isInternal() ? value : fallback;
}

@overflow1023_policy("suppress")
struct (0x25f19752) PoolClaimAvailableFees {
    queryId:uint64
    excessesTo:any_address
    xCheckpoint:varuint32
    yCheckpoint:varuint32
}

@inline
fun claimPoolPositionFees(storage:PoolStorage,message:ClaimPositionFees,sender:any_address,incomingValue:coins) {
    assert(storage.status is PoolInitialized) throw 22;
    val config=PoolConfig.fromCell(storage.config);
    val assetsToPay=(config.feeIn is FeeFromBoth) ? 2 : 1;
    val budget=contract.getStoragePaidPayment()+calculateGasFee(0,11500)+calculateGasFee(0,6500)+calculateGasFee(0,21000)+assetsToPay*50000000;
    assert(budget <= incomingValue) throw 25;
    val fees=PoolFees.fromCell(storage.fees);
    val destination=positionDeployment(sender).calculateArchivedAddress();
    val excessesTo=poolStandardAddressOrFallback(message.excessesTo,sender);
    val body=PoolClaimAvailableFees{queryId:message.queryId,excessesTo,xCheckpoint:fees.xCheckpoint,yCheckpoint:fees.yCheckpoint}.toCell();
    val output=beginCell().storeUint(0x10,6).storeSlice(destination as slice).storeUint(1,111).storeRef(body).endCell();
    sendRawMessage(output,64);
}

@inline
fun payoutPoolPositionFees(storage:PoolStorage,message:PayoutPositionFees,sender:any_address) {
    assertPoolDeploymentSender(positionDeployment(message.owner),sender);
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    settlePoolAssets(message.queryId,storage.config,wallets,message.x,message.y,
        {destination:message.owner,extraGas:0,payload:null,wrapPayload:false},message.excessesTo,false);
}

@inline
fun claimPoolProtocolFees(storage:PoolStorage,message:ClaimProtocolFees,sender:any_address,incomingValue:coins) {
    assert(storage.status is PoolInitialized) throw 22;
    val extra=PoolExtra.fromCell(storage.extra);
    assert((sender as slice).bitsEqual(extra.controller as slice)) throw 23;
    val config=PoolConfig.fromCell(storage.config);
    val assetsToPay=(config.feeIn is FeeFromBoth) ? 2 : 1;
    assert(contract.getStoragePaidPayment()+calculateGasFee(0,22000)+assetsToPay*50000000 <= incomingValue) throw 25;
    var fees=PoolFees.fromCell(storage.fees);
    val to=poolStandardAddressOrFallback(message.to,sender);
    val excessesTo=poolStandardAddressOrFallback(message.excessesTo,sender);
    settlePoolAssets(message.queryId,storage.config,extra.wallets,fees.protocolX,fees.protocolY,
        {destination:to,extraGas:0,payload:null,wrapPayload:false},excessesTo,false);
    fees.protocolX=0;fees.protocolY=0;
    storage.fees=fees.toCell();contract.setData(storage.toCell());
}

@inline
fun claimPoolCreatorFees(storage:PoolStorage,message:ClaimCreatorFees,sender:any_address,incomingValue:coins) {
    assert(storage.status is PoolInitialized) throw 22;
    val config=PoolConfig.fromCell(storage.config);
    assert((sender as slice).bitsEqual(config.creator as slice)) throw 23;
    val assetsToPay=(config.feeIn is FeeFromBoth) ? 2 : 1;
    assert(contract.getStoragePaidPayment()+calculateGasFee(0,22000)+assetsToPay*50000000 <= incomingValue) throw 25;
    var fees=PoolFees.fromCell(storage.fees);
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    val to=poolStandardAddressOrFallback(message.to,sender);
    val excessesTo=poolStandardAddressOrFallback(message.excessesTo,sender);
    settlePoolAssets(message.queryId,storage.config,wallets,fees.creatorX,fees.creatorY,
        {destination:to,extraGas:0,payload:null,wrapPayload:false},excessesTo,false);
    fees.creatorX=0;fees.creatorY=0;
    storage.fees=fees.toCell();contract.setData(storage.toCell());
}

@overflow1023_policy("suppress")
struct (0x2e0cccba) PoolClaimPositionReward {
    queryId:uint64
    rewardId:uint2
    remainingTime:uint40
    remainingBudget:coins
    checkpoint:varuint32
    lastUpdate:uint40
    excessesTo:any_address
}

@inline
fun claimPoolReward(storage:PoolStorage,message:ClaimReward,sender:any_address,incomingValue:coins,originalForwardFee:coins) {
    assert(storage.status is PoolInitialized) throw 22;
    val budget=contract.getStoragePaidPayment()+(originalForwardFee << 2)+calculateGasFee(0,18500)+
        calculateGasFee(0,10000)+calculateGasFee(0,19000)+50000000;
    assert(budget <= incomingValue) throw 25;
    val reward=accruePoolReward(storage.rewards.mustGet(message.rewardId,46),storage.liquidity);
    storage.rewards.set(message.rewardId,reward);contract.setData(storage.toCell());
    reserveToncoinsOnBalance(contract.getStoragePaidPayment(),4);
    val destination=positionDeployment(sender).calculateArchivedAddress();
    val excessesTo=poolStandardAddressOrFallback(message.excessesTo,sender);
    val body=PoolClaimPositionReward{queryId:message.queryId,rewardId:message.rewardId,
        remainingTime:reward.remainingTime,remainingBudget:reward.remainingBudget,checkpoint:reward.checkpoint,lastUpdate:reward.lastUpdate,excessesTo}.toCell();
    val output=beginCell().storeUint(0x10,6).storeSlice(destination as slice).storeUint(1,111).storeRef(body).endCell();
    sendRawMessage(output,128);
}

@inline
fun payoutPoolReward(storage:PoolStorage,message:PayoutReward,sender:any_address) {
    assertPoolDeploymentSender(positionDeployment(message.owner),sender);
    val config=PoolConfig.fromCell(storage.config);
    val asset=config.allowedRewards.mustGet(message.rewardId,42).asset;
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    val previousBalance=contract.getOriginalBalance()+contract.getStoragePaidPayment()-poolIncomingCoins();
    val wallet=poolWalletForAsset(wallets,asset);
    // Unlike two-asset settlement, this handler sends even a zero amount.
    val (principal,fee)=sendPoolPayment(asset,wallet,message.amount,
        {destination:message.owner,extraGas:0,payload:null,wrapPayload:false},message.excessesTo,message.queryId,0);
    reserveToncoinsOnBalance(previousBalance+fee-principal,2);
    sendPoolExcesses(message.excessesTo,message.queryId,128);
}

@inline
fun providePoolState(storage:PoolStorage,message:ProvidePoolState,sender:any_address) {
    reserveToncoinsOnBalance(contract.getStoragePaidPayment(),4);
    val config=message.includeConfig ? storage.config : null;
    val fees=message.includeFees ? storage.fees : null;
    val codeHash=message.includeCodeHash ? contract.getCode().hash() : null;
    var body=beginCell().storeUint(0x870a9579,32).storeUint(message.queryId,64);
    if(storage.status is PoolUninitialized) {body.storeUint(0,2);}
    else if(storage.status is PoolInitializing) {body.storeUint(1,2).storeSlice(storage.status.initiator as slice);}
    else {body.storeUint(2,2);}
    body.storeBool(storage.depositActive).storeBool(storage.swapActive).storeCoins(storage.liquidity)
        .storeCoins(storage.reserveX).storeCoins(storage.reserveY).storeDict(config).storeDict(fees);
    body.storeBool(message.includeRewards);
    if(message.includeRewards) {body.storeDict(storage.rewards.toLowLevelDict());}
    body.storeBool(codeHash != null);
    if(codeHash != null) {body.storeUint(codeHash!,256);}
    val output=beginCell().storeUint(0x10,6).storeSlice(sender as slice).storeUint(1,111).storeRef(body.endCell()).endCell();
    sendRawMessage(output,128);
}

@inline
fun upgradePool(storage:PoolStorage,message:UpgradePool,sender:any_address) {
    val extra=PoolExtra.fromCell(storage.extra);
    assert((extra.controller as slice).bitsEqual(sender as slice)) throw 23;
    contract.setCodePostponed(message.code);
    sendPoolExcesses(sender,message.queryId,128);
}
