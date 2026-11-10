import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { eventInput,duplicateEventInput } from '../src/features/catalog/core';
import { editorValidation } from '../src/features/catalog/editor-validation';
import { bookingRequestSchema,type Booking,type Inventory } from '../src/features/booking/types';
import { createTicketPack } from '../src/features/tickets/crypto';
import { categoryInventory,metrics } from '../src/features/organizer/core';

type Result<T>=T&{error?:string;message?:string};
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:Result<T>}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}
const input=(quota=100)=>({...newEvent(),category:'Musik' as const,theme:'play' as const,seatingMode:'GENERAL_ADMISSION' as const,regularQuota:quota,frontPrice:0});
const attendee=(name='Peserta')=>({name});

test('GA schema supports ticket capacity and duplication without loosening seated capacity',()=>{
 assert.ok(eventInput.safeParse(input(2000)).success);
 assert.equal(eventInput.safeParse(input(2001)).success,false);
 assert.equal(eventInput.safeParse({...input(25),seatingMode:'SEATED'}).success,false);
 assert.equal(bookingRequestSchema.safeParse({slug:'demo',categoryId:'regular',attendees:[],key:randomUUID()}).success,false);
 const store=new DemoBookingStore(()=>Date.parse('2026-11-10T00:00:00Z'));
 const created=store.createEvent('organizer',input(100));
 assert.equal(duplicateEventInput(created).regularQuota,100);
 assert.equal(duplicateEventInput(created).seatingMode,'GENERAL_ADMISSION');
 const values=Object.fromEntries(Object.entries(input(100)).map(([k,v])=>[k,String(v)]));
 for(const key of ['startsAt','endsAt','salesStart','salesEnd'])values[key]=String(input()[key as keyof ReturnType<typeof input>]).slice(0,16);
 assert.ok(editorValidation(values).result.success);
});

test('demo GA hides units, enforces quota, retries and releases cancelled/expired tickets',()=>{
 let clock=Date.parse('2026-11-10T00:00:00Z');const store=new DemoBookingStore(()=>clock);
 const e=store.createEvent('organizer',input(2));store.eventStatus('organizer',e.id,'publish');
 assert.equal(store.inventory(e.slug).seats.length,0);
 const req={slug:e.slug,categoryId:'regular',attendees:[attendee('A'),attendee('B')],key:randomUUID()};
 const b=store.reserveAdmission('buyer',req);assert.equal(b.total,150000);assert.ok(b.items.every(i=>i.label==='Tanpa nomor kursi'));
 assert.equal(store.reserveAdmission('buyer',req).id,b.id);
 assert.throws(()=>store.reserveAdmission('buyer',{...req,attendees:[attendee('Changed')]}),/Permintaan berubah/);
 assert.throws(()=>store.reserveAdmission('other',{...req,key:randomUUID()}),/tidak mencukupi/);
 assert.throws(()=>store.updateEvent('organizer',e.id,input(1)),/Kuota/);
 store.cancel('buyer',b.id);assert.equal(store.inventory(e.slug).categories[0].remaining,2);
 const next=store.reserveAdmission('other',{...req,key:randomUUID()});clock+=600001;
 assert.throws(()=>store.payment('other',next.id,'success'),/habis/);
 assert.equal(store.inventory(e.slug).categories[0].remaining,2);
 const final=store.reserveAdmission('buyer',{...req,key:randomUUID()});store.payment('buyer',final.id,'success');store.payment('buyer',final.id,'success');
 assert.equal(store.ticketsFor('buyer').length,2);assert.equal(store.inventory(e.slug).categories[0].remaining,0);
 store.refundTicket('buyer',store.ticketsFor('buyer')[0].id,'Tidak dapat hadir');
 assert.equal(store.inventory(e.slug).categories[0].remaining,1);
 assert.deepEqual(categoryInventory(store.inventory(e.slug),store.inventory(e.slug).categories[0]),{available:1,reserved:0,sold:1});
 const snapshot=store.organizerSnapshot('organizer');const summary=metrics({...snapshot,inventory:snapshot.inventory.filter(i=>i.slug===e.slug)});assert.equal(summary.sold,1);assert.equal(summary.available,1);
});

