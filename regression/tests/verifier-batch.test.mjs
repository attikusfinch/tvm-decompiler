import test from 'node:test';
import assert from 'node:assert/strict';
import {Address, beginCell, Cell, external, storeMessage} from '@ton/core';
import {publicationBatches} from '../scripts/verifier-batch.mjs';
import {expectedPayment, sharedPaymentTrace} from '../scripts/verifier-payment.mjs';

const wallet = '0:' + 'bb'.repeat(32), recipient = '0:' + 'aa'.repeat(32);
const boc = (destination = wallet, value = 7) => beginCell().store(storeMessage(external({
    to: Address.parse(destination), body: beginCell().storeUint(value, 32).endCell(),
}))).endCell().toBoc().toString('base64');

function fixture({count = 20, quoteChange = () => ({}), sourceCheck = async () => {}} = {}) {
    const manifest = {contracts: Array.from({length: count}, (_, index) => ({
        name: 'C' + index, codeHash: index.toString(16).padStart(64, '0'), language: 'tolk',
        compileParams: {compiler_version: '1.4.0'},
    }))};
    const state = {contracts: Object.fromEntries(manifest.contracts.map(item => [item.name,
        {codeHash: item.codeHash, stage: 'ready'}]))};
    state.contracts.AlreadyPublished = {stage: 'published'};
    const writes = [], requests = [];
    const dependencies = {manifest, state, requiredNetwork: 'testnet', checkedSources: sourceCheck,
        async request(_endpoint, options) {
            const input = JSON.parse(options.body); requests.push(input);
            return {httpStatus: 200, data: {status: 'payment_required', code_hash: input.code_hash,
                network: 'testnet', payment_address: recipient, amount_nano: '5000000000',
                comment: 'acton-verify:v1:' + input.code_hash, ...quoteChange(input)}};
        },
        async save() {writes.push(JSON.parse(JSON.stringify(state)))} };
    return {state, writes, requests, controller: publicationBatches(dependencies), dependencies,
        input: {names: manifest.contracts.map(item => item.name), wallet, chain: '-3', maxMessages: 255}};
}

test('one batch pays every distinct contract, skips verified hashes and commits all members together', async () => {
    const f = fixture({quoteChange: input => input.code_hash.endsWith('00') ? {status: 'already_verified'} : {}});
    const prepared = await f.controller.prepare(f.input);
    assert.equal(prepared.transaction.network, '-3');
    assert.equal(prepared.transaction.from, wallet);
    assert.equal(prepared.transaction.messages.length, 19);
    assert.equal(prepared.totalNano, '95000000000');
    assert.deepEqual(prepared.skipped, ['C0']);
    assert.equal(f.writes.length, 1);
    assert.equal(f.state.contracts.C0.stage, 'already-verified');
    for (let index = 0; index < prepared.payments.length; index++) {
        const payment = prepared.payments[index], message = prepared.transaction.messages[index];
        assert.equal(message.amount, '5000000000');
        const destination = Address.parseFriendly(message.address);
        assert.equal(destination.isTestOnly, true);
        assert.equal(destination.address.toRawString(), recipient);
        const body = Cell.fromBase64(message.payload).beginParse();
        assert.equal(body.loadUint(32), 0);
        assert.equal(body.loadStringTail(), payment.quote.comment);
        assert.equal(f.state.contracts[payment.name].batchId, prepared.batchId);
    }
});

test('a bad late quote or changed source cannot leave a partially prepared batch', async () => {
    for (const options of [
        {quoteChange: input => input.code_hash.endsWith('13') ? {network: 'mainnet'} : {}},
        {sourceCheck: async item => {if (item.name === 'C19') throw Error('Prepared source changed')}},
    ]) {
        const f = fixture(options), before = JSON.stringify(f.state);
        await assert.rejects(f.controller.prepare(f.input));
        assert.equal(JSON.stringify(f.state), before);
        assert.equal(f.writes.length, 0);
    }
});

test('wrong network, small wallet limit, duplicate targets and a pending attempt are blocked before tickets', async () => {
    for (const change of [{chain: '-239'}, {maxMessages: 4}, {maxMessages: undefined},
        {names: ['C0', 'C0']}, {names: []}, {names: ['unknown']}]) {
        const f = fixture(); await assert.rejects(f.controller.prepare({...f.input, ...change}));
        assert.equal(f.requests.length, 0); assert.equal(f.writes.length, 0);
    }
    const f = fixture(); f.state.contracts.C19.stage = 'awaiting-wallet';
    await assert.rejects(f.controller.prepare(f.input), /previous attempt/);
    assert.equal(f.requests.length, 0);
});

