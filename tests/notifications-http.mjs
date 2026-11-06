import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:3002';
if(!['127.0.0.1','localhost'].includes(new URL(origin).hostname))throw Error('Gunakan preview demo lokal terisolasi.');
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
async function login(role){const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams(role?{demoRole:role}:{})});assert.equal(r.status,303);const cookie=r.headers.get('set-cookie');assert.ok(cookie,'Jalankan server dalam mode demo.');return cookie.split(';')[0];}
const mutate=(path,data,cookie,method='POST',source=origin)=>request(path,{method,headers:{origin:source,cookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
assert.equal((await request('/api/notifications')).status,401);assert.equal((await request('/notifications')).status,307);assert.equal((await request('/api/notifications/preferences')).status,401);assert.equal((await request('/api/internal/notifications/run',{method:'POST'})).status,401);
const organizer=await login('organizer'),buyer=await login(),other=await login();
const eventBody={title:'Notifikasi QA Lokal',description:'Acara fiktif pada preview demo terisolasi untuk pengujian notifikasi.',category:'Musik',startsAt:'2030-12-25T10:00:00+07:00',endsAt:'2030-12-25T13:00:00+07:00',salesStart:'2026-01-01T00:00:00+07:00',salesEnd:'2030-12-25T09:00:00+07:00',price:80000,frontPrice:120000,frontQuota:24,regularQuota:24,rules:'Satu tiket untuk satu peserta.',organizer:'Organizer QA',area:'Venue QA',theme:'play'};
let r=await mutate('/api/organizer/events',eventBody,organizer);assert.equal(r.status,201);const e=await r.json();assert.equal((await mutate('/api/organizer/events/'+e.id,{action:'publish'},organizer)).status,200);
const bookingBody={slug:e.slug,categoryId:'regular',seats:[{seatId:'Regular-A1',name:'Peserta QA'}],key:randomUUID()};r=await mutate('/api/bookings',bookingBody,buyer);assert.equal(r.status,201);const b=await r.json();await mutate('/api/bookings',bookingBody,buyer);
const list=async(cookie)=>{const r=await request('/api/notifications',{headers:{cookie}});assert.equal(r.status,200);return r.json();};
let notifications=await list(buyer);assert.equal(notifications.items.length,1);assert.equal(notifications.items[0].type,'booking');assert.equal((await list(other)).items.length,0);
assert.equal((await mutate('/api/notifications',{action:'read',id:notifications.items[0].id},other,'PATCH')).status,404);assert.equal((await mutate('/api/notifications',{action:'read_all'},buyer,'PATCH','https://other.example')).status,403);
assert.equal((await mutate('/api/notifications',{action:'unknown'},buyer,'PATCH')).status,400);assert.equal((await mutate('/api/notifications',{text:'a'.repeat(5000)},buyer,'PATCH')).status,413);
assert.equal((await mutate('/api/notifications',{action:'read_all'},buyer,'PATCH')).status,200);assert.equal((await list(buyer)).unreadCount,0);
assert.equal((await mutate('/api/bookings/'+b.id+'/payment',{outcome:'success'},buyer)).status,200);notifications=await list(buyer);assert.equal(notifications.items.length,2);assert.ok(notifications.items.some(n=>n.type==='ticket'));
const prefs={bookingReminders:false,eventReminders:false,emailReminders:false};r=await mutate('/api/notifications/preferences',prefs,buyer,'PUT');assert.equal(r.status,200);assert.deepEqual(await r.json(),prefs);r=await request('/api/notifications/preferences',{headers:{cookie:buyer}});assert.deepEqual(await r.json(),prefs);
r=await request('/api/tickets/'+randomUUID()+'/deliveries',{headers:{cookie:buyer}});assert.equal(r.status,200);assert.deepEqual(await r.json(),[]);
assert.equal((await mutate('/api/tickets/'+randomUUID()+'/resend',{key:randomUUID(),email:'other@example.test'},buyer)).status,400);
r=await mutate('/api/tickets/'+randomUUID()+'/resend',{key:randomUUID()},buyer);assert.equal(r.status,409);assert.equal((await r.json()).code,'SUPABASE_REQUIRED');
assert.equal((await mutate('/api/notifications',{action:'clear'},buyer,'PATCH')).status,200);assert.equal((await list(buyer)).items.length,0);
// The same generator is used by the browser download and email attachment path.
r=await request('/my-tickets?booking='+b.id,{headers:{cookie:buyer}});assert.equal(r.status,200);const ticketHtml=await r.text();const ownTicket=ticketHtml.match(/href="\/my-tickets\/([a-f0-9-]{36})"/i)?.[1];assert.ok(ownTicket,'Issued ticket link must be present');
assert.equal((await request('/api/tickets/'+ownTicket+'/pdf')).status,401);assert.equal((await request('/api/tickets/'+ownTicket+'/pdf',{headers:{cookie:other}})).status,404);
assert.equal((await mutate('/api/organizer/events/'+e.id,{action:'unpublish'},organizer)).status,200);
r=await request('/api/tickets/'+ownTicket+'/pdf',{headers:{cookie:buyer}});assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/application\/pdf/);const pdf=Buffer.from(await r.arrayBuffer());assert.equal(pdf.subarray(0,8).toString(),'%PDF-1.4');assert.ok(pdf.toString('binary').includes('/FontFile2'));
console.log('PASS: notification HTTP login, real booking/payment notices, dedup, owner isolation, read/clear, preferences, Origin/body validation, cron auth and explicit demo email rejection, owned PDF download and unpublished event snapshots.');
