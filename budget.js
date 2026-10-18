// budget.js – 💰 Budget (Mere → Budget). KUN VOKSNE – databasen (kun_voksne) giver aldrig børn rækkerne.
// Data:
//   'budget'      {navn, gruppe, konto, mdr: [12 beløb jan–dec], note?, tjekket: 'ÅÅÅÅ-MM-DD', historik?: [{dato, aar}], raekke?}
//   'budgetkonti' {navn, overfoert?: kr pr. måned i alt (det der overføres nu), raekke?}
//   Personlige budgetter (Timmo/Winnie): samme felter + type 'ind' (indtægt) | 'ud' (udgift) og ejer (navn). Ligger i
//     'budget_privat' (kun den, der oprettede rækken – maa_se) eller 'budget_delt' (alle voksne) – personen vælger selv.
//     "Andel af fælles budget" regnes automatisk (summen af "hver af jer" pr. konto) og gemmes ikke.
//   Årsbillede (📌 Gem årets budget): række i samme liste {snap: 'ÅÅÅÅ', dato, poster: [{navn, gruppe, konto?, type?, aar}], ejer?}
//   Forbrug (fra banken): {snap: 'ÅÅÅÅ', art: 'forbrug', maaneder: antal måneder, periode: 'jan–okt', dato, poster: [{navn, gruppe, aar}]}
//     – aar = det brugte beløb i perioden; kr/md = aar / maaneder. Vises kun under fanen År.
//   Bankposteringer: én række {snap: '_bank', art: 'bankfil', sti, navn, lavet, fra, til, antal} peger på en JSON-fil i Storage
//     (voksne/…, laves af Claude ud fra bankeksporten – ingen kontonumre): {rows: [{id, d, k (konto), t, b, ty, n (post), g (gruppe)}]}.
//     Hentes først, når man trykker på en post under År. Rettelser: {snap: '_bank', art: 'bankret', pid, aar, dato, tekst, beloeb,
//     fra: {navn, gruppe}, til: {navn, gruppe}} – lægges oven på filen og på forbruget i tabellen, så en ny fil ikke overskriver dem.
//     – bruges til "År for år" og Sammenlign. Poster-funktionerne springer snap-rækker over.
// Behov pr. konto = summen af posterne / 12. "Hver af jer" = behov delt i BUDGET_DELES, rundet op til nærmeste BUDGET_RUND kr.
// En post er "ikke tjekket", når den ikke er set i en gennemgang/rettet i 12 måneder – så ved man, hvad der skal opdateres.
// Personlige data (beløb, navne på poster) ligger kun i databasen – aldrig i koden.
const BUDGET_DELES = 2, BUDGET_RUND = 50, BUDGET_GAMMEL_MDR = 12;
const BUDGET_IKONER = [
  [/fælles ting/i, '🤝'], [/fælles budget/i, '👨‍👩‍👦‍👦'], [/personligt/i, '👤'],
  [/feriehus|sommerhus/i, '🏖️'], [/husholdning|dagligvar|mad/i, '🛒'], [/hus|bolig/i, '🏠'], [/transport|bil/i, '🚗'],
  [/forsikring/i, '🛡️'], [/fritid|sfo|sport/i, '⚽'], [/kæledyr|dyr/i, '🐰'], [/stream|abonnement/i, '📺'],
  [/børn/i, '🧒'], [/ferie|rejse/i, '✈️'], [/opsparing|buffer|pension/i, '🐷'], [/egne/i, '🧾'], [/indtægt/i, '💰']
];
let budgetVis = lokal.get('budget-vis') || 'overblik';
let budgetGruppe = '';
let budgetSoeg = '';
let budgetMaaned = null;
let budgetAarValg = lokal.get('budget-aarvis') || 'begge';
let budgetSort = lokal.get('budget-sort') || 'std';   // 'std' = fast rækkefølge (B_GRUPPE_ORDEN, største post først) · 'stoerst' = største beløb først
const budgetAabne = new Set();

const bKr = n => Math.round(n || 0).toLocaleString('da-DK');
const bTal = s => { const t = String(s ?? '').replace(/\s|kr\.?/gi, '').replace(/\./g, '').replace(',', '.'); const n = Number(t); return isFinite(n) ? n : NaN; };
const bIkon = g => (BUDGET_IKONER.find(([r]) => r.test(g || '')) || [, '📁'])[1];
const B_PRIVAT = 'budget_privat', B_DELT = 'budget_delt';
let budgetHvem = lokal.get('budget-hvem') || 'faelles';
const bMig = () => Data.bruger()?.navn || '';
const bMaerk = (rk, liste) => rk.map(r => ({ ...r, _liste: liste }));
const bAlleFaelles = () => bMaerk(Data.listNu('budget'), 'budget');
const bPoster = () => bAlleFaelles().filter(p => !p.snap);
function bPersonRaekker(hvem) {
  const mig = bMig();
  return [...(hvem === mig ? bMaerk(Data.listNu(B_PRIVAT), B_PRIVAT).filter(p => !p.ejer || p.ejer === mig) : []),
    ...bMaerk(Data.listNu(B_DELT), B_DELT).filter(p => p.ejer === hvem)];
}
const bDelt = hvem => Data.listNu(B_DELT).some(p => p.ejer === hvem);
// Hvor kommer posterne fra, og hvor gemmes nye? (fælles eller én persons budget)
function bKilde(hvem) {
  if (!hvem || hvem === 'faelles') return { faelles: true, hvem: 'faelles', alle: bAlleFaelles, poster: bPoster, nyListe: () => 'budget', ekstra: {} };
  return { faelles: false, hvem, alle: () => bPersonRaekker(hvem), poster: () => bPersonRaekker(hvem).filter(p => !p.snap),
    nyListe: () => (hvem !== bMig() || bDelt(hvem) ? B_DELT : B_PRIVAT), ekstra: { ejer: hvem } };
}
// Andel af det fælles budget pr. person (pr. måned) = summen af "hver af jer" pr. konto
const bAndel = () => bKonti(bPoster()).reduce((s, k) => s + k.hver, 0);
const bErInd = p => p.type === 'ind';
// Personligt: indtægter og udgifter pr. måned (udgifter inkl. andelen af det fælles budget)
function bPersonTal(poster) {
  const andel = bAndel();
  const ind = Array.from({ length: 12 }, (_, i) => poster.filter(bErInd).reduce((s, p) => s + bMdr(p)[i], 0));
  const ud = Array.from({ length: 12 }, (_, i) => poster.filter(p => !bErInd(p)).reduce((s, p) => s + bMdr(p)[i], 0) + andel);
  return { andel, ind, ud, over: ind.map((x, i) => x - ud[i]), indAar: ind.reduce((s, x) => s + x, 0), udAar: ud.reduce((s, x) => s + x, 0) };
}
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
// Fast rækkefølge på kategorierne: det daglige og nødvendige først, det man kan vælge fra sidst.
// Ukendte kategorier kommer efter (alfabetisk), Andet altid sidst.
const B_GRUPPE_ORDEN = ['Indtægter', 'Fælles budget', 'Fælles ting betalt af mig', 'Mad og husholdning', 'Hus', 'Transport', 'Børn',
  'Personligt', 'Forsikringer', 'Abonnementer og kontingenter', 'Fritid', 'Ferie og oplevelser', 'Sommerhus', 'Kæledyr', 'Opsparing'];
const bGruppeSort = (a, b) => (a === 'Andet') - (b === 'Andet') ||
  (B_GRUPPE_ORDEN.indexOf(a) + 1 || 999) - (B_GRUPPE_ORDEN.indexOf(b) + 1 || 999) || a.localeCompare(b, 'da');
// Inden for en kategori: største beløb først
const bStoerstSort = (a, b) => bAar(b) - bAar(a) || bSort(a, b);
function bGrupper(poster) {
  const m = new Map();
  for (const p of [...poster].sort(bStoerstSort)) { const g = p.gruppe || 'Andet'; if (!m.has(g)) m.set(g, []); m.get(g).push(p); }
  return new Map([...m].sort((a, b) => bGruppeSort(a[0], b[0])));
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
  // Fælles og Mit budget tælles hver for sig, så man kan se, hvor det er, der skal tjekkes
  const nF = poster.filter(bGammel).length, nM = bKilde(bMig()).poster().filter(bGammel).length;
  const tjek = nF && nM ? nF + ' fælles + ' + nM + ' i Mit budget skal tjekkes' : nF ? nF + ' skal tjekkes' : nM ? nM + ' i Mit budget skal tjekkes' : '';
  u.textContent = bKr(poster.reduce((s, p) => s + bAar(p), 0) / 12) + ' kr om måneden' + (tjek ? ' · 🔄 ' + tjek : ' · ✓ opdateret');
}

