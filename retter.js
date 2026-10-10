// retter.js – retterne som et lille katalog: kort navn, fyld, tilbehør, ekstra, varianter og kategori.
// Data: favoritter (type 'ret' | 'morgen' | 'frokost') {tekst, gruppe?, fyld?: [..], side?, sider?: [..], ekstra?: [..], varianter?: [{navn, tekst?, slukket?}], ikkeAuto?}
//   fyld = fyld/pålæg der passer (burger, pita, pizza, rugbrød …) – der kan vælges flere: "Pizza med skinke og pepperoni",
//   side = standardtilbehør (står på tavlen), sider = tilbehør der passer (inkl. standard; mangler = [side]),
//   ekstra = ting der kan komme med (hvidløgsbrød, flute …). Hele teksten: "Chicken nuggets med nudler og hvidløgsbrød".
//        (ingrediens/ikkeAlternativ findes i data fra opdatering-retter.sql, men bruges ikke længere)
// En variant hedder "<ret> med <navn>" (fx "Burger med flæskesteg"), medmindre den har sin egen tekst ("Franske hotdogs").
// Tilbehør (side): ris, nudler, pasta, pommes … er IKKE en del af rettens navn. En ret har evt. et standardtilbehør
// (favoritter.side, fx 'ris'), som vises på tavlen: "Kylling i karry med ris". Skriver man selv "Kyllingespyd med nudler",
// genkendes det som Kyllingespyd + nudler. Børnene vælger IKKE tilbehør/varianter i appen (Timmos valg: det aftales ved
// bordet) – de kan kun ønske en anden ret, som før. Opsætningen: opdatering-retter.sql + opdatering-retter-2.sql.

const RET_GRUPPER = [
  ['kylling', '🐔', 'Kylling'], ['gris', '🐷', 'Gris'], ['okse', '🐮', 'Okse'], ['poelser', '🌭', 'Pølser'], ['fisk', '🐟', 'Fisk'],
  ['burger', '🍔', 'Burger, pita og wraps'], ['pizza', '🍕', 'Hjemmelavet pizza og bagværk'], ['takeaway', '🥡', 'Takeaway'],
  ['supper', '🍲', 'Supper og klassikere'], ['soedt', '🥞', 'Det søde']
];
const GRUPPE_NAVN = Object.fromEntries(RET_GRUPPER.map(([k, i, n]) => [k, i + ' ' + n]));
const MAAL_TYPER = ['ret', 'morgen', 'frokost'];

const lavt = t => (t || '').trim().toLowerCase();
// Listerne over fyld, tilbehør og ekstra kan rettes af de voksne. Data: 'indstillinger' {noegle: 'tilbehoer', vaerdi: {fyld: [..], sider: [..], ekstra: [..]}}
const STANDARD_SIDER = ['ris', 'nudler', 'pasta', 'pommes', 'rösti', 'kartofler', 'kartoffelmos', 'kartoffelsalat', 'brød'];
const STANDARD_EKSTRA = ['hvidløgsbrød', 'flute', 'salat', 'rødkål', 'agurkesalat', 'majs'];
const STANDARD_FYLD = ['skinke', 'ost', 'pepperoni', 'kylling', 'kebab', 'flæskesteg', 'pulled pork', 'oksebøf', 'bacon', 'pølser', 'tun',
  'leverpostej', 'spegepølse', 'kødpølse', 'æg', 'hønsesalat', 'nutella', 'pålægschokolade', 'marmelade'];
