// sw.js – service worker: push-notifikationer, det røde tal på app-ikonet – og en kopi af selve appen på telefonen,
// så den kan åbnes uden net. Nettet spørges ALTID først (opdateringer kommer som før); kopien bruges kun, når nettet
// ikke svarer inden for VENT ms. Nødbremse: sæt GEM_APP = false og læg filen op – så er alt som før (og kopien slettes).
const GEM_APP = true;
const LAGER = 'familietavlen-app';
const NY = 'familietavlen-app-ny';   // en nyhentet side venter her, til alle dens filer også er gemt – så kopien altid hænger sammen
const VENT = 3000;
const fraKopi = new Set();   // de åbne sider, der blev åbnet fra kopien (nettet var væk eller langsomt)
const UDEFRA = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];   // Supabase-biblioteket og skrifterne

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  if (!GEM_APP) { await caches.delete(LAGER); await caches.delete(NY); }
  await self.clients.claim();
})()));

// Hvad må gemmes? Appens egne filer (ikke sw.js) og de få ting udefra. Aldrig Supabase (data) – det klarer data.js.
function slags(u) {
  if (u.origin === self.location.origin) return u.href.startsWith(self.registration.scope) && !u.pathname.endsWith('/sw.js') ? 'egen' : null;
  return UDEFRA.includes(u.hostname) ? 'udefra' : null;
}
const noegle = (req, u) => req.mode === 'navigate' ? u.origin + u.pathname : u.href;   // siden selv gemmes uden ?… og #…
const find = async n => (await caches.open(LAGER)).match(n, { ignoreVary: true });
async function hentOgGem(n, hvad, valg) {
  const svar = await fetch(hvad, valg);
  if (svar.ok) (await caches.open(LAGER)).put(n, svar.clone()).catch(() => {});
  return svar;
}

self.addEventListener('fetch', (e) => {
  if (!GEM_APP || e.request.method !== 'GET') return;
  const u = new URL(e.request.url), s = slags(u);
  if (!s) return;
  const n = noegle(e.request, u);
  if (s === 'udefra') {   // faste adresser (versionen står i adressen) – kopien bruges, hvis den findes
    e.respondWith((async () => (await find(n)) || hentOgGem(n, u.href, { mode: 'cors', credentials: 'omit' }))());
    return;
  }
  e.respondWith((async () => {
    const side = e.request.mode === 'navigate';
    const net = side ? fetch(e.request) : hentOgGem(n, e.request);
    e.waitUntil(net.catch(() => {}));   // bliver nettet færdigt senere, gemmes filen alligevel
    const kopi = !side && fraKopi.has(e.clientId) ? await find(n) : null;
    if (kopi) return kopi;   // selve siden kom fra kopien: så gør dens filer også (ikke 3 sek. ventetid pr. fil, og versionerne passer sammen)
    let ur;
    const vent = new Promise(ok => { ur = setTimeout(ok, VENT, null); });
    const foerst = await Promise.race([net.catch(() => null), vent]);
    clearTimeout(ur);
    if (foerst && foerst.ok) {
      if (side) await (await caches.open(NY)).put(n, foerst.clone()).catch(() => {});
      return foerst;
    }
    const gemt = await find(n);
    if (gemt && side) {
      await caches.delete(NY);
      if (e.resultingClientId) { fraKopi.add(e.resultingClientId); if (fraKopi.size > 20) fraKopi.delete(fraKopi.values().next().value); }
    }
    return gemt || foerst || net;   // intet net (eller for langsomt): brug kopien, hvis der er en
  })());
});

// Appen sender listen over det, den lige har hentet: det, der mangler i kopien, hentes, og gamle versioner af js/css ryddes væk
self.addEventListener('message', (e) => {
  const liste = e.data && e.data.gemApp;
  if (!GEM_APP || !Array.isArray(liste)) return;
  e.waitUntil((async () => {
    const lager = await caches.open(LAGER), ny = await caches.open(NY), nu = new Set();
    let altOk = true;
    for (const adr of liste) {
      let u; try { u = new URL(adr); } catch { continue; }
      const s = slags(u);
      if (!s) continue;
      nu.add(u.href);
      if (await find(u.href) || await ny.match(u.href)) continue;
      try { if (!(await hentOgGem(u.href, u.href, s === 'udefra' ? { mode: 'cors', credentials: 'omit' } : {})).ok) altOk = false; } catch { altOk = false; }
    }
    if (!altOk) return;
    for (const req of await ny.keys()) { await lager.put(req, await ny.match(req)); await ny.delete(req); }   // nu er alle filerne gemt: siden må afløse den gamle
    for (const req of await lager.keys()) {
      const u = new URL(req.url);
      if (u.origin === self.location.origin && /\.(js|css)$/.test(u.pathname) && !nu.has(u.href)) await lager.delete(req);
    }
  })());
});

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

// Tryk på notifikationen: åbn appen (eller hent den frem) og gå hen til det, beskeden handler om.
// tag = '<liste>-<id>' (fx 'sedler-…'); appen finder selv stedet (app.js gaaTil).
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const tag = e.notification.tag || '';
  const url = new URL((e.notification.data?.url || './') + (tag ? '#gaa=' + encodeURIComponent(tag) : ''), self.registration.scope).href;
  e.waitUntil((async () => {
    const vinduer = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const v of vinduer) {
      if (v.url.startsWith(self.registration.scope)) {
        await v.focus();
        if (tag) v.postMessage({ gaa: tag });
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
