import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { Cell } from '@ton/core';
import { output, libraryHash } from './collect-dedust.mjs';

const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8'));
const contracts = manifest.contracts.filter(contract => !contract.sameCodeAs);
const hashes = new Set(contracts.map(contract => contract.codeHash));
const issues = [], files = {}, summaries = [];
const track = async relative => {
  const bytes = await fs.readFile(path.join(output, relative));
  files[relative] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  return bytes;
};
const counters = Object.fromEntries(['func', 'tolk'].map(language => [language, { complete: 0, partial: 0, compileError: 0, compiled: 0, identicalCode: 0 }]));

for (const contract of manifest.contracts) {
  const base = `contracts/${contract.name}`;
  const roots = Cell.fromBoc(await track(`${base}/code.boc`));
  if (roots.length !== 1 || roots[0].hash().toString('hex') !== contract.codeHash) issues.push(`${contract.name}: wrong BOC hash`);
  const visited = new Set();
  function walk(cell) {
    const hash = cell.hash().toString('hex');
    if (visited.has(hash)) return; visited.add(hash);
    const lib = libraryHash(cell);
    if (lib && !hashes.has(lib)) issues.push(`${contract.name}: unresolved library ${lib}`);
    cell.refs.forEach(walk);
  }
  walk(roots[0]);
  await track(`${base}/metadata.json`);
  await track(`${base}/code.tasm`);
  for (const language of ['func', 'tolk']) {
    const response = JSON.parse(await track(`${base}/${language}/response.json`));
    for (const file of response.files) {
      const exported = await track(`${base}/${language}/${file.name}`);
      if (exported.toString('utf8') !== file.content) issues.push(`${contract.name}: source differs from CLI JSON`);
    }
    if (response.complete !== contract.languages[language].complete) issues.push(`${contract.name}: completeness differs from CLI JSON`);
    if (contract.sameCodeAs) continue;
    const result = contract.languages[language], count = counters[language];
    result.complete ? count.complete++ : count.partial++;
    if (result.compilation.status === 'ok') {
      count.compiled++;
      const compiled = Cell.fromBoc(await track(`${base}/${language}/validation/recompiled.boc`))[0];
      const same = roots[0].equals(compiled);
      if (same !== result.comparison.sameCodeCell) issues.push(`${contract.name}: wrong recompiled hash comparison`);
      if (same) count.identicalCode++;
    } else if (result.compilation.status === 'compile-error') count.compileError++;
  }
}
for (const account of manifest.accounts) {
  const boc = Cell.fromBoc(await track(`accounts/${account.name}/account-code.boc`))[0];
  if (boc.hash().toString('hex') !== account.accountCodeHash) issues.push(`${account.name}: account-code hash mismatch`);
  if (!hashes.has(account.codeHash)) issues.push(`${account.name}: code absent from archive`);
  await track(`accounts/${account.name}/account.json.source.json`);
  await track(`accounts/${account.name}/data.boc`);
}
for (const hash of await fs.readdir(path.join(output, 'libraries'))) {
  const code = Cell.fromBoc(await track(`libraries/${hash}/code.boc`))[0];
  if (code.hash().toString('hex') !== hash) issues.push(`Library hash mismatch: ${hash}`);
  await track(`libraries/${hash}/api.json.source.json`);
}
if (issues.length) throw new Error(issues.join('\n'));

const status = result => !result.complete ? `Частично · диагностик: ${result.diagnosticCount}`
  : result.compilation.status === 'ok' ? (result.comparison.sameCodeCell ? 'Компилируется · код совпадает' : 'Компилируется · код отличается')
  : 'Полная декомпиляция · ошибка компиляции';
