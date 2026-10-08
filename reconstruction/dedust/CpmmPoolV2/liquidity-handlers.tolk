// Readable liquidity handlers; whole-Pool byte identity is still pending.
import "@stdlib/gas-payments"
import "storage"
import "messages"
import "addresses"
import "compat-address"
import "rewards"
import "wallets"
import "settlement"
import "payout-config"
import "payout-basic"
import "events"
import "math"
import "transaction-context"

@inline
fun assertPoolDeploymentSender(deployment:AutoDeployAddress,sender:any_address) {
    val expected=deployment.calculateArchivedAddress();
    val (expectedWorkchain,expectedHash)=expected.getWorkchainAndHash();
    val (senderWorkchain,senderHash)=sender.getWorkchainAndHash();
    val shard=deployment.toShard;
    val mask=shard == null ? -1 : (1 << (256-shard!.fixedPrefixLength))-1;
    // The archived check ignores the shard prefix on both addresses.
    assert(senderWorkchain == expectedWorkchain && (senderHash & mask) == (expectedHash & mask)) throw 23;
}

@overflow1023_policy("suppress")
struct (0x855afcbd) PoolCreditLiquidity {
    queryId:uint64
    liquidity:coins
    lockedShare:uint16
    notifyGas:coins
    payload:cell?
    receiver:any_address
    xCheckpoint:varuint32
    yCheckpoint:varuint32
    rewards:map<uint2,PoolReward>
}

@inline
fun joinPoolLiquidity(storage:PoolStorage,message:JoinLiquidity,sender:any_address) {
    val deposit=InitialDepositConfig.fromCell(message.config);
    assertPoolDeploymentSender(depositDeployment(message.initiator,deposit.targetX,deposit.targetY,
        deposit.minimalLiquidity,deposit.lockedShare,deposit.payout),sender);
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    try {
        val rewards=synchronizePoolRewards(storage.rewards,storage.liquidity);
        var usedX=message.x;var usedY=message.y;
        var minted:coins;
        if(storage.liquidity == 0) {minted=poolLiquiditySqrt(message.x*message.y);}
        else {
            usedX=min(message.x,mulDivFloor(message.y,storage.reserveX,storage.reserveY));
            usedY=min(message.y,mulDivFloor(usedX,storage.reserveY,storage.reserveX));
            minted=min(mulDivFloor(usedX,storage.liquidity,storage.reserveX),mulDivFloor(usedY,storage.liquidity,storage.reserveY));
        }
        val checkedDeposit=InitialDepositConfig.fromCell(message.config);
        assert(minted > 0 && minted >= checkedDeposit.minimalLiquidity) throw 30;
        storage.reserveX+=usedX;storage.reserveY+=usedY;storage.liquidity+=minted;
        storage.rewards=rewards;storage.depositActive=true;
        contract.setData(storage.toCell());
        val payout=PoolExtendedPayout.fromCell(checkedDeposit.payout);
        val nextState=beginCell().storeCoins(storage.reserveX).storeCoins(storage.reserveY).storeCoins(storage.liquidity).storeRef(storage.fees).endCell();
        emitPoolDeposit({amountX:usedX,amountY:usedY,liquidity:minted,initiator:message.initiator,
            recipient:payout.fulfill.destination,nextState});
        settlePoolAssets(message.queryId,storage.config,wallets,message.x-usedX,message.y-usedY,payout.fulfill,payout.excessesTo,true);
        val fees=PoolFees.fromCell(storage.fees);
        val position=positionDeployment(payout.fulfill.destination);
        createMessage({bounce:BounceMode.NoBounce,value:0,dest:position,body:PoolCreditLiquidity{
            queryId:message.queryId,liquidity:minted,lockedShare:checkedDeposit.lockedShare,notifyGas:payout.fulfill.extraGas,
            payload:payout.fulfill.payload,receiver:payout.excessesTo,xCheckpoint:fees.xCheckpoint,yCheckpoint:fees.yCheckpoint,rewards,
        }}).send(128);
    } catch(code,value) {
        val rejected=InitialDepositConfig.fromCell(message.config);
        val payout=PoolExtendedPayout.fromCell(rejected.payout);
        settlePoolAssets(message.queryId,storage.config,wallets,message.x,message.y,payout.reject,payout.excessesTo,false);
        commitContractDataAndActions();throw code;
    }
}

