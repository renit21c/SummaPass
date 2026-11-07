import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seatingBody } from '../src/features/seating/http';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { layoutInput,categoryInput,seatingConfigSchema,type SeatingConfig } from '../src/features/seating/core';
import { createTicketPack } from '../src/features/tickets/crypto';
import type { Booking,Inventory } from '../src/features/booking/types';

type Result<T>=T&{error?:string};
async function rpc<T>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:Result<T>}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}
const cat=(name='VIP',quota=60)=>({name,price:120000,quota,salesStart:'2026-01-01T00:00:00Z',salesEnd:'2030-12-12T09:00:00Z',sections:['Balkon'],active:true});
const layout=()=>({expectedVersion:0,width:700,height:600,sections:[{name:'Balkon',seats:Array.from({length:60},(_,i)=>({row:['D','E','F','G','AA','BB'][Math.floor(i/10)],number:i%10+1,x:70+(i%10)*54,y:120+Math.floor(i/10)*64}))}],categories:[cat()]});
async function draft(db:PGlite){await asUser(db,actors.organizer);return rpc<{id:string;slug:string}>(db,'manage_event',['create',null,newEvent()]);}
async function config(db:PGlite,id:string){return rpc<SeatingConfig>(db,'seating_configuration',[id]);}

test('layout validation accepts >24 seats, arbitrary rows and rejects collisions and capacity errors',()=>{
 assert.ok(layoutInput.safeParse(layout()).success);
 for(const change of [({...layout(),width:100}),({...layout(),categories:[cat('VIP',61)]}),({...layout(),categories:[{...cat(),sections:['Missing']}]}),({...layout(),sections:[{name:'Balkon',seats:[{row:'A',number:1,x:70,y:120},{row:'B',number:1,x:80,y:120}]}]})])assert.equal(layoutInput.safeParse(change).success,false);
 assert.equal(categoryInput.safeParse({...cat(),expectedVersion:0,sections:['Balkon','Balkon']}).success,false);
});

test('layout transaction is atomic, event scoped, versioned and protected by role and RLS',async()=>{const db=await catalogDb();try{
 const e=await draft(db);
 for(const actor of [actors.staff,actors.buyer,actors.other]){await asUser(db,actor);assert.equal((await rpc(db,'configure_event_layout',[e.id,0,layout()])).error,'FORBIDDEN');assert.equal((await config(db,e.id)).error,'FORBIDDEN');}
 await asUser(db);await assert.rejects(()=>config(db,e.id));await asUser(db,actors.organizer);
 const before=(await rpc<Inventory>(db,'seat_inventory',['senja-di-summa'])).seats;
 const c=await rpc<SeatingConfig>(db,'configure_event_layout',[e.id,0,layout()]);assert.equal(c.error,undefined);assert.equal(c.version,1);assert.equal(c.sections[0].seats.length,60);seatingConfigSchema.parse(c);
 assert.deepEqual((await rpc<Inventory>(db,'seat_inventory',['senja-di-summa'])).seats,before);
 assert.equal((await rpc(db,'configure_event_layout',[e.id,0,layout()])).error,'VERSION_CONFLICT');
 const invalid=layout();invalid.sections[0].seats[1].x=invalid.sections[0].seats[0].x;
 assert.equal((await rpc(db,'configure_event_layout',[e.id,1,invalid])).error,'INPUT');assert.deepEqual(await config(db,e.id),c);
 const duplicate=layout();duplicate.sections[0].seats[1]={...duplicate.sections[0].seats[0]};assert.equal((await rpc(db,'configure_event_layout',[e.id,1,duplicate])).error,'INPUT');assert.deepEqual(await config(db,e.id),c);
 for(const actor of [undefined,actors.staff,actors.buyer,actors.other]){await asUser(db,actor);assert.equal((await db.query('select id from public.venue_sections where id=$1',[c.sections[0].id])).rows.length,0);assert.equal((await db.query('select id from public.seats where section_id=$1',[c.sections[0].id])).rows.length,0);}
 await asUser(db,actors.organizer);
 // Legacy event creation must not pick up another event's same-venue sections.
 const next=await draft(db);assert.equal(next.error,undefined);assert.equal((await rpc<Inventory>(db,'seat_inventory',[next.slug])).seats.length,48);
 await db.exec('reset role');await assert.rejects(()=>db.query('insert into public.event_seats(event_id,seat_id) values($1,$2)',[next.id,c.sections[0].seats[0].id]));
 await asUser(db,actors.organizer);assert.ok((await db.query("select id from public.audit_logs where event_id=$1 and action='layout.replace'",[e.id])).rows.length===1);
 }finally{await db.close();}});

