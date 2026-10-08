import fs from 'node:fs/promises';
import path from 'node:path';
import fixtures from '../fixtures/acton-probes.mjs';
import { root, readJson, writeJson } from './lib.mjs';

// This inventory searches the emitter's raw output. It does not infer names from original template sources.
const patterns = [
  {id:'anonymous-getters',status:'partial',regex:/@method_id\((\d+)\)\s+fun fn_\d+\(/g,filter:match => Number(match[1]) >= 65536 && Number(match[1]) <= 131071},
  {id:'returned-address-alias',status:'implemented',regex:/val (\w+) = \([^;\n]+\.loadAddress\(\) as slice\);\s+return \1;/g},
  {id:'primitive-load-tuples',status:'candidate',regex:/^\s*var \([^\n]+\) = tvmLoad(?:Uint|Int|Grams|OptStdAddr)\([^\n]+\);/gm},
  {id:'prefix-dispatch',status:'candidate',regex:/\bmatchPrefix\(/g},
  {id:'address-to-slice-cast',status:'candidate',regex:/\.loadAddress\(\) as slice/g},
  {id:'int-cast-bindings',status:'partial',regex:/ as int\);/g},
  {id:'null-predicate',status:'implemented',regex:/\btvmNull_x3f_\(/g},
  {id:'optional-address-load',status:'candidate',regex:/\btvmLoadOptStdAddr\(/g},
  {id:'typed-null-value',status:'candidate',regex:/\btvmNull\(\) as (?:slice|cell|int)/g},
  {id:'raw-message-send',status:'candidate',regex:/\btvmSendRawMessage\(/g},
];
const report = {contracts:[],patterns:patterns.map(({id,status}) => ({id,status,contracts:[],occurrences:0,normalizedOccurrences:0}))};
for (const fixture of fixtures()) {
  const directory = path.join(root,'artifacts/acton-local/default/tolk',fixture.id);
  const raw = await readJson(path.join(directory,'raw/response.json'));
  const normalized = await readJson(path.join(directory,'response.json'));
  const source = raw.files.find(file => file.name === 'main.tolk').content;
  const normalizedSource = normalized.files.find(file => file.name === 'main.tolk').content;
  const found = patterns.map(pattern => {
    const matches = [...source.matchAll(pattern.regex)].filter(pattern.filter ?? (() => true));
    const summary = report.patterns.find(item => item.id === pattern.id);
    if (matches.length) { summary.contracts.push(fixture.id); summary.occurrences += matches.length; }
    summary.normalizedOccurrences += [...normalizedSource.matchAll(pattern.regex)].filter(pattern.filter ?? (() => true)).length;
    return {id:pattern.id,count:matches.length,examples:matches.slice(0,2).map(match => ({
      line:source.slice(0,match.index).split('\n').length,code:match[0].trim(),
    }))};
  }).filter(item => item.count);
  report.contracts.push({id:fixture.id,complete:raw.complete,diagnostics:raw.diagnostics,
    changes:normalized.normalizations,patterns:found});
}
await writeJson(path.join(root,'../docs/tolk-patterns.json'),report);
for (const pattern of report.patterns) console.log(`${pattern.id}: ${pattern.occurrences} → ${pattern.normalizedOccurrences} occurrences in ${pattern.contracts.join(', ')}`);