let SIDER = [...STANDARD_SIDER], EKSTRA = [...STANDARD_EKSTRA], FYLD = [...STANDARD_FYLD];
async function tilbehoerRaekke() { return (await Data.list('indstillinger')).find(x => x.noegle === 'tilbehoer') || null; }
async function hentTilbehoer() {
  const v = (await tilbehoerRaekke())?.vaerdi || {};
  SIDER = Array.isArray(v.sider) ? v.sider : [...STANDARD_SIDER];
  EKSTRA = Array.isArray(v.ekstra) ? v.ekstra : [...STANDARD_EKSTRA];
  FYLD = Array.isArray(v.fyld) ? v.fyld : [...STANDARD_FYLD];
}
async function gemTilbehoer() {
  const r = await tilbehoerRaekke(), vaerdi = { fyld: FYLD, sider: SIDER, ekstra: EKSTRA };
  if (r) await Data.update('indstillinger', r.id, { vaerdi }); else await Data.add('indstillinger', { noegle: 'tilbehoer', vaerdi });
}
const passerSider = f => Array.isArray(f.sider) ? f.sider : (f.side ? [f.side] : []);
const passerEkstra = f => Array.isArray(f.ekstra) ? f.ekstra : [];
const passerFyld = f => Array.isArray(f.fyld) ? f.fyld : [];
// Alle kendte ekstra (listen + dem retterne selv har)
const alleEkstra = favs => [...new Set([...EKSTRA, ...favs.flatMap(passerEkstra)].map(lavt))];
const alleFyld = favs => [...new Set([...FYLD, ...favs.flatMap(passerFyld)].map(lavt))];
const alleSider = favs => [...new Set([...SIDER, ...favs.flatMap(passerSider)].map(lavt))];
// "a", "a og b", "a, b og c"
const oprems = d => d.length < 2 ? (d[0] || '') : d.slice(0, -1).join(', ') + ' og ' + d[d.length - 1];
// Hele teksten: ret (evt. variant) + fyld + tilbehør + ekstra – "Pita med kebab, pommes og salat"
function komponer(f, v, side, ekstra = [], fyld = []) {
  const base = v ? variantTekst(f, v) : f.tekst;
  const dele = [...fyld, side, ...ekstra].filter(Boolean);
  if (!dele.length) return base;
  return / med /i.test(base) ? oprems([base, ...dele]) : base + ' med ' + oprems(dele);
}
const variantTekst = (f, v) => v.tekst || (f.tekst + ' med ' + v.navn);
const aktiveVarianter = f => (Array.isArray(f.varianter) ? f.varianter : []).filter(v => !v.slukket);

// Find retten (og evt. varianten) bag en tekst. Først i måltidets egen liste, så i de andre (morgenmad som aftensmad).
function findPraecis(favs, felt, t) {
  const typer = [felt, ...MAAL_TYPER.filter(x => x !== felt)];
  for (const type of typer) {
    for (const f of favs.filter(x => x.type === type)) {
      if (lavt(f.tekst) === t) return { fav: f, variant: null };
      const v = (Array.isArray(f.varianter) ? f.varianter : []).find(v => lavt(variantTekst(f, v)) === t);
      if (v) return { fav: f, variant: v };
    }
  }
  return null;
}
// Finder også "Chicken nuggets med nudler og hvidløgsbrød" = Chicken nuggets + tilbehøret nudler + ekstra hvidløgsbrød,
// og "Pizza med skinke og pepperoni" = Pizza + fyld skinke og pepperoni.
// Svarer {fav, variant, fyld, side, ekstra} (side = valgt tilbehør eller null, fyld/ekstra = lister)
function findRet(favs, felt, tekst) {
  let t = lavt(tekst);
  if (!t) return null;
  const kendte = [...new Set([...alleFyld(favs), ...alleSider(favs), ...alleEkstra(favs)])].sort((a, b) => b.length - a.length);
  const fjernet = [];
  for (let runde = 0; runde < 6; runde++) {
    const fund = findPraecis(favs, felt, t);
    if (fund) {
      const dele = fjernet.reverse(), f = fund.fav;
      const egneFyld = passerFyld(f).map(lavt), egneSider = passerSider(f).map(lavt), egneEkstra = passerEkstra(f).map(lavt);
      // Rettens egne lister først, så de fælles
      const erFyld = d => egneFyld.includes(d) || (!egneSider.includes(d) && !egneEkstra.includes(d) && alleFyld(favs).includes(d) && !alleSider(favs).includes(d));
      const fyld = dele.filter(erFyld);
      const side = dele.find(d => !fyld.includes(d) && (egneSider.includes(d) || (!egneEkstra.includes(d) && alleSider(favs).includes(d)))) || null;
      return { ...fund, fyld, side, ekstra: dele.filter(d => d !== side && !fyld.includes(d)) };
    }
    let fandt = false;
    for (const d of kendte) {
      for (const led of [' med ', ' og ', ', ']) {
        if (t.endsWith(led + d)) { t = t.slice(0, -(led + d).length).trim(); fjernet.push(d); fandt = true; break; }
      }
      if (fandt) break;
    }
    if (!fandt) return null;
  }
  return null;
}
// Teksten der vises: med det valgte tilbehør, ellers rettens standardtilbehør (+ evt. ekstra)
function retVisning(favs, felt, tekst) {
  const fund = findRet(favs, felt, tekst);
  return fund ? komponer(fund.fav, fund.variant, fund.side || fund.fav.side, fund.ekstra, fund.fyld) : tekst;
}
// Alle tekster en ret kan stå som (selve retten + aktive varianter + med ét slags fyld)
const retTekster = f => [f.tekst, ...aktiveVarianter(f).map(v => variantTekst(f, v)), ...passerFyld(f).map(y => f.tekst + ' med ' + y)];

