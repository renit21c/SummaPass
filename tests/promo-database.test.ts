import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import type { TicketOptions } from '../src/features/ticket-options/core';
import type { Booking,Inventory } from '../src/features/booking/types';
import type { Promo } from '../src/features/promos/core';
import { createTicketPack } from '../src/features/tickets/crypto';
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]):Promise<T&{error?:string;message?:string}>{return (await db.query<{r:T&{error?:string;message?:string}}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}
const promo=(extra:Record<string,unknown>={})=>({name:'Early Bird',type:'AUTOMATIC',code:null,discountType:'PERCENT',discountValue:20,scope:'ALL',categoryId:null,startDate:'2026-01-01T00:00:00Z',endDate:'2030-12-12T08:00:00Z',quota:null,minQuantity:null,status:'ACTIVE',...extra});

for(const mode of ['SEATED','GENERAL_ADMISSION'] as const)test(`Supabase promos ${mode}: scoped access, exact package prices, quotas, retry and ticket snapshots`,async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);
  const event=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,{...newEvent(),seatingMode:mode}]);assert.equal(event.error,undefined,event.message);
  let options=await rpc<TicketOptions>(db,'ticket_options',[event.id]);const category=options.categories[0];
  options=await rpc(db,'manage_ticket_option',[event.id,'package',null,options.version,{categoryId:category.id,name:'Couple',participants:2,price:100001,quota:null,active:true}]);
  const pack=options.categories[0].packages.find(p=>p.name==='Couple')!;
  const automatic=await rpc<Promo>(db,'manage_event_promo',[event.id,'create',null,promo()]);assert.equal(automatic.error,undefined,automatic.message);
  const voucher=await rpc<Promo>(db,'manage_event_promo',[event.id,'create',null,promo({name:'Kode Hemat',type:'VOUCHER',code:'HEMAT30',discountType:'NOMINAL',discountValue:30000,quota:1,minQuantity:2})]);assert.equal(voucher.error,undefined,voucher.message);
  assert.equal((await rpc(db,'manage_event_promo',[event.id,'create',null,promo({type:'VOUCHER',code:'hemat30'})])).error,'INPUT');
  const other=await rpc<{id:string}>(db,'manage_event',['create',null,{...newEvent(),title:'Event lain',seatingMode:mode}]);
  assert.equal((await rpc(db,'manage_event_promo',[other.id,'status',voucher.id,{status:'INACTIVE'}])).error,'NOT_FOUND');
  for(const actor of [actors.buyer,actors.staff,actors.other]){
   await asUser(db,actor);assert.equal((await rpc(db,'organizer_promos',[event.id])).error,'FORBIDDEN');assert.equal((await rpc(db,'manage_event_promo',[event.id,'delete',voucher.id,{}])).error,'FORBIDDEN');
   assert.equal((await db.query('select * from public.event_promos')).rows.length,0);
   await assert.rejects(()=>db.query('update public.event_promos set discount_value=100'));
  }
  await asUser(db,actors.organizer);await rpc(db,'manage_event',['publish',event.id,{}]);
  await asUser(db);
  const visible=await rpc<Promo[]>(db,'public_event_promos',[event.slug,null]);assert.equal(visible.length,1);assert.equal(JSON.stringify(visible).includes('HEMAT30'),false);
  const prices=(await db.query<{r:{slug:string;price:number;originalPrice:number}[]}>('select public.catalog_promo_prices(array[$1]::text[]) r',[event.slug])).rows[0].r;
  const cheapest=Math.min(...options.categories.flatMap(c=>c.packages.map(p=>p.price)));
  assert.equal(prices[0].originalPrice,cheapest);assert.equal(prices[0].price,cheapest-Math.round(cheapest*0.2));
  await assert.rejects(()=>rpc(db,'reserve_with_promo',[event.slug,category.id,pack.id,1,[],randomUUID(),null]));
  const inv=await rpc<Inventory>(db,'seat_inventory',[event.slug]);const units=inv.seats.filter(s=>category.sections.includes(s.section)&&s.status==='AVAILABLE');
  const items=(offset:number)=>Array.from({length:2},(_,i)=>({name:`Peserta ${i+1}`,...(mode==='SEATED'?{seatId:units[offset+i].id}:{})}));
  await asUser(db,actors.buyer);
  assert.equal((await rpc(db,'reserve_with_promo',[event.slug,category.id,pack.id,1,items(0),randomUUID(),'INVALID'])).error,'VOUCHER');
  const key=randomUUID(),request=[event.slug,category.id,pack.id,1,items(0),key,'hemat30'];
  const b=await rpc<Booking>(db,'reserve_with_promo',request);assert.equal(b.error,undefined,b.message);assert.equal(b.originalTotal,100001);assert.equal(b.total,70001);assert.equal(b.discountAmount,30000);assert.equal(b.items.reduce((n,i)=>n+i.price,0),70001);
  assert.equal((await rpc<Booking>(db,'reserve_with_promo',request)).id,b.id);
  assert.equal((await rpc(db,'reserve_with_promo',[...request.slice(0,6),null])).error,'KEY_REUSED');
  assert.equal((await rpc(db,'reserve_with_promo',[event.slug,category.id,pack.id,1,items(2),randomUUID(),'HEMAT30'])).error,'VOUCHER');
  const auto=await rpc<Booking>(db,'reserve_with_promo',[event.slug,category.id,pack.id,1,items(2),randomUUID(),null]);assert.equal(auto.total,80001);assert.equal(auto.discountAmount,20000);
  await rpc(db,'cancel_booking',[b.id]);
  const next=await rpc<Booking>(db,'reserve_with_promo',[event.slug,category.id,pack.id,1,items(0),randomUUID(),'HEMAT30']);assert.equal(next.total,70001);
  await asUser(db,actors.organizer);
  await rpc(db,'manage_event_promo',[event.id,'delete',voucher.id,{}]);
  const dashboard=await rpc<{bookings:Booking[]}>(db,'organizer_snapshot');assert.equal(dashboard.bookings.find(x=>x.id===next.id)?.discountAmount,30000);
  await asUser(db,actors.buyer);const snapshot=await rpc<Booking>(db,'get_booking',[next.id]);assert.equal(snapshot.total,70001);assert.equal(snapshot.voucherCode,'HEMAT30');
  await db.exec('reset role');const packs=next.items.map(i=>createTicketPack(i.seatId,randomBytes(32)));
  const paid=await rpc<Booking>(db,'process_simulated_payment',[actors.buyer,next.id,'success',packs]);assert.equal(paid.status,'CONFIRMED');
  const tickets=await rpc<{price:number}[]>(db,'issued_tickets_for_owner',[actors.buyer,null]);assert.equal(tickets.reduce((n,t)=>n+t.price,0),70001);
 }finally{await db.close();}
});

