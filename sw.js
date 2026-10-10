// sw.js – service worker, KUN til push-notifikationer og det røde tal på app-ikonet (den gemmer ikke siden – så opdateringer kommer som før).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { tekst: e.data ? e.data.text() : '' }; }
  e.waitUntil(Promise.all([tilfoejTal(), self.registration.showNotification(d.titel || 'Familietavlen', {
    body: d.tekst || '',
    icon: 'ikon-192.png',
    tag: d.tag || undefined,          // samme tag = erstatter den forrige i stedet for at stable
    renotify: !!d.tag,
    data: { url: d.url || './' }
  })]));
});

// Rødt tal på app-ikonet: appen gemmer det rigtige tal, når den er åben; hver push-besked lægger 1 til, til appen åbnes igen
async function tilfoejTal() {
  try {
    if (!self.navigator.setAppBadge) return;
    const c = await caches.open('familietavlen-tal');
    const n = (Number(await (await c.match('tal'))?.text()) || 0) + 1;
    await c.put('tal', new Response(String(n)));
    await self.navigator.setAppBadge(n);
  } catch {}
}

// Tryk på notifikationen: åbn appen (eller hent den frem, hvis den allerede er åben)
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of vinduer) {
      if (v.url.startsWith(self.registration.scope)) { await v.focus(); return; }
    }
    await self.clients.openWindow(url);
  })());
});
