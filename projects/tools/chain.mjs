import assert from 'node:assert/strict';

export function codeIdentity(code) {
  if (!code.isExotic) return code.hash().toString('hex');
  assert.equal(code.type, 2, 'Expected a library-reference code cell');
  const data = code.beginParse(true);
  assert.equal(data.loadUint(8), 2);
  return data.loadBuffer(32).toString('hex');
}

export function internalMessages(transaction) {
  return [transaction.inMessage, ...transaction.outMessages.values()];
}
