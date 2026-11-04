import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { PGlite } from '@electric-sql/pglite';
import { DemoBookingStore } from '../src/features/booking/demo-store';
import { createTicketPack,decryptToken,tokenHash } from '../src/features/tickets/crypto';
const epoch=Date.parse('2026-11-03T10:00:00+07:00');
const payload=(seats=['Regular-A1','Regular-A2'])=>({slug:'little-weekend',categoryId:'regular',seats:seats.map(seatId=>({seatId,name:'Peserta Fiktif'})),key:randomUUID()});
test('payment retries and concurrent confirmations issue one ticket per seat',async()=>{const store=new DemoBookingStore(()=>epoch),b=store.reserve('u1',payload());assert.equal(store.ticketsFor('u1').length,0);const results=await Promise.all([Promise.resolve().then(()=>store.payment('u1',b.id,'success')),Promise.resolve().then(()=>store.payment('u1',b.id,'success'))]);assert.ok(results.every(r=>r.status==='CONFIRMED'));const tickets=store.ticketsFor('u1');assert.equal(tickets.length,2);assert.equal(new Set(tickets.map(t=>t.token)).size,2);assert.ok(tickets.every(t=>/^[a-f0-9]{64}$/.test(t.token)));assert.equal(store.payment('u1',b.id,'failure').paymentStatus,'PAID');assert.equal(store.ticketsFor('u1').length,2);assert.equal(store.inventory('little-weekend').seats.find(s=>s.id==='Regular-A1')!.status,'SOLD');assert.throws(()=>store.reserve('u2',payload(['Regular-A1'])));assert.throws(()=>store.ticket('u2',tickets[0].id));assert.equal(store.ticketsFor('u2').length,0);});
test('failed, cancelled and expired payments cannot issue tickets or sell reassigned seats',()=>{let now=epoch;const store=new DemoBookingStore(()=>now);const failed=store.reserve('u1',payload(['Regular-A1']));assert.equal(store.payment('u1',failed.id,'failure').status,'FAILED');assert.throws(()=>store.payment('u1',failed.id,'success'));const late=store.reserve('u1',payload(['Regular-A1']));now+=600000;const newOwner=store.reserve('u2',payload(['Regular-A1']));assert.throws(()=>store.payment('u1',late.id,'success'));assert.equal(store.get('u2',newOwner.id).status,'PENDING_PAYMENT');store.cancel('u2',newOwner.id);assert.throws(()=>store.payment('u2',newOwner.id,'success'));assert.equal(store.ticketsFor('u1').length,0);assert.equal(store.ticketsFor('u2').length,0);assert.equal(store.inventory('little-weekend').seats.find(s=>s.id==='Regular-A1')!.status,'AVAILABLE');});
test('ticket tokens are encrypted with authenticated encryption and decode from rendered QR',async()=>{const key=randomBytes(32),pack=createTicketPack('seat',key),raw=decryptToken(pack.encryptedToken,key);assert.equal(tokenHash(raw),pack.tokenHash);assert.equal(pack.encryptedToken.includes(raw),false);assert.throws(()=>decryptToken(pack.encryptedToken,randomBytes(32)));const bits=pack.encryptedToken.split('.');const tampered=Buffer.from(bits[3],'base64url');tampered[0]^=1;bits[3]=tampered.toString('base64url');assert.throws(()=>decryptToken(bits.join('.'),key));const svg=renderToStaticMarkup(createElement(QRCodeSVG,{value:raw,size:240,marginSize:4,level:'M'}));const {data,info}=await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({resolveWithObject:true});const decoded=jsQR(new Uint8ClampedArray(data),info.width,info.height);assert.equal(decoded?.data,raw);});

