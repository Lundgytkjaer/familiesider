// budget.js – 💰 Budget (Mere → Budget). KUN VOKSNE – databasen (kun_voksne) giver aldrig børn rækkerne.
// Data:
//   'budget'      {navn, gruppe, konto, mdr: [12 beløb jan–dec], note?, tjekket: 'ÅÅÅÅ-MM-DD', historik?: [{dato, aar}], raekke?}
//   'budgetkonti' {navn, overfoert?: kr pr. måned i alt (det der overføres nu), raekke?}
// Behov pr. konto = summen af posterne / 12. "Hver af jer" = behov delt i BUDGET_DELES, rundet op til nærmeste BUDGET_RUND kr.
// En post er "ikke tjekket", når den ikke er set i en gennemgang/rettet i 12 måneder – så ved man, hvad der skal opdateres.
// Personlige data (beløb, navne på poster) ligger kun i databasen – aldrig i koden.
const BUDGET_DELES = 2, BUDGET_RUND = 50, BUDGET_GAMMEL_MDR = 12;
const BUDGET_IKONER = [
  [/feriehus|sommerhus/i, '🏖️'], [/husholdning|dagligvar|mad/i, '🛒'], [/hus|bolig/i, '🏠'], [/transport|bil/i, '🚗'],
  [/forsikring/i, '🛡️'], [/fritid|sfo|sport/i, '⚽'], [/kæledyr|dyr/i, '🐰'], [/stream|abonnement/i, '📺'],
  [/børn/i, '🧒'], [/ferie|rejse/i, '✈️'], [/opsparing|buffer|pension/i, '🐷']
];
let budgetVis = lokal.get('budget-vis') || 'overblik';
let budgetGruppe = '';
let budgetSoeg = '';
let budgetMaaned = null;

const bKr = n => Math.round(n || 0).toLocaleString('da-DK');
const bTal = s => { const t = String(s ?? '').replace(/\s|kr\.?/gi, '').replace(/\./g, '').replace(',', '.'); const n = Number(t); return isFinite(n) ? n : NaN; };
const bIkon = g => (BUDGET_IKONER.find(([r]) => r.test(g || '')) || [, '📁'])[1];
const bPoster = () => Data.listNu('budget');
const bMdr = p => Array.from({ length: 12 }, (_, i) => Number((p.mdr || [])[i]) || 0);
const bAar = p => bMdr(p).reduce((s, x) => s + x, 0);
const bSort = (a, b) => (a.raekke ?? 1e9) - (b.raekke ?? 1e9) || (a.navn || '').localeCompare(b.navn || '', 'da');
const bRund = md => Math.ceil(md / BUDGET_DELES / BUDGET_RUND - 1e-9) * BUDGET_RUND;
const bIdag = () => isoDato(new Date());
function bMdrSiden(iso) {
  if (!iso) return Infinity;
  const [y, m, d] = iso.split('-').map(Number), n = new Date();
  return (n.getFullYear() - y) * 12 + (n.getMonth() + 1 - m) - (n.getDate() < d ? 1 : 0);
}
const bGammel = p => bMdrSiden(p.tjekket) >= BUDGET_GAMMEL_MDR;
function bSidst(iso) {
  if (!iso) return 'aldrig';
  if (iso === bIdag()) return 'i dag';
  const m = bMdrSiden(iso);
  if (m < 1) return 'for under en måned siden';
  if (m < 12) return 'for ' + m + (m === 1 ? ' måned' : ' måneder') + ' siden';
  const a = Math.floor(m / 12), r = m % 12;
  return 'for ' + a + ' år' + (r ? ' og ' + r + ' md.' : '') + ' siden';
}
// "hver måned" · "jan. og jul." · "5 betalinger"
function bMoenster(p) {
  const v = bMdr(p), nz = v.map((x, i) => [x, i]).filter(([x]) => x);
  if (!nz.length) return '0 kr';
  if (nz.length === 12 && nz.every(([x]) => x === nz[0][0])) return 'hver måned';
  const ens = nz.every(([x]) => x === nz[0][0]);
  const mdr = nz.map(([, i]) => MDR[i]);
  const liste = mdr.length === 1 ? mdr[0] : mdr.length <= 4 ? mdr.slice(0, -1).join(', ') + ' og ' + mdr[mdr.length - 1] : nz.length + ' betalinger';
  return ens && nz.length > 1 && nz.length <= 4 ? bKr(nz[0][0]) + ' kr i ' + liste : liste;
}
function bGrupper(poster) {
  const m = new Map();
  for (const p of [...poster].sort(bSort)) { const g = p.gruppe || 'Andet'; if (!m.has(g)) m.set(g, []); m.get(g).push(p); }
  return m;
}
function bKonti(poster) {
  const rk = Data.listNu('budgetkonti').sort((a, b) => (a.raekke ?? 99) - (b.raekke ?? 99));
  const navne = [...new Set([...rk.map(k => k.navn), ...[...poster].sort(bSort).map(p => p.konto).filter(Boolean)])];
  return navne.map(navn => {
    const r = rk.find(k => k.navn === navn);
    const md = poster.filter(p => p.konto === navn).reduce((s, p) => s + bAar(p), 0) / 12;
    return { navn, r, md, hver: bRund(md), overfoert: r && r.overfoert != null && r.overfoert !== '' ? Number(r.overfoert) : null };
  }).filter(k => k.md || k.r);
}
const bMaanedTotal = poster => Array.from({ length: 12 }, (_, i) => poster.reduce((s, p) => s + bMdr(p)[i], 0));