const sections = [];
for (const contract of contracts) {
  const base = `contracts/${contract.name}`;
  const aliases = manifest.contracts.filter(candidate => candidate.sameCodeAs === contract.name).map(candidate => candidate.name);
  const accounts = manifest.accounts.filter(account => account.codeHash === contract.codeHash);
  const panes = [];
  for (const language of ['func', 'tolk']) {
    const ext = language === 'func' ? 'fc' : 'tolk', result = contract.languages[language];
    const code = await fs.readFile(path.join(output, base, language, `main.${ext}`), 'utf8');
    const errorPath = path.join(output, base, language, 'validation/compile-error.txt');
    let compilerError = '';
    try { compilerError = await fs.readFile(errorPath, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const diagnosticText = result.diagnostics.map(d => `${d.kind}: method=${d.methodId} ${d.mnemonic}\n${d.message}`).join('\n\n');
    panes.push(`<div class="pane" data-language="${language}"${language === 'func' ? ' hidden' : ''}>
      <p class="state">${esc(status(result))}</p>
      <p class="links"><a href="${base}/${language}/main.${ext}" download>main.${ext}</a> · <a href="${base}/${language}/stdlib.${ext}" download>stdlib.${ext}</a> · <a href="${base}/${language}/response.json">CLI JSON</a></p>
      ${diagnosticText || compilerError ? `<details class="diagnostics"><summary>Диагностика</summary><pre>${esc(diagnosticText || compilerError)}</pre></details>` : ''}
      <pre class="code"><code>${esc(code)}</code></pre>
    </div>`);
  }
  sections.push(`<details class="contract" id="${contract.name}" data-name="${contract.name.toLowerCase()}">
    <summary><strong>${esc(contract.name)}</strong><span>${contract.version != null ? `версия ${contract.version} · ` : ''}<span class="brief" data-func="${esc(status(contract.languages.func))}" data-tolk="${esc(status(contract.languages.tolk))}">${esc(status(contract.languages.tolk))}</span></span></summary>
    <div class="content"><p class="hash">Хеш кода: ${contract.codeHash}</p>
    ${aliases.length ? `<p>Тот же код: ${aliases.map(esc).join(', ')}.</p>` : ''}
    ${accounts.length ? `<p>Живые экземпляры: ${accounts.map(account => `<a href="https://tonviewer.com/${esc(account.address)}">${esc(account.name)}</a>`).join(' · ')}</p>` : '<p>Код извлечён из текущей конфигурации фабрики или связанной библиотеки.</p>'}
    <p class="links"><a href="${base}/code.boc" download>Оригинальный BOC</a> · <a href="${base}/code.tasm">Полный TVM-ассемблер</a> · <a href="${base}/metadata.json">Адреса, происхождение и проверка</a></p>
    ${panes.join('\n')}</div></details>`);
  summaries.push({ name: contract.name, codeHash: contract.codeHash, version: contract.version,
    func: status(contract.languages.func), tolk: status(contract.languages.tolk), accounts: accounts.map(account => account.address) });
}
const html = `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>DeDust — контракты mainnet</title><style>
*{box-sizing:border-box}body{margin:0;background:#10141c;color:#e0e5ed;font:15px/1.6 system-ui,sans-serif}main{max-width:1300px;margin:auto;padding:36px 24px}h1{margin:0;font-size:32px}a{color:#8cbcff}header p{max-width:980px;color:#b7c2d2}.notice{border-left:3px solid #edb65c;padding:10px 16px;background:#211e19}.toolbar{position:sticky;top:0;z-index:1;display:flex;gap:16px;padding:16px 0;background:#10141c;align-items:center;flex-wrap:wrap}input,select{background:#1c2432;color:inherit;border:1px solid #526079;border-radius:6px;padding:10px;font:inherit}input{flex:1;min-width:180px}summary{cursor:pointer;padding:16px 20px;display:flex;gap:16px;justify-content:space-between;flex-wrap:wrap}summary span{color:#b7c2d2;font-size:13px}details.contract{border:1px solid #374258;margin:12px 0;border-radius:8px;background:#161d28}details[open]>summary{border-bottom:1px solid #374258}.content{padding:16px 20px;min-width:0}.hash{font:13px/1.5 ui-monospace,monospace;overflow-wrap:anywhere;color:#b7c2d2}.state{font-weight:600;color:#edb65c}.links{font-size:14px}pre{white-space:pre;overflow:auto;max-height:72vh;background:#0c1119;border:1px solid #293348;border-radius:6px;padding:16px;font:13px/1.55 ui-monospace,Consolas,monospace}.diagnostics pre{white-space:pre-wrap;overflow-wrap:anywhere;color:#efb4a7}.diagnostics summary{padding:8px 0}.limits{color:#b7c2d2;margin-top:28px}[hidden]{display:none!important}@media(max-width:600px){main{padding:20px 12px}.content{padding:12px}h1{font-size:26px}summary{padding:12px}}
</style><main><header><h1>DeDust · TON mainnet</h1>
<p>Уникальных кодов: ${contracts.length} · Проверенных аккаунтов: ${manifest.accounts.length} · ${esc(manifest.generatedAt)}. Classic, CPMM v2, Position, Deposit, Affiliate Account, Uranus и x1000.</p>
<p class="notice">Это восстановленный код. Частичные результаты содержат ошибки декомпилятора. Даже успешная компиляция пока не означает эквивалентность исходному контракту: совпадений хеша нет.</p>
<p>Компилируются: FunC ${counters.func.compiled}/${contracts.length}, Tolk ${counters.tolk.compiled}/${contracts.length}. <a href="manifest.json">Манифест</a> · <a href="README.md">Состав и ограничения</a> · <a href="checksums.json">Контрольные суммы</a>.</p></header>
<div class="toolbar"><input id="search" type="search" aria-label="Найти контракт" placeholder="Найти контракт…"><label for="language">Язык</label><select id="language"><option value="tolk">Tolk</option><option value="func">FunC</option></select></div>
${sections.join('\n')}<section class="limits"><p>Набор охватывает найденные семейства и связанные библиотеки; полнота всех исторических ревизий не заявляется. Для документированного периферийного Classic FeeCollector подтверждённый адрес пока не найден.</p></section></main>
<script>const sections=[...document.querySelectorAll('.contract')];document.querySelector('#search').addEventListener('input',event=>{const query=event.target.value.toLowerCase();for(const section of sections)section.hidden=!section.dataset.name.includes(query)});document.querySelector('#language').addEventListener('change',event=>{for(const pane of document.querySelectorAll('.pane'))pane.hidden=pane.dataset.language!==event.target.value;for(const brief of document.querySelectorAll('.brief'))brief.textContent=brief.dataset[event.target.value]});function openHash(){const element=document.getElementById(location.hash.slice(1));if(element&&element.classList.contains('contract'))element.open=true}window.addEventListener('hashchange',openHash);openHash();</script></html>`;
await fs.writeFile(path.join(output, 'index.html'), html);
await track('manifest.json');
await track('index.html');
const summary = { generatedAt: manifest.generatedAt, uniqueCodes: contracts.length, contractFolders: manifest.contracts.length,
  liveAccounts: manifest.accounts.length, counters, checkedFiles: Object.keys(files).length, issues, contracts: summaries };
const readme = `# DeDust: текущие контракты TON mainnet

Сборка: ${manifest.generatedAt}. Уникальных кодов: ${contracts.length}; папок контрактов: ${manifest.contracts.length}; живых аккаунтов: ${manifest.accounts.length}. Открыть [HTML-индекс](index.html), [манифест](manifest.json) или [результаты проверки](summary.json).

## Состав

Classic: Factory, Blank, Operator, Native/Jetton Vault, Liquidity Deposit, LP Wallet, пулы версий 7, 8 и 9. Код версии 9 взят из текущей конфигурации Factory и сопоставлен с живым пулом. Volatile и Stable версии 7 имеют одинаковый код и разные данные.

CPMM v2: PoolV1, PoolV2, Position, Deposit и Affiliate Account. Uranus: FactoryV3, MemeV2/V3 и MemeWalletV2/V3. Дополнительно сохранён связанный торговый X1000WalletV2 из TON ABI-каталога.

Адреса найдены в официальной документации, [TON ABI-каталоге](https://github.com/ton-blockchain/abis/tree/master/data/dedust), публичных реестрах [DeDust](https://mainnet.api.dedust.io/v4/api/get_pools_allcpmm), через getters и состояние фабрики. BOC аккаунтов и библиотеки скачаны из TON mainnet через TonAPI; хеш каждой библиотеки проверен. Текущие library hashes PoolV1/PoolV2 сопоставлены с официальным [DeDust Kit](https://github.com/dedust-io/kit/tree/main/src/cpmm-v2).

## Файлы

- contracts/NAME/code.boc — настоящий исполняемый код; библиотечные ссылки разрешены.
- contracts/NAME/code.tasm — полная дизассемблированная версия TVM.
- contracts/NAME/func/main.fc и stdlib.fc — декомпиляция FunC.
- contracts/NAME/tolk/main.tolk и stdlib.tolk — декомпиляция Tolk.
- contracts/NAME/metadata.json — происхождение, версия, адреса, диагностика и результаты компиляции.
- accounts/NAME/ — оригинальные BOC кода аккаунта, data BOC и точный ответ API со временем получения.
- libraries/HASH/ — оригинальные библиотеки, ответы API и контрольные суммы.
- discovery/ — исходные реестры, схемы и доказательства поиска; отклонённый кандидат FeeCollector помечен явно.

Нормализатор запускается после декомпиляции только для полных результатов. Частичные результаты сохраняются с диагностикой. Исходный авторский код из BOC не восстанавливается буквально; названия и типы могут отличаться.

## Проверка

| Язык | Полная декомпиляция | Частичная | Компилируется | Ошибка компиляции | Хеш кода совпадает |
|---|---:|---:|---:|---:|---:|
| FunC | ${counters.func.complete} | ${counters.func.partial} | ${counters.func.compiled} | ${counters.func.compileError} | ${counters.func.identicalCode} |
| Tolk | ${counters.tolk.complete} | ${counters.tolk.partial} | ${counters.tolk.compiled} | ${counters.tolk.compileError} | ${counters.tolk.identicalCode} |

Сборка проверена реальными компиляторами FunC/Fift TON v2026.08 и Tolk 1.4.0 через Acton 1.0.0. Даже успешно скомпилированные результаты сейчас имеют другой хеш кода. Поведенческая эквивалентность на этих контрактах пока не проверялась. Частичные исходники и ошибки компиляции являются материалом для дальнейшего улучшения декомпилятора.

## Границы набора

Это набор найденных семейств и связанных библиотек, а не выгрузка всех экземпляров пулов, позиций и кошельков. Classic проверен по конфигурации Factory и первым 60 записям реестра; отсутствие других исторических ревизий не доказано. Отдельный периферийный Classic FeeCollector из документации пока не имеет подтверждённого адреса: кандидат по opcode не реализует ожидаемый getter и исключён. Снимки получены в разное время, не на одном фиксированном блоке. Проверка хешей ячеек не заменяет проверку консенсусных доказательств.

## Повторный сбор

В F:/dedust/tvm-decompiler/regression выполнить node scripts/collect-dedust.mjs, затем node scripts/collect-dedust.mjs --archive и node scripts/report-dedust.mjs. Нужны собранный JAR, Java, Acton, FunC и Fift; пути задаются через JAVA_EXE, ACTON_WSL_PATH, FUNC_EXE, FIFT_EXE и FIFT_LIB. DEDUST_OUTPUT меняет каталог. Существующие ответы используются как сохранённый снимок; для свежего сбора выбрать новую пустую папку через DEDUST_OUTPUT. Ключи API, кошелёк и отправка транзакций не требуются.
`;
await fs.writeFile(path.join(output, 'README.md'), readme);
await track('README.md');
summary.checkedFiles = Object.keys(files).length;
await fs.writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
await fs.writeFile(path.join(output, 'checksums.json'), JSON.stringify(files, null, 2) + '\n');
console.log(JSON.stringify({ uniqueCodes: contracts.length, liveAccounts: manifest.accounts.length, counters, checkedFiles: summary.checkedFiles, issues }));