test('PostgreSQL payment transaction protects issuance, retries, expiry, roles and ciphertext',async()=>{
 const db=new PGlite();const key=randomBytes(32);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;`);
 for(const file of ['supabase/migrations/202611030001_foundation.sql','supabase/migrations/202611030002_reservations.sql','supabase/migrations/202611030003_payments_tickets.sql','supabase/seed.sql'])await db.exec(await readFile(file,'utf8'));
 const u1='a0000000-0000-4000-8000-000000000001',u2='a0000000-0000-4000-8000-000000000002';
 await db.exec(`insert into auth.users(id) values('${u1}'),('${u2}');update public.events set starts_at=now()+interval '2 days',ends_at=now()+interval '3 days';update public.ticket_categories set sales_start=now()-interval '1 day',sales_end=now()+interval '1 day';`);
 const category=(await db.query<{id:string}>(`select c.id from public.ticket_categories c join public.events e on e.id=c.event_id where e.slug='little-weekend' and c.name='Regular'`)).rows[0].id;
 const seatRows=(await db.query<{id:string}>(`select s.id from public.seats s join public.venue_sections vs on vs.id=s.section_id where vs.name='Regular' order by row_label,number`)).rows;
 async function actor(user:string){await db.exec(`reset role;select set_config('request.jwt.claim.sub','${user}',false);set role authenticated;`);}
 async function reserve(indices:number[]){await actor(u1);return (await db.query<{result:{id:string;paymentStatus:string}}>(`select public.reserve_booking($1,$2,$3::jsonb,$4) as result`,['little-weekend',category,JSON.stringify(indices.map(i=>({seatId:seatRows[i].id,name:'Demo'}))),randomUUID()])).rows[0].result;}
 async function pay(id:string,outcome:string,packs:unknown[],owner=u1){await db.exec('reset role;set role service_role');return (await db.query<{result:Record<string,unknown>}>(`select public.process_simulated_payment($1,$2,$3,$4::jsonb) as result`,[owner,id,outcome,JSON.stringify(packs)])).rows[0].result;}
 const b=await reserve([0,1]);assert.equal(b.paymentStatus,'PENDING');
 await assert.rejects(()=>db.query(`select public.process_simulated_payment($1,$2,'success','[]')`,[u1,b.id]));
 await db.exec('reset role');const item=(await db.query<{id:string}>('select id from public.booking_items where booking_id=$1 limit 1',[b.id])).rows[0].id;
 await assert.rejects(()=>db.query(`insert into public.tickets(reference,booking_item_id,token_hash) values('illegal',$1,$2)`,[item,'a'.repeat(64)]));
 const packs=[createTicketPack(seatRows[0].id,key),createTicketPack(seatRows[1].id,key)];
 assert.equal((await pay(b.id,'success',packs,u2)).error,'NOT_FOUND');
 assert.equal((await pay(b.id,'success',[])).error,'INPUT');
 assert.equal((await pay(b.id,'success',packs)).status,'CONFIRMED');
 assert.equal((await pay(b.id,'success',packs)).status,'CONFIRMED');
 assert.equal((await pay(b.id,'failure',[])).paymentStatus,'PAID');
 await db.exec('reset role');assert.equal(Number((await db.query<{count:string}>('select count(*) from public.tickets')).rows[0].count),2);
 await actor(u2);assert.equal((await db.query('select * from public.tickets')).rows.length,0);assert.equal((await db.query('select * from public.payments')).rows.length,0);await assert.rejects(()=>db.query('select * from public.ticket_secrets'));await assert.rejects(()=>db.query(`select public.issued_tickets_for_owner($1,null)`,[u1]));
 await actor(u1);assert.equal((await db.query('select * from public.tickets')).rows.length,2);await assert.rejects(()=>db.query(`update public.payments set status='PAID'`));
 await db.exec('reset role;set role service_role');const issued=(await db.query<{result:{encryptedToken:string;tokenHash:string}[]}>(`select public.issued_tickets_for_owner($1,null) as result`,[u1])).rows[0].result;assert.equal(issued.length,2);assert.equal(tokenHash(decryptToken(issued[0].encryptedToken,key)),issued[0].tokenHash);
 const failed=await reserve([2]);assert.equal((await pay(failed.id,'failure',[])).status,'FAILED');assert.equal((await pay(failed.id,'success',[createTicketPack(seatRows[2].id,key)])).error,'NOT_PAYABLE');
 const late=await reserve([2]);await db.exec(`reset role;update public.bookings set expires_at=now()-interval '1 second' where id='${late.id}';`);assert.equal((await pay(late.id,'success',[createTicketPack(seatRows[2].id,key)])).error,'RESERVATION_EXPIRED');
 await db.exec('reset role');assert.equal(Number((await db.query<{count:string}>('select count(*) from public.tickets')).rows[0].count),2);assert.equal((await db.query<{status:string}>('select status from public.payments where booking_id=$1',[late.id])).rows[0].status,'EXPIRED');
 const after=await reserve([2]);assert.ok(after.id);await actor(u1);const inventory=(await db.query<{result:{seats:{id:string;status:string}[]}}>(`select public.seat_inventory('little-weekend') as result`)).rows[0].result;assert.equal(inventory.seats.find(s=>s.id===seatRows[0].id)!.status,'SOLD');
 }finally{await db.close();}
});
