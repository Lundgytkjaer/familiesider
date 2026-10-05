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
const harPiktogram = r => (r.trin || []).some(t => t.piktogram || (t.soeg && piktoOpslag[t.soeg]));

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
    const b = knap('', 'rutine-raekke' + (r === naeste ? ' naeste' : '') + (faerdig ? ' faerdig' : ''), () => visRutine(r, iso));
    const strip = el('span', 'rutine-strip');
    (r.trin || []).slice(0, 5).forEach(t => strip.append(trinBillede(t, 'mini-billede', () => tegnOverblik())));
    const info = el('span', 'rutine-info');
    info.append(el('span', 'rutine-navn', r.navn), strip);
    b.append(el('span', 'rutine-tid', visTid(r.tid) || ''), info,
      el('span', 'rutine-status', faerdig ? '✓' : antal ? tjek.size + '/' + antal : ''));
    li.append(b);
    ul.append(li);
  }
  k.append(ul);
  if (rutiner.some(harPiktogram)) k.append(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
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
        if (tjek.has(i)) tjek.delete(i); else tjek.add(i);
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
    const b = knap('', 'rutine-raekke', () => (erVoksen() ? redigerRutine(r) : visRutine(r, iso)));
    const strip = el('span', 'rutine-strip');
    (r.trin || []).slice(0, 6).forEach(t => strip.append(trinBillede(t, 'mini-billede', () => tegnRutiner())));
    const dage = !r.dage || !r.dage.length || r.dage.length === 7 ? 'Hver dag' : r.dage.map(i => DAGE[i]).join(', ');
    const info = el('span', 'rutine-info');
    info.append(el('span', 'rutine-navn', r.navn), el('span', 'ret-under', dage + ' · ' + (r.trin || []).length + ' trin'), strip);
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
        navn: s.navn.trim(), tid: s.tid, dage: [...s.dage].sort((a, b) => a - b),
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
      el('label', 'felt-label', 'Trin'), trinListe, nytTrin, knapper);
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
//   'opgaver'       {barn, navn, gentag: 'dag'|'uge'|'interval'|'engang', dage: [0-6], interval: dage, start: dato, regnFra: 'fast'|'klaret', kr, stjerner}
//                   'interval' = med fast mellemrum (fx sengetøj hver 2. torsdag); 'fast' holder rytmen fra start, 'klaret' regner fra sidst klaret
//                   (kun voksne kan rette)
//                   barn kan også være en voksen (egne pligter – vises kun for den voksne selv)
//   'flueben'       {opgave, barn, periode, dato, navn, kr, stjerner}  – periode = dato / ugens mandag / 'engang'
//   'beloenninger'  {barn: navn|'Begge', navn, stjerner}               (kun voksne kan rette)
//   'indloesninger' {barn, navn, stjerner, dato}
//   'udbetalinger'  {barn, kr, dato}                                   (kun voksne kan rette)
//   'personregler'  {navn, kr: true/false, stjerner: true/false}      (kun voksne kan rette)
//                   – om personen får lommepenge og/eller stjerner. Standard: børn begge dele, voksne ingen.
// =====================================================================
let pligtBarn = lokal.get('pligt-barn') || BOERN[0];
let pligtRet = false;
const BELOENNING_NAVN = { ingen: 'Ingen', penge: 'Penge', stjerner: 'Stjerner', begge: 'Penge og stjerner' };

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
  return r ? { kr: !!r.kr, stjerner: !!r.stjerner } : { kr: barn, stjerner: barn };
}
async function saetRegel(navn, felt, vaerdi) {
  const r = (await Data.list('personregler')).find(x => x.navn === navn);
  if (r) await Data.update('personregler', r.id, { [felt]: vaerdi });
  else await Data.add('personregler', { ...(await regelFor(navn)), navn, [felt]: vaerdi });
}

async function pligtData(barn) {
  const [opgaver, flueben, beloenninger, indl, udb] = await Promise.all(
    ['opgaver', 'flueben', 'beloenninger', 'indloesninger', 'udbetalinger'].map(l => Data.list(l)));
  return {
    opgaver: opgaver.filter(o => o.barn === barn),
    flueben: flueben.filter(f => f.barn === barn),
    beloenninger: beloenninger.filter(b => b.barn === barn || (b.barn === 'Begge' && BOERN.includes(barn))),
    indl: indl.filter(x => x.barn === barn),
    udb: udb.filter(x => x.barn === barn),
    regel: await regelFor(barn)
  };
}