test('a single external response starts all members and can be acknowledged again without another payment', async () => {
    const f = fixture(), prepared = await f.controller.prepare(f.input);
    await assert.rejects(f.controller.signed({batchId: prepared.batchId, boc: boc(recipient)}), /destination/);
    assert.ok(prepared.payments.every(payment => f.state.contracts[payment.name].stage === 'awaiting-wallet'));
    await f.controller.signed({batchId: prepared.batchId, boc: boc()});
    const hashes = new Set(prepared.payments.map(payment => f.state.contracts[payment.name].externalHash));
    assert.equal(hashes.size, 1);
    assert.ok(prepared.payments.every(payment => f.state.contracts[payment.name].stage === 'payment-sent'));
    assert.equal(f.writes.length, 2);
    // Recreate the controller from durable state, as after a server restart or lost acknowledgement.
    const restoredState = JSON.parse(JSON.stringify(f.state));
    const restored = publicationBatches({...f.dependencies, state: restoredState, save: async () => assert.fail('Must not rewrite a duplicate acknowledgement')});
    assert.equal((await restored.signed({batchId: prepared.batchId, boc: boc()})).accepted, true);
    await assert.rejects(restored.signed({batchId: prepared.batchId, boc: boc(wallet, 8)}), /different signed/);
    await assert.rejects(restored.rejected({batchId: prepared.batchId}), /signed batch/);
});

test('only an explicit wallet rejection resets every member; changed state cannot reset half the batch', async () => {
    const f = fixture(), prepared = await f.controller.prepare(f.input);
    f.state.contracts.C19.stage = 'payment-sent';
    await assert.rejects(f.controller.rejected({batchId: prepared.batchId}), /member state changed/);
    assert.equal(f.state.contracts.C0.stage, 'awaiting-wallet');
    f.state.contracts.C19.stage = 'awaiting-wallet';
    await f.controller.rejected({batchId: prepared.batchId});
    assert.ok(prepared.payments.every(payment => f.state.contracts[payment.name].stage === 'ready'));
    assert.ok(prepared.payments.every(payment => !f.state.contracts[payment.name].batchId));
    await assert.rejects(f.controller.signed({batchId: prepared.batchId, boc: boc()}), /pending batch/);
});

test('a shared external trace gives a distinct recipient transaction to each verification ticket', async () => {
    const f = fixture(), prepared = await f.controller.prepare(f.input);
    const transactions = prepared.payments.map((payment, index) => ({hash: 'tx-' + index,
        account: recipient, emulated: false, finality: 'finalized', mc_block_seqno: 123,
        description: {aborted: false}, in_msg: {source: wallet, destination: recipient, bounced: false,
            value: payment.quote.amount_nano, message_content: {body: prepared.transaction.messages[index].payload}}}));
    const receipts = prepared.payments.map(payment => transactions.find(tx => expectedPayment(tx, payment.quote, wallet)));
    assert.equal(new Set(receipts.map(tx => tx.hash)).size, 20);
    transactions[3].in_msg.bounced = true;
    assert.equal(transactions.find(tx => expectedPayment(tx, prepared.payments[3].quote, wallet)), undefined);
    assert.ok(transactions.find(tx => expectedPayment(tx, prepared.payments[4].quote, wallet)));
});

test('trace lookup is shared even during a slow request, refreshes expired data and retries transport errors', async () => {
    let calls = 0, time = 0, release;
    const load = sharedPaymentTrace(async () => {calls++; return new Promise(resolve => {release = resolve})}, 5000, () => time);
    const first = load('hash'); await Promise.resolve(); time = 10000;
    const second = load('hash'); assert.equal(calls, 1); release({traces: []});
    assert.equal(await first, await second);
    await load('hash'); assert.equal(calls, 1);
    time = 16000;
    const refreshed = load('hash'); await Promise.resolve(); assert.equal(calls, 2); release({traces: [1]});
    assert.deepEqual(await refreshed, {traces: [1]});
    let attempts = 0;
    const retry = sharedPaymentTrace(async () => {if (++attempts === 1) throw Error('429'); return {traces: []}});
    await assert.rejects(retry('hash'), /429/); await retry('hash'); assert.equal(attempts, 2);
});
