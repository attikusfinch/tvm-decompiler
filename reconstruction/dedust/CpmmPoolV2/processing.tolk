// Payment dispatcher candidate. Isolated state/actions and economic expectations
// are tested; exact gas, complete outgoing balances and byte identity are pending.
// This file is not a complete Pool contract.
import "@stdlib/gas-payments"
import "storage"
import "routing"
import "payment"
import "payout-config"
import "settlement"
import "transfers"
import "rewards"
import "reward-config"
import "addresses"
import "compat-address"
import "affiliate-deployment"
import "events"

struct (0xc9a015da) PoolDepositPayload {
    targetX: coins
    targetY: coins
    minimalLiquidity: coins
    lockedShare: uint16
}

struct (0x2eb87df9) PoolRewardFundingPayload { finishAt: uint40 }
type PoolPaymentRequest = PoolDepositPayload | PoolSwapPayload | PoolRewardFundingPayload

struct ReservedPoolDispatchVariant {}
@inline
fun registerPoolDispatchLayout(value: ReservedPoolDispatchVariant | PoolDepositPayload): bool {
    return value is ReservedPoolDispatchVariant;
}

fun PoolOptionalPartner.unpackFromSlice(mutate s: slice): PoolOptionalPartner {
    return s.loadUint(1) != 0 ? PoolSwapPartner{identity:s.loadUint(256),fee:s.loadUint(16)} : null;
}

fun PoolOptionalReferrer.unpackFromSlice(mutate s: slice): PoolOptionalReferrer {
    return s.loadUint(1) != 0 ? PoolSwapReferrer{identity:s.loadUint(256),fee:s.loadUint(16)} : null;
}

// The tagged payment union strips the opcode before invoking this field codec.
fun PoolSwapPayload.unpackFromSlice(mutate s: slice): PoolSwapPayload {
    return {minimalAmountOut:s.loadCoins(),deadline:s.loadUint(40),next:s.loadDict(),
        partner:s.loadAny<PoolOptionalPartner>(),referrer:s.loadAny<PoolOptionalReferrer>()};
}

struct (0x01) PoolActivationAtTime { time: uint40 }
struct (0x02) PoolActivationByInitiator { initiator: any_address }
type PoolActivation = PoolActivationAtTime | PoolActivationByInitiator

struct PoolSwapStep {
    pool: any_address
    minimalAmountOut: coins
    deadline: uint40
    next: cell?
}

struct PoolUpdatedState {
    reserveX: coins
    reserveY: coins
    liquidity: coins
    fees: cell
}

struct PoolSwapFeeBreakdown {
    isX: bool
    lp: coins
    creator: coins
    protocol: coins
    partner: coins
    referrer: coins
}

struct (0xdc5ddba1) PoolCreditDeposit { queryId: uint64; isX: bool; amount: coins }

fun poolPaymentRejectContext(excessesTo:any_address,options:PoolPayoutOptions):unknown
    asm "5 TUPLE"

@inline
fun poolActivationAllows(activation: cell, initiator: any_address): bool {
    val gate=PoolActivation.fromCell(activation);
    return match(gate) {
        PoolActivationAtTime => gate.time <= blockchain.now(),
        PoolActivationByInitiator => (gate.initiator as slice).bitsEqual(initiator as slice),
    };
}

@inline
fun sendPoolAffiliateFee(kind: int, identity: uint256, fee: uint16, amount: coins, queryId: uint64) {
    val destination=affiliateDeployment(kind,identity,fee).calculateArchivedAddress();
    val message=beginCell().storeUint(0x18,6).storeSlice(destination as slice).storeCoins(amount)
        .storeUint(0x773faf30,139).storeUint(queryId,64).endCell();
    sendRawMessage(message,2);
}

