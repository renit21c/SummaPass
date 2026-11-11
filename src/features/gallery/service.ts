import 'server-only';
import { mkdir,readFile,writeFile,unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { authMode } from '@/lib/auth/config';
import { supabaseServer } from '@/lib/supabase/server';
import { managedEvent } from '../catalog/service';
import { catalogResult } from '../catalog/contract';
import { catalogRoot } from '../catalog/persistence';
import { demoPublicEvents } from '../booking/service';
import { BookingError } from '../booking/types';
import { gallerySchema,galleryObjectPath,galleryCaptionSchema,MAX_GALLERY_IMAGES } from './core';
import { localGallery,saveLocalGallery } from './persistence';
const bucket='event-gallery',root=join(catalogRoot,'gallery');
async function rpc(name:string,args:Record<string,unknown>){
 const {data,error}=await (await supabaseServer()).rpc(name,args);
 if(error)throw new BookingError('DATABASE','Galeri belum tersedia. Pastikan migrasi 025 sudah dijalankan.',503);
 return gallerySchema.parse(catalogResult(data,null));
}
export async function eventGallery(eventId:string){
 if(authMode()==='supabase')return rpc('event_gallery',{p_event:eventId});
 if(!demoPublicEvents().some(e=>e.id===eventId))await managedEvent(eventId);
 return localGallery(eventId);
}
export async function organizerGallery(eventId:string){await managedEvent(eventId);return eventGallery(eventId);}
export async function changeGallery(eventId:string,action:'add'|'caption'|'delete',imageId:string,caption=''){
 const event=await managedEvent(eventId);caption=galleryCaptionSchema.parse(caption);
 if(event.status==='ARCHIVED'||event.cancelledAt)throw new BookingError('CLOSED','Galeri event ini tidak dapat diubah.');
 if(authMode()==='supabase')return rpc('manage_event_gallery',{p_event:eventId,p_action:action,p_image:imageId,p_caption:caption});
 const items=localGallery(eventId),found=items.find(i=>i.id===imageId);
 if(action==='add'){
  if(found)return items;
  if(items.length>=MAX_GALLERY_IMAGES)throw new BookingError('QUOTA','Maksimal 10 foto per event.');
  const file=`${eventId}_${imageId}.webp`;
  try{await readFile(join(root,file));}catch{throw new BookingError('UPLOAD_REQUIRED','Unggah foto terlebih dahulu.');}
  const current=localGallery(eventId);
  if(current.length>=MAX_GALLERY_IMAGES)throw new BookingError('QUOTA','Maksimal 10 foto per event.');
  return saveLocalGallery(eventId,[...current,{id:imageId,url:`/api/gallery/${file}`,caption,position:Math.max(-1,...current.map(i=>i.position))+1}]);
 }
 if(!found)throw new BookingError('NOT_FOUND','Foto tidak ditemukan.',404);
 return saveLocalGallery(eventId,action==='delete'?items.filter(i=>i.id!==imageId):items.map(i=>i.id===imageId?{...i,caption}:i));
}
export async function storeGalleryImage(file:string,bytes:Buffer){
 const path=galleryObjectPath(file);
 if(authMode()==='demo'){await mkdir(root,{recursive:true});await writeFile(join(root,file),bytes,{flag:'wx'});return;}
 const {error}=await (await supabaseServer()).storage.from(bucket).upload(path,bytes,{contentType:'image/webp',upsert:false});
 if(error)throw new BookingError('STORAGE','Foto belum dapat disimpan. Coba lagi.',503);
}
export async function removeGalleryObject(file:string){
 const path=galleryObjectPath(file);
 if(authMode()==='demo'){await unlink(join(root,file)).catch(()=>{});return;}
 const {error}=await (await supabaseServer()).storage.from(bucket).remove([path]);
 if(error)throw new BookingError('STORAGE','Foto sudah dihapus dari galeri, tetapi pembersihan file belum berhasil.',503);
}
export async function readGalleryImage(file:string){
 const path=galleryObjectPath(file);
 if(authMode()==='demo'){
  const images=await eventGallery(file.slice(0,36));
  if(!images.some(i=>i.url===`/api/gallery/${file}`))throw new BookingError('NOT_FOUND','Foto tidak ditemukan.',404);
  return new Uint8Array(await readFile(join(root,file)));
 }
 const {data,error}=await (await supabaseServer()).storage.from(bucket).download(path);
 if(error||!data)throw new BookingError('NOT_FOUND','Foto tidak ditemukan.',404);
 return new Uint8Array(await data.arrayBuffer());
}
