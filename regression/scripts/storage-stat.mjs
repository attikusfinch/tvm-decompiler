import { beginCell } from '@ton/core';
import { storeAccountStorage } from '@ton/core/dist/types/AccountStorage.js';

// Sandbox 0.45.0 creates synthetic accounts with used={cells:0,bits:0}.
// TON subtracts the old AccountStorage root's bit width when refs stay unchanged.
// Shrinking the balance can therefore underflow that synthetic counter.
export function initializeStorageStats(contract) {
    const shard = contract.account;
    const root = beginCell().store(storeAccountStorage(shard.account.storage)).endCell();
    const seen = new Set();
    let bits = 0n;
    function visit(cell) {
        const hash = cell.hash().toString('hex');
        if (seen.has(hash)) return;
        seen.add(hash);
        bits += BigInt(cell.bits.length);
        cell.refs.forEach(visit);
    }
    visit(root);
    shard.account.storageStats.used = { cells: BigInt(seen.size), bits };
    contract.account = shard;
}
