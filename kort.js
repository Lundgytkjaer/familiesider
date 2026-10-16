// kort.js – "Vores kort" (Mere → Vores kort): steder familien har været, og steder vi gerne vil hen.
// Data: liste 'steder' {navn, lat, lon, land?, lag?, slags: 'vaeret'|'droem', aar?, hvem?: [navne], note?, billede?}
//       liste 'kortlag' {navn, ikon, farve, std?: true} – egne lag (MTB-spor, fiskesteder …). Steder uden lag hører til
//       standardlaget "Ferie og rejser" (findes altid; rettes det, gemmes det som en række med std: true).
// Kortstil (pr. enhed): almindeligt kort (OpenStreetMap) eller 🌲 Natur (OpenTopoMap – stier, højdekurver; godt til MTB).
// Kun voksne kan tilføje/rette (børnelåsen i databasen lader ikke børn skrive listen) – børn kan se kortet.
// Kortet: Leaflet + OpenStreetMap, hentes først når siden åbnes. Søgning: Open-Meteo (samme som Vejret).

const LEAFLET_URL = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
const STED_SLAGS = { vaeret: '✓ Har været der', droem: '☆ Vil gerne prøve' };
let stedKort = null, stedLag = null, stedFilter = 'alle', stedTilpasset = false, stedVaelg = null, stedFliser = null;
let stedLagValgt = lokal.get('kort-lag') || 'alle';
const STANDARD_LAG = { id: 'ferie', navn: 'Ferie og rejser', ikon: '🏖️', farve: '#1d6b58' };
const LAG_IKONER = ['🏖️', '🚵', '🎣', '⛺', '🏕️', '🥾', '🏰', '🍽️', '🏊', '⛷️', '🎢', '⛵', '🌲', '🏡', '🚗', '❤️'];
const LAG_FARVER = ['#1d6b58', '#2f63c8', '#c96f12', '#6d4fcf', '#b8417f', '#b08a00', '#c8432f', '#2fb0aa'];
const KORT_STILE = {
  kort: { navn: '🗺️ Kort', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', max: 19, kilde: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
  natur: { navn: '🌲 Natur', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', max: 17, kilde: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, SRTM · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)' }
};
// Lagene: standardlaget (evt. omdøbt) først, så de egne
function kortLag() {
  const egne = Data.listNu('kortlag');
  const std = egne.find(l => l.std);
  return [std ? { ...std, standard: true } : { ...STANDARD_LAG, standard: true }, ...egne.filter(l => !l.std)];
}
const stedLagId = s => { const l = kortLag(); return s.lag && l.some(x => x.id === s.lag) ? s.lag : l[0].id; };
const lagFor = s => kortLag().find(l => l.id === stedLagId(s)) || kortLag()[0];
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
  const lagListe = kortLag();
  if (stedLagValgt !== 'alle' && !lagListe.some(l => l.id === stedLagValgt)) stedLagValgt = 'alle';
  const alleSteder = stedListe().sort(stedSort);
  const alle = alleSteder.filter(s => stedLagValgt === 'alle' || stedLagId(s) === stedLagValgt);
  const vist = alle.filter(s => stedFilter === 'alle' || s.slags === stedFilter);
  const antal = sl => alle.filter(s => s.slags === sl).length;

  // Lag: Alle + hvert lag (hold fingeren / ✏️ = ret laget) + "+ Nyt lag" (voksne)
  const lagSeg = el('div', 'seg wrap sted-lag-valg');
  const lagKnap = (id, tekst) => {
    const k = knap(tekst, null, () => { stedLagValgt = id; lokal.set('kort-lag', id); stedTilpasset = false; tegnSteder(); });
    k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', stedLagValgt === id);
    return k;
  };
  lagSeg.append(lagKnap('alle', 'Alle (' + alleSteder.length + ')'));
  for (const l of lagListe) {
    const k = lagKnap(l.id, l.ikon + ' ' + l.navn + ' (' + alleSteder.filter(s => stedLagId(s) === l.id).length + ')');
    k.style.setProperty('--p', l.farve);
    if (!erBarn()) langtTryk(k, () => redigerLag(l));
    lagSeg.append(k);
  }
  if (!erBarn()) lagSeg.append(knap('+ Lag', 'lille-knap', () => redigerLag({})));
  const slagsSeg = valgSeg(['alle', 'vaeret', 'droem'], stedFilter, v => { stedFilter = v; stedTilpasset = false; tegnSteder(); },
    v => v === 'alle' ? 'Alle' : v === 'vaeret' ? '✓ Været (' + antal('vaeret') + ')' : '☆ Vil gerne (' + antal('droem') + ')');
  const filterDele = [lagSeg, slagsSeg];
  const valgtLag = lagListe.find(l => l.id === stedLagValgt);
  if (valgtLag && !erBarn()) filterDele.push(knap('✏️ Ret laget ' + valgtLag.navn, 'lille-knap sted-ret-lag', () => redigerLag(valgtLag)));
  document.getElementById('sted-filter').replaceChildren(...filterDele);

  const vaeret = alle.filter(s => s.slags === 'vaeret');
  const lande = new Set(vaeret.map(s => s.land).filter(Boolean));
  document.getElementById('sted-tal').textContent = alle.length
    ? '✓ ' + vaeret.length + ' været' + (lande.size > 1 ? ' (i ' + lande.size + ' lande)' : '') + ' · ☆ ' + antal('droem') + ' vil gerne prøve'
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
      k.append(el('span', 'sted-ikon' + (sl === 'droem' ? ' droem' : ''), lagFor(s).ikon), tekst, hvemPrikker(s.hvem));
      li.append(k);
      ul.append(li);
    }
    lister.append(ul);
  }

  // Selve kortet
  try { await hentLeaflet(); }
  catch { document.getElementById('sted-kort').replaceChildren(el('p', 'hint sted-kort-fejl', 'Kortet kunne ikke hentes. Tjek internettet og prøv igen.')); return; }
  if (!stedKort) {
    stedKort = L.map('sted-kort', { worldCopyJump: true, zoomSnap: 0.5 }).setView([56.1, 10.4], 6.5);   // Danmark, til der er steder
    stedKort.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    saetKortStil(lokal.get('kort-stil') === 'natur' ? 'natur' : 'kort');
    // Lille knap på kortet: skift mellem almindeligt kort og natur (stier, højdekurver)
    const Stil = L.Control.extend({ onAdd() {
      const b = L.DomUtil.create('button', 'kort-stil-knap');
      b.type = 'button';
      const tekst = () => { b.textContent = lokal.get('kort-stil') === 'natur' ? KORT_STILE.kort.navn : KORT_STILE.natur.navn; };
      tekst();
      L.DomEvent.disableClickPropagation(b);
      b.addEventListener('click', () => { const ny = lokal.get('kort-stil') === 'natur' ? 'kort' : 'natur'; lokal.set('kort-stil', ny); saetKortStil(ny); tekst(); });
      return b;
    } });
    new Stil({ position: 'topright' }).addTo(stedKort);
    stedLag = L.layerGroup().addTo(stedKort);
    stedKort.on('click', e => { if (stedVaelg) stedVaelg(e.latlng); });
  }
  stedKort.invalidateSize();
  stedLag.clearLayers();
  for (const id in stedMarkoer) delete stedMarkoer[id];
  for (const s of vist) {
    const lag = lagFor(s);
    // Ikon og farve kommer fra databasen: aldrig som HTML (ellers kunne et ikon som <img onerror=…> køre kode)
    const pin = document.createElement('span');
    pin.textContent = lag.ikon || '📍';
    pin.style.setProperty('--p', /^#[0-9a-f]{3,8}$/i.test(lag.farve || '') ? lag.farve : STANDARD_LAG.farve);
    const ikon = L.divIcon({ className: 'sted-pin ' + (s.slags === 'droem' ? 'droem' : 'vaeret'), html: pin, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    const m = L.marker([s.lat, s.lon], { icon: ikon, title: s.navn }).bindPopup(() => stedPopup(s.id), { maxWidth: 260, minWidth: 180 });
    m.addTo(stedLag);
    stedMarkoer[s.id] = m;
  }
  if (!stedTilpasset) {
    stedTilpasset = true;
    if (!vist.length) stedKort.setView([56.1, 10.4], 6.5);   // Danmark
    else if (vist.length === 1) stedKort.setView([vist[0].lat, vist[0].lon], 9);
    else stedKort.fitBounds(vist.map(s => [s.lat, s.lon]), { padding: [30, 30], maxZoom: 11 });
  }
}
function saetKortStil(navn) {
  const st = KORT_STILE[navn] || KORT_STILE.kort;
  if (stedFliser) stedKort.removeLayer(stedFliser);
  stedFliser = L.tileLayer(st.url, { maxZoom: st.max, attribution: st.kilde, subdomains: 'abc' }).addTo(stedKort);
  stedFliser.bringToBack();
  if (stedKort.getZoom() > st.max) stedKort.setZoom(st.max);
}

// ---------- Lag (voksne) ----------
function redigerLag(l) {
  const ny = !l.id;
  const s = { navn: l.navn || '', ikon: l.ikon || '🚵', farve: l.farve || LAG_FARVER[kortLag().length % LAG_FARVER.length] };
  const navn = input('text', 'lag-navn', s.navn, 'Fx MTB-spor, Fiskesteder, Weekendophold');
  navn.maxLength = 40;
  const ikonBoks = el('div'), farveBoks = el('div');
  const tegnIkon = () => ikonBoks.replaceChildren(chipValg(LAG_IKONER.includes(s.ikon) ? LAG_IKONER : [...LAG_IKONER, s.ikon], s.ikon, v => { s.ikon = v; tegnIkon(); }, v => v));
  const egetIkon = input('text', 'lag-ikon', '', 'Eller skriv en emoji');
  egetIkon.maxLength = 4;
  egetIkon.addEventListener('input', () => { const v = egetIkon.value.trim(); if (v) { s.ikon = v; tegnIkon(); } });
  const tegnFarve = () => {
    const seg = el('div', 'seg wrap lag-farver');
    for (const f of LAG_FARVER) {
      const k = knap(s.farve === f ? '✓' : '', null, () => { s.farve = f; tegnFarve(); });
      k.style.background = f; k.setAttribute('aria-label', 'Farve'); k.setAttribute('aria-pressed', s.farve === f);
      seg.append(k);
    }
    farveBoks.replaceChildren(seg);
  };
  tegnIkon(); tegnFarve();
  const knapper = el('div', 'ark-knapper');
  const antalHer = stedListe().filter(x => stedLagId(x) === l.id).length;
  if (!ny && !l.standard) knapper.append(bekraeftKnap('Slet laget', 'slette laget', 'knap fare', async () => {
    for (const x of stedListe().filter(x => x.lag === l.id)) await Data.update('steder', x.id, { lag: null });   // stederne flytter til standardlaget
    await Data.remove('kortlag', l.id);
    stedLagValgt = 'alle'; lokal.set('kort-lag', 'alle'); lukArk(); tegnSteder();
  }));
  knapper.append(knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); visStatus('Giv laget et navn', true); return; }
    const felter = { navn: n, ikon: s.ikon, farve: s.farve };
    if (ny) { await Data.add('kortlag', felter); const nyt = Data.listNu('kortlag').filter(x => x.navn === n).pop(); if (nyt) { stedLagValgt = nyt.id; lokal.set('kort-lag', nyt.id); } }
    else if (l.standard && l.id === STANDARD_LAG.id) await Data.add('kortlag', { ...felter, std: true });   // standardlaget rettes første gang
    else await Data.update('kortlag', l.id, felter);
    stedTilpasset = false; lukArk(); tegnSteder();
  }));
  aabnArk(ny ? 'Nyt lag på kortet' : 'Ret laget', felt('Navn', navn), el('label', 'felt-label', 'Ikon'), ikonBoks, egetIkon,
    el('label', 'felt-label', 'Farve'), farveBoks,
    !ny && antalHer ? el('p', 'hint', antalHer + (antalHer === 1 ? ' sted' : ' steder') + ' i laget.' + (l.standard ? '' : ' Slettes laget, flytter de til ' + kortLag()[0].navn + '.')) : '',
    knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

function stedPopup(id) {
  const s = Data.listNu('steder').find(x => x.id === id);
  const boks = el('div', 'sted-popup');
  if (!s) return boks;
  boks.append(el('b', 'sted-popup-navn', lagFor(s).ikon + ' ' + (s.navn || 'Uden navn')));
  const under = [lagFor(s).navn, stedUnder(s), s.slags === 'droem' ? 'Vil gerne prøve' : ''].filter(Boolean).join(' · ');
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
    if (s.slags === 'droem') kn.append(knap('✅ Har været der!', 'lille-knap', () => { stedKort.closePopup(); redigerSted({ ...s, slags: 'vaeret', aar: new Date().getFullYear() }); }));
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
  let lag = s.id ? stedLagId(s) : (s.lag || (stedLagValgt !== 'alle' ? stedLagValgt : kortLag()[0].id));
  const lagBoks = el('div');
  const tegnLagValg = () => lagBoks.replaceChildren(chipValg(kortLag().map(l => l.id), lag, v => { lag = v; tegnLagValg(); }, id => { const l = kortLag().find(x => x.id === id); return l.ikon + ' ' + l.navn; }));
  tegnLagValg();

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
      lag: lag === kortLag()[0].id ? null : lag,
      aar: slags === 'vaeret' && a >= 1900 && a <= 2100 ? a : null, hvem, note: note.value.trim(), billede };
    try {
      if (ny) await Data.add('steder', felter); else await Data.update('steder', s.id, felter);
    } catch { visStatus('Kunne ikke gemme stedet', true); return; }
    lukArk();
    if (stedFilter !== 'alle' && stedFilter !== slags) stedFilter = 'alle';
    if (stedLagValgt !== 'alle' && stedLagValgt !== lag) { stedLagValgt = 'alle'; lokal.set('kort-lag', 'alle'); }
    await tegnSteder();
    visStatus(ny ? 'Stedet er sat på kortet' : 'Gemt');
    const nyt = ny ? stedListe().filter(x => x.navn === felter.navn && x.lat === felter.lat && x.lon === felter.lon).pop() : s;
    if (nyt) visStedPaaKort(nyt.id);
  }));
  if (!ny) knapper.append(bekraeftKnap('Slet', 'slette', 'knap fare', async () => { await Data.remove('steder', s.id); lukArk(); tegnSteder(); }));
  aabnArk(ny ? 'Nyt sted' : 'Ret sted', el('label', 'felt-label', 'Lag'), lagBoks, slagsBoks, felt('Navn', navn), felt('Land', land), aarFelt, hvemLabel, hvemBoks,
    felt('Note', note), billedBoks, knapper);
}

document.getElementById('ny-sted')?.addEventListener('click', () => nytSted());
Data.onChange(() => { if (typeof aktivFane !== 'undefined' && aktivFane === 'steder') tegnSteder(); });