// Teksten på Mere-kortet
function budgetMereTekst() {
  const u = document.querySelector('[data-gaa="budget"] .under');
  if (!u) return;
  const poster = bPoster();
  if (!poster.length) { u.textContent = 'Faste udgifter, konti og overførsler'; return; }
  const n = poster.filter(bGammel).length;
  u.textContent = bKr(poster.reduce((s, p) => s + bAar(p), 0) / 12) + ' kr om måneden' + (n ? ' · 🔄 ' + n + ' skal tjekkes' : ' · ✓ opdateret');
}

function tegnBudget() {
  budgetMereTekst();
  const sek = document.getElementById('budget'), boks = document.getElementById('budget-indhold');
  if (!boks || sek.hidden || sek.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  const poster = bPoster();
  const seg = el('div', 'seg budget-faner');
  seg.setAttribute('role', 'radiogroup');
  for (const [id, tekst] of [['overblik', 'Overblik'], ['poster', 'Poster'], ['maaneder', 'Måneder']]) {
    const b = knap(tekst, null, () => { budgetVis = id; lokal.set('budget-vis', id); tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetVis === id);
    seg.append(b);
  }
  if (!poster.length) {
    const tom = el('div', 'kort budget-tom');
    tom.append(el('p', null, 'Her samler I familiens faste udgifter – hvad de koster om måneden og året, hvilken konto de betales fra, og hvor meget hver af jer skal overføre.'),
      knap('+ Tilføj første post', 'knap', () => redigerPost(null)));
    boks.replaceChildren(tom);
    return;
  }
  const indhold = budgetVis === 'poster' ? budgetPosterVis(poster) : budgetVis === 'maaneder' ? budgetMaanederVis(poster) : budgetOverblik(poster);
  boks.replaceChildren(seg, ...indhold);
}

// ---------- Overblik ----------
function budgetOverblik(poster) {
  const aar = poster.reduce((s, p) => s + bAar(p), 0), md = aar / 12;
  const konti = bKonti(poster);
  const hver = konti.reduce((s, k) => s + k.hver, 0);
  const dele = [];
  const hero = el('div', 'kort budget-hero');
  hero.append(el('span', 'b-label', 'Faste udgifter om måneden'), el('b', 'b-tal', bKr(md) + ' kr'),
    el('span', 'b-under', bKr(aar) + ' kr om året · hver af jer overfører ' + bKr(hver) + ' kr/md'));
  dele.push(hero);

  // Gennemgang – det der får budgettet holdt opdateret
  const gamle = poster.filter(bGammel);
  const g = el('div', 'kort budget-tjek' + (gamle.length ? ' skal' : ''));
  if (gamle.length) {
    g.append(el('b', null, '🔄 ' + gamle.length + (gamle.length === 1 ? ' post er' : ' poster er') + ' ikke tjekket i over et år'),
      el('p', 'hint', 'Tag dem én ad gangen: passer beløbet stadig, eller er prisen steget? Det tager et par minutter.'),
      knap('Start gennemgang', 'knap', () => budgetGennemgang(false)));
  } else {
    const sidst = poster.map(p => p.tjekket || '').sort().pop();
    g.append(el('b', null, '✓ Budgettet er opdateret'), el('p', 'hint', 'Alle poster er tjekket inden for det sidste år' + (sidst ? ' – senest ' + bSidst(sidst) : '') + '.'),
      knap('Gennemgå alle alligevel', 'lille-knap', () => budgetGennemgang(true)));
  }
  dele.push(g);

  // Store betalinger de næste to måneder (dem, der ikke kommer hver måned)
  const nu = new Date().getMonth(), mt = bMaanedTotal(poster), snit = aar / 12;
  const kom = el('div', 'kort');
  kom.append(el('h3', null, '📅 De næste to måneder'));
  for (const m of [nu, (nu + 1) % 12]) {
    const diff = mt[m] - snit;
    const top = el('div', 'b-kom-top');
    top.append(el('b', null, MDR_LANG[m][0].toUpperCase() + MDR_LANG[m].slice(1)), el('span', null, bKr(mt[m]) + ' kr'),
      el('span', 'b-diff ' + (diff > 1 ? 'op' : diff < -1 ? 'ned' : ''), Math.abs(diff) < 1 ? 'som et gennemsnit' : (diff > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(diff)) + (diff > 0 ? ' mere' : ' mindre') + ' end normalt'));
    kom.append(top);
    const ekstra = poster.filter(p => bMdr(p)[m] && bMoenster(p) !== 'hver måned').sort((a, b) => bMdr(b)[m] - bMdr(a)[m]);
    if (ekstra.length) {
      const ul = el('ul', 'b-kom-liste');
      ul.append(...ekstra.slice(0, 6).map(p => { const li = el('li'); li.append(el('span', null, bIkon(p.gruppe) + ' ' + p.navn), el('span', 'b-beloeb', bKr(bMdr(p)[m]) + ' kr')); return li; }));
      if (ekstra.length > 6) ul.append(el('li', 'hint', '+ ' + (ekstra.length - 6) + ' mere'));
      kom.append(ul);
    } else kom.append(el('p', 'hint', 'Kun de faste månedlige.'));
  }
  const mere = knap('Se hele året ›', 'lille-knap', () => { budgetVis = 'maaneder'; budgetMaaned = nu; lokal.set('budget-vis', 'maaneder'); tegnBudget(); });
  kom.append(mere);
  dele.push(kom);

  // Fordeling pr. kategori – én farve, længste øverst
  const grp = [...bGrupper(poster)].map(([navn, ps]) => ({ navn, md: ps.reduce((s, p) => s + bAar(p), 0) / 12 })).sort((a, b) => b.md - a.md);
  const maks = Math.max(1, ...grp.map(x => x.md));
  const ford = el('div', 'kort');
  ford.append(el('h3', null, 'Hvor går pengene hen?'));
  const ul = el('ul', 'b-bjaelker');
  for (const x of grp) {
    const li = el('li');
    const b = knap('', 'b-bjaelke', () => { budgetVis = 'poster'; budgetGruppe = x.navn; lokal.set('budget-vis', 'poster'); tegnBudget(); window.scrollTo(0, 0); });
    b.setAttribute('aria-label', x.navn + ': ' + bKr(x.md) + ' kr om måneden, ' + Math.round(x.md / md * 100) + ' %');
    const spor = el('span', 'b-spor'), fyld = el('span', 'b-fyld');
    fyld.style.width = Math.max(1.5, x.md / maks * 100) + '%';
    spor.append(fyld);
    b.append(el('span', 'b-navn', bIkon(x.navn) + ' ' + x.navn), el('span', 'b-vaerdi', bKr(x.md) + ' kr'), spor);
    li.append(b); ul.append(li);
  }
  ford.append(ul, el('p', 'hint', 'Kr. om måneden i gennemsnit. Tryk for at se posterne.'));
  dele.push(ford);

  // Konti og overførsler
  const kk = el('div', 'kort');
  kk.append(el('h3', null, '🏦 Konti og overførsler'));
  const tab = el('ul', 'b-konti');
  for (const k of konti) {
    const li = el('li');
    const b = knap('', 'b-konto', () => redigerKonto(k));
    const venstre = el('span', 'b-konto-v');
    venstre.append(el('b', null, k.navn), el('span', 'hint', 'Behov ' + bKr(k.md) + ' kr/md · hver af jer ' + bKr(k.hver)));
    let status;
    if (k.overfoert == null) status = el('span', 'b-status tom', 'Sæt overførsel');
    else {
      const d = k.md - k.overfoert;
      status = Math.abs(d) < 1 ? el('span', 'b-status ok', '✓ Passer')
        : d > 0 ? el('span', 'b-status mangler', '▲ Mangler ' + bKr(d)) : el('span', 'b-status over', '▼ ' + bKr(-d) + ' for meget');
      status.title = 'Overføres nu: ' + bKr(k.overfoert) + ' kr/md';
    }
    b.append(venstre, status);
    li.append(b); tab.append(li);
  }
  const iAlt = konti.reduce((s, k) => s + (k.overfoert || 0), 0);
  kk.append(tab, el('p', 'hint', 'Behov i alt ' + bKr(md) + ' kr/md · hver af jer ' + bKr(hver) + ' kr/md (delt i ' + BUDGET_DELES + ', rundet op til ' + BUDGET_RUND + ' kr)' +
    (iAlt ? ' · overføres nu ' + bKr(iAlt) + ' kr/md i alt' : '') + '. Tryk på en konto for at skrive, hvad der overføres nu.'));
  dele.push(kk);
  return dele;
}

function redigerKonto(k) {
  const felt1 = input('text', 'konto-overfoert', k.overfoert != null ? String(k.overfoert) : '', 'fx 7000');
  felt1.inputMode = 'numeric';
  const navn = input('text', 'konto-navn', k.navn);
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Gem', 'knap', async () => {
    const o = felt1.value.trim() === '' ? null : bTal(felt1.value);
    if (o != null && (isNaN(o) || o < 0)) { felt1.focus(); visStatus('Skriv et beløb i kr', true); return; }
    const nyt = navn.value.trim() || k.navn;
    if (k.r) await Data.update('budgetkonti', k.r.id, { navn: nyt, overfoert: o });
    else await Data.add('budgetkonti', { navn: nyt, overfoert: o, raekke: Data.listNu('budgetkonti').length });
    if (nyt !== k.navn) for (const p of bPoster().filter(p => p.konto === k.navn)) await Data.update('budget', p.id, { konto: nyt });
    lukArk(); tegnBudget();
  }));
  aabnArk('🏦 ' + k.navn, el('p', null, 'Posterne på kontoen koster ' + bKr(k.md) + ' kr om måneden i gennemsnit. Hver af jer: ' + bKr(k.hver) + ' kr/md.'),
    felt('Overføres nu i alt pr. måned (kr)', felt1), felt('Kontoens navn', navn),
    el('p', 'hint', 'Kun kontoens navn – aldrig kontonummer. Omdøbes kontoen, følger posterne med.'), knapper);
}

