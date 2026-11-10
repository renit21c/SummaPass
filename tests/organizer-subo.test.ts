import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { organizerAssistantSummary,organizerAttendanceSummary } from '../src/features/subo/organizer-core';
import { resolveSuboRange } from '../src/features/subo/organizer-contracts';

test('Subo ranks only paid confirmed sales from assigned events and returns no attendee details',()=>{
 const store=new DemoBookingStore(()=>Date.parse('2026-11-03T00:00:00Z'));
 const reserve=(slug:string,seatId:string)=>store.reserve('buyer',{slug,categoryId:'regular',seats:[{seatId,name:'Private participant'}],key:randomUUID()});
 const first=reserve('little-weekend','Regular-B1');store.payment('buyer',first.id,'success');
 const second=reserve('senja-di-summa','Regular-B1');store.payment('buyer',second.id,'success');
 reserve('senja-di-summa','Regular-B2');
 const failed=reserve('senja-di-summa','Regular-B3');store.payment('buyer',failed.id,'failure');
 const outside=reserve('after-hours','Regular-B1');store.payment('buyer',outside.id,'success');
 const result=organizerAssistantSummary(store.organizerSnapshot(),Date.parse('2026-11-03T00:00:00Z'));
 assert.equal(result.events[0].slug,'senja-di-summa');
 assert.equal(result.events[0].revenue,125000);
 assert.equal(result.totals.revenue,200000);
 assert.equal(result.totals.sold,2);
 assert.equal(result.totals.pending,1);
 assert.equal(result.totals.pendingAmount,125000);
 assert.equal(organizerAssistantSummary(store.organizerSnapshot(),Date.parse('2026-11-03T01:00:00Z')).totals.pending,0);
 assert.equal(result.events.some(event=>event.slug==='after-hours'),false);
 assert.equal(JSON.stringify(result).includes('Private participant'),false);
 assert.equal(JSON.stringify(result).includes(first.reference),false);
});

test('Subo summary retains events and shows zero totals for an empty reporting period',()=>{
 const store=new DemoBookingStore();
 const snapshot=store.organizerSnapshot();
 const result=organizerAssistantSummary({...snapshot,bookings:[]});
 assert.equal(result.events.length,snapshot.events.length);
 assert.deepEqual(result.totals,{revenue:0,sold:0,pending:0,pendingAmount:0});
});

test('Subo month filter handles leap years, WIB boundaries and rejects mixed or invalid periods',()=>{
 assert.deepEqual(resolveSuboRange({month:'2028-02'}),{from:'2028-02-01',to:'2028-02-29'});
 assert.deepEqual(resolveSuboRange({month:'2026-12'}),{from:'2026-12-01',to:'2026-12-31'});
 for(const value of [{month:'2026-13'},{month:'2026-2'},{month:'2026-02',from:'2026-01-01'},{from:'2026-12-01',to:'2026-01-01'}])assert.throws(()=>resolveSuboRange(value));
 const paid=(checkedInAt:string|null)=>({status:'CONFIRMED',paymentStatus:'PAID',checkedInAt});
 const rows=[paid('2026-10-31T17:00:00Z'),paid('2026-11-30T16:59:59Z'),paid('2026-11-30T17:00:00Z'),paid(null),{status:'CANCELLED',paymentStatus:'PAID',checkedInAt:'2026-11-03T00:00:00Z'}];
 assert.deepEqual(organizerAttendanceSummary(rows,resolveSuboRange({month:'2026-11'})),{topic:'attendance',attended:2,totalSold:4,notCheckedIn:1});
});
