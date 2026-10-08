import fs from 'node:fs/promises';
import path from 'node:path';
import { root, run } from './lib.mjs';

function wslPath(value) {
  const resolved = path.resolve(value).replaceAll('\\', '/');
  if (!/^[A-Za-z]:\//.test(resolved)) throw new Error('Only local drive paths are supported in WSL');
  return `/mnt/${resolved[0].toLowerCase()}/${resolved.slice(3)}`;
}

async function actonCommand() {
  if (process.platform !== 'win32' || process.env.ACTON_EXE) return { command: process.env.ACTON_EXE ?? 'acton', prefix: [] };
  const distro = process.env.WSL_DISTRO ?? 'Ubuntu';
  const acton = process.env.ACTON_WSL_PATH ?? (await run('wsl.exe',['-d',distro,'--exec','/bin/bash','-lc','command -v acton'])).stdout.trim();
  if (!acton.startsWith('/') || acton.includes('\n')) throw new Error('Cannot locate Acton in WSL');
  return { command: 'wsl.exe', prefix: ['-d',distro,'--exec',acton] };
}

export async function tolkVersion() {
  const { command, prefix } = await actonCommand();
  return { backend:'acton', acton:(await run(command,[...prefix,'--version'],{ timeout:30000,windowsHide:true })).stdout.trim() };
}

export async function compileTolk({ sources }) {
  const workspace = path.join(root, 'artifacts/tolk-build');
  await fs.mkdir(workspace, { recursive:true });
  const directory = await fs.mkdtemp(path.join(workspace, 'compile-'));
  try {
    for (const [name, content] of Object.entries(sources)) {
      if (!/^[\w.-]+(?:\/[\w.-]+)*\.tolk$/.test(name) || name.split('/').some(part => part === '.' || part === '..')) throw new Error('Invalid Tolk source path');
      const file = path.join(directory, name);
      await fs.mkdir(path.dirname(file), { recursive:true }); await fs.writeFile(file, content);
    }
    const { command, prefix } = await actonCommand();
    let args = ['compile', path.join(directory,'main.tolk'), '--allow-no-entrypoint', '--json', '--fift', path.join(directory,'main.fif')];
    if (process.platform === 'win32' && !process.env.ACTON_EXE) {
      args[1] = wslPath(args[1]); args[5] = wslPath(args[5]);
    }
    args = [...prefix,...args];
    let result;
    try { result = await run(command,args,{ cwd:directory,timeout:30000,maxBuffer:8*1024*1024,windowsHide:true }); }
    catch (error) {
      let message;
      try { message = JSON.parse(error.stdout).error; } catch { message = error.stderr || error.message; }
      return { status:'error',message };
    }
    const compiled = JSON.parse(result.stdout);
    if (!compiled.success || !compiled.code_boc64) return { status:'error',message:compiled.error ?? 'Acton compilation failed' };
    return { status:'ok',codeBoc:compiled.code_boc64,fiftCode:await fs.readFile(path.join(directory,'main.fif'),'utf8') };
  } finally {
    const resolved = path.resolve(directory);
    if (!resolved.startsWith(path.resolve(workspace) + path.sep)) throw new Error('Invalid Tolk scratch path');
    await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
}
