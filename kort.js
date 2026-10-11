// kort.js – "Vores kort" (Mere → Vores kort): steder familien har været, og steder vi gerne vil hen.
// Data: liste 'steder' {navn, lat, lon, land?, slags: 'vaeret'|'droem', aar?, hvem?: [navne], note?, billede?}
// Kun voksne kan tilføje/rette (børnelåsen i databasen lader ikke børn skrive listen) – børn kan se kortet.
// Kortet: Leaflet + OpenStreetMap, hentes først når siden åbnes. Søgning: Open-Meteo (samme som Vejret).

const LEAFLET_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const STED_SLAGS = { vaeret: '📍 Her har vi været', droem: '⭐ Vil gerne hen' };
let stedKort = null, stedLag = null, stedFilter = 'alle', stedTilpasset = false, stedVaelg = null;
const stedMarkoer = {};
let leafletLoefte = null;

function hentLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletLoefte) leafletLoefte = new Promise((ok, fejl) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = LEAFLET_URL + 'leaflet.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = LEAFLET_URL + 'leaflet.js';
    s.onload = ok;
    s.onerror = () => { leafletLoefte = null; s.remove(); fejl(new Error('leaflet')); };
    document.head.append(s);
  });
  return leafletLoefte;
}

const stedListe = () => Data.listNu('steder').filter(s => typeof s.lat === 'number' && typeof s.lon === 'number');
const stedUnder = s => [s.land, s.slags === 'vaeret' && s.aar ? s.aar : ''].filter(Boolean).join(' · ');
function stedSort(a, b) {
  if (a.slags === 'vaeret' && b.slags === 'vaeret' && (b.aar || 0) !== (a.aar || 0)) return (b.aar || 0) - (a.aar || 0);
  return (a.navn || '').localeCompare(b.navn || '', 'da');
}
function hvemPrikker(hvem) {
  const boks = el('span', 'sted-prikker');
  for (const n of hvem || []) { const p = el('span', 'prik ' + (PK[n] || '')); p.title = n; boks.append(p); }
  return boks;
}

