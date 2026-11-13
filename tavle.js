// tavle.js – 🖥️ Familietablet "Tavlen" i køkkenet (Galaxy Tab, liggende, står tændt i dagevis).
// Logger brugeren "Tavlen" ind (rolle 'barn' i databasen – se opdatering-tavlen.sql), vises KUN denne side:
// hele dagen for alle fire + det fælles på én skærm uden at scrolle. Er der for meget, står der "+2 mere".
// Kun to slags tryk: drengenes flueben (i deres egen kolonne) og afkrydsning på indkøbslisten. Alt andet laves på telefonerne.
// Databasen sikrer det samme (barn_vagt: er_tavlen) – siden her er bare den venlige udgave.
// Bruger de fælles hjælpere fra app.js/mere.js/sjov.js (el, knap, aftalerDen, skoleDag, pligtData, skiftFlueben …).

const TAVLEN = 'Tavlen';
const erTavlen = () => Data.bruger()?.navn === TAVLEN && Data.bruger()?.rolle === 'barn';
const TV_VOKSNE = ['Winnie', 'Timmo'];            // deler én kolonne (der var meget tom plads)
const TV_PERSONER = [...TV_VOKSNE, ...BOERN];     // dem, der har pligter på tavlen (og et profilkort)
const TV_PROFIL_SEK = 30;                         // profilkortet lukker selv efter 30 sek.
const TV_KOMMER_DAGE = 14;              // "Kommer": aftaler de næste 14 dage
const TV_LYS = [6 * 60, 20 * 60];       // lys tilstand fra 06.00 til 20.00, ellers mørk
const TV_NAT = [22 * 60, 6 * 60];       // om natten dæmpes skærmen ekstra
const tvNyligKoebt = new Map();         // indkøb krydset af på tavlen → tidspunkt (bliver stående gennemstreget i 10 min, så man kan fortryde)
let tvGen = 0, tvTimer = null;

