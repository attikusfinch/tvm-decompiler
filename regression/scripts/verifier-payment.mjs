import {Address, beginCell, Cell, loadMessage, storeMessage} from '@ton/core';

export function paymentNetwork(network) {
    if (network === 'mainnet') return {chain: '-239', toncenter: 'https://toncenter.com'};
    if (network === 'testnet') return {chain: '-3', toncenter: 'https://testnet.toncenter.com'};
    throw new Error('Unsupported payment network: ' + network);
}

export function validateQuote(quote, codeHash, requiredNetwork = 'mainnet') {
    paymentNetwork(requiredNetwork);
    if (quote.network !== requiredNetwork)
        throw new Error('Verifier issued a ' + quote.network + ' ticket; ' + requiredNetwork + ' payment is required');
    if (quote.status !== 'payment_required' || quote.code_hash !== codeHash ||
        quote.comment !== 'acton-verify:v1:' + codeHash ||
        !/^\d+$/.test(quote.amount_nano) || BigInt(quote.amount_nano) <= 0n)
        throw new Error('Invalid ' + requiredNetwork + ' verification ticket');
    Address.parse(quote.payment_address);
    return quote;
}

export function paymentTransaction(quote, codeHash, wallet, chain, requiredNetwork = 'mainnet') {
    const network = paymentNetwork(requiredNetwork);
    if (chain !== network.chain) throw new Error('Connect a ' + requiredNetwork + ' wallet');
    validateQuote(quote, codeHash, requiredNetwork);
    return {
        validUntil: Math.floor(Date.now() / 1000) + 300, network: network.chain,
        from: Address.parse(wallet).toRawString(),
        messages: [{address: Address.parse(quote.payment_address).toString({testOnly: requiredNetwork === 'testnet', bounceable: true}),
            amount: quote.amount_nano, payload: beginCell().storeUint(0, 32).storeStringTail(quote.comment).endCell().toBoc().toString('base64')}],
    };
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
