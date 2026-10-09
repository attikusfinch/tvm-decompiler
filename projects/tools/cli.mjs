import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {build, root, workspace, selectProjects} from './build.mjs';
import {formatFunc} from './format-func.mjs';

const run = promisify(execFile);
const options = {maxBuffer: 16 * 1024 * 1024, timeout: 300000, windowsHide: true};
const toWsl = filename => {
  const full = path.resolve(filename).replaceAll('\\', '/');
  assert.match(full, /^[A-Za-z]:\//, 'WSL needs a drive-backed path');
  return `/mnt/${full[0].toLowerCase()}/${full.slice(3)}`;
};
let command;
async function acton(args, project) {
  if (!command) {
    if (process.platform === 'win32' && !process.env.ACTON_EXE) {
      const distro = process.env.WSL_DISTRO ?? 'Ubuntu';
      const binary = process.env.ACTON_WSL_PATH ?? (await run('wsl.exe', ['-d', distro, '--exec',
        '/bin/bash', '-lc', 'command -v acton'], options)).stdout.trim();
      assert.match(binary, /^\/[^\r\n]+$/);
      command = {exe: 'wsl.exe', prefix: ['-d', distro, '--exec', binary], wsl: true};
    } else command = {exe: process.env.ACTON_EXE ?? 'acton', prefix: [], wsl: false};
  }
  const projectRoot = project && path.join(root, project);
  const all = [...command.prefix, ...args];
  if (projectRoot) all.push('--project-root', command.wsl ? toWsl(projectRoot) : projectRoot);
  try {
    return await run(command.exe, all, {...options, cwd: projectRoot ?? root});
  } catch (error) {
    process.stderr.write(error.stdout ?? '');
    process.stderr.write(error.stderr ?? '');
    throw new Error(`Acton ${args[0]} failed for ${project ?? 'workspace'} (exit ${error.code})`);
  }
}

const [action = 'test', ...requested] = process.argv.slice(2);
assert.ok(['build','test','fmt','fmt-check','doctor'].includes(action), 'Unknown command: ' + action);
const projects = selectProjects(requested);
const startedAt = new Date().toISOString();
let version;
if (action !== 'build') {
  version = (await acton(['--version'])).stdout.trim();
  assert.ok(version.startsWith('acton ' + workspace.toolchain.acton + ' '), 'Install Acton ' + workspace.toolchain.acton + '; got ' + version);
  console.log(version);
}
let proofs;
if (action === 'build' || action === 'test') proofs = await build(projects);
if (action === 'test') {
  const reports = [];
  for (const id of projects) {
    await acton(['init', '--stdlib-only', '--color', 'never'], id);
    const result = await acton(['test', '--color', 'never', '--no-studio-reporting',
      '--reporter', 'console,junit', '--junit-path', 'test-results/junit'], id);
    console.log(result.stdout);
    const directory = path.join(root, id, 'test-results');
    await fs.mkdir(directory, {recursive: true});
    await fs.writeFile(path.join(directory, 'console.txt'), result.stdout);
    const summary = result.stdout.match(/(\d+) passed in (\d+) files?/);
    assert.ok(summary, 'Missing successful Acton test summary for ' + id);
    const report = {project: id, tests: Number(summary[1]), files: Number(summary[2]), passed: true};
    await fs.writeFile(path.join(directory, 'result.json'), JSON.stringify({startedAt, ...report}, null, 2) + '\n');
    reports.push(report);
  }
  if (projects.length === Object.keys(workspace.projects).length) {
    const report = {schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(),
      acton: version, node: process.version, sourceCompilers: workspace.toolchain,
      serialization: {idx: false, crc32: true},
      counts: {contracts: proofs.length, byteExact: proofs.filter(p => p.sameSerializedBoc).length,
        actonTests: reports.reduce((n, p) => n + p.tests, 0)}, projects: reports,
      contracts: proofs.map(({sourceSha256, compiler, ...proof}) => proof)};
    await fs.writeFile(path.join(root, 'verification.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
if (action === 'fmt' || action === 'fmt-check') {
  for (const id of projects) {
    // Full-range formatting deliberately disables import sorting. Import order
    // assigns union tags and method IDs in the historical Tolk compiler.
    const entries = await fs.readdir(path.join(root, id), {recursive: true, withFileTypes: true});
    for (const entry of entries.filter(e => e.isFile() && e.name.endsWith('.fc') &&
      !/[\\/](\.acton|gen|build|node_modules)[\\/]/.test(path.join(e.parentPath, e.name)))) {
      const filename = path.join(entry.parentPath, entry.name);
      const source = await fs.readFile(filename, 'utf8');
      const formatted = formatFunc(source);
      if (action === 'fmt-check') assert.equal(formatted, source, filename + ': FunC formatting');
      else await fs.writeFile(filename, formatted);
    }
    const files = entries.filter(e => e.isFile() && e.name.endsWith('.tolk') &&
      !/[\\/](\.acton|gen|build|node_modules)[\\/]/.test(path.join(e.parentPath, e.name)));
    for (const file of files) {
      const full = path.join(file.parentPath, file.name);
      const source = await fs.readFile(full, 'utf8');
      const lines = source.split('\n');
      const range = `0:0-${lines.length - 1}:${Buffer.byteLength(lines.at(-1))}`;
      const relative = path.relative(path.join(root, id), full).replaceAll('\\', '/');
      await acton(['fmt', relative, '--range', range,
        ...(action === 'fmt-check' ? ['--check'] : []), '--color', 'never'], id);
    }
    console.log(`${id}: ${files.length} Tolk files ${action === 'fmt-check' ? 'checked' : 'formatted'} (import order preserved)`);
  }
  // Formatting is accepted only if every affected candidate still matches mainnet.
  if (action === 'fmt') await build(projects);
}
if (action === 'doctor') console.log('Node ' + process.version + '; source compilers pinned in package-lock.json.');