// ---------- Små hjælpere ----------
// Om aftenen (fra kl. 19.30 – SKIFT_KL i app.js, samme som drengenes tavle) viser tavlen i morgen: skole, aftaler, mad.
// Dagens pligter og rutiner (sengetid) bliver stående, indtil de er klaret.
const tvIdag = () => isoDato(new Date());
const tvVisIso = () => isoDato(tavleAutoDato());
const tvDagTitel = iso => (iso === tvIdag() ? 'I dag' : iso === plusDage(tvIdag(), 1) ? 'I morgen' : tvKortDag(iso));
const tvMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const tvKl = () => { const n = new Date(); return String(n.getHours()).padStart(2, '0') + '.' + String(n.getMinutes()).padStart(2, '0'); };
const tvKortDag = iso => { const d = tilDag(iso); return DAGE[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
function tvLi(klasse, ...indhold) { const li = el('li', 'tv-linje' + (klasse ? ' ' + klasse : '')); li.append(...indhold.filter(x => x !== null && x !== '')); return li; }
// Et afsnit i en kolonne. prio: højere = skæres først, når der ikke er plads. min: så mange linjer bliver altid stående.
function tvDel(titel, linjer, { prio = 1, min = 1, klasse = '', tom = '' } = {}) {
  const d = el('section', 'tv-del' + (klasse ? ' ' + klasse : ''));
  d.dataset.prio = prio; d.dataset.min = min;
  if (titel) d.append(titel instanceof Node ? titel : el('h3', 'tv-del-titel', titel));
  const ul = el('ul', 'tv-liste');
  ul.append(...linjer);
  if (!linjer.length && tom) ul.append(tvLi('tv-tom', tom));
  d.append(ul);
  return d;
}
// Aftalens tekst: "16.30–18.00 Fodbold"
function tvAftaleLi(a, iso, { dato = false } = {}) {
  const slutMin = a.slut ? tidSomMin(a.slut)[0] : null;
  const forbi = !dato && iso === isoDato(new Date()) && a.tid && (slutMin ?? (tidSomMin(a.tid)[0] ?? -1) + 60) <= tvMin();
  const tid = a.fri ? friIkon(a) : klTekst(a);
  return tvLi(aftaleFarve(a) + (forbi ? ' forbi' : ''),
    dato ? el('span', 'tv-dag', tvKortDag(iso)) : '',
    tid ? el('span', 'tv-tid', tid) : '',
    el('span', 'tv-tekst', a.fri ? friTekst(a) : a.titel));
}
// De næste aftaler (efter i dag) for nogen – højst n
// En gentagen aftale (fx fodbold hver uge) står kun én gang: næste gang – og slet ikke, hvis den også er i dag
function tvKommer(alle, hvem, n = 6, idag = tvVisIso()) {
  const res = [];
  const set = new Set(iDagsListe(alle, idag, hvem).filter(a => a.gentag).map(a => a.id));
  for (let k = 1; k <= TV_KOMMER_DAGE && res.length < n; k++) {
    const iso = plusDage(idag, k);
    for (const a of iDagsListe(alle, iso, hvem)) {
      if (res.length >= n || (a.gentag && set.has(a.id))) continue;
      if (a.gentag) set.add(a.id);
      res.push(tvAftaleLi(a, iso, { dato: true }));
    }
  }
  return res;
}

// ---------- Skole for et barn i dag ----------
async function tvSkole(barn, iso, alle) {
  const dagNr = (tilDag(iso).getDay() + 6) % 7;
  if (dagNr >= 5) return { stor: '😎 Weekend', lille: 'Ingen skole' };
  const hellig = helligdagDen(iso);
  const fri = friDen(alle, iso, barn);
  if (hellig && !fri) return { stor: 'Fri ' + hellig.ikon, lille: hellig.navn };
  if (fri) {
    if (erOff(fri)) return { stor: 'Hjemme 🌿', lille: 'Rolig dag' };
    if (fri.type === 'syg') return { stor: 'Hjemme 🤒', lille: 'God bedring!' };
    return { stor: 'Fri ' + friIkon(fri), lille: friTekst(fri) };
  }
  if (await fastFri(barn, dagNr)) return { stor: 'Fri 🎉', lille: 'Fast fridag' };
  const sd = await skoleDag(barn, iso);
  if (!sd.timer.length) return { stor: '🎒 Skole', lille: '' };
  const tidlig = aftalerDen(alle, iso, [barn]).find(a => a.type === 'tidlig' && a.tid);
  const slut = tidlig ? tidlig.tid : sd.slut;
  const slutMin = slut ? tidSomMin(slut)[0] : null;
  if (iso === tvIdag() && slutMin != null && tvMin() >= slutMin) return { stor: 'Fri fra skole ✓', lille: tidlig ? '⏰ Tidligere fri i dag' : '', klar: true };
  const fra = sd.start ? visTid(sd.start) : '';
  return { stor: '🎒 ' + (fra && slut ? fra + '–' + visTid(slut) : fra ? 'Møder ' + fra : 'Skole'), lille: tidlig ? '⏰ Tidligere fri i dag' : (sd.saerlig && skoledagMaerke(sd.saerlig) ? '🏫 ' + skoledagTitel(sd.saerlig) : '') };
}

// ---------- Pligter (det ene tryk) ----------
async function tvPligter(barn, iso, overskrift = 'Pligter', { skjulKlaret = false } = {}) {
  const pause = typeof pausePligter === 'function' ? pausePligter(barn, iso) : null;
  if (pause) return tvDel(overskrift, [tvLi('tv-tom', '⏸ Pause')], { prio: 0 });
  const d = await pligtData(barn);
  if (!d.opgaver.length) return null;
  const liste = dagensOpgaver(d).filter(r => !r.sprunget);
  if (!liste.length && !BOERN.includes(barn)) return null;   // en voksen uden pligter i dag: ingen tom overskrift
  const pligt = skalKlares(liste);
  const klaret = pligt.filter(r => r.f).length;
  if (skjulKlaret && klaret === pligt.length && liste.every(r => r.f || r.o.frivillig)) return null;   // om aftenen: alt klaret → væk (plads til i morgen)
  const linjer = liste.map(r => {
    const li = el('li', 'tv-linje tv-pligt' + (r.f ? ' klaret' : '') + (r.f?.venter ? ' venter' : ''));
    const b = el('button', 'tv-tryk');
    b.type = 'button';
    b.setAttribute('aria-pressed', !!r.f);
    const tjek = el('span', 'tv-tjek'); tjek.innerHTML = IKON_TJEK;
    b.append(tjek, el('span', 'tv-tekst', r.o.navn + (r.o.frivillig ? ' ⭐' : '')), r.f?.venter ? el('span', 'tv-tag', '⏳') : '');
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      li.classList.toggle('klaret', !r.f); b.setAttribute('aria-pressed', !r.f);   // svar med det samme
      try { await skiftFlueben(barn, r, d.regel); } finally { b.disabled = false; tvTegnSnart(300); }
    });
    li.append(b);
    return li;
  });
  const titel = el('h3', 'tv-del-titel', overskrift);
  if (pligt.length) titel.append(el('span', 'tv-tal' + (klaret === pligt.length ? ' alle' : ''), klaret === pligt.length ? 'Alle klaret 🎉' : klaret + ' af ' + pligt.length));
  return tvDel(titel, linjer, { prio: 0, min: 99, klasse: 'tv-pligter', tom: 'Ingen pligter i dag' });
}

