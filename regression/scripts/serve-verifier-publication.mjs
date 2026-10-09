import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash, randomBytes} from 'node:crypto';
import {Address} from '@ton/core';
import {publicationDirectory, verifierRequest} from './verifier-publication.mjs';
import {validateQuote, paymentNetwork, paymentTransaction, normalizedExternalHash, expectedPayment} from './verifier-payment.mjs';
import {publicationWebConfig, pageToken} from './verifier-web.mjs';

const port = Number(process.env.VERIFIER_LOCAL_PORT ?? 8099);
const web = publicationWebConfig(port, process.env.VERIFIER_PUBLIC_ORIGIN);
const origin = web.localOrigin;
const requiredNetwork = 'testnet';
let previousAccess;
try { previousAccess = JSON.parse(await fs.readFile(path.join(publicationDirectory, 'access.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const existingUrl = previousAccess && new URL(previousAccess.localUrl);
const existingToken = existingUrl && new URLSearchParams(existingUrl.hash.slice(1)).get('access');
const sameOrigin = existingUrl?.origin === origin &&
    (web.publicOrigin ? previousAccess.publicUrl?.startsWith(web.publicOrigin + '/#access=') : !previousAccess?.publicUrl);
const token = sameOrigin && /^[a-f0-9]{64}$/.test(existingToken) ? existingToken : randomBytes(32).toString('hex');
const assets = path.resolve(import.meta.dirname, '../verifier');
const walletManifest = JSON.parse(await fs.readFile(path.join(assets, 'tonconnect-manifest.json'), 'utf8'));
if (web.publicOrigin) walletManifest.url = web.publicOrigin;
const manifestRevision = createHash('sha256').update(JSON.stringify(walletManifest)).digest('hex').slice(0, 16);
await fs.writeFile(path.join(publicationDirectory, 'access.json'), JSON.stringify({
    localUrl: origin + '/#access=' + token,
    publicUrl: web.publicOrigin ? web.publicOrigin + '/#access=' + token : null,
}, null, 2) + '\n');
const manifest = JSON.parse(await fs.readFile(path.join(publicationDirectory, 'manifest.json'), 'utf8'));
const statePath = path.join(publicationDirectory, 'progress.json');
let state;
try { state = JSON.parse(await fs.readFile(statePath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; state = {contracts: {}}; }
for (const item of manifest.contracts) {
    if (item.preflight?.status !== 'passed' || item.preflight.codeHash !== item.codeHash)
        throw new Error('Run the compiler preflight first: ' + item.name);
    const previous = state.contracts[item.name];
    if (previous && previous.codeHash !== item.codeHash) throw new Error('Stored payment targets changed');
    state.contracts[item.name] ??= {codeHash: item.codeHash, stage: item.remote.data.verified ? 'already-verified' : 'ready'};
    // An interrupted HTTP upload has an unknown result. Reconcile; do not charge again.
    if (state.contracts[item.name].stage === 'uploading') state.contracts[item.name].stage = 'upload-uncertain';
}
let saveQueue = Promise.resolve();
const save = () => {
    const content = JSON.stringify(state, null, 2) + '\n';
    saveQueue = saveQueue.then(() => fs.writeFile(statePath + '.tmp', content)).then(() => fs.rename(statePath + '.tmp', statePath));
    return saveQueue;
};
await save();
const active = new Set();
const findItem = name => {
    const item = manifest.contracts.find(c => c.name === name);
    if (!item) throw new Error('Unknown contract');
    return item;
};
const publicState = () => ({contracts: manifest.contracts.map(item => ({
    name: item.name, project: item.project, language: item.language, codeHash: item.codeHash,
    compilerVersion: item.compileParams.compiler_version, fileCount: item.sources.length,
    bytes: item.bytes, verifierLink: item.verifierLink, ticket: state.contracts[item.name].ticket ?? item.ticket.data,
    ...state.contracts[item.name],
})), paymentNetwork: requiredNetwork, paymentChain: paymentNetwork(requiredNetwork).chain,
    manifestUrl: 'https://raw.githubusercontent.com/attikusfinch/tvm-decompiler/main/regression/verifier/tonconnect-manifest.json?v=' + manifestRevision});

async function remoteVerified(item) {
    const reply = await verifierRequest('/api/v1/verification/status?code_hash=' + item.codeHash);
    if (reply.httpStatus !== 200) throw new Error('Cannot check verifier status: ' + JSON.stringify(reply.data));
    return reply.data.verified === true;
}

async function ourSourcesPublished(item, entry) {
    const reply = await verifierRequest('/api/v1/verification/source?code_hash=' + item.codeHash);
    if (reply.httpStatus === 404) return false;
    if (reply.httpStatus !== 200) throw new Error('Cannot read published source bundle');
    if (reply.data.code_hash !== item.codeHash || reply.data.verified !== true) return false;
    const files = new Map((reply.data.bundle?.files ?? []).map(file => [file.path, file]));
    for (const [name, expected] of Object.entries(item.sourceSha256)) {
        const file = files.get(name);
        if (!file || createHash('sha256').update(file.content).digest('hex') !== expected)
            throw new Error('Registry contains a different source bundle; inspect it before continuing');
    }
    const expectedBundle = entry.response?.data.source_bundle_hash;
    if (expectedBundle && reply.data.bundle.source_bundle_hash !== expectedBundle)
        throw new Error('Registry source bundle differs from the upload receipt');
    entry.sourceBundleHash = reply.data.bundle.source_bundle_hash;
    entry.storageRevision = reply.data.bundle.storage_revision;
    return true;
}

async function checkedSources(item) {
    const files = [];
    for (const source of item.sources) {
        const content = await fs.readFile(path.join(publicationDirectory, item.name, source.path));
        if (createHash('sha256').update(content).digest('hex') !== item.sourceSha256[source.path])
            throw new Error('Prepared source changed: ' + source.path);
        files.push({source, content});
    }
    return files;
}

async function upload(item, entry) {
    const form = new FormData();
    form.set('code_hash', item.codeHash);
    form.set('language', item.language);
    form.set('compile_params', JSON.stringify(item.compileParams));
    form.set('sources', JSON.stringify(item.sources));
    form.set('tx_hash', entry.txHash);
    for (const {source, content} of await checkedSources(item)) {
        form.append('files', new Blob([content], {type: 'text/plain'}), source.path);
    }
    entry.stage = 'uploading'; await save();
    let reply;
    try { reply = await verifierRequest('/api/v1/verify', {method: 'POST', body: form}); }
    catch (error) {
        entry.stage = 'upload-uncertain'; entry.error = error.message; await save(); return;
    }
    entry.response = reply;
    if (reply.httpStatus === 200 && ['match', 'already_verified'].includes(reply.data.verification_result) &&
        reply.data.code_hash === item.codeHash && (reply.data.compiled_code_hash == null || reply.data.compiled_code_hash === item.codeHash)) {
        entry.stage = await ourSourcesPublished(item, entry) ? 'published' : 'checking-registry';
        delete entry.error;
    } else {
        // One payment is one attempt. Only the server's explicit storage retry permits reuse.
        entry.stage = 'rejected'; entry.error = JSON.stringify(reply.data);
    }
    await save(); console.log(item.name + ': ' + entry.stage);
}

async function advance(item) {
    const entry = state.contracts[item.name];
    if (active.has(item.name)) return;
    active.add(item.name);
    try {
        if (['checking-registry', 'upload-uncertain'].includes(entry.stage)) {
            if (await ourSourcesPublished(item, entry)) { entry.stage = 'published'; delete entry.error; await save(); }
            return;
        }
        if (['payment-sent', 'payment-finalized'].includes(entry.stage)) validateQuote(entry.ticket, item.codeHash, requiredNetwork);
        if (entry.stage === 'payment-finalized') { await upload(item, entry); return; }
        if (entry.stage !== 'payment-sent') return;
        const response = await fetch(paymentNetwork(requiredNetwork).toncenter + '/api/v3/traces?msg_hash=' + entry.externalHash + '&limit=1', {signal: AbortSignal.timeout(15000)});
        if (!response.ok) throw new Error('TON Center HTTP ' + response.status);
        const data = await response.json();
        for (const trace of data.traces ?? []) {
            if (trace.is_incomplete !== false) continue;
            const transaction = Object.values(trace.transactions ?? {}).find(tx => expectedPayment(tx, entry.ticket, entry.wallet));
            if (transaction) {
                entry.txHash = transaction.hash; entry.stage = 'payment-finalized'; delete entry.error;
                await save(); await upload(item, entry); return;
            }
        }
    } catch (error) {
        if (entry.stage === 'uploading') entry.stage = 'upload-uncertain';
        entry.error = error.message; await save();
    } finally { active.delete(item.name); }
}

async function action(body) {
    if (body.action === 'refresh-tickets') {
        for (const item of manifest.contracts) {
            const entry = state.contracts[item.name];
            if (entry.stage !== 'ready' || active.has(item.name)) continue;
            active.add(item.name);
            try {
                const reply = await verifierRequest('/api/v1/take_ticket', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({code_hash: item.codeHash, compiler: item.language, compiler_version: item.compileParams.compiler_version}),
                });
                if (reply.httpStatus !== 200 || reply.data.code_hash !== item.codeHash)
                    throw new Error('Cannot refresh verifier ticket: ' + JSON.stringify(reply.data));
                if (reply.data.status === 'already_verified') entry.stage = 'already-verified';
                else entry.ticket = validateQuote(reply.data, item.codeHash, reply.data.network);
                delete entry.error; await save();
            } finally { active.delete(item.name); }
        }
        return {refreshed: true};
    }
    const item = findItem(body.name), entry = state.contracts[item.name];
    if (body.action === 'prepare') {
        if (entry.stage !== 'ready') throw new Error('A previous attempt exists; use its current status');
        await checkedSources(item);
        if (await remoteVerified(item)) { entry.stage = 'already-verified'; await save(); return {alreadyVerified: true}; }
        if (body.chain !== paymentNetwork(requiredNetwork).chain) throw new Error('Connect a ' + requiredNetwork + ' wallet');
        const wallet = Address.parse(body.wallet).toRawString();
        const reply = await verifierRequest('/api/v1/take_ticket', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code_hash: item.codeHash, compiler: item.language, compiler_version: item.compileParams.compiler_version}),
        });
        if (reply.httpStatus !== 200) throw new Error(JSON.stringify(reply.data));
        if (reply.data.status === 'already_verified') { entry.stage = 'already-verified'; await save(); return {alreadyVerified: true}; }
        const quote = validateQuote(reply.data, item.codeHash, requiredNetwork);
        const transaction = paymentTransaction(quote, item.codeHash, wallet, body.chain, requiredNetwork);
        entry.ticket = quote; entry.wallet = wallet; entry.stage = 'awaiting-wallet';
        entry.preparedAt = new Date().toISOString(); delete entry.error; await save();
        return {quote, transaction};
    }
    if (body.action === 'signed') {
        if (entry.stage !== 'awaiting-wallet') throw new Error('No pending wallet request');
        validateQuote(entry.ticket, item.codeHash, requiredNetwork);
        entry.externalHash = normalizedExternalHash(body.boc, entry.wallet);
        entry.stage = 'payment-sent'; entry.signedAt = new Date().toISOString(); await save();
        void advance(item);
        return {accepted: true};
    }
    if (body.action === 'wallet-rejected') {
        if (entry.stage !== 'awaiting-wallet') throw new Error('No pending wallet request');
        entry.stage = 'ready'; delete entry.wallet; await save(); return {cancelled: true};
    }
    if (body.action === 'resume') { await advance(item); return {stage: entry.stage}; }
    throw new Error('Unknown action');
}

function send(response, status, data, type = 'application/json') {
    response.writeHead(status, {'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
    response.end(type === 'application/json' ? JSON.stringify(data) : data);
}

const server = http.createServer(async (request, response) => {
    try {
        if (!web.hosts.has(request.headers.host)) return send(response, 403, {error: 'Unexpected host'});
        const url = new URL(request.url, origin);
        if (request.method === 'GET' && url.pathname === '/') {
            const html = (await fs.readFile(path.join(assets, 'index.html'), 'utf8')).replace('__SESSION_TOKEN__', pageToken(web, token));
            return send(response, 200, html, 'text/html');
        }
        if (url.pathname === '/tonconnect-manifest.json' && ['GET', 'OPTIONS'].includes(request.method)) {
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            return send(response, 200, request.method === 'GET' ? walletManifest : {});
        }
        if (request.method === 'GET' && url.pathname === '/icon.png') {
            response.writeHead(200, {'Content-Type': 'image/png', 'Access-Control-Allow-Origin': '*'});
            return response.end(await fs.readFile(path.join(assets, 'icon.png')));
        }
        if (request.method === 'GET' && url.pathname === '/tonconnect-ui.js') {
            return send(response, 200, await fs.readFile(path.resolve(assets, '../node_modules/@tonconnect/ui/dist/tonconnect-ui.min.js'), 'utf8'), 'application/javascript');
        }
        if (request.headers['x-session-token'] !== token) return send(response, 403, {error: 'Missing local session'});
        if (request.method === 'GET' && url.pathname === '/api/state') return send(response, 200, publicState());
        if (request.method === 'POST' && url.pathname === '/api/action') {
            if (!web.origins.has(request.headers.origin) || request.headers['content-type'] !== 'application/json') return send(response, 403, {error: 'Unexpected origin'});
            let raw = '';
            for await (const chunk of request) { raw += chunk; if (raw.length > 65536) throw new Error('Request too large'); }
            const body = JSON.parse(raw);
            if (active.has(body.name)) throw new Error('Contract operation already running');
            active.add(body.name);
            try { return send(response, 200, await action(body)); }
            finally { active.delete(body.name); }
        }
        send(response, 404, {error: 'Not found'});
    } catch (error) { send(response, 400, {error: error.message}); }
});
setInterval(() => {
    for (const item of manifest.contracts) if (['payment-sent', 'payment-finalized', 'checking-registry', 'upload-uncertain'].includes(state.contracts[item.name].stage)) void advance(item);
}, 5000).unref();
server.listen(port, '127.0.0.1', () => console.log('Publication queue ready: ' + origin));
