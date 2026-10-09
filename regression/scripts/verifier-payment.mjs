import {Address, beginCell, Cell, loadMessage, storeMessage} from '@ton/core';

export function validateQuote(quote, codeHash) {
    if (quote.status !== 'payment_required' || quote.code_hash !== codeHash ||
        quote.network !== 'testnet' || quote.comment !== 'acton-verify:v1:' + codeHash ||
        !/^\d+$/.test(quote.amount_nano) || BigInt(quote.amount_nano) <= 0n)
        throw new Error('Invalid testnet verification ticket');
    Address.parse(quote.payment_address);
    return quote;
}

export function normalizedExternalHash(boc, wallet) {
    const roots = Cell.fromBoc(Buffer.from(boc, 'base64'));
    if (roots.length !== 1) throw new Error('Expected one external message');
    const message = loadMessage(roots[0].beginParse());
    if (message.info.type !== 'external-in' || !message.info.dest.equals(Address.parse(wallet)))
        throw new Error('Wallet response has an unexpected external destination');
    // TEP-467: omit source/init, zero import fee, store body by reference.
    return beginCell().store(storeMessage({
        ...message, init: null, info: {...message.info, src: undefined, importFee: 0n},
    }, {forceRef: true})).endCell().hash().toString('hex');
}

function addressEqual(a, b) {
    try { return Address.parse(a).equals(Address.parse(b)); } catch { return false; }
}

export function expectedPayment(transaction, quote, wallet) {
    const incoming = transaction.in_msg;
    if (transaction.emulated !== false || transaction.finality !== 'finalized' ||
        transaction.description?.aborted !== false || !(transaction.mc_block_seqno > 0) ||
        !addressEqual(transaction.account, quote.payment_address) || !incoming || incoming.bounced !== false ||
        !addressEqual(incoming.destination, quote.payment_address) || !addressEqual(incoming.source, wallet)) return false;
    try {
        if (!/^\d+$/.test(incoming.value) || BigInt(incoming.value) < BigInt(quote.amount_nano)) return false;
        let comment = incoming.message_content?.decoded?.comment ?? incoming.message_content?.decoded?.text;
        if (comment === undefined && incoming.message_content?.body) {
            const slice = Cell.fromBase64(incoming.message_content.body).beginParse();
            if (slice.loadUint(32) !== 0) return false;
            comment = slice.loadStringTail();
        }
        return comment === quote.comment;
    } catch { return false; }
}
