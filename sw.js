/* TODAY V18.1.21 — SERVICE WORKER DISABLED FOR RECOVERY */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>{event.waitUntil((async()=>{try{const keys=await caches.keys();await Promise.all(keys.map(k=>caches.delete(k)))}catch(e){}try{await self.registration.unregister()}catch(e){}try{await self.clients.claim()}catch(e){}})())});
self.addEventListener('fetch',()=>{});
