import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { optionsSchema,optionMutationSchema,participantPrices,adjacentSeats,type TicketOptions } from '../src/features/ticket-options/core';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { eventInput } from '../src/features/catalog/core';
import type { Inventory,Booking,BookingRequest } from '../src/features/booking/types';
import { createTicketPack } from '../src/features/tickets/crypto';
type Result<T>=T&{error?:string;message?:string};
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:Result<T>}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}
const category=(seated=false)=>({name:'VIP A',description:'Akses depan panggung.',price:75000,quota:12,salesStart:'2026-01-01T00:00:00Z',salesEnd:'2030-12-12T09:00:00Z',sections:seated?['Front']:[],active:true});
const names=(n:number)=>Array.from({length:n},(_,i)=>({name:`Peserta ${i+1}`}));

test('package money is split in integer rupiah without losing the total; adjacent suggestion never skips gaps',()=>{
 assert.deepEqual(participantPrices(100001,2,2),[50001,50000,50001,50000]);
 assert.equal(participantPrices(180001,4,3).reduce((n,p)=>n+p,0),540003);
 const seats=Array.from({length:6},(_,i)=>({id:String(i+1),section:'Front',row:'A',number:i+1,status:i===1?'SOLD':'AVAILABLE'}));
 assert.deepEqual(adjacentSeats(seats,['Front'],4),['3','4','5','6']);assert.deepEqual(adjacentSeats(seats,['Front'],5),[]);
 assert.equal(optionMutationSchema.safeParse({kind:'package',expectedVersion:0,data:{categoryId:'a',name:'Group',price:100,participants:0,quota:null,active:true}}).success,false);
});

test('demo supports arbitrary GA categories and packages, protects snapshots and persists the catalog configuration',()=>{
 const store=new DemoBookingStore(()=>Date.parse('2026-11-11T00:00:00Z'));
 const event=store.createEvent('org',eventInput.parse({...newEvent(),seatingMode:'GENERAL_ADMISSION'}));
 let config=store.ticketOptions('org',event.id);
 config=store.saveTicketOption('org',event.id,optionMutationSchema.parse({kind:'category',expectedVersion:config.version,data:category()}));
 const vip=config.categories.find(c=>c.name==='VIP A')!;
 config=store.saveTicketOption('org',event.id,optionMutationSchema.parse({kind:'package',expectedVersion:config.version,data:{categoryId:vip.id,name:'Couple',participants:2,price:100001,quota:2,active:true}}));
 const pack=config.categories.find(c=>c.id===vip.id)!.packages.find(p=>p.name==='Couple')!;
 store.eventStatus('org',event.id,'publish');
 const request:BookingRequest={slug:event.slug,categoryId:vip.id,packageId:pack.id,packageQuantity:2,attendees:names(4),key:randomUUID()};
 const b=store.reservePackage('buyer',request);assert.equal(b.total,200002);assert.equal(b.items.length,4);assert.equal(b.packageName,'Couple');assert.equal(store.reservePackage('buyer',request).id,b.id);
 assert.equal(store.inventory(event.slug).categories.find(c=>c.id===vip.id)?.remaining,8);
 assert.throws(()=>store.reservePackage('other',{...request,key:randomUUID()}),/Kuota paket/);
 assert.throws(()=>store.reservePackage('buyer',{...request,packageQuantity:1}),/Permintaan berubah/);
 assert.throws(()=>store.saveTicketOption('org',event.id,optionMutationSchema.parse({kind:'package',id:pack.id,expectedVersion:config.version,data:{categoryId:vip.id,...pack,participants:3}})),/terkunci/);
 store.payment('buyer',b.id,'success');store.payment('buyer',b.id,'success');assert.equal(store.ticketsFor('buyer').length,4);assert.equal(store.ticketsFor('buyer').reduce((n,t)=>n+t.price,0),200002);
 const restarted=new DemoBookingStore(undefined,store.catalogItems());assert.ok(restarted.ticketOptions('org',event.id).categories.find(c=>c.name==='VIP A')?.packages.some(p=>p.name==='Couple'));
});

