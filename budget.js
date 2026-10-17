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
  [/feriehus|sommerhus/i, '🏖️'], [/husholdning|dagligvar|mad/i, '🛒'], [/hus|bolig/i, '🏠'], [/transport|bil/i, '🚗'],
  [/forsikring/i, '🛡️'], [/fritid|sfo|sport/i, '⚽'], [/kæledyr|dyr/i, '🐰'], [/stream|abonnement/i, '📺'],
  [/børn/i, '🧒'], [/ferie|rejse/i, '✈️'], [/opsparing|buffer|pension/i, '🐷'], [/egne/i, '🧾'], [/indtægt/i, '💰']
];
let budgetVis = lokal.get('budget-vis') || 'overblik';
let budgetGruppe = '';
let budgetSoeg = '';
let budgetMaaned = null;
let budgetAarValg = lokal.get('budget-aarvis') || 'begge';
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
  if (budgetHvem !== 'faelles') { boks.replaceChildren(hvemSeg, ...budgetPersonVis(bKilde(budgetHvem))); return; }
  const poster = bPoster();
  const seg = el('div', 'seg budget-faner');
  seg.setAttribute('role', 'radiogroup');
  for (const [id, tekst] of [['overblik', 'Overblik'], ['poster', 'Poster'], ['maaneder', 'Måneder'], ['aar', 'År']]) {
    const b = knap(tekst, null, () => { budgetVis = id; lokal.set('budget-vis', id); tegnBudget(); });
    b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', budgetVis === id);
    seg.append(b);
  }
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
  if (kilde.faelles) knapper.append(knap('Alle år og forbrug ›', 'lille-knap', () => { budgetVis = 'aar'; lokal.set('budget-vis', 'aar'); tegnBudget(); window.scrollTo(0, 0); }));
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
function bAarData(poster) {
  const nu = String(new Date().getFullYear());
  const alle = bAlleFaelles();
  const aar = new Map();   // 'ÅÅÅÅ' → { b: Map|null, f: Map|null, fMdr, periode }
  const hent = a => { if (!aar.has(a)) aar.set(a, { b: null, f: null }); return aar.get(a); };
  const tilMap = (ps, del) => { const m = new Map(); for (const p of ps || []) { if (p.type === 'ind') continue; const k = bNoegle(p); const x = m.get(k) || { navn: p.navn, gruppe: p.gruppe || 'Andet', md: 0 }; x.md += (Number(p.aar) || 0) / del; m.set(k, x); } return m; };
  for (const s of alle.filter(p => p.snap && !p.art)) if (String(s.snap) !== nu) hent(String(s.snap)).b = tilMap(s.poster, 12);
  hent(nu).b = tilMap(poster.map(p => ({ navn: p.navn, gruppe: p.gruppe, aar: bAar(p) })), 12);
  for (const s of alle.filter(p => p.snap && p.art === 'forbrug')) {
    const x = hent(String(s.snap)), mdr = Number(s.maaneder) || 12;
    x.f = tilMap(s.poster, mdr); x.fMdr = mdr; x.periode = s.periode || ''; x.fDato = s.dato;
  }
  // Rettede bankposteringer flytter beløbet fra den ene post til den anden i forbruget
  for (const r of bRettelser()) {
    const x = aar.get(String(r.aar));
    if (!x || !x.f) continue;
    const md = (Number(r.beloeb) || 0) / (x.fMdr || 12);
    const flyt = (p, fortegn) => { const k = bNoegle(p); const y = x.f.get(k) || { navn: p.navn, gruppe: p.gruppe || 'Andet', md: 0 }; y.md += fortegn * md; x.f.set(k, y); };
    flyt(r.fra, -1); flyt(r.til, 1);
  }
  return [...aar].sort((a, b) => a[0].localeCompare(b[0]));
}
function budgetAarVis(poster) {
  const kol = bAarData(poster);
  const harF = kol.some(([, x]) => x.f);
  const vis = harF ? budgetAarValg : 'budget';
  // Rækkefølge: grupperne som under Poster, derefter grupper der kun findes i gamle år
  const grpOrden = [...bGrupper(poster).keys()];
  const grupper = new Map();   // gruppe → Map(nøgle → navn)
  const sorteret = poster.slice().sort(bSort);
  for (const p of sorteret) { const g = p.gruppe || 'Andet'; if (!grupper.has(g)) grupper.set(g, new Map()); grupper.get(g).set(bNoegle(p), p.navn); }
  for (const [, x] of kol) for (const m of [x.b, x.f]) if (m) for (const [k, p] of m) {
    if (!grupper.has(p.gruppe)) grupper.set(p.gruppe, new Map());
    if (!grupper.get(p.gruppe).has(k)) grupper.get(p.gruppe).set(k, p.navn);
  }
  const gOrden = [...grupper.keys()].sort((a, b) => (grpOrden.indexOf(a) + 1 || 999) - (grpOrden.indexOf(b) + 1 || 999));
  const sum = (m, keys) => { if (!m) return null; let s = 0, fandt = false; for (const k of keys) { const x = m.get(k); if (x) { s += x.md; fandt = true; } } return fandt ? s : 0; };
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
  dele.push(valg);
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
  const alleNgl = gOrden.flatMap(g => [...grupper.get(g).keys()]);
  const iAlt = el('tr', 'b-aar-ialt');
  iAlt.append(el('th', null, 'I alt'));
  for (const [, x] of kol) iAlt.append(celle(sum(x.b, alleNgl), sum(x.f, alleNgl)));
  tb.append(iAlt);
  for (const g of gOrden) {
    const ngl = [...grupper.get(g).keys()];
    const aaben = budgetAabne.has(g);
    const tr = el('tr', 'b-aar-gruppe');
    const th = el('th');
    const b = knap((aaben ? '▾ ' : '▸ ') + bIkon(g) + ' ' + g, 'b-aar-gknap', () => { aaben ? budgetAabne.delete(g) : budgetAabne.add(g); tegnBudget(); });
    b.setAttribute('aria-expanded', aaben);
    th.append(b); tr.append(th);
    for (const [, x] of kol) tr.append(celle(sum(x.b, ngl), sum(x.f, ngl)));
    tb.append(tr);
    if (aaben) for (const k of ngl) {
      const pr = el('tr', 'b-aar-post');
      const th = el('th');
      const pk = knap(grupper.get(g).get(k), 'b-aar-pknap', () => bPosteringer(grupper.get(g).get(k), g));
      pk.title = 'Se posteringerne';
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
  noter.push('Nogle ting kan kun ses samlet i banken – fx GF, der står som én post under forbrug.');
  dele.push(el('p', 'hint', noter.join(' ')));
  dele.push(bBankKort());
  return dele;
}

// ---------- Bankposteringer (fil i Storage) + rettelser ----------
const bBankRaekke = () => bAlleFaelles().find(p => p.art === 'bankfil');
const bRettelser = () => bAlleFaelles().filter(p => p.art === 'bankret');
let bBankData = null, bBankSti = null;
async function bHentBank() {
  const r = bBankRaekke();
  if (!r) return null;
  if (bBankData && bBankSti === r.sti) return bBankData;
  const res = await fetch(await Data.filUrl(r.sti));
  if (!res.ok) throw new Error('Kunne ikke hente posteringerne');
  bBankData = await res.json(); bBankSti = r.sti;
  return bBankData;
}
// Posteringens post efter jeres rettelser
function bEffektiv(x, ret) { const r = ret.get(x.id); return r ? { navn: r.til.navn, gruppe: r.til.gruppe, rettet: r } : { navn: x.n, gruppe: x.g }; }
const bKrOere = n => (Math.round(n * 100) / 100).toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function bBankKort() {
  const r = bBankRaekke();
  const kort = el('div', 'kort b-bank-kort');
  kort.append(el('h3', null, '🏦 Bankposteringer'));
  if (r) kort.append(el('p', 'hint', bKr(r.antal) + ' posteringer fra ' + bDato(r.fra) + ' til ' + bDato(r.til) + ' (lavet ' + bDato(r.lavet) + '). Tryk på en post i tabellen for at se dens posteringer og rette dem.'));
  else kort.append(el('p', 'hint', 'Læg filen med bankposteringer ind (posteringer.json fra Claude). Så kan I trykke på en post og se hver eneste betaling.'));
  const filInp = el('input'); filInp.type = 'file'; filInp.accept = '.json,application/json'; filInp.hidden = true;
  filInp.addEventListener('change', async () => {
    const fil = filInp.files?.[0]; filInp.value = '';
    if (!fil) return;
    let d;
    try { d = JSON.parse(await fil.text()); if (!Array.isArray(d.rows)) throw 0; } catch { visStatus('Det er ikke en fil med posteringer', true); return; }
    try {
      visStatus('Lægger posteringerne op …');
      const op = await Data.uploadFil('voksne', fil);
      const felter = { snap: '_bank', art: 'bankfil', sti: op.sti, navn: op.navn, lavet: d.lavet || bIdag(), fra: d.fra || '', til: d.til || '', antal: d.rows.length };
      if (r) { await Data.update('budget', r.id, felter); Data.sletFiler([r.sti]); } else await Data.add('budget', felter);
      bBankData = d; bBankSti = op.sti;
      visStatus('🏦 ' + bKr(d.rows.length) + ' posteringer er lagt ind'); tegnBudget();
    } catch (e) { console.warn(e); visStatus('Filen kunne ikke lægges op', true); }
  });
  kort.append(filInp, knap(r ? '📂 Udskift filen' : '📂 Læg posteringer ind', 'lille-knap', () => filInp.click()));
  const n = bRettelser().length;
  if (n) kort.append(el('p', 'hint', '✏️ I har rettet ' + n + (n === 1 ? ' postering' : ' posteringer') + '. Rettelserne bliver liggende, når filen udskiftes.'));
  return kort;
}
// Ark: posteringerne bag én post (vælg år, søg). Tryk på en postering = flyt den til en anden post.
async function bPosteringer(navn, gruppe, valgtAar) {
  if (!bBankRaekke()) { visStatus('Læg først filen med bankposteringer ind (nederst under År)', true); return; }
  aabnArk('🧾 ' + navn, el('p', 'hint', 'Henter posteringer …'));
  let d;
  try { d = await bHentBank(); } catch { aabnArk('🧾 ' + navn, el('p', 'hint', 'Posteringerne kunne ikke hentes. Prøv igen om lidt.')); return; }
  const ret = new Map(bRettelser().map(r => [r.pid, r]));
  const k = bNoegle({ navn, gruppe });
  const alle = d.rows.filter(x => (x.n || ret.has(x.id)) && bNoegle(bEffektiv(x, ret)) === k);
  const aarListe = [...new Set(alle.map(x => x.d.slice(0, 4)))].sort().reverse();
  let aarV = valgtAar && aarListe.includes(valgtAar) ? valgtAar : aarListe[0] || '';
  let soeg = '';
  const liste = el('div');
  const tegn = () => {
    const q = soeg.trim().toLowerCase();
    const vis = alle.filter(x => (!aarV || x.d.startsWith(aarV)) && (!q || x.t.toLowerCase().includes(q)));
    const sum = vis.reduce((s, x) => s - x.b, 0);
    const ul = el('ul', 'b-bank-liste');
    for (const x of vis.slice(0, 400)) {
      const e = bEffektiv(x, ret);
      const li = el('li');
      const b = knap('', 'b-bank-raekke' + (e.rettet ? ' rettet' : ''), () => bFlytPostering(x, ret.get(x.id), () => bPosteringer(navn, gruppe, aarV)));
      const v = el('span', 'b-bank-v');
      v.append(el('span', 'b-bank-tekst', x.t), el('span', 'b-bank-info', bDato(x.d) + ' · ' + x.k + (e.rettet ? ' · ✏️ flyttet hertil' : '')));
      b.append(v, el('b', 'b-bank-beloeb' + (x.b > 0 ? ' plus' : ''), (x.b > 0 ? '+' : '') + bKrOere(x.b)));
      li.append(b); ul.append(li);
    }
    liste.replaceChildren(el('p', 'b-bank-sum', vis.length + (vis.length === 1 ? ' postering' : ' posteringer') + ' · i alt ' + bKr(sum) + ' kr'),
      vis.length ? ul : el('p', 'tom', 'Ingen posteringer.'), vis.length > 400 ? el('p', 'hint', 'Viser de 400 nyeste – søg for at finde andre.') : '');
  };
  const valg = aarListe.length > 1 ? chipValg(aarListe, aarV, v => { aarV = v; tegn(); }) : '';
  const s = input('search', 'bank-soeg', '', 'Søg i teksten');
  s.addEventListener('input', () => { soeg = s.value; tegn(); });
  tegn();
  aabnArk('🧾 ' + navn, valg, s, liste, el('p', 'hint', 'Tryk på en postering for at flytte den til en anden post. Kun betalinger og refusioner er med – ikke overførsler mellem jeres egne konti.'));
}
// Flyt én postering til en anden post (gemmes som rettelse oven på filen)
function bFlytPostering(x, gl, tilbage) {
  const kol = bAarData(bPoster());
  const grupper = new Map();
  for (const p of bPoster()) { const g = p.gruppe || 'Andet'; if (!grupper.has(g)) grupper.set(g, new Set()); grupper.get(g).add(p.navn); }
  for (const [, y] of kol) for (const m of [y.b, y.f]) if (m) for (const [, p] of m) { if (!grupper.has(p.gruppe)) grupper.set(p.gruppe, new Set()); grupper.get(p.gruppe).add(p.navn); }
  const nu = gl ? gl.til : { navn: x.n, gruppe: x.g };
  let g = nu.gruppe;
  const postBoks = el('div');
  const gemTil = async til => {
    const fra = { navn: x.n, gruppe: x.g };
    if (bNoegle(til) === bNoegle(fra)) { if (gl) await Data.remove('budget', gl.id); }
    else {
      const felter = { snap: '_bank', art: 'bankret', pid: x.id, aar: x.d.slice(0, 4), dato: x.d, tekst: x.t, beloeb: -x.b, fra, til };
      if (gl) await Data.update('budget', gl.id, felter); else await Data.add('budget', felter);
    }
    visStatus('✏️ Flyttet til ' + til.navn); tegnBudget(); tilbage();
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
  knapper.append(knap('Annullér', 'knap', () => tilbage()));
  aabnArk('Flyt postering', el('p', null, x.t), el('p', 'hint', bDato(x.d) + ' · ' + x.k + ' · ' + bKrOere(x.b) + ' kr · nu: ' + nu.navn),
    el('label', 'felt-label', 'Kategori'), gValg, el('label', 'felt-label', 'Post'), postBoks, knapper);
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
    const c = el('div', 'b-md-celle' + (x < -0.5 ? ' minus' : '') + (i === new Date().getMonth() ? ' nu' : ''));
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
  const rk = bPersonRaekker(mig).filter(r => r._liste === fra);
  await Data.stille(async () => {
    for (const r of rk) {
      const { id, oprettet, _af, _liste, ...data } = r;
      await Data.add(til, { ...data, ejer: mig });
      await Data.remove(fra, id);
    }
  });
  visStatus(del ? '👥 Dit budget er delt' : '👤 Dit budget er privat igen');
}