// ---------- Siden ----------
async function tegnSteder() {
  const boks = document.getElementById('steder-indhold');
  if (!boks) return;
  if (!boks.dataset.klar) {
    boks.dataset.klar = '1';
    const kortBoks = el('div', 'sted-kort-boks');
    const kort = el('div', 'sted-kort'); kort.id = 'sted-kort';
    const vaelgBaand = el('div', 'sted-vaelg-baand'); vaelgBaand.id = 'sted-vaelg-baand'; vaelgBaand.hidden = true;
    vaelgBaand.append(el('span', null, '👆 Tryk på kortet, hvor stedet er'), knap('Annullér', 'lille-knap', () => stopVaelg()));
    kortBoks.append(kort, vaelgBaand);
    const filter = el('div'); filter.id = 'sted-filter';
    const tal = el('p', 'hint sted-tal'); tal.id = 'sted-tal';
    const lister = el('div', 'sted-lister'); lister.id = 'sted-lister';
    boks.append(filter, kortBoks, tal, lister);
  }
  const alle = stedListe().sort(stedSort);
  const vist = alle.filter(s => stedFilter === 'alle' || s.slags === stedFilter);
  const antal = sl => alle.filter(s => s.slags === sl).length;

  document.getElementById('sted-filter').replaceChildren(valgSeg(['alle', 'vaeret', 'droem'], stedFilter, v => { stedFilter = v; stedTilpasset = false; tegnSteder(); },
    v => v === 'alle' ? 'Alle' : v === 'vaeret' ? '📍 Været (' + antal('vaeret') + ')' : '⭐ Drømme (' + antal('droem') + ')'));

  const vaeret = alle.filter(s => s.slags === 'vaeret');
  const lande = new Set(vaeret.map(s => s.land).filter(Boolean));
  document.getElementById('sted-tal').textContent = vaeret.length
    ? 'Vi har været ' + vaeret.length + (vaeret.length === 1 ? ' sted' : ' steder') + (lande.size ? ' i ' + lande.size + (lande.size === 1 ? ' land' : ' lande') : '') + '.'
    : (erBarn() ? 'Der er ingen steder på kortet endnu.' : 'Tryk + Tilføj sted for at sætte den første nål.');

  // Listerne under kortet
  const lister = document.getElementById('sted-lister');
  lister.replaceChildren();
  for (const sl of ['vaeret', 'droem']) {
    const her = vist.filter(s => s.slags === sl);
    if (!her.length) continue;
    lister.append(el('h3', 'sted-overskrift', STED_SLAGS[sl]));
    const ul = el('ul', 'sted-raekker');
    for (const s of her) {
      const li = el('li');
      const k = knap('', 'sted-raekke', () => visStedPaaKort(s.id));
      const tekst = el('span', 'sted-tekst');
      tekst.append(el('b', null, s.navn || 'Uden navn'));
      const under = stedUnder(s);
      if (under) tekst.append(el('span', 'sted-under', under));
      k.append(el('span', 'sted-ikon', sl === 'droem' ? '⭐' : '📍'), tekst, hvemPrikker(s.hvem));
      li.append(k);
      ul.append(li);
    }
    lister.append(ul);
  }

  // Selve kortet
  try { await hentLeaflet(); }
  catch { document.getElementById('sted-kort').replaceChildren(el('p', 'hint sted-kort-fejl', 'Kortet kunne ikke hentes. Tjek internettet og prøv igen.')); return; }
  if (!stedKort) {
    stedKort = L.map('sted-kort', { worldCopyJump: true, zoomSnap: 0.5 }).setView([54, 10], 3);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(stedKort);
    stedKort.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    stedLag = L.layerGroup().addTo(stedKort);
    stedKort.on('click', e => { if (stedVaelg) stedVaelg(e.latlng); });
  }
  stedKort.invalidateSize();
  stedLag.clearLayers();
  for (const id in stedMarkoer) delete stedMarkoer[id];
  for (const s of vist) {
    const ikon = L.divIcon({ className: 'sted-pin ' + s.slags, html: s.slags === 'droem' ? '⭐' : '', iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] });
    const m = L.marker([s.lat, s.lon], { icon: ikon, title: s.navn }).bindPopup(() => stedPopup(s.id), { maxWidth: 260, minWidth: 180 });
    m.addTo(stedLag);
    stedMarkoer[s.id] = m;
  }
  if (!stedTilpasset && vist.length) {
    stedTilpasset = true;
    if (vist.length === 1) stedKort.setView([vist[0].lat, vist[0].lon], 6);
    else stedKort.fitBounds(vist.map(s => [s.lat, s.lon]), { padding: [30, 30], maxZoom: 6 });
  }
}

function stedPopup(id) {
  const s = Data.listNu('steder').find(x => x.id === id);
  const boks = el('div', 'sted-popup');
  if (!s) return boks;
  boks.append(el('b', 'sted-popup-navn', (s.slags === 'droem' ? '⭐ ' : '📍 ') + (s.navn || 'Uden navn')));
  const under = [stedUnder(s), s.slags === 'droem' ? 'Vil gerne hen' : ''].filter(Boolean).join(' · ');
  if (under) boks.append(el('div', 'sted-under', under));
  if (s.hvem?.length) {
    const hv = el('div', 'sted-hvem');
    for (const n of s.hvem) hv.append(el('span', 'hvem-tag ' + (PK[n] || ''), n));
    boks.append(hv);
  }
  if (s.note) boks.append(el('p', 'sted-note', s.note));
  if (s.billede) { const img = el('img', 'sted-billede'); img.src = s.billede; img.alt = s.navn || ''; boks.append(img); }
  if (!erBarn()) {
    const kn = el('div', 'sted-popup-knapper');
    if (s.slags === 'droem') kn.append(knap('✅ Vi har været der!', 'lille-knap', () => { stedKort.closePopup(); redigerSted({ ...s, slags: 'vaeret', aar: new Date().getFullYear() }); }));
    kn.append(knap('✏️ Ret', 'lille-knap', () => { stedKort.closePopup(); redigerSted(s); }));
    boks.append(kn);
  }
  return boks;
}

function visStedPaaKort(id) {
  const m = stedMarkoer[id];
  if (!m || !stedKort) return;
  document.getElementById('sted-kort').scrollIntoView({ behavior: 'smooth', block: 'center' });
  stedKort.setView(m.getLatLng(), Math.max(stedKort.getZoom(), 7));
  m.openPopup();
}

