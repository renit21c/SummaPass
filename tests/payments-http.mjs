import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin='http://127.0.0.1:3001';
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
const login=async()=>{const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'/bookings'})});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];};
const a=await login(),b=await login();
async function reserve(cookie,seats){const r=await request('/api/bookings',{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify({slug:'little-weekend',categoryId:'regular',seats:seats.map(seatId=>({seatId,name:'Pemegang Demo'})),key:randomUUID(),total:1})});assert.equal(r.status,201);return r.json();}
const pay=(cookie,id,outcome)=>request(`/api/bookings/${id}/payment`,{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify({outcome,amount:1,userId:'ignored',tickets:['ignored']})});
async function ticketIds(cookie,booking){const r=await request('/my-tickets?booking='+booking,{headers:{cookie}});assert.equal(r.status,200);const html=await r.text();return [...new Set([...html.matchAll(/href="\/my-tickets\/([a-f0-9-]{36})"/g)].map(m=>m[1]))];}
const booking=await reserve(a,['Regular-C1','Regular-C2']);assert.equal(booking.total,150000);assert.equal((await ticketIds(a,booking.id)).length,0);
const attempts=await Promise.all([pay(a,booking.id,'success'),pay(a,booking.id,'success')]);for(const response of attempts){assert.equal(response.status,200);const body=await response.json();assert.equal(body.booking.status,'CONFIRMED');assert.equal(body.booking.paymentStatus,'PAID');assert.equal(body.booking.total,150000);}
const ids=await ticketIds(a,booking.id);assert.equal(ids.length,2);const values=[];
for(const id of ids){const r=await request('/api/tickets/'+id,{headers:{cookie:a}});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/private.*no-store/);const t=await r.json();assert.match(t.token,/^[a-f0-9]{64}$/);assert.equal(t.attendeeName,'Pemegang Demo');assert.equal(t.bookingId,booking.id);assert.equal('encryptedToken' in t,false);assert.equal('tokenHash' in t,false);values.push(t.token);const forbidden=await request('/api/tickets/'+id,{headers:{cookie:b}});assert.equal(forbidden.status,404);}
assert.equal(new Set(values).size,2);assert.equal((await pay(b,booking.id,'success')).status,404);assert.equal((await pay('',booking.id,'success')).status,401);
const repeated=await pay(a,booking.id,'failure');assert.equal((await repeated.json()).booking.status,'CONFIRMED');assert.deepEqual((await ticketIds(a,booking.id)).sort(),ids.sort());
const cancelPaid=await request('/api/bookings/'+booking.id,{method:'DELETE',headers:{origin,cookie:a}});assert.equal((await cancelPaid.json()).status,'CONFIRMED');
const failed=await reserve(b,['Regular-C3']);assert.equal((await pay(b,failed.id,'failure')).status,200);assert.equal((await pay(b,failed.id,'success')).status,409);assert.equal((await ticketIds(b,failed.id)).length,0);
const inventory=await (await request('/api/events/little-weekend/seats')).json();assert.equal(inventory.seats.find(s=>s.id==='Regular-C1').status,'SOLD');assert.equal(inventory.seats.find(s=>s.id==='Regular-C3').status,'AVAILABLE');
console.log('PASS: two concurrent payment confirmations issue exactly two unique tickets, pricing tampering ignored, owner-only QR access, private cache headers, paid state immutable, failed payment releases seats without tickets.');
