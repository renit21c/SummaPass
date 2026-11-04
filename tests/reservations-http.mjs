import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin='http://127.0.0.1:3001';
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
const login=async()=>{const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'/bookings'})});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];};
const a=await login(),b=await login();
const body=(seatIds=['Regular-A1'],categoryId='regular')=>({slug:'little-weekend',categoryId,seats:seatIds.map(seatId=>({seatId,name:'Peserta Fiktif'})),key:randomUUID()});
const reserve=(cookie,payload)=>request('/api/bookings',{method:'POST',headers:{origin,cookie,'Content-Type':'application/json'},body:JSON.stringify(payload)});
const owned=[];
try{
 const keyA=body(),keyB=body();const [first,second]=await Promise.all([reserve(a,keyA),reserve(b,keyB)]);assert.deepEqual([first.status,second.status].sort(),[201,409]);
 const winner=first.status===201?a:b,loser=first.status===201?b:a,key=first.status===201?keyA:keyB;
 const success=first.status===201?await first.json():await second.json();owned.push([winner,success.id]);assert.equal(success.total,75000);
 const retry=await reserve(winner,key);assert.equal(retry.status,201);assert.equal((await retry.json()).id,success.id);
 const forbidden=await request(`/api/bookings/${success.id}`,{headers:{cookie:loser}});assert.equal(forbidden.status,404);
 const partial=await reserve(loser,body(['Regular-A2','Regular-A1']));assert.equal(partial.status,409);
 const inventory=await (await request('/api/events/little-weekend/seats')).json();assert.equal(inventory.seats.find(s=>s.id==='Regular-A2').status,'AVAILABLE');assert.equal(inventory.seats.find(s=>s.id==='Regular-A1').status,'RESERVED');assert.equal('userId' in inventory,false);
 const category=await reserve(loser,body(['Front-A3']));assert.equal(category.status,400);
 const invalid=await reserve(loser,body(Array.from({length:7},(_,i)=>`Regular-B${i+1}`)));assert.equal(invalid.status,400);
 const guest=await reserve('',body(['Regular-A3']));assert.equal(guest.status,401);
 const cross=await request('/api/bookings',{method:'POST',headers:{origin:'https://example.invalid',cookie:winner,'Content-Type':'application/json'},body:JSON.stringify(body())});assert.equal(cross.status,403);
 const cancel=await request(`/api/bookings/${success.id}`,{method:'DELETE',headers:{origin,cookie:winner}});assert.equal(cancel.status,200);assert.equal((await cancel.json()).status,'CANCELLED');
 const next=await reserve(loser,body());assert.equal(next.status,201);const nextData=await next.json();owned.push([loser,nextData.id]);
 console.log('PASS: two-user race one winner, server pricing, idempotency, owner isolation, multi-seat rollback, category/limit validation, auth/CSRF, cancellation and rebooking.');
}finally{for(const [cookie,id] of owned)await request(`/api/bookings/${id}`,{method:'DELETE',headers:{origin,cookie}});}
