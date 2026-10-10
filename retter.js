// retter.js – retterne som et lille katalog: kort navn, varianter og kategori.
// Data: favoritter (type 'ret' | 'morgen' | 'frokost') {tekst, gruppe?, side?, varianter?: [{navn, tekst?, slukket?}], ikkeAuto?}
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
const SIDER = ['ris', 'nudler', 'pasta', 'pommes', 'rösti', 'kartofler', 'kartoffelmos', 'kartoffelsalat', 'brød'];
// Hele teksten: ret (evt. variant) + tilbehør
function komponer(f, v, side) {
  const base = v ? variantTekst(f, v) : f.tekst;
  return side ? base + (/ med /i.test(base) ? ' og ' : ' med ') + side : base;
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
// Finder også "Kyllingespyd med nudler" = Kyllingespyd + tilbehøret nudler. Svarer {fav, variant, side} (side = valgt tilbehør)
function findRet(favs, felt, tekst) {
  const t = lavt(tekst);
  if (!t) return null;
  const fund = findPraecis(favs, felt, t);
  if (fund) return { ...fund, side: null };
  for (const side of SIDER) {
    for (const led of [' med ', ' og ']) {
      if (!t.endsWith(led + side)) continue;
      const f2 = findPraecis(favs, felt, t.slice(0, -(led + side).length));
      if (f2) return { ...f2, side };
    }
  }
  return null;
}
// Teksten der vises: med det valgte tilbehør, ellers rettens standardtilbehør
function retVisning(favs, felt, tekst) {
  const fund = findRet(favs, felt, tekst);
  return fund ? komponer(fund.fav, fund.variant, fund.side || fund.fav.side) : tekst;
}
// Alle tekster en ret kan stå som (selve retten + aktive varianter)
const retTekster = f => [f.tekst, ...aktiveVarianter(f).map(v => variantTekst(f, v))];

// Til forslagslisten i tekstfelterne: retter + varianter (+ morgen/frokost til aftensmad, men bagerst)
function forslagTekster(favs, felt) {
  const egne = favs.filter(f => f.type === felt).flatMap(retTekster);
  const andre = felt === 'ret' ? favs.filter(f => f.type !== 'ret' && MAAL_TYPER.includes(f.type)).flatMap(retTekster) : [];
  return [...new Set([...egne, ...andre])];
}

// Til terningen: hver ret (ikke ikkeAuto/takeaway) med en tilfældig aktiv variant, hvis den har varianter
function autoRetter(favs, felt) {
  return favs.filter(f => f.type === felt && !f.ikkeAuto && f.gruppe !== 'takeaway').map(f => {
    const v = aktiveVarianter(f);
    return { fav: f, tekst: v.length ? variantTekst(f, v[Math.floor(Math.random() * v.length)]) : f.tekst };
  });
}

// ---------- Voksne: ret en ret i kataloget ----------
function redigerRet(f) {
  const s = {
    tekst: f.tekst, gruppe: f.gruppe || '', side: f.side || '', ikkeAuto: !!f.ikkeAuto,
    varianter: (Array.isArray(f.varianter) ? f.varianter : []).map(v => ({ ...v }))
  };
  const erAften = f.type === 'ret';
  const navn = input('text', 'ret-navn', s.tekst);
  navn.addEventListener('input', () => { s.tekst = navn.value; });
  const sideValg = chipValg(['', ...SIDER], s.side, v => { s.side = v; }, v => v || 'Intet');
  const gruppeValg = chipValg(['', ...RET_GRUPPER.map(g => g[0])], s.gruppe, v => { s.gruppe = v; }, v => (v ? GRUPPE_NAVN[v] : 'Ingen'));

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
      tekst: s.tekst.trim(), ikkeAuto: s.ikkeAuto,
      varianter: s.varianter.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false && x !== '')))
    };
    if (erAften) Object.assign(felter, { gruppe: s.gruppe || null, side: s.side || null });
    await Data.update('favoritter', f.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('favoritter', f.id); lukArk(); tegnAlt(); }), gem);
  const dele = [felt('Navn', navn)];
  if (erAften) dele.push(el('label', 'felt-label', 'Kategori'), gruppeValg,
    el('label', 'felt-label', 'Tilbehør der normalt kommer med'), sideValg,
    el('p', 'hint', 'Vises på tavlen, fx "' + s.tekst + (s.side ? ' med ' + s.side : ' med ris') + '". Man kan altid skrive noget andet på dagen.'));
  dele.push(el('label', 'felt-label', erAften ? 'Varianter (fx hvad der er i burgeren)' : 'Varianter (fx pålæg)'), varBoks, form,
    el('p', 'hint', 'Varianterne kan vælges med et tryk under dagen på madplanen. Terningen vælger selv en.'), flag1, knapper);
  aabnArk(MAALTIDER[f.type] + ': ' + f.tekst, ...dele);
}

// Varianter under en dag i madplanen (voksne): tryk for at vælge, hvad der skal i/på
function variantChips(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  if (!fund || fund.fav.type !== felt) return null;
  const vs = aktiveVarianter(fund.fav);
  if (!vs.length) return null;
  const boks = el('div', 'var-chips');
  const nu = lavt(tekst);
  boks.append(...vs.map(v => {
    const t = variantTekst(fund.fav, v);
    const k = knap(v.navn, 'var-chip', () => vaelg(lavt(t) === nu ? fund.fav.tekst : t));
    k.setAttribute('aria-pressed', lavt(t) === nu);
    return k;
  }));
  return boks;
}