// ---------- Indkøb (det andet tryk) ----------
async function tvIndkob() {
  const nu = Date.now();
  for (const [id, t] of tvNyligKoebt) if (nu - t > 10 * 60000) tvNyligKoebt.delete(id);
  const alle = await Data.list('indkob');
  const vis = alle.filter(p => !p.klaret || tvNyligKoebt.has(p.id))
    .sort((a, b) => Number(!!b.vigtig) - Number(!!a.vigtig));   // en lige krydset vare bliver på sin plads (kan fortrydes)
  const mangler = alle.filter(p => !p.klaret).length;
  const linjer = vis.map(p => {
    const li = el('li', 'tv-linje tv-vare' + (p.klaret ? ' klaret' : '') + (p.vigtig ? ' tv-vigtig' : ''));
    const b = el('button', 'tv-tryk');
    b.type = 'button';
    b.setAttribute('aria-pressed', !!p.klaret);
    const tjek = el('span', 'tv-tjek'); tjek.innerHTML = IKON_TJEK;
    b.append(tjek, el('span', 'tv-tekst', p.tekst + (p.antal ? ' (' + p.antal + ')' : '')));
    b.addEventListener('click', async () => {
      const ny = !p.klaret;
      p.klaret = ny;
      if (ny) tvNyligKoebt.set(p.id, Date.now());
      li.classList.toggle('klaret', ny); b.setAttribute('aria-pressed', ny);
      try { await Data.update('indkob', p.id, { klaret: ny }); } finally { tvTegnSnart(1500); }
    });
    li.append(b);
    return li;
  });
  const titel = el('h3', 'tv-del-titel', '🛒 Indkøb');
  if (mangler) titel.append(el('span', 'tv-tal', String(mangler)));
  return tvDel(titel, linjer, { prio: 2, min: 3, klasse: 'tv-indkob', tom: 'Intet på listen' });
}

// ---------- Kolonnerne ----------
// Navnet øverst i en kolonne: et tryk åbner personens profilkort (kun til at kigge på)
function tvNavnKnap(navn) {
  const b = el('button', 'tv-navn-knap ' + PK[navn], navn);
  b.type = 'button';
  b.addEventListener('click', () => tvProfil(navn));
  return b;
}
const tvIDag = (alle, iso, hvem) => iDagsListe(alle, iso, hvem).filter(a => !a.type || !FRAVAER[a.type]);

