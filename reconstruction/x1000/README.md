# X1000

This project contains the recovered **X1000WalletV2** signed trading wallet.
Its Tolk source compiles to all **10964 frozen BOC bytes**.

- [Entrypoints and state handling](X1000WalletV2/main.tolk)
- [Trade callbacks](X1000WalletV2/protocols.tolk)
- [Outgoing messages and amount hook](X1000WalletV2/messages.tolk)
- [Receipts and retry queues](X1000WalletV2/queues.tolk)
- [Getter ABI](X1000WalletV2/getters.tolk)
- [Storage, signed request format and verification guide](X1000WalletV2/README.md)

The source stays in this project. The common [Acton and differential test suite](../README.md)
also builds peer jetton wallets from the [Uranus project](../uranus/README.md) for
end-to-end transfer checks.

From `regression`, run `npm run dedust:x1000` for the dedicated wallet checks, or
`npm run dedust:recovery` for all projects. The `dedust:` command prefix is retained
for compatibility with the archive tools.
