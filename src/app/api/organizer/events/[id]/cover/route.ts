import { catalogRoot } from '@/features/catalog/persistence';
import { NextRequest,NextResponse } from 'next/server';

import { randomUUID } from 'node:crypto';

import { mkdir,writeFile } from 'node:fs/promises';

import { join } from 'node:path';

import { managedEvent,coverEvent } from '@/features/catalog/service';

import { normalizeCover } from '@/features/catalog/cover';

import { sameOrigin } from '@/lib/auth/request';

import { failure } from '@/features/booking/http';

export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});try{const {id}=await params;const event=await managedEvent(id);if(event.status==='ARCHIVED')return NextResponse.json({error:'Event arsip tidak dapat diedit.'},{status:409});if(Number(r.headers.get('content-length'))>6*1024*1024)return NextResponse.json({error:'File terlalu besar.'},{status:413});const file=(await r.formData()).get('cover');if(!(file instanceof File)||file.size>5*1024*1024)return NextResponse.json({error:'Pilih cover maksimal 5 MB.'},{status:400});let bytes:Buffer;try{bytes=await normalizeCover(Buffer.from(await file.arrayBuffer()),file.type);}catch{return NextResponse.json({error:'Cover harus JPG, PNG, atau WebP, minimal 400 × 250 piksel dan maksimal 5 MB.'},{status:400});}const filename=`${id}_${randomUUID()}.webp`;const root=join(catalogRoot,'covers');await mkdir(root,{recursive:true});await writeFile(join(root,filename),bytes);return NextResponse.json(await coverEvent(id,`/api/covers/${filename}`));}catch(e){return failure(e);}}