async function tvKolonne(navn, alle, iso) {
  const kol = el('div', 'tv-kol ' + PK[navn]);
  const h = el('h2', 'tv-navn');
  h.append(navn === 'Fælles' ? navn : tvNavnKnap(navn));
  const aften = iso !== tvIdag();
  kol.append(h);
  const indre = el('div', 'tv-indre');
  const dele = [];
  const barn = BOERN.includes(navn);
  if (barn) {
    const s = await tvSkole(navn, iso, alle);
    const husk = infoDen(await Data.list('info'), navn, iso).map(x => tvLi('tv-husk', el('span', 'tv-tekst', '📝 ' + (x.tekst || 'Se billedet på telefonen'))));
    dele.push(tvDel(aften ? tvDagTitel(iso) : null, [tvLi('tv-skole' + (s.klar ? ' klar' : ''), el('span', 'tv-stor', s.stor), s.lille ? el('span', 'tv-lille', s.lille) : ''), ...husk], { prio: 3, min: 1 }));
  }
  if (navn === 'Fælles') {
    let foed = [];
    try { foed = await foedselsdageDen(iso, BOERN[0]); } catch (e) { console.warn(e); }
    const fl = foed.map(f => tvLi('tv-foed', el('span', 'tv-tekst', foedTekst(f))));
    if (fl.length) dele.push(tvDel(null, fl, { prio: 3, min: 1 }));
  }
  // I dag: aftaler for personen (Fælles-aftaler står kun i Fælles)
  const iDag = tvIDag(alle, iso, [navn]);
  if (iDag.length || !barn) dele.push(tvDel(barn && aften ? null : tvDagTitel(iso), iDag.map(a => tvAftaleLi(a, iso)), { prio: 4, min: 1, tom: barn ? '' : 'Intet i kalenderen' }));
  if (barn) {
    const p = await tvPligter(navn, tvIdag(), aften ? 'Pligter i dag' : 'Pligter', { skjulKlaret: aften });
    if (p) dele.push(p);
    const rk = await rutineKort(navn, new Date());
    if (rk?.tavle && !rk.tavle.klar) dele.push(tvDel(null, [tvLi('tv-rutine', el('span', 'tv-tekst', '🪥 ' + rk.tavle.stor), rk.tavle.lille ? el('span', 'tv-lille', rk.tavle.lille.replace(/\s*–\s*tryk.*$/, '')) : '')], { prio: 5, min: 0 }));
  }
  if (navn === 'Fælles') dele.push(await tvIndkob());
  const kommer = tvKommer(alle, [navn], 6, iso);
  if (kommer.length) dele.push(tvDel('Kommer', kommer, { prio: 9, min: 0, klasse: 'tv-kommer' }));
  indre.append(...dele.filter(Boolean));
  kol.append(indre);
  return kol;
}

// Winnie og Timmo i én kolonne: fælles aftaler (farvet efter person), deres egne pligter og det, der kommer
async function tvVoksenKolonne(alle, iso) {
  const kol = el('div', 'tv-kol tv-voksne');
  const h = el('h2', 'tv-navn');
  TV_VOKSNE.forEach((n, i) => { if (i) h.append(el('span', 'tv-og', '·')); h.append(tvNavnKnap(n)); });
  kol.append(h);
  const indre = el('div', 'tv-indre');
  const dele = [];
  const iDag = tvIDag(alle, iso, TV_VOKSNE);
  const aften = iso !== tvIdag();
  dele.push(tvDel(tvDagTitel(iso), iDag.map(a => tvAftaleLi(a, iso)), { prio: 4, min: 1, tom: 'Intet i kalenderen' }));
  for (const n of TV_VOKSNE) {
    const p = await tvPligter(n, tvIdag(), 'Pligter · ' + n, { skjulKlaret: aften });
    if (p) { p.classList.add(PK[n]); dele.push(p); }
  }
  const kommer = tvKommer(alle, TV_VOKSNE, 6, iso);
  if (kommer.length) dele.push(tvDel('Kommer', kommer, { prio: 9, min: 0, klasse: 'tv-kommer' }));
  indre.append(...dele);
  kol.append(indre);
  return kol;
}

