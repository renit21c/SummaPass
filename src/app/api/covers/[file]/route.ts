import { catalogRoot } from '@/features/catalog/persistence';
import { NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { publicCatalog,managedEvent } from '@/features/catalog/service';
export async function GET(_r:Request,{params}:{params:Promise<{file:string}>}){const {file}=await params;if(!/^[a-f0-9-]{36}_[a-f0-9-]{36}\.webp$/.test(file))return new NextResponse(null,{status:404});const url=`/api/covers/${file}`;let allowed=(await publicCatalog()).some(e=>e.coverUrl===url);if(!allowed){try{allowed=(await managedEvent(file.slice(0,36))).coverUrl===url;}catch{}}if(!allowed)return new NextResponse(null,{status:404});try{return new NextResponse(new Uint8Array(await readFile(join(catalogRoot,'covers',file))),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}catch{return new NextResponse(null,{status:404});}}
