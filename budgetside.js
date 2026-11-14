// budgetside.js – 💰 budgetsiden (budget.html): budgettet som sin egen side, lavet til pc-skærm (virker også på telefon).
// Siden deler login, data og regler med Familietavlen: data.js, bank.js og budget.js er de SAMME filer som før.
// Denne fil indeholder det, budget.js før fik fra app.js (små hjælpere, ark, status), login og start – og det, der kun
// findes her: visningen "Hele året" (alle 12 måneder side om side) og arket som panel i højre side på brede skærme.
// Hentes FØR bank.js og budget.js (de bruger hjælperne, mens de indlæses). bsStart() kører, når alt er indlæst.

// ---------- Hjælpere (samme navne og opførsel som i app.js) ----------
const lokal = {
  get(k) { try { return localStorage.getItem('familietavle:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('familietavle:' + k, v); } catch {} }
};
const MDR = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const MDR_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
// Personfarve: 'c-<navn>' (style.css) – ingen navne i koden her
const PK = new Proxy({}, { get: (_, n) => (typeof n === 'string' && n ? 'c-' + n.toLowerCase() : undefined) });
function isoDato(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function el(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst != null) e.textContent = tekst;
  return e;
}
// Knap. Gemmer handlingen noget (returnerer et løfte), er knappen låst til det er færdigt – så et dobbelttryk ikke gemmer to gange.
function knap(tekst, klasse, fn) {
  const k = el('button', klasse, tekst);
  k.type = 'button';
  let travl = false;
  k.addEventListener('click', async e => {
    if (travl) return;
    const r = fn(e);
    if (!r || typeof r.then !== 'function') return;
    travl = true; k.setAttribute('aria-busy', 'true');
    try { await r; } finally { travl = false; k.removeAttribute('aria-busy'); }
  });
  return k;
}
function input(type, id, vaerdi, placeholder) {
  const i = el('input');
  i.type = type; i.id = id; i.value = vaerdi || ''; i.autocomplete = 'off';
  if (placeholder) i.placeholder = placeholder;
  return i;
}
function felt(labelTekst, node) {
  const boks = el('div');
  const label = el('label', 'felt-label', labelTekst);
  if (node.id) label.htmlFor = node.id;
  boks.append(label, node);
  return boks;
}
function chipValg(muligheder, valgt, onValg, tekstFn = v => v) {
  const seg = el('div', 'seg wrap');
  seg.setAttribute('role', 'radiogroup');
  const tegn = () => seg.replaceChildren(...muligheder.map(m => {
    const k = knap(tekstFn(m), null, () => { valgt = m; onValg(m); tegn(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', m === valgt);
    return k;
  }));
  tegn();
  seg.tegnIgen = tegn;
  return seg;
}
// "Tryk igen"-bekræftelse
function bekraeft(knapEl, handling) {
  const tilbage = () => { knapEl.classList.remove('bekraeft'); knapEl.textContent = knapEl.dataset.tekst; };
  if (knapEl.classList.contains('bekraeft')) { clearTimeout(knapEl._timer); tilbage(); handling(); return; }
  knapEl.dataset.tekst = knapEl.textContent;
  knapEl.classList.add('bekraeft');
  knapEl.textContent = 'Tryk igen for at ' + (knapEl.dataset.handling || 'rydde');
  knapEl._timer = setTimeout(tilbage, 3000);
}
// Kort besked nederst. fejl = rød
let statusTimer;
function visStatus(tekst, fejl = false) {
  const s = document.getElementById('status');
  s.textContent = tekst;
  s.classList.toggle('fejl-status', fejl);
  s.hidden = false;
  clearTimeout(statusTimer);
  s.onclick = () => { s.hidden = true; };
  statusTimer = setTimeout(() => (s.hidden = true), fejl ? 6000 : 3000);
}

// ---------- Ark: panel i højre side på brede skærme, bundpanel på smalle (style.css + budgetside.css) ----------
const arkEl = document.getElementById('ark');
const bsBred = () => window.matchMedia('(min-width: 1100px)').matches;
function aabnArk(titel, ...indhold) {
  document.getElementById('ark-titel').textContent = titel;
  document.getElementById('ark-indhold').replaceChildren(...indhold);
  arkEl.hidden = false;
  document.body.classList.add('ark-aaben');
  const a = arkEl.querySelector('.ark'); if (a) a.scrollTop = 0;
}
function lukArk() {
  arkEl.hidden = true;
  document.body.classList.remove('ark-aaben');
  document.getElementById('ark-indhold').replaceChildren();
}
document.getElementById('ark-luk').addEventListener('click', lukArk);
arkEl.addEventListener('click', e => { if (e.target === arkEl) lukArk(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !arkEl.hidden) lukArk(); });

// ---------- "Hele året": alle 12 måneder side om side (budget – og forbrug fra banken, når et år er valgt) ----------
let bsAar = lokal.get('bside-aar') || '';          // '' = kun budget, ellers 'ÅÅÅÅ' (forbrug det år)
let bsHenter = false;
const bsLukket = new Set(JSON.parse(lokal.get('bside-lukket') || '[]'));   // kategorier, der er foldet sammen
const bsTal = n => (Math.abs(n) < 0.5 ? '' : bKr(n));
function bsHeleAaret(poster, kilde) {
  const faelles = kilde.faelles;
  const bk = faelles ? bBankF : kilde.hvem === bMig() ? bBankMig() : null;
  const fb = bk ? bMdrForbrug(bk) : null;
  // Posteringerne hentes først, når siden bruges (som under Måneder)
  if (bk && !fb && bBankRaekke(bk) && !bsHenter) {
    bsHenter = true;
    bHentBank(bk).then(() => { bsHenter = false; tegnBudget(); }).catch(() => { bsHenter = false; });
  }
  const aarL = fb ? [...fb.keys()].sort().reverse() : [];
  if (bsAar && !aarL.includes(bsAar)) bsAar = bk && bBankRaekke(bk) && !fb ? bsAar : '';
  const fA = fb && bsAar ? fb.get(bsAar) : null;
  const nuM = new Date().getMonth();

  // Rækker: budgettets poster (+ andel af det fælles i et personligt budget) og det, der kun findes i forbruget
  const ind = faelles ? [] : poster.filter(bErInd).sort(bStoerstSort);
  const ud = poster.filter(p => !bErInd(p));
  const grupper = new Map();   // kategori → Map(nøgle → { navn, gruppe, post?, b: [12] })
  const raekke = (navn, gruppe) => {
    const g = gruppe || 'Andet', k = bNoegle({ navn, gruppe: g });
    if (!grupper.has(g)) grupper.set(g, new Map());
    if (!grupper.get(g).has(k)) grupper.get(g).set(k, { navn, gruppe: g, k, b: Array(12).fill(0), post: null });
    return grupper.get(g).get(k);
  };
  for (const p of ud.slice().sort(bStoerstSort)) { const r = raekke(p.navn, p.gruppe); r.post = r.post || p; bMdr(p).forEach((x, i) => { r.b[i] += x; }); }
  if (!faelles) { const r = raekke('Andel af fælles budget', 'Fælles budget'); r.auto = true; r.b = Array(12).fill(bAndel()); }
  if (fA) for (const pm of fA.poster) for (const [, x] of pm) raekke(x.navn, x.gruppe);
  const f = (r, m) => (fA ? fA.poster[m].get(r.k)?.kr ?? 0 : null);   // forbrug for en række i en måned
  const fFindes = m => fA && fA.sum[m] != null;                        // måneden er dækket af bankfilen

  const dele = [];
  // Valg: kun budget, eller forbruget for et år ved siden af
  const top = el('div', 'bs-valg');
  if (aarL.length || (bk && bBankRaekke(bk))) {
    const valg = chipValg(['', ...aarL], fA ? bsAar : '', v => { bsAar = v; lokal.set('bside-aar', v); tegnBudget(); }, v => (v ? 'Forbrug ' + v : 'Kun budget'));
    valg.classList.add('bs-aarvalg');
    top.append(valg);
    if (!fb && bBankRaekke(bk)) top.append(el('span', 'hint', 'Henter posteringerne …'));
  }
  const alleLukket = [...grupper.keys()].every(g => bsLukket.has(g));
  top.append(knap(alleLukket ? '▸ Fold alle ud' : '▾ Fold alle sammen', 'lille-knap', () => {
    if (alleLukket) bsLukket.clear(); else for (const g of grupper.keys()) bsLukket.add(g);
    lokal.set('bside-lukket', JSON.stringify([...bsLukket])); tegnBudget();
  }));
  if (faelles) top.append(knap('+ Ny post', 'lille-knap', () => redigerPost(null, '')));
  else top.append(knap('+ Indtægt', 'lille-knap', () => redigerPost(null, '', kilde, 'ind')), knap('+ Udgift', 'lille-knap', () => redigerPost(null, '', kilde, 'ud')));
  if (bk && bBankRaekke(bk)) top.append(knap('📊 Hent som Excel-ark', 'lille-knap', () => bEksport(bk)));
  dele.push(top);

  const tab = el('table', 'bs-tab' + (fA ? ' med-forbrug' : ''));
  const thead = el('thead'), hr = el('tr');
  hr.append(el('th', 'bs-navn', fA ? 'Budget / forbrug ' + bsAar : 'Budget'));
  MDR.forEach((m, i) => hr.append(el('th', i === nuM ? 'nu' : null, m.replace('.', ''))));
  hr.append(el('th', 'bs-sum', 'I alt'), el('th', 'bs-sum', 'Pr. md.'));
  thead.append(hr);
  const tb = el('tbody');
  // En celle: budget (og forbrug nedenunder). over/under farves som under År.
  const celle = (b, fv, klasse, tryk) => {
    const td = el('td', klasse || null);
    if (!fA) { td.textContent = bsTal(b); return td; }
    td.append(el('span', 'bs-b', bsTal(b) || ' '));
    if (fv === undefined) return td;               // rækken har ikke forbrug (fx indtægter og opsparing)
    const tom = fv == null;
    const over = !tom && fv > b + Math.max(50, b * 0.05), under = !tom && fv < b - Math.max(50, b * 0.05) && b >= 0.5;
    const t = tom ? '–' : bsTal(fv) || (b >= 0.5 ? '0' : '');
    const s = tryk && !tom && Math.abs(fv) >= 0.5 ? knap(t, 'bs-f', tryk) : el('span', 'bs-f', t);
    if (over) s.classList.add('op'); else if (under) s.classList.add('ned');
    td.append(s);
    return td;
  };
  const linje = (tr, b, fv, tryk) => {
    for (let m = 0; m < 12; m++) tr.append(celle(b[m], fv ? (fFindes(m) ? fv[m] : null) : undefined, m === nuM ? 'nu' : null, tryk));
    const bS = b.reduce((s, x) => s + x, 0);
    if (!fv) { tr.append(celle(bS, undefined, 'bs-sum'), celle(bS / 12, undefined, 'bs-sum')); return; }
    const med = [...Array(12).keys()].filter(fFindes);
    const fS = med.reduce((s, m) => s + fv[m], 0), bMed = med.reduce((s, m) => s + b[m], 0);
    // I alt og pr. md. sammenlignes kun for de måneder, banken dækker
    const tdS = celle(bS, med.length ? fS : null, 'bs-sum', tryk), tdM = celle(bS / 12, med.length ? fS / med.length : null, 'bs-sum');
    if (med.length && med.length < 12) {
      const over = fS > bMed + Math.max(50, bMed * 0.05), under = fS < bMed - Math.max(50, bMed * 0.05);
      for (const td of [tdS, tdM]) { const s = td.querySelector('.bs-f'); s.classList.remove('op', 'ned'); if (over) s.classList.add('op'); else if (under) s.classList.add('ned'); }
      tdS.title = 'Forbrug i ' + med.length + ' måneder: ' + bKr(fS) + ' kr · budget for de samme måneder: ' + bKr(bMed) + ' kr';
    }
    tr.append(tdS, tdM);
  };
  const sumB = rk => Array.from({ length: 12 }, (_, m) => rk.reduce((s, r) => s + r.b[m], 0));
  const sumF = rk => Array.from({ length: 12 }, (_, m) => rk.reduce((s, r) => s + f(r, m), 0));
  const overskrift = (tekst, klasse) => { const tr = el('tr', klasse); tr.append(el('th', 'bs-navn', tekst)); return tr; };

  // Indtægter (kun personligt budget)
  let indB = null;
  if (ind.length) {
    indB = Array.from({ length: 12 }, (_, m) => ind.reduce((s, p) => s + bMdr(p)[m], 0));
    const tr = overskrift('💰 Indtægter', 'bs-gruppe bs-ind'); linje(tr, indB, null); tb.append(tr);
    for (const p of ind) {
      const pr = el('tr', 'bs-post'), th = el('th', 'bs-navn');
      th.append(knap(p.navn || 'Uden navn', 'bs-pknap', () => redigerPost(p, '', kilde)));
      pr.append(th); linje(pr, bMdr(p), null); tb.append(pr);
    }
  }
  // I alt – med forbrug sammenlignes uden opsparing (i banken er opsparing en saldo, der stiger – ikke en udgift)
  const alle = [...grupper.values()].flatMap(m => [...m.values()]);
  const medI = fA ? alle.filter(r => r.gruppe !== 'Opsparing') : alle;
  const iAlt = overskrift(fA ? 'Udgifter i alt (uden opsparing)' : ind.length ? 'Udgifter i alt' : 'I alt', 'bs-ialt');
  linje(iAlt, sumB(medI), fA ? sumF(medI) : null);
  tb.append(iAlt);
  if (indB) {
    const ub = sumB(alle), tr = overskrift('Tilbage', 'bs-ialt bs-rest');
    const rest = indB.map((x, m) => x - ub[m]);
    for (let m = 0; m < 12; m++) { const td = el('td', (m === nuM ? 'nu ' : '') + (rest[m] < -0.5 ? 'minus' : ''), bKr(rest[m])); tr.append(td); }
    const rs = rest.reduce((s, x) => s + x, 0);
    tr.append(el('td', 'bs-sum' + (rs < -0.5 ? ' minus' : ''), bKr(rs)), el('td', 'bs-sum' + (rs < -0.5 ? ' minus' : ''), bKr(rs / 12)));
    tb.append(tr);
  }
  const gOrden = [...grupper.keys()].sort(bGruppeSort);
  for (const g of gOrden) {
    const rk = [...grupper.get(g).values()];
    const medF = fA && g !== 'Opsparing';
    if (budgetSort === 'stoerst') rk.sort((a, b) => b.b.reduce((s, x) => s + x, 0) - a.b.reduce((s, x) => s + x, 0));
    const aaben = !bsLukket.has(g);
    const tr = el('tr', 'bs-gruppe'), th = el('th', 'bs-navn');
    const gk = knap((aaben ? '▾ ' : '▸ ') + bIkon(g) + ' ' + g, 'bs-gknap', () => {
      aaben ? bsLukket.add(g) : bsLukket.delete(g); lokal.set('bside-lukket', JSON.stringify([...bsLukket])); tegnBudget();
    });
    gk.setAttribute('aria-expanded', aaben);
    th.append(gk); tr.append(th);
    linje(tr, sumB(rk), medF ? sumF(rk) : null);
    tb.append(tr);
    if (!aaben) continue;
    for (const r of rk) {
      const pr = el('tr', 'bs-post'), th2 = el('th', 'bs-navn');
      if (r.post) { const pk = knap(r.navn || 'Uden navn', 'bs-pknap', () => redigerPost(r.post, '', kilde)); pk.title = 'Ret posten'; th2.append(pk); }
      else if (r.auto) { th2.append(el('span', 'bs-auto', r.navn)); th2.title = 'Regnes automatisk ud fra det fælles budget'; }
      else { th2.append(el('span', 'bs-auto', r.navn)); th2.title = 'Står ikke i budgettet – kun i forbruget'; }
      pr.append(th2);
      linje(pr, r.b, medF ? Array.from({ length: 12 }, (_, m) => f(r, m)) : null, medF ? () => bPosteringer(r.navn, r.gruppe, bsAar, bk) : null);
      tb.append(pr);
    }
  }
  tab.append(thead, tb);
  const rul = el('div', 'bs-rul'); rul.append(tab);
  const kort = el('div', 'kort bs-kort'); kort.append(rul);
  dele.push(kort);
  dele.push(el('p', 'hint', fA
    ? 'Øverst i hver celle står budgettet (gråt), nederst forbruget ifølge banken i ' + bsAar + ': rødt = over budget, grønt = under. Tryk på et forbrugstal for at se posteringerne – og på et navn for at rette posten. "–" = måneden er ikke med i bankfilen.'
    : 'Kr. pr. måned. Tryk på et navn for at rette posten.' + (bk && bBankRaekke(bk) ? ' Vælg et år øverst for at se forbruget ved siden af.' : '')));
  return dele;
}

// ---------- Login og start ----------
function bsVisLogin(besked) {
  document.body.dataset.tilstand = 'login';
  document.getElementById('login').hidden = false;
  const navn = document.getElementById('login-navn');
  if (!navn.value) navn.value = lokal.get('sidste-navn') || '';
  const fejl = document.getElementById('login-fejl');
  fejl.textContent = besked || ''; fejl.hidden = !besked;
  (navn.value ? document.getElementById('login-kode') : navn).focus();
}
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fejl = document.getElementById('login-fejl'), navn = document.getElementById('login-navn'), kode = document.getElementById('login-kode');
  fejl.hidden = true;
  if (!navn.value.trim()) { navn.focus(); return; }
  if (!kode.value) { kode.focus(); return; }
  const k = e.target.querySelector('.knap');
  k.disabled = true; k.textContent = 'Logger ind…';
  try {
    await Data.login(navn.value, kode.value);
    lokal.set('sidste-navn', navn.value.trim());
    kode.value = '';
    document.getElementById('login').hidden = true;
    bsKlar();
  } catch (err) {
    console.error(err);
    fejl.textContent = err.message === 'mangler-profil' ? 'Din bruger mangler en profil i databasen.' : navigator.onLine ? 'Forkert navn eller kode. Prøv igen.' : 'Ingen forbindelse til internettet.';
    fejl.hidden = false;
  } finally { k.disabled = false; k.textContent = 'Log ind'; }
});
function bsVisNet() {
  const e = document.getElementById('uden-net');
  if (e) e.hidden = !(Data.bruger() && (Data.udenNet() || !navigator.onLine));
}
function bsKlar() {
  const p = Data.bruger();
  const kunVoksne = document.getElementById('bs-kun-voksne');
  // Kun de voksne (databasen giver alligevel aldrig børn rækkerne) – og ikke familietabletten i køkkenet
  if (!p || p.rolle !== 'voksen' || p.navn === 'Tavlen') {
    document.body.dataset.tilstand = 'nej';
    kunVoksne.hidden = false;
    return;
  }
  document.body.dataset.tilstand = 'klar';
  const bruger = document.getElementById('bs-bruger');
  bruger.textContent = 'Log ' + p.navn + ' ud';
  bruger.dataset.handling = 'logge ud';
  bruger.hidden = false;
  // Første gang på en bred skærm: start med hele året
  if (!lokal.get('budget-vis') && bsBred()) budgetVis = 'heleaaret';
  tegnBudget();
  Data.onChange(tegnBudget);
  bsVisNet(); Data.onChange(bsVisNet);
  window.addEventListener('online', bsVisNet); window.addEventListener('offline', bsVisNet);
}
document.getElementById('bs-bruger').addEventListener('click', e => bekraeft(e.currentTarget, () => Data.logud()));
async function bsStart() {
  // "Hele året" som ekstra visning i budget.js
  B_EKSTRA_VIS.heleaaret = { tekst: 'Hele året', vis: bsHeleAaret };
  try {
    const profil = await Data.start();
    if (profil) bsKlar(); else bsVisLogin();
  } catch (err) {
    console.error(err);
    bsVisLogin(err.message === 'mangler-profil' ? 'Din bruger mangler en profil i databasen.' : 'Kunne ikke forbinde. Tjek internettet og prøv igen.');
  }
}
// En ændring, der ikke blev gemt (fx uden net), skal ikke forsvinde i stilhed – samme beskeder som i appen
window.addEventListener('unhandledrejection', e => {
  const net = !navigator.onLine || Data.udenNet() || Data.erNetfejl?.(e.reason);
  (net ? console.warn : console.error)(e.reason);
  if (net) visStatus('Uden net – det blev ikke gemt. Prøv igen, når nettet er tilbage.');
  else visStatus('Noget gik galt – ændringen blev måske ikke gemt.', true);
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bsStart); else bsStart();