// ---------- Madbåndet nederst: dagens aftensmad + det, drengene får i stedet ----------
const tvRet = r => (r === INGEN_MAD ? 'Ingenting' : r);
const TV_MAALTID = { morgen: 'til morgenmad', frokost: 'til frokost', ret: 'til aften' };
async function tvMad(iso) {
  const dag = tilDag(iso);
  const faelles = await madFor(dag);
  const aften = tvRet(faelles.visning.ret || faelles.ret) || 'Ikke bestemt';
  const afvig = [];
  for (const b of BOERN) {
    const p = await madFor(dag, b);
    for (const f of ['morgen', 'frokost', 'ret']) {
      const egen = p[f] && (p.eget?.[f] || p.oenske?.[f] || (f === 'ret' && p[f] !== faelles.ret));
      if (egen) afvig.push({ barn: b, tekst: tvRet(p.visning[f] || p[f]) + (f === 'ret' ? '' : ' ' + TV_MAALTID[f]) });
    }
  }
  const erIdag = iso === tvIdag();
  const imorgen = erIdag ? await madFor(tilDag(plusDage(iso, 1))) : {};
  const baand = document.getElementById('tv-mad');
  baand.replaceChildren(el('span', 'tv-mad-ikon', '🍽️'), el('span', 'tv-lille', erIdag ? 'Aftensmad' : 'Aftensmad ' + tvDagTitel(iso).toLowerCase()), el('span', 'tv-stor', aften),
    ...afvig.map(x => { const s = el('span', 'tv-mad-afvig ' + PK[x.barn]); s.append(el('strong', null, x.barn + ': '), x.tekst); return s; }),
    imorgen.ret ? el('span', 'tv-mad-imorgen', 'I morgen: ' + tvRet(imorgen.visning.ret || imorgen.ret)) : '');
}

