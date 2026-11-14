// missioner.js – 🚀 Missioner (missioner.html): opgaver og quiz som sin egen side. Lavet til iPad, virker også på telefon.
// Deler login og data med Familietavlen (data.js). Hentes efter data.js, missionsdata.js (lande) og missionskort.js (Europakort).
//
// To slags indhold:
//   1. Banen "Flag og lande" – uendelig: spørgsmålene laves her ud fra LANDE, og niveauet stiger af sig selv.
//   2. Håndlavede missioner – ligger som DATA i listen 'missioner' (lægges ind af en voksen med "Indsæt mission").
//      Hver gang trækkes `antal` tilfældige spørgsmål fra missionens pulje, så den kan spilles igen.
//
// Data (alt i 'punkter' via data.js):
//   'missioner'    {art: 'mission', titel, emoji, linje (højst én linjes historie), antal, aktiv, lavet,
//                   spoergsmaal: [{type, q, svar, andre?, enhed?, emne?, forklaring?}]}        – kun voksne kan skrive
//                  {art: 'regler', loft}  – højst så mange stjerner pr. dag (0 = ingen stjerner)   – kun voksne kan skrive
//   'mission_spil' {barn, mission: <id> | 'bane:flag', titel, dato, antal, rigtige, stjerner, niveau?, efter?,
//                   svar: [{k: spørgsmålets nøgle, ok: true/false, e: emne}]}
//                  – én række pr. spillet runde. Barnet må kun oprette sine egne for i dag; databasen (mission_spil_ok i
//                    opdatering-missioner.sql) tjekker stjernerne: loft pr. dag, 3 kun for en ny mission, 2 kun for et nyt niveau.
//
// Opgavetyper: 'valg' (vælg svar) · 'flag' (klik på flaget – svar/andre er landekoder) · 'kort' (klik på landet på Europakortet –
// svar er en landekode) · 'tal' (skriv et tal på taltastaturet). Meget lidt at skrive.
// Stjernereglerne står BÅDE her (msStjerner) og i SQL (mission_spil_ok) – ret begge steder.

