import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { organizerSnapshot,getEventStaff } from '@/features/organizer/service';
import { organizer } from '@/features/catalog/service';
import { eventAttendees } from '@/features/organizer/tools-service';
import { inReportRange } from '@/features/organizer/tools-core';
import { resolveSuboRange } from '@/features/subo/organizer-contracts';
import { demoEventCheckIns } from '@/features/booking/service';
import { organizerAttendanceSummary } from '@/features/subo/organizer-core';
import { failure } from '@/features/booking/http';

export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams;
 const input=z.object({id:z.string().uuid(),topic:z.enum(['attendance','staff'])}).safeParse({id:params.get('id'),topic:params.get('topic')});
 let range;try{range=resolveSuboRange({month:params.get('month')||undefined,from:params.get('from')||undefined,to:params.get('to')||undefined});}catch{return NextResponse.json({error:'Periksa periode laporan.'},{status:400});}
 if(!input.success)return NextResponse.json({error:'Pilih event dan jenis informasi yang valid.'},{status:400});
 try{
  const user=await organizer();
  const snapshot=await organizerSnapshot();
  const event=snapshot.events.find(event=>event.id===input.data.id);
  if(!event)return NextResponse.json({error:'Event tidak ditugaskan.'},{status:403});
  let result;
  if(input.data.topic==='staff'){
   const staff=await getEventStaff(event.id);
   result={topic:'staff',staff:staff.map(({name,assignedAt})=>({name,assignedAt}))};
  }else if(user.mode==='demo'){
   const sold=snapshot.bookings.filter(b=>b.slug===event.slug&&b.status==='CONFIRMED'&&b.paymentStatus==='PAID').reduce((sum,b)=>sum+b.items.length,0);
   const records=demoEventCheckIns(user.id,event.id);
   result={topic:'attendance',attended:records.filter(row=>inReportRange(row.checkedInAt,range)).length,totalSold:sold,notCheckedIn:Math.max(0,sold-records.length)};
  }else{
   result=organizerAttendanceSummary(await eventAttendees(event.id),range);
  }
  return NextResponse.json(result,{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
 }catch(error){return failure(error);}
}