// ---------- Poster ----------
function budgetPosterVis(poster) {
  const grupper = bGrupper(poster);
  if (budgetGruppe && !grupper.has(budgetGruppe)) budgetGruppe = '';
  const dele = [];
  const top = el('div', 'b-poster-top');
  top.append(knap('+ Ny post', 'lille-knap', () => redigerPost(null, budgetGruppe)),
    knap('🔄 Gennemgang', 'lille-knap', () => budgetGennemgang(!poster.some(bGammel))));
  dele.push(top);
  const soeg = input('search', 'budget-soeg', budgetSoeg, 'Søg efter en post');
  soeg.addEventListener('input', () => { budgetSoeg = soeg.value; tegnListe(); });
  dele.push(soeg);
  const chips = el('div', 'seg b-gruppe-valg');
  for (const g of ['', ...grupper.keys()]) {
    const b = knap(g ? bIkon(g) + ' ' + g : 'Alle', null, () => { budgetGruppe = budgetGruppe === g ? '' : g; tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetGruppe === g);
    chips.append(b);
  }
  dele.push(chips);
  const liste = el('div', 'b-poster');
  dele.push(liste);
  function tegnListe() {
    const q = budgetSoeg.trim().toLowerCase();
    const dele2 = [];
    for (const [g, ps] of grupper) {
      if (budgetGruppe && g !== budgetGruppe) continue;
      const vist = ps.filter(p => !q || [p.navn, p.note, p.konto, g].join(' ').toLowerCase().includes(q));
      if (!vist.length) continue;
      const h = el('div', 'b-gruppe-hoved');
      h.append(el('b', null, bIkon(g) + ' ' + g), el('span', null, bKr(ps.reduce((s, p) => s + bAar(p), 0) / 12) + ' kr/md'));
      const ul = el('ul', 'b-post-liste');
      ul.append(...vist.map(p => {
        const li = el('li');
        const a = bAar(p);
        const b = knap('', 'b-post' + (a ? '' : ' nul'), () => redigerPost(p));
        const v = el('span', 'b-post-v');
        v.append(el('span', 'b-post-navn', p.navn || 'Uden navn'),
          el('span', 'b-post-info', [p.konto, bMoenster(p), bGammel(p) ? '🔄 tjek' : ''].filter(Boolean).join(' · ')));
        const h2 = el('span', 'b-post-h');
        h2.append(el('b', null, a ? bKr(a / 12) + ' kr' : '0 kr'), el('span', null, a ? bKr(a) + '/år' : ''));
        b.append(v, h2);
        li.append(b);
        return li;
      }));
      dele2.push(h, ul);
    }
    if (!dele2.length) dele2.push(el('p', 'tom', 'Ingen poster passer.'));
    liste.replaceChildren(...dele2);
  }
  tegnListe();
  return dele;
}

// ---------- Måneder ----------
function budgetMaanederVis(poster) {
  const mt = bMaanedTotal(poster), snit = mt.reduce((s, x) => s + x, 0) / 12, maks = Math.max(1, ...mt);
  if (budgetMaaned == null) budgetMaaned = new Date().getMonth();
  const kort = el('div', 'kort');
  kort.append(el('h3', null, 'Udgifter måned for måned'));
  const graf = el('div', 'b-graf');
  graf.setAttribute('role', 'group'); graf.setAttribute('aria-label', 'Udgifter pr. måned');
  const linje = el('span', 'b-snit');
  linje.style.bottom = 'calc(22px + ' + (snit / maks) + ' * (100% - 40px))';
  linje.append(el('span', null, 'gns. ' + bKr(snit)));
  graf.append(linje);
  mt.forEach((t, i) => {
    const b = knap('', 'b-soejle' + (i === budgetMaaned ? ' valgt' : ''), () => { budgetMaaned = i; tegnBudget(); });
    b.setAttribute('aria-label', MDR_LANG[i] + ': ' + bKr(t) + ' kr');
    b.setAttribute('aria-pressed', i === budgetMaaned);
    const s = el('span', 'b-soejle-fyld'); s.style.height = Math.max(1, t / maks * 100) + '%';
    s.append(el('span', 'b-soejle-tal', bKr(t / 1000) + 'k'));
    const spor = el('span', 'b-soejle-spor'); spor.append(s);
    b.append(spor, el('span', 'b-soejle-md', MDR[i].replace('.', '')));
    graf.append(b);
  });
  kort.append(graf);
  const m = budgetMaaned, diff = mt[m] - snit;
  const liste = el('div', 'kort');
  const top = el('div', 'b-kom-top');
  top.append(el('b', null, MDR_LANG[m][0].toUpperCase() + MDR_LANG[m].slice(1)), el('span', null, bKr(mt[m]) + ' kr'),
    el('span', 'b-diff ' + (diff > 1 ? 'op' : diff < -1 ? 'ned' : ''), Math.abs(diff) < 1 ? 'som et gennemsnit' : (diff > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(diff)) + (diff > 0 ? ' over' : ' under') + ' gennemsnittet'));
  liste.append(top);
  const ps = poster.filter(p => bMdr(p)[m]).sort((a, b) => (bMoenster(a) === 'hver måned') - (bMoenster(b) === 'hver måned') || bMdr(b)[m] - bMdr(a)[m]);
  const ul = el('ul', 'b-kom-liste');
  ul.append(...ps.map(p => {
    const li = el('li');
    const b = knap('', 'b-linje', () => redigerPost(p));
    b.append(el('span', null, bIkon(p.gruppe) + ' ' + p.navn + (bMoenster(p) === 'hver måned' ? '' : ' ★')), el('span', 'b-beloeb', bKr(bMdr(p)[m]) + ' kr'));
    li.append(b); return li;
  }));
  liste.append(ul, el('p', 'hint', '★ = betales ikke hver måned. Tryk på en måned i grafen for at se den.'));
  return [kort, liste];
}

// ---------- Beløb: hver måned / bestemte måneder / forskellige beløb ----------
function beloebFelt(mdr, onSkift) {
  const v = Array.from({ length: 12 }, (_, i) => Number((mdr || [])[i]) || 0);
  const nz = v.filter(Boolean);
  let tilstand = !nz.length || (nz.length === 12 && nz.every(x => x === nz[0])) ? 'md' : nz.every(x => x === nz[0]) ? 'valgte' : 'forskellige';
  let beloeb = nz[0] || 0;
  const valgte = new Set(v.map((x, i) => (x ? i : -1)).filter(i => i >= 0));
  if (!valgte.size) valgte.add(new Date().getMonth());
  const arr = [...v];
  const boks = el('div', 'b-beloeb-felt');
  const omraade = el('div');
  const tal = (vaerdi, id, label) => { const i = input('text', id, vaerdi ? String(vaerdi).replace('.', ',') : '', '0'); i.inputMode = 'decimal'; i.setAttribute('aria-label', label); return i; };
  const hent = () => tilstand === 'md' ? Array(12).fill(beloeb || 0) : tilstand === 'valgte' ? Array.from({ length: 12 }, (_, i) => (valgte.has(i) ? beloeb || 0 : 0)) : [...arr];
  const skift = () => onSkift && onSkift(hent());
  function tegn() {
    const dele = [];
    if (tilstand === 'md' || tilstand === 'valgte') {
      const i = tal(beloeb, 'b-beloeb', tilstand === 'md' ? 'Beløb pr. måned' : 'Beløb pr. gang');
      i.addEventListener('input', () => { const n = bTal(i.value); beloeb = isNaN(n) ? 0 : n; skift(); });
      dele.push(felt(tilstand === 'md' ? 'Beløb hver måned (kr)' : 'Beløb pr. gang (kr)', i));
    }
    if (tilstand === 'valgte') {
      const g = el('div', 'b-mdr-valg');
      for (let i = 0; i < 12; i++) {
        const b = knap(MDR[i].replace('.', ''), null, () => { valgte.has(i) ? valgte.delete(i) : valgte.add(i); b.setAttribute('aria-checked', valgte.has(i)); skift(); });
        b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', valgte.has(i));
        g.append(b);
      }
      dele.push(el('label', 'felt-label', 'Hvilke måneder?'), g);
    }
    if (tilstand === 'forskellige') {
      const g = el('div', 'b-mdr-tal');
      for (let i = 0; i < 12; i++) {
        const t = tal(arr[i], 'b-md-' + i, MDR_LANG[i]);
        t.addEventListener('input', () => { const n = bTal(t.value); arr[i] = isNaN(n) ? 0 : n; skift(); });
        const l = el('label', 'b-md-felt'); l.append(el('span', null, MDR[i]), t);
        g.append(l);
      }
      dele.push(g);
    }
    omraade.replaceChildren(...dele);
  }
  const valg = chipValg(['md', 'valgte', 'forskellige'], tilstand, t => tegnSkift(t), t => ({ md: 'Hver måned', valgte: 'Bestemte måneder', forskellige: 'Forskellige beløb' }[t]));
  function tegnSkift(t) {
    const h = hent(), gl = tilstand;   // beløbene efter den gamle måde
    tilstand = t;
    if (t === 'forskellige') h.forEach((x, i) => { arr[i] = x; });
    else if (gl === 'forskellige') {
      const nz2 = h.filter(Boolean);
      if (nz2.length) beloeb = Math.max(...nz2);
      valgte.clear(); h.forEach((x, i) => x && valgte.add(i));
      if (!valgte.size) valgte.add(new Date().getMonth());
    }
    tegn(); skift();
  }
  boks.append(valg, omraade);
  tegn();
  boks.hent = hent;
  return boks;
}

// ---------- Ret / ny post ----------
function redigerPost(p, gruppeForslag) {
  const ny = !p;
  p = p || { navn: '', gruppe: gruppeForslag || '', konto: '', mdr: [] };
  const poster = bPoster();
  const navn = input('text', 'post-navn', p.navn, 'fx Vand, Bilforsikring, Netflix');
  const grupper = [...bGrupper(poster).keys()];
  let gruppe = p.gruppe || '';
  const nyGruppe = input('text', 'post-ny-gruppe', '', 'eller skriv en ny kategori');
  const gruppeValg = chipValg(grupper, gruppe, v => { gruppe = v; nyGruppe.value = ''; }, v => bIkon(v) + ' ' + v);
  nyGruppe.addEventListener('input', () => { if (nyGruppe.value.trim()) { gruppe = ''; gruppeValg.querySelectorAll('[aria-checked=true]').forEach(b => b.setAttribute('aria-checked', 'false')); } });
  const kontoNavne = bKonti(poster).map(k => k.navn);
  let konto = p.konto || '';
  const nyKonto = input('text', 'post-ny-konto', '', 'eller skriv en ny konto');
  const kontoValg = chipValg(kontoNavne, konto, v => { konto = v; nyKonto.value = ''; });
  nyKonto.addEventListener('input', () => { if (nyKonto.value.trim()) { konto = ''; kontoValg.querySelectorAll('[aria-checked=true]').forEach(b => b.setAttribute('aria-checked', 'false')); } });
  const sum = el('p', 'b-sum');
  const visSum = m => { const a = m.reduce((s, x) => s + x, 0); sum.textContent = '= ' + bKr(a) + ' kr om året · ' + bKr(a / 12) + ' kr om måneden'; };
  const beloeb = beloebFelt(p.mdr, visSum);
  visSum(beloeb.hent());
  const note = input('text', 'post-note', p.note || '', 'fx forbrug 1400 m³ à 6 kr.');
  const dele = [felt('Hvad er det?', navn), el('label', 'felt-label', 'Kategori'), gruppeValg, nyGruppe, el('label', 'felt-label', 'Betales fra konto'), kontoValg, nyKonto,
    el('label', 'felt-label', 'Beløb'), beloeb, sum, felt('Note (valgfri)', note)];
  if (!ny) {
    const hist = (p.historik || []).slice(-3).reverse();
    dele.push(el('p', 'hint', 'Sidst tjekket: ' + bSidst(p.tjekket) + '.' + (hist.length ? ' Før: ' + hist.map(h => bKr(h.aar) + ' kr/år (til ' + bDato(h.dato) + ')').join(' · ') : '')));
  }
  const knapper = el('div', 'ark-knapper');
  if (!ny) {
    const slet = knap('Slet', 'knap fare', e => bekraeft(e.currentTarget, async () => { await Data.remove('budget', p.id); lukArk(); tegnBudget(); }));
    slet.dataset.handling = 'slette';
    knapper.append(slet);
  }
  knapper.append(knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const g = nyGruppe.value.trim() || gruppe || 'Andet';
    const k = nyKonto.value.trim() || konto || '';
    const mdr = beloeb.hent().map(x => Math.round(x * 100) / 100);
    const felter = { navn: n, gruppe: g, konto: k, mdr, note: note.value.trim() || null, tjekket: bIdag() };
    if (ny) {
      const iGruppe = poster.filter(x => (x.gruppe || 'Andet') === g).map(x => x.raekke ?? 0);
      felter.raekke = iGruppe.length ? Math.max(...iGruppe) + 0.01 : Math.max(0, ...poster.map(x => x.raekke ?? 0)) + 10;
      await Data.add('budget', felter);
    } else {
      const foer = bAar(p);
      if (Math.abs(foer - mdr.reduce((s, x) => s + x, 0)) >= 0.5) felter.historik = [...(p.historik || []), { dato: p.tjekket || bIdag(), aar: foer }].slice(-10);
      await Data.update('budget', p.id, felter);
    }
    lukArk(); tegnBudget();
  }));
  dele.push(knapper);
  aabnArk(ny ? 'Ny post i budgettet' : 'Ret post', ...dele);
}
const bDato = iso => { const [y, m, d] = (iso || '').split('-').map(Number); return y ? d + '. ' + MDR[m - 1] + ' ' + y : ''; };

