import test from 'node:test';
import assert from 'node:assert/strict';
import { googleOAuthOptions,exchangeAuthCallback,loginErrorMessage } from '../src/lib/auth/google';
import { roleDestination } from '../src/lib/auth/destination';

test('Google uses PKCE on the initiating origin, minimal scopes and safe return destinations',()=>{
 for(const origin of ['http://127.0.0.1:3000','http://localhost:3000','https://summapass.web.id']){
  const options=googleOAuthOptions(origin,'/events/little-weekend/seats');
  const url=new URL(options.options.redirectTo);
  assert.equal(options.provider,'google');assert.equal(url.origin,origin);assert.equal(url.pathname,'/auth/callback');assert.equal(url.searchParams.get('flow'),'google');
  assert.equal(url.searchParams.get('next'),'/events/little-weekend/seats');
  assert.equal(options.options.skipBrowserRedirect,true);assert.equal(options.options.scopes,'openid email profile');
  assert.deepEqual(options.options.queryParams,{prompt:'select_account'});
 }
 for(const next of ['https://evil.example','//evil.example','/api/auth/google','/login'])assert.equal(new URL(googleOAuthOptions('https://summapass.web.id',next).options.redirectTo).searchParams.get('next'),'/account');
});

test('verified Google sessions use database roles, buyer return paths and exact staff invitation URLs',async()=>{
 const client={auth:{async exchangeCodeForSession(code:string){assert.equal(code,'valid-code');return {error:null};}}};
 for(const [roles,destination] of [[['ORGANIZER'],'/organizer'],[['STAFF'],'/staff'],[[],'/my-tickets']] as const){
  const params=new URLSearchParams({code:'valid-code',flow:'google',next:'/my-tickets',role:'ORGANIZER'});
  assert.equal(await exchangeAuthCallback(params,client,async next=>roleDestination(roles,next)),destination);
 }
 const path='/staff/invitations/a0000000-0000-4000-8000-000000000001';
 assert.equal(await exchangeAuthCallback(new URLSearchParams({code:'valid-code',flow:'google',next:path}),client,async next=>roleDestination(['STAFF'],next)),path);
});

test('Google callback errors and invalid codes never produce a successful destination',async()=>{
 let calls=0,resolved=0;
 const client={auth:{async exchangeCodeForSession(){calls++;return {error:null};}}};
 for(const params of [new URLSearchParams(),new URLSearchParams({error:'access_denied',code:'untrusted'}),new URLSearchParams({code:'x'.repeat(4097)})])assert.equal(await exchangeAuthCallback(params,client,async()=>{resolved++;return '/organizer';}),null);
 assert.equal(calls,0);assert.equal(resolved,0);
 assert.equal(await exchangeAuthCallback(new URLSearchParams({code:'expired',flow:'google'}),{auth:{async exchangeCodeForSession(){return {error:{code:'invalid_grant'}};}}},async()=>{resolved++;return '/organizer';}),null);
 assert.equal(resolved,0);
 assert.match(loginErrorMessage('google_cancelled'),/dibatalkan/);assert.match(loginErrorMessage('google_failed'),/Google/);
});

test('Google callback changes do not redirect recovery or verification flows into role dashboards',async()=>{
 const client={auth:{async exchangeCodeForSession(){return {error:null};}}};
 for(const next of ['/reset-password','/verify-email?verified=1'])assert.equal(await exchangeAuthCallback(new URLSearchParams({code:'valid',next}),client,async()=>{throw Error('Must not resolve workspace for email flows');}),next);
});
