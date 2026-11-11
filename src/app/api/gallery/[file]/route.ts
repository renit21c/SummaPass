import { NextResponse } from 'next/server';
import { galleryFileSchema } from '@/features/gallery/core';
import { readGalleryImage } from '@/features/gallery/service';
export async function GET(_r:Request,{params}:{params:Promise<{file:string}>}){
 const parsed=galleryFileSchema.safeParse((await params).file);
 if(!parsed.success)return new NextResponse(null,{status:404});
 try{return new NextResponse(await readGalleryImage(parsed.data),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}
 catch{return new NextResponse(null,{status:404});}
}
