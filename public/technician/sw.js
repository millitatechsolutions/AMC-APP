// Cache public static assets only. Auth pages, private HTML, sessions, FSRs,
// photographs and every API response always use the network.
const CACHE='amc-technician-shell-v6-brand-fsr-guide';
const ASSETS=['/technician/app.js','/technician/styles.css','/technician/manifest.webmanifest','/brand/powervision-logo.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('amc-technician-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||event.request.mode==='navigate'||url.origin!==self.location.origin||!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request)));
});