// ---------- Små hjælpere (samme opførsel som i app.js) ----------
const lokal = {
  get(k) { try { return localStorage.getItem('familietavle:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('familietavle:' + k, v); } catch {} }
};
function isoDato(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function el(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst != null) e.textContent = tekst;
  return e;
}
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
function bekraeft(knapEl, handling) {
  const tilbage = () => { knapEl.classList.remove('bekraeft'); knapEl.textContent = knapEl.dataset.tekst; };
  if (knapEl.classList.contains('bekraeft')) { clearTimeout(knapEl._timer); tilbage(); handling(); return; }
  knapEl.dataset.tekst = knapEl.textContent;
  knapEl.classList.add('bekraeft');
  knapEl.textContent = 'Tryk igen for at ' + (knapEl.dataset.handling || 'slette');
  knapEl._timer = setTimeout(tilbage, 3000);
}
let statusTimer;
function visStatus(tekst, fejl = false) {
  const s = document.getElementById('status');
  s.textContent = tekst;
  s.classList.toggle('fejl-status', fejl);
  s.hidden = false;
  clearTimeout(statusTimer);
  s.onclick = () => { s.hidden = true; };
  statusTimer = setTimeout(() => (s.hidden = true), fejl ? 6000 : 3000);
}
const bland = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const traek = a => a[Math.floor(Math.random() * a.length)];
// Vægtet lodtrækning: [[ting, vægt], …]
function traekVaegt(par) {
  let s = par.reduce((t, p) => t + p[1], 0) * Math.random();
  for (const [x, v] of par) { s -= v; if (s <= 0) return x; }
  return par[par.length - 1][0];
}
const flagEmoji = kode => String.fromCodePoint(...[...kode.toUpperCase()].map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
function flagEl(kode, klasse) { const s = el('span', 'ms-flag' + (klasse ? ' ' + klasse : ''), flagEmoji(kode)); s.setAttribute('role', 'img'); s.setAttribute('aria-label', 'Flag'); return s; }
// Kort, stabil nøgle til et håndlavet spørgsmål (så svar kan tælles sammen, selv om missionen spilles mange gange)
function noegle(tekst) { let h = 5381; for (const c of String(tekst)) h = ((h << 5) + h + c.codePointAt(0)) >>> 0; return h.toString(36); }
const talFra = v => { const n = Number(String(v).trim().replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const talTekst = n => String(n).replace('.', ',');

// ---------- Regler ----------
const BANE = 'bane:flag', BANE_TITEL = 'Flag og lande';
const RUNDE = 10;            // spørgsmål pr. runde i banen
const BESTAA_BANE = 0.8;     // 8 af 10 → næste niveau (10 af 10 → to niveauer op)
const BESTAA = 0.7;          // håndlavet mission er "klaret" ved 70 % rigtige
const STJ = { ny: 3, niveau: 2, igen: 1 };
const LOFT_STD = 5;
const erVoksen = () => Data.bruger()?.rolle === 'voksen';
const mig = () => Data.bruger()?.navn || '';
const idag = () => isoDato(new Date());

const msRegler = () => Data.listNu('missioner').find(x => x.art === 'regler') || null;
const msLoft = () => { const r = msRegler(); const n = r ? Number(r.loft) : LOFT_STD; return Number.isFinite(n) ? Math.max(0, Math.min(10, Math.round(n))) : LOFT_STD; };
const msMissioner = () => Data.listNu('missioner').filter(x => x.art === 'mission').sort((a, b) => (b.oprettet || '').localeCompare(a.oprettet || ''));
const msSpil = barn => Data.listNu('mission_spil').filter(x => x.barn === barn).sort((a, b) => (a.oprettet || '').localeCompare(b.oprettet || ''));
const klaret = s => s.antal > 0 && s.rigtige / s.antal >= (s.mission === BANE ? BESTAA_BANE : BESTAA);
const msNiveau = barn => msSpil(barn).filter(s => s.mission === BANE).reduce((m, s) => Math.max(m, Number(s.efter) || 1), 1);
const msIdag = barn => msSpil(barn).filter(s => s.dato === idag()).reduce((t, s) => t + (Number(s.stjerner) || 0), 0);

// Stjerner for en runde (samme regler som mission_spil_ok i SQL)
function msStjerner(barn, runde) {
  if (!klaret(runde)) return { stjerner: 0, grund: '' };
  const foer = msSpil(barn).filter(s => s.mission === runde.mission);
  let oensket, grund;
  if (runde.mission === BANE) { oensket = STJ.niveau; grund = 'nyt niveau'; }
  else if (foer.some(klaret)) { oensket = STJ.igen; grund = 'spillet igen'; }
  else { oensket = STJ.ny; grund = 'ny mission'; }
  const rest = Math.max(0, msLoft() - msIdag(barn));
  return { stjerner: Math.min(oensket, rest), grund, loft: oensket > rest };
}

// ---------- Banen "Flag og lande": spørgsmål laves ud fra niveauet ----------
// Niveauet bestemmer, hvor svære lande der er med, hvilke slags spørgsmål, antal svar og om de forkerte flag ligner det rigtige.
function baneRegler(n) {
  return {
    tier: n <= 1 ? 1 : n <= 3 ? 2 : n <= 5 ? 3 : 4,          // lande op til denne sværhed
    hoved: n <= 2 ? 0 : n === 3 ? 1 : n <= 5 ? 2 : n <= 7 ? 3 : 4,   // hovedstæder op til denne sværhed (0 = ingen)
    kort: n >= 2,
    valg: n >= 5 ? 6 : 4,
    ligner: n >= 4
  };
}
const baneTekst = n => { const r = baneRegler(n); return [r.tier <= 1 ? 'kendte lande' : r.tier === 2 ? 'flere lande' : r.tier === 3 ? 'svære lande' : 'hele verden', r.kort ? 'kort' : '', r.hoved ? 'hovedstæder' : '', r.ligner ? 'flag, der ligner' : ''].filter(Boolean).join(' · '); };
const kortBred = () => Math.min(window.innerWidth, 820) >= 600;
const kortLande = () => Object.keys(KORT.lande).filter(k => LAND[k] && KORT.areal[k] >= (kortBred() ? 900 : 2000));
// Forkerte svar: først flag, der ligner (høje niveauer), så samme verdensdel, så resten
// kunHoved = true: kun lande med en hovedstad, der kan spørges om (svarene er hovedstæder – og flag, der ligner, er ligegyldige)
function andreLande(land, antal, regler, kandidater, kunHoved = false) {
  const ud = [];
  const tag = liste => { for (const k of bland(liste)) { if (ud.length >= antal) return; if (k !== land.kode && !ud.includes(k) && LAND[k] && (!kunHoved || LAND[k].hoved)) ud.push(k); } };
  if (regler.ligner && !kunHoved) tag(LIGNER.filter(g => g.includes(land.kode)).flat());
  tag(kandidater.filter(l => l.del === land.del).map(l => l.kode));
  tag(kandidater.map(l => l.kode));
  tag(LANDE.map(l => l.kode));
  return ud;
}
function baneSpoergsmaal(n, tidligere) {
  const regler = baneRegler(n);
  const fejl = new Map();   // nøgle → antal forkerte før (de kommer oftere igen)
  for (const s of tidligere) for (const x of s.svar || []) if (!x.ok) fejl.set(x.k, (fejl.get(x.k) || 0) + 1); else if (fejl.has(x.k)) fejl.set(x.k, fejl.get(x.k) - 1);
  const pulje = LANDE.filter(l => l.tier <= regler.tier);
  const vaegt = (l, slags) => (l.tier === regler.tier ? 3 : l.tier === regler.tier - 1 ? 2 : 1) + 3 * Math.max(0, fejl.get(slags + ':' + l.kode) || 0);
  const slagsListe = [['navn', 3], ['flag', 3]];
  if (regler.kort) slagsListe.push(['kort', 2]);
  if (regler.hoved) slagsListe.push(['hoved', n >= 6 ? 3 : 2], ['hovedland', 1]);
  const brugt = new Set(), ud = [];
  let forsoeg = 0;
  while (ud.length < RUNDE && forsoeg++ < 400) {
    const slags = traekVaegt(slagsListe);
    let kand = pulje;
    if (slags === 'kort') { const ok = new Set(kortLande()); kand = pulje.filter(l => ok.has(l.kode)); }
    if (slags === 'hoved' || slags === 'hovedland') kand = LANDE.filter(l => l.hoved && l.tier <= regler.hoved);
    kand = kand.filter(l => !brugt.has(l.kode));
    if (!kand.length) continue;
    const land = traekVaegt(kand.map(l => [l, vaegt(l, slags)]));
    brugt.add(land.kode);
    const k = slags + ':' + land.kode, e = slags === 'hovedland' ? 'hovedstæder' : { navn: 'flag', flag: 'flag', kort: 'kort', hoved: 'hovedstæder' }[slags];
    const erHoved = slags.startsWith('hoved');
    const andre = andreLande(land, regler.valg - 1, regler, erHoved ? LANDE.filter(l => l.hoved && l.tier <= Math.max(regler.hoved, 2)) : pulje, erHoved);
    if (slags === 'navn') ud.push({ type: 'valg', q: 'Hvilket land?', flag: land.kode, svar: land.navn, andre: andre.map(c => LAND[c].navn), k, e });
    else if (slags === 'flag') ud.push({ type: 'flag', q: 'Klik på flaget: ' + land.navn, svar: land.kode, andre, k, e });
    else if (slags === 'kort') ud.push({ type: 'kort', q: 'Klik på ' + land.navn, svar: land.kode, k, e });
    else if (slags === 'hoved') ud.push({ type: 'valg', q: 'Hvad hedder hovedstaden i ' + land.navn + '?', flag: land.kode, svar: land.hoved, andre: andre.map(c => LAND[c].hoved), k, e });
    else ud.push({ type: 'valg', q: land.hoved + ' er hovedstaden i …', svar: land.navn, andre: andre.map(c => LAND[c].navn), k, e });
  }
  return ud;
}

// ---------- Håndlavede missioner: læs og tjek det, en voksen sætter ind ----------
// Tager imod én mission, en liste eller {missioner: […]} – også med tekst eller ```-hegn omkring (klip fra Claude).
function laesMissioner(tekst) {
  const t = String(tekst || '').trim();
  if (!t) throw new Error('Der er ikke sat noget ind.');
  const a = t.search(/[\[{]/), z = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0) throw new Error('Jeg kan ikke finde en mission i teksten. Kopiér hele blokken fra Claude – den begynder med { og slutter med }.');
  if (z < a) throw new Error('Teksten er ikke hel – noget mangler eller er klippet over. Kopiér hele blokken fra Claude igen.');
  let d;
  try { d = JSON.parse(t.slice(a, z + 1)); } catch { throw new Error('Teksten er ikke hel – noget mangler eller er klippet over. Kopiér hele blokken fra Claude igen.'); }
  const liste = Array.isArray(d) ? d : Array.isArray(d.missioner) ? d.missioner : [d];
  if (!liste.length) throw new Error('Der er ingen missioner i teksten.');
  return liste.map((m, i) => tjekMission(m, liste.length > 1 ? 'Mission ' + (i + 1) + ': ' : ''));
}
function tjekMission(m, foran = '') {
  const fejl = t => { throw new Error(foran + t); };
  if (!m || typeof m !== 'object') fejl('ikke en mission.');
  const titel = String(m.titel || '').trim();
  if (!titel) fejl('missionen mangler en titel.');
  if (!Array.isArray(m.spoergsmaal) || m.spoergsmaal.length < 5) fejl('"' + titel + '" skal have mindst 5 spørgsmål.');
  const sp = m.spoergsmaal.map((s, i) => {
    const nr = '"' + titel + '", spørgsmål ' + (i + 1) + ': ';
    const q = String(s?.q || '').trim();
    if (!q) fejl(nr + 'mangler teksten (q).');
    // Uden type: et tal uden forkerte svar er en "skriv et tal"-opgave, ellers "vælg svar"
    const type = s.type || (!Array.isArray(s.andre) && String(s.svar ?? '').trim() !== '' && !Number.isNaN(talFra(s.svar)) ? 'tal' : 'valg');
    const ud = { type, q };
    if (s.emne) ud.emne = String(s.emne).trim().slice(0, 40);
    if (s.forklaring) ud.forklaring = String(s.forklaring).trim().slice(0, 200);
    if (type === 'valg') {
      const andre = (Array.isArray(s.andre) ? s.andre : []).map(x => String(x).trim()).filter(Boolean);
      const svar = String(s.svar ?? '').trim();
      if (!svar) fejl(nr + 'mangler det rigtige svar (svar).');
      if (andre.length < 1) fejl(nr + 'mangler forkerte svar (andre).');
      if (andre.includes(svar)) fejl(nr + 'det rigtige svar står også blandt de forkerte.');
      ud.svar = svar; ud.andre = [...new Set(andre)].slice(0, 5);
      if (s.flag && LAND[String(s.flag).toUpperCase()]) ud.flag = String(s.flag).toUpperCase();
    } else if (type === 'tal') {
      const n = talFra(s.svar);
      if (Number.isNaN(n)) fejl(nr + 'svaret skal være et tal.');
      ud.svar = n;
      if (s.enhed) ud.enhed = String(s.enhed).trim().slice(0, 12);
    } else if (type === 'flag') {
      const svar = String(s.svar || '').toUpperCase(), andre = (Array.isArray(s.andre) ? s.andre : []).map(x => String(x).toUpperCase());
      if (!LAND[svar]) fejl(nr + 'kender ikke landekoden "' + s.svar + '".');
      const ukendt = andre.find(k => !LAND[k]);
      if (ukendt) fejl(nr + 'kender ikke landekoden "' + ukendt + '".');
      if (andre.includes(svar)) fejl(nr + 'det rigtige flag står også blandt de forkerte.');
      ud.svar = svar; ud.andre = [...new Set(andre)].slice(0, 5);   // uden "andre" finder siden selv flag, der ligner
    } else if (type === 'kort') {
      const svar = String(s.svar || '').toUpperCase();
      if (!KORT.lande[svar] || KORT.areal[svar] < 900) fejl(nr + 'landet "' + s.svar + '" kan ikke klikkes på Europakortet (kun europæiske lande, der er store nok at ramme).');
      ud.svar = svar;
    } else fejl(nr + 'kender ikke typen "' + type + '" (brug valg, tal, flag eller kort).');
    return ud;
  });
  const antal = Math.max(5, Math.min(sp.length, Math.round(Number(m.antal)) || 10));
  return { art: 'mission', titel: titel.slice(0, 60), emoji: String(m.emoji || '🚀').slice(0, 8), linje: String(m.linje || '').trim().slice(0, 140), antal, spoergsmaal: sp, aktiv: true, lavet: idag() };
}
// Træk en runde fra missionens pulje – spørgsmål, der gik galt sidst, kommer lidt oftere
function missionSpoergsmaal(m, tidligere) {
  const fejl = new Map();
  for (const s of tidligere) for (const x of s.svar || []) fejl.set(x.k, x.ok ? 0 : (fejl.get(x.k) || 0) + 1);
  let pulje = m.spoergsmaal.map(s => ({ ...s, k: noegle(s.q), e: s.emne || '' }));
  if (!kortBred()) { const uden = pulje.filter(s => s.type !== 'kort' || KORT.areal[s.svar] >= 2000); if (uden.length >= 5) pulje = uden; }   // telefon: ingen bittesmå lande
  const ud = [];
  while (ud.length < Math.min(m.antal || 10, pulje.length)) {
    const rest = pulje.filter(s => !ud.includes(s));
    ud.push(traekVaegt(rest.map(s => [s, 1 + 2 * (fejl.get(s.k) || 0)])));
  }
  return bland(ud).map(s => (s.type === 'flag' && !(s.andre || []).length ? { ...s, andre: andreLande(LAND[s.svar], 3, { ligner: true }, LANDE.filter(l => l.tier <= 3)) } : s));
}

// ---------- Forsiden ----------
const main = () => document.getElementById('ms-main');
let spiller = false;   // en runde er i gang – forsiden tegnes ikke oven i
function tegnForside() {
  if (spiller) return;
  document.body.dataset.vis = 'forside';
  const m = main(), barn = mig(), voksen = erVoksen();
  const dele = [];
  const loft = msLoft();
  const top = document.getElementById('ms-idag');
  top.hidden = voksen || !loft;
  if (!voksen && loft) { const f = msIdag(barn); top.textContent = '⭐ ' + f + ' af ' + loft + ' i dag'; top.classList.toggle('fuld', f >= loft); }

  // Banen
  const n = voksen ? 1 : msNiveau(barn);
  const bane = el('button', 'ms-kort ms-bane');
  bane.type = 'button';
  bane.append(el('span', 'ms-emoji', '🌍'), (() => { const t = el('span', 'ms-kort-tekst'); t.append(el('b', null, BANE_TITEL), el('span', 'ms-under', voksen ? 'Uendelig bane – niveauet stiger af sig selv' : baneTekst(n))); return t; })(),
    el('span', 'ms-niveau', voksen ? 'Prøv' : 'Niveau ' + n));
  bane.addEventListener('click', () => (voksen ? vaelgProeveNiveau() : startBane(n)));
  dele.push(el('h2', 'ms-overskrift', 'Uendelig bane'), bane);

  // Håndlavede missioner
  const alle = msMissioner().filter(x => voksen || x.aktiv !== false);
  const spil = msSpil(barn);
  if (alle.length) dele.push(el('h2', 'ms-overskrift', 'Missioner'));
  const liste = el('div', 'ms-liste');
  for (const x of alle) {
    const mine = spil.filter(s => s.mission === x.id), ny = !voksen && !mine.some(klaret);
    const bedst = mine.reduce((b, s) => Math.max(b, s.rigtige / s.antal), 0);
    const k = el('button', 'ms-kort' + (ny ? ' ny' : '') + (x.aktiv === false ? ' skjult' : ''));
    k.type = 'button';
    const t = el('span', 'ms-kort-tekst');
    t.append(el('b', null, x.titel), el('span', 'ms-under', voksen ? x.spoergsmaal.length + ' spørgsmål · ' + x.antal + ' pr. runde' + (x.aktiv === false ? ' · skjult' : '')
      : mine.length ? 'Bedst: ' + Math.round(bedst * x.antal) + ' af ' + x.antal + ' · spil igen' : x.antal + ' spørgsmål'));
    k.append(el('span', 'ms-emoji', x.emoji || '🚀'), t, el('span', 'ms-niveau', voksen ? 'Prøv' : ny ? 'NY · ' + STJ.ny + ' ⭐' : STJ.igen + ' ⭐'));
    k.addEventListener('click', () => startMission(x));
    liste.append(k);
  }
  if (alle.length) dele.push(liste);
  if (!voksen && loft && msIdag(barn) >= loft) dele.push(el('p', 'hint ms-loft', 'Du har fået dagens stjerner. Du kan stadig spille – bare for sjov.'));
  if (voksen) dele.push(...tegnVoksen());
  else dele.push(knap('Log ' + barn + ' ud', 'lille-knap ms-logud', e => { e.currentTarget.dataset.handling = 'logge ud'; bekraeft(e.currentTarget, () => Data.logud()); }));
  m.replaceChildren(...dele);
}
function vaelgProeveNiveau() {
  const m = main();
  const boks = el('div', 'kort ms-proeve');
  boks.append(el('h2', null, 'Prøv banen på niveau …'));
  const r = el('div', 'ms-niveauer');
  for (let i = 1; i <= 8; i++) r.append(knap(String(i), 'lille-knap', () => startBane(i)));
  boks.append(r, el('p', 'hint', 'Voksne spiller for at prøve – der gemmes ikke noget.'), knap('Tilbage', 'lille-knap', tegnForside));
  m.replaceChildren(boks);
}
function startBane(n) {
  const sp = baneSpoergsmaal(n, erVoksen() ? [] : msSpil(mig()).filter(s => s.mission === BANE).slice(-12));
  spil({ mission: BANE, titel: BANE_TITEL + ' · niveau ' + n, emoji: '🌍', linje: '', niveau: n, spoergsmaal: sp });
}
function startMission(x) {
  const sp = missionSpoergsmaal(x, erVoksen() ? [] : msSpil(mig()).filter(s => s.mission === x.id).slice(-6));
  spil({ mission: x.id, titel: x.titel, emoji: x.emoji || '🚀', linje: x.linje || '', spoergsmaal: sp, kilde: x });
}

// ---------- Afspilleren ----------
function spil(runde) {
  spiller = true;
  document.body.dataset.vis = 'spil';
  window.scrollTo(0, 0);
  const m = main();
  const svar = [];
  let nr = 0, tastLytter = null;
  const top = el('div', 'ms-spiltop');
  const luk = knap('✕', 'ms-luk', () => bekraeftLuk());
  luk.setAttribute('aria-label', 'Stop missionen');
  const prikker = el('div', 'ms-prikker');
  runde.spoergsmaal.forEach(() => prikker.append(el('i')));
  top.append(luk, el('span', 'ms-spiltitel', runde.emoji + ' ' + runde.titel), prikker);
  const scene = el('div', 'ms-scene');
  m.replaceChildren(top, scene);
  function bekraeftLuk() {
    if (!svar.length || luk.dataset.sikker) { slut(false); return; }
    luk.dataset.sikker = '1'; luk.textContent = 'Stop?'; luk.classList.add('bekraeft');
    setTimeout(() => { delete luk.dataset.sikker; luk.textContent = '✕'; luk.classList.remove('bekraeft'); }, 3000);
  }
  function slut(faerdig) {
    if (tastLytter) document.removeEventListener('keydown', tastLytter);
    tastLytter = null;
    spiller = false;
    if (faerdig) visResultat(runde, svar); else tegnForside();
  }
  function naeste() {
    nr++;
    if (nr >= runde.spoergsmaal.length) slut(true); else visSp();
  }
  // Svaret er givet: gem det, vis rigtigt/forkert. Rigtigt → videre af sig selv; forkert → vis det rigtige og en "Videre"-knap.
  function afgoer(s, ok, rigtigTekst) {
    svar.push({ k: s.k, ok, e: s.e || '' });
    prikker.children[nr].className = ok ? 'ok' : 'nej';
    if (tastLytter) { document.removeEventListener('keydown', tastLytter); tastLytter = null; }
    const fod = scene.querySelector('.ms-fod');
    if (ok) { fod.append(el('p', 'ms-dom ok', traek(['Rigtigt!', 'Jep!', 'Sådan!', 'Præcis!']))); setTimeout(naeste, 750); return; }
    const dom = el('p', 'ms-dom nej');
    dom.append('Det rigtige svar: ', el('b', null, rigtigTekst));
    fod.append(dom);
    if (s.forklaring) fod.append(el('p', 'ms-forklaring', s.forklaring));
    const v = knap('Videre', 'knap ms-videre', naeste);
    fod.append(v);
    v.focus({ preventScroll: true });
  }
  function visSp() {
    const s = runde.spoergsmaal[nr];
    prikker.children[nr].className = 'nu';
    const dele = [];
    if (nr === 0 && runde.linje) dele.push(el('p', 'ms-linje', runde.linje));
    if (s.flag) dele.push(flagEl(s.flag, 'stor'));
    dele.push(el('h2', 'ms-q', s.q));
    const fod = el('div', 'ms-fod');
    let laast = false;
    if (s.type === 'valg' || s.type === 'flag') {
      const muligheder = bland([s.svar, ...(s.andre || [])]);
      const gitter = el('div', 'ms-svar' + (s.type === 'flag' ? ' flag' : '') + (muligheder.length > 4 ? ' mange' : ''));
      for (const v of muligheder) {
        const b = el('button', 'ms-valg');
        b.type = 'button';
        if (s.type === 'flag') { b.append(flagEl(v)); b.dataset.kode = v; } else b.textContent = v;
        b.addEventListener('click', () => {
          if (laast) return; laast = true;
          const ok = v === s.svar;
          b.classList.add(ok ? 'ok' : 'nej');
          for (const x of gitter.children) { x.disabled = true; if (!ok && (s.type === 'flag' ? x.dataset.kode : x.textContent) === s.svar) x.classList.add('ok'); }
          if (!ok && s.type === 'flag') for (const x of gitter.children) x.append(el('small', null, LAND[x.dataset.kode].navn));   // lær af fejlen: navnene under flagene
          afgoer(s, ok, s.type === 'flag' ? LAND[s.svar].navn : s.svar);
        });
        gitter.append(b);
      }
      dele.push(gitter);
    } else if (s.type === 'kort') {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 ' + KORT.w + ' ' + KORT.h);
      svg.setAttribute('class', 'ms-kortet');
      const sti = (d, klasse, kode) => { const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('class', klasse); if (kode) p.dataset.kode = kode; svg.append(p); return p; };
      sti(KORT.andre, 'andet');
      for (const [kode, d] of Object.entries(KORT.lande)) sti(d, 'land', kode);
      svg.addEventListener('click', e => {
        const p = e.target.closest('path.land');
        if (!p || laast) return; laast = true;
        const ok = p.dataset.kode === s.svar;
        p.classList.add(ok ? 'ok' : 'nej');
        if (!ok) svg.querySelector('path.land[data-kode="' + s.svar + '"]').classList.add('ok');
        svg.classList.add('laast');
        // Tilbagemeldingen står OVER kortet (i stedet for spørgsmålet), så den aldrig dækker det land, der lyser grønt
        scene.querySelector('.ms-q').hidden = true;
        if (!ok) fod.append(el('p', 'ms-forklaring', 'Du klikkede på ' + (LAND[p.dataset.kode]?.navn || 'et andet land') + '.'));
        afgoer(s, ok, LAND[s.svar].navn + ' (grøn)');
      });
      fod.classList.add('oppe');
      dele.push(fod, svg);
    } else if (s.type === 'tal') {
      const vis = el('div', 'ms-talvis'), tal = el('span', 'ms-tal', ''), enhed = el('span', 'ms-enhed', s.enhed || '');
      vis.append(tal, enhed);
      let v = '';
      const opdater = () => { tal.textContent = v || ' '; tal.classList.toggle('tom', !v); ok.disabled = !v || Number.isNaN(talFra(v)); };
      const tast = t => {
        if (laast) return;
        if (t === '⌫') v = v.slice(0, -1);
        else if (t === ',') { if (!v.includes(',') && v.length < 8) v += v ? ',' : '0,'; }
        else if (v.length < 8) v = v === '0' ? t : v + t;
        opdater();
      };
      const svarNu = () => {
        if (laast || !v || Number.isNaN(talFra(v))) return; laast = true;
        const rigtigt = Math.abs(talFra(v) - s.svar) < 1e-9;
        vis.classList.add(rigtigt ? 'ok' : 'nej');
        pad.classList.add('laast');
        afgoer(s, rigtigt, talTekst(s.svar) + (s.enhed ? ' ' + s.enhed : ''));
      };
      const pad = el('div', 'ms-pad');
      for (const t of ['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', '⌫']) { const b = knap(t, 'ms-tast', () => tast(t)); if (t === '⌫') b.setAttribute('aria-label', 'Slet'); pad.append(b); }
      const ok = knap('Svar', 'knap ms-svarknap', svarNu);
      tastLytter = e => {
        if (/^[0-9]$/.test(e.key)) tast(e.key); else if (e.key === ',' || e.key === '.') tast(','); else if (e.key === 'Backspace') tast('⌫'); else if (e.key === 'Enter' && !laast) { e.preventDefault(); svarNu(); }
      };
      document.addEventListener('keydown', tastLytter);
      const boks = el('div', 'ms-talboks');
      boks.append(vis, pad, ok);
      dele.push(boks);
      opdater();
    }
    if (s.type !== 'kort') dele.push(fod);
    scene.replaceChildren(...dele);
    scene.classList.remove('ind'); void scene.offsetWidth; scene.classList.add('ind');
  }
  visSp();
}

// ---------- Resultat: gem runden (kun børn) og vis stjerner ----------
async function visResultat(runde, svar) {
  const m = main(), barn = mig(), voksen = erVoksen();
  document.body.dataset.vis = 'resultat';
  const antal = svar.length, rigtige = svar.filter(x => x.ok).length;
  const raekke = { barn, mission: runde.mission, titel: runde.titel, dato: idag(), antal, rigtige, svar };
  let efter = null;
  if (runde.mission === BANE) {
    const foer = voksen ? runde.niveau : msNiveau(barn);
    efter = klaret(raekke) ? foer + (rigtige === antal ? 2 : 1) : foer;
    raekke.niveau = runde.niveau; raekke.efter = efter;
  }
  const st = voksen ? { stjerner: 0 } : msStjerner(barn, raekke);
  raekke.stjerner = st.stjerner;
  let gemt = voksen, fejlTekst = '';
  if (!voksen) {
    try { await Data.add('mission_spil', raekke); gemt = true; }
    catch (e) {
      console.warn(e);
      // Afviste databasen stjernerne (fx loftet nået fra en anden enhed), gemmes runden uden stjerner
      if (raekke.stjerner && !(Data.erNetfejl?.(e) || !navigator.onLine)) {
        try { raekke.stjerner = 0; await Data.add('mission_spil', raekke); gemt = true; } catch (e2) { console.warn(e2); }
      }
      if (!gemt) fejlTekst = navigator.onLine ? 'Runden kunne ikke gemmes – ingen stjerner denne gang.' : 'Uden net – runden blev ikke gemt, så der er ingen stjerner denne gang.';
    }
  }
  const boks = el('div', 'ms-resultat');
  const godt = klaret(raekke);
  boks.append(el('p', 'ms-res-emoji', rigtige === antal ? '🏆' : godt ? '🎉' : '💪'));
  const tal = el('p', 'ms-res-tal'); tal.append(el('b', null, String(rigtige)), ' af ' + antal + ' rigtige');
  boks.append(tal);
  if (runde.mission === BANE) boks.append(el('p', 'ms-res-tekst', !godt ? 'Du skal have ' + Math.ceil(BESTAA_BANE * antal) + ' rigtige for at komme op på næste niveau.'
    : rigtige === antal ? 'Alt rigtigt – du springer et niveau over! Nu niveau ' + efter + '.' : 'Du er nu på niveau ' + efter + '.'));
  if (voksen) boks.append(el('p', 'hint', 'Prøverunde – der er ikke gemt noget.'));
  else if (gemt && raekke.stjerner) boks.append(el('p', 'ms-res-stjerner', '+' + raekke.stjerner + ' ' + '⭐'.repeat(raekke.stjerner)));
  else if (gemt && godt && msLoft()) boks.append(el('p', 'hint', 'Du har fået dagens stjerner – flot spillet alligevel.'));
  if (fejlTekst) boks.append(el('p', 'fejl', fejlTekst));
  const forkerte = runde.spoergsmaal.filter((s, i) => svar[i] && !svar[i].ok);
  if (forkerte.length) {
    const l = el('ul', 'ms-fejlliste');
    for (const s of forkerte) {
      const li = el('li');
      const rigtig = s.type === 'flag' ? flagEmoji(s.svar) + ' ' + LAND[s.svar].navn : s.type === 'kort' ? LAND[s.svar].navn : s.type === 'tal' ? talTekst(s.svar) + (s.enhed ? ' ' + s.enhed : '') : s.svar;
      li.append((s.flag ? flagEmoji(s.flag) + ' ' : '') + s.q + ' ', el('b', null, rigtig));
      l.append(li);
    }
    boks.append(el('h3', 'ms-overskrift', 'Dem her gik galt'), l);
  }
  const knapper = el('div', 'ms-res-knapper');
  if (runde.mission === BANE) knapper.append(knap(godt ? 'Næste niveau' : 'Prøv igen', 'knap', () => startBane(voksen ? runde.niveau : msNiveau(barn))));
  else if (runde.kilde) knapper.append(knap('Spil igen', 'knap', () => startMission(runde.kilde)));
  knapper.append(knap('Til missionerne', 'lille-knap', tegnForside));
  boks.append(knapper);
  m.replaceChildren(boks);
  window.scrollTo(0, 0);
}

// ---------- For de voksne: indsæt mission, skjul/slet, loft, status til Claude ----------
function tegnVoksen() {
  const dele = [el('h2', 'ms-overskrift', 'For de voksne')];
  // Indsæt mission
  const ind = el('div', 'kort ms-voksen');
  ind.append(el('h3', null, '＋ Indsæt mission'), el('p', 'hint', 'Bed Claude om nye missioner, kopiér blokken, og sæt den ind her. Du kan sætte flere ind på én gang.'));
  const felt = el('textarea', 'k-tekst ms-indfelt');
  felt.rows = 4; felt.placeholder = '{ "titel": … }'; felt.setAttribute('aria-label', 'Mission som tekst'); felt.spellcheck = false;
  const besked = el('p', 'fejl'); besked.hidden = true;
  const r = el('div', 'ms-raekke');
  r.append(knap('📋 Sæt ind fra udklipsholder', 'lille-knap', async () => {
    try { felt.value = await navigator.clipboard.readText(); besked.hidden = true; } catch { visStatus('Hold fingeren på feltet og vælg "Sæt ind".'); felt.focus(); }
  }), knap('Gem mission', 'knap', async () => {
    besked.hidden = true;
    let nye;
    try { nye = laesMissioner(felt.value); } catch (e) { besked.textContent = e.message; besked.hidden = false; return; }
    const findes = new Set(msMissioner().map(x => x.titel.toLowerCase()));
    const dublet = nye.find(x => findes.has(x.titel.toLowerCase()));
    if (dublet) { besked.textContent = 'Der findes allerede en mission, der hedder "' + dublet.titel + '". Slet den gamle først, eller giv den nye et andet navn.'; besked.hidden = false; return; }
    try {
      for (const x of nye) await Data.add('missioner', x);
      felt.value = '';
      visStatus(nye.length === 1 ? 'Missionen "' + nye[0].titel + '" er gemt' : nye.length + ' missioner er gemt');
      tegnForside();
    } catch (e) { console.error(e); besked.textContent = 'Kunne ikke gemme. Tjek nettet – og at SQL-filen opdatering-missioner.sql er kørt.'; besked.hidden = false; }
  }));
  ind.append(felt, besked, r);
  dele.push(ind);

  // Missionerne: skjul/vis og slet
  const alle = msMissioner();
  if (alle.length) {
    const boks = el('div', 'kort ms-voksen');
    boks.append(el('h3', null, 'Missionerne'));
    for (const x of alle) {
      const l = el('div', 'ms-mlinje');
      l.append(el('span', 'ms-mnavn', (x.emoji || '🚀') + ' ' + x.titel + (x.aktiv === false ? ' (skjult)' : '')),
        knap(x.aktiv === false ? 'Vis' : 'Skjul', 'lille-knap', async () => { await Data.update('missioner', x.id, { aktiv: x.aktiv === false }); tegnForside(); }),
        knap('Slet', 'lille-knap', e => bekraeft(e.currentTarget, async () => { await Data.remove('missioner', x.id); tegnForside(); })));
      boks.append(l);
    }
    boks.append(el('p', 'hint', 'En slettet mission forsvinder for børnene; de stjerner og svar, der er gemt, bliver stående.'));
    dele.push(boks);
  }

  // Stjerner pr. dag
  const lo = el('div', 'kort ms-voksen');
  lo.append(el('h3', null, 'Stjerner'), el('p', 'hint', 'Ny mission ' + STJ.ny + ' ⭐ · nyt niveau i banen ' + STJ.niveau + ' ⭐ · spillet igen ' + STJ.igen + ' ⭐. Højst så mange om dagen:'));
  const seg = el('div', 'seg wrap'); seg.setAttribute('role', 'radiogroup');
  for (const v of [0, 3, 5, 8]) {
    const k = knap(v ? String(v) : 'Ingen', null, async () => {
      const rr = msRegler();
      if (rr) await Data.update('missioner', rr.id, { loft: v }); else await Data.add('missioner', { art: 'regler', loft: v });
      tegnForside();
    });
    k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', msLoft() === v);
    seg.append(k);
  }
  lo.append(seg);
  dele.push(lo);

  // Status til Claude
  const boern = [...new Set(Data.listNu('mission_spil').map(x => x.barn))].sort();
  const st = el('div', 'kort ms-voksen');
  st.append(el('h3', null, 'Status til Claude'));
  if (!boern.length) st.append(el('p', 'hint', 'Ingen har spillet endnu. Når der er spillet, kan du kopiere en status her og give den til Claude, så de næste missioner rammer niveauet.'));
  for (const b of boern) {
    const sp = msSpil(b);
    const l = el('div', 'ms-mlinje');
    l.append(el('span', 'ms-mnavn', b + ': ' + sp.length + (sp.length === 1 ? ' runde' : ' runder') + ' · banen niveau ' + msNiveau(b)),
      knap('📋 Kopiér status', 'lille-knap', async () => {
        const t = statusTekst(b);
        try { await navigator.clipboard.writeText(t); visStatus('Status er kopieret – sæt den ind hos Claude'); }
        catch { const f = st.querySelector('textarea') || st.appendChild(el('textarea', 'k-tekst ms-indfelt')); f.rows = 8; f.readOnly = true; f.value = t; f.focus(); f.select(); visStatus('Markér teksten og kopiér den'); }
      }));
    st.append(l);
  }
  dele.push(st, knap('Log ' + mig() + ' ud', 'lille-knap ms-logud', e => { e.currentTarget.dataset.handling = 'logge ud'; bekraeft(e.currentTarget, () => Data.logud()); }));
  return dele;
}

// Teksten til Claude: hvad der er spillet, hvor det går godt/skidt, og hvilke spørgsmål der driller
function statusTekst(barn) {
  const sp = msSpil(barn), pct = (r, a) => (a ? Math.round(100 * r / a) + ' %' : '–');
  const d = new Date();
  const linjer = ['Missioner – status for ' + barn + ' (' + d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear() + ')',
    'Runder i alt: ' + sp.length + (sp.length ? ' · første ' + sp[0].dato + ' · seneste ' + sp[sp.length - 1].dato : ''),
    'Stjerner fra missioner i alt: ' + sp.reduce((t, s) => t + (Number(s.stjerner) || 0), 0) + ' (loft ' + msLoft() + ' pr. dag)', ''];
  const emner = (runder) => {
    const e = new Map();
    for (const s of runder) for (const x of s.svar || []) { const k = x.e || '(uden emne)'; const v = e.get(k) || [0, 0]; v[1]++; if (x.ok) v[0]++; e.set(k, v); }
    return [...e].sort((a, b) => a[1][0] / a[1][1] - b[1][0] / b[1][1]).map(([k, v]) => k + ' ' + v[0] + '/' + v[1] + ' (' + pct(v[0], v[1]) + ')').join(' · ');
  };
  const bane = sp.filter(s => s.mission === BANE);
  if (bane.length) {
    linjer.push('BANEN "' + BANE_TITEL + '": niveau ' + msNiveau(barn) + ' · ' + bane.length + ' runder · ' + pct(bane.reduce((t, s) => t + s.rigtige, 0), bane.reduce((t, s) => t + s.antal, 0)) + ' rigtige',
      '  Seneste runder: ' + bane.slice(-6).map(s => 'niv. ' + s.niveau + ': ' + s.rigtige + '/' + s.antal).join(', '),
      '  Efter slags: ' + emner(bane));
    const f = new Map();
    for (const s of bane) for (const x of s.svar || []) if (!x.ok) f.set(x.k, (f.get(x.k) || 0) + 1);
    const svaere = [...f].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => { const [slags, kode] = k.split(':'); return (LAND[kode]?.navn || kode) + ' (' + ({ navn: 'flag→navn', flag: 'navn→flag', kort: 'kort', hoved: 'hovedstad', hovedland: 'hovedstad→land' }[slags] || slags) + (n > 1 ? ' ×' + n : '') + ')'; });
    if (svaere.length) linjer.push('  Forkert: ' + svaere.join(', '));
    linjer.push('');
  }
  const ids = [...new Set(sp.filter(s => s.mission !== BANE).map(s => s.mission))];
  for (const id of ids) {
    const runder = sp.filter(s => s.mission === id), kilde = msMissioner().find(x => x.id === id);
    linjer.push('MISSION "' + (kilde?.titel || runder[runder.length - 1].titel) + '"' + (kilde ? '' : ' (slettet)') + ': spillet ' + runder.length + (runder.length === 1 ? ' gang' : ' gange') + ' · ' + runder.map(s => s.rigtige + '/' + s.antal).join(', '),
      '  Efter emne: ' + emner(runder));
    if (kilde) {
      const tal = new Map();
      for (const s of runder) for (const x of s.svar || []) { const v = tal.get(x.k) || [0, 0]; v[1]++; if (!x.ok) v[0]++; tal.set(x.k, v); }
      const svaere = kilde.spoergsmaal.map(q => ({ q, v: tal.get(noegle(q.q)) })).filter(x => x.v && x.v[0]).sort((a, b) => b.v[0] - a.v[0]).slice(0, 8);
      for (const x of svaere) linjer.push('  Forkert ' + x.v[0] + ' af ' + x.v[1] + ': ' + x.q.q + ' → ' + (x.q.type === 'tal' ? talTekst(x.q.svar) : x.q.svar));
      const ikke = kilde.spoergsmaal.filter(q => !tal.has(noegle(q.q))).length;
      if (ikke) linjer.push('  ' + ikke + ' af puljens ' + kilde.spoergsmaal.length + ' spørgsmål er ikke set endnu');
    }
    linjer.push('');
  }
  const uspillet = msMissioner().filter(x => x.aktiv !== false && !ids.includes(x.id)).map(x => x.titel);
  if (uspillet.length) linjer.push('Ikke spillet endnu: ' + uspillet.join(', '), '');
  linjer.push('Lav nye missioner i samme format som før (se claude/missioner-format.md i projektet).');
  return linjer.join('\n');
}

// ---------- Login og start ----------
function msVisLogin(besked) {
  document.body.dataset.tilstand = 'login';
  document.getElementById('login').hidden = false;
  const navn = document.getElementById('login-navn');
  if (!navn.value) navn.value = lokal.get('sidste-navn') || '';
  const fejl = document.getElementById('login-fejl');
  fejl.textContent = besked || ''; fejl.hidden = !besked;
  (navn.value ? document.getElementById('login-kode') : navn).focus();
}
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fejl = document.getElementById('login-fejl'), navn = document.getElementById('login-navn'), kode = document.getElementById('login-kode');
  fejl.hidden = true;
  if (!navn.value.trim()) { navn.focus(); return; }
  if (!kode.value) { kode.focus(); return; }
  const k = e.target.querySelector('.knap');
  k.disabled = true; k.textContent = 'Logger ind…';
  try {
    await Data.login(navn.value, kode.value);
    lokal.set('sidste-navn', navn.value.trim());
    kode.value = '';
    document.getElementById('login').hidden = true;
    msKlar();
  } catch (err) {
    console.error(err);
    fejl.textContent = err.message === 'mangler-profil' ? 'Din bruger mangler en profil i databasen.' : navigator.onLine ? 'Forkert navn eller kode. Prøv igen.' : 'Ingen forbindelse til internettet.';
    fejl.hidden = false;
  } finally { k.disabled = false; k.textContent = 'Log ind'; }
});
function msVisNet() {
  const e = document.getElementById('uden-net');
  if (e) e.hidden = !(Data.bruger() && (Data.udenNet() || !navigator.onLine));
}
function msKlar() {
  const p = Data.bruger();
  if (!p) { msVisLogin(); return; }
  document.body.dataset.tilstand = 'klar';
  document.body.classList.add('c-' + p.navn.toLowerCase());   // personens farve (style.css) – ingen navne i koden
  tegnForside();
  // Nye data udefra: tegn kun forsiden igen – ikke midt i en runde, på resultatet eller mens en voksen skriver i et felt
  Data.onChange(() => {
    if (document.body.dataset.vis !== 'forside') return;
    const f = document.querySelector('.ms-indfelt');
    if (f && (f.value || document.activeElement === f)) return;
    tegnForside();
  });
  msVisNet(); Data.onChange(msVisNet);
  window.addEventListener('online', msVisNet); window.addEventListener('offline', msVisNet);
}
async function msStart() {
  try {
    const profil = await Data.start();
    if (profil) msKlar(); else msVisLogin();
  } catch (err) {
    console.error(err);
    msVisLogin(err.message === 'mangler-profil' ? 'Din bruger mangler en profil i databasen.' : 'Kunne ikke forbinde. Tjek internettet og prøv igen.');
  }
}
window.addEventListener('unhandledrejection', e => {
  const net = !navigator.onLine || Data.udenNet() || Data.erNetfejl?.(e.reason);
  (net ? console.warn : console.error)(e.reason);
  if (net) visStatus('Uden net – det blev ikke gemt. Prøv igen, når nettet er tilbage.');
  else visStatus('Noget gik galt – ændringen blev måske ikke gemt.', true);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', msStart); else msStart();
