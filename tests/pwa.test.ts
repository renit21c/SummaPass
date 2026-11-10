import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import sharp from 'sharp';
import manifest from '../src/app/manifest';

test('PWA manifest uses standalone mode and correctly sized opaque application icons',async()=>{
 const value=manifest();
 assert.equal(value.display,'standalone');assert.equal(value.scope,'/');assert.equal(value.start_url,'/');
 for(const icon of value.icons??[]){
  const metadata=await sharp(await readFile('public'+icon.src)).metadata();
  assert.equal(`${metadata.width}x${metadata.height}`,icon.sizes);assert.equal(metadata.hasAlpha,false);
 }
 assert.equal((await sharp('public/pwa/apple-touch-icon.png').metadata()).width,180);
});

async function worker(online=true){
 const listeners:Record<string,(event:any)=>void>={};
 const stored=new Map<string,Response>(),deleted:string[]=[];
 const cache={addAll:async(paths:string[])=>{for(const path of paths)stored.set(path,new Response('offline asset'));},match:async(path:string)=>stored.get(path)?.clone()};
 const self={location:{origin:'https://summapass.web.id'},clients:{claim:async()=>{}},addEventListener:(event:string,handler:(event:any)=>void)=>{listeners[event]=handler;}};
 runInNewContext(await readFile('public/sw.js','utf8'),{self,URL,Response,caches:{open:async()=>cache,keys:async()=>['other-app-cache','summapass-pwa-old','summapass-pwa-v1'],delete:async(key:string)=>{deleted.push(key);}},fetch:async()=>{if(!online)throw Error('offline');return new Response('private account data');}});
 let task:Promise<unknown>=Promise.resolve();listeners.install({waitUntil:(promise:Promise<unknown>)=>{task=promise;}});await task;
 return {listeners,stored,deleted,activate:async()=>{listeners.activate({waitUntil:(promise:Promise<unknown>)=>{task=promise;}});await task;}};
}
test('Service worker never intercepts API, payment mutations, third-party requests or RSC',async()=>{
 const app=await worker();
 for(const request of [
  {url:'https://summapass.web.id/api/tickets/123',method:'GET',mode:'cors'},
  {url:'https://summapass.web.id/api/bookings/123/payment',method:'POST',mode:'cors'},
  {url:'https://summapass.web.id/account?_rsc=123',method:'GET',mode:'cors'},
  {url:'https://api.resend.com/emails',method:'GET',mode:'cors'},
 ]){let intercepted=false;app.listeners.fetch({request,respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false);}
 assert.equal(app.stored.size,5);
});
test('Online private pages are network-only; offline navigation uses the public fallback',async()=>{
 for(const online of [true,false]){
  const app=await worker(online);let result:Promise<Response>|undefined;
  app.listeners.fetch({request:{url:'https://summapass.web.id/account',method:'GET',mode:'navigate'},respondWith:(value:Promise<Response>)=>{result=value;}});
  assert.equal(await (await result!).text(),online?'private account data':'offline asset');
  assert.equal(app.stored.has('/account'),false);assert.equal(app.stored.size,5);
 }
});
test('Activation cleans only obsolete SummaPass PWA caches',async()=>{
 const app=await worker();await app.activate();assert.deepEqual(app.deleted,['summapass-pwa-old']);
});
