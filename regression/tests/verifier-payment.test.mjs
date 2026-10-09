import test from 'node:test';
import assert from 'node:assert/strict';
import {Address, beginCell, Cell, external, storeMessage} from '@ton/core';
import {expectedPayment, normalizedExternalHash, paymentNetwork, paymentTransaction, validateQuote} from '../scripts/verifier-payment.mjs';

const recipient = '0:' + 'aa'.repeat(32), wallet = '0:' + 'bb'.repeat(32), hash = 'cc'.repeat(32);
const quote = {status: 'payment_required', code_hash: hash, network: 'testnet',
    payment_address: recipient, amount_nano: '5000000000', comment: 'acton-verify:v1:' + hash};
const payment = () => ({account: recipient, emulated: false, finality: 'finalized', mc_block_seqno: 123,
    description: {aborted: false}, in_msg: {source: wallet, destination: recipient, bounced: false,
        value: '5000000000', message_content: {decoded: {comment: quote.comment}}}});

test('tickets must target the requested code hash in testnet with a positive amount', () => {
    assert.equal(validateQuote(quote, hash), quote);
    for (const change of [{network: 'mainnet'}, {code_hash: '00'.repeat(32)}, {comment: 'other'},
        {amount_nano: '-1'}, {amount_nano: '0'}, {payment_address: 'bad'}])
        assert.throws(() => validateQuote({...quote, ...change}, hash));
});

test('testnet payment preserves the quote and refuses a mainnet ticket or wallet', () => {
    const tx = paymentTransaction(quote, hash, wallet, '-3');
    assert.equal(tx.network, '-3');
    assert.equal(tx.from, wallet);
    assert.equal(tx.messages.length, 1);
    assert.equal(tx.messages[0].amount, quote.amount_nano);
    const address = Address.parseFriendly(tx.messages[0].address);
    assert.equal(address.isTestOnly, true);
    assert.equal(address.address.toRawString(), recipient);
    const payload = Cell.fromBase64(tx.messages[0].payload).beginParse();
    assert.equal(payload.loadUint(32), 0);
    assert.equal(payload.loadStringTail(), quote.comment);
    assert.throws(() => paymentTransaction({...quote, network: 'mainnet'}, hash, wallet, '-3'), /mainnet ticket/);
    assert.throws(() => paymentTransaction(quote, hash, wallet, '-239'), /testnet wallet/);
    assert.equal(paymentNetwork(quote.network).toncenter, 'https://testnet.toncenter.com');
    assert.throws(() => paymentNetwork('other'));
});

test('an explicitly selected mainnet payment still requires a mainnet ticket and wallet', () => {
    const mainnetQuote = {...quote, network: 'mainnet'};
    const tx = paymentTransaction(mainnetQuote, hash, wallet, '-239', 'mainnet');
    assert.equal(tx.network, '-239');
    assert.equal(Address.parseFriendly(tx.messages[0].address).isTestOnly, false);
    assert.throws(() => paymentTransaction(quote, hash, wallet, '-239', 'mainnet'), /testnet ticket/);
    assert.throws(() => paymentTransaction(mainnetQuote, hash, wallet, '-3', 'mainnet'), /mainnet wallet/);
});

test('only the finalized recipient transaction with correct payer, value and comment is accepted', () => {
    assert.equal(expectedPayment(payment(), quote, wallet), true);
    for (const change of [{emulated: true}, {finality: 'pending'}, {mc_block_seqno: 0},
        {description: {aborted: true}}, {account: wallet}])
        assert.equal(expectedPayment({...payment(), ...change}, quote, wallet), false);
    for (const change of [{source: recipient}, {destination: wallet}, {bounced: true},
        {value: '4999999999'}, {value: null}, {message_content: {decoded: {comment: 'different'}}}]) {
        const tx = payment(); Object.assign(tx.in_msg, change);
        assert.equal(expectedPayment(tx, quote, wallet), false);
    }
    const tx = payment(); tx.in_msg.message_content = {
        body: beginCell().storeUint(0, 32).storeStringTail(quote.comment).endCell().toBoc().toString('base64')};
    assert.equal(expectedPayment(tx, quote, wallet), true);
    tx.in_msg.value = '5000000001'; assert.equal(expectedPayment(tx, quote, wallet), true);
});

test('TEP-467 hash ignores init/import fee but retains wallet destination and signed body', () => {
    const body = beginCell().storeUint(7, 32).endCell();
    const message = external({to: Address.parse(wallet), body});
    const boc = msg => beginCell().store(storeMessage(msg)).endCell().toBoc().toString('base64');
    const baseline = normalizedExternalHash(boc(message), wallet);
    assert.equal(normalizedExternalHash(boc({...message, init: {code: body, data: body},
        info: {...message.info, importFee: 123n}}), wallet), baseline);
    assert.notEqual(normalizedExternalHash(boc({...message, body: beginCell().storeUint(8, 32).endCell()}), wallet), baseline);
    assert.throws(() => normalizedExternalHash(boc(message), recipient));
});
