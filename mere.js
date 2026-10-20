// mere.js – siderne under "Mere": Pligter og stjerner, Pakkelister og Ugens konkurrence.
// Bruger de fælles hjælpere fra app.js (el, knap, input, felt, chipValg, aabnArk, bekraeft ...).
// Data går som altid gennem Data (data.js).

const erVoksen = () => Data.bruger()?.rolle === 'voksen';
const loggetIndBarn = () => {
  const p = Data.bruger();
  return p && p.rolle === 'barn' && BOERN.includes(p.navn) ? p.navn : null;
};
// Kun rigtige tal (eller tekst der er et tal) tæller – samme regel som databasens som_tal, så ingen kan snyde med fx [100]
const tal = v => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string' || !v.trim()) return 0;
  const n = Number(v.trim().replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const sum = (liste, felt) => liste.reduce((s, x) => s + tal(x[felt]), 0);
const kr = n => (Math.round(n * 100) / 100).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' kr';
const kortDato = iso => { const d = new Date(iso + 'T00:00'); return DAGE[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };

function bekraeftKnap(tekst, handling, klasse, fn) {
  const k = knap(tekst, klasse, () => bekraeft(k, fn));
  k.dataset.tekst = tekst;
  k.dataset.handling = handling;
  return k;
}
function fremskridt(andel) {
  const bar = el('span', 'fremskridt');
  const fyld = el('span');
  fyld.style.width = Math.round(Math.min(1, Math.max(0, andel)) * 100) + '%';
  bar.append(fyld);
  return bar;
}
function valgSeg(muligheder, valgt, onValg, tekstFn = v => v, ekstraKlasse = '') {
  const seg = el('div', 'seg ' + ekstraKlasse);
  seg.setAttribute('role', 'radiogroup');
  seg.append(...muligheder.map(m => {
    const k = knap(tekstFn(m), null, () => onValg(m));
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', m === valgt);
    return k;
  }));
  return seg;
}

function tegnMere() {
  tegnRutiner();
  tegnPligter();
  tegnPakkelister();
  tegnKonkurrence();
}

// =====================================================================
// RUTINER – faste forløb med trin og billeder (fx tandbørstning, sengetid)
// Data: 'rutiner' {barn, navn, tid 'TT:MM', dage [0-6], trin: [{tekst, piktogram?, billede?, soeg?}]}
//       (kun voksne kan rette). Flueben på trin huskes på enheden pr. dag.
// =====================================================================
let rutineBarn = BOERN.includes(lokal.get('rutine-barn')) ? lokal.get('rutine-barn') : BOERN[0];

// Startrutiner har kun et engelsk søgeord – piktogrammet slås op første gang det vises
const piktoOpslag = {};
const ventende = new Set();
function trinUrl(t, igen) {
  if (t.piktogram) return PIKTO_URL(t.piktogram);
  if (t.billede) return t.billede;
  if (!t.soeg) return '';
  if (t.soeg in piktoOpslag) return piktoOpslag[t.soeg] ? PIKTO_URL(piktoOpslag[t.soeg]) : '';
  if (!ventende.has(t.soeg)) {
    ventende.add(t.soeg);
    soegPiktogrammer(t.soeg).then(ids => { piktoOpslag[t.soeg] = ids[0] || null; if (ids[0] && igen) igen(); });
  }
  return '';
}
const harPiktogram = r => !!r.piktogram || (r.trin || []).some(t => t.piktogram || (t.soeg && piktoOpslag[t.soeg]));

const rutineAktiv = (r, dag) => !r.dage || !r.dage.length || r.dage.includes(dag);
// Hvilke dage: bestemte ugedage (dage) – eller dagtype 'skole'/'fri', som følger skolen:
// fridage = weekend, helligdage, ferie/fri/fravær i kalenderen og fast fridag i skemaet.
// 'foerSkole'/'foerFri' ser på dagen efter – fx sengetid søndag før skole (men ikke søndag i en ferie).
const DAGTYPER = {
  skole: { navn: 'Skoledage', ikon: '🎒', hint: 'Hverdage med skole – ikke i ferier, på helligdage eller fridage fra kalenderen.' },
  fri: { navn: 'Fridage', ikon: '😎', hint: 'Weekender, helligdage, ferie og fridage fra kalenderen (også syg/fri fra skolen) og fast fridag i skemaet.' },
  foerSkole: { navn: 'Før skoledag', ikon: '⏰', hint: 'Dagen før en skoledag – fx søndag aften og hverdage, men ikke sidste skoledag før en ferie. God til sengetid.' },
  foerFri: { navn: 'Før fridag', ikon: '🎉', hint: 'Dagen før en fridag – fx fredag, lørdag og aftenen før en ferie eller helligdag.' }
};
async function erSkoleFri(barn, dato) {
  const dag = (dato.getDay() + 6) % 7;
  const iso = isoDato(dato);
  if (dag >= 5 || helligdagDen(iso)) return true;   // helligdagDen fra dage.js
  if (friDen(await Data.list('kalender'), iso, barn)) return true;   // ferie, fri, syg (app.js)
  return fastFri(barn, dag);   // fast fridag hver uge (app.js)
}
// Pligter med dagtype (skoledage, fridage, før skoledag, før fridag) – synkron udgave med de SAMME regler som
// databasen (opdatering-pligter-dagtype.sql: skole_fri/pligt_i_dag): weekend, helligdag, ferie/fri/syg i kalenderen
// (aftaler uden gentagelse for barnet eller Fælles) og fast fridag i skemaet.
function skoleFriNu(barn, iso) {
  const dag = (tilDag(iso).getDay() + 6) % 7;
  if (dag >= 5 || helligdagDen(iso)) return true;
  const fri = Data.listNu('kalender').some(a => a.fri && !a.gentag && a.dato <= iso && (a.tilDato && a.tilDato > a.dato ? a.tilDato : a.dato) >= iso
    && [].concat(a.hvem || 'Fælles').some(h => h === barn || h === 'Fælles'));
  return fri || Data.listNu('skemadag').some(x => x.barn === barn && x.dag === dag && x.fri);
}
function pligtIDag(o, iso) {
  if (typeof punktPauset === 'function' && punktPauset(o, iso)) return false;   // ⏸ pligten holder pause (pause.js)
  if (DAGTYPER[o.dagtype]) {
    if (o.dagtype === 'foerSkole' || o.dagtype === 'foerFri') return skoleFriNu(o.barn, plusDage(iso, 1)) === (o.dagtype === 'foerFri');
    return skoleFriNu(o.barn, iso) === (o.dagtype === 'fri');
  }
  const dag = (tilDag(iso).getDay() + 6) % 7;
  return !Array.isArray(o.dage) || !o.dage.length || o.dage.includes(dag);
}
async function rutineIDag(r, dato) {
  if (typeof punktPauset === 'function' && punktPauset(r, isoDato(dato))) return false;   // ⏸ rutinen holder pause (pause.js)
  if (!DAGTYPER[r.dagtype]) return rutineAktiv(r, (dato.getDay() + 6) % 7);
  if (r.dagtype === 'foerSkole' || r.dagtype === 'foerFri') {
    const imorgen = new Date(dato.getFullYear(), dato.getMonth(), dato.getDate() + 1);
    return (await erSkoleFri(r.barn, imorgen)) === (r.dagtype === 'foerFri');
  }
  return (await erSkoleFri(r.barn, dato)) === (r.dagtype === 'fri');
}
const dageTekst = r => (DAGTYPER[r.dagtype] ? DAGTYPER[r.dagtype].ikon + ' ' + DAGTYPER[r.dagtype].navn
  : !r.dage || !r.dage.length || r.dage.length === 7 ? 'Hver dag' : r.dage.map(i => DAGE[i]).join(', '));
// En rutine har enten et klokkeslæt (tid) eller en dagsdel (dagsdel) – fx børste tænder en weekendmorgen.
// En dagsdel-rutine er "Nu" hele vinduet, indtil alle trin er klaret.
const DAGSDELE = {
  morgen: { navn: 'Morgen', ikon: '🌅', fra: 5 * 60, til: 11 * 60, tekst: 'kl. 5–11' },
  eftermiddag: { navn: 'Eftermiddag', ikon: '☀️', fra: 12 * 60, til: 17 * 60, tekst: 'kl. 12–17' },
  aften: { navn: 'Aften', ikon: '🌙', fra: 17 * 60, til: 22 * 60, tekst: 'kl. 17–22' }
};
const rutineDel = r => DAGSDELE[r.dagsdel] || null;
const tilMinutter = t => { const [h, mm] = (t || '').split(':').map(Number); return isNaN(h) ? 24 * 60 : h * 60 + (mm || 0); };
const rutineStart = r => (rutineDel(r) ? rutineDel(r).fra : tilMinutter(r.tid));
const rutineSort = (a, b) => rutineStart(a) - rutineStart(b) || (a.navn || '').localeCompare(b.navn || '', 'da');
const rutineTidTekst = r => (rutineDel(r) ? rutineDel(r).navn : visTid(r.tid) || '');
function rutineTidEl(r) {
  const d = rutineDel(r);
  const s = el('span', 'rutine-tid' + (d ? ' dagsdel' : ''), d ? d.ikon : visTid(r.tid) || '');
  if (d) { s.title = d.navn; s.setAttribute('aria-label', d.navn); }
  return s;
}
const tjekNoegle = (r, iso) => 'rutine-' + r.id + '-' + iso;
function hentTjek(r, iso) { try { return new Set(JSON.parse(lokal.get(tjekNoegle(r, iso)) || '[]')); } catch { return new Set(); } }
function gemTjek(r, iso, s) { lokal.set(tjekNoegle(r, iso), JSON.stringify([...s])); }

function trinBillede(t, klasse, igen) {
  const url = trinUrl(t, igen);
  if (!url) return el('span', klasse + ' tomt-billede', (t.tekst || '?').slice(0, 1).toUpperCase());
  const img = el('img', klasse);
  img.src = url; img.alt = ''; img.loading = 'lazy';
  return img;
}

// Lille billede/piktogram på en hel rutine eller pligt ({piktogram?, billede?})
// Emoji ud fra navnet, når der ikke er valgt et billede (så de mindste kan "læse" med billeder)
const AUTO_EMOJI = [[/\bbil/i, '🚗'], [/græs|have|blade/i, '🌿'], [/opvask/i, '🍽️'], [/seng/i, '🛏️'], [/læs|lektie|bog/i, '📖'], [/tænder|tand/i, '🪥'], [/skrald/i, '🗑️'],
  [/støvsug|ryd|rydde|værelse/i, '🧹'], [/tøj|vask/i, '👕'], [/alfie|kanin|hø/i, '🐰'], [/skærm|ipad|spil/i, '📱'], [/lego/i, '🧱'],
  [/biograf|film/i, '🎬'], [/\bis\b|slik|kage/i, '🍦'], [/penge|kr\b/i, '💰'], [/bord/i, '🍴'], [/hund|gå tur/i, '🚶'], [/bad|brus/i, '🚿'],
  [/smag|mad|aftensmad/i, '🍲'], [/skole|taske/i, '🎒'], [/træn|fodbold|sport/i, '⚽'], [/legetøj/i, '🧸'], [/sko/i, '👟']];
// Emoji kan slås fra pr. person (Indstillinger → "😀 Emoji ved pligter og belønninger" = personvalg.emoji)
const emojiTil = barn => !barn || Data.listNu('personvalg').find(x => x.navn === barn)?.emoji !== false;
const autoEmoji = (navn, barn) => (emojiTil(barn) && (AUTO_EMOJI.find(([r]) => r.test(navn || '')) || [])[1]) || '';
// Ikon ved pligt/rutine: eget billede/piktogram > valgt emoji (x.emoji; 'ingen' = ingen) > automatisk emoji ud fra navnet
function ikonBillede(x, klasse = 'lille-ikon', auto = true) {
  const url = x.piktogram ? PIKTO_URL(x.piktogram) : x.billede || '';
  if (!url) {
    if (x.emoji === 'ingen') return '';
    const barn = x.barn && x.barn !== 'Begge' ? x.barn : typeof pligtBarn !== 'undefined' ? pligtBarn : null;
    const e = x.emoji || (auto ? autoEmoji(x.navn, barn) : '');
    return e ? el('span', klasse + ' auto-emoji', e) : '';
  }
  const img = el('img', klasse);
  img.src = url; img.alt = ''; img.loading = 'lazy';
  return img;
}
const EMOJI_VALG = ['🧹', '🍽️', '🍴', '🛏️', '🧺', '👕', '🗑️', '🪥', '🚿', '📖', '✏️', '🎒', '🐰', '🐶', '🌿', '🚗', '🍳', '🛒', '⚽', '🎹', '🧸', '👟', '💪', '⭐'];
// Fold-ud-felt: emoji (Automatisk / Ingen / vælg / skriv selv) + billedvælgeren. Samme element kan sættes ind igen, når panelet tegnes om.
function ikonFelt(start) {
  const vaelger = billedVaelger(start);
  let emoji = start.emoji || '';   // '' = automatisk ud fra navnet
  const boks = el('details', 'ikon-felt');
  const titel = el('summary');
  const visPlads = el('span', 'ikon-vis');
  titel.append(el('span', null, 'Emoji eller billede (valgfrit)'), visPlads);
  const visNu = () => { const v = ikonBillede({ ...start, ...vaelger.vaerdi(), emoji }, 'lille-ikon', false); visPlads.replaceChildren(...(v ? [v] : [])); };
  const seg = el('div', 'seg wrap emoji-valg');
  const tegnSeg = () => seg.replaceChildren(...[['', 'Automatisk'], ['ingen', 'Ingen'], ...EMOJI_VALG.map(e => [e, e])].map(([v, tekst]) => {
    const k = knap(tekst, v && v !== 'ingen' ? 'emoji-knap' : null, () => { emoji = v; tegnSeg(); visNu(); });
    k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', emoji === v);
    if (v === '') k.setAttribute('aria-label', 'Automatisk emoji ud fra navnet');
    return k;
  }));
  tegnSeg();
  const egen = input('text', 'emoji-egen', EMOJI_VALG.includes(emoji) || emoji === 'ingen' ? '' : emoji, 'Eller skriv/indsæt en emoji');
  egen.maxLength = 8;
  egen.addEventListener('input', () => { const t = egen.value.trim(); emoji = t; tegnSeg(); visNu(); });
  visNu();
  boks.append(titel, el('label', 'felt-label', 'Emoji'), seg, egen,
    el('p', 'hint', 'Automatisk = en emoji ud fra navnet, fx 🧹 ved "Ryd op". Et billede eller piktogram går forud for emojien.'),
    ...vaelger.dele);
  return { element: boks, vaerdi: () => ({ ...vaelger.vaerdi(), emoji: emoji || null }) };
}

// Kort til drengenes tavle
async function rutineKort(barn, dato) {
  const dag = (dato.getDay() + 6) % 7;
  const iso = isoDato(dato);
  const alle = (await Data.list('rutiner')).filter(r => r.barn === barn);
  const iDag = await Promise.all(alle.map(r => rutineIDag(r, dato)));
  const rutiner = alle.filter((r, i) => iDag[i]).sort(rutineSort);
  if (!rutiner.length) return null;
  const nu = new Date();
  const nuMin = nu.getHours() * 60 + nu.getMinutes();
  const tilMin = tilMinutter;
  const erIdag = iso === isoDato(nu);
  const faerdigR = r => (r.trin || []).length > 0 && hentTjek(r, iso).size >= r.trin.length;
  // Den næste rutine i dag: den første der ikke er færdig og ikke er mere end en time over tiden (dagsdel: vinduet er ikke slut)
  const naeste = erIdag ? rutiner.find(r => hentTjek(r, iso).size < (r.trin || []).length
    && (rutineDel(r) ? rutineDel(r).til > nuMin : tilMin(r.tid) >= nuMin - 60)) : null;

  const k = el('div', 'kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Rutiner'));
  k.append(top);
  const ul = el('ul', 'rutine-liste');
  for (const r of rutiner) {
    const tjek = hentTjek(r, iso);
    const antal = (r.trin || []).length;
    const faerdig = antal && tjek.size >= antal;
    const li = el('li');
    // Uden trin er der intet at vise – så kan rækken ikke trykkes på
    const b = antal ? knap('', 'rutine-raekke' + (r === naeste ? ' naeste' : '') + (faerdig ? ' faerdig' : ''), () => visRutine(r, iso))
      : el('div', 'rutine-raekke uden-trin');
    const strip = el('span', 'rutine-strip');
    (r.trin || []).slice(0, 5).forEach(t => strip.append(trinBillede(t, 'mini-billede', () => tegnOverblik())));
    const info = el('span', 'rutine-info');
    const rNavn = el('span', 'rutine-navn');
    rNavn.append(ikonBillede(r), r.navn);
    info.append(rNavn, strip);
    b.append(rutineTidEl(r), info,
      el('span', 'rutine-status', faerdig ? '✓' : antal ? tjek.size + '/' + antal : ''));
    li.append(b);
    ul.append(li);
  }
  k.append(ul);
  if (rutiner.some(harPiktogram)) k.append(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
  // Opsummering til tavle-visningen
  const ialt = rutiner.reduce((n, r) => n + (r.trin || []).length, 0);
  const klaret = rutiner.reduce((n, r) => n + Math.min(hentTjek(r, iso).size, (r.trin || []).length), 0);
  // Rutiner er en guide (der skal ikke registreres noget): flisen viser den rutine, der er nu, eller den næste
  const t = { noegle: 'rutiner', ikon: '🪥', titel: 'Rutiner' };
  const omTekst = m => (m < 60 ? 'om ' + m + ' min' : m < 90 ? 'om ca. 1 time' : 'om ca. ' + Math.round(m / 60) + ' timer');
  // Klokkeslæt: fra 15 min før til 45 min efter. Dagsdel: hele vinduet, indtil alle trin er klaret. Et klokkeslæt går forud.
  const iVindue = r => {
    const d = rutineDel(r);
    if (d) return d.fra <= nuMin && nuMin < d.til && !faerdigR(r);
    return r.tid && tilMin(r.tid) - 15 <= nuMin && nuMin - tilMin(r.tid) <= 45 && !faerdigR(r);   // klaret = ikke længere "Nu"
  };
  const nuR = erIdag ? (rutiner.filter(r => !rutineDel(r) && iVindue(r)).pop() || rutiner.find(r => rutineDel(r) && iVindue(r))) : null;
  const naesteR = rutiner.find(r => !erIdag || (rutineDel(r) ? rutineDel(r).fra > nuMin : !r.tid || tilMin(r.tid) - 15 > nuMin));
  const antalTrin = r => (r.trin || []).length;
  // "Bagefter" kun hvis den næste rutine starter inden for 2 timer – ellers står antal trin (sengetid kl. 20 skal ikke stå om morgenen)
  const efterTekst = r => 'Bagefter: ' + r.navn + (rutineDel(r) ? ' · ' + rutineDel(r).navn.toLowerCase() : ' ' + visTid(r.tid));
  // En dagsdel siger ikke "Nu:" – det skal bare gøres i løbet af morgenen, ikke i det øjeblik man vågner
  if (nuR && rutineDel(nuR)) Object.assign(t, { stor: nuR.navn,
    lille: 'I løbet af ' + rutineDel(nuR).navn.toLowerCase() + 'en' + (antalTrin(nuR) ? ' · ' + antalTrin(nuR) + ' trin' : '') });
  else if (nuR) Object.assign(t, { stor: 'Nu: ' + nuR.navn, lille: (r => r ? efterTekst(r)
    : antalTrin(nuR) ? antalTrin(nuR) + ' trin – tryk for at se dem' : rutineDel(nuR) ? rutineDel(nuR).navn : 'Kl. ' + visTid(nuR.tid))(rutiner.find(r => r !== nuR && rutineStart(r) > rutineStart(nuR) && !faerdigR(r) && rutineStart(r) - nuMin <= 120)) });
  else if (naesteR) Object.assign(t, { stor: naesteR.navn, lille: [rutineTidTekst(naesteR), erIdag && naesteR.tid && !rutineDel(naesteR) ? omTekst(tilMin(naesteR.tid) - nuMin) : ''].filter(Boolean).join(' · ') });
  else Object.assign(t, { stor: 'Ikke flere i dag', klar: true, lille: 'Puha – fri for rutiner 😴' });
  k.tavle = t;
  return k;
}

// Én rutine trin for trin – store billeder man trykker på, når de er klaret
function visRutine(r, iso) {
  const tjek = hentTjek(r, iso);
  const trin = r.trin || [];
  const grid = el('div', 'trin-grid');
  const status = el('p', 'rutine-fremskridt');
  const tegn = () => {
    grid.replaceChildren(...trin.map((t, i) => {
      const b = knap('', 'trin' + (tjek.has(i) ? ' klaret' : ''), () => {
        if (tjek.has(i)) tjek.delete(i);
        else { tjek.add(i); if (tjek.size >= trin.length) fejr(r.navn + ' er klaret! 🎉'); }
        gemTjek(r, iso, tjek);
        tegn();
      });
      b.setAttribute('aria-pressed', tjek.has(i));
      b.append(el('span', 'trin-nr', i + 1), trinBillede(t, 'trin-billede', tegn), el('span', 'trin-tekst', t.tekst || ''));
      const flueben = el('span', 'trin-flueben');
      flueben.innerHTML = IKON_TJEK;
      b.append(flueben);
      return b;
    }));
    status.textContent = tjek.size >= trin.length && trin.length ? 'Godt klaret! Alle trin er færdige.' : tjek.size + ' af ' + trin.length + ' trin';
    status.classList.toggle('alle', tjek.size >= trin.length && trin.length > 0);
  };
  tegn();
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Start forfra', 'knap sekundaer-knap', () => { tjek.clear(); gemTjek(r, iso, tjek); tegn(); }),
    knap('Færdig', 'knap', () => { lukArk(); tegnAlt(); }));
  aabnArk(r.navn + (rutineTidTekst(r) ? ' · ' + rutineTidTekst(r) : ''), status, grid,
    trin.some(t => t.piktogram || t.soeg) ? el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA') : '', knapper);
}

// Siden "Rutiner" under Mere
async function tegnRutiner() {
  const boks = document.getElementById('rutiner-indhold');
  const laast = loggetIndBarn();
  if (laast) rutineBarn = laast;
  const barn = rutineBarn;
  const rutiner = (await Data.list('rutiner')).filter(r => r.barn === barn).sort(rutineSort);
  const dele = [];
  if (!laast) dele.push(valgSeg(BOERN, barn, b => { rutineBarn = b; lokal.set('rutine-barn', b); tegnRutiner(); }));
  const ul = el('ul', 'rutine-liste kort-liste');
  const iso = isoDato(new Date());
  for (const r of rutiner) {
    const li = el('li');
    const b = erVoksen() || (r.trin || []).length ? knap('', 'rutine-raekke', () => (erVoksen() ? redigerRutine(r) : visRutine(r, iso)))
      : el('div', 'rutine-raekke uden-trin');   // børn: en rutine uden trin kan ikke åbnes
    const strip = el('span', 'rutine-strip');
    (r.trin || []).slice(0, 6).forEach(t => strip.append(trinBillede(t, 'mini-billede', () => tegnRutiner())));
    const dage = dageTekst(r);
    const info = el('span', 'rutine-info');
    const rNavn = el('span', 'rutine-navn');
    rNavn.append(ikonBillede(r), r.navn);
    const pt = typeof punktPauseTekst === 'function' ? punktPauseTekst(r) : '';
    info.append(rNavn, el('span', 'ret-under', [pt, dage, rutineDel(r) && rutineDel(r).navn, (r.trin || []).length + ' trin'].filter(Boolean).join(' · ')), strip);
    b.append(rutineTidEl(r), info, el('span', 'm-pil', '›'));
    li.append(b);
    if (erVoksen() && typeof pauseKnap === 'function') { li.classList.add('med-pause'); if (pt) li.classList.add('pauset'); li.append(pauseKnap('rutiner', r, () => tegnRutiner())); }   // ⏸ pause.js
    ul.append(li);
  }
  if (!rutiner.length) ul.append(el('li', 'tom', 'Ingen rutiner endnu'));
  dele.push(ul);
  if (erVoksen()) dele.push(knap('Ny rutine', 'knap bred-knap', () => redigerRutine({ barn, trin: [] })));
  else dele.push(el('p', 'hint', 'Tryk på en rutine for at se trinene.'));
  boks.replaceChildren(...dele);
}

// Ret en rutine (kun voksne). Billedvalg til et trin åbner i samme panel med "Tilbage".
function redigerRutine(r) {
  const ny = !r.id;
  const s = {
    navn: r.navn || '', tid: r.tid || '', til: r.barn || rutineBarn,
    hvornaar: DAGSDELE[r.dagsdel] ? r.dagsdel : 'klokken',
    dagtype: DAGTYPER[r.dagtype] ? r.dagtype : 'dage',
    dage: new Set(r.dage && r.dage.length ? r.dage : [0, 1, 2, 3, 4, 5, 6]),
    trin: (r.trin || []).map(t => ({ ...t }))
  };
  const ikon = ikonFelt(r);   // bevares når panelet tegnes om

  function vis() {
    const navn = input('text', 'rut-navn', s.navn, 'Fx sengetid');
    navn.addEventListener('input', () => { s.navn = navn.value; });
    const tid = input('time', 'rut-tid', s.tid);
    tid.addEventListener('change', () => { s.tid = tid.value; });
    const tilValg = chipValg(ny ? [...BOERN, 'Begge'] : [s.til], s.til, v => { s.til = v; });
    const dageBoks = el('div', 'seg wrap dage-valg');
    const tegnDage = () => dageBoks.replaceChildren(...DAGE.map((d, i) => {
      const k = knap(d, null, () => { if (s.dage.has(i)) s.dage.delete(i); else s.dage.add(i); tegnDage(); });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', s.dage.has(i));
      return k;
    }));
    tegnDage();
    // Bestemte ugedage – eller skoledage/fridage, der følger kalenderen (ferie, helligdage …)
    const typeHint = el('p', 'hint');
    const visDagtype = () => {
      dageBoks.hidden = s.dagtype !== 'dage';
      typeHint.hidden = s.dagtype === 'dage';
      typeHint.textContent = DAGTYPER[s.dagtype]?.hint || '';
    };
    const dagtypeValg = chipValg(['dage', ...Object.keys(DAGTYPER)], s.dagtype, v => { s.dagtype = v; visDagtype(); },
      v => (v === 'dage' ? '📅 Vælg dage' : DAGTYPER[v].ikon + ' ' + DAGTYPER[v].navn));
    visDagtype();

    const trinListe = el('ol', 'trin-ret-liste');
    s.trin.forEach((t, i) => {
      const li = el('li');
      const billedKnap = knap('', 'trin-ret-billede', () => vaelgBillede(i));
      billedKnap.setAttribute('aria-label', 'Vælg billede til trin ' + (i + 1));
      billedKnap.append(trinBillede(t, 'mini-billede stor', () => vis()));
      const tekst = input('text', 'trin-' + i, t.tekst, 'Trin ' + (i + 1));
      tekst.addEventListener('input', () => { t.tekst = tekst.value; });
      const op = knap('↑', 'lille-pil', () => { if (i > 0) { [s.trin[i - 1], s.trin[i]] = [s.trin[i], s.trin[i - 1]]; vis(); } });
      op.setAttribute('aria-label', 'Flyt op');
      op.disabled = i === 0;
      const slet = knap('', 'slet', () => { s.trin.splice(i, 1); vis(); });
      slet.innerHTML = IKON_SLET;
      slet.setAttribute('aria-label', 'Slet trin');
      li.append(billedKnap, tekst, op, slet);
      trinListe.append(li);
    });
    const nytTrin = knap('+ Tilføj trin', 'lille-knap', () => { s.trin.push({ tekst: '' }); vis(); setTimeout(() => document.getElementById('trin-' + (s.trin.length - 1))?.focus(), 50); });

    // Hvornår: et klokkeslæt eller en dagsdel (morgen/eftermiddag/aften)
    const tidFelt = felt('Klokkeslæt', tid);
    const delHint = el('p', 'hint');
    const visHvornaar = () => {
      const d = DAGSDELE[s.hvornaar];
      tidFelt.hidden = !!d;
      delHint.hidden = !d;
      if (d) delHint.textContent = 'Står på tavlen som "' + (s.navn.trim() || d.navn) + ' – i løbet af ' + d.navn.toLowerCase() + 'en" (' + d.tekst + '), indtil alle trin er klaret.';
    };
    const hvornaar = chipValg(['klokken', ...Object.keys(DAGSDELE)], s.hvornaar, v => { s.hvornaar = v; visHvornaar(); },
      v => (v === 'klokken' ? '🕖 Klokkeslæt' : DAGSDELE[v].ikon + ' ' + DAGSDELE[v].navn));
    visHvornaar();
    const to = el('div');
    to.append(felt('Navn', navn), felt('Hvornår', hvornaar), tidFelt, delHint);
    const gem = knap('Gem', 'knap', async () => {
      if (!s.navn.trim()) { navn.focus(); return; }
      const felter = {
        navn: s.navn.trim(), tid: DAGSDELE[s.hvornaar] ? '' : s.tid, dagsdel: DAGSDELE[s.hvornaar] ? s.hvornaar : null,
        dagtype: DAGTYPER[s.dagtype] ? s.dagtype : null, dage: [...s.dage].sort((a, b) => a - b), ...ikon.vaerdi(),
        trin: s.trin.filter(t => (t.tekst || '').trim() || t.piktogram || t.billede || t.soeg)
          .map(t => ({ tekst: (t.tekst || '').trim(), piktogram: t.piktogram || null, billede: t.billede || '', soeg: t.piktogram || t.billede ? '' : (t.soeg || '') }))
      };
      if (ny) for (const b of (s.til === 'Begge' ? BOERN : [s.til])) await Data.add('rutiner', { ...felter, barn: b });
      else await Data.update('rutiner', r.id, felter);
      lukArk(); tegnAlt();
    });
    const knapper = el('div', 'ark-knapper');
    if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('rutiner', r.id); lukArk(); tegnAlt(); }));
    knapper.append(gem);
    aabnArk(ny ? 'Ny rutine' : 'Ret rutine', to, felt('Til', tilValg), el('label', 'felt-label', 'Dage'), dagtypeValg, dageBoks, typeHint,
      el('label', 'felt-label', 'Trin'), trinListe, nytTrin, ikon.element, knapper);
  }

  function vaelgBillede(i) {
    const t = s.trin[i];
    const vaelger = billedVaelger(t, dansk => { if (!(t.tekst || '').trim() && dansk) t.tekst = dansk; });
    const knapper = el('div', 'ark-knapper');
    knapper.append(knap('Tilbage', 'knap sekundaer-knap', () => vis()),
      knap('Brug billedet', 'knap', () => { Object.assign(t, vaelger.vaerdi(), { soeg: '' }); vis(); }));
    aabnArk('Billede til trin ' + (i + 1) + (t.tekst ? ' · ' + t.tekst : ''), ...vaelger.dele, knapper);
  }

  vis();
}

