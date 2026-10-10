// retter.js – retterne som et lille katalog: kort navn, varianter, kategori, tilbehør og ekstra.
// Data: favoritter (type 'ret' | 'morgen' | 'frokost') {tekst, gruppe?, side?, sider?: [..], ekstra?: [..], varianter?: [{navn, tekst?, slukket?}], ikkeAuto?}
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
const SIDER = ['ris', 'nudler', 'pasta', 'pommes', 'rösti', 'kartofler', 'kartoffelmos', 'kartoffelsalat', 'brød'];
const EKSTRA = ['hvidløgsbrød', 'flute', 'salat', 'rødkål', 'agurkesalat', 'majs'];
const passerSider = f => Array.isArray(f.sider) ? f.sider : (f.side ? [f.side] : []);
const passerEkstra = f => Array.isArray(f.ekstra) ? f.ekstra : [];
// Alle kendte ekstra (standard + dem I selv har tilføjet på retterne)
const alleEkstra = favs => [...new Set([...EKSTRA, ...favs.flatMap(passerEkstra)].map(lavt))];
// "a", "a og b", "a, b og c"
const oprems = d => d.length < 2 ? (d[0] || '') : d.slice(0, -1).join(', ') + ' og ' + d[d.length - 1];
// Hele teksten: ret (evt. variant) + tilbehør + ekstra
function komponer(f, v, side, ekstra = []) {
  const base = v ? variantTekst(f, v) : f.tekst;
  const dele = [side, ...ekstra].filter(Boolean);
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
// Finder også "Chicken nuggets med nudler og hvidløgsbrød" = Chicken nuggets + tilbehøret nudler + ekstra hvidløgsbrød.
// Svarer {fav, variant, side, ekstra} (side = valgt tilbehør eller null, ekstra = liste)
function findRet(favs, felt, tekst) {
  let t = lavt(tekst);
  if (!t) return null;
  const kendte = [...new Set([...SIDER, ...alleEkstra(favs)])].sort((a, b) => b.length - a.length);
  const fjernet = [];
  for (let runde = 0; runde < 6; runde++) {
    const fund = findPraecis(favs, felt, t);
    if (fund) {
      const dele = fjernet.reverse();
      const side = dele.find(d => SIDER.includes(d) || passerSider(fund.fav).map(lavt).includes(d)) || null;
      return { ...fund, side, ekstra: dele.filter(d => d !== side) };
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
  return fund ? komponer(fund.fav, fund.variant, fund.side || fund.fav.side, fund.ekstra) : tekst;
}
// Alle tekster en ret kan stå som (selve retten + aktive varianter)
const retTekster = f => [f.tekst, ...aktiveVarianter(f).map(v => variantTekst(f, v))];

// Til forslagslisten i tekstfelterne: retter + varianter (+ morgen/frokost til aftensmad, men bagerst)
function forslagTekster(favs, felt) {
  const egne = favs.filter(f => f.type === felt).flatMap(retTekster);
  const andre = felt === 'ret' ? favs.filter(f => f.type !== 'ret' && MAAL_TYPER.includes(f.type)).flatMap(retTekster) : [];
  return [...new Set([...egne, ...andre])];
}

// Til terningen: hver ret (ikke ikkeAuto/takeaway) med en tilfældig aktiv variant og et tilfældigt tilbehør der passer
const vilkaarlig = a => a[Math.floor(Math.random() * a.length)];
function autoRetter(favs, felt) {
  return favs.filter(f => f.type === felt && !f.ikkeAuto && f.gruppe !== 'takeaway').map(f => {
    const v = aktiveVarianter(f), sider = passerSider(f);
    const side = sider.length > 1 ? vilkaarlig(sider) : null;
    return { fav: f, tekst: komponer(f, v.length ? vilkaarlig(v) : null, side && side !== f.side ? side : null) };
  });
}

// ---------- Voksne: ret en ret i kataloget ----------
function redigerRet(f) {
  const s = {
    tekst: f.tekst, gruppe: f.gruppe || '', side: f.side || '', ikkeAuto: !!f.ikkeAuto,
    sider: [...passerSider(f)], ekstra: [...passerEkstra(f)],
    varianter: (Array.isArray(f.varianter) ? f.varianter : []).map(v => ({ ...v }))
  };
  const erAften = f.type === 'ret';
  const navn = input('text', 'ret-navn', s.tekst);
  navn.addEventListener('input', () => { s.tekst = navn.value; tegnHint(); });
  const gruppeValg = chipValg(['', ...RET_GRUPPER.map(g => g[0])], s.gruppe, v => { s.gruppe = v; }, v => (v ? GRUPPE_NAVN[v] : 'Ingen'));

  // Tilbehør der passer (flere) + hvilket der står på tavlen
  const siderBoks = el('div'), standardBoks = el('div'), ekstraBoks = el('div'), hint = el('p', 'hint');
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
    siderBoks.replaceChildren(flereValg(SIDER, s.sider, tegnSider));
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
  const nyEkstra = input('text', 'ekstra-ny', '', 'Andet, fx tzatziki');
  const ekstraForm = el('form', 'oenske-form');
  ekstraForm.append(nyEkstra, el('button', 'knap', 'Tilføj'));
  ekstraForm.addEventListener('submit', e => {
    e.preventDefault();
    const t = lavt(nyEkstra.value);
    if (t && !s.ekstra.map(lavt).includes(t)) s.ekstra.push(t);
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
      tekst: s.tekst.trim(), ikkeAuto: s.ikkeAuto,
      varianter: s.varianter.map(v => Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== false && x !== '')))
    };
    if (erAften) Object.assign(felter, { gruppe: s.gruppe || null, side: s.side || null, sider: s.sider, ekstra: s.ekstra });
    await Data.update('favoritter', f.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('favoritter', f.id); lukArk(); tegnAlt(); }), gem);
  const dele = [felt('Navn', navn)];
  if (erAften) dele.push(el('label', 'felt-label', 'Kategori'), gruppeValg,
    el('label', 'felt-label', 'Tilbehør der passer'), siderBoks, standardBoks,
    el('label', 'felt-label', 'Ekstra der kan komme med'), ekstraBoks, ekstraForm, hint);
  dele.push(el('label', 'felt-label', erAften ? 'Varianter (fx hvad der er i burgeren)' : 'Varianter (fx pålæg)'), varBoks, form,
    el('p', 'hint', 'Varianterne kan vælges med et tryk under dagen på madplanen. Terningen vælger selv variant og tilbehør.'), flag1, knapper);
  aabnArk(MAALTIDER[f.type] + ': ' + f.tekst, ...dele);
}

