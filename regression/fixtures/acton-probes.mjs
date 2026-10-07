import { Address, beginCell } from '@ton/core';

const addr = byte => new Address(0, Buffer.alloc(32, byte));
const owner = addr(1), outsider = addr(2), recipient = addr(3), master = addr(4);
const message = (op, query = true) => {
  const b = beginCell().storeUint(op, 32);
  if (query) b.storeUint(123, 64);
  return b;
};
const empty = beginCell().endCell();
const probe = (label, body, extra = {}) => ({ label, from: owner, body, ...extra });

export default function fixtures() {
  const counterOp = (op, amount) => {
    const b = message(op, false);
    if (amount !== undefined) b.storeUint(amount, 32);
    return b.endCell();
  };
  const nftTransfer = (forward = 0n, excess = null, malformed = false) => {
    const b = message(0x5fcc3d14).storeAddress(recipient).storeAddress(excess).storeBit(false).storeCoins(forward);
    if (!malformed) b.storeBit(false);
    return b.endCell();
  };
  const walletTransfer = (amount = 3n) => message(0x0f8a7ea5).storeCoins(amount).storeAddress(recipient)
    .storeAddress(null).storeBit(false).storeCoins(0).storeBit(false).endCell();
  const burn = amount => message(0x595f07bc).storeCoins(amount).storeAddress(null).storeBit(false).endCell();
  const internalTransfer = (amount, forward = 0n) => message(0x178d4519).storeCoins(amount).storeAddress(owner)
    .storeAddress(null).storeCoins(forward).storeBit(false).endCell();
  const bounced = amount => beginCell().storeUint(0xffffffff, 32).storeUint(0x178d4519, 32).storeUint(123, 64).storeCoins(amount).endCell();
  const metadata = beginCell().storeUint(1, 8).storeStringTail('https://example.org/token.json').endCell();
  const content = beginCell().storeStringTail('item.json').endCell();
  return [
    { id: 'Counter', project: 'acton-reference',
      data: beginCell().storeUint(0,32).storeAddress(owner).storeUint(42,32).endCell(),
      getters: [{ method: 83229, args: [] }, { method: 117456, args: [] }],
      messages: [
        probe('increase', counterOp(0x7e8764ef,3), { expectExit: 0 }),
        probe('decrease', counterOp(0x283b4c3f,2), { expectExit: 0 }),
        probe('reset', counterOp(0x3a752f06), { expectExit: 0 }),
        probe('unauthorized sender', counterOp(0x7e8764ef,3), { from: outsider, expectExit: 100 }),
        probe('underflow', counterOp(0x283b4c3f,43), { expectExit: 4097 }),
        probe('overflow', counterOp(0x7e8764ef,0xffffffff), { expectExit: 5 }),
        probe('unknown operation', counterOp(0x12345678), { expectExit: 65535 }),
        probe('empty message', empty, { expectExit: 0 }),
        probe('bounced message', counterOp(0x7e8764ef,3), { from: outsider, bounced: true, expectExit: 0 }),
      ] },
    { id: 'NftItem', project: 'nft-reference',
      data: beginCell().storeUint(7,64).storeAddress(master).storeAddress(owner).storeRef(content).endCell(),
      getters: [{ method: 'get_nft_data', args: [] }],
      messages: [
        probe('ownership transfer', nftTransfer(), { expectExit: 0, expectOut: 0 }),
        probe('ownership notification', nftTransfer(10000000n), { expectExit: 0, expectOut: 1 }),
        probe('ownership excesses', nftTransfer(0n, owner), { expectExit: 0, expectOut: 1 }),
        probe('unauthorized transfer', nftTransfer(), { from: outsider, expectExit: 401 }),
        probe('malformed forward payload', nftTransfer(0n,null,true), { expectExit: 708 }),
        probe('static data response', message(0x2fcb26a2).endCell(), { expectExit: 0, expectOut: 1 }),
        probe('unknown operation', message(0x12345678).endCell(), { expectExit: 65535 }),
        probe('empty message', empty, { expectExit: 0 }),
      ] },
    { id: 'JettonWallet', project: 'jetton-reference',
      data: beginCell().storeCoins(1000).storeAddress(owner).storeAddress(master).endCell(),
      getters: [{ method: 'get_wallet_data', args: [] }],
      messages: [
        probe('transfer', walletTransfer(), { expectExit: 0, expectOut: 1 }),
        probe('unauthorized transfer', walletTransfer(), { from: outsider, expectExit: 73 }),
        probe('insufficient balance', walletTransfer(1001n), { expectExit: 47 }),
        probe('burn', burn(3n), { expectExit: 0, expectOut: 1 }),
        probe('unauthorized burn', burn(3n), { from: outsider, expectExit: 73 }),
        probe('receive from minter', internalTransfer(7n), { from: master, expectExit: 0 }),
        probe('unauthorized receive', internalTransfer(7n), { from: outsider, expectExit: 74 }),
        probe('restore bounced transfer', bounced(7n), { from: outsider, bounced: true, expectExit: 0 }),
        probe('top up', message(0xd372158c).endCell(), { expectExit: 0 }),
        probe('unknown operation', message(0x12345678).endCell(), { expectExit: 65535 }),
      ] },
    { id: 'JettonMinter', project: 'jetton-reference',
      data: beginCell().storeCoins(1000).storeAddress(owner).storeAddress(recipient).storeRef(metadata).endCell(),
      getters: [{ method: 'get_jetton_data', args: [] }, { method: 'get_next_admin_address', args: [] },
        { method: 'get_wallet_address', args: [{ type: 'slice', cell: beginCell().storeAddress(owner).endCell() }] }],
      messages: [
        probe('change admin', message(0x6501f354).storeAddress(outsider).endCell(), { expectExit: 0 }),
        probe('unauthorized change admin', message(0x6501f354).storeAddress(outsider).endCell(), { from: outsider, expectExit: 73 }),
        probe('claim admin', message(0xfb88e119).endCell(), { from: recipient, expectExit: 0 }),
        probe('drop admin', message(0x7431f221).endCell(), { expectExit: 0 }),
        probe('change metadata', message(0xcb862902).storeRef(content).endCell(), { expectExit: 0 }),
        probe('wallet discovery', message(0x2c76b973).storeAddress(owner).storeBit(true).endCell(), { expectExit: 0, expectOut: 1 }),
        probe('mint', message(0x642b7d07).storeAddress(recipient).storeCoins(500000000)
          .storeRef(internalTransfer(7n)).endCell(), { expectExit: 0, expectOut: 1 }),
        probe('restore bounced mint', bounced(7n), { bounced: true, expectExit: 0 }),
        probe('top up', message(0xd372158c).endCell(), { expectExit: 0 }),
        probe('unknown operation', message(0x12345678).endCell(), { expectExit: 65535 }),
      ] },
  ];
}
