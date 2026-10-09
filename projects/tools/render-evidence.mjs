import fs from 'node:fs/promises';
import path from 'node:path';
import {root, workspace} from './build.mjs';

const graph = JSON.parse(await fs.readFile(path.join(root, 'evidence/interactions.json')));
const lines = [
  '# Mainnet interaction evidence', '',
  `Observed on ${graph.generatedAt.slice(0, 10)}: ${graph.scope.transactionsInspected} transactions from ` +
    `${graph.scope.accountsSampled} representative addresses; ${graph.scope.peersInspected} peers inspected. ` +
    `${graph.accounts.length} peer accounts matched the recovered code families.`, '',
  `${graph.edges.length} distinct message examples are backed by ${graph.transactions.length} saved transaction BOCs. ` +
    'The discovery is bounded; it is not a list of every deployed account.', '',
  '## Grouping', '',
  '- Classic Factory, Blank, vaults, pools, deposits, LP wallets and operators form one message system.',
  '- CPMM pools exchange liquidity/claim messages with deposits and positions and pay affiliate accounts.',
  '- Uranus Factory deploys meme masters, whose wallets connect to the CPMM pools. V2/V3 migrations are also exercised locally.',
  '- X1000 remains separate. No direct X1000 → recovered-family edge was found in this sample; its Uranus wallet dependency is an emulator integration fixture.', '',
  '## Evidence strength', '',
  'Each saved transaction cell hashes to the API transaction ID. Account code BOCs identify a family ' +
    'directly or through a library-reference hash. Account snapshots identify code at observation time; ' +
    'they do not prove the code present at every earlier transaction. A message StateInit additionally ' +
    'establishes which code was carried by that deployment. Consensus proofs were not fetched.', '',
  'Blank addresses can already run installed pools. Deposits may have been deleted. ' +
    'A `deployed as` value below is deliberately separate from the current family.', '',
  'Run `npm run chain:check` to decode and verify all stored examples offline. Raw API URLs and ' +
    'retrieval times are in [interactions.json](interactions.json). `npm run chain:refresh` refreshes ' +
    'the bounded sample; it does not broadcast transactions.', '',
  '## Message examples', '',
  '| From | To | Opcode | Deployed as | Transaction BOC |',
  '| --- | --- | --- | --- | --- |',
];
for (const edge of graph.edges) {
  const c1 = workspace.contracts.find(c => c.name === edge.sourceFamily);
  const c2 = workspace.contracts.find(c => c.name === edge.destinationFamily);
  lines.push(`| [${edge.sourceFamily}](../${c1.directory}/main.${c1.language === 'func' ? 'fc' : 'tolk'}) | ` +
    `[${edge.destinationFamily}](../${c2.directory}/main.${c2.language === 'func' ? 'fc' : 'tolk'}) | ` +
    `\`${edge.opcode ?? 'empty'}\` | ${edge.deployedFamily ?? '—'} | ` +
    `[${edge.transactionHash.slice(0, 12)}](transactions/${edge.transactionHash}.boc) |`);
}
lines.push('', '## Local replay fixtures', '',
  '- Classic: the original install message executes Blank and installs the source-built V9 Pool.',
  '- CPMM: original X/Y credit messages recreate the deposit lifecycle and byte-identical outgoing join body; forged settlement is refused.',
  '- Uranus: the original Factory deployment activates the source-built Meme V3 library and repeat initialization is refused.', '',
  'The emulator uses its local configuration. Replay assertions cover message bodies, state and ' +
    'authorization, not historical transaction hashes, consensus or identical network fees.', '');
await fs.writeFile(path.join(root, 'evidence/README.md'), lines.join('\n'));
console.log('Rendered interaction evidence documentation.');
