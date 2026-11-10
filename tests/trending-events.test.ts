import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import { topSellingSlugs } from '../src/features/events/trending';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { eventInput } from '../src/features/catalog/core';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { createTicketPack } from '../src/features/tickets/crypto';
import type { PGlite } from '@electric-sql/pglite';
import type { Booking,Inventory } from '../src/features/booking/types';

test('trending requires positive sales and includes tied leaders',()=>{
 assert.equal(topSellingSlugs([{slug:'a',sold:0}]).size,0);
 assert.deepEqual([...topSellingSlugs([{slug:'a',sold:3},{slug:'b',sold:2},{slug:'c',sold:3}])],['a','c']);
});

test('demo trending ignores holds, revoked tickets, unpublished and completed events',()=>{
 let now=Date.parse('2026-11-10T00:00:00Z');const store=new DemoBookingStore(()=>now);
 const create=(title:string)=>{const e=store.createEvent('organizer',eventInput.parse({...newEvent(),title,seatingMode:'GENERAL_ADMISSION',regularQuota:100}));store.eventStatus('organizer',e.id,'publish');return e;};
 const a=create('Event Satu'),b=create('Event Dua');
 assert.ok(store.publicEvents().every(e=>!e.isTrending));
 const book=(slug:string,n:number)=>store.reserveAdmission('buyer',{slug,categoryId:'regular',key:randomUUID(),attendees:Array.from({length:n},()=>({name:'Peserta'}))});
 const aBooking=book(a.slug,2),bBooking=book(b.slug,1);assert.ok(!store.publicEvent(a.slug)?.isTrending);
 store.payment('buyer',aBooking.id,'success');store.payment('buyer',bBooking.id,'success');
 assert.equal(store.publicEvent(a.slug)?.isTrending,true);assert.equal(store.publicEvent(b.slug)?.isTrending,false);
 store.refundTicket('buyer',store.ticketsFor('buyer',aBooking.id)[0].id,'Batal hadir');
 assert.equal(store.publicEvent(a.slug)?.isTrending,true);assert.equal(store.publicEvent(b.slug)?.isTrending,true);
 store.eventStatus('organizer',a.id,'unpublish');assert.equal(store.publicEvent(b.slug)?.isTrending,true);
 now=Date.parse('2031-01-01T00:00:00Z');assert.ok(store.publicEvents().every(e=>!e.isTrending));
});

async function rpc<T>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:T}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args.map(x=>x!==null&&typeof x==='object'?JSON.stringify(x):x))).rows[0].r;}
test('public catalog ranks paid active tickets globally, preserves single-event ranking and reveals no sales records',async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);
  const create=async(title:string)=>{const e=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,{...newEvent(),title,seatingMode:'GENERAL_ADMISSION',regularQuota:100}]);await rpc(db,'manage_event',['publish',e.id,{}]);return e;};
  const a=await create('Trending Satu'),b=await create('Trending Dua');
  await asUser(db);let catalog=await rpc<{slug:string;isTrending:boolean}[]>(db,'public_catalog',[null]);assert.ok(catalog.every(e=>!e.isTrending));
  await assert.rejects(()=>rpc(db,'public_catalog_v20',[null]));
  const book=async(slug:string,n:number)=>{
   await asUser(db,actors.buyer);const inv=await rpc<Inventory>(db,'seat_inventory',[slug]);
   return rpc<Booking>(db,'reserve_general_admission',[slug,inv.categories[0].id,Array.from({length:n},()=>({name:'Peserta'})),randomUUID()]);
  };
  const aBooking=await book(a.slug,2),bBooking=await book(b.slug,1);
  await asUser(db);assert.ok((await rpc<{isTrending:boolean}[]>(db,'public_catalog',[null])).every(e=>!e.isTrending));
  const pay=async(booking:Booking)=>{await db.exec('reset role');return rpc(db,'process_simulated_payment',[actors.buyer,booking.id,'success',booking.items.map(i=>createTicketPack(i.seatId,randomBytes(32)))]);};
  await pay(aBooking);await pay(bBooking);await asUser(db);
  catalog=await rpc(db,'public_catalog',[null]);assert.equal(catalog.find(e=>e.slug===a.slug)?.isTrending,true);assert.equal(catalog.find(e=>e.slug===b.slug)?.isTrending,false);
  assert.equal((await rpc<{isTrending:boolean}[]>(db,'public_catalog',[b.slug]))[0].isTrending,false);
  assert.ok(catalog.every(e=>!('userId' in e)&&!('bookings' in e)&&!('sold' in e)));
  await db.exec('reset role');await db.query("update public.tickets set status='REVOKED' where booking_item_id=(select id from public.booking_items where booking_id=$1 limit 1)",[aBooking.id]);
  await asUser(db);catalog=await rpc(db,'public_catalog',[null]);assert.equal(catalog.find(e=>e.slug===a.slug)?.isTrending,true);assert.equal(catalog.find(e=>e.slug===b.slug)?.isTrending,true);
  await asUser(db,actors.organizer);await rpc(db,'manage_event',['unpublish',a.id,{}]);
  await asUser(db);assert.equal((await rpc<{isTrending:boolean}[]>(db,'public_catalog',[b.slug]))[0].isTrending,true);
 }finally{await db.close();}
});
