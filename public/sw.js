// Only the public offline page and application icons are stored locally.
// Never cache HTML from authenticated pages, RSC responses, APIs, or transactions.
const CACHE='summapass-pwa-v1';
const ASSETS=['/offline.html','/pwa/icon-192.png','/pwa/icon-512.png','/pwa/icon-maskable-512.png','/pwa/apple-touch-icon.png'];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('summapass-pwa-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(async()=>{
   const cache=await caches.open(CACHE);
   return (await cache.match('/offline.html'))||Response.error();
  }));
 }else if(ASSETS.includes(url.pathname)&&!url.search){
  event.respondWith(caches.open(CACHE).then(async cache=>(await cache.match(url.pathname))||fetch(request)));
 }
});
