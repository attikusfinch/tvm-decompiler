import fs from 'node:fs/promises';
import path from 'node:path';
import {root} from './lib.mjs';

// Project ownership is explicit. Contract IDs stay stable across folder moves.
export const reconstructionRoot = path.resolve(root, '../reconstruction');
export const projectCatalog = JSON.parse(await fs.readFile(
    path.join(reconstructionRoot, 'projects.json'), 'utf8'));
const families = new Map();
for (const project of projectCatalog.projects) {
    for (const contract of project.contracts) {
        if (families.has(contract.name)) throw new Error('Duplicate contract: ' + contract.name);
        families.set(contract.name, {project: project.id, directory: contract.directory});
    }
}

function family(name) {
    const entry = families.get(name);
    if (!entry) throw new Error('Contract has no project assignment: ' + name);
    return entry;
}

export const familyDirectory = name => family(name).directory;
export const familyProject = name => family(name).project;