function saldo(d) {
  const man = isoDato(mandagDenneUge());
  return {
    stjerner: sum(d.flueben, 'stjerner') - sum(d.indl, 'stjerner'),
    tilGode: sum(d.flueben, 'kr') - sum(d.udb, 'kr'),
    ugeKr: sum(d.flueben.filter(f => f.dato >= man), 'kr')
  };
}

// Pligter med fast mellemrum: næste gang = sidst klaret + mellemrum (eller startdatoen første gang)
const intervalDage = o => Math.max(1, Math.round(tal(o.interval)) || 14);
function sidstKlaret(o, d) {
  const datoer = d.flueben.filter(x => x.opgave === o.id).map(x => x.dato).sort();
  return datoer[datoer.length - 1] || null;
}
// regnFra 'fast' (standard): holder rytmen fra startdatoen (fx hver 2. torsdag), også når den klares for sent.
// regnFra 'klaret': næste gang regnes fra den dag, den blev klaret.
const fastRytme = o => o.regnFra !== 'klaret';
function naesteForfald(o, d) {
  const n = intervalDage(o);
  const start = o.start || isoDato(new Date());
  const sidst = sidstKlaret(o, d);
  if (!sidst) return start;
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
  return res.sort((a, b) => Number(!!a.f) - Number(!!b.f) || (orden[a.o.gentag] ?? 0) - (orden[b.o.gentag] ?? 0));
}

async function skiftFlueben(barn, r, regel) {
  if (r.f) await Data.remove('flueben', r.f.id);
  else await Data.add('flueben', {
    opgave: r.o.id, barn, periode: r.periode, dato: isoDato(new Date()), navn: r.o.navn,
    kr: regel.kr ? tal(r.o.kr) : 0,
    stjerner: regel.stjerner ? Math.round(tal(r.o.stjerner)) : 0
  });
  tegnAlt();
}

function opgaveLi(barn, r, regel) {
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
  if (r.o.gentag === 'uge') tags.append(el('span', null, 'Ugens opgave'));
  if (r.o.gentag === 'engang') tags.append(el('span', null, 'Én gang'));
  if (r.o.gentag === 'interval') tags.append(el('span', null, intervalTekst(r.o)));
  if (r.overTid > 0) tags.append(el('span', 'over-tid', r.overTid === 1 ? '1 dag over tid' : r.overTid + ' dage over tid'));
  if (tags.children.length) tb.append(tags);
  b.append(tjek, tb);
  b.addEventListener('click', () => skiftFlueben(barn, r, regel));
  li.append(b);
  return li;
}

