import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {publicationDirectory, verifierRequest} from './verifier-publication.mjs';

// Admission check only: deliberately omit tx_hash. A new verification must stop
// at payment validation, after checking file paths, metadata and compiler policy.
const manifestPath = path.join(publicationDirectory, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
for (const item of manifest.contracts) {
    const form = new FormData();
    form.set('code_hash', item.codeHash);
    form.set('language', item.language);
    form.set('compile_params', JSON.stringify(item.compileParams));
    form.set('sources', JSON.stringify(item.sources));
    for (const source of item.sources) {
        const content = await fs.readFile(path.join(publicationDirectory, item.name, source.path));
        if (createHash('sha256').update(content).digest('hex') !== item.sourceSha256[source.path]) throw new Error('Source checksum mismatch');
        form.append('files', new Blob([content], {type: 'text/plain'}), source.path);
    }
    const reply = await verifierRequest('/api/v1/verify', {method: 'POST', body: form});
    const accepted = reply.httpStatus === 402 && reply.data.error?.includes('missing required field: tx_hash');
    const existing = reply.httpStatus === 200 && reply.data.verification_result === 'already_verified';
    if (!accepted && !existing) throw new Error(item.name + ': unexpected admission response ' + JSON.stringify(reply));
    item.serverAdmission = {checkedAt: new Date().toISOString(), result: existing ? 'already_verified' : 'valid_request_payment_required', response: reply};
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(item.name + ': ' + item.serverAdmission.result);
}
