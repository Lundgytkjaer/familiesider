// laan.js – 🤝 Lån (budgetsiden, fanen "Lån"). Et privat lån mellem de voksne (eller til/fra andre) med afdragsplan.
// Hentes af budget.html EFTER budget.js. KUN VOKSNE: lånet ligger i listen 'budget' som en række
// { snap: '_laan', art: 'laan', navn, laaner, udlaaner, beloeb, rest, rente (%), start (ÅÅÅÅ-MM-DD), betaling (kr/md), note, post?,
//   aendringer: [{ id, md: 'ÅÅÅÅ-MM', type: 'rente' | 'betaling' | 'ekstra' | 'afdrag', v, note }] }
// – så begge voksne kan se og rette det, og budgettets poster/årsbilleder ikke blander det ind (de springer rækker med snap/art over).
// Ingen tal eller navne i koden: alt tastes ind på siden. Husk tegnBudget() efter hver gemning – data.js tegner kun selv ved ændringer udefra.
//
// Regnemåde (som i det regneark, lånet kom fra): første betaling er måneden EFTER startdatoen, på månedens sidste hverdag.
//   renter = startsaldo × rente / 12 · afdrag = betaling − renter · slutsaldo = startsaldo + renter − betaling + ekstra lån − ekstra afdrag
// En ny rente eller betaling gælder fra og med den måned, den er sat til – tidligere måneder ændres ikke.

