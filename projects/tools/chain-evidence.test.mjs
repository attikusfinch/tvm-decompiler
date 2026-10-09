import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {Cell, loadTransaction} from '@ton/core';
import {root, workspace} from './build.mjs';
import {codeIdentity, internalMessages} from './chain.mjs';

const evidence = path.join(root, 'evidence');
const graph = JSON.parse(await fs.readFile(path.join(evidence, 'interactions.json')));
const readCell = async file => Cell.fromBoc(await fs.readFile(path.join(evidence, file)))[0];
const contracts = new Map(workspace.contracts.map(c => [c.name, c]));
const transactions = new Map();

test('recorded transaction identities and timestamps come from their BOCs', async () => {
  assert.ok(graph.transactions.length > 0);
  for (const record of graph.transactions) {
    const cell = await readCell('transactions/' + record.hash + '.boc');
    assert.equal(cell.hash().toString('hex'), record.hash);
    const tx = loadTransaction(cell.beginParse());
    assert.equal(String(tx.lt), record.lt);
    assert.equal(tx.now, record.timestamp);
    assert.equal(tx.address.toString(16).padStart(64, '0'), record.account.split(':')[1]);
    transactions.set(record.hash, tx);
  }
});

test('account family labels are backed by code cells or library-reference hashes', async () => {
  for (const account of graph.accounts) {
    const code = await readCell('account-codes/' + account.accountCodeHash + '.boc');
    assert.equal(code.hash().toString('hex'), account.accountCodeHash);
    assert.equal(codeIdentity(code), account.resolvedHash);
    assert.equal(account.resolvedHash, contracts.get(account.family).codeHash);
  }
});

test('every graph edge reproduces actual message endpoints, opcode, value and body', () => {
  assert.ok(graph.edges.length > 0);
  for (const edge of graph.edges) {
    const message = internalMessages(transactions.get(edge.transactionHash))[edge.messageIndex];
    assert.equal(message.info.type, 'internal');
    assert.equal(message.info.src.toRawString(), edge.from);
    assert.equal(message.info.dest.toRawString(), edge.to);
    assert.equal(message.body.hash().toString('hex'), edge.bodyHash);
    assert.equal(String(message.info.value.coins), edge.value);
    assert.equal(message.info.bounced, edge.bounced);
    const body = message.body.beginParse();
    assert.equal(body.remainingBits >= 32 ? '0x' + body.loadUint(32).toString(16).padStart(8, '0') : null, edge.opcode);
    if (edge.deployedFamily) assert.equal(codeIdentity(message.init.code), contracts.get(edge.deployedFamily).codeHash);
    const source = graph.accounts.find(a => a.address === edge.from);
    assert.equal(source.family, edge.sourceFamily);
    const dest = graph.accounts.find(a => a.address === edge.to);
    assert.equal(dest?.family ?? edge.deployedFamily, edge.destinationFamily);
  }
});

test('project ownership covers each code family once; cross-project links stay explicit', () => {
  const names = Object.values(workspace.projects).flatMap(p => p.contracts);
  assert.equal(names.length, 21);
  assert.equal(new Set(names).size, 21);
  for (const name of names) assert.ok(contracts.has(name));
  assert.ok(workspace.projects.uranus.dependencies.includes('CpmmPoolV2'));
  assert.ok(workspace.projects.x1000.dependencies.includes('UranusMemeWalletV3'));
  // Do not invent an X1000 mainnet link: its dependency is an emulated integration.
  assert.equal(graph.network, 'mainnet');
  assert.equal(graph.scope.consensusProofsFetched, false);
});