// =====================================================================
// PLIGTER OG BELØNNING
// Data:
//   'opgaver'       {barn, navn, frivillig?: true (bonus – tæller ikke som pligt), gentag: 'dag'|'uge'|'interval'|'engang', dage: [0-6], interval: dage, start: dato, regnFra: 'fast'|'klaret', kr, stjerner}
//                   'interval' = med fast mellemrum (fx sengetøj hver 2. torsdag); 'fast' holder rytmen fra start, 'klaret' regner fra sidst klaret
//                   (kun voksne kan rette)
//                   barn kan også være en voksen (egne pligter – vises kun for den voksne selv)
//   'flueben'       {opgave, barn, periode, dato, navn, kr, stjerner}  – periode = dato / ugens mandag / 'engang'
//   'beloenninger'  {barn: navn|'Begge', navn, stjerner, engang?: true} (kun voksne kan rette)
//                   engang = "kun én gang": forsvinder for barnet, når den er godkendt
//   'indloesninger' {barn, navn, stjerner, dato, status: 'afventer'|'godkendt'|'afvist', besvaret?}
//                   – børn ønsker (afventer), en voksen godkender/afviser. Uden status = godkendt (gamle rækker).
//                   Afventende stjerner er reserveret; afviste tæller ikke.
//   'udbetalinger'  {barn, kr, dato}                                   (kun voksne kan rette)
//   'personregler'  {navn, kr: true/false, stjerner: true/false}      (kun voksne kan rette)
//                   – om personen får lommepenge og/eller stjerner. Standard: børn begge dele, voksne ingen.
// =====================================================================
let pligtBarn = lokal.get('pligt-barn') || BOERN[0];
let pligtRet = false;
const BELOENNING_NAVN = { ingen: 'Ingenting', penge: 'Penge', stjerner: 'Stjerner', begge: 'Penge og stjerner' };

// Hvem man kan se pligter for: et barn ser kun sig selv; en voksen ser drengene og sig selv
function pligtPersoner() {
  const laast = loggetIndBarn();
  if (laast) return [laast];
  const mig = Data.bruger()?.navn;
  return [...BOERN, ...(mig && !BOERN.includes(mig) ? [mig] : [])];
}

async function regelFor(navn) {
  const r = (await Data.list('personregler')).find(x => x.navn === navn);
  const barn = BOERN.includes(navn);
  // streakBonus = stjerner for at holde rækken (sjov.js); 0 = fra, standard 1
  // sedler = må sende køleskabssedler og skrive svar (seddel.js); standard ja
  return r ? { kr: !!r.kr, stjerner: !!r.stjerner, streakBonus: r.streakBonus ?? 1, joker: r.joker !== false, sedler: r.sedler !== false }
    : { kr: barn, stjerner: barn, streakBonus: 1, joker: true, sedler: true };
}
async function saetRegel(navn, felt, vaerdi) {
  const r = (await Data.list('personregler')).find(x => x.navn === navn);
  if (r) await Data.update('personregler', r.id, { [felt]: vaerdi });
  else await Data.add('personregler', { ...(await regelFor(navn)), navn, [felt]: vaerdi });
}

async function pligtData(barn) {
  const [opgaver, flueben, beloenninger, indl, udb, just, bonus, jokere, ekstra, jobs] = await Promise.all(
    ['opgaver', 'flueben', 'beloenninger', 'indloesninger', 'udbetalinger', 'justeringer', 'streakbonus', 'streakjoker', 'ekstra', 'jobs'].map(l => Data.list(l)));
  const mineJust = just.filter(x => x.barn === barn);
  return {
    opgaver: opgaver.filter(o => o.barn === barn),
    flueben: flueben.filter(f => f.barn === barn),
    beloenninger: beloenninger.filter(b => b.barn === barn || (b.barn === 'Begge' && BOERN.includes(barn))),
    indl: indl.filter(x => x.barn === barn),
    udb: udb.filter(x => x.barn === barn),
    bonus: bonus.filter(x => x.barn === barn),   // streak-bonus (sjov.js)
    jokere: jokere.filter(x => x.barn === barn),   // rednings-jokere (sjov.js)
    ekstra: ekstra.filter(x => x.barn === barn),   // ekstra stjerner (ros / godkendte ønsker)
    jobs: jobs.filter(x => x.barn === barn),   // ekstra-jobs barnet har taget
    ledigeJobs: jobs.filter(x => x.status === 'ledig' && (!x.til || x.til === barn)),
    just: mineJust.filter(x => x.type !== 'streak'),   // + / − stjerner og kr fra en voksen
    streakAnker: mineJust.filter(x => x.type === 'streak').sort((a, b) => (a.oprettet || '').localeCompare(b.oprettet || '')).pop() || null,
    regel: await regelFor(barn),
    maal: (await valgFor(barn)).maal || null,   // "Mit mål": den belønning barnet sparer op til (personvalg.maal)
    barn,
    kalender: await Data.list('kalender')   // bruges til sygedage (bryder ikke streak)
  };
}

function saldo(d) {
  const man = isoDato(mandagDenneUge());
  // En gave på en "næste morgen"-seddel tæller først fra den dag, sedlen vises
  const idagIso = isoDato(new Date());
  // Flueben der venter på 👍 fra mor/far tæller ikke endnu; godkendte ekstra-jobs tæller
  const job = (d.jobs || []).filter(x => x.status === 'godkendt');
  d = { ...d, just: [...(d.just || []).filter(x => !x.dato || x.dato <= idagIso), ...job], flueben: d.flueben.filter(f => !f.venter) };
  return {
    stjerner: sum(d.flueben, 'stjerner') + sum(d.bonus || [], 'stjerner') + sum((d.ekstra || []).filter(x => x.status === 'godkendt'), 'stjerner') + sum(d.just || [], 'stjerner') - sum(d.indl.filter(x => x.status !== 'afvist'), 'stjerner'),
    tilGode: sum(d.flueben, 'kr') + sum(d.just || [], 'kr') - sum(d.udb, 'kr'),
    ugeKr: sum(d.flueben.filter(f => f.dato >= man), 'kr')
  };
}

// "Kun én gang"-belønning, som barnet allerede har fået godkendt
const brugtOp = (b, d) => !!b.engang && d.indl.some(x => x.navn === b.navn && (x.status || 'godkendt') === 'godkendt');

// Pligter med fast mellemrum: næste gang = sidst klaret + mellemrum (eller startdatoen første gang)
const intervalDage = o => Math.max(1, Math.round(tal(o.interval)) || 14);
function sidstKlaret(o, d) {
  const datoer = d.flueben.filter(x => x.opgave === o.id && !x.sprunget).map(x => x.dato).sort();
  return datoer[datoer.length - 1] || null;
}
// regnFra 'fast' (standard): holder rytmen fra startdatoen (fx hver 2. torsdag), også når den klares for sent.
// regnFra 'klaret': næste gang regnes fra den dag, den blev klaret.
const fastRytme = o => o.regnFra !== 'klaret';
function naesteForfald(o, d) {
  const n = intervalDage(o);
  const start = o.start || isoDato(new Date());
  const sidst = sidstKlaret(o, d);
  if (!sidst) {
    // Aldrig klaret: datoer i rytmen fra før pligten blev oprettet tæller ikke som "over tid"
    const oprettet = o.oprettet ? isoDato(new Date(o.oprettet)) : start;
    if (start >= oprettet || !fastRytme(o)) return start >= oprettet ? start : oprettet;
    return plusDage(start, Math.ceil(dageMellem(start, oprettet) / n) * n);
  }
  if (!fastRytme(o)) return plusDage(sidst, n);
  if (sidst < start) return start;
  return plusDage(start, (Math.floor(dageMellem(start, sidst) / n) + 1) * n);
}
const ugedagNavn = iso => DAGE_LANG[(new Date(iso + 'T00:00').getDay() + 6) % 7].toLowerCase();
const intervalTekst = o => {
  const n = intervalDage(o);
  if (fastRytme(o) && n % 7 === 0 && o.start) return n === 7 ? 'Hver ' + ugedagNavn(o.start) : 'Hver ' + n / 7 + '. ' + ugedagNavn(o.start);
  return n % 7 === 0 ? (n === 7 ? 'Hver uge' : 'Hver ' + n / 7 + '. uge') : n === 1 ? 'Hver dag' : 'Hver ' + n + '. dag';
};

// Dagens opgaver: hver-dag-opgaver for i dag, ugens opgaver, pligter med mellemrum der er forfaldne,
// og engangsopgaver der ikke er klaret
// iso = en anden dag (voksne kan rette en tidligere dag på Pligter – fx hvis barnet glemte at krydse af)
function dagensOpgaver(d, iso = isoDato(new Date())) {
  const man = isoDato(mandagFor(tilDag(iso)));
  const res = [];
  for (const o of d.opgaver) {
    if (typeof punktPauset === 'function' && punktPauset(o, iso)) continue;   // ⏸ holder pause (pause.js)
    // Bonus sprunget over i dag ("Ikke i dag") – vises nederst med Fortryd; i morgen er den der igen
    const sprunget = o.frivillig && d.flueben.find(x => x.opgave === o.id && x.sprunget && x.dato === iso);
    if (sprunget) { res.push({ o, periode: 'sprunget-' + iso, f: null, sprunget }); continue; }
    let periode;
    if (o.gentag === 'interval') {
      const idagF = d.flueben.find(x => x.opgave === o.id && x.periode === iso);
      if (idagF) { res.push({ o, periode: iso, f: idagF }); continue; }
      const forfald = naesteForfald(o, d);
      if (forfald > iso) continue;
      res.push({ o, periode: iso, f: null, overTid: dageMellem(forfald, iso) });
      continue;
    }
    if (o.gentag === 'uge') periode = man;
    else if (o.gentag === 'engang') periode = 'engang';
    else {
      if (!pligtIDag(o, iso)) continue;   // bestemte ugedage eller skoledage/fridage
      periode = iso;
    }
    const f = d.flueben.find(x => x.opgave === o.id && x.periode === periode);
    if (o.gentag === 'engang' && f && f.dato !== iso) continue;   // klaret en tidligere dag
    res.push({ o, periode, f, dato: iso });
  }
  const orden = { dag: 0, interval: 1, uge: 2, engang: 3 };
  return res.sort((a, b) => Number(!!a.sprunget) - Number(!!b.sprunget) || Number(!!a.o.frivillig) - Number(!!b.o.frivillig)
    || (orden[a.o.gentag] ?? 0) - (orden[b.o.gentag] ?? 0));
}
// Det der skal klares (bonus-pligter tæller ikke med)
const skalKlares = liste => liste.filter(r => !r.o.frivillig);
// Spring en bonus over i dag (barnet må selv – gemmes som et flueben uden belønning)
async function springOver(barn, r) {
  const iso = isoDato(new Date());
  await Data.add('flueben', { opgave: r.o.id, barn, periode: 'sprunget-' + iso, dato: iso, navn: r.o.navn, kr: 0, stjerner: 0, sprunget: true });
  tegnAlt();
}

