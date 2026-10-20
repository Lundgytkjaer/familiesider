// app.js – al logik for familietavlen. Data går altid gennem Data (data.js).

const lokal = {
  get(k) { try { return localStorage.getItem('familietavle:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('familietavle:' + k, v); } catch {} }
};
// Kladder: tekst man er i gang med at skrive, gemmes på enheden, mens man skriver. Lukker telefonen appen i baggrunden
// (fx når man skifter til en anden app), er teksten der stadig, når man åbner det igen. Slettes, når det er sendt (højst 7 dage).
const KLADDE_DAGE = 7;
const kladdeNoegle = n => 'kladde:' + (Data.bruger()?.navn || '') + ':' + n;
function kladdeHent(n) {
  try {
    const k = JSON.parse(lokal.get(kladdeNoegle(n)) || 'null');
    return k && Date.now() - k.tid < KLADDE_DAGE * 864e5 ? k.v : null;
  } catch { return null; }
}
function kladdeGem(n, v) {
  try {
    if (v == null || v === '') localStorage.removeItem('familietavle:' + kladdeNoegle(n));
    else lokal.set(kladdeNoegle(n), JSON.stringify({ v, tid: Date.now() }));
  } catch {}
}
const kladdeGlem = n => kladdeGem(n, null);
// Lille linje i et ark: "✏️ Det, du skrev sidst, er hentet frem · Start forfra"
function kladdeHint(forfra) {
  const p = el('p', 'hint kladde-hint', '✏️ Det, du skrev sidst, er hentet frem · ');
  const b = el('button', 'link-knap', 'Start forfra'); b.type = 'button';
  b.addEventListener('click', () => { forfra(); p.remove(); });
  p.append(b);
  return p;
}

// Flag-emoji (🇩🇰 ved fødselsdage): Windows viser kun bogstaverne "DK". Kan browseren ikke tegne flag,
// hentes en lille flag-skrifttype (Twemoji, CC-BY 4.0) – kun til flag-tegnene, alt andet er uændret.
(function flagSkrift() {
  try {
    const tegn = t => {
      const c = document.createElement('canvas'); c.width = c.height = 1;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.textBaseline = 'top'; x.font = '100px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; x.scale(.01, .01);
      const farve = f => { x.clearRect(0, 0, 100, 100); x.fillStyle = f; x.fillText(t, 0, 0); return x.getImageData(0, 0, 1, 1).data.join(','); };
      const a = farve('#fff'), b = farve('#000');
      return a === b && !a.startsWith('0,0,0,');   // farvet emoji = samme farve uanset tekstfarve
    };
    if (!tegn('\u{1F60A}') || tegn('\u{1F1E9}\u{1F1F0}')) return;
    const st = document.createElement('style');
    st.textContent = '@font-face { font-family: "Twemoji Country Flags"; unicode-range: U+1F1E6-1F1FF; font-display: swap; '
      + 'src: url("https://cdn.jsdelivr.net/npm/country-flag-emoji-polyfill@0.1/dist/TwemojiCountryFlags.woff2") format("woff2"); }';
    document.head.append(st);
    document.documentElement.classList.add('flag-skrift');
  } catch {}
})();

const BOERN = ['Oliver', 'Villads'];
const DAGE = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAGE_LANG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const PRIO = { 1: 'Haster', 2: 'Snart', 3: 'Engang' };
const TOM_TEKST = { indkob: 'Ingen varer på listen', todo: 'Ingen opgaver – godt gået' };
const IKON_TJEK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const IKON_MERE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>';
const IKON_TERNING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
const IKON_SLET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function el(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst != null) e.textContent = tekst;
  return e;
}

// ---------- Datoer ----------
const idagNr = () => (new Date().getDay() + 6) % 7;   // mandag = 0
function mandagDenneUge() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idagNr());
  return d;
}
function ugenummer(dato) {
  const d = new Date(Date.UTC(dato.getFullYear(), dato.getMonth(), dato.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const aarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - aarStart) / 86400000 + 1) / 7);
}
// "8.00-8.45" -> [480, 525] minutter
function tidSomMin(tid) {
  const dele = (tid || '').split(/[-–]/).map(s => s.trim().replace(':', '.'));
  const tilMin = s => { if (!s) return null; const [t, m] = s.split('.').map(Number); return isNaN(t) ? null : t * 60 + (m || 0); };   // tom tid = ukendt (ikke kl. 0)
  return [tilMin(dele[0] || ''), tilMin(dele[1] || '')];
}
const slutTid = tid => ((tid || '').split(/[-–]/)[1] || '').trim();
// Mødetid og fri-tid for en skoledag (alle = dagensTimer). Har skolen kun givet en mødetid og en hjemtid
// (ingen tider på de enkelte timer), er den sidste tid efter mødetiden hjemtiden.
function skoleTider(alle) {
  const medFag = alle.filter(t => t.fag);
  if (!medFag.length) return { start: '', slut: '', harTimer: false };
  const start = (medFag[0].tid.split(/[-–]/)[0] || '').trim();
  let slut = slutTid(medFag[medFag.length - 1].tid);
  const harTimer = alle.some(t => slutTid(t.tid));
  if (!slut && !harTimer) {
    const efter = alle.slice(alle.indexOf(medFag[0]) + 1).map(t => (t.tid || '').trim()).filter(Boolean);
    if (efter.length) slut = efter[efter.length - 1].split(/[-–]/)[0].trim();
  }
  return { start, slut, harTimer };
}
// Klokkeslæt vises altid med punktum, som resten af appen: 08.00–08.45
const visTider = s => (s || '').replace(/:/g, '.').replace(/\s*[-–]\s*/, '–');
// Ugens dage som tekst: "5.–11. okt." eller "28. sep.–4. okt." (bruges alle steder, hvor en uge vises)
function ugeSpan(man) {
  const son = new Date(man); son.setDate(man.getDate() + 6);
  return man.getDate() + (man.getMonth() !== son.getMonth() ? '. ' + MDR[man.getMonth()] : '.') + '–' + son.getDate() + '. ' + MDR[son.getMonth()];
}
// "6. okt." – kort dato i tekst
const kortDag = iso => { const d = new Date(iso + 'T00:00'); return d.getDate() + '. ' + MDR[d.getMonth()]; };

// ---------- Faner ----------
const FANER = ['idag', 'kalender', 'madplan', 'indkob', 'todo', 'mere', 'skema', 'rutiner', 'pligter', 'pakkelister', 'konkurrence', 'vejr', 'hjaelp', 'familie', 'kontakter', 'aktivitet', 'steder', 'mappe', 'budget', 'dagbog', 'opskrifter'];
const UNDER_MERE = ['skema', 'rutiner', 'pligter', 'pakkelister', 'konkurrence', 'vejr', 'hjaelp', 'familie', 'kontakter', 'aktivitet', 'steder', 'mappe', 'budget', 'dagbog', 'opskrifter'];   // sider man når via "Mere"
// Voksne: "Pligter" (pligter, belønninger, ønsker) er en fane i bundmenuen – og To do er tilbage i bundmenuen (2026-10-19s). Børn: som før.
const underMere = navn => (Data.bruger()?.rolle === 'voksen'
  ? (UNDER_MERE.includes(navn) && navn !== 'pligter') : UNDER_MERE.includes(navn));
const FANE_NAVN = { idag: 'I dag', kalender: 'Kalender', madplan: 'Madplan', indkob: 'Indkøb', todo: 'To do', mere: 'Mere', pligter: 'Pligter' };
// Børn ser kun de faner, de voksne har slået til for dem (personvalg.faner). Tavlen ("I dag") er der altid.
const BOERNE_FANER = ['kalender', 'madplan', 'mere'];   // standard for børn
const VALGBARE_FANER = { kalender: 'Kalender', madplan: 'Madplan', indkob: 'Indkøb', todo: 'To do', mere: 'Mere' };
let tilladteFaner = null;   // null = alle (voksne)
let visAlleMere = false;   // "Vis alle sider" under Mere (huskes kun, mens appen er åben)
async function anvendFaner() {
  const p = Data.bruger();
  if (!p || p.rolle !== 'barn') { tilladteFaner = null; }
  else {
    const valg = await valgFor(p.navn);   // fra dage.js
    tilladteFaner = ['idag', ...(Array.isArray(valg.faner) ? valg.faner : BOERNE_FANER)];
  }
  const knapper = [...document.querySelectorAll('.bundmenu [data-fane]')];
  const voksen = p?.rolle === 'voksen';
  // Voksne kan selv skjule faner og sider under Mere (Indstillinger → Bundmenu og sider). Kun en visning – siderne kan stadig nås via links.
  const mineValg = voksen ? await valgFor(p.navn) : {};
  const skjulF = new Set(voksen && Array.isArray(mineValg.skjulFaner) ? mineValg.skjulFaner : []);
  knapper.forEach(b => {
    b.hidden = b.dataset.fane === 'pligter' ? !voksen || skjulF.has('pligter') : voksen ? skjulF.has(b.dataset.fane) : !!tilladteFaner && !tilladteFaner.includes(b.dataset.fane);
  });
  const skjulM = new Set(voksen && Array.isArray(mineValg.skjulMere) ? mineValg.skjulMere : []);
  document.querySelectorAll('#mere .mere-kort[data-gaa]').forEach(k => { k.hidden = !visAlleMere && skjulM.has(k.dataset.gaa); });
  let alleKnap = document.getElementById('mere-vis-alle');
  if (!alleKnap) {
    alleKnap = el('button', 'lille-knap mere-vis-alle'); alleKnap.type = 'button'; alleKnap.id = 'mere-vis-alle';
    alleKnap.addEventListener('click', () => { visAlleMere = !visAlleMere; anvendFaner(); });
    document.querySelector('#mere .mere-grid')?.after(alleKnap);
  }
  alleKnap.hidden = !skjulM.size;
  alleKnap.textContent = visAlleMere ? 'Skjul de sider, jeg har slået fra' : 'Vis alle sider (' + skjulM.size + ' skjult)';
  const synlige = knapper.filter(b => !b.hidden).length;
  const indre = document.querySelector('.bundmenu-indre');
  indre.style.gridTemplateColumns = 'repeat(' + synlige + ', 1fr)';
  indre.classList.toggle('mange', synlige >= 7);   // 7 faner: lidt mindre tekst, så "Kalender" kan være der
  const aaben = document.querySelector('.fane:not([hidden])')?.id;
  if (aaben && tilladteFaner && !tilladteFaner.includes(underMere(aaben) ? 'mere' : aaben)) visFane('idag');
}
// Tilbage-knappen på undersiderne går derhen, man kom fra (fx "‹ I dag", når man trykkede på vejret på tavlen)
let aktivFane = null, tilbageTil = null;
// Telefonens tilbage-knap: sidste faner huskes, så "tilbage" går dertil (se tilbageKnap)
const faneHistorik = [];
function visFane(navn, fraTilbage = false) {
  if (typeof lukZoom === 'function') lukZoom();
  if (!FANER.includes(navn)) navn = 'idag';
  if (erBarn() && typeof pauseHele === 'function' && pauseHele(Data.bruger()?.navn, isoDato(new Date()))) navn = 'idag';   // ⏸ hele tavlen holder pause
  if ((navn === 'kontakter' || navn === 'aktivitet' || navn === 'budget' || navn === 'dagbog') && erBarn()) navn = 'idag';   // kontakter, aktivitet og budget er kun for voksne
  if (navn !== 'hjaelp' && tilladteFaner && !tilladteFaner.includes(underMere(navn) ? 'mere' : navn)) navn = 'idag';
  const fra = aktivFane;
  if (!fraTilbage && fra && fra !== navn) { faneHistorik.push(fra); if (faneHistorik.length > 20) faneHistorik.shift(); }
  if (navn !== 'pligter' && typeof pligtRet !== 'undefined') { pligtRet = false; if (typeof pligtDag !== 'undefined') pligtDag = null; }   // rette-tilstand slutter, når man går fra Pligter
  if (!underMere(navn)) tilbageTil = null;
  else if (fra && fra !== navn && !underMere(fra)) tilbageTil = fra === 'mere' ? null : fra;
  aktivFane = navn;
  document.querySelectorAll('.fane').forEach(s => (s.hidden = s.id !== navn));
  // Toppen viser sidens navn (2026-10-20d) – sidens egen overskrift skjules med CSS (.fane > .sek-hoved > h2:first-child)
  const sideH2 = document.querySelector('#' + navn + ' > .sek-hoved > h2');
  const sideNavn = navn === 'idag' ? 'I dag' : sideH2?.textContent.trim() || FANE_NAVN[navn] || 'Familietavlen';
  document.getElementById('side-titel').textContent = sideNavn;
  document.title = sideNavn + ' · Familietavlen';
  const iMenu = underMere(navn) ? 'mere' : navn;
  if (navn === 'pligter' && typeof tegnPligter === 'function') tegnPligter();
  if (navn === 'kalender' && fra !== 'kalender' && kalVisning === 'liste' && (kalListeStart || kalListeAntal !== 21)) { kalListeStart = 0; kalListeAntal = 21; tegnKalender(); }   // listen starter i dag
  document.querySelectorAll('[data-fane]').forEach(b => b.setAttribute('aria-selected', b.dataset.fane === iMenu));
  lokal.set('fane', navn);
  opdaterTilbage();
  if (navn === 'vejr' && typeof tegnVejr === 'function') tegnVejr();   // fra vejr.js
  if (typeof holdSkaermTaendt === 'function') holdSkaermTaendt(navn === 'indkob' && handler);   // handletilstand holder skærmen tændt (handel.js)
  if (navn === 'familie' && typeof tegnFamilie === 'function') tegnFamilie();
  if (typeof stopVaelg === 'function' && navn !== 'steder') stopVaelg();   // kort.js
  if (navn === 'steder' && typeof tegnSteder === 'function') tegnSteder();
  if (navn === 'mappe' && typeof tegnMappe === 'function') tegnMappe();   // mappe.js
  if (navn === 'budget' && typeof tegnBudget === 'function') tegnBudget();   // budget.js
  if (navn === 'dagbog' && typeof tegnDagbog === 'function') tegnDagbog();   // dagbog.js
  if (navn === 'opskrifter' && typeof tegnOpskrifter === 'function') tegnOpskrifter();   // opskrifter.js
  if (navn === 'aktivitet' && fra !== 'aktivitet' && typeof aktHent === 'function') aktHent(true);   // fra aktivitet.js – hentes frisk hver gang   // fra familie.js (træet skal måles, når siden er synlig)
}
function opdaterTilbage() {
  const pakAaben = aktivFane === 'pakkelister' && typeof pakValgt !== 'undefined' && pakValgt;
  document.querySelectorAll('.tilbage').forEach(b => {
    b.textContent = b.closest('.fane')?.id === 'pakkelister' && pakAaben ? '‹ Alle pakkelister' : '‹ ' + (tilbageTil ? FANE_NAVN[tilbageTil] : 'Mere');
  });
}
document.querySelectorAll('[data-fane]').forEach(b => b.addEventListener('click', () => { visFane(b.dataset.fane); window.scrollTo(0, 0); }));
document.querySelectorAll('[data-gaa]').forEach(b => b.addEventListener('click', () => {
  if (b.classList.contains('tilbage')) {
    // I en åben pakkeliste går "tilbage" til oversigten over pakkelister
    if (aktivFane === 'pakkelister' && typeof pakValgt !== 'undefined' && pakValgt) {
      pakValgt = ''; lokal.set('pak-valgt', ''); tegnPakkelister(); opdaterTilbage();
    } else visFane(tilbageTil || 'mere');
  } else visFane(b.dataset.gaa);
  window.scrollTo(0, 0);
}));

// ---------- "Tryk igen"-bekræftelse ----------
function bekraeft(knap, handling) {
  const tilbage = () => { knap.classList.remove('bekraeft'); if (knap._html != null) knap.innerHTML = knap._html; else knap.textContent = knap.dataset.tekst; };   // ikonet kommer med tilbage
  if (knap.classList.contains('bekraeft')) {
    clearTimeout(knap._timer);
    tilbage();
    handling();
    return;
  }
  if (knap.querySelector('svg')) knap._html = knap.innerHTML;
  knap.classList.add('bekraeft');
  knap.textContent = 'Tryk igen for at ' + (knap.dataset.handling || 'rydde');
  knap._timer = setTimeout(tilbage, 3000);
}

// ---------- Ark (bundpanel) ----------
const arkEl = document.getElementById('ark');
function aabnArk(titel, ...indhold) {
  if (typeof fortrydEl !== 'undefined' && fortrydEl) fortrydEl.hidden = true;
  document.getElementById('ark-titel').textContent = titel;
  document.getElementById('ark-indhold').replaceChildren(...indhold);
  arkEl.hidden = false;
  document.body.style.overflow = 'hidden';
}
function lukArk() {
  arkEl.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('ark-indhold').replaceChildren();
}
document.getElementById('ark-luk').addEventListener('click', lukArk);
arkEl.addEventListener('click', e => { if (e.target === arkEl) lukArk(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !arkEl.hidden) lukArk(); });

function felt(labelTekst, node) {
  const boks = el('div');
  const label = el('label', 'felt-label', labelTekst);
  if (node.id) label.htmlFor = node.id;
  boks.append(label, node);
  return boks;
}
function input(type, id, vaerdi, placeholder) {
  if (type === 'time') return tidFelt(id, vaerdi, placeholder);
  const i = el('input');
  i.type = type; i.id = id; i.value = vaerdi || ''; i.autocomplete = 'off';
  if (placeholder) i.placeholder = placeholder;
  return i;
}
// Klokkeslæt skrevet med tastaturet: "15", "1530", "15.30", "15:30", "15,30", "kl 9" → 'TT:MM' (ugyldigt → null)
function laesTid(t) {
  const s = (t || '').toLowerCase().replace(/^kl\.?\s*/, '').replace(/[:,]/g, '.').replace(/\s/g, '');
  if (!s) return '';
  let m = /^(\d{1,2})(?:\.(\d{1,2}))?$/.exec(s), h, mi;
  if (m) { h = +m[1]; mi = m[2] ? +(m[2].length === 1 ? m[2] + '0' : m[2]) : 0; }
  else if ((m = /^(\d{1,2})(\d{2})$/.exec(s))) { h = +m[1]; mi = +m[2]; }
  else return null;
  if (h > 23 || mi > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
// Tekstfelt til klokkeslæt i stedet for telefonens ur (Timmos ønske). .value giver altid 'TT:MM' eller '' –
// så resten af koden er uændret. .ugyldig() = der står noget, som ikke kan forstås.
const INPUT_VAERDI = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
function tidFelt(id, vaerdi, placeholder) {
  const i = el('input', 'tid-felt');
  i.type = 'text'; i.id = id; i.autocomplete = 'off'; i.inputMode = 'decimal'; i.maxLength = 8;
  i.placeholder = placeholder || 'fx 15.30';
  const raa = () => INPUT_VAERDI.get.call(i);
  Object.defineProperty(i, 'value', {
    configurable: true,
    get: () => laesTid(raa()) || '',
    set: v => INPUT_VAERDI.set.call(i, (v || '').replace(':', '.'))
  });
  i.ugyldig = () => laesTid(raa()) === null;
  i.value = vaerdi || '';
  i.addEventListener('blur', () => {
    const t = laesTid(raa());
    if (t) INPUT_VAERDI.set.call(i, t.replace(':', '.'));
    i.classList.toggle('ugyldig', t === null);
  });
  i.addEventListener('input', () => i.classList.remove('ugyldig'));
  return i;
}
// Knap. Gemmer handlingen noget (returnerer et løfte), er knappen låst til det er færdigt – så et dobbelttryk ikke gemmer to gange.
function knap(tekst, klasse, fn) {
  const k = el('button', klasse, tekst);
  k.type = 'button';
  let travl = false;
  k.addEventListener('click', async e => {
    if (travl) return;
    const r = fn(e);
    if (!r || typeof r.then !== 'function') return;
    travl = true; k.setAttribute('aria-busy', 'true');
    try { await r; } finally { travl = false; k.removeAttribute('aria-busy'); }
  });
  return k;
}
// Valg mellem chips (fx hvem eller butik)
function chipValg(muligheder, valgt, onValg, tekstFn = v => v, hold = null) {
  const seg = el('div', 'seg wrap');
  seg.setAttribute('role', 'radiogroup');
  const tegn = () => seg.replaceChildren(...muligheder.map(m => {
    const k = knap(tekstFn(m), null, () => { valgt = m; onValg(m); tegn(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', m === valgt);
    if (hold && m) langtTryk(k, () => hold(m));   // hold fingeren = fx omdøb/slet
    return k;
  }));
  tegn();
  seg.tegnIgen = tegn;
  return seg;
}

// Billeder gøres små, før de gemmes
function laesBillede(fil, maks = 900, kvalitet = 0.72) {
  return new Promise((ok, fejl) => {
    const url = URL.createObjectURL(fil);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, maks / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', kvalitet));
    };
    img.onerror = fejl;
    img.src = url;
  });
}

// ---------- Indkøb: butikker ----------
let butikFilter = '';
function tegnButikFilter(punkter) {
  const boks = document.getElementById('butik-filter');
  const butikker = [...new Set(punkter.filter(p => !p.klaret && p.butik).map(p => p.butik))].sort((a, b) => a.localeCompare(b, 'da'));
  if (butikFilter && !butikker.includes(butikFilter)) butikFilter = '';
  boks.hidden = !butikker.length;
  boks.replaceChildren(...['', ...butikker].map(b => {
    const k = knap(b || 'Alle butikker', null, () => { butikFilter = b; tegnListe('indkob'); });
    if (b && !erBarn()) langtTryk(k, () => butikValgHold(b));   // hold = omdøb/slet butikken
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', b === butikFilter);
    return k;
  }));
}

// ---------- Butikker: omdøb eller slet (hold fingeren på butikken under ⋯ på en vare) ----------
function butikValgHold(navn, efter) {
  const varer = Data.listNu('indkob').filter(x => x.butik === navn && !x.klaret).length;
  holdValg('Butik: ' + navn, {
    foerst: [el('p', 'hint', varer ? navn + ' står på ' + varer + (varer === 1 ? ' vare' : ' varer') + ' på listen.' : 'Ingen varer på listen har ' + navn + '.')],
    retTekst: '✏️ Omdøb', ret: () => omdoebButik(navn, efter),
    slet: async () => { await skiftButik(navn, ''); visStatus(navn + ' er slettet' + (varer ? ' – varerne står uden butik' : '')); }
  });
}
function omdoebButik(navn, efter) {
  const inp = input('text', 'butik-nyt-navn', navn);
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Annullér', 'knap sekundaer', () => { lukArk(); efter?.(); }), knap('Gem', 'knap', async () => {
    const ny = inp.value.trim();
    if (ny && ny !== navn) { await skiftButik(navn, ny); visStatus(navn + ' hedder nu ' + ny); }
    lukArk(); tegnAlt(); efter?.();
  }));
  aabnArk('Omdøb butik', felt('Nyt navn', inp), el('p', 'hint', 'Varer, hurtigvalg og butikkens rækkefølge følger med.'), knapper);
  setTimeout(() => inp.focus(), 50);
}
// Butik → nyt navn (eller '' = slet): favoritter type butik, varer og hurtigvalg med butikken, og rækkefølgen i handletilstand
async function skiftButik(gammel, ny) {
  const favs = await Data.list('favoritter');
  const butikFavs = favs.filter(f => f.type === 'butik' && f.tekst.toLowerCase() === gammel.toLowerCase());
  const findesNy = ny && favs.some(f => f.type === 'butik' && f.tekst.toLowerCase() === ny.toLowerCase());
  for (const [i, f] of butikFavs.entries()) {
    if (!ny || findesNy || i > 0) await Data.remove('favoritter', f.id);
    else await Data.update('favoritter', f.id, { tekst: ny });
  }
  for (const f of favs.filter(f => f.type === 'indkob' && f.butik === gammel)) await Data.update('favoritter', f.id, { butik: ny || null });
  for (const v of (await Data.list('indkob')).filter(v => v.butik === gammel)) await Data.update('indkob', v.id, { butik: ny || null });
  if (typeof ordenRaekke === 'function') {   // handel.js
    const r = await ordenRaekke();
    if (r?.vaerdi && gammel in r.vaerdi) {
      const v = { ...r.vaerdi };
      if (ny && !(ny in v)) v[ny] = v[gammel];
      delete v[gammel];
      await Data.update('indstillinger', r.id, { vaerdi: v });
    }
  }
  if (butikFilter === gammel) butikFilter = ny || '';
  tegnAlt();
}

async function saetFavFelter(type, tekst, felter) {
  const f = (await Data.list('favoritter')).find(x => x.type === type && x.tekst.toLowerCase() === tekst.toLowerCase());
  if (f) await Data.update('favoritter', f.id, felter);
}

// To do: frist som tekst – "I dag", "I morgen", "Fre 9/10" eller "Over tid · 5/10"
function fristTekst(iso, klaret) {
  const idag = isoDato(new Date());
  const d = new Date(iso + 'T00:00');
  const dm = d.getDate() + '/' + (d.getMonth() + 1);
  if (!klaret && iso < idag) return { tekst: 'Over tid · ' + dm, klasse: 'over-tid' };
  if (iso === idag) return { tekst: 'I dag', klasse: 'frist-tag snart' };
  if (iso === plusDage(idag, 1)) return { tekst: 'I morgen', klasse: 'frist-tag' };
  return { tekst: DAGE[(d.getDay() + 6) % 7] + ' ' + dm, klasse: 'frist-tag' };
}
// Ret en to do: tekst, hvem, hvornår og prioritet
function redigerTodo(p) {
  const tekst = input('text', 'todo-tekst', p.tekst);
  let hvem = p.hvem || '';
  const hvemValg = chipValg(['', ...PERSONER.filter(x => x !== 'Fælles')], hvem, v => { hvem = v; }, v => v || 'Ingen bestemt');
  const frist = input('date', 'todo-frist', p.frist || '');
  const fristRaekke = el('div', 'frist-raekke');
  fristRaekke.append(frist, knap('I dag', 'lille-knap', () => { frist.value = isoDato(new Date()); }),
    knap('Ingen', 'lille-knap', () => { frist.value = ''; }));
  let prio = p.prio || 2;
  const prioValg = chipValg([1, 2, 3], prio, v => { prio = v; }, v => PRIO[v]);
  // Billede (fx af en seddel eller noget der skal ordnes) – vises som lille billede på opgaven
  let billede = p.billede || '';
  const billedBoks = el('div', 'billede-boks');
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*'; filInput.hidden = true;
  filInput.addEventListener('change', async () => { try { billede = await laesBillede(filInput.files[0]); tegnBillede(); } catch { visStatus('Billedet kunne ikke læses', true); } });
  const tegnBillede = () => {
    billedBoks.replaceChildren(filInput);
    if (billede) { const img = el('img'); img.src = billede; img.alt = ''; billedBoks.append(img, knap('Fjern billede', 'lille-knap', () => { billede = ''; tegnBillede(); })); }
    else billedBoks.append(knap('📷 Tag eller vælg billede', 'lille-knap', () => filInput.click()));
  };
  tegnBillede();
  // Vedhæftede filer (PDF, Word, Excel …) – ligger i Storage, kun links gemmes på opgaven
  const foer = (p.filer || []).map(f => f.sti);
  let filer = [...(p.filer || [])];
  rydIkkeGemteFiler();
  const filBoks = el('div', 'todo-filer');
  const andenInput = el('input'); andenInput.type = 'file'; andenInput.multiple = true; andenInput.hidden = true;
  andenInput.addEventListener('change', async () => {
    for (const fil of [...andenInput.files]) {
      if (fil.size > MAX_FIL) { visStatus(fil.name + ' er for stor (højst 20 MB)', true); continue; }
      visStatus('Lægger ' + fil.name + ' op …');
      try { const f = await lagFilOp(fil, 'alle'); delete f.type; filer.push(f); visStatus('📎 ' + fil.name + ' er vedhæftet'); }
      catch (e) { console.warn(e); visStatus(fil.name + ' kunne ikke lægges op', true); }
    }
    andenInput.value = ''; tegnFiler();
  });
  const tegnFiler = () => {
    filBoks.replaceChildren(andenInput);
    filer.forEach((f, i) => {
      const r = el('div', 'todo-fil');
      r.append(filLink(f), knap('✕', 'lille-knap', () => { filer.splice(i, 1); tegnFiler(); }));
      r.lastChild.setAttribute('aria-label', 'Fjern ' + f.navn);
      filBoks.append(r);
    });
    filBoks.append(knap('📎 Vedhæft fil', 'lille-knap', () => andenInput.click()));
  };
  tegnFiler();
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    await Data.update('todo', p.id, { tekst: t, hvem, frist: frist.value || null, prio, billede, filer });
    const nu = new Set(filer.map(f => f.sti));
    filerIkkeGemt = filerIkkeGemt.filter(x => !nu.has(x)); rydIkkeGemteFiler();
    const fjernet = foer.filter(x => !nu.has(x));
    if (fjernet.length) Data.sletFiler(fjernet);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('todo', p.id); lukArk(); tegnAlt(); }), gem);
  aabnArk('Ret opgave', felt('Opgave', tekst), felt('Hvem skal gøre det?', hvemValg), felt('Hvornår (valgfri)', fristRaekke),
    felt('Prioritet', prioValg), el('label', 'felt-label', 'Billede'), billedBoks, el('label', 'felt-label', 'Filer'), filBoks, el('p', 'hint', 'Opgaver med en dato står også i "Kalender i dag" på familiens overblik den dag.'), knapper);
}

async function redigerVare(p) {
  const navn = input('text', 'vare-navn', p.tekst);
  const butikker = (await Data.list('favoritter')).filter(f => f.type === 'butik')
    .sort((a, b) => (b.brugt || 0) - (a.brugt || 0) || a.tekst.localeCompare(b.tekst, 'da')).map(f => f.tekst)
    .filter((t, i, a) => a.findIndex(x => x.toLowerCase() === t.toLowerCase()) === i);   // ingen dubletter
  if (p.butik && !butikker.includes(p.butik)) butikker.push(p.butik);
  let butik = p.butik || '';
  const muligheder = ['', ...butikker];
  const lavButikValg = () => chipValg(muligheder, butik, b => { butik = b; gemSnart(); }, b => b || 'Ingen',
    b => butikValgHold(b, () => redigerVare(Data.listNu('indkob').find(x => x.id === p.id) || p)));   // hold = omdøb/slet butikken
  let butikValg = lavButikValg();

  // Ny butik: skriv navnet, så bliver den tilføjet og valgt
  const nyButik = input('text', 'ny-butik', '', 'Anden butik – skriv navnet');
  nyButik.enterKeyHint = 'done';
  const tilfoejButik = () => {
    const v = nyButik.value.trim();
    if (!v) return;
    if (!muligheder.includes(v)) muligheder.push(v);
    butik = v;
    nyButik.value = '';
    const ny = lavButikValg();
    butikValg.replaceWith(ny);
    butikValg = ny;
    gemSnart();
  };
  nyButik.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tilfoejButik(); } });
  nyButik.addEventListener('change', tilfoejButik);

  const tilbudLabel = el('label', 'check');
  const tilbud = el('input'); tilbud.type = 'checkbox'; tilbud.id = 'vare-tilbud'; tilbud.checked = !!p.tilbud;
  tilbudLabel.append(tilbud, 'På tilbud');
  const vigtigLabel = el('label', 'check');
  const vigtigTjek = el('input'); vigtigTjek.type = 'checkbox'; vigtigTjek.id = 'vare-vigtig'; vigtigTjek.checked = !!p.vigtig;
  vigtigLabel.append(vigtigTjek, el('span', 'tekst vigtig', 'Vigtig'), ' – skal købes');
  vigtigTjek.addEventListener('change', () => gemSnart());
  tilbud.addEventListener('change', () => gemSnart());

  const note = input('text', 'vare-note', p.note, 'Fx 2 for 30 kr. eller "den med blåt låg"');
  note.addEventListener('input', () => gemSnart(800));
  const antal = input('text', 'vare-antal', p.antal || '', 'Fx 2, 2 l eller 500 g');
  antal.maxLength = 12;
  antal.addEventListener('input', () => gemSnart(800));
  navn.addEventListener('input', () => gemSnart(800));

  let billede = p.billede || '';
  const gemtTekst = el('p', 'gemt-tekst');
  gemtTekst.setAttribute('role', 'status');
  const billedBoks = el('div', 'billede-boks');
  const tegnBillede = () => {
    billedBoks.replaceChildren();
    if (billede) {
      const img = el('img'); img.src = billede; img.alt = 'Billede af ' + p.tekst;
      billedBoks.append(img, knap('Fjern billede', 'lille-knap', () => { billede = ''; tegnBillede(); gemSnart(); }));
    }
    const fil = el('label', 'lille-knap fil-knap', billede ? 'Skift billede' : 'Tag eller vælg billede');
    const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*';
    filInput.addEventListener('change', async () => {
      if (!filInput.files[0]) return;
      gemtTekst.textContent = 'Henter billede…';
      try { billede = await laesBillede(filInput.files[0]); gemSnart(0); } catch { fejl.textContent = 'Billedet kunne ikke læses. Prøv et andet.'; fejl.hidden = false; }
      tegnBillede();
    });
    fil.append(filInput);
    billedBoks.append(fil);
  };
  tegnBillede();

  const fejl = el('p', 'fejl'); fejl.hidden = true;

  // Alt gemmes automatisk, så snart noget ændres
  let gemTimer, sidsteButik = p.butik || '';
  async function gemNu() {
    const tekst = navn.value.trim();
    if (!tekst) return;
    try {
      await Data.update('indkob', p.id, { tekst, antal: antal.value.trim(), butik, tilbud: tilbud.checked, vigtig: vigtigTjek.checked, note: note.value.trim(), billede });
      fejl.hidden = true;
      gemtTekst.textContent = 'Gemt';
      if (butik && butik !== sidsteButik) await gemFavorit('butik', butik);
      sidsteButik = butik;
      await saetFavFelter('indkob', tekst, { butik });
      tegnAlt();
    } catch {
      gemtTekst.textContent = '';
      fejl.textContent = 'Kunne ikke gemme. Tjek forbindelsen og prøv igen.';
      fejl.hidden = false;
    }
  }
  function gemSnart(ms = 250) {
    gemtTekst.textContent = 'Gemmer…';
    clearTimeout(gemTimer);
    gemTimer = setTimeout(gemNu, ms);
  }

  const slet = knap('Slet', 'knap fare', async () => { clearTimeout(gemTimer); await Data.remove('indkob', p.id); lukArk(); tegnAlt(); });
  const faerdig = knap('Færdig', 'knap', () => lukArk());
  const knapper = el('div', 'ark-knapper'); knapper.append(slet, faerdig);

  // Kategori (bestemmer hvor varen står i handletilstand) – huskes til næste gang
  const fav = await Data.list('favoritter');
  const katValg = chipValg(KATEGORIER.map(k => k[0]), varensKategori(p, fav), async k => { await saetKategori(p, k); tegnAlt(); },
    k => KAT[k].ikon + ' ' + KAT[k].navn);
  aabnArk('Vare', felt('Vare', navn), felt('Antal', antal), felt('Butik', butikValg), nyButik, vigtigLabel, tilbudLabel,
    felt('Note', note), felt('Billede', billedBoks), felt('Kategori (i handletilstand)', katValg), fejl, gemtTekst, knapper);
}

