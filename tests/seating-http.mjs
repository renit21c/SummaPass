import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:3002';
const endpoint='/api/organizer/events/20000000-0000-4000-8000-000000000001';
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
async function login(role){const r=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams(role?{demoRole:role}:{})});assert.equal(r.status,303);return r.headers.get('set-cookie').split(';')[0];}
assert.equal((await request(endpoint+'/seating')).status,401);
for(const role of ['staff',undefined]){const cookie=await login(role);assert.equal((await request(endpoint+'/seating',{headers:{cookie}})).status,403);}
const cookie=await login('organizer');let r=await request(endpoint+'/seating',{headers:{cookie}});assert.equal(r.status,409);assert.equal((await r.json()).code,'SUPABASE_REQUIRED');
const category={expectedVersion:0,name:'VIP',price:100000,quota:1,salesStart:'2026-01-01T00:00:00Z',salesEnd:'2030-01-01T00:00:00Z',sections:['VIP'],active:true};
for(const [path,method,body] of [[endpoint+'/seating','PUT',{expectedVersion:0,width:520,height:570,sections:[{name:'VIP',seats:[{row:'AA',number:1,x:70,y:140}]}],categories:[category]}],[endpoint+'/categories','POST',category],[endpoint+'/categories/30000000-0000-4000-8000-000000000001','PATCH',category]]){
 const send=(data,requestOrigin=origin)=>request(path,{method,headers:{origin:requestOrigin,cookie,'Content-Type':'application/json'},body:typeof data==='string'?data:JSON.stringify(data)});
 assert.equal((await send(body,'https://other.example')).status,403);
 assert.equal((await send('{invalid')).status,400);
 assert.equal((await send({})).status,400);
 r=await send(body);assert.equal(r.status,409);assert.equal((await r.json()).code,'SUPABASE_REQUIRED');
}
console.log('PASS: seating HTTP auth, roles, Origin, input validation, route wiring and explicit demo rejection. No remote database mutations.');