// Til forslagslisten i tekstfelterne: retter + varianter (+ morgen/frokost til aftensmad, men bagerst)
function forslagTekster(favs, felt) {
  const egne = favs.filter(f => f.type === felt).flatMap(retTekster);
  const andre = felt === 'ret' ? favs.filter(f => f.type !== 'ret' && MAAL_TYPER.includes(f.type)).flatMap(retTekster) : [];
  return [...new Set([...egne, ...andre])];
}

// Til terningen: hver ret (ikke ikkeAuto/takeaway) med en tilfældig aktiv variant, ét tilfældigt fyld og et tilfældigt tilbehør der passer
const vilkaarlig = a => a[Math.floor(Math.random() * a.length)];
function autoRetter(favs, felt) {
  return favs.filter(f => f.type === felt && !f.ikkeAuto && f.gruppe !== 'takeaway').map(f => {
    const v = aktiveVarianter(f), sider = passerSider(f), fyld = passerFyld(f);
    const side = sider.length > 1 ? vilkaarlig(sider) : null;
    // Enten en variant (fx "Hjemmelavet pizza margherita") eller ét fyld – aldrig begge
    const medFyld = fyld.length && Math.random() < fyld.length / (fyld.length + v.length);
    return { fav: f, tekst: komponer(f, !medFyld && v.length ? vilkaarlig(v) : null, side && side !== f.side ? side : null, [], medFyld ? [vilkaarlig(fyld)] : []) };
  });
}

// Omdøbes en ret, rettes den også i madplaner og faste planer ("Nuggets med nudler" → "Chicken nuggets med nudler")
async function omdoebIPlaner(f, gammel, ny) {
  const g = lavt(gammel);
  for (const liste of ['madplan', 'fastplan']) {
    for (const r of await Data.list(liste)) {
      const ret = {};
      for (const m of MAAL_TYPER) {
        const t = r[m];
        if (typeof t === 'string' && (lavt(t) === g || lavt(t).startsWith(g + ' med ') || lavt(t).startsWith(g + ' og ') || lavt(t).startsWith(g + ', ')))
          ret[m] = ny + t.slice(gammel.length);
      }
      if (Object.keys(ret).length) await Data.stille(() => Data.update(liste, r.id, ret));
    }
  }
}