const travleFlueben = new Set();   // dobbelttryk på en pligt må ikke give to flueben
async function skiftFlueben(barn, r, regel) {
  const noegle = r.o.id + '|' + r.periode;
  if (travleFlueben.has(noegle)) return;
  travleFlueben.add(noegle);
  try { await skiftFluebenNu(barn, r, regel); } finally { setTimeout(() => travleFlueben.delete(noegle), 400); }
}
async function skiftFluebenNu(barn, r, regel) {
  const idagIso = isoDato(new Date());
  const glemt = !erVoksen() && r.dato && r.dato < idagIso;   // barnet melder en glemt dag – mor/far skal sige 👍
  if (glemt && r.f) {
    if (!(r.f.glemt && r.f.venter)) { besked('Den dag er klaret – spørg mor eller far, hvis den er forkert'); return; }   // sjov.js
    await Data.remove('flueben', r.f.id);
    tegnAlt();
    return;
  }
  // Et barn kan ikke fjerne et flueben, hvis stjernerne/pengene allerede er brugt (ellers: sæt flueben, ønsk, fjern flueben)
  if (r.f && !erVoksen() && (tal(r.f.stjerner) > 0 || tal(r.f.kr) > 0)) {
    const s = saldo(await pligtData(barn));
    if (s.stjerner - tal(r.f.stjerner) < 0 || s.tilGode - tal(r.f.kr) < 0) {
      besked('Stjernerne er allerede brugt – spørg mor eller far, hvis fluebenet var forkert');   // sjov.js
      return;
    }
  }
  if (r.f) await Data.remove('flueben', r.f.id);
  else await Data.add('flueben', {
    opgave: r.o.id, barn, periode: r.periode, dato: r.dato || isoDato(new Date()), navn: r.o.navn,
    kr: regel.kr ? tal(r.o.kr) : 0,
    stjerner: regel.stjerner ? Math.round(tal(r.o.stjerner)) : 0,
    ...(r.o.godkend || glemt ? { venter: true } : {}),   // 👍: mor/far skal godkende, før det tæller
    ...(glemt ? { glemt: true } : {})
  });
  if (glemt) { besked('Sendt til mor og far 👍'); tegnAlt(); return; }
  const bonus = await opdaterStreakBonus(barn);   // fra sjov.js – giver/tager streak-bonus
  let fejret = false;
  if (!r.f && (!r.dato || r.dato === isoDato(new Date()))) {   // ingen fest, når en voksen retter en tidligere dag
    const liste = skalKlares(dagensOpgaver(await pligtData(barn)));
    if (r.o.frivillig) { fejr('Bonus! ⭐ Sejt gået'); fejret = true; }   // fra sjov.js
    else if (liste.length && liste.every(x => x.f)) { fejr('Alle pligter er klaret! 🎉'); fejret = true; }
  }
  tegnAlt();
  if (bonus) setTimeout(() => flammeStjerne(bonus), fejret ? 1700 : 300);
}

function opgaveLi(barn, r, regel) {
  if (r.sprunget) {
    const li = el('li', 'punkt sprunget');
    li.append(el('span', 'sprunget-tekst', r.o.navn + ' – ikke i dag'),
      knap('Fortryd', 'lille-knap', async () => { await Data.remove('flueben', r.sprunget.id); tegnAlt(); }));
    return li;
  }
  const li = el('li', 'punkt' + (r.f ? ' faerdig' : ''));
  const b = el('button', 'punkt-knap');
  b.type = 'button';
  b.setAttribute('aria-pressed', !!r.f);
  const tjek = el('span', 'tjek');
  tjek.innerHTML = IKON_TJEK;
  const tb = el('span', 'tekst-boks');
  tb.append(el('span', 'tekst', r.o.navn));
  const tags = el('span', 'tags');
  if (regel.kr && tal(r.o.kr)) tags.append(el('span', 'kr-tag', '+' + kr(tal(r.o.kr))));
  if (regel.stjerner && tal(r.o.stjerner)) tags.append(el('span', 'stjerne-tag', '★ ' + Math.round(tal(r.o.stjerner))));
  if (r.o.frivillig) tags.append(el('span', 'bonus-tag', 'Bonus'));
  if (r.f?.venter) tags.append(el('span', 'venter-tag', '⏳ venter på 👍'));
  else if (r.o.godkend && !r.f) tags.append(el('span', null, '👍 mor/far godkender'));
  if (r.o.gentag === 'uge') tags.append(el('span', null, 'Én gang om ugen'));
  if (r.o.gentag === 'engang') tags.append(el('span', null, 'Én gang'));
  if (r.o.gentag === 'interval') tags.append(el('span', null, intervalTekst(r.o)));
  if (r.overTid > 0) tags.append(el('span', 'over-tid', r.overTid === 1 ? '1 dag over tid' : r.overTid + ' dage over tid'));
  if (tags.children.length) tb.append(tags);
  b.append(tjek, ikonBillede(r.o, 'lille-ikon opg-ikon'), tb);
  b.addEventListener('click', () => skiftFlueben(barn, r, regel));
  li.append(b);
  if (r.o.frivillig && !r.f && (!r.dato || r.dato === isoDato(new Date()))) li.append(knap('Ikke i dag', 'lille-knap spring-knap', () => springOver(barn, r)));
  return li;
}

// Kort med dagens pligter – bruges på drengenes tavle og som "Mine pligter" på de voksnes I dag
// Linjen om streak-bonus på pligt-kortet (lokker, forklarer eller fejrer)
function bonusLinje(bs) {
  if (!bs.n) return null;
  if (bs.givet) return el('p', 'bonus-linje givet', (bs.givet.milepael ? '🏅 ' + bs.givet.milepael + ' dage i træk! ' : '🔥 Dage i træk-bonus i dag: ') + '+★ ' + bs.givet.stjerner);
  if (bs.joker) return el('p', 'bonus-linje joker', '🃏 Du glemte en dag – klar alt i dag, så redder jokeren dine dage i træk (+★ ' + (bs.n + bs.milepael) + ')');
  if (bs.mulig) return el('p', 'bonus-linje', bs.milepael
    ? '🏅 Klar alt i dag = ' + bs.naeste + ' dage i træk og +★ ' + (bs.n + bs.milepael) + '!'
    : '🔥 Klar alt i dag = ' + bs.naeste + ' dage i træk og +★ ' + bs.n);
  if (bs.starter) return el('p', 'bonus-linje start', bs.klaretIdag ? '🔥 Godt! Klar alt i morgen også = 2 dage i træk og +★ ' + bs.n : '🔥 Gør alt i dag og i morgen – så får du +★ ' + bs.n + ' ekstra hver dag i træk');
  return null;
}

// Familien (voksne): én linje pr. barn – "Villads 3/5 pligter · ★ 12 · 🏆 2/5". Tryk = Børn-fanen med det barn.
async function boernLinjerKort() {
  if (Data.bruger()?.rolle !== 'voksen') return null;
  const ul = el('ul', 'liste i-kort boern-linjer');
  for (const barn of BOERN) {
    const d = await pligtData(barn);
    if (!d.opgaver.length) continue;
    const dagens = dagensOpgaver(d).filter(r => !r.o.frivillig && !r.sprunget);
    const klaret = dagens.filter(r => r.f && !r.f.sprunget).length;
    const s = saldo(d);
    const pause = typeof pausePligter === 'function' && pausePligter(barn, isoDato(new Date()));   // ⏸ pause.js
    const dele = [pause ? '⏸ pligter på pause' : dagens.length ? klaret + '/' + dagens.length + ' pligter' : 'fri i dag'];
    if (d.regel.stjerner) dele.push('★ ' + s.stjerner);
    if (d.regel.kr) dele.push(kr(s.tilGode));
    if (typeof ugeStatus === 'function') { const u = ugeStatus(d, isoDato(mandagDenneUge())); if (u.maal) dele.push('🏆 ' + u.n + '/' + u.maal); }
    const li = el('li', 'boern-linje' + (dagens.length && klaret === dagens.length ? ' klaret' : ''));
    li.dataset.barn = barn;
    li.append(knap('', 'boern-linje-knap', () => { pligtBarn = barn; lokal.set('pligt-barn', barn); visFane('pligter'); tegnPligter(); window.scrollTo(0, 0); }));
    const b = li.firstChild;
    b.append(el('span', 'prik c-' + barn.toLowerCase()), el('strong', null, barn), el('span', 'boern-linje-tal', dele.join(' · ')), el('span', 'kort-pil', '›'));
    ul.append(li);
  }
  if (!ul.children.length) return null;
  const k = el('div', 'kort');
  k.append(el('div', 'kort-label', 'Børnene i dag'), ul);
  return k;
}

