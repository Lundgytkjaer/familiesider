// mere.js – siderne under "Mere": Pligter og stjerner, Pakkelister og Ugens konkurrence.
// Bruger de fælles hjælpere fra app.js (el, knap, input, felt, chipValg, aabnArk, bekraeft ...).
// Data går som altid gennem Data (data.js).

const erVoksen = () => Data.bruger()?.rolle === 'voksen';
const loggetIndBarn = () => {
  const p = Data.bruger();
  return p && p.rolle === 'barn' && BOERN.includes(p.navn) ? p.navn : null;
};
const tal = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const sum = (liste, felt) => liste.reduce((s, x) => s + (Number(x[felt]) || 0), 0);
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
function ikonBillede(x, klasse = 'lille-ikon') {
  const url = x.piktogram ? PIKTO_URL(x.piktogram) : x.billede || '';
  if (!url) return '';
  const img = el('img', klasse);
  img.src = url; img.alt = ''; img.loading = 'lazy';
  return img;
}
// Fold-ud-felt med billedvælgeren. Samme element kan sættes ind igen, når panelet tegnes om.
function ikonFelt(start) {
  const vaelger = billedVaelger(start);
  const boks = el('details', 'ikon-felt');
  const titel = el('summary');
  titel.append(el('span', null, 'Lille billede (valgfrit)'));
  const vis = ikonBillede(start);
  if (vis) titel.append(vis);
  boks.append(titel, ...vaelger.dele);
  return { element: boks, vaerdi: vaelger.vaerdi };
}