@inline
fun refundPoolDeposit(storage:PoolStorage,message:RefundDeposit,sender:any_address) {
    val deposit=InitialDepositConfig.fromCell(message.config);
    assertPoolDeploymentSender(depositDeployment(message.initiator,deposit.targetX,deposit.targetY,
        deposit.minimalLiquidity,deposit.lockedShare,deposit.payout),sender);
    val checkedDeposit=InitialDepositConfig.fromCell(message.config);
    val payout=PoolExtendedPayout.fromCell(checkedDeposit.payout);
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    settlePoolAssets(message.queryId,storage.config,wallets,message.x,message.y,payout.reject,payout.excessesTo,false);
}

struct (0xbc1531a9) PoolWithdrawLiquidity {
    queryId:uint64
    liquidity:coins
    minX:coins
    minY:coins
    xCheckpoint:varuint32
    yCheckpoint:varuint32
    rewards:map<uint2,PoolReward>
    claimFees:bool
    payout:cell
}

@inline
fun requestPoolWithdrawal(storage:PoolStorage,message:Withdraw,sender:any_address,incomingValue:coins) {
    assert(storage.status is PoolInitialized) throw 22;
    storage.rewards=synchronizePoolRewards(storage.rewards,storage.liquidity);
    contract.setData(storage.toCell());
    val payout=normalizePoolBasicPayout(PoolBasicPayout.fromCell(message.payout),sender);
    val budget=contract.getStoragePaidPayment()+(poolOriginalForwardFee() << 2)+calculateGasFee(0,25000)+
        calculateGasFee(0,20000)+calculateGasFee(0,29000)+((50000000+payout.options.extraGas) << 1);
    assert(budget <= incomingValue) throw 25;
    val fees=PoolFees.fromCell(storage.fees);
    val destination=positionDeployment(sender).calculateArchivedAddress();
    val body=PoolWithdrawLiquidity{queryId:message.queryId,liquidity:message.liquidity,minX:message.minX,minY:message.minY,
        xCheckpoint:fees.xCheckpoint,yCheckpoint:fees.yCheckpoint,rewards:storage.rewards,claimFees:message.claimFees,payout:payout.toCell()}.toCell();
    val output=beginCell().storeUint(0x10,6).storeSlice(destination as slice).storeUint(1,111).storeRef(body).endCell();
    sendRawMessage(output,64);
}

@inline
fun exitPoolLiquidity(storage:PoolStorage,message:ExitLiquidity,sender:any_address) {
    assertPoolDeploymentSender(positionDeployment(message.owner),sender);
    val amountX=mulDivFloor(storage.reserveX,message.liquidity,storage.liquidity);
    val amountY=mulDivFloor(storage.reserveY,message.liquidity,storage.liquidity);
    assert(amountX >= message.minX && amountY >= message.minY) throw 30;
    storage.reserveX-=amountX;storage.reserveY-=amountY;storage.liquidity-=message.liquidity;
    contract.setData(storage.toCell());
    val payout=PoolBasicPayout.fromCell(message.payout);
    val nextState=beginCell().storeCoins(storage.reserveX).storeCoins(storage.reserveY).storeCoins(storage.liquidity).storeRef(storage.fees).endCell();
    emitPoolWithdrawal({liquidity:message.liquidity,amountX,amountY,initiator:message.owner,recipient:payout.options.destination,nextState});
    val wallets=PoolExtra.fromCell(storage.extra).wallets;
    settlePoolAssets(message.queryId,storage.config,wallets,amountX+message.xFees,amountY+message.yFees,payout.options,payout.excessesTo,false);
}