// Under en dag i madplanen (voksne): varianter, tilbehør der passer og ekstra – tryk for at vælge
function retChips(favs, felt, tekst, vaelg) {
  const fund = findRet(favs, felt, tekst);
  if (!fund || fund.fav.type !== felt) return null;
  const f = fund.fav;
  const vs = aktiveVarianter(f), sider = passerSider(f), ekstra = passerEkstra(f);
  if (!vs.length && sider.length < 2 && !ekstra.length) return null;
  const nu = { variant: fund.variant, side: fund.side, ekstra: fund.ekstra.map(lavt) };
  const skriv = () => {
    // Med ekstra skrives tilbehøret med, så hele teksten står i feltet
    const side = nu.side || (nu.ekstra.length ? f.side : null);
    vaelg(komponer(f, nu.variant, side, nu.ekstra));
  };
  const boks = el('div', 'var-chips');
  const chip = (tekst, valgt, fn, klasse = '') => {
    const k = knap(tekst, 'var-chip' + klasse, fn);
    k.setAttribute('aria-pressed', valgt);
    boks.append(k);
  };
  for (const v of vs) chip(v.navn, nu.variant === v, () => { nu.variant = nu.variant === v ? null : v; skriv(); });
  if (sider.length > 1) {
    if (vs.length) boks.append(el('span', 'var-skil'));
    const aktuel = lavt(nu.side || f.side);
    for (const sd of sider) chip(sd, lavt(sd) === aktuel, () => {
      if (lavt(sd) === aktuel && !nu.side) return;      // standarden er allerede valgt
      nu.side = lavt(sd) === lavt(nu.side) || lavt(sd) === lavt(f.side) ? null : sd;
      skriv();
    }, ' side-chip');
  }
  if (ekstra.length) {
    if (vs.length || sider.length > 1) boks.append(el('span', 'var-skil'));
    for (const e of ekstra) {
      const med = nu.ekstra.includes(lavt(e));
      chip((med ? '' : '+ ') + e, med, () => {
        nu.ekstra = med ? nu.ekstra.filter(x => x !== lavt(e)) : [...nu.ekstra, lavt(e)];
        skriv();
      }, ' ekstra-chip');
    }
  }
  return boks;
}
