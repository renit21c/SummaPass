import { readFileSync,existsSync,mkdirSync,writeFileSync,renameSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { managedSchema,type ManagedEvent } from './core';
export const catalogRoot=process.env.SUMMAPASS_DATA_DIR??join(process.cwd(),'.data');
const root=catalogRoot;
export function loadCatalog():ManagedEvent[]|undefined{const path=join(root,'catalog.json');if(!existsSync(path))return undefined;return z.array(managedSchema).parse(JSON.parse(readFileSync(path,'utf8'))) as ManagedEvent[];}
export function saveCatalog(items:ManagedEvent[]){mkdirSync(root,{recursive:true});const target=join(root,'catalog.json'),temporary=join(root,'catalog.tmp');writeFileSync(temporary,JSON.stringify(items,null,2));renameSync(temporary,target);}