test('legacy GA discounts release unused quota on expiry, reject ineligible codes and preserve a fully discounted zero total',async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);
  const event=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,{...newEvent(),seatingMode:'GENERAL_ADMISSION'}]);
  const options=await rpc<TicketOptions>(db,'ticket_options',[event.id]),category=options.categories[0];
  const voucher=await rpc<Promo>(db,'manage_event_promo',[event.id,'create',null,promo({type:'VOUCHER',name:'Gratis dua tiket',code:'GRATIS',scope:'CATEGORY',categoryId:category.id,discountValue:100,quota:1,minQuantity:2})]);assert.equal(voucher.error,undefined);
  assert.equal((await rpc(db,'manage_event_promo',[event.id,'create',null,promo({scope:'CATEGORY',categoryId:'30000000-0000-4000-8000-000000000001'})])).error,'INPUT');
  await rpc(db,'manage_event',['publish',event.id,{}]);await asUser(db,actors.buyer);
  const items=[{name:'Satu'},{name:'Dua'}];
  assert.equal((await rpc(db,'reserve_with_promo',[event.slug,category.id,null,1,items.slice(0,1),randomUUID(),'GRATIS'])).error,'VOUCHER');
  const first=await rpc<Booking>(db,'reserve_with_promo',[event.slug,category.id,null,1,items,randomUUID(),'GRATIS']);assert.equal(first.total,0);assert.equal(first.originalTotal,150000);assert.equal(first.items.reduce((n,i)=>n+i.price,0),0);
  await asUser(db,actors.other);
  assert.equal((await rpc(db,'reserve_with_promo',[event.slug,category.id,null,1,items,randomUUID(),'GRATIS'])).error,'VOUCHER');
  await db.exec('reset role');await db.query("update public.bookings set expires_at=now()-interval '1 minute' where id=$1",[first.id]);
  await asUser(db,actors.other);const next=await rpc<Booking>(db,'reserve_with_promo',[event.slug,category.id,null,1,items,randomUUID(),'GRATIS']);assert.equal(next.total,0);assert.equal(next.error,undefined,next.message);
  await asUser(db,actors.organizer);const list=await rpc<Promo[]>(db,'organizer_promos',[event.id]);assert.equal(list[0].usedCount,1);
  assert.equal((await rpc(db,'manage_event_promo',[event.id,'status',voucher.id,{status:'INACTIVE'}])).error,undefined);
  await asUser(db,actors.buyer);assert.equal((await rpc(db,'reserve_with_promo',[event.slug,category.id,null,1,items,randomUUID(),'GRATIS'])).error,'VOUCHER');
 }finally{await db.close();}
});