// ---------- Profilkort: tryk på et navn → dagens skema, aftaler, mad og pligter (kun til at kigge på) ----------
let tvProfilTimer = null;
async function tvProfil(navn) {
  const iso = tvVisIso();   // om aftenen: morgendagens skema og mad
  const alle = await Data.list('kalender');
  const barn = BOERN.includes(navn);
  const boks = el('div', 'tv-profil ' + PK[navn]);
  const del = (titel, ...indhold) => { const d = el('section', 'tv-p-del'); d.append(el('h3', 'tv-del-titel', titel), ...indhold); return d; };
  const liste = linjer => { const ul = el('ul', 'tv-liste'); ul.append(...linjer); return ul; };
  if (barn) {
    const s = await tvSkole(navn, iso, alle);
    const sd = await skoleDag(navn, iso);
    const dagNr = (tilDag(iso).getDay() + 6) % 7;
    const timer = dagNr < 5 && !/Fri|Hjemme|Weekend/.test(s.stor) ? sd.timer.filter(t => t.fag) : [];
    const nuMin = tvMin();
    boks.append(del('Skole', el('p', 'tv-stor', s.stor), s.lille ? el('p', 'tv-lille', s.lille) : '',
      liste(timer.map(t => { const [fra, til] = tidSomMin(t.tid); return tvLi(fra != null && til != null && nuMin >= fra && nuMin < til ? 'nu' : til != null && til <= nuMin ? 'forbi' : '',
        el('span', 'tv-tid', visTider(t.tid)), el('span', 'tv-tekst', t.fag)); })),
      ...infoDen(await Data.list('info'), navn, iso).map(x => el('p', 'tv-husk', '📝 ' + (x.tekst || '')))));
    const m = await madFor(tilDag(iso), navn);
    boks.append(del('Mad ' + tvDagTitel(iso).toLowerCase(), liste([['morgen', 'Morgen'], ['frokost', 'Frokost'], ['ret', 'Aften']].map(([f, t]) =>
      tvLi('', el('span', 'tv-tid', t), el('span', 'tv-tekst', tvRet(m.visning[f] || m[f]) || 'Ikke bestemt'))))));
  }
  const iDag = tvIDag(alle, iso, [navn, 'Fælles']);
  boks.append(del(tvDagTitel(iso), liste(iDag.length ? iDag.map(a => tvAftaleLi(a, iso)) : [tvLi('tv-tom', 'Intet i kalenderen')])));
  // Pligter (dagens + ugens) – kun at se; der krydses af i kolonnen
  const d = await pligtData(navn);
  if (d.opgaver.length) {
    const rk = dagensOpgaver(d).filter(r => !r.sprunget);
    boks.append(del('Pligter i dag', liste(rk.length ? rk.map(r => tvLi(r.f ? 'klaret' : '', el('span', 'tv-tekst', (r.f ? '✓ ' : '◯ ') + r.o.navn + (r.o.gentag === 'uge' ? ' (denne uge)' : '')))) : [tvLi('tv-tom', 'Ingen i dag')])));
  }
  const kommer = tvKommer(alle, [navn], 8, iso);
  if (kommer.length) boks.append(del('Kommer', liste(kommer)));
  aabnArk(navn + (iso === tvIdag() ? '' : ' – ' + tvDagTitel(iso).toLowerCase()), boks);
  document.getElementById('ark').classList.add('tv-profil-ark');
  clearTimeout(tvProfilTimer);
  tvProfilTimer = setTimeout(() => { if (!arkEl.hidden && document.querySelector('#ark-indhold .tv-profil')) lukArk(); }, TV_PROFIL_SEK * 1000);
}

// Når en kolonne ikke kan være der: skær linjer af (først i "Kommer", så indkøb …) og skriv "+2 mere"
function tvTilpas(kol) {
  const indre = kol.querySelector('.tv-indre');
  const forHoej = () => indre.scrollHeight > indre.clientHeight + 1;
  let vagt = 200;
  while (forHoej() && vagt-- > 0) {
    const dele = [...indre.querySelectorAll('.tv-del')].sort((a, b) => b.dataset.prio - a.dataset.prio);
    const del = dele.find(d => d.querySelectorAll('.tv-linje:not(.tv-mere)').length > Number(d.dataset.min))
      || dele.find(d => d.querySelectorAll('.tv-linje:not(.tv-mere)').length > 0 && d.dataset.min !== '99');
    if (!del) break;
    const linjer = del.querySelectorAll('.tv-linje:not(.tv-mere)');
    linjer[linjer.length - 1].remove();
    // Et afsnit, der kan undværes ("Kommer"), og som nu er tomt, fjernes helt – ikke bare "+2 mere"
    if (del.dataset.min === '0' && linjer.length === 1) { del.remove(); continue; }
    let mere = del.querySelector('.tv-mere');
    if (!mere) { mere = el('li', 'tv-linje tv-mere'); mere.dataset.n = 0; del.querySelector('.tv-liste').append(mere); }
    mere.dataset.n = Number(mere.dataset.n) + 1;
    mere.textContent = '+' + mere.dataset.n + ' mere';
  }
  // Kan stadig ikke være der (fx mange pligter): lad pligterne blive, men gør skriften lidt mindre i den kolonne
  kol.classList.toggle('tv-taet', forHoej());
}

function tvTegnSnart(ms = 200) { clearTimeout(tvTimer); tvTimer = setTimeout(tegnTavlen, ms); }

