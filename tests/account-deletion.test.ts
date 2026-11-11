import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { actors,catalogDb,asUser,newEvent } from './helpers/catalog-db';
import { deleteAccountSchema,finishAuthDeletion } from '../src/features/account/deletion-core';
import { createTicketPack } from '../src/features/tickets/crypto';
import type { Booking,Inventory } from '../src/features/booking/types';
async function rpc<T=Record<string,unknown>>(db:PGlite,name:string,args:unknown[]=[]){return (await db.query<{r:T&{error?:string;message?:string}}>(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) r`,args.map(v=>v!==null&&typeof v==='object'?JSON.stringify(v):v))).rows[0].r;}
test('account confirmation must be exact and cannot submit an arbitrary user id',()=>{
 assert.ok(deleteAccountSchema.safeParse({confirmation:'HAPUS AKUN',password:'test-password'}).success);
 for(const input of [{confirmation:'hapus akun'},{confirmation:'HAPUS'},{confirmation:'HAPUS AKUN',userId:actors.other},{confirmation:'HAPUS AKUN',password:''}])assert.equal(deleteAccountSchema.safeParse(input).success,false);
});
test('Auth cleanup only completes after successful deletion and can retry without discarding its queue entry',async()=>{
 const calls:string[]=[];
 assert.equal(await finishAuthDeletion(actors.buyer,async()=>({error:Error('offline')}),async id=>{calls.push(id);}),false);assert.equal(calls.length,0);
 assert.equal(await finishAuthDeletion(actors.buyer,async id=>{assert.equal(id,actors.buyer);return {error:null};},async id=>{calls.push(id);}),true);assert.deepEqual(calls,[actors.buyer]);
});
test('account deletion is service-only, preserves paid records, releases holds and blocks stale JWT RPCs/RLS',async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);const event=await rpc<{id:string;slug:string}>(db,'manage_event',['create',null,newEvent()]);await rpc(db,'manage_event',['publish',event.id,{}]);
  await asUser(db,actors.buyer);const inventory=await rpc<Inventory>(db,'seat_inventory',[event.slug]),category=inventory.categories.find(c=>c.name==='Regular')!,seats=inventory.seats.filter(s=>category.sections.includes(s.section));
  const reserve=(index:number)=>rpc<Booking>(db,'reserve_booking',[event.slug,category.id,[{seatId:seats[index].id,name:'Peserta'}],randomUUID()]);
  const paid=await reserve(0),pending=await reserve(1);
  await db.exec('reset role');const packs=paid.items.map(i=>createTicketPack(i.seatId,randomBytes(32)));await rpc(db,'process_simulated_payment',[actors.buyer,paid.id,'success',packs]);
  await db.query('update auth.users set email=$1 where id=$2',['delete-test@example.test',actors.buyer]);
  for(const actor of [undefined,actors.buyer,actors.staff,actors.organizer]){await asUser(db,actor);await assert.rejects(()=>rpc(db,'request_account_deletion',[actors.buyer]));}
  await db.exec('reset role;set role service_role');assert.equal((await rpc(db,'request_account_deletion',[actors.buyer])).ok,true);
  assert.equal((await rpc(db,'request_account_deletion',[actors.buyer])).ok,true);
  await db.exec('reset role');
  const rows=await db.query<{display_name:string;deleted_at:string}>('select display_name,deleted_at from public.profiles where id=$1',[actors.buyer]);assert.equal(rows.rows[0].display_name,'Akun dihapus');assert.ok(rows.rows[0].deleted_at);
  assert.equal((await db.query('select id from public.bookings where id=$1 and status=\'CONFIRMED\'',[paid.id])).rows.length,1);
  assert.equal((await db.query('select id from public.payments where booking_id=$1 and status=\'PAID\'',[paid.id])).rows.length,1);
  assert.equal((await db.query('select id from public.bookings where id=$1 and status=\'CANCELLED\'',[pending.id])).rows.length,1);
  assert.equal((await db.query('select id from public.booking_items where booking_id=$1 and allocation_status=\'RELEASED\'',[pending.id])).rows.length,1);
  assert.equal((await db.query('select id from public.notifications where user_id=$1',[actors.buyer])).rows.length,0);
  assert.equal((await rpc(db,'enqueue_notification',[actors.buyer,event.id,paid.id,'EVENT_REMINDER',randomUUID(),'Reminder','Message','/my-tickets',true,null,null])),null);
  await asUser(db,actors.buyer);
  assert.equal((await rpc(db,'get_booking',[paid.id])).error,'NOT_FOUND');
  assert.equal((await rpc(db,'reserve_booking',[event.slug,category.id,[{seatId:seats[2].id,name:'Old JWT'}],randomUUID()])).error,'AUTH');
  assert.equal((await db.query('select id from public.profiles')).rows.length,0);
  assert.equal((await db.query('select id from public.bookings')).rows.length,0);
  assert.equal((await db.query('update public.profiles set display_name=$1 where id=$2 returning id',['Restored',actors.buyer])).rows.length,0);
  await asUser(db,actors.other);assert.equal((await rpc<Inventory>(db,'seat_inventory',[event.slug])).seats.find(s=>s.id===seats[1].id)?.status,'AVAILABLE');
 }finally{await db.close();}
});
test('last organizer cannot leave an active event; staff deletion removes assignments immediately',async()=>{
 const db=await catalogDb();try{
  await asUser(db,actors.organizer);const event=await rpc<{id:string}>(db,'manage_event',['create',null,newEvent()]);
  await db.exec('reset role;set role service_role');assert.equal((await rpc(db,'request_account_deletion',[actors.organizer])).error,'EVENT_OWNER');
  await db.exec('reset role');assert.equal((await db.query<{deleted_at:string|null}>('select deleted_at from public.profiles where id=$1',[actors.organizer])).rows[0].deleted_at,null);
  await db.exec('set role service_role');assert.equal((await rpc(db,'request_account_deletion',[actors.staff])).ok,true);
  await asUser(db,actors.staff);assert.equal((await rpc(db,'has_event_access',['20000000-0000-4000-8000-000000000001','STAFF'])),false);
  assert.equal((await rpc<unknown[]>(db,'staff_events',[])).length,0);
 }finally{await db.close();}
});