test('flexible categories preserve booking history, quotas, inactive rules and single seat ownership',async()=>{const db=await catalogDb();try{
 const e=await draft(db);let c=await rpc<SeatingConfig>(db,'configure_event_layout',[e.id,0,layout()]);
 c=await rpc<SeatingConfig>(db,'configure_ticket_category',[e.id,null,c.version,{...cat('Early Bird',3),price:50000}]);assert.equal(c.error,undefined);assert.equal(c.categories.length,2);
 const early=c.categories.find(x=>x.name==='Early Bird')!,vip=c.categories.find(x=>x.name==='VIP')!;
 assert.equal((await rpc(db,'configure_ticket_category',[e.id,vip.id,1,cat()])).error,'VERSION_CONFLICT');
 const updated=await rpc<{title:string}>(db,'manage_event',['update',e.id,{...newEvent(),title:'Event fleksibel diperbarui'}]);assert.equal(updated.error,undefined);assert.deepEqual(await config(db,e.id),c);
 await rpc(db,'manage_event',['publish',e.id,{}]);assert.equal((await rpc(db,'configure_event_layout',[e.id,c.version,layout()])).error,'LAYOUT_LOCKED');
 await asUser(db,actors.buyer);const inventory=await rpc<Inventory>(db,'seat_inventory',[e.slug]);assert.equal(inventory.seats.length,60);assert.equal(inventory.width,700);assert.equal(inventory.categories.length,2);
 const seats=c.sections[0].seats;
 const reserve=(category:string,indices:number[],key=randomUUID())=>rpc<Booking>(db,'reserve_booking',[e.slug,category,indices.map(i=>({seatId:seats[i].id,name:'Peserta '+i})),key]);
 const b=await reserve(early.id,[0,1]);assert.equal(b.total,100000);assert.equal(b.categoryName,'Early Bird');
 const race=await Promise.all([reserve(vip.id,[2]),reserve(vip.id,[2])]);assert.equal(race.filter(x=>!x.error).length,1);
 const partial=await reserve(vip.id,[0,3]);assert.equal(partial.error,'SEAT_UNAVAILABLE');assert.equal((await rpc<Inventory>(db,'seat_inventory',[e.slug])).seats.find(x=>x.id===seats[3].id)?.status,'AVAILABLE');
 await asUser(db,actors.organizer);assert.equal((await rpc(db,'configure_ticket_category',[e.id,early.id,c.version,cat('Early Bird',1)])).error,'QUOTA');
 c=await rpc<SeatingConfig>(db,'configure_ticket_category',[e.id,early.id,c.version,{...cat('Promo Baru',2),price:99000,active:false}]);assert.equal(c.error,undefined);
 await asUser(db,actors.buyer);assert.equal((await reserve(early.id,[3])).error,'SALES_CLOSED');assert.equal((await rpc<Inventory>(db,'seat_inventory',[e.slug])).categories.some(x=>x.id===early.id),false);
 assert.equal((await rpc<Booking>(db,'get_booking',[b.id])).categoryName,'Early Bird');
 await db.exec('reset role');const key=randomBytes(32);const pack=b.items.map(i=>{return createTicketPack(i.seatId,key);});
 const paid=await rpc<{status:string}>(db,'process_simulated_payment',[actors.buyer,b.id,'success',pack]);assert.equal(paid.status,'CONFIRMED');await rpc(db,'process_simulated_payment',[actors.buyer,b.id,'success',pack]);
 const tickets=await rpc<{categoryName:string;price:number}[]>(db,'issued_tickets_for_owner',[actors.buyer,null]);assert.equal(tickets.length,2);assert.ok(tickets.every(t=>t.categoryName==='Early Bird'&&t.price===50000));
 await asUser(db,actors.organizer);assert.equal((await rpc(db,'configure_ticket_category',[e.id,vip.id,c.version,{...cat(),active:false}])).error,'LAST_CATEGORY');
 await rpc(db,'manage_event',['unpublish',e.id,{}]);assert.equal((await rpc(db,'configure_event_layout',[e.id,c.version,layout()])).error,'LAYOUT_LOCKED');
 }finally{await db.close();}});


