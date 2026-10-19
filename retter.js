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

// Kategorier (aftalt okt. 2026): gryde/pasta/asiatisk/indisk/mexicansk går forud for kødet – ellers bestemmer kødet ('kylling' = Fjerkræ)
const RET_GRUPPER = [
  ['kylling', '🐔', 'Fjerkræ'], ['gris', '🐷', 'Gris'], ['okse', '🐮', 'Okse og kalv'], ['poelser', '🌭', 'Pølser'], ['fisk', '🐟', 'Fisk'],
  ['gryde', '🫕', 'Gryderetter'], ['pasta', '🍝', 'Pasta og risotto'], ['asiatisk', '🥢', 'Asiatisk'], ['indisk', '🍛', 'Indisk'], ['mex', '🌮', 'Mexicansk'],
  ['burger', '🍔', 'Burger, pita og wraps'], ['pizza', '🍕', 'Pizza, toast og bagværk'], ['supper', '🍲', 'Supper'],
  ['vegetar', '🥦', 'Vegetar'], ['takeaway', '🥡', 'Takeaway'], ['soedt', '🥞', 'Det søde']
];
const GRUPPE_NAVN = Object.fromEntries(RET_GRUPPER.map(([k, i, n]) => [k, i + ' ' + n]));
const MAAL_TYPER = ['ret', 'morgen', 'frokost'];
// En ret kan passe til flere måltider: type = hvor den hører til, ogsaa = de andre (fx Pita: type 'ret', ogsaa ['frokost'])
const passerTil = (f, m) => f.type === m || (Array.isArray(f.ogsaa) && f.ogsaa.includes(m));
const retMaaltider = f => [f.type, ...(Array.isArray(f.ogsaa) ? f.ogsaa : [])].filter((m, i, a) => MAAL_TYPER.includes(m) && a.indexOf(m) === i);

const lavt = t => (t || '').trim().toLowerCase();
// Listerne over fyld, tilbehør og ekstra kan rettes af de voksne. Data: 'indstillinger' {noegle: 'tilbehoer', vaerdi: {fyld: [..], sider: [..], ekstra: [..]}}
const STANDARD_SIDER = ['ris', 'nudler', 'pasta', 'pommes', 'rösti', 'kartofler', 'kartoffelmos', 'kartoffelsalat', 'brød'];
const STANDARD_EKSTRA = ['hvidløgsbrød', 'flute', 'salat', 'rødkål', 'agurkesalat', 'majs'];
const STANDARD_FYLD = ['skinke', 'ost', 'pepperoni', 'kylling', 'kebab', 'flæskesteg', 'pulled pork', 'oksebøf', 'bacon', 'pølser', 'tun',
  'leverpostej', 'spegepølse', 'kødpølse', 'æg', 'hønsesalat', 'nutella', 'pålægschokolade', 'marmelade'];
const STANDARD_SOVSE = ['brun sovs', 'flødesovs', 'bearnaise', 'persillesovs', 'sennepssovs', 'hvid sovs', 'karrysovs', 'tomatsovs', 'tzatziki'];
let SIDER = [...STANDARD_SIDER], EKSTRA = [...STANDARD_EKSTRA], FYLD = [...STANDARD_FYLD], SOVSE = [...STANDARD_SOVSE];
async function tilbehoerRaekke() { return (await Data.list('indstillinger')).find(x => x.noegle === 'tilbehoer') || null; }
async function hentTilbehoer() {
  const v = (await tilbehoerRaekke())?.vaerdi || {};
  SIDER = Array.isArray(v.sider) ? v.sider : [...STANDARD_SIDER];
  EKSTRA = Array.isArray(v.ekstra) ? v.ekstra : [...STANDARD_EKSTRA];
  FYLD = Array.isArray(v.fyld) ? v.fyld : [...STANDARD_FYLD];
  SOVSE = Array.isArray(v.sovse) ? v.sovse : [...STANDARD_SOVSE];
}
async function gemTilbehoer() {
  const r = await tilbehoerRaekke(), vaerdi = { fyld: FYLD, sider: SIDER, ekstra: EKSTRA, sovse: SOVSE };
  if (r) await Data.update('indstillinger', r.id, { vaerdi }); else await Data.add('indstillinger', { noegle: 'tilbehoer', vaerdi });
}
const passerSider = f => Array.isArray(f.sider) ? f.sider : (f.side ? [f.side] : []);
const passerEkstra = f => Array.isArray(f.ekstra) ? f.ekstra : [];
const passerFyld = f => Array.isArray(f.fyld) ? f.fyld : [];
// Sovs (okt. 2026): f.sovse = sovse der passer, f.sovs = standardsovs (står på tavlen) – én ad gangen, som tilbehør
const passerSovse = f => Array.isArray(f.sovse) ? f.sovse : (f.sovs ? [f.sovs] : []);
const alleSovse = favs => [...new Set([...SOVSE, ...favs.flatMap(passerSovse)].map(lavt))];
// Alle kendte ekstra (listen + dem retterne selv har)
const alleEkstra = favs => [...new Set([...EKSTRA, ...favs.flatMap(passerEkstra)].map(lavt))];
const alleFyld = favs => [...new Set([...FYLD, ...favs.flatMap(passerFyld)].map(lavt))];
const alleSider = favs => [...new Set([...SIDER, ...favs.flatMap(passerSider)].map(lavt))];
// "a", "a og b", "a, b og c"
const oprems = d => d.length < 2 ? (d[0] || '') : d.slice(0, -1).join(', ') + ' og ' + d[d.length - 1];

