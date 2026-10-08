import fs from 'node:fs/promises';
import path from 'node:path';
import {FuncCompiler} from '@ton-community/func-js';
import {object} from 'func-bin-044';

// Compiler output is assembled by this pinned distribution's bundled Fift.
// No oracle file or post-compilation instruction rewrite is involved.
const compiler=new FuncCompiler(object);
export const legacyFuncVersion=()=>compiler.compilerVersion();

export async function loadFuncSources(project,entry) {
    const base=path.resolve(project),sources={},pending=[path.resolve(base,entry)];
    while(pending.length) {
        const file=pending.pop();
        if(!file.startsWith(base+path.sep))throw new Error('FunC include escapes project: '+file);
        const name=path.relative(base,file).replaceAll('\\','/');
        if(Object.hasOwn(sources,name))continue;
        const source=await fs.readFile(file,'utf8');sources[name]=source;
        for(const [,dependency]of source.matchAll(/^\s*#include\s+"([^"]+)"/gm))
            pending.push(path.resolve(path.dirname(file),dependency));
    }
    return sources;
}

export async function compileLegacyFunc(config) {
    const events=['uncaughtException','unhandledRejection'];
    const before=new Map(events.map(event=>[event,new Set(process.listeners(event))]));
    try{return await compiler.compileFunc({...config,optLevel:config.optLevel??2});}
    finally {
        for(const event of events)for(const listener of process.listeners(event))
            if(!before.get(event).has(listener))process.removeListener(event,listener);
    }
}