test('quota and section guards ignore expired holds but preserve cancelled booking layout history',async()=>{const db=await catalogDb();try{
 const e=await draft(db);const l=layout();l.height=800;l.sections.push({name:'Teras',seats:[{row:'Z',number:1,x:70,y:680},{row:'Z',number:2,x:124,y:680}]});l.categories[0]=cat('VIP',2);
 let c=await rpc<SeatingConfig>(db,'configure_event_layout',[e.id,0,l]);const vip=c.categories[0];await rpc(db,'manage_event',['publish',e.id,{}]);
 await asUser(db,actors.buyer);const ids=c.sections.find(s=>s.name==='Balkon')!.seats.slice(0,2).map(s=>({seatId:s.id,name:'Uji'}));
 const key=randomUUID();const b=await rpc<Booking>(db,'reserve_booking',[e.slug,vip.id,ids,key]);assert.equal(b.error,undefined);assert.equal((await rpc<Booking>(db,'reserve_booking',[e.slug,vip.id,ids,key])).id,b.id);
 await asUser(db,actors.organizer);assert.equal((await rpc(db,'configure_ticket_category',[e.id,vip.id,c.version,{...cat('VIP',2),sections:['Teras']}])).error,'CATEGORY_LOCKED');
 assert.equal((await rpc(db,'configure_ticket_category',[e.id,vip.id,c.version,{...cat(),salesEnd:'2031-01-01T00:00:00Z'}])).error,'INPUT');
 await db.exec('reset role');await db.query("update public.bookings set expires_at=clock_timestamp()-interval '1 second' where id=$1",[b.id]);
 await asUser(db,actors.organizer);c=await rpc<SeatingConfig>(db,'configure_ticket_category',[e.id,vip.id,c.version,{...cat('VIP',1),sections:['Teras']}]);assert.equal(c.error,undefined);
 await asUser(db,actors.buyer);assert.equal((await rpc<Inventory>(db,'seat_inventory',[e.slug])).categories[0].remaining,1);
 const wrong=await rpc(db,'reserve_booking',[e.slug,vip.id,ids.slice(0,1),randomUUID()]);assert.equal(wrong.error,'CATEGORY');
 const terrace=c.sections.find(s=>s.name==='Teras')!.seats;
 const next=await rpc<Booking>(db,'reserve_booking',[e.slug,vip.id,[{seatId:terrace[0].id,name:'Baru'}],randomUUID()]);assert.equal(next.error,undefined);
 const full=await rpc(db,'reserve_booking',[e.slug,vip.id,[{seatId:terrace[1].id,name:'Penuh'}],randomUUID()]);assert.equal(full.error,'QUOTA');
 await rpc(db,'cancel_booking',[next.id]);await asUser(db,actors.organizer);await rpc(db,'manage_event',['unpublish',e.id,{}]);assert.equal((await rpc(db,'configure_event_layout',[e.id,c.version,l])).error,'LAYOUT_LOCKED');
 }finally{await db.close();}});


test('seating request parser limits streamed bytes and rejects malformed JSON',async()=>{
 assert.deepEqual(await seatingBody(new Request('http://localhost',{method:'PUT',body:JSON.stringify({width:700})})),{width:700});
 await assert.rejects(()=>seatingBody(new Request('http://localhost',{method:'PUT',body:'{bad'})),(e:unknown)=>(e as {status:number}).status===400);
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(40));c.enqueue(new Uint8Array(40));c.close();}});
 await assert.rejects(()=>seatingBody(new Request('http://localhost',{method:'PUT',body:stream,duplex:'half'} as RequestInit),64),(e:unknown)=>(e as {status:number}).status===413);
});
