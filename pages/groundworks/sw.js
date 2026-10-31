const PREFIX = `groundworks:${new URL(self.registration.scope).pathname}:`;
const VERSION = `${PREFIX}v5`;
const FILES = ['./','./index.html','./assets/style.css','./assets/main.js','./assets/world.js','./assets/finish.js','./assets/model-detail.js','./assets/icon.svg','./assets/cover.webp','./assets/vendor/three/build/three.module.min.js','./assets/vendor/three/build/three.core.min.js','./assets/vendor/three/examples/jsm/controls/OrbitControls.js','./assets/vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js','./assets/vendor/three/examples/jsm/environments/RoomEnvironment.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||!event.request.url.startsWith(self.registration.scope))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>{
    const cache=await caches.open(VERSION);
    return(await cache.match(event.request,{ignoreSearch:true}))||(event.request.mode==='navigate'?await cache.match('./index.html'):Response.error());
  }));
});