async function pligtKort(barn, titel = 'Pligter i dag') {
  const d = await pligtData(barn);
  if (!d.opgaver.length) return null;
  const liste = dagensOpgaver(d);
  const s = saldo(d);
  const status = [];
  if (d.regel.stjerner) status.push('★ ' + s.stjerner);
  if (d.regel.kr) status.push(kr(s.tilGode));
  const k = el('div', 'kort');
  const top = el('div', 'kort-top');
  const st = streak(d);
  if (st >= 2) status.unshift('🔥 ' + st);
  top.append(el('span', 'kort-label', titel),
    knap((status.length ? status.join(' · ') + ' ' : 'Alle ') + '›', 'kort-pil link-knap', () => {
      pligtBarn = barn; visFane('pligter'); tegnPligter(); window.scrollTo(0, 0);
    }));
  const ul = el('ul', 'liste i-kort');
  liste.forEach(r => ul.append(opgaveLi(barn, r, d.regel)));
  if (!liste.length) ul.append(el('li', 'tom', 'Ingen pligter i dag'));
  // To do'er, som de voksne har sat barnet på (kun at se – de voksne krydser af)
  for (const t of (await Data.list('todo')).filter(x => x.hvem === barn && !x.klaret)) {
    ul.append(el('li', 'todo-linje', '📝 ' + t.tekst + (t.frist ? ' · ' + (t.frist <= isoDato(new Date()) ? 'i dag' : kortDag(t.frist)) : '')));
  }
  k.append(top, ul);
  // Barnet glemte at krydse af i går? Genvej til i går på Pligter (mor/far siger 👍)
  const igaar = plusDage(isoDato(new Date()), -1);
  if (loggetIndBarn() === barn && dagensOpgaver(d, igaar).some(r => !r.f && !r.o.frivillig && oprettetIso(r.o) <= igaar))
    k.append(knap('🤔 Glemte du at krydse noget af i går? ›', 'link-knap glemt-link', () => {
      if (typeof lukZoom === 'function') lukZoom();
      pligtBarn = barn; visFane('pligter'); pligtDag = igaar; tegnPligter(); window.scrollTo(0, 0);
    }));
  // Streak-bonus: lok med den, og vis den, når den er givet
  const bs = d.regel.stjerner ? bonusStatus(d) : { n: 0 };   // fra sjov.js
  const bl = bonusLinje(bs);
  if (bl) k.append(bl);
  const ul2 = ugepokalLinje(barn, d);
  if (ul2) k.append(ul2);
  const jk = jobsKort(barn, d);
  if (jk && (loggetIndBarn() === barn || (d.jobs || []).some(j => j.status === 'taget'))) k.append(jk);
  k.append(...ekstraDele(barn, d));   // ⭐ ekstra stjerner
  if (liste.some(r => r.o.piktogram)) k.append(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
  // Opsummering til tavle-visningen
  const pligt = skalKlares(liste.filter(r => !r.sprunget));
  const klaret = pligt.filter(r => r.f).length;
  const naesteP = pligt.find(r => !r.f);
  const bonus = liste.filter(r => r.o.frivillig && !r.f && !r.sprunget).length;
  k.tavle = { noegle: 'pligter', ikon: '✅', titel: titel === 'Pligter i dag' ? 'Pligter' : titel,
    andel: pligt.length ? klaret / pligt.length : 0, klar: pligt.length > 0 && !naesteP,
    stor: !pligt.length ? (bonus ? bonus + ' bonus' : 'Ingen i dag') : !naesteP ? 'Alle klaret' : klaret + ' af ' + pligt.length,
    lille: naesteP ? (bs.joker ? '🃏 Jokeren kan redde dine dage i træk' : bs.mulig ? (bs.milepael ? '🏅 +★ ' + (bs.n + bs.milepael) + ' når alt er klaret' : '🔥 +★ ' + bs.n + ' når alt er klaret') : 'Næste: ' + naesteP.o.navn)
      : bs.givet ? '🔥 +★ ' + bs.givet.stjerner + ' ekstra for dage i træk' : st >= 2 ? streakTekst(st) : bonus ? 'Bonus venter ⭐' : 'Sejt! 🎉' };
  return k;
}

// "Mine pligter i dag" til en voksens I dag-side (kun synlig for den voksne selv)
async function minePligterKort() {
  const mig = Data.bruger();
  if (!mig || mig.rolle !== 'voksen') return null;
  return pligtKort(mig.navn, 'Mine pligter i dag');
}

// Rette-tilstand: kun det der kan rettes – farvet bånd øverst og "Færdig" der altid kan ses
function retPligterDele(barn, d, erMig) {
  const dele = [];
  const GENTAG = { dag: 'Hver dag', uge: 'Én gang om ugen', engang: 'Kun én gang', interval: '' };
  dele.push(el('h3', 'lille-titel', erMig ? 'Mine pligter' : 'Pligter for ' + barn));
  const ol = el('ul', 'ret-liste');
  for (const o of d.opgaver) {
    const li = el('li');
    const b = knap('', 'ret-raekke', () => redigerOpgave(o, d.regel));
    const under = [GENTAG[o.gentag] || 'Hver dag'];
    if (o.gentag === 'dag' && o.dage && o.dage.length && o.dage.length < 7) under[0] = o.dage.map(i => DAGE[i]).join(', ');
    if (o.gentag === 'dag' && DAGTYPER[o.dagtype]) under[0] = DAGTYPER[o.dagtype].ikon + ' ' + DAGTYPER[o.dagtype].navn;
    if (o.gentag === 'interval') under[0] = intervalTekst(o) + ' · næste ' + kortDato(naesteForfald(o, d));
    if (o.frivillig) under.push('Bonus');
    if (d.regel.kr && tal(o.kr)) under.push(kr(tal(o.kr)));
    if (d.regel.stjerner && tal(o.stjerner)) under.push('★ ' + tal(o.stjerner));
    const pt = typeof punktPauseTekst === 'function' ? punktPauseTekst(o) : '';
    if (pt) under.unshift(pt);
    const oNavn = el('span', 'ret-navn');
    oNavn.append(ikonBillede(o), o.navn);
    b.append(oNavn, el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
    li.append(b);
    if (typeof pauseKnap === 'function' && erVoksen()) { li.classList.add('med-pause'); if (pt) li.classList.add('pauset'); li.append(pauseKnap('opgaver', o)); }   // ⏸ pause.js
    ol.append(li);
  }
  if (!d.opgaver.length) ol.append(el('li', 'tom', 'Ingen pligter'));
  dele.push(ol, knap('Ny pligt', 'lille-knap', () => redigerOpgave({ barn }, d.regel)));

  if (d.regel.stjerner) {
    dele.push(el('h3', 'lille-titel', 'Belønninger'));
    const bl2 = el('ul', 'ret-liste');
    for (const bel of d.beloenninger) {
      const li = el('li');
      const b = knap('', 'ret-raekke', () => redigerBeloenning(bel));
      const under = ['★ ' + bel.stjerner, bel.barn === 'Begge' ? 'begge drenge' : bel.barn];
      if (bel.engang) under.push(BOERN.includes(barn) && brugtOp(bel, d) ? 'kun én gang – ' + barn + ' har fået den ✓' : 'kun én gang');
      const bNavn = el('span', 'ret-navn');
      bNavn.append(ikonBillede({ ...bel, barn }), bel.navn);
      b.append(bNavn, el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
      li.append(b);
      bl2.append(li);
    }
    if (!d.beloenninger.length) bl2.append(el('li', 'tom', 'Ingen belønninger'));
    dele.push(bl2, knap('Ny belønning', 'lille-knap', () => redigerBeloenning({ barn: BOERN.includes(barn) ? 'Begge' : barn })));
  }

  // Hvad personen kan tjene
  dele.push(el('h3', 'lille-titel', (erMig ? 'Jeg' : barn) + ' kan tjene'));
  const regelSeg = el('div', 'seg wrap');
  for (const [felt, navn] of [['kr', 'Lommepenge'], ['stjerner', 'Stjerner']]) {
    const k = knap(navn, null, async () => { await saetRegel(barn, felt, !d.regel[felt]); tegnAlt(); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', d.regel[felt]);
    regelSeg.append(k);
  }
  dele.push(regelSeg, el('p', 'hint', 'Slå begge fra for pligter uden belønning.'));
  if (d.regel.stjerner && BOERN.includes(barn)) {   // dage i træk bruges kun af børnene
    // Streak-bonus: ekstra stjerner, når alle hver-dag-pligter er klaret to (eller flere) dage i træk
    const avanceret = el('details', 'avanceret');
    avanceret.append(el('summary', null, 'Avanceret: 🔥 bonus for dage i træk og joker'));
    const adele = [];
    adele.push(el('h3', 'lille-titel', '🔥 Bonus for dage i træk'),
      valgSeg([0, 1, 2, 3], Math.round(tal(d.regel.streakBonus ?? 1)), async v => { await saetRegel(barn, 'streakBonus', v); tegnAlt(); },
        v => (v === 0 ? 'Fra' : '+★ ' + v + ' pr. dag')),
      el('p', 'hint', 'Gives automatisk (med flamme-animation), når alle hver-dag-pligter er klaret – fra dag 2 i træk. Milepæle giver ekstra: 7 dage +3, 14 +5, 21 +5, 30 +10, 50 +10, 75 +15, 100 +20. Sygedage bryder ikke rækken.'));
    const jk = knap('🃏 Rednings-joker (1 pr. måned)', null, async () => { await saetRegel(barn, 'joker', !jokerTil(d)); tegnAlt(); });
    jk.setAttribute('role', 'checkbox');
    jk.setAttribute('aria-checked', jokerTil(d));
    const jseg = el('div', 'seg wrap');
    jseg.append(jk);
    adele.push(jseg, el('p', 'hint', 'Glemmer barnet en dag, redder jokeren automatisk rækken, når næste dag klares – én gang pr. måned.'));
    avanceret.append(...adele);
    dele.push(avanceret);
  }
  return dele;
}

let pligtDag = null;   // voksne: vist dag på Pligter (null = i dag)
async function tegnPligter() {
  const boks = document.getElementById('pligter-indhold');
  const personer = pligtPersoner();
  if (!personer.includes(pligtBarn)) pligtBarn = personer[0];
  const barn = pligtBarn;
  const erMig = barn === Data.bruger()?.navn;
  const d = await pligtData(barn);
  const s = saldo(d);
  const dele = [];
  // ⏸ Barnet selv: pligterne holder pause (pause.js)
  const pPause = erBarn() && typeof pausePligter === 'function' ? pausePligter(barn, isoDato(new Date())) : null;
  if (pPause) { boks.replaceChildren(pausePligtKort(pPause)); return; }

  const sektion = document.getElementById('pligter');
  sektion.classList.toggle('ret-tilstand', !!(pligtRet && erVoksen()));
  if (pligtRet && erVoksen()) {
    const baand = el('div', 'ret-baand');
    baand.append(el('span', null, '✏️ Du retter ' + (erMig ? 'dine pligter' : barn + (/[sxz]$/i.test(barn) ? "'" : 's') + ' pligter og belønninger')),
      knap('Færdig ✓', 'knap ret-faerdig', () => { pligtRet = false; tegnPligter(); window.scrollTo(0, 0); }));
    dele.push(baand);
    if (personer.length > 1) dele.push(valgSeg(personer, barn, b => { pligtBarn = b; lokal.set('pligt-barn', b); tegnPligter(); }, v => v));
    dele.push(...retPligterDele(barn, d, erMig));
    boks.replaceChildren(...dele);
    return;
  }
  if (erVoksen()) {
    // Børn-fanen samler det hele: først det, børnene venter på svar på
    const oensker = await oenskerIndhold();
    if (oensker.length) { const ok = el('div', 'kort oensker-kort venter'); ok.append(...oensker); dele.push(ok); }
  }

  if (personer.length > 1) {
    dele.push(valgSeg(personer, barn, b => { pligtBarn = b; lokal.set('pligt-barn', b); tegnPligter(); },
      v => v));
  }

  const statusDele = [], knapDele = [];
  // Status – kun for det personen er sat op til
  if (d.regel.stjerner || d.regel.kr) {
    const stat = el('div', 'stat-raekke' + (d.regel.stjerner && d.regel.kr ? '' : ' en'));
    if (d.regel.stjerner) {
      const st = el('div', 'stat stjerne-stat');
      st.append(el('span', 'stat-tal', '★ ' + s.stjerner), el('span', 'stat-navn', 'stjerner at bruge'));
      stat.append(st);
    }
    if (d.regel.kr) {
      const st = el('div', 'stat');
      st.append(el('span', 'stat-tal', kr(s.tilGode)), el('span', 'stat-navn', 'til gode · ' + kr(s.ugeKr) + ' i denne uge'));
      stat.append(st);
    }
    statusDele.push(stat);
  }
  // Dage i træk, bonus og justering kun for børnene (Timmos ønske 20/10 – voksne bruger det ikke)
  const erBarnetsSide = BOERN.includes(barn);
  const st = erBarnetsSide ? streak(d) : 0;
  if (st >= 1) statusDele.push(el('p', 'streak-linje', streakTekst(st) + (st >= 2 ? ' – sejt!' : '')));
  if (erBarnetsSide && d.regel.stjerner && bonusStjerner(d)) {   // fra sjov.js
    const bs = bonusStatus(d), nm = naesteMilepael(st);
    const info = [nm ? '🏅 Næste milepæl: ' + nm + ' dage (+★ ' + milepaelStjerner(nm) + ' ekstra)' : '',
      jokerTil(d) ? (bs.jokerBrugt ? '🃏 Jokeren er brugt i denne måned' : '🃏 1 joker i denne måned') : ''].filter(Boolean);
    const bl = bonusLinje(bs);
    if (bl) statusDele.push(bl);
    if (info.length) statusDele.push(el('p', 'hint streak-info', info.join(' · ')));
  }

  statusDele.push(...ekstraDele(barn, d));   // ⭐ ekstra stjerner
  const jkP = BOERN.includes(barn) ? jobsKort(barn, d) : null;
  if (jkP) statusDele.push(jkP);
  if (erVoksen() && erBarnetsSide) {
    knapDele.push(knap('Justér stjerner, kr eller dage i træk', 'lille-knap juster-knap', () => justerSaldo(barn, d, s, st)));
  }

  if (erVoksen() && d.regel.kr && s.tilGode > 0) {
    knapDele.push(bekraeftKnap('Udbetal ' + kr(s.tilGode), 'udbetale', 'ryd udbetal', async () => {
      await Data.add('udbetalinger', { barn, kr: s.tilGode, dato: isoDato(new Date()) });
      tegnAlt();
    }));
  }

  // I dag – voksne kan bladre tilbage (højst 14 dage) og rette en dag, barnet glemte at krydse af
  const dagIso = isoDato(new Date());
  const maxTilbage = erVoksen() ? 14 : erBarn() && erMig ? 7 : 0;   // børn: glemte dage, højst en uge tilbage
  if (!maxTilbage || !pligtDag || pligtDag >= dagIso || pligtDag < plusDage(dagIso, -maxTilbage)) pligtDag = null;
  const visDag = pligtDag || dagIso;
  if (maxTilbage) {
    const bladr = el('div', 'pligt-dag-nav');
    const tilbage = knap('‹', 'lille-knap', () => { pligtDag = plusDage(visDag, -1); tegnPligter(); });
    tilbage.disabled = visDag <= plusDage(dagIso, -maxTilbage);
    tilbage.setAttribute('aria-label', 'Dagen før');
    const frem = knap('›', 'lille-knap', () => { const n = plusDage(visDag, 1); pligtDag = n >= dagIso ? null : n; tegnPligter(); });
    frem.disabled = visDag >= dagIso;
    frem.setAttribute('aria-label', 'Dagen efter');
    const navn = visDag === dagIso ? 'I dag' : visDag === plusDage(dagIso, -1) ? 'I går' : DAGE_LANG[(tilDag(visDag).getDay() + 6) % 7] + ' ' + kortDag(visDag);
    bladr.append(tilbage, el('h3', 'lille-titel', navn), frem);
    if (pligtDag) bladr.append(knap('I dag', 'lille-knap', () => { pligtDag = null; tegnPligter(); }));
    dele.push(bladr);
    if (pligtDag && erVoksen()) dele.push(el('p', 'hint', '✏️ Du retter ' + navn.toLowerCase() + '. Stjerner, kr og dage i træk tæller med (bonus for dage i træk gives kun samme dag).'));
    else if (pligtDag) dele.push(el('p', 'hint glemt-hint', '🤔 Glemte du at krydse af? Tryk på det, du nåede ' + navn.toLowerCase() + ' – så siger mor eller far 👍.'));
    else if (!erVoksen() && dagensOpgaver(d, plusDage(dagIso, -1)).some(r => !r.f && !r.o.frivillig && oprettetIso(r.o) <= plusDage(dagIso, -1))) dele.push(el('p', 'hint', 'Glemte du at krydse af i går? Tryk ‹'));
  } else dele.push(el('h3', 'lille-titel', 'I dag'));
  const ul = el('ul', 'liste' + (pligtDag ? ' tidligere-dag' : ''));
  const idag = dagensOpgaver(d, visDag).filter(r => erVoksen() || oprettetIso(r.o) <= visDag);   // barnet: kun pligter, der fandtes den dag
  idag.forEach(r => ul.append(opgaveLi(barn, r, d.regel)));
  if (!idag.length) ul.append(el('li', 'tom', d.opgaver.length ? 'Ingen pligter i dag' : 'Ingen pligter endnu'));
  dele.push(ul);
  if (erMig && !BOERN.includes(barn)) dele.push(el('p', 'hint', 'Dine egne pligter vises kun for dig – også på din I dag-side.'));

  // Kommende pligter med fast mellemrum
  const idagIso = isoDato(new Date());
  const kommende = d.opgaver.filter(o => o.gentag === 'interval' && !idag.some(r => r.o.id === o.id))
    .map(o => ({ o, naeste: naesteForfald(o, d) })).sort((a, b) => a.naeste.localeCompare(b.naeste));
  if (kommende.length) {
    dele.push(el('h3', 'lille-titel', 'Kommende'));
    const kl = el('ul', 'historik');
    for (const k of kommende) {
      const n = dageMellem(idagIso, k.naeste);
      const li = el('li');
      li.append(el('span', 'h-dato', kortDato(k.naeste)), el('span', 'h-tekst', k.o.navn),
        el('span', 'h-vaerdi', n === 1 ? 'I morgen' : 'Om ' + n + ' dage'));
      kl.append(li);
    }
    dele.push(kl);
  }

  // Stjerner/kr, dage i træk, ekstra stjerner og jobs – efter pligterne
  if (statusDele.length) dele.push(el('h3', 'lille-titel', erBarnetsSide ? 'Stjerner og lommepenge' : 'Stjerner og kr'), ...statusDele);

  // Ønsker der venter på en voksen
  const ventende = d.indl.filter(x => x.status === 'afventer');
  if (ventende.length) {
    dele.push(el('h3', 'lille-titel', 'Venter på godkendelse'));
    const vl = el('ul', 'beloen-liste');
    for (const x of ventende) vl.append(oenskeLi(x, !erVoksen()));
    dele.push(vl);
  }

  // Belønninger (kun med stjerner)
  if (d.regel.stjerner) {
    dele.push(el('h3', 'lille-titel', 'Belønninger'));
    const bl = el('ul', 'beloen-liste');
    const aktive = d.beloenninger.filter(b => !brugtOp(b, d));
    for (const b of [...aktive].sort((a, c) => a.stjerner - c.stjerner)) bl.append(beloenLi(barn, b, d, s));
    if (!aktive.length) bl.append(el('li', 'tom', 'Ingen belønninger endnu'));
    dele.push(bl);
  }

  // Seneste (kun når der er noget at tjene)
  if (d.regel.stjerner || d.regel.kr) {
    const haendelser = [
      ...d.flueben.filter(f => tal(f.kr) || f.stjerner).map(f => ({ dato: f.dato, tekst: f.navn, vaerdi: [tal(f.kr) ? '+' + kr(tal(f.kr)) : '', f.stjerner ? '+★ ' + f.stjerner : ''].filter(Boolean).join(' ') })),
      ...d.indl.map(x => ({ dato: x.dato,
        tekst: (x.status === 'afventer' ? 'Ønsket: ' : x.status === 'afvist' ? 'Ikke godkendt: ' : 'Indløst: ') + x.navn,
        vaerdi: x.status === 'afvist' ? '' : (x.status === 'afventer' ? '(★ ' + x.stjerner + ')' : '−★ ' + x.stjerner) })),
      ...d.udb.map(x => ({ dato: x.dato, tekst: 'Lommepenge udbetalt', vaerdi: '−' + kr(tal(x.kr)) })),
      ...(d.bonus || []).map(x => ({ dato: x.dato, tekst: (x.milepael ? '🏅 Milepæl' : '🔥 Streak-bonus') + (x.dage ? ' (' + x.dage + ' dage i træk)' : ''), vaerdi: '+★ ' + x.stjerner })),
      ...(d.jokere || []).map(x => ({ dato: x.dato, tekst: '🃏 Jokeren reddede dagen', vaerdi: '' })),
      ...(d.ekstra || []).map(x => ({ dato: x.besvaret || x.dato, tekst: (x.status === 'afvist' ? 'Ikke godkendt: ' : x.status === 'afventer' ? 'Venter: ' : '⭐ ') + x.tekst + (x.status === 'godkendt' && x.fra ? ' (fra ' + x.fra + ')' : ''),
        vaerdi: x.status === 'godkendt' ? '+★ ' + x.stjerner : x.status === 'afventer' ? '(★ ' + x.stjerner + ')' : '' })),
      ...d.just.map(x => ({ dato: x.dato, tekst: 'Justering' + (x.tekst ? ': ' + x.tekst : ''),
        vaerdi: [tal(x.kr) ? (tal(x.kr) > 0 ? '+' : '') + kr(tal(x.kr)) : '', tal(x.stjerner) ? (tal(x.stjerner) > 0 ? '+★ ' : '−★ ') + Math.abs(tal(x.stjerner)) : ''].filter(Boolean).join(' ') }))
    ].sort((a, b) => (b.dato || '').localeCompare(a.dato || '')).slice(0, 8);
    if (haendelser.length) {
      dele.push(el('h3', 'lille-titel', 'Seneste'));
      const hl = el('ul', 'historik');
      for (const h of haendelser) {
        const li = el('li');
        li.append(el('span', 'h-dato', kortDato(h.dato)), el('span', 'h-tekst', h.tekst), el('span', 'h-vaerdi', h.vaerdi));
        hl.append(li);
      }
      dele.push(hl);
    }
  }

  // Voksne: knapperne samlet nederst – ret pligter, justér, udbetal og ugens overblik
  if (erVoksen()) {
    dele.push(knap('✏️ ' + (erMig ? 'Ret mine pligter' : 'Ret pligter og belønninger'), 'ryd ret-start',
      () => { pligtRet = true; tegnPligter(); window.scrollTo(0, 0); }));
    const bund = el('div', 'pligt-bund-knapper');
    bund.append(...knapDele, knap('📊 Ugens overblik', 'lille-knap uge-knap', () => ugeOverblik(0)));
    dele.push(bund);
  }

  if (d.opgaver.some(x => x.piktogram)) dele.push(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
  boks.replaceChildren(...dele);
}

// Ugens overblik for voksne: hvad hvert barn har klaret og tjent i en uge + udbetaling
async function ugeOverblik(uge = 0) {
  const man = mandagDenneUge(); man.setDate(man.getDate() + uge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  const manIso = isoDato(man), sonIso = isoDato(son);
  const iUgen = x => x.dato >= manIso && x.dato <= sonIso;
  const valg = valgSeg([0, -1], uge, v => ugeOverblik(v), v => (v === 0 ? 'Denne uge' : 'Sidste uge'));
  const kortene = el('div', 'uge-oversigt');
  for (const barn of BOERN) {
    const d = await pligtData(barn);
    const s = saldo(d);
    const fb = d.flueben.filter(f => iUgen(f) && !f.sprunget);
    const erBonus = f => !!d.opgaver.find(o => o.id === f.opgave)?.frivillig;
    const just = d.just.filter(iUgen);
    const stj = sum(fb, 'stjerner');
    const kroner = sum(fb, 'kr');
    const justStj = sum(just, 'stjerner'), justKr = sum(just, 'kr');
    const indl = d.indl.filter(x => iUgen(x) && (x.status || 'godkendt') === 'godkendt');
    const k = el('div', 'kort uge-kort ' + PK[barn]);
    k.append(el('span', 'uge-navn', barn));
    const linjer = el('ul', 'uge-linjer');
    const linje = (tekst, vaerdi) => { const li = el('li'); li.append(el('span', null, tekst), el('b', null, vaerdi)); linjer.append(li); };
    linje('Pligter klaret', String(fb.filter(f => !erBonus(f)).length));
    if (fb.some(erBonus)) linje('Bonus klaret', String(fb.filter(erBonus).length));
    if (d.regel.stjerner) linje('Stjerner tjent på pligter', '★ ' + stj);
    const ugeEkstra = (d.ekstra || []).filter(x => x.status === 'godkendt' && (x.besvaret || x.dato) >= manIso && (x.besvaret || x.dato) <= sonIso);
    if (ugeEkstra.length) linje('⭐ Ekstra-stjerner', '★ ' + sum(ugeEkstra, 'stjerner'));
    const ugeBonus = (d.bonus || []).filter(iUgen);
    if (ugeBonus.length) linje('🔥 Streak-bonus', '★ ' + sum(ugeBonus, 'stjerner') + ' (' + ugeBonus.length + (ugeBonus.length === 1 ? ' dag)' : ' dage)'));
    if (d.regel.kr) linje('Lommepenge tjent på pligter', kr(kroner));
    if (justStj || justKr) linje('Justeret af en voksen', [justKr ? (justKr > 0 ? '+' : '') + kr(justKr) : '', justStj ? (justStj > 0 ? '+★ ' : '−★ ') + Math.abs(justStj) : ''].filter(Boolean).join(' '));
    if (indl.length) linje('Belønninger indløst', indl.map(x => x.navn).join(', '));
    const st = streak(d);
    if (uge === 0 && st >= 1) linje('Dage i træk', '🔥 ' + st);
    k.append(linjer);
    if (d.regel.kr) {
      const bund = el('div', 'uge-bund');
      bund.append(el('span', null, 'Til gode i alt: ' + kr(s.tilGode)));
      if (s.tilGode > 0) bund.append(bekraeftKnap('Udbetal', 'udbetale', 'lille-knap', async () => {
        await Data.add('udbetalinger', { barn, kr: s.tilGode, dato: isoDato(new Date()) });
        tegnAlt(); ugeOverblik(uge);
      }));
      k.append(bund);
    }
    kortene.append(k);
  }
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', () => lukArk()));
  aabnArk('Ugens overblik · uge ' + ugenummer(man) + ' · ' + ugeSpan(man),
    valg, kortene, el('p', 'hint', '"Til gode" er alt, der ikke er udbetalt endnu – også fra tidligere uger.'), knapper);
}

// Voksne kan rette stjerner, kr og streak (fx glemt flueben eller en ekstra belønning)
// Data: 'justeringer' {barn, dato, stjerner?, kr?, tekst?} eller {barn, dato, type: 'streak', dage}
//   type 'streak' = "rækken var <dage> dage til og med <dato>" – streak tæller videre derfra
function justerSaldo(barn, d, s, st) {
  const stj = input('text', 'just-stj', '', 'Fx 5 eller -3');
  stj.inputMode = 'numeric';
  const krInp = input('text', 'just-kr', '', 'Fx 20 eller -10');
  krInp.inputMode = 'decimal';
  const tekst = input('text', 'just-tekst', '', 'Fx glemt flueben, ekstra hjælp');
  const streakInp = input('text', 'just-streak', String(st), '');
  streakInp.inputMode = 'numeric';
  const raekke = el('div', 'to-felter');
  if (d.regel.stjerner) raekke.append(felt('Stjerner + / −', stj));
  if (d.regel.kr) raekke.append(felt('Kroner + / −', krInp));
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const gem = knap('Gem', 'knap', async () => {
    const iso = isoDato(new Date());
    const ds = Math.round(tal(stj.value)), dk = tal(krInp.value);
    if (ds || dk) await Data.add('justeringer', { barn, dato: iso, stjerner: ds, kr: dk, tekst: tekst.value.trim(), fra: Data.bruger()?.navn });
    const nyStreak = Math.max(0, Math.round(tal(streakInp.value)));
    if (streakInp.value.trim() !== '' && nyStreak !== st) {
      // Ankeret lægges i går; tæller i dag allerede med, trækkes den fra, så tallet passer nu
      const idagMed = streak({ ...d, streakAnker: { dato: plusDage(iso, -1), dage: 0 } }) > 0;
      await Data.add('justeringer', { barn, dato: plusDage(iso, -1), type: 'streak', dage: Math.max(0, nyStreak - (idagMed ? 1 : 0)) });
    }
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(gem);
  aabnArk('Justér for ' + barn,
    el('p', 'hint', 'Nu: ' + [d.regel.stjerner ? '★ ' + s.stjerner : '', d.regel.kr ? kr(s.tilGode) + ' til gode' : '', streakTekst(st)].filter(Boolean).join(' · ')),
    raekke.children.length ? raekke : '', raekke.children.length ? felt('Hvorfor (valgfri)', tekst) : '',
    felt('Dage i træk 🔥', streakInp),
    el('p', 'hint', 'Minus trækker fra. Justeringer står i "Seneste", så barnet kan se dem.'), fejl, knapper);
}

// Én belønning med fremdrift og knap: voksne "Indløs", børn "Ønsk" (eller "Venter på en voksen")
function beloenLi(barn, b, d, s) {
  const erMaal = d.maal === b.navn;
  const li = el('li', 'beloen' + (erMaal ? ' mit-maal' : ''));
  const nok = s.stjerner >= b.stjerner;
  const info = el('div', 'beloen-info');
  // 📌 = mit mål (ét ad gangen) – barnet vælger selv; tryk igen for at fjerne
  const pin = knap(erMaal ? '📌 Mit mål' : '📌', 'lille-knap maal-knap', async () => {
    await saetValg(barn, 'maal', erMaal ? null : b.navn);   // dage.js
    if (!erMaal && loggetIndBarn() === barn) fejr('Nyt mål: ' + b.navn + ' 🎯');
    tegnAlt();
  });
  pin.setAttribute('aria-pressed', erMaal);
  pin.setAttribute('aria-label', erMaal ? 'Fjern som mit mål' : 'Gør ' + b.navn + ' til mit mål');
  const bNavn = el('span', 'beloen-navn');
  bNavn.append(ikonBillede({ ...b, barn }), b.navn);
  info.append(pin, bNavn,
    el('span', 'beloen-pris', '★ ' + b.stjerner + (nok ? ' · du har nok!' : ' · mangler ' + (b.stjerner - s.stjerner)) + (b.engang ? ' · kun én gang' : '')),
    fremskridt(b.stjerner ? s.stjerner / b.stjerner : 1));
  const venter = d.indl.find(x => x.status === 'afventer' && x.navn === b.navn);
  let indloes;
  if (venter) indloes = el('span', 'venter-tag', 'Venter på en voksen');
  else if (erVoksen()) {
    indloes = bekraeftKnap('Indløs', 'indløse', 'lille-knap', async () => {
      await Data.add('indloesninger', { barn, navn: b.navn, stjerner: b.stjerner, dato: isoDato(new Date()), status: 'godkendt' });
      tegnAlt();
    });
    indloes.disabled = !nok;
  } else {
    indloes = bekraeftKnap('Ønsk', 'ønske', 'lille-knap', async () => {
      await Data.add('indloesninger', { barn, navn: b.navn, stjerner: b.stjerner, dato: isoDato(new Date()), status: 'afventer' });
      fejr('Ønsket er sendt til mor og far 🎁');   // fra sjov.js
      tegnAlt();
    });
    indloes.disabled = !nok;
  }
  li.append(info, indloes);
  return li;
}

// 🏆 Ugepokal-linje på pligt-kortet: "3 af 5 dage" – og fest, når den er vundet (én gang pr. uge pr. enhed)
function ugepokalLinje(barn, d) {
  if (typeof ugeStatus !== 'function' || !BOERN.includes(barn)) return null;   // ugepokalen er kun for børnene (ikke "Mine pligter i dag")
  const man = isoDato(mandagDenneUge());
  const st = ugeStatus(d, man);   // sjov.js
  if (!st.maal) return null;
  const vundet = st.n >= st.maal;
  if (vundet && loggetIndBarn() === barn && !lokal.get('ugepokal-' + barn + '-' + man)) {
    lokal.set('ugepokal-' + barn + '-' + man, '1');
    setTimeout(() => fejr('🏆 Du har vundet ugens pokal!'), 2200);
  }
  return el('p', 'bonus-linje ugepokal' + (vundet ? ' givet' : ''), vundet ? '🏆 Ugens pokal er vundet! (' + st.n + ' dage)'
    : '🏆 Ugepokal: ' + st.n + ' af ' + st.maal + ' dage med alle pligter');
}

// 🏆 Pokalhylde: det barnet har opnået – regnes ud fra det, der allerede er gemt (ingen ny data)
function pokalHylde(d) {
  const bonus = d.bonus || [];
  const medaljer = bonus.filter(b => b.milepael).sort((a, c) => (c.dato || '').localeCompare(a.dato || ''));
  const rekord = Math.max(typeof streak === 'function' ? streak(d) : 0, ...bonus.map(b => Math.round(tal(b.dage)) || 0), 0);   // sjov.js
  const faaet = d.indl.filter(x => (x.status || 'godkendt') === 'godkendt').sort((a, c) => (c.dato || '').localeCompare(a.dato || ''));
  const tjent = sum(d.flueben, 'stjerner') + sum(bonus, 'stjerner') + sum((d.ekstra || []).filter(x => x.status === 'godkendt'), 'stjerner')
    + (d.just || []).filter(x => !x.type && tal(x.stjerner) > 0).reduce((n, x) => n + tal(x.stjerner), 0);
  const pokaler = typeof ugepokaler === 'function' ? ugepokaler(d) : [];   // sjov.js
  if (!medaljer.length && rekord < 2 && !faaet.length && !tjent && !pokaler.length) return null;
  const boks = el('div', 'pokalhylde');
  boks.append(el('h3', 'lille-titel', '🏆 Pokalhylde'));
  const tal3 = el('div', 'pokal-tal');
  const stat = (ikon, vaerdi, tekst) => { const t = el('div', 'pokal-stat'); t.append(el('span', 'pokal-ikon', ikon), el('b', null, vaerdi), el('span', null, tekst)); tal3.append(t); };
  stat('⭐', String(Math.round(tjent)), 'stjerner tjent i alt');
  if (rekord >= 2) stat('🔥', String(rekord), 'dage i træk – rekord');
  stat('🏆', String(pokaler.length), pokaler.length === 1 ? 'ugepokal' : 'ugepokaler');
  stat('🏅', String(medaljer.length), medaljer.length === 1 ? 'medalje' : 'medaljer');
  boks.append(tal3);
  const ul = el('ul', 'pokal-liste');
  for (const p of pokaler.slice(0, 4)) ul.append(el('li', null, '🏆 Ugepokal uge ' + ugenummer(new Date(p.man + 'T12:00')) + ' · ' + p.n + ' dage'));
  for (const m of medaljer.slice(0, 6)) ul.append(el('li', null, '🏅 ' + m.milepael + ' dage i træk · ' + kortDato(m.dato)));
  for (const x of faaet.slice(0, 6)) ul.append(el('li', null, '🎁 ' + x.navn + ' · ' + kortDato(x.dato)));
  if (ul.children.length) boks.append(ul);
  return boks;
}

// Jubel når barnet når 25, 50, 75 og 100 % af sit mål (huskes pr. enhed, så det kun sker én gang)
function maalMilepael(barn, b, stjerner) {
  if (loggetIndBarn() !== barn || !b.stjerner) return;
  const noegle = 'maal-trin-' + barn + '-' + b.navn;
  const trin = Math.floor(Math.min(1, Math.max(0, stjerner / b.stjerner)) * 4);   // 0–4
  const foer = lokal.get(noegle);
  lokal.set(noegle, String(trin));
  if (foer === null || foer === undefined || trin <= Number(foer)) return;   // første gang eller ikke højere: ingen jubel
  const tekst = trin === 4 ? 'Du har nok til ' + b.navn + '! 🎉' : ['', 'En fjerdedel af vejen', 'Halvvejs', 'Tre fjerdedele'][trin] + ' til ' + b.navn + '! 💪';
  setTimeout(() => fejr(tekst), 1200);   // sjov.js
}

// Belønninger på børnetavlen: stjerner + de næste belønninger, så barnet ikke skal ind under Mere
async function beloenningKort(barn) {
  const d = await pligtData(barn);
  if (!d.regel.stjerner || !d.beloenninger.some(b => !brugtOp(b, d))) return null;
  const s = saldo(d);
  const k = el('div', 'kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Belønninger'), el('span', 'kort-pil stjerne-saldo', '★ ' + s.stjerner));
  const ul = el('ul', 'beloen-liste i-kort');
  d.indl.filter(x => x.status === 'afventer').forEach(x => ul.append(oenskeLi(x, !erVoksen())));
  // Alle belønninger (billigste først) – også dem man sparer op til
  const sorteret = [...d.beloenninger].sort((a, c) => (c.navn === d.maal) - (a.navn === d.maal) || a.stjerner - c.stjerner)
    .filter(b => !brugtOp(b, d) && !d.indl.some(x => x.status === 'afventer' && x.navn === b.navn));
  sorteret.forEach(b => ul.append(beloenLi(barn, b, d, s)));
  // Sammenhæng med pligterne: hvad er tjent i dag, og hvad kan stadig nås
  const idagIso = isoDato(new Date());
  const tjentIdag = sum(d.flueben.filter(f => f.dato === idagIso), 'stjerner') + sum((d.bonus || []).filter(b => b.dato === idagIso), 'stjerner');
  const kanNaas = dagensOpgaver(d).filter(r => !r.f && !r.sprunget).reduce((n, r) => n + Math.round(tal(r.o.stjerner)), 0);
  const idagLinje = el('p', 'beloen-idag');
  if (tjentIdag) idagLinje.append(el('span', 'tjent', '+★ ' + tjentIdag + ' i dag'));
  if (kanNaas) idagLinje.append(knap('★ ' + kanNaas + ' mere at hente i pligter ›', 'link-knap', () => {
    if (typeof aabnZoom === 'function' && document.querySelector('.flise[data-noegle="pligter"]')) aabnZoom('pligter');
    else { pligtBarn = barn; visFane('pligter'); tegnPligter(); window.scrollTo(0, 0); }
  }));
  k.append(top);
  if (idagLinje.children.length) k.append(idagLinje);
  k.append(ul);
  const hylde = pokalHylde(d);
  if (hylde) k.append(hylde);
  const venter = d.indl.filter(x => x.status === 'afventer');
  const raad = sorteret.filter(b => b.stjerner <= s.stjerner);
  const naesteB = sorteret.find(b => b.stjerner > s.stjerner);
  const maalB = sorteret.find(b => b.navn === d.maal);
  if (maalB) {
    maalMilepael(barn, maalB, s.stjerner);
    k.tavle = { noegle: 'beloenninger', ikon: '🎯', titel: 'Mit mål', stor: '★ ' + Math.min(s.stjerner, maalB.stjerner) + '/' + maalB.stjerner,
      lille: venter.length ? 'Ønske venter på en voksen 🎁' : s.stjerner >= maalB.stjerner ? maalB.navn + ' – du har nok! 🎉' : maalB.navn + ' · mangler ★ ' + (maalB.stjerner - s.stjerner),
      andel: maalB.stjerner ? s.stjerner / maalB.stjerner : 1, klar: s.stjerner >= maalB.stjerner };
    return k;
  }
  k.tavle = { noegle: 'beloenninger', ikon: '🎁', titel: 'Belønninger', stor: '★ ' + s.stjerner + (tjentIdag ? '  +' + tjentIdag + ' i dag' : ''),
    lille: venter.length ? 'Ønske venter på en voksen 🎁' : raad.length ? 'Nok stjerner til ' + (raad.length === 1 ? '"' + raad[0].navn + '"' : raad.length + ' belønninger') + ' 🎉'
      : naesteB ? 'Mangler ★ ' + (naesteB.stjerner - s.stjerner) + ' til ' + naesteB.navn + (kanNaas ? ' · ★ ' + kanNaas + ' at hente i dag' : '') : '',
    andel: naesteB ? s.stjerner / naesteB.stjerner : 1 };
  return k;
}

// Ét ønske om at indløse en belønning. Voksne: Godkend/Afvis. Barnet selv: Fortryd.
function oenskeLi(x, egen) {
  const li = el('li', 'beloen oenske');
  const info = el('div', 'beloen-info');
  info.append(el('span', 'beloen-navn', (egen ? '' : x.barn + ' vil gerne: ') + x.navn), el('span', 'beloen-pris', '★ ' + x.stjerner + ' · ' + kortDato(x.dato)));
  const knapper = el('div', 'oenske-knapper');
  if (egen) knapper.append(knap('Fortryd', 'lille-knap', async () => { await Data.remove('indloesninger', x.id); tegnAlt(); }));
  else knapper.append(
    bekraeftKnap('Afvis', 'afvise', 'lille-knap', async () => { Data.huskFoer(x.id, 'Afvist: ' + x.navn); await Data.update('indloesninger', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); tegnAlt(); }),
    knap('Godkend', 'lille-knap godkend', async () => {
      Data.huskFoer(x.id, 'Godkendt: ' + x.navn);   // bjælken "Fortryd" i 8 sek.
      await Data.update('indloesninger', x.id, { status: 'godkendt', besvaret: isoDato(new Date()) });
      tegnAlt();
    }));
  li.append(info, knapper);
  return li;
}
// ---------- Ekstra stjerner (noget godt, der ikke står på listen) ----------
// Data: 'ekstra' {barn, tekst, stjerner, dato, status: 'afventer'|'godkendt'|'afvist', fra?: voksen der gav/godkendte, besvaret?}
//  • Barnet beder om 1-3 ★ ("Jeg har gjort noget ekstra") → afventer, til en voksen godkender (kan ændre antal) eller afviser.
//  • En voksen giver ros direkte ("⭐ Giv stjerne") → godkendt med det samme.
//  • Kun godkendte tæller i saldoen. Databasen tjekker barnets ønske (opdatering-ekstra.sql: højst 3 ★, højst 3 ventende).
const EKSTRA_GRUNDE = ['Hjalp til', 'Ryddede op uden at blive bedt om det', 'Var sød ved sin bror', 'Hjalp med maden', 'Var modig', 'Gjorde sit bedste'];
const EKSTRA_MAX = 3;
const ekstraLinje = (navn, n) => '⭐ ' + navn + ' · ★ ' + n;

// Barnet: "Jeg har gjort noget ekstra"
function bedOmEkstra(barn) {
  const kl = kladdeHent('ekstra');
  const tekst = input('text', 'ekstra-tekst', kl || '', 'Fx Hjalp mormor med at bære');
  tekst.addEventListener('input', () => kladdeGem('ekstra', tekst.value.trim() ? tekst.value : null));
  const forslag = el('div', 'seg wrap');
  for (const g of ['Hjalp til', 'Ryddede op', 'Hjalp med maden', 'Var sød ved min bror', 'Lavede noget ekstra']) forslag.append(knap(g, null, () => { tekst.value = g; kladdeGem('ekstra', g); }));
  let n = 1;
  const antal = chipValg([1, 2, 3], n, v => { n = v; }, v => '★'.repeat(v));
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const send = knap('Send til mor og far', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { fejl.textContent = 'Skriv hvad du har gjort 🙂'; fejl.hidden = false; tekst.focus(); return; }
    const r = await Data.add('ekstra', { barn, tekst: t, stjerner: n, dato: isoDato(new Date()), status: 'afventer' });
    if (r) kladdeGlem('ekstra');
    lukArk();
    if (r) fejr('Sendt til mor og far ⭐');   // fra sjov.js
    tegnAlt();
  });
  const knapper = el('div', 'ark-knapper'); knapper.append(send);
  aabnArk('⭐ Jeg har gjort noget ekstra', felt('Hvad har du gjort?', tekst), forslag, felt('Hvor mange stjerner synes du?', antal),
    el('p', 'hint', 'Mor eller far siger ja eller nej – og kan give flere eller færre stjerner.'), fejl, knapper);
  setTimeout(() => tekst.focus(), 50);
}

// Voksen: giv ros med det samme – eller godkend et ønske (x) med evt. et andet antal
function givEkstra(barn, x = null) {
  const tekst = input('text', 'ekstra-tekst', x?.tekst || '', 'Fx Hjalp med at bære indkøb');
  const forslag = el('div', 'seg wrap');
  for (const g of EKSTRA_GRUNDE) forslag.append(knap(g, null, () => { tekst.value = g; }));
  let n = Math.min(EKSTRA_MAX, Math.max(1, Math.round(tal(x?.stjerner)) || 1));
  const antal = chipValg([1, 2, 3, 5], n, v => { n = v; }, v => '★ ' + v);
  const gem = knap(x ? 'Godkend' : 'Giv stjerne', 'knap', async () => {
    const t = tekst.value.trim() || 'Ekstra indsats';
    const fra = Data.bruger()?.navn || '';
    if (x) await Data.update('ekstra', x.id, { tekst: t, stjerner: n, status: 'godkendt', fra, besvaret: isoDato(new Date()) });
    else await Data.add('ekstra', { barn, tekst: t, stjerner: n, dato: isoDato(new Date()), status: 'godkendt', fra });
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (x) knapper.append(knap('Afvis', 'knap fare', async () => { await Data.update('ekstra', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(x ? barn + ' har gjort noget ekstra' : '⭐ Giv ' + barn + ' en stjerne', felt('For hvad?', tekst), forslag, felt('Stjerner', antal),
    el('p', 'hint', x ? barn + ' bad om ★ ' + x.stjerner + '. Du kan give flere eller færre.' : barn + ' får det at se med konfetti på sin tavle.'), knapper);
}

// Linjer + knap til pligt-kortet og Pligter-siden
function ekstraDele(barn, d) {
  if (!d.regel.stjerner) return [];
  const dele = [];
  const venter = (d.ekstra || []).filter(x => x.status === 'afventer');
  const ul = el('ul', 'beloen-liste ekstra-liste');
  for (const x of venter) {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', '⭐ ' + x.tekst), el('span', 'beloen-pris', '★ ' + x.stjerner + ' · venter på mor eller far'));
    const kn = el('div', 'oenske-knapper');
    if (erVoksen()) kn.append(knap('Svar', 'lille-knap godkend', () => givEkstra(barn, x)));
    else kn.append(knap('Fortryd', 'lille-knap', async () => { await Data.remove('ekstra', x.id); tegnAlt(); }));
    li.append(info, kn);
    ul.append(li);
  }
  if (venter.length) dele.push(ul);
  // Stjerner givet i dag (ekstra og justeringer med plus) – kan ikke rettes her
  const idagIso = isoDato(new Date());
  const givet = [
    ...(d.ekstra || []).filter(x => x.status === 'godkendt' && (x.besvaret || x.dato) === idagIso),
    ...(d.just || []).filter(x => !x.type && x.dato === idagIso && Math.round(tal(x.stjerner)) > 0)
  ];
  if (givet.length) {
    const gl = el('ul', 'liste i-kort gave-liste');
    for (const x of givet) {
      const li = el('li', 'punkt gave-punkt');
      const tb = el('span', 'tekst-boks');
      tb.append(el('span', 'tekst', (x.tekst || 'Ekstra stjerner') + (x.fra ? ' · fra ' + kaldNavn(x.fra) : '')));
      li.append(el('span', 'gave-ikon', '⭐'), tb, el('span', 'stjerne-tag', '+★ ' + Math.round(tal(x.stjerner))));
      gl.append(li);
    }
    dele.push(gl);
  }
  if (erVoksen()) dele.push(knap('⭐ Giv ' + barn + ' en stjerne', 'lille-knap ekstra-knap', () => givEkstra(barn)));
  else if (loggetIndBarn() === barn && venter.length < EKSTRA_MAX) dele.push(knap('⭐ Jeg har gjort noget ekstra', 'lille-knap ekstra-knap', () => bedOmEkstra(barn)));
  return dele;
}

// Barnets tavle: besked når en voksen har svaret (belønningsønske, ekstra stjerner, madønske) eller givet ros.
// Vises én gang pr. enhed – både når barnet logger ind, og mens tavlen er åben (live). Ja = konfetti, nej = venlig besked.
async function svarTilBarn(barn) {
  if (loggetIndBarn() !== barn) return;
  const [indl, ekstra, mad, just] = await Promise.all(['indloesninger', 'ekstra', 'madoensker', 'justeringer'].map(l => Data.list(l)));
  const svar = [
    ...indl.filter(x => x.barn === barn && x.besvaret && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', tekst: x.status === 'godkendt' ? 'Ja! Du får ' + x.navn + ' 🎁' : 'Mor og far sagde nej til ' + x.navn + ' denne gang' })),
    ...ekstra.filter(x => x.barn === barn && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', stjerner: x.status === 'godkendt' ? Math.round(tal(x.stjerner)) : 0,
        tekst: x.status === 'godkendt' ? gaveTekst(x) : 'Ikke denne gang: ' + x.tekst })),
    ...mad.filter(x => x.barn === barn && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', tekst: x.status === 'godkendt' ? 'Ja! Du får ' + x.ret + ' 😋' : 'Nej til ' + x.ret + ' denne gang' }))
  ];
  // Stjerner en voksen har givet med "Justér" (plus, ikke streak) – egen "set"-liste, så gamle ikke vises igen
  // (gaver på sedler vises på selve sedlen – ikke her)
  const gaveJust = just.filter(x => x.barn === barn && !x.type && !x.seddel && !/^Gave på seddel/.test(x.tekst || '') && Math.round(tal(x.stjerner)) > 0)
    .map(x => ({ id: x.id, ja: true, stjerner: Math.round(tal(x.stjerner)), tekst: gaveTekst(x) }));
  const nyeJust = nyeSiden('gave-set-' + barn, gaveJust);
  const noegle = 'svar-set-' + barn;
  let set;
  try { set = JSON.parse(lokal.get(noegle) || lokal.get('ekstra-set-' + barn) || 'null'); } catch { set = null; }
  if (!Array.isArray(set)) { lokal.set(noegle, JSON.stringify(svar.map(x => x.id))); set = svar.map(x => x.id); }   // første gang: gamle svar er set
  const nyeSvar = svar.filter(x => !set.includes(x.id));
  // Husk kun id'er der stadig findes (ellers glemmer listen gamle svar og viser dem igen og igen)
  if (nyeSvar.length) { const findes = new Set(svar.map(x => x.id)); lokal.set(noegle, JSON.stringify([...set.filter(id => findes.has(id)), ...nyeSvar.map(x => x.id)])); }
  const nye = [...nyeSvar, ...nyeJust];
  if (!nye.length || svarVisesNu) return;
  svarVisesNu = true;
  // Stjerner: stor stjerne, der bliver til der trykkes (sjov.js). Bagefter de andre svar som før.
  const gaver = nye.filter(x => x.ja && x.stjerner > 0);
  const ja = nye.filter(x => x.ja && !(x.stjerner > 0)), nej = nye.filter(x => !x.ja);
  setTimeout(() => stjerneGave(gaver, () => {
    svarVisesNu = false;
    if (ja.length) fejr(ja.length === 1 ? ja[0].tekst : ja.length + ' ja-svar fra mor og far! 🎉');   // fra sjov.js
    if (nej.length) setTimeout(() => besked(nej.length === 1 ? nej[0].tekst : nej.length + ' svar fra mor og far – se under Pligter'), ja.length ? 2800 : 0);
    tegnAlt();
  }), 700);
}
let svarVisesNu = false;
// "Far gav dig ★ 3 – for opvasken!"
const gaveTekst = x => (x.fra ? kaldNavn(x.fra) + ' gav dig' : 'Du fik') + ' ★ ' + Math.round(tal(x.stjerner)) + (x.tekst ? ' – ' + x.tekst : '') + '!';
// Nye punkter siden sidst (husket pr. enhed). Første gang tæller intet som nyt.
function nyeSiden(noegle, liste) {
  let set;
  try { set = JSON.parse(lokal.get(noegle) || 'null'); } catch { set = null; }
  if (!Array.isArray(set)) { lokal.set(noegle, JSON.stringify(liste.map(x => x.id))); return []; }
  const nye = liste.filter(x => !set.includes(x.id));
  if (nye.length) { const findes = new Set(liste.map(x => x.id)); lokal.set(noegle, JSON.stringify([...set.filter(id => findes.has(id)), ...nye.map(x => x.id)])); }
  return nye;
}

// Indhold til "Ønsker" på de voksnes I dag (tomt hvis intet venter)
// ---------- Hvad har den anden voksne svaret? ----------
// Så man ikke leder efter et ønske, der allerede er besvaret, når man åbner appen fra en notifikation.
// Hentes fra aktivitetsloggen (kun voksne kan læse den) – kun svar fra de andre voksne, det seneste døgn.
let svarHuske = { noegle: null, liste: [], hent: null };
async function andresSvar() {
  if (!erVoksen()) return [];
  const noegle = Data.nytUdefra() + '|' + Math.floor(Date.now() / 600000);   // hent igen ved ændringer fra andre (og hvert 10. min)
  if (svarHuske.noegle === noegle) return svarHuske.hent || svarHuske.liste;
  svarHuske.noegle = noegle;
  svarHuske.hent = (async () => {
    try {
      const mig = Data.bruger()?.navn, graense = new Date(Date.now() - 24 * 3600000).toISOString();
      const raekker = (await Data.aktivitet(null, 120)).filter(a => a.tid >= graense && a.navn && a.navn !== mig && VOKSNE.includes(a.navn));
      const res = [];
      for (const a of raekker) {
        const f = a.foer || {}, e = a.efter || {}, d = a.efter || a.foer || {};
        const t = (d.barn ? d.barn + ': ' : '') + (typeof aktTitel === 'function' ? aktTitel(d, a.liste) : (d.navn || d.tekst || d.ret || ''));
        let ikon = null, hvad = null;
        if (['indloesninger', 'ekstra', 'madoensker'].includes(a.liste) && a.handling === 'ret' && f.status === 'afventer' && e.status !== 'afventer') {
          if (e.status === 'godkendt') { ikon = '👍'; hvad = 'sagde ja'; }
          else if (e.status === 'afvist') { ikon = '👎'; hvad = 'sagde nej'; }
          else if (e.status === 'erstattet') { ikon = '🔁'; hvad = 'valgte noget andet'; }
        } else if (a.liste === 'flueben' && f.venter && a.handling === 'ret' && !e.venter) { ikon = '👍'; hvad = 'godkendte'; }
        else if (a.liste === 'flueben' && f.venter && a.handling === 'slet') { ikon = '✖'; hvad = 'sagde ikke klaret'; }
        else if (a.liste === 'jobs' && a.handling === 'ret' && f.status === 'klaret' && e.status !== 'klaret') {
          ikon = e.status === 'godkendt' ? '💼' : '↩️'; hvad = e.status === 'godkendt' ? 'godkendte jobbet' : 'sendte jobbet tilbage';
        }
        if (hvad) res.push({ tid: a.tid, tekst: ikon + ' ' + a.navn + ' ' + hvad + ' · ' + t });
        if (res.length >= 5) break;
      }
      svarHuske.liste = res;
    } catch (e) { console.warn('Svar:', e); svarHuske.liste = []; }
    svarHuske.hent = null;
    return svarHuske.liste;
  })();
  return svarHuske.hent;
}
function svarListe(svar) {
  const ul = el('ul', 'svar-liste');
  for (const s of svar) {
    const li = el('li');
    const t = new Date(s.tid);
    li.append(el('span', 'svar-tekst', s.tekst), el('span', 'svar-tid', (isoDato(t) === isoDato(new Date()) ? '' : 'i går ') + klokken(t)));
    ul.append(li);
  }
  return ul;
}

async function oenskerIndhold() {
  if (!erVoksen()) return [];
  const svar = await andresSvar();
  const ventende = (await Data.list('indloesninger')).filter(x => x.status === 'afventer').sort((a, b) => a.dato.localeCompare(b.dato));
  const ekstra = (await Data.list('ekstra')).filter(x => x.status === 'afventer').sort((a, b) => a.dato.localeCompare(b.dato));
  const mad = await madOenskeLinjer();   // fra app.js
  const venterFb = (await Data.list('flueben')).filter(f => f.venter);
  const jobKlar = (await Data.list('jobs')).filter(j => j.status === 'klaret');
  const antal = ventende.length + ekstra.length + mad.length + venterFb.length + jobKlar.length;
  if (!antal && !svar.length) return [];
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', '🎁 Ønsker'), el('span', 'kort-pil', !antal ? 'Intet venter' : antal === 1 ? '1 venter' : antal + ' venter'));
  if (!antal) return [top, el('p', 'svar-titel', 'Allerede svaret'), svarListe(svar)];
  const ul = el('ul', 'beloen-liste');
  ventende.forEach(x => ul.append(oenskeLi(x, false)));
  // Børnenes "jeg har gjort noget ekstra"
  for (const x of ekstra) {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', x.barn + ' har gjort noget ekstra: ' + x.tekst), el('span', 'beloen-pris', '★ ' + x.stjerner + ' · ' + kortDato(x.dato)));
    const kn = el('div', 'oenske-knapper');
    kn.append(bekraeftKnap('Afvis', 'afvise', 'lille-knap', async () => { Data.huskFoer(x.id, 'Afvist: ' + x.tekst); await Data.update('ekstra', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); tegnAlt(); }),
      knap('Godkend', 'lille-knap godkend', () => givEkstra(x.barn, x)));
    li.append(info, kn);
    ul.append(li);
  }
  ul.append(...mad);
  // 👍 Pligter der skal godkendes
  for (const f of venterFb) {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', f.glemt ? f.barn + ' glemte at krydse af: ' + f.navn : f.barn + ' har klaret: ' + f.navn), el('span', 'beloen-pris', [tal(f.stjerner) ? '★ ' + tal(f.stjerner) : '', tal(f.kr) ? kr(tal(f.kr)) : '', kortDato(f.dato)].filter(Boolean).join(' · ')));
    const kn = el('div', 'oenske-knapper');
    kn.append(bekraeftKnap('Ikke klaret', 'afvise', 'lille-knap', async () => { await Data.remove('flueben', f.id); tegnAlt(); }),
      knap('👍', 'lille-knap godkend', async () => { Data.huskFoer(f.id, '👍 ' + f.navn); await Data.update('flueben', f.id, { venter: false }); tegnAlt(); }));
    li.append(info, kn); ul.append(li);
  }
  // 💼 Ekstra-jobs der er lavet
  for (const j of jobKlar) {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', '💼 ' + j.barn + ' har lavet: ' + j.navn), el('span', 'beloen-pris', jobPrisTekst(j)));
    const kn = el('div', 'oenske-knapper');
    // Pr. stk./minut: antallet kan rettes, før det godkendes
    let antalInp = null;
    if (jobPrStk(j)) {
      antalInp = input('text', 'job-antal-' + j.id, String(tal(j.antal) || ''), 'Antal');
      antalInp.inputMode = 'numeric'; antalInp.className = 'job-antal-ret';
      antalInp.setAttribute('aria-label', 'Antal ' + jobEnhed(j, 2));
      info.append(antalInp);
    }
    kn.append(bekraeftKnap('Ikke færdig', 'sende tilbage', 'lille-knap', async () => { await Data.update('jobs', j.id, { status: 'taget' }); tegnAlt(); }),
      knap('Godkend', 'lille-knap godkend', async () => {
        Data.huskFoer(j.id, 'Godkendt: ' + j.navn);
        const n = antalInp ? Math.max(0, Math.round(tal(antalInp.value))) : 0;
        await Data.update('jobs', j.id, { status: 'godkendt', dato: isoDato(new Date()), fra: Data.bruger()?.navn, ...(antalInp ? { antal: n, ...jobSum(j, n) } : {}) });
        if (j.igen) {   // ↻ samme job lægges op igen
          const { id, oprettet, _af, status, barn, dato, fra, antal, ...rest } = j;
          await Data.add('jobs', { ...rest, ...(jobPrStk(j) ? { stjerner: 0, kr: 0 } : {}), status: 'ledig' });
        }
        tegnAlt();
      }));
    li.append(info, kn); ul.append(li);
  }
  return svar.length ? [top, ul, el('p', 'svar-titel', 'Allerede svaret'), svarListe(svar)] : [top, ul];
}

// ---------- 💼 Ekstra-jobs: de voksne lægger betalte job op, den første der tager det, får det ----------
// Data: 'jobs' {navn, stjerner, kr, til?: barn (ellers alle), status 'ledig'|'taget'|'klaret'|'godkendt', barn?, dato?, fra?}
//   Betaling pr. stk./minut (okt. 2026): enhed ('stk'|'min'), enhedNavn? (fx "højbed"), prKr, prStjerner, maks?, igen?
//   – barnet skriver antal, når det melder klaret (antal); ved godkendelse sættes kr/stjerner = antal × pris. igen = lægges op igen.
const jobPrStk = j => j.enhed === 'stk' || j.enhed === 'min';
const jobEnhed = (j, n = 2) => j.enhed === 'min' ? (n === 1 ? 'minut' : 'minutter') : (j.enhedNavn ? (n === 1 ? j.enhedNavn : (j.enhedFlertal || j.enhedNavn)) : 'stk.');
const jobPrisTekst = j => {
  if (!jobPrStk(j)) return [tal(j.stjerner) ? '★ ' + tal(j.stjerner) : '', tal(j.kr) ? kr(tal(j.kr)) : ''].filter(Boolean).join(' · ');
  const pr = [tal(j.prStjerner) ? '★ ' + tal(j.prStjerner) : '', tal(j.prKr) ? kr(tal(j.prKr)) : ''].filter(Boolean).join(' + ');
  return pr + ' pr. ' + jobEnhed(j, 1) + (tal(j.antal) ? ' · ' + tal(j.antal) + ' ' + jobEnhed(j, tal(j.antal)) + ' = ' + jobSumTekst(j, tal(j.antal)) : '');
};
const jobSum = (j, n) => ({ kr: Math.round(n * tal(j.prKr) * 100) / 100, stjerner: Math.round(n * tal(j.prStjerner)) });
const jobSumTekst = (j, n) => { const s = jobSum(j, n); return [s.stjerner ? '★ ' + s.stjerner : '', s.kr ? kr(s.kr) : ''].filter(Boolean).join(' · ') || '0'; };
// Barnet melder klaret: hvor mange / hvor længe?
function jobAntal(j, efter) {
  const inp = input('text', 'job-antal', '', j.enhed === 'min' ? 'Fx 45' : 'Fx 3');
  inp.inputMode = 'numeric';
  const vis = el('p', 'job-sum');
  const op = () => { const n = Math.max(0, Math.round(tal(inp.value))); vis.textContent = n ? n + ' ' + jobEnhed(j, n) + ' = ' + jobSumTekst(j, n) : ''; };
  inp.addEventListener('input', op);
  const plusMinus = el('div', 'seg wrap');
  plusMinus.append(...(j.enhed === 'min' ? [15, 30, 45, 60] : [1, 2, 3, 4, 5]).map(n => knap(String(n), null, () => { inp.value = String(n); op(); })));
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const gem = knap('Meld klaret ✓', 'knap', async () => {
    const n = Math.round(tal(inp.value));
    const maks = tal(j.maks) || (j.enhed === 'min' ? 600 : 100);
    if (!(n > 0)) { fejl.textContent = 'Skriv et tal'; fejl.hidden = false; return; }
    if (n > maks) { fejl.textContent = 'Højst ' + maks + ' ' + jobEnhed(j, maks); fejl.hidden = false; return; }
    await Data.update('jobs', j.id, { status: 'klaret', antal: n });
    lukArk(); efter();
  });
  const knapper = el('div', 'ark-knapper'); knapper.append(gem);
  aabnArk(j.navn, felt(j.enhed === 'min' ? 'Hvor mange minutter?' : 'Hvor mange ' + jobEnhed(j, 2) + '?', inp), plusMinus, vis, fejl, knapper);
  setTimeout(() => inp.focus(), 50);
}
// Børnelåsen (opdatering-jobs.sql): barnet må kun tage et ledigt job, melde det klaret eller give det fra sig igen.
function jobsKort(barn, d) {
  const mine = (d.jobs || []).filter(j => j.status === 'taget' || j.status === 'klaret');
  const ledige = d.ledigeJobs || [];
  if (!mine.length && !ledige.length && !erVoksen()) return null;
  const boks = el('div', 'jobs-boks');
  boks.append(el('h3', 'lille-titel', '💼 Ekstra-jobs'));
  const ul = el('ul', 'beloen-liste');
  const pris = jobPrisTekst;
  for (const j of mine) {
    const li = el('li', 'beloen');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', ((autoEmoji(j.navn, j.barn) || (emojiTil(j.barn) ? '💼' : '')) + ' ' + j.navn).trim()), el('span', 'beloen-pris', pris(j) + (j.status === 'klaret' ? ' · venter på 👍' : ' · dit job')));
    const kn = el('div', 'oenske-knapper');
    if (j.status === 'taget' && loggetIndBarn() === barn) kn.append(
      knap('Giv fra mig', 'lille-knap', async () => { await Data.update('jobs', j.id, { status: 'ledig', barn: null }); tegnAlt(); }),
      knap('Færdig ✓', 'lille-knap godkend', async () => {
        if (jobPrStk(j)) { jobAntal(j, () => { fejr('Sejt! Mor og far kigger på det 💼'); tegnAlt(); }); return; }   // pr. stk./minut: hvor mange?
        await Data.update('jobs', j.id, { status: 'klaret' }); fejr('Sejt! Mor og far kigger på det 💼'); tegnAlt();
      }));
    li.append(info, kn); ul.append(li);
  }
  for (const j of ledige) {
    const li = el('li', 'beloen');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', ((autoEmoji(j.navn, barn) || (emojiTil(barn) ? '💼' : '')) + ' ' + j.navn).trim()), el('span', 'beloen-pris', pris(j) + ' · ledigt'));
    const kn = el('div', 'oenske-knapper');
    if (loggetIndBarn() === barn) kn.append(knap('Jeg tager den!', 'lille-knap godkend', async () => {
      await Data.update('jobs', j.id, { status: 'taget', barn });
      fejr('Jobbet er dit! 💼'); tegnAlt();
    }));
    else if (erVoksen()) kn.append(bekraeftKnap('Slet', 'slette', 'lille-knap', async () => { await Data.remove('jobs', j.id); tegnAlt(); }));
    li.append(info, kn); ul.append(li);
  }
  if (ul.children.length) boks.append(ul);
  else boks.append(el('p', 'hint', 'Ingen ledige jobs lige nu.'));
  if (erVoksen()) boks.append(knap('➕ Nyt ekstra-job', 'lille-knap', () => nytJob(barn)));
  return boks;
}
function nytJob(barn) {
  const navn = input('text', 'job-navn', '', 'Fx vask bilen, ryd garagen');
  const stj = input('text', 'job-stj', '', '★'); stj.inputMode = 'numeric';
  const krI = input('text', 'job-kr', '', 'kr'); krI.inputMode = 'decimal';
  let til = '', betaling = 'fast', igen = false;
  const tilValg = chipValg(['', ...BOERN], til, v => { til = v; }, v => v || 'Den første der tager det');
  const raekke = el('div', 'to-felter');
  raekke.append(felt('Stjerner', stj), felt('Kroner', krI));
  // Pr. stk. (fx pr. højbed, pr. bil) eller pr. minut (fx havearbejde) – barnet skriver selv, hvor meget det blev til
  const enhedNavn = input('text', 'job-enhed', '', 'Fx højbed (tom = stk.)');
  const enhedFlertal = input('text', 'job-enhed-fl', '', 'Flertal, fx højbede');
  const maks = input('text', 'job-maks', '', 'Højst (valgfri)'); maks.inputMode = 'numeric';
  const enhedBoks = el('div');
  const enhedRaekke = el('div', 'to-felter'); enhedRaekke.append(felt('Hvad tælles?', enhedNavn), felt('Flertal', enhedFlertal));
  const hint = el('p', 'hint');
  const tegnBetaling = () => {
    enhedBoks.hidden = betaling === 'fast';
    enhedRaekke.hidden = betaling !== 'stk';
    raekke.querySelectorAll('.felt-label')[0].textContent = betaling === 'fast' ? 'Stjerner' : 'Stjerner pr. ' + (betaling === 'min' ? 'minut' : (enhedNavn.value.trim() || 'stk.'));
    raekke.querySelectorAll('.felt-label')[1].textContent = betaling === 'fast' ? 'Kroner' : 'Kroner pr. ' + (betaling === 'min' ? 'minut' : (enhedNavn.value.trim() || 'stk.'));
    hint.textContent = betaling === 'fast' ? '' : 'Barnet skriver selv, hvor ' + (betaling === 'min' ? 'mange minutter det tog' : 'mange det blev til') + ', når jobbet meldes klaret – I kan rette tallet, før I godkender.';
  };
  enhedNavn.addEventListener('input', tegnBetaling);
  const betalingValg = chipValg(['fast', 'stk', 'min'], betaling, v => { betaling = v; tegnBetaling(); }, v => ({ fast: 'Fast pris', stk: 'Pr. stk.', min: 'Pr. minut' })[v]);
  const igenValg = chipValg([false, true], igen, v => { igen = v; }, v => (v ? '↻ Lægges op igen efter godkendelse' : 'Kun én gang'));
  enhedBoks.append(enhedRaekke, felt('Højst', maks));
  tegnBetaling();
  const gem = knap('Læg jobbet op', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const s = Math.max(0, betaling === 'fast' ? Math.round(tal(stj.value)) : tal(stj.value)), k = Math.max(0, tal(krI.value));
    const felter = betaling === 'fast' ? { navn: n, stjerner: s, kr: k }
      : { navn: n, stjerner: 0, kr: 0, enhed: betaling, prStjerner: s, prKr: k,
          ...(betaling === 'stk' && enhedNavn.value.trim() ? { enhedNavn: enhedNavn.value.trim(), enhedFlertal: enhedFlertal.value.trim() || enhedNavn.value.trim() } : {}),
          ...(tal(maks.value) > 0 ? { maks: Math.round(tal(maks.value)) } : {}) };
    await Data.add('jobs', { ...felter, status: 'ledig', ...(til ? { til } : {}), ...(igen ? { igen: true } : {}) });
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper'); knapper.append(gem);
  aabnArk('Nyt ekstra-job', felt('Hvad skal laves?', navn), el('label', 'felt-label', 'Betaling'), betalingValg, enhedBoks, raekke, hint,
    el('label', 'felt-label', 'Hvem må tage det?'), tilValg, el('label', 'felt-label', 'Gentages?'), igenValg, knapper);
  setTimeout(() => navn.focus(), 50);
}

function redigerOpgave(o, regel) {
  const ny = !o.id;
  const navn = input('text', 'opg-navn', o.navn, 'Fx tøm opvaskemaskinen');
  let til = o.barn || pligtBarn;
  const tilMuligheder = !ny ? [o.barn] : BOERN.includes(til) ? [...BOERN, 'Begge'] : [til];
  const tilValg = chipValg(tilMuligheder, til, v => { til = v; }, v => (v === 'Begge' ? 'Begge børn' : v));

  let gentag = o.gentag || 'dag';
  const dage = new Set(o.dage && o.dage.length ? o.dage : [0, 1, 2, 3, 4, 5, 6]);
  // Som rutiner: bestemte ugedage – eller skoledage/fridage, der følger kalenderen (ferie, helligdage …)
  let dagtype = DAGTYPER[o.dagtype] ? o.dagtype : 'dage';
  const typeHint = el('p', 'hint');
  const dagtypeBoks = el('div');
  const dagtypeValg = chipValg(['dage', ...Object.keys(DAGTYPER)], dagtype, v => { dagtype = v; tegnDage(); },
    v => (v === 'dage' ? '📅 Vælg dage' : DAGTYPER[v].ikon + ' ' + DAGTYPER[v].navn));
  dagtypeBoks.append(dagtypeValg, typeHint);
  const dageBoks = el('div', 'seg wrap dage-valg');
  const tegnDage = () => {
    dagtypeBoks.hidden = gentag !== 'dag';
    typeHint.hidden = dagtype === 'dage';
    typeHint.textContent = DAGTYPER[dagtype]?.hint || '';
    dageBoks.hidden = gentag !== 'dag' || dagtype !== 'dage';
    dageBoks.replaceChildren(...DAGE.map((d, i) => {
      const k = knap(d, null, () => { if (dage.has(i)) dage.delete(i); else dage.add(i); tegnDage(); });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', dage.has(i));
      return k;
    }));
  };
  // Med fast mellemrum: antal dage + hvornår første gang
  let interval = intervalDage(o);
  const intervalInp = input('text', 'opg-interval', String(interval), '14');
  intervalInp.inputMode = 'numeric';
  intervalInp.addEventListener('input', () => { interval = Math.max(1, Math.round(tal(intervalInp.value)) || 1); tegnIntervalChips(); });
  const intervalChips = el('div', 'seg wrap');
  const tegnIntervalChips = () => intervalChips.replaceChildren(...[[7, '1 uge'], [14, '2 uger'], [21, '3 uger'], [28, '4 uger']].map(([n, t]) => {
    const k = knap(t, null, () => { interval = n; intervalInp.value = String(n); tegnIntervalChips(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', n === interval);
    return k;
  }));
  tegnIntervalChips();
  const startInp = input('date', 'opg-start', o.start || isoDato(new Date()));
  const intervalRaekke = el('div', 'to-felter');
  intervalRaekke.append(felt('Antal dage imellem', intervalInp), felt(ny ? 'Første gang' : 'Startede', startInp));
  let regnFra = o.regnFra === 'klaret' ? 'klaret' : 'fast';
  const regnHint = el('p', 'hint');
  const tegnRegnHint = () => {
    const dag = startInp.value ? ugedagNavn(startInp.value) : 'samme dag';
    regnHint.textContent = regnFra === 'fast'
      ? 'Holder rytmen: kommer igen på samme dag (' + dag + ') hver gang, også hvis den klares for sent. Glemmes den, bliver den stående, til den er klaret.'
      : 'Næste gang regnes fra den dag, den sidst blev klaret. Glemmes den, bliver den stående, til den er klaret.';
  };
  startInp.addEventListener('change', tegnRegnHint);
  const regnValg = chipValg(['fast', 'klaret'], regnFra, v => { regnFra = v; tegnRegnHint(); },
    v => ({ fast: 'Fast dag', klaret: 'Fra sidst klaret' })[v]);
  tegnRegnHint();
  const intervalBoks = el('div', 'interval-boks');
  intervalBoks.append(intervalChips, intervalRaekke, felt('Næste gang', regnValg), regnHint);
  const visInterval = () => { intervalBoks.hidden = gentag !== 'interval'; };

  const gentagValg = chipValg(['dag', 'uge', 'interval', 'engang'], gentag, v => { gentag = v; tegnDage(); visInterval(); },
    v => ({ dag: 'Hver dag', uge: 'Én gang om ugen', interval: 'Med fast mellemrum', engang: 'Kun én gang' })[v]);
  tegnDage();
  visInterval();

  // Belønning: kun de typer personen er sat op til
  const typer = ['ingen', ...(regel.kr ? ['penge'] : []), ...(regel.stjerner ? ['stjerner'] : []), ...(regel.kr && regel.stjerner ? ['begge'] : [])];
  const harKr = tal(o.kr) > 0, harStj = tal(o.stjerner) > 0;
  let type = harKr && harStj ? 'begge' : harKr ? 'penge' : harStj ? 'stjerner' : (ny && regel.kr ? 'penge' : ny && regel.stjerner ? 'stjerner' : 'ingen');
  if (!typer.includes(type)) type = 'ingen';
  const krInp = input('text', 'opg-kr', o.kr ? String(o.kr).replace('.', ',') : '', 'Fx 5');
  krInp.inputMode = 'decimal';
  const stjInp = input('text', 'opg-stj', o.stjerner ? String(o.stjerner) : '', 'Fx 1');
  stjInp.inputMode = 'numeric';
  const krFelt = felt('Kroner', krInp);
  const stjFelt = felt('Stjerner', stjInp);
  const beloebRaekke = el('div', 'to-felter');
  beloebRaekke.append(krFelt, stjFelt);
  const visBeloeb = () => {
    krFelt.hidden = !(type === 'penge' || type === 'begge');
    stjFelt.hidden = !(type === 'stjerner' || type === 'begge');
    beloebRaekke.hidden = type === 'ingen';
  };
  visBeloeb();
  const ikon = ikonFelt(o);
  // Bonus: en opfordring (fx smage nye ting) – giver gerne stjerner, men tæller ikke som pligt
  let frivillig = !!o.frivillig;
  const bonusKnap = knap('⭐ Bonus – frivillig, tæller ikke som pligt', null, () => {
    frivillig = !frivillig; bonusKnap.setAttribute('aria-checked', frivillig);
  });
  bonusKnap.setAttribute('role', 'checkbox');
  bonusKnap.setAttribute('aria-checked', frivillig);
  let godkend = !!o.godkend;
  const godkendKnap = knap('👍 Mor/far godkender, før der gives stjerner/kr', null, () => {
    godkend = !godkend; godkendKnap.setAttribute('aria-checked', godkend);
  });
  godkendKnap.setAttribute('role', 'checkbox');
  godkendKnap.setAttribute('aria-checked', godkend);
  const bonusBoks = el('div', 'seg wrap tilpas-valg');
  bonusBoks.append(bonusKnap, godkendKnap);
  const typeValg = typer.length > 1 ? felt('Pligten giver', chipValg(typer, type, v => { type = v; visBeloeb(); }, v => BELOENNING_NAVN[v])) : '';

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const felter = {
      navn: n, gentag,
      dage: gentag === 'dag' && dagtype === 'dage' ? [...dage].sort((a, b) => a - b) : [],
      dagtype: gentag === 'dag' && DAGTYPER[dagtype] ? dagtype : null,
      interval: gentag === 'interval' ? interval : null,
      start: gentag === 'interval' ? (startInp.value || isoDato(new Date())) : null,
      regnFra: gentag === 'interval' ? regnFra : null,
      kr: type === 'penge' || type === 'begge' ? tal(krInp.value) : 0,
      stjerner: type === 'stjerner' || type === 'begge' ? Math.round(tal(stjInp.value)) : 0,
      frivillig, godkend,
      ...ikon.vaerdi()
    };
    if (ny) for (const b of (til === 'Begge' ? BOERN : [til])) await Data.add('opgaver', { ...felter, barn: b });
    else await Data.update('opgaver', o.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('opgaver', o.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny pligt' : 'Ret pligt', felt('Pligt', navn), tilMuligheder.length > 1 ? felt('Til', tilValg) : '',
    felt('Hvor tit', gentagValg), dagtypeBoks, dageBoks, intervalBoks, bonusBoks,
    el('p', 'hint', 'Bonus vises som en opfordring. Den kan give stjerner, men Alfie og streak kræver den ikke.'),
    typeValg, beloebRaekke, ikon.element, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

function redigerBeloenning(b) {
  const ny = !b.id;
  const navn = input('text', 'bel-navn', b.navn, 'Fx tur i biografen');
  let til = b.barn || 'Begge';
  const tilValg = chipValg(['Begge', ...BOERN], til, v => { til = v; }, v => (v === 'Begge' ? 'Begge drenge' : v));
  const stj = input('text', 'bel-stj', b.stjerner ? String(b.stjerner) : '', 'Fx 10');
  stj.inputMode = 'numeric';
  let engang = !!b.engang;
  const engangKnap = knap('🎯 Kun én gang (forsvinder, når den er godkendt)', null, () => {
    engang = !engang; engangKnap.setAttribute('aria-checked', engang);
  });
  engangKnap.setAttribute('role', 'checkbox');
  engangKnap.setAttribute('aria-checked', engang);
  const engangBoks = el('div', 'seg wrap');
  engangBoks.append(engangKnap);
  const ikon = ikonFelt(b);   // emoji eller billede, som på pligterne
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    const pris = Math.round(tal(stj.value));
    if (!n) { navn.focus(); return; }
    if (pris <= 0) { stj.focus(); return; }
    const felter = { navn: n, barn: til, stjerner: pris, engang, ...ikon.vaerdi() };
    if (ny) await Data.add('beloenninger', felter); else await Data.update('beloenninger', b.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('beloenninger', b.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny belønning' : 'Ret belønning', felt('Belønning', navn), felt('Til', tilValg), felt('Koster (stjerner)', stj),
    engangBoks, el('p', 'hint', 'Fx en ny LEGO-æske. Uden flueben kan belønningen ønskes igen og igen (fx vælge aftensmad).'), ikon.element, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// =====================================================================
// PAKKELISTER
// Data: 'pakkelister' {navn}   'pakkepunkter' {liste, tekst, hvem, pakket, kategori?}
// Kategori er valgfri: har mindst ét punkt en kategori, vises listen i grupper (fx Tøj, Toiletsager, Mad og drikke).
// En gruppe, hvor alt er pakket, foldes sammen (tryk for at åbne). Punkter uden kategori står under "Andet".
// =====================================================================
let pakValgt = lokal.get('pak-valgt') || '';
let pakFilter = 'Alle';
let pakNyHvem = 'Alle';
let pakNyKat = '';
const pakAabne = new Set();   // sammenfoldede (færdige) grupper, man har åbnet
const PAK_KAT_ORDEN = ['Tøj', 'Overtøj', 'Fodtøj', 'Toiletsager', 'Medicin', 'Papirer og penge', 'Til turen', 'Diverse', 'Sengetøj og bad', 'Køkken', 'Mad og drikke', 'Elektronik', 'Legetøj', 'Andet'];
const PAK_IKON = { 'Tøj': '👕', 'Overtøj': '🧥', 'Fodtøj': '🥾', 'Toiletsager': '🪥', 'Medicin': '💊', 'Papirer og penge': '🛂', 'Til turen': '🚗', 'Diverse': '🎒',
  'Sengetøj og bad': '🛏️', 'Køkken': '🍽️', 'Mad og drikke': '🥪', 'Elektronik': '🔌', 'Legetøj': '🧸', 'Andet': '📦' };
const pakIkon = k => PAK_IKON[k] || '📦';
// "Kun med når": ting, der kun skal med på bestemte ture (pakkepunkter.kun = ['Ski', …]). Listen husker, hvad der gælder
// denne gang (pakkelister.tur = ['Ski', 'Selv mad']). Ting uden "kun" er altid med; de andre skjules – slettes aldrig.
const PAK_TURE = ['Ski', 'Sol og strand', 'Selv mad', 'Lejet bolig', 'Bil', 'Fly', 'Udland'];
const PAK_TUR_IKON = { 'Ski': '⛷️', 'Selv mad': '🍳', 'Bil': '🚗', 'Fly': '✈️', 'Sol og strand': '☀️', 'Lejet bolig': '🏠', 'Udland': '🌍' };
// Gemte ture: pakkelister.ture = [{navn, tur: [...]}] – ét tryk vælger mærkerne (fx "Sommerhus weekend" = Selv mad + Bil)
const pakSammeTur = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const pakTurIkon = t => PAK_TUR_IKON[t] || '🏷️';
const pakMed = (p, l) => !(p.kun || []).length || p.kun.some(t => (l.tur || []).includes(t));
const pakTurtyper = punkter => { const brugt = new Set(punkter.flatMap(p => p.kun || [])); return [...PAK_TURE.filter(t => brugt.has(t)), ...[...brugt].filter(t => !PAK_TURE.includes(t)).sort()]; };
let pakNyKun = '';
// Kategorierne på en liste i fast rækkefølge (kendte først, så egne i den rækkefølge, de er brugt)
function pakKategorier(punkter) {
  const brugte = [...new Set(punkter.map(p => p.kategori || 'Andet'))];
  return brugte.sort((a, b) => (PAK_KAT_ORDEN.indexOf(a) + 1 || 99) - (PAK_KAT_ORDEN.indexOf(b) + 1 || 99) || (a === 'Andet') - (b === 'Andet'));
}
const pakForm = (() => {
  const form = el('form', 'tilfoj');
  const inp = el('input');
  inp.type = 'text'; inp.id = 'ny-pak'; inp.placeholder = 'Fx opladere'; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
  inp.setAttribute('aria-label', 'Tilføj til pakkelisten');
  form.append(inp, el('button', 'knap', 'Tilføj'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const tekst = inp.value.trim();
    if (!tekst || !pakValgt) return;
    inp.value = '';
    await Data.add('pakkepunkter', { liste: pakValgt, tekst, hvem: pakNyHvem === 'Alle' ? '' : pakNyHvem, pakket: false, ...(pakNyKat ? { kategori: pakNyKat } : {}), ...(pakNyKun ? { kun: [pakNyKun] } : {}) });
    tegnPakkelister();
    inp.focus();
  });
  return form;
})();

async function tegnPakkelister() {
  const boks = document.getElementById('pak-indhold');
  const lister = (await Data.list('pakkelister')).sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
  const punkter = await Data.list('pakkepunkter');
  const valgt = lister.find(l => l.id === pakValgt);

  if (!valgt) {
    const grid = el('div', 'pak-grid');
    for (const l of lister) {
      const mine = punkter.filter(p => p.liste === l.id && pakMed(p, l));
      const pakket = mine.filter(p => p.pakket).length;
      const k = knap('', 'kort pak-kort', () => {
        pakValgt = l.id; lokal.set('pak-valgt', l.id); pakFilter = 'Alle'; tegnPakkelister(); window.scrollTo(0, 0);
      });
      k.append(el('span', 'pak-navn', l.navn), el('span', 'under', pakket + ' af ' + mine.length + ' pakket'), fremskridt(mine.length ? pakket / mine.length : 0));
      grid.append(k);
    }
    if (!lister.length) grid.append(el('p', 'under', 'Ingen pakkelister endnu.'));
    boks.replaceChildren(grid, erVoksen() ? knap('Ny pakkeliste', 'knap bred-knap', () => navnPakkeliste({})) : '');
    opdaterTilbage();
    return;
  }

  const alle = punkter.filter(p => p.liste === valgt.id);
  const mine = alle.filter(p => pakMed(p, valgt));
  const skjult = alle.length - mine.length;
  const pakket = mine.filter(p => p.pakket).length;
  const titel = el('div', 'pak-titel');
  titel.append(el('h3', 'lille-titel', valgt.navn), el('span', 'under', pakket + ' af ' + mine.length + ' pakket'), fremskridt(mine.length ? pakket / mine.length : 0));
  // Denne tur: vælg hvad der gælder – ting med "kun med når" vises kun, når det er valgt
  const ture = pakTurtyper(alle);
  let turBoks = '';
  if (ture.length) {
    turBoks = el('div', 'pak-tur');
    const tur = valgt.tur || [];
    const seg = el('div', 'seg wrap');
    for (const t of ture) {
      const n = alle.filter(p => (p.kun || []).includes(t)).length;
      const b = knap(pakTurIkon(t) + ' ' + t + ' (' + n + ')', null, async () => {
        if (!erVoksen()) return;
        const ny = tur.includes(t) ? tur.filter(x => x !== t) : [...tur, t];
        await Data.update('pakkelister', valgt.id, { tur: ny }); tegnPakkelister();
      });
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', tur.includes(t));
      seg.append(b);
    }
    const gemte = valgt.ture || [];
    if (gemte.length) {
      const gs = el('div', 'seg wrap pak-gemte');
      for (const g of gemte) {
        const b = knap(g.navn, null, async () => { if (!erVoksen()) return; await Data.update('pakkelister', valgt.id, { tur: g.tur }); tegnPakkelister(); });
        b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', pakSammeTur(tur, g.tur || []));
        if (erVoksen()) langtTryk(b, () => holdValg(g.navn, { slet: async () => { await Data.update('pakkelister', valgt.id, { ture: gemte.filter(x => x !== g) }); tegnPakkelister(); } }));
        gs.append(b);
      }
      turBoks.append(el('p', 'seg-label', 'Vælg tur:'), gs);
    }
    const gemTur = erVoksen() && tur.length && !gemte.some(g => pakSammeTur(tur, g.tur || []))
      ? knap('+ Gem som tur …', 'link-knap pak-gem-tur', () => gemPakTur(valgt, tur)) : '';
    turBoks.append(el('p', 'seg-label', gemte.length ? 'Eller vælg selv:' : 'Denne tur:'), seg, gemTur,
      el('p', 'hint', skjult ? skjult + (skjult === 1 ? ' ting er skjult' : ' ting er skjult') + ' – de skal ikke med denne gang (de slettes ikke).' : 'Alt på listen er med denne gang.'));
  }

  const personer = ['Alle', ...PERSONER.filter(p => p !== 'Fælles' && mine.some(x => x.hvem === p))];
  if (!personer.includes(pakFilter)) pakFilter = 'Alle';
  const filter = personer.length > 1 ? valgSeg(personer, pakFilter, v => { pakFilter = v; tegnPakkelister(); }, v => (v === 'Alle' ? 'Alle' : v)) : '';

  const hvemValg = valgSeg(['Alle', ...PERSONER.filter(p => p !== 'Fælles')], pakNyHvem, v => { pakNyHvem = v; tegnPakkelister(); },
    v => (v === 'Alle' ? 'Fælles' : v), 'lille-seg pak-rul');

  const viste = mine.filter(p => pakFilter === 'Alle' || p.hvem === pakFilter)
    .sort((a, b) => Number(a.pakket) - Number(b.pakket) || a.tekst.localeCompare(b.tekst, 'da'));
  const punktLi = p => {
    const li = el('li', 'punkt' + (p.pakket ? ' faerdig' : ''));
    const b = el('button', 'punkt-knap');
    b.type = 'button';
    b.setAttribute('aria-pressed', !!p.pakket);
    const tjek = el('span', 'tjek');
    tjek.innerHTML = IKON_TJEK;
    const tb = el('span', 'tekst-boks');
    tb.append(el('span', 'tekst', p.tekst));
    if (p.hvem || (p.kun || []).length) {
      const tags = el('span', 'tags');
      if (p.hvem) tags.append(el('span', 'hvem-tag ' + (PK[p.hvem] || ''), p.hvem));
      for (const t of p.kun || []) tags.append(el('span', 'pak-kun-tag', pakTurIkon(t) + ' ' + t));
      tb.append(tags);
    }
    b.append(tjek, tb);
    if (erVoksen()) {
      b.addEventListener('click', async () => { await Data.update('pakkepunkter', p.id, { pakket: !p.pakket }); tegnPakkelister(); });
      // Hold fingeren på punktet = slet / ret (fra app.js)
      langtTryk(b, () => holdValg(p.tekst, { slet: async () => { await Data.remove('pakkepunkter', p.id); tegnPakkelister(); }, ret: () => redigerPakkepunkt(p) }));
    }
    const slet = knap('', 'slet', async () => { await Data.remove('pakkepunkter', p.id); tegnPakkelister(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + p.tekst);
    const mere = knap('', 'mere-knap', () => redigerPakkepunkt(p));
    mere.innerHTML = IKON_MERE;
    mere.setAttribute('aria-label', 'Ret ' + p.tekst);
    li.append(b);
    if (erVoksen()) li.append(mere, slet);
    return li;
  };
  const medKat = mine.some(p => p.kategori);
  const ul = el(medKat ? 'div' : 'ul', medKat ? 'pak-grupper' : 'liste');
  if (!medKat) viste.forEach(p => ul.append(punktLi(p)));
  else for (const k of pakKategorier(mine)) {
    const iGruppe = viste.filter(p => (p.kategori || 'Andet') === k);
    if (!iGruppe.length) continue;
    const n = iGruppe.filter(p => p.pakket).length, alt = n === iGruppe.length;
    const noegle = valgt.id + '|' + k, aaben = !alt || pakAabne.has(noegle);
    const hoved = knap('', 'pak-gruppe-hoved' + (alt ? ' faerdig' : ''), () => { if (!alt) return; pakAabne.has(noegle) ? pakAabne.delete(noegle) : pakAabne.add(noegle); tegnPakkelister(); });
    hoved.setAttribute('aria-expanded', aaben);
    hoved.append(el('b', null, pakIkon(k) + ' ' + k), el('span', null, alt ? '✓ alt pakket' : n + ' af ' + iGruppe.length));
    const gl = el('ul', 'liste');
    if (aaben) iGruppe.forEach(p => gl.append(punktLi(p)));
    ul.append(hoved);
    if (aaben) ul.append(gl);
  }
  if (!viste.length) ul.append(el(medKat ? 'p' : 'li', 'tom', 'Intet på listen endnu'));

  const fod = el('div', 'pak-fod');
  fod.append(
    bekraeftKnap('Start forfra', 'starte forfra', 'lille-knap', async () => {
      for (const p of alle.filter(p => p.pakket)) await Data.update('pakkepunkter', p.id, { pakket: false });
      tegnPakkelister();
    }),
    knap('Omdøb', 'lille-knap', () => navnPakkeliste(valgt)),
    knap('Kopiér', 'lille-knap', () => kopierPakkeliste(valgt, alle)),
    bekraeftKnap('Slet liste', 'slette', 'lille-knap fare-knap', async () => {
      await Data.removeMange('pakkepunkter', alle.map(p => p.id));
      await Data.remove('pakkelister', valgt.id);
      pakValgt = ''; lokal.set('pak-valgt', '');
      tegnPakkelister();
    })
  );

  const nyLabel = el('p', 'seg-label', 'Ny ting er til:');
  const kats = medKat ? pakKategorier(mine).filter(k => k !== 'Andet') : [];
  if (pakNyKat && !kats.includes(pakNyKat)) pakNyKat = '';
  const katValg = kats.length ? valgSeg(['', ...kats], pakNyKat, v => { pakNyKat = v; tegnPakkelister(); }, v => (v ? pakIkon(v) + ' ' + v : 'Ingen'), 'lille-seg pak-rul') : '';
  const katLabel = katValg ? el('p', 'seg-label', 'Kategori:') : '';
  if (pakNyKun && !ture.includes(pakNyKun)) pakNyKun = '';
  const kunValg = ture.length ? valgSeg(['', ...ture], pakNyKun, v => { pakNyKun = v; tegnPakkelister(); }, v => (v ? pakTurIkon(v) + ' ' + v : 'Altid'), 'lille-seg pak-rul') : '';
  const kunLabel = kunValg ? el('p', 'seg-label', 'Kun med når:') : '';
  const visLabel = filter ? el('p', 'seg-label', 'Vis:') : '';
  if (!erVoksen()) boks.replaceChildren(titel, turBoks, visLabel, filter, ul);
  else boks.replaceChildren(titel, turBoks, pakForm, nyLabel, hvemValg, katLabel, katValg, kunLabel, kunValg, visLabel, filter, ul, fod);
  opdaterTilbage();   // fra app.js – tilbage-knappen bliver til "Alle pakkelister"
}

// Ret et punkt på en pakkeliste: tekst og hvem det er til
function redigerPakkepunkt(p) {
  const tekst = input('text', 'pak-tekst', p.tekst);
  let hvem = p.hvem || '';
  const hvemValg = chipValg(['', ...PERSONER.filter(x => x !== 'Fælles')], hvem, v => { hvem = v; }, v => v || 'Fælles');
  let kat = p.kategori || '';
  const paaListen = Data.listNu('pakkepunkter').filter(x => x.liste === p.liste && x.kategori).map(x => x.kategori);
  const kats = [...new Set([...pakKategorier(paaListen.map(k => ({ kategori: k }))), ...PAK_KAT_ORDEN.filter(k => k !== 'Andet')])];
  const nyKat = input('text', 'pak-ny-kat', '', 'eller skriv en ny');
  const katValg = chipValg(['', ...kats], kat, v => { kat = v; nyKat.value = ''; }, v => (v ? pakIkon(v) + ' ' + v : 'Ingen'));
  // Kun med når … (flere kan vælges – ingen = altid med)
  const kun = new Set(p.kun || []);
  const ture = [...new Set([...PAK_TURE, ...pakTurtyper(Data.listNu('pakkepunkter').filter(x => x.liste === p.liste))])];
  const kunSeg = el('div', 'seg wrap');
  for (const t of ture) {
    const b = knap(pakTurIkon(t) + ' ' + t, null, () => { kun.has(t) ? kun.delete(t) : kun.add(t); b.setAttribute('aria-checked', kun.has(t)); });
    b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', kun.has(t));
    kunSeg.append(b);
  }
  const nyKun = input('text', 'pak-ny-kun', '', 'eller skriv en ny, fx Camping');
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    if (nyKun.value.trim()) kun.add(nyKun.value.trim());
    await Data.update('pakkepunkter', p.id, { tekst: t, hvem, kategori: nyKat.value.trim() || kat || null, kun: kun.size ? [...kun] : null });
    lukArk(); tegnPakkelister();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('pakkepunkter', p.id); lukArk(); tegnPakkelister(); }), gem);
  aabnArk('Ret', felt('Hvad skal med?', tekst), felt('Til', hvemValg), el('label', 'felt-label', 'Kategori'), katValg, nyKat,
    el('label', 'felt-label', 'Kun med når'), kunSeg, nyKun, el('p', 'hint', 'Intet valgt = skal altid med.'), knapper);
}

// Gem de valgte mærker som en tur med navn (fx "Sommerferie – kør selv")
function gemPakTur(l, tur) {
  const navn = input('text', 'pak-tur-navn', '', 'Fx Sommerhus weekend');
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    await Data.update('pakkelister', l.id, { ture: [...(l.ture || []).filter(g => g.navn !== n), { navn: n, tur }] });
    lukArk(); tegnPakkelister();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(gem);
  aabnArk('Gem som tur', felt('Navn', navn), el('p', 'hint', 'Mærker: ' + tur.map(t => pakTurIkon(t) + ' ' + t).join(', ') + '. Hold fingeren på en gemt tur for at slette den.'), knapper);
  setTimeout(() => navn.focus(), 50);
}

// Kopiér en pakkeliste (alle ting, kategorier, hvem og "kun med når" – uden flueben)
function kopierPakkeliste(l, punkter) {
  const navn = input('text', 'pakliste-kopi', l.navn + ' (kopi)');
  const gem = knap('Kopiér', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const ny = await Data.add('pakkelister', { navn: n, ...(l.tur ? { tur: l.tur } : {}), ...(l.ture ? { ture: l.ture } : {}) });
    await Data.addMange('pakkepunkter', punkter.map(p => ({ liste: ny.id, tekst: p.tekst, hvem: p.hvem || '', pakket: false,
      ...(p.kategori ? { kategori: p.kategori } : {}), ...((p.kun || []).length ? { kun: p.kun } : {}) })));
    pakValgt = ny.id; lokal.set('pak-valgt', ny.id);
    lukArk(); tegnPakkelister(); visStatus('Kopieret: ' + n);
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(gem);
  aabnArk('Kopiér pakkeliste', felt('Navn på kopien', navn), el('p', 'hint', 'Alle ' + punkter.length + ' ting kommer med – uden flueben.'), knapper);
  setTimeout(() => navn.select(), 50);
}

function navnPakkeliste(l) {
  const ny = !l.id;
  const navn = input('text', 'pakliste-navn', l.navn, 'Fx weekend hos mormor');
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    if (ny) { const nyL = await Data.add('pakkelister', { navn: n }); pakValgt = nyL.id; lokal.set('pak-valgt', nyL.id); }
    else await Data.update('pakkelister', l.id, { navn: n });
    lukArk(); tegnPakkelister();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(gem);
  aabnArk(ny ? 'Ny pakkeliste' : 'Omdøb pakkeliste', felt('Navn', navn), knapper);
  setTimeout(() => navn.focus(), 50);
}

// =====================================================================
// UGENS KONKURRENCE – hvem cykler eller går længst
// Data: 'motion' {hvem, dato, km, type: 'cykel'|'gaa'}
// =====================================================================
const DELTAGERE = ['Timmo', 'Winnie', 'Oliver', 'Villads'];
const MOTION_NAVN = { cykel: 'Cykel', gaa: 'Gå', samlet: 'Samlet' };
let konkUge = 0;
let konkType = ['cykel', 'gaa', 'samlet'].includes(lokal.get('konk-type')) ? lokal.get('konk-type') : 'samlet';
let konkHvem = null;
let konkNyType = 'cykel';
let konkDag = 'idag';   // 'idag' | 'igaar' | 'anden' (så vises en dato)
let konkDele = null;     // fast opbygning, så indtastningsfeltet ikke flyttes, mens man skriver
function konkValgtDag() {
  const d = new Date();
  if (konkDag === 'igaar') d.setDate(d.getDate() - 1);
  if (konkDag === 'anden' && konkForm.dato.value) return konkForm.dato.value;
  return isoDato(d);
}
const fmtKm = n => n.toLocaleString('da-DK', { maximumFractionDigits: 1 }) + ' km';

const konkForm = (() => {
  const form = el('form', 'konk-form');
  const km = el('input');
  km.type = 'text'; km.id = 'konk-km'; km.placeholder = 'Km'; km.inputMode = 'decimal'; km.autocomplete = 'off';
  km.setAttribute('aria-label', 'Kilometer');
  const dato = el('input');
  dato.type = 'date'; dato.id = 'konk-dato';
  dato.setAttribute('aria-label', 'Dato');
  dato.hidden = true;
  const raekke = el('div', 'konk-felter');
  raekke.append(km, el('button', 'knap', 'Tilføj'));
  const besked = el('p', 'konk-besked');
  besked.setAttribute('aria-live', 'polite');
  besked.hidden = true;
  form.append(raekke, dato, besked);
  km.addEventListener('input', () => { besked.hidden = true; });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const dag = konkValgtDag();
    const alle = await Data.list('motion');
    const dagSum = sum(alle.filter(m => m.hvem === konkHvem && m.dato === dag && m.type === konkNyType), 'km');
    const svar = kmTjek(km.value, konkNyType, dagSum, konkHvem, dag);
    if (!svar.ok) { visKonkBesked(svar.tekst, 'advar'); return; }
    const v = tal(km.value);
    const foer = ugeFoerer(alle, dag);
    const gemt = await Data.add('motion', { hvem: konkHvem, dato: dag, km: v, type: konkNyType });
    if (!gemt) return;   // børnelåsen sagde nej (besked vises allerede)
    km.value = '';
    km.blur();   // lukker tastaturet, så siden (og bundmenuen) falder på plads
    const efter = ugeFoerer([...alle, { hvem: konkHvem, dato: dag, km: v, type: konkNyType }], dag);
    let tekst = svar.tekst;
    if (efter === konkHvem && foer !== konkHvem && isoDato(mandagDenneUge()) <= dag) {
      tekst += konkHvem === Data.bruger()?.navn ? ' Og du fører nu ugens konkurrence! 🥇' : ' Og ' + konkHvem + ' fører nu ugens konkurrence! 🥇';
    }
    visKonkBesked(tekst, 'god');
    tegnKonkurrence();
  });
  function visKonkBesked(tekst, slags) {
    besked.textContent = tekst;
    besked.className = 'konk-besked ' + slags;
    besked.hidden = false;
  }
  return { form, km, dato };
})();

// Hvem fører samlet i den uge, datoen ligger i (null hvis ingen km)
function ugeFoerer(alle, iso) {
  const d = new Date(iso + 'T00:00');
  const man = new Date(d); man.setDate(d.getDate() - (d.getDay() + 6) % 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  return ugeVinder(alle, isoDato(man), isoDato(son), 'samlet')?.hvem || null;
}

// Realistiske km: højst så meget pr. person pr. dag (børnenes grænse håndhæves også i databasen)
const KM_GRAENSE = { barn: { cykel: 50, gaa: 25 }, voksen: { cykel: 200, gaa: 60 } };
const tilfaeldig = liste => liste[Math.floor(Math.random() * liste.length)];
// Tjekker en indtastning og finder en (gerne sjov) bemærkning: { ok, tekst }
function kmTjek(tekst, type, dagSum, hvem, dato) {
  const raa = String(tekst || '').trim();
  const km = tal(raa);
  const idag = isoDato(new Date());
  if (!raa || !/^-?\d+([.,]\d+)?$/.test(raa)) return { ok: false, tekst: 'Skriv antal km som et tal – fx 3,5 🙂' };
  if (km <= 0) return { ok: false, tekst: tilfaeldig(['0 km? Sofaen tæller desværre ikke 🛋️', 'Baglæns tæller ikke 😄 Skriv et tal over 0.']) };
  if (dato > idag) return { ok: false, tekst: 'En tur i fremtiden? Skriv den ind, når du har været af sted 🔮' };
  const barn = BOERN.includes(hvem);
  if (barn && dageMellem(dato, idag) > 14) return { ok: false, tekst: 'Det er lidt længe siden – bed en voksen om at skrive den ind 📅' };
  const graense = KM_GRAENSE[barn ? 'barn' : 'voksen'][type];
  const cykel = type === 'cykel';
  if (km + dagSum > graense) {
    let t;
    if (km >= 40000) t = 'Jorden rundt på én dag?! 🌍 Så skal du have raketsko på.';
    else if (km >= 1000) t = 'Det er længere end fra Skagen til Gedser – og hjem igen! 😄';
    else if (km >= 300) t = 'Så har du næsten krydset hele Danmark 🇩🇰 Lidt vildt til én dag.';
    else t = cykel ? tilfaeldig(['Hov, har du lånt en motorcykel? 🏍️', 'Var der raketmotor på cyklen? 🚀', 'Tour de France-rytterne er misundelige 😄'])
      : tilfaeldig(['Har du gået i syvmilestøvler? 👢', 'Wow, gik du hele vejen til Tyskland? 🥾', 'Dine fødder ringede – de vil hjem 😄']);
    t += ' Højst ' + graense + ' km ' + (cykel ? 'på cykel' : 'gang') + ' pr. dag' + (dagSum > 0 ? ' (der står allerede ' + fmtKm(dagSum) + ')' : '') + '.';
    return { ok: false, tekst: t };
  }
  let t;
  if (km < 1) t = tilfaeldig(['Hver meter tæller! 🐌', 'Lille tur – stor ære 🐜', 'Godt begyndt er halvt fuldendt 👍']);
  else if (km < 3) t = tilfaeldig(['Fint stykke! Alfie hopper anerkendende 🐰', 'Godt gået – benene siger tak 🦵', 'Sådan! Frisk luft er gratis 🌬️']);
  else if (km < 10) t = tilfaeldig(['Flot tur! 💪', 'Sådan! Pulsen siger tak ❤️', 'Godt kørt – sofaen må vente 😎']);
  else if (km < 25) t = tilfaeldig(['Wow, det er en rigtig langtur! 🚀', 'Er du træt? Det må du gerne være 😅', 'Imponerende! Husk at drikke vand 💧']);
  else t = cykel ? tilfaeldig(['Tour de France næste? 🏆', 'Det er jo en hel ekspedition! 🗺️']) : tilfaeldig(['Det er jo en hel vandretur! 🥾', 'Maratonløbere kan godt gå hjem 😄']);
  return { ok: true, tekst: t };
}

function ugeVinder(alle, manIso, sonIso, type) {
  const ugens = alle.filter(m => m.dato >= manIso && m.dato <= sonIso && (type === 'samlet' || m.type === type));
  let bedst = null;
  for (const p of DELTAGERE) {
    const km = sum(ugens.filter(m => m.hvem === p), 'km');
    if (km > 0 && (!bedst || km > bedst.km)) bedst = { hvem: p, km };
  }
  return bedst;
}

async function tegnKonkurrence() {
  const boks = document.getElementById('konk-indhold');
  if (!konkHvem) konkHvem = DELTAGERE.includes(Data.bruger()?.navn) ? Data.bruger().navn : DELTAGERE[0];
  if (loggetIndBarn()) konkHvem = loggetIndBarn();   // børn skriver kun egne km
  const man = mandagDenneUge();
  man.setDate(man.getDate() + konkUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  const manIso = isoDato(man), sonIso = isoDato(son);
  const alle = await Data.list('motion');
  const ugens = alle.filter(m => m.dato >= manIso && m.dato <= sonIso);

  // Uge-navigation
  const nav = el('div', 'kal-nav');
  const titel = el('div', 'kal-titel');
  titel.append(el('strong', null, 'Uge ' + ugenummer(man) + ' · ' + ugeSpan(man)));
  if (konkUge !== 0) titel.append(knap('Til denne uge', 'lille-knap', () => { konkUge = 0; tegnKonkurrence(); }));
  const forrige = knap('‹', 'pil', () => { konkUge--; tegnKonkurrence(); });
  forrige.setAttribute('aria-label', 'Forrige uge');
  const naeste = knap('›', 'pil', () => { konkUge++; tegnKonkurrence(); });
  naeste.setAttribute('aria-label', 'Næste uge');
  nav.append(forrige, titel, naeste);

  const typeValg = valgSeg(['cykel', 'gaa', 'samlet'], konkType, v => { konkType = v; lokal.set('konk-type', v); tegnKonkurrence(); }, v => MOTION_NAVN[v]);

  // Stilling
  const stilling = DELTAGERE.map(p => ({
    hvem: p, km: sum(ugens.filter(m => m.hvem === p && (konkType === 'samlet' || m.type === konkType)), 'km')
  })).sort((a, b) => b.km - a.km);
  const max = Math.max(...stilling.map(s => s.km), 0);
  const ol = el('ol', 'konk-liste');
  stilling.forEach((s, i) => {
    const plads = s.km > 0 ? (i === 0 || s.km < stilling[i - 1].km ? i + 1 : null) : null;
    const li = el('li', 'konk-raekke ' + PK[s.hvem] + (plads === 1 ? ' foerer' : ''));
    const bar = el('span', 'konk-bar');
    const fyld = el('span');
    fyld.style.width = (max ? Math.round(s.km / max * 100) : 0) + '%';
    bar.append(fyld);
    li.append(el('span', 'konk-plads', s.km > 0 ? (plads ? plads + '.' : '') : '–'), el('span', 'konk-navn', s.hvem), bar, el('span', 'konk-km', fmtKm(s.km)));
    ol.append(li);
  });
  const status = max === 0 ? el('p', 'hint', 'Ingen kilometer i denne uge endnu.')
    : el('p', 'konk-status', (konkUge === 0 ? 'Fører lige nu: ' : 'Vinder: ') + stilling[0].hvem + ' med ' + fmtKm(stilling[0].km));

  // Tilføj tur (kun knapperne tegnes om – selve feltet bliver stående)
  const idagIso = isoDato(new Date());
  konkForm.dato.max = idagIso;
  if (!konkForm.dato.value) konkForm.dato.value = idagIso;
  konkForm.dato.hidden = konkDag !== 'anden';
  if (!konkDele) {
    konkDele = { top: el('div'), valg: el('div', 'konk-valg'), tilfoej: el('div', 'kort konk-tilfoej'), bund: el('div') };
    konkDele.tilfoej.append(el('span', 'kort-label', 'Tilføj en tur'), konkDele.valg, konkForm.form);
  }
  konkDele.valg.replaceChildren(
    loggetIndBarn() ? '' : valgSeg(DELTAGERE, konkHvem, v => { konkHvem = v; tegnKonkurrence(); }, v => v, 'wrap lille-seg'),
    valgSeg(['cykel', 'gaa'], konkNyType, v => { konkNyType = v; tegnKonkurrence(); }, v => (v === 'cykel' ? 'Cyklet' : 'Gået'), 'lille-seg'),
    valgSeg(['idag', 'igaar', 'anden'], konkDag, v => { konkDag = v; tegnKonkurrence(); },
      v => ({ idag: 'I dag', igaar: 'I går', anden: konkDag === 'anden' ? '📅 Dato:' : '📅 Anden dag' })[v], 'lille-seg')
  );

  // Ugens ture
  const ture = el('ul', 'historik');
  for (const m of [...ugens].sort((a, b) => b.dato.localeCompare(a.dato))) {
    const li = el('li', PK[m.hvem]);
    const slet = knap('', 'slet', async () => { await Data.remove('motion', m.id); tegnKonkurrence(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet tur');
    li.append(el('span', 'h-dato', kortDato(m.dato)), el('span', 'h-tekst', m.hvem + ' · ' + (m.type === 'cykel' ? 'cyklet' : 'gået')), el('span', 'h-vaerdi', fmtKm(tal(m.km))),
      erVoksen() || m.hvem === loggetIndBarn() ? slet : '');
    ture.append(li);
  }

  // Tidligere vindere
  const vindere = el('ul', 'historik');
  for (let i = 1; i <= 8; i++) {
    const m = new Date(man); m.setDate(m.getDate() - i * 7);
    const s = new Date(m); s.setDate(m.getDate() + 6);
    const v = ugeVinder(alle, isoDato(m), isoDato(s), konkType);
    if (!v) continue;
    const li = el('li', PK[v.hvem]);
    li.append(el('span', 'h-dato', 'Uge ' + ugenummer(m)), el('span', 'h-tekst', v.hvem), el('span', 'h-vaerdi', fmtKm(v.km)));
    vindere.append(li);
  }

  const bund = [];
  if (ugens.length) bund.push(el('h3', 'lille-titel', 'Ugens ture'), ture);
  if (vindere.children.length) bund.push(el('h3', 'lille-titel', 'Tidligere vindere (' + MOTION_NAVN[konkType].toLowerCase() + ')'), vindere);
  konkDele.top.replaceChildren(nav, typeValg, ol, status);
  konkDele.bund.replaceChildren(...bund);
  if (konkDele.top.parentNode !== boks) boks.replaceChildren(konkDele.top, konkDele.tilfoej, konkDele.bund);
}

// =====================================================================
// Startindhold – lægges ind én gang (eksempler som kan rettes og slettes)
// =====================================================================
async function laegMereStartInd() {
  const indst = await Data.list('indstillinger');
  const harGjort = noegle => indst.some(x => x.noegle === noegle);

  if (!harGjort('start-pakkelister') && !(await Data.list('pakkelister')).length) {
    await Data.add('indstillinger', { noegle: 'start-pakkelister', vaerdi: '1' });
    const eksempler = {
      'Weekend i sommerhuset': ['Sengetøj', 'Håndklæder', 'Opladere', 'Mad til første aften', 'Regntøj', 'Gummistøvler', 'Spil og bøger', 'Hø og foder til Alfie'],
      'Sommerferie': ['Tøj', 'Badetøj', 'Solcreme', 'Solbriller', 'Toilettaske', 'Opladere', 'Pas', 'Sygesikringskort', 'Snacks til turen', 'Hovedtelefoner']
    };
    for (const [navn, ting] of Object.entries(eksempler)) {
      const l = await Data.add('pakkelister', { navn });
      await Data.addMange('pakkepunkter', ting.map(tekst => ({ liste: l.id, tekst, hvem: '', pakket: false })));
    }
  }

  if (erVoksen() && !harGjort('start-rutiner') && !(await Data.list('rutiner')).length) {
    await Data.add('indstillinger', { noegle: 'start-rutiner', vaerdi: '1' });
    const rutiner = [];
    for (const barn of BOERN) {
      rutiner.push(
        { barn, navn: 'Børste tænder', tid: '07:15', dage: [], trin: [
          { tekst: 'Tag tandbørsten', soeg: 'toothbrush' }, { tekst: 'Tandpasta på', soeg: 'toothpaste' },
          { tekst: 'Børst i 2 minutter', soeg: 'brush teeth' }, { tekst: 'Skyl munden', soeg: 'rinse' }] },
        { barn, navn: 'Sengetid', tid: '20:00', dage: [], trin: [
          { tekst: 'Nattøj på', soeg: 'pajamas' }, { tekst: 'Børst tænder', soeg: 'brush teeth' },
          { tekst: 'Tisse', soeg: 'toilet' }, { tekst: 'Læse lidt', soeg: 'read' }, { tekst: 'Sov godt', soeg: 'sleep' }] }
      );
    }
    await Data.addMange('rutiner', rutiner);
  }

  // Opgaver og belønninger kan kun voksne lægge ind
  if (erVoksen() && !harGjort('start-pligter') && !(await Data.list('opgaver')).length) {
    await Data.add('indstillinger', { noegle: 'start-pligter', vaerdi: '1' });
    const opgaver = [];
    for (const barn of BOERN) {
      opgaver.push(
        { barn, navn: 'Tøm opvaskemaskinen', gentag: 'dag', dage: [], kr: 5, stjerner: 0 },
        { barn, navn: 'Giv Alfie mad og vand', gentag: 'dag', dage: [], kr: 3, stjerner: 0 },
        { barn, navn: 'Ryd op på værelset', gentag: 'uge', dage: [], kr: 20, stjerner: 0 }
      );
    }
    opgaver.push(
      { barn: 'Villads', navn: 'Læs i 15 minutter', gentag: 'dag', dage: [], kr: 0, stjerner: 1 },
      { barn: 'Villads', navn: 'Klar til skole til tiden', gentag: 'dag', dage: [0, 1, 2, 3, 4], kr: 0, stjerner: 1 }
    );
    await Data.addMange('opgaver', opgaver);
    await Data.addMange('beloenninger', [
      { barn: 'Begge', navn: 'Vælg aftensmaden', stjerner: 5 },
      { barn: 'Begge', navn: '30 minutters ekstra skærmtid', stjerner: 10 },
      { barn: 'Begge', navn: 'Tur i biografen', stjerner: 30 }
    ]);
  }
}