function tegnBudget() {
  budgetMereTekst();
  const sek = document.getElementById('budget'), boks = document.getElementById('budget-indhold');
  if (!boks || sek.hidden || sek.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
  // Hvis budget? Fælles · mit eget · andres, der er delt med mig
  const mig = bMig();
  const andre = [...new Set(Data.listNu(B_DELT).map(p => p.ejer).filter(n => n && n !== mig))];
  if (budgetHvem !== 'faelles' && budgetHvem !== mig && !andre.includes(budgetHvem)) budgetHvem = 'faelles';
  const hvemSeg = el('div', 'seg budget-hvem');
  hvemSeg.setAttribute('role', 'radiogroup');
  for (const [id, tekst] of [['faelles', '👨‍👩‍👦‍👦 Fælles'], [mig, '👤 Mit budget'], ...andre.map(n => [n, n + 's'])]) {
    const b = knap(tekst, id === 'faelles' ? null : PK[id] || null, () => { budgetHvem = id; lokal.set('budget-hvem', id); tegnBudget(); window.scrollTo(0, 0); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetHvem === id);
    hvemSeg.append(b);
  }
  const seg = el('div', 'seg budget-faner');
  seg.setAttribute('role', 'radiogroup');
  for (const [id, tekst] of [['overblik', 'Overblik'], ['poster', 'Poster'], ['maaneder', 'Måneder'], ['aar', 'År']]) {
    const b = knap(tekst, null, () => { budgetVis = id; lokal.set('budget-vis', id); tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetVis === id);
    seg.append(b);
  }
  if (budgetHvem !== 'faelles') {
    const kilde = bKilde(budgetHvem), ps = kilde.poster();
    if (!ps.length) { boks.replaceChildren(hvemSeg, ...budgetPersonVis(kilde)); return; }
    const indhold = budgetVis === 'poster' ? budgetPosterVis(ps, kilde) : budgetVis === 'maaneder' ? budgetMaanederVis(ps, kilde)
      : budgetVis === 'aar' ? budgetAarVis(ps, kilde) : budgetPersonVis(kilde);
    boks.replaceChildren(hvemSeg, seg, ...indhold);
    return;
  }
  const poster = bPoster();
  if (!poster.length) {
    const tom = el('div', 'kort budget-tom');
    tom.append(el('p', null, 'Her samler I familiens faste udgifter – hvad de koster om måneden og året, hvilken konto de betales fra, og hvor meget hver af jer skal overføre.'),
      knap('+ Tilføj første post', 'knap', () => redigerPost(null)));
    boks.replaceChildren(hvemSeg, tom);
    return;
  }
  const indhold = budgetVis === 'poster' ? budgetPosterVis(poster) : budgetVis === 'maaneder' ? budgetMaanederVis(poster)
    : budgetVis === 'aar' ? budgetAarVis(poster) : budgetOverblik(poster);
  boks.replaceChildren(hvemSeg, seg, ...indhold);
}

// ---------- Overblik ----------
// Faktisk forbrug i år mod budget pr. kategori (kr/md) – samme tal som under År. null hvis der ikke er forbrug for i år.
function bIAar(poster, kilde = bKilde('faelles'), bk = kilde.faelles ? bBankF : null) {
  const nu = String(new Date().getFullYear());
  const x = (bAarData(poster, kilde, bk).find(([a]) => a === nu) || [])[1];
  if (!x || !x.f) return null;
  const grupper = new Map();
  const laeg = (m, felt) => { for (const [, p] of m || []) { const g = p.gruppe || 'Andet'; if (!grupper.has(g)) grupper.set(g, { b: 0, f: 0 }); grupper.get(g)[felt] += p.md; } };
  laeg(x.b, 'b'); laeg(x.f, 'f');
  let b = 0, f = 0;
  for (const [g, v] of grupper) if (g !== 'Opsparing') { b += v.b; f += v.f; }
  return { grupper, b, f, periode: x.periode || 'i år', fMdr: x.fMdr };
}
function bIAarKort(iaar) {
  const d = iaar.f - iaar.b;
  const k = el('div', 'kort b-iaar');
  k.append(el('h3', null, '📊 Forbrug i år'));
  const top = el('div', 'b-kom-top');
  top.append(el('b', null, bKr(iaar.f) + ' kr/md'), el('span', null, 'budget ' + bKr(iaar.b) + ' kr/md'),
    el('span', 'b-diff ' + (d > 1 ? 'op' : d < -1 ? 'ned' : ''), Math.abs(d) < 1 ? 'som budgettet' : (d > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(d)) + (d > 0 ? ' over' : ' under')));
  k.append(top, el('p', 'hint', 'Faktisk forbrug ifølge banken ' + iaar.periode + ', i gennemsnit pr. måned – uden opsparing. Se det pr. kategori nedenfor og alle år under År.'));
  if (bBankRaekke()) k.append(knap('📥 Sortér det ukendte i Andet', 'lille-knap', () => bSortering()));
  return k;
}
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
  const iaar = bIAar(poster);
  if (iaar) dele.push(bIAarKort(iaar));
  dele.push(bAarKort(bKilde('faelles'), md));

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

  // Fordeling pr. kategori – faktisk forbrug i år (bjælke) mod budget (streg), ellers kun budget
  let grp = [...bGrupper(poster)].map(([navn, ps]) => ({ navn, md: ps.reduce((s, p) => s + bAar(p), 0) / 12, f: null }));
  if (iaar) {
    const m = new Map(grp.map(x => [x.navn, x]));
    for (const [navn, v] of iaar.grupper) { if (!m.has(navn)) { const x = { navn, md: v.b, f: null }; grp.push(x); m.set(navn, x); } m.get(navn).f = v.f; }
    grp = grp.filter(x => x.navn !== 'Opsparing' && (x.md >= 1 || Math.abs(x.f || 0) >= 1));
  }
  grp.sort(budgetSort === 'stoerst' ? (a, b) => (b.f ?? b.md) - (a.f ?? a.md) : (a, b) => bGruppeSort(a.navn, b.navn));
  const maks = Math.max(1, ...grp.map(x => Math.max(x.md, x.f || 0)));
  const ford = el('div', 'kort');
  ford.append(el('h3', null, 'Hvor går pengene hen?'));
  if (iaar) ford.append(el('p', 'hint b-ford-forkl', 'Forbrug i år (' + iaar.periode + ') i kr. om måneden. Stregen er budgettet.'));
  const ul = el('ul', 'b-bjaelker');
  for (const x of grp) {
    const li = el('li');
    const b = knap('', 'b-bjaelke', () => { budgetVis = 'poster'; budgetGruppe = x.navn; lokal.set('budget-vis', 'poster'); tegnBudget(); window.scrollTo(0, 0); });
    const spor = el('span', 'b-spor'), fyld = el('span', 'b-fyld');
    spor.append(fyld);
    if (x.f != null) {
      const over = x.f > x.md + Math.max(50, x.md * 0.05), under = x.f < x.md - Math.max(50, x.md * 0.05);
      fyld.style.width = Math.max(1.5, Math.max(0, x.f) / maks * 100) + '%';
      if (over) fyld.classList.add('op');
      const maal = el('span', 'b-maal'); maal.style.left = Math.min(99.5, x.md / maks * 100) + '%'; spor.append(maal);
      const v = el('span', 'b-vaerdi');
      v.append(el('span', 'b-f' + (over ? ' op' : under ? ' ned' : ''), bKr(x.f) + ' kr'), el('span', 'b-af', ' / ' + bKr(x.md)));
      b.setAttribute('aria-label', x.navn + ': forbrug ' + bKr(x.f) + ' kr om måneden, budget ' + bKr(x.md) + ' kr');
      b.append(el('span', 'b-navn', bIkon(x.navn) + ' ' + x.navn), v, spor);
    } else {
      fyld.style.width = Math.max(1.5, x.md / maks * 100) + '%';
      b.setAttribute('aria-label', x.navn + ': ' + bKr(x.md) + ' kr om måneden, ' + Math.round(x.md / md * 100) + ' %');
      b.append(el('span', 'b-navn', bIkon(x.navn) + ' ' + x.navn), el('span', 'b-vaerdi', bKr(x.md) + ' kr'), spor);
    }
    li.append(b); ul.append(li);
  }
  ford.append(ul, el('p', 'hint', iaar ? 'Rød = over budget. Opsparing er ikke med. Tryk for at se posterne.' : 'Kr. om måneden i gennemsnit. Tryk for at se posterne.'));
  dele.push(ford);

  // Konti og overførsler (+ saldo fra bankfilen, hvis den er hentet)
  const saldi = bSaldi(bBankF);
  const kk = el('div', 'kort');
  kk.append(el('h3', null, '🏦 Konti og overførsler'));
  const tab = el('ul', 'b-konti');
  for (const k of konti) {
    const li = el('li');
    const b = knap('', 'b-konto', () => redigerKonto(k));
    const venstre = el('span', 'b-konto-v');
    venstre.append(el('b', null, k.navn), el('span', 'hint', 'Behov ' + bKr(k.md) + ' kr/md · hver af jer ' + bKr(k.hver)));
    const sl = saldi && bSaldoFor(saldi, k.navn);
    if (sl) {
      sl.brugt = true;
      const mt = bMaanedTotal(poster.filter(p => p.konto === k.navn));
      // Skøn for slutningen af næste måned: saldo + to overførsler − resten af denne måned − hele næste måned
      const sd = new Date(sl.d + 'T12:00:00'), dim = new Date(sd.getFullYear(), sd.getMonth() + 1, 0).getDate();
      const rest = sd.getMonth() === nu ? Math.max(0, dim - sd.getDate()) / dim : 1;
      const ind = k.overfoert ?? k.md, om2 = sl.s + 2 * ind - rest * mt[nu] - mt[(nu + 1) % 12];
      venstre.append(el('span', 'b-saldo' + (om2 < 0 ? ' minus' : ''), '💰 ' + bKr(sl.s) + ' kr den ' + bDato(sl.d) + ' · slut ' + MDR_LANG[(nu + 1) % 12] + ' ca. ' + bKr(om2) + ' kr' + (om2 < 0 ? ' ⚠️' : '')));
    }
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
  if (saldi) {
    const andre = [...saldi.values()].filter(x => !x.brugt);
    if (andre.length) kk.append(el('p', 'hint', 'Andre konti: ' + andre.map(x => x.k + ' ' + bKr(x.s) + ' kr').join(' · ')));
    kk.append(el('p', 'hint', '💰 Saldo fra den seneste bankfil. "Slut ' + MDR_LANG[(nu + 1) % 12] + '" = saldo + det, der overføres, minus budgettets udgifter fra kontoen resten af denne måned og hele næste – et groft skøn.'));
  } else if (bBankRaekke(bBankF) && !bSaldiHenter) { bSaldiHenter = true; bHentBank(bBankF).then(() => { if (budgetVis === 'overblik') tegnBudget(); }).catch(() => {}); }
  dele.push(kk);
  return dele;
}
// Saldo pr. konto = saldoen på kontoens seneste postering i bankfilen (kun hvis filen er hentet)
let bSaldiHenter = false;
function bSaldi(bk) {
  const r = bBankRaekke(bk);
  if (!r || !bBankData || bBankSti !== r.sti) return null;
  const m = new Map();
  for (const x of bBankData.rows) {
    if (x.s == null || x.ty === 'flyttet') continue;
    const g = m.get(x.k);
    if (!g || x.d > g.d || x.d === g.d && (x.o ?? 0) > (g.o ?? 0)) m.set(x.k, { k: x.k, s: x.s, d: x.d, o: x.o });
  }
  return m;
}
function bSaldoFor(saldi, navn) {
  const n = navn.toLowerCase();
  if (saldi.has(navn)) return saldi.get(navn);
  return [...saldi.values()].find(x => { const k = x.k.toLowerCase(); return n.includes(k) || k.includes(n); }) || null;
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
function budgetPosterVis(poster, kilde = bKilde('faelles')) {
  const ind = kilde.faelles ? [] : poster.filter(bErInd).sort(bSort);
  const grupper = kilde.faelles ? bGrupper(poster) : new Map([...(ind.length ? [['Indtægter', ind]] : []), ...bGrupper(poster.filter(p => !bErInd(p)))]);
  if (budgetGruppe && !grupper.has(budgetGruppe)) budgetGruppe = '';
  const dele = [];
  const top = el('div', 'b-poster-top');
  if (kilde.faelles) top.append(knap('+ Ny post', 'lille-knap', () => redigerPost(null, budgetGruppe)));
  else top.append(knap('+ Indtægt', 'lille-knap', () => redigerPost(null, '', kilde, 'ind')), knap('+ Udgift', 'lille-knap', () => redigerPost(null, budgetGruppe === 'Indtægter' ? '' : budgetGruppe, kilde, 'ud')));
  top.append(knap('🔄 Gennemgang', 'lille-knap', () => budgetGennemgang(!poster.some(bGammel), kilde)));
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
  dele.push(chips, bSortValg());
  if (budgetSort === 'stoerst') {
    const sum = ps => ps.reduce((s, p) => s + bAar(p), 0);
    const ny = [...grupper].map(([g, ps]) => [g, ps.slice().sort((a, b) => bAar(b) - bAar(a))]);
    ny.sort((a, b) => (a[0] === 'Indtægter') - (b[0] === 'Indtægter') || sum(b[1]) - sum(a[1]));
    grupper.clear(); for (const [g, ps] of ny) grupper.set(g, ps);
  }
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
      h.append(el('b', null, (g === 'Indtægter' && !kilde.faelles ? '💰' : bIkon(g)) + ' ' + g), el('span', null, bKr(ps.reduce((s, p) => s + bAar(p), 0) / 12) + ' kr/md'));
      const ul = el('ul', 'b-post-liste');
      ul.append(...vist.map(p => {
        const li = el('li');
        const a = bAar(p);
        const b = knap('', 'b-post' + (a ? '' : ' nul'), () => redigerPost(p, '', kilde));
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

// Rækkefølge: fast rækkefølge på kategorierne eller største beløb først
function bSortValg() {
  const seg = el('div', 'seg b-sort-valg');
  seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Rækkefølge');
  for (const [id, tekst] of [['std', 'Fast rækkefølge'], ['stoerst', '⬇️ Største først']]) {
    const b = knap(tekst, null, () => { budgetSort = id; lokal.set('budget-sort', id); tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetSort === id);
    seg.append(b);
  }
  return seg;
}

// ---------- Måneder ----------
function budgetMaanederVis(poster, kilde = bKilde('faelles')) {
  const andel = kilde.faelles ? 0 : bAndel();
  if (!kilde.faelles) poster = poster.filter(p => !bErInd(p));
  const mt = bMaanedTotal(poster).map(x => x + andel);
  if (budgetMaaned == null) budgetMaaned = new Date().getMonth();
  // Faktisk forbrug pr. måned fra bankfilen (hvis den er hentet)
  const bk = kilde.faelles ? bBankF : kilde.hvem === bMig() ? bBankMig() : null;
  const fb = bk ? bMdrForbrug(bk) : null;
  if (bk && !fb && bBankRaekke(bk) && !bMdrHenter) { bMdrHenter = true; bHentBank(bk).then(() => { bMdrHenter = false; if (budgetVis === 'maaneder') tegnBudget(); }).catch(() => { bMdrHenter = false; }); }
  const aarL = fb ? [...fb.keys()].sort().reverse() : [];
  if (!aarL.includes(budgetMdrAar)) budgetMdrAar = aarL[0] || '';
  const fA = fb && budgetMdrAar ? fb.get(budgetMdrAar) : null;
  // Med forbrug sammenlignes uden opsparing (i banken er opsparing ikke en udgift, men en saldo, der stiger)
  if (fA) { const ops = bMaanedTotal(poster.filter(p => p.gruppe === 'Opsparing')); for (let i = 0; i < 12; i++) mt[i] -= ops[i]; }
  const maks = Math.max(1, ...mt, ...(fA ? fA.sum.filter(x => x != null) : []));
  const snit = mt.reduce((s, x) => s + x, 0) / 12;
  const kort = el('div', 'kort');
  kort.append(el('h3', null, kilde.faelles ? 'Udgifter måned for måned' : 'Dine udgifter måned for måned'));
  if (aarL.length) {
    kort.append(chipValg(aarL, budgetMdrAar, v => { budgetMdrAar = v; tegnBudget(); }));
    const fork = el('p', 'hint b-mdr-forkl');
    fork.append(el('span', 'b-prik budget'), ' budget  ', el('span', 'b-prik forbrug'), ' forbrug ' + budgetMdrAar + ' · uden opsparing');
    kort.append(fork);
  }
  const graf = el('div', 'b-graf');
  graf.setAttribute('role', 'group'); graf.setAttribute('aria-label', 'Udgifter pr. måned');
  const linje = el('span', 'b-snit');
  linje.style.bottom = 'calc(22px + ' + (snit / maks) + ' * (100% - 40px))';
  linje.append(el('span', null, 'gns. ' + bKr(snit)));
  graf.append(linje);
  mt.forEach((t, i) => {
    const b = knap('', 'b-soejle' + (i === budgetMaaned ? ' valgt' : ''), () => { budgetMaaned = i; tegnBudget(); });
    const f = fA ? fA.sum[i] : null;
    b.setAttribute('aria-label', MDR_LANG[i] + ': budget ' + bKr(t) + ' kr' + (f != null ? ', forbrug ' + bKr(f) + ' kr' : ''));
    b.setAttribute('aria-pressed', i === budgetMaaned);
    const s = el('span', 'b-soejle-fyld'); s.style.height = Math.max(1, t / maks * 100) + '%';
    const spor = el('span', 'b-soejle-spor'); spor.append(s);
    if (fA) {
      spor.classList.add('to');
      const sf = el('span', 'b-soejle-fyld forbrug' + (f != null && f > t * 1.05 + 50 ? ' op' : '')); sf.style.height = (f == null ? 0 : Math.max(1, Math.max(0, f) / maks * 100)) + '%';
      if (f == null) sf.classList.add('tom');
      sf.append(el('span', 'b-soejle-tal', bKr((f ?? t) / 1000) + 'k'));
      spor.append(sf);
    } else s.append(el('span', 'b-soejle-tal', bKr(t / 1000) + 'k'));
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
  const fm = fA ? fA.sum[m] : null;
  if (fm != null) {
    const fd = fm - mt[m];
    const ft = el('div', 'b-kom-top');
    ft.append(el('b', null, 'Forbrug ' + budgetMdrAar), el('span', null, bKr(fm) + ' kr'),
      el('span', 'b-diff ' + (fd > 1 ? 'op' : fd < -1 ? 'ned' : ''), (fd > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(fd)) + (fd > 0 ? ' over' : ' under') + ' budgettet'));
    liste.append(ft);
    const top5 = [...fA.poster[m].values()].filter(x => Math.abs(x.kr) >= 1).sort((a, b) => b.kr - a.kr).slice(0, 8);
    const ul2 = el('ul', 'b-kom-liste');
    ul2.append(...top5.map(x => {
      const li = el('li');
      const b = knap('', 'b-linje', () => bPosteringer(x.navn, x.gruppe, budgetMdrAar, bk));
      b.append(el('span', null, bIkon(x.gruppe) + ' ' + x.navn), el('span', 'b-beloeb', bKr(x.kr) + ' kr'));
      li.append(b); return li;
    }));
    liste.append(el('p', 'hint', 'Det største forbrug i ' + MDR_LANG[m] + ' ' + budgetMdrAar + ' (tryk for posteringerne):'), ul2, el('h3', 'b-mdr-budget-h', 'Budgettet for ' + MDR_LANG[m]));
  }
  const ps = poster.filter(p => bMdr(p)[m]).sort((a, b) => (bMoenster(a) === 'hver måned') - (bMoenster(b) === 'hver måned') || bMdr(b)[m] - bMdr(a)[m]);
  const ul = el('ul', 'b-kom-liste');
  ul.append(...ps.map(p => {
    const li = el('li');
    const b = knap('', 'b-linje', () => redigerPost(p, '', kilde));
    b.append(el('span', null, bIkon(p.gruppe) + ' ' + p.navn + (bMoenster(p) === 'hver måned' ? '' : ' ★')), el('span', 'b-beloeb', bKr(bMdr(p)[m]) + ' kr'));
    li.append(b); return li;
  }));
  if (andel) { const li = el('li'); const b = knap('', 'b-linje', () => { budgetHvem = 'faelles'; lokal.set('budget-hvem', 'faelles'); budgetVis = 'overblik'; tegnBudget(); window.scrollTo(0, 0); });
    b.append(el('span', null, '👨‍👩‍👦‍👦 Andel af fælles budget'), el('span', 'b-beloeb', bKr(andel) + ' kr')); li.append(b); ul.prepend(li); }
  liste.append(ul, el('p', 'hint', '★ = betales ikke hver måned. Tryk på en måned i grafen for at se den.'));
  return [kort, liste];
}

// Faktisk forbrug pr. måned og år fra bankfilen (efter jeres rettelser og tilføjede udgifter). null, hvis filen ikke er hentet.
let bMdrHenter = false, budgetMdrAar = '';
function bMdrForbrug(bk) {
  const r = bBankRaekke(bk);
  if (!r || !bBankData || bBankSti !== r.sti) return null;
  const ret = new Map(bRettelser(bk).map(x => [x.pid, x]));
  const ud = new Map();
  const fra = bBankData.fra || r.fra || '', til = bBankData.til || r.til || '';
  for (const x of [...bMedDele(bBankData.rows, ret), ...bManuelRaekker(bk)]) {
    if (!(x.n || x.manuel || ret.has(x.id))) continue;
    const e = bEffektiv(x, ret);
    if (e.gruppe === 'Opsparing') continue;
    const aar = e.aar, m = e.aar === x.d.slice(0, 4) ? Number(x.d.slice(5, 7)) - 1 : 0;
    if (!ud.has(aar)) ud.set(aar, { sum: Array(12).fill(null), poster: Array.from({ length: 12 }, () => new Map()) });
    const a = ud.get(aar);
    a.sum[m] = (a.sum[m] || 0) - x.b;
    const k = bNoegle(e), pm = a.poster[m];
    if (!pm.has(k)) pm.set(k, { navn: e.navn, gruppe: e.gruppe, kr: 0 });
    pm.get(k).kr -= x.b;
  }
  // Måneder helt uden for filen vises ikke som 0
  for (const [aar, a] of ud) for (let m = 0; m < 12; m++) {
    const start = aar + '-' + String(m + 1).padStart(2, '0') + '-01', slut = aar + '-' + String(m + 1).padStart(2, '0') + '-31';
    if ((fra && slut < fra) || (til && start > til)) a.sum[m] = null;
    else if (a.sum[m] == null) a.sum[m] = 0;
  }
  return ud;
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

// ---------- Ret / ny post (fælles eller personlig) ----------
function redigerPost(p, gruppeForslag, kilde = bKilde('faelles'), typeForslag = 'ud') {
  const ny = !p;
  p = p || { navn: '', gruppe: gruppeForslag || '', konto: '', mdr: [], type: typeForslag };
  const poster = kilde.poster();
  let type = kilde.faelles ? null : (p.type === 'ind' ? 'ind' : 'ud');
  const navn = input('text', 'post-navn', p.navn, kilde.faelles ? 'fx Vand, Bilforsikring, Netflix' : 'fx Løn, Mobil, Fagforening');
  let gruppe = p.gruppe || '';
  const nyGruppe = input('text', 'post-ny-gruppe', '', 'eller skriv en ny kategori');
  const gruppeBoks = el('div');
  let gruppeValg;
  const tegnGrupper = () => {
    const grupper = [...bGrupper(poster.filter(x => kilde.faelles || bErInd(x) === (type === 'ind'))).keys()];
    if (!gruppe && !kilde.faelles) gruppe = grupper[0] || '';
    gruppeValg = chipValg(grupper, gruppe, v => { gruppe = v; nyGruppe.value = ''; }, v => bIkon(v) + ' ' + v);
    gruppeBoks.replaceChildren(gruppeValg);
  };
  tegnGrupper();
  nyGruppe.addEventListener('input', () => { if (nyGruppe.value.trim()) { gruppe = ''; gruppeValg.querySelectorAll('[aria-checked=true]').forEach(b => b.setAttribute('aria-checked', 'false')); } });
  let konto = p.konto || '';
  const nyKonto = input('text', 'post-ny-konto', '', 'eller skriv en ny konto');
  const kontoValg = chipValg(bKonti(bPoster()).map(k => k.navn), konto, v => { konto = v; nyKonto.value = ''; });
  nyKonto.addEventListener('input', () => { if (nyKonto.value.trim()) { konto = ''; kontoValg.querySelectorAll('[aria-checked=true]').forEach(b => b.setAttribute('aria-checked', 'false')); } });
  const sum = el('p', 'b-sum');
  const visSum = m => { const a = m.reduce((s, x) => s + x, 0); sum.textContent = '= ' + bKr(a) + ' kr om året · ' + bKr(a / 12) + ' kr om måneden'; };
  const beloeb = beloebFelt(p.mdr, visSum);
  visSum(beloeb.hent());
  const note = input('text', 'post-note', p.note || '', kilde.faelles ? 'fx forbrug 1400 m³ à 6 kr.' : 'fx netto efter skat');
  const dele = [felt('Hvad er det?', navn)];
  if (!kilde.faelles) dele.push(el('label', 'felt-label', 'Indtægt eller udgift?'),
    chipValg(['ind', 'ud'], type, v => { type = v; gruppe = ''; tegnGrupper(); }, v => (v === 'ind' ? '💰 Indtægt' : '💸 Udgift')));
  dele.push(el('label', 'felt-label', 'Kategori'), gruppeBoks, nyGruppe);
  if (kilde.faelles) dele.push(el('label', 'felt-label', 'Betales fra konto'), kontoValg, nyKonto);
  dele.push(el('label', 'felt-label', 'Beløb'), beloeb, sum, felt('Note (valgfri)', note));
  if (!ny) {
    const hist = (p.historik || []).slice(-3).reverse();
    dele.push(el('p', 'hint', 'Sidst tjekket: ' + bSidst(p.tjekket) + '.' + (hist.length ? ' Før: ' + hist.map(h => bKr(h.aar) + ' kr/år (til ' + bDato(h.dato) + ')').join(' · ') : '')));
  }
  const knapper = el('div', 'ark-knapper');
  if (!ny) {
    const slet = knap('Slet', 'knap fare', e => bekraeft(e.currentTarget, async () => { await Data.remove(p._liste || kilde.nyListe(), p.id); lukArk(); tegnBudget(); }));
    slet.dataset.handling = 'slette';
    knapper.append(slet);
  }
  knapper.append(knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const g = nyGruppe.value.trim() || gruppe || (type === 'ind' ? 'Indtægter' : 'Andet');
    const mdr = beloeb.hent().map(x => Math.round(x * 100) / 100);
    const felter = { navn: n, gruppe: g, mdr, note: note.value.trim() || null, tjekket: bIdag() };
    if (kilde.faelles) felter.konto = nyKonto.value.trim() || konto || '';
    else felter.type = type;
    if (ny) {
      const iGruppe = poster.filter(x => (x.gruppe || 'Andet') === g).map(x => x.raekke ?? 0);
      felter.raekke = iGruppe.length ? Math.max(...iGruppe) + 0.01 : Math.max(0, ...poster.map(x => x.raekke ?? 0)) + 10;
      await Data.add(kilde.nyListe(), { ...felter, ...kilde.ekstra });
    } else {
      const foer = bAar(p);
      if (Math.abs(foer - mdr.reduce((s, x) => s + x, 0)) >= 0.5) felter.historik = [...(p.historik || []), { dato: p.tjekket || bIdag(), aar: foer }].slice(-10);
      await Data.update(p._liste || kilde.nyListe(), p.id, felter);
    }
    lukArk(); tegnBudget();
  }));
  dele.push(knapper);
  aabnArk(ny ? (kilde.faelles ? 'Ny post i budgettet' : type === 'ind' ? 'Ny indtægt' : 'Ny udgift') : 'Ret post', ...dele);
}
const bDato = iso => { const [y, m, d] = (iso || '').split('-').map(Number); return y ? d + '. ' + MDR[m - 1] + ' ' + y : ''; };

// ---------- Gennemgang: én post ad gangen ----------
function budgetGennemgang(alle, kilde = bKilde('faelles')) {
  const start = kilde.poster();
  const koe = start.filter(p => alle || bGammel(p)).sort((a, b) => bErInd(b) - bErInd(a) || bSort(a, b)).map(p => p.id);
  if (!koe.length) { visStatus('Alle poster er tjekket'); return; }
  const tot = ps => kilde.faelles ? ps.reduce((s, p) => s + bAar(p), 0) / 12 : (() => { const t = bPersonTal(ps); return (t.indAar - t.udAar) / 12; })();
  const foerMd = tot(start);
  const foerKonti = new Map(bKonti(bPoster()).map(k => [k.navn, k.hver]));
  const tal = { ok: 0, rettet: 0, slettet: 0 };
  let i = 0;
  const naeste = () => { i++; vis(); };
  function vis() {
    if (i >= koe.length) return slut();
    const p = kilde.poster().find(x => x.id === koe[i]);
    if (!p) { i++; return vis(); }
    const fremdrift = el('div', 'b-fremdrift');
    const f = el('span'); f.style.width = (i / koe.length * 100) + '%'; fremdrift.append(f);
    const kort = el('div', 'b-gennem-kort');
    const a = bAar(p);
    const hvor = kilde.faelles ? (p.konto ? ' · konto ' + p.konto : '') : (bErInd(p) ? ' · indtægt' : ' · udgift');
    kort.append(el('span', 'b-gennem-gruppe', bIkon(p.gruppe) + ' ' + (p.gruppe || 'Andet') + hvor),
      el('b', 'b-gennem-navn', p.navn), p.note ? el('span', 'hint', p.note) : '',
      el('span', 'b-gennem-beloeb', bKr(a / 12) + ' kr/md'), el('span', 'b-gennem-under', bKr(a) + ' kr om året · ' + bMoenster(p)),
      el('span', 'hint', 'Sidst tjekket: ' + bSidst(p.tjekket)));
    const ret = el('div', 'b-gennem-ret');
    ret.hidden = true;
    const knapper = el('div', 'b-gennem-knapper');
    const ok = knap('✓ Passer stadig', 'knap', async () => { await Data.update(p._liste, p.id, { tjekket: bIdag() }); tal.ok++; naeste(); });
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
          await Data.update(p._liste, p.id, felter); naeste();
        }));
      ret.replaceChildren(bf, sum, r);
    });
    const slet = knap('🗑 ' + (bErInd(p) ? 'Får vi ikke mere' : 'Bruger vi ikke mere'), 'knap fare', e => bekraeft(e.currentTarget, async () => { await Data.remove(p._liste, p.id); tal.slettet++; naeste(); }));
    slet.dataset.handling = 'fjerne posten';
    knapper.append(ok, retK, slet, knap('Spring over ›', 'lille-knap b-spring', naeste));
    aabnArk('🔄 Gennemgang ' + (i + 1) + ' af ' + koe.length, fremdrift, kort, knapper, ret);
  }
  function slut() {
    const nuMd = tot(kilde.poster()), d = nuMd - foerMd;
    const dele = [el('div', 'b-gennem-slut', '🎉'), el('p', 'b-gennem-tal', '✓ ' + tal.ok + ' passer · ✏️ ' + tal.rettet + ' rettet · 🗑 ' + tal.slettet + ' fjernet')];
    if (kilde.faelles) {
      dele.push(el('p', null, Math.abs(d) < 1 ? 'Budgettet er det samme: ' + bKr(nuMd) + ' kr om måneden.' : 'Budgettet er nu ' + bKr(nuMd) + ' kr om måneden (' + (d > 0 ? '+' : '−') + bKr(Math.abs(d)) + ' kr i forhold til før).'));
      const nu = bKonti(bPoster());
      const aendret = nu.filter(k => foerKonti.has(k.navn) && foerKonti.get(k.navn) !== k.hver);
      const husk = nu.filter(k => k.overfoert != null && Math.abs(k.md - k.overfoert) >= 1);
      if (aendret.length || husk.length) {
        const ul = el('ul', 'b-husk');
        for (const k of aendret) ul.append(el('li', null, k.navn + ': hver af jer ' + bKr(foerKonti.get(k.navn)) + ' → ' + bKr(k.hver) + ' kr/md'));
        for (const k of husk) ul.append(el('li', null, k.navn + ': der overføres ' + bKr(k.overfoert) + ', behovet er ' + bKr(k.md) + ' kr/md'));
        dele.push(el('b', null, 'Husk at rette overførslerne i banken:'), ul);
      }
    } else dele.push(el('p', null, (nuMd >= 0 ? 'Overskud: ' : 'Underskud: ') + bKr(Math.abs(nuMd)) + ' kr om måneden' + (Math.abs(d) >= 1 ? ' (' + (d > 0 ? '+' : '−') + bKr(Math.abs(d)) + ' kr i forhold til før).' : '.')));
    const aar = String(new Date().getFullYear());
    const knapper = el('div', 'ark-knapper');
    knapper.append(knap('📌 Gem som budget ' + aar, 'knap sekundaer', async () => { await bGemAar(kilde); lukArk(); tegnBudget(); }),
      knap('Færdig', 'knap', () => { lukArk(); tegnBudget(); }));
    dele.push(el('p', 'hint', 'Gem budgettet for ' + aar + ', så I næste år kan se, hvad der er steget.'), knapper);
    aabnArk('Gennemgang færdig', ...dele);
    tegnBudget();
  }
  vis();
}

// ---------- År for år: 📌 gem årets budget og sammenlign ----------
const bSnaps = kilde => kilde.alle().filter(p => p.snap && !p.art).sort((a, b) => String(a.snap).localeCompare(String(b.snap)));
function bSnapPoster(kilde) {
  const ps = kilde.poster().map(p => ({ navn: p.navn, gruppe: p.gruppe || 'Andet', ...(p.konto ? { konto: p.konto } : {}), ...(p.type ? { type: p.type } : {}), aar: Math.round(bAar(p) * 100) / 100 }));
  if (!kilde.faelles) ps.push({ navn: 'Andel af fælles budget', gruppe: 'Fælles budget', type: 'ud', aar: bAndel() * 12 });
  return ps;
}
// Månedsbeløbet for et sæt poster: fælles = udgifter; personligt = overskud
const bSnapMd = (kilde, ps) => kilde.faelles ? ps.reduce((s, p) => s + (p.aar || 0), 0) / 12
  : ps.reduce((s, p) => s + (p.type === 'ind' ? 1 : -1) * (p.aar || 0), 0) / 12;
async function bGemAar(kilde, aar = String(new Date().getFullYear())) {
  const gl = bSnaps(kilde).find(x => String(x.snap) === aar);
  const felter = { snap: aar, dato: bIdag(), poster: bSnapPoster(kilde), ...kilde.ekstra };
  if (gl) await Data.update(gl._liste, gl.id, felter);
  else await Data.add(kilde.nyListe(), felter);
  visStatus('📌 Budget ' + aar + ' er gemt');
}
function bAarKort(kilde, nuMd) {
  const snaps = bSnaps(kilde), aar = String(new Date().getFullYear());
  const kort = el('div', 'kort b-aar');
  kort.append(el('h3', null, '📈 År for år'));
  const navn = kilde.faelles ? 'faste udgifter' : 'overskud';
  const ul = el('ul', 'b-aar-liste');
  const linje = (tekst, md, foer) => {
    const li = el('li');
    li.append(el('span', null, tekst), el('b', null, bKr(md) + ' kr/md'));
    if (foer != null && Math.abs(md - foer) >= 1) {
      const d = md - foer, pct = foer ? Math.round(d / Math.abs(foer) * 1000) / 10 : 0;
      const godt = kilde.faelles ? d < 0 : d > 0;
      li.append(el('span', 'b-diff ' + (godt ? 'ned' : 'op'), (d > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(d)) + (kilde.faelles && pct ? ' (' + String(Math.abs(pct)).replace('.', ',') + ' %)' : '')));
    } else li.append(el('span', 'b-diff', foer != null ? 'uændret' : ''));
    return li;
  };
  const sidste = snaps[snaps.length - 1];
  const forrige = [...snaps].reverse().find(x => String(x.snap) < aar) || sidste;
  ul.append(linje('Nu', nuMd, forrige ? bSnapMd(kilde, forrige.poster || []) : null));
  for (const s of [...snaps].reverse()) ul.append(linje(String(s.snap), bSnapMd(kilde, s.poster || [])));
  kort.append(ul);
  if (!snaps.length) kort.append(el('p', 'hint', 'Gem budgettet én gang om året – fx efter gennemgangen – så kan I se, hvordan jeres ' + navn + ' udvikler sig.'));
  const knapper = el('div', 'b-aar-knapper');
  const har = snaps.some(x => String(x.snap) === aar);
  const gem = knap(har ? '📌 Opdatér ' + aar : '📌 Gem budget ' + aar, 'lille-knap', async e => {
    if (har) return bekraeft(e.currentTarget, async () => { await bGemAar(kilde); tegnBudget(); });
    await bGemAar(kilde); tegnBudget();
  });
  gem.dataset.handling = 'erstatte ' + aar;
  knapper.append(gem);
  const tidligere = [...snaps].reverse().find(x => String(x.snap) < aar) || sidste;   // helst et tidligere år
  if (snaps.length) knapper.append(knap('Sammenlign ›', 'lille-knap', () => budgetSammenlign(kilde, tidligere)));
  knapper.append(knap('Alle år og forbrug ›', 'lille-knap', () => { budgetVis = 'aar'; lokal.set('budget-vis', 'aar'); tegnBudget(); window.scrollTo(0, 0); }));
  kort.append(knapper);
  return kort;
}
function budgetSammenlign(kilde, snap) {
  const snaps = bSnaps(kilde);
  const nu = bSnapPoster(kilde), gl = snap.poster || [];
  const grp = new Map();
  const tilfoej = (p, felt) => { const g = (!kilde.faelles && p.type === 'ind' ? '💰 ' : '') + (p.gruppe || 'Andet'); const x = grp.get(g) || { foer: 0, nu: 0 }; x[felt] += p.aar || 0; grp.set(g, x); };
  gl.forEach(p => tilfoej(p, 'foer')); nu.forEach(p => tilfoej(p, 'nu'));
  const noegle = p => (p.type === 'ind' ? 'i:' : 'u:') + (p.navn || '').toLowerCase() + '|' + (p.gruppe || '').toLowerCase();
  const foerM = new Map(gl.map(p => [noegle(p), p])), nuM = new Map(nu.map(p => [noegle(p), p]));
  const aendr = [];
  for (const [k, p] of nuM) { const f = foerM.get(k); const d = (p.aar || 0) - (f ? f.aar || 0 : 0); if (!f || Math.abs(d) >= 1) aendr.push({ p, d, ny: !f }); }
  for (const [k, f] of foerM) if (!nuM.has(k)) aendr.push({ p: f, d: -(f.aar || 0), vaek: true });
  aendr.sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
  const vaelg = snaps.length > 1 ? chipValg(snaps.map(x => String(x.snap)), String(snap.snap), v => budgetSammenlign(kilde, snaps.find(x => String(x.snap) === v))) : '';
  const foerMd = bSnapMd(kilde, gl), nuMd = bSnapMd(kilde, nu), d = nuMd - foerMd;
  const top = el('div', 'b-sml-top');
  top.append(el('span', null, snap.snap + ': ' + bKr(foerMd) + ' kr/md'), el('span', null, '→'), el('b', null, 'Nu: ' + bKr(nuMd) + ' kr/md'));
  const tekst = kilde.faelles ? (Math.abs(d) < 1 ? 'De faste udgifter er de samme.' : 'De faste udgifter er ' + (d > 0 ? 'steget' : 'faldet') + ' ' + bKr(Math.abs(d)) + ' kr om måneden – ' + bKr(Math.abs(d) * 12) + ' kr om året.')
    : (Math.abs(d) < 1 ? 'Overskuddet er det samme.' : 'Der er ' + bKr(Math.abs(d)) + ' kr ' + (d > 0 ? 'mere' : 'mindre') + ' tilbage hver måned.');
  const gTab = el('ul', 'b-sml-liste');
  for (const [g, x] of [...grp].sort((a, b) => Math.abs(b[1].nu - b[1].foer) - Math.abs(a[1].nu - a[1].foer))) {
    const dd = x.nu - x.foer;
    const li = el('li');
    li.append(el('span', null, (g.startsWith('💰') ? '' : bIkon(g) + ' ') + g), el('span', 'b-beloeb', bKr(x.nu / 12) + ' kr/md'),
      el('span', 'b-diff ' + (Math.abs(dd) < 1 ? '' : dd > 0 ? 'op' : 'ned'), Math.abs(dd) < 1 ? '–' : (dd > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(dd) / 12)));
    gTab.append(li);
  }
  const pTab = el('ul', 'b-sml-liste');
  for (const a of aendr.slice(0, 15)) {
    const li = el('li');
    li.append(el('span', null, a.p.navn + (a.ny ? ' (ny)' : a.vaek ? ' (væk)' : '')), el('span', 'b-beloeb', a.vaek ? '0' : bKr((a.p.aar || 0)) + ' kr/år'),
      el('span', 'b-diff ' + (a.d > 0 ? 'op' : 'ned'), (a.d > 0 ? '▲ ' : '▼ ') + bKr(Math.abs(a.d))));
    pTab.append(li);
  }
  aabnArk('📈 ' + snap.snap + ' mod nu', vaelg, top, el('p', null, tekst), el('h3', 'b-ark-h3', 'Pr. kategori (kr/md)'), gTab,
    el('h3', 'b-ark-h3', aendr.length ? 'Største ændringer (kr/år)' : 'Ingen poster er ændret'), pTab,
    el('p', 'hint', snap.snap + ' blev gemt ' + bDato(snap.dato) + '. Poster sammenlignes på navn og kategori.'));
}

// ---------- År: budget og faktisk forbrug for alle år i én tabel ----------
const bNoegle = p => (p.navn || '').toLowerCase() + '|' + (p.gruppe || 'Andet').toLowerCase();
function bAarData(poster, kilde = bKilde('faelles'), bk = kilde.faelles ? bBankF : null) {
  const nu = String(new Date().getFullYear());
  const alle = kilde.alle();
  const aar = new Map();   // 'ÅÅÅÅ' → { b: Map|null, f: Map|null, fMdr, periode }
  const hent = a => { if (!aar.has(a)) aar.set(a, { b: null, f: null }); return aar.get(a); };
  const tilMap = (ps, del) => { const m = new Map(); for (const p of ps || []) { if (p.type === 'ind') continue; const k = bNoegle(p); const x = m.get(k) || { navn: p.navn, gruppe: p.gruppe || 'Andet', md: 0 }; x.md += (Number(p.aar) || 0) / del; m.set(k, x); } return m; };
  for (const s of alle.filter(p => p.snap && !p.art)) if (String(s.snap) !== nu) hent(String(s.snap)).b = tilMap(s.poster, 12);
  hent(nu).b = tilMap([...poster.map(p => ({ navn: p.navn, gruppe: p.gruppe, type: p.type, aar: bAar(p) })),
    ...(kilde.faelles ? [] : [{ navn: 'Andel af fælles budget', gruppe: 'Fælles budget', aar: bAndel() * 12 }])], 12);
  for (const s of (bk ? bk.alle() : []).filter(p => p.snap && p.art === 'forbrug')) {
    const x = hent(String(s.snap)), mdr = Number(s.maaneder) || 12;
    x.f = tilMap(s.poster, mdr); x.fMdr = mdr; x.periode = s.periode || ''; x.fDato = s.dato;
  }
  // Rettede bankposteringer flytter beløbet fra den ene post til den anden i forbruget
  // – og kan tælle med i et andet år (fx en forsikring betalt i december for hele næste år)
  const flyt = (aarStr, p, kr) => {
    const x = aar.get(String(aarStr));
    if (!x || !x.f || !p) return;
    const k = bNoegle(p); const y = x.f.get(k) || { navn: p.navn, gruppe: p.gruppe || 'Andet', md: 0 };
    y.md += kr / (x.fMdr || 12); x.f.set(k, y);
  };
  for (const r of bk ? bRettelser(bk) : []) {
    const kr = Number(r.beloeb) || 0;
    flyt(r.aar, r.fra, -kr);
    if (r.dele?.length) for (const d of r.dele) flyt(r.tilAar || r.aar, d.til, Number(d.kr) || 0);   // delt op på flere poster
    else flyt(r.tilAar || r.aar, r.til, kr);
  }
  // Udgifter, der ikke står i banken (kontant, gavepenge, betalt før bankfilen starter)
  for (const m of bk ? bManuelle(bk) : []) flyt(m.aar, m.til, Number(m.beloeb) || 0);
  return [...aar].sort((a, b) => a[0].localeCompare(b[0]));
}
function budgetAarVis(poster, kilde = bKilde('faelles')) {
  const bk = kilde.faelles ? bBankF : kilde.hvem === bMig() ? bBankMig() : null;
  const kol = bAarData(poster, kilde, bk);
  if (!kilde.faelles) poster = [...poster.filter(p => !bErInd(p)), { navn: 'Andel af fælles budget', gruppe: 'Fælles budget' }];
  const harF = kol.some(([, x]) => x.f);
  const vis = harF ? budgetAarValg : 'budget';
  // Rækkefølge: fast rækkefølge på kategorierne (også dem, der kun findes i gamle år)
  const grupper = new Map();   // gruppe → Map(nøgle → navn)
  const sorteret = poster.slice().sort(bStoerstSort);
  for (const p of sorteret) { const g = p.gruppe || 'Andet'; if (!grupper.has(g)) grupper.set(g, new Map()); grupper.get(g).set(bNoegle(p), p.navn); }
  for (const [, x] of kol) for (const m of [x.b, x.f]) if (m) for (const [k, p] of m) {
    if (!grupper.has(p.gruppe)) grupper.set(p.gruppe, new Map());
    if (!grupper.get(p.gruppe).has(k)) grupper.get(p.gruppe).set(k, p.navn);
  }
  let gOrden = [...grupper.keys()].sort(bGruppeSort);
  const sum = (m, keys) => { if (!m) return null; let s = 0, fandt = false; for (const k of keys) { const x = m.get(k); if (x) { s += x.md; fandt = true; } } return fandt ? s : 0; };
  // Største først: efter det nyeste år (forbrug, hvis det vises – ellers budget)
  const postNgl = g => [...grupper.get(g).keys()];
  let ngl = postNgl;
  if (budgetSort === 'stoerst' && kol.length) {
    const [, sidst] = kol[kol.length - 1];
    const brugF = vis !== 'budget' && sidst.f;
    const vaerdi = keys => { const f = brugF ? sum(sidst.f, keys) : null, b = sum(sidst.b, keys); return (brugF ? f : b) ?? b ?? f ?? 0; };
    gOrden = gOrden.slice().sort((a, b) => vaerdi(postNgl(b)) - vaerdi(postNgl(a)));
    ngl = g => postNgl(g).sort((a, b) => vaerdi([b]) - vaerdi([a]));
  }
  const celle = (b, f) => {
    const td = el('td');
    const vb = vis !== 'forbrug', vf = vis !== 'budget';
    if (vb) td.append(el('span', 'b-b' + (vf ? ' lille' : ''), b == null ? '–' : bKr(b)));
    if (vf) {
      const over = f != null && b != null && f > b + Math.max(50, b * 0.05), under = f != null && b != null && f < b - Math.max(50, b * 0.05);
      td.append(el('span', 'b-f' + (over ? ' op' : under ? ' ned' : ''), f == null ? '–' : bKr(f)));
    }
    return td;
  };
  const dele = [];
  const valg = el('div', 'seg b-aar-valg');
  valg.setAttribute('role', 'radiogroup');
  for (const [id, tekst] of [['begge', 'Begge'], ['budget', 'Budget'], ['forbrug', 'Forbrug']]) {
    const b = knap(tekst, null, () => { budgetAarValg = id; lokal.set('budget-aarvis', id); tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', vis === id);
    if (!harF && id !== 'budget') b.disabled = true;
    valg.append(b);
  }
  dele.push(valg, bSortValg());
  const forkl = el('p', 'hint b-aar-forkl');
  if (vis === 'begge') forkl.append(el('span', 'b-b lille', 'grå'), ' = budget (planlagt) · ', el('span', 'b-f', 'sort'), ' = faktisk forbrug ifølge banken · ', el('span', 'b-f op', 'rød'), ' over / ', el('span', 'b-f ned', 'grøn'), ' under budget. Kr. om måneden.');
  else forkl.textContent = (vis === 'budget' ? 'Budget (det planlagte)' : 'Faktisk forbrug ifølge banken') + ' i kr. om måneden.';
  dele.push(forkl);
  const rul = el('div', 'b-aar-rul');
  const tab = el('table', 'b-aar-tab');
  const thead = el('thead'), hr = el('tr');
  hr.append(el('th', null, ''));
  for (const [a, x] of kol) { const th = el('th'); th.append(el('b', null, a)); if (x.periode && vis !== 'budget') th.append(el('span', 'hint', x.periode)); hr.append(th); }
  thead.append(hr);
  const tb = el('tbody');
  const alleNgl = gOrden.flatMap(g => postNgl(g));
  const iAlt = el('tr', 'b-aar-ialt');
  iAlt.append(el('th', null, 'I alt'));
  for (const [, x] of kol) iAlt.append(celle(sum(x.b, alleNgl), sum(x.f, alleNgl)));
  tb.append(iAlt);
  for (const g of gOrden) {
    const nk = ngl(g);
    const aaben = budgetAabne.has(g);
    const tr = el('tr', 'b-aar-gruppe');
    const th = el('th');
    const b = knap((aaben ? '▾ ' : '▸ ') + bIkon(g) + ' ' + g, 'b-aar-gknap', () => { aaben ? budgetAabne.delete(g) : budgetAabne.add(g); tegnBudget(); });
    b.setAttribute('aria-expanded', aaben);
    th.append(b); tr.append(th);
    for (const [, x] of kol) tr.append(celle(sum(x.b, nk), sum(x.f, nk)));
    tb.append(tr);
    if (aaben) for (const k of nk) {
      const pr = el('tr', 'b-aar-post');
      const th = el('th');
      const pk = bk ? knap(grupper.get(g).get(k), 'b-aar-pknap', () => bPosteringer(grupper.get(g).get(k), g, null, bk)) : el('span', null, grupper.get(g).get(k));
      if (bk) pk.title = 'Se posteringerne';
      th.append(pk); pr.append(th);
      for (const [, x] of kol) {
        const bb = x.b ? (x.b.get(k)?.md ?? null) : null, ff = x.f ? (x.f.get(k)?.md ?? null) : null;
        pr.append(celle(bb, ff));
      }
      tb.append(pr);
    }
  }
  tab.append(thead, tb);
  rul.append(tab);
  const kort = el('div', 'kort b-aar-kort');
  kort.append(rul);
  dele.push(kort);
  const noter = ['Tryk på en kategori for at se posterne.', '"–" betyder, at posten ikke fandtes det år.'];
  const fk = kol.filter(([, x]) => x.f && x.periode);
  if (fk.length) noter.push('Forbruget er regnet om til kr. om måneden for den periode, banken dækker (' + fk.map(([a, x]) => a + ': ' + x.periode).join(', ') + ').');
  if (kilde.faelles) noter.push('Nogle ting kan kun ses samlet i banken – fx GF, der står som én post under forbrug.');
  dele.push(el('p', 'hint', noter.join(' ')));
  if (bk) dele.push(bBankKort(bk));
  return dele;
}

// ---------- Bankposteringer (fil i Storage) + rettelser + upload af bankens CSV (bank.js) ----------
// Bank-kilde: hvor ligger filen, rettelserne, reglerne og kontiene? Fælles = 'budget' (voksne) – kun-mig-udgaven kommer til lønkontoen.
const bBankF = { liste: 'budget', syn: 'voksne', alle: () => bAlleFaelles(), ekstra: {}, get kilde() { return bKilde('faelles'); } };
// Mit budget: posteringerne fra min egen konto ligger ALTID i 'budget_privat' + Storage mig/ – også når budgettet er delt
function bBankMig() {
  const mig = bMig();
  return { liste: B_PRIVAT, syn: 'mig', mig: true, alle: () => bMaerk(Data.listNu(B_PRIVAT), B_PRIVAT).filter(p => p.ejer === mig), ekstra: { ejer: mig }, kilde: bKilde(mig) };
}
const bBankRaekke = (bk = bBankF) => bk.alle().find(p => p.art === 'bankfil');
const bRettelser = (bk = bBankF) => bk.alle().filter(p => p.art === 'bankret');
const bReglerRaekke = (bk = bBankF) => bk.alle().find(p => p.art === 'regler');
const bKontiRaekke = (bk = bBankF) => bk.alle().find(p => p.art === 'konti');
const bManuelle = (bk = bBankF) => bk.alle().filter(p => p.art === 'manuel');
// Kommentarer på posteringer: {snap:'_bank', art:'banknote', pid, dato, tekst, note} – fx "Båd: motor til jollen"
const bModNej = (bk = bBankF) => new Set(bk.alle().filter(p => p.art === 'modnej').map(p => p.pid));
const bNoter = (bk = bBankF) => new Map(bk.alle().filter(p => p.art === 'banknote').map(p => [p.pid, p]));
async function bGemNote(bk, x, note) {
  const gl = bNoter(bk).get(x.id);
  note = String(note || '').trim().slice(0, 200);
  if (!note) { if (gl) await Data.remove(bk.liste, gl.id); return; }
  if (gl?.note === note) return;
  const felter = { ...bk.ekstra, snap: '_bank', art: 'banknote', pid: x.id, dato: x.d, tekst: x.t, note };
  if (gl) await Data.update(bk.liste, gl.id, felter); else await Data.add(bk.liste, felter);
}
let bBankData = null, bBankSti = null;
async function bHentBank(bk = bBankF) {
  const r = bBankRaekke(bk);
  if (!r) return null;
  if (bBankData && bBankSti === r.sti) return bBankData;
  const res = await fetch(await Data.filUrl(r.sti));
  if (!res.ok) throw new Error('Kunne ikke hente posteringerne');
  bBankData = await res.json(); bBankSti = r.sti;
  return bBankData;
}
// Posteringens post efter jeres rettelser
function bEffektiv(x, ret) {
  const r = ret.get(x.id);
  if (x.manuel) return { navn: x.manuel.til.navn, gruppe: x.manuel.til.gruppe, aar: String(x.manuel.aar) };
  if (x.delTil) return { navn: x.delTil.navn, gruppe: x.delTil.gruppe, rettet: r, aar: String(r?.tilAar || x.d.slice(0, 4)), del: true };
  return r ? { navn: r.til.navn, gruppe: r.til.gruppe, rettet: r, aar: String(r.tilAar || x.d.slice(0, 4)) } : { navn: x.n, gruppe: x.g, aar: x.d.slice(0, 4) };
}
// En postering, der er delt op, bliver til én række pr. del (samme id, beløbet for delen)
function bMedDele(rows, ret) {
  const ud = [];
  for (const x of rows) {
    const r = ret.get(x.id);
    if (r?.dele?.length) for (const d of r.dele) ud.push({ ...x, b: -(Number(d.kr) || 0), delTil: d.til, helB: x.b });
    else ud.push(x);
  }
  return ud;
}
// Manuelle udgifter som "posteringer" i listen
const bManuelRaekker = bk => bManuelle(bk).map(m => ({ id: 'm:' + m.id, d: m.dato || String(m.aar) + '-01-01', k: 'Uden for banken', t: m.tekst || 'Udgift', b: -(Number(m.beloeb) || 0), manuel: m }));
const bKrOere = n => (Math.round(n * 100) / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Filen skal have saldo og rækkefølge med (posteringer.json fra oktober 2026 og frem), før appen selv kan regne
const bNyFil = d => !!(d && d.rows.length && d.rows.every(x => x.ty === 'flyttet' || x.o != null));

// Gem posteringer + forbrug pr. år + ret 'fra' på jeres rettelser, hvis grundposten er skiftet
async function bGemBank(bk, rows, R, info) {
  const bank = bBankRaekke(bk);
  const aegte = rows.filter(x => x.ty !== 'flyttet');
  const fil = { v: 2, lavet: bIdag(), fra: aegte.reduce((m, x) => x.d < m ? x.d : m, '9999'), til: aegte.reduce((m, x) => x.d > m ? x.d : m, '0000'), antal: rows.length, rows };
  const op = await Data.uploadFil(bk.syn, new File([JSON.stringify(fil)], 'posteringer.json', { type: 'application/json' }));
  const felter = { ...bk.ekstra, snap: '_bank', art: 'bankfil', sti: op.sti, navn: op.navn, lavet: fil.lavet, fra: fil.fra, til: fil.til, antal: rows.length };
  const fb = Bank.forbrug(rows, R);
  const ny = new Map(rows.map(x => [x.id, x]));
  await Data.stille(async () => {
    if (bank) await Data.update(bk.liste, bank.id, felter); else await Data.add(bk.liste, felter);
    const gl = bk.alle().filter(p => p.art === 'forbrug').map(p => p.id);
    if (gl.length) await Data.removeMange(bk.liste, gl);
    for (const f of fb) await Data.add(bk.liste, { ...bk.ekstra, ...f });
    for (const r of bRettelser(bk)) {
      const x = ny.get(r.pid);
      if (!x || !x.n) continue;
      const fra = { navn: x.n, gruppe: x.g };
      if (bNoegle(fra) === bNoegle(r.til) && !r.tilAar && !r.dele?.length) await Data.remove(bk.liste, r.id);
      else if (bNoegle(fra) !== bNoegle(r.fra || {})) await Data.update(bk.liste, r.id, { fra });
    }
  });
  if (bank) Data.sletFiler([bank.sti]);
  bBankData = fil; bBankSti = op.sti;
  visStatus(info); tegnBudget();
}
// Bankens CSV → konti → flet med de gamle posteringer → inddel → gem
async function bLaesBankfil(fil, bk = bBankF) {
  const rk = bReglerRaekke(bk);
  if (!rk?.regler) { visStatus('Reglerne til inddelingen mangler – kør SQL-filen fra Claude først', true); return; }
  const R = rk.regler;
  visStatus('Læser bankfilen …');
  const buf = await fil.arrayBuffer();
  let tekst;
  try { tekst = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { tekst = new TextDecoder('windows-1252').decode(buf); }
  let raa;
  try { raa = Bank.laesCsv(tekst); } catch (e) { visStatus(e.message, true); return; }
  let gamle = null;
  if (bBankRaekke(bk)) {
    try { gamle = await bHentBank(bk); } catch { visStatus('De gamle posteringer kunne ikke hentes – prøv igen', true); return; }
    if (!bNyFil(gamle)) { visStatus('Læg først den nye posteringer.json fra Claude ind (📂 Udskift filen) – den gamle mangler saldo', true); return; }
  }
  const kr = bKontiRaekke(bk);
  const konti = new Map((kr?.konti || []).map(k => [k.kode, k.navn || '']));
  // I mit budget kendes de fælles konti kun som modkonto (overførsel til Budget = min andel)
  const mod = bk.mig ? new Map((bKontiRaekke(bBankF)?.konti || []).filter(k => k.navn).map(k => [k.kode, k.navn])) : new Map();
  let r = await Bank.klarRaekker(raa, konti, mod);
  if (r.ukendte) {
    const navne = bk.mig ? [...new Set([...(gamle?.rows || []).map(x => x.k), ...konti.values(), 'Lønkonto'].filter(Boolean))]
      : [...new Set([...(gamle?.rows || []).map(x => x.k), ...konti.values(), ...Data.listNu('budgetkonti').map(k => k.navn)].filter(Boolean))];
    const kendte = new Set((gamle?.rows || []).map(x => x.id));
    for (const u of r.ukendte) u.gaet = kendte.size ? await Bank.gaetKonto(raa, u.nr, navne, kendte) : null;
    const svar = await bSpoergKonti(r.ukendte, navne, bk.mig);
    if (!svar) { visStatus('Bankfilen blev ikke lagt ind'); return; }
    for (const s of svar) konti.set(s.kode, s.navn);
    const liste = [...konti].map(([kode, navn]) => ({ kode, navn }));
    if (kr) await Data.update(bk.liste, kr.id, { konti: liste }); else await Data.add(bk.liste, { ...bk.ekstra, snap: '_bank', art: 'konti', konti: liste });
    r = await Bank.klarRaekker(raa, konti, mod);
  }
  if (!r.rows.length) { visStatus('Ingen af kontiene i filen er med i budgettet', true); return; }
  const f = Bank.flet(gamle?.rows || [], r.rows);
  if (gamle && !f.nye) { visStatus('🏦 Ingen nye posteringer i filen – alt var lagt ind i forvejen'); return; }
  visStatus('Inddeler ' + bKr(f.rows.length) + ' posteringer …');
  try {
    await bGemBank(bk, Bank.inddel(f.rows, R), R, '🏦 ' + bKr(f.nye) + (f.nye === 1 ? ' ny postering' : ' nye posteringer') + ' · forbruget er opdateret');
  } catch (e) { console.warn(e); visStatus('Bankfilen kunne ikke gemmes', true); }
}
// Ark: hvilken konto er hvilken? (kontonummeret vises kun med de sidste 4 cifre og gemmes som en kode)
function bSpoergKonti(ukendte, navne, mig = false) {
  return new Promise(svar => {
    const valg = new Map(ukendte.map(u => [u.kode, u.gaet ?? null]));
    let faerdig = false;
    const slut = v => { if (faerdig) return; faerdig = true; svar(v); };
    const fortsaet = knap('Fortsæt', 'knap', () => { slut(ukendte.map(u => ({ kode: u.kode, navn: valg.get(u.kode) || '' }))); lukArk(); });
    const opdater = () => { fortsaet.disabled = [...valg.values()].some(v => v === null); };
    const dele = [el('p', 'hint', 'Appen kender ikke ' + (ukendte.length === 1 ? 'denne konto' : 'disse konti') + ' endnu. Vælg hvad ' + (ukendte.length === 1 ? 'den' : 'de') + ' hedder i budgettet – det huskes til næste gang. "Ikke med" = posteringerne springes over (fx en lønkonto).')];
    for (const u of ukendte) {
      const boks = el('div', 'kort b-konto-valg');
      boks.append(el('b', null, 'Konto, der slutter på …' + u.slut), el('p', 'hint', bKr(u.antal) + ' posteringer, fx ' + u.eks.map(t => '"' + t + '"').join(', ')));
      const muligheder = [...navne, '', '+'];
      const andet = input('text', 'konto-' + u.kode, '', 'Andet navn');
      andet.hidden = true;
      andet.addEventListener('input', () => { valg.set(u.kode, andet.value.trim() || null); opdater(); });
      const startV = u.gaet ?? undefined;
      boks.append(chipValg(muligheder, startV, v => {
        andet.hidden = v !== '+';
        valg.set(u.kode, v === '+' ? (andet.value.trim() || null) : v);
        if (v === '+') andet.focus();
        opdater();
      }, v => v === '' ? '🚫 Ikke med' : v === '+' ? '+ Andet navn' : v), andet);
      if (u.gaet) boks.append(el('p', 'hint', '✓ Gættet ud fra ' + (mig ? 'dine' : 'jeres') + ' posteringer: ' + u.gaet));
      dele.push(boks);
    }
    opdater();
    const ann = knap('Annullér', 'knap sekundaer', () => { slut(null); lukArk(); });
    const k = el('div', 'ark-knapper'); k.append(ann, fortsaet);
    aabnArk('🏦 Hvilke konti er det?', ...dele, k);
    // Lukkes arket på anden vis = annullér
    const obs = new MutationObserver(() => { if (arkEl.hidden) { obs.disconnect(); slut(null); } });
    obs.observe(arkEl, { attributes: true, attributeFilter: ['hidden'] });
  });
}
// Ny regel (fra "Flyt postering") → alle posteringer inddeles igen
async function bNyRegel(bk, regel) {
  const rk = bReglerRaekke(bk);
  const d = await bHentBank(bk);
  if (!rk?.regler || !bNyFil(d)) { visStatus('Reglen kan ikke laves, før reglerne og den nye posteringsfil er lagt ind', true); return false; }
  const R = { ...rk.regler, post: [regel, ...(rk.regler.post || [])] };
  await Data.update(bk.liste, rk.id, { regler: R });
  await bGemBank(bk, Bank.inddel(d.rows, R), R, '🧩 Reglen er gemt, og posteringerne er inddelt igen');
  return true;
}
async function bSletRegel(bk, i) {
  const rk = bReglerRaekke(bk);
  const R = { ...rk.regler, post: rk.regler.post.filter((_, j) => j !== i) };
  await Data.update(bk.liste, rk.id, { regler: R });
  const d = await bHentBank(bk);
  if (bNyFil(d)) await bGemBank(bk, Bank.inddel(d.rows, R), R, '🗑 Reglen er slettet');
  else { visStatus('🗑 Reglen er slettet'); tegnBudget(); }
}
const bRxTekst = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function bEgneRegler(bk = bBankF) {
  const rk = bReglerRaekke(bk);
  const ps = (rk?.regler?.post || []).map((r, i) => ({ r, i })).filter(x => x.r.egen);
  const ul = el('ul', 'b-bank-liste');
  for (const { r, i } of ps) {
    const li = el('li', 'b-regel');
    li.append(el('span', null, '"' + (r.vis || r.t) + '" → ' + r.post + ' (' + r.gruppe + ')'), knap('🗑', 'ikon-knap', async () => { lukArk(); await bSletRegel(bk, i); }));
    ul.append(li);
  }
  aabnArk('🧩 Jeres egne regler', ps.length ? ul : el('p', 'tom', 'Ingen egne regler endnu.'),
    el('p', 'hint', 'En regel laves, når du flytter en postering og sætter flueben ved "Gør det samme med alle posteringer …". Egne regler går forud for de faste regler.'));
}
function bBankKort(bk = bBankF) {
  const r = bBankRaekke(bk);
  const kort = el('div', 'kort b-bank-kort');
  kort.append(el('h3', null, '🏦 Bankposteringer'));
  if (r) kort.append(el('p', 'hint', bKr(r.antal) + ' posteringer fra ' + bDato(r.fra) + ' til ' + bDato(r.til) + ' (opdateret ' + bDato(r.lavet) + '). Tryk på en post i tabellen for at se dens posteringer og rette dem.'));
  else kort.append(el('p', 'hint', 'Læg bankens CSV-fil ind, så kan ' + (bk.mig ? 'du' : 'I') + ' trykke på en post og se hver eneste betaling.'));
  const csvInp = el('input'); csvInp.type = 'file'; csvInp.accept = '.csv,text/csv'; csvInp.hidden = true;
  csvInp.addEventListener('change', async () => {
    const fil = csvInp.files?.[0]; csvInp.value = '';
    if (fil) await bLaesBankfil(fil, bk);
  });
  const filInp = el('input'); filInp.type = 'file'; filInp.accept = '.json,application/json'; filInp.hidden = true;
  filInp.addEventListener('change', async () => {
    const fil = filInp.files?.[0]; filInp.value = '';
    if (!fil) return;
    let d;
    try { d = JSON.parse(await fil.text()); if (!Array.isArray(d.rows)) throw 0; } catch { visStatus('Det er ikke en fil med posteringer', true); return; }
    const R = bReglerRaekke(bk)?.regler;
    if (bNyFil(d) && R) {
      try { visStatus('Lægger posteringerne ind …'); await bGemBank(bk, Bank.inddel(d.rows, R), R, '🏦 ' + bKr(d.rows.length) + ' posteringer er lagt ind · forbruget er regnet ud'); }
      catch (e) { console.warn(e); visStatus('Filen kunne ikke lægges op', true); }
      return;
    }
    try {
      visStatus('Lægger posteringerne op …');
      const op = await Data.uploadFil(bk.syn, fil);
      const felter = { ...bk.ekstra, snap: '_bank', art: 'bankfil', sti: op.sti, navn: op.navn, lavet: d.lavet || bIdag(), fra: d.fra || '', til: d.til || '', antal: d.rows.length };
      if (r) { await Data.update(bk.liste, r.id, felter); Data.sletFiler([r.sti]); } else await Data.add(bk.liste, felter);
      bBankData = d; bBankSti = op.sti;
      visStatus('🏦 ' + bKr(d.rows.length) + ' posteringer er lagt ind'); tegnBudget();
    } catch (e) { console.warn(e); visStatus('Filen kunne ikke lægges op', true); }
  });
  const knapper = el('div', 'b-bank-knapper');
  knapper.append(csvInp, filInp, knap('📥 Læg bankfil ind (CSV)', 'knap', () => csvInp.click()));
  kort.append(knapper);
  kort.append(el('p', 'hint', bk.mig ? 'I netbanken: eksportér din egen konto som CSV (gerne alle felter – mindst Exportkonto, Dato, Tekst, Beløb og Saldo). 🔒 Kun du kan se posteringerne og forbruget herfra – også hvis du deler dit budget.'
    : 'I netbanken: eksportér posteringerne som CSV (gerne alle konti og alle felter – mindst Exportkonto, Dato, Tekst, Beløb og Saldo). Posteringer, der allerede er lagt ind, springes over.'));
  const n = bRettelser(bk).length;
  if (n) kort.append(el('p', 'hint', (bk.mig ? '✏️ Du har rettet ' : '✏️ I har rettet ') + n + (n === 1 ? ' postering' : ' posteringer') + '. Rettelserne bliver liggende, når der kommer nye posteringer.'));
  const egne = (bReglerRaekke(bk)?.regler?.post || []).filter(x => x.egen).length;
  const sm = el('div', 'b-bank-knapper');
  if (r) sm.append(knap('📥 Til sortering', 'lille-knap', () => bSortering(bk)), knap('🔗 Modposter', 'lille-knap', () => bModposter(bk)), knap('📊 Hent som Excel-ark', 'lille-knap', () => bEksport(bk)));
  sm.append(knap('🧩 Egne regler' + (egne ? ' (' + egne + ')' : ''), 'lille-knap', () => bEgneRegler(bk)),
    knap(r ? '📂 Udskift filen (fra Claude)' : '📂 Læg posteringer ind (fra Claude)', 'lille-knap', () => filInp.click()));
  kort.append(sm);
  return kort;
}
// Excel-ark med alle posteringer (inkl. dine flytninger) + oversigt pr. post og år. SheetJS hentes først, når der trykkes.
let bXlsx = null;
function bHentXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return bXlsx ||= new Promise((ok, fejl) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    sc.onload = () => ok(window.XLSX); sc.onerror = () => { bXlsx = null; fejl(new Error('Kunne ikke hente Excel-værktøjet')); };
    document.head.append(sc);
  });
}
async function bEksport(bk = bBankF) {
  visStatus('Laver Excel-arket …');
  let X, d;
  try { [X, d] = await Promise.all([bHentXlsx(), bHentBank(bk)]); } catch (e) { console.warn(e); visStatus('Excel-arket kunne ikke laves – tjek forbindelsen', true); return; }
  const ret = new Map(bRettelser(bk).map(r => [r.pid, r])), noter = bNoter(bk);
  const TY = { udgift: 'Udgift', retur: 'Retur/refusion', intern: 'Overførsel mellem egne konti', indskud: 'Indskud', 'fra løn': 'Fra lønkonto', 'til løn': 'Til lønkonto', 'indtægt': 'Indtægt', flyttet: 'Flyttet' };
  const rows = [...bMedDele(d.rows, ret), ...bManuelRaekker(bk)].sort((a, b) => a.d.localeCompare(b.d) || (a.o ?? 0) - (b.o ?? 0));
  const post = [['Dato', 'Tæller i år', 'Måned', 'Konto', 'Tekst', 'Beløb', 'Kategori', 'Post', 'Flyttet af jer', 'Oprindelig post', 'Type', 'Kommentar']];
  for (const x of rows) {
    const e = bEffektiv(x, ret), med = !!(x.n || x.manuel || ret.has(x.id));
    post.push([new Date(x.d + 'T12:00:00'), Number(e.aar), Number(x.d.slice(5, 7)), x.k, String(x.t).replace(/\s+/g, ' ') + (x.manuel?.note ? ' (' + x.manuel.note + ')' : ''), x.b,
      med ? e.gruppe : '', med ? e.navn : '', x.delTil ? 'delt op' : e.rettet ? (bNoegle(e.rettet.til) === bNoegle(e.rettet.fra) ? 'andet år' : 'ja') : x.manuel ? 'tilføjet' : '', e.rettet ? x.n || '' : '', x.manuel ? 'Uden for banken' : TY[x.ty] || x.ty || '', x.manuel ? '' : noter.get(x.id)?.note || '']);
  }
  // Oversigt: forbrug pr. post og år (kr. i alt) – samme tal som tabellen under År
  const aarL = [...new Set(rows.map(x => bEffektiv(x, ret).aar))].sort();
  const sumM = new Map();
  for (const x of rows) {
    const e = bEffektiv(x, ret);
    if (!(x.n || x.manuel || ret.has(x.id))) continue;
    const k = e.gruppe + '\u0000' + e.navn;
    if (!sumM.has(k)) sumM.set(k, {});
    const o = sumM.get(k), a = e.aar; o[a] = (o[a] || 0) - x.b;
  }
  const over = [['Kategori', 'Post', ...aarL.map(a => 'Forbrug ' + a)]];
  for (const [k, o] of [...sumM].sort((a, b) => a[0].localeCompare(b[0], 'da'))) over.push([...k.split('\u0000'), ...aarL.map(a => Math.round((o[a] || 0) * 100) / 100)]);
  over.push(['I alt (uden saldoændring)', '', ...aarL.map(a => Math.round([...sumM.values()].reduce((s, o) => s + (o[a] || 0), 0)))]);
  const wb = X.utils.book_new();
  const ark = (aoa, bredder, navn, talKol) => {
    const ws = X.utils.aoa_to_sheet(aoa, { cellDates: true });
    ws['!cols'] = bredder.map(w => ({ wch: w }));
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: aoa[0].length - 1 } }) };
    for (let r = 1; r < aoa.length; r++) for (const c of talKol) { const a = ws[X.utils.encode_cell({ r, c })]; if (a && a.t === 'n') a.z = '#,##0.00'; }
    if (navn === 'Posteringer') for (let r = 1; r < aoa.length; r++) { const a = ws[X.utils.encode_cell({ r, c: 0 })]; if (a) a.z = 'dd-mm-yyyy'; }
    X.utils.book_append_sheet(wb, ws, navn);
  };
  ark(over, [26, 40, ...aarL.map(() => 15)], 'Oversigt', aarL.map((_, i) => i + 2));
  ark(post, [11, 6, 7, 12, 45, 12, 24, 36, 9, 30, 26, 40], 'Posteringer', [5]);
  X.writeFile(wb, (bk.mig ? 'mine-posteringer-' : 'posteringer-') + bIdag() + '.xlsx');
  visStatus('📊 Excel-arket er hentet');
}
// Ark: posteringerne bag én post (vælg år, søg). Tryk på en postering = flyt den til en anden post.
// Sortering, søgning, år og hvor langt man var nået huskes, så man kan rette mange posteringer i træk.
const bPostVis = new Map();
let bPostSort = lokal.get('bank-sort') || 'nyeste';
const bArkRul = () => document.querySelector('#ark .ark');
async function bPosteringer(navn, gruppe, valgtAar, bk = bBankF, tilbageFra = false) {
  const vk = bk.liste + '|' + bNoegle({ navn, gruppe });
  const st = bPostVis.get(vk) || {};
  bPostVis.set(vk, st);
  if (!tilbageFra) st.scroll = 0;
  if (!bBankRaekke(bk)) { visStatus('Læg først en bankfil ind (nederst under År)', true); return; }
  aabnArk('🧾 ' + navn, el('p', 'hint', 'Henter posteringer …'));
  let d;
  try { d = await bHentBank(bk); } catch { aabnArk('🧾 ' + navn, el('p', 'hint', 'Posteringerne kunne ikke hentes. Prøv igen om lidt.')); return; }
  const ret = new Map(bRettelser(bk).map(r => [r.pid, r])), noter = bNoter(bk);
  const k = bNoegle({ navn, gruppe });
  const alle = [...bMedDele(d.rows, ret), ...bManuelRaekker(bk)].filter(x => (x.n || x.manuel || ret.has(x.id)) && bNoegle(bEffektiv(x, ret)) === k);
  const aarListe = [...new Set(alle.map(x => bEffektiv(x, ret).aar))].sort().reverse();
  let aarV = valgtAar && aarListe.includes(valgtAar) ? valgtAar : st.aar && aarListe.includes(st.aar) ? st.aar : aarListe[0] || '';
  let soeg = tilbageFra ? st.soeg || '' : '', sortV = bPostSort;
  st.aar = aarV;
  const liste = el('div');
  const tegn = () => {
    const q = soeg.trim().toLowerCase();
    const vis = alle.filter(x => (!aarV || bEffektiv(x, ret).aar === aarV) && (!q || (x.t + ' ' + (noter.get(x.id)?.note || '')).toLowerCase().includes(q)));
    if (sortV === 'stoerst') vis.sort((a, b) => a.b - b.b);
    const sum = vis.reduce((s, x) => s - x.b, 0);
    const ul = el('ul', 'b-bank-liste');
    for (const x of vis.slice(0, 400)) {
      const e = bEffektiv(x, ret);
      const li = el('li');
      const igen = () => bPosteringer(navn, gruppe, aarV, bk, true);
      const hel = x.delTil ? { ...x, b: x.helB, delTil: undefined } : x;
      const b = knap('', 'b-bank-raekke' + (e.rettet || x.manuel ? ' rettet' : ''), () => { st.scroll = bArkRul()?.scrollTop || 0; st.soeg = soeg; if (x.manuel) bManuel(x.manuel, { navn, gruppe }, igen, bk); else bFlytPostering(hel, ret.get(x.id), igen, bk); });
      const v = el('span', 'b-bank-v');
      const andetAar = e.aar !== x.d.slice(0, 4);
      v.append(el('span', 'b-bank-tekst', x.t), el('span', 'b-bank-info', bDato(x.d) + ' · ' + x.k + (x.manuel ? ' · ✍️ tilføjet af ' + (bk.mig ? 'dig' : 'jer') : x.delTil ? ' · ✂️ del af ' + bKrOere(Math.abs(x.helB)) + ' kr' : e.rettet && bNoegle(e.rettet.til) !== bNoegle(e.rettet.fra) ? ' · ✏️ flyttet hertil' : '') + (andetAar ? ' · 📅 tæller i ' + e.aar : '')));
      const nt = !x.manuel && noter.get(x.id)?.note;
      if (nt) v.append(el('span', 'b-bank-note', '💬 ' + nt));
      b.append(v, el('b', 'b-bank-beloeb' + (x.b > 0 ? ' plus' : ''), (x.b > 0 ? '+' : '') + bKrOere(x.b)));
      li.append(b); ul.append(li);
    }
    liste.replaceChildren(el('p', 'b-bank-sum', vis.length + (vis.length === 1 ? ' postering' : ' posteringer') + ' · i alt ' + bKr(sum) + ' kr'),
      vis.length ? ul : el('p', 'tom', 'Ingen posteringer.'), vis.length > 400 ? el('p', 'hint', 'Viser de 400 nyeste – søg for at finde andre.') : '');
  };
  const valg = aarListe.length > 1 ? chipValg(aarListe, aarV, v => { aarV = v; st.aar = v; tegn(); }) : '';
  const s = input('search', 'bank-soeg', soeg, 'Søg i teksten eller kommentaren');
  s.addEventListener('input', () => { soeg = s.value; st.soeg = soeg; tegn(); });
  const sv = chipValg(['nyeste', 'stoerst'], sortV, v => { sortV = v; bPostSort = v; lokal.set('bank-sort', v); tegn(); }, v => v === 'nyeste' ? 'Nyeste først' : '⬇️ Største først');
  sv.classList.add('b-sort-valg');
  tegn();
  const ny = knap('+ Udgift, der ikke står i banken', 'lille-knap', () => { st.scroll = bArkRul()?.scrollTop || 0; bManuel(null, { navn, gruppe }, () => bPosteringer(navn, gruppe, aarV, bk, true), bk, aarV); });
  aabnArk('🧾 ' + navn, valg, s, sv, liste, ny, el('p', 'hint', 'Tryk på en postering for at flytte den til en anden post eller et andet år – eller skrive en kommentar til den. Kun betalinger og refusioner er med – ikke overførsler mellem jeres egne konti. Er noget betalt kontant, med gavepenge eller før bankfilen starter, så tilføj det med knappen.'));
  if (tilbageFra && st.scroll) requestAnimationFrame(() => { const r = bArkRul(); if (r) r.scrollTop = st.scroll; });
}
// 🔗 Modposter: en indbetaling, der præcis dækker ét eller flere køb kort før/efter (fx Winnie betaler sit eget køb tilbage,
// Oliver betaler sin cykel). Også sammenlagte: én indbetaling for 2–3 køb, eller ét køb betalt tilbage i 2 omgange.
const B_MOD_DAGE = 10;
function bModForslag(rows, ret, nej) {
  const dag = iso => Date.parse(iso) / 864e5;
  const eff = x => { const r = ret.get(x.id); return r && !r.dele?.length ? r.til : x.n ? { navn: x.n, gruppe: x.g } : null; };
  // Faste indbetalinger (løn, månedlige overførsler) er ikke modposter: samme tekst og beløb mindst 3 gange
  const tael = new Map();
  for (const x of rows) if (x.b > 0) { const k = x.t + '|' + x.b; tael.set(k, (tael.get(k) || 0) + 1); }
  const ind = rows.filter(x => x.b > 0 && ['fra løn', 'retur'].includes(x.ty) && !nej.has(x.id) && (tael.get(x.t + '|' + x.b) || 0) < 3 && !ret.get(x.id)?.dele?.length);
  const ud = rows.filter(x => x.b < 0 && x.ty === 'udgift' && eff(x) && eff(x).gruppe !== 'Opsparing' && !ret.get(x.id)?.dele?.length);
  // "Fri" indbetaling = har ingen rigtig post endnu (ingen eller Andet). Har den sin egen post (fx en refusion), kun 1:1.
  const fri = x => { const e = eff(x); return !e || e.gruppe === 'Andet'; };
  const flere = x => /[+&,]| og /i.test(x.t);
  const ens = (a, b) => a && b && bNoegle(a) === bNoegle(b);
  const brugt = new Set(), forslag = [];
  const naer = (x, liste) => liste.filter(y => !brugt.has(y.id) && Math.abs(dag(y.d) - dag(x.d)) <= B_MOD_DAGE).sort((a, b) => Math.abs(dag(a.d) - dag(x.d)) - Math.abs(dag(b.d) - dag(x.d))).slice(0, 12);
  const rund = v => Math.round(v * 100);
  for (const x of ind.slice().sort((a, b) => a.d.localeCompare(b.d))) {
    if (brugt.has(x.id)) continue;
    const ex = eff(x);
    const kand = naer(x, ud).filter(y => !ens(eff(y), ex));
    const maksK = !fri(x) ? 1 : flere(x) ? 3 : 2;
    let fund = null;
    for (let k = 1; k <= maksK && !fund; k++) {
      const kk = k === 1 ? kand : kand.filter(y => Math.abs(dag(y.d) - dag(x.d)) <= 5);
      const vaelg = (start, valgt, sum) => {
        if (fund) return;
        if (valgt.length === k) { if (sum === rund(x.b)) fund = valgt.slice(); return; }
        for (let i = start; i < kk.length; i++) { valgt.push(kk[i]); vaelg(i + 1, valgt, sum - rund(kk[i].b)); valgt.pop(); }
      };
      vaelg(0, [], 0);
    }
    if (fund) { brugt.add(x.id); fund.forEach(y => brugt.add(y.id)); forslag.push({ ind: [x], ud: fund }); }
  }
  // Ét køb betalt tilbage i to omgange
  for (const y of ud) {
    if (brugt.has(y.id)) continue;
    const kand = naer(y, ind).filter(x => fri(x) && Math.abs(dag(x.d) - dag(y.d)) <= 7);
    for (let i = 0; i < kand.length; i++) for (let j = i + 1; j < kand.length; j++)
      if (!brugt.has(y.id) && rund(kand[i].b) + rund(kand[j].b) === -rund(y.b)) { brugt.add(y.id); brugt.add(kand[i].id); brugt.add(kand[j].id); forslag.push({ ind: [kand[i], kand[j]], ud: [y] }); }
  }
  return forslag.sort((a, b) => b.ind[0].d.localeCompare(a.ind[0].d));
}
// Hører sammen: har indbetalingen sin egen post (fx "Udlæg for drengene"), flyttes købene dertil.
// Ellers bliver indbetalingen en refusion på købets post (regel på posteringens id) – ligger købene på flere poster, deles den op.
async function bModJa(bk, f, ret) {
  const rk = bReglerRaekke(bk), d = await bHentBank(bk);
  const std = bNoegle({ navn: rk?.regler?.standard?.post, gruppe: rk?.regler?.standard?.gruppe });
  const egen = f.ind.length === 1 && f.ind[0].n && bNoegle({ navn: f.ind[0].n, gruppe: f.ind[0].g }) !== std ? { navn: f.ind[0].n, gruppe: f.ind[0].g } : null;
  if (egen) {
    for (const y of f.ud) {
      const gl = ret.get(y.id), oprAar = y.d.slice(0, 4);
      const felter = { ...bk.ekstra, snap: '_bank', art: 'bankret', pid: y.id, aar: oprAar, tilAar: gl?.tilAar || null, dato: y.d, tekst: y.t, beloeb: -y.b, fra: { navn: y.n, gruppe: y.g }, til: egen, dele: null };
      if (gl) await Data.update(bk.liste, gl.id, felter); else await Data.add(bk.liste, felter);
    }
    visStatus('🔗 Købet er flyttet til ' + egen.navn); return;
  }
  if (!rk?.regler || !bNyFil(d)) { visStatus('Det kræver, at reglerne og den nye posteringsfil er lagt ind', true); return; }
  const postAf = y => { const r = ret.get(y.id); return r ? r.til : { navn: y.n, gruppe: y.g }; };
  const pr = new Map();
  for (const y of f.ud) { const p = postAf(y), k = bNoegle(p); if (!pr.has(k)) pr.set(k, { til: p, kr: 0 }); pr.get(k).kr += -y.b; }
  const dele = [...pr.values()].sort((a, b) => b.kr - a.kr);
  const nye = f.ind.map(x => ({ id: [x.id], vis: x.t + ' ' + bKrOere(x.b) + ' kr', post: dele[0].til.navn, gruppe: dele[0].til.gruppe, mod: true, lavet: bIdag() }));
  const R = { ...rk.regler, refusion: [...nye, ...(rk.regler.refusion || [])] };
  await Data.update(bk.liste, rk.id, { regler: R });
  const rows = Bank.inddel(d.rows, R);
  await bGemBank(bk, rows, R, '🔗 Hører sammen – ' + (dele.length > 1 ? 'fordelt på ' + dele.length + ' poster' : 'refusion på ' + dele[0].til.navn));
  if (dele.length > 1) {
    const x = rows.find(r => r.id === f.ind[0].id);
    await Data.add(bk.liste, { ...bk.ekstra, snap: '_bank', art: 'bankret', pid: x.id, aar: x.d.slice(0, 4), tilAar: null, dato: x.d, tekst: x.t, beloeb: -x.b,
      fra: { navn: x.n, gruppe: x.g }, til: dele[0].til, dele: dele.map(p => ({ kr: -p.kr, til: p.til })) });
  }
}
async function bModposter(bk = bBankF) {
  if (!bBankRaekke(bk)) { visStatus('Læg først en bankfil ind (nederst under År)', true); return; }
  aabnArk('🔗 Modposter', el('p', 'hint', 'Leder efter beløb, der passer sammen …'));
  let d;
  try { d = await bHentBank(bk); } catch { aabnArk('🔗 Modposter', el('p', 'hint', 'Posteringerne kunne ikke hentes. Prøv igen om lidt.')); return; }
  const ret = new Map(bRettelser(bk).map(r => [r.pid, r]));
  const fs = bModForslag(d.rows, ret, bModNej(bk));
  const linje = (x, plus) => {
    const li = el('li', 'b-mod-linje');
    const v = el('span', 'b-bank-v');
    const r = ret.get(x.id), post = r && !r.dele?.length ? r.til.navn : x.n || (plus ? 'ingen post – tæller ikke' : '');
    v.append(el('span', 'b-bank-tekst', x.t), el('span', 'b-bank-info', bDato(x.d) + ' · ' + x.k + (post ? ' · ' + post : '')));
    li.append(v, el('b', 'b-bank-beloeb' + (plus ? ' plus' : ''), (plus ? '+' : '') + bKrOere(x.b)));
    return li;
  };
  const kort = fs.map(f => {
    const k = el('div', 'kort b-mod');
    const ul = el('ul', 'b-bank-liste');
    ul.append(...f.ind.map(x => linje(x, true)), ...f.ud.map(y => linje(y, false)));
    const egen = f.ind.length === 1 && f.ind[0].n && f.ind[0].g !== 'Andet' ? f.ind[0].n : null;
    const ja = knap('✓ Hører sammen', 'knap', async () => { ja.disabled = nej.disabled = true; try { await bModJa(bk, f, ret); } catch (e) { console.warn(e); visStatus('Kunne ikke gemmes', true); } bModposter(bk); });
    const nej = knap('✕ Nej', 'knap sekundaer', async () => { ja.disabled = nej.disabled = true; for (const x of f.ind) await Data.add(bk.liste, { ...bk.ekstra, snap: '_bank', art: 'modnej', pid: x.id }); bModposter(bk); });
    const kn = el('div', 'b-mod-knapper'); kn.append(nej, ja);
    k.append(ul, el('p', 'hint', egen ? 'Ja = købet flyttes til ' + egen + ', så det går i nul.' : 'Ja = indbetalingen trækkes fra på købets post, så det går i nul.'), kn);
    return k;
  });
  aabnArk('🔗 Modposter', el('p', 'hint', 'Indbetalinger, der præcis dækker ét eller flere køb inden for ' + B_MOD_DAGE + ' dage – fx når nogen betaler deres del tilbage. Siger I ja, går de i nul i forbruget.'),
    ...(kort.length ? kort : [el('p', 'tom', '🎉 Ingen mulige modposter lige nu.')]));
}
// 📥 Til sortering: alt, der ligger i kategorien Andet uden en kommentar – som en indbakke.
// Flyt posteringen til den rigtige post eller skriv en kommentar (fx "OK – gave"), så forsvinder den herfra.
const bSortSt = new Map();
async function bSortering(bk = bBankF, tilbageFra = false) {
  if (!bBankRaekke(bk)) { visStatus('Læg først en bankfil ind (nederst under År)', true); return; }
  const st = bSortSt.get(bk.liste) || {}; bSortSt.set(bk.liste, st);
  if (!tilbageFra) st.scroll = 0;
  aabnArk('📥 Til sortering', el('p', 'hint', 'Henter posteringer …'));
  let d;
  try { d = await bHentBank(bk); } catch { aabnArk('📥 Til sortering', el('p', 'hint', 'Posteringerne kunne ikke hentes. Prøv igen om lidt.')); return; }
  const ret = new Map(bRettelser(bk).map(r => [r.pid, r])), noter = bNoter(bk);
  const alle = bMedDele(d.rows, ret).filter(x => (x.n || ret.has(x.id)) && (bEffektiv(x, ret).gruppe || 'Andet') === 'Andet' && !noter.get(x.id)?.note);
  const aarListe = [...new Set(alle.map(x => bEffektiv(x, ret).aar))].sort().reverse();
  let aarV = st.aar && aarListe.includes(st.aar) ? st.aar : aarListe[0] || '';
  const liste = el('div');
  const tegn = () => {
    const vis = alle.filter(x => !aarV || bEffektiv(x, ret).aar === aarV).sort((a, b) => Math.abs(b.b) - Math.abs(a.b));
    const sum = vis.reduce((s, x) => s - x.b, 0);
    const ul = el('ul', 'b-bank-liste');
    for (const x of vis.slice(0, 300)) {
      const e = bEffektiv(x, ret);
      const hel = x.delTil ? { ...x, b: x.helB, delTil: undefined } : x;
      const b = knap('', 'b-bank-raekke', () => { st.scroll = bArkRul()?.scrollTop || 0; bFlytPostering(hel, ret.get(x.id), () => bSortering(bk, true), bk); });
      const v = el('span', 'b-bank-v');
      v.append(el('span', 'b-bank-tekst', x.t), el('span', 'b-bank-info', bDato(x.d) + ' · ' + x.k + ' · ' + e.navn));
      b.append(v, el('b', 'b-bank-beloeb' + (x.b > 0 ? ' plus' : ''), (x.b > 0 ? '+' : '') + bKrOere(x.b)));
      const li = el('li'); li.append(b); ul.append(li);
    }
    liste.replaceChildren(el('p', 'b-bank-sum', vis.length ? vis.length + (vis.length === 1 ? ' postering' : ' posteringer') + ' · i alt ' + bKr(sum) + ' kr' : '🎉 Intet at sortere' + (aarV ? ' i ' + aarV : '')),
      vis.length ? ul : '', vis.length > 300 ? el('p', 'hint', 'Viser de 300 største.') : '');
  };
  const valg = aarListe.length > 1 ? chipValg(aarListe, aarV, v => { aarV = v; st.aar = v; tegn(); }) : '';
  tegn();
  aabnArk('📥 Til sortering', el('p', 'hint', 'Det, der ligger i "Andet" og endnu ikke har en kommentar – største beløb først. Tryk på en postering og flyt den til den rigtige post, eller skriv en kommentar (fx "OK – gave til fødselsdag"), så forsvinder den herfra.'),
    knap('🔗 Se mulige modposter først', 'lille-knap', () => bModposter(bk)), valg, liste);
  if (tilbageFra && st.scroll) requestAnimationFrame(() => { const r = bArkRul(); if (r) r.scrollTop = st.scroll; });
}
// Forslag til regel-tekst: butikkens navn uden "Forretning:", DK-NOTA-numre, datoer og tal
function bRegelForslag(t) {
  let s = String(t || '').replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) s = s.replace(/^(DK-NOTA\w*|DK|BS|Forretning:|MobilePay:?|MOBILEPAY:?|Visa\/Dankort|Dankort-nota)\s+/i, '');
  s = s.replace(/\d{2}[./-]\d{2}([./-]\d{2,4})?/g, '').replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
  return s.split(' ').slice(0, 3).join(' ');
}
// Flyt én postering til en anden post (gemmes som rettelse oven på filen) – evt. som regel for alle de samme
function bFlytPostering(x, gl, tilbage, bk = bBankF) {
  const kilde = bk.kilde, ps = kilde.poster().filter(p => !bErInd(p));
  const kol = bAarData(kilde.poster(), kilde, bk);
  const grupper = new Map();
  if (!kilde.faelles) grupper.set('Fælles budget', new Set(['Andel af fælles budget']));
  for (const p of ps) { const g = p.gruppe || 'Andet'; if (!grupper.has(g)) grupper.set(g, new Set()); grupper.get(g).add(p.navn); }
  for (const [, y] of kol) for (const m of [y.b, y.f]) if (m) for (const [, p] of m) { if (!grupper.has(p.gruppe)) grupper.set(p.gruppe, new Set()); grupper.get(p.gruppe).add(p.navn); }
  const nu = gl ? gl.til : { navn: x.n, gruppe: x.g };
  let g = nu.gruppe;
  const postBoks = el('div');
  const oprAar = x.d.slice(0, 4);
  const aarMul = [...new Set([oprAar, ...kol.filter(([, y]) => y.f).map(([a]) => a)])].sort();
  let tilAar = String(gl?.tilAar || oprAar);
  const kanRegel = !!bReglerRaekke(bk)?.regler && (x.ty === 'udgift' || x.ty === 'retur');
  const cb = el('input'); cb.type = 'checkbox'; cb.id = 'b-regel-cb';
  const rt = input('text', 'b-regel-tekst', bRegelForslag(x.t), 'Teksten indeholder …');
  rt.hidden = true;
  cb.addEventListener('change', () => { rt.hidden = !cb.checked; if (cb.checked) rt.focus(); });
  const noteFelt = input('text', 'b-note', bNoter(bk).get(x.id)?.note || '', 'Hvad er det for? Fx "Båd: motor"');
  noteFelt.maxLength = 200;
  const gemNote = async () => { try { await bGemNote(bk, x, noteFelt.value); } catch (e) { console.warn(e); visStatus('Kommentaren kunne ikke gemmes', true); } };
  const gemTil = async til => {
    await gemNote();
    const fra = { navn: x.n, gruppe: x.g };
    if (bNoegle(til) === bNoegle(fra) && tilAar === oprAar) { if (gl) await Data.remove(bk.liste, gl.id); }
    else {
      const felter = { ...bk.ekstra, snap: '_bank', art: 'bankret', pid: x.id, aar: oprAar, tilAar: tilAar === oprAar ? null : tilAar, dato: x.d, tekst: x.t, beloeb: -x.b, fra, til, dele: null };
      if (gl) await Data.update(bk.liste, gl.id, felter); else await Data.add(bk.liste, felter);
    }
    const tekst = rt.value.trim();
    if (kanRegel && cb.checked && tekst.length >= 2) {
      visStatus('🧩 Laver reglen og inddeler igen …');
      try { await bNyRegel(bk, { t: bRxTekst(tekst.toUpperCase()), vis: tekst, post: til.navn, gruppe: til.gruppe, egen: true, lavet: bIdag() }); }
      catch (e) { console.warn(e); visStatus('Reglen kunne ikke gemmes', true); }
    } else { visStatus('✏️ Flyttet til ' + til.navn + (tilAar !== oprAar ? ' (tæller i ' + tilAar + ')' : '')); tegnBudget(); }
    tilbage();
  };
  const tegnPoster = () => postBoks.replaceChildren(...[...(grupper.get(g) || [])].sort((a, b) => a.localeCompare(b, 'da')).map(n => {
    const b = knap(n, 'knap sekundaer b-flyt-post', () => gemTil({ navn: n, gruppe: g }));
    if (n === nu.navn && g === nu.gruppe) b.setAttribute('aria-current', 'true');
    return b;
  }));
  const gValg = chipValg([...grupper.keys()], g, v => { g = v; tegnPoster(); }, v => bIkon(v) + ' ' + v);
  tegnPoster();
  const knapper = el('div', 'ark-knapper');
  if (gl) knapper.append(knap('↩️ Tilbage til ' + x.n, 'knap sekundaer', () => gemTil({ navn: x.n, gruppe: x.g })));
  knapper.append(knap('✂️ Del op', 'knap sekundaer', () => bDelPostering(x, gl, tilbage, bk, grupper, () => tilAar === oprAar ? null : tilAar)));
  knapper.append(knap('💬 Gem kun kommentar', 'knap', async () => { await gemNote(); visStatus('💬 Kommentaren er gemt'); tilbage(); }));
  knapper.append(knap('Annullér', 'knap sekundaer', () => tilbage()));
  const regel = el('div', 'b-regel-valg');
  if (kanRegel) {
    const lab = el('label', null, ' Gør det samme med alle posteringer, hvor teksten indeholder:');
    lab.htmlFor = cb.id; lab.prepend(cb);
    regel.append(lab, rt);
  }
  const aarValg = aarMul.length > 1 ? [el('label', 'felt-label', 'Tæller med i år'), chipValg(aarMul, tilAar, v => { tilAar = v; }),
    el('p', 'hint', 'Fx en forsikring betalt i december for hele næste år. Vælg året og tryk så på posten.')] : [];
  aabnArk('Flyt postering', el('p', null, x.t), el('p', 'hint', bDato(x.d) + ' · ' + x.k + ' · ' + bKrOere(x.b) + ' kr · nu: ' + nu.navn + (gl?.tilAar ? ' i ' + gl.tilAar : '')),
    el('label', 'felt-label', '💬 Kommentar (kun til jer selv)'), noteFelt, regel, ...aarValg, el('label', 'felt-label', 'Kategori'), gValg, el('label', 'felt-label', 'Post'), postBoks, knapper);
}
// Del én postering op på flere poster (fx "briller, vitaminer + div")
function bDelPostering(x, gl, tilbage, bk, grupper, tilAarFn) {
  const hel = -x.b, fortegn = hel < 0 ? -1 : 1, total = Math.abs(hel);
  const muligheder = [...grupper].flatMap(([g, ns]) => [...ns].sort((a, b) => a.localeCompare(b, 'da')).map(n => ({ navn: n, gruppe: g })));
  const vaelger = (valgt) => {
    const sel = el('select');
    for (const [g, ns] of grupper) {
      const og = el('optgroup'); og.label = bIkon(g) + ' ' + g;
      for (const n of [...ns].sort((a, b) => a.localeCompare(b, 'da'))) { const o = el('option', null, n); o.value = g + '\u0000' + n; if (valgt && valgt.navn === n && valgt.gruppe === g) o.selected = true; og.append(o); }
      sel.append(og);
    }
    return sel;
  };
  const start = gl?.dele?.length ? gl.dele.map(d => ({ kr: Math.abs(d.kr), til: d.til })) : [{ kr: '', til: gl?.til || { navn: x.n, gruppe: x.g } }, { kr: '', til: null }];
  const boks = el('div', 'b-dele');
  const linjer = [];
  const rest = el('p', 'b-dele-rest');
  const opdater = () => {
    const brugt = linjer.slice(0, -1).reduce((s, l) => s + (bTal(l.kr.value) || 0), 0);
    const r = Math.round((total - brugt) * 100) / 100;
    linjer[linjer.length - 1].kr.value = r > 0 ? String(r).replace('.', ',') : '0';
    rest.textContent = r < 0 ? '⚠️ Delene er ' + bKrOere(-r) + ' kr for meget' : 'Den sidste linje får resten automatisk.';
    rest.classList.toggle('fejl', r < 0);
  };
  const tegn = () => {
    boks.replaceChildren(...linjer.map((l, i) => {
      const r = el('div', 'b-del-linje');
      l.kr.readOnly = i === linjer.length - 1;
      r.append(l.kr, l.sel);
      if (linjer.length > 2) r.append(knap('✕', 'ikon-knap', () => { linjer.splice(i, 1); tegn(); }));
      return r;
    }));
    opdater();
  };
  const nyLinje = d => { const kr = input('text', '', d.kr === '' ? '' : String(d.kr).replace('.', ','), 'kr'); kr.inputMode = 'decimal'; kr.addEventListener('input', opdater); return { kr, sel: vaelger(d.til) }; };
  for (const d of start) linjer.push(nyLinje(d));
  if (linjer.length < 2) linjer.push(nyLinje({ kr: '', til: null }));
  tegn();
  const gem = async () => {
    opdater();
    const dele = linjer.map(l => { const [gruppe, navn] = l.sel.value.split('\u0000'); return { kr: fortegn * (Math.round((bTal(l.kr.value) || 0) * 100) / 100), til: { navn, gruppe } }; }).filter(d => d.kr);
    const sum = dele.reduce((s, d) => s + d.kr, 0);
    if (dele.length < 2 || Math.abs(sum - hel) > 0.01) { visStatus('Delene skal tilsammen give ' + bKrOere(total) + ' kr', true); return; }
    const tilAar = tilAarFn(), oprAar = x.d.slice(0, 4);
    const stoerst = dele.slice().sort((a, b) => Math.abs(b.kr) - Math.abs(a.kr))[0].til;
    const felter = { ...bk.ekstra, snap: '_bank', art: 'bankret', pid: x.id, aar: oprAar, tilAar, dato: x.d, tekst: x.t, beloeb: hel, fra: { navn: x.n, gruppe: x.g }, til: stoerst, dele };
    if (gl) await Data.update(bk.liste, gl.id, felter); else await Data.add(bk.liste, felter);
    visStatus('✂️ Delt op på ' + dele.length + ' poster'); tegnBudget(); tilbage();
  };
  const knapper = el('div', 'ark-knapper');
  if (gl?.dele?.length) knapper.append(knap('↩️ Ikke delt', 'knap sekundaer', async () => { await Data.remove(bk.liste, gl.id); visStatus('↩️ Posteringen er samlet igen'); tegnBudget(); tilbage(); }));
  knapper.append(knap('Annullér', 'knap sekundaer', () => tilbage()), knap('Gem', 'knap', gem));
  aabnArk('✂️ Del postering op', el('p', null, x.t), el('p', 'hint', bDato(x.d) + ' · ' + x.k + ' · ' + bKrOere(x.b) + ' kr i alt'),
    boks, rest, knap('+ Endnu en del', 'lille-knap', () => { linjer.splice(linjer.length - 1, 0, nyLinje({ kr: '', til: null })); tegn(); }), knapper);
}
// Udgift, der ikke står i banken: kontant, betalt med gavepenge, eller betalt før bankfilen starter
function bManuel(m, post, tilbage, bk = bBankF, forslagAar) {
  const kol = bAarData(bk.kilde.poster(), bk.kilde, bk);
  const aarMul = [...new Set([...kol.filter(([, y]) => y.f).map(([a]) => a), String(new Date().getFullYear())])].sort();
  let aar = String(m?.aar || (forslagAar && aarMul.includes(forslagAar) ? forslagAar : aarMul[aarMul.length - 1]));
  const til = m?.til || post;
  const tekst = input('text', 'b-man-tekst', m?.tekst || '', 'Hvad var det? (fx Plæneklipning, kontant)');
  const beloeb = input('text', 'b-man-beloeb', m ? String(m.beloeb).replace('.', ',') : '', 'Beløb i kr');
  beloeb.inputMode = 'decimal';
  const dato = input('date', 'b-man-dato', m?.dato || '', '');
  const note = input('text', 'b-man-note', m?.note || '', 'Note (fx betalt med gavepenge)');
  const gem = async () => {
    const kr = bTal(beloeb.value);
    if (!tekst.value.trim() || !isFinite(kr) || !kr) { visStatus('Skriv hvad det var og et beløb', true); return; }
    const felter = { ...bk.ekstra, snap: '_bank', art: 'manuel', aar, dato: dato.value || '', tekst: tekst.value.trim(), beloeb: Math.round(kr * 100) / 100, til, note: note.value.trim() };
    if (m) await Data.update(bk.liste, m.id, felter); else await Data.add(bk.liste, felter);
    visStatus('✍️ ' + bKr(kr) + ' kr lagt på ' + til.navn + ' i ' + aar); tegnBudget(); tilbage();
  };
  const knapper = el('div', 'ark-knapper');
  if (m) knapper.append(knap('🗑 Slet', 'knap sekundaer', async () => { await Data.remove(bk.liste, m.id); visStatus('🗑 Slettet'); tegnBudget(); tilbage(); }));
  knapper.append(knap('Annullér', 'knap sekundaer', () => tilbage()), knap('Gem', 'knap', gem));
  aabnArk(m ? 'Ret udgift uden for banken' : 'Udgift uden for banken', el('p', 'hint', 'Lægges på ' + bIkon(til.gruppe) + ' ' + til.navn + ' i forbruget for det valgte år. Brug den til ting betalt kontant, med gavepenge eller før bankfilen starter.'),
    felt('Hvad', tekst), felt('Beløb (kr)', beloeb), felt('Dato (valgfri)', dato), el('label', 'felt-label', 'Tæller med i år'), chipValg(aarMul, aar, v => { aar = v; }), felt('Note', note), knapper);
}

// ---------- Personligt budget ----------
function budgetPersonVis(kilde) {
  const mig = bMig(), egen = kilde.hvem === mig;
  const poster = kilde.poster();
  const dele = [];
  if (!poster.length) {
    const tom = el('div', 'kort budget-tom');
    tom.append(el('p', null, 'Dit eget budget: hvad du får ind, hvad du betaler fra din egen konto, og hvad der er tilbage, når din andel af det fælles budget er betalt.'),
      el('p', 'hint', '👤 Kun du kan se det – du kan vælge at dele det bagefter.'),
      knap('+ Tilføj første indtægt', 'knap', () => redigerPost(null, 'Indtægter', kilde, 'ind')));
    return [tom];
  }
  const t = bPersonTal(poster);
  const md = (t.indAar - t.udAar) / 12;
  const hero = el('div', 'kort budget-hero' + (md < 0 ? ' minus' : ''));
  hero.append(el('span', 'b-label', (egen ? 'Dit ' : kilde.hvem + 's ') + (md < 0 ? 'underskud' : 'overskud') + ' om måneden'),
    el('b', 'b-tal', (md < 0 ? '−' : '+') + bKr(Math.abs(md)) + ' kr'),
    el('span', 'b-under', 'Indtægter ' + bKr(t.indAar / 12) + ' · udgifter ' + bKr(t.udAar / 12) + ' kr/md · ' + (md < 0 ? 'mangler ' : 'tilbage ') + bKr(Math.abs(md * 12)) + ' kr på et år'));
  dele.push(hero);
  // Måned for måned – de måneder, der går i minus, er røde
  const mk = el('div', 'kort');
  mk.append(el('h3', null, 'Måned for måned'));
  const grid = el('div', 'b-md-gitter');
  t.over.forEach((x, i) => {
    const c = knap('', 'b-md-celle' + (x < -0.5 ? ' minus' : '') + (i === new Date().getMonth() ? ' nu' : ''), () => { budgetMaaned = i; budgetVis = 'maaneder'; lokal.set('budget-vis', 'maaneder'); tegnBudget(); window.scrollTo(0, 0); });
    c.setAttribute('aria-label', MDR_LANG[i] + ': ' + (x < -0.5 ? 'underskud ' : 'overskud ') + bKr(Math.abs(x)) + ' kr');
    c.append(el('span', null, MDR[i].replace('.', '')), el('b', null, (x < -0.5 ? '−' : '+') + bKr(Math.abs(x))));
    grid.append(c);
  });
  mk.append(grid, el('p', 'hint', 'Overskud (+) eller underskud (−) hver måned. Røde måneder skal tages fra opsparingen eller de gode måneder.'));
  dele.push(mk);
  // Gennemgang
  const gamle = poster.filter(bGammel);
  if (gamle.length) {
    const g = el('div', 'kort budget-tjek skal');
    g.append(el('b', null, '🔄 ' + gamle.length + (gamle.length === 1 ? ' post er' : ' poster er') + ' ikke tjekket i over et år'),
      knap('Start gennemgang', 'knap', () => budgetGennemgang(false, kilde)));
    dele.push(g);
  }
  dele.push(bAarKort(kilde, md));
  // Posterne: indtægter, så udgifter i kategorier, og andelen af det fælles budget
  const top = el('div', 'b-poster-top');
  top.append(knap('+ Indtægt', 'lille-knap', () => redigerPost(null, '', kilde, 'ind')), knap('+ Udgift', 'lille-knap', () => redigerPost(null, '', kilde, 'ud')));
  if (!gamle.length) top.append(knap('🔄 Gennemgang', 'lille-knap', () => budgetGennemgang(true, kilde)));
  dele.push(top);
  const sektion = (titel, ps, ekstra) => {
    const sum = ps.reduce((s, p) => s + bAar(p), 0) / 12 + (ekstra ? ekstra.md : 0);
    const h = el('div', 'b-gruppe-hoved');
    h.append(el('b', null, titel), el('span', null, bKr(sum) + ' kr/md'));
    const ul = el('ul', 'b-post-liste');
    for (const p of ps) {
      const li = el('li'), a = bAar(p);
      const b = knap('', 'b-post' + (a ? '' : ' nul'), () => redigerPost(p, '', kilde));
      const v = el('span', 'b-post-v');
      v.append(el('span', 'b-post-navn', p.navn || 'Uden navn'), el('span', 'b-post-info', [bMoenster(p), bGammel(p) ? '🔄 tjek' : ''].filter(Boolean).join(' · ')));
      const h2 = el('span', 'b-post-h');
      h2.append(el('b', null, bKr(a / 12) + ' kr'), el('span', null, a ? bKr(a) + '/år' : ''));
      b.append(v, h2); li.append(b); ul.append(li);
    }
    if (ekstra) {
      const li = el('li');
      const b = knap('', 'b-post auto', () => { budgetHvem = 'faelles'; lokal.set('budget-hvem', 'faelles'); budgetVis = 'overblik'; tegnBudget(); window.scrollTo(0, 0); });
      const v = el('span', 'b-post-v');
      v.append(el('span', 'b-post-navn', ekstra.navn), el('span', 'b-post-info', ekstra.info));
      const h2 = el('span', 'b-post-h');
      h2.append(el('b', null, bKr(ekstra.md) + ' kr'), el('span', null, bKr(ekstra.md * 12) + '/år'));
      b.append(v, h2); li.append(b); ul.append(li);
    }
    dele.push(h, ul);
  };
  const ind = poster.filter(bErInd).sort(bSort);
  if (ind.length) sektion('💰 Indtægter', ind);
  const udG = bGrupper(poster.filter(p => !bErInd(p)));
  for (const [g, ps] of udG) sektion(bIkon(g) + ' ' + g, ps);
  sektion('👨‍👩‍👦‍👦 Fælles budget', [], { navn: 'Andel af fælles budget', info: 'regnes automatisk · tryk for at se det fælles', md: t.andel });
  // Hvem kan se det?
  if (egen) {
    const delt = bDelt(mig);
    const andre = (typeof VOKSNE !== 'undefined' ? VOKSNE : []).filter(n => n !== mig);
    const k = el('div', 'kort b-deling');
    k.append(el('b', null, delt ? '👥 ' + (andre.join(' og ') || 'De andre voksne') + ' kan også se dit budget' : '👤 Kun du kan se dit budget'));
    const sk = knap(delt ? 'Gør det privat igen' : 'Del med ' + (andre.join(' og ') || 'de andre voksne'), 'lille-knap', async () => { await bSkiftDeling(!delt); tegnBudget(); });
    k.append(sk);
    dele.push(k);
  } else dele.push(el('p', 'hint', kilde.hvem + ' har delt sit budget med dig. Du kan også rette i det.'));
  return dele;
}
// Flyt alle mine rækker mellem privat og delt (samme data, ny liste)
async function bSkiftDeling(del) {
  const mig = bMig(), fra = del ? B_PRIVAT : B_DELT, til = del ? B_DELT : B_PRIVAT;
  const rk = bPersonRaekker(mig).filter(r => r._liste === fra && !r.art);   // bankposteringer, forbrug, regler og konti forbliver private
  await Data.stille(async () => {
    for (const r of rk) {
      const { id, oprettet, _af, _liste, ...data } = r;
      await Data.add(til, { ...data, ejer: mig });
      await Data.remove(fra, id);
    }
  });
  visStatus(del ? '👥 Dit budget er delt' : '👤 Dit budget er privat igen');
}