// ---------- Voksne: ret en ret i kataloget ----------
function redigerRet(f) {
  const s = {
    tekst: f.tekst, gruppe: f.gruppe || '', side: f.side || '', ikkeAuto: !!f.ikkeAuto,
    sider: [...passerSider(f)], ekstra: [...passerEkstra(f)], fyld: [...passerFyld(f)],
    varianter: (Array.isArray(f.varianter) ? f.varianter : []).map(v => ({ ...v }))
  };
  const erAften = f.type === 'ret';
  const navn = input('text', 'ret-navn', s.tekst);
  navn.addEventListener('input', () => { s.tekst = navn.value; tegnHint(); });
  const gruppeValg = chipValg(['', ...RET_GRUPPER.map(g => g[0])], s.gruppe, v => { s.gruppe = v; }, v => (v ? GRUPPE_NAVN[v] : 'Ingen'));

  // Tilbehør der passer (flere) + hvilket der står på tavlen
  const siderBoks = el('div'), standardBoks = el('div'), ekstraBoks = el('div'), fyldBoks = el('div'), hint = el('p', 'hint');
  const flereValg = (muligheder, liste, tegnIgen) => {
    const seg = el('div', 'seg wrap flere-valg');
    seg.append(...muligheder.map(m => {
      const valgt = liste.map(lavt).includes(lavt(m));
      const k = knap((valgt ? '✓ ' : '') + m, null, () => {
        const i = liste.map(lavt).indexOf(lavt(m));
        if (i >= 0) liste.splice(i, 1); else liste.push(m);
        tegnIgen();
      });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', valgt);
      return k;
    }));
    return seg;
  };
  const tegnHint = () => { hint.textContent = 'På tavlen: "' + komponer({ tekst: s.tekst || '…' }, null, s.side) + '". Det andet kan vælges med et tryk under dagen på madplanen.'; };
  const tegnSider = () => {
    if (s.side && !s.sider.includes(s.side)) s.side = '';
    if (!s.side && s.sider.length) s.side = s.sider[0];
    siderBoks.replaceChildren(flereValg([...new Set([...SIDER, ...s.sider])], s.sider, tegnSider));
    standardBoks.replaceChildren();
    if (s.sider.length > 1) standardBoks.append(el('label', 'felt-label lille-label', 'Står på tavlen, hvis I ikke vælger andet'),
      chipValg(s.sider, s.side, v => { s.side = v; tegnHint(); }));
    tegnHint();
  };
  tegnSider();
  const tegnEkstra = () => {
    const muligheder = [...new Set([...EKSTRA, ...s.ekstra.map(lavt)])];
    ekstraBoks.replaceChildren(flereValg(muligheder, s.ekstra, tegnEkstra));
  };
  tegnEkstra();
  const tegnFyld = () => fyldBoks.replaceChildren(flereValg([...new Set([...FYLD, ...s.fyld.map(lavt)])], s.fyld, tegnFyld));
  tegnFyld();
  const nyFyld = input('text', 'fyld-ny', '', erAften ? 'Andet fyld, fx tun' : 'Andet pålæg, fx rullepølse');
  const fyldForm = el('form', 'oenske-form');
  fyldForm.append(nyFyld, el('button', 'knap', 'Tilføj'));
  fyldForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = lavt(nyFyld.value);
    if (t && !s.fyld.map(lavt).includes(t)) s.fyld.push(t);
    if (t && !FYLD.map(lavt).includes(t)) { FYLD = [...FYLD, t]; gemTilbehoer(); }
    nyFyld.value = ''; tegnFyld();
  });
  const nySide = input('text', 'side-ny', '', 'Andet tilbehør, fx couscous');
  const sideForm = el('form', 'oenske-form');
  sideForm.append(nySide, el('button', 'knap', 'Tilføj'));
  sideForm.addEventListener('submit', async e => {
    e.preventDefault();
    const t = lavt(nySide.value);
    if (!t) return;
    if (!s.sider.map(lavt).includes(t)) s.sider.push(t);
    if (!SIDER.map(lavt).includes(t)) { SIDER = [...SIDER, t]; await gemTilbehoer(); }   // kommer også på den fælles liste
    nySide.value = ''; tegnSider();
  });
  const nyEkstra = input('text', 'ekstra-ny', '', 'Andet, fx tzatziki');
  const ekstraForm = el('form', 'oenske-form');
  ekstraForm.append(nyEkstra, el('button', 'knap', 'Tilføj'));
  ekstraForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = lavt(nyEkstra.value);
    if (t && !s.ekstra.map(lavt).includes(t)) s.ekstra.push(t);
    if (t && !EKSTRA.map(lavt).includes(t)) { EKSTRA = [...EKSTRA, t]; gemTilbehoer(); }
    nyEkstra.value = ''; tegnEkstra();
  });

  const varBoks = el('div');
  const tegnVar = () => {
    const ul = el('ul', 'tb-raekker');
    s.varianter.forEach((v, i) => {
      const li = el('li', 'var-raekke' + (v.slukket ? ' slukket' : ''));
      const t = el('span', 'tb-navn');
      t.append(el('span', null, variantTekst({ tekst: s.tekst }, v)));
      const til = knap(v.slukket ? 'Slukket' : 'Til', 'lille-knap tb-til', () => { v.slukket = !v.slukket; tegnVar(); });
      til.setAttribute('aria-pressed', !v.slukket);
      const slet = knap('', 'slet', () => { s.varianter.splice(i, 1); tegnVar(); });
      slet.innerHTML = IKON_SLET;
      slet.setAttribute('aria-label', 'Slet ' + v.navn);
      li.append(t, til, slet);
      ul.append(li);
    });
    if (!s.varianter.length) ul.append(el('li', 'tom', 'Ingen varianter – retten står bare som "' + s.tekst + '"'));
    varBoks.replaceChildren(ul);
  };
  tegnVar();
  const nyVar = input('text', 'var-ny', '', erAften ? 'Fx flæskesteg' : 'Fx ost');
  const form = el('form', 'oenske-form');
  form.append(nyVar, el('button', 'knap', 'Tilføj'));
  form.addEventListener('submit', e => {
    e.preventDefault();
    const t = nyVar.value.trim();
    if (!t || s.varianter.some(v => lavt(v.navn) === lavt(t))) return;
    s.varianter.push({ navn: t });
    nyVar.value = ''; tegnVar(); nyVar.focus();
  });
  const flag = (tekst, felt, omvendt) => {
    const k = knap(tekst, null, () => { s[felt] = !s[felt]; k.setAttribute('aria-checked', omvendt ? !s[felt] : s[felt]); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', omvendt ? !s[felt] : s[felt]);
    return k;
  };
  const flag1 = el('div', 'seg wrap tilpas-valg');
  flag1.append(flag('🎲 Med i terningen', 'ikkeAuto', true));

  const gem = knap('Gem', 'knap', async () => {
    if (!s.tekst.trim()) { navn.focus(); return; }
    const felter = {
      tekst: s.tekst.trim(), ikkeAuto: s.ikkeAuto, fyld: s.fyld,
      varianter: s.varianter.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false && x !== '')))
    };
    if (erAften) Object.assign(felter, { gruppe: s.gruppe || null, side: s.side || null, sider: s.sider, ekstra: s.ekstra });
    const gammel = f.tekst;
    await Data.update('favoritter', f.id, felter);
    if (felter.tekst !== gammel) await omdoebIPlaner(f, gammel, felter.tekst);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('favoritter', f.id); lukArk(); tegnAlt(); }), gem);
  const dele = [felt('Navn', navn)];
  if (erAften) dele.push(el('label', 'felt-label', 'Kategori'), gruppeValg);
  dele.push(el('label', 'felt-label', erAften ? 'Fyld der passer (fx i burgeren, på pizzaen)' : 'Pålæg der passer'), fyldBoks, fyldForm);
  if (erAften) dele.push(
    el('label', 'felt-label', 'Tilbehør der passer'), siderBoks, sideForm, standardBoks,
    el('label', 'felt-label', 'Ekstra der kan komme med'), ekstraBoks, ekstraForm, hint);
  dele.push(el('details', 'var-detaljer'));
  const det = dele[dele.length - 1];
  det.open = s.varianter.length > 0;
  det.append(el('summary', null, 'Varianter med eget navn (fx Franske hotdogs)'), varBoks, form);
  dele.push(el('p', 'hint', 'Fyld, tilbehør og ekstra vælges under dagen med "✎ Tilpas". Terningen vælger selv ét fyld og et tilbehør.'), flag1, knapper);
  aabnArk(MAALTIDER[f.type] + ': ' + f.tekst, ...dele);
}