// Kort til drengenes tavle
async function rutineKort(barn, dato) {
  const dag = (dato.getDay() + 6) % 7;
  const iso = isoDato(dato);
  const rutiner = (await Data.list('rutiner')).filter(r => r.barn === barn && rutineAktiv(r, dag))
    .sort((a, b) => (a.tid || '').localeCompare(b.tid || ''));
  if (!rutiner.length) return null;
  const nu = new Date();
  const nuMin = nu.getHours() * 60 + nu.getMinutes();
  const tilMin = t => { const [h, mm] = (t || '').split(':').map(Number); return isNaN(h) ? 24 * 60 : h * 60 + (mm || 0); };
  const erIdag = iso === isoDato(nu);
  // Den næste rutine i dag: den første der ikke er færdig og ikke er mere end en time over tiden
  const naeste = erIdag ? rutiner.find(r => hentTjek(r, iso).size < (r.trin || []).length && tilMin(r.tid) >= nuMin - 60) : null;

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
    b.append(el('span', 'rutine-tid', visTid(r.tid) || ''), info,
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
  const nuR = erIdag ? rutiner.filter(r => r.tid && tilMin(r.tid) - 15 <= nuMin && nuMin - tilMin(r.tid) <= 45).pop() : null;
  const naesteR = rutiner.find(r => !erIdag || !r.tid || tilMin(r.tid) - 15 > nuMin);
  const antalTrin = r => (r.trin || []).length;
  if (nuR) Object.assign(t, { stor: 'Nu: ' + nuR.navn, lille: (r => r ? 'Bagefter: ' + r.navn + ' ' + visTid(r.tid)
    : antalTrin(nuR) ? antalTrin(nuR) + ' trin – tryk for at se dem' : 'Kl. ' + visTid(nuR.tid))(rutiner.find(r => r !== nuR && tilMin(r.tid) > tilMin(nuR.tid))) });
  else if (naesteR) Object.assign(t, { stor: naesteR.navn, lille: [visTid(naesteR.tid), erIdag && naesteR.tid ? omTekst(tilMin(naesteR.tid) - nuMin) : ''].filter(Boolean).join(' · ') });
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
  aabnArk(r.navn + (r.tid ? ' · ' + visTid(r.tid) : ''), status, grid,
    trin.some(t => t.piktogram || t.soeg) ? el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA') : '', knapper);
}

// Siden "Rutiner" under Mere
async function tegnRutiner() {
  const boks = document.getElementById('rutiner-indhold');
  const laast = loggetIndBarn();
  if (laast) rutineBarn = laast;
  const barn = rutineBarn;
  const rutiner = (await Data.list('rutiner')).filter(r => r.barn === barn).sort((a, b) => (a.tid || '').localeCompare(b.tid || ''));
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
    const dage = !r.dage || !r.dage.length || r.dage.length === 7 ? 'Hver dag' : r.dage.map(i => DAGE[i]).join(', ');
    const info = el('span', 'rutine-info');
    const rNavn = el('span', 'rutine-navn');
    rNavn.append(ikonBillede(r), r.navn);
    info.append(rNavn, el('span', 'ret-under', dage + ' · ' + (r.trin || []).length + ' trin'), strip);
    b.append(el('span', 'rutine-tid', visTid(r.tid) || ''), info, el('span', 'm-pil', '›'));
    li.append(b);
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

    const to = el('div', 'to-felter');
    to.append(felt('Navn', navn), felt('Tidspunkt', tid));
    const gem = knap('Gem', 'knap', async () => {
      if (!s.navn.trim()) { navn.focus(); return; }
      const felter = {
        navn: s.navn.trim(), tid: s.tid, dage: [...s.dage].sort((a, b) => a - b), ...ikon.vaerdi(),
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
    aabnArk(ny ? 'Ny rutine' : 'Ret rutine', to, felt('Til', tilValg), el('label', 'felt-label', 'Dage'), dageBoks,
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
  return r ? { kr: !!r.kr, stjerner: !!r.stjerner, streakBonus: r.streakBonus ?? 1, joker: r.joker !== false } : { kr: barn, stjerner: barn, streakBonus: 1, joker: true };
}
async function saetRegel(navn, felt, vaerdi) {
  const r = (await Data.list('personregler')).find(x => x.navn === navn);
  if (r) await Data.update('personregler', r.id, { [felt]: vaerdi });
  else await Data.add('personregler', { ...(await regelFor(navn)), navn, [felt]: vaerdi });
}

async function pligtData(barn) {
  const [opgaver, flueben, beloenninger, indl, udb, just, bonus, jokere, ekstra] = await Promise.all(
    ['opgaver', 'flueben', 'beloenninger', 'indloesninger', 'udbetalinger', 'justeringer', 'streakbonus', 'streakjoker', 'ekstra'].map(l => Data.list(l)));
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
    just: mineJust.filter(x => x.type !== 'streak'),   // + / − stjerner og kr fra en voksen
    streakAnker: mineJust.filter(x => x.type === 'streak').sort((a, b) => (a.oprettet || '').localeCompare(b.oprettet || '')).pop() || null,
    regel: await regelFor(barn),
    barn,
    kalender: await Data.list('kalender')   // bruges til sygedage (bryder ikke streak)
  };
}

function saldo(d) {
  const man = isoDato(mandagDenneUge());
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
function dagensOpgaver(d) {
  const nu = new Date();
  const iso = isoDato(nu), dag = idagNr(), man = isoDato(mandagDenneUge());
  const res = [];
  for (const o of d.opgaver) {
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
      if (o.dage && o.dage.length && !o.dage.includes(dag)) continue;
      periode = iso;
    }
    const f = d.flueben.find(x => x.opgave === o.id && x.periode === periode);
    if (o.gentag === 'engang' && f && f.dato !== iso) continue;   // klaret en tidligere dag
    res.push({ o, periode, f });
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

async function skiftFlueben(barn, r, regel) {
  if (r.f) await Data.remove('flueben', r.f.id);
  else await Data.add('flueben', {
    opgave: r.o.id, barn, periode: r.periode, dato: isoDato(new Date()), navn: r.o.navn,
    kr: regel.kr ? tal(r.o.kr) : 0,
    stjerner: regel.stjerner ? Math.round(tal(r.o.stjerner)) : 0
  });
  const bonus = await opdaterStreakBonus(barn);   // fra sjov.js – giver/tager streak-bonus
  let fejret = false;
  if (!r.f) {
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
  if (r.o.gentag === 'uge') tags.append(el('span', null, 'Én gang om ugen'));
  if (r.o.gentag === 'engang') tags.append(el('span', null, 'Én gang'));
  if (r.o.gentag === 'interval') tags.append(el('span', null, intervalTekst(r.o)));
  if (r.overTid > 0) tags.append(el('span', 'over-tid', r.overTid === 1 ? '1 dag over tid' : r.overTid + ' dage over tid'));
  if (tags.children.length) tb.append(tags);
  b.append(tjek, ikonBillede(r.o, 'lille-ikon opg-ikon'), tb);
  b.addEventListener('click', () => skiftFlueben(barn, r, regel));
  li.append(b);
  if (r.o.frivillig && !r.f) li.append(knap('Ikke i dag', 'lille-knap spring-knap', () => springOver(barn, r)));
  return li;
}

// Kort med dagens pligter – bruges på drengenes tavle og som "Mine pligter" på de voksnes I dag
// Linjen om streak-bonus på pligt-kortet (lokker, forklarer eller fejrer)
function bonusLinje(bs) {
  if (!bs.n) return null;
  if (bs.givet) return el('p', 'bonus-linje givet', (bs.givet.milepael ? '🏅 ' + bs.givet.milepael + ' dage i træk! ' : '🔥 Streak-bonus i dag: ') + '+★ ' + bs.givet.stjerner);
  if (bs.joker) return el('p', 'bonus-linje joker', '🃏 Du glemte en dag – klar alle pligter i dag, så redder jokeren din streak (+★ ' + (bs.n + bs.milepael) + ')');
  if (bs.mulig) return el('p', 'bonus-linje', bs.milepael
    ? '🏅 Klar alt i dag = ' + bs.naeste + ' dage i træk og +★ ' + (bs.n + bs.milepael) + '!'
    : '🔥 Klar alle dine pligter i dag = +★ ' + bs.n + ' i streak-bonus');
  if (bs.starter) return el('p', 'bonus-linje start', bs.klaretIdag ? '🔥 Godt! Klar alt i morgen også = +★ ' + bs.n : '🔥 Klar alt i dag og i morgen – så giver hver dag i træk +★ ' + bs.n);
  return null;
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
  k.append(top, ul);
  // Streak-bonus: lok med den, og vis den, når den er givet
  const bs = d.regel.stjerner ? bonusStatus(d) : { n: 0 };   // fra sjov.js
  const bl = bonusLinje(bs);
  if (bl) k.append(bl);
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
    lille: naesteP ? (bs.joker ? '🃏 Jokeren kan redde din streak' : bs.mulig ? (bs.milepael ? '🏅 +★ ' + (bs.n + bs.milepael) + ' når alt er klaret' : '🔥 +★ ' + bs.n + ' når alt er klaret') : 'Næste: ' + naesteP.o.navn)
      : bs.givet ? '🔥 +★ ' + bs.givet.stjerner + ' streak-bonus' : st >= 2 ? streakTekst(st) : bonus ? 'Bonus venter ⭐' : 'Sejt! 🎉' };
  return k;
}

// "Mine pligter i dag" til en voksens I dag-side (kun synlig for den voksne selv)
async function minePligterKort() {
  const mig = Data.bruger();
  if (!mig || mig.rolle !== 'voksen') return null;
  return pligtKort(mig.navn, 'Mine pligter i dag');
}

async function tegnPligter() {
  const boks = document.getElementById('pligter-indhold');
  const personer = pligtPersoner();
  if (!personer.includes(pligtBarn)) pligtBarn = personer[0];
  const barn = pligtBarn;
  const erMig = barn === Data.bruger()?.navn;
  const d = await pligtData(barn);
  const s = saldo(d);
  const dele = [];

  if (erVoksen()) dele.push(knap('📊 Ugens overblik – hvad har drengene tjent?', 'lille-knap uge-knap', () => ugeOverblik(0)));

  if (personer.length > 1) {
    dele.push(valgSeg(personer, barn, b => { pligtBarn = b; lokal.set('pligt-barn', b); tegnPligter(); },
      v => v));
  }

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
    dele.push(stat);
  }
  const st = streak(d);
  if (st >= 1) dele.push(el('p', 'streak-linje', streakTekst(st) + (st >= 2 ? ' – sejt!' : '')));
  if (d.regel.stjerner && bonusStjerner(d)) {   // fra sjov.js
    const bs = bonusStatus(d), nm = naesteMilepael(st);
    const info = [nm ? '🏅 Næste milepæl: ' + nm + ' dage (+★ ' + milepaelStjerner(nm) + ' ekstra)' : '',
      jokerTil(d) ? (bs.jokerBrugt ? '🃏 Jokeren er brugt i denne måned' : '🃏 1 joker i denne måned') : ''].filter(Boolean);
    const bl = bonusLinje(bs);
    if (bl) dele.push(bl);
    if (info.length) dele.push(el('p', 'hint streak-info', info.join(' · ')));
  }

  dele.push(...ekstraDele(barn, d));   // ⭐ ekstra stjerner
  if (erVoksen() && (d.regel.kr || d.regel.stjerner || d.opgaver.length)) {
    dele.push(knap('Justér stjerner, kr eller dage i træk', 'lille-knap juster-knap', () => justerSaldo(barn, d, s, st)));
  }

  if (erVoksen() && d.regel.kr && s.tilGode > 0) {
    dele.push(bekraeftKnap('Udbetal ' + kr(s.tilGode), 'udbetale', 'ryd udbetal', async () => {
      await Data.add('udbetalinger', { barn, kr: s.tilGode, dato: isoDato(new Date()) });
      tegnAlt();
    }));
  }

  // I dag
  dele.push(el('h3', 'lille-titel', 'I dag'));
  const ul = el('ul', 'liste');
  const idag = dagensOpgaver(d);
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

  // Voksne: ret pligter, belønningstyper og belønninger
  if (erVoksen()) {
    dele.push(knap(pligtRet ? 'Færdig med at rette' : (erMig ? 'Ret mine pligter' : 'Ret pligter og belønninger'), 'ryd',
      () => { pligtRet = !pligtRet; tegnPligter(); }));
    if (pligtRet) {
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
      if (d.regel.stjerner) {
        // Streak-bonus: ekstra stjerner, når alle hver-dag-pligter er klaret to (eller flere) dage i træk
        dele.push(el('h3', 'lille-titel', '🔥 Streak-bonus'),
          valgSeg([0, 1, 2, 3], Math.round(tal(d.regel.streakBonus ?? 1)), async v => { await saetRegel(barn, 'streakBonus', v); tegnAlt(); },
            v => (v === 0 ? 'Fra' : '+★ ' + v + ' pr. dag')),
          el('p', 'hint', 'Gives automatisk (med flamme-animation), når alle hver-dag-pligter er klaret – fra dag 2 i træk. Milepæle giver ekstra: 7 dage +3, 14 +5, 21 +5, 30 +10, 50 +10, 75 +15, 100 +20. Sygedage bryder ikke rækken.'));
        const jk = knap('🃏 Rednings-joker (1 pr. måned)', null, async () => { await saetRegel(barn, 'joker', !jokerTil(d)); tegnAlt(); });
        jk.setAttribute('role', 'checkbox');
        jk.setAttribute('aria-checked', jokerTil(d));
        const jseg = el('div', 'seg wrap');
        jseg.append(jk);
        dele.push(jseg, el('p', 'hint', 'Glemmer barnet en dag, redder jokeren automatisk rækken, når næste dag klares – én gang pr. måned.'));
      }

      const GENTAG = { dag: 'Hver dag', uge: 'Én gang om ugen', engang: 'Kun én gang', interval: '' };
      dele.push(el('h3', 'lille-titel', erMig ? 'Mine pligter' : 'Pligter for ' + barn));
      const ol = el('ul', 'ret-liste');
      for (const o of d.opgaver) {
        const li = el('li');
        const b = knap('', 'ret-raekke', () => redigerOpgave(o, d.regel));
        const under = [GENTAG[o.gentag] || 'Hver dag'];
        if (o.gentag === 'dag' && o.dage && o.dage.length && o.dage.length < 7) under[0] = o.dage.map(i => DAGE[i]).join(', ');
        if (o.gentag === 'interval') under[0] = intervalTekst(o) + ' · næste ' + kortDato(naesteForfald(o, d));
        if (o.frivillig) under.push('Bonus');
        if (d.regel.kr && tal(o.kr)) under.push(kr(tal(o.kr)));
        if (d.regel.stjerner && tal(o.stjerner)) under.push('★ ' + tal(o.stjerner));
        const oNavn = el('span', 'ret-navn');
        oNavn.append(ikonBillede(o), o.navn);
        b.append(oNavn, el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
        li.append(b);
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
          b.append(el('span', 'ret-navn', bel.navn), el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
          li.append(b);
          bl2.append(li);
        }
        if (!d.beloenninger.length) bl2.append(el('li', 'tom', 'Ingen belønninger'));
        dele.push(bl2, knap('Ny belønning', 'lille-knap', () => redigerBeloenning({ barn: BOERN.includes(barn) ? 'Begge' : barn })));
      }
    }
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
    if (ds || dk) await Data.add('justeringer', { barn, dato: iso, stjerner: ds, kr: dk, tekst: tekst.value.trim() });
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
  const li = el('li', 'beloen');
  const nok = s.stjerner >= b.stjerner;
  const info = el('div', 'beloen-info');
  info.append(el('span', 'beloen-navn', b.navn),
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
  const sorteret = [...d.beloenninger].sort((a, c) => a.stjerner - c.stjerner)
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
  const venter = d.indl.filter(x => x.status === 'afventer');
  const raad = sorteret.filter(b => b.stjerner <= s.stjerner);
  const naesteB = sorteret.find(b => b.stjerner > s.stjerner);
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
    bekraeftKnap('Afvis', 'afvise', 'lille-knap', async () => { await Data.update('indloesninger', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); tegnAlt(); }),
    knap('Godkend', 'lille-knap godkend', async () => {
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
  const tekst = input('text', 'ekstra-tekst', '', 'Fx Hjalp mormor med at bære');
  const forslag = el('div', 'seg wrap');
  for (const g of ['Hjalp til', 'Ryddede op', 'Hjalp med maden', 'Var sød ved min bror', 'Lavede noget ekstra']) forslag.append(knap(g, null, () => { tekst.value = g; }));
  let n = 1;
  const antal = chipValg([1, 2, 3], n, v => { n = v; }, v => '★'.repeat(v));
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const send = knap('Send til mor og far', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { fejl.textContent = 'Skriv hvad du har gjort 🙂'; fejl.hidden = false; tekst.focus(); return; }
    const r = await Data.add('ekstra', { barn, tekst: t, stjerner: n, dato: isoDato(new Date()), status: 'afventer' });
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
  if (erVoksen()) dele.push(knap('⭐ Giv ' + barn + ' en stjerne', 'lille-knap ekstra-knap', () => givEkstra(barn)));
  else if (loggetIndBarn() === barn && venter.length < EKSTRA_MAX) dele.push(knap('⭐ Jeg har gjort noget ekstra', 'lille-knap ekstra-knap', () => bedOmEkstra(barn)));
  return dele;
}

// Barnets tavle: besked når en voksen har svaret (belønningsønske, ekstra stjerner, madønske) eller givet ros.
// Vises én gang pr. enhed – både når barnet logger ind, og mens tavlen er åben (live). Ja = konfetti, nej = venlig besked.
async function svarTilBarn(barn) {
  if (loggetIndBarn() !== barn) return;
  const [indl, ekstra, mad] = await Promise.all(['indloesninger', 'ekstra', 'madoensker'].map(l => Data.list(l)));
  const svar = [
    ...indl.filter(x => x.barn === barn && x.besvaret && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', tekst: x.status === 'godkendt' ? 'Ja! Du får ' + x.navn + ' 🎁' : 'Mor og far sagde nej til ' + x.navn + ' denne gang' })),
    ...ekstra.filter(x => x.barn === barn && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', stjerner: x.stjerner,
        tekst: x.status === 'godkendt' ? (x.fra ? x.fra + ' gav dig' : 'Du fik') + ' ★ ' + x.stjerner + ' – ' + x.tekst + '!' : 'Ikke denne gang: ' + x.tekst })),
    ...mad.filter(x => x.barn === barn && ['godkendt', 'afvist'].includes(x.status))
      .map(x => ({ id: x.id, ja: x.status === 'godkendt', tekst: x.status === 'godkendt' ? 'Ja! Du får ' + x.ret + ' 😋' : 'Nej til ' + x.ret + ' denne gang' }))
  ];
  const noegle = 'svar-set-' + barn;
  let set;
  try { set = JSON.parse(lokal.get(noegle) || lokal.get('ekstra-set-' + barn) || 'null'); } catch { set = null; }
  if (!Array.isArray(set)) { lokal.set(noegle, JSON.stringify(svar.map(x => x.id))); return; }   // første gang: gamle svar er set
  const nye = svar.filter(x => !set.includes(x.id));
  if (!nye.length) return;
  lokal.set(noegle, JSON.stringify([...set, ...nye.map(x => x.id)].slice(-300)));
  const ja = nye.filter(x => x.ja), nej = nye.filter(x => !x.ja);
  setTimeout(() => {
    if (ja.length) fejr(ja.length === 1 ? ja[0].tekst : ja.length + ' ja-svar fra mor og far! 🎉');   // fra sjov.js
    if (nej.length) setTimeout(() => besked(nej.length === 1 ? nej[0].tekst : nej.length + ' svar fra mor og far – se under Pligter'), ja.length ? 2800 : 0);
  }, 700);
}

// Indhold til "Ønsker" på de voksnes I dag (tomt hvis intet venter)
async function oenskerIndhold() {
  if (!erVoksen()) return [];
  const ventende = (await Data.list('indloesninger')).filter(x => x.status === 'afventer').sort((a, b) => a.dato.localeCompare(b.dato));
  const ekstra = (await Data.list('ekstra')).filter(x => x.status === 'afventer').sort((a, b) => a.dato.localeCompare(b.dato));
  const mad = await madOenskeLinjer();   // fra app.js
  const antal = ventende.length + ekstra.length + mad.length;
  if (!antal) return [];
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', '🎁 Ønsker'), el('span', 'kort-pil', antal === 1 ? '1 venter' : antal + ' venter'));
  const ul = el('ul', 'beloen-liste');
  ventende.forEach(x => ul.append(oenskeLi(x, false)));
  // Børnenes "jeg har gjort noget ekstra"
  for (const x of ekstra) {
    const li = el('li', 'beloen oenske');
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', x.barn + ' har gjort noget ekstra: ' + x.tekst), el('span', 'beloen-pris', '★ ' + x.stjerner + ' · ' + kortDato(x.dato)));
    const kn = el('div', 'oenske-knapper');
    kn.append(bekraeftKnap('Afvis', 'afvise', 'lille-knap', async () => { await Data.update('ekstra', x.id, { status: 'afvist', besvaret: isoDato(new Date()) }); tegnAlt(); }),
      knap('Godkend', 'lille-knap godkend', () => givEkstra(x.barn, x)));
    li.append(info, kn);
    ul.append(li);
  }
  ul.append(...mad);
  return [top, ul];
}

function redigerOpgave(o, regel) {
  const ny = !o.id;
  const navn = input('text', 'opg-navn', o.navn, 'Fx tøm opvaskemaskinen');
  let til = o.barn || pligtBarn;
  const tilMuligheder = !ny ? [o.barn] : BOERN.includes(til) ? [...BOERN, 'Begge'] : [til];
  const tilValg = chipValg(tilMuligheder, til, v => { til = v; }, v => (v === 'Begge' ? 'Begge børn' : v));

  let gentag = o.gentag || 'dag';
  const dage = new Set(o.dage && o.dage.length ? o.dage : [0, 1, 2, 3, 4, 5, 6]);
  const dageBoks = el('div', 'seg wrap dage-valg');
  const tegnDage = () => {
    dageBoks.hidden = gentag !== 'dag';
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
  const bonusBoks = el('div', 'seg wrap');
  bonusBoks.append(bonusKnap);
  const typeValg = typer.length > 1 ? felt('Pligten giver', chipValg(typer, type, v => { type = v; visBeloeb(); }, v => BELOENNING_NAVN[v])) : '';

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const felter = {
      navn: n, gentag,
      dage: gentag === 'dag' ? [...dage].sort((a, b) => a - b) : [],
      interval: gentag === 'interval' ? interval : null,
      start: gentag === 'interval' ? (startInp.value || isoDato(new Date())) : null,
      regnFra: gentag === 'interval' ? regnFra : null,
      kr: type === 'penge' || type === 'begge' ? tal(krInp.value) : 0,
      stjerner: type === 'stjerner' || type === 'begge' ? Math.round(tal(stjInp.value)) : 0,
      frivillig,
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
    felt('Hvor tit', gentagValg), dageBoks, intervalBoks, bonusBoks,
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
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    const pris = Math.round(tal(stj.value));
    if (!n) { navn.focus(); return; }
    if (pris <= 0) { stj.focus(); return; }
    const felter = { navn: n, barn: til, stjerner: pris, engang };
    if (ny) await Data.add('beloenninger', felter); else await Data.update('beloenninger', b.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('beloenninger', b.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny belønning' : 'Ret belønning', felt('Belønning', navn), felt('Til', tilValg), felt('Koster (stjerner)', stj),
    engangBoks, el('p', 'hint', 'Fx en ny LEGO-æske. Uden flueben kan belønningen ønskes igen og igen (fx vælge aftensmad).'), knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// =====================================================================
// PAKKELISTER
// Data: 'pakkelister' {navn}   'pakkepunkter' {liste, tekst, hvem, pakket}
// =====================================================================
let pakValgt = lokal.get('pak-valgt') || '';
let pakFilter = 'Alle';
let pakNyHvem = 'Alle';
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
    await Data.add('pakkepunkter', { liste: pakValgt, tekst, hvem: pakNyHvem === 'Alle' ? '' : pakNyHvem, pakket: false });
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
      const mine = punkter.filter(p => p.liste === l.id);
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

  const mine = punkter.filter(p => p.liste === valgt.id);
  const pakket = mine.filter(p => p.pakket).length;
  const titel = el('div', 'pak-titel');
  titel.append(el('h3', 'lille-titel', valgt.navn), el('span', 'under', pakket + ' af ' + mine.length + ' pakket'), fremskridt(mine.length ? pakket / mine.length : 0));

  const personer = ['Alle', ...PERSONER.filter(p => p !== 'Fælles' && mine.some(x => x.hvem === p))];
  if (!personer.includes(pakFilter)) pakFilter = 'Alle';
  const filter = personer.length > 1 ? valgSeg(personer, pakFilter, v => { pakFilter = v; tegnPakkelister(); }, v => (v === 'Alle' ? 'Alle' : v)) : '';

  const hvemValg = valgSeg(['Alle', ...PERSONER.filter(p => p !== 'Fælles')], pakNyHvem, v => { pakNyHvem = v; tegnPakkelister(); },
    v => (v === 'Alle' ? 'Fælles' : v), 'wrap lille-seg');

  const ul = el('ul', 'liste');
  const viste = mine.filter(p => pakFilter === 'Alle' || p.hvem === pakFilter)
    .sort((a, b) => Number(a.pakket) - Number(b.pakket) || a.tekst.localeCompare(b.tekst, 'da'));
  for (const p of viste) {
    const li = el('li', 'punkt' + (p.pakket ? ' faerdig' : ''));
    const b = el('button', 'punkt-knap');
    b.type = 'button';
    b.setAttribute('aria-pressed', !!p.pakket);
    const tjek = el('span', 'tjek');
    tjek.innerHTML = IKON_TJEK;
    const tb = el('span', 'tekst-boks');
    tb.append(el('span', 'tekst', p.tekst));
    if (p.hvem) {
      const tags = el('span', 'tags');
      const t = el('span', 'hvem-tag ' + (PK[p.hvem] || ''), p.hvem);
      tags.append(t);
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
    ul.append(li);
  }
  if (!viste.length) ul.append(el('li', 'tom', 'Intet på listen endnu'));

  const fod = el('div', 'pak-fod');
  fod.append(
    bekraeftKnap('Start forfra', 'starte forfra', 'lille-knap', async () => {
      for (const p of mine.filter(p => p.pakket)) await Data.update('pakkepunkter', p.id, { pakket: false });
      tegnPakkelister();
    }),
    knap('Omdøb', 'lille-knap', () => navnPakkeliste(valgt)),
    bekraeftKnap('Slet liste', 'slette', 'lille-knap fare-knap', async () => {
      for (const p of mine) await Data.remove('pakkepunkter', p.id);
      await Data.remove('pakkelister', valgt.id);
      pakValgt = ''; lokal.set('pak-valgt', '');
      tegnPakkelister();
    })
  );

  const nyLabel = el('p', 'seg-label', 'Ny ting er til:');
  const visLabel = filter ? el('p', 'seg-label', 'Vis:') : '';
  if (!erVoksen()) boks.replaceChildren(titel, visLabel, filter, ul);
  else boks.replaceChildren(titel, pakForm, nyLabel, hvemValg, visLabel, filter, ul, fod);
  opdaterTilbage();   // fra app.js – tilbage-knappen bliver til "Alle pakkelister"
}

// Ret et punkt på en pakkeliste: tekst og hvem det er til
function redigerPakkepunkt(p) {
  const tekst = input('text', 'pak-tekst', p.tekst);
  let hvem = p.hvem || '';
  const hvemValg = chipValg(['', ...PERSONER.filter(x => x !== 'Fælles')], hvem, v => { hvem = v; }, v => v || 'Fælles');
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    await Data.update('pakkepunkter', p.id, { tekst: t, hvem });
    lukArk(); tegnPakkelister();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('pakkepunkter', p.id); lukArk(); tegnPakkelister(); }), gem);
  aabnArk('Ret', felt('Hvad skal med?', tekst), felt('Til', hvemValg), knapper);
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
