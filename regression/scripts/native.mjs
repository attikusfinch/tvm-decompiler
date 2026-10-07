import fs from 'node:fs/promises';
import path from 'node:path';
import { root, run } from './lib.mjs';

const func = process.env.FUNC_EXE ?? (process.platform === 'win32' ? 'func.exe' : 'func');
const fift = process.env.FIFT_EXE ?? (process.platform === 'win32' ? 'fift.exe' : 'fift');
const library = process.env.FIFT_LIB;

export async function nativeVersion() {
  const [funcInfo, fiftInfo] = await Promise.all([run(func, ['-V']), run(fift, ['-V'])]);
  return { backend: 'native', func: (funcInfo.stdout + funcInfo.stderr).trim(), fift: (fiftInfo.stdout + fiftInfo.stderr).trim() };
}

export async function compileNative(config) {
  const workspace = path.join(root, 'artifacts', 'native-build');
  await fs.mkdir(workspace, { recursive: true });
  const directory = await fs.mkdtemp(path.join(workspace, 'compile-'));
  try {
    for (const [name, content] of Object.entries(config.sources)) {
      if (!/^[\w.-]+(?:\/[\w.-]+)*\.fc$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid source path');
      const destination = path.join(directory, name);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, content);
    }
    const options = { cwd: directory, timeout: 30000, maxBuffer: 8 * 1024 * 1024 };
    await run(func, ['-SPA', `-O${config.optLevel ?? 2}`, '-W', 'code.boc', '-o', 'main.fif', ...config.targets], options);
    const assembled = await run(fift, [...(library ? ['-I', library] : []), 'main.fif'], options);
    return { status: 'ok', codeBoc: (await fs.readFile(path.join(directory, 'code.boc'))).toString('base64'),
      fiftCode: await fs.readFile(path.join(directory, 'main.fif'), 'utf8'), warnings: assembled.stderr };
  } catch (error) {
    if (error.code === 'ENOENT') throw new Error('Native compiler unavailable; set FUNC_EXE, FIFT_EXE and FIFT_LIB');
    return { status: 'error', message: error.stderr || error.message };
  } finally {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(workspace) + path.sep)) throw new Error('Invalid compiler scratch path');
    await fs.rm(resolved, { recursive: true, force: true });
  }
}
