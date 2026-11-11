import { NextRequest,NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sameOrigin } from '@/lib/auth/request';
import { normalizeCover } from '@/features/catalog/cover';
import { coverFormData } from '@/features/catalog/upload';
import { seatingBody,seatingFailure } from '@/features/seating/http';
import { organizerGallery,changeGallery,storeGalleryImage,removeGalleryObject } from '@/features/gallery/service';
import { galleryCaptionSchema,galleryFileError,MAX_GALLERY_BYTES,MAX_GALLERY_IMAGES } from '@/features/gallery/core';
import { BookingError } from '@/features/booking/types';
type Context={params:Promise<{id:string}>};
const headers={'Cache-Control':'private, no-store'};
export async function GET(_r:NextRequest,{params}:Context){
 try{return NextResponse.json({images:await organizerGallery(z.string().uuid().parse((await params).id))},{headers});}catch(e){return seatingFailure(e);}
}
export async function POST(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{
  const id=z.string().uuid().parse((await params).id),images=await organizerGallery(id);
  if(images.length>=MAX_GALLERY_IMAGES)throw new BookingError('QUOTA','Maksimal 10 foto per event.');
  const form=await coverFormData(r,MAX_GALLERY_BYTES+64*1024),file=form.get('photo'),caption=galleryCaptionSchema.parse(form.get('caption')??'');
  if(!(file instanceof File))throw new BookingError('INPUT','Pilih foto untuk galeri.',400);
  const invalid=galleryFileError(file);if(invalid)throw new BookingError('INPUT',invalid,400);
  let bytes:Buffer;
  try{bytes=await normalizeCover(Buffer.from(await file.arrayBuffer()),file.type);}catch{throw new BookingError('INPUT','Gunakan JPG, PNG, atau WebP minimal 400 × 250 piksel, maksimal 24 MP, tanpa animasi.',400);}
  if(bytes.length>MAX_GALLERY_BYTES)throw new BookingError('INPUT','Foto terlalu besar setelah diproses. Pilih foto lain.',400);
  const imageId=randomUUID(),filename=`${id}_${imageId}.webp`;
  await storeGalleryImage(filename,bytes);
  try{return NextResponse.json({images:await changeGallery(id,'add',imageId,caption)},{status:201,headers});}
  catch(e){await removeGalleryObject(filename).catch(()=>{});throw e;}
 }catch(e){return seatingFailure(e);}
}
export async function PATCH(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{const id=z.string().uuid().parse((await params).id),input=z.object({imageId:z.string().uuid(),caption:galleryCaptionSchema}).parse(await seatingBody(r,4096));return NextResponse.json({images:await changeGallery(id,'caption',input.imageId,input.caption)},{headers});}catch(e){return seatingFailure(e);}
}
export async function DELETE(r:NextRequest,{params}:Context){
 if(!sameOrigin(r))return NextResponse.json({error:'Permintaan tidak diizinkan.'},{status:403});
 try{
  const id=z.string().uuid().parse((await params).id),input=z.object({imageId:z.string().uuid()}).parse(await seatingBody(r,4096));
  const images=await changeGallery(id,'delete',input.imageId);
  let warning:string|undefined;
  try{await removeGalleryObject(`${id}_${input.imageId}.webp`);}catch{warning='Foto sudah dihapus dari galeri. Pembersihan file akan perlu dicoba lagi.';}
  return NextResponse.json({images,warning},{headers});
 }catch(e){return seatingFailure(e);}
}
