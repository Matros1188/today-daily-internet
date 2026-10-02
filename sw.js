/* TODAY V18.1.21 FRONTEND RECOVERY */
self.addEventListener("install",e=>self.skipWaiting());self.addEventListener("activate",e=>e.waitUntil((async()=>{for(const k of await caches.keys()){if(k.startsWith("today-static-")||k.startsWith("today-")){try{await caches.delete(k)}catch{}}}try{await self.registration.unregister()}catch{}try{await self.clients.claim()}catch{}})()));
