import { NextResponse } from 'next/server';
import { publicEvent } from '@/features/catalog/service';
import { eventGallery } from '@/features/gallery/service';
import { seatingFailure } from '@/features/seating/http';
export async function GET(_r:Request,{params}:{params:Promise<{slug:string}>}){
 try{
  const event=await publicEvent((await params).slug);
  if(!event)return NextResponse.json({error:'Event tidak ditemukan.'},{status:404});
  return NextResponse.json({images:await eventGallery(event.id)},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return seatingFailure(e);}
}
