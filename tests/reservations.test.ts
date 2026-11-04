import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { BookingError } from '../src/features/booking/types';
const epoch=Date.parse('2026-11-03T10:00:00+07:00');
const payload=(seatIds=['Regular-A1'])=>({slug:'little-weekend',categoryId:'regular',seats:seatIds.map(seatId=>({seatId,name:'Peserta Demo'})),key:randomUUID()});
test('demo concurrent same-seat requests have one winner',async()=>{const store=new DemoBookingStore(()=>epoch);const attempts=await Promise.allSettled([Promise.resolve().then(()=>store.reserve('u1',payload())),Promise.resolve().then(()=>store.reserve('u2',payload()))]);assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);assert.equal(attempts.filter(a=>a.status==='rejected').length,1);});
test('demo multi-seat conflicts rollback, expiry reclaims, sold and category mismatch reject',()=>{let now=epoch;const store=new DemoBookingStore(()=>now);const first=store.reserve('u1',payload());assert.throws(()=>store.reserve('u2',payload(['Regular-A2','Regular-A1'])),BookingError);assert.equal(store.inventory('little-weekend').seats.find(s=>s.id==='Regular-A2')!.status,'AVAILABLE');assert.throws(()=>store.reserve('u2',payload(['Front-A3'])),BookingError);assert.throws(()=>store.reserve('u2',{...payload(['Front-A1']),categoryId:'front'}),BookingError);now+=600000;assert.equal(store.get('u1',first.id).status,'EXPIRED');assert.equal(store.reserve('u2',payload()).status,'PENDING_PAYMENT');});
test('demo retry is idempotent, owned records are private and cancellation releases',()=>{const store=new DemoBookingStore(()=>epoch),input=payload();const b=store.reserve('u1',input);assert.equal(store.reserve('u1',input).id,b.id);assert.equal(store.list('u1').length,1);assert.throws(()=>store.get('u2',b.id),BookingError);assert.throws(()=>store.cancel('u2',b.id),BookingError);assert.equal(store.cancel('u1',b.id).status,'CANCELLED');assert.equal(store.cancel('u1',b.id).status,'CANCELLED');assert.equal(store.reserve('u2',payload()).status,'PENDING_PAYMENT');});
test('demo validates duplicates, maximum count and closed sales',()=>{const store=new DemoBookingStore(()=>epoch);assert.throws(()=>store.reserve('u1',payload(['Regular-A1','Regular-A1'])));assert.throws(()=>store.reserve('u1',payload(Array.from({length:7},(_,i)=>`Regular-A${i+1}`))));const closed=new DemoBookingStore(()=>Date.parse('2027-01-01'));assert.throws(()=>closed.reserve('u1',payload()),BookingError);});

test('PostgreSQL reservation RPC enforces atomic allocation, expiry, scope and quota',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const file of ['supabase/migrations/202611030001_foundation.sql','supabase/migrations/202611030002_reservations.sql','supabase/seed.sql'])await db.exec(await readFile(file,'utf8'));
 const u1='a0000000-0000-4000-8000-000000000001',u2='a0000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users(id) values('${u1}'),('${u2}');update public.events set starts_at=now()+interval '2 days',ends_at=now()+interval '3 days';update public.ticket_categories set sales_start=now()-interval '1 day',sales_end=now()+interval '1 day';`);
 const category=(await db.query<{id:string}>(`select c.id from public.ticket_categories c join public.events e on e.id=c.event_id where e.slug='little-weekend' and c.name='Regular'`)).rows[0].id;
 const seatRows=(await db.query<{id:string}>(`select s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.name='Regular' order by row_label,number`)).rows;
 const front=(await db.query<{id:string}>(`select s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.name='Front' limit 1`)).rows[0].id;
 async function actor(user:string){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`);}
 async function reserve(seats:string[],key=randomUUID()){return (await db.query<{result:Record<string,unknown>}>(`select public.reserve_booking($1,$2,$3::jsonb,$4) as result`,['little-weekend',category,JSON.stringify(seats.map(seatId=>({seatId,name:'Fiktif'}))),key])).rows[0].result;}
 await actor(u1);const key=randomUUID();const first=await reserve([seatRows[0].id],key);assert.equal(first.status,'PENDING_PAYMENT');assert.equal((await reserve([seatRows[0].id],key)).id,first.id);
 await actor(u2);assert.equal((await reserve([seatRows[1].id,seatRows[0].id])).error,'SEAT_UNAVAILABLE');assert.equal((await reserve([front])).error,'CATEGORY');
 assert.equal((await db.query<{result:{error:string}}>(`select public.get_booking($1) as result`,[first.id])).rows[0].result.error,'NOT_FOUND');assert.equal((await db.query('select * from public.bookings')).rows.length,0);
 await db.exec(`reset role;update public.bookings set expires_at=now()-interval '1 second' where id='${first.id}';`);await actor(u2);
 const fresh=await reserve([seatRows[0].id]);assert.equal(fresh.status,'PENDING_PAYMENT');assert.notEqual(fresh.id,first.id);
 const second=await reserve([seatRows[1].id]);assert.equal(second.status,'PENDING_PAYMENT');
 await db.exec(`reset role;update public.booking_items set allocation_status='SOLD' where booking_id='${second.id}';update public.bookings set status='CONFIRMED' where id='${second.id}';`);await actor(u1);assert.equal((await reserve([seatRows[1].id])).error,'SEAT_UNAVAILABLE');
 await db.exec(`reset role;update public.ticket_categories set quota=2 where id='${category}';`);await actor(u1);assert.equal((await reserve([seatRows[2].id])).error,'QUOTA');
 await actor(u2);assert.equal((await db.query<{result:{status:string}}>(`select public.cancel_booking($1) as result`,[fresh.id])).rows[0].result.status,'CANCELLED');
 await actor(u1);const recovered=await reserve([seatRows[0].id]);assert.equal(recovered.status,'PENDING_PAYMENT');
 await assert.rejects(()=>db.query(`update public.booking_items set allocation_status='RELEASED'`));
 await db.exec(`reset role;update public.ticket_categories set sales_end=now()-interval '1 second' where id='${category}';`);await actor(u1);assert.equal((await reserve([seatRows[2].id])).error,'SALES_CLOSED');
 }finally{await db.close();}
});
