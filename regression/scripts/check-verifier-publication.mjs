import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {Cell} from '@ton/core';
import {FuncCompiler} from 'func-verifier-js';
import {object} from 'func-bin-044';
import {runTolkCompiler} from 'tolk-verifier-140';
import {publicationDirectory} from './verifier-publication.mjs';

const manifestPath = path.join(publicationDirectory, 'manifest.json');
const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const func = new FuncCompiler(object);
for (const item of manifest.contracts) {
    const sources = {};
    for (const source of item.sources) {
        const text = await fs.readFile(path.join(publicationDirectory, item.name, source.path), 'utf8');
        if (createHash('sha256').update(text).digest('hex') !== item.sourceSha256[source.path]) throw new Error('Source checksum mismatch');
        sources[source.path] = text;
    }
    const compiled = item.language === 'func'
        ? await func.compileFunc({sources, targets: item.sources.filter(s => s.include_in_command).map(s => s.path)})
        : await runTolkCompiler({entrypointFileName: item.entrypoint, fsReadCallback: name => {
            const value = sources[path.posix.normalize(name)];
            if (value === undefined) throw new Error('Missing source: ' + name);
            return value;
        }});
    if (compiled.status !== 'ok') throw new Error(item.name + ': ' + (compiled.message ?? compiled.error));
    const boc = Buffer.from(compiled.codeBoc ?? compiled.codeBoc64, 'base64');
    const hash = Cell.fromBoc(boc)[0].hash().toString('hex');
    if (hash !== item.codeHash) throw new Error(item.name + ': verifier compiler produces different code: ' + hash);
    item.preflight = {status: 'passed', compilerVersion: item.compileParams.compiler_version, codeHash: hash, checkedAt: new Date().toISOString()};
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
    console.log(item.name + ': exact verifier compiler hash');
    // FunC's Emscripten wrapper installs global listeners on every invocation.
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
}