// ---------- Tilføj og ret ----------
async function stedNavnFra(lat, lon) {   // groft bynavn + land ud fra et punkt (samme tjeneste som Vejret bruger)
  try {
    const d = await (await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=da&latitude=' + lat + '&longitude=' + lon)).json();
    return { navn: d.city || d.locality || '', land: d.countryName || '' };
  } catch { return { navn: '', land: '' }; }
}
const rund = x => Math.round(x * 1000) / 1000;

function startVaelg() {
  lukArk();
  document.getElementById('sted-vaelg-baand').hidden = false;
  document.getElementById('sted-kort').classList.add('vaelger');
  document.getElementById('sted-kort').scrollIntoView({ behavior: 'smooth', block: 'center' });
  stedVaelg = async ll => {
    stopVaelg();
    const lat = rund(ll.lat), lon = rund(((ll.lng + 180) % 360 + 360) % 360 - 180);
    const { navn, land } = await stedNavnFra(lat, lon);
    redigerSted({ navn, land, lat, lon, slags: stedFilter === 'droem' ? 'droem' : 'vaeret' });
  };
}
function stopVaelg() {
  stedVaelg = null;
  const b = document.getElementById('sted-vaelg-baand'); if (b) b.hidden = true;
  document.getElementById('sted-kort')?.classList.remove('vaelger');
}

function nytSted() {
  const slags = stedFilter === 'droem' ? 'droem' : 'vaeret';
  const soeg = input('search', 'sted-ny-soeg', '', 'Søg by eller sted, fx Bad Harzburg');
  soeg.enterKeyHint = 'search';
  const status = el('p', 'hint');
  const liste = el('ul', 'sted-liste');
  const form = el('form', 'tilfoj');
  form.append(soeg, el('button', 'knap', 'Søg'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const navn = soeg.value.trim();
    if (!navn) return;
    soeg.blur();
    status.textContent = 'Søger…';
    try {
      const res = (await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=8&language=da&name=' + encodeURIComponent(navn))).json()).results || [];
      status.textContent = res.length ? 'Tryk på det rigtige:' : 'Fandt intet med det navn. Prøv en by i nærheden – eller tryk på kortet.';
      liste.replaceChildren(...res.map(x => {
        const li = el('li');
        li.append(knap(x.name + ' · ' + [x.admin1, x.country].filter(Boolean).join(', '), 'sted-valg',
          () => redigerSted({ navn: x.name, land: x.country || '', lat: rund(x.latitude), lon: rund(x.longitude), slags })));
        return li;
      }));
    } catch { status.textContent = 'Kunne ikke søge lige nu. Tjek internettet.'; }
  });
  const andre = el('div', 'sted-andre');
  andre.append(knap('👆 Vælg på kortet', 'lille-knap', () => startVaelg()),
    knap('📍 Her er vi nu', 'lille-knap', () => {
      if (!navigator.geolocation) { status.textContent = 'Enheden kan ikke give en placering.'; return; }
      status.textContent = 'Finder placering…';
      navigator.geolocation.getCurrentPosition(async pos => {
        const lat = rund(pos.coords.latitude), lon = rund(pos.coords.longitude);
        const { navn, land } = await stedNavnFra(lat, lon);
        redigerSted({ navn, land, lat, lon, slags, aar: new Date().getFullYear() });
      }, () => { status.textContent = 'Fik ikke lov til at bruge placeringen.'; }, { timeout: 15000 });
    }));
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap', () => lukArk()));
  aabnArk('Nyt sted', form, status, liste, el('p', 'seg-label', 'Eller'), andre, knapper);
  setTimeout(() => soeg.focus(), 50);
}

function redigerSted(s) {
  const ny = !s.id;
  let slags = s.slags === 'droem' ? 'droem' : 'vaeret';
  let hvem = [...(s.hvem || [])];
  let billede = s.billede || '';

  const navn = input('text', 'sted-navn', s.navn || '', 'Fx Bad Harzburg');
  const land = input('text', 'sted-land', s.land || '', 'Fx Tyskland');
  const aar = input('text', 'sted-aar', ny && slags === 'vaeret' && !s.aar ? new Date().getFullYear() : (s.aar || ''), 'Fx 2026');
  aar.inputMode = 'numeric'; aar.maxLength = 4;
  const aarFelt = felt('Hvornår (år)', aar);
  const slagsBoks = el('div');
  const tegnSlags = () => {
    slagsBoks.replaceChildren(valgSeg(['vaeret', 'droem'], slags, v => { slags = v; tegnSlags(); }, v => STED_SLAGS[v]));
    aarFelt.hidden = slags !== 'vaeret';
    hvemLabel.textContent = slags === 'vaeret' ? 'Hvem var med?' : 'Hvem vil gerne derhen?';
  };
  const hvemLabel = el('p', 'seg-label');
  const hvemBoks = el('div', 'seg wrap sted-hvem-valg');
  const tegnHvem = () => hvemBoks.replaceChildren(...PERSONER.filter(n => n !== 'Fælles').map(n => {
    const k = knap(n, PK[n] || null, () => { hvem = hvem.includes(n) ? hvem.filter(x => x !== n) : [...hvem, n]; tegnHvem(); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', hvem.includes(n));
    return k;
  }), knap(hvem.length === PERSONER.length - 1 ? 'Ingen' : 'Alle', 'lille-knap', () => { hvem = hvem.length === PERSONER.length - 1 ? [] : PERSONER.filter(n => n !== 'Fælles'); tegnHvem(); }));
  tegnSlags(); tegnHvem();

  const note = el('textarea', 'k-tekst sted-note-felt'); note.id = 'sted-note'; note.rows = 2; note.value = s.note || ''; note.placeholder = 'Fx "Hotellet med pool" eller "Villads vil se vulkaner"';
  note.maxLength = 300;

  const billedBoks = el('div', 'sted-billed-valg');
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*'; filInput.hidden = true;
  filInput.addEventListener('change', async () => {
    const fil = filInput.files?.[0]; if (!fil) return;
    try { billede = await laesBillede(fil, 900, 0.72); tegnBillede(); } catch { visStatus('Billedet kunne ikke læses', true); }
  });
  const tegnBillede = () => {
    billedBoks.replaceChildren(filInput);
    if (billede) {
      const img = el('img', 'sted-billede'); img.src = billede; img.alt = '';
      billedBoks.append(img, knap('Fjern billede', 'lille-knap', () => { billede = ''; tegnBillede(); }));
    } else billedBoks.append(knap('📷 Tilføj et billede', 'lille-knap', () => filInput.click()));
  };
  tegnBillede();

  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); visStatus('Skriv et navn på stedet', true); return; }
    const a = parseInt(aar.value, 10);
    const felter = { navn: n.slice(0, 80), land: land.value.trim().slice(0, 60), lat: s.lat, lon: s.lon, slags,
      aar: slags === 'vaeret' && a >= 1900 && a <= 2100 ? a : null, hvem, note: note.value.trim(), billede };
    try {
      if (ny) await Data.add('steder', felter); else await Data.update('steder', s.id, felter);
    } catch { visStatus('Kunne ikke gemme stedet', true); return; }
    lukArk();
    if (stedFilter !== 'alle' && stedFilter !== slags) stedFilter = 'alle';
    await tegnSteder();
    visStatus(ny ? 'Stedet er sat på kortet' : 'Gemt');
    const nyt = ny ? stedListe().filter(x => x.navn === felter.navn && x.lat === felter.lat && x.lon === felter.lon).pop() : s;
    if (nyt) visStedPaaKort(nyt.id);
  }));
  if (!ny) knapper.append(bekraeftKnap('Slet', 'slette', 'knap fare', async () => { await Data.remove('steder', s.id); lukArk(); tegnSteder(); }));
  aabnArk(ny ? 'Nyt sted' : 'Ret sted', slagsBoks, felt('Navn', navn), felt('Land', land), aarFelt, hvemLabel, hvemBoks,
    felt('Note', note), billedBoks, knapper);
}

document.getElementById('ny-sted')?.addEventListener('click', () => nytSted());
Data.onChange(() => { if (typeof aktivFane !== 'undefined' && aktivFane === 'steder') tegnSteder(); });
