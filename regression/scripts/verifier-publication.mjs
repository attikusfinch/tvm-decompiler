import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {loadFuncSources} from './func-legacy.mjs';
import {loadTolkSources} from './tolk.mjs';
import {reconstructionRoot} from './reconstruction-projects.mjs';

export const verifierUrl = 'https://verifier.ton.org';
export const userAgent = 'FiscaldevContractRecovery/1.0.0';
export const publicationDirectory = path.resolve(import.meta.dirname, '../artifacts/verifier-publication');
const sha256 = text => createHash('sha256').update(text).digest('hex');

export async function verifierRequest(endpoint, options = {}) {
    const response = await fetch(verifierUrl + endpoint, {
        ...options, headers: {'User-Agent': userAgent, ...options.headers},
        signal: AbortSignal.timeout(60000),
    });
    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = {error: raw}; }
    return {httpStatus: response.status, data};
}

export async function preparePublication() {
    const proof = JSON.parse(await fs.readFile(path.join(reconstructionRoot, 'verification.json'), 'utf8'));
    const result = {schemaVersion: 1, verifier: verifierUrl, preparedAt: new Date().toISOString(), contracts: []};
    await fs.mkdir(publicationDirectory, {recursive: true});
    for (const contract of proof.contracts) {
        if (contract.status !== 'exact-readable' || !contract.comparison.sameSerializedBoc)
            throw new Error('Contract lacks an exact source reconstruction: ' + contract.name);
        const entrypoint = contract.language === 'func' ? contract.sourceDirectory + '/main.fc' : 'main.tolk';
        const content = contract.language === 'func'
            ? await loadFuncSources(reconstructionRoot, entrypoint)
            : await loadTolkSources(reconstructionRoot, contract.sourceDirectory + '/main.tolk');
        const hashes = Object.fromEntries(Object.entries(content).map(([name, text]) => [name, sha256(text)]));
        if (JSON.stringify(Object.entries(hashes).sort()) !== JSON.stringify(Object.entries(contract.sourceSha256).sort()))
            throw new Error('Sources changed after exact-byte verification: ' + contract.name);
        const sources = Object.keys(content).map(name => ({
            path: name, is_entrypoint: name === entrypoint,
            ...(contract.language === 'func' ? {include_in_command: name === entrypoint} : {}),
        }));
        for (const [name, text] of Object.entries(content)) {
            if (!/^[\w.-]+(?:\/[\w.-]+)*$/.test(name) || name.split('/').some(p => p === '.' || p === '..'))
                throw new Error('Nonportable source path: ' + name);
            const target = path.join(publicationDirectory, contract.name, name);
            await fs.mkdir(path.dirname(target), {recursive: true});
            await fs.writeFile(target, text);
        }
        const item = {
            name: contract.name, project: contract.project, language: contract.language,
            codeHash: contract.comparison.originalHash, entrypoint,
            compileParams: {compiler_version: contract.language === 'func' ? '0.4.4-newops.1' : '1.4.0'},
            sources, sourceSha256: hashes,
            bytes: Object.values(content).reduce((n, text) => n + Buffer.byteLength(text), 0),
            verifierLink: verifierUrl + '/' + contract.comparison.originalHash,
        };
        item.remote = await verifierRequest('/api/v1/verification/status?code_hash=' + item.codeHash);
        item.ticket = await verifierRequest('/api/v1/take_ticket', {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({code_hash: item.codeHash, compiler: item.language, compiler_version: item.compileParams.compiler_version}),
        });
        await fs.writeFile(path.join(publicationDirectory, contract.name, 'request.json'), JSON.stringify(item, null, 2) + '\n');
        result.contracts.push(item);
        await fs.writeFile(path.join(publicationDirectory, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
        console.log(JSON.stringify({name: item.name, status: item.remote.data, ticket: item.ticket}));
    }
    return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
    await preparePublication();
}