// Kort med dagens pligter – bruges på drengenes tavle og som "Mine pligter" på de voksnes I dag
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
  top.append(el('span', 'kort-label', titel),
    knap((status.length ? status.join(' · ') + ' ' : 'Alle ') + '›', 'kort-pil link-knap', () => {
      pligtBarn = barn; visFane('pligter'); tegnPligter(); window.scrollTo(0, 0);
    }));
  const ul = el('ul', 'liste i-kort');
  liste.forEach(r => ul.append(opgaveLi(barn, r, d.regel)));
  if (!liste.length) ul.append(el('li', 'tom', 'Ingen pligter i dag'));
  k.append(top, ul);
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

  if (personer.length > 1) {
    dele.push(valgSeg(personer, barn, b => { pligtBarn = b; lokal.set('pligt-barn', b); tegnPligter(); },
      v => (v === Data.bruger()?.navn && !BOERN.includes(v) ? 'Mig' : v)));
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

  // Belønninger (kun med stjerner)
  if (d.regel.stjerner) {
    dele.push(el('h3', 'lille-titel', 'Belønninger'));
    const bl = el('ul', 'beloen-liste');
    for (const b of [...d.beloenninger].sort((a, c) => a.stjerner - c.stjerner)) {
      const li = el('li', 'beloen');
      const nok = s.stjerner >= b.stjerner;
      const info = el('div', 'beloen-info');
      info.append(el('span', 'beloen-navn', b.navn),
        el('span', 'beloen-pris', '★ ' + b.stjerner + (nok ? ' · du har nok!' : ' · mangler ' + (b.stjerner - s.stjerner))),
        fremskridt(b.stjerner ? s.stjerner / b.stjerner : 1));
      const indloes = bekraeftKnap('Indløs', 'indløse', 'lille-knap', async () => {
        await Data.add('indloesninger', { barn, navn: b.navn, stjerner: b.stjerner, dato: isoDato(new Date()) });
        tegnAlt();
      });
      indloes.disabled = !nok;
      li.append(info, indloes);
      bl.append(li);
    }
    if (!d.beloenninger.length) bl.append(el('li', 'tom', 'Ingen belønninger endnu'));
    dele.push(bl);
  }

  // Seneste (kun når der er noget at tjene)
  if (d.regel.stjerner || d.regel.kr) {
    const haendelser = [
      ...d.flueben.filter(f => tal(f.kr) || f.stjerner).map(f => ({ dato: f.dato, tekst: f.navn, vaerdi: [tal(f.kr) ? '+' + kr(tal(f.kr)) : '', f.stjerner ? '+★ ' + f.stjerner : ''].filter(Boolean).join(' ') })),
      ...d.indl.map(x => ({ dato: x.dato, tekst: 'Indløst: ' + x.navn, vaerdi: '−★ ' + x.stjerner })),
      ...d.udb.map(x => ({ dato: x.dato, tekst: 'Lommepenge udbetalt', vaerdi: kr(tal(x.kr)) }))
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

      const GENTAG = { dag: 'Hver dag', uge: 'Hver uge', engang: 'Én gang', interval: '' };
      dele.push(el('h3', 'lille-titel', erMig ? 'Mine pligter' : 'Pligter for ' + barn));
      const ol = el('ul', 'ret-liste');
      for (const o of d.opgaver) {
        const li = el('li');
        const b = knap('', 'ret-raekke', () => redigerOpgave(o, d.regel));
        const under = [GENTAG[o.gentag] || 'Hver dag'];
        if (o.gentag === 'dag' && o.dage && o.dage.length && o.dage.length < 7) under[0] = o.dage.map(i => DAGE[i]).join(', ');
        if (o.gentag === 'interval') under[0] = intervalTekst(o) + ' · næste ' + kortDato(naesteForfald(o, d));
        if (d.regel.kr && tal(o.kr)) under.push(kr(tal(o.kr)));
        if (d.regel.stjerner && tal(o.stjerner)) under.push('★ ' + tal(o.stjerner));
        b.append(el('span', 'ret-navn', o.navn), el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
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
          b.append(el('span', 'ret-navn', bel.navn), el('span', 'ret-under', '★ ' + bel.stjerner + ' · ' + (bel.barn === 'Begge' ? 'begge drenge' : bel.barn)), el('span', 'm-pil', '›'));
          li.append(b);
          bl2.append(li);
        }
        if (!d.beloenninger.length) bl2.append(el('li', 'tom', 'Ingen belønninger'));
        dele.push(bl2, knap('Ny belønning', 'lille-knap', () => redigerBeloenning({ barn: BOERN.includes(barn) ? 'Begge' : barn })));
      }
    }
  }

  boks.replaceChildren(...dele);
}