// ---------- Indkøb og to do ----------
async function tegnListe(navn) {
  const ul = document.querySelector(`ul[data-liste="${navn}"]`);
  const punkter = await Data.list(navn);
  punkter.sort((a, b) => Number(a.klaret) - Number(b.klaret) || Number(!!b.vigtig) - Number(!!a.vigtig) || (a.prio || 0) - (b.prio || 0)
    || (a.frist || '9999').localeCompare(b.frist || '9999')
    || (a.butik || 'ø').localeCompare(b.butik || 'ø', 'da'));
  ul.replaceChildren();

  // Butiksfilter (kun indkøb): varer uden butik vises altid
  let viste = punkter;
  if (navn === 'indkob') {
    tegnButikFilter(punkter);
    if (butikFilter) viste = punkter.filter(p => !p.butik || p.butik === butikFilter);
  }

  if (navn === 'indkob' && typeof tegnHandleliste === 'function') tegnHandleliste(viste);   // fra handel.js
  if (!viste.length) ul.append(el('li', 'tom', TOM_TEKST[navn]));

  for (const p of viste) {
    const li = el('li', 'punkt' + (p.klaret ? ' faerdig' : '') + (p.prio ? ' p' + p.prio : ''));

    const knap = el('button', 'punkt-knap');
    knap.type = 'button';
    knap.setAttribute('aria-pressed', !!p.klaret);
    const tjek = el('span', 'tjek');
    tjek.innerHTML = IKON_TJEK;
    const tekstBoks = el('span', 'tekst-boks');
    const tekstEl = el('span', 'tekst' + (p.vigtig && !p.klaret ? ' vigtig' : ''));
    if (p.antal) tekstEl.append(antalTag(p.antal));
    tekstEl.append(p.tekst);
    tekstBoks.append(tekstEl);
    if (p.butik || p.tilbud || p.note || p.af || p.hvem || p.frist) {
      const tags = el('span', 'tags');
      if (p.hvem) tags.append(el('span', 'hvem-tag ' + (PK[p.hvem] || ''), p.hvem));
      if (p.frist) { const f = fristTekst(p.frist, p.klaret); tags.append(el('span', f.klasse, f.tekst)); }
      if (p.af) tags.append(el('span', 'hvem-tag ' + (PK[p.af] || ''), 'Ønsket af ' + p.af));
      if (p.tilbud) tags.append(el('span', 'tilbud-tag', 'Tilbud'));
      if (p.butik) tags.append(el('span', null, p.butik));
      if (p.note) tags.append(el('span', 'note-tag', p.note));
      tekstBoks.append(tags);
    }
    knap.append(tjek, tekstBoks);
    knap.addEventListener('click', async () => { await Data.update(navn, p.id, { klaret: !p.klaret }); tegnAlt(); });
    langtTryk(knap, () => punktValg(navn, p));   // hold fingeren på punktet = slet / ret
    li.append(knap);

    if (p.billede) {
      const thumb = el('button', 'thumb');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', 'Vis billede af ' + p.tekst);
      const img = el('img'); img.src = p.billede; img.alt = '';
      thumb.append(img);
      thumb.addEventListener('click', () => {
        const stort = el('img', 'stort-billede'); stort.src = p.billede; stort.alt = p.tekst;
        aabnArk(p.tekst, stort);
      });
      li.append(thumb);
    }

    if (p.filer?.length) {
      const fk = el('button', 'fil-taeller', '📎' + (p.filer.length > 1 ? p.filer.length : ''));
      fk.type = 'button';
      fk.setAttribute('aria-label', 'Vis filer for ' + p.tekst);
      fk.addEventListener('click', () => { const boks = el('div', 'todo-filer'); p.filer.forEach(f => boks.append(filLink(f))); aabnArk(p.tekst, boks); });
      li.append(fk);
    }

    {
      const mere = el('button', 'mere-knap');
      mere.type = 'button';
      mere.innerHTML = IKON_MERE;
      mere.setAttribute('aria-label', (navn === 'indkob' ? 'Butik, tilbud og billede for ' : 'Ret, hvem og hvornår for ') + p.tekst);
      mere.addEventListener('click', () => (navn === 'indkob' ? redigerVare(p) : redigerTodo(p)));
      li.append(mere);
    }

    if (p.prio) {
      const prio = el('button', 'prio-knap');
      prio.type = 'button';
      prio.setAttribute('aria-label', 'Prioritet: ' + PRIO[p.prio] + '. Tryk for at skifte');
      prio.append(el('span', 'prik'), PRIO[p.prio]);
      prio.addEventListener('click', async () => { await Data.update(navn, p.id, { prio: (p.prio % 3) + 1 }); tegnAlt(); });
      li.append(prio);
    }

    const slet = el('button', 'slet');
    slet.type = 'button';
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + p.tekst);
    slet.addEventListener('click', async () => { await Data.remove(navn, p.id); tegnAlt(); });
    li.append(slet);
    ul.append(li);
  }

  const aabne = punkter.filter(p => !p.klaret);
  const badge = document.querySelector(`[data-badge="${navn}"]`);
  badge.textContent = aabne.length;
  badge.hidden = aabne.length === 0;
  // To do: rød, når noget SKAL være gjort i dag eller er over tid (frist) – blinker, når det er over tid
  const idagIso = isoDato(new Date());
  badge.classList.toggle('haster', navn === 'todo' ? aabne.some(p => p.frist && p.frist <= idagIso) : aabne.some(p => p.prio === 1));
  badge.classList.toggle('over-tid', navn === 'todo' && aabne.some(p => p.frist && p.frist < idagIso));
  if (navn === 'todo') badge.title = aabne.some(p => p.frist && p.frist <= idagIso) ? 'Noget skal være gjort i dag' : '';
  document.querySelector(`[data-taeller="${navn}"]`).textContent = aabne.length ? aabne.length + (navn === 'indkob' ? ' mangler' : ' åbne') : '';
  document.querySelector(`.ryd[data-liste="${navn}"]`).hidden = !punkter.some(p => p.klaret);
}

// Hold fingeren på et punkt (ca. ½ sekund) → slet eller ret. Det almindelige tryk (afkrydsning) sker så ikke.
// Valget åbnes først, når fingeren slippes – ellers rammer slip-trykket det nye vindue (fx ✕).
function langtTryk(elm, fn) {
  let timer = null, x = 0, y = 0, klar = false, slugKlik = false;
  const stop = () => { clearTimeout(timer); timer = null; };
  const aabn = () => {
    if (!klar) return;
    klar = false; slugKlik = true;
    elm.classList.remove('holdt');
    setTimeout(() => { fn(); setTimeout(() => { slugKlik = false; }, 400); }, 60);
  };
  elm.addEventListener('pointerdown', e => {
    x = e.clientX; y = e.clientY; stop(); klar = false;
    timer = setTimeout(() => { timer = null; klar = true; elm.classList.add('holdt'); if (navigator.vibrate) navigator.vibrate(15); }, 500);
  });
  elm.addEventListener('pointermove', e => { if (timer && Math.hypot(e.clientX - x, e.clientY - y) > 10) stop(); });
  elm.addEventListener('pointerup', () => { stop(); aabn(); });
  elm.addEventListener('pointercancel', () => { stop(); aabn(); });
  elm.addEventListener('pointerleave', () => { if (!klar) stop(); });
  elm.addEventListener('click', e => { if (slugKlik) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  elm.addEventListener('contextmenu', e => e.preventDefault());
}
// Lille vindue med store knapper efter et langt tryk: Slet, Ret og evt. flere
function holdValg(titel, { slet, ret, retTekst = '✏️ Ret', ekstra = [], foerst = [] }) {
  const boks = el('div', 'punkt-valg');
  boks.append(...foerst);
  if (slet) boks.append(knap('🗑 Slet', 'knap fare stor-slet', async () => { await slet(); lukArk(); tegnAlt(); }));
  if (ret) boks.append(knap(retTekst, 'knap sekundaer', () => { lukArk(); ret(); }));
  boks.append(...ekstra);
  aabnArk(titel, boks);
}
function punktValg(liste, p, ekstra = []) {
  // Børn må kun slette deres egne indkøbsønsker
  const maaSlette = !erBarn() || (liste === 'indkob' && p._af === Data.bruger()?.id);
  if (!maaSlette) return;
  // Indkøb: markér som vigtig (som med en overstregningstusch på en papirseddel)
  const foerst = liste === 'indkob' && !erBarn() && !p.klaret
    ? [antalValg(p), knap(p.vigtig ? '✖ Fjern markering' : '🖍️ Markér som vigtig', 'knap marker-knap', async () => { await Data.update('indkob', p.id, { vigtig: !p.vigtig }); lukArk(); tegnAlt(); })]
    : [];
  holdValg(p.tekst, {
    foerst,
    slet: () => Data.remove(liste, p.id),
    ret: erBarn() ? null : () => (liste === 'indkob' ? redigerVare(p) : redigerTodo(p)),
    retTekst: liste === 'indkob' ? '✏️ Butik, note, tilbud, billede …' : '✏️ Ret opgave, billede, filer …',
    ekstra
  });
}

// ---------- Antal på indkøbslisten ----------
// Data: indkob.antal (tekst, fx "2", "2 l", "500 g"). Skrives forrest: "2 mælk", "2 l mælk", "500 g hakket oksekød".
// Lange ord først ("liter" før "l"), så "2 liter mælk" bliver antal "2 l" + Mælk (Winnie-testen 20/10: blev en ny vare)
const ANTAL_RE = /^(\d+(?:[.,]\d+)?\s*(?:liter|l|deciliter|dl|centiliter|cl|kilo(?:gram)?|kg|gram|g|stykker|styk|stk|x|pakker?|pk|poser?|ps|bakker?|dåser?|ds|bundter?|bdt|flasker?|fl)?\.?)\s+(\S.*)$/i;
const ENHED_KORT = { liter: 'l', deciliter: 'dl', centiliter: 'cl', kilo: 'kg', kilogram: 'kg', gram: 'g', stykker: 'stk', styk: 'stk' };
function delAntal(tekst) {
  const m = tekst.match(ANTAL_RE);
  if (!m) return { antal: '', tekst };
  const antal = m[1].replace(/\.$/, '').replace(/\s*x$/i, '').trim().replace(/[a-zæøå]+$/i, e => ENHED_KORT[e.toLowerCase()] || e);
  return { antal: antal.replace(/(\d)([a-zæøå])/i, '$1 $2'), tekst: m[2].trim() };
}
const antalTag = antal => el('span', 'antal-tag', antal);
// Vælg antal (fra "hold fingeren"-vinduet og fra Ret vare)
function antalValg(p, efter = () => { lukArk(); tegnAlt(); }) {
  const boks = el('div', 'antal-valg');
  const gem = async v => { await Data.update('indkob', p.id, { antal: v }); efter(); };
  const seg = el('div', 'seg wrap');
  seg.append(...['1', '2', '3', '4', '5', '6'].map(v => { const k = knap(v, null, () => gem(v)); k.setAttribute('aria-checked', p.antal === v); k.setAttribute('role', 'radio'); return k; }));
  if (p.antal) seg.append(knap('Intet', null, () => gem('')));
  const inp = input('text', 'antal-andet', ['1', '2', '3', '4', '5', '6'].includes(p.antal) ? '' : p.antal || '', 'Andet, fx 2 l eller 500 g');
  inp.maxLength = 12;
  const form = el('form', 'oenske-form');
  form.append(inp, el('button', 'knap', 'OK'));
  form.addEventListener('submit', e => { e.preventDefault(); gem(inp.value.trim()); });
  boks.append(el('label', 'felt-label', '🔢 Antal'), seg, form);
  return boks;
}

// Alle retter (morgen, frokost, aftensmad) + listerne over tilbehør/ekstra/fyld som tekst – til at sætte ind i en chat med Claude
async function kopierRetter() {
  await hentTilbehoer();   // retter.js
  const favs = (await Data.list('favoritter')).filter(f => ['ret', 'morgen', 'frokost'].includes(f.type))
    .sort((a, b) => a.type.localeCompare(b.type) || a.tekst.localeCompare(b.tekst, 'da'));
  const ren = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== false && !(Array.isArray(v) && !v.length)));
  const data = {
    lister: { tilbehoer: SIDER, ekstra: EKSTRA, fyld: FYLD },
    retter: favs.map(f => ren({ m: f.type, ogsaa: f.ogsaa, t: f.tekst, g: f.gruppe, side: f.side, sider: f.sider, ekstra: f.ekstra, fyld: f.fyld,
      var: (f.varianter || []).map(v => v.navn + (v.tekst ? '=' + v.tekst : '') + (v.slukket ? ' (slukket)' : '')), lide: f.kanLide, brugt: f.brugt, bv: f.boernevalg, ikkeAuto: f.ikkeAuto }))
  };
  const tekst = 'FAMILIETAVLEN-RETTER ' + new Date().toISOString().slice(0, 10) + ' (' + data.retter.length + ' retter)\n' + JSON.stringify(data);
  let ok = false;
  try { await navigator.clipboard.writeText(tekst); ok = true; } catch (e) { /* vis feltet i stedet */ }
  const felt = el('textarea', 'kopi-felt');
  felt.value = tekst; felt.readOnly = true; felt.rows = 8;
  felt.addEventListener('focus', () => felt.select());
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Kopiér igen', 'knap sekundaer', async () => { try { await navigator.clipboard.writeText(tekst); visStatus('Kopieret ✓'); } catch (e) { felt.focus(); felt.select(); } }), knap('Færdig', 'knap', lukArk));
  aabnArk('📋 Retterne', el('p', null, ok ? '✓ ' + data.retter.length + ' retter er kopieret. Sæt dem ind i chatten med Claude.' : 'Markér teksten og kopiér den – og sæt den ind i chatten med Claude.'), felt, knapper);
}

function omdoebFavorit(f) {
  const inp = input('text', 'fav-nyt-navn', f.tekst);
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Annullér', 'knap sekundaer', lukArk), knap('Gem', 'knap', async () => {
    const ny = inp.value.trim();
    if (ny && ny !== f.tekst) {
      const findes = Data.listNu('favoritter').find(x => x.type === f.type && x.id !== f.id && x.tekst.toLowerCase() === ny.toLowerCase());
      if (findes) { await Data.update('favoritter', findes.id, { brugt: (findes.brugt || 0) + (f.brugt || 0) }); await Data.remove('favoritter', f.id); }   // lægges sammen
      else await Data.update('favoritter', f.id, { tekst: ny });
    }
    lukArk(); tegnAlt();
  }));
  aabnArk('Omdøb forslag', felt('Navn', inp), el('p', 'hint', 'Findes navnet allerede, lægges de to forslag sammen.'), knapper);
  setTimeout(() => inp.focus(), 50);
}

// Prioritet til nye opgaver
let nyPrio = 2;
// "Senest" til nye opgaver: '' = ingen frist, ellers en dato. Nulstilles efter hver ny opgave.
let nyFrist = '';
function tegnNyFrist() {
  const boks = document.getElementById('ny-frist');
  if (!boks) return;
  const idag = isoDato(new Date()), dato = input('date', 'ny-frist-dato', '');
  // Ingen · I dag · I morgen · de næste ugedage (fx "Lør") · 📅 Dato – "senest lørdag" er ét tryk (Winnie-testen 20/10)
  const valg = [['', 'Ingen'], [idag, 'I dag'], [plusDage(idag, 1), 'I morgen'],
    ...[2, 3, 4, 5, 6].map(n => { const iso = plusDage(idag, n); return [iso, DAGE[(tilDag(iso).getDay() + 6) % 7]]; })];
  const egen = nyFrist && !valg.some(([v]) => v === nyFrist);
  const k = (v, tekst) => { const b = knap(tekst, null, () => { nyFrist = v; tegnNyFrist(); }); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(nyFrist === v)); return b; };
  const datoKnap = knap(egen ? '📅 ' + kortDag(nyFrist) : '📅 Dato', null, () => { try { dato.showPicker(); } catch (e) { dato.focus(); dato.click(); } });
  datoKnap.setAttribute('role', 'radio'); datoKnap.setAttribute('aria-checked', String(!!egen));
  dato.className = 'skjult-dato'; dato.min = idag; dato.setAttribute('aria-label', 'Vælg dato');
  dato.addEventListener('change', () => { if (dato.value) { nyFrist = dato.value; tegnNyFrist(); } });
  boks.replaceChildren(el('span', 'frist-label', 'Senest:'), ...valg.map(([v, t]) => k(v, t)), datoKnap, dato);
}
function tegnNyPrio() {
  document.querySelectorAll('#ny-prio [data-prio]').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.prio) === nyPrio));
}
document.querySelectorAll('#ny-prio [data-prio]').forEach(b => b.addEventListener('click', () => { nyPrio = Number(b.dataset.prio); tegnNyPrio(); }));

document.querySelectorAll('form.tilfoj[data-liste]').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const felt = form.querySelector('input');
    let tekst = felt.value.trim();
    // "!mælk" eller "mælk!" = vigtig (indkøb)
    const vigtig = form.dataset.liste === 'indkob' && /^!|!$/.test(tekst) && !erBarn();
    tekst = tekst.replace(/^!+\s*|\s*!+$/g, '').trim();
    if (!tekst) return;
    let antal = '';
    if (form.dataset.liste === 'indkob') ({ antal, tekst } = delAntal(tekst));   // "2 mælk" → antal 2
    if (!tekst) return;
    // Stort forbogstav – men en kendt stavemåde fra hurtigvalget vinder ("æg" → "Æg", "ipad" → "iPad" hvis det står sådan)
    const kendt = Data.listNu('favoritter').find(f => f.type === form.dataset.liste && lavt(f.tekst) === lavt(tekst));
    tekst = kendt ? kendt.tekst : tekst[0].toUpperCase() + tekst.slice(1);
    const felter = { tekst, klaret: false, ...(vigtig ? { vigtig: true } : {}), ...(antal ? { antal } : {}) };
    if (form.dataset.liste === 'todo') { felter.prio = nyPrio; if (nyFrist && !erBarn()) felter.frist = nyFrist; }
    const nyt = await tilfoejUdenDublet(form.dataset.liste, felter);
    if (form.dataset.liste === 'todo' && nyFrist) { nyFrist = ''; tegnNyFrist(); }
    if (nyt) await gemFavorit(form.dataset.liste, tekst);
    felt.value = '';
    felt.focus();
    tegnAlt();
  });
  // Mens man skriver, viser hurtigvalget kun det der passer
  form.querySelector('input').addEventListener('input', () => tegnForslag(form.dataset.liste));
});

// Står det allerede på listen, tilføjes det ikke igen. Er det krydset af, kommer det bare tilbage på listen.
async function tilfoejUdenDublet(liste, felter) {
  const findes = (await Data.list(liste)).find(p => p.tekst.trim().toLowerCase() === felter.tekst.trim().toLowerCase());
  if (findes && !findes.klaret) {
    if (felter.antal && felter.antal !== findes.antal && !erBarn()) { await Data.update(liste, findes.id, { antal: felter.antal }); visStatus(findes.tekst + ': antal ' + felter.antal); return false; }
    visStatus(findes.tekst + ' står allerede på listen'); return false;
  }
  if (erBarn()) { await Data.add(liste, { ...felter, af: Data.bruger().navn }); return true; }   // børn: hvem ønskede det
  if (findes) { await Data.update(liste, findes.id, { klaret: false, antal: felter.antal || '', ...(felter.note ? { note: felter.note } : {}), ...(felter.butik ? { butik: felter.butik } : {}), ...(felter.prio ? { prio: felter.prio } : {}), ...(felter.frist ? { frist: felter.frist } : {}), ...(felter.vigtig ? { vigtig: true } : {}) }); return true; }
  await Data.add(liste, felter);
  return true;
}

// ---------- Hurtigvalg: alt der er skrevet før, kan vælges igen ----------
// Data: 'favoritter' {type: 'indkob' | 'todo' | 'ret', tekst, brugt}
const FavTilstand = {
  indkob: { alle: false, ret: false }, todo: { alle: false, ret: false },
  ret: { alle: true, ret: false }, morgen: { alle: true, ret: false }, frokost: { alle: true, ret: false }
};
// Måltidslister: samme navn bruges som type i 'favoritter' og som felt i 'madplan'
const MAALTIDER = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
const DATALISTE = { ret: 'retter-forslag', morgen: 'morgen-forslag', frokost: 'frokost-forslag' };
let listeType = 'ret';   // hvilken måltidsliste der vises under "Vores lister"