async function tegnTavlen() {
  const gen = ++tvGen;
  const boks = document.getElementById('tavlen');
  if (!boks) return;
  tvTema();
  const iso = tvVisIso();   // i dag – eller i morgen fra kl. 19.30
  const alle = await Data.list('kalender');   // KUN den fælles kalender – kalender_voksne/kalender_privat hentes aldrig her
  const kolonner = [];
  for (const n of ['Fælles', 'voksne', ...BOERN]) {
    try { kolonner.push(n === 'voksne' ? await tvVoksenKolonne(alle, iso) : await tvKolonne(n, alle, iso)); }
    catch (e) { console.warn('Tavlen', n, e); const k = el('div', 'tv-kol ' + (PK[n] || 'tv-voksne')); k.append(el('h2', 'tv-navn', n === 'voksne' ? TV_VOKSNE.join(' · ') : n), el('p', 'tv-tom', '…')); kolonner.push(k); }
  }
  try { await tvMad(iso); } catch (e) { console.warn('Tavlen mad', e); }
  if (gen !== tvGen) return;   // en nyere tegning er i gang
  const gitter = document.getElementById('tv-gitter');
  // Et tryk i gang (knappen er låst) – vent lidt, så rækken ikke hopper under fingeren
  if (gitter.querySelector('.tv-tryk:disabled')) { tvTegnSnart(500); return; }
  gitter.replaceChildren(...kolonner);
  kolonner.forEach(tvTilpas);
  tvHoved();
}

// ---------- Toppen: ur, dato, vejr, net ----------
let tvVejr = '', tvVejrTid = 0;
function tvHoved() {
  const d = new Date();
  document.getElementById('tv-ur').textContent = tvKl();
  const vis = tvVisIso();
  document.getElementById('tv-dato').textContent = DAGE_LANG[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()] + ' · uge ' + ugenummer(d)
    + (vis !== tvIdag() ? ' · 🌙 viser ' + DAGE_LANG[(tilDag(vis).getDay() + 6) % 7].toLowerCase() : '');
  const net = document.getElementById('tv-net');
  const uden = Data.udenNet() || !navigator.onLine;
  const n = Data.venter();
  net.hidden = !uden;
  net.textContent = '📡 Uden net' + (n ? ' – ' + n + ' venter' : '');
  document.getElementById('tv-vejr').textContent = tvVejr;
  if (Date.now() - tvVejrTid > 30 * 60000) {
    tvVejrTid = Date.now();
    (async () => {
      try {
        const data = await hentVejr();
        const dag = data && vejrDag(data, isoDato(new Date()));
        tvVejr = dag ? vejrIkon(data.current.weather_code) + ' ' + grader(data.current.temperature_2m) + ' · ' + grader(dag.min) + '–' + grader(dag.max) + (dag.kort.length ? ' · ' + dag.kort.slice(0, 2).join(' · ') : '') : '';
      } catch (e) { tvVejr = ''; }
      document.getElementById('tv-vejr').textContent = tvVejr;
    })();
  }
}

// Lys om dagen, mørk om aftenen – og ekstra dæmpet om natten
// Valget gemmes på tabletten (lokal 'tavle-tema'): 'auto' (efter klokken, standard), 'lys' eller 'moerk'
const TV_TEMA_NAVN = { auto: '🕒 Efter klokken', lys: '☀️ Lys', moerk: '🌙 Mørk' };
const tvTemaValg = () => (TV_TEMA_NAVN[lokal.get('tavle-tema')] ? lokal.get('tavle-tema') : 'auto');
function tvTema() {
  const m = tvMin(), valg = tvTemaValg();
  saetTema(valg !== 'auto' ? valg : m >= TV_LYS[0] && m < TV_LYS[1] ? 'lys' : 'moerk');
  document.body.classList.toggle('tv-nat', valg === 'auto' && (m >= TV_NAT[0] || m < TV_NAT[1]));
}

