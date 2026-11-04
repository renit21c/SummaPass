import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3001';
const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
const guest=await request('/account');assert.equal(guest.status,307);assert.match(guest.headers.get('location'),/\/login/);
const cross=await request('/api/auth/login',{method:'POST',headers:{origin:'https://example.invalid'},body:new URLSearchParams({next:'/account'})});assert.equal(cross.status,403);
const login=await request('/api/auth/login',{method:'POST',headers:{origin},body:new URLSearchParams({next:'https://example.invalid'})});assert.equal(login.status,303);assert.equal(new URL(login.headers.get('location')).pathname,'/account');
const cookie=login.headers.get('set-cookie');assert.ok(cookie);assert.match(cookie,/HttpOnly/i);assert.match(cookie,/SameSite=lax/i);const sessionCookie=cookie.split(';')[0];
const account=await request('/account',{headers:{cookie:sessionCookie}});assert.equal(account.status,200);assert.match(await account.text(),/Halo, /);
for(const path of ['/organizer','/staff']){const page=await request(path,{headers:{cookie:sessionCookie}});assert.match(await page.text(),/Akses terbatas/);}
const forged=await request('/account',{headers:{cookie:'summapass_demo_session=forged'}});assert.equal(forged.status,307);
const out=await request('/api/auth/logout',{method:'POST',headers:{origin,cookie:sessionCookie}});assert.equal(out.status,303);
const replay=await request('/account',{headers:{cookie:sessionCookie}});assert.equal(replay.status,307);
console.log('PASS: guest redirect, cross-origin rejection, safe return URL, HttpOnly session, account, organizer/staff denial, forged cookie rejection, logout and session revocation.');
