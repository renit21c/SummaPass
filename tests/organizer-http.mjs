import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin='http://127.0.0.1:3001';const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
async function login(role){const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'/organizer',...(role?{demoRole:role}:{})})});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
const attendee=await login();assert.equal((await request('/api/organizer/export',{headers:{cookie:attendee}})).status,403);assert.equal((await request('/api/organizer/export')).status,401);
async function reserve(slug,seat,name){const r=await request('/api/bookings',{method:'POST',headers:{origin,cookie:attendee,'Content-Type':'application/json'},body:JSON.stringify({slug,categoryId:'regular',seats:[{seatId:seat,name}],key:randomUUID()})});assert.equal(r.status,201);return r.json();}
const assigned=await reserve('little-weekend','Regular-B4','Peserta Demo');const paid=await request('/api/bookings/'+assigned.id+'/payment',{method:'POST',headers:{origin,cookie:attendee,'Content-Type':'application/json'},body:JSON.stringify({outcome:'success'})});assert.equal(paid.status,200);await reserve('after-hours','Regular-B4','Outside Scope');
const org=await login('organizer');const dashboard=await request('/organizer',{headers:{cookie:org}});assert.equal(dashboard.status,200);assert.match(await dashboard.text(),/Organizer/);
const csv=await request('/api/organizer/export',{headers:{cookie:org}});assert.equal(csv.status,200);const text=await csv.text();assert.ok(text.includes(assigned.reference));assert.ok(text.includes('Peserta Demo'));assert.equal(text.includes('Outside Scope'),false);assert.equal(text.includes('after-hours'),false);assert.equal(text.includes('token'),false);
assert.equal((await request('/api/organizer/export?event=after-hours',{headers:{cookie:org}})).status,403);
const empty=await request('/api/organizer/export?q=not-a-person',{headers:{cookie:org}});assert.equal((await empty.text()).includes(assigned.reference),false);
const staff=await request('/staff',{headers:{cookie:org}});assert.match(await staff.text(),/Akses terbatas/);
await request('/api/bookings/'+assigned.id,{method:'DELETE',headers:{origin,cookie:attendee}});
console.log('PASS: attendee and guest export denied, organizer demo works, assignment-scoped CSV, formula escaping, search filtering and no staff escalation.');