// ---------- Omdøb / slet et punkt på listerne over fyld, tilbehør og ekstra ----------
const LISTE_NAVN = { fyld: 'fyld', sider: 'tilbehør', ekstra: 'ekstra', sovse: 'sovs' };
const hentListe = type => (type === 'fyld' ? FYLD : type === 'sider' ? SIDER : type === 'sovse' ? SOVSE : EKSTRA);
const saetListe = (type, v) => { if (type === 'fyld') FYLD = v; else if (type === 'sider') SIDER = v; else if (type === 'sovse') SOVSE = v; else EKSTRA = v; };
const passerListe = (f, type) => (type === 'fyld' ? passerFyld(f) : type === 'sider' ? passerSider(f) : type === 'sovse' ? passerSovse(f) : passerEkstra(f));
const retterMed = (type, navn) => Data.listNu('favoritter')
  .filter(f => ['ret', 'morgen', 'frokost'].includes(f.type) && passerListe(f, type).map(lavt).includes(lavt(navn)));
// Lille boks i stedet for knapperne: hvor bruges den, Omdøb, Slet (med advarsel), Annullér.
// lokalt(gammel, ny|null) retter også den ret, man er i gang med (ikke gemt endnu). efter() tegner knapperne igen.
function punktPanel(type, navn, efter, lokalt = () => {}) {
  const brugt = retterMed(type, navn);
  const boks = el('div', 'punkt-panel');
  const navne = brugt.map(f => f.tekst);
  boks.append(el('p', 'punkt-panel-tekst', '"' + navn + '" ' + (brugt.length
    ? 'bruges af ' + brugt.length + (brugt.length === 1 ? ' ret: ' : ' retter: ') + oprems(navne.slice(0, 8)) + (navne.length > 8 ? ' …' : '')
    : 'bruges ikke af nogen ret.')));
  // Ret hver ret, der har punktet (fyld/sider/ekstra – og standardtilbehøret)
  const retAlle = async ny => {
    for (const f of brugt) {
      const liste = passerListe(f, type).filter(x => lavt(x) !== lavt(navn));
      if (ny && !liste.map(lavt).includes(ny)) liste.push(ny);
      const felter = { [type]: liste };
      if (type === 'sider' && lavt(f.side) === lavt(navn)) felter.side = ny || null;
      if (type === 'sovse' && lavt(f.sovs) === lavt(navn)) felter.sovs = ny || null;
      await Data.update('favoritter', f.id, felter);
    }
  };
  const nyNavn = input('text', 'punkt-nyt-navn', navn);
  nyNavn.setAttribute('aria-label', 'Nyt navn');
  const form = el('form', 'oenske-form');
  form.append(nyNavn, el('button', 'knap', 'Omdøb'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const ny = lavt(nyNavn.value);
    if (!ny || ny === lavt(navn)) { efter(); return; }
    const l = hentListe(type).map(x => (lavt(x) === lavt(navn) ? ny : x));
    saetListe(type, [...new Set(l.map(lavt))]);
    await gemTilbehoer(); await retAlle(ny); lokalt(navn, ny);
    visStatus('Omdøbt til "' + ny + '"' + (brugt.length ? ' på ' + brugt.length + (brugt.length === 1 ? ' ret' : ' retter') : ''));
    efter();
  });
  const slet = async () => {
    saetListe(type, hentListe(type).filter(x => lavt(x) !== lavt(navn)));
    await gemTilbehoer(); await retAlle(null); lokalt(navn, null);
    visStatus('"' + navn + '" er slettet' + (brugt.length ? ' – også fra ' + brugt.length + (brugt.length === 1 ? ' ret' : ' retter') : ''));
    efter();
  };
  const knapper = el('div', 'punkt-panel-knapper');
  knapper.append(brugt.length
    ? bekraeftKnap('🗑 Slet – også fra ' + brugt.length + (brugt.length === 1 ? ' ret' : ' retter'), 'slette', 'lille-knap fare', slet)
    : knap('🗑 Slet', 'lille-knap fare', slet),
    knap('Annullér', 'lille-knap', efter));
  boks.append(form, knapper, el('p', 'hint', 'Madplaner, hvor det allerede står, ændres ikke.'));
  setTimeout(() => boks.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
  return boks;
}
// Egne navne for kombinationer (okt. 2026): f.navne = [{navn, side?, sovs?, fyld?, variant?}]
// fx Kødsovs + tilbehør spaghetti = "Spaghetti bolognese". Navnet bruges, når kombinationen passer præcist
// (samme variant, tilbehør, sovs og fyld – hverken mere eller mindre); ekstra kommer bagefter: "Spaghetti bolognese med hvidløgsbrød".
const retNavne = f => (Array.isArray(f?.navne) ? f.navne : []).filter(n => n && n.navn);
function kombiNavn(f, v, side, fyld = [], sovs = null) {
  const ens = (a, b) => lavt(a || '') === lavt(b || '');
  return retNavne(f).find(n => ens(n.variant, v?.navn) && ens(n.side, side) && ens(n.sovs, sovs)
    && (n.fyld ? fyld.length === 1 && ens(fyld[0], n.fyld) : !fyld.length)) || null;
}
const kombiDele = n => [n.variant, ...(n.fyld ? [n.fyld] : []), n.side, n.sovs].filter(Boolean);
// Hele teksten: ret (evt. variant) + fyld + tilbehør + ekstra – "Pita med kebab, pommes og salat"
function komponer(f, v, side, ekstra = [], fyld = [], sovs = null) {
  const k = kombiNavn(f, v, side, fyld, sovs);
  if (k) return !ekstra.length ? k.navn : / med /i.test(k.navn) ? oprems([k.navn, ...ekstra]) : k.navn + ' med ' + oprems(ekstra);
  const base = v ? variantTekst(f, v) : f.tekst;
  const dele = [...fyld, side, sovs, ...ekstra].filter(Boolean);   // "Hakkebøf med kartofler og brun sovs"
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
      const n = retNavne(f).find(n => lavt(n.navn) === t);   // eget navn for en kombination
      if (n) return { fav: f, variant: n.variant ? (Array.isArray(f.varianter) ? f.varianter : []).find(v => lavt(v.navn) === lavt(n.variant)) || null : null, kombi: n };
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
  // "Burger med oksebøf uden pommes" = uden rettens faste tilbehør denne gang
  let udenSide = false, udenSovs = false;
  for (let i = 0; i < 2; i++) {   // "… uden pommes" / "… uden brun sovs" (begge kan stå)
    const uden = t.match(/^(.*\S) uden ([^,]+)$/);
    if (uden && alleSider(favs).includes(uden[2].trim())) { t = uden[1]; udenSide = true; }
    else if (uden && alleSovse(favs).includes(uden[2].trim())) { t = uden[1]; udenSovs = true; }
  }
  const kendte = [...new Set([...alleFyld(favs), ...alleSider(favs), ...alleSovse(favs), ...alleEkstra(favs)])].sort((a, b) => b.length - a.length);
  const fjernet = [];
  for (let runde = 0; runde < 6; runde++) {
    const fund = findPraecis(favs, felt, t);
    if (fund) {
      const dele = fjernet.reverse(), f = fund.fav;
      const egneFyld = passerFyld(f).map(lavt), egneSider = passerSider(f).map(lavt), egneEkstra = passerEkstra(f).map(lavt);
      // Rettens egne lister først, så de fælles
      const erFyld = d => egneFyld.includes(d) || (!egneSider.includes(d) && !egneEkstra.includes(d) && alleFyld(favs).includes(d) && !alleSider(favs).includes(d));
      let fyld = dele.filter(erFyld);
      let side = dele.find(d => !fyld.includes(d) && (egneSider.includes(d) || (!egneEkstra.includes(d) && alleSider(favs).includes(d)))) || null;
      let sovs = dele.find(d => !fyld.includes(d) && d !== side && alleSovse(favs).includes(d)) || null;
      const k = fund.kombi;   // "Spaghetti bolognese" = Kødsovs + spaghetti
      if (k) { if (k.side && !side) side = lavt(k.side); if (k.sovs && !sovs) sovs = lavt(k.sovs); if (k.fyld && !fyld.includes(lavt(k.fyld))) fyld = [lavt(k.fyld), ...fyld]; }
      const { kombi, ...uden } = fund;
      return { ...uden, fyld, side, sovs, udenSide: udenSide && !side, udenSovs: udenSovs && !sovs, ekstra: dele.filter(d => d !== side && d !== sovs && !fyld.includes(d)) };
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
  return fund ? komponer(fund.fav, fund.variant, fund.side || (fund.udenSide ? null : fund.fav.side), fund.ekstra, fund.fyld,
    fund.sovs || (fund.udenSovs ? null : fund.fav.sovs)) : tekst;
}
// Alle tekster en ret kan stå som (selve retten + aktive varianter + med ét slags fyld)
const retTekster = f => [f.tekst, ...aktiveVarianter(f).map(v => variantTekst(f, v)), ...passerFyld(f).map(y => f.tekst + ' med ' + y), ...retNavne(f).map(n => n.navn)];

// Til forslagslisten i tekstfelterne: retter + varianter (+ morgen/frokost til aftensmad, men bagerst)
function forslagTekster(favs, felt) {
  const egne = favs.filter(f => passerTil(f, felt)).flatMap(retTekster);
  const andre = felt === 'ret' ? favs.filter(f => !passerTil(f, 'ret') && MAAL_TYPER.includes(f.type)).flatMap(retTekster) : [];
  return [...new Set([...egne, ...andre])];
}

// Til terningen: hver ret (ikke ikkeAuto/takeaway) med en tilfældig aktiv variant, ét tilfældigt fyld og et tilfældigt tilbehør der passer
const vilkaarlig = a => a[Math.floor(Math.random() * a.length)];
function autoRetter(favs, felt) {
  return favs.filter(f => passerTil(f, felt) && !f.ikkeAuto && f.gruppe !== 'takeaway').map(f => {
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
    sider: [...passerSider(f)], ekstra: [...passerEkstra(f)], fyld: [...passerFyld(f)], sovse: [...passerSovse(f)], sovs: f.sovs || '',
    varianter: (Array.isArray(f.varianter) ? f.varianter : []).map(v => ({ ...v })), maal: retMaaltider(f),
    navne: retNavne(f).map(n => ({ ...n }))
  };
  const erAften = s.maal.includes('ret');   // tilbehør, sovs, ekstra og kategori bruges kun til aftensmad
  const aftenDele = [], katDele = [];
  const navn = input('text', 'ret-navn', s.tekst);
  navn.addEventListener('input', () => { s.tekst = navn.value; tegnHint(); });
  const gruppeValg = chipValg(['', ...RET_GRUPPER.map(g => g[0])], s.gruppe, v => { s.gruppe = v; }, v => (v ? GRUPPE_NAVN[v] : 'Ingen'));

  // Tilbehør der passer (flere) + hvilket der står på tavlen
  const siderBoks = el('div'), standardBoks = el('div'), ekstraBoks = el('div'), fyldBoks = el('div'), sovsBoks = el('div'), sovsStdBoks = el('div'), hint = el('p', 'hint');
  // Hold fingeren på et punkt → omdøb eller slet det på den fælles liste (og på alle retter)
  const flereValg = (muligheder, liste, tegnIgen, type) => {
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
      if (type) langtTryk(k, () => seg.replaceWith(punktPanel(type, m, tegnIgen, (gl, ny) => {
        const i = liste.map(lavt).indexOf(lavt(gl));
        if (i >= 0) { if (ny && !liste.map(lavt).includes(ny)) liste[i] = ny; else liste.splice(i, 1); }
        if (type === 'sider' && lavt(s.side) === lavt(gl)) s.side = ny || '';
        if (type === 'sovse' && lavt(s.sovs) === lavt(gl)) s.sovs = ny || '';
      })));
      return k;
    }));
    return seg;
  };
  const tegnHint = () => { hint.textContent = 'På tavlen: "' + komponer({ tekst: s.tekst || '…' }, null, s.side, [], [], s.sovs) + '". Det andet kan vælges med "✎ Tilpas" under dagen på madplanen.'; };
  let forrigeAntal = s.sider.length;
  const tegnSider = () => {
    if (s.side && !s.sider.includes(s.side)) s.side = '';
    if (!forrigeAntal && s.sider.length === 1 && !s.side) s.side = s.sider[0];   // første tilbehør bliver standard (kan sættes til "Intet")
    forrigeAntal = s.sider.length;
    siderBoks.replaceChildren(flereValg([...new Set([...SIDER, ...s.sider])], s.sider, tegnSider, 'sider'));
    standardBoks.replaceChildren();
    if (s.sider.length) standardBoks.append(el('label', 'felt-label lille-label', 'Står på tavlen, hvis I ikke vælger andet'),
      chipValg(['', ...s.sider], s.side, v => { s.side = v; tegnHint(); }, v => v || 'Intet'));
    tegnHint();
  };
  tegnSider();
  // Sovs der passer (flere) + standardsovs (står på tavlen)
  const tegnSovse = () => {
    if (s.sovs && !s.sovse.map(lavt).includes(lavt(s.sovs))) s.sovs = '';
    sovsBoks.replaceChildren(flereValg([...new Set([...SOVSE, ...s.sovse.map(lavt)])], s.sovse, tegnSovse, 'sovse'));
    sovsStdBoks.replaceChildren();
    if (s.sovse.length) sovsStdBoks.append(el('label', 'felt-label lille-label', 'Sovs på tavlen, hvis I ikke vælger andet'),
      chipValg(['', ...s.sovse], s.sovs, v => { s.sovs = v; tegnHint(); }, v => v || 'Ingen'));
    tegnHint();
  };
  tegnSovse();
  const nySovs = input('text', 'sovs-ny', '', 'Anden sovs, fx bearnaise');
  const sovsForm = el('form', 'oenske-form');
  sovsForm.append(nySovs, el('button', 'knap', 'Tilføj'));
  sovsForm.addEventListener('submit', async e => {
    e.preventDefault();
    const t = lavt(nySovs.value);
    if (!t) return;
    if (!s.sovse.map(lavt).includes(t)) s.sovse.push(t);
    if (!SOVSE.map(lavt).includes(t)) { SOVSE = [...SOVSE, t]; await gemTilbehoer(); }
    nySovs.value = ''; tegnSovse();
  });
  const tegnEkstra = () => {
    const muligheder = [...new Set([...EKSTRA, ...s.ekstra.map(lavt)])];
    ekstraBoks.replaceChildren(flereValg(muligheder, s.ekstra, tegnEkstra, 'ekstra'));
  };
  tegnEkstra();
  const tegnFyld = () => fyldBoks.replaceChildren(flereValg([...new Set([...FYLD, ...s.fyld.map(lavt)])], s.fyld, tegnFyld, 'fyld'));
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
  // Egne navne for kombinationer: "Spaghetti bolognese" = Kødsovs + spaghetti
  const navneBoks = el('div');
  const tegnNavne = () => {
    const ul = el('ul', 'tb-raekker');
    s.navne.forEach((n, i) => {
      const li = el('li', 'var-raekke');
      const t = el('span', 'tb-navn');
      t.append(el('strong', null, n.navn), el('span', 'kombi-dele', ' = ' + s.tekst + (kombiDele(n).length ? ' med ' + oprems(kombiDele(n)) : '')));
      const slet = knap('', 'slet', () => { s.navne.splice(i, 1); tegnNavne(); });
      slet.innerHTML = IKON_SLET;
      slet.setAttribute('aria-label', 'Slet navnet ' + n.navn);
      li.append(t, slet);
      ul.append(li);
    });
    if (!s.navne.length) ul.append(el('li', 'tom', 'Ingen egne navne endnu'));
    navneBoks.replaceChildren(ul);
  };
  tegnNavne();
  const ny = { side: s.side || '', sovs: s.sovs || '', fyld: '', variant: '' };
  const nyNavn = input('text', 'kombi-navn', '', 'Fx Spaghetti bolognese');
  const nyValg = el('div', 'kombi-valg'), nyVis = el('p', 'hint');
  const tegnNyValg = () => {
    const rk = [];
    const vaelger = (titel, felt, muligheder) => {
      if (!muligheder.length) return;
      if (ny[felt] && !muligheder.map(lavt).includes(lavt(ny[felt]))) ny[felt] = '';
      rk.push(el('label', 'felt-label lille-label', titel), chipValg(['', ...muligheder], ny[felt], v => { ny[felt] = v; tegnNyValg(); }, v => v || 'Intet'));
    };
    vaelger('Variant', 'variant', aktiveVarianter({ varianter: s.varianter }).map(v => v.navn));
    vaelger('Fyld', 'fyld', s.fyld);
    if (s.maal.includes('ret')) { vaelger('Tilbehør', 'side', s.sider); vaelger('Sovs', 'sovs', s.sovse); }
    nyValg.replaceChildren(...rk);
    const dele = kombiDele(ny);
    nyVis.textContent = 'Når der står "' + (s.tekst || '…') + (dele.length ? ' med ' + oprems(dele) : '') + '", vises navnet i stedet.';
  };
  tegnNyValg();
  const nyNavnForm = el('form', 'oenske-form');
  nyNavnForm.append(nyNavn, el('button', 'knap', 'Tilføj'));
  nyNavnForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = nyNavn.value.trim();
    if (!t) { nyNavn.focus(); return; }
    const n = { navn: t, ...Object.fromEntries(Object.entries(ny).filter(([, x]) => x)) };
    const samme = s.navne.findIndex(x => kombiDele(x).map(lavt).join('|') === kombiDele(n).map(lavt).join('|') && lavt(x.variant || '') === lavt(n.variant || ''));
    if (samme >= 0) s.navne.splice(samme, 1);   // én kombination = ét navn
    s.navne.push(n);
    nyNavn.value = ''; tegnNavne();
  });
  const flag = (tekst, felt, omvendt) => {
    const k = knap(tekst, null, () => { s[felt] = !s[felt]; k.setAttribute('aria-checked', omvendt ? !s[felt] : s[felt]); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', omvendt ? !s[felt] : s[felt]);
    return k;
  };
  const flag1 = el('div', 'seg wrap tilpas-valg');
  flag1.append(flag('🎲 Med i terningen', 'ikkeAuto', true));

  // Passer til: morgen / frokost / aften (mindst ét)
  const maalBoks = el('div', 'seg wrap maal-valg');
  const tegnMaal = () => maalBoks.replaceChildren(...['morgen', 'frokost', 'ret'].map(m => {
    const valgt = s.maal.includes(m);
    const k = knap((valgt ? '✓ ' : '') + MAALTIDER[m], null, () => {
      if (valgt && s.maal.length === 1) { visStatus('En ret skal passe til mindst ét måltid'); return; }
      s.maal = valgt ? s.maal.filter(x => x !== m) : [...s.maal, m];
      const aften = s.maal.includes('ret');
      for (const d of [...aftenDele, ...katDele]) d.hidden = !aften;
      tegnMaal();
    });
    k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', valgt);
    return k;
  }));
  tegnMaal();

  const gem = knap('Gem', 'knap', async () => {
    if (!s.tekst.trim()) { navn.focus(); return; }
    if (nyNavn.value.trim()) nyNavnForm.requestSubmit();   // et skrevet navn, man glemte at trykke Tilføj på, kommer med
    const felter = {
      tekst: s.tekst.trim(), ikkeAuto: s.ikkeAuto, fyld: s.fyld, navne: s.navne,
      varianter: s.varianter.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false && x !== '')))
    };
    const orden = ['morgen', 'frokost', 'ret'].filter(m => s.maal.includes(m));
    felter.type = s.maal.includes(f.type) ? f.type : orden[orden.length - 1];   // bliver hvor den er, hvis den stadig passer dér
    felter.ogsaa = orden.filter(m => m !== felter.type);
    if (s.maal.includes('ret')) Object.assign(felter, { gruppe: s.gruppe || null, side: s.side || null, sider: s.sider, ekstra: s.ekstra, sovse: s.sovse, sovs: s.sovs || null });
    const gammel = f.tekst;
    await Data.update('favoritter', f.id, felter);
    if (felter.tekst !== gammel) await omdoebIPlaner(f, gammel, felter.tekst);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(bekraeftKnap('Slet', 'slette retten', 'knap fare', async () => { await Data.remove('favoritter', f.id); lukArk(); tegnAlt(); }), gem);   // to tryk
  const dele = [felt('Navn', navn), el('label', 'felt-label', 'Passer til'), maalBoks];
  katDele.push(el('label', 'felt-label', 'Kategori (aftensmad)'), gruppeValg);
  dele.push(...katDele);
  dele.push(el('label', 'felt-label', erAften ? 'Fyld der passer (fx i burgeren, på pizzaen)' : 'Pålæg der passer'), fyldBoks, fyldForm);
  aftenDele.push(
    el('label', 'felt-label', 'Tilbehør der passer'), siderBoks, sideForm, standardBoks,
    el('label', 'felt-label', 'Sovs der passer'), sovsBoks, sovsForm, sovsStdBoks,
    el('label', 'felt-label', 'Ekstra der kan komme med'), ekstraBoks, ekstraForm, hint);
  dele.push(...aftenDele);
  for (const d of [...aftenDele, ...katDele]) d.hidden = !erAften;
  dele.push(el('details', 'var-detaljer'));
  const det = dele[dele.length - 1];
  det.open = s.varianter.length > 0;
  det.append(el('summary', null, 'Varianter med eget navn (fx Franske hotdogs)'), varBoks, form);
  const nd = el('details', 'var-detaljer');
  nd.open = s.navne.length > 0;
  nd.append(el('summary', null, 'Eget navn for en kombination (fx Spaghetti bolognese)'), navneBoks,
    el('label', 'felt-label lille-label', 'Nyt navn'), nyNavnForm, nyValg, nyVis);
  dele.push(nd);
  if (f.id && typeof opsLinjeForRet === 'function') dele.push(opsLinjeForRet(f));   // 📖 opskrifter.js
  dele.push(el('p', 'hint', 'Fyld, tilbehør, sovs og ekstra vælges under dagen med "✎ Tilpas". Terningen vælger selv ét fyld og et tilbehør. Hold fingeren på et punkt for at omdøbe eller slette det.'), flag1, knapper);
  aabnArk(f.tekst, ...dele);
}