// Under en dag i madplanen (voksne): én lille "Tilpas"-knap → ark med varianter, tilbehør og ekstra (alt kan ses, intet løber ud af skærmen)
function retChips(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  if (!fund || fund.fav.type !== felt) return null;
  const f = fund.fav;
  const kanSide = passerSider(f).length > 1 || (passerSider(f).length && !f.side);
  if (!aktiveVarianter(f).length && !kanSide && !passerEkstra(f).length && !passerFyld(f).length) return null;
  const boks = el('div', 'var-chips');
  const k = knap('✎ Tilpas', 'var-chip tilpas-chip', () => tilpasRet(favs, felt, tekst, vaelg));
  k.setAttribute('aria-label', 'Tilpas ' + f.tekst + ': fyld, tilbehør og ekstra');
  boks.append(k);
  return boks;
}

function tilpasRet(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  const f = fund.fav;
  const vs = aktiveVarianter(f), sider = passerSider(f), ekstra = passerEkstra(f);
  // Fyld: rettens eget + det der står i teksten (fx gammelt fyld der ikke længere er på listen)
  const fyldListe = [...new Set([...passerFyld(f).map(lavt), ...fund.fyld])];
  const nu = { variant: fund.variant, side: fund.side, ekstra: fund.ekstra.map(lavt), fyld: fund.fyld.map(lavt) };
  const fyldNu = () => fyldListe.filter(y => nu.fyld.includes(y));   // altid i rettens rækkefølge
  const tekstNu = () => komponer(f, nu.variant, nu.side || (nu.ekstra.length ? f.side : null), nu.ekstra, fyldNu());
  const vis = el('p', 'tilpas-vis');
  const indhold = el('div');
  const vaelgKnap = (navn, valgt, fn) => {
    const k = knap((valgt ? '✓ ' : '') + navn, null, async () => { fn(); tegn(); await vaelg(tekstNu()); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', valgt);
    return k;
  };
  const raekke = (titel, knapper) => {
    const seg = el('div', 'seg wrap flere-valg');
    seg.append(...knapper);
    indhold.append(el('label', 'felt-label', titel), seg);
  };
  const tegn = () => {
    vis.replaceChildren(komponer(f, nu.variant, nu.side || f.side, nu.ekstra, fyldNu()));
    indhold.replaceChildren();
    // En variant med eget navn (fx "Hjemmelavet pizza margherita") og fyld udelukker hinanden
    if (vs.length) raekke('Variant', vs.map(v => vaelgKnap(v.navn, nu.variant === v, () => {
      nu.variant = nu.variant === v ? null : v;
      if (nu.variant?.tekst) nu.fyld = [];
    })));
    if (fyldListe.length) raekke(f.type === 'ret' ? 'Fyld' : 'Pålæg', fyldListe.map(y => {
      const med = nu.fyld.includes(y);
      return vaelgKnap(y, med, () => { nu.fyld = med ? nu.fyld.filter(x => x !== y) : [...nu.fyld, y]; if (nu.variant?.tekst) nu.variant = null; });
    }));
    if (sider.length > 1 || (sider.length && !f.side)) {
      const aktuel = lavt(nu.side || f.side);
      raekke('Tilbehør', sider.map(sd => vaelgKnap(sd, lavt(sd) === aktuel, () => {
        // Med standardtilbehør: standarden = intet valgt. Uden: tryk igen fjerner tilbehøret
        nu.side = lavt(sd) === lavt(f.side) || (!f.side && lavt(sd) === lavt(nu.side)) ? null : sd;
      })));
    }
    if (ekstra.length) raekke('Ekstra', ekstra.map(e => {
      const med = nu.ekstra.includes(lavt(e));
      return vaelgKnap(e, med, () => { nu.ekstra = med ? nu.ekstra.filter(x => x !== lavt(e)) : [...nu.ekstra, lavt(e)]; });
    }));
  };
  tegn();
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', lukArk));
  aabnArk('Tilpas: ' + f.tekst, vis, indhold,
    el('p', 'hint', 'Gemmes med det samme. Hvad der passer, rettes under "Vores lister" → tryk på retten.'), knapper);
}

// ---------- De fælles lister over tilbehør og ekstra (voksne) ----------
function redigerTilbehoerLister() {
  const boks = el('div');
  const sektion = (titel, hent, saet, pladsholder) => {
    const ul = el('div', 'seg wrap flere-valg');
    const tegn = () => ul.replaceChildren(...hent().map(t => {
      const k = knap(t + '  ✕', 'fjern-chip', async () => { saet(hent().filter(x => x !== t)); await gemTilbehoer(); tegn(); });
      k.setAttribute('aria-label', 'Fjern ' + t);
      return k;
    }));
    tegn();
    const inp = input('text', null, '', pladsholder);
    const form = el('form', 'oenske-form');
    form.append(inp, el('button', 'knap', 'Tilføj'));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const t = lavt(inp.value);
      if (t && !hent().map(lavt).includes(t)) { saet([...hent(), t]); await gemTilbehoer(); tegn(); }
      inp.value = ''; inp.focus();
    });
    boks.append(el('label', 'felt-label', titel), ul, form);
  };
  sektion('Fyld og pålæg', () => FYLD, v => { FYLD = v; }, 'Fx tun');
  sektion('Tilbehør', () => SIDER, v => { SIDER = v; }, 'Fx couscous');
  sektion('Ekstra', () => EKSTRA, v => { EKSTRA = v; }, 'Fx tzatziki');
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', () => { lukArk(); tegnAlt(); }));
  aabnArk('Fyld, tilbehør og ekstra', el('p', 'hint', 'Det I kan vælge imellem, når I retter en ret. Fjerner I noget her, bliver det stadig på de retter og dage, der allerede har det.'), boks, knapper);
}

