import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { galleryObjectPath,galleryFileError,galleryCaptionSchema,type GalleryImage } from '../src/features/gallery/core';
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]):Promise<T&{error?:string;message?:string}>{return (await db.query<{r:T&{error?:string;message?:string}}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}

test('gallery file validation limits images and rejects path traversal',()=>{
 const file=`${actors.organizer}_${actors.buyer}.webp`;
 assert.equal(galleryObjectPath(file),`${actors.organizer}/${actors.buyer}.webp`);
 for(const path of ['../secret.webp',file.replace('_','/'),file+'.png','not-a-uuid.webp'])assert.throws(()=>galleryObjectPath(path));
 assert.equal(galleryFileError({size:3*1024*1024,type:'image/jpeg'}),'');
 assert.match(galleryFileError({size:3*1024*1024+1,type:'image/jpeg'}),/3 MB/);
 assert.match(galleryFileError({size:100,type:'image/svg+xml'}),/JPG/);
 assert.match(galleryFileError({size:0,type:'image/png'}),/kosong/);
 assert.equal(galleryCaptionSchema.safeParse('a'.repeat(161)).success,false);
});

test('gallery metadata and Storage enforce organizer scope, draft privacy, quota and image unlinking',async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);
  const event=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,newEvent()]);
  const other=await rpc<{id:string}>(db,'manage_event',['create',null,{...newEvent(),title:'Galeri acara lain'}]);
  const image=randomUUID(),path=`${event.id}/${image}.webp`;
  assert.equal((await rpc(db,'manage_event_gallery',[event.id,'add',image,'Panggung'])).error,'UPLOAD_REQUIRED');
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['event-gallery',path]);
  let list=await rpc<GalleryImage[]>(db,'manage_event_gallery',[event.id,'add',image,'Panggung']);assert.equal(list.length,1);assert.equal(list[0].url,`/api/gallery/${event.id}_${image}.webp`);
  assert.equal((await rpc<GalleryImage[]>(db,'manage_event_gallery',[event.id,'add',image,'Panggung'])).length,1);
  assert.equal((await rpc(db,'manage_event_gallery',[other.id,'delete',image,''])).error,'NOT_FOUND');
  assert.equal((await rpc(db,'manage_event_gallery',[other.id,'add',image,''])).error,'UPLOAD_REQUIRED');
  assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning id',['event-gallery',path])).rows.length,0);
  await db.exec('reset role');await db.query('insert into public.event_access(event_id,user_id,role) values($1,$2,$3)',[event.id,actors.staff,'STAFF']);
  for(const actor of [actors.staff,actors.buyer,actors.other]){
   await asUser(db,actor);assert.equal((await rpc(db,'manage_event_gallery',[event.id,'caption',image,'Tidak boleh'])).error,'FORBIDDEN');
   assert.equal((await rpc(db,'event_gallery',[event.id])).error,'NOT_FOUND');
   assert.equal((await db.query('select id from public.event_gallery_images where event_id=$1',[event.id])).rows.length,0);
   assert.equal((await db.query('select id from storage.objects where bucket_id=$1 and name=$2',['event-gallery',path])).rows.length,0);
   await assert.rejects(()=>db.query("insert into storage.objects(bucket_id,name) values('event-gallery',$1)",[`${event.id}/${randomUUID()}.webp`]));
  }
  await asUser(db);await assert.rejects(()=>rpc(db,'manage_event_gallery',[event.id,'delete',image,'']));
  assert.equal((await rpc(db,'event_gallery',[event.id])).error,'NOT_FOUND');
  await asUser(db,actors.organizer);await rpc(db,'manage_event',['publish',event.id,{}]);
  await asUser(db);assert.equal((await rpc<GalleryImage[]>(db,'event_gallery',[event.id])).length,1);
  assert.equal((await db.query('select id from storage.objects where bucket_id=$1 and name=$2',['event-gallery',path])).rows.length,1);
  await asUser(db,actors.organizer);
  list=await rpc(db,'manage_event_gallery',[event.id,'caption',image,'Area panggung utama']);assert.equal(list[0].caption,'Area panggung utama');
  for(let n=1;n<10;n++){
   const id=randomUUID();await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['event-gallery',`${event.id}/${id}.webp`]);
   list=await rpc(db,'manage_event_gallery',[event.id,'add',id,`Foto ${n}`]);assert.equal(list.error,undefined,list.message);
  }
  assert.equal(list.length,10);
  const overflow=randomUUID();await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['event-gallery',`${event.id}/${overflow}.webp`]);
  assert.equal((await rpc(db,'manage_event_gallery',[event.id,'add',overflow,''])).error,'QUOTA');
  assert.equal((await rpc(db,'manage_event_gallery',[event.id,'caption',image,'a'.repeat(161)])).error,'INPUT');
  list=await rpc(db,'manage_event_gallery',[event.id,'delete',image,'']);assert.equal(list.length,9);
  await asUser(db);assert.equal((await db.query('select id from storage.objects where bucket_id=$1 and name=$2',['event-gallery',path])).rows.length,0);
  await asUser(db,actors.organizer);assert.equal((await db.query('delete from storage.objects where bucket_id=$1 and name=$2 returning id',['event-gallery',path])).rows.length,1);
  await rpc(db,'manage_event',['unpublish',event.id,{}]);await asUser(db);assert.equal((await rpc(db,'event_gallery',[event.id])).error,'NOT_FOUND');
 }finally{await db.close();}
});
