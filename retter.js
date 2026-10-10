// retter.js – retterne som et lille katalog: kort navn, varianter og kategori.
// Data: favoritter (type 'ret' | 'morgen' | 'frokost') {tekst, gruppe?, ingrediens?, varianter?: [{navn, ingrediens?, tekst?, slukket?}],
//        ikkeAuto? (aldrig i terningen, fx takeaway), ikkeAlternativ? (vises ikke som alternativ for børnene)}
// En variant hedder "<ret> med <navn>" (fx "Burger med flæskesteg"), medmindre den har sin egen tekst ("Franske hotdogs").
// Tilbehør (side): ris, nudler, pasta, pommes … er IKKE en del af retten. En ret har evt. et standardtilbehør
// (favoritter.side, fx 'ris'), og børnene vælger selv et andet (gælder med det samme – det er lige meget for de voksne).
// "Kylling i karry" + ris vises som "Kylling i karry med ris"; "Hakkebøf med spejlæg" + kartofler → "… og kartofler".
// Børnene: morgen/frokost → vælg variant (gælder med det samme); aftensmad → vælg tilbehør + "Vil du hellere have …" =
// retter med samme hovedingrediens (et ønske, de voksne siger ja/nej). Opsætningen: opdatering-retter.sql + -2.sql.

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

// Børnenes valg ud fra det, der står på planen
//  morgen/frokost: de andre varianter af samme ret ("Hvad vil du have på dine rundstykker?")
//  aftensmad: retter/varianter med samme hovedingrediens ("Vil du hellere have …")
function boerneValg(favs, felt, planTekst, barn) {
  const fund = findRet(favs, felt, planTekst);
  if (!fund) return { slags: null, valg: [] };
  const { fav, variant } = fund;
  if (felt !== 'ret') {
    const valg = aktiveVarianter(fav).map(v => ({ tekst: variantTekst(fav, v), kort: v.navn }));
    return { slags: 'variant', fav, valg };
  }
  const sider = fav.side ? { nu: fund.side || fav.side, standard: fav.side, base: komponer(fav, variant, null) } : null;
  const ing = variant?.ingrediens || fav.ingrediens;
  if (!ing) return { slags: 'alternativ', fav, valg: [], sider };
  const nu = lavt(planTekst);
  const res = [];
  for (const f of favs.filter(x => x.type === 'ret' && !x.ikkeAlternativ && x.gruppe !== 'takeaway')) {
    const vs = Array.isArray(f.varianter) ? f.varianter : [];
    if ((f.ingrediens || '') === ing && !vs.length) res.push({ tekst: f.tekst, f });
    for (const v of vs.filter(v => !v.slukket && (v.ingrediens || f.ingrediens) === ing)) res.push({ tekst: variantTekst(f, v), f });
  }
  const point = x => (kanLide(x.f).includes(barn) ? 1000 : 0) + (x.f.brugt || 0);
  const egen = lavt(komponer(fav, variant, null));
  const valg = res.filter(x => lavt(x.tekst) !== nu && lavt(x.tekst) !== egen).sort((a, b) => point(b) - point(a)).slice(0, 6)
    .map(x => ({ tekst: x.tekst, kort: komponer(x.f, null, null) === x.tekst ? komponer(x.f, null, x.f.side) : x.tekst }));
  return { slags: 'alternativ', fav, valg, sider };
}

// ---------- Voksne: ret en ret i kataloget ----------
function redigerRet(f) {
  const s = {
    tekst: f.tekst, gruppe: f.gruppe || '', ingrediens: f.ingrediens || '', side: f.side || '', ikkeAuto: !!f.ikkeAuto, ikkeAlternativ: !!f.ikkeAlternativ,
    varianter: (Array.isArray(f.varianter) ? f.varianter : []).map(v => ({ ...v }))
  };
  const erAften = f.type === 'ret';
  const navn = input('text', 'ret-navn', s.tekst);
  navn.addEventListener('input', () => { s.tekst = navn.value; });
  const sideValg = chipValg(['', ...SIDER], s.side, v => { s.side = v; }, v => v || 'Intet');
  const gruppeValg = chipValg(['', ...RET_GRUPPER.map(g => g[0])], s.gruppe, v => { s.gruppe = v; }, v => (v ? GRUPPE_NAVN[v] : 'Ingen'));
  // Hovedingredienser der allerede bruges – vælg en eller skriv en ny
  const alleIng = async () => [...new Set((await Data.list('favoritter')).flatMap(x => [x.ingrediens, ...(x.varianter || []).map(v => v.ingrediens)]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'da'));
  const ingListe = el('datalist'); ingListe.id = 'ingrediens-forslag';
  alleIng().then(l => ingListe.replaceChildren(...l.map(i => { const o = el('option'); o.value = i; return o; })));
  const ing = input('text', 'ret-ingrediens', s.ingrediens, 'Fx kylling, flæskesteg, pølser');
  ing.setAttribute('list', 'ingrediens-forslag');
  ing.addEventListener('input', () => { s.ingrediens = ing.value.trim().toLowerCase(); });

  const varBoks = el('div');
  const tegnVar = () => {
    const ul = el('ul', 'tb-raekker');
    s.varianter.forEach((v, i) => {
      const li = el('li', 'var-raekke' + (v.slukket ? ' slukket' : ''));
      const t = el('span', 'tb-navn');
      t.append(el('span', null, variantTekst({ tekst: s.tekst }, v)));
      if (erAften) {
        const vi = input('text', 'var-ing-' + i, v.ingrediens || '', 'samme som retten');
        vi.setAttribute('list', 'ingrediens-forslag');
        vi.className = 'var-ing';
        vi.setAttribute('aria-label', 'Hovedingrediens for ' + v.navn);
        vi.addEventListener('input', () => { v.ingrediens = vi.value.trim().toLowerCase() || undefined; });
        t.append(vi);
      }
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
  if (erAften) flag1.append(flag('🧒 Kan ønskes af børnene', 'ikkeAlternativ', true));

  const gem = knap('Gem', 'knap', async () => {
    if (!s.tekst.trim()) { navn.focus(); return; }
    const felter = {
      tekst: s.tekst.trim(), ikkeAuto: s.ikkeAuto, ikkeAlternativ: s.ikkeAlternativ,
      varianter: s.varianter.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false && x !== '')))
    };
    if (erAften) Object.assign(felter, { gruppe: s.gruppe || null, ingrediens: s.ingrediens || null, side: s.side || null });
    await Data.update('favoritter', f.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('favoritter', f.id); lukArk(); tegnAlt(); }), gem);
  const dele = [felt('Navn', navn)];
  if (erAften) dele.push(el('label', 'felt-label', 'Tilbehør (det der normalt kommer med)'), sideValg,
    el('p', 'hint', 'Børnene kan selv vælge et andet tilbehør (ris, nudler, pommes …) – det gælder med det samme.'),
    el('label', 'felt-label', 'Kategori'), gruppeValg, felt('Hovedingrediens', ing),
    el('p', 'hint', 'Retter med samme hovedingrediens bliver foreslået til børnene som alternativ (fx burger med flæskesteg → flæskesteg med kartofler).'), ingListe);
  dele.push(el('label', 'felt-label', erAften ? 'Varianter (fx hvad der er i burgeren)' : 'Varianter (fx pålæg)'), varBoks, form, flag1, knapper);
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