// ---------- Til indkøbslisten: ekstra og tilbehør fra ugens madplan ----------
// tekster = ugens aftensretter. Svarer [{tekst, ekstra: true/false}] uden dubletter
function ugensTilbehoer(favs, tekster) {
  const ud = new Map();
  for (const t of tekster) {
    const fund = findRet(favs, 'ret', t);
    if (!fund) continue;
    for (const e of fund.ekstra) if (!ud.has(e)) ud.set(e, true);
    for (const y of fund.fyld) if (!ud.has(y)) ud.set(y, false);
    const side = lavt(fund.side || fund.fav.side);
    if (side && !ud.has(side)) ud.set(side, false);
  }
  return [...ud].map(([tekst, ekstra]) => ({ tekst, ekstra }));
}
async function tilIndkoeb(tekster) {
  const favs = await Data.list('favoritter');
  const paaListen = new Set((await Data.list('indkob')).filter(p => !p.klaret).map(p => lavt(p.tekst)));
  const ting = ugensTilbehoer(favs, tekster);
  const valgt = new Set(ting.filter(x => x.ekstra && !paaListen.has(x.tekst)).map(x => x.tekst));
  const liste = el('div', 'seg wrap flere-valg');
  const tilfoej = knap('', 'knap');
  const tegn = () => {
    liste.replaceChildren(...ting.map(x => {
      const findes = paaListen.has(x.tekst), med = valgt.has(x.tekst);
      const k = knap(findes ? x.tekst + ' · på listen' : (med ? '✓ ' : '') + x.tekst, findes ? 'paa-listen' : null, () => {
        if (findes) return;
        if (med) valgt.delete(x.tekst); else valgt.add(x.tekst);
        tegn();
      });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', med || findes);
      k.disabled = findes;
      return k;
    }));
    tilfoej.textContent = valgt.size ? 'Læg ' + valgt.size + ' på indkøbslisten' : 'Vælg noget';
    tilfoej.disabled = !valgt.size;
  };
  tilfoej.addEventListener('click', async () => {
    for (const t of valgt) { const tekst = t[0].toUpperCase() + t.slice(1); if (await tilfoejUdenDublet('indkob', { tekst, klaret: false })) await gemFavorit('indkob', tekst); }
    visStatus(valgt.size + ' lagt på indkøbslisten');
    lukArk(); tegnAlt();
  });
  tegn();
  const knapper = el('div', 'ark-knapper');
  knapper.append(tilfoej);
  aabnArk('🛒 Til indkøbslisten',
    el('p', 'hint', ting.length ? 'Ekstra, fyld og tilbehør fra ugens aftensmad. Ekstra er valgt på forhånd – tryk for at vælge til eller fra.' : 'Der er ingen ekstra eller tilbehør på ugens madplan.'),
    liste, knapper);
}

