import { NextResponse } from 'next/server';
import { publicCatalog,managedEvent } from '@/features/catalog/service';
import { readCover } from '@/features/catalog/storage';
import { coverFileSchema } from '@/features/catalog/contract';
import { failure } from '@/features/booking/http';
export async function GET(_r:Request,{params}:{params:Promise<{file:string}>}){
 const {file}=await params;if(!coverFileSchema.safeParse(file).success)return new NextResponse(null,{status:404});
 try {
  const url=`/api/covers/${file}`;let allowed=(await publicCatalog()).some(e=>e.coverUrl===url);
  if(!allowed){try{allowed=(await managedEvent(file.slice(0,36))).coverUrl===url;}catch{}}
  if(!allowed)return new NextResponse(null,{status:404});
  try{return new NextResponse(await readCover(file),{headers:{'Content-Type':'image/webp','X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});}
  catch{return new NextResponse(null,{status:404});}
 }catch(error){return failure(error);}
}
