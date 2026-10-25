// Smartiero – service worker: funzionamento offline e ricezione dei contenuti condivisi
const CACHE = "smartiero-v3";
const SHELL = ["./", "index.html", "manifest.json", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function idb(){ return new Promise((res, rej) => {
  const r = indexedDB.open("smartiero", 1);
  r.onupgradeneeded = () => { const db = r.result;
    if (!db.objectStoreNames.contains("coda")) db.createObjectStore("coda", {keyPath:"qid", autoIncrement:true});
    if (!db.objectStoreNames.contains("condivisi")) db.createObjectStore("condivisi", {keyPath:"id", autoIncrement:true});
  };
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});}

async function riceviCondivisione(request){
  try {
    const form = await request.formData();
    const db = await idb();
    const items = [];
    const text = [form.get("title"), form.get("text")].filter(Boolean).join(" ").trim();
    if (text) items.push({text});
    for (const f of form.getAll("files")) if (f && f.size) items.push({file: f});
    await new Promise((res, rej) => {
      const t = db.transaction("condivisi", "readwrite");
      items.forEach(it => t.objectStore("condivisi").add(it));
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch (e) { /* in caso di errore apriamo comunque l'app */ }
  return Response.redirect("./?condiviso=1", 303);
}

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method === "POST" && url.pathname.endsWith("/condividi")) {
    e.respondWith(riceviCondivisione(e.request));
    return;
  }
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // il motore Google va sempre in rete
  // rete prima, così gli aggiornamenti arrivano subito; cache se offline
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match("index.html")))
  );
});
