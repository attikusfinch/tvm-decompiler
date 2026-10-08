import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { root, run } from './lib.mjs';

const jar = process.env.LOCAL_DECOMPILER_JAR ?? path.resolve(root, '../build/libs/tvm-decompiler-1.0-SNAPSHOT-all.jar');
const java = process.env.JAVA_EXE ?? (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java');
let identity;
export async function localIdentity(exact, language = 'func', normalize = true) {
  identity ??= createHash('sha256').update(await fs.readFile(jar)).digest('hex');
  return `local:${identity}:exact=${exact}:language=${language}:normalize=${normalize}`;
}

export async function decompileLocal(boc, directory, { exact = false, language = 'func', normalize = true } = {}) {
  const input = path.join(directory, 'input.boc');
  await fs.writeFile(input, boc);
  const args = ['-jar', jar, 'boc', input, '--json', '--language', language, ...(exact ? ['--exact'] : []), ...(!normalize ? ['--no-normalize'] : [])];
  let result;
  try { result = await run(java, args, { timeout: 60000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (error) {
    await fs.writeFile(path.join(directory, 'decompiler-stderr.txt'), error.stderr ?? error.message);
    throw new Error(`Local decompiler failed: ${error.stderr || error.message}`);
  }
  await fs.writeFile(path.join(directory, 'decompiler-stderr.txt'), result.stderr);
  try { return JSON.parse(result.stdout); }
  catch { throw new Error('Local CLI did not return valid JSON; rebuild the patched JAR'); }
}