// Under en dag i madplanen (voksne): én lille "Tilpas"-knap → ark med varianter, tilbehør og ekstra (alt kan ses, intet løber ud af skærmen)
function retChips(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  if (!fund || !passerTil(fund.fav, felt)) return null;
  const f = fund.fav;
  const boks = el('div', 'var-chips');
  const k = knap('✎ Tilpas', 'var-chip tilpas-chip', () => tilpasRet(favs, felt, tekst, vaelg));
  k.setAttribute('aria-label', 'Tilpas ' + f.tekst + ': fyld, tilbehør og ekstra');
  boks.append(k);
  return boks;
}

function tilpasRet(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  const f = fund.fav;
  const vs = aktiveVarianter(f), sider = passerSider(f), ekstra = passerEkstra(f), sovse = passerSovse(f);
  // Fyld: rettens eget + det der står i teksten (fx gammelt fyld der ikke længere er på listen)
  const fyldListe = [...new Set([...passerFyld(f).map(lavt), ...fund.fyld])];
  const nu = { variant: fund.variant, side: fund.side, uden: !!fund.udenSide, sovs: fund.sovs, udenSovs: !!fund.udenSovs, ekstra: fund.ekstra.map(lavt), fyld: fund.fyld.map(lavt) };
  const fyldNu = () => fyldListe.filter(y => nu.fyld.includes(y));   // altid i rettens rækkefølge
  // "uden <standard>" gemmes i teksten, så tavlen ikke selv sætter standardtilbehøret på
  const tekstNu = () => komponer(f, nu.variant, nu.side || (nu.ekstra.length && !nu.uden ? f.side : null), nu.ekstra, fyldNu(), nu.sovs)
    + (nu.uden && f.side ? ' uden ' + f.side : '') + (nu.udenSovs && f.sovs ? ' uden ' + f.sovs : '');
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
    vis.replaceChildren(komponer(f, nu.variant, nu.side || (nu.uden ? null : f.side), nu.ekstra, fyldNu(), nu.sovs || (nu.udenSovs ? null : f.sovs)));
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
    if (sider.length) {
      const aktuel = nu.uden ? '' : lavt(nu.side || f.side);
      raekke('Tilbehør', [
        // "Intet": uden tilbehør denne gang (også selvom retten normalt har pommes)
        vaelgKnap('intet', !aktuel, () => { nu.side = null; nu.uden = !!f.side; }),
        ...sider.map(sd => vaelgKnap(sd, lavt(sd) === aktuel, () => {
          nu.uden = false;
          nu.side = lavt(sd) === lavt(f.side) ? null : sd;   // standarden = intet særligt valgt
        }))]);
    }
    if (sovse.length) {
      const aktuel = nu.udenSovs ? '' : lavt(nu.sovs || f.sovs);
      raekke('Sovs', [
        vaelgKnap('ingen', !aktuel, () => { nu.sovs = null; nu.udenSovs = !!f.sovs; }),
        ...sovse.map(sv => vaelgKnap(sv, lavt(sv) === aktuel, () => {
          nu.udenSovs = false;
          nu.sovs = lavt(sv) === lavt(f.sovs) ? null : sv;   // standardsovsen = intet særligt valgt
        }))]);
    }
    if (ekstra.length) raekke('Ekstra', ekstra.map(e => {
      const med = nu.ekstra.includes(lavt(e));
      return vaelgKnap(e, med, () => { nu.ekstra = med ? nu.ekstra.filter(x => x !== lavt(e)) : [...nu.ekstra, lavt(e)]; });
    }));
  };
  tegn();
  // "+ fyld": nyt fyld/pålæg direkte herfra – gemmes på retten og vælges med det samme
  const nyFyld = input('text', 'tilpas-fyld', '', f.type === 'ret' ? '+ fyld, fx skinke' : '+ pålæg, fx ost');
  nyFyld.setAttribute('aria-label', f.type === 'ret' ? 'Nyt fyld' : 'Nyt pålæg');
  const fyldForm = el('form', 'oenske-form tilpas-fyld-form');
  fyldForm.append(nyFyld, el('button', 'knap', 'Tilføj'));
  fyldForm.addEventListener('submit', async e => {
    e.preventDefault();
    const t = lavt(nyFyld.value);
    nyFyld.value = '';
    if (!t) return;
    if (!fyldListe.includes(t)) fyldListe.push(t);
    if (!passerFyld(f).map(lavt).includes(t)) { f.fyld = [...passerFyld(f), t]; await Data.update('favoritter', f.id, { fyld: f.fyld }); }
    if (!nu.fyld.includes(t)) nu.fyld.push(t);
    if (nu.variant?.tekst) nu.variant = null;
    tegn(); await vaelg(tekstNu());
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', lukArk));
  aabnArk('Tilpas: ' + f.tekst, vis, indhold, fyldForm,
    el('p', 'hint', 'Gemmes med det samme. Hvad der passer, rettes under "Vores lister" → tryk på retten.'), knapper);
}

// ---------- De fælles lister over tilbehør og ekstra (voksne) ----------
function redigerTilbehoerLister() {
  const boks = el('div');
  const sektion = (titel, hent, saet, pladsholder, type) => {
    const ul = el('div');
    const tegn = () => {
      const seg = el('div', 'seg wrap flere-valg');
      seg.append(...hent().map(t => {
        const k = knap(t, null, () => seg.replaceWith(punktPanel(type, t, tegn)));
        k.setAttribute('aria-label', 'Omdøb eller slet ' + t);
        return k;
      }));
      ul.replaceChildren(seg);
    };
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
  sektion('Fyld og pålæg', () => FYLD, v => { FYLD = v; }, 'Fx tun', 'fyld');
  sektion('Tilbehør', () => SIDER, v => { SIDER = v; }, 'Fx couscous', 'sider');
  sektion('Sovs', () => SOVSE, v => { SOVSE = v; }, 'Fx bearnaise', 'sovse');
  sektion('Ekstra', () => EKSTRA, v => { EKSTRA = v; }, 'Fx tzatziki', 'ekstra');
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Færdig', 'knap', () => { lukArk(); tegnAlt(); }));
  aabnArk('Fyld, tilbehør, sovs og ekstra', el('p', 'hint', 'Det I kan vælge imellem, når I retter en ret. Tryk på et punkt for at se, hvor det bruges, og omdøbe eller slette det.'), boks, knapper);
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
    const side = lavt(fund.side || (fund.udenSide ? '' : fund.fav.side));
    if (side && !ud.has(side)) ud.set(side, false);
    const sovs = lavt(fund.sovs || (fund.udenSovs ? '' : fund.fav.sovs));
    if (sovs && !ud.has(sovs)) ud.set(sovs, false);
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
      ligner.push({ dub: f, maal: fund.fav, ny: komponer(fund.fav, fund.variant, fund.side, fund.ekstra, fund.fyld, fund.sovs) });
    }
  }
  const dubIds = new Set(ligner.map(l => l.dub.id));
  const udenKategori = maal.filter(f => passerTil(f, 'ret') && !f.gruppe && !dubIds.has(f.id));
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