function tegnListeValg() {
  const seg = document.getElementById('liste-valg');
  seg.replaceChildren(...Object.entries(MAALTIDER).map(([type, navn]) => {
    const k = knap(navn, null, () => {
      listeType = type;
      FavTilstand[type].ret = false;
      document.getElementById('ny-ret').placeholder = 'Tilføj til ' + navn.toLowerCase();
      tegnListeValg();
      tegnForslag(type);
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', type === listeType);
    return k;
  }));
}
const VIS_FAERRE = 10;

// Hvem kan lide hvad: favoritter får {kanLide: [navne]}.
// "Alle" = dem der har markeret mindst én ret på listen – så tæller man ikke med, før man er gået i gang.
const Lide = { person: null, kunAlle: false };
const kanLide = f => Array.isArray(f.kanLide) ? f.kanLide : [];
function lideAktive(favs) {
  const s = new Set();
  favs.forEach(f => kanLide(f).forEach(n => s.add(n)));
  return PERSONER.filter(p => s.has(p));
}
function alleKanLide(favs) {
  const aktive = lideAktive(favs);
  if (!aktive.length) return [];
  return favs.filter(f => aktive.every(n => kanLide(f).includes(n)));
}
function tegnLideValg() {
  const boks = document.getElementById('lide-valg');
  const mig = Data.bruger()?.navn;
  const voksen = Data.bruger()?.rolle === 'voksen';
  const folk = voksen ? ['Oliver', 'Villads', 'Timmo', 'Winnie'].filter(p => PERSONER.includes(p)) : [mig];
  if (Lide.person && !folk.includes(Lide.person)) Lide.person = null;
  const seg = el('div', 'seg wrap');
  seg.setAttribute('role', 'radiogroup');
  for (const p of folk) {
    const k = knap(p, PK[p] || null, () => {
      FavTilstand[listeType].ret = false;   // vælger man en person, er man ikke længere i "fjern"-tilstand
      Lide.person = Lide.person === p ? null : p;
      tegnLideValg(); tegnForslag(listeType);
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', Lide.person === p);
    seg.append(k);
  }
  const hint = Lide.person
    ? 'Tryk på det, ' + (Lide.person === mig ? 'du' : Lide.person) + ' kan lide. Tryk på navnet igen, når du er færdig.'
    : 'Vælg en person og markér det, de kan lide. Terningen vælger så det, flest kan lide, først.';
  boks.replaceChildren(el('div', 'lide-titel', 'Hvem kan lide hvad?'), seg, el('p', 'hint', hint));
}

async function gemFavorit(type, tekst) {
  if (erBarn()) return;   // børn tæller ikke hurtigvalg op
  const favs = await Data.list('favoritter');
  // En variant ("Burger med flæskesteg") tæller på selve retten; morgenmad som aftensmad bliver ikke en ny aftensret
  const fund = type in MAALTIDER ? findRet(favs, type, tekst) : null;
  const f = fund ? fund.fav : favs.find(x => x.type === type && x.tekst.toLowerCase() === tekst.toLowerCase());
  if (f) await Data.update('favoritter', f.id, { brugt: (f.brugt || 0) + 1 });
  else await Data.add('favoritter', { type, tekst, brugt: 1 });
}

const AabneGrupper = new Set();   // hvilke kategorier i "Vores lister" der er foldet ud
async function tegnForslag(type) {
  if (type in MAALTIDER) await hentTilbehoer();   // retter.js
  const erMaaltid = type in MAALTIDER;
  const boks = erMaaltid ? document.getElementById('maaltid-forslag') : document.querySelector(`[data-forslag="${type}"]`);
  const st = FavTilstand[type];
  let favs = (await Data.list('favoritter')).filter(f => type in MAALTIDER ? passerTil(f, type) : f.type === type);   // retter.js: en ret kan passe til flere måltider
  let filter = '';

  if (erMaaltid) {
    const alleFavs = await Data.list('favoritter');
    document.getElementById(DATALISTE[type]).replaceChildren(...forslagTekster(alleFavs, type).map(t => { const o = el('option'); o.value = t; return o; }));   // retter.js
    if (type !== listeType) return;
    document.getElementById('antal-retter').textContent = '(' + favs.length + ')';
    favs.sort((a, b) => a.tekst.localeCompare(b.tekst, 'da'));
    const faelles = alleKanLide(favs);
    if (st.ret) Lide.person = null;
    if (Lide.person) Lide.kunAlle = false;
    if (!faelles.length) Lide.kunAlle = false;
    // Markér-tilstand: tryk for at slå hjerte til/fra for den valgte person
    if (Lide.person && !st.ret) {
      const p = Lide.person;
      boks.classList.remove('ret-tilstand');
      boks.replaceChildren(...favs.map(f => {
        const liker = kanLide(f).includes(p);
        const k = el('button', 'lide-knap ' + PK[p] + (liker ? ' liker' : ''));
        k.type = 'button';
        k.append(el('span', 'hjerte', liker ? '♥' : '♡'), f.tekst);
        k.setAttribute('aria-pressed', liker);
        k.addEventListener('click', async () => {
          const ny = liker ? kanLide(f).filter(n => n !== p) : [...kanLide(f), p];
          await Data.update('favoritter', f.id, { kanLide: ny });
          tegnForslag(type);
        });
        return k;
      }));
      return;
    }
    if (Lide.kunAlle && !st.ret) favs = faelles;
    // I "fjern"-tilstand skjules "Hvem kan lide hvad?", så man ikke tror, man markerer hjerter
    if (st.ret) document.getElementById('lide-valg').replaceChildren(
      el('p', 'ret-hint', 'Tryk ✕ for at fjerne en ret fra listen (kan fortrydes). Tryk "Færdig", når du er færdig.'));
    else tegnLideValg();
    if (faelles.length && !st.ret) {
      const fk = knap((Lide.kunAlle ? '♥ Viser kun dem alle kan lide' : '♥ Kun dem alle kan lide') + ' (' + faelles.length + ')',
        'lille-knap alle-kan-lide', () => { Lide.kunAlle = !Lide.kunAlle; tegnForslag(type); });
      fk.setAttribute('aria-pressed', Lide.kunAlle);
      document.getElementById('lide-valg').append(fk);
    }
  } else {
    filter = document.getElementById('ny-' + type).value.trim().toLowerCase();
    const paaListen = new Set((await Data.list(type)).filter(p => !p.klaret).map(p => p.tekst.toLowerCase()));
    favs = favs.filter(f => !paaListen.has(f.tekst.toLowerCase()));
    if (filter) favs = favs.filter(f => f.tekst.toLowerCase().includes(filter));
    favs.sort((a, b) => (b.brugt || 0) - (a.brugt || 0) || a.tekst.localeCompare(b.tekst, 'da'));
  }

  const max = st.alle || st.ret || filter ? favs.length : VIS_FAERRE;
  boks.classList.toggle('ret-tilstand', st.ret);
  boks.replaceChildren();

  // Aftensretter i kategorier, der kan foldes ud (så listen ikke er 100 retter lang)
  let sidsteGruppe = null, maal = boks;
  const grupper = erMaaltid && type === 'ret' && !st.ret;
  if (grupper) {
    const orden = Object.fromEntries(RET_GRUPPER.map((g, i) => [g[0], i]));
    favs.sort((a, b) => (orden[a.gruppe] ?? 99) - (orden[b.gruppe] ?? 99) || a.tekst.localeCompare(b.tekst, 'da'));
  }
  const antalIGruppe = g => favs.filter(f => (f.gruppe || '') === g).length;
  if (erMaaltid && !grupper && !st.ret) { maal = el('div', 'ret-gruppe-indhold ret-flad'); boks.append(maal); }   // morgen/frokost: samme rækker, uden kategorier
  for (const f of favs.slice(0, max)) {
    if (erMaaltid && !st.ret) {
      if (grupper && (f.gruppe || '') !== sidsteGruppe) {
        const g = sidsteGruppe = f.gruppe || '';
        const d = el('details', 'ret-gruppe-boks');
        d.open = Lide.kunAlle || AabneGrupper.has(g);
        d.addEventListener('toggle', () => { if (d.open) AabneGrupper.add(g); else AabneGrupper.delete(g); });
        const sum = el('summary', 'ret-gruppe', GRUPPE_NAVN[g] || '📋 Andre retter');
        sum.append(el('span', 'ret-gruppe-antal', ' ' + antalIGruppe(g)));
        maal = el('div', 'ret-gruppe-indhold');
        d.append(sum, maal);
        boks.append(d);
      }
      const voksenRet = !erBarn();
      const tag = voksenRet ? knap('', 'tag ret-tag', () => redigerRet(f)) : el('span', 'tag');   // retter.js
      // Linje 1: retten + fyld/varianter. Linje 2 (lille): tilbehør · sovs · + ekstra – så det kan ombrydes på telefonen
      const vs = aktiveVarianter(f);
      const sd = passerSider(f), ek = passerEkstra(f), fy = passerFyld(f), sv = typeof passerSovse === 'function' ? passerSovse(f) : [];
      const linje1 = el('span', 'tag-navn');
      linje1.append(el('b', null, f.tekst));
      const fyldVar = [...vs.map(v => v.navn), ...fy];
      if (fyldVar.length) linje1.append(el('span', 'tag-fyld', ' · ' + fyldVar.join(' · ')));
      tag.append(linje1);
      const ogsaa = retMaaltider(f).filter(m => m !== type).map(m => MAALTIDER[m].toLowerCase());
      const linje2 = [type === 'ret' ? sd.join(' / ') : '', type === 'ret' ? sv.join(' / ') : '', type === 'ret' && ek.length ? '+ ' + ek.join(', ') : '', ogsaa.length ? 'også ' + ogsaa.join(' og ') : ''].filter(Boolean).join(' · ');
      if (linje2) tag.append(el('span', 'tag-var', linje2));
      const hvem = PERSONER.filter(p => kanLide(f).includes(p));
      if (hvem.length) {
        const prikker = el('span', 'prikker');
        prikker.append(...hvem.map(p => { const s = el('span', 'prik ' + PK[p]); s.title = p; return s; }));
        prikker.setAttribute('aria-label', 'Kan lide: ' + hvem.join(', '));
        tag.append(prikker);
      }
      maal.append(tag);
      continue;
    }
    const k = el('button');
    k.type = 'button';
    k.append(el('span', 'plus', st.ret ? '✕' : '+'), f.tekst);
    k.setAttribute('aria-label', (st.ret ? 'Fjern ' : 'Tilføj ') + f.tekst);
    k.addEventListener('click', async () => {
      if (st.ret) {
        // Passer retten også til andre måltider, fjernes den kun fra denne liste
        const andre = erMaaltid ? retMaaltider(f).filter(m => m !== type) : [];
        if (andre.length) await Data.update('favoritter', f.id, { type: f.type === type ? andre[andre.length - 1] : f.type, ogsaa: andre.filter(m => m !== (f.type === type ? andre[andre.length - 1] : f.type)) });
        else await Data.remove('favoritter', f.id);
      } else {
        const felter = { tekst: f.tekst, klaret: false };
        if (type === 'todo') felter.prio = nyPrio;
        if (type === 'indkob' && f.butik) felter.butik = f.butik;
        if (await tilfoejUdenDublet(type, felter)) await gemFavorit(type, f.tekst);
        document.getElementById('ny-' + type).value = '';
      }
      tegnAlt();
    });
    if (!erBarn() && !st.ret) langtTryk(k, () => holdValg(f.tekst, {   // hold fingeren på et forslag = slet eller omdøb
      foerst: [el('p', 'hint', 'Forslaget forsvinder kun fra hurtigvalget – ikke fra listen.')],
      slet: async () => { for (const x of Data.listNu('favoritter').filter(x => x.type === f.type && x.tekst.toLowerCase() === f.tekst.toLowerCase())) await Data.remove('favoritter', x.id); },   // også evt. dubletter
      retTekst: '✏️ Omdøb', ret: () => omdoebFavorit(f)
    }));
    boks.append(k);
  }

  const styr = (tekst, fn) => { const k = el('button', 'styr', tekst); k.type = 'button'; k.addEventListener('click', fn); boks.append(k); };
  if (!filter && !st.ret && !erMaaltid && favs.length > VIS_FAERRE) {
    styr(st.alle ? 'Vis færre' : 'Vis alle (' + favs.length + ')', () => { st.alle = !st.alle; tegnForslag(type); });
  }
  if (!filter && favs.length && !erBarn()) {
    styr(st.ret ? 'Færdig' : erMaaltid ? 'Fjern fra listen' : 'Ret forslag', () => { st.ret = !st.ret; if (st.ret) Lide.person = null; tegnForslag(type); });
  }
  // Indkøb og To do: hurtigvalget er foldet sammen, så selve listen står lige under feltet (Winnie-testen 20/10).
  // Det folder sig selv ud, mens man skriver (så det virker som forslag), og kan åbnes med "＋ Hurtigvalg".
  if (!erMaaltid) {
    let fold = boks.previousElementSibling?.classList.contains('forslag-fold') ? boks.previousElementSibling : null;
    if (!fold) { fold = el('button', 'forslag-fold'); fold.type = 'button'; fold.addEventListener('click', () => { st.aaben = !st.aaben; tegnForslag(type); }); boks.before(fold); }
    const aaben = !!(st.aaben || st.ret || filter);
    boks.hidden = !aaben || (!favs.length && !st.ret);
    fold.hidden = !!filter || (!favs.length && !st.aaben);
    fold.textContent = st.aaben ? '− Skjul hurtigvalg' : '＋ Hurtigvalg (' + favs.length + ')';
    fold.setAttribute('aria-expanded', String(aaben));
  }
  if (erMaaltid && !st.ret && !erBarn()) {
    if (type === 'ret') {
      const { ligner, udenKategori } = rydOpForslag(await Data.list('favoritter'));   // retter.js
      const n = ligner.length + udenKategori.length;
      if (n) styr('🧹 Ryd op (' + n + ')', rydOp);
      if (typeof aabnAI === 'function') styr('✨ Ryd op med AI', () => aabnAI({ opgave: 'ryd_retter' }));
      styr('📋 Kopiér retterne', kopierRetter);   // til den store oprydning sammen med Claude   // ai.js – skriv evt. "kun kylling"
    }
    styr('✎ Fyld, tilbehør, sovs og ekstra', redigerTilbehoerLister);
  }
}

document.getElementById('ny-ret-form').addEventListener('submit', async e => {
  e.preventDefault();
  const felt = document.getElementById('ny-ret');
  const tekst = felt.value.trim();
  if (!tekst) return;
  await gemFavorit(listeType, tekst);
  felt.value = '';
  felt.focus();
  tegnForslag(listeType);
});

document.querySelectorAll('.ryd[data-liste]').forEach(knap => {
  knap.addEventListener('click', () => bekraeft(knap, async () => {
    const navn = knap.dataset.liste;
    await Data.removeMange(navn, (await Data.list(navn)).filter(p => p.klaret).map(p => p.id));
    tegnAlt();
  }));
});

// ---------- Madplan ----------
// Hver række hører til en uge: {uge: mandagens dato 'ÅÅÅÅ-MM-DD', dag: 0-6, ret, morgen, frokost}
let madUge = 0;   // 0 = denne uge, 1 = næste uge, -1 = sidste uge ...
function madMandag() {
  const m = mandagDenneUge();
  m.setDate(m.getDate() + madUge * 7);
  return m;
}
const madUgeIso = () => isoDato(madMandag());
// barn = null giver familiens madplan; barn = 'Oliver' giver kun Olivers egne valg
async function madplanForUge(ugeIso, barn = null) {
  return (await Data.list('madplan')).filter(r => r.uge === ugeIso && (r.barn || null) === barn);
}
// Drengenes faste morgenmad og frokost – samme hver uge, til den ændres
// Data: 'fastplan' {barn, dag 0-6, morgen, frokost}
const FRIDAG = 7;   // fastplan-rækken "Fridage": morgen/frokost på dage uden skole (ferie, helligdage, fast fridag)
const FAST_SKOLE = 8;   // fastplan-rækken "Skoledage" (2026-10-20i): standard morgen/frokost på skoledage – en ugedag med noget udfyldt går forud
async function fastFor(barn, dag) {
  return (await Data.list('fastplan')).find(r => r.barn === barn && r.dag === dag) || {};
}
// Familiens faste aftensmad: {0: 'Pizza', ...} – 'fastplan' med barn 'Fælles' og felt ret
async function fastAftensmad() {
  const res = {};
  for (const r of await Data.list('fastplan')) if (r.barn === 'Fælles' && r.ret) res[r.dag] = r.ret;
  return res;
}
async function gemFast(barn, dag, felt, vaerdi) {
  const fundet = (await Data.list('fastplan')).find(r => r.barn === barn && r.dag === dag);
  if (fundet) {
    const ny = { ...fundet, [felt]: vaerdi };
    if (!ny.morgen && !ny.frokost && !ny.ret) await Data.stille(() => Data.remove('fastplan', fundet.id));
    else await Data.update('fastplan', fundet.id, { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('fastplan', { barn, dag, [felt]: vaerdi });
  }
}

// Maden for en dato. Rækkefølge for et barn:
//   dagens eget valg (fra tavlen) → fast ugeplan (kun morgen/frokost) → familiens madplan
// Returnerer {morgen, frokost, ret, eget: {felt: true}, kilde: {felt: 'eget'|'fast'|'faelles'}, faelles, fast}
async function madFor(dato, barn = null) {
  await hentTilbehoer();   // retter.js
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const faelles = { ...((await madplanForUge(ugeIso)).find(r => r.dag === dag) || {}) };
  if (!faelles.ret) { const fa = (await fastAftensmad())[dag]; if (fa) faelles.ret = fa; }   // fast aftensmad
  let fast = barn ? await fastFor(barn, dag) : {};
  // 🏖 Fridag (ferie, helligdag, fast fridag, syg): rækken "Fridage" (dag 7) bruges i stedet for hverdagens faste plan –
  // så skolemadpakken ikke står på tavlen i ferien. I weekenden gælder lørdag/søndag først, ellers Fridage.
  if (barn && typeof skoleFriNu === 'function' && skoleFriNu(barn, isoDato(dato))) {
    const fri = await fastFor(barn, FRIDAG);
    fast = dag >= 5 ? { ...fri, ...Object.fromEntries(Object.entries(fast).filter(([, v]) => v)) }
      : { ...fast, ...Object.fromEntries(Object.entries(fri).filter(([k, v]) => v && (k === 'morgen' || k === 'frokost'))) };
  } else if (barn) {
    // Skoledag: standarden for skoledage, med det der står på netop den ugedag ovenpå
    const std = await fastFor(barn, FAST_SKOLE);
    fast = { ...Object.fromEntries(Object.entries(std).filter(([k, v]) => v && (k === 'morgen' || k === 'frokost'))), ...Object.fromEntries(Object.entries(fast).filter(([, v]) => v)) };
  }
  const res = { eget: {}, kilde: {}, faelles, fast, visning: {} };
  for (const f of ['morgen', 'frokost', 'ret']) {
    if (fast[f]) { res[f] = fast[f]; res.kilde[f] = 'fast'; }
    else if (faelles[f]) { res[f] = faelles[f]; res.kilde[f] = 'faelles'; }
  }
  if (barn) {
    const eget = (await madplanForUge(ugeIso, barn)).find(r => r.dag === dag) || {};
    for (const f of ['morgen', 'frokost', 'ret']) if (eget[f]) { res[f] = eget[f]; res.eget[f] = true; res.kilde[f] = 'eget'; }
    // Barnets egne valg/godkendte ønsker gælder (en voksens senere valg "erstatter" dem)
    const o = await madOensker(barn, isoDato(dato));
    res.oenske = {}; res.venter = {};
    for (const f of ['morgen', 'frokost', 'ret']) {
      const g = o.gaelder[f], v = o.venter[f];
      if (g) { res[f] = g.ret; res.oenske[f] = true; res.kilde[f] = 'oenske'; }
      if (v) res.venter[f] = v.ret;
    }
  }
  // Det der vises: med tilbehør ("Kylling i karry med ris") – barnets eget valg eller rettens standard (retter.js)
  const favs = await Data.list('favoritter');
  for (const f of ['morgen', 'frokost', 'ret']) if (res[f]) res.visning[f] = retVisning(favs, f, res[f]);
  return res;
}

// Hele teksten kan ses: når feltet ikke er i brug, vises teksten ombrudt ovenpå (ikke "Frikadeller med pomme")
// visning(tekst) kan give den fulde tekst med tilbehør ("Kylling i karry med ris") – tilføjelsen vises nedtonet
function fuldTekst(inp, visning) {
  const boks = el('span', 'fuld-felt');
  const vis = el('span', 'fuld-vis');
  vis.setAttribute('aria-hidden', 'true');
  const opdater = () => {
    const v = inp.value, hel = visning ? visning(v) : v;
    const forlaenget = v && hel.length > v.length && hel.toLowerCase().startsWith(v.toLowerCase());
    // "Burger med oksebøf og bacon" vises som "Burger med oksebøf, bacon og pommes" (samme ret, pænere sat op)
    const indre = el('span', null, forlaenget || !hel ? v : hel);
    if (forlaenget) indre.append(el('span', 'fuld-ekstra', hel.slice(v.length)));
    vis.replaceChildren(indre);
    boks.classList.toggle('har-tekst', !!v);
  };
  inp.addEventListener('input', opdater);
  opdater();
  boks.append(inp, vis);
  return boks;
}

// Skriver man i et felt (madplan, faste måltider, skema), må det ikke tegnes forfra under én – det tog fokus,
// lukkede tastaturet og fik siden til at hoppe (fx når en ændring kom ind fra en anden telefon).
// Gentegningen venter så, til man forlader feltgruppen. Svarer true, når den venter.
const udsatte = new WeakSet();
function venterPaaSkriv(boks, tegn) {
  const aktiv = document.activeElement;
  if (!boks || !aktiv || !boks.contains(aktiv) || !aktiv.matches('input, textarea') || aktiv.readOnly) return false;
  if (!udsatte.has(boks)) {
    udsatte.add(boks);
    const ud = e => {
      if (boks.contains(e.relatedTarget)) return;   // videre til et andet felt i samme gruppe – vent stadig
      boks.removeEventListener('focusout', ud); udsatte.delete(boks);
      setTimeout(tegn, 0);
    };
    boks.addEventListener('focusout', ud);
  }
  return true;
}
async function tegnMadplan() {
  await hentTilbehoer();   // retter.js
  const ol = document.getElementById('mad-uge');
  const mandag = madMandag();
  const retter = await madplanForUge(isoDato(mandag));
  const faste = await fastAftensmad();
  const egne = (await Data.list('madplan')).filter(r => r.uge === isoDato(mandag) && r.barn);
  const alleFavs = await Data.list('favoritter');
  const voksen = !erBarn();
  const aftaler = voksen ? [...await Data.list('kalender'), ...await Data.list('kalender_voksne')] : [];
  const idag = madUge === 0 ? idagNr() : madUge > 0 ? -1 : 7;   // markér dage der er gået
  const son = new Date(mandag); son.setDate(mandag.getDate() + 6);
  const navn = madUge === 0 ? 'Denne uge' : madUge === 1 ? 'Næste uge' : madUge === -1 ? 'Sidste uge' : null;
  document.getElementById('mad-titel').textContent = 'Uge ' + ugenummer(mandag) + (navn ? ' · ' + navn : '');
  document.getElementById('ugenr').textContent = ugeSpan(mandag);
  document.getElementById('mad-denne').hidden = madUge === 0;
  if (venterPaaSkriv(ol, tegnMadplan)) return;   // man skriver – vent
  ol.replaceChildren();

  DAGE.forEach((dag, i) => {
    const dato = new Date(mandag); dato.setDate(mandag.getDate() + i);
    const li = el('li', 'dag' + (i === idag ? ' idag' : i < idag ? ' forbi' : '') + (nyeDage.has(i) ? ' ny' : ''));
    const label = el('label', null, dag);
    label.htmlFor = 'dag-' + i;
    label.append(el('small', null, dato.getDate() + '/' + (dato.getMonth() + 1)));

    const felt = el('input');
    felt.type = 'text';
    felt.id = 'dag-' + i;
    felt.placeholder = i === idag ? 'Hvad skal vi have i dag?' : 'Skriv en ret';
    felt.autocomplete = 'off';
    felt.enterKeyHint = 'done';
    felt.setAttribute('list', 'retter-forslag');
    const raekke = retter.find(r => r.dag === i);
    if (madSkjultForBarn(isoDato(dato))) {   // børn ser ikke maden for dage længere fremme
      felt.value = ''; felt.placeholder = MAD_SKJULT; felt.readOnly = true;
      li.classList.add('mad-skjult');
      li.append(label, felt);
      ol.append(li);
      return;
    }
    const egen = raekke?.ret || '';
    const ude = !!(raekke?.ude && egen);   // 🎉 "Vi er ude" – kun tekst på dagen, aldrig en ret på listerne
    const rester = ude && !!raekke?.rester;   // ♻️ Rester – også kun tekst på dagen (gemmes som ude + rester)
    const fast = faste[i] || '';
    felt.value = egen || fast;
    if (fast && !egen) li.classList.add('fra-fast');
    if (ude) li.classList.add(rester ? 'rester' : 'ude');
    felt.readOnly = erBarn() || ude;
    if (ude && voksen) felt.addEventListener('click', () => rester ? resterArk(i, dato, egen) : udeArk(i, dato, egen));
    felt.addEventListener('change', async () => {
      const ret = felt.value.trim();
      if (fast && !egen && ret === fast) return;
      if (ER_RESTER.test(ret)) { felt.value = egen || fast; felt.dispatchEvent(new Event('input')); resterArk(i, dato, '', /i\s*går/i.test(ret)); return; }   // "rester (fra i går)" → vælg hvilken ret
      await gemRet(i, ret === fast ? '' : ret);
      if (ret) { await gemFavorit('ret', ret); tegnForslag('ret'); }
      tegnMadplan();
    });
    felt.addEventListener('keydown', e => { if (e.key === 'Enter') felt.blur(); });

    const terning = el('button', 'terning');
    terning.type = 'button';
    terning.setAttribute('aria-label', 'Ny ret til ' + DAGE_LANG[i]);
    terning.innerHTML = IKON_TERNING;
    terning.addEventListener('click', () => medUgeFortryd('Ny ret ' + DAGE_LANG[i].toLowerCase(), () => rulDage([i])));

    // ⋯ = dagens valg: 🎉 Vi er ude, 📌 fast hver uge, ⇅ flyt/byt, ryd. Er dagen fast, står der 📌 (børn ser kun 📌)
    const gentag = knap('', 'gentag-knap dag-menu' + (fast ? ' aktiv' : ''), () => dagMenu(i, dato, { egen, fast, ude, rester, vist: felt.value.trim(), retter, faste }));
    if (fast) gentag.textContent = '📌'; else gentag.innerHTML = IKON_MERE;
    gentag.setAttribute('aria-label', (fast ? 'Fast hver ' + DAGE_LANG[i].toLowerCase() + '. ' : '') + 'Valg for ' + DAGE_LANG[i].toLowerCase());

    li.append(label, fuldTekst(felt, t => retVisning(alleFavs, 'ret', t)), gentag, terning);   // retter.js
    // Varianter af dagens ret (fx burger: flæskesteg · kyllingebøf …) – tryk for at vælge
    if (!erBarn() && felt.value && !ude) {
      const vc = retChips(alleFavs, 'ret', felt.value, async t => {   // retter.js
        if (fast && !egen && t === fast) return;
        await gemRet(i, t === fast ? '' : t);
        tegnMadplan();
      });
      if (vc) li.append(vc);
    }

    // Står der noget for familien i kalenderen den aften? → "Spiser I ude?" (ét tryk)
    if (voksen && !ude && i >= Math.max(idag, 0) && idag < 7) {
      const iso = isoDato(dato);
      const a = udeAftale(aftaler, iso);
      if (a) {
        const forslag = el('div', 'ude-forslag');
        forslag.append(el('span', null, '📅 ' + a.titel + (a.tid ? ' ' + (a.ca ? 'ca. ' : '') + visTider(a.tid) : '') + ' – ude?'),
          knap('🎉 Ja', 'lille-knap', async () => { await gemDag(i, '🎉 ' + a.titel, true); tegnMadplan(); }),
          knap('✕', 'lille-knap ude-nej', () => { lokal.set('ude-nej', JSON.stringify([...udeNej(), iso + '|' + a.titel].slice(-40))); tegnMadplan(); }));
        forslag.lastChild.setAttribute('aria-label', 'Nej, vi spiser hjemme');
        li.append(forslag);
      }
    }

    // Drengenes egne valg denne dag
    const dagensEgne = egne.filter(r => r.dag === i);
    if (dagensEgne.length) {
      const KORT = { morgen: 'morgen', frokost: 'frokost', ret: 'aften' };
      const tekst = dagensEgne.map(r => r.barn + ': ' +
        ['morgen', 'frokost', 'ret'].filter(f => r[f]).map(f => KORT[f] + ' ' + r[f]).join(', ')).join(' · ');
      li.append(el('div', 'barn-mad', tekst));
    }
    ol.append(li);
  });
  nyeDage = new Set();
  // 🛒 Ekstra/tilbehør fra ugens aftensmad → indkøbslisten (voksne)
  const indk = document.getElementById('mad-indkob');
  const ugensRetter = DAGE.map((_, i) => { const r = retter.find(x => x.dag === i); return r?.ude ? '' : r?.ret || faste[i] || ''; }).filter(Boolean);
  const ting = erBarn() ? [] : ugensTilbehoer(alleFavs, ugensRetter);   // retter.js
  indk.replaceChildren();
  if (ting.length) {
    const ekstra = ting.filter(x => x.ekstra).map(x => x.tekst);
    indk.append(knap('🛒 ' + (ekstra.length ? 'Ekstra til ugen: ' + ekstra.join(', ') : 'Tilbehør til ugen') + ' – læg på indkøbslisten', 'lille-knap mad-indkob-knap', () => tilIndkoeb(ugensRetter)));
  }
}

// Gemmer ét måltid (ret = aftensmad, morgen, frokost) for en ugedag
async function gemMad(dag, felt, vaerdi, uge = madUgeIso(), barn = null) {
  const fundet = (await madplanForUge(uge, barn)).find(r => r.dag === dag);
  if (fundet) {
    const ny = { ...fundet, [felt]: vaerdi };
    if (!ny.ret && !ny.morgen && !ny.frokost) await Data.stille(() => Data.remove('madplan', fundet.id));
    else await Data.update('madplan', fundet.id, felt === 'ret' && fundet.ude ? { ret: vaerdi, ude: null, rester: null } : { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('madplan', barn ? { uge, dag, barn, [felt]: vaerdi } : { uge, dag, [felt]: vaerdi });
  }
  tegnOverblik();
}
const gemRet = (dag, ret) => gemMad(dag, 'ret', ret);
// Aftensmad + "ude"-mærke på én dag (bruges af 🎉 Vi er ude og ⇅ Flyt/byt)
// rester = ♻️ Rester (gemmes som ude: true + rester: true, så alt der springer 🎉-dage over, også springer rester over)
async function gemDag(dag, ret, ude = false, uge = madUgeIso(), rester = false) {
  const fundet = (await madplanForUge(uge)).find(r => r.dag === dag);
  if (fundet) {
    if (!ret && !fundet.morgen && !fundet.frokost) await Data.stille(() => Data.remove('madplan', fundet.id));
    else await Data.update('madplan', fundet.id, { ret, ude: ude || null, rester: (ude && rester) || null });
  } else if (ret) await Data.add('madplan', ude ? { uge, dag, ret, ude: true, ...(rester ? { rester: true } : {}) } : { uge, dag, ret });
  tegnOverblik();
}

// Kalenderaftale for familien om aftenen → forslag om "Vi er ude" (ikke ferie/fravær, ikke ugentlige ting, ikke én persons aftaler)
// "Nej tak"-forslag huskes på enheden som JSON-liste (lokal gemmer kun tekst)
function udeNej() { try { const v = JSON.parse(lokal.get('ude-nej') || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function udeAftale(aftaler, iso) {
  const nej = new Set(udeNej());
  return aftalerDen(aftaler, iso).find(a => {
    if (a.fri || a.type || (a.tilDato && a.tilDato > a.dato) || ['uge', '2uger', 'maaned'].includes(a.gentag)) return false;
    const hvem = personerI(a);
    if (!hvem.includes('Fælles') && hvem.length < 2) return false;
    const m = /(\d{1,2})[.:](\d{2})/.exec(a.tid || '');
    if (m && (+m[1] < 15 || +m[1] * 60 + +m[2] >= 19 * 60)) return false;   // kun det der starter omkring aftensmaden (15.00–18.59) eller ingen tid
    return !nej.has(iso + '|' + a.titel);
  });
}

// ⋯ ved en dag på madplanen
function dagMenu(i, dato, { egen, fast, ude, rester, vist, retter, faste }) {
  if (erBarn()) return;
  const dagNavn = DAGE_LANG[i].toLowerCase();
  const titel = DAGE_LANG[i] + ' ' + dato.getDate() + '/' + (dato.getMonth() + 1) + (vist ? ' · ' + vist : '');
  const boks = el('div', 'punkt-valg dag-valg');
  boks.append(knap(ude && !rester ? '🎉 Ret "Vi er ude"' : '🎉 Vi er ude / spiser ikke hjemme', 'knap sekundaer', () => udeArk(i, dato, ude && !rester ? egen : '')));
  boks.append(knap(rester ? '♻️ Ret rester' : '♻️ Rester', 'knap sekundaer', () => resterArk(i, dato, rester ? egen : '')));
  if (!ude) boks.append(knap(fast ? '📌 Ikke fast hver ' + dagNavn + ' længere' : '📌 Fast hver ' + dagNavn, 'knap sekundaer', async () => {
    if (fast) {
      await gemFast('Fælles', i, 'ret', '');
      if (!egen) await gemRet(i, fast);   // retten bliver stående denne uge – den kommer bare ikke igen
      visStatus(fast + ' er ikke længere fast hver ' + dagNavn);
    } else {
      if (!vist) { lukArk(); visStatus('Skriv en ret først – så kan den gå igen hver ' + dagNavn); document.getElementById('dag-' + i)?.focus(); return; }
      await gemFast('Fælles', i, 'ret', vist);
      if (egen === vist) await gemRet(i, '');
      visStatus(vist + ' kommer nu igen hver ' + dagNavn);
    }
    lukArk(); tegnMadplan(); tegnOverblik();
  }));
  // ⇅ Flyt eller byt med en anden dag (tom dag = flyt)
  const aabne = aabneDage();
  if (vist && aabne.includes(i) && aabne.length > 1) {
    boks.append(el('p', 'seg-label', '⇅ Flyt til / byt med'));
    const seg = el('div', 'seg wrap byt-dage');
    for (const j of aabne) {
      if (j === i) continue;
      const r = retter.find(x => x.dag === j);
      const andenVist = r?.ret || faste[j] || '';
      const k = knap(DAGE[j] + (andenVist ? ' ⇄' : ''), null, async () => {
        const mig = { ret: vist, ude, rester };
        const den = { ret: andenVist, ude: !!(r?.ude && r?.ret), rester: !!(r?.ude && r?.ret && r?.rester) };
        // En fast ret skrives ikke som dagens egen (så står den bare som fast)
        await gemDag(j, mig.ret === faste[j] && !mig.ude ? '' : mig.ret, mig.ude, undefined, mig.rester);
        await gemDag(i, den.ret === faste[i] && !den.ude ? '' : den.ret, den.ude, undefined, den.rester);
        lukArk(); nyeDage.add(i); nyeDage.add(j); tegnMadplan();
        const blev = fast && !den.ret ? ' (' + fast + ' er fast om ' + dagNavn + 'en og står der stadig)' : '';
        visStatus((den.ret ? 'Byttede ' + DAGE_LANG[i].toLowerCase() + ' og ' + DAGE_LANG[j].toLowerCase() : 'Flyttede til ' + DAGE_LANG[j].toLowerCase()) + blev);
      });
      k.title = andenVist ? 'Byt med ' + andenVist : 'Flyt hertil';
      seg.append(k);
    }
    boks.append(seg);
  }
  if (egen) boks.append(knap('🧹 Ryd dagen', 'knap sekundaer', async () => { await gemDag(i, ''); lukArk(); tegnMadplan(); }));
  aabnArk(titel, boks);
}

// 🎉 Vi er ude: kort tekst på dagen (fx "Fødselsdag hos Lisbeth") – bliver aldrig en ret på listerne
// Valgfrit: hvad I skal spise derude – står så på tavlen: "🎉 Hos morfar · Frikadeller"
function udeArk(i, dato, nu) {
  const [nuTekst, nuMad = ''] = (nu || '').replace(/^🎉\s*/, '').split(' · ');
  const tekst = input('text', 'ude-tekst', nuTekst, 'Fx Fødselsdag hos Lisbeth');
  tekst.maxLength = 60;
  const mad = input('text', 'ude-mad', nuMad, 'Fx Frikadeller (valgfrit)');
  mad.maxLength = 60;
  mad.setAttribute('list', 'retter-forslag');
  const forslag = el('div', 'seg wrap');
  const iso = isoDato(dato);
  Promise.all([Data.list('kalender'), Data.list('kalender_voksne')]).then(([a, b]) => {
    const fra = aftalerDen([...a, ...b], iso).filter(x => !x.fri && !x.type).map(x => x.titel);
    for (const t of [...new Set([...fra, 'Spiser ude', 'Hver for sig', 'Ingen aftensmad'])]) forslag.append(knap(t, null, () => { tekst.value = t; }));
  });
  const knapper = el('div', 'ark-knapper');
  if (nu) knapper.append(knap('Vi spiser hjemme', 'knap sekundaer', async () => { await gemDag(i, ''); lukArk(); tegnMadplan(); }));
  knapper.append(knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    const m = mad.value.trim().replace(/ · /g, ', ');
    await gemDag(i, '🎉 ' + t.replace(/ · /g, ', ') + (m ? ' · ' + m : ''), true);
    lukArk(); tegnMadplan();
  }));
  aabnArk('🎉 Vi er ude · ' + DAGE_LANG[i].toLowerCase() + ' ' + dato.getDate() + '/' + (dato.getMonth() + 1), felt('Hvad skal I?', tekst), forslag, felt('Hvad skal I spise?', mad),
    el('p', 'hint', 'Står kun på dagen – kommer ikke på listen over retter eller i terningen.'), knapper);
  setTimeout(() => tekst.focus(), 50);
}

// ♻️ Rester: samme ret som en af de seneste dage – står kun på dagen ("♻️ Rester: Lasagne"), kommer aldrig på listen over retter,
// i terningen eller i "Ekstra til ugen". Skriver man "rester"/"rester fra i går" i dagens felt, åbner arket (i går er forvalgt).
const ER_RESTER = /^(♻️\s*)?rest(er|erne)?\b/i;
// De seneste 6 dages aftensmad før en dato (madplanens ret eller den faste; ikke 🎉/rester) – til "Rester af hvad?"
async function resterForslag(dato) {
  const faste = await fastAftensmad();
  const dage = [];
  for (let n = 1; n <= 6; n++) {
    const d = new Date(dato); d.setDate(d.getDate() - n);
    const uge = isoDato(mandagFor(d)), dag = (d.getDay() + 6) % 7;
    const r = Data.listNu('madplan').find(x => !x.barn && x.uge === uge && x.dag === dag);
    const ret = r?.ude ? '' : r?.ret || faste[dag] || '';
    if (ret && !dage.some(x => lavt(x.ret) === lavt(ret))) dage.push({ ret, navn: n === 1 ? 'i går' : DAGE_LANG[dag].toLowerCase() });
  }
  return dage;
}
// Arket "♻️ Rester af hvad?" – gem(tekst) får "♻️ Rester: Lasagne" (eller "♻️ Rester"). ikkeRester = knappen "Ikke rester" (valgfri)
async function vaelgRester(titel, dato, { nu = '', iGaar = false, gem, ikkeRester = null }) {
  const nuRet = (nu || '').replace(/^♻️\s*Rester:?\s*/i, '');
  const dage = await resterForslag(dato);
  let valgt = nuRet || (iGaar && dage[0]?.navn === 'i går' ? dage[0].ret : '');
  const egen = input('text', 'rester-ret', '', 'Eller skriv selv, fx Lasagne');
  egen.maxLength = 60;
  egen.setAttribute('list', 'retter-forslag');
  const seg = el('div', 'seg wrap');
  const tegnSeg = () => seg.replaceChildren(...dage.map(x => {
    const k = knap(x.ret + ' · ' + x.navn, null, () => { valgt = valgt === x.ret ? '' : x.ret; egen.value = ''; tegnSeg(); });
    k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', String(valgt === x.ret));
    return k;
  }));
  tegnSeg();
  if (valgt && !dage.some(x => x.ret === valgt)) egen.value = valgt;
  egen.addEventListener('input', () => { valgt = ''; tegnSeg(); });
  const knapper = el('div', 'ark-knapper');
  if (ikkeRester) knapper.append(knap('Ikke rester', 'knap sekundaer', ikkeRester));
  knapper.append(knap('Gem', 'knap', async () => {
    const ret = (egen.value.trim() || valgt).replace(/ · /g, ', ');
    await gem('♻️ Rester' + (ret ? ': ' + ret : ''));
  }));
  aabnArk(titel, ...(dage.length ? [el('p', 'seg-label', 'Rester af hvad?'), seg] : []), felt(dage.length ? 'Noget andet' : 'Rester af hvad?', egen),
    el('p', 'hint', 'Står kun på dagen – kommer ikke på listen over retter, i terningen eller på indkøbslisten.'), knapper);
}
// ♻️ Rester på familiens madplan (aftensmad)
function resterArk(i, dato, nu, iGaar = false) {
  return vaelgRester('♻️ Rester · ' + DAGE_LANG[i].toLowerCase() + ' ' + dato.getDate() + '/' + (dato.getMonth() + 1), dato, {
    nu, iGaar,
    gem: async t => { await gemDag(i, t, true, undefined, true); lukArk(); tegnMadplan(); },
    ikkeRester: nu ? async () => { await gemDag(i, ''); lukArk(); tegnMadplan(); } : null
  });
}

// Drengenes faste morgenmad og frokost (redigeres af voksne under madplanen)
let fastBarn = BOERN.includes(lokal.get('fast-barn')) ? lokal.get('fast-barn') : BOERN[0];
let fastPrDagAaben = false;   // "Forskelligt pr. ugedag" – huskes mens appen er åben
async function tegnFastPlan() {
  const boks = document.getElementById('fast-plan');
  const voksen = Data.bruger()?.rolle === 'voksen';
  const selv = BOERN.includes(Data.bruger()?.navn) ? Data.bruger().navn : null;   // et barn ser sin egen
  if (selv) fastBarn = selv;
  document.getElementById('ryd-uge').after(boks);   // under aftensmaden – for både børn og voksne
  // Børn ser ikke de faste måltider for ugen – kun dagens mad på tavlen (planen kan nå at ændre sig, se madSkjultForBarn)
  if (erBarn()) { boks.replaceChildren(); boks.hidden = true; return; }
  boks.hidden = false;
  const plan = (await Data.list('fastplan')).filter(r => r.barn === fastBarn);
  const fastFavs = await Data.list('favoritter');
  await hentTilbehoer();   // retter.js
  if (venterPaaSkriv(boks, tegnFastPlan)) return;
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.append(...BOERN.map(b => {
    const k = knap(b, null, () => { fastBarn = b; lokal.set('fast-barn', b); tegnFastPlan(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', b === fastBarn);
    return k;
  }));
  // Standard (Skoledage / Fridage) øverst; "Forskelligt pr. ugedag" er foldet sammen (Timmo 20/10: maden er sjældent den samme hver uge)
  const idagFri = typeof skoleFriNu === 'function' && skoleFriNu(fastBarn, isoDato(new Date()));
  const raekkeLi = (i, dagNavn) => {
    const raekke = plan.find(r => r.dag === i) || {};
    const erIdag = i === FAST_SKOLE ? !idagFri : i === FRIDAG ? idagFri : false;
    const li = el('li', 'fast-dag' + (erIdag ? ' idag' : '') + (i === FRIDAG ? ' fast-fridag' : ''));
    li.append(el('span', 'fast-dagnavn', dagNavn));
    for (const felt of ['morgen', 'frokost']) {
      const navn = felt === 'morgen' ? 'Morgen' : 'Frokost';
      if (!voksen) { li.append(el('span', 'fast-vaerdi', raekke[felt] || '–')); continue; }
      const inp = el('input');
      inp.type = 'text'; inp.id = 'fast-' + felt + '-' + i; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
      inp.placeholder = i < 7 ? 'Som standard' : navn;
      inp.setAttribute('aria-label', navn + ' ' + (i === FRIDAG ? 'på fridage' : i === FAST_SKOLE ? 'på skoledage' : DAGE_LANG[i].toLowerCase()));
      inp.setAttribute('list', DATALISTE[felt]);
      inp.value = raekke[felt] || '';
      inp.addEventListener('change', async () => {
        const v = inp.value.trim();
        await gemFast(fastBarn, i, felt, v);
        if (v) { await gemFavorit(felt, v); tegnForslag(felt); }
        tegnOverblik();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      const t = knap('', 'terning lille', async () => {
        const favs = autoRetter(await Data.list('favoritter'), felt).map(k => k.tekst).filter(v => v !== inp.value);   // retter.js
        if (!favs.length) return;
        await gemFast(fastBarn, i, felt, favs[Math.floor(Math.random() * favs.length)]);
        tegnFastPlan(); tegnOverblik();
      });
      t.innerHTML = IKON_TERNING;
      t.setAttribute('aria-label', 'Tilfældig ' + navn.toLowerCase());
      const par = el('span', 'fast-felt');
      par.append(fuldTekst(inp), t);
      // ✎ Tilpas: vælg pålæg (fx Rugbrød med leverpostej) – retter.js
      const vc = inp.value ? retChips(fastFavs, felt, inp.value, async v => { await gemFast(fastBarn, i, felt, v); tegnFastPlan(); tegnOverblik(); }) : null;
      if (vc) par.append(vc);
      li.append(par);
    }
    return li;
  };
  const ol = el('ol', 'uge fast-uge');
  ol.append(raekkeLi(FAST_SKOLE, '🎒 Skole'), raekkeLi(FRIDAG, '🏖 Fri'));
  const ugeOl = el('ol', 'uge fast-uge');
  DAGE.forEach((dagNavn, i) => ugeOl.append(raekkeLi(i, dagNavn)));
  const udfyldt = plan.filter(r => r.dag < 7 && (r.morgen || r.frokost)).length;
  const prDag = el('details', 'fast-pr-dag');
  prDag.open = fastPrDagAaben;
  prDag.addEventListener('toggle', () => { fastPrDagAaben = prDag.open; });
  prDag.append(el('summary', null, 'Forskelligt pr. ugedag' + (udfyldt ? ' (' + udfyldt + (udfyldt === 1 ? ' dag' : ' dage') + ' udfyldt)' : '')),
    el('p', 'hint', 'Kun hvis en bestemt ugedag er anderledes (fx fredag: pizza i skolen). Tomme felter = standarden ovenfor.'), ugeOl);
  const hoved = el('div', 'fast-hoved');
  hoved.append(el('span', null, ''), el('span', null, 'Morgen'), el('span', null, 'Frokost'));
  boks.replaceChildren(
    el('h3', 'lille-titel', selv ? 'Min morgenmad og frokost' : 'Børnenes morgenmad og frokost'),
    selv ? '' : el('p', 'hint', 'Det, de plejer at få. En enkelt dag ændres ved at trykke på maden på barnets tavle – eller barnet vælger selv.'),
    selv ? '' : seg, hoved, ol,
    selv ? '' : el('p', 'hint fridag-hint', '🎒 Skole = skoledage. 🏖 Fri = weekend, ferie, helligdage, fast fridag og sygedage.'),
    selv ? '' : prDag,
    selv ? '' : knap('🧒 Hvad må børnene selv vælge?', 'lille-knap boernevalg-knap', () => redigerBoernevalg()),
    selv ? '' : knap('⏸ Sæt maden på pause', 'lille-knap boernevalg-knap', () => redigerPause({}, null)),   // pause.js
    selv && typeof pauseMad === 'function' && ['morgen', 'frokost', 'ret'].some(f => pauseMad(selv, isoDato(new Date()), f))
      ? el('p', 'hint pause-hint', '⏸ Mor og far har ikke bestemt maden endnu – kig igen senere') : '');
}

// Terning: vælg tilfældigt fra listerne – undgå gentagelser i samme uge
let nyeDage = new Set();
// ↩️ Fortryd for ændringer af hele ugen (bland, fyld tomme, kopiér, terning): ugen huskes før, og "Fortryd" sætter den tilbage
async function medUgeFortryd(tekst, fn) {
  const uge = madUgeIso();
  const foer = Data.raaKopi('madplan', r => r.uge === uge && !r.barn);
  await fn();
  const efter = Data.listNu('madplan').filter(r => r.uge === uge && !r.barn);
  const nye = efter.filter(r => !foer.some(f => f.id === r.id)).map(r => r.id);
  const aendret = foer.filter(f => { const n = efter.find(r => r.id === f.id); return !n || JSON.stringify((({ id, oprettet, _af, ...d }) => d)(n)) !== JSON.stringify(f.data); });
  if (!nye.length && !aendret.length) return;
  visFortrydMed(tekst, async () => {
    if (nye.length) await Data.stille(() => Data.removeMange('madplan', nye));
    if (aendret.length) await Data.gendan({ raekker: aendret });
    tegnMadplan();
  });
}
async function rulDage(dage, felter = ['ret']) {
  const favs = await Data.list('favoritter');
  if (felter.includes('ret') && !favs.some(f => f.type === 'ret')) { document.querySelector('.retter-boks').open = true; return; }
  for (const felt of felter) {
    // retter.js: én tekst pr. ret (med tilfældig variant); takeaway og "ikke i terningen" er aldrig med
    const kandidater = autoRetter(favs, felt);
    if (!kandidater.length) continue;
    // Det flest kan lide vælges først: først det alle kan lide, så det næstflest kan lide osv.
    const aktive = lideAktive(kandidater.map(k => k.fav));
    const point = k => kanLide(k.fav).filter(n => aktive.includes(n)).length;
    const plan = await madplanForUge(madUgeIso());
    // Samme ret (også en anden variant af den) kommer ikke to gange i samme uge
    // (sammenlignes på navnet, så to ens retter på listen ikke giver den samme ret to gange)
    const brugt = new Set(plan.map(r => lavt(findRet(favs, felt, r[felt])?.fav.tekst || r[felt])).filter(Boolean));
    for (const dag of dage) {
      const ubrugte = kandidater.filter(k => !brugt.has(lavt(k.fav.tekst)));
      const kilde = ubrugte.length ? ubrugte : kandidater;
      const bedst = Math.max(...kilde.map(point));
      const mulige = kilde.filter(k => point(k) === bedst);
      const valgt = mulige[Math.floor(Math.random() * mulige.length)];
      brugt.add(lavt(valgt.fav.tekst));
      await gemMad(dag, felt, valgt.tekst);
      nyeDage.add(dag);
    }
  }
  tegnMadplan();
}
const synligeMaaltider = () => ['ret'];
// Dage terningerne må ændre: ikke dage, der er gået (i dag er med)
function aabneDage() {
  const alle = [0, 1, 2, 3, 4, 5, 6];
  if (madUge > 0) return alle;
  if (madUge < 0) return [];
  return alle.filter(d => d >= idagNr());
}

document.getElementById('fyld-tomme').addEventListener('click', async () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  const faste = await fastAftensmad();
  await medUgeFortryd('De tomme dage er fyldt', async () => {
    for (const felt of synligeMaaltider()) {
      const plan = await madplanForUge(madUgeIso());
      await rulDage(aabneDage().filter(d => !faste[d] && !plan.some(r => r.dag === d && r[felt])), [felt]);
    }
  });
});
// Kopiér sidste uges aftensmad til de tomme dage (ikke dage der er gået, ikke faste dage)
document.getElementById('kopier-uge').addEventListener('click', async () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  const faste = await fastAftensmad();
  const forrige = new Date(madMandag()); forrige.setDate(forrige.getDate() - 7);
  const sidste = await madplanForUge(isoDato(forrige));
  const plan = await madplanForUge(madUgeIso());
  let n = 0;
  await medUgeFortryd('Sidste uge er kopieret', async () => {
    for (const d of aabneDage()) {
      const fra = sidste.find(r => r.dag === d);
      const ret = fra?.ude ? '' : fra?.ret;   // "Vi er ude" kopieres ikke
      if (!ret || faste[d] || plan.some(r => r.dag === d && r.ret)) continue;
      await gemMad(d, 'ret', ret); nyeDage.add(d); n++;
    }
  });
  if (!n) visStatus('Ingen tomme dage at kopiere til');
  tegnMadplan();
});
const blandUge = document.getElementById('bland-uge');
blandUge.addEventListener('click', () => bekraeft(blandUge, () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  return Promise.all([fastAftensmad(), madplanForUge(madUgeIso())]).then(([faste, plan]) =>
    medUgeFortryd('Ugen er blandet', () => rulDage(aabneDage().filter(d => !faste[d] && !plan.some(r => r.dag === d && r.ude)), synligeMaaltider())));   // 🎉-dage røres ikke
}));

document.getElementById('mad-forrige').addEventListener('click', () => { madUge--; tegnMadplan(); });
document.getElementById('mad-naeste').addEventListener('click', () => { madUge++; tegnMadplan(); });
document.getElementById('mad-denne').addEventListener('click', () => { madUge = 0; tegnMadplan(); });

const rydUge = document.getElementById('ryd-uge');
rydUge.addEventListener('click', () => bekraeft(rydUge, async () => {
  await Data.removeMange('madplan', (await madplanForUge(madUgeIso())).map(r => r.id));
  tegnAlt();
}));

// "Vores lister" folder ud nederst på siden – rul den frem, så man kan se, at der skete noget
document.querySelector('.retter-boks').addEventListener('toggle', e => {
  if (e.target.open) setTimeout(() => e.target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
});

// ---------- Skoleskema ----------
// Data: 'ringetider' {barn, nr, tid}
//       'skema' {barn, dag (0-4), nr, fag, farve}   – farve = navnet på en farve i skemafarver
//       'skemafarver' {barn, navn, farve}            – fx {Oliver, 'Mette', 'blaa'}
//       'skemadag' {barn, dag, kontakt, fri?: true}  – dagens kontaktperson; fri = fast fridag hver uge
const FARVER = {
  blaa: '#5b8def', groen: '#4fa35a', gul: '#e0b44f', roed: '#d9534f',
  graa: '#9aa5a0', lilla: '#9b7fd4', orange: '#ef8a3c', turkis: '#2fb0aa'
};
const FARVE_NAVN = { blaa: 'Blå', groen: 'Grøn', gul: 'Gul', roed: 'Rød', graa: 'Grå', lilla: 'Lilla', orange: 'Orange', turkis: 'Turkis' };
const MAX_RAEKKER = 12;
let skemaBarn = lokal.get('skema-barn') || BOERN[0];
let skemaDag = idagNr() < 5 ? idagNr() : 0;
let redigerer = false;

const skemaFarver = async barn => (await Data.list('skemafarver')).filter(f => f.barn === barn);
const farveKode = (farver, navn) => FARVER[farver.find(f => f.navn === navn)?.farve] || null;
const dagKontakt = async (barn, dag) => (await Data.list('skemadag')).find(d => d.barn === barn && d.dag === dag)?.kontakt || '';
const fastFri = async (barn, dag) => !!(await Data.list('skemadag')).find(d => d.barn === barn && d.dag === dag)?.fri;

function tegnSkemaValg() {
  const barnSeg = document.getElementById('vaelg-barn');
  barnSeg.replaceChildren(...BOERN.map(b => {
    const k = el('button', null, b);
    k.type = 'button'; k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', b === skemaBarn);
    k.addEventListener('click', () => { skemaBarn = b; lokal.set('skema-barn', b); tegnSkema(); });
    return k;
  }));
  const dagSeg = document.getElementById('vaelg-dag');
  dagSeg.replaceChildren(...DAGE.slice(0, 5).map((d, i) => {
    const k = el('button', null, d);
    k.type = 'button'; k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', i === skemaDag);
    k.addEventListener('click', () => { skemaDag = i; tegnSkema(); });
    return k;
  }));
}

// Alle rækker for en dag. medTom = én ekstra tom række til at skrive i (når man retter)
async function dagensTimer(barn, dag, medTom = false) {
  const tider = (await Data.list('ringetider')).filter(r => r.barn === barn);
  const alleFag = (await Data.list('skema')).filter(s => s.barn === barn);
  const fag = alleFag.filter(s => s.dag === dag);
  const hoejeste = Math.max(0, ...tider.filter(t => t.tid).map(t => t.nr), ...alleFag.map(s => s.nr));
  const antal = Math.min(MAX_RAEKKER, Math.max(7, hoejeste + (medTom ? 1 : 0)));
  return Array.from({ length: antal }, (_, i) => {
    const nr = i + 1;
    const s = fag.find(f => f.nr === nr);
    return { nr, tid: tider.find(t => t.nr === nr)?.tid || '', fag: s?.fag || '', farve: s?.farve || '' };
  });
}

// Én time som den vises (skema og børnetavle)
function lektionLi(t, erNu, farver) {
  const kode = farveKode(farver, t.farve);
  const li = el('li', 'lektion vis' + (erNu ? ' nu' : '') + (kode ? ' farvet' : ''));
  if (kode) li.style.setProperty('--fk', kode);
  li.append(el('span', 'tid', visTider(t.tid)), el('span', 'fag', t.fag));
  return li;
}

// Lille forklaring: hvilken farve betyder hvad
function forklaring(farver, brugte) {
  const boks = el('div', 'forklaring');
  for (const f of farver.filter(f => !brugte || brugte.has(f.navn))) {
    const s = el('span', 'fk-punkt');
    const prik = el('span', 'fk-farve');
    prik.style.setProperty('--fk', FARVER[f.farve]);
    s.append(prik, f.navn);
    boks.append(s);
  }
  return boks;
}

async function tegnSkema() {
  tegnSkemaValg();
  const ol = document.getElementById('lektioner');
  const farver = await skemaFarver(skemaBarn);
  const timer = await dagensTimer(skemaBarn, skemaDag, redigerer);
  const medFag = timer.filter(t => t.fag);
  const kontakt = await dagKontakt(skemaBarn, skemaDag);
  const friDag = await fastFri(skemaBarn, skemaDag);
  if (venterPaaSkriv(document.getElementById('skema'), tegnSkema)) return;
  ol.replaceChildren();

  const knapEl = document.getElementById('rediger-skema');
  knapEl.setAttribute('aria-pressed', redigerer);
  knapEl.textContent = redigerer ? 'Færdig' : 'Ret skema';
  document.getElementById('rediger-hint').hidden = !redigerer;

  // Kontaktperson for dagen
  const kontaktBoks = document.getElementById('skema-kontakt');
  kontaktBoks.replaceChildren();
  if (redigerer) {
    const inp = input('text', 'kontakt-felt', kontakt, 'Fx Britt');
    inp.addEventListener('change', () => gemSkemaFelt('skemadag', { barn: skemaBarn, dag: skemaDag }, { kontakt: inp.value.trim() }));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    const par = el('div', 'mad-par kontakt-par');
    const lbl = el('label', null, 'Kontakt'); lbl.htmlFor = inp.id;
    par.append(lbl, inp);
    const friKnap = knap('🎉 Fri hele dagen (hver uge)', null, () => gemSkemaFelt('skemadag', { barn: skemaBarn, dag: skemaDag }, { fri: !friDag }).then(tegnSkema));
    friKnap.setAttribute('role', 'checkbox');
    friKnap.setAttribute('aria-checked', friDag);
    const friSeg = el('div', 'seg wrap skema-fri');
    friSeg.append(friKnap);
    kontaktBoks.append(par, friSeg);
  }

  if (redigerer) {
    for (const t of timer) {
      const li = el('li', 'lektion ret');
      const tid = el('input', 'tid-felt');
      tid.type = 'text'; tid.value = t.tid; tid.placeholder = '8.00-8.45'; tid.inputMode = 'decimal';
      tid.setAttribute('aria-label', 'Række ' + t.nr + ', tid');
      tid.addEventListener('change', () => gemSkemaFelt('ringetider', { barn: skemaBarn, nr: t.nr }, { tid: tid.value.trim() }));
      const fag = el('input');
      fag.type = 'text'; fag.value = t.fag; fag.placeholder = 'Fag';
      fag.setAttribute('aria-label', 'Række ' + t.nr + ', fag');
      fag.addEventListener('change', () => gemSkemaFelt('skema', { barn: skemaBarn, dag: skemaDag, nr: t.nr }, { fag: fag.value.trim() }));
      const kode = farveKode(farver, t.farve);
      const farveKnap = knap('', 'farve-knap' + (kode ? '' : ' ingen'), () => vaelgFarve(t, farver));
      if (kode) farveKnap.style.setProperty('--fk', kode);
      farveKnap.setAttribute('aria-label', 'Farve: ' + (t.farve || 'ingen'));
      li.append(tid, fag, farveKnap);
      ol.append(li);
    }
  } else if (friDag) {
    ol.append(el('li', 'tom fri-dag-skema', 'Fri hele dagen 🎉 (fast fridag)'));
  } else if (!medFag.length) {
    ol.append(el('li', 'tom', 'Ingen timer lagt ind. Tryk på "Ret skema".'));
  } else {
    const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
    for (const t of medFag) {
      const [fra, til] = tidSomMin(t.tid);
      ol.append(lektionLi(t, skemaDag === idagNr() && fra != null && til != null && nuMin >= fra && nuMin < til, farver));
    }
  }

  const fkBoks = document.getElementById('skema-forklaring');
  fkBoks.replaceChildren(redigerer ? '' : forklaring(farver, new Set(medFag.map(t => t.farve))));

  const { slut: friKl } = friDag ? {} : skoleTider(timer);
  const fod = [];
  if (friKl) fod.push('Fri kl. ' + visTid(friKl));
  if (kontakt && !redigerer) fod.push('Kontakt: ' + kontakt);
  document.getElementById('fri-kl').textContent = fod.join(' · ');

  tegnFarveStyring(farver);
  if (!redigerer) tegnSkemaAendringer();   // skoledag.js
  else document.getElementById('skema-aendringer').replaceChildren();
}

// Vælg farve til en time
function vaelgFarve(t, farver) {
  const valg = chipValg(['', ...farver.map(f => f.navn)], t.farve, async v => {
    await gemSkemaFelt('skema', { barn: skemaBarn, dag: skemaDag, nr: t.nr }, { farve: v });
    lukArk();
    tegnSkema();
  }, v => v || 'Ingen farve');
  aabnArk('Farve til ' + (t.fag || 'række ' + t.nr), valg,
    el('p', 'hint', 'Farverne rettes under "Farver" nederst, mens du retter skemaet.'));
}

// Farver for barnet: navn + farve (kun når man retter)
function tegnFarveStyring(farver) {
  const boks = document.getElementById('skema-farver');
  boks.replaceChildren();
  if (!redigerer) return;
  boks.append(el('h3', 'lille-titel', 'Farver for ' + skemaBarn));
  const liste = el('div', 'farve-liste');
  for (const f of farver) {
    const raekke = el('div', 'farve-raekke');
    const navn = input('text', 'farvenavn-' + f.id, f.navn, 'Fx lærerens navn');
    navn.addEventListener('change', async () => {
      const nyt = navn.value.trim();
      if (!nyt || nyt === f.navn) { navn.value = f.navn; return; }
      // Omdøb også i skemaet, så timerne beholder farven
      for (const s of (await Data.list('skema')).filter(s => s.barn === skemaBarn && s.farve === f.navn)) {
        await Data.update('skema', s.id, { farve: nyt });
      }
      await Data.update('skemafarver', f.id, { navn: nyt });
      tegnAlt();
    });
    const paletter = el('div', 'palette');
    for (const [noegle, kode] of Object.entries(FARVER)) {
      const k = knap('', 'palette-knap' + (f.farve === noegle ? ' valgt' : ''), async () => {
        await Data.update('skemafarver', f.id, { farve: noegle });
        tegnAlt();
      });
      k.style.setProperty('--fk', kode);
      k.setAttribute('aria-label', FARVE_NAVN[noegle]);
      k.setAttribute('aria-pressed', f.farve === noegle);
      paletter.append(k);
    }
    const slet = knap('', 'slet', async () => { await Data.remove('skemafarver', f.id); tegnAlt(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet farven ' + f.navn);
    raekke.append(navn, slet, paletter);
    liste.append(raekke);
  }
  boks.append(liste, knap('Tilføj farve', 'lille-knap', async () => {
    const brugt = new Set(farver.map(f => f.farve));
    const fri = Object.keys(FARVER).find(k => !brugt.has(k)) || 'blaa';
    await Data.add('skemafarver', { barn: skemaBarn, navn: 'Ny farve', farve: fri });
    tegnAlt();
  }));
}

async function gemSkemaFelt(liste, noegle, felter) {
  const VAERDIER = { skema: ['fag', 'farve'], ringetider: ['tid'], skemadag: ['kontakt', 'fri'] }[liste];
  const match = r => Object.entries(noegle).every(([k, v]) => r[k] === v);
  const fundet = (await Data.list(liste)).find(match);
  const samlet = { ...(fundet || {}), ...felter };
  const tom = VAERDIER.every(k => !samlet[k]);
  if (fundet && tom) await Data.stille(() => Data.remove(liste, fundet.id));
  else if (fundet) await Data.update(liste, fundet.id, felter);
  else if (!tom) await Data.add(liste, { ...noegle, ...felter });
  tegnOverblik();
}

document.getElementById('rediger-skema').addEventListener('click', () => { redigerer = !redigerer; tegnSkema(); });

// ---------- Kalender ----------
// Data: 'kalender' {dato: 'ÅÅÅÅ-MM-DD', tilDato?, hvem: navn eller [navne], titel, tid: 'TT:MM' eller '', slut?, ca?: true (tiden er cirka), note?,
//                   gentag?: 'uge'|'2uger'|'maaned'|'aar', gentagTil?: dato, undtagelser?: [datoer der er sprunget over]}
// 'kalender_voksne' – samme felter, men kun for voksne. Databasen giver slet ikke børnene disse rækker.
//                   I koden får de markeringen _voksne: true.
// 'kalender_privat' – kun den voksne, der oprettede aftalen, kan se den (databasen sørger for det). Markeres _privat.
async function kalenderAftaler() {
  const [alle, voksne, privat] = await Promise.all([Data.list('kalender'), Data.list('kalender_voksne'), Data.list('kalender_privat')]);
  return [...alle, ...voksne.map(a => ({ ...a, _voksne: true })), ...privat.map(a => ({ ...a, _privat: true }))];
}
const SYNLIG_LISTE = { alle: 'kalender', voksne: 'kalender_voksne', mig: 'kalender_privat' };
const synligFor = a => (a._privat ? 'mig' : a._voksne ? 'voksne' : 'alle');
// Fravær fra skole: type 'syg' | 'hjemme' (fri: true – hele dagen) eller 'tidlig' (tidligere fri, tid = klokkeslæt)
const FRAVAER = {
  syg: { ikon: '🤒', titel: 'Syg', knap: '🤒 Syg' },
  hjemme: { ikon: '🏠', titel: 'Fri fra skolen', knap: '🏠 Fri fra skolen' },
  tidlig: { ikon: '⏰', titel: 'Tidligere fri', knap: '⏰ Tidligere fri' }
};
// 🌿 Off-dag (2026-10-20j): gemmes som type 'syg' + off: true, så den virker præcis som en sygedag (bryder ikke dage i træk –
// også i databasen) – men hedder "Off-dag" med 🌿 og en rolig tekst i stedet for "God bedring 🤒"
const erOff = a => !!(a && a.type === 'syg' && a.off);
const friIkon = a => (erOff(a) ? '🌿' : FRAVAER[a.type]?.ikon || '😎');
const laas = a => (a.fri || a.type === 'tidlig' ? ' ' + friIkon(a) : a.type === 'skoledag' ? ' 🏫' : '') + (a._privat ? ' 👤' : a._voksne ? ' 🔒' : '');   // markering på ferie/fri/fravær og kun-voksne-aftaler
const fravaerDen = (aftaler, iso, barn) => aftalerDen(aftaler, iso, [barn]).find(a => FRAVAER[a.type]) || null;
const sygDen = (aftaler, iso, barn) => aftalerDen(aftaler, iso, [barn]).some(a => a.type === 'syg');
const offDen = (aftaler, iso, barn) => aftalerDen(aftaler, iso, [barn]).some(erOff);
// Ferie/fri ({fri: true}): skemaet viser "Fri", og i "i dag"-lister vises den kun den dag, den starter
function friDen(aftaler, iso, person) {
  return aftalerDen(aftaler, iso, [person, 'Fælles']).find(a => a.fri) || null;
}
const iDagsListe = (aftaler, iso, hvem) => aftalerDen(aftaler, iso, hvem).filter(a => !a.fri || forekomstStart(a, iso) === iso);
const friTekst = a => a.titel + (a.tilDato && a.tilDato > a.dato ? ' (til ' + DAGE[(tilDag(a.tilDato).getDay() + 6) % 7].toLowerCase() + ' ' + tilDag(a.tilDato).getDate() + '/' + (tilDag(a.tilDato).getMonth() + 1) + ')' : '');
const kalListe = a => SYNLIG_LISTE[synligFor(a)];
// Gem ændringer – flytter aftalen til den anden liste, hvis "kun voksne" er ændret
async function gemAftale(a, f, synlig) {
  const ny = SYNLIG_LISTE[synlig];
  if (ny === kalListe(a)) { await Data.update(ny, a.id, f); return; }
  const { id, oprettet, _voksne, _privat, _af, ...gammel } = a;
  await Data.add(ny, { ...gammel, ...f });
  await Data.stille(() => Data.remove(kalListe(a), a.id));   // flyttet, ikke slettet
}
const PERSONER = ['Fælles', 'Timmo', 'Winnie', 'Oliver', 'Villads'];
const PK = { 'Fælles': 'c-faelles', Timmo: 'c-timmo', Winnie: 'c-winnie', Oliver: 'c-oliver', Villads: 'c-villads' };
const MDR = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
let kalUge = 0;

function isoDato(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const visTid = t => (t || '').replace(':', '.');
const sorterAftaler = (a, b) => (a.tid || '').localeCompare(b.tid || '');

// ----- Gentagelser, flere dage og flere personer -----
const GENTAG_NAVN = { '': 'Nej', uge: 'Hver uge', '2uger': 'Hver 2. uge', maaned: 'Hver måned', aar: 'Hvert år' };
const personerI = a => (Array.isArray(a.hvem) ? a.hvem : [a.hvem || 'Fælles']);
const tilDag = iso => new Date(iso + 'T12:00');   // kl. 12 undgår fejl ved skift til/fra sommertid
const dageMellem = (fra, til) => Math.round((tilDag(til) - tilDag(fra)) / 86400000);
const plusDage = (iso, n) => { const d = tilDag(iso); d.setDate(d.getDate() + n); return isoDato(d); };
// Klokkeslæt for en aftale – "ca. 15.00" når tiden kun er cirka
const klTekst = a => (a.tid ? (a.ca ? 'ca. ' : '') + visTid(a.tid) + (a.slut ? '–' + visTid(a.slut) : '') : '');
const tidTekst = a => (a.tid ? klTekst(a) + ' ' : '');
const aftaleFarve = (a, foretruk = []) => PK[personerI(a).find(p => foretruk.includes(p)) || personerI(a)[0]] || 'c-faelles';

// Startdatoen for den gang aftalen finder sted, som dækker dagen iso – eller null hvis den ikke sker den dag
function forekomstStart(a, iso) {
  if (!a.dato || iso < a.dato) return null;
  const varighed = a.tilDato && a.tilDato > a.dato ? dageMellem(a.dato, a.tilDato) : 0;
  let start = null;
  if (!a.gentag) {
    start = a.dato;
  } else if (a.gentag === 'uge' || a.gentag === '2uger') {
    const skridt = a.gentag === 'uge' ? 7 : 14;
    const n = dageMellem(a.dato, iso);
    start = plusDage(a.dato, n - (n % skridt));
  } else {
    const s = tilDag(a.dato);
    for (let k = 0; k <= varighed; k++) {
      const kandidat = plusDage(iso, -k);
      if (kandidat < a.dato) break;
      const c = tilDag(kandidat);
      if (c.getDate() === s.getDate() && (a.gentag === 'maaned' || c.getMonth() === s.getMonth())) { start = kandidat; break; }
    }
    if (!start) return null;
  }
  if (dageMellem(start, iso) > varighed) return null;
  if (a.gentag && a.gentagTil && start > a.gentagTil) return null;
  if ((a.undtagelser || []).includes(start)) return null;
  return start;
}
// Dagens aftaler – evt. kun for bestemte personer
function aftalerDen(aftaler, iso, hvem = null) {
  return aftaler.filter(a => forekomstStart(a, iso) !== null && (!hvem || personerI(a).some(p => hvem.includes(p))))
    .sort(sorterAftaler);
}

// Uge- eller månedsvisning (huskes på denne enhed)
let kalVisning = ['maaned', 'liste'].includes(lokal.get('kal-visning')) ? lokal.get('kal-visning') : 'uge';
let kalMaaned = 0;                       // 0 = denne måned
let kalValgtDag = isoDato(new Date());   // valgt dag i månedsvisningen

function tegnKalVisningValg() {
  const seg = document.getElementById('kal-visning');
  seg.replaceChildren(...[['liste', 'Liste'], ['uge', 'Uge'], ['maaned', 'Måned']].map(([v, navn]) => {
    const k = knap(navn, null, () => { kalVisning = v; lokal.set('kal-visning', v); tegnKalender(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', v === kalVisning);
    return k;
  }));
  document.getElementById('kal-uge-del').hidden = kalVisning !== 'uge';
  document.getElementById('kal-liste-del').hidden = kalVisning !== 'liste';
  document.getElementById('kal-maaned-del').hidden = kalVisning !== 'maaned';
  document.getElementById('kal-forrige').setAttribute('aria-label', kalVisning !== 'maaned' ? 'Forrige uge' : 'Forrige måned');
  document.getElementById('kal-naeste').setAttribute('aria-label', kalVisning !== 'maaned' ? 'Næste uge' : 'Næste måned');
}

async function tegnMaaned() {
  const foerste = new Date(); foerste.setHours(0, 0, 0, 0); foerste.setDate(1);
  foerste.setMonth(foerste.getMonth() + kalMaaned);
  const sidste = new Date(foerste.getFullYear(), foerste.getMonth() + 1, 0);
  const navn = MDR_LANG[foerste.getMonth()];
  document.getElementById('kal-titel').textContent = navn[0].toUpperCase() + navn.slice(1) + ' ' + foerste.getFullYear();
  document.getElementById('kal-idag').textContent = 'Til denne måned';
  document.getElementById('kal-idag').hidden = kalMaaned === 0;
  document.getElementById('kal-dato').textContent = '';

  const aftaler = await kalenderAftaler();
  const alleFoed = await foedselsListe();   // fra familie.js (personer + gamle rækker)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const idagIso = isoDato(new Date());
  if (kalValgtDag.slice(0, 7) !== isoDato(foerste).slice(0, 7)) {
    kalValgtDag = idagIso.slice(0, 7) === isoDato(foerste).slice(0, 7) ? idagIso : isoDato(foerste);
  }

  const g = document.getElementById('maaned');
  g.replaceChildren(el('div', 'md-hoved md-uge', 'Uge'), ...DAGE.map(d => el('div', 'md-hoved', d)));

  const dag = mandagFor(foerste);
  while (dag <= sidste) {
    g.append(el('div', 'md-ugenr', ugenummer(dag)));
    for (let i = 0; i < 7; i++) {
      const iso = isoDato(dag);
      const dagens = aftalerDen(aftaler, iso);
      const egneFoed = alleFoed.filter(f => isoDato(datoIAar(f, dag.getFullYear())) === iso);
      const foed = [...egneFoed, ...indbyggedeDageDen(iso, egneFoed, mineValg)];
      const k = knap('', 'md-dag' + (dag.getMonth() !== foerste.getMonth() ? ' anden' : '') +
        (iso === idagIso ? ' idag' : '') + (iso === kalValgtDag ? ' valgt' : '') + (i >= 5 ? ' weekend' : ''),
        () => { kalValgtDag = iso; tegnMaaned(); });
      k.setAttribute('aria-label', dag.getDate() + '. ' + MDR_LANG[dag.getMonth()] +
        (dagens.length || foed.length ? ', ' + (dagens.length + foed.length) + ' ting' : ''));
      k.append(el('span', 'md-nr', dag.getDate()));
      // Prikker på mobil, korte titler på store skærme
      const prikker = el('span', 'md-prikker');
      const titler = el('span', 'md-titler');
      for (const f of foed) {
        prikker.append(el('span', 'prik ' + dagKlasse(f)));
        titler.append(el('span', 'md-titel ' + dagKlasse(f), f.indbygget ? f.ikon + ' ' + f.navn : foedIkon(f) + f.navn));
      }
      if (foed.some(f => f.hellig)) k.classList.add('hellig');
      for (const a of dagens) {
        for (const p of personerI(a)) prikker.append(el('span', 'prik ' + PK[p]));
        titler.append(el('span', 'md-titel ' + aftaleFarve(a), (a.tid ? (a.ca ? '~' : '') + visTid(a.tid) + ' ' : '') + a.titel + laas(a)));
      }
      k.append(prikker, titler);
      g.append(k);
      dag.setDate(dag.getDate() + 1);
    }
  }

  // Den valgte dag
  const valgt = new Date(kalValgtDag + 'T00:00');
  const detalje = document.getElementById('dag-detalje');
  const top = el('div', 'sek-hoved');
  top.append(el('h3', 'lille-titel', DAGE_LANG[(valgt.getDay() + 6) % 7] + ' ' + valgt.getDate() + '. ' + MDR_LANG[valgt.getMonth()]),
    knap('Ny aftale', 'lille-knap', () => redigerAftale({ dato: kalValgtDag, hvem: 'Fælles' })));
  const ul = el('ul', 'husk-liste dag-liste');
  for (const f of await foedselsdageDen(kalValgtDag)) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    ul.append(li);
  }
  for (const a of aftalerDen(aftaler, kalValgtDag)) {
    const li = el('li', aftaleFarve(a));
    const b = knap('', 'dag-aftale', () => redigerAftale(a, forekomstStart(a, kalValgtDag)));
    b.append(el('span', 'prik'), el('span', 'husk-tekst', tidTekst(a) + a.titel + (a.gentag ? ' ↻' : '') + laas(a)), el('span', 'dag-hvem', personerI(a).join(', ')));
    li.append(b);
    ul.append(li);
  }
  if (!ul.children.length) ul.append(el('li', 'tom-husk', 'Ingen aftaler.'));
  detalje.replaceChildren(top, ul);
}

// Liste: ugen dag for dag – én linje pr. aftale med farvede prikker (let at læse på en telefon)
// Liste: en rullende liste, der altid starter i dag (eller tidligere, hvis man har trykket "Vis tidligere dage")
let kalListeStart = 0, kalListeAntal = 21;   // start = dage fra i dag (0 eller negativ)
function tegnKalListe(aftaler, alleFoed, mineValg, idagIso) {
  const boks = document.getElementById('kal-liste');
  boks.replaceChildren();
  boks.append(knap('‹ Vis tidligere dage', 'lille-knap kl-mere', () => { kalListeStart -= 7; kalListeAntal += 7; tegnKalender(); }));
  const start = new Date(idagIso + 'T00:00'); start.setDate(start.getDate() + kalListeStart);
  for (let n = 0; n < kalListeAntal; n++) {
    const d = new Date(start); d.setDate(start.getDate() + n);
    const iso = isoDato(d), i = (d.getDay() + 6) % 7;
    if (n === 0 || i === 0) {   // uge-overskrift ved hver mandag
      const man = new Date(d); man.setDate(d.getDate() - i);
      boks.append(el('h3', 'kl-uge', 'Uge ' + ugenummer(man) + ' · ' + ugeSpan(man)));
    }
    const dag = el('div', 'kl-dag' + (iso === idagIso ? ' idag' : '') + (iso < idagIso ? ' forbi' : ''));
    const hoved = el('div', 'kl-hoved');
    hoved.append(el('span', 'kl-navn', DAGE_LANG[i] + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()].slice(0, 3) + '.' + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '')));
    if (iso === idagIso) hoved.append(el('span', 'bt-idag', 'I dag'));
    if (!erBarn()) hoved.append(knap('+', 'kl-ny', () => redigerAftale({ dato: iso, hvem: 'Fælles' })));
    dag.append(hoved);
    const ul = el('ul', 'kl-liste');
    const egneFoed = alleFoed.filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso);
    for (const f of egneFoed) {
      const alder = alderPaa(f, d);
      const li = el('li', 'kl-punkt c-foed');
      const b = knap('', 'kl-knap', () => redigerFoed(f));
      b.append(el('span', 'kl-tid', ''), el('span', 'kl-titel', foedIkon(f) + f.navn + (alder != null && !f.minde ? ' · ' + alder + ' år' : '')));
      li.append(b); ul.append(li);
    }
    for (const x of indbyggedeDageDen(iso, egneFoed, mineValg)) {
      const li = el('li', 'kl-punkt ' + dagKlasse(x));
      li.append(el('span', 'kl-tid', ''), el('span', 'kl-titel', x.ikon + ' ' + x.navn));
      ul.append(li);
    }
    for (const a of aftalerDen(aftaler, iso)) {
      const li = el('li', 'kl-punkt');
      const b = knap('', 'kl-knap', () => redigerAftale(a, forekomstStart(a, iso)));
      const prikker = el('span', 'kl-prikker');
      prikker.append(...personerI(a).map(p => el('span', 'prik ' + (PK[p] || 'c-faelles'))));
      b.append(el('span', 'kl-tid', a.tid ? klTekst(a) : a.fri || (a.tilDato && a.tilDato > a.dato) ? 'Hele dagen' : ''),
        el('span', 'kl-titel', a.titel + (a.gentag ? ' ↻' : '') + laas(a)), prikker, el('span', 'kl-hvem', personerI(a).join(', ')));
      li.append(b); ul.append(li);
    }
    if (!ul.children.length) ul.append(el('li', 'kl-tom', 'Intet'));
    dag.append(ul);
    boks.append(dag);
  }
  boks.append(knap('Vis flere dage ›', 'lille-knap kl-mere', () => { kalListeAntal += 21; tegnKalender(); }));
}

async function tegnKalender() {
  tegnKalVisningValg();
  document.getElementById('kal-nav').hidden = kalVisning === 'liste';   // listen har ingen ‹ ›
  if (kalVisning === 'maaned') return tegnMaaned();
  document.getElementById('kal-idag').textContent = 'Til denne uge';
  const man = mandagDenneUge();
  man.setDate(man.getDate() + kalUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  document.getElementById('kal-titel').textContent = 'Uge ' + ugenummer(man) + ' · ' + ugeSpan(man);
  document.getElementById('kal-idag').hidden = kalUge === 0;
  document.getElementById('kal-dato').textContent = son.getFullYear() !== new Date().getFullYear() ? son.getFullYear() : '';

  const aftaler = await kalenderAftaler();
  const alleFoed = await foedselsListe();   // fra familie.js (personer + gamle rækker)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const idagIso = isoDato(new Date());
  if (kalVisning === 'liste') { document.getElementById('kal-dato').textContent = ''; return tegnKalListe(aftaler, alleFoed, mineValg, idagIso); }
  const g = document.getElementById('kal');
  g.replaceChildren(el('div'));

  for (const p of PERSONER) {
    const h = el('div', 'kal-hoved ' + PK[p]);
    h.append(el('span', 'prik'), el('span', null, p));
    g.append(h);
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(man); d.setDate(man.getDate() + i);
    const iso = isoDato(d);
    const erIdag = iso === idagIso;
    const dagEl = el('div', 'kal-dag' + (erIdag ? ' idag' : '') + (i >= 5 ? ' weekend' : ''));
    dagEl.append(el('span', null, DAGE[i]), el('small', null, d.getDate() + '/' + (d.getMonth() + 1)));
    g.append(dagEl);

    for (const p of PERSONER) {
      const celle = el('div', 'kal-celle' + (erIdag ? ' idag' : ''));
      celle.tabIndex = 0;
      celle.setAttribute('role', 'button');
      celle.setAttribute('aria-label', 'Ny aftale ' + DAGE_LANG[i].toLowerCase() + ' for ' + p);
      celle.addEventListener('click', () => redigerAftale({ dato: iso, hvem: p }));
      celle.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === celle) redigerAftale({ dato: iso, hvem: p }); });

      if (p === 'Fælles') {
        const egneFoed = alleFoed.filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso);
        for (const f of egneFoed) {
          const b = el('button', 'beg c-foed');
          b.type = 'button';
          const alder = alderPaa(f, d);
          b.append(el('b', null, foedIkon(f) + f.navn));
          if (alder != null && !f.minde) b.append(el('span', null, alder + ' år'));
          b.addEventListener('click', e => { e.stopPropagation(); redigerFoed(f); });
          celle.append(b);
        }
        for (const x of indbyggedeDageDen(iso, egneFoed, mineValg)) {
          const b = el('span', 'beg ' + dagKlasse(x));
          b.append(el('b', null, x.ikon + ' ' + x.navn));
          celle.append(b);
        }
      }

      for (const a of aftalerDen(aftaler, iso, [p])) {
        const b = el('button', 'beg ' + PK[p]);
        b.type = 'button';
        // Ugevisningen er smal: kun starttid (hele tiden ses, når man trykker på aftalen)
        if (a.tid) b.append(el('b', null, (a.ca ? 'ca. ' : '') + visTid(a.tid)));
        b.title = (a.tid ? klTekst(a) + ' ' : '') + a.titel;
        b.append(el('span', null, a.titel + (a.gentag ? ' ↻' : '') + laas(a)));
        b.addEventListener('click', e => { e.stopPropagation(); redigerAftale(a, forekomstStart(a, iso)); });
        celle.append(b);
      }
      g.append(celle);
    }
  }
}

// forekomst = den dag man trykkede på (vigtigt for gentagne aftaler)
function redigerAftale(a, forekomst) {
  if (erBarn()) { if (a.id) visAftale(a, forekomst); return; }
  if (a.id && a.type === 'skoledag') return redigerSkoledag(personerI(a)[0], a.dato, a);   // skoledag.js
  const ny = !a.id;
  const serie = !ny && !!a.gentag;
  forekomst = forekomst || a.dato;
  const varighed = a.tilDato && a.dato ? Math.max(0, dageMellem(a.dato, a.tilDato)) : 0;

  const titel = input('text', 'aftale-titel', a.titel, 'Fx fodbold, tandlæge, fødselsdag');

  // Hvem: én eller flere
  const valgte = new Set(personerI(a));
  const hvemValg = el('div', 'seg wrap');
  const tegnHvem = () => hvemValg.replaceChildren(...PERSONER.map(p => {
    const k = knap(p, null, () => {
      if (valgte.has(p)) valgte.delete(p);
      else {
        valgte.add(p);
        // "Fælles" og bestemte personer udelukker hinanden (ellers står aftalen i flere kolonner)
        if (p === 'Fælles') [...valgte].forEach(x => { if (x !== 'Fælles') valgte.delete(x); });
        else valgte.delete('Fælles');
      }
      tegnHvem();
    });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', valgte.has(p));
    return k;
  }));
  tegnHvem();

  const start = serie ? forekomst : a.dato;
  const dato = input('date', 'aftale-dato', start);
  const tilDato = input('date', 'aftale-tildato', varighed ? plusDage(start, varighed) : '');
  const tid = input('time', 'aftale-tid', a.tid);
  const slut = input('time', 'aftale-slut', a.slut);
  const note = input('text', 'aftale-note', a.note, 'Fx sted, husk madpakke');

  let gentag = a.gentag || '';
  const gentagTil = input('date', 'aftale-gentagtil', a.gentagTil || '');
  const gentagTilFelt = felt('Gentages til og med (valgfri)', gentagTil);
  gentagTilFelt.hidden = !gentag;
  const gentagValg = chipValg(Object.keys(GENTAG_NAVN), gentag, v => { gentag = v; gentagTilFelt.hidden = !v; }, v => GENTAG_NAVN[v]);

  // Kun for voksne (fx skole-hjem-samtale om et barn) – kun voksne kan vælge det
  const erVoksenNu = Data.bruger()?.rolle === 'voksen';
  // Hvem kan se aftalen: alle / kun voksne / kun mig
  let synlig = a.id ? synligFor(a) : 'alle';
  const synligValg = chipValg(['alle', 'voksne', 'mig'], synlig, v => { synlig = v; },
    v => ({ alle: 'Alle', voksne: '🔒 Kun voksne', mig: '👤 Kun mig' })[v]);
  let fri = !!a.fri;
  const friKnap = knap('😎 Ferie / fri', null, () => { fri = !fri; friKnap.setAttribute('aria-checked', fri); });
  friKnap.setAttribute('role', 'checkbox');
  friKnap.setAttribute('aria-checked', fri);
  const voksneBoks = el('div', 'seg wrap');
  voksneBoks.append(friKnap);
  const friHint = el('p', 'hint', 'Ferie / fri: skolen vises som "Fri" på tavlen for dem, det gælder.');
  const synligHint = el('p', 'hint', '🔒 Kun voksne: børnene kan ikke se den. 👤 Kun mig: kun du kan se den.');

  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const datoRaekke = el('div', 'to-felter');
  datoRaekke.append(felt('Dato', dato), felt('Til dato (flere dage)', tilDato));
  const tidRaekke = el('div', 'to-felter');
  tidRaekke.append(felt('Fra kl. (valgfri)', tid), felt('Til kl.', slut));
  // Cirka-tid: tiden er ikke helt sikker – vises som "ca. 15.00"
  let ca = !!a.ca;
  const caKnap = knap('≈ Cirka-tid', null, () => { ca = !ca; caKnap.setAttribute('aria-checked', ca); });
  caKnap.setAttribute('role', 'checkbox');
  caKnap.setAttribute('aria-checked', ca);
  const caBoks = el('div', 'seg wrap');
  caBoks.append(caKnap);
  caBoks.hidden = !tid.value;
  tid.addEventListener('input', () => { caBoks.hidden = !tid.value; });

  // Samler felterne – eller null hvis noget mangler
  function felter() {
    const t = titel.value.trim();
    if (!t) { titel.focus(); return null; }
    if (!dato.value) { dato.focus(); return null; }
    for (const f of [tid, slut]) if (f.ugyldig()) { f.focus(); fejl.textContent = 'Klokkeslættet kan ikke forstås – skriv fx 15 eller 15.30.'; fejl.hidden = false; return null; }
    if (tilDato.value && tilDato.value < dato.value) { fejl.textContent = 'Til-datoen er før datoen.'; fejl.hidden = false; return null; }
    const hvem = PERSONER.filter(p => valgte.has(p));
    return {
      titel: t,
      hvem: hvem.length === 0 ? 'Fælles' : hvem.length === 1 ? hvem[0] : hvem,
      dato: dato.value,
      tilDato: tilDato.value && tilDato.value > dato.value ? tilDato.value : null,
      tid: tid.value,
      slut: tid.value ? slut.value : '',
      ca: !!(tid.value && ca),
      note: note.value.trim(),
      gentag,
      gentagTil: gentag ? gentagTil.value || null : null,
      fri
    };
  }
  const faerdig = () => { lukArk(); tegnAlt(); };

  const knapper = el('div', 'ark-knapper aftale-knapper');
  if (ny) {
    knapper.append(knap('Gem', 'knap', async () => { const f = felter(); if (!f) return; await Data.add(SYNLIG_LISTE[synlig], f); faerdig(); }));
  } else if (!serie) {
    knapper.append(
      knap('Slet', 'knap fare', async () => { await Data.remove(kalListe(a), a.id); faerdig(); }),
      knap('Gem', 'knap', async () => { const f = felter(); if (!f) return; await gemAftale(a, f, synlig); faerdig(); }));
  } else {
    const undtag = [...(a.undtagelser || [])];
    const forSidste = plusDage(forekomst, -1);
    knapper.append(
      el('p', 'hint bred', 'Aftalen gentages. Gælder ændringen kun ' + kortDag(forekomst) + ' eller også fremover?'),
      knap('Gem kun denne dag', 'knap sekundaer-knap', async () => {
        const f = felter(); if (!f) return;
        await Data.update(kalListe(a), a.id, { undtagelser: [...undtag, forekomst] });
        await Data.add(SYNLIG_LISTE[synlig], { ...f, gentag: '', gentagTil: null });
        faerdig();
      }),
      knap('Gem fra denne dag', 'knap', async () => {
        const f = felter(); if (!f) return;
        if (forekomst === a.dato) {
          await gemAftale(a, f, synlig);
        } else {
          await Data.update(kalListe(a), a.id, { gentagTil: forSidste });
          await Data.add(SYNLIG_LISTE[synlig], { ...f, undtagelser: undtag.filter(d => d >= forekomst) });
        }
        faerdig();
      }),
      knap('Slet kun denne dag', 'knap fare', async () => {
        Data.huskFoer(a.id);
        await Data.update(kalListe(a), a.id, { undtagelser: [...undtag, forekomst] });
        faerdig();
      }),
      knap('Slet fra denne dag', 'knap fare', async () => {
        if (forekomst === a.dato) await Data.remove(kalListe(a), a.id);
        else { Data.huskFoer(a.id); await Data.update(kalListe(a), a.id, { gentagTil: forSidste }); }
        faerdig();
      })
    );
  }

  aabnArk(ny ? 'Ny aftale' : 'Ret aftale', felt('Hvad', titel), felt('Hvem', hvemValg), datoRaekke, tidRaekke, caBoks,
    felt('Gentages', gentagValg), gentagTilFelt, voksneBoks, friHint, felt('Note', note),
    erVoksenNu ? felt('Hvem kan se den', synligValg) : '', erVoksenNu ? synligHint : '', fejl, knapper);
  if (ny) setTimeout(() => titel.focus(), 50);
}

// "+ Ny aftale": på den valgte dag i månedsvisning, ellers i dag (eller mandag i en anden uge)
document.getElementById('kal-ny').addEventListener('click', () => {
  let dato = isoDato(new Date());
  if (kalVisning === 'maaned') dato = kalValgtDag;
  else if (kalUge !== 0) { const m = mandagDenneUge(); m.setDate(m.getDate() + kalUge * 7); dato = isoDato(m); }
  redigerAftale({ dato, hvem: 'Fælles' });
});
document.getElementById('kal-forrige').addEventListener('click', () => { if (kalVisning === 'uge') kalUge--; else kalMaaned--; tegnKalender(); });
document.getElementById('kal-naeste').addEventListener('click', () => { if (kalVisning === 'uge') kalUge++; else kalMaaned++; tegnKalender(); });
document.getElementById('kal-idag').addEventListener('click', () => { kalUge = 0; kalMaaned = 0; kalValgtDag = isoDato(new Date()); tegnKalender(); });

// ---------- Børnetavle: Olivers og Villads' egen I dag-side ----------
// Data: 'info' {barn, dato: 'ÅÅÅÅ-MM-DD', tekst, gentag?: 'uge'} – ekstra ting at huske, som ikke står i kalenderen
//        gentag 'uge' = samme ugedag hver uge fra datoen (fx "husk idrætstøj" hver tirsdag)
const ugedagAf = iso => new Date(iso + 'T00:00').getDay();
const infoDen = (alle, barn, iso) => alle.filter(x => x.barn === barn &&
  (x.dato === iso || (x.gentag === 'uge' && x.dato < iso && ugedagAf(x.dato) === ugedagAf(iso))));
const MDR_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const SKIFT_KL = 19 * 60 + 30;  // kl. 19.30 skifter børnetavlen til at vise i morgen
let tavleVisning = 'familie';   // 'familie' eller et barns navn
let tavleValgt = null;          // dag valgt med et tryk – ellers null = automatisk

function tavleAutoDato() {
  const d = new Date();
  if (d.getHours() * 60 + d.getMinutes() >= SKIFT_KL) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
// Børnene ser kun maden for i dag (og i morgen, når tavlen er skiftet til i morgen sidst på dagen) – planen kan nå at ændre sig
const MAD_SKJULT = 'Kommer på dagen 🍽️';
const madSkjultForBarn = iso => erBarn() && iso > isoDato(tavleAutoDato());
function mandagFor(dato) {
  const m = new Date(dato);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
// Tjek hvert minut: når klokken passerer 19.30 (eller midnat), skifter tavlen af sig selv
let tavleAutoNoegle = isoDato(tavleAutoDato());
setInterval(() => {
  const n = isoDato(tavleAutoDato());
  if (n === tavleAutoNoegle) return;
  tavleAutoNoegle = n;
  tavleValgt = null;
  if (document.body.dataset.tilstand === 'klar') tegnOverblik();
}, 60000);

function tegnTavleValg() {
  const seg = document.getElementById('idag-valg');
  const profil = Data.bruger();
  const erBarn = profil && profil.rolle === 'barn' && BOERN.includes(profil.navn);
  seg.hidden = erBarn;
  if (erBarn) return;
  seg.replaceChildren(...['familie', ...BOERN].map(v => {
    const k = knap(v === 'familie' ? 'Familien' : v, null, () => {
      tavleVisning = v; tavleValgt = null; lokal.set('tavle', v); tegnOverblik();
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', v === tavleVisning);
    return k;
  }));
  opdaterVenter();   // rødt tal på "Familien", hvis noget venter
}

let tavleGen = 0;   // tavlen tegnes asynkront – kun den nyeste tegning må vises (ellers kan en ældre, langsommere tegning med gamle tal vinde)
async function tegnBoernetavle(barn) {
  const gen = ++tavleGen;
  const boks = document.getElementById('boernetavle');
  // ⏸ Hele tavlen holder pause (pause.js): barnet ser kun sin makker
  const helePause = erBarn() && typeof pauseHele === 'function' && pauseHele(barn, isoDato(new Date()));
  document.body.classList.toggle('pause-hele', !!helePause);
  if (helePause) { lukZoom(); boks.classList.remove('som-tavle'); boks.replaceChildren(await pauseSkaerm(barn)); return; }
  if (typeof svarTilBarn === 'function') svarTilBarn(barn);   // besked om svar fra en voksen (mere.js)
  const auto = tavleAutoDato();
  const valgt = tavleValgt || auto;
  const iso = isoDato(valgt);
  const idagIso = isoDato(new Date());
  const imorgen = new Date(); imorgen.setDate(imorgen.getDate() + 1);
  const dagNr = (valgt.getDay() + 6) % 7;   // mandag = 0
  const man = mandagFor(valgt);

  // Ugedage med markering
  const strip = el('div', 'uge-strip');
  for (let i = 0; i < 7; i++) {
    const dd = new Date(man); dd.setDate(man.getDate() + i);
    const ddIso = isoDato(dd);
    const k = knap('', 'ugedag' + (ddIso === idagIso ? ' idag' : '') + (ddIso === iso ? ' valgt' : '') + (ddIso < idagIso ? ' forbi' : ''),
      () => { tavleValgt = ddIso === isoDato(tavleAutoDato()) ? null : dd; tegnOverblik(); });
    k.setAttribute('aria-pressed', ddIso === iso);
    k.setAttribute('aria-label', DAGE_LANG[i] + ' ' + dd.getDate() + '. ' + MDR_LANG[dd.getMonth()]);
    k.append(el('span', 'ud-navn', DAGE[i]), el('span', 'ud-nr', dd.getDate()));
    strip.append(k);
  }

  // Dato
  const hoved = el('div', 'bt-hoved');
  const dagNavn = el('p', 'bt-dag', DAGE_LANG[dagNr]);
  if (iso === idagIso) dagNavn.append(el('span', 'bt-idag', 'I dag'));
  else if (iso === isoDato(imorgen)) dagNavn.append(el('span', 'bt-idag', 'I morgen'));
  const hovedTekst = el('div', 'bt-hoved-tekst');
  hovedTekst.append(dagNavn, el('p', 'bt-dato', valgt.getDate() + '. ' + MDR_LANG[valgt.getMonth()] + ' · uge ' + ugenummer(valgt)));
  hoved.append(hovedTekst);
  // Voksne kan bladre frem (og lidt tilbage) i ugerne – fx for at rette et barns mad i næste uge
  if (!erBarn()) {
    const denneMan = mandagFor(new Date()), uger = Math.round((man - denneMan) / (7 * 864e5));
    const flyt = d => { const n = new Date(valgt); n.setDate(n.getDate() + 7 * d); tavleValgt = isoDato(n) === isoDato(tavleAutoDato()) ? null : n; tegnOverblik(); };
    const nav = el('div', 'bt-uge-nav');
    const tilbage = knap('‹', 'lille-knap', () => flyt(-1)); tilbage.disabled = uger <= -2; tilbage.setAttribute('aria-label', 'Ugen før');
    const frem = knap('›', 'lille-knap', () => flyt(1)); frem.disabled = uger >= 8; frem.setAttribute('aria-label', 'Ugen efter');
    nav.append(tilbage, frem);
    if (uger !== 0) nav.prepend(knap('I dag', 'lille-knap', () => { tavleValgt = null; tegnOverblik(); }));
    hoved.append(nav);
  }

  const kort = (titel, ...indhold) => {
    const k = el('div', 'kort');
    const top = el('div', 'kort-top');
    top.append(el('span', 'kort-label', titel));
    k.append(top, ...indhold);
    return k;
  };

  // Skema
  let skemaKort;
  const friIdag = dagNr < 5 ? friDen(await Data.list('kalender'), iso, barn) : null;
  const hellig = dagNr < 5 ? helligdagDen(iso) : null;   // fra dage.js
  if (dagNr >= 5) {
    skemaKort = kort('Skole', el('p', 'stor tom-ret', 'Weekend – ingen skole'));
    skemaKort.tavle = { stor: 'Weekend', lille: 'Ingen skole 😎', klar: true };
  } else if (hellig && !friIdag) {
    skemaKort = kort('Skole', el('p', 'stor fri-dag', 'Fri ' + hellig.ikon), el('p', 'under', hellig.navn));
    skemaKort.tavle = { stor: 'Fri ' + hellig.ikon, lille: hellig.navn, klar: true };
  } else if (friIdag) {
    skemaKort = erOff(friIdag)
      ? kort('Skole', el('p', 'stor fri-dag', 'Hjemme 🌿'), el('p', 'under', 'Rolig dag derhjemme' + (friIdag.note ? ' – ' + friIdag.note : '')))
      : friIdag.type === 'syg'
      ? kort('Skole', el('p', 'stor fri-dag syg-dag', 'Hjemme 🤒'), el('p', 'under', 'God bedring!' + (friIdag.note ? ' ' + friIdag.note : '')))
      : kort('Skole', el('p', 'stor fri-dag', 'Fri ' + friIkon(friIdag)), el('p', 'under', friTekst(friIdag) + (friIdag.note ? ' – ' + friIdag.note : '')));
    skemaKort.tavle = erOff(friIdag) ? { stor: 'Hjemme 🌿', lille: 'Rolig dag' } : friIdag.type === 'syg' ? { stor: 'Hjemme 🤒', lille: 'God bedring!' } : { stor: 'Fri ' + friIkon(friIdag), lille: friTekst(friIdag), klar: true };
  } else if (await fastFri(barn, dagNr)) {
    skemaKort = kort('Skole', el('p', 'stor fri-dag', 'Fri 🎉'), el('p', 'under', 'Fast fridag'));
    skemaKort.tavle = { stor: 'Fri 🎉', lille: 'Fast fridag', klar: true };
  } else {
    const tidlig = aftalerDen(await Data.list('kalender'), iso, [barn]).find(a => a.type === 'tidlig' && a.tid);
    const tidligMin = tidlig ? tidSomMin(tidlig.tid)[0] : null;
    const sd = await skoleDag(barn, iso);   // skoledag.js: normalt skema flettet med en evt. særlig skoledag
    const timer = sd.timer;
    if (!timer.length) {
      skemaKort = kort('Skole', el('p', 'under', 'Intet skema lagt ind for ' + DAGE_LANG[dagNr].toLowerCase() + '.'));
      skemaKort.tavle = { stor: 'Skole', lille: 'Intet skema lagt ind' };
    } else {
      const { start, slut, harTimer } = sd;
      const tider = el('p', 'bt-tider');
      if (start) tider.append(el('span', null, 'Møder ' + visTid(start)));
      if (tidlig) tider.append(el('span', 'tidlig-fri', '⏰ Fri ' + visTid(tidlig.tid) + ' i dag'));
      else if (slut) tider.append(el('span', null, 'Fri ' + visTid(slut)));
      const ol = el('ol', 'lektioner bt-lektioner');
      const farver = await skemaFarver(barn);
      const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
      for (const t of timer) {
        const [fra, til] = tidSomMin(t.tid);
        const li = skoleLi(t, iso === idagIso && fra != null && til != null && nuMin >= fra && nuMin < til, farver);
        if (tidligMin != null && fra != null && fra >= tidligMin) li.classList.add('aflyst');
        ol.append(li);
      }
      // 🏫 Særlig skoledag: mærke øverst (voksne kan trykke og rette) + noter, der ikke hører til et af dagens fag
      const saerDele = [];
      if (sd.saerlig && skoledagMaerke(sd.saerlig)) {
        const titelTekst = '🏫 ' + skoledagTitel(sd.saerlig);
        saerDele.push(erBarn() ? el('p', 'sd-maerke', titelTekst) : knap(titelTekst + ' ›', 'sd-maerke', () => redigerSkoledag(barn, iso, sd.saerlig._rediger || sd.saerlig)));
      }
      const noteListe = [...sd.noter.map(n => (n.fag ? n.fag + ': ' : '') + n.tekst), ...(sd.saerlig?.note ? [sd.saerlig.note] : [])];
      const noteEl = noteListe.length ? el('div', 'sd-noter') : '';
      for (const n of noteListe) noteEl.append(el('p', 'lektion-note', '📝 ' + n));
      skemaKort = kort('Skole', ...saerDele, tider, ol, noteEl, forklaring(farver, new Set(timer.map(t => t.farve))));
      // Opsummering til tavle-visningen: hvad sker der nu / næste
      let friTid = tidlig ? tidlig.tid : slut;
      const nuTime = iso === idagIso ? timer.find(t => { const [fra, til] = tidSomMin(t.tid); return fra != null && til != null && nuMin >= fra && nuMin < til; }) : null;
      const startMin = tidSomMin(start)[0];
      const slutMin = tidligMin ?? tidSomMin(slut)[0];
      friTid = visTid(friTid);
      const friDel = friTid ? 'fri ' + friTid : '';
      if (iso === idagIso && slutMin != null && nuMin >= slutMin) skemaKort.tavle = { stor: 'Fri 🎉', lille: 'Skolen er slut for i dag', klar: true };
      else if (nuTime) skemaKort.tavle = { stor: nuTime.fag, lille: ['Nu', friDel].filter(Boolean).join(' · ') };
      else if (iso === idagIso && startMin != null && nuMin >= startMin) {
        // I skole: uden tider på timerne vises bare "I skole"
        const naesteT = harTimer ? timer.find(t => (tidSomMin(t.tid)[0] ?? -1) > nuMin) : null;
        skemaKort.tavle = { stor: !harTimer ? 'I skole' : naesteT ? naesteT.fag : 'Pause', lille: [naesteT ? 'Næste' : '', friDel].filter(Boolean).join(' · ') };
      } else skemaKort.tavle = { stor: start ? 'Møder ' + visTid(start) : 'Skole', lille: [sd.saerlig && skoledagMaerke(sd.saerlig) ? '🏫 ' + skoledagTitel(sd.saerlig) : timer[0].fag, friDel].filter(Boolean).join(' · ') };
    }
  }

  // Voksne kan registrere sygdom, fri eller tidligere fri direkte fra tavlen
  if (dagNr < 5 && !erBarn()) {
    const fravaer = fravaerDen(await kalenderAftaler(), iso, barn);
    skemaKort.querySelector('.kort-top').append(
      knap(fravaer ? friIkon(fravaer) + ' Ret fravær' : 'Ændring', 'lille-knap fravaer-knap', () => redigerFravaer(barn, iso, fravaer)));
  }

  // Mad
  const plan = await madFor(valgt, barn);
  // ⏸ Pause på maden (pause.js): de voksne har ikke bestemt endnu – barnet ser "Ikke bestemt endnu" og kan ikke ønske
  for (const felt of ['morgen', 'frokost', 'ret']) if (typeof pauseMad === 'function' && pauseMad(barn, iso, felt)) {
    plan[felt] = ''; plan.visning[felt] = 'Ikke bestemt endnu 🍽️'; if (plan.oenske) plan.oenske[felt] = null; if (plan.venter) plan.venter[felt] = null; plan.eget[felt] = false; (plan.pause ||= {})[felt] = true;
  }
  // Børn: maden for dage længere fremme er skjult (madSkjultForBarn)
  if (madSkjultForBarn(iso)) for (const felt of ['morgen', 'frokost', 'ret']) {
    plan[felt] = ''; plan.visning[felt] = MAD_SKJULT; if (plan.oenske) plan.oenske[felt] = null; if (plan.venter) plan.venter[felt] = null; plan.eget[felt] = false; (plan.pause ||= {})[felt] = true;
  }
  const madKort = kort('Mad');
  for (const [felt, navn] of [['morgen', 'Morgen'], ['frokost', 'Frokost'], ['ret', 'Aften']]) {
    const ret = plan[felt];
    const fremtid = iso >= idagIso && !plan.pause?.[felt];
    const r = erBarn() ? (fremtid ? knap('', 'maaltid', () => oenskMad(barn, valgt, felt)) : el('div', 'maaltid')) : knap('', 'maaltid', () => redigerMaaltid(barn, valgt, felt));
    if (!erBarn()) r.setAttribute('aria-label', navn + ': ' + (ret || 'ikke bestemt') + '. Tryk for at ændre');
    const retEl = el('span', 'm-ret' + (ret && ret !== INGEN_MAD ? '' : ' tom-ret'), ret === INGEN_MAD ? 'Ingenting 🚫' : plan.visning[felt] || ret || 'Ikke bestemt');
    // Kun de voksne ser, at retten er ændret for netop denne dag (barnet ser bare maden)
    if (plan.eget[felt] && !plan.oenske?.[felt] && !erBarn()) retEl.append(el('span', 'eget-tag', 'Kun denne dag'));
    if (plan.oenske?.[felt]) retEl.append(el('span', 'eget-tag', erBarn() ? 'Dit valg' : genitiv(barn) + ' valg'));
    if (plan.venter?.[felt]) retEl.append(el('span', 'venter-tag', '⏳ ønsker ' + plan.venter[felt]));
    r.append(el('span', 'm-navn', navn), retEl, erBarn() && !fremtid ? '' : el('span', 'm-pil', '›'));
    madKort.append(r);
  }

  {
    const time = new Date().getHours() + new Date().getMinutes() / 60;
    // I weekender og på fridage spises der senere: morgenmad til kl. 11, frokost til kl. 14 (hverdage: 9 og 13)
    const sent = dagNr >= 5 || (typeof skoleFriNu === 'function' && skoleFriNu(barn, iso));
    const felt = iso !== idagIso ? 'ret' : time < (sent ? 11 : 9) ? 'morgen' : time < (sent ? 14 : 13) ? 'frokost' : 'ret';
    madKort.tavle = { stor: plan.visning[felt] || plan[felt] || 'Ikke bestemt', lille: ({ morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' })[felt] };
  }

  const kontakt = dagNr < 5 ? await dagKontakt(barn, dagNr) : '';
  if (kontakt && skemaKort.querySelector('.bt-tider')) skemaKort.querySelector('.bt-tider').append(el('span', 'bt-kontakt', 'Kontakt: ' + kontakt));

  // "Det sker": fødselsdage, kalender (eget + fælles) og det der ellers skal ske – med billeder
  const voksen = Data.bruger()?.rolle === 'voksen';
  const foed = await foedselsdageDen(iso, barn);
  const alleKal = await Data.list('kalender');   // kun-voksne-aftaler vises aldrig på børnetavlen
  const aftaler = iDagsListe(alleKal, iso, [barn, 'Fælles']);
  const info = infoDen(await Data.list('info'), barn, iso);
  const liste = el('ul', 'sker-liste');
  for (const f of foed) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    liste.append(li);
  }
  for (const a of aftaler) {
    const li = el('li', aftaleFarve(a, [barn]));
    const kunFaelles = !personerI(a).includes(barn);
    const b = knap('', 'sker-knap', () => redigerAftale(a, forekomstStart(a, iso)));
    b.append(el('span', 'prik'), el('span', 'husk-tekst', tidTekst(a) + a.titel + (kunFaelles ? ' · hele familien' : '') + (a.note ? ' – ' + a.note : '')));
    li.append(b);
    liste.append(li);
  }
  for (const x of info) {
    const li = el('li', 'sker-info' + (infoBillede(x) ? ' med-billede' : ''));
    if (infoBillede(x)) {
      const billedKnap = knap('', 'sker-billede-knap', () => visStortBillede(infoBillede(x), x.tekst,
        voksen ? { ret: () => redigerInfo(barn, iso, x), slet: async () => { await Data.remove('info', x.id); lukArk(); tegnAlt(); } } : null));
      billedKnap.setAttribute('aria-label', 'Vis billedet stort');
      const img = el('img', 'sker-billede');
      img.src = infoBillede(x); img.alt = ''; img.loading = 'lazy';
      billedKnap.append(img);
      li.append(billedKnap);
    } else {
      li.append(el('span', 'prik'));
    }
    const tekstEl = voksen ? knap('', 'sker-knap', () => redigerInfo(barn, iso, x)) : el('span', 'sker-knap');
    if (voksen) langtTryk(tekstEl, () => holdValg(x.tekst || 'Note', { slet: () => Data.remove('info', x.id), ret: () => redigerInfo(barn, iso, x) }));
    tekstEl.append(el('span', 'husk-tekst', (x.tekst || '') + (x.gentag === 'uge' ? ' ↻' : '')));
    li.append(tekstEl);
    if (voksen) {
      const mere = knap('', 'mere-knap', () => redigerInfo(barn, iso, x));
      mere.innerHTML = IKON_MERE;
      mere.setAttribute('aria-label', 'Ret eller slet ' + (x.tekst || 'billedet'));
      li.append(mere);
    }
    liste.append(li);
  }
  const tomt = !foed.length && !aftaler.length && !info.length;
  const skerTitel = iso === idagIso ? 'Det sker i dag' : iso === isoDato(imorgen) ? 'Det sker i morgen' : 'Det sker';
  let skerKort = null;
  {
    // Kortet laves altid (tavlen har altid feltet); i listen skjules et tomt kort for børn
    if (tomt) liste.append(el('li', 'tom-husk', 'Intet særligt endnu.'));
    const dele = [liste];
    if (info.some(x => x.piktogram)) dele.push(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
    if (voksen) dele.push(knap('+ Tilføj', 'lille-knap', () => redigerInfo(barn, iso, {})));
    skerKort = kort(skerTitel, ...dele);
    const tekster = [...liste.querySelectorAll('.husk-tekst')].map(x => x.textContent).filter(Boolean);
    skerKort.kunTavle = tomt && !voksen;
    skerKort.tavle = { noegle: 'sker', ikon: '🗓️', titel: skerTitel, bred: true, stor: tomt ? (iso === idagIso ? 'Intet særligt i dag' : iso === isoDato(imorgen) ? 'Intet særligt i morgen' : 'Intet særligt') : '',
      linjer: tomt ? null : tekster.slice(0, 3), lille: tekster.length > 3 ? '+ ' + (tekster.length - 3) + ' mere' : '',
      billede: info.map(infoBillede).find(Boolean) || '' };
  }

  Object.assign(skemaKort.tavle, { noegle: 'skole', ikon: '🎒', titel: 'Skole' });
  Object.assign(madKort.tavle, { noegle: 'mad', ikon: '🍽️', titel: 'Mad' });

  const gitter = el('div', 'overblik');
  const alfie = await alfieKort(barn);   // fra sjov.js
  if (alfie) gitter.append(alfie);
  // Rækkefølge: det der skifter fra dag til dag øverst (Det sker), så pligter + belønninger (hænger sammen),
  // rutiner og skole, mad og nedtælling. Samme rækkefølge i liste og tavle.
  // Efter 19.30 viser tavlen i morgen (skole, mad) – men aftenens rutiner (sengetid) hører til i aften og gemmes på i dag
  const autoImorgen = !tavleValgt && iso !== idagIso;
  const rutiner = await rutineKort(barn, autoImorgen ? new Date() : valgt);   // fra mere.js
  const pPause = typeof pausePligter === 'function' ? pausePligter(barn, idagIso) : null;   // ⏸ pause.js
  const pligter = pPause ? pausePligtKort(pPause) : await pligtKort(barn, iso === idagIso ? 'Pligter i dag' : 'Pligter i dag (' + DAGE_LANG[idagNr()].toLowerCase() + ')');   // fra mere.js
  const beloen = pPause ? null : await beloenningKort(barn);   // fra mere.js
  const nedtael = await nedtaellingKort(barn);   // fra sjov.js
  const sjovK = await sjovKort(barn, iso);   // 🧩 dagens gåde/vits/vidste du/udfordring (sjov.js)
  const konkK = await konkKort(barn);        // 🚴 ugens konkurrence, når nogen er gået i gang (sjov.js)
  const raekke = [skerKort, pligter, beloen, rutiner, skemaKort, madKort, sjovK, konkK, nedtael].filter(Boolean);
  gitter.append(...raekke.filter(k => !k.kunTavle));
  // Vejr (og evt. sol) for den viste dag – efter barnets egne valg; hentes i baggrunden
  const barnValg = await valgFor(barn);
  const sedler = typeof seddelDel === 'function' ? await seddelDel(barn) : null;   // køleskabssedler (seddel.js)
  const skrivLink = typeof seddelSkrivLink === 'function' ? await seddelSkrivLink(barn) : null;   // diskret, nederst
  const vejrPlads = el('div', 'vejr-plads');
  if (barnValg.vejr || barnValg.sol) {
    vejrStribe(iso, barnValg.sol, barnValg.vejr).then(k => { if (k) vejrPlads.replaceChildren(k); });
  }
  if (gen !== tavleGen) return;   // en nyere tegning er i gang
  hoved.append(visningsKnap());
  if (tavleStil() === 'tavle') {
    // Tavle-visning: alt som fliser på en tavle; tryk på en flise for at "zoome" ind
    // Fast rækkefølge (samme som i listen), så man altid ved, hvor tingene står
    const kortListe = raekke.filter(k => k.tavle);
    const ramme = el('div', 'tavle-ramme ' + (PK[barn] || ''));
    const flade = el('div', 'tavle-flade');
    const fliser = el('div', 'fliser');
    if (alfie) fliser.append(alfie);   // makkeren hænger på tavlen sammen med fliserne
    tavleKort = {};
    for (const k of kortListe) { tavleKort[k.tavle.noegle] = k; fliser.append(flise(k)); }
    flade.append(fliser);
    ramme.append(flade);
    boks.classList.add('som-tavle');
    boks.replaceChildren(strip, hoved, vejrPlads, ...(sedler ? [sedler] : []), ramme, ...(skrivLink ? [skrivLink] : []));
    opdaterZoom();
  } else {
    tavleKort = {};
    lukZoom();
    boks.classList.remove('som-tavle');
    boks.replaceChildren(strip, hoved, vejrPlads, ...(sedler ? [sedler] : []), gitter, ...(skrivLink ? [skrivLink] : []));
  }
}

// ---------- Tavle-visning: fliser + zoom ----------
// Valget huskes pr. enhed (fx en tablet der altid står med tavlen)
const tavleStil = () => lokal.get('tavle-stil') || 'tavle';
let tavleKort = {};      // noegle → det fulde kort fra seneste tegning
let zoomNoegle = null;   // hvilken flise der er zoomet ind på
// Én knap, der viser hvad man skifter til: "☰ Liste" i tavle-visning og "▦ Tavle" i liste-visning
function visningsKnap() {
  const til = tavleStil() === 'tavle' ? 'liste' : 'tavle';
  const k = knap(til === 'liste' ? '☰ Vis som liste' : '▦ Vis som tavle', 'lille-knap visning-knap', () => { lokal.set('tavle-stil', til); tegnOverblik(); });
  return k;
}
function flise(k) {
  const t = k.tavle;
  const b = knap('', 'flise' + (t.klar ? ' klar' : '') + (t.haster ? ' haster' : '') + (t.bred ? ' bred' : ''), () => aabnZoom(t.noegle, b));
  b.dataset.noegle = t.noegle;
  const top = el('span', 'fl-top');
  top.append(el('span', 'fl-ikon', t.ikon), el('span', 'fl-titel', t.titel));
  if (t.klar) top.append(el('span', 'fl-klar', '✓'));
  b.append(top);
  if (t.billede) { const img = el('img', 'fl-billede'); img.src = t.billede; img.alt = ''; b.append(img); }
  if (t.stor) b.append(el('span', 'fl-stor', t.stor));
  if (t.linjer) { const ul = el('ul', 'fl-linjer'); t.linjer.forEach(x => ul.append(el('li', null, x))); b.append(ul); }
  if (t.lille) b.append(el('span', 'fl-lille', t.lille));
  if (t.andel != null) b.append(fremskridt(t.andel));
  b.setAttribute('aria-label', t.titel + ': ' + (t.stor || (t.linjer || []).join(', ')) + (t.lille ? ', ' + t.lille : '') + '. Tryk for at åbne');
  return b;
}
let zoomEl = null;
function zoomBoks() {
  if (zoomEl) return zoomEl;
  zoomEl = el('div', 'zoom-baggrund');
  zoomEl.hidden = true;
  const vindue = el('div', 'zoom-vindue');
  vindue.setAttribute('role', 'dialog');
  vindue.setAttribute('aria-modal', 'true');
  const luk = knap('', 'zoom-luk', () => lukZoom());
  luk.innerHTML = '&times;';
  luk.setAttribute('aria-label', 'Luk');
  vindue.append(luk, el('div', 'zoom-indhold boernetavle'));   // samme udseende som på tavlen
  zoomEl.append(vindue);
  zoomEl.addEventListener('click', e => { if (e.target === zoomEl) lukZoom(); });   // tryk ved siden af = luk
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !zoomEl.hidden && arkEl.hidden) lukZoom(); });
  document.body.append(zoomEl);
  return zoomEl;
}
function aabnZoom(noegle, fra) {
  const z = zoomBoks();
  zoomNoegle = noegle;
  opdaterZoom();
  z.hidden = false;
  document.body.style.overflow = 'hidden';
  const vindue = z.querySelector('.zoom-vindue');
  // Vinduet "vokser" ud fra flisen
  if (fra && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const a = fra.getBoundingClientRect(), b = vindue.getBoundingClientRect();
    vindue.style.transition = 'none';
    vindue.style.transformOrigin = 'top left';
    vindue.style.transform = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + (a.width / b.width) + ',' + (a.height / b.height) + ')';
    vindue.style.opacity = '.4';
    vindue.getBoundingClientRect();
    vindue.style.transition = 'transform .22s ease-out, opacity .18s';
    vindue.style.transform = '';
    vindue.style.opacity = '';
  }
}
// Efter en ændring (fx et flueben) tegnes tavlen om – det zoomede kort skiftes til det nye
function opdaterZoom() {
  if (!zoomNoegle || !zoomEl) return;
  const k = tavleKort[zoomNoegle];
  if (!k) { lukZoom(); return; }
  zoomEl.querySelector('.zoom-indhold').replaceChildren(k);
}
function lukZoom() {
  zoomNoegle = null;
  if (!zoomEl || zoomEl.hidden) return;
  zoomEl.hidden = true;
  zoomEl.querySelector('.zoom-indhold').replaceChildren();
  if (arkEl.hidden) document.body.style.overflow = '';
}

// ---------- "Det sker" med billeder (piktogrammer fra ARASAAC eller eget foto) ----------
// Data: 'info' {barn, dato, tekst, piktogram?: ARASAAC-nummer, billede?: foto}
const PIKTO_URL = id => 'https://static.arasaac.org/pictograms/' + id + '/' + id + '_300.png';
const infoBillede = x => (x.piktogram ? PIKTO_URL(x.piktogram) : x.billede || '');
// ARASAAC kan ikke søges på dansk – genvejene oversætter de almindelige ord
const PIKTO_GENVEJE = {
  'Svømning': 'swimming', 'Fodbold': 'football', 'Idræt': 'gym', 'Gymnastik': 'gymnastics', 'Idrætstøj': 'tracksuit',
  'Madpakke': 'lunch box', 'Tandlæge': 'dentist', 'Læge': 'doctor', 'Frisør': 'hairdresser', 'Fødselsdag': 'birthday',
  'Gave': 'present', 'Bedstemor': 'grandmother', 'Bedstefar': 'grandfather', 'Ven': 'friend', 'Leg': 'play',
  'Biograf': 'cinema', 'Bus': 'bus', 'Bil': 'car', 'Tog': 'train', 'Cykel': 'bicycle', 'Tur': 'excursion',
  'Skole': 'school', 'Ferie': 'holiday', 'Regntøj': 'raincoat', 'Bad': 'shower', 'Sove': 'sleep', 'Besøg': 'visit'
};

async function soegPiktogrammer(ord) {
  try {
    const svar = await fetch('https://api.arasaac.org/v1/pictograms/en/search/' + encodeURIComponent(ord.trim().toLowerCase()));
    if (!svar.ok) return [];
    return (await svar.json()).slice(0, 24).map(p => p._id);
  } catch { return []; }
}

// Billedvælger: piktogram (ARASAAC) eller eget foto. Returnerer {dele, vaerdi()}.
// naarValgt(dansk) kaldes når et piktogram vælges via en dansk genvej (fx til at udfylde en tekst).
function billedVaelger(start = {}, naarValgt = () => {}) {
  let piktogram = start.piktogram || null;
  let billede = start.billede || '';

  const valgt = el('div', 'valgt-billede');
  const tegnValgt = () => {
    valgt.replaceChildren();
    const url = piktogram ? PIKTO_URL(piktogram) : billede;
    if (!url) return;
    const img = el('img'); img.src = url; img.alt = 'Valgt billede';
    valgt.append(img, knap('Fjern billede', 'lille-knap', () => { piktogram = null; billede = ''; tegnValgt(); tegnResultater(sidste); }));
  };

  const resultater = el('div', 'pikto-grid');
  let sidste = [];
  let dansk = '';
  const tegnResultater = ids => {
    sidste = ids;
    resultater.replaceChildren(...ids.map(id => {
      const k = knap('', 'pikto' + (id === piktogram ? ' valgt' : ''), () => {
        piktogram = id; billede = ''; tegnValgt(); tegnResultater(sidste);
        naarValgt(dansk);
      });
      const img = el('img'); img.src = PIKTO_URL(id); img.alt = ''; img.loading = 'lazy';
      k.append(img);
      return k;
    }));
  };
  const status = el('p', 'hint');
  const soegeord = input('text', 'pikto-soeg', '', 'Søg (på engelsk), fx dentist = tandlæge');
  soegeord.enterKeyHint = 'search';
  const soeg = async (ord, daOrd) => {
    if (!ord) return;
    dansk = daOrd || '';
    status.textContent = 'Søger…';
    const ids = await soegPiktogrammer(ord);
    status.textContent = ids.length ? 'Tryk på et billede for at vælge det.' : 'Ingen billeder fundet. Prøv et andet ord på engelsk.';
    tegnResultater(ids);
  };
  const soegForm = el('form', 'tilfoj');
  soegForm.append(soegeord, el('button', 'knap', 'Søg'));
  soegForm.addEventListener('submit', e => { e.preventDefault(); soeg(soegeord.value.trim()); });

  const genveje = el('div', 'forslag');
  for (const [da, en] of Object.entries(PIKTO_GENVEJE)) {
    genveje.append(knap(da, null, () => { soegeord.value = en; soeg(en, da); }));
  }

  const fil = el('label', 'lille-knap fil-knap', 'Tag eller vælg eget foto');
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*';
  filInput.addEventListener('change', async () => {
    if (!filInput.files[0]) return;
    try { billede = await laesBillede(filInput.files[0]); piktogram = null; tegnValgt(); tegnResultater(sidste); } catch { status.textContent = 'Billedet kunne ikke læses.'; }
  });
  fil.append(filInput);

  tegnValgt();
  return {
    dele: [valgt, el('label', 'felt-label', 'Billede'), genveje, soegForm, status, resultater, fil,
      el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA')],
    vaerdi: () => ({ piktogram: piktogram || null, billede: piktogram ? '' : billede })
  };
}

// Vis et billede stort
// handlinger = {ret, slet} giver voksne knapper under billedet
function visStortBillede(url, tekst, handlinger = null) {
  const img = el('img', 'stort-billede hvid-bund');
  img.src = url; img.alt = tekst || '';
  const dele = [img];
  if (handlinger) {
    const knapper = el('div', 'ark-knapper');
    const slet = knap('Slet', 'knap fare', () => bekraeft(slet, handlinger.slet));
    slet.dataset.tekst = 'Slet';
    slet.dataset.handling = 'slette';
    knapper.append(slet, knap('Ret', 'knap', handlinger.ret));
    dele.push(knapper);
  }
  aabnArk(tekst || 'Billede', ...dele);
}

function redigerInfo(barn, iso, x) {
  const ny = !x.id;
  const tekst = input('text', 'info-tekst', x.tekst, 'Fx mormor henter, husk idrætstøj');
  const vaelger = billedVaelger(x, dansk => { if (!tekst.value.trim() && dansk) tekst.value = dansk; });

  // Kun denne dag eller hver uge på samme ugedag
  const ugedag = DAGE_LANG[(new Date((x.dato || iso) + 'T00:00').getDay() + 6) % 7].toLowerCase();
  let gentag = x.gentag === 'uge' ? 'uge' : '';
  const gentagValg = chipValg(['', 'uge'], gentag, v => { gentag = v; }, v => (v ? 'Hver ' + ugedag : 'Kun denne dag'));
  // Ny note: kan sættes på flere børns tavler på én gang
  const til = new Set([barn]);
  const tilValg = el('div', 'seg wrap');
  const tegnTil = () => tilValg.replaceChildren(...BOERN.map(b => {
    const k = knap(b, PK[b] || null, () => { if (til.has(b) && til.size > 1) til.delete(b); else til.add(b); tegnTil(); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', til.has(b));
    return k;
  }));
  tegnTil();
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    const b = vaelger.vaerdi();
    if (!t && !b.piktogram && !b.billede) { tekst.focus(); return; }
    const felter = { tekst: t, ...b, gentag };
    if (ny) for (const b of BOERN.filter(b => til.has(b))) await Data.add('info', { barn: b, dato: iso, ...felter });
    else await Data.update('info', x.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('info', x.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);

  const d = new Date(iso + 'T00:00');
  aabnArk((ny ? 'Det sker' : 'Ret') + ' · ' + barn + ', ' + DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase(),
    felt('Hvad sker der?', tekst), ny ? felt('Hvis tavle?', tilValg) : '', felt('Hvornår', gentagValg),
    x.gentag === 'uge' ? el('p', 'hint', 'Gentages hver ' + ugedag + '. Ændringer og sletning gælder alle ugerne.') : '',
    ...vaelger.dele, el('p', 'hint', ny ? 'Vises under "Det sker" på de valgte tavler og på familiens I dag.' : 'Vises på ' + barn + 's tavle under "Det sker" og på familiens I dag.'), knapper);
}

// "Ingenting": et måltid der springes over (gemmes som tekst, så det også kan gøres fast, fx ingen morgenmad om søndagen)
const INGEN_MAD = 'Ingenting';
// Vælg et måltid til et barn (direkte fra børnetavlen)
async function redigerMaaltid(barn, dato, felt) {
  const NAVN = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const plan = await madFor(dato, barn);
  const voksen = Data.bruger()?.rolle === 'voksen';
  const kanGoereFast = voksen && felt !== 'ret';
  const fastLabel = el('label', 'check');
  const fastTjek = el('input'); fastTjek.type = 'checkbox'; fastTjek.id = 'goer-fast';
  fastLabel.append(fastTjek, 'Gør det fast hver ' + DAGE_LANG[dag].toLowerCase());
  // Samme til de andre børn? (fx begge drenge skal have noget andet onsdag)
  const andre = voksen ? BOERN.filter(b => b !== barn) : [];
  const ogsaaLabel = el('label', 'check');
  const ogsaaTjek = el('input'); ogsaaTjek.type = 'checkbox'; ogsaaTjek.id = 'ogsaa-andre';
  ogsaaLabel.append(ogsaaTjek, 'Samme til ' + andre.join(' og '));
  const hvem = () => [barn, ...(ogsaaTjek.checked ? andre : [])];
  const vaelg = async v => {
    // "rester" / "rester fra i går" → vælg hvilken ret (bliver ikke en ret på listerne)
    if (ER_RESTER.test(v) && !/^♻️\s*Rester/.test(v)) {
      const fastNu = kanGoereFast && fastTjek.checked, ogsaa = ogsaaTjek.checked;
      return vaelgRester('♻️ Rester · ' + NAVN[felt].toLowerCase() + ' til ' + hvem().join(' og '), dato, {
        iGaar: /i\s*går/i.test(v) || felt !== 'ret',
        gem: async t => { ogsaaTjek.checked = ogsaa; fastTjek.checked = fastNu; await vaelg(t); }
      });
    }
    for (const b of hvem()) {
      await erstatOensker(b, isoDato(dato), felt);   // en voksens valg gælder frem for barnets ønske
      if (kanGoereFast && fastTjek.checked) {
        await gemFast(b, dag, felt, v);
        await gemMad(dag, felt, '', ugeIso, b);   // fjern evt. dagens undtagelse
      } else {
        await gemMad(dag, felt, v, ugeIso, b);
      }
    }
    lukArk(); tegnAlt();
  };

  const inp = input('text', 'maaltid-felt', plan.eget[felt] ? plan[felt] : '', 'Skriv selv');
  inp.setAttribute('list', DATALISTE[felt]);
  inp.enterKeyHint = 'done';
  const form = el('form', 'tilfoj');
  form.append(inp, el('button', 'knap', 'Vælg'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v) return;
    if (!ER_RESTER.test(v)) await gemFavorit(felt, v);   // rester bliver aldrig en ret på listerne
    vaelg(v);
  });

  const alleFavs = await Data.list('favoritter');
  const favs = alleFavs.filter(f => passerTil(f, felt)).map(f => f.tekst).sort((a, b) => a.localeCompare(b, 'da'));
  const chips = el('div', 'forslag');
  const kandidater = favs.map(v => {
    const k = knap('', null, () => vaelg(v));
    k.append(el('span', 'plus', '+'), v);
    if (v === plan[felt]) k.classList.add('valgt');
    chips.append(k);
    return [v.toLowerCase(), k];
  });
  // Skriver man i feltet, vises kun de retter der passer (lang liste)
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    for (const [t, k] of kandidater) k.hidden = !!q && !t.includes(q);
  });

  const knapper = el('div', 'ark-knapper');
  const terning = knap('', 'knap terning-knap', () => {
    const mulige = autoRetter(alleFavs, felt).map(r => r.tekst).filter(v => v !== plan[felt]);   // retter.js: ikke takeaway
    if (mulige.length) vaelg(mulige[Math.floor(Math.random() * mulige.length)]);
  });
  terning.innerHTML = IKON_TERNING + '<span>Slå med terningen</span>';
  knapper.append(terning);
  if (voksen && plan[felt] !== INGEN_MAD) knapper.append(knap('🚫 Ingenting', 'knap sekundaer-knap', () => vaelg(INGEN_MAD)));
  const standard = felt === 'ret' ? plan.faelles.ret : plan.fast[felt];
  if (plan.eget[felt]) {
    knapper.append(knap(felt === 'ret' ? 'Brug familiens' : 'Brug den faste', 'knap sekundaer-knap',
      async () => { for (const b of hvem()) await gemMad(dag, felt, '', ugeIso, b); lukArk(); tegnAlt(); }));
  }

  const forklaring = felt === 'ret'
    ? (standard ? 'Familiens madplan: ' + standard : 'Der står ikke noget i familiens madplan.')
    : (standard ? 'Fast hver ' + DAGE_LANG[dag].toLowerCase() + ': ' + standard : 'Der er ikke noget fast for ' + DAGE_LANG[dag].toLowerCase() + '.');
  aabnArk(NAVN[felt] + ' til ' + barn + ' · ' + DAGE_LANG[dag].toLowerCase(),
    el('p', 'hint', forklaring), andre.length ? ogsaaLabel : '', form, chips, kanGoereFast ? fastLabel : '', knapper);
}

// ---------- Madønsker fra børnene ----------
// Data: 'madoensker' {barn, dato 'ÅÅÅÅ-MM-DD', felt 'morgen'|'frokost'|'ret', ret, status 'afventer'|'godkendt'|'afvist'|'erstattet', besvaret?}
// De voksne markerer på listerne (favoritter.boernevalg), hvad børnene selv må vælge → så gælder valget med det samme.
// Alt andet er et ønske, en voksen skal godkende. Vælger en voksen selv maden den dag, bliver ønsket "erstattet".
// Databasen tjekker barnets ønsker (opdatering-madoensker.sql).
const MAD_NAVN = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
async function maaVaelges(felt) {
  return new Set((await Data.list('favoritter')).filter(f => passerTil(f, felt) && f.boernevalg).map(f => f.tekst.toLowerCase()));
}
// Gældende ønsker for et barn en dag: {felt: ønske} – og dem der venter: {felt: ønske}
async function madOensker(barn, iso) {
  const alle = (await Data.list('madoensker')).filter(x => x.barn === barn && x.dato === iso)
    .sort((a, b) => (a.oprettet || '').localeCompare(b.oprettet || ''));
  const gaelder = {}, venter = {};
  for (const felt of ['morgen', 'frokost', 'ret']) {
    const frit = await maaVaelges(felt);
    for (const x of alle.filter(x => x.felt === felt)) {
      // Frit valg (gælder med det samme): kun retter de voksne har markeret under "Hvad må børnene selv vælge?"
      const fri = x.status === 'afventer' && !x.tilbehoer && frit.has((x.ret || '').toLowerCase());   // kun retter de voksne har markeret som "vælg selv"
      if (x.status === 'godkendt' || fri) { gaelder[felt] = x; delete venter[felt]; }
      else if (x.status === 'afventer') venter[felt] = x;
    }
  }
  return { gaelder, venter };
}
// En voksen vælger selv maden → børnenes ønsker den dag (for det måltid) er erstattet
async function erstatOensker(barn, iso, felt) {
  for (const x of (await Data.list('madoensker')).filter(x => x.barn === barn && x.dato === iso && x.felt === felt && ['afventer', 'godkendt'].includes(x.status)))
    await Data.update('madoensker', x.id, { status: 'erstattet', besvaret: isoDato(new Date()) });
}

// Barnet trykker på et måltid på sin tavle
async function oenskMad(barn, dato, felt) {
  const iso = isoDato(dato);
  if (iso < isoDato(new Date())) return;   // ikke bagud i tiden
  const plan = await madFor(dato, barn);
  const { gaelder, venter } = await madOensker(barn, iso);
  const frit = [...(await maaVaelges(felt))];
  const favs = (await Data.list('favoritter')).filter(f => passerTil(f, felt) && f.boernevalg).map(f => f.tekst).sort((a, b) => a.localeCompare(b, 'da'));
  const mine = async () => (await Data.list('madoensker')).filter(x => x.barn === barn && x.dato === iso && x.felt === felt && x.status === 'afventer');
  const send = async (ret, frivalg) => {
    for (const x of await mine()) await Data.remove('madoensker', x.id);   // et nyt valg erstatter det gamle
    const r = await Data.add('madoensker', { barn, dato: iso, felt, ret, status: 'afventer' });
    lukArk(); tegnAlt();
    if (r) fejr(frivalg ? 'Godt valg! 😋' : 'Ønsket er sendt til mor og far 🍽️');   // fra sjov.js
  };
  const dele = [el('p', 'mad-nu', 'Nu: ' + (plan.visning[felt] || plan[felt] || 'ikke bestemt'))];
  if (venter[felt]) {
    const v = el('div', 'mad-venter');
    const vx = venter[felt];
    v.append(el('span', null, '⏳ Du har ønsket: ' + (vx.tilbehoer ? vx.tilbehoer : vx.ret)), knap('Fortryd', 'lille-knap', async () => { await Data.remove('madoensker', vx.id); lukArk(); tegnAlt(); }));
    dele.push(v);
  }
  const andet = [];
  if (favs.length) {
    const grid = el('div', 'mad-valg');
    for (const v of favs) {
      const b = knap(v, 'mad-valg-knap' + (v === plan[felt] ? ' valgt' : ''), () => send(v, true));
      grid.append(b);
    }
    andet.push(el('h3', 'lille-titel', 'Vælg selv'), grid);
  }
  // Retter barnet kan lide (♥ under Vores lister) – ét tryk = et ønske, uden at skrive
  const liker = [...new Set((await Data.list('favoritter')).filter(f => passerTil(f, felt) && !f.boernevalg && Array.isArray(f.kanLide) && f.kanLide.includes(barn))
    .map(f => f.tekst))].sort((a, b) => a.localeCompare(b, 'da'));
  if (liker.length) {
    const grid = el('div', 'mad-valg');
    for (const v of liker) grid.append(knap('♥ ' + v, 'mad-valg-knap' + (v === plan[felt] ? ' valgt' : ''), () => send(v, false)));
    andet.push(el('h3', 'lille-titel', 'Ønsk noget du kan lide'), grid);
  }
  const inp = input('text', 'mad-oenske', '', 'Skriv hvad du har lyst til');
  const form = el('form', 'oenske-form');   // ikke 'tilfoj' – de formularer er skjult for børn
  form.append(inp, el('button', 'knap', 'Ønsk'));
  form.addEventListener('submit', e => { e.preventDefault(); const t = inp.value.trim(); if (t) send(t, frit.includes(t.toLowerCase())); });
  andet.push(el('h3', 'lille-titel', favs.length ? 'Eller ønsk noget andet' : 'Ønsk noget'), form,
    el('p', 'hint', favs.length ? 'Det du vælger ovenfor, gælder med det samme. Andre ønsker skal mor eller far sige ja til.' : 'Mor eller far siger ja eller nej.'));
  dele.push(...andet);
  if (gaelder[felt] && gaelder[felt].status === 'afventer') {
    dele.push(knap('Fortryd mit valg', 'lille-knap', async () => { await Data.remove('madoensker', gaelder[felt].id); lukArk(); tegnAlt(); }));
  }
  aabnArk(MAD_NAVN[felt] + ' · ' + DAGE_LANG[(dato.getDay() + 6) % 7].toLowerCase(), ...dele);
}

// Voksne: hvad må børnene selv vælge? (markeres på listerne)
async function redigerBoernevalg() {
  const favs = await Data.list('favoritter');
  const dele = [el('p', 'hint', 'Det markerede kan børnene selv vælge på deres tavle – uden at spørge. Alt andet bliver et ønske, som I godkender under 🎁 Ønsker.')];
  for (const felt of ['morgen', 'frokost', 'ret']) {
    const seg = el('div', 'seg wrap');
    for (const f of favs.filter(x => passerTil(x, felt)).sort((a, b) => a.tekst.localeCompare(b.tekst, 'da'))) {
      const k = knap(f.tekst, null, async () => {
        f.boernevalg = !f.boernevalg;
        k.setAttribute('aria-checked', !!f.boernevalg);
        await Data.update('favoritter', f.id, { boernevalg: !!f.boernevalg });
      });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', !!f.boernevalg);
      seg.append(k);
    }
    if (!seg.children.length) seg.append(el('span', 'hint', 'Listen er tom – tilføj under "Vores lister".'));
    dele.push(el('h3', 'lille-titel', MAD_NAVN[felt]), seg);
  }
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', () => { lukArk(); tegnAlt(); }));
  aabnArk('🧒 Hvad må børnene selv vælge?', ...dele, knapper);
}

// Til 🎁 Ønsker hos de voksne
async function madOenskeLinjer() {
  const ventende = [];
  for (const x of (await Data.list('madoensker')).filter(x => x.status === 'afventer' && x.dato >= isoDato(new Date()))) {
    const { venter } = await madOensker(x.barn, x.dato);
    if (venter[x.felt]?.id === x.id) ventende.push(x);
  }
  return ventende.sort((a, b) => a.dato.localeCompare(b.dato)).map(x => {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    const d = new Date(x.dato + 'T00:00');
    info.append(el('span', 'beloen-navn', '🍽️ ' + x.barn + ' ønsker: ' + (x.tilbehoer ? x.ret + ' med ' + x.tilbehoer : x.ret)), el('span', 'beloen-pris', MAD_NAVN[x.felt] + ' · ' + DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '/' + (d.getMonth() + 1)));
    const kn = el('div', 'oenske-knapper');
    kn.append(knap('Nej', 'lille-knap', async () => { Data.huskFoer(x.id, 'Nej til ' + x.ret); await Data.update('madoensker', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); tegnAlt(); }),
      knap('Ja', 'lille-knap godkend', async () => { Data.huskFoer(x.id, 'Ja til ' + x.ret); await Data.update('madoensker', x.id, { status: 'godkendt', besvaret: isoDato(new Date()) }); tegnAlt(); }));
    li.append(info, kn);
    return li;
  });
}

// ---------- Fødselsdage og mærkedage ----------
// Data: 'foedselsdage' {navn, dato: 'ÅÅÅÅ-MM-DD', aarsdag?: true} eller {navn, maerkedag: 'DD-MM' | 'morsdag'}
//   aarsdag = fx bryllupsdag (viser antal år). Helligdage og almindelige mærkedage kommer fra dage.js
let visAlleFoed = false;
const VIS_FOED = 6;

function morsdag(aar) {  // 2. søndag i maj
  const d = new Date(aar, 4, 1);
  return new Date(aar, 4, 1 + ((7 - d.getDay()) % 7) + 7);
}
function datoIAar(f, aar) {
  if (f.maerkedag === 'morsdag') return morsdag(aar);
  if (f.dato) return new Date(aar, Number(f.dato.slice(5, 7)) - 1, Number(f.dato.slice(8, 10)));
  return new Date(aar, Number(f.maerkedag.slice(3, 5)) - 1, Number(f.maerkedag.slice(0, 2)));
}
function naesteGang(f, fra) {
  let d = datoIAar(f, fra.getFullYear());
  if (d < fra) d = datoIAar(f, fra.getFullYear() + 1);
  return d;
}
const alderPaa = (f, d) => (f.dato ? d.getFullYear() - Number(f.dato.slice(0, 4)) : null);
const foedIkon = f => (f.minde ? '🕯️ ' : f.dato ? (f.aarsdag ? '🎉 ' : '🇩🇰 ') : '');
const foedTekst = f => (f.indbygget ? f.ikon + ' ' + f.navn
  : f.minde ? '🕯️ ' + f.navn + ' · mindedag'
  : f.aarsdag && f.alder != null ? '🎉 ' + f.navn + ' · ' + f.alder + ' år'
  : f.alder != null ? '🇩🇰 ' + f.navn + ' fylder ' + f.alder : f.navn);
// Fødselsdage, årsdage og mærkedage den dag – inkl. helligdage/mærkedage fra dage.js
async function foedselsdageDen(iso, hvem = Data.bruger()?.navn) {
  const d = new Date(iso + 'T00:00');
  const valg = await valgFor(hvem);   // fra dage.js
  const egne = (await foedselsListe(hvem))
    .filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso)
    .map(f => ({ ...f, alder: alderPaa(f, d) }));
  return [...egne, ...indbyggedeDageDen(iso, egne, valg)];
}
const dagKlasse = f => (f.indbygget ? (f.hellig ? 'c-hellig' : 'c-dag') : 'c-foed');

async function tegnFoedselsdage() {
  const ul = document.getElementById('foed-liste');
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const alle = (await foedselsListe()).map(f => {
    const d = naesteGang(f, idag);
    return { f, d, dage: Math.round((d - idag) / 86400000), alder: alderPaa(f, d) };
  }).sort((a, b) => a.d - b.d || a.f.navn.localeCompare(b.f.navn, 'da'));

  ul.replaceChildren();
  if (!alle.length) ul.append(el('li', 'tom', 'Ingen fødselsdage endnu. Tryk "Tilføj".'));
  for (const r of (visAlleFoed ? alle : alle.slice(0, VIS_FOED))) {
    const li = el('li');
    const b = knap('', 'foed' + (r.dage === 0 ? ' idag' : ''), () => redigerFoed(r.f));
    const dato = el('span', 'foed-dato');
    dato.append(el('b', null, r.d.getDate()), el('small', null, MDR[r.d.getMonth()]));
    const midt = el('span', 'foed-midt');
    midt.append(el('span', 'foed-navn', r.f.navn),
      el('span', 'foed-under', r.f.minde ? '🕯️ Mindedag' : r.alder == null ? 'Mærkedag' : r.f.aarsdag ? '🎉 ' + r.alder + ' år' : '🇩🇰 Fylder ' + r.alder + ' år'));
    const naar = r.dage === 0 ? 'I dag' : r.dage === 1 ? 'I morgen' : 'Om ' + r.dage + ' dage';
    b.append(dato, midt, el('span', 'foed-naar', naar));
    li.append(b);
    ul.append(li);
  }
  const alleKnap = document.getElementById('foed-alle');
  alleKnap.hidden = alle.length <= VIS_FOED;
  alleKnap.textContent = visAlleFoed ? 'Vis færre' : 'Vis alle (' + alle.length + ')';
}
document.getElementById('foed-alle').addEventListener('click', () => { visAlleFoed = !visAlleFoed; tegnFoedselsdage(); });
document.getElementById('ny-foed').addEventListener('click', () => redigerFoed({}));

function redigerFoed(f) {
  if (f.person) return visPerson(f.person.id);   // fødselsdage fra familien rettes på personen (familie.js)
  if (erBarn()) return;
  const ny = !f.id;
  const navn = input('text', 'foed-navn', f.navn, 'Fx Mormor');
  const knapper = el('div', 'ark-knapper');
  const fejl = el('p', 'fejl'); fejl.hidden = true;

  // Mors dag beregnes automatisk og har ingen dato at rette
  if (f.maerkedag === 'morsdag') {
    const gem = knap('Gem', 'knap', async () => {
      if (!navn.value.trim()) { navn.focus(); return; }
      await Data.update('foedselsdage', f.id, { navn: navn.value.trim() });
      lukArk(); tegnAlt();
    });
    knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('foedselsdage', f.id); lukArk(); tegnAlt(); }), gem);
    aabnArk('Mærkedag', felt('Navn', navn), el('p', 'hint', 'Mors dag falder 2. søndag i maj og beregnes automatisk.'), knapper);
    return;
  }

  const aar = new Date().getFullYear();
  const startDato = f.dato || (f.maerkedag ? aar + '-' + f.maerkedag.slice(3, 5) + '-' + f.maerkedag.slice(0, 2) : '');
  const dato = input('date', 'foed-dato', startDato);
  let slags = f.maerkedag ? 'maerkedag' : f.aarsdag ? 'aarsdag' : 'foed';
  const datoFelt = felt(slags === 'foed' ? 'Født' : 'Dato', dato);
  const slagsValg = chipValg(['foed', 'aarsdag', 'maerkedag'], slags, v => {
    slags = v; datoFelt.querySelector('label, .felt-label') && (datoFelt.querySelector('label, .felt-label').textContent = v === 'foed' ? 'Født' : 'Dato');
  }, v => ({ foed: '🇩🇰 Fødselsdag', aarsdag: '🎉 Årsdag', maerkedag: 'Mærkedag (uden år)' })[v]);

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    if (!dato.value) { fejl.textContent = 'Vælg en dato.'; fejl.hidden = false; return; }
    const felter = slags === 'maerkedag'
      ? { navn: n, maerkedag: dato.value.slice(8, 10) + '-' + dato.value.slice(5, 7), dato: null, aarsdag: false }
      : { navn: n, dato: dato.value, maerkedag: null, aarsdag: slags === 'aarsdag' };
    if (ny) await Data.add('foedselsdage', felter); else await Data.update('foedselsdage', f.id, felter);
    lukArk(); tegnAlt();
  });
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('foedselsdage', f.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny fødselsdag eller mærkedag' : 'Ret ' + (f.aarsdag ? 'årsdag' : f.dato ? 'fødselsdag' : 'mærkedag'), felt('Navn', navn), felt('Slags', slagsValg), datoFelt,
    el('p', 'hint', 'Årsdag = fx bryllupsdag – viser hvor mange år. Helligdage, jul, halloween osv. kommer automatisk.'), fejl, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// ---------- I dag – overblik ----------
// Familien = et hurtigt blik: "hvad skal vi være opmærksomme på i dag?" (ombygget 2026-10-20c efter Timmos ønske).
// Rækkefølge: (sedler/ønsker der venter) → Kalender i dag → Skole → Aftensmad → To do der haster → Børnene i dag (fra kl. 16)
// → konkurrence → mine pligter → indkøbslinje. Kort uden indhold vises ikke.
//
// Skolekortet skifter efter tidspunktet (`skoleOverblik`):
//   kl. 0–9.30   "☀️ Skole i dag"    – mødetid og madpakke pr. barn (særlig dag)
//   kl. 9.30–18  "🏫 Skole i dag"    – kun børn, der stadig er i skole: "fri 14.45"
//   kl. 18–24    "🌙 Skole i morgen" – morgendagens mødetid, særlig dag og husk-noter
// Børn uden skole den dag (weekend, ferie, helligdag, syg, fast fridag) står der ikke. Ingen børn = intet kort.
function skoleDel() {
  const d = new Date(), m = d.getHours() * 60 + d.getMinutes();
  return m < 570 ? 'morgen' : m < 1080 ? 'dag' : 'aften';
}
async function skoleOverblik() {
  const del = skoleDel();
  const nu = new Date(), nuMin = nu.getHours() * 60 + nu.getMinutes();
  const dato = new Date(); if (del === 'aften') dato.setDate(dato.getDate() + 1);
  const iso = isoDato(dato), dagNr = (dato.getDay() + 6) % 7;
  if (dagNr >= 5 || helligdagDen(iso)) return null;   // dage.js
  const kal = await Data.list('kalender'), infoAlle = await Data.list('info');
  const linjer = [];
  for (const barn of BOERN) {
    if (friDen(kal, iso, barn) || (typeof fastFri === 'function' && await fastFri(barn, dagNr))) continue;   // ferie, fri, syg, fast fridag
    const sd = await skoleDag(barn, iso, kal);   // skoledag.js
    if (!sd.timer.length && !sd.start) continue;   // intet skema lagt ind
    const tidlig = aftalerDen(kal, iso, [barn]).find(a => a.type === 'tidlig' && a.tid);
    const friMin = [sd.slut ? tidSomMin(sd.slut)[0] : null, tidlig ? tidSomMin(visTid(tidlig.tid))[0] : null].filter(x => x != null).sort((a, b) => a - b)[0];
    const startMin = sd.start ? tidSomMin(sd.start)[0] : null;
    const dele = [];
    if (sd.saerlig && skoledagMaerke(sd.saerlig)) dele.push('🏫 ' + skoledagTitel(sd.saerlig));
    if (del === 'dag') {
      if (friMin == null || friMin <= nuMin) continue;   // har allerede fri
      dele.push('fri ' + tilKl(friMin) + (tidlig ? ' ⏰' : ''));
    } else {
      if (startMin != null) dele.push('møder ' + tilKl(startMin));
      if (friMin != null) dele.push('fri ' + tilKl(friMin) + (tidlig ? ' ⏰' : ''));
      if (del === 'morgen') {
        // "Madpakke" kun når skolen slutter efter kl. 12 – ellers spiser barnet frokost hjemme
        const m = await madFor(dato, barn);
        if (m.frokost && m.frokost !== INGEN_MAD) dele.push((friMin == null || friMin > 12 * 60 ? 'madpakke: ' : 'frokost: ') + (m.visning?.frokost || m.frokost));
      } else {
        // I morgen: husk-noterne (i dag står de allerede i Kalender i dag)
        for (const x of infoDen(infoAlle, barn, iso)) dele.push(/^husk\b/i.test(x.tekst || '') ? x.tekst : 'husk: ' + x.tekst);
      }
    }
    const li = el('li', PK[barn] || '');
    li.append(el('span', 'prik'), el('b', null, barn + ': '), dele.join(' · '));
    linjer.push(li);
  }
  if (!linjer.length) return null;
  return { titel: del === 'morgen' ? '☀️ Skole i dag' : del === 'dag' ? '🏫 Skole i dag' : '🌙 Skole i morgen · ' + DAGE_LANG[dagNr].toLowerCase(), linjer };
}
// Skolekortet ændrer sig hen over dagen (fri-tider, morgen/aften): tegn Familien igen hvert 5. minut, hvis noget er ændret
let skoleSidst = '';
setInterval(async () => {
  if (document.body.dataset.tilstand !== 'klar' || Data.bruger()?.rolle !== 'voksen' || tavleVisning !== 'familie' || document.hidden) return;
  if (!document.getElementById('ark')?.hidden) return;   // et åbent ark får lov at være i fred
  const s = await skoleOverblik().catch(() => null), n = s ? s.titel + s.linjer.map(l => l.textContent).join('|') : '';
  const boernFra16 = new Date().getHours() >= 16;
  if (n === skoleSidst && boernFra16 === document.body.classList.contains('ov-aften')) return;
  tegnOverblik();
}, 300000);

async function tegnOverblik() {
  tegnTavleValg();
  const erBoernetavle = tavleVisning !== 'familie';
  document.getElementById('familie-overblik').hidden = erBoernetavle;
  document.getElementById('boernetavle').hidden = !erBoernetavle;
  if (!erBoernetavle) lukZoom();
  document.body.classList.toggle('cool', erBoernetavle && (await valgFor(tavleVisning)).stil === 'cool');
  if (erBoernetavle) {
    return tegnBoernetavle(tavleVisning);
  }
  const idag = idagNr();

  // Køleskabssedler til mig og svar på dem, jeg har sendt (seddel.js)
  const ovSedler = document.getElementById('ov-sedler');
  if (ovSedler && typeof voksenSedler === 'function') { const v = await voksenSedler(); ovSedler.replaceChildren(...(v ? [v] : [])); ovSedler.hidden = !v; }
  // 📌 Huskesedler på tavlen (mappe.js)
  const ovNoter = document.getElementById('ov-noter');
  if (ovNoter && typeof tavleNoter === 'function') { const v = tavleNoter(); ovNoter.replaceChildren(...(v ? [v] : [])); ovNoter.hidden = !v; }
  const ovLink = document.getElementById('ov-seddel-link');
  if (ovLink && typeof seddelSkrivLink === 'function') {
    const l = await seddelSkrivLink(null), h = typeof huskeseddelLink === 'function' ? huskeseddelLink() : null;
    ovLink.replaceChildren(...[l, h].filter(Boolean)); ovLink.classList.toggle('to-links', !!(l && h));
  }

  // ⏸ Pauser for børnene (pause.js) – øverst, så man husker at slå dem fra
  let ovPause = document.getElementById('ov-pause');
  if (!ovPause) { ovPause = el('div'); ovPause.id = 'ov-pause'; document.getElementById('ov-oensker').before(ovPause); }
  const pb = typeof pauseBaand === 'function' && !erBarn() ? pauseBaand() : null;
  ovPause.replaceChildren(...(pb ? [pb] : [])); ovPause.hidden = !pb;

  // Mine egne pligter (kun for voksne – fra mere.js)
  // Børnenes ønsker om at indløse belønninger – venter på en voksen
  const oensker = document.getElementById('ov-oensker');
  const oenskeIndhold = await oenskerIndhold();   // fra mere.js
  oensker.replaceChildren(...oenskeIndhold);
  oensker.hidden = !oenskeIndhold.length;

  // Én linje pr. barn (mere.js) – kun fra kl. 16, hvor pligterne bliver lavet
  const ovBoern = document.getElementById('ov-boern');
  const aften = new Date().getHours() >= 16;
  document.body.classList.toggle('ov-aften', aften);
  if (ovBoern) { const bk = aften ? await boernLinjerKort() : null; ovBoern.replaceChildren(...(bk ? [...bk.childNodes] : [])); ovBoern.hidden = !bk; }
  // 🚴 Ugens konkurrence – vises, når nogen har skrevet km i denne uge (sjov.js)
  let ovKonk = document.getElementById('ov-konk');
  if (!ovKonk && ovBoern) { ovKonk = el('div'); ovKonk.id = 'ov-konk'; ovBoern.after(ovKonk); }
  if (ovKonk) { const kk = await konkKort(null); ovKonk.replaceChildren(...(kk ? [kk] : [])); ovKonk.hidden = !kk; }


  const minePladser = document.getElementById('ov-mine-pligter');
  const mine = await minePligterKort();
  minePladser.replaceChildren(...(mine ? [...mine.childNodes] : []));
  minePladser.hidden = !mine;

  // Kalender i dag og i morgen
  const aftaler = await kalenderAftaler();
  const iDagIso = isoDato(new Date());
  const imorgenDato = new Date(); imorgenDato.setDate(imorgenDato.getDate() + 1);
  const iMorgenIso = isoDato(imorgenDato);
  const ovKal = document.getElementById('ov-kal');
  ovKal.replaceChildren();
  const dagens = iDagsListe(aftaler, iDagIso);
  const foedIdag = await foedselsdageDen(iDagIso);
  for (const f of foedIdag) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', null, foedTekst(f)));
    ovKal.append(li);
  }
  // Børnenes noter fra "Det sker" på deres tavler (fx "Husk idrætstøj")
  const alleInfo = await Data.list('info');
  const noter = BOERN.flatMap(b => infoDen(alleInfo, b, iDagIso).map(x => ({ b, x })));
  if (!dagens.length && !foedIdag.length && !noter.length) ovKal.append(el('li', null, 'Intet i kalenderen i dag'));
  for (const a of dagens) {
    const li = el('li', aftaleFarve(a));
    li.append(el('span', 'prik'), el('span', null, tidTekst(a) + a.titel + laas(a) + ' · ' + personerI(a).join(', ')));
    ovKal.append(li);
  }
  const samlet = new Map();
  for (const { b, x } of noter) {
    const n = x.tekst || 'Se billedet på tavlen';
    samlet.set(n, [...(samlet.get(n) || []), b]);
  }
  for (const [n, hvem] of samlet) {
    const li = el('li', hvem.length > 1 ? 'c-faelles' : PK[hvem[0]]);
    li.append(el('span', 'prik'), el('span', null, '📌 ' + n + ' · ' + hvem.join(' og ')));
    ovKal.append(li);
  }
  const morgen = iDagsListe(aftaler, iMorgenIso);
  const morgenTekster = [
    ...(await foedselsdageDen(iMorgenIso)).map(foedTekst),
    ...morgen.map(a => tidTekst(a) + a.titel + ' (' + personerI(a).join(', ') + ')')
  ];
  document.getElementById('ov-kal-imorgen').textContent = morgenTekster.length ? 'I morgen: ' + morgenTekster.join(', ') : '';
  // Solopgang og solnedgang (sted kan sættes under forbogstav-knappen)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const sol = mineValg.sol ? solTider(new Date(), await familieSted()) : null;   // fra dage.js
  const ovSol = document.getElementById('ov-sol'), ovVejr = document.getElementById('ov-vejr');
  ovSol.replaceChildren(...(sol ? [solSpan(sol)] : []));
  ovVejr.replaceChildren();
  // Vejret hentes i baggrunden; er linjen kort, kommer solen med på samme linje
  if (mineValg.vejr) vejrLinje().then(t => {   // fra vejr.js
    if (!t) return;
    if (sol && t.length <= 34) { ovSol.replaceChildren(); ovVejr.replaceChildren(t + '  ·  ', solSpan(sol)); }
    else ovVejr.textContent = t;
  });

  const idagMad = await madFor(new Date());
  const ret = idagMad.visning.ret || idagMad.ret;
  const retEl = document.getElementById('ov-ret');
  retEl.textContent = ret || 'Ikke bestemt endnu';
  retEl.classList.toggle('tom-ret', !ret);
  const imorgenMad = await madFor(imorgenDato);
  const imorgen = imorgenMad.visning.ret || imorgenMad.ret;
  // Drengenes egne valg til aftensmad (afvigelser fra familiens)
  const afvigelser = async dato => (await Promise.all(BOERN.map(async b => [b, await madFor(dato, b)])))
    .filter(([, m]) => m.eget.ret || m.oenske?.ret || m.venter?.ret)
    .map(([b, m]) => b + ': ' + (m.eget.ret || m.oenske?.ret ? m.ret : '⏳ ønsker ' + m.venter.ret));
  const idagAfv = await afvigelser(new Date());
  const afvEl = document.getElementById('ov-ret-boern');
  afvEl.replaceChildren(...idagAfv.map(t => el('span', 'afvigelse', t)));
  afvEl.hidden = !idagAfv.length;
  const morgenAfv = await afvigelser(imorgenDato);
  document.getElementById('ov-ret-imorgen').textContent = imorgen || morgenAfv.length
    ? 'I morgen: ' + (imorgen || 'ikke bestemt') + (morgenAfv.length ? ' (' + morgenAfv.join(', ') + ')' : '')
    : '';

  // Skole – skifter hen over dagen (skoleOverblik); intet kort, når ingen har skole
  const skoleKort = document.getElementById('ov-skole-kort');
  const so = await skoleOverblik();
  skoleSidst = so ? so.titel + so.linjer.map(l => l.textContent).join('|') : '';
  skoleKort.hidden = !so;
  if (so) {
    document.getElementById('ov-skole-label').textContent = so.titel;
    document.getElementById('ov-skole').replaceChildren(...so.linjer);
  }

  // To do: kun det, der SKAL gøres i dag eller er over tid (resten ligger under To do)
  const haster = (await Data.list('todo')).filter(p => !p.klaret && p.frist && p.frist <= iDagIso)
    .sort((a, b) => a.frist.localeCompare(b.frist) || a.prio - b.prio);
  const ovTodo = document.getElementById('ov-todo');
  ovTodo.replaceChildren(...haster.slice(0, 5).map(p => {
    const li = el('li', p.hvem ? PK[p.hvem] : 'p' + p.prio);
    li.append(el('span', 'prik'), el('span', null, p.tekst), el('span', 'todo-ekstra' + (p.frist < iDagIso ? ' over-tid-tekst' : ''), ' · ' + [p.hvem, p.frist < iDagIso ? fristTekst(p.frist).tekst : 'i dag'].filter(Boolean).join(' · ')));
    return li;
  }));
  document.getElementById('ov-todo-kort').hidden = !haster.length;
  document.getElementById('ov-todo-antal').textContent = haster.length > 5 ? '+' + (haster.length - 5) + ' mere ›' : 'To do ›';

  // Indkøb: én lille linje (tallet står også i bundmenuen)
  const varer = (await Data.list('indkob')).filter(p => !p.klaret);
  const ovInd = document.getElementById('ov-indkob');
  ovInd.hidden = !varer.length;
  const vigtige = varer.filter(v => v.vigtig).length;
  ovInd.textContent = '🛒 ' + varer.length + (varer.length === 1 ? ' vare' : ' varer') + ' på indkøbslisten' + (vigtige ? ' · ' + vigtige + ' vigtig' + (vigtige > 1 ? 'e' : '') : '') + ' ›';
}

// ---------- Eksempler første gang ----------
// ---------- Startlister (lægges ind én gang for hele familien) ----------
async function laegStartlisterInd() {
  const favs = await Data.list('favoritter');
  const start = {
    ret: ['Lasagne', 'Tarteletter', 'Fiskefrikadeller', 'Hjemmelavet pizza', 'Burgere', 'Kylling i ovn',
      'Frikadeller med kartofler', 'Spaghetti med kødsovs', 'Boller i karry', 'Biksemad', 'Tacos',
      'Pasta carbonara', 'Hakkebøf med bløde løg', 'Millionbøf med kartoffelmos', 'Wok med nudler',
      'Laks med ris', 'Pandekager', 'Chili con carne', 'Fiskefilet med remoulade', 'Medisterpølse med kartofler',
      'Grøntsagssuppe med brød', 'Burritos', 'Karbonader', 'Rester'],
    morgen: ['Havregryn', 'Havrefras', 'Cornflakes', 'Yoghurt med müsli', 'Rugbrød med ost', 'Toast',
      'Pandekager', 'Æg og bacon', 'Grød', 'Smoothie', 'Boller'],
    frokost: ['Madpakke', 'Rugbrød med pålæg', 'Rester fra i går', 'Toast', 'Pastasalat', 'Wraps',
      'Pitabrød', 'Suppe', 'Boller med ost', 'Frikadeller og rugbrød'],
    indkob: ['Mælk', 'Rugbrød', 'Toastbrød', 'Smør', 'Ost', 'Pålæg', 'Æg', 'Bananer', 'Æbler', 'Agurk',
      'Gulerødder', 'Kaffe', 'Yoghurt', 'Havregryn', 'Pasta', 'Ris', 'Hakket oksekød', 'Kylling',
      'Toiletpapir', 'Opvasketabs', 'Gulerødder til Alfie', 'Hø til Alfie'],
    todo: ['Skift Alfies hø', 'Betal SFO', 'Smør madpakker', 'Vask tøj', 'Tøm opvaskemaskinen', 'Støvsug', 'Sæt skraldespanden ud'],
    butik: ['Netto', 'Rema 1000', 'Lidl', 'Føtex', 'Bilka', 'Coop 365']
  };
  // Kun typer der slet ikke findes endnu (så nye lister kommer med uden at gamle fordobles)
  const raekker = [];
  for (const [type, liste] of Object.entries(start)) {
    if (favs.some(f => f.type === type)) continue;
    for (const tekst of liste) raekker.push({ type, tekst, brugt: 0 });
  }
  if (raekker.length) await Data.addMange('favoritter', raekker);
}

// ---------- Fejlbesked hvis noget ikke kunne gemmes ----------
let statusTimer;
// Kort besked nederst. fejl = rød (noget gik galt); ellers neutral
function visStatus(tekst, fejl = false) {
  const s = document.getElementById('status');
  s.textContent = tekst;
  s.classList.toggle('fejl-status', fejl);
  s.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (s.hidden = true), 5000);
}
window.addEventListener('unhandledrejection', e => {
  console.error(e.reason);
  visStatus(navigator.onLine ? 'Noget gik galt – ændringen blev måske ikke gemt.' : 'Ingen forbindelse – ændringen blev ikke gemt.', true);
});

// ---------- Børn: tavlen er mest til at kigge på ----------
// Databasen (barn_vagt i SQL) bestemmer, hvad børn må gemme. Her er den venlige udgave på siden:
// knapper skjules, og prøver man alligevel, kommer en kort besked i stedet for en fejl.
// Børn må: sætte flueben på egne pligter, ønske at indløse en belønning, skrive egne km,
// markere hvad de selv kan lide (hjerter) og tilføje til indkøbslisten (og slette det, de selv har tilføjet).
const erBarn = () => Data.bruger()?.rolle === 'barn';
function barnMaa(handling, liste, felter, gammel) {
  const navn = Data.bruger()?.navn;
  if (handling === 'ny') {
    if (liste === 'flueben') return felter.barn === navn;
    if (liste === 'streakbonus' || liste === 'streakjoker') return felter.barn === navn;
    if (liste === 'makker_snak') return felter.barn === navn;   // makkerens replikker (databasen tjekker resten – makker_snak_ok)
    if (liste === 'ekstra') return felter.barn === navn && felter.status === 'afventer';   // databasen tjekker antal (ekstra_ok)
    if (liste === 'madoensker') return felter.barn === navn && felter.status === 'afventer';   // databasen tjekker resten (madoensker_ok)   // databasen tjekker selve reglen (streakbonus_ok / streakjoker_ok)
    if (liste === 'indloesninger') return felter.barn === navn && felter.status === 'afventer';
    if (liste === 'motion') return felter.hvem === navn;
    if (liste === 'personvalg') return felter.navn === navn;
    if (liste === 'sedler') return felter.fra === navn && VOKSNE.includes(felter.til) && !felter.stjerner;   // seddel til en voksen (seddel.js)
    return liste === 'indkob';
  }
  if (!gammel) return false;
  if (handling === 'ret') {
    if (liste === 'personvalg') return gammel.navn === navn && (!('navn' in felter) || felter.navn === navn);
    if (liste === 'makker_snak') return gammel.barn === navn && (!('barn' in felter) || felter.barn === navn);
    if (liste === 'sedler') return gammel.til === navn && Object.keys(felter).every(k => ['aabnet', 'reaktion', 'svarTekst', 'svaret'].includes(k));   // åbne og svare på egne sedler
    if (liste === 'jobs') {   // ekstra-job: tage et ledigt, melde det færdigt eller give det fra sig (databasen tjekker det samme)
      if (Object.keys(felter).some(k => k !== 'status' && k !== 'barn' && k !== 'antal')) return false;
      if ('antal' in felter && !(felter.status === 'klaret' && Number(felter.antal) >= 0)) return false;   // antal kun når et pr.-stk.-job meldes klaret
      if (gammel.status === 'ledig') return felter.status === 'taget' && felter.barn === navn && (!gammel.til || gammel.til === navn);
      if (gammel.status === 'taget' && gammel.barn === navn) return (felter.status === 'klaret' && (!('barn' in felter) || felter.barn === navn)) || (felter.status === 'ledig' && !felter.barn);
      return false;
    }
    if (liste !== 'favoritter' || Object.keys(felter).some(k => k !== 'kanLide')) return false;
    const foer = new Set(gammel.kanLide || []), efter = new Set(felter.kanLide || []);
    return [...foer, ...efter].every(n => n === navn || (foer.has(n) && efter.has(n)));
  }
  if (liste === 'flueben' || liste === 'streakbonus') return gammel.barn === navn;
  if (liste === 'motion') return gammel.hvem === navn;
  if (liste === 'indloesninger' || liste === 'ekstra' || liste === 'madoensker') return gammel.barn === navn && gammel.status === 'afventer';
  if (liste === 'indkob') return gammel._af === Data.bruger()?.id;
  if (liste === 'sedler') return gammel.fra === navn;   // tage sin egen seddel ned igen
  return false;
}
function laasForBoern() {
  document.body.classList.add('barn');
  const orig = { add: Data.add, addMange: Data.addMange, update: Data.update, remove: Data.remove };
  const nej = () => { visStatus('Det kan kun de voksne ændre 🙂'); return null; };
  const find = async (liste, id) => (await Data.list(liste)).find(x => x.id === id);
  Data.add = async (liste, f) => (barnMaa('ny', liste, f) ? orig.add(liste, f) : nej());
  Data.addMange = async (liste, fl) => (fl.every(f => barnMaa('ny', liste, f)) ? orig.addMange(liste, fl) : nej());
  Data.update = async (liste, id, f) => (barnMaa('ret', liste, f, await find(liste, id)) ? orig.update(liste, id, f) : nej());
  Data.remove = async (liste, id) => (barnMaa('slet', liste, null, await find(liste, id)) ? orig.remove(liste, id) : nej());
  const origMange = Data.removeMange;
  Data.removeMange = async (liste, ids) => { for (const id of ids) if (!barnMaa('slet', liste, null, await find(liste, id))) return nej(); return origMange(liste, ids); };
}

// Syg / fri fra skolen / tidligere fri – gemmes som en kalenderaftale for barnet
function redigerFravaer(barn, iso, x) {
  let type = erOff(x) ? 'off' : x?.type || 'syg';
  const tid = input('time', 'fravaer-tid', x?.tid || '12:00');
  const til = input('date', 'fravaer-til', x?.tilDato || '');
  const note = input('text', 'fravaer-note', x?.note || '', 'Fx feber, tandlæge, mormor henter');
  const tidFelt = felt('Fri kl.', tid);
  const tilFelt = felt('Til og med (hvis flere dage)', til);
  const vis = () => { tidFelt.hidden = type !== 'tidlig'; tilFelt.hidden = type === 'tidlig'; };
  // 🌿 Off-dag ligger lige efter Syg (gemmes som syg + off – se erOff)
  const VALG = ['syg', 'off', 'hjemme', 'tidlig'];
  const valg = chipValg(VALG, type, v => { type = v; vis(); }, v => (v === 'off' ? '🌿 Off-dag' : FRAVAER[v].knap));
  vis();
  const d = new Date(iso + 'T00:00');
  const gem = knap('Gem', 'knap', async () => {
    const off = type === 'off', gemType = off ? 'syg' : type;
    const felter = {
      dato: x?.dato || iso, hvem: barn, titel: off ? 'Off-dag' : FRAVAER[gemType].titel, type: gemType, off,
      fri: type !== 'tidlig',
      tid: type === 'tidlig' ? tid.value : '', slut: '',
      tilDato: type !== 'tidlig' && til.value && til.value > (x?.dato || iso) ? til.value : null,
      note: note.value.trim(), gentag: '', gentagTil: null
    };
    if (x) await Data.update(kalListe(x), x.id, felter); else await Data.add('kalender', felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (x) knapper.append(knap('Fjern', 'knap fare', async () => { await Data.remove(kalListe(x), x.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  // Særlig skoledag (program, ændrede tider, noter til fag) har sit eget ark – skoledag.js
  const saerlig = skoledagDen(Data.listNu ? Data.listNu('kalender') : [], iso, barn);
  const saerKnap = x ? '' : knap(saerlig ? '🏫 Ret ' + skoledagTitel(saerlig) : '✏️ Særlig skoledag – skriv selv (program, tider, note til et fag)', 'lille-knap sd-vej',
    () => { lukArk(); redigerSkoledag(barn, iso, saerlig?._rediger || saerlig); });
  const beskedKnap = x ? '' : knap('✨ Læs en besked fra skolen med AI (Aula, sms, foto)', 'lille-knap sd-vej sd-ai', () => { lukArk(); aabnAI({ opgave: 'skole', boern: [barn] }); });
  aabnArk(barn + ' · ' + DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '/' + (d.getMonth() + 1),
    felt('Hvad', valg), tidFelt, tilFelt, felt('Note (valgfri)', note),
    el('p', 'hint', 'Står i kalenderen, og skemaet på tavlen viser det. 🌿 Off-dag = hjemme, men ikke syg – vises roligt på tavlen. Hverken syg eller off-dag bryder dage i træk.'), beskedKnap, saerKnap, knapper);
}

// "Tilpas": hvad hver person vil se (helligdage, mærkedage, sol, vejr). Børn retter kun deres egne.
// ---------- Indstillinger: ét sted for alt det, man kan tilpasse ----------
// Åbnes fra forbogstav-knappen øverst til højre.
//  1) Hvad der vises (for mig – og for børnene, hvis man er voksen): helligdage, mærkedage, sol, vejr, nedtælling, faner
//  2) Udseende (kun denne enhed)   3) By til vejr og sol (voksne)   4) Hjælp   5) Log ud
// Download en kopi af alle data som JSON-fil (familietavlen-kopi-ÅÅÅÅ-MM-DD.json)
function gemBackup() {
  const data = Data.eksport();
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'familietavlen-kopi-' + isoDato(new Date()) + '.json';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  lokal.set('backup-sidst', new Date().toISOString());
  visStatus('💾 Kopi gemt (' + data.antal + ' rækker) – find den i Overførsler/Filer');
}

// 📦 Fuld backup i én zip: alle data du kan se + filerne i Storage + appens kode (som den ligger på GitHub Pages)
let jszipLoefte = null;
function hentJsZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  return jszipLoefte ||= new Promise((ok, fejl) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    sc.onload = () => ok(window.JSZip); sc.onerror = () => { jszipLoefte = null; fejl(new Error('Kunne ikke hente zip-værktøjet')); };
    document.head.append(sc);
  });
}
async function fuldBackup() {
  const dato = isoDato(new Date());
  try {
    visStatus('📦 Gør backup klar …');
    const JSZip = await hentJsZip();
    const zip = new JSZip();
    const data = Data.eksport();
    zip.file('data/alle-data.json', JSON.stringify(data, null, 1));
    // Filer i Storage
    const filer = await Data.listFiler();
    let n = 0, fejlF = [];
    for (const f of filer) {
      visStatus('📦 Henter filer ' + (++n) + '/' + filer.length + ' …');
      try { zip.file('filer/' + f.sti, await Data.hentFil(f.sti)); } catch { fejlF.push(f.sti); }
    }
    // Koden: index.html + alt hvad den henter lokalt + ikoner og manifest
    let html = '';
    try { html = await (await fetch('index.html', { cache: 'no-store' })).text(); } catch { /* koden springes over */ }
    const lokale = [...html.matchAll(/(?:src|href)="([^"#:]+?)(?:\?[^"]*)?"/g)].map(m => m[1]).filter(x => !x.startsWith('//'));
    const kode = [...new Set(['index.html', ...lokale, 'sw.js', 'manifest.webmanifest', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'ikon-192.png', 'ikon-512.png', 'ikon-maskable-512.png'])];
    const kodeFejl = [];
    for (const k of kode) {
      try { const r = await fetch(k, { cache: 'no-store' }); if (!r.ok) throw 0; zip.file('kode/' + k, await r.blob()); } catch { kodeFejl.push(k); }
    }
    zip.file('LAES-MIG.txt', [
      'Familietavlen – backup ' + dato + ' (lavet af ' + data.bruger + ')', '',
      'data/alle-data.json  – alle rækker, ' + data.bruger + ' kunne se (' + data.antal + ' rækker). Andres private ting er ikke med.',
      'filer/               – filerne i Storage (' + (filer.length - fejlF.length) + ' filer): alle/, voksne/ og mine egne under mig/.',
      'kode/                – appen som den ligger på GitHub Pages (' + (kode.length - kodeFejl.length) + ' filer).', '',
      'Databasens opbygning (SQL-filerne) ligger i Claude-projektet "Familiesiden" under claude/sql.',
      ...(fejlF.length || kodeFejl.length ? ['', 'Kunne ikke hentes: ' + [...fejlF, ...kodeFejl].join(', ')] : [])].join('\r\n'));
    visStatus('📦 Pakker zip-filen …');
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'familietavlen-backup-' + dato + '.zip';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 20000);
    lokal.set('backup-sidst', new Date().toISOString());
    visStatus('📦 Backup hentet (' + data.antal + ' rækker, ' + (filer.length - fejlF.length) + ' filer, ' + (kode.length - kodeFejl.length) + ' kodefiler)' + (fejlF.length + kodeFejl.length ? ' – ' + (fejlF.length + kodeFejl.length) + ' kunne ikke hentes' : ''));
  } catch (e) { console.warn(e); visStatus('Backup kunne ikke laves – tjek forbindelsen', true); }
}

// Tænd/sluk-række (Indstillinger): tydeligt slået til/fra – i stedet for ens knapper (Winnie-testen 20/10)
function kontakt(tekst, til, fn, under = '') {
  const k = el('button', 'kontakt');
  k.type = 'button';
  k.setAttribute('role', 'switch');
  k.setAttribute('aria-checked', String(!!til));
  const t = el('span', 'kontakt-tekst', tekst);
  if (under) t.append(el('small', null, under));
  k.append(t, el('span', 'kontakt-skyder'));
  k.addEventListener('click', async () => { til = !til; k.setAttribute('aria-checked', String(til)); await fn(til); });
  return k;
}
const kontaktListe = (...r) => { const l = el('div', 'kontakt-liste'); l.append(...r.filter(Boolean)); return l; };
// Siderne under Mere (navn fra kortet) – til "Sider under Mere"
const mereSider = () => [...document.querySelectorAll('#mere .mere-kort[data-gaa]')].map(k => [k.dataset.gaa, k.querySelector('.mere-navn')?.textContent || k.dataset.gaa, k.classList.contains('kun-voksen')]);

// ---------- Indstillinger (ombygget 2026-10-20k) ----------
// Det vigtigste øverst med tænd/sluk-knapper; resten under "Avanceret" (foldet sammen).
// Voksen for sig selv: Udseende · Bundmenu og sider (faner + sider under Mere) · Vis i kalender og på I dag · Notifikationer · Avanceret.
// Voksen for et barn: Tavlen · Faner · Pause · Notifikationer · Avanceret. Barn for sig selv: Tavlen · Vis · Udseende.
async function aabnIndstillinger(hvem = Data.bruger()?.navn) {
  const mig = Data.bruger()?.navn;
  const voksen = !erBarn();
  const forMig = hvem === mig;
  const forBarn = BOERN.includes(hvem);
  const folk = erBarn() ? [mig] : [mig, ...BOERN.filter(b => b !== mig)];
  const valg = await valgFor(hvem);
  const saet = felt => async v => { valg[felt] = v; await saetValg(hvem, felt, v); tegnAlt(); };
  const titel = t => el('h3', 'lille-titel indst-titel', t);
  const dele = [];
  if (folk.length > 1) dele.push(el('label', 'felt-label', 'Indstillinger for'), chipValg(folk, hvem, v => aabnIndstillinger(v), v => (v === mig ? v + ' (mig)' : v)));
  const avanceret = [];

  // --- Tavlen (børn) ---
  if (forBarn) {
    dele.push(titel(voksen ? '👧 ' + hvem + 's tavle' : '🧒 Min tavle'));
    if (voksen) {
      const stilSeg = chipValg(['sjov', 'cool'], valg.stil === 'cool' ? 'cool' : 'sjov', async v => {
        await saetValg(hvem, 'stil', v);
        await saetValg(hvem, 'makker', v !== 'cool');   // Cool: ingen makker (kan slås til igen nedenfor)
        tegnAlt(); aabnIndstillinger(hvem);
      }, v => (v === 'cool' ? '😎 Cool' : '🎉 Sjov'));
      dele.push(stilSeg, el('p', 'hint', 'Cool: ingen konfetti, ingen makker og ingen billeder ved rutinerne.'));
    }
    dele.push(kontaktListe(
      kontakt('🐰 Makker', valg.makker, saet('makker')),
      kontakt('⏳ Nedtælling', valg.nedtaelling, saet('nedtaelling')),
      kontakt('🧩 Dagens gåde eller vits', valg.sjov, saet('sjov')),
      kontakt('🚴 Ugens konkurrence', valg.konk, saet('konk'))));
  }

  // --- Udseende (denne enhed) ---
  const temaValg = chipValg(Object.keys(TEMA_NAVN), lokal.get('tema') || 'auto', v => { lokal.set('tema', v); saetTema(v); }, v => TEMA_NAVN[v]);
  if (forMig) dele.push(titel('🎨 Udseende på denne enhed'), temaValg, el('p', 'hint', 'Automatisk følger telefonens lys/mørk.'));

  // --- Bundmenu og sider (voksen for sig selv) ---
  if (voksen && forMig) {
    const FANER_V = { kalender: 'Kalender', madplan: 'Madplan', indkob: 'Indkøb', todo: 'To do', pligter: 'Pligter' };
    const skjulte = new Set(Array.isArray(valg.skjulFaner) ? valg.skjulFaner : []);
    const faneListe = kontaktListe(...Object.entries(FANER_V).map(([f, navn]) => kontakt(navn, !skjulte.has(f), async til => {
      if (til) skjulte.delete(f); else skjulte.add(f);
      await saetValg(mig, 'skjulFaner', [...skjulte]); anvendFaner();
    })));
    const skjultMere = new Set(Array.isArray(valg.skjulMere) ? valg.skjulMere : []);
    const mereListe = kontaktListe(...mereSider().map(([f, navn]) => kontakt(navn, !skjultMere.has(f), async til => {
      if (til) skjultMere.delete(f); else skjultMere.add(f);
      await saetValg(mig, 'skjulMere', [...skjultMere]); anvendFaner();
    })));
    const mereBoks = el('details', 'indst-fold');
    mereBoks.append(el('summary', null, 'Sider under Mere' + (skjultMere.size ? ' (' + skjultMere.size + ' skjult)' : '')),
      el('p', 'hint', 'Slå de sider fra, du ikke bruger. De forsvinder ikke – "Vis alle sider" nederst under Mere viser dem igen.'), mereListe);
    dele.push(titel('📱 Bundmenu og sider'), el('label', 'felt-label', 'Faner i bunden'), faneListe,
      el('p', 'hint', 'I dag og Mere er der altid. Gælder kun dig – på alle dine enheder.'), mereBoks);
  }

  // --- Vis i kalender og på I dag ---
  const visListe = kontaktListe(
    kontakt('🎄 Helligdage', valg.helligdage, saet('helligdage')),
    kontakt('🎃 Mærkedage', valg.maerkedage, saet('maerkedage'), 'Halloween, mors dag, sommertid …'),
    kontakt('🌦️ Vejret', valg.vejr, saet('vejr')),
    kontakt('🌅 Solopgang og solnedgang', valg.sol, saet('sol')));
  if (forBarn && voksen) avanceret.push(el('label', 'felt-label', 'Vis i kalenderen og på tavlen'), visListe);
  else dele.push(titel(forBarn ? '📅 Vis på min tavle' : '📅 Vis i kalenderen og på I dag'), visListe);

  // --- Faner, pause og sedler for et barn (voksne) ---
  if (voksen && forBarn) {
    const faner = new Set(Array.isArray(valg.faner) ? valg.faner : BOERNE_FANER);
    dele.push(el('label', 'felt-label', 'Faner ' + hvem + ' kan se (tavlen er der altid)'),
      kontaktListe(...Object.entries(VALGBARE_FANER).map(([f, navn]) => kontakt(navn, faner.has(f), async til => {
        if (til) faner.add(f); else faner.delete(f);
        await saetValg(hvem, 'faner', Object.keys(VALGBARE_FANER).filter(x => faner.has(x)));
      }))),
      el('p', 'hint', 'Gælder, når ' + hvem + ' selv er logget ind.'));
    if (typeof redigerPause === 'function') {   // ⏸ pause.js
      const aktiv = pauseListe().find(p => (p.hvem === hvem || p.hvem === 'Begge') && (!p.til || p.til >= isoDato(new Date())));
      dele.push(el('label', 'felt-label', 'Pause'), knap(aktiv ? '⏸ ' + pauseTekst(aktiv) + ' – ret' : '⏸ Sæt ' + hvem + ' på pause …', 'lille-knap', () => redigerPause(aktiv || {}, hvem)));
    }
    const sk = kontakt('✉️ Må sende sedler og skrive svar', true, async til => { await saetRegel(hvem, 'sedler', til); tegnAlt(); },   // mere.js
      'Fra: kan stadig svare med en emoji');
    regelFor(hvem).then(r => sk.setAttribute('aria-checked', String(r.sedler)));
    avanceret.push(el('label', 'felt-label', 'Sedler'), kontaktListe(sk));
  }

  // --- Notifikationer ---
  if (typeof pushIndstilling === 'function' && forMig) dele.push(titel('🔔 Notifikationer på denne telefon'), pushIndstilling());
  if (typeof pushValg === 'function' && (forMig || voksen)) {
    const pv = el('details', 'indst-fold');
    pv.append(el('summary', null, 'Hvad giver besked til ' + (forMig ? 'dig' : hvem)), pushValg(hvem),
      el('p', 'hint', 'Gælder alle ' + (forMig ? 'dine' : hvem + 's') + ' telefoner, hvor notifikationer er slået til.'));
    if (forMig) dele.push(pv); else dele.push(titel('🔔 Notifikationer'), pv);
  }

  // --- Avanceret ---
  avanceret.push(el('label', 'felt-label', 'Andet'), kontaktListe(
    kontakt('👪 Familierelation ved fødselsdage', valg.relationer, saet('relationer'), 'Fx "Bente (mormor)"'),
    kontakt('😀 Automatisk emoji ved pligter og belønninger', valg.emoji, saet('emoji')),
    voksen && forMig ? kontakt('↩️ "Fortryd" efter sletning og svar', valg.fortryd, saet('fortryd'), 'Slettet kan altid findes under Mere → Aktivitet') : null));
  if (voksen && forMig) {
    avanceret.push(el('label', 'felt-label', 'Børnene kalder mig'), chipValg(['Far', 'Mor', ''], kaldValg(mig), async v => { await saetValg(mig, 'kaldes', v || 'navn'); tegnAlt(); }, v => v || 'Mit navn'));
    const stedKnap = knap('📍 Sted for vejr og sol …', 'lille-knap', () => vaelgSted());   // vejr.js
    familieSted().then(st => { stedKnap.textContent = '📍 Vejr og sol: ' + (st.navn || 'Ukendt sted') + ' – skift'; });
    avanceret.push(el('label', 'felt-label', 'Vejr og sol (hele familien)'), stedKnap);
    const sidst = lokal.get('backup-sidst');
    const dage = sidst ? Math.floor((Date.now() - new Date(sidst)) / 864e5) : null;
    avanceret.push(el('label', 'felt-label', '💾 Sikkerhedskopi'),
      knap('💾 Gem en kopi af alle data', 'lille-knap', () => gemBackup()),
      knap('📦 Hent fuld backup (data, filer og kode)', 'lille-knap', () => fuldBackup()),
      el('p', 'hint', (sidst ? 'Sidste kopi på denne enhed: ' + (dage === 0 ? 'i dag' : 'for ' + dage + (dage === 1 ? ' dag' : ' dage') + ' siden') + '. ' : 'Der er ikke gemt en kopi fra denne enhed endnu. ')
        + 'Gem en kopi en gang om måneden. Filen indeholder alt det, du kan se – også private ting – så gem den et sikkert sted.'));
  }
  const av = el('details', 'indst-fold indst-avanceret');
  av.append(el('summary', null, '⚙️ Avanceret'), ...avanceret);
  dele.push(av);

  dele.push(titel('❓ Hjælp'), knap('Sådan virker Familietavlen ›', 'lille-knap', () => { lukArk(); visFane('hjaelp'); window.scrollTo(0, 0); }));
  const knapper = el('div', 'ark-knapper');
  knapper.append(bekraeftKnap('Log ud', 'logge ud', 'knap fare', () => Data.logud()), knap('Færdig', 'knap', () => lukArk()));   // to tryk: ingen logger ud ved et uheld
  aabnArk('Indstillinger', ...dele,
    el('p', 'hint indst-bund', 'Logget ind som ' + mig + '. Du forbliver logget ind på denne enhed, indtil du logger ud.'), knapper);
}

// Visning af en aftale for børn (kun læse)
function visAftale(a, forekomst) {
  const dato = new Date((forekomst || a.dato) + 'T00:00');
  const linjer = [el('p', 'aftale-vis-dato', DAGE_LANG[(dato.getDay() + 6) % 7] + ' ' + dato.getDate() + '. ' + MDR_LANG[dato.getMonth()]
    + (a.tid ? ' · kl. ' + klTekst(a) : ''))];
  linjer.push(el('p', 'hint', 'Hvem: ' + personerI(a).join(', ')));
  if (a.note) linjer.push(el('p', null, a.note));
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap', () => lukArk()));
  aabnArk(a.titel, ...linjer, knapper);
}

// ---------- Korte "?"-tips pr. skærm (i stedet for den lange hjælpeside) ----------
const TIPS = {
  kalender: { voksen: ['Tryk på en dag for at se den – og på en aftale for at rette den.', 'Liste starter altid i dag – "Vis flere dage" nederst. Uge og Måned har ‹ ›.', 'Hvad der vises (helligdage, vejr …), vælges under forbogstav-knappen øverst til højre.', 'En aftale kan gælde én, flere eller Fælles. Fælles = hele familien.', '↻ betyder, at aftalen gentages.'],
    barn: ['Tryk på en dag for at se, hvad der sker.', 'Din farve viser dine aftaler.'] },
  madplan: { voksen: ['Skriv eller vælg en ret pr. dag. 🎲 vælger en tilfældig.', '⋯ ved en dag: 🎉 Vi er ude, ♻️ rester, 📌 fast hver uge, ⇅ flyt/byt med en anden dag. Skriver du "rester", kan du vælge hvilken ret.', '"✎ Tilpas" under en ret vælger fyld, tilbehør og ekstra.', 'Børnenes ønsker skal I sige ja/nej til på I dag.'],
    barn: ['Tryk på en dag for at ønske mad.', 'Det mor og far har sagt "må vælges", gælder med det samme.'] },
  indkob: { voksen: ['Skriv en vare og tryk Tilføj.', '🛒 Handle gør listen stor og nem i butikken.', 'Tryk på en vare for at krydse den af.'],
    barn: ['Skriv en vare, så kommer den på listen.'] },
  todo: { voksen: ['Små opgaver til de voksne. Sæt en person på, så står den på personens I dag.', 'Opgaver til et barn vises på barnets tavle.'],
    barn: ['Her står ting, der skal gøres.'] },
  pligter: { voksen: ['Vælg barnet øverst.', 'Ønsker om belønninger, 👍-pligter og ekstra-job godkendes på I dag.', '"Ret pligter og belønninger" ligger nederst. 👍-reglen på en pligt betyder, at I skal godkende, før der gives ★/kr.', 'Ekstra-job: den første der tager jobbet, får det.'],
    barn: ['Sæt flueben, når du har gjort noget.', '⏳ = mor eller far skal give 👍 først.', 'Ekstra-job: tryk "Jeg tager den!" – og "Færdig ✓", når du er færdig.'] },
};
function tipsKnapper() {
  for (const [fane, tips] of Object.entries(TIPS)) {
    const hoved = document.querySelector('#' + fane + ' .sek-hoved');
    if (!hoved || hoved.querySelector('.tips-knap')) continue;
    const k = knap('?', 'tips-knap', () => {
      const liste = el('ul', 'tips-liste');
      for (const t of (erBarn() ? tips.barn : tips.voksen)) liste.append(el('li', null, t));
      const knapper = el('div', 'ark-knapper');
      knapper.append(knap('Hele hjælpen ›', 'lille-knap', () => { lukArk(); visFane('hjaelp'); window.scrollTo(0, 0); }), knap('OK', 'knap', lukArk));
      aabnArk('Tips: ' + (FANE_NAVN[fane] && !(fane === 'pligter' && erBarn()) ? FANE_NAVN[fane] : 'Pligter'), liste, knapper);
    });
    k.setAttribute('aria-label', 'Tips til ' + (FANE_NAVN[fane] || fane));
    hoved.querySelector('h2').after(k);
  }
}
tipsKnapper();

// ---------- Login ----------
const LOGIN_NAVNE = ['Timmo', 'Winnie', 'Oliver', 'Villads'];
let loginNavn = lokal.get('sidste-navn') || '';

function visLogin() {
  document.body.dataset.tilstand = 'login';
  const login = document.getElementById('login');
  login.hidden = false;
  const navne = document.getElementById('login-navne');
  const tegn = () => navne.replaceChildren(...LOGIN_NAVNE.map(n => {
    const k = knap(n, null, () => { loginNavn = n; tegn(); document.getElementById('login-kode').focus(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', n === loginNavn);
    return k;
  }));
  tegn();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fejl = document.getElementById('login-fejl');
  const kode = document.getElementById('login-kode');
  fejl.hidden = true;
  if (!loginNavn) { fejl.textContent = 'Tryk på dit navn først.'; fejl.hidden = false; return; }
  if (!kode.value) { kode.focus(); return; }
  const knapEl = e.target.querySelector('.knap');
  knapEl.disabled = true;
  knapEl.textContent = 'Logger ind…';
  try {
    await Data.login(loginNavn, kode.value);
    lokal.set('sidste-navn', loginNavn);
    kode.value = '';
    document.getElementById('login').hidden = true;
    await startTavle();
  } catch (err) {
    console.error(err);
    fejl.textContent = navigator.onLine ? 'Forkert navn eller kode. Prøv igen.' : 'Ingen forbindelse til internettet.';
    fejl.hidden = false;
  } finally {
    knapEl.disabled = false;
    knapEl.textContent = 'Log ind';
  }
});

// ---------- Udseende: automatisk (følg telefonen), lys eller mørk – huskes på enheden ----------
const TEMA_NAVN = { auto: 'Automatisk', lys: 'Lys', moerk: 'Mørk' };
function saetTema(tema) {
  const rod = document.documentElement;
  if (tema === 'lys') rod.dataset.theme = 'light';
  else if (tema === 'moerk') rod.dataset.theme = 'dark';
  else delete rod.dataset.theme;
  // Farven på telefonens statuslinje
  const farve = tema === 'lys' ? '#f2f5f3' : tema === 'moerk' ? '#0e1311' : null;
  // Fortæl også browseren/Android om lys eller mørk (bruges bl.a. til systemets bjælker)
  const cs = document.querySelector('meta[name="color-scheme"]');
  if (cs) cs.content = tema === 'lys' ? 'light' : tema === 'moerk' ? 'dark' : 'light dark';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.standard) m.dataset.standard = m.content;
    m.content = farve || m.dataset.standard;
  });
}
saetTema(lokal.get('tema') || 'auto');

document.getElementById('log-ud').addEventListener('click', () => aabnIndstillinger());

// ---------- Fortryd efter sletning ----------
// Vises i 8 sekunder nederst: "Slettet: Lasagne · Fortryd"
let fortrydEl = null, fortrydTimer = null;
function visFortryd(g) {
  // Kan slås fra under Indstillinger (personvalg.fortryd = false) – slettet kan stadig gendannes under Mere → Aktivitet
  if (Data.listNu('personvalg').find(x => x.navn === Data.bruger()?.navn)?.fortryd === false) return;
  if (!fortrydEl) {
    fortrydEl = el('div', 'fortryd-boks');
    fortrydEl.setAttribute('role', 'status');
    fortrydEl.hidden = true;
    document.body.append(fortrydEl);
  }
  const d = g.raekker[0].data || {};
  const navn = d.tekst || d.navn || d.titel || d.ret || '';
  const tekst = g.tekst || (g.raekker.length > 1 ? g.raekker.length + ' ting slettet' : 'Slettet' + (navn ? ': ' + navn : ''));
  const k = knap('Fortryd', 'fortryd-knap', async () => {
    clearTimeout(fortrydTimer);
    fortrydEl.hidden = true;
    try { await Data.gendan(g); visStatus('Fortrudt ✓'); }
    catch (e) { console.error(e); visStatus('Kunne ikke fortryde – prøv igen.', true); }
    tegnAlt();
  });
  fortrydEl.replaceChildren(el('span', 'fortryd-tekst', tekst), k);
  fortrydEl.hidden = false;
  clearTimeout(fortrydTimer);
  fortrydTimer = setTimeout(() => { fortrydEl.hidden = true; }, 8000);
}
Data.onFortryd(visFortryd);
// Samme bjælke med en egen fortryd-handling (fx bland hele ugen) – står lidt længere end almindelige sletninger
function visFortrydMed(tekst, fn) {
  if (!fortrydEl) { fortrydEl = el('div', 'fortryd-boks'); fortrydEl.setAttribute('role', 'status'); document.body.append(fortrydEl); }
  const k = knap('Fortryd', 'fortryd-knap', async () => {
    clearTimeout(fortrydTimer);
    fortrydEl.hidden = true;
    try { await fn(); visStatus('Fortrudt ✓'); }
    catch (e) { console.error(e); visStatus('Kunne ikke fortryde – prøv igen.', true); }
    tegnAlt();
  });
  fortrydEl.replaceChildren(el('span', 'fortryd-tekst', tekst), k);
  fortrydEl.hidden = false;
  clearTimeout(fortrydTimer);
  fortrydTimer = setTimeout(() => { fortrydEl.hidden = true; }, 20000);
}

// ---------- Start ----------
// Hvad venter på en voksen? (børnenes ønsker, ekstra stjerner og madønsker uden for listen)
// Vises meget tydeligt: rødt tal på "I dag" og på "Familien", en rød ramme om 🎁 Ønsker – og tal på app-ikonet, hvor telefonen kan.
// Rødt tal på app-ikonet (hjemmeskærmen): det man skal reagere på. Gemmes også til sw.js, som lægger 1 til ved hver push-besked.
async function saetAppTal(n) {
  try { if (n && navigator.setAppBadge) await navigator.setAppBadge(n); else if (navigator.clearAppBadge) await navigator.clearAppBadge(); } catch {}
  try { const c = await caches.open('familietavlen-tal'); await c.put('tal', new Response(String(n))); } catch {}
}
async function opdaterVenter() {
  if (Data.bruger()?.rolle !== 'voksen') {
    // Børn: sedler til mig, der ikke er svaret på
    if (Data.bruger()) saetAppTal(typeof sedlerTilMig === 'function' ? await sedlerTilMig() : 0);
    if (Data.bruger() && typeof rydNotifikationer === 'function') rydNotifikationer();   // push.js
    return;
  }
  const n = (await Data.list('indloesninger')).filter(x => x.status === 'afventer').length
    + (await Data.list('ekstra')).filter(x => x.status === 'afventer').length
    + (typeof madOenskeLinjer === 'function' ? (await madOenskeLinjer()).length : 0)
    + (typeof sedlerTilMig === 'function' ? await sedlerTilMig() : 0)   // sedler til mig (seddel.js)
    + (await Data.list('flueben')).filter(x => x.venter).length          // 👍-pligter der venter
    + (await Data.list('jobs')).filter(x => x.status === 'klaret').length; // ekstra-job der er klaret
  const badge = document.querySelector('[data-badge="idag"]');
  badge.textContent = n; badge.hidden = !n;
  const bBadge = document.querySelector('[data-badge="pligter"]');   // Børn-fanen
  if (bBadge) { bBadge.textContent = n; bBadge.hidden = !n; }
  const fam = document.querySelector('#idag-valg button');   // "Familien"
  if (fam) {
    fam.querySelector('.valg-badge')?.remove();
    if (n) fam.append(el('span', 'valg-badge', String(n)));
  }
  document.getElementById('ov-oensker').classList.toggle('venter', n > 0);
  saetAppTal(n);
  if (typeof rydNotifikationer === 'function') rydNotifikationer();   // push.js
}

function tegnAlt() {
  tegnListe('indkob'); tegnListe('todo'); tegnMadplan(); tegnFastPlan(); tegnSkema(); tegnKalender(); tegnOverblik();
  tegnForslag('indkob'); tegnForslag('todo'); tegnForslag('ret'); tegnForslag('morgen'); tegnForslag('frokost');
  tegnFoedselsdage();
  tegnFamilie();   // fra familie.js
  tegnKontakter();   // fra familie.js (kun voksne)
  tegnMere();   // fra mere.js
  tegnVejr();   // fra vejr.js (tegner kun, når siden er åben)
  if (typeof tegnBudget === 'function') tegnBudget();   // budget.js (tegner kun, når siden er åben)
  if (typeof tegnDagbog === 'function') tegnDagbog();   // dagbog.js (tegner kun, når siden er åben)
  if (typeof tegnOpskrifter === 'function') tegnOpskrifter();   // opskrifter.js (tegner kun, når siden er åben)
  anvendFaner();
  opdaterVenter();
  if (typeof pauseUdfyld === 'function') pauseUdfyld();   // ⏸ pause.js: pligter "tæller som klaret"
}

// Har appen ikke været brugt i et stykke tid, starter man forfra på I dag (voksne på "Familien").
// Undtagelse: handletilstand og et åbent ark (fx en halvt udfyldt formular) får lov at blive.
const HJEM_EFTER_MIN = 30;
function noterAktiv() { lokal.set('sidst-aktiv', String(Date.now())); }
function laengeSiden() {
  const t = Number(lokal.get('sidst-aktiv')) || 0;
  return t > 0 && Date.now() - t > HJEM_EFTER_MIN * 60000;
}
function nulstilTilStart() {
  lokal.set('fane', 'idag');
  if (!erBarn()) { tavleVisning = 'familie'; lokal.set('tavle', 'familie'); }
  tavleValgt = null;
}
function gaaHjemEfterPause() {
  if (document.body.dataset.tilstand !== 'klar' || !laengeSiden()) return;
  if (typeof handler !== 'undefined' && handler && aktivFane === 'indkob') return;
  if (!arkEl.hidden) return;
  nulstilTilStart();
  visFane('idag');
  tegnOverblik();
  window.scrollTo(0, 0);
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') gaaHjemEfterPause();
  noterAktiv();
});
document.addEventListener('pointerdown', noterAktiv, { passive: true });

async function startTavle() {
  const profil = Data.bruger();
  const logUd = document.getElementById('log-ud');
  logUd.textContent = profil.navn[0];
  logUd.className = 'bruger-knap ' + (PK[profil.navn] || 'c-faelles');
  logUd.setAttribute('aria-label', 'Indstillinger – logget ind som ' + profil.navn);
  logUd.hidden = false;
  if (erBarn()) {
    laasForBoern();
  } else {
    // Startindhold og flytning af gamle data sker kun, når en voksen er logget ind
    await laegStartlisterInd();
    await laegMereStartInd();   // fra mere.js
    for (const r of (await Data.list('madplan')).filter(r => !r.uge)) {
      await Data.update('madplan', r.id, { uge: isoDato(mandagDenneUge()) });
    }
  }
  // Drengene ser deres egen tavle; voksne kan vælge
  if (profil.rolle === 'barn' && BOERN.includes(profil.navn)) tavleVisning = profil.navn;
  else tavleVisning = ['familie', ...BOERN].includes(lokal.get('tavle')) ? lokal.get('tavle') : 'familie';
  if (!BOERN.includes(skemaBarn)) skemaBarn = BOERN[0];
  tegnNyPrio(); tegnNyFrist();
  tegnListeValg();
  if (laengeSiden()) nulstilTilStart();   // har appen ligget længe, starter man på I dag / Familien
  visFane(lokal.get('fane'));
  noterAktiv();
  tegnAlt();
  Data.onChange(tegnAlt);
  setTimeout(() => { if (typeof sjovFyldOp === 'function') sjovFyldOp(); }, 6000);   // 🧩 nye gåder/vitser til drengenes tavler (sjov.js, kun voksne)
  document.body.dataset.tilstand = 'klar';
  if (typeof pushOpfrisk === 'function') pushOpfrisk();   // push.js
  // Åbnet fra en notifikation? (sw.js sætter #gaa=<liste>-<id>)
  const gaa = new URLSearchParams(location.hash.slice(1)).get('gaa');
  if (gaa) { history.replaceState(null, '', location.pathname + location.search); setTimeout(() => gaaTil(gaa), 400); }
  tilbageVagt();
}

// ---------- Telefonens tilbage-knap (Android) ----------
// Der ligger altid én "vagt" i browserens historik. Trykker man tilbage, fanges det her og bruges i appen:
// luk ark/zoom → afslut rette-tilstand → luk pakkeliste → forrige fane → I dag. På I dag: "Tryk tilbage igen for at lukke".
let tilbageSat = false, lukVedNaeste = false, lukTimer = null;
function tilbageVagt() {
  if (tilbageSat) return;
  tilbageSat = true;
  history.replaceState({ base: true }, '');
  history.pushState({ vagt: true }, '');
  addEventListener('popstate', () => {
    if (tilbageKnap()) { lukVedNaeste = false; history.pushState({ vagt: true }, ''); return; }
    if (lukVedNaeste) return;   // andet tryk: lad telefonen lukke appen
    lukVedNaeste = true;
    visStatus('Tryk tilbage igen for at lukke appen');
    history.pushState({ vagt: true }, '');
    clearTimeout(lukTimer);
    lukTimer = setTimeout(() => { lukVedNaeste = false; }, 2500);
  });
}
// Gør det, tilbage skal gøre i appen. Svarer false, når der ikke er mere at gå tilbage til.
function tilbageKnap() {
  if (!arkEl.hidden) { lukArk(); return true; }
  if (typeof zoomEl !== 'undefined' && zoomEl && !zoomEl.hidden) { lukZoom(); return true; }
  if (aktivFane === 'pligter' && typeof pligtRet !== 'undefined' && pligtRet) { pligtRet = false; tegnPligter(); window.scrollTo(0, 0); return true; }
  if (aktivFane === 'pakkelister' && typeof pakValgt !== 'undefined' && pakValgt) { pakValgt = ''; lokal.set('pak-valgt', ''); tegnPakkelister(); opdaterTilbage(); return true; }
  while (faneHistorik.length && faneHistorik[faneHistorik.length - 1] === aktivFane) faneHistorik.pop();
  const forrige = faneHistorik.pop();
  if (forrige) { visFane(forrige, true); window.scrollTo(0, 0); return true; }
  if (aktivFane !== 'idag') { visFane('idag', true); window.scrollTo(0, 0); return true; }
  return false;
}

// Gå hen til det, en notifikation handler om. tag = '<liste>-<id>'
async function gaaTil(tag) {
  const i = tag.indexOf('-');
  if (i < 0 || !Data.bruger()) return;
  const liste = tag.slice(0, i), id = tag.slice(i + 1);
  if (typeof lukArk === 'function' && !arkEl.hidden) lukArk();
  visFane('idag');
  if (!erBarn()) { tavleVisning = 'familie'; lokal.set('tavle', 'familie'); }
  await tegnOverblik();
  if (typeof tegnTavle === 'function') await tegnTavle();
  window.scrollTo(0, 0);
  setTimeout(() => {
    const maal = document.querySelector(`[data-seddel="${CSS.escape(id)}"]`)
      || (liste === 'sedler' ? document.querySelector('#ov-sedler:not([hidden]), .seddel') : null)
      || (!erBarn() && ['indloesninger', 'ekstra', 'madoensker'].includes(liste) ? document.getElementById('ov-oensker') : null);
    if (!maal || !maal.offsetParent) return;
    maal.scrollIntoView({ behavior: 'smooth', block: 'center' });
    maal.animate([{ boxShadow: '0 0 0 0 var(--accent)' }, { boxShadow: '0 0 0 6px var(--accent)' }, { boxShadow: '0 0 0 0 var(--accent)' }], { duration: 900, iterations: 2 });
  }, 350);
}
navigator.serviceWorker?.addEventListener('message', e => { if (e.data?.gaa) gaaTil(e.data.gaa); });

document.documentElement.lang = 'da'; // giver dansk orddeling i kalenderen
const visDato = () => { const d = new Date(); document.getElementById('dato').textContent = d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · uge ' + ugenummer(mandagFor(d)); };
visDato();
// Efter midnat (fx en iPad der står tændt): ny dato i toppen og alt tegnes for den nye dag
let dagenNu = isoDato(new Date());
setInterval(() => {
  if (isoDato(new Date()) === dagenNu) return;
  dagenNu = isoDato(new Date());
  visDato();
  if (Data.bruger()) tegnAlt();
}, 60 * 1000);

// Start først, når ALLE scripts er indlæst (ellers kan fx retter.js mangle, hvis login går hurtigt)
async function opstart() {
  try {
    const profil = await Data.start();
    if (profil) await startTavle();
    else visLogin();
  } catch (err) {
    console.error(err);
    visLogin();
    const fejl = document.getElementById('login-fejl');
    fejl.textContent = err.message === 'mangler-profil'
      ? 'Din bruger mangler en profil i databasen. Spørg Timmo.'
      : 'Kunne ikke forbinde. Tjek internettet og prøv igen.';
    fejl.hidden = false;
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', opstart); else opstart();
