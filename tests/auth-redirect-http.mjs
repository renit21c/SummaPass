import assert from 'node:assert/strict';
const origin=process.env.TEST_ORIGIN??'http://127.0.0.1:3002';
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
const page=await request('/login');assert.match(await page.text(),/Masuk sebagai pengunjung demo/,'Run this script against an isolated demo server.');
for(const [role,destination] of [['organizer','/organizer'],['staff','/staff']]){
 const response=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({demoRole:role,next:'/account'})});
 assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location'),origin).pathname,destination);
 const cookie=response.headers.get('set-cookie').split(';')[0];
 const repeat=await request('/login?next=/my-tickets',{headers:{cookie}});assert.equal(repeat.status,307);assert.equal(new URL(repeat.headers.get('location'),origin).pathname,destination);
 await request('/api/auth/logout',{method:'POST',headers:{origin,cookie}});
}
const attendee=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'/my-tickets'})});assert.equal(attendee.status,303);assert.equal(new URL(attendee.headers.get('location'),origin).pathname,'/my-tickets');
console.log('PASS: organizer/staff login and existing sessions redirect to their workspace; attendee return path remains intact.');
