import "payout-config"

struct PoolBasicPayout {
    options: PoolPayoutOptions
    excessesTo: any_address
}

@inline_ref
fun normalizePoolBasicPayout(payout: PoolBasicPayout, fallback: any_address): PoolBasicPayout {
    if (!payout.options.destination.isInternal()) { payout.options.destination = fallback; }
    if (!payout.excessesTo.isInternal()) { payout.excessesTo = fallback; }
    return payout;
}