// ---------- Gennemgang: én post ad gangen ----------
function budgetGennemgang(alle) {
  const start = bPoster();
  const koe = start.filter(p => alle || bGammel(p)).sort(bSort).map(p => p.id);
  if (!koe.length) { visStatus('Alle poster er tjekket'); return; }
  const foerMd = start.reduce((s, p) => s + bAar(p), 0) / 12;
  const foerKonti = new Map(bKonti(start).map(k => [k.navn, k.hver]));
  const tal = { ok: 0, rettet: 0, slettet: 0 };
  let i = 0;
  const naeste = () => { i++; vis(); };
  function vis() {
    if (i >= koe.length) return slut();
    const p = bPoster().find(x => x.id === koe[i]);
    if (!p) { i++; return vis(); }
    const fremdrift = el('div', 'b-fremdrift');
    const f = el('span'); f.style.width = (i / koe.length * 100) + '%'; fremdrift.append(f);
    const kort = el('div', 'b-gennem-kort');
    const a = bAar(p);
    kort.append(el('span', 'b-gennem-gruppe', bIkon(p.gruppe) + ' ' + (p.gruppe || 'Andet') + (p.konto ? ' · konto ' + p.konto : '')),
      el('b', 'b-gennem-navn', p.navn), p.note ? el('span', 'hint', p.note) : '',
      el('span', 'b-gennem-beloeb', bKr(a / 12) + ' kr/md'), el('span', 'b-gennem-under', bKr(a) + ' kr om året · ' + bMoenster(p)),
      el('span', 'hint', 'Sidst tjekket: ' + bSidst(p.tjekket)));
    const ret = el('div', 'b-gennem-ret');
    ret.hidden = true;
    const knapper = el('div', 'b-gennem-knapper');
    const ok = knap('✓ Passer stadig', 'knap', async () => { await Data.update('budget', p.id, { tjekket: bIdag() }); tal.ok++; naeste(); });
    const retK = knap('✏️ Ret beløbet', 'knap sekundaer', () => {
      ret.hidden = false; knapper.hidden = true;
      const sum = el('p', 'b-sum');
      const visSum = m => { const s = m.reduce((x, y) => x + y, 0); sum.textContent = '= ' + bKr(s) + ' kr om året · ' + bKr(s / 12) + ' kr/md' + (Math.abs(s - a) >= 1 ? ' (' + (s > a ? '+' : '−') + bKr(Math.abs(s - a)) + ' kr/år)' : ''); };
      const bf = beloebFelt(p.mdr, visSum); visSum(bf.hent());
      const r = el('div', 'ark-knapper');
      r.append(knap('Fortryd', 'knap sekundaer', () => { ret.hidden = true; knapper.hidden = false; }),
        knap('Gem og næste', 'knap', async () => {
          const mdr = bf.hent().map(x => Math.round(x * 100) / 100);
          const felter = { mdr, tjekket: bIdag() };
          if (Math.abs(a - mdr.reduce((s, x) => s + x, 0)) >= 0.5) { felter.historik = [...(p.historik || []), { dato: p.tjekket || bIdag(), aar: a }].slice(-10); tal.rettet++; } else tal.ok++;
          await Data.update('budget', p.id, felter); naeste();
        }));
      ret.replaceChildren(bf, sum, r);
    });
    const slet = knap('🗑 Bruger vi ikke mere', 'knap fare', e => bekraeft(e.currentTarget, async () => { await Data.remove('budget', p.id); tal.slettet++; naeste(); }));
    slet.dataset.handling = 'fjerne posten';
    knapper.append(ok, retK, slet, knap('Spring over ›', 'lille-knap b-spring', naeste));
    aabnArk('🔄 Gennemgang ' + (i + 1) + ' af ' + koe.length, fremdrift, kort, knapper, ret);
  }
  function slut() {
    const nu = bPoster();
    const nuMd = nu.reduce((s, p) => s + bAar(p), 0) / 12, d = nuMd - foerMd;
    const dele = [el('div', 'b-gennem-slut', '🎉'), el('p', 'b-gennem-tal', '✓ ' + tal.ok + ' passer · ✏️ ' + tal.rettet + ' rettet · 🗑 ' + tal.slettet + ' fjernet')];
    dele.push(el('p', null, Math.abs(d) < 1 ? 'Budgettet er det samme: ' + bKr(nuMd) + ' kr om måneden.' : 'Budgettet er nu ' + bKr(nuMd) + ' kr om måneden (' + (d > 0 ? '+' : '−') + bKr(Math.abs(d)) + ' kr i forhold til før).'));
    const aendret = bKonti(nu).filter(k => foerKonti.has(k.navn) && foerKonti.get(k.navn) !== k.hver);
    const husk = bKonti(nu).filter(k => k.overfoert != null && Math.abs(k.md - k.overfoert) >= 1);
    if (aendret.length || husk.length) {
      const ul = el('ul', 'b-husk');
      for (const k of aendret) ul.append(el('li', null, k.navn + ': hver af jer ' + bKr(foerKonti.get(k.navn)) + ' → ' + bKr(k.hver) + ' kr/md'));
      for (const k of husk) ul.append(el('li', null, k.navn + ': der overføres ' + bKr(k.overfoert) + ', behovet er ' + bKr(k.md) + ' kr/md'));
      dele.push(el('b', null, 'Husk at rette overførslerne i banken:'), ul);
    }
    const knapper = el('div', 'ark-knapper');
    knapper.append(knap('Færdig', 'knap', () => { lukArk(); tegnBudget(); }));
    dele.push(knapper);
    aabnArk('Gennemgang færdig', ...dele);
    tegnBudget();
  }
  vis();
}
