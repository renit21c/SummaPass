import { NextRequest,NextResponse } from 'next/server';
import { organizerReportSnapshot } from '@/features/organizer/service';
import { resolveSuboRange } from '@/features/subo/organizer-contracts';
import { organizerAssistantSummary } from '@/features/subo/organizer-core';
import { failure } from '@/features/booking/http';

export async function GET(request:NextRequest){
 let range;try{range=resolveSuboRange({from:request.nextUrl.searchParams.get('from')||undefined,to:request.nextUrl.searchParams.get('to')||undefined,month:request.nextUrl.searchParams.get('month')||undefined});}
 catch{return NextResponse.json({error:'Periksa bulan atau rentang tanggal laporan.'},{status:400});}
 try{
  const snapshot=await organizerReportSnapshot(range);
  return NextResponse.json({...organizerAssistantSummary(snapshot),range},{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){return failure(error);}
}
