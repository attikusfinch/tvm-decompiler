import {randomUUID} from 'node:crypto';
import {Address} from '@ton/core';
import {normalizedExternalHash, paymentBatchTransaction, paymentNetwork, validateQuote} from './verifier-payment.mjs';

export function publicationBatches({manifest, state, requiredNetwork, checkedSources, request, save}) {
    const find = name => {
        const item = manifest.contracts.find(item => item.name === name);
        if (!item) throw new Error('Unknown contract');
        return item;
    };
    const pendingMembers = batch => batch.names.map(name => {
        const item = find(name), entry = state.contracts[name];
        if (entry.stage !== 'awaiting-wallet' || entry.batchId !== batch.id || entry.wallet !== batch.wallet)
            throw new Error('Batch member state changed: ' + name);
        validateQuote(entry.ticket, item.codeHash, requiredNetwork);
        return entry;
    });
    const findBatch = id => {
        const batch = state.batches?.[id];
        if (!batch) throw new Error('Unknown payment batch');
        return batch;
    };
    return {
        async prepare({names, wallet, chain, maxMessages}) {
            if (chain !== paymentNetwork(requiredNetwork).chain) throw new Error('Connect a ' + requiredNetwork + ' wallet');
            if (!Array.isArray(names) || names.length === 0 || new Set(names).size !== names.length)
                throw new Error('Expected distinct contract names');
            if (!Number.isSafeInteger(maxMessages) || names.length > Math.min(maxMessages, 255))
                throw new Error('Wallet message limit is too small for this batch');
            if (Object.values(state.contracts).some(entry => !['ready', 'published', 'already-verified'].includes(entry.stage)))
                throw new Error('A previous attempt exists; use its current status');
            wallet = Address.parse(wallet).toRawString();
            const items = names.map(find);
            for (const item of items) {
                if (state.contracts[item.name].stage !== 'ready') throw new Error('Contract is not ready: ' + item.name);
                await checkedSources(item);
            }
            const payments = [], skipped = [];
            for (const item of items) {
                const reply = await request('/api/v1/take_ticket', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({code_hash: item.codeHash, compiler: item.language,
                        compiler_version: item.compileParams.compiler_version}),
                });
                if (reply.httpStatus !== 200 || reply.data.code_hash !== item.codeHash)
                    throw new Error('Cannot prepare verifier ticket: ' + item.name);
                if (reply.data.status === 'already_verified') { skipped.push(item.name); continue; }
                payments.push({name: item.name, codeHash: item.codeHash,
                    quote: validateQuote(reply.data, item.codeHash, requiredNetwork)});
            }
            // No wallet request is persisted until every source and fresh quote passes.
            const transaction = payments.length ? paymentBatchTransaction(
                payments, wallet, chain, maxMessages, requiredNetwork) : null;
            for (const name of skipped) state.contracts[name].stage = 'already-verified';
            if (!payments.length) { await save(); return {alreadyVerified: true, skipped}; }
            const batch = {id: randomUUID(), names: payments.map(payment => payment.name), wallet,
                network: requiredNetwork, stage: 'awaiting-wallet', preparedAt: new Date().toISOString(),
                totalNano: payments.reduce((sum, payment) => sum + BigInt(payment.quote.amount_nano), 0n).toString()};
            for (const payment of payments) {
                Object.assign(state.contracts[payment.name], {
                    ticket: payment.quote, wallet, batchId: batch.id, stage: 'awaiting-wallet', preparedAt: batch.preparedAt,
                });
                delete state.contracts[payment.name].error;
            }
            state.batches ??= {};
            state.batches[batch.id] = batch;
            await save();
            return {batchId: batch.id, payments, skipped, totalNano: batch.totalNano, transaction};
        },
        async signed({batchId, boc}) {
            const batch = findBatch(batchId);
            const hash = normalizedExternalHash(boc, batch.wallet);
            if (batch.stage === 'payment-sent') {
                if (batch.externalHash !== hash) throw new Error('Batch already has a different signed transaction');
                return {accepted: true, names: batch.names};
            }
            if (batch.stage !== 'awaiting-wallet') throw new Error('No pending batch wallet request');
            const entries = pendingMembers(batch), signedAt = new Date().toISOString();
            for (const entry of entries) Object.assign(entry, {externalHash: hash, stage: 'payment-sent', signedAt});
            Object.assign(batch, {externalHash: hash, stage: 'payment-sent', signedAt});
            await save();
            return {accepted: true, names: batch.names};
        },
        async rejected({batchId}) {
            const batch = findBatch(batchId);
            if (batch.stage === 'cancelled') return {cancelled: true};
            if (batch.stage !== 'awaiting-wallet') throw new Error('Cannot cancel a signed batch');
            const entries = pendingMembers(batch);
            for (const entry of entries) {
                entry.stage = 'ready'; delete entry.wallet; delete entry.batchId;
            }
            batch.stage = 'cancelled'; await save();
            return {cancelled: true};
        },
    };
}