function redigerOpgave(o, regel) {
  const ny = !o.id;
  const navn = input('text', 'opg-navn', o.navn, 'Fx tøm opvaskemaskinen');
  let til = o.barn || pligtBarn;
  const tilMuligheder = !ny ? [o.barn] : BOERN.includes(til) ? [...BOERN, 'Begge'] : [til];
  const tilValg = chipValg(tilMuligheder, til, v => { til = v; }, v => (v === Data.bruger()?.navn && !BOERN.includes(v) ? 'Mig' : v));

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
  const typeValg = typer.length > 1 ? felt('Belønning', chipValg(typer, type, v => { type = v; visBeloeb(); }, v => BELOENNING_NAVN[v])) : '';

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
      stjerner: type === 'stjerner' || type === 'begge' ? Math.round(tal(stjInp.value)) : 0
    };
    if (ny) for (const b of (til === 'Begge' ? BOERN : [til])) await Data.add('opgaver', { ...felter, barn: b });
    else await Data.update('opgaver', o.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('opgaver', o.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny pligt' : 'Ret pligt', felt('Pligt', navn), tilMuligheder.length > 1 ? felt('Til', tilValg) : '',
    felt('Hvor tit', gentagValg), dageBoks, intervalBoks, typeValg, beloebRaekke, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

function redigerBeloenning(b) {
  const ny = !b.id;
  const navn = input('text', 'bel-navn', b.navn, 'Fx tur i biografen');
  let til = b.barn || 'Begge';
  const tilValg = chipValg(['Begge', ...BOERN], til, v => { til = v; }, v => (v === 'Begge' ? 'Begge drenge' : v));
  const stj = input('text', 'bel-stj', b.stjerner ? String(b.stjerner) : '', 'Fx 10');
  stj.inputMode = 'numeric';
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    const pris = Math.round(tal(stj.value));
    if (!n) { navn.focus(); return; }
    if (pris <= 0) { stj.focus(); return; }
    const felter = { navn: n, barn: til, stjerner: pris };
    if (ny) await Data.add('beloenninger', felter); else await Data.update('beloenninger', b.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('beloenninger', b.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny belønning' : 'Ret belønning', felt('Belønning', navn), felt('Til', tilValg), felt('Koster (stjerner)', stj), knapper);
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
    boks.replaceChildren(grid, knap('Ny pakkeliste', 'knap bred-knap', () => navnPakkeliste({})));
    return;
  }

  const mine = punkter.filter(p => p.liste === valgt.id);
  const pakket = mine.filter(p => p.pakket).length;
  const top = el('div', 'pak-top');
  top.append(knap('‹ Alle lister', 'lille-knap', () => { pakValgt = ''; lokal.set('pak-valgt', ''); tegnPakkelister(); }));
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
    b.addEventListener('click', async () => { await Data.update('pakkepunkter', p.id, { pakket: !p.pakket }); tegnPakkelister(); });
    const slet = knap('', 'slet', async () => { await Data.remove('pakkepunkter', p.id); tegnPakkelister(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + p.tekst);
    li.append(b, slet);
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
  boks.replaceChildren(top, titel, pakForm, nyLabel, hvemValg, visLabel, filter, ul, fod);
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
const fmtKm = n => n.toLocaleString('da-DK', { maximumFractionDigits: 1 }) + ' km';

const konkForm = (() => {
  const form = el('form', 'konk-form');
  const km = el('input');
  km.type = 'text'; km.id = 'konk-km'; km.placeholder = 'Km'; km.inputMode = 'decimal'; km.autocomplete = 'off';
  km.setAttribute('aria-label', 'Kilometer');
  const dato = el('input');
  dato.type = 'date'; dato.id = 'konk-dato';
  dato.setAttribute('aria-label', 'Dato');
  const raekke = el('div', 'konk-felter');
  raekke.append(km, dato, el('button', 'knap', 'Tilføj'));
  form.append(raekke);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = tal(km.value);
    if (v <= 0) { km.focus(); return; }
    await Data.add('motion', { hvem: konkHvem, dato: dato.value || isoDato(new Date()), km: v, type: konkNyType });
    km.value = '';
    tegnKonkurrence();
  });
  return { form, km, dato };
})();

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
  const man = mandagDenneUge();
  man.setDate(man.getDate() + konkUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  const manIso = isoDato(man), sonIso = isoDato(son);
  const alle = await Data.list('motion');
  const ugens = alle.filter(m => m.dato >= manIso && m.dato <= sonIso);

  // Uge-navigation
  const nav = el('div', 'kal-nav');
  const titel = el('div', 'kal-titel');
  titel.append(el('strong', null, 'Uge ' + ugenummer(man) + ' · ' + man.getDate() + '. ' + MDR[man.getMonth()] + '–' + son.getDate() + '. ' + MDR[son.getMonth()]));
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

  // Tilføj tur
  const dagsDato = konkUge === 0 ? isoDato(new Date()) : manIso;
  if (!konkForm.dato.value || konkForm.dato.value < manIso || konkForm.dato.value > sonIso) konkForm.dato.value = dagsDato;
  const tilfoej = el('div', 'kort konk-tilfoej');
  tilfoej.append(
    el('span', 'kort-label', 'Tilføj en tur'),
    valgSeg(DELTAGERE, konkHvem, v => { konkHvem = v; tegnKonkurrence(); }, v => v, 'wrap lille-seg'),
    valgSeg(['cykel', 'gaa'], konkNyType, v => { konkNyType = v; tegnKonkurrence(); }, v => (v === 'cykel' ? 'Cyklet' : 'Gået'), 'lille-seg'),
    konkForm.form
  );

  // Ugens ture
  const ture = el('ul', 'historik');
  for (const m of [...ugens].sort((a, b) => b.dato.localeCompare(a.dato))) {
    const li = el('li', PK[m.hvem]);
    const slet = knap('', 'slet', async () => { await Data.remove('motion', m.id); tegnKonkurrence(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet tur');
    li.append(el('span', 'h-dato', kortDato(m.dato)), el('span', 'h-tekst', m.hvem + ' · ' + (m.type === 'cykel' ? 'cyklet' : 'gået')), el('span', 'h-vaerdi', fmtKm(tal(m.km))), slet);
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

  const dele = [nav, typeValg, ol, status, tilfoej];
  if (ugens.length) dele.push(el('h3', 'lille-titel', 'Ugens ture'), ture);
  if (vindere.children.length) dele.push(el('h3', 'lille-titel', 'Tidligere vindere (' + MOTION_NAVN[konkType].toLowerCase() + ')'), vindere);
  boks.replaceChildren(...dele);
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