// ---------- Ryd op i retterne (voksne) ----------
// Finder retter der ligner en anden ("Nuggets m. nudler" ~ Chicken nuggets med nudler) og aftensretter uden kategori
const normaliser = t => lavt(t).replace(/\bm\.\s*/g, 'med ').replace(/\s*&\s*/g, ' og ').replace(/\s+/g, ' ');
function rydOpForslag(favs) {
  const maal = favs.filter(f => MAAL_TYPER.includes(f.type));
  const ligner = [];
  for (const f of maal) {
    if (f.ikkeLigner) continue;   // "Behold" er trykket
    const andre = favs.filter(x => x !== f);
    const fund = findRet(andre, f.type, normaliser(f.tekst));
    if (fund && fund.fav.type === f.type && !ligner.some(l => l.dub === fund.fav && l.maal === f)) {
      ligner.push({ dub: f, maal: fund.fav, ny: komponer(fund.fav, fund.variant, fund.side, fund.ekstra, fund.fyld) });
    }
  }
  const dubIds = new Set(ligner.map(l => l.dub.id));
  const udenKategori = maal.filter(f => f.type === 'ret' && !f.gruppe && !dubIds.has(f.id));
  return { ligner, udenKategori };
}
async function slaaSammen(dub, maal, ny) {
  await omdoebIPlaner(dub, dub.tekst, ny);
  const kanLide = [...new Set([...(dub.kanLide || []), ...(maal.kanLide || [])])];
  await Data.update('favoritter', maal.id, { brugt: (maal.brugt || 0) + (dub.brugt || 0), kanLide, ...(dub.boernevalg ? { boernevalg: true } : {}) });
  await Data.remove('favoritter', dub.id);
}
async function rydOp() {
  const favs = await Data.list('favoritter');
  const { ligner, udenKategori } = rydOpForslag(favs);
  const dele = [];
  if (ligner.length) {
    dele.push(el('label', 'felt-label', 'Ligner en anden ret'));
    const ul = el('ul', 'tb-raekker');
    for (const l of ligner) {
      const li = el('li', 'var-raekke ryd-raekke');
      const t = el('span', 'tb-navn');
      t.append(el('span', null, l.dub.tekst), el('small', 'hint', '→ ' + l.ny));
      li.append(t, knap('Behold', 'lille-knap', async () => { await Data.update('favoritter', l.dub.id, { ikkeLigner: true }); rydOp(); tegnAlt(); }),
        knap('Læg sammen', 'lille-knap', async () => { await slaaSammen(l.dub, l.maal, l.ny); visStatus(l.dub.tekst + ' er lagt sammen med ' + l.maal.tekst); rydOp(); tegnAlt(); }));
      ul.append(li);
    }
    dele.push(ul);
  }
  if (udenKategori.length) {
    dele.push(el('label', 'felt-label', 'Aftensmad uden kategori'), el('p', 'hint', 'Tryk på en ret for at give den en kategori (eller slette den).'));
    const seg = el('div', 'seg wrap flere-valg');
    seg.append(...udenKategori.map(f => knap(f.tekst, null, () => redigerRet(f))));
    dele.push(seg);
  }
  if (!dele.length) dele.push(el('p', 'tom', 'Alt ser ryddeligt ud 👍'));
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', lukArk));
  aabnArk('🧹 Ryd op i retterne', ...dele, knapper);
}