for(const mode of ['SEATED','GENERAL_ADMISSION'] as const)test(`PostgreSQL ${mode}: arbitrary categories, scoped packages, quota, retries, exact prices and historical tickets`,async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);
  const event=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,{...newEvent(),seatingMode:mode}]);
  let options=await rpc<TicketOptions>(db,'ticket_options',[event.id]);optionsSchema.parse(options);
  for(const actor of [actors.buyer,actors.staff,actors.other]){await asUser(db,actor);assert.equal((await rpc(db,'ticket_options',[event.id])).error,'FORBIDDEN');assert.equal((await rpc(db,'manage_ticket_option',[event.id,'category',null,options.version,category(mode==='SEATED')])).error,'FORBIDDEN');}
  await asUser(db);await assert.rejects(()=>rpc(db,'ticket_options',[event.id]));
  await asUser(db,actors.organizer);
  options=await rpc(db,'manage_ticket_option',[event.id,'category',null,options.version,category(mode==='SEATED')]);assert.equal(options.error,undefined,options.message);optionsSchema.parse(options);
  const vip=options.categories.find(c=>c.name==='VIP A')!;assert.ok(vip.packages.some(p=>p.name==='Single'&&p.participants===1));
  const packData={categoryId:vip.id,name:'Group',participants:4,price:180001,quota:2,active:true};
  options=await rpc(db,'manage_ticket_option',[event.id,'package',null,options.version,packData]);assert.equal(options.error,undefined,options.message);
  const pack=options.categories.find(c=>c.id===vip.id)!.packages.find(p=>p.name==='Group')!;
  assert.equal((await rpc(db,'manage_ticket_option',[event.id,'package',pack.id,0,packData])).error,'VERSION_CONFLICT');
  const update=await rpc(db,'manage_event',['update',event.id,{...newEvent(),seatingMode:mode,title:'Detail diperbarui'}]);assert.equal(update.error,undefined,update.message);
  assert.equal((await rpc<TicketOptions>(db,'ticket_options',[event.id])).categories.find(c=>c.id===vip.id)?.packages.find(p=>p.id===pack.id)?.price,180001);
  await rpc(db,'manage_event',['publish',event.id,{}]);await asUser(db);
  let inv=await rpc<Inventory>(db,'seat_inventory',[event.slug]);assert.equal(inv.categories.find(c=>c.id===vip.id)?.description,'Akses depan panggung.');assert.ok(inv.categories.find(c=>c.id===vip.id)?.packages?.some(p=>p.id===pack.id));
  await asUser(db,actors.buyer);await assert.rejects(()=>rpc(db,'reserve_booking_package_base',[event.slug,vip.id,[],randomUUID()]));
  const units=inv.seats.filter(s=>vip.sections.includes(s.section)&&s.status==='AVAILABLE');
  const items=mode==='SEATED'?names(8).map((n,i)=>({...n,seatId:units[i].id})):names(8),key=randomUUID();
  const b=await rpc<Booking>(db,'reserve_ticket_package',[event.slug,vip.id,pack.id,2,items,key]);assert.equal(b.error,undefined,b.message);assert.equal(b.total,360002);assert.equal(b.items.length,8);assert.equal(b.packageSize,4);assert.equal(b.packageName,'Group');assert.equal(b.items.reduce((n,i)=>n+i.price,0),360002);
  assert.equal((await rpc<Booking>(db,'reserve_ticket_package',[event.slug,vip.id,pack.id,2,items,key])).id,b.id);
  assert.equal((await rpc(db,'reserve_ticket_package',[event.slug,vip.id,pack.id,1,items,key])).error,'KEY_REUSED');
  assert.equal((await rpc(db,'reserve_ticket_package',[event.slug,vip.id,pack.id,1,items.slice(0,3),randomUUID()])).error,'INPUT');
  assert.equal((await rpc(db,'reserve_ticket_package',[event.slug,vip.id,pack.id,1,items.slice(0,4),randomUUID()])).error,'QUOTA');
  assert.equal((await rpc(db,'reserve_general_admission',[event.slug,vip.id,names(1),randomUUID()])).error,'PACKAGE_REQUIRED');
  await asUser(db,actors.organizer);
  options=await rpc(db,'ticket_options',[event.id]);
  assert.equal((await rpc(db,'manage_ticket_option',[event.id,'category',vip.id,options.version,{...category(mode==='SEATED'),quota:7}])).error,'QUOTA');
  assert.equal((await rpc(db,'manage_ticket_option',[event.id,'package',pack.id,options.version,{...packData,participants:2}])).error,'PACKAGE_LOCKED');
  assert.equal((await rpc(db,'manage_ticket_option',[event.id,'package',pack.id,options.version,{...packData,quota:1}])).error,'QUOTA');
  options=await rpc(db,'manage_ticket_option',[event.id,'package',pack.id,options.version,{...packData,price:99999}]);assert.equal(options.error,undefined);
  await asUser(db,actors.buyer);assert.equal((await rpc<Booking>(db,'get_booking',[b.id])).total,360002);
  await db.exec('reset role');const ticketPacks=b.items.map(i=>createTicketPack(i.seatId,randomBytes(32)));
  assert.equal((await rpc<{status:string}>(db,'process_simulated_payment',[actors.buyer,b.id,'success',ticketPacks])).status,'CONFIRMED');
  await rpc(db,'process_simulated_payment',[actors.buyer,b.id,'success',ticketPacks]);
  const tickets=await rpc<{price:number}[]>(db,'issued_tickets_for_owner',[actors.buyer,null]);assert.equal(tickets.length,8);assert.equal(tickets.reduce((n,t)=>n+t.price,0),360002);
  await asUser(db,actors.organizer);options=await rpc(db,'manage_ticket_option',[event.id,'package',pack.id,options.version,{...packData,active:false}]);assert.equal(options.error,undefined);
  await asUser(db);inv=await rpc(db,'seat_inventory',[event.slug]);assert.ok(!inv.categories.find(c=>c.id===vip.id)?.packages?.some(p=>p.id===pack.id));
  assert.equal((await db.query('select id from public.ticket_packages where id=$1',[pack.id])).rows.length,0);
 }finally{await db.close();}
});