@method_id(20)
fun processPoolPayment(
    storage: PoolStorage,
    initiator: any_address,
    queryId: uint64,
    payoutCell: cell,
    paymentCell: cell,
    asset: any_address,
    amount: coins,
    originalForwardFee: coins,
) {
    val request=PoolPaymentRequest.fromCell(paymentCell);
    val payout=normalizePoolPayout(PoolExtendedPayout.fromCell(payoutCell),initiator);
    try {
        assert(amount > 0) throw 47;
        val config=PoolConfig.fromCell(storage.config,{assertEndAfterReading:false});
        if(request is PoolSwapPayload) {
            val nativeInput=asset.isNone() ? amount as int : 0;
            val maxPayoutGas=max(payout.fulfill.extraGas,payout.reject.extraGas);
            val hops=request.next == null ? 1 : request.next!.depth()+2;
            val minimumValue=contract.getStoragePaidPayment()+nativeInput+
                hops*(calculateGasFee(0,45000)+50000000+originalForwardFee)+maxPayoutGas;
            assert(minimumValue <= poolIncomingCoins()) throw 25;
            val xToY=(asset as slice).bitsEqual(config.assetX as slice);
            assert(xToY || (asset as slice).bitsEqual(config.assetY as slice)) throw 28;
            assert(storage.liquidity > 0) throw 34;
            if(!storage.swapActive && config.swapActivation != null) {
                assert(poolActivationAllows(config.swapActivation!,initiator)) throw 37;
                storage.swapActive=true;
            }
            assert(request.deadline == 0 || blockchain.now() < request.deadline) throw 33;
            val outputReserve=xToY ? storage.reserveY : storage.reserveX;
            val inputReserve=xToY ? storage.reserveX : storage.reserveY;
            val feeFromInput=match(config.feeIn) {
                FeeFromBoth => true,
                FeeFromX => xToY,
                FeeFromY => !xToY,
            };
            val feeFromY=xToY ^ feeFromInput;
            val feeAsset=feeFromY ? config.assetY : config.assetX;
            var partnerRate=0;
            var referrerRate=0;
            if(feeAsset.isNone() && request.partner != null) {
                partnerRate=min(request.partner!.fee,500);
                if(request.referrer != null) {referrerRate=min(request.referrer!.fee,8000);}
            }
            val effectivePartnerRate=referrerRate > 0 ? mulDivFloor(partnerRate,5,6) : partnerRate;
            val totalRate=effectivePartnerRate+config.baseFee;
            val netInput=feeFromInput ? mulDivFloor(amount,10000,10000+totalRate) : amount as int;
            val grossOutput=mulDivFloor(netInput,outputReserve,inputReserve+netInput);
            val netOutput=feeFromInput ? grossOutput : mulDivFloor(grossOutput,10000,10000+totalRate);
            assert(netOutput >= request.minimalAmountOut) throw 30;
            val totalFee=feeFromInput ? (amount as int)-netInput : grossOutput-netOutput;
            val baseFee=mulDivFloor(totalFee,config.baseFee,totalRate);
            val protocolFee=mulDivFloor(baseFee,20,100);
            val creatorFee=mulDivFloor(baseFee-protocolFee,config.creatorFee,10000);
            val lpFee=baseFee-protocolFee-creatorFee;
            val affiliateFee=totalFee-baseFee;
            val referrerFee=mulDivFloor(mulDivFloor(affiliateFee,6,5),referrerRate,10000);
            val partnerFee=affiliateFee-referrerFee;
            var fees=PoolFees.fromCell(storage.fees);
            if(feeFromY) {
                fees.protocolY+=protocolFee;fees.creatorY+=creatorFee;
                fees.yCheckpoint+=mulDivFloor(lpFee,1 << 120,storage.liquidity);
            } else {
                fees.protocolX+=protocolFee;fees.creatorX+=creatorFee;
                fees.xCheckpoint+=mulDivFloor(lpFee,1 << 120,storage.liquidity);
            }
            // Preserve the archived nesting: referrer sends occur only within
            // the positive-partner-fee branch, even at rounding boundaries.
            if(partnerFee > 0) {
                sendPoolAffiliateFee(POOL_PARTNER_TAG,request.partner!.identity,request.partner!.fee,partnerFee,queryId);
                if(referrerFee > 0) {
                    sendPoolAffiliateFee(POOL_REFERRER_TAG,request.referrer!.identity,request.referrer!.fee,referrerFee,queryId);
                }
            }
            if(xToY) {storage.reserveX+=netInput;storage.reserveY-=grossOutput;}
            else {storage.reserveX-=grossOutput;storage.reserveY+=netInput;}
            storage.fees=fees.toCell();
            contract.setData(storage.toCell());
            val state=PoolUpdatedState{reserveX:storage.reserveX,reserveY:storage.reserveY,liquidity:storage.liquidity,fees:storage.fees}.toCell();
            val breakdown=PoolSwapFeeBreakdown{isX:!feeFromY,lp:lpFee,creator:creatorFee,protocol:protocolFee,partner:partnerFee,referrer:referrerFee}.toCell();
            val eventFee=emitPoolSwap({xToY,amountIn:amount,amountOut:netOutput,initiator,
                recipient:payout.fulfill.destination,nextState:state,fees:breakdown});
            val wallets=PoolExtra.fromCell(storage.extra).wallets;
            val outputAsset=xToY ? config.assetY : config.assetX;
            val previousBalance=contract.getOriginalBalance()-poolIncomingCoins()+contract.getStoragePaidPayment();
            if(request.next == null) {
                val wallet=poolWalletForAsset(wallets,outputAsset);
                val (principal,forwardFee)=sendPoolPayment(outputAsset,wallet,netOutput,payout.fulfill,payout.excessesTo,queryId,0);
                reserveToncoinsOnBalance(previousBalance+nativeInput+eventFee+forwardFee-principal-partnerFee-referrerFee,2);
                sendPoolExcesses(payout.excessesTo,queryId,128);
            } else {
                val nativeOutput=outputAsset.isNone() ? netOutput : 0;
                reserveToncoinsOnBalance(previousBalance+eventFee-nativeOutput+nativeInput-partnerFee-referrerFee,2);
                val step=PoolSwapStep.fromCell(request.next!);
                val wallet=poolWalletForAsset(wallets,outputAsset);
                val gas=poolIncomingCoins()-contract.getStoragePaidPayment()-calculateGasFee(0,45000)-eventFee-nativeInput+nativeOutput;
                routePoolSwap(outputAsset,step.pool,wallet,payout.excessesTo,queryId,netOutput,
                    {minimalAmountOut:step.minimalAmountOut,deadline:step.deadline,next:step.next,partner:request.partner,referrer:request.referrer},
                    payout.toCell(),gas);
            }
        } else if(request is PoolDepositPayload) {
            val nativeInput=asset.isNone() ? amount as int : 0;
            val deploymentCosts=contract.getStoragePaidPayment()+nativeInput+calculateGasFee(0,20000)+(originalForwardFee << 2)+
                calculateForwardFeeWithoutLumpPrice(0,5294,15)+calculateGasFee(0,6000)+calculateGasFee(0,40000);
            val firstReply=calculateForwardFeeWithoutLumpPrice(0,13789,34)+calculateGasFee(0,20000)+50000000+payout.fulfill.extraGas;
            val refunds=(50000000+payout.reject.extraGas) << 1;
            assert(deploymentCosts+max(firstReply,refunds) <= poolIncomingCoins()) throw 25;
            val isX=(asset as slice).bitsEqual(config.assetX as slice);
            assert(isX || (asset as slice).bitsEqual(config.assetY as slice)) throw 28;
            if(!storage.depositActive && config.depositActivation != null) {
                assert(poolActivationAllows(config.depositActivation!,initiator)) throw 38;
            }
            reserveToncoinsOnBalance(contract.getStoragePaidPayment()+nativeInput,4);
            val destination=depositDeployment(initiator,request.targetX,request.targetY,request.minimalLiquidity,request.lockedShare,payout.toCell());
            createMessage({bounce:BounceMode.NoBounce,value:0,dest:destination,
                body:PoolCreditDeposit{queryId,isX,amount}}).send(144);
        } else {
            val nativeInput=asset.isNone() ? amount as int : 0;
            assert(contract.getStoragePaidPayment()+calculateGasFee(0,25000)+nativeInput <= poolIncomingCoins()) throw 25;
            val (allowed,slot)=findAllowedPoolReward(config,asset);
            val duration=max(request.finishAt-blockchain.now(),0);
            assert(duration <= allowed.maxDuration) throw 43;
            var reward=accruePoolReward(poolRewardOrEmpty(storage.rewards,slot),storage.liquidity);
            assert(duration > 0 || reward.remainingTime > 0) throw 44;
            val previousRate=reward.remainingTime > 0 && reward.remainingBudget > 0
                ? mulDivFloor(reward.remainingBudget,1 << 120,reward.remainingTime) : 0;
            val extension=max(duration-reward.remainingTime,0);
            assert(extension == 0 || mulDivFloor(previousRate,extension,1 << 120) <= amount) throw 45;
            reward.remainingBudget+=amount;reward.remainingTime+=extension;
            storage.rewards.set(slot,reward);
            contract.setData(storage.toCell());
            reserveToncoinsOnBalance(contract.getStoragePaidPayment()+nativeInput,4);
            sendPoolExcesses(initiator,queryId,130);
        }
    } catch(code,ignored) {
        throw(code,poolPaymentRejectContext(payout.excessesTo,payout.reject));
    }
}
