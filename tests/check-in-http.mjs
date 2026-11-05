import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:3002';
async function request(path,options={}){return fetch(origin+path,{redirect:'manual',...options});}
async function login(role){const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'/account',...(role?{demoRole:role}:{})})});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
const attendee=await login(),org=await login('organizer'),staff=await login('staff');
const post=(path,data,cookie=staff)=>request(path,{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify(data)});
assert.equal((await post('/api/staff/check-in',{slug:'little-weekend',credential:'invalid'},attendee)).status,403);
assert.equal((await post('/api/staff/check-in',{slug:'little-weekend',credential:'invalid'},org)).status,403);
assert.equal((await request('/api/staff/check-in',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({slug:'little-weekend',credential:'invalid'})})).status,401);
assert.equal((await post('/api/staff/check-in',{slug:'after-hours',credential:'invalid'})).status,403);
let r=await post('/api/bookings',{slug:'little-weekend',categoryId:'regular',seats:[{seatId:'Regular-C8',name:'Peserta Demo Check-in'}],key:randomUUID()},attendee);assert.equal(r.status,201);const b=await r.json();assert.equal((await post('/api/bookings/'+b.id+'/payment',{outcome:'success'},attendee)).status,200);
// Owner API returns the raw token only to the ticket owner; never print it.
const list=await request('/my-tickets',{headers:{cookie:attendee}});const html=await list.text();const id=html.match(/href="\/my-tickets\/([a-f0-9-]{36})"/)[1];r=await request('/api/tickets/'+id,{headers:{cookie:attendee}});const t=await r.json();
let data={slug:'little-weekend',credential:t.reference,confirm:false};r=await post('/api/staff/check-in',data);assert.equal((await r.json()).status,'VALID');
const race=await Promise.all([post('/api/staff/check-in',{...data,confirm:true}),post('/api/staff/check-in',{...data,credential:t.token,confirm:true})]);const results=await Promise.all(race.map(r=>r.json()));assert.equal(results.filter(r=>r.status==='CHECKED_IN').length,1);assert.equal(results.filter(r=>r.status==='ALREADY_USED').length,1);
assert.equal((await (await post('/api/staff/check-in',{...data,slug:'senja-di-summa'})).json()).status,'WRONG_EVENT');
assert.equal((await (await post('/api/staff/check-in',{...data,credential:'invalid'})).json()).status,'INVALID');
r=await request('/my-tickets/'+id,{headers:{cookie:attendee}});assert.match(await r.text(),/Sudah masuk/);
r=await request('/organizer',{headers:{cookie:org}});assert.match(await r.text(),/Sudah check-in:/);
assert.equal((await request('/api/staff/history?slug=little-weekend',{headers:{origin,cookie:attendee}})).status,403);
assert.equal((await request('/api/staff/history?slug=after-hours',{headers:{origin,cookie:staff}})).status,403);
const historyRes=await request('/api/staff/history?slug=little-weekend',{headers:{origin,cookie:staff}});assert.equal(historyRes.status,200);const historyData=await historyRes.json();assert.ok(historyData.totalCheckedInByMe>=1);assert.ok(historyData.history.some(h=>h.reference===t.reference));
assert.equal((await request('/api/staff/check-in',{method:'POST',headers:{origin:'https://example.test',cookie:staff,'Content-Type':'application/json'},body:JSON.stringify(data)})).status,403);
console.log('PASS: staff-only access, event assignment, preview, one winner on simultaneous confirm, wrong event, invalid QR, attendee status, history/report API, and organizer attendance.');