const laanAlle = () => Data.listNu('budget').filter(p => p.snap === '_laan' && p.art === 'laan');
const laanMd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const laanMdPlus = (md, n) => { const [y, m] = md.split('-').map(Number); return laanMd(new Date(y, m - 1 + n, 1)); };
const laanMdTekst = md => { const [y, m] = String(md).split('-').map(Number); return y && m ? MDR_LANG[m - 1] + ' ' + y : ''; };
const laanErMd = s => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(s || ''));
const laanPct = n => (Math.round(n * 100) / 100).toLocaleString('da-DK') + ' %';
const laanProcent = s => { const n = Number(String(s ?? '').replace(/\s|%/g, '').replace(',', '.')); return isFinite(n) && String(s ?? '').trim() !== '' ? n : NaN; };
const LAAN_TYPER = { rente: 'Ny rente', betaling: 'Ny betaling', ekstra: 'Ekstra lån', afdrag: 'Ekstra afdrag' };
// Månedens sidste hverdag (lørdag/søndag rykkes til fredag – helligdage regnes ikke med, som i regnearket)
function laanBetalDato(md) {
  const [y, m] = md.split('-').map(Number), d = new Date(y, m, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return isoDato(d);
}
// Hele afdragsplanen. proev = ekstra ændringer, der kun regnes med ("Hvad hvis") og ikke er gemt.
function laanPlan(l, proev = []) {
  const hovedstol = (Number(l.beloeb) || 0) + (Number(l.rest) || 0);
  const ud = { raekker: [], hovedstol, aldrig: false };
  const start = String(l.start || '').slice(0, 7);
  if (!laanErMd(start) || hovedstol <= 0) return ud;
  const aendr = [...(l.aendringer || []), ...proev].filter(a => a && laanErMd(a.md) && LAAN_TYPER[a.type]).sort((a, b) => a.md.localeCompare(b.md));
  let saldo = hovedstol, rente = Number(l.rente) || 0, bet = Number(l.betaling) || 0, i = 0, md = laanMdPlus(start, 1);
  for (let nr = 1; nr <= 720 && saldo > 0.005; nr++, md = laanMdPlus(md, 1)) {
    let ekstra = 0; const noter = [];
    for (; i < aendr.length && aendr[i].md <= md; i++) {
      const a = aendr[i], v = Number(a.v) || 0;
      if (a.type === 'rente') rente = v; else if (a.type === 'betaling') bet = v; else ekstra += a.type === 'ekstra' ? v : -v;
      noter.push(a);
    }
    const startS = saldo, r = startS * rente / 100 / 12, skyldig = startS + r + ekstra;
    const b = Math.max(0, Math.min(bet, skyldig));   // den sidste betaling er kun det, der er tilbage
    saldo = skyldig - b;
    ud.raekker.push({ nr, md, dato: laanBetalDato(md), start: startS, ekstra, bet: b, afdrag: b - r, rente: r, slut: saldo, pct: rente, fast: bet, noter });
    // Betalingen dækker ikke renterne, og der kommer ingen flere ændringer → lånet bliver aldrig betalt
    if (i >= aendr.length && bet <= r + 0.005 && saldo > 0.005) { ud.aldrig = true; break; }
  }
  if (saldo > 0.005) ud.aldrig = true;
  return ud;
}
// Nøgletal ud fra planen og dags dato
function laanStatus(plan, idag = isoDato(new Date())) {
  const rk = plan.raekker, betalt = rk.filter(r => r.dato <= idag), rest = rk.filter(r => r.dato > idag);
  const sum = (a, f) => a.reduce((s, r) => s + r[f], 0);
  const sidst = betalt[betalt.length - 1] || null, naeste = rest[0] || null;
  return { betalt, rest, sidst, naeste, saldo: sidst ? sidst.slut : plan.hovedstol,
    betaltKr: sum(betalt, 'bet'), betaltRente: sum(betalt, 'rente'), renterIAlt: sum(rk, 'rente'), renterRest: sum(rest, 'rente'),
    slut: plan.aldrig || !rk.length ? null : rk[rk.length - 1], faerdig: !rest.length && !!rk.length && !plan.aldrig };
}
const laanTitel = l => l.navn || ('Lån' + (l.udlaaner ? ' til ' + l.udlaaner : ''));
const laanNytId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const laanAaben = new Set();   // år, der er foldet ud i planen (nøgle: lån-id + år)

// ---------- Fanen "Lån" ----------
function laanVis() {
  const alle = laanAlle().slice().sort((a, b) => String(a.oprettet || '').localeCompare(String(b.oprettet || '')));
  const dele = [];
  if (!alle.length) {
    const tom = el('div', 'kort laan-tom');
    tom.append(el('h3', null, '🤝 Lån'),
      el('p', null, 'Har en af jer lånt penge af den anden – eller af familie – kan lånet stå her med saldo, renter og afdragsplan. Renten og betalingen kan ændres undervejs, uden at de gamle måneder ændres.'),
      el('p', 'hint', 'Begge voksne kan se og rette lånet. Børnene kan ikke se det.'),
      knap('+ Opret lån', 'knap', () => laanRet(null)));
    return [tom];
  }
  for (const l of alle) dele.push(...laanEt(l));
  dele.push(knap('+ Endnu et lån', 'lille-knap laan-nyt', () => laanRet(null)));
  return dele;
}
function laanEt(l) {
  const plan = laanPlan(l), st = laanStatus(plan), idag = isoDato(new Date());
  const dele = [];
  // Overblik
  const top = el('div', 'kort budget-hero laan-top');
  top.append(el('span', 'b-label', laanTitel(l) + (l.laaner ? ' · ' + l.laaner + ' betaler af' : '')));
  top.append(el('b', 'b-tal laan-saldo', st.faerdig ? 'Betalt ud 🎉' : bKr(st.saldo) + ' kr'));
  top.append(el('span', 'b-under', st.faerdig ? 'Sidste betaling ' + bDato(st.sidst.dato)
    : st.sidst ? 'Restgæld efter betalingen ' + bDato(st.sidst.dato) : 'Restgæld · første betaling ' + (st.naeste ? bDato(st.naeste.dato) : '–')));
  dele.push(top);

  const tal = el('div', 'kort laan-tal');
  const linje = (navn, vaerdi, under) => { const d = el('div', 'laan-linje'); d.append(el('span', null, navn), el('b', null, vaerdi)); if (under) d.append(el('small', null, under)); return d; };
  const nu = st.naeste || st.sidst;
  if (nu && !st.faerdig) {
    tal.append(linje('Rente nu', laanPct(nu.pct)), linje('Betaling', bKr(nu.fast) + ' kr/md', st.naeste ? 'Næste: ' + bDato(st.naeste.dato) + ' · ' + bKr(st.naeste.rente) + ' kr renter + ' + bKr(st.naeste.afdrag) + ' kr afdrag' : ''));
  }
  tal.append(linje('Betalt indtil nu', bKr(st.betaltKr) + ' kr', st.betalt.length ? bKr(st.betaltKr - st.betaltRente) + ' kr afdrag + ' + bKr(st.betaltRente) + ' kr renter · ' + st.betalt.length + ' betalinger' : ''));
  if (!st.faerdig) tal.append(plan.aldrig
    ? linje('Færdig', 'Aldrig ⚠️', 'Betalingen dækker ikke renterne – sæt betalingen op eller renten ned.')
    : linje('Færdig', st.slut ? laanMdTekst(st.slut.md) : '–', st.rest.length + ' betalinger tilbage · ' + bKr(st.renterRest) + ' kr i renter endnu'));
  tal.append(linje('Renter i alt', bKr(st.renterIAlt) + ' kr', 'over hele lånet · lånt ' + bKr(plan.hovedstol) + ' kr ' + bDato(String(l.start || '').slice(0, 10))));
  dele.push(tal);

  // Handlinger
  const kn = el('div', 'laan-knapper');
  if (!st.faerdig) kn.append(knap('％ Ny rente', 'lille-knap', () => laanAendring(l, null, 'rente')), knap('💳 Ny betaling', 'lille-knap', () => laanAendring(l, null, 'betaling')),
    knap('+ Ekstra lån', 'lille-knap', () => laanAendring(l, null, 'ekstra')), knap('− Ekstra afdrag', 'lille-knap', () => laanAendring(l, null, 'afdrag')),
    knap('🔮 Hvad hvis …', 'lille-knap', () => laanHvadHvis(l)));
  kn.append(knap('🖨️ Udskriv', 'lille-knap', () => laanUdskriv(l)), knap('✎ Ret lånet', 'lille-knap', () => laanRet(l)));
  dele.push(kn);

  // Ændringer undervejs
  const aendr = (l.aendringer || []).slice().sort((a, b) => String(a.md).localeCompare(String(b.md)));
  if (aendr.length) {
    const k = el('div', 'kort laan-aendr');
    k.append(el('h3', null, 'Ændringer undervejs'));
    const ul = el('ul', 'laan-aendr-liste');
    for (const a of aendr) {
      const li = el('li'), b = knap('', 'laan-aendr-knap', () => laanAendring(l, a));
      b.append(el('span', 'laan-aendr-md', laanMdTekst(a.md)), el('b', null, laanAendrTekst(a)), el('span', 'laan-aendr-note', a.note || ''));
      li.append(b); ul.append(li);
    }
    k.append(ul);
    dele.push(k);
  }
  dele.push(laanTabel(l, plan, st, idag));
  dele.push(el('p', 'hint', 'Renter = startsaldo × rente / 12. Betalingen falder på månedens sidste hverdag. Tryk på et år for at se månederne. Grå måneder er ikke betalt endnu.'));
  return dele;
}
function laanAendrTekst(a) {
  const v = Number(a.v) || 0;
  return a.type === 'rente' ? 'Rente ' + laanPct(v) : a.type === 'betaling' ? 'Betaling ' + bKr(v) + ' kr/md' : a.type === 'ekstra' ? 'Ekstra lån ' + bKr(v) + ' kr' : 'Ekstra afdrag ' + bKr(v) + ' kr';
}
// Afdragsplanen: ét år pr. linje, som kan foldes ud til månederne. alt = true: alle måneder (udskrift).
function laanTabel(l, plan, st, idag, alt = false) {
  const tab = el('table', 'bs-tab laan-tab'), thead = el('thead'), hr = el('tr');
  for (const [t, k] of [['Nr.', 'laan-nr'], ['Dato', 'laan-dato'], ['Startsaldo', ''], ['Ekstra', ''], ['Betaling', ''], ['Afdrag', ''], ['Renter', ''], ['Slutsaldo', ''], ['Kommentar', 'laan-kom']]) hr.append(el('th', k || null, t));
  thead.append(hr);
  const tb = el('tbody');
  const aar = new Map();
  for (const r of plan.raekker) { const y = r.md.slice(0, 4); if (!aar.has(y)) aar.set(y, []); aar.get(y).push(r); }
  const nuAar = String(new Date().getFullYear()), nuMd = laanMd(new Date());
  for (const [y, rk] of aar) {
    const noegle = l.id + ':' + y;
    const aaben = alt || (laanAaben.has(noegle) !== (y === nuAar));   // i år er foldet ud som udgangspunkt
    const sum = f => rk.reduce((s, r) => s + r[f], 0);
    if (!alt) {
      const tr = el('tr', 'bs-gruppe laan-aar' + (rk.every(r => r.dato > idag) ? ' frem' : '')), th = el('td', 'laan-aarnavn');
      th.colSpan = 2;
      const k = knap((aaben ? '▾ ' : '▸ ') + y, 'bs-gknap', () => { laanAaben.has(noegle) ? laanAaben.delete(noegle) : laanAaben.add(noegle); tegnBudget(); });
      k.setAttribute('aria-expanded', aaben);
      th.append(k); tr.append(th);
      const ek = sum('ekstra');
      tr.append(el('td', null, bKr(rk[0].start)), el('td', null, Math.abs(ek) >= 0.5 ? bKr(ek) : ''), el('td', null, bKr(sum('bet'))), el('td', null, bKr(sum('afdrag'))), el('td', null, bKr(sum('rente'))), el('td', null, bKr(rk[rk.length - 1].slut)),
        el('td', 'laan-kom', rk.length + (rk.length === 1 ? ' betaling' : ' betalinger')));
      tb.append(tr);
    }
    if (!aaben) continue;
    for (const r of rk) {
      const tr = el('tr', 'bs-post laan-md' + (r.dato > idag ? ' frem' : '') + (r.md === nuMd ? ' nu' : ''));
      tr.append(el('td', 'laan-nr', String(r.nr)), el('td', 'laan-dato', bDato(r.dato)), el('td', null, bKr(r.start)), el('td', null, Math.abs(r.ekstra) >= 0.5 ? bKr(r.ekstra) : ''),
        el('td', null, bKr(r.bet)), el('td', null, bKr(r.afdrag)), el('td', null, bKr(r.rente)), el('td', null, bKr(r.slut)),
        el('td', 'laan-kom', r.noter.map(a => laanAendrTekst(a) + (a.note ? ' – ' + a.note : '')).join(' · ')));
      tb.append(tr);
    }
  }
  tab.append(thead, tb);
  if (alt) return tab;
  const rul = el('div', 'bs-rul'); rul.append(tab);
  const kort = el('div', 'kort bs-kort laan-plan'); kort.append(rul);
  return kort;
}

// ---------- Opret / ret lånet ----------
function laanRet(l) {
  const ny = !l;
  const navn = input('text', 'laan-navn', l?.navn, 'fx Lån til huset');
  const laaner = input('text', 'laan-laaner', l?.laaner, 'Navn'), udlaaner = input('text', 'laan-udlaaner', l?.udlaaner, 'Navn');
  const beloeb = input('text', 'laan-beloeb', l?.beloeb ? bKr(l.beloeb) : '', 'kr'); beloeb.inputMode = 'decimal';
  const rest = input('text', 'laan-rest', l?.rest ? bKr(l.rest) : '', 'kr (må være tom)'); rest.inputMode = 'decimal';
  const rente = input('text', 'laan-rente', l ? String(l.rente ?? '').replace('.', ',') : '', '%'); rente.inputMode = 'decimal';
  const start = input('date', 'laan-start', String(l?.start || '').slice(0, 10) || isoDato(new Date()));
  const bet = input('text', 'laan-betaling', l?.betaling ? bKr(l.betaling) : '', 'kr om måneden'); bet.inputMode = 'decimal';
  const note = input('text', 'laan-note', l?.note, 'fx hvad lånet gik til');
  // Kobling til en post i Mit budget: posten viser, hvor meget af betalingen der er renter og afdrag
  const mine = bKilde(bMig()).poster().filter(p => !bErInd(p));
  const post = el('select'); post.id = 'laan-post';
  post.append(new Option('Ingen', ''), ...mine.map(p => new Option(p.navn || 'Uden navn', p.id)));
  post.value = mine.some(p => p.id === l?.post) ? l.post : '';
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const gem = knap(ny ? 'Opret lånet' : 'Gem', 'knap', async () => {
    const b = bTal(beloeb.value), rs = rest.value.trim() ? bTal(rest.value) : 0, rp = laanProcent(rente.value), bt = bTal(bet.value);
    const fejlTekst = !(b > 0) ? 'Skriv lånebeløbet.' : !(rs >= 0) ? 'Resten fra et tidligere lån skal være et tal (eller tom).' : !(rp >= 0 && rp <= 100) ? 'Skriv renten i procent, fx 3 eller 2,5.'
      : !/^\d{4}-\d{2}-\d{2}$/.test(start.value) ? 'Vælg lånets startdato.' : !(bt > 0) ? 'Skriv, hvad der betales om måneden.' : '';
    if (fejlTekst) { fejl.textContent = fejlTekst; fejl.hidden = false; return; }
    const data = { navn: navn.value.trim(), laaner: laaner.value.trim(), udlaaner: udlaaner.value.trim(), beloeb: b, rest: rs, rente: rp, start: start.value, betaling: bt, note: note.value.trim() };
    // posten gemmes kun, når den er min egen – ellers bevares den andens valg
    if (mine.length) data.post = post.value || (mine.some(p => p.id === l?.post) ? '' : l?.post || '');
    if (ny) await Data.add('budget', { snap: '_laan', art: 'laan', ...data, aendringer: [] });
    else await Data.update('budget', l.id, data);
    lukArk(); tegnBudget(); visStatus(ny ? 'Lånet er oprettet' : 'Gemt');
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) { const slet = knap('Slet lånet', 'knap fare', e => bekraeft(e.currentTarget, async () => { await Data.remove('budget', l.id); lukArk(); tegnBudget(); visStatus('Lånet er slettet'); })); slet.dataset.handling = 'slette lånet'; knapper.append(slet); }
  knapper.append(gem);
  const hvem = el('div', 'laan-to'); hvem.append(felt('Hvem betaler af?', laaner), felt('Til hvem?', udlaaner));
  const penge = el('div', 'laan-to'); penge.append(felt('Lånebeløb', beloeb), felt('Rest fra tidligere lån', rest));
  const vilkaar = el('div', 'laan-to'); vilkaar.append(felt('Rente (% om året)', rente), felt('Betaling pr. måned', bet));
  aabnArk(ny ? 'Nyt lån' : 'Ret lånet', felt('Hvad hedder lånet?', navn), hvem, penge, vilkaar, felt('Lånets startdato', start),
    el('p', 'hint', 'Første betaling er måneden efter startdatoen. ' + (ny ? 'Ændringer undervejs (ny rente, ekstra lån …) lægges ind bagefter.' : 'Rente og betaling her er dem, lånet startede med – brug "Ny rente"/"Ny betaling" til ændringer undervejs.')),
    felt('Note', note), ...(mine.length ? [felt('Vis renter og afdrag på en post i Mit budget', post)] : []), fejl, knapper);
}

// ---------- En ændring undervejs: ny rente, ny betaling, ekstra lån, ekstra afdrag ----------
function laanAendring(l, a, type) {
  const ny = !a;
  let valgt = a?.type || type || 'rente';
  const st = laanStatus(laanPlan(l));
  const naesteMd = st.naeste ? st.naeste.md : laanMdPlus(laanMd(new Date()), 1);
  const md = input('month', 'laan-a-md', a?.md || naesteMd, 'ÅÅÅÅ-MM');
  const v = input('text', 'laan-a-v', a ? (a.type === 'rente' ? String(a.v).replace('.', ',') : bKr(a.v)) : ''); v.inputMode = 'decimal';
  const note = input('text', 'laan-a-note', a?.note, 'fx hvad det ekstra lån gik til');
  const vFelt = felt('', v), mdFelt = felt('', md);
  const hint = el('p', 'hint');
  const saet = () => {
    vFelt.querySelector('label').textContent = valgt === 'rente' ? 'Ny rente (% om året)' : valgt === 'betaling' ? 'Ny betaling pr. måned (kr)' : valgt === 'ekstra' ? 'Ekstra lån (kr)' : 'Ekstra afdrag (kr)';
    mdFelt.querySelector('label').textContent = valgt === 'rente' || valgt === 'betaling' ? 'Gælder fra og med' : 'Måned';
    hint.textContent = valgt === 'rente' ? 'Den nye rente bruges fra og med den valgte måned. Tidligere måneder ændres ikke.'
      : valgt === 'betaling' ? 'Den nye betaling gælder fra og med den valgte måned.' : valgt === 'ekstra' ? 'Beløbet lægges oven i gælden i den valgte måned.' : 'Beløbet trækkes fra gælden i den valgte måned – ud over den faste betaling.';
  };
  saet();
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const gem = knap('Gem', 'knap', async () => {
    const tal = valgt === 'rente' ? laanProcent(v.value) : bTal(v.value);
    const fejlTekst = !laanErMd(md.value) ? 'Vælg måneden (ÅÅÅÅ-MM).' : valgt === 'rente' ? (!(tal >= 0 && tal <= 100) ? 'Skriv renten i procent, fx 3 eller 2,5.' : '') : !(tal > 0) ? 'Skriv beløbet.' : '';
    if (fejlTekst) { fejl.textContent = fejlTekst; fejl.hidden = false; return; }
    const en = { id: a?.id || laanNytId(), md: md.value, type: valgt, v: tal, note: note.value.trim() };
    const frisk = laanAlle().find(x => x.id === l.id) || l;   // den anden kan have rettet imens
    const liste = (frisk.aendringer || []).filter(x => x.id !== en.id).concat(en);
    await Data.update('budget', l.id, { aendringer: liste });
    lukArk(); tegnBudget(); visStatus('Gemt');
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) { const slet = knap('Slet', 'knap fare', e => bekraeft(e.currentTarget, async () => {
    const frisk = laanAlle().find(x => x.id === l.id) || l;
    await Data.update('budget', l.id, { aendringer: (frisk.aendringer || []).filter(x => x.id !== a.id) }); lukArk(); tegnBudget(); visStatus('Slettet');
  })); slet.dataset.handling = 'slette'; knapper.append(slet); }
  knapper.append(gem);
  const typeValg = ny ? chipValg(Object.keys(LAAN_TYPER), valgt, t => { valgt = t; saet(); }, t => LAAN_TYPER[t]) : '';
  aabnArk(ny ? 'Ny ændring' : 'Ret ændring', typeValg, vFelt, mdFelt, hint, felt('Kommentar', note), fejl, knapper);
  v.focus();
}

// ---------- Hvad hvis: en anden rente eller betaling fra næste måned ----------
function laanHvadHvis(l) {
  const plan = laanPlan(l), st = laanStatus(plan);
  if (!st.naeste) return;
  const fra = st.naeste.md;
  const rente = input('text', 'laan-h-rente', String(st.naeste.pct).replace('.', ',')); rente.inputMode = 'decimal';
  const bet = input('text', 'laan-h-bet', bKr(st.naeste.fast)); bet.inputMode = 'decimal';
  const ud = el('div', 'laan-hvis');
  const gem = knap('Gem fra ' + laanMdTekst(fra), 'knap', async () => {
    const proev = laes(); if (!proev || !proev.length) return;
    const frisk = laanAlle().find(x => x.id === l.id) || l;
    await Data.update('budget', l.id, { aendringer: (frisk.aendringer || []).concat(proev.map(a => ({ ...a, id: laanNytId(), note: '' }))) });
    lukArk(); tegnBudget(); visStatus('Gemt');
  });
  // De ændringer, felterne svarer til (kun det, der er anderledes end nu). null = ugyldigt
  const laes = () => {
    const rp = laanProcent(rente.value), bt = bTal(bet.value);
    if (!(rp >= 0 && rp <= 100) || !(bt > 0)) return null;
    const p = [];
    if (Math.abs(rp - st.naeste.pct) > 1e-9) p.push({ md: fra, type: 'rente', v: rp });
    if (Math.abs(bt - st.naeste.fast) > 0.005) p.push({ md: fra, type: 'betaling', v: bt });
    return p;
  };
  const tegn = () => {
    const proev = laes();
    gem.disabled = !proev || !proev.length;
    if (!proev) { ud.replaceChildren(el('p', 'hint', 'Skriv en rente i procent og en betaling i kr.')); return; }
    const ny = laanPlan(l, proev), ns = laanStatus(ny);
    const linje = (navn, foer, efter, forskel) => { const d = el('div', 'laan-linje'); d.append(el('span', null, navn), el('b', null, efter), el('small', null, 'Nu: ' + foer + (forskel ? ' · ' + forskel : ''))); return d; };
    const mdr = ns.rest.length - st.rest.length, kr = ns.renterRest - st.renterRest;
    ud.replaceChildren(
      linje('Færdig', plan.aldrig ? 'aldrig' : laanMdTekst(st.slut.md), ny.aldrig ? 'Aldrig ⚠️' : laanMdTekst(ns.slut.md),
        ny.aldrig || plan.aldrig || !mdr ? '' : Math.abs(mdr) + (Math.abs(mdr) === 1 ? ' måned ' : ' måneder ') + (mdr < 0 ? 'før' : 'senere')),
      linje('Renter fra nu af', bKr(st.renterRest) + ' kr', ny.aldrig ? '–' : bKr(ns.renterRest) + ' kr', ny.aldrig || Math.abs(kr) < 0.5 ? '' : bKr(Math.abs(kr)) + ' kr ' + (kr < 0 ? 'mindre' : 'mere')));
    if (ny.aldrig) ud.append(el('p', 'fejl', 'Betalingen dækker ikke renterne – gælden vokser.'));
  };
  rente.addEventListener('input', tegn); bet.addEventListener('input', tegn);
  tegn();
  const knapper = el('div', 'ark-knapper'); knapper.append(knap('Luk', 'knap sekundaer', lukArk), gem);
  const to = el('div', 'laan-to'); to.append(felt('Rente (% om året)', rente), felt('Betaling pr. måned', bet));
  aabnArk('🔮 Hvad hvis …', el('p', 'hint', 'Prøv en anden rente eller betaling fra og med ' + laanMdTekst(fra) + '. Intet gemmes, før du trykker Gem.'), to, ud, knapper);
}

// ---------- Udskrift til underskrift ----------
function laanUdskriv(l) {
  const plan = laanPlan(l), st = laanStatus(plan), idag = isoDato(new Date());
  document.getElementById('laan-print')?.remove();
  const s = el('div'); s.id = 'laan-print';
  s.append(el('h1', null, laanTitel(l)), el('p', 'laan-p-dato', 'Udskrevet ' + bDato(idag)));
  const dl = el('dl', 'laan-p-vilkaar');
  const par = (a, b) => { if (b) dl.append(el('dt', null, a), el('dd', null, b)); };
  par('Betaler af', l.laaner); par('Til', l.udlaaner);
  par('Lånebeløb', bKr(l.beloeb) + ' kr'); par('Rest fra tidligere lån', Number(l.rest) ? bKr(l.rest) + ' kr' : '');
  par('Rente ved start', laanPct(Number(l.rente) || 0)); par('Betaling ved start', bKr(l.betaling) + ' kr om måneden');
  par('Lånets startdato', bDato(String(l.start || '').slice(0, 10)));
  par('Restgæld', bKr(st.saldo) + ' kr' + (st.sidst ? ' efter betalingen ' + bDato(st.sidst.dato) : ''));
  par('Forventet færdig', plan.aldrig ? '' : st.slut ? laanMdTekst(st.slut.md) : '');
  par('Renter i alt', bKr(st.renterIAlt) + ' kr'); par('Note', l.note);
  s.append(dl, el('p', 'laan-p-tekst', 'Ændres noget i nedenstående, opdateres dokumentet, udskrives og underskrives på ny.'), laanTabel(l, plan, st, idag, true));
  const us = el('div', 'laan-p-underskrift');
  for (const n of [l.laaner, l.udlaaner]) { const d = el('div'); d.append(el('span', null, 'Dato og underskrift'), el('b', null, n || '')); us.append(d); }
  s.append(us);
  document.body.append(s);
  document.body.classList.add('laan-udskriv');
  const ryd = () => { document.body.classList.remove('laan-udskriv'); s.remove(); window.removeEventListener('afterprint', ryd); };
  window.addEventListener('afterprint', ryd);
  window.print();
}

// ---------- Kobling til budgettet ----------
// Fanen "Lån" (sidst, og også når Mit budget er tomt) + en linje på den post i Mit budget, lånet er koblet til
B_EKSTRA_VIS.laan = { tekst: 'Lån', vis: laanVis, sidst: true, altid: true };
B_POST_INFO.push(p => {
  const l = laanAlle().find(x => x.post && x.post === p.id);
  if (!l) return '';
  const st = laanStatus(laanPlan(l)), r = st.naeste || st.sidst;
  return r && !st.faerdig ? 'heraf ' + bKr(r.rente) + ' kr renter + ' + bKr(r.afdrag) + ' kr afdrag (' + MDR[Number(r.md.slice(5)) - 1] + ')' : '';
});