// ---------- Står tændt i dagevis ----------
let tvLaas = null;
async function tvHoldVaagen() {
  try {
    if ('wakeLock' in navigator && document.visibilityState === 'visible' && !tvLaas) {
      tvLaas = await navigator.wakeLock.request('screen');
      tvLaas.addEventListener('release', () => { tvLaas = null; });
    }
  } catch (e) { tvLaas = null; }   // fx strømsparetilstand – Android-indstillingen "hold skærmen tændt" klarer resten
}
// Genindlæs én gang hver nat (kl. 3–4): ny version af appen, frisk hukommelse og forbindelse. Kun med net og uden ventende ændringer.
function tvNatGenstart() {
  const d = new Date();
  if (d.getHours() !== 3 || !navigator.onLine || Data.udenNet() || Data.venter()) return;
  const iso = isoDato(d);
  if (lokal.get('tavle-genstart') === iso) return;
  lokal.set('tavle-genstart', iso);
  location.reload();
}

const tvFuldTil = () => lokal.get('tavle-fuld') !== 'nej';
function tvFuldSkaerm() {
  if (!tvFuldTil() || document.fullscreenElement || !document.documentElement.requestFullscreen) return;
  document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
}

// Hold fingeren på uret i 3 sekunder → Opdatér / Log ud (så ingen kommer til det ved et uheld)
function tvMenu() {
  document.getElementById('ark').classList.remove('tv-profil-ark');
  const opdater = knap('🔄 Opdatér nu', 'knap', () => location.reload());
  const ud = bekraeftKnap('Log Tavlen ud', 'logge Tavlen ud', 'lille-knap fare', () => Data.logud());
  const tema = chipValg(Object.keys(TV_TEMA_NAVN), tvTemaValg(), v => { lokal.set('tavle-tema', v); tvTema(); }, v => TV_TEMA_NAVN[v]);
  const fuld = chipValg(['ja', 'nej'], tvFuldTil() ? 'ja' : 'nej', v => {
    lokal.set('tavle-fuld', v);
    if (v === 'ja') tvFuldSkaerm(); else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, v => (v === 'ja' ? '⛶ Til' : 'Fra'));
  aabnArk('Tavlen', felt('Udseende', tema), felt('Fuld skærm', fuld), el('p', 'hint', 'Efter klokken = lys kl. 06–20, mørk om aftenen og dæmpet om natten. Alt andet laves på telefonerne.'), opdater, ud);
}

async function startTavlen() {
  document.body.classList.add('tavlen');
  const boks = document.getElementById('tavlen');
  boks.hidden = false;
  const ur = document.getElementById('tv-ur');
  let holdT = null;
  ur.addEventListener('pointerdown', () => { clearTimeout(holdT); holdT = setTimeout(tvMenu, 3000); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => ur.addEventListener(t, () => clearTimeout(holdT)));
  ur.addEventListener('contextmenu', e => e.preventDefault());
  // Fuld skærm (uden Androids statuslinje og knapper): kræver et tryk – så det første tryk på tavlen slår det til igen,
  // fx efter genindlæsningen om natten. Fra/til i menuen (hold på uret); gemmes på tabletten (lokal 'tavle-fuld').
  document.addEventListener('pointerdown', tvFuldSkaerm, true);
  Data.onChange(() => tvTegnSnart(400));
  window.addEventListener('online', () => { tvHoved(); tvTegnSnart(); });
  window.addEventListener('offline', tvHoved);
  window.addEventListener('resize', () => tvTegnSnart(300));
  document.fonts?.ready?.then(() => tvTegnSnart(50));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tvHoldVaagen(); tvTegnSnart(); } });
  setInterval(tvHoved, 15000);                                // uret
  setInterval(() => { tvNatGenstart(); tvTegnSnart(); }, 60000);   // tider, "forbi", skole slut, lys/mørk, ny dag ved midnat
  tvHoldVaagen();
  document.body.dataset.tilstand = 'klar';
  tvHoved();
  await tegnTavlen();
}