test('database GA roles, internal RPC permissions, capacity, payment and check-in remain protected',async()=>{
 const db=await catalogDb();try{
  for(const actor of [actors.buyer,actors.staff,actors.other]){await asUser(db,actor);assert.equal((await rpc(db,'manage_event',['create',null,input()])).error,'FORBIDDEN');}
  await asUser(db,actors.organizer);
  const e=await rpc<{id:string;slug:string;seatingMode:string}>(db,'manage_event',['create',null,input(100)]);
  assert.equal(e.error,undefined,e.message);assert.equal(e.seatingMode,'GENERAL_ADMISSION');
  assert.equal((await rpc(db,'configure_event_layout',[e.id,0,{}])).error,'MODE');
  assert.equal((await rpc(db,'configure_ticket_category',[e.id,null,0,{}])).error,'MODE');
  assert.equal((await rpc(db,'manage_event',['update',e.id,input(2)])).error,undefined);
  await rpc(db,'manage_event',['publish',e.id,{}]);
  await asUser(db);
  const inventory=await rpc<Inventory>(db,'seat_inventory',[e.slug]);assert.equal(inventory.seats.length,0);assert.equal(inventory.seatingMode,'GENERAL_ADMISSION');assert.equal(inventory.categories.length,1);
  await assert.rejects(()=>rpc(db,'reserve_general_admission',[e.slug,inventory.categories[0].id,[attendee()],randomUUID()]));
  await asUser(db,actors.buyer);
  await assert.rejects(()=>rpc(db,'sync_admission_inventory',[e.id,2000]));
  await assert.rejects(()=>rpc(db,'reserve_booking_v19',[e.slug,inventory.categories[0].id,[],randomUUID()]));
  const category=inventory.categories[0].id,key=randomUUID(),names=[attendee('A'),attendee('B')];
  const b=await rpc<Booking>(db,'reserve_general_admission',[e.slug,category,names,key]);
  assert.equal(b.error,undefined,b.message);assert.equal(b.total,150000);assert.ok(b.items.every(i=>i.label==='Tanpa nomor kursi'));
  assert.equal((await rpc<Booking>(db,'reserve_general_admission',[e.slug,category,names,key])).id,b.id);
  assert.equal((await rpc(db,'reserve_general_admission',[e.slug,category,[attendee('Changed')],key])).error,'KEY_REUSED');
  assert.equal((await rpc<Inventory>(db,'seat_inventory',[e.slug])).categories[0].remaining,0);
  assert.equal((await rpc<Inventory>(db,'seat_inventory',[e.slug])).categories[0].reserved,2);
  await asUser(db,actors.other);
  assert.equal((await rpc(db,'reserve_general_admission',[e.slug,category,[attendee()],randomUUID()])).error,'QUOTA');
  assert.equal((await rpc(db,'get_booking',[b.id])).error,'NOT_FOUND');
  await asUser(db,actors.organizer);
  assert.equal((await rpc(db,'manage_event',['update',e.id,input(1)])).error,'QUOTA');
  assert.equal((await rpc(db,'manage_event',['update',e.id,{...input(2),seatingMode:'SEATED'}])).error,'MODE_LOCKED');
  assert.equal((await rpc(db,'manage_event',['update',e.id,input(4)])).error,undefined);
  await asUser(db,actors.buyer);
  await rpc(db,'cancel_booking',[b.id]);
  const remaining=await rpc<Inventory>(db,'seat_inventory',[e.slug]);assert.equal(remaining.categories[0].remaining,4);
  const holds=await Promise.all(Array.from({length:3},()=>rpc<Booking>(db,'reserve_general_admission',[e.slug,category,names,randomUUID()])));
  assert.equal(holds.filter(h=>!h.error).length,2);assert.equal(holds.filter(h=>h.error==='QUOTA').length,1);
  const paidBooking=holds.find(h=>!h.error)!;
  await db.exec('reset role');
  const packs=paidBooking.items.map(i=>createTicketPack(i.seatId,randomBytes(32)));
  assert.equal((await rpc<{status:string}>(db,'process_simulated_payment',[actors.buyer,paidBooking.id,'success',packs])).status,'CONFIRMED');
  await rpc(db,'process_simulated_payment',[actors.buyer,paidBooking.id,'success',packs]);
  const tickets=await rpc<{seatLabel:string;reference:string}[]>(db,'issued_tickets_for_owner',[actors.buyer,null]);
  assert.equal(tickets.length,2);assert.ok(tickets.every(t=>t.seatLabel==='Tanpa nomor kursi'));
  const otherHold=holds.filter(h=>!h.error&&h.id!==paidBooking.id)[0];
  await db.query("update public.bookings set expires_at=clock_timestamp()-interval '1 second' where id=$1",[otherHold.id]);
  await asUser(db,actors.buyer);const afterExpiry=await rpc<Inventory>(db,'seat_inventory',[e.slug]);
  assert.equal(afterExpiry.categories[0].remaining,2);assert.equal(afterExpiry.categories[0].sold,2);assert.equal(afterExpiry.categories[0].reserved,0);
  await db.exec('reset role');
  assert.equal((await rpc(db,'process_simulated_payment',[actors.buyer,otherHold.id,'success',[]])).error,'RESERVATION_EXPIRED');
  await db.query("insert into public.event_access(event_id,user_id,role) values($1,$2,'STAFF')",[e.id,actors.staff]);
  await asUser(db,actors.staff);
  const checked=await rpc<{status:string;ticket:{seatLabel:string}}>(db,'validate_check_in',[e.slug,tickets[0].reference,null,true]);
  assert.equal(checked.status,'CHECKED_IN');assert.equal(checked.ticket.seatLabel,'Tanpa nomor kursi');
 }finally{await db.close();}
});
