// Read-only discovery. Never sends messages or asks a wallet to sign anything.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {Address, Cell, loadTransaction} from '@ton/core';
import {root, workspace, sha256} from './build.mjs';
import {codeIdentity} from './chain.mjs';

const directory = path.join(root, 'evidence');
const cache = path.join(root, '.cache/chain');
await fs.mkdir(cache, {recursive: true});
await fs.mkdir(path.join(directory, 'transactions'), {recursive: true});
await fs.mkdir(path.join(directory, 'account-codes'), {recursive: true});
const addresses = JSON.parse(await fs.readFile(path.join(root, 'mainnet-addresses.json')));
const byHash = new Map(workspace.contracts.map(c => [c.codeHash, c.name]));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(url) {
  const file = path.join(cache, sha256(url) + '.json');
  if (!process.argv.includes('--refresh')) {
    try { return JSON.parse(await fs.readFile(file)); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    await pause(attempt ? attempt * 2000 : 700);
    const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
    if ((response.status === 429 || response.status >= 500) && attempt < 3) continue;
    assert.ok(response.ok, `${response.status} ${url}`);
    const result = {url, fetchedAt: new Date().toISOString(), body: await response.json()};
    await fs.writeFile(file, JSON.stringify(result));
    return result;
  }
}
const transactions = new Map();
const peers = new Set();
for (const entry of addresses.contracts) {
  const addr = entry.representative.rawAddress;
  const response = await request(`https://tonapi.io/v2/blockchain/accounts/${addr}/transactions?limit=20`);
  let count = 0;
  for (const tx of response.body.transactions ?? []) {
    const cell = Cell.fromBoc(Buffer.from(tx.raw, 'hex'))[0];
    assert.equal(cell.hash().toString('hex'), tx.hash, 'Transaction BOC hash');
    const parsed = loadTransaction(cell.beginParse());
    const account = Address.parse(tx.account.address).toRawString();
    assert.equal(parsed.address, Address.parse(account).hash.reduce((n, b) => (n << 8n) + BigInt(b), 0n));
    for (const msg of [parsed.inMessage, ...parsed.outMessages.values()]) if (msg?.info.type === 'internal') {
      peers.add(msg.info.src.toRawString()); peers.add(msg.info.dest.toRawString());
    }
    transactions.set(tx.hash, {hash: tx.hash, account, lt: String(parsed.lt), timestamp: parsed.now,
      source: response.url, fetchedAt: response.fetchedAt, cell, parsed});
    count++;
  }
  console.log(`${entry.name}: ${count} transactions`);
}

const accounts = [];
const list = [...peers];
for (let i = 0; i < list.length; i += 40) {
  const url = new URL('https://toncenter.com/api/v3/accountStates');
  url.searchParams.set('include_boc', 'true');
  for (const address of list.slice(i, i + 40)) url.searchParams.append('address', address);
  const response = await request(url.href);
  for (const state of response.body.accounts ?? []) {
    if (!state.code_boc) continue;
    const code = Cell.fromBase64(state.code_boc);
    const resolvedHash = codeIdentity(code);
    const family = byHash.get(resolvedHash);
    if (!family) continue;
    const rawAddress = Address.parse(state.address).toRawString();
    const accountCodeHash = code.hash().toString('hex');
    await fs.writeFile(path.join(directory, 'account-codes', accountCodeHash + '.boc'), code.toBoc());
    accounts.push({address: rawAddress, family, resolvedHash, accountCodeHash,
      source: response.url, fetchedAt: response.fetchedAt,
      note: 'Code at observation time; not a proof of code at every historical transaction.'});
  }
  console.log(`Classified ${Math.min(i + 40, list.length)}/${list.length} peer addresses`);
}
const accountMap = new Map(accounts.map(a => [a.address, a]));
const edges = [];
const chosen = new Set();
for (const tx of transactions.values()) {
  const messages = [tx.parsed.inMessage, ...tx.parsed.outMessages.values()];
  for (let index = 0; index < messages.length; index++) {
    const msg = messages[index];
    if (msg?.info.type !== 'internal') continue;
    const from = msg.info.src.toRawString(), to = msg.info.dest.toRawString();
    const sourceFamily = accountMap.get(from)?.family;
    const destinationFamily = accountMap.get(to)?.family;
    const deployedFamily = msg.init?.code && byHash.get(codeIdentity(msg.init.code));
    if (!sourceFamily || (!destinationFamily && !deployedFamily)) continue;
    const body = msg.body.beginParse();
    const opcode = body.remainingBits >= 32 ? '0x' + body.loadUint(32).toString(16).padStart(8, '0') : null;
    const edge = {transactionHash: tx.hash, messageIndex: index, from, to, sourceFamily,
      destinationFamily: destinationFamily ?? deployedFamily, deployedFamily: deployedFamily ?? null,
      opcode, value: String(msg.info.value.coins), bodyHash: msg.body.hash().toString('hex'),
      bounced: msg.info.bounced, timestamp: tx.timestamp};
    // Preserve one reproducible example for each family pair/opcode/deployment.
    const key = [sourceFamily, edge.destinationFamily, deployedFamily, opcode, edge.bounced].join(':');
    if (chosen.has(key)) continue;
    chosen.add(key); edges.push(edge);
  }
}
// The complete transient deposit lifecycle is useful even when its account has disappeared.
const deposit = addresses.contracts.find(c => c.name === 'CpmmDeposit').representative.rawAddress;
const retained = [...transactions.values()].filter(t => t.account === deposit || edges.some(e => e.transactionHash === t.hash));
for (const t of retained) await fs.writeFile(path.join(directory, 'transactions', t.hash + '.boc'), t.cell.toBoc());
const report = {schemaVersion: 1, network: 'mainnet', generatedAt: new Date().toISOString(),
  scope: {accountsSampled: addresses.contracts.length, transactionsPerAccount: 20,
    transactionsInspected: transactions.size, peersInspected: peers.size, consensusProofsFetched: false,
    limitations: ['Bounded representative sample, not every deployment or every interaction.',
      'Peers classified by observed code BOC; transaction-time code is only established when StateInit is present.']},
  accounts, transactions: retained.map(({cell, parsed, ...t}) => t), edges};
await fs.writeFile(path.join(directory, 'interactions.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`Saved ${edges.length} interaction examples, ${retained.length} transaction BOCs.`);
