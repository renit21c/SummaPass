import type { OrganizerSnapshot } from '@/features/organizer/core';
import { inReportRange } from '@/features/organizer/tools-core';

export function organizerAttendanceSummary(rows:{status:string;paymentStatus:string;checkedInAt:string|null}[],range:{from?:string;to?:string}){
 const paid=rows.filter(row=>row.status==='CONFIRMED'&&row.paymentStatus==='PAID');
 return {topic:'attendance' as const,attended:paid.filter(row=>row.checkedInAt&&inReportRange(row.checkedInAt,range)).length,totalSold:paid.length,notCheckedIn:paid.filter(row=>!row.checkedInAt).length};
}

export function organizerAssistantSummary(snapshot:OrganizerSnapshot,now=Date.now()) {
 const events=snapshot.events.map(event=>{
  const bookings=snapshot.bookings.filter(booking=>booking.slug===event.slug);
  const paid=bookings.filter(booking=>booking.status==='CONFIRMED'&&booking.paymentStatus==='PAID');
  const pending=bookings.filter(booking=>booking.status==='PENDING_PAYMENT'&&Date.parse(booking.expiresAt)>now);
  return {id:event.id,slug:event.slug,title:event.title,revenue:paid.reduce((sum,booking)=>sum+booking.total,0),sold:paid.reduce((sum,booking)=>sum+booking.items.length,0),pending:pending.length,pendingAmount:pending.reduce((sum,booking)=>sum+booking.total,0)};
 }).sort((a,b)=>b.revenue-a.revenue||b.sold-a.sold||a.title.localeCompare(b.title));
 return {events,mode:snapshot.mode,totals:{revenue:events.reduce((n,e)=>n+e.revenue,0),sold:events.reduce((n,e)=>n+e.sold,0),pending:events.reduce((n,e)=>n+e.pending,0),pendingAmount:events.reduce((n,e)=>n+e.pendingAmount,0)}};
}
