// app.js – al logik for familietavlen. Data går altid gennem Data (data.js).

const lokal = {
  get(k) { try { return localStorage.getItem('familietavle:' + k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('familietavle:' + k, v); } catch {} }
};

const BOERN = ['Oliver', 'Villads'];
const DAGE = ['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'];
const DAGE_LANG = ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const PRIO = { 1: 'Haster', 2: 'Snart', 3: 'Engang' };
const TOM_TEKST = { indkob: 'Ingen varer på listen', todo: 'Ingen opgaver – godt gået' };
const IKON_TJEK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const IKON_MERE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>';
const IKON_TERNING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.2" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
const IKON_SLET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';

function el(tag, klasse, tekst) {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (tekst != null) e.textContent = tekst;
  return e;
}

// ---------- Datoer ----------
const idagNr = () => (new Date().getDay() + 6) % 7;   // mandag = 0
function mandagDenneUge() {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - idagNr());
  return d;
}
function ugenummer(dato) {
  const d = new Date(Date.UTC(dato.getFullYear(), dato.getMonth(), dato.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const aarStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - aarStart) / 86400000 + 1) / 7);
}
// "8.00-8.45" -> [480, 525] minutter
function tidSomMin(tid) {
  const dele = (tid || '').split(/[-–]/).map(s => s.trim().replace(':', '.'));
  const tilMin = s => { if (!s) return null; const [t, m] = s.split('.').map(Number); return isNaN(t) ? null : t * 60 + (m || 0); };   // tom tid = ukendt (ikke kl. 0)
  return [tilMin(dele[0] || ''), tilMin(dele[1] || '')];
}
const slutTid = tid => ((tid || '').split(/[-–]/)[1] || '').trim();
// Mødetid og fri-tid for en skoledag (alle = dagensTimer). Har skolen kun givet en mødetid og en hjemtid
// (ingen tider på de enkelte timer), er den sidste tid efter mødetiden hjemtiden.
function skoleTider(alle) {
  const medFag = alle.filter(t => t.fag);
  if (!medFag.length) return { start: '', slut: '', harTimer: false };
  const start = (medFag[0].tid.split(/[-–]/)[0] || '').trim();
  let slut = slutTid(medFag[medFag.length - 1].tid);
  const harTimer = alle.some(t => slutTid(t.tid));
  if (!slut && !harTimer) {
    const efter = alle.slice(alle.indexOf(medFag[0]) + 1).map(t => (t.tid || '').trim()).filter(Boolean);
    if (efter.length) slut = efter[efter.length - 1].split(/[-–]/)[0].trim();
  }
  return { start, slut, harTimer };
}
// Klokkeslæt vises altid med punktum, som resten af appen: 08.00–08.45
const visTider = s => (s || '').replace(/:/g, '.').replace(/\s*[-–]\s*/, '–');
// Ugens dage som tekst: "5.–11. okt." eller "28. sep.–4. okt." (bruges alle steder, hvor en uge vises)
function ugeSpan(man) {
  const son = new Date(man); son.setDate(man.getDate() + 6);
  return man.getDate() + (man.getMonth() !== son.getMonth() ? '. ' + MDR[man.getMonth()] : '.') + '–' + son.getDate() + '. ' + MDR[son.getMonth()];
}
// "6. okt." – kort dato i tekst
const kortDag = iso => { const d = new Date(iso + 'T00:00'); return d.getDate() + '. ' + MDR[d.getMonth()]; };

// ---------- Faner ----------
const FANER = ['idag', 'kalender', 'madplan', 'indkob', 'todo', 'mere', 'skema', 'rutiner', 'pligter', 'pakkelister', 'konkurrence', 'vejr', 'hjaelp', 'familie'];
const UNDER_MERE = ['skema', 'rutiner', 'pligter', 'pakkelister', 'konkurrence', 'vejr', 'hjaelp', 'familie'];   // sider man når via "Mere"
const FANE_NAVN = { idag: 'I dag', kalender: 'Kalender', madplan: 'Madplan', indkob: 'Indkøb', todo: 'To do', mere: 'Mere' };
// Børn ser kun de faner, de voksne har slået til for dem (personvalg.faner). Tavlen ("I dag") er der altid.
const BOERNE_FANER = ['kalender', 'madplan', 'mere'];   // standard for børn
const VALGBARE_FANER = { kalender: 'Kalender', madplan: 'Madplan', indkob: 'Indkøb', todo: 'To do', mere: 'Mere' };
let tilladteFaner = null;   // null = alle (voksne)
async function anvendFaner() {
  const p = Data.bruger();
  if (!p || p.rolle !== 'barn') { tilladteFaner = null; }
  else {
    const valg = await valgFor(p.navn);   // fra dage.js
    tilladteFaner = ['idag', ...(Array.isArray(valg.faner) ? valg.faner : BOERNE_FANER)];
  }
  const knapper = [...document.querySelectorAll('.bundmenu [data-fane]')];
  knapper.forEach(b => { b.hidden = !!tilladteFaner && !tilladteFaner.includes(b.dataset.fane); });
  document.querySelector('.bundmenu-indre').style.gridTemplateColumns = 'repeat(' + knapper.filter(b => !b.hidden).length + ', 1fr)';
  const aaben = document.querySelector('.fane:not([hidden])')?.id;
  if (aaben && tilladteFaner && !tilladteFaner.includes(UNDER_MERE.includes(aaben) ? 'mere' : aaben)) visFane('idag');
}
// Tilbage-knappen på undersiderne går derhen, man kom fra (fx "‹ I dag", når man trykkede på vejret på tavlen)
let aktivFane = null, tilbageTil = null;
function visFane(navn) {
  if (typeof lukZoom === 'function') lukZoom();
  if (!FANER.includes(navn)) navn = 'idag';
  if (navn !== 'hjaelp' && tilladteFaner && !tilladteFaner.includes(UNDER_MERE.includes(navn) ? 'mere' : navn)) navn = 'idag';
  const fra = aktivFane;
  if (!UNDER_MERE.includes(navn)) tilbageTil = null;
  else if (fra && fra !== navn && !UNDER_MERE.includes(fra)) tilbageTil = fra === 'mere' ? null : fra;
  aktivFane = navn;
  document.querySelectorAll('.fane').forEach(s => (s.hidden = s.id !== navn));
  const iMenu = UNDER_MERE.includes(navn) ? 'mere' : navn;
  document.querySelectorAll('[data-fane]').forEach(b => b.setAttribute('aria-selected', b.dataset.fane === iMenu));
  lokal.set('fane', navn);
  opdaterTilbage();
  if (navn === 'vejr' && typeof tegnVejr === 'function') tegnVejr();   // fra vejr.js
  if (navn === 'familie' && typeof tegnFamilie === 'function') tegnFamilie();   // fra familie.js (træet skal måles, når siden er synlig)
}
function opdaterTilbage() {
  const pakAaben = aktivFane === 'pakkelister' && typeof pakValgt !== 'undefined' && pakValgt;
  document.querySelectorAll('.tilbage').forEach(b => {
    b.textContent = b.closest('.fane')?.id === 'pakkelister' && pakAaben ? '‹ Alle pakkelister' : '‹ ' + (tilbageTil ? FANE_NAVN[tilbageTil] : 'Mere');
  });
}
document.querySelectorAll('[data-fane]').forEach(b => b.addEventListener('click', () => { visFane(b.dataset.fane); window.scrollTo(0, 0); }));
document.querySelectorAll('[data-gaa]').forEach(b => b.addEventListener('click', () => {
  if (b.classList.contains('tilbage')) {
    // I en åben pakkeliste går "tilbage" til oversigten over pakkelister
    if (aktivFane === 'pakkelister' && typeof pakValgt !== 'undefined' && pakValgt) {
      pakValgt = ''; lokal.set('pak-valgt', ''); tegnPakkelister(); opdaterTilbage();
    } else visFane(tilbageTil || 'mere');
  } else visFane(b.dataset.gaa);
  window.scrollTo(0, 0);
}));

// ---------- "Tryk igen"-bekræftelse ----------
function bekraeft(knap, handling) {
  if (knap.classList.contains('bekraeft')) {
    clearTimeout(knap._timer);
    knap.classList.remove('bekraeft');
    knap.textContent = knap.dataset.tekst;
    handling();
    return;
  }
  knap.classList.add('bekraeft');
  knap.textContent = 'Tryk igen for at ' + (knap.dataset.handling || 'rydde');
  knap._timer = setTimeout(() => { knap.classList.remove('bekraeft'); knap.textContent = knap.dataset.tekst; }, 3000);
}

// ---------- Ark (bundpanel) ----------
const arkEl = document.getElementById('ark');
function aabnArk(titel, ...indhold) {
  if (typeof fortrydEl !== 'undefined' && fortrydEl) fortrydEl.hidden = true;
  document.getElementById('ark-titel').textContent = titel;
  document.getElementById('ark-indhold').replaceChildren(...indhold);
  arkEl.hidden = false;
  document.body.style.overflow = 'hidden';
}
function lukArk() {
  arkEl.hidden = true;
  document.body.style.overflow = '';
  document.getElementById('ark-indhold').replaceChildren();
}
document.getElementById('ark-luk').addEventListener('click', lukArk);
arkEl.addEventListener('click', e => { if (e.target === arkEl) lukArk(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !arkEl.hidden) lukArk(); });

function felt(labelTekst, node) {
  const boks = el('div');
  const label = el('label', 'felt-label', labelTekst);
  if (node.id) label.htmlFor = node.id;
  boks.append(label, node);
  return boks;
}
function input(type, id, vaerdi, placeholder) {
  const i = el('input');
  i.type = type; i.id = id; i.value = vaerdi || ''; i.autocomplete = 'off';
  if (placeholder) i.placeholder = placeholder;
  return i;
}
function knap(tekst, klasse, fn) {
  const k = el('button', klasse, tekst);
  k.type = 'button';
  k.addEventListener('click', fn);
  return k;
}
// Valg mellem chips (fx hvem eller butik)
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

// Billeder gøres små, før de gemmes
function laesBillede(fil) {
  return new Promise((ok, fejl) => {
    const url = URL.createObjectURL(fil);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = fejl;
    img.src = url;
  });
}

// ---------- Indkøb: butikker ----------
let butikFilter = '';
function tegnButikFilter(punkter) {
  const boks = document.getElementById('butik-filter');
  const butikker = [...new Set(punkter.filter(p => !p.klaret && p.butik).map(p => p.butik))].sort((a, b) => a.localeCompare(b, 'da'));
  if (butikFilter && !butikker.includes(butikFilter)) butikFilter = '';
  boks.hidden = !butikker.length;
  boks.replaceChildren(...['', ...butikker].map(b => {
    const k = knap(b || 'Alle butikker', null, () => { butikFilter = b; tegnListe('indkob'); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', b === butikFilter);
    return k;
  }));
}

async function saetFavFelter(type, tekst, felter) {
  const f = (await Data.list('favoritter')).find(x => x.type === type && x.tekst.toLowerCase() === tekst.toLowerCase());
  if (f) await Data.update('favoritter', f.id, felter);
}

// To do: frist som tekst – "I dag", "I morgen", "Fre 9/10" eller "Over tid · 5/10"
function fristTekst(iso, klaret) {
  const idag = isoDato(new Date());
  const d = new Date(iso + 'T00:00');
  const dm = d.getDate() + '/' + (d.getMonth() + 1);
  if (!klaret && iso < idag) return { tekst: 'Over tid · ' + dm, klasse: 'over-tid' };
  if (iso === idag) return { tekst: 'I dag', klasse: 'frist-tag snart' };
  if (iso === plusDage(idag, 1)) return { tekst: 'I morgen', klasse: 'frist-tag' };
  return { tekst: DAGE[(d.getDay() + 6) % 7] + ' ' + dm, klasse: 'frist-tag' };
}
// Ret en to do: tekst, hvem, hvornår og prioritet
function redigerTodo(p) {
  const tekst = input('text', 'todo-tekst', p.tekst);
  let hvem = p.hvem || '';
  const hvemValg = chipValg(['', ...PERSONER.filter(x => x !== 'Fælles')], hvem, v => { hvem = v; }, v => v || 'Ingen bestemt');
  const frist = input('date', 'todo-frist', p.frist || '');
  const fristRaekke = el('div', 'frist-raekke');
  fristRaekke.append(frist, knap('I dag', 'lille-knap', () => { frist.value = isoDato(new Date()); }),
    knap('Ingen', 'lille-knap', () => { frist.value = ''; }));
  let prio = p.prio || 2;
  const prioValg = chipValg([1, 2, 3], prio, v => { prio = v; }, v => PRIO[v]);
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    await Data.update('todo', p.id, { tekst: t, hvem, frist: frist.value || null, prio });
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('todo', p.id); lukArk(); tegnAlt(); }), gem);
  aabnArk('Ret opgave', felt('Opgave', tekst), felt('Hvem skal gøre det?', hvemValg), felt('Hvornår (valgfri)', fristRaekke),
    felt('Prioritet', prioValg), el('p', 'hint', 'Opgaver med en dato står også i "Kalender i dag" på familiens overblik den dag.'), knapper);
}

async function redigerVare(p) {
  const navn = input('text', 'vare-navn', p.tekst);
  const butikker = (await Data.list('favoritter')).filter(f => f.type === 'butik')
    .sort((a, b) => (b.brugt || 0) - (a.brugt || 0) || a.tekst.localeCompare(b.tekst, 'da')).map(f => f.tekst);
  if (p.butik && !butikker.includes(p.butik)) butikker.push(p.butik);
  let butik = p.butik || '';
  const muligheder = ['', ...butikker];
  const lavButikValg = () => chipValg(muligheder, butik, b => { butik = b; gemSnart(); }, b => b || 'Ingen');
  let butikValg = lavButikValg();

  // Ny butik: skriv navnet, så bliver den tilføjet og valgt
  const nyButik = input('text', 'ny-butik', '', 'Anden butik – skriv navnet');
  nyButik.enterKeyHint = 'done';
  const tilfoejButik = () => {
    const v = nyButik.value.trim();
    if (!v) return;
    if (!muligheder.includes(v)) muligheder.push(v);
    butik = v;
    nyButik.value = '';
    const ny = lavButikValg();
    butikValg.replaceWith(ny);
    butikValg = ny;
    gemSnart();
  };
  nyButik.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tilfoejButik(); } });
  nyButik.addEventListener('change', tilfoejButik);

  const tilbudLabel = el('label', 'check');
  const tilbud = el('input'); tilbud.type = 'checkbox'; tilbud.id = 'vare-tilbud'; tilbud.checked = !!p.tilbud;
  tilbudLabel.append(tilbud, 'På tilbud');
  tilbud.addEventListener('change', () => gemSnart());

  const note = input('text', 'vare-note', p.note, 'Fx 2 for 30 kr. eller "den med blåt låg"');
  note.addEventListener('input', () => gemSnart(800));
  navn.addEventListener('input', () => gemSnart(800));

  let billede = p.billede || '';
  const gemtTekst = el('p', 'gemt-tekst');
  gemtTekst.setAttribute('role', 'status');
  const billedBoks = el('div', 'billede-boks');
  const tegnBillede = () => {
    billedBoks.replaceChildren();
    if (billede) {
      const img = el('img'); img.src = billede; img.alt = 'Billede af ' + p.tekst;
      billedBoks.append(img, knap('Fjern billede', 'lille-knap', () => { billede = ''; tegnBillede(); gemSnart(); }));
    }
    const fil = el('label', 'lille-knap fil-knap', billede ? 'Skift billede' : 'Tag eller vælg billede');
    const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*';
    filInput.addEventListener('change', async () => {
      if (!filInput.files[0]) return;
      gemtTekst.textContent = 'Henter billede…';
      try { billede = await laesBillede(filInput.files[0]); gemSnart(0); } catch { fejl.textContent = 'Billedet kunne ikke læses. Prøv et andet.'; fejl.hidden = false; }
      tegnBillede();
    });
    fil.append(filInput);
    billedBoks.append(fil);
  };
  tegnBillede();

  const fejl = el('p', 'fejl'); fejl.hidden = true;

  // Alt gemmes automatisk, så snart noget ændres
  let gemTimer, sidsteButik = p.butik || '';
  async function gemNu() {
    const tekst = navn.value.trim();
    if (!tekst) return;
    try {
      await Data.update('indkob', p.id, { tekst, butik, tilbud: tilbud.checked, note: note.value.trim(), billede });
      fejl.hidden = true;
      gemtTekst.textContent = 'Gemt';
      if (butik && butik !== sidsteButik) await gemFavorit('butik', butik);
      sidsteButik = butik;
      await saetFavFelter('indkob', tekst, { butik });
      tegnAlt();
    } catch {
      gemtTekst.textContent = '';
      fejl.textContent = 'Kunne ikke gemme. Tjek forbindelsen og prøv igen.';
      fejl.hidden = false;
    }
  }
  function gemSnart(ms = 250) {
    gemtTekst.textContent = 'Gemmer…';
    clearTimeout(gemTimer);
    gemTimer = setTimeout(gemNu, ms);
  }

  const slet = knap('Slet', 'knap fare', async () => { clearTimeout(gemTimer); await Data.remove('indkob', p.id); lukArk(); tegnAlt(); });
  const faerdig = knap('Færdig', 'knap', () => lukArk());
  const knapper = el('div', 'ark-knapper'); knapper.append(slet, faerdig);

  aabnArk('Vare', felt('Vare', navn), felt('Butik', butikValg), nyButik, tilbudLabel,
    felt('Note', note), felt('Billede', billedBoks), fejl, gemtTekst, knapper);
}

// ---------- Indkøb og to do ----------
async function tegnListe(navn) {
  const ul = document.querySelector(`ul[data-liste="${navn}"]`);
  const punkter = await Data.list(navn);
  punkter.sort((a, b) => Number(a.klaret) - Number(b.klaret) || (a.prio || 0) - (b.prio || 0)
    || (a.frist || '9999').localeCompare(b.frist || '9999')
    || (a.butik || 'ø').localeCompare(b.butik || 'ø', 'da'));
  ul.replaceChildren();

  // Butiksfilter (kun indkøb): varer uden butik vises altid
  let viste = punkter;
  if (navn === 'indkob') {
    tegnButikFilter(punkter);
    if (butikFilter) viste = punkter.filter(p => !p.butik || p.butik === butikFilter);
  }

  if (!viste.length) ul.append(el('li', 'tom', TOM_TEKST[navn]));

  for (const p of viste) {
    const li = el('li', 'punkt' + (p.klaret ? ' faerdig' : '') + (p.prio ? ' p' + p.prio : ''));

    const knap = el('button', 'punkt-knap');
    knap.type = 'button';
    knap.setAttribute('aria-pressed', !!p.klaret);
    const tjek = el('span', 'tjek');
    tjek.innerHTML = IKON_TJEK;
    const tekstBoks = el('span', 'tekst-boks');
    tekstBoks.append(el('span', 'tekst', p.tekst));
    if (p.butik || p.tilbud || p.note || p.af || p.hvem || p.frist) {
      const tags = el('span', 'tags');
      if (p.hvem) tags.append(el('span', 'hvem-tag ' + (PK[p.hvem] || ''), p.hvem));
      if (p.frist) { const f = fristTekst(p.frist, p.klaret); tags.append(el('span', f.klasse, f.tekst)); }
      if (p.af) tags.append(el('span', 'hvem-tag ' + (PK[p.af] || ''), 'Ønsket af ' + p.af));
      if (p.tilbud) tags.append(el('span', 'tilbud-tag', 'Tilbud'));
      if (p.butik) tags.append(el('span', null, p.butik));
      if (p.note) tags.append(el('span', 'note-tag', p.note));
      tekstBoks.append(tags);
    }
    knap.append(tjek, tekstBoks);
    knap.addEventListener('click', async () => { await Data.update(navn, p.id, { klaret: !p.klaret }); tegnAlt(); });
    li.append(knap);

    if (p.billede) {
      const thumb = el('button', 'thumb');
      thumb.type = 'button';
      thumb.setAttribute('aria-label', 'Vis billede af ' + p.tekst);
      const img = el('img'); img.src = p.billede; img.alt = '';
      thumb.append(img);
      thumb.addEventListener('click', () => {
        const stort = el('img', 'stort-billede'); stort.src = p.billede; stort.alt = p.tekst;
        aabnArk(p.tekst, stort);
      });
      li.append(thumb);
    }

    {
      const mere = el('button', 'mere-knap');
      mere.type = 'button';
      mere.innerHTML = IKON_MERE;
      mere.setAttribute('aria-label', (navn === 'indkob' ? 'Butik, tilbud og billede for ' : 'Ret, hvem og hvornår for ') + p.tekst);
      mere.addEventListener('click', () => (navn === 'indkob' ? redigerVare(p) : redigerTodo(p)));
      li.append(mere);
    }

    if (p.prio) {
      const prio = el('button', 'prio-knap');
      prio.type = 'button';
      prio.setAttribute('aria-label', 'Prioritet: ' + PRIO[p.prio] + '. Tryk for at skifte');
      prio.append(el('span', 'prik'), PRIO[p.prio]);
      prio.addEventListener('click', async () => { await Data.update(navn, p.id, { prio: (p.prio % 3) + 1 }); tegnAlt(); });
      li.append(prio);
    }

    const slet = el('button', 'slet');
    slet.type = 'button';
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + p.tekst);
    slet.addEventListener('click', async () => { await Data.remove(navn, p.id); tegnAlt(); });
    li.append(slet);
    ul.append(li);
  }

  const aabne = punkter.filter(p => !p.klaret);
  const badge = document.querySelector(`[data-badge="${navn}"]`);
  badge.textContent = aabne.length;
  badge.hidden = aabne.length === 0;
  badge.classList.toggle('haster', aabne.some(p => p.prio === 1));
  document.querySelector(`[data-taeller="${navn}"]`).textContent = aabne.length ? aabne.length + (navn === 'indkob' ? ' mangler' : ' åbne') : '';
  document.querySelector(`.ryd[data-liste="${navn}"]`).hidden = !punkter.some(p => p.klaret);
}

// Prioritet til nye opgaver
let nyPrio = 2;
function tegnNyPrio() {
  document.querySelectorAll('#ny-prio [data-prio]').forEach(b => b.setAttribute('aria-checked', Number(b.dataset.prio) === nyPrio));
}
document.querySelectorAll('#ny-prio [data-prio]').forEach(b => b.addEventListener('click', () => { nyPrio = Number(b.dataset.prio); tegnNyPrio(); }));

document.querySelectorAll('form.tilfoj[data-liste]').forEach(form => {
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const felt = form.querySelector('input');
    const tekst = felt.value.trim();
    if (!tekst) return;
    const felter = { tekst, klaret: false };
    if (form.dataset.liste === 'todo') felter.prio = nyPrio;
    const nyt = await tilfoejUdenDublet(form.dataset.liste, felter);
    if (nyt) await gemFavorit(form.dataset.liste, tekst);
    felt.value = '';
    felt.focus();
    tegnAlt();
  });
  // Mens man skriver, viser hurtigvalget kun det der passer
  form.querySelector('input').addEventListener('input', () => tegnForslag(form.dataset.liste));
});

// Står det allerede på listen, tilføjes det ikke igen. Er det krydset af, kommer det bare tilbage på listen.
async function tilfoejUdenDublet(liste, felter) {
  const findes = (await Data.list(liste)).find(p => p.tekst.trim().toLowerCase() === felter.tekst.trim().toLowerCase());
  if (findes && !findes.klaret) { visStatus(findes.tekst + ' står allerede på listen'); return false; }
  if (erBarn()) { await Data.add(liste, { ...felter, af: Data.bruger().navn }); return true; }   // børn: hvem ønskede det
  if (findes) { await Data.update(liste, findes.id, { klaret: false, ...(felter.prio ? { prio: felter.prio } : {}) }); return true; }
  await Data.add(liste, felter);
  return true;
}

// ---------- Hurtigvalg: alt der er skrevet før, kan vælges igen ----------
// Data: 'favoritter' {type: 'indkob' | 'todo' | 'ret', tekst, brugt}
const FavTilstand = {
  indkob: { alle: false, ret: false }, todo: { alle: false, ret: false },
  ret: { alle: true, ret: false }, morgen: { alle: true, ret: false }, frokost: { alle: true, ret: false }
};
// Måltidslister: samme navn bruges som type i 'favoritter' og som felt i 'madplan'
const MAALTIDER = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
const DATALISTE = { ret: 'retter-forslag', morgen: 'morgen-forslag', frokost: 'frokost-forslag' };
let listeType = 'ret';   // hvilken måltidsliste der vises under "Vores lister"

function tegnListeValg() {
  const seg = document.getElementById('liste-valg');
  seg.replaceChildren(...Object.entries(MAALTIDER).map(([type, navn]) => {
    const k = knap(navn, null, () => {
      listeType = type;
      FavTilstand[type].ret = false;
      document.getElementById('ny-ret').placeholder = 'Tilføj til ' + navn.toLowerCase();
      tegnListeValg();
      tegnForslag(type);
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', type === listeType);
    return k;
  }));
}
const VIS_FAERRE = 10;

// Hvem kan lide hvad: favoritter får {kanLide: [navne]}.
// "Alle" = dem der har markeret mindst én ret på listen – så tæller man ikke med, før man er gået i gang.
const Lide = { person: null, kunAlle: false };
const kanLide = f => Array.isArray(f.kanLide) ? f.kanLide : [];
function lideAktive(favs) {
  const s = new Set();
  favs.forEach(f => kanLide(f).forEach(n => s.add(n)));
  return PERSONER.filter(p => s.has(p));
}
function alleKanLide(favs) {
  const aktive = lideAktive(favs);
  if (!aktive.length) return [];
  return favs.filter(f => aktive.every(n => kanLide(f).includes(n)));
}
function tegnLideValg() {
  const boks = document.getElementById('lide-valg');
  const mig = Data.bruger()?.navn;
  const voksen = Data.bruger()?.rolle === 'voksen';
  const folk = voksen ? ['Oliver', 'Villads', 'Timmo', 'Winnie'].filter(p => PERSONER.includes(p)) : [mig];
  if (Lide.person && !folk.includes(Lide.person)) Lide.person = null;
  const seg = el('div', 'seg wrap');
  seg.setAttribute('role', 'radiogroup');
  for (const p of folk) {
    const k = knap(p, PK[p] || null, () => {
      FavTilstand[listeType].ret = false;   // vælger man en person, er man ikke længere i "fjern"-tilstand
      Lide.person = Lide.person === p ? null : p;
      tegnLideValg(); tegnForslag(listeType);
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', Lide.person === p);
    seg.append(k);
  }
  const hint = Lide.person
    ? 'Tryk på det, ' + (Lide.person === mig ? 'du' : Lide.person) + ' kan lide. Tryk på navnet igen, når du er færdig.'
    : 'Vælg en person og markér det, de kan lide. Terningen vælger så det, flest kan lide, først.';
  boks.replaceChildren(el('div', 'lide-titel', 'Hvem kan lide hvad?'), seg, el('p', 'hint', hint));
}

async function gemFavorit(type, tekst) {
  if (erBarn()) return;   // børn tæller ikke hurtigvalg op
  const favs = await Data.list('favoritter');
  const f = favs.find(x => x.type === type && x.tekst.toLowerCase() === tekst.toLowerCase());
  if (f) await Data.update('favoritter', f.id, { brugt: (f.brugt || 0) + 1 });
  else await Data.add('favoritter', { type, tekst, brugt: 1 });
}

async function tegnForslag(type) {
  const erMaaltid = type in MAALTIDER;
  const boks = erMaaltid ? document.getElementById('maaltid-forslag') : document.querySelector(`[data-forslag="${type}"]`);
  const st = FavTilstand[type];
  let favs = (await Data.list('favoritter')).filter(f => f.type === type);
  let filter = '';

  if (erMaaltid) {
    document.getElementById(DATALISTE[type]).replaceChildren(...favs.map(f => { const o = el('option'); o.value = f.tekst; return o; }));
    if (type !== listeType) return;
    document.getElementById('antal-retter').textContent = '(' + favs.length + ')';
    favs.sort((a, b) => a.tekst.localeCompare(b.tekst, 'da'));
    const faelles = alleKanLide(favs);
    if (st.ret) Lide.person = null;
    if (Lide.person) Lide.kunAlle = false;
    if (!faelles.length) Lide.kunAlle = false;
    // Markér-tilstand: tryk for at slå hjerte til/fra for den valgte person
    if (Lide.person && !st.ret) {
      const p = Lide.person;
      boks.classList.remove('ret-tilstand');
      boks.replaceChildren(...favs.map(f => {
        const liker = kanLide(f).includes(p);
        const k = el('button', 'lide-knap ' + PK[p] + (liker ? ' liker' : ''));
        k.type = 'button';
        k.append(el('span', 'hjerte', liker ? '♥' : '♡'), f.tekst);
        k.setAttribute('aria-pressed', liker);
        k.addEventListener('click', async () => {
          const ny = liker ? kanLide(f).filter(n => n !== p) : [...kanLide(f), p];
          await Data.update('favoritter', f.id, { kanLide: ny });
          tegnForslag(type);
        });
        return k;
      }));
      return;
    }
    if (Lide.kunAlle && !st.ret) favs = faelles;
    // I "fjern"-tilstand skjules "Hvem kan lide hvad?", så man ikke tror, man markerer hjerter
    if (st.ret) document.getElementById('lide-valg').replaceChildren(
      el('p', 'ret-hint', 'Tryk ✕ for at fjerne en ret fra listen (kan fortrydes). Tryk "Færdig", når du er færdig.'));
    else tegnLideValg();
    if (faelles.length && !st.ret) {
      const fk = knap((Lide.kunAlle ? '♥ Viser kun dem alle kan lide' : '♥ Kun dem alle kan lide') + ' (' + faelles.length + ')',
        'lille-knap alle-kan-lide', () => { Lide.kunAlle = !Lide.kunAlle; tegnForslag(type); });
      fk.setAttribute('aria-pressed', Lide.kunAlle);
      document.getElementById('lide-valg').append(fk);
    }
  } else {
    filter = document.getElementById('ny-' + type).value.trim().toLowerCase();
    const paaListen = new Set((await Data.list(type)).filter(p => !p.klaret).map(p => p.tekst.toLowerCase()));
    favs = favs.filter(f => !paaListen.has(f.tekst.toLowerCase()));
    if (filter) favs = favs.filter(f => f.tekst.toLowerCase().includes(filter));
    favs.sort((a, b) => (b.brugt || 0) - (a.brugt || 0) || a.tekst.localeCompare(b.tekst, 'da'));
  }

  const max = st.alle || st.ret || filter ? favs.length : VIS_FAERRE;
  boks.classList.toggle('ret-tilstand', st.ret);
  boks.replaceChildren();

  for (const f of favs.slice(0, max)) {
    if (erMaaltid && !st.ret) {
      const tag = el('span', 'tag', f.tekst);
      const hvem = PERSONER.filter(p => kanLide(f).includes(p));
      if (hvem.length) {
        const prikker = el('span', 'prikker');
        prikker.append(...hvem.map(p => { const s = el('span', 'prik ' + PK[p]); s.title = p; return s; }));
        prikker.setAttribute('aria-label', 'Kan lide: ' + hvem.join(', '));
        tag.append(prikker);
      }
      boks.append(tag);
      continue;
    }
    const k = el('button');
    k.type = 'button';
    k.append(el('span', 'plus', st.ret ? '✕' : '+'), f.tekst);
    k.setAttribute('aria-label', (st.ret ? 'Fjern ' : 'Tilføj ') + f.tekst);
    k.addEventListener('click', async () => {
      if (st.ret) {
        await Data.remove('favoritter', f.id);
      } else {
        const felter = { tekst: f.tekst, klaret: false };
        if (type === 'todo') felter.prio = nyPrio;
        if (type === 'indkob' && f.butik) felter.butik = f.butik;
        if (await tilfoejUdenDublet(type, felter)) await gemFavorit(type, f.tekst);
        document.getElementById('ny-' + type).value = '';
      }
      tegnAlt();
    });
    boks.append(k);
  }

  const styr = (tekst, fn) => { const k = el('button', 'styr', tekst); k.type = 'button'; k.addEventListener('click', fn); boks.append(k); };
  if (!filter && !st.ret && !erMaaltid && favs.length > VIS_FAERRE) {
    styr(st.alle ? 'Vis færre' : 'Vis alle (' + favs.length + ')', () => { st.alle = !st.alle; tegnForslag(type); });
  }
  if (!filter && favs.length && !erBarn()) {
    styr(st.ret ? 'Færdig' : erMaaltid ? 'Fjern fra listen' : 'Ret forslag', () => { st.ret = !st.ret; if (st.ret) Lide.person = null; tegnForslag(type); });
  }
}

document.getElementById('ny-ret-form').addEventListener('submit', async e => {
  e.preventDefault();
  const felt = document.getElementById('ny-ret');
  const tekst = felt.value.trim();
  if (!tekst) return;
  await gemFavorit(listeType, tekst);
  felt.value = '';
  felt.focus();
  tegnForslag(listeType);
});

document.querySelectorAll('.ryd[data-liste]').forEach(knap => {
  knap.addEventListener('click', () => bekraeft(knap, async () => {
    const navn = knap.dataset.liste;
    for (const p of (await Data.list(navn)).filter(p => p.klaret)) await Data.remove(navn, p.id);
    tegnAlt();
  }));
});

// ---------- Madplan ----------
// Hver række hører til en uge: {uge: mandagens dato 'ÅÅÅÅ-MM-DD', dag: 0-6, ret, morgen, frokost}
let madUge = 0;   // 0 = denne uge, 1 = næste uge, -1 = sidste uge ...
function madMandag() {
  const m = mandagDenneUge();
  m.setDate(m.getDate() + madUge * 7);
  return m;
}
const madUgeIso = () => isoDato(madMandag());
// barn = null giver familiens madplan; barn = 'Oliver' giver kun Olivers egne valg
async function madplanForUge(ugeIso, barn = null) {
  return (await Data.list('madplan')).filter(r => r.uge === ugeIso && (r.barn || null) === barn);
}
// Drengenes faste morgenmad og frokost – samme hver uge, til den ændres
// Data: 'fastplan' {barn, dag 0-6, morgen, frokost}
async function fastFor(barn, dag) {
  return (await Data.list('fastplan')).find(r => r.barn === barn && r.dag === dag) || {};
}
// Familiens faste aftensmad: {0: 'Pizza', ...} – 'fastplan' med barn 'Fælles' og felt ret
async function fastAftensmad() {
  const res = {};
  for (const r of await Data.list('fastplan')) if (r.barn === 'Fælles' && r.ret) res[r.dag] = r.ret;
  return res;
}
async function gemFast(barn, dag, felt, vaerdi) {
  const fundet = (await Data.list('fastplan')).find(r => r.barn === barn && r.dag === dag);
  if (fundet) {
    const ny = { ...fundet, [felt]: vaerdi };
    if (!ny.morgen && !ny.frokost && !ny.ret) await Data.stille(() => Data.remove('fastplan', fundet.id));
    else await Data.update('fastplan', fundet.id, { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('fastplan', { barn, dag, [felt]: vaerdi });
  }
}

// Maden for en dato. Rækkefølge for et barn:
//   dagens eget valg (fra tavlen) → fast ugeplan (kun morgen/frokost) → familiens madplan
// Returnerer {morgen, frokost, ret, eget: {felt: true}, kilde: {felt: 'eget'|'fast'|'faelles'}, faelles, fast}
async function madFor(dato, barn = null) {
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const faelles = { ...((await madplanForUge(ugeIso)).find(r => r.dag === dag) || {}) };
  if (!faelles.ret) { const fa = (await fastAftensmad())[dag]; if (fa) faelles.ret = fa; }   // fast aftensmad
  const fast = barn ? await fastFor(barn, dag) : {};
  const res = { eget: {}, kilde: {}, faelles, fast };
  for (const f of ['morgen', 'frokost', 'ret']) {
    if (fast[f]) { res[f] = fast[f]; res.kilde[f] = 'fast'; }
    else if (faelles[f]) { res[f] = faelles[f]; res.kilde[f] = 'faelles'; }
  }
  if (barn) {
    const eget = (await madplanForUge(ugeIso, barn)).find(r => r.dag === dag) || {};
    for (const f of ['morgen', 'frokost', 'ret']) if (eget[f]) { res[f] = eget[f]; res.eget[f] = true; res.kilde[f] = 'eget'; }
  }
  return res;
}

async function tegnMadplan() {
  const ol = document.getElementById('mad-uge');
  const mandag = madMandag();
  const retter = await madplanForUge(isoDato(mandag));
  const faste = await fastAftensmad();
  const egne = (await Data.list('madplan')).filter(r => r.uge === isoDato(mandag) && r.barn);
  const idag = madUge === 0 ? idagNr() : madUge > 0 ? -1 : 7;   // markér dage der er gået
  const son = new Date(mandag); son.setDate(mandag.getDate() + 6);
  const navn = madUge === 0 ? 'Denne uge' : madUge === 1 ? 'Næste uge' : madUge === -1 ? 'Sidste uge' : null;
  document.getElementById('mad-titel').textContent = 'Uge ' + ugenummer(mandag) + (navn ? ' · ' + navn : '');
  document.getElementById('ugenr').textContent = ugeSpan(mandag);
  document.getElementById('mad-denne').hidden = madUge === 0;
  ol.replaceChildren();

  DAGE.forEach((dag, i) => {
    const dato = new Date(mandag); dato.setDate(mandag.getDate() + i);
    const li = el('li', 'dag' + (i === idag ? ' idag' : i < idag ? ' forbi' : '') + (nyeDage.has(i) ? ' ny' : ''));
    const label = el('label', null, dag);
    label.htmlFor = 'dag-' + i;
    label.append(el('small', null, dato.getDate() + '/' + (dato.getMonth() + 1)));

    const felt = el('input');
    felt.type = 'text';
    felt.id = 'dag-' + i;
    felt.placeholder = i === idag ? 'Hvad skal vi have i dag?' : '–';
    felt.autocomplete = 'off';
    felt.enterKeyHint = 'done';
    felt.setAttribute('list', 'retter-forslag');
    const egen = retter.find(r => r.dag === i)?.ret || '';
    const fast = faste[i] || '';
    felt.value = egen || fast;
    if (fast && !egen) li.classList.add('fra-fast');
    felt.readOnly = erBarn();
    felt.addEventListener('change', async () => {
      const ret = felt.value.trim();
      if (fast && !egen && ret === fast) return;
      await gemRet(i, ret === fast ? '' : ret);
      if (ret) { await gemFavorit('ret', ret); tegnForslag('ret'); }
      tegnMadplan();
    });
    felt.addEventListener('keydown', e => { if (e.key === 'Enter') felt.blur(); });

    const terning = el('button', 'terning');
    terning.type = 'button';
    terning.setAttribute('aria-label', 'Ny ret til ' + DAGE_LANG[i]);
    terning.innerHTML = IKON_TERNING;
    terning.addEventListener('click', () => rulDage([i]));

    // ↻ = retten kommer igen samme ugedag hver uge (kan stadig ændres for en enkelt uge)
    const gentag = knap('↻', 'gentag-knap' + (fast ? ' aktiv' : ''), async () => {
      const dagNavn = DAGE_LANG[i].toLowerCase();
      if (fast) {
        await gemFast('Fælles', i, 'ret', '');
        visStatus(fast + ' er ikke længere fast hver ' + dagNavn);
      } else {
        const ret = felt.value.trim();
        if (!ret) { visStatus('Skriv en ret først – så kan den gå igen hver ' + dagNavn); felt.focus(); return; }
        await gemFast('Fælles', i, 'ret', ret);
        if (egen === ret) await gemRet(i, '');
        visStatus(ret + ' kommer nu igen hver ' + dagNavn);
      }
      tegnMadplan(); tegnOverblik();
    });
    gentag.setAttribute('aria-pressed', !!fast);
    gentag.setAttribute('aria-label', fast ? 'Fast hver ' + DAGE_LANG[i].toLowerCase() + ' – tryk for at stoppe' : 'Gentag hver uge');

    li.append(label, felt, gentag, terning);

    // Drengenes egne valg denne dag
    const dagensEgne = egne.filter(r => r.dag === i);
    if (dagensEgne.length) {
      const KORT = { morgen: 'morgen', frokost: 'frokost', ret: 'aften' };
      const tekst = dagensEgne.map(r => r.barn + ': ' +
        ['morgen', 'frokost', 'ret'].filter(f => r[f]).map(f => KORT[f] + ' ' + r[f]).join(', ')).join(' · ');
      li.append(el('div', 'barn-mad', tekst));
    }
    ol.append(li);
  });
  nyeDage = new Set();
}

// Gemmer ét måltid (ret = aftensmad, morgen, frokost) for en ugedag
async function gemMad(dag, felt, vaerdi, uge = madUgeIso(), barn = null) {
  const fundet = (await madplanForUge(uge, barn)).find(r => r.dag === dag);
  if (fundet) {
    const ny = { ...fundet, [felt]: vaerdi };
    if (!ny.ret && !ny.morgen && !ny.frokost) await Data.stille(() => Data.remove('madplan', fundet.id));
    else await Data.update('madplan', fundet.id, { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('madplan', barn ? { uge, dag, barn, [felt]: vaerdi } : { uge, dag, [felt]: vaerdi });
  }
  tegnOverblik();
}
const gemRet = (dag, ret) => gemMad(dag, 'ret', ret);

// Drengenes faste morgenmad og frokost (redigeres af voksne under madplanen)
let fastBarn = BOERN.includes(lokal.get('fast-barn')) ? lokal.get('fast-barn') : BOERN[0];
async function tegnFastPlan() {
  const boks = document.getElementById('fast-plan');
  const voksen = Data.bruger()?.rolle === 'voksen';
  const selv = BOERN.includes(Data.bruger()?.navn) ? Data.bruger().navn : null;   // et barn ser sin egen
  if (selv) fastBarn = selv;
  document.getElementById('ryd-uge').after(boks);   // under aftensmaden – for både børn og voksne
  const plan = (await Data.list('fastplan')).filter(r => r.barn === fastBarn);
  const seg = el('div', 'seg');
  seg.setAttribute('role', 'radiogroup');
  seg.append(...BOERN.map(b => {
    const k = knap(b, null, () => { fastBarn = b; lokal.set('fast-barn', b); tegnFastPlan(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', b === fastBarn);
    return k;
  }));
  const ol = el('ol', 'uge fast-uge');
  DAGE.forEach((dagNavn, i) => {
    const raekke = plan.find(r => r.dag === i) || {};
    const li = el('li', 'fast-dag' + (i === idagNr() ? ' idag' : ''));
    li.append(el('span', 'fast-dagnavn', dagNavn));
    for (const felt of ['morgen', 'frokost']) {
      const navn = felt === 'morgen' ? 'Morgen' : 'Frokost';
      if (!voksen) { li.append(el('span', 'fast-vaerdi', raekke[felt] || '–')); continue; }
      const inp = el('input');
      inp.type = 'text'; inp.id = 'fast-' + felt + '-' + i; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
      inp.placeholder = navn;
      inp.setAttribute('aria-label', navn + ' ' + DAGE_LANG[i].toLowerCase());
      inp.setAttribute('list', DATALISTE[felt]);
      inp.value = raekke[felt] || '';
      inp.addEventListener('change', async () => {
        const v = inp.value.trim();
        await gemFast(fastBarn, i, felt, v);
        if (v) { await gemFavorit(felt, v); tegnForslag(felt); }
        tegnOverblik();
      });
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
      const t = knap('', 'terning lille', async () => {
        const favs = (await Data.list('favoritter')).filter(f => f.type === felt).map(f => f.tekst).filter(v => v !== inp.value);
        if (!favs.length) return;
        await gemFast(fastBarn, i, felt, favs[Math.floor(Math.random() * favs.length)]);
        tegnFastPlan(); tegnOverblik();
      });
      t.innerHTML = IKON_TERNING;
      t.setAttribute('aria-label', 'Tilfældig ' + navn.toLowerCase());
      const par = el('span', 'fast-felt');
      par.append(inp, t);
      li.append(par);
    }
    ol.append(li);
  });
  const hoved = el('div', 'fast-hoved');
  hoved.append(el('span', null, ''), el('span', null, 'Morgen'), el('span', null, 'Frokost'));
  boks.replaceChildren(
    el('h3', 'lille-titel', selv ? 'Min morgenmad og frokost' : 'Børnenes morgenmad og frokost – hver uge'),
    selv ? '' : el('p', 'hint', 'Går igen hver uge af sig selv – også når du skifter uge ovenfor. En enkelt dag ændres ved at trykke på maden på barnets tavle.'),
    selv ? '' : seg, hoved, ol);
}

// Terning: vælg tilfældigt fra listerne – undgå gentagelser i samme uge
let nyeDage = new Set();
async function rulDage(dage, felter = ['ret']) {
  const favs = await Data.list('favoritter');
  if (felter.includes('ret') && !favs.some(f => f.type === 'ret')) { document.querySelector('.retter-boks').open = true; return; }
  for (const felt of felter) {
    const liste = favs.filter(f => f.type === felt);
    const alle = liste.map(f => f.tekst);
    if (!alle.length) continue;
    // Det flest kan lide vælges først: først det alle kan lide, så det næstflest kan lide osv.
    const aktive = lideAktive(liste);
    const point = new Map(liste.map(f => [f.tekst, kanLide(f).filter(n => aktive.includes(n)).length]));
    const plan = await madplanForUge(madUgeIso());
    const brugt = new Set(plan.map(r => (r[felt] || '').toLowerCase()).filter(Boolean));
    for (const dag of dage) {
      const ubrugte = alle.filter(r => !brugt.has(r.toLowerCase()));
      const kilde = ubrugte.length ? ubrugte : alle;
      const bedst = Math.max(...kilde.map(r => point.get(r)));
      const mulige = kilde.filter(r => point.get(r) === bedst);
      const valgt = mulige[Math.floor(Math.random() * mulige.length)];
      brugt.add(valgt.toLowerCase());
      await gemMad(dag, felt, valgt);
      nyeDage.add(dag);
    }
  }
  tegnMadplan();
}
const synligeMaaltider = () => ['ret'];
// Dage terningerne må ændre: ikke dage, der er gået (i dag er med)
function aabneDage() {
  const alle = [0, 1, 2, 3, 4, 5, 6];
  if (madUge > 0) return alle;
  if (madUge < 0) return [];
  return alle.filter(d => d >= idagNr());
}

document.getElementById('fyld-tomme').addEventListener('click', async () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  const faste = await fastAftensmad();
  for (const felt of synligeMaaltider()) {
    const plan = await madplanForUge(madUgeIso());
    await rulDage(aabneDage().filter(d => !faste[d] && !plan.some(r => r.dag === d && r[felt])), [felt]);
  }
});
// Kopiér sidste uges aftensmad til de tomme dage (ikke dage der er gået, ikke faste dage)
document.getElementById('kopier-uge').addEventListener('click', async () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  const faste = await fastAftensmad();
  const forrige = new Date(madMandag()); forrige.setDate(forrige.getDate() - 7);
  const sidste = await madplanForUge(isoDato(forrige));
  const plan = await madplanForUge(madUgeIso());
  let n = 0;
  for (const d of aabneDage()) {
    const ret = sidste.find(r => r.dag === d)?.ret;
    if (!ret || faste[d] || plan.some(r => r.dag === d && r.ret)) continue;
    await gemMad(d, 'ret', ret); nyeDage.add(d); n++;
  }
  visStatus(n ? 'Kopierede ' + n + (n === 1 ? ' dag' : ' dage') + ' fra sidste uge' : 'Ingen tomme dage at kopiere til');
  tegnMadplan();
});
const blandUge = document.getElementById('bland-uge');
blandUge.addEventListener('click', () => bekraeft(blandUge, () => {
  if (!aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
  return fastAftensmad().then(faste => rulDage(aabneDage().filter(d => !faste[d]), synligeMaaltider()));
}));

document.getElementById('mad-forrige').addEventListener('click', () => { madUge--; tegnMadplan(); });
document.getElementById('mad-naeste').addEventListener('click', () => { madUge++; tegnMadplan(); });
document.getElementById('mad-denne').addEventListener('click', () => { madUge = 0; tegnMadplan(); });

const rydUge = document.getElementById('ryd-uge');
rydUge.addEventListener('click', () => bekraeft(rydUge, async () => {
  for (const r of await madplanForUge(madUgeIso())) await Data.remove('madplan', r.id);
  tegnAlt();
}));

// "Vores lister" folder ud nederst på siden – rul den frem, så man kan se, at der skete noget
document.querySelector('.retter-boks').addEventListener('toggle', e => {
  if (e.target.open) setTimeout(() => e.target.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }), 60);
});

// ---------- Skoleskema ----------
// Data: 'ringetider' {barn, nr, tid}
//       'skema' {barn, dag (0-4), nr, fag, farve}   – farve = navnet på en farve i skemafarver
//       'skemafarver' {barn, navn, farve}            – fx {Oliver, 'Mette', 'blaa'}
//       'skemadag' {barn, dag, kontakt, fri?: true}  – dagens kontaktperson; fri = fast fridag hver uge
const FARVER = {
  blaa: '#5b8def', groen: '#4fa35a', gul: '#e0b44f', roed: '#d9534f',
  graa: '#9aa5a0', lilla: '#9b7fd4', orange: '#ef8a3c', turkis: '#2fb0aa'
};
const FARVE_NAVN = { blaa: 'Blå', groen: 'Grøn', gul: 'Gul', roed: 'Rød', graa: 'Grå', lilla: 'Lilla', orange: 'Orange', turkis: 'Turkis' };
const MAX_RAEKKER = 12;
let skemaBarn = lokal.get('skema-barn') || BOERN[0];
let skemaDag = idagNr() < 5 ? idagNr() : 0;
let redigerer = false;

const skemaFarver = async barn => (await Data.list('skemafarver')).filter(f => f.barn === barn);
const farveKode = (farver, navn) => FARVER[farver.find(f => f.navn === navn)?.farve] || null;
const dagKontakt = async (barn, dag) => (await Data.list('skemadag')).find(d => d.barn === barn && d.dag === dag)?.kontakt || '';
const fastFri = async (barn, dag) => !!(await Data.list('skemadag')).find(d => d.barn === barn && d.dag === dag)?.fri;

function tegnSkemaValg() {
  const barnSeg = document.getElementById('vaelg-barn');
  barnSeg.replaceChildren(...BOERN.map(b => {
    const k = el('button', null, b);
    k.type = 'button'; k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', b === skemaBarn);
    k.addEventListener('click', () => { skemaBarn = b; lokal.set('skema-barn', b); tegnSkema(); });
    return k;
  }));
  const dagSeg = document.getElementById('vaelg-dag');
  dagSeg.replaceChildren(...DAGE.slice(0, 5).map((d, i) => {
    const k = el('button', null, d);
    k.type = 'button'; k.setAttribute('role', 'radio'); k.setAttribute('aria-checked', i === skemaDag);
    k.addEventListener('click', () => { skemaDag = i; tegnSkema(); });
    return k;
  }));
}

// Alle rækker for en dag. medTom = én ekstra tom række til at skrive i (når man retter)
async function dagensTimer(barn, dag, medTom = false) {
  const tider = (await Data.list('ringetider')).filter(r => r.barn === barn);
  const alleFag = (await Data.list('skema')).filter(s => s.barn === barn);
  const fag = alleFag.filter(s => s.dag === dag);
  const hoejeste = Math.max(0, ...tider.filter(t => t.tid).map(t => t.nr), ...alleFag.map(s => s.nr));
  const antal = Math.min(MAX_RAEKKER, Math.max(7, hoejeste + (medTom ? 1 : 0)));
  return Array.from({ length: antal }, (_, i) => {
    const nr = i + 1;
    const s = fag.find(f => f.nr === nr);
    return { nr, tid: tider.find(t => t.nr === nr)?.tid || '', fag: s?.fag || '', farve: s?.farve || '' };
  });
}

// Én time som den vises (skema og børnetavle)
function lektionLi(t, erNu, farver) {
  const kode = farveKode(farver, t.farve);
  const li = el('li', 'lektion vis' + (erNu ? ' nu' : '') + (kode ? ' farvet' : ''));
  if (kode) li.style.setProperty('--fk', kode);
  li.append(el('span', 'tid', visTider(t.tid)), el('span', 'fag', t.fag));
  return li;
}

// Lille forklaring: hvilken farve betyder hvad
function forklaring(farver, brugte) {
  const boks = el('div', 'forklaring');
  for (const f of farver.filter(f => !brugte || brugte.has(f.navn))) {
    const s = el('span', 'fk-punkt');
    const prik = el('span', 'fk-farve');
    prik.style.setProperty('--fk', FARVER[f.farve]);
    s.append(prik, f.navn);
    boks.append(s);
  }
  return boks;
}

async function tegnSkema() {
  tegnSkemaValg();
  const ol = document.getElementById('lektioner');
  const farver = await skemaFarver(skemaBarn);
  const timer = await dagensTimer(skemaBarn, skemaDag, redigerer);
  const medFag = timer.filter(t => t.fag);
  const kontakt = await dagKontakt(skemaBarn, skemaDag);
  const friDag = await fastFri(skemaBarn, skemaDag);
  ol.replaceChildren();

  const knapEl = document.getElementById('rediger-skema');
  knapEl.setAttribute('aria-pressed', redigerer);
  knapEl.textContent = redigerer ? 'Færdig' : 'Ret skema';
  document.getElementById('rediger-hint').hidden = !redigerer;

  // Kontaktperson for dagen
  const kontaktBoks = document.getElementById('skema-kontakt');
  kontaktBoks.replaceChildren();
  if (redigerer) {
    const inp = input('text', 'kontakt-felt', kontakt, 'Fx Britt');
    inp.addEventListener('change', () => gemSkemaFelt('skemadag', { barn: skemaBarn, dag: skemaDag }, { kontakt: inp.value.trim() }));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
    const par = el('div', 'mad-par kontakt-par');
    const lbl = el('label', null, 'Kontakt'); lbl.htmlFor = inp.id;
    par.append(lbl, inp);
    const friKnap = knap('🎉 Fri hele dagen (hver uge)', null, () => gemSkemaFelt('skemadag', { barn: skemaBarn, dag: skemaDag }, { fri: !friDag }).then(tegnSkema));
    friKnap.setAttribute('role', 'checkbox');
    friKnap.setAttribute('aria-checked', friDag);
    const friSeg = el('div', 'seg wrap skema-fri');
    friSeg.append(friKnap);
    kontaktBoks.append(par, friSeg);
  }

  if (redigerer) {
    for (const t of timer) {
      const li = el('li', 'lektion ret');
      const tid = el('input', 'tid-felt');
      tid.type = 'text'; tid.value = t.tid; tid.placeholder = '8.00-8.45'; tid.inputMode = 'decimal';
      tid.setAttribute('aria-label', 'Række ' + t.nr + ', tid');
      tid.addEventListener('change', () => gemSkemaFelt('ringetider', { barn: skemaBarn, nr: t.nr }, { tid: tid.value.trim() }));
      const fag = el('input');
      fag.type = 'text'; fag.value = t.fag; fag.placeholder = 'Fag';
      fag.setAttribute('aria-label', 'Række ' + t.nr + ', fag');
      fag.addEventListener('change', () => gemSkemaFelt('skema', { barn: skemaBarn, dag: skemaDag, nr: t.nr }, { fag: fag.value.trim() }));
      const kode = farveKode(farver, t.farve);
      const farveKnap = knap('', 'farve-knap' + (kode ? '' : ' ingen'), () => vaelgFarve(t, farver));
      if (kode) farveKnap.style.setProperty('--fk', kode);
      farveKnap.setAttribute('aria-label', 'Farve: ' + (t.farve || 'ingen'));
      li.append(tid, fag, farveKnap);
      ol.append(li);
    }
  } else if (friDag) {
    ol.append(el('li', 'tom fri-dag-skema', 'Fri hele dagen 🎉 (fast fridag)'));
  } else if (!medFag.length) {
    ol.append(el('li', 'tom', 'Ingen timer lagt ind. Tryk på "Ret skema".'));
  } else {
    const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
    for (const t of medFag) {
      const [fra, til] = tidSomMin(t.tid);
      ol.append(lektionLi(t, skemaDag === idagNr() && fra != null && til != null && nuMin >= fra && nuMin < til, farver));
    }
  }

  const fkBoks = document.getElementById('skema-forklaring');
  fkBoks.replaceChildren(redigerer ? '' : forklaring(farver, new Set(medFag.map(t => t.farve))));

  const { slut: friKl } = friDag ? {} : skoleTider(timer);
  const fod = [];
  if (friKl) fod.push('Fri kl. ' + visTid(friKl));
  if (kontakt && !redigerer) fod.push('Kontakt: ' + kontakt);
  document.getElementById('fri-kl').textContent = fod.join(' · ');

  tegnFarveStyring(farver);
}

// Vælg farve til en time
function vaelgFarve(t, farver) {
  const valg = chipValg(['', ...farver.map(f => f.navn)], t.farve, async v => {
    await gemSkemaFelt('skema', { barn: skemaBarn, dag: skemaDag, nr: t.nr }, { farve: v });
    lukArk();
    tegnSkema();
  }, v => v || 'Ingen farve');
  aabnArk('Farve til ' + (t.fag || 'række ' + t.nr), valg,
    el('p', 'hint', 'Farverne rettes under "Farver" nederst, mens du retter skemaet.'));
}

// Farver for barnet: navn + farve (kun når man retter)
function tegnFarveStyring(farver) {
  const boks = document.getElementById('skema-farver');
  boks.replaceChildren();
  if (!redigerer) return;
  boks.append(el('h3', 'lille-titel', 'Farver for ' + skemaBarn));
  const liste = el('div', 'farve-liste');
  for (const f of farver) {
    const raekke = el('div', 'farve-raekke');
    const navn = input('text', 'farvenavn-' + f.id, f.navn, 'Fx lærerens navn');
    navn.addEventListener('change', async () => {
      const nyt = navn.value.trim();
      if (!nyt || nyt === f.navn) { navn.value = f.navn; return; }
      // Omdøb også i skemaet, så timerne beholder farven
      for (const s of (await Data.list('skema')).filter(s => s.barn === skemaBarn && s.farve === f.navn)) {
        await Data.update('skema', s.id, { farve: nyt });
      }
      await Data.update('skemafarver', f.id, { navn: nyt });
      tegnAlt();
    });
    const paletter = el('div', 'palette');
    for (const [noegle, kode] of Object.entries(FARVER)) {
      const k = knap('', 'palette-knap' + (f.farve === noegle ? ' valgt' : ''), async () => {
        await Data.update('skemafarver', f.id, { farve: noegle });
        tegnAlt();
      });
      k.style.setProperty('--fk', kode);
      k.setAttribute('aria-label', FARVE_NAVN[noegle]);
      k.setAttribute('aria-pressed', f.farve === noegle);
      paletter.append(k);
    }
    const slet = knap('', 'slet', async () => { await Data.remove('skemafarver', f.id); tegnAlt(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet farven ' + f.navn);
    raekke.append(navn, slet, paletter);
    liste.append(raekke);
  }
  boks.append(liste, knap('Tilføj farve', 'lille-knap', async () => {
    const brugt = new Set(farver.map(f => f.farve));
    const fri = Object.keys(FARVER).find(k => !brugt.has(k)) || 'blaa';
    await Data.add('skemafarver', { barn: skemaBarn, navn: 'Ny farve', farve: fri });
    tegnAlt();
  }));
}

async function gemSkemaFelt(liste, noegle, felter) {
  const VAERDIER = { skema: ['fag', 'farve'], ringetider: ['tid'], skemadag: ['kontakt', 'fri'] }[liste];
  const match = r => Object.entries(noegle).every(([k, v]) => r[k] === v);
  const fundet = (await Data.list(liste)).find(match);
  const samlet = { ...(fundet || {}), ...felter };
  const tom = VAERDIER.every(k => !samlet[k]);
  if (fundet && tom) await Data.stille(() => Data.remove(liste, fundet.id));
  else if (fundet) await Data.update(liste, fundet.id, felter);
  else if (!tom) await Data.add(liste, { ...noegle, ...felter });
  tegnOverblik();
}

document.getElementById('rediger-skema').addEventListener('click', () => { redigerer = !redigerer; tegnSkema(); });

// ---------- Kalender ----------
// Data: 'kalender' {dato: 'ÅÅÅÅ-MM-DD', tilDato?, hvem: navn eller [navne], titel, tid: 'TT:MM' eller '', slut?, note?,
//                   gentag?: 'uge'|'2uger'|'maaned'|'aar', gentagTil?: dato, undtagelser?: [datoer der er sprunget over]}
// 'kalender_voksne' – samme felter, men kun for voksne. Databasen giver slet ikke børnene disse rækker.
//                   I koden får de markeringen _voksne: true.
// 'kalender_privat' – kun den voksne, der oprettede aftalen, kan se den (databasen sørger for det). Markeres _privat.
async function kalenderAftaler() {
  const [alle, voksne, privat] = await Promise.all([Data.list('kalender'), Data.list('kalender_voksne'), Data.list('kalender_privat')]);
  return [...alle, ...voksne.map(a => ({ ...a, _voksne: true })), ...privat.map(a => ({ ...a, _privat: true }))];
}
const SYNLIG_LISTE = { alle: 'kalender', voksne: 'kalender_voksne', mig: 'kalender_privat' };
const synligFor = a => (a._privat ? 'mig' : a._voksne ? 'voksne' : 'alle');
// Fravær fra skole: type 'syg' | 'hjemme' (fri: true – hele dagen) eller 'tidlig' (tidligere fri, tid = klokkeslæt)
const FRAVAER = {
  syg: { ikon: '🤒', titel: 'Syg', knap: '🤒 Syg' },
  hjemme: { ikon: '🏠', titel: 'Fri fra skolen', knap: '🏠 Fri fra skolen' },
  tidlig: { ikon: '⏰', titel: 'Tidligere fri', knap: '⏰ Tidligere fri' }
};
const friIkon = a => (FRAVAER[a.type]?.ikon || '🌴');
const laas = a => (a.fri || a.type === 'tidlig' ? ' ' + friIkon(a) : '') + (a._privat ? ' 👤' : a._voksne ? ' 🔒' : '');   // markering på ferie/fri/fravær og kun-voksne-aftaler
const fravaerDen = (aftaler, iso, barn) => aftalerDen(aftaler, iso, [barn]).find(a => FRAVAER[a.type]) || null;
const sygDen = (aftaler, iso, barn) => aftalerDen(aftaler, iso, [barn]).some(a => a.type === 'syg');
// Ferie/fri ({fri: true}): skemaet viser "Fri", og i "i dag"-lister vises den kun den dag, den starter
function friDen(aftaler, iso, person) {
  return aftalerDen(aftaler, iso, [person, 'Fælles']).find(a => a.fri) || null;
}
const iDagsListe = (aftaler, iso, hvem) => aftalerDen(aftaler, iso, hvem).filter(a => !a.fri || forekomstStart(a, iso) === iso);
const friTekst = a => a.titel + (a.tilDato && a.tilDato > a.dato ? ' (til ' + DAGE[(tilDag(a.tilDato).getDay() + 6) % 7].toLowerCase() + ' ' + tilDag(a.tilDato).getDate() + '/' + (tilDag(a.tilDato).getMonth() + 1) + ')' : '');
const kalListe = a => SYNLIG_LISTE[synligFor(a)];
// Gem ændringer – flytter aftalen til den anden liste, hvis "kun voksne" er ændret
async function gemAftale(a, f, synlig) {
  const ny = SYNLIG_LISTE[synlig];
  if (ny === kalListe(a)) { await Data.update(ny, a.id, f); return; }
  const { id, oprettet, _voksne, _privat, _af, ...gammel } = a;
  await Data.add(ny, { ...gammel, ...f });
  await Data.stille(() => Data.remove(kalListe(a), a.id));   // flyttet, ikke slettet
}
const PERSONER = ['Fælles', 'Timmo', 'Winnie', 'Oliver', 'Villads'];
const PK = { 'Fælles': 'c-faelles', Timmo: 'c-timmo', Winnie: 'c-winnie', Oliver: 'c-oliver', Villads: 'c-villads' };
const MDR = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
let kalUge = 0;

function isoDato(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const visTid = t => (t || '').replace(':', '.');
const sorterAftaler = (a, b) => (a.tid || '').localeCompare(b.tid || '');

// ----- Gentagelser, flere dage og flere personer -----
const GENTAG_NAVN = { '': 'Nej', uge: 'Hver uge', '2uger': 'Hver 2. uge', maaned: 'Hver måned', aar: 'Hvert år' };
const personerI = a => (Array.isArray(a.hvem) ? a.hvem : [a.hvem || 'Fælles']);
const tilDag = iso => new Date(iso + 'T12:00');   // kl. 12 undgår fejl ved skift til/fra sommertid
const dageMellem = (fra, til) => Math.round((tilDag(til) - tilDag(fra)) / 86400000);
const plusDage = (iso, n) => { const d = tilDag(iso); d.setDate(d.getDate() + n); return isoDato(d); };
const tidTekst = a => (a.tid ? visTid(a.tid) + (a.slut ? '–' + visTid(a.slut) : '') + ' ' : '');
const aftaleFarve = (a, foretruk = []) => PK[personerI(a).find(p => foretruk.includes(p)) || personerI(a)[0]] || 'c-faelles';

// Startdatoen for den gang aftalen finder sted, som dækker dagen iso – eller null hvis den ikke sker den dag
function forekomstStart(a, iso) {
  if (!a.dato || iso < a.dato) return null;
  const varighed = a.tilDato && a.tilDato > a.dato ? dageMellem(a.dato, a.tilDato) : 0;
  let start = null;
  if (!a.gentag) {
    start = a.dato;
  } else if (a.gentag === 'uge' || a.gentag === '2uger') {
    const skridt = a.gentag === 'uge' ? 7 : 14;
    const n = dageMellem(a.dato, iso);
    start = plusDage(a.dato, n - (n % skridt));
  } else {
    const s = tilDag(a.dato);
    for (let k = 0; k <= varighed; k++) {
      const kandidat = plusDage(iso, -k);
      if (kandidat < a.dato) break;
      const c = tilDag(kandidat);
      if (c.getDate() === s.getDate() && (a.gentag === 'maaned' || c.getMonth() === s.getMonth())) { start = kandidat; break; }
    }
    if (!start) return null;
  }
  if (dageMellem(start, iso) > varighed) return null;
  if (a.gentag && a.gentagTil && start > a.gentagTil) return null;
  if ((a.undtagelser || []).includes(start)) return null;
  return start;
}
// Dagens aftaler – evt. kun for bestemte personer
function aftalerDen(aftaler, iso, hvem = null) {
  return aftaler.filter(a => forekomstStart(a, iso) !== null && (!hvem || personerI(a).some(p => hvem.includes(p))))
    .sort(sorterAftaler);
}

// Uge- eller månedsvisning (huskes på denne enhed)
let kalVisning = lokal.get('kal-visning') === 'maaned' ? 'maaned' : 'uge';
let kalMaaned = 0;                       // 0 = denne måned
let kalValgtDag = isoDato(new Date());   // valgt dag i månedsvisningen

function tegnKalVisningValg() {
  const seg = document.getElementById('kal-visning');
  seg.replaceChildren(...[['uge', 'Uge'], ['maaned', 'Måned']].map(([v, navn]) => {
    const k = knap(navn, null, () => { kalVisning = v; lokal.set('kal-visning', v); tegnKalender(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', v === kalVisning);
    return k;
  }));
  document.getElementById('kal-uge-del').hidden = kalVisning !== 'uge';
  document.getElementById('kal-maaned-del').hidden = kalVisning !== 'maaned';
  document.getElementById('kal-forrige').setAttribute('aria-label', kalVisning === 'uge' ? 'Forrige uge' : 'Forrige måned');
  document.getElementById('kal-naeste').setAttribute('aria-label', kalVisning === 'uge' ? 'Næste uge' : 'Næste måned');
}

async function tegnMaaned() {
  const foerste = new Date(); foerste.setHours(0, 0, 0, 0); foerste.setDate(1);
  foerste.setMonth(foerste.getMonth() + kalMaaned);
  const sidste = new Date(foerste.getFullYear(), foerste.getMonth() + 1, 0);
  const navn = MDR_LANG[foerste.getMonth()];
  document.getElementById('kal-titel').textContent = navn[0].toUpperCase() + navn.slice(1) + ' ' + foerste.getFullYear();
  document.getElementById('kal-idag').textContent = 'Til denne måned';
  document.getElementById('kal-idag').hidden = kalMaaned === 0;
  document.getElementById('kal-dato').textContent = '';

  const aftaler = await kalenderAftaler();
  const alleFoed = await foedselsListe();   // fra familie.js (personer + gamle rækker)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const idagIso = isoDato(new Date());
  if (kalValgtDag.slice(0, 7) !== isoDato(foerste).slice(0, 7)) {
    kalValgtDag = idagIso.slice(0, 7) === isoDato(foerste).slice(0, 7) ? idagIso : isoDato(foerste);
  }

  const g = document.getElementById('maaned');
  g.replaceChildren(el('div', 'md-hoved md-uge', 'Uge'), ...DAGE.map(d => el('div', 'md-hoved', d)));

  const dag = mandagFor(foerste);
  while (dag <= sidste) {
    g.append(el('div', 'md-ugenr', ugenummer(dag)));
    for (let i = 0; i < 7; i++) {
      const iso = isoDato(dag);
      const dagens = aftalerDen(aftaler, iso);
      const egneFoed = alleFoed.filter(f => isoDato(datoIAar(f, dag.getFullYear())) === iso);
      const foed = [...egneFoed, ...indbyggedeDageDen(iso, egneFoed, mineValg)];
      const k = knap('', 'md-dag' + (dag.getMonth() !== foerste.getMonth() ? ' anden' : '') +
        (iso === idagIso ? ' idag' : '') + (iso === kalValgtDag ? ' valgt' : '') + (i >= 5 ? ' weekend' : ''),
        () => { kalValgtDag = iso; tegnMaaned(); });
      k.setAttribute('aria-label', dag.getDate() + '. ' + MDR_LANG[dag.getMonth()] +
        (dagens.length || foed.length ? ', ' + (dagens.length + foed.length) + ' ting' : ''));
      k.append(el('span', 'md-nr', dag.getDate()));
      // Prikker på mobil, korte titler på store skærme
      const prikker = el('span', 'md-prikker');
      const titler = el('span', 'md-titler');
      for (const f of foed) {
        prikker.append(el('span', 'prik ' + dagKlasse(f)));
        titler.append(el('span', 'md-titel ' + dagKlasse(f), f.indbygget ? f.ikon + ' ' + f.navn : foedIkon(f) + f.navn));
      }
      if (foed.some(f => f.hellig)) k.classList.add('hellig');
      for (const a of dagens) {
        for (const p of personerI(a)) prikker.append(el('span', 'prik ' + PK[p]));
        titler.append(el('span', 'md-titel ' + aftaleFarve(a), (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + laas(a)));
      }
      k.append(prikker, titler);
      g.append(k);
      dag.setDate(dag.getDate() + 1);
    }
  }

  // Den valgte dag
  const valgt = new Date(kalValgtDag + 'T00:00');
  const detalje = document.getElementById('dag-detalje');
  const top = el('div', 'sek-hoved');
  top.append(el('h3', 'lille-titel', DAGE_LANG[(valgt.getDay() + 6) % 7] + ' ' + valgt.getDate() + '. ' + MDR_LANG[valgt.getMonth()]),
    knap('Ny aftale', 'lille-knap', () => redigerAftale({ dato: kalValgtDag, hvem: 'Fælles' })));
  const ul = el('ul', 'husk-liste dag-liste');
  for (const f of await foedselsdageDen(kalValgtDag)) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    ul.append(li);
  }
  for (const a of aftalerDen(aftaler, kalValgtDag)) {
    const li = el('li', aftaleFarve(a));
    const b = knap('', 'dag-aftale', () => redigerAftale(a, forekomstStart(a, kalValgtDag)));
    b.append(el('span', 'prik'), el('span', 'husk-tekst', tidTekst(a) + a.titel + (a.gentag ? ' ↻' : '') + laas(a)), el('span', 'dag-hvem', personerI(a).join(', ')));
    li.append(b);
    ul.append(li);
  }
  if (!ul.children.length) ul.append(el('li', 'tom-husk', 'Ingen aftaler.'));
  detalje.replaceChildren(top, ul);
}

async function tegnKalender() {
  tegnKalVisningValg();
  if (kalVisning === 'maaned') return tegnMaaned();
  document.getElementById('kal-idag').textContent = 'Til denne uge';
  const man = mandagDenneUge();
  man.setDate(man.getDate() + kalUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  document.getElementById('kal-titel').textContent = 'Uge ' + ugenummer(man) + ' · ' + ugeSpan(man);
  document.getElementById('kal-idag').hidden = kalUge === 0;
  document.getElementById('kal-dato').textContent = son.getFullYear() !== new Date().getFullYear() ? son.getFullYear() : '';

  const aftaler = await kalenderAftaler();
  const alleFoed = await foedselsListe();   // fra familie.js (personer + gamle rækker)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const idagIso = isoDato(new Date());
  const g = document.getElementById('kal');
  g.replaceChildren(el('div'));

  for (const p of PERSONER) {
    const h = el('div', 'kal-hoved ' + PK[p]);
    h.append(el('span', 'prik'), el('span', null, p));
    g.append(h);
  }

  for (let i = 0; i < 7; i++) {
    const d = new Date(man); d.setDate(man.getDate() + i);
    const iso = isoDato(d);
    const erIdag = iso === idagIso;
    const dagEl = el('div', 'kal-dag' + (erIdag ? ' idag' : '') + (i >= 5 ? ' weekend' : ''));
    dagEl.append(el('span', null, DAGE[i]), el('small', null, d.getDate() + '/' + (d.getMonth() + 1)));
    g.append(dagEl);

    for (const p of PERSONER) {
      const celle = el('div', 'kal-celle' + (erIdag ? ' idag' : ''));
      celle.tabIndex = 0;
      celle.setAttribute('role', 'button');
      celle.setAttribute('aria-label', 'Ny aftale ' + DAGE_LANG[i].toLowerCase() + ' for ' + p);
      celle.addEventListener('click', () => redigerAftale({ dato: iso, hvem: p }));
      celle.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target === celle) redigerAftale({ dato: iso, hvem: p }); });

      if (p === 'Fælles') {
        const egneFoed = alleFoed.filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso);
        for (const f of egneFoed) {
          const b = el('button', 'beg c-foed');
          b.type = 'button';
          const alder = alderPaa(f, d);
          b.append(el('b', null, foedIkon(f) + f.navn));
          if (alder != null && !f.minde) b.append(el('span', null, alder + ' år'));
          b.addEventListener('click', e => { e.stopPropagation(); redigerFoed(f); });
          celle.append(b);
        }
        for (const x of indbyggedeDageDen(iso, egneFoed, mineValg)) {
          const b = el('span', 'beg ' + dagKlasse(x));
          b.append(el('b', null, x.ikon + ' ' + x.navn));
          celle.append(b);
        }
      }

      for (const a of aftalerDen(aftaler, iso, [p])) {
        const b = el('button', 'beg ' + PK[p]);
        b.type = 'button';
        if (a.tid) b.append(el('b', null, visTid(a.tid) + (a.slut ? '–' + visTid(a.slut) : '')));
        b.append(el('span', null, a.titel + (a.gentag ? ' ↻' : '') + laas(a)));
        b.addEventListener('click', e => { e.stopPropagation(); redigerAftale(a, forekomstStart(a, iso)); });
        celle.append(b);
      }
      g.append(celle);
    }
  }
}

// forekomst = den dag man trykkede på (vigtigt for gentagne aftaler)
function redigerAftale(a, forekomst) {
  if (erBarn()) { if (a.id) visAftale(a, forekomst); return; }
  const ny = !a.id;
  const serie = !ny && !!a.gentag;
  forekomst = forekomst || a.dato;
  const varighed = a.tilDato && a.dato ? Math.max(0, dageMellem(a.dato, a.tilDato)) : 0;

  const titel = input('text', 'aftale-titel', a.titel, 'Fx fodbold, tandlæge, fødselsdag');

  // Hvem: én eller flere
  const valgte = new Set(personerI(a));
  const hvemValg = el('div', 'seg wrap');
  const tegnHvem = () => hvemValg.replaceChildren(...PERSONER.map(p => {
    const k = knap(p, null, () => {
      if (valgte.has(p)) valgte.delete(p); else valgte.add(p);
      tegnHvem();
    });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', valgte.has(p));
    return k;
  }));
  tegnHvem();

  const start = serie ? forekomst : a.dato;
  const dato = input('date', 'aftale-dato', start);
  const tilDato = input('date', 'aftale-tildato', varighed ? plusDage(start, varighed) : '');
  const tid = input('time', 'aftale-tid', a.tid);
  const slut = input('time', 'aftale-slut', a.slut);
  const note = input('text', 'aftale-note', a.note, 'Fx sted, husk madpakke');

  let gentag = a.gentag || '';
  const gentagTil = input('date', 'aftale-gentagtil', a.gentagTil || '');
  const gentagTilFelt = felt('Gentages til og med (valgfri)', gentagTil);
  gentagTilFelt.hidden = !gentag;
  const gentagValg = chipValg(Object.keys(GENTAG_NAVN), gentag, v => { gentag = v; gentagTilFelt.hidden = !v; }, v => GENTAG_NAVN[v]);

  // Kun for voksne (fx skole-hjem-samtale om et barn) – kun voksne kan vælge det
  const erVoksenNu = Data.bruger()?.rolle === 'voksen';
  // Hvem kan se aftalen: alle / kun voksne / kun mig
  let synlig = a.id ? synligFor(a) : 'alle';
  const synligValg = chipValg(['alle', 'voksne', 'mig'], synlig, v => { synlig = v; },
    v => ({ alle: 'Alle', voksne: '🔒 Kun voksne', mig: '👤 Kun mig' })[v]);
  let fri = !!a.fri;
  const friKnap = knap('🌴 Ferie / fri', null, () => { fri = !fri; friKnap.setAttribute('aria-checked', fri); });
  friKnap.setAttribute('role', 'checkbox');
  friKnap.setAttribute('aria-checked', fri);
  const voksneBoks = el('div', 'seg wrap');
  voksneBoks.append(friKnap);
  const friHint = el('p', 'hint', 'Ferie / fri: skolen vises som "Fri" på tavlen for dem, det gælder.');
  const synligHint = el('p', 'hint', '🔒 Kun voksne: børnene kan ikke se den. 👤 Kun mig: kun du kan se den.');

  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const datoRaekke = el('div', 'to-felter');
  datoRaekke.append(felt('Dato', dato), felt('Til dato (flere dage)', tilDato));
  const tidRaekke = el('div', 'to-felter');
  tidRaekke.append(felt('Fra kl. (valgfri)', tid), felt('Til kl.', slut));

  // Samler felterne – eller null hvis noget mangler
  function felter() {
    const t = titel.value.trim();
    if (!t) { titel.focus(); return null; }
    if (!dato.value) { dato.focus(); return null; }
    if (tilDato.value && tilDato.value < dato.value) { fejl.textContent = 'Til-datoen er før datoen.'; fejl.hidden = false; return null; }
    const hvem = PERSONER.filter(p => valgte.has(p));
    return {
      titel: t,
      hvem: hvem.length === 0 ? 'Fælles' : hvem.length === 1 ? hvem[0] : hvem,
      dato: dato.value,
      tilDato: tilDato.value && tilDato.value > dato.value ? tilDato.value : null,
      tid: tid.value,
      slut: tid.value ? slut.value : '',
      note: note.value.trim(),
      gentag,
      gentagTil: gentag ? gentagTil.value || null : null,
      fri
    };
  }
  const faerdig = () => { lukArk(); tegnAlt(); };

  const knapper = el('div', 'ark-knapper aftale-knapper');
  if (ny) {
    knapper.append(knap('Gem', 'knap', async () => { const f = felter(); if (!f) return; await Data.add(SYNLIG_LISTE[synlig], f); faerdig(); }));
  } else if (!serie) {
    knapper.append(
      knap('Slet', 'knap fare', async () => { await Data.remove(kalListe(a), a.id); faerdig(); }),
      knap('Gem', 'knap', async () => { const f = felter(); if (!f) return; await gemAftale(a, f, synlig); faerdig(); }));
  } else {
    const undtag = [...(a.undtagelser || [])];
    const forSidste = plusDage(forekomst, -1);
    knapper.append(
      el('p', 'hint bred', 'Aftalen gentages. Gælder ændringen kun ' + kortDag(forekomst) + ' eller også fremover?'),
      knap('Gem kun denne dag', 'knap sekundaer-knap', async () => {
        const f = felter(); if (!f) return;
        await Data.update(kalListe(a), a.id, { undtagelser: [...undtag, forekomst] });
        await Data.add(SYNLIG_LISTE[synlig], { ...f, gentag: '', gentagTil: null });
        faerdig();
      }),
      knap('Gem fra denne dag', 'knap', async () => {
        const f = felter(); if (!f) return;
        if (forekomst === a.dato) {
          await gemAftale(a, f, synlig);
        } else {
          await Data.update(kalListe(a), a.id, { gentagTil: forSidste });
          await Data.add(SYNLIG_LISTE[synlig], { ...f, undtagelser: undtag.filter(d => d >= forekomst) });
        }
        faerdig();
      }),
      knap('Slet kun denne dag', 'knap fare', async () => {
        Data.huskFoer(a.id);
        await Data.update(kalListe(a), a.id, { undtagelser: [...undtag, forekomst] });
        faerdig();
      }),
      knap('Slet fra denne dag', 'knap fare', async () => {
        if (forekomst === a.dato) await Data.remove(kalListe(a), a.id);
        else { Data.huskFoer(a.id); await Data.update(kalListe(a), a.id, { gentagTil: forSidste }); }
        faerdig();
      })
    );
  }

  aabnArk(ny ? 'Ny aftale' : 'Ret aftale', felt('Hvad', titel), felt('Hvem', hvemValg), datoRaekke, tidRaekke,
    felt('Gentages', gentagValg), gentagTilFelt, voksneBoks, friHint, felt('Note', note),
    erVoksenNu ? felt('Hvem kan se den', synligValg) : '', erVoksenNu ? synligHint : '', fejl, knapper);
  if (ny) setTimeout(() => titel.focus(), 50);
}

// "+ Ny aftale": på den valgte dag i månedsvisning, ellers i dag (eller mandag i en anden uge)
document.getElementById('kal-ny').addEventListener('click', () => {
  let dato = isoDato(new Date());
  if (kalVisning === 'maaned') dato = kalValgtDag;
  else if (kalUge !== 0) { const m = mandagDenneUge(); m.setDate(m.getDate() + kalUge * 7); dato = isoDato(m); }
  redigerAftale({ dato, hvem: 'Fælles' });
});
document.getElementById('kal-forrige').addEventListener('click', () => { if (kalVisning === 'uge') kalUge--; else kalMaaned--; tegnKalender(); });
document.getElementById('kal-naeste').addEventListener('click', () => { if (kalVisning === 'uge') kalUge++; else kalMaaned++; tegnKalender(); });
document.getElementById('kal-idag').addEventListener('click', () => { kalUge = 0; kalMaaned = 0; kalValgtDag = isoDato(new Date()); tegnKalender(); });

// ---------- Børnetavle: Olivers og Villads' egen I dag-side ----------
// Data: 'info' {barn, dato: 'ÅÅÅÅ-MM-DD', tekst, gentag?: 'uge'} – ekstra ting at huske, som ikke står i kalenderen
//        gentag 'uge' = samme ugedag hver uge fra datoen (fx "husk idrætstøj" hver tirsdag)
const ugedagAf = iso => new Date(iso + 'T00:00').getDay();
const infoDen = (alle, barn, iso) => alle.filter(x => x.barn === barn &&
  (x.dato === iso || (x.gentag === 'uge' && x.dato < iso && ugedagAf(x.dato) === ugedagAf(iso))));
const MDR_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const SKIFT_KL = 19 * 60 + 30;  // kl. 19.30 skifter børnetavlen til at vise i morgen
let tavleVisning = 'familie';   // 'familie' eller et barns navn
let tavleValgt = null;          // dag valgt med et tryk – ellers null = automatisk

function tavleAutoDato() {
  const d = new Date();
  if (d.getHours() * 60 + d.getMinutes() >= SKIFT_KL) d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}
function mandagFor(dato) {
  const m = new Date(dato);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
// Tjek hvert minut: når klokken passerer 19.30 (eller midnat), skifter tavlen af sig selv
let tavleAutoNoegle = isoDato(tavleAutoDato());
setInterval(() => {
  const n = isoDato(tavleAutoDato());
  if (n === tavleAutoNoegle) return;
  tavleAutoNoegle = n;
  tavleValgt = null;
  if (document.body.dataset.tilstand === 'klar') tegnOverblik();
}, 60000);

function tegnTavleValg() {
  const seg = document.getElementById('idag-valg');
  const profil = Data.bruger();
  const erBarn = profil && profil.rolle === 'barn' && BOERN.includes(profil.navn);
  seg.hidden = erBarn;
  if (erBarn) return;
  seg.replaceChildren(...['familie', ...BOERN].map(v => {
    const k = knap(v === 'familie' ? 'Familien' : v, null, () => {
      tavleVisning = v; tavleValgt = null; lokal.set('tavle', v); tegnOverblik();
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', v === tavleVisning);
    return k;
  }));
}

async function tegnBoernetavle(barn) {
  const boks = document.getElementById('boernetavle');
  const auto = tavleAutoDato();
  const valgt = tavleValgt || auto;
  const iso = isoDato(valgt);
  const idagIso = isoDato(new Date());
  const imorgen = new Date(); imorgen.setDate(imorgen.getDate() + 1);
  const dagNr = (valgt.getDay() + 6) % 7;   // mandag = 0
  const man = mandagFor(valgt);

  // Ugedage med markering
  const strip = el('div', 'uge-strip');
  for (let i = 0; i < 7; i++) {
    const dd = new Date(man); dd.setDate(man.getDate() + i);
    const ddIso = isoDato(dd);
    const k = knap('', 'ugedag' + (ddIso === idagIso ? ' idag' : '') + (ddIso === iso ? ' valgt' : '') + (ddIso < idagIso ? ' forbi' : ''),
      () => { tavleValgt = ddIso === isoDato(tavleAutoDato()) ? null : dd; tegnOverblik(); });
    k.setAttribute('aria-pressed', ddIso === iso);
    k.setAttribute('aria-label', DAGE_LANG[i] + ' ' + dd.getDate() + '. ' + MDR_LANG[dd.getMonth()]);
    k.append(el('span', 'ud-navn', DAGE[i]), el('span', 'ud-nr', dd.getDate()));
    strip.append(k);
  }

  // Dato
  const hoved = el('div', 'bt-hoved');
  const dagNavn = el('p', 'bt-dag', DAGE_LANG[dagNr]);
  if (iso === idagIso) dagNavn.append(el('span', 'bt-idag', 'I dag'));
  else if (iso === isoDato(imorgen)) dagNavn.append(el('span', 'bt-idag', 'I morgen'));
  const hovedTekst = el('div', 'bt-hoved-tekst');
  hovedTekst.append(dagNavn, el('p', 'bt-dato', valgt.getDate() + '. ' + MDR_LANG[valgt.getMonth()] + ' · uge ' + ugenummer(valgt)));
  hoved.append(hovedTekst);

  const kort = (titel, ...indhold) => {
    const k = el('div', 'kort');
    const top = el('div', 'kort-top');
    top.append(el('span', 'kort-label', titel));
    k.append(top, ...indhold);
    return k;
  };

  // Skema
  let skemaKort;
  const friIdag = dagNr < 5 ? friDen(await Data.list('kalender'), iso, barn) : null;
  const hellig = dagNr < 5 ? helligdagDen(iso) : null;   // fra dage.js
  if (dagNr >= 5) {
    skemaKort = kort('Skole', el('p', 'stor tom-ret', 'Weekend – ingen skole'));
    skemaKort.tavle = { stor: 'Weekend', lille: 'Ingen skole 😎', klar: true };
  } else if (hellig && !friIdag) {
    skemaKort = kort('Skole', el('p', 'stor fri-dag', 'Fri ' + hellig.ikon), el('p', 'under', hellig.navn));
    skemaKort.tavle = { stor: 'Fri ' + hellig.ikon, lille: hellig.navn, klar: true };
  } else if (friIdag) {
    skemaKort = friIdag.type === 'syg'
      ? kort('Skole', el('p', 'stor fri-dag syg-dag', 'Hjemme 🤒'), el('p', 'under', 'God bedring!' + (friIdag.note ? ' ' + friIdag.note : '')))
      : kort('Skole', el('p', 'stor fri-dag', 'Fri ' + friIkon(friIdag)), el('p', 'under', friTekst(friIdag) + (friIdag.note ? ' – ' + friIdag.note : '')));
    skemaKort.tavle = friIdag.type === 'syg' ? { stor: 'Hjemme 🤒', lille: 'God bedring!' } : { stor: 'Fri ' + friIkon(friIdag), lille: friTekst(friIdag), klar: true };
  } else if (await fastFri(barn, dagNr)) {
    skemaKort = kort('Skole', el('p', 'stor fri-dag', 'Fri 🎉'), el('p', 'under', 'Fast fridag'));
    skemaKort.tavle = { stor: 'Fri 🎉', lille: 'Fast fridag', klar: true };
  } else {
    const tidlig = aftalerDen(await Data.list('kalender'), iso, [barn]).find(a => a.type === 'tidlig' && a.tid);
    const tidligMin = tidlig ? tidSomMin(tidlig.tid)[0] : null;
    const alleRaekker = await dagensTimer(barn, dagNr);
    const timer = alleRaekker.filter(t => t.fag);
    if (!timer.length) {
      skemaKort = kort('Skole', el('p', 'under', 'Intet skema lagt ind for ' + DAGE_LANG[dagNr].toLowerCase() + '.'));
      skemaKort.tavle = { stor: 'Skole', lille: 'Intet skema lagt ind' };
    } else {
      const { start, slut, harTimer } = skoleTider(alleRaekker);
      const tider = el('p', 'bt-tider');
      if (start) tider.append(el('span', null, 'Møder ' + visTid(start)));
      if (tidlig) tider.append(el('span', 'tidlig-fri', '⏰ Fri ' + visTid(tidlig.tid) + ' i dag'));
      else if (slut) tider.append(el('span', null, 'Fri ' + visTid(slut)));
      const ol = el('ol', 'lektioner bt-lektioner');
      const farver = await skemaFarver(barn);
      const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
      for (const t of timer) {
        const [fra, til] = tidSomMin(t.tid);
        const li = lektionLi(t, iso === idagIso && fra != null && til != null && nuMin >= fra && nuMin < til, farver);
        if (tidligMin != null && fra != null && fra >= tidligMin) li.classList.add('aflyst');
        ol.append(li);
      }
      skemaKort = kort('Skole', tider, ol, forklaring(farver, new Set(timer.map(t => t.farve))));
      // Opsummering til tavle-visningen: hvad sker der nu / næste
      let friTid = tidlig ? tidlig.tid : slut;
      const nuTime = iso === idagIso ? timer.find(t => { const [fra, til] = tidSomMin(t.tid); return fra != null && til != null && nuMin >= fra && nuMin < til; }) : null;
      const startMin = tidSomMin(start)[0];
      const slutMin = tidligMin ?? tidSomMin(slut)[0];
      friTid = visTid(friTid);
      const friDel = friTid ? 'fri ' + friTid : '';
      if (iso === idagIso && slutMin != null && nuMin >= slutMin) skemaKort.tavle = { stor: 'Fri 🎉', lille: 'Skolen er slut for i dag', klar: true };
      else if (nuTime) skemaKort.tavle = { stor: nuTime.fag, lille: ['Nu', friDel].filter(Boolean).join(' · ') };
      else if (iso === idagIso && startMin != null && nuMin >= startMin) {
        // I skole: uden tider på timerne vises bare "I skole"
        const naesteT = harTimer ? timer.find(t => (tidSomMin(t.tid)[0] ?? -1) > nuMin) : null;
        skemaKort.tavle = { stor: !harTimer ? 'I skole' : naesteT ? naesteT.fag : 'Pause', lille: [naesteT ? 'Næste' : '', friDel].filter(Boolean).join(' · ') };
      } else skemaKort.tavle = { stor: start ? 'Møder ' + visTid(start) : 'Skole', lille: [timer[0].fag, friDel].filter(Boolean).join(' · ') };
    }
  }

  // Voksne kan registrere sygdom, fri eller tidligere fri direkte fra tavlen
  if (dagNr < 5 && !erBarn()) {
    const fravaer = fravaerDen(await kalenderAftaler(), iso, barn);
    skemaKort.querySelector('.kort-top').append(
      knap(fravaer ? friIkon(fravaer) + ' Ret fravær' : 'Syg / fri', 'lille-knap fravaer-knap', () => redigerFravaer(barn, iso, fravaer)));
  }

  // Mad
  const plan = await madFor(valgt, barn);
  const madKort = kort('Mad');
  for (const [felt, navn] of [['morgen', 'Morgen'], ['frokost', 'Frokost'], ['ret', 'Aften']]) {
    const ret = plan[felt];
    const r = erBarn() ? el('div', 'maaltid') : knap('', 'maaltid', () => redigerMaaltid(barn, valgt, felt));
    if (!erBarn()) r.setAttribute('aria-label', navn + ': ' + (ret || 'ikke bestemt') + '. Tryk for at ændre');
    const retEl = el('span', 'm-ret' + (ret ? '' : ' tom-ret'), ret || 'Ikke bestemt');
    if (plan.eget[felt]) retEl.append(el('span', 'eget-tag', 'Eget valg'));
    r.append(el('span', 'm-navn', navn), retEl, erBarn() ? '' : el('span', 'm-pil', '›'));
    madKort.append(r);
  }

  {
    const time = new Date().getHours();
    const felt = iso !== idagIso ? 'ret' : time < 9 ? 'morgen' : time < 13 ? 'frokost' : 'ret';
    madKort.tavle = { stor: plan[felt] || 'Ikke bestemt', lille: ({ morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' })[felt] };
  }

  const kontakt = dagNr < 5 ? await dagKontakt(barn, dagNr) : '';
  if (kontakt && skemaKort.querySelector('.bt-tider')) skemaKort.querySelector('.bt-tider').append(el('span', 'bt-kontakt', 'Kontakt: ' + kontakt));

  // "Det sker": fødselsdage, kalender (eget + fælles) og det der ellers skal ske – med billeder
  const voksen = Data.bruger()?.rolle === 'voksen';
  const foed = await foedselsdageDen(iso, barn);
  const alleKal = await Data.list('kalender');   // kun-voksne-aftaler vises aldrig på børnetavlen
  const aftaler = iDagsListe(alleKal, iso, [barn, 'Fælles']);
  const info = infoDen(await Data.list('info'), barn, iso);
  const liste = el('ul', 'sker-liste');
  for (const f of foed) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    liste.append(li);
  }
  for (const a of aftaler) {
    const li = el('li', aftaleFarve(a, [barn]));
    const kunFaelles = !personerI(a).includes(barn);
    const b = knap('', 'sker-knap', () => redigerAftale(a, forekomstStart(a, iso)));
    b.append(el('span', 'prik'), el('span', 'husk-tekst', tidTekst(a) + a.titel + (kunFaelles ? ' · hele familien' : '') + (a.note ? ' – ' + a.note : '')));
    li.append(b);
    liste.append(li);
  }
  for (const x of info) {
    const li = el('li', 'sker-info' + (infoBillede(x) ? ' med-billede' : ''));
    if (infoBillede(x)) {
      const billedKnap = knap('', 'sker-billede-knap', () => visStortBillede(infoBillede(x), x.tekst,
        voksen ? { ret: () => redigerInfo(barn, iso, x), slet: async () => { await Data.remove('info', x.id); lukArk(); tegnAlt(); } } : null));
      billedKnap.setAttribute('aria-label', 'Vis billedet stort');
      const img = el('img', 'sker-billede');
      img.src = infoBillede(x); img.alt = ''; img.loading = 'lazy';
      billedKnap.append(img);
      li.append(billedKnap);
    } else {
      li.append(el('span', 'prik'));
    }
    const tekstEl = voksen ? knap('', 'sker-knap', () => redigerInfo(barn, iso, x)) : el('span', 'sker-knap');
    tekstEl.append(el('span', 'husk-tekst', (x.tekst || '') + (x.gentag === 'uge' ? ' ↻' : '')));
    li.append(tekstEl);
    if (voksen) {
      const mere = knap('', 'mere-knap', () => redigerInfo(barn, iso, x));
      mere.innerHTML = IKON_MERE;
      mere.setAttribute('aria-label', 'Ret eller slet ' + (x.tekst || 'billedet'));
      li.append(mere);
    }
    liste.append(li);
  }
  const tomt = !foed.length && !aftaler.length && !info.length;
  const skerTitel = iso === idagIso ? 'Det sker i dag' : iso === isoDato(imorgen) ? 'Det sker i morgen' : 'Det sker';
  let skerKort = null;
  {
    // Kortet laves altid (tavlen har altid feltet); i listen skjules et tomt kort for børn
    if (tomt) liste.append(el('li', 'tom-husk', 'Intet særligt endnu.'));
    const dele = [liste];
    if (info.some(x => x.piktogram)) dele.push(el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA'));
    if (voksen) dele.push(knap('+ Tilføj', 'lille-knap', () => redigerInfo(barn, iso, {})));
    skerKort = kort(skerTitel, ...dele);
    const tekster = [...liste.querySelectorAll('.husk-tekst')].map(x => x.textContent).filter(Boolean);
    skerKort.kunTavle = tomt && !voksen;
    skerKort.tavle = { noegle: 'sker', ikon: '🗓️', titel: skerTitel, bred: true, stor: tomt ? (iso === idagIso ? 'Intet særligt i dag' : iso === isoDato(imorgen) ? 'Intet særligt i morgen' : 'Intet særligt') : '',
      linjer: tomt ? null : tekster.slice(0, 3), lille: tekster.length > 3 ? '+ ' + (tekster.length - 3) + ' mere' : '',
      billede: info.map(infoBillede).find(Boolean) || '' };
  }

  Object.assign(skemaKort.tavle, { noegle: 'skole', ikon: '🎒', titel: 'Skole' });
  Object.assign(madKort.tavle, { noegle: 'mad', ikon: '🍽️', titel: 'Mad' });

  const gitter = el('div', 'overblik');
  const alfie = await alfieKort(barn);   // fra sjov.js
  if (alfie) gitter.append(alfie);
  // Rækkefølge: det der skifter fra dag til dag øverst (Det sker), så pligter + belønninger (hænger sammen),
  // rutiner og skole, mad og nedtælling. Samme rækkefølge i liste og tavle.
  const rutiner = await rutineKort(barn, valgt);   // fra mere.js
  const pligter = await pligtKort(barn, iso === idagIso ? 'Pligter i dag' : 'Pligter i dag (' + DAGE_LANG[idagNr()].toLowerCase() + ')');   // fra mere.js
  const beloen = await beloenningKort(barn);   // fra mere.js
  const nedtael = await nedtaellingKort(barn);   // fra sjov.js
  const raekke = [skerKort, pligter, beloen, rutiner, skemaKort, madKort, nedtael].filter(Boolean);
  gitter.append(...raekke.filter(k => !k.kunTavle));
  // Vejr (og evt. sol) for den viste dag – efter barnets egne valg; hentes i baggrunden
  const barnValg = await valgFor(barn);
  const vejrPlads = el('div', 'vejr-plads');
  if (barnValg.vejr || barnValg.sol) {
    vejrStribe(iso, barnValg.sol, barnValg.vejr).then(k => { if (k) vejrPlads.replaceChildren(k); });
  }
  hoved.append(visningsKnap());
  if (tavleStil() === 'tavle') {
    // Tavle-visning: alt som fliser på en tavle; tryk på en flise for at "zoome" ind
    // Fast rækkefølge (samme som i listen), så man altid ved, hvor tingene står
    const kortListe = raekke.filter(k => k.tavle);
    const ramme = el('div', 'tavle-ramme ' + (PK[barn] || ''));
    const flade = el('div', 'tavle-flade');
    const fliser = el('div', 'fliser');
    if (alfie) fliser.append(alfie);   // makkeren hænger på tavlen sammen med fliserne
    tavleKort = {};
    for (const k of kortListe) { tavleKort[k.tavle.noegle] = k; fliser.append(flise(k)); }
    flade.append(fliser);
    ramme.append(flade);
    boks.classList.add('som-tavle');
    boks.replaceChildren(strip, hoved, vejrPlads, ramme);
    opdaterZoom();
  } else {
    tavleKort = {};
    lukZoom();
    boks.classList.remove('som-tavle');
    boks.replaceChildren(strip, hoved, vejrPlads, gitter);
  }
}

// ---------- Tavle-visning: fliser + zoom ----------
// Valget huskes pr. enhed (fx en tablet der altid står med tavlen)
const tavleStil = () => lokal.get('tavle-stil') || 'tavle';
let tavleKort = {};      // noegle → det fulde kort fra seneste tegning
let zoomNoegle = null;   // hvilken flise der er zoomet ind på
// Én knap, der viser hvad man skifter til: "☰ Liste" i tavle-visning og "▦ Tavle" i liste-visning
function visningsKnap() {
  const til = tavleStil() === 'tavle' ? 'liste' : 'tavle';
  const k = knap(til === 'liste' ? '☰ Vis som liste' : '▦ Vis som tavle', 'lille-knap visning-knap', () => { lokal.set('tavle-stil', til); tegnOverblik(); });
  return k;
}
function flise(k) {
  const t = k.tavle;
  const b = knap('', 'flise' + (t.klar ? ' klar' : '') + (t.haster ? ' haster' : '') + (t.bred ? ' bred' : ''), () => aabnZoom(t.noegle, b));
  b.dataset.noegle = t.noegle;
  const top = el('span', 'fl-top');
  top.append(el('span', 'fl-ikon', t.ikon), el('span', 'fl-titel', t.titel));
  if (t.klar) top.append(el('span', 'fl-klar', '✓'));
  b.append(top);
  if (t.billede) { const img = el('img', 'fl-billede'); img.src = t.billede; img.alt = ''; b.append(img); }
  if (t.stor) b.append(el('span', 'fl-stor', t.stor));
  if (t.linjer) { const ul = el('ul', 'fl-linjer'); t.linjer.forEach(x => ul.append(el('li', null, x))); b.append(ul); }
  if (t.lille) b.append(el('span', 'fl-lille', t.lille));
  if (t.andel != null) b.append(fremskridt(t.andel));
  b.setAttribute('aria-label', t.titel + ': ' + (t.stor || (t.linjer || []).join(', ')) + (t.lille ? ', ' + t.lille : '') + '. Tryk for at åbne');
  return b;
}
let zoomEl = null;
function zoomBoks() {
  if (zoomEl) return zoomEl;
  zoomEl = el('div', 'zoom-baggrund');
  zoomEl.hidden = true;
  const vindue = el('div', 'zoom-vindue');
  vindue.setAttribute('role', 'dialog');
  vindue.setAttribute('aria-modal', 'true');
  const luk = knap('', 'zoom-luk', () => lukZoom());
  luk.innerHTML = '&times;';
  luk.setAttribute('aria-label', 'Luk');
  vindue.append(luk, el('div', 'zoom-indhold boernetavle'));   // samme udseende som på tavlen
  zoomEl.append(vindue);
  zoomEl.addEventListener('click', e => { if (e.target === zoomEl) lukZoom(); });   // tryk ved siden af = luk
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !zoomEl.hidden && arkEl.hidden) lukZoom(); });
  document.body.append(zoomEl);
  return zoomEl;
}
function aabnZoom(noegle, fra) {
  const z = zoomBoks();
  zoomNoegle = noegle;
  opdaterZoom();
  z.hidden = false;
  document.body.style.overflow = 'hidden';
  const vindue = z.querySelector('.zoom-vindue');
  // Vinduet "vokser" ud fra flisen
  if (fra && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const a = fra.getBoundingClientRect(), b = vindue.getBoundingClientRect();
    vindue.style.transition = 'none';
    vindue.style.transformOrigin = 'top left';
    vindue.style.transform = 'translate(' + (a.left - b.left) + 'px,' + (a.top - b.top) + 'px) scale(' + (a.width / b.width) + ',' + (a.height / b.height) + ')';
    vindue.style.opacity = '.4';
    vindue.getBoundingClientRect();
    vindue.style.transition = 'transform .22s ease-out, opacity .18s';
    vindue.style.transform = '';
    vindue.style.opacity = '';
  }
}
// Efter en ændring (fx et flueben) tegnes tavlen om – det zoomede kort skiftes til det nye
function opdaterZoom() {
  if (!zoomNoegle || !zoomEl) return;
  const k = tavleKort[zoomNoegle];
  if (!k) { lukZoom(); return; }
  zoomEl.querySelector('.zoom-indhold').replaceChildren(k);
}
function lukZoom() {
  zoomNoegle = null;
  if (!zoomEl || zoomEl.hidden) return;
  zoomEl.hidden = true;
  zoomEl.querySelector('.zoom-indhold').replaceChildren();
  if (arkEl.hidden) document.body.style.overflow = '';
}

// ---------- "Det sker" med billeder (piktogrammer fra ARASAAC eller eget foto) ----------
// Data: 'info' {barn, dato, tekst, piktogram?: ARASAAC-nummer, billede?: foto}
const PIKTO_URL = id => 'https://static.arasaac.org/pictograms/' + id + '/' + id + '_300.png';
const infoBillede = x => (x.piktogram ? PIKTO_URL(x.piktogram) : x.billede || '');
// ARASAAC kan ikke søges på dansk – genvejene oversætter de almindelige ord
const PIKTO_GENVEJE = {
  'Svømning': 'swimming', 'Fodbold': 'football', 'Idræt': 'gym', 'Gymnastik': 'gymnastics', 'Idrætstøj': 'tracksuit',
  'Madpakke': 'lunch box', 'Tandlæge': 'dentist', 'Læge': 'doctor', 'Frisør': 'hairdresser', 'Fødselsdag': 'birthday',
  'Gave': 'present', 'Bedstemor': 'grandmother', 'Bedstefar': 'grandfather', 'Ven': 'friend', 'Leg': 'play',
  'Biograf': 'cinema', 'Bus': 'bus', 'Bil': 'car', 'Tog': 'train', 'Cykel': 'bicycle', 'Tur': 'excursion',
  'Skole': 'school', 'Ferie': 'holiday', 'Regntøj': 'raincoat', 'Bad': 'shower', 'Sove': 'sleep', 'Besøg': 'visit'
};

async function soegPiktogrammer(ord) {
  try {
    const svar = await fetch('https://api.arasaac.org/v1/pictograms/en/search/' + encodeURIComponent(ord.trim().toLowerCase()));
    if (!svar.ok) return [];
    return (await svar.json()).slice(0, 24).map(p => p._id);
  } catch { return []; }
}

// Billedvælger: piktogram (ARASAAC) eller eget foto. Returnerer {dele, vaerdi()}.
// naarValgt(dansk) kaldes når et piktogram vælges via en dansk genvej (fx til at udfylde en tekst).
function billedVaelger(start = {}, naarValgt = () => {}) {
  let piktogram = start.piktogram || null;
  let billede = start.billede || '';

  const valgt = el('div', 'valgt-billede');
  const tegnValgt = () => {
    valgt.replaceChildren();
    const url = piktogram ? PIKTO_URL(piktogram) : billede;
    if (!url) return;
    const img = el('img'); img.src = url; img.alt = 'Valgt billede';
    valgt.append(img, knap('Fjern billede', 'lille-knap', () => { piktogram = null; billede = ''; tegnValgt(); tegnResultater(sidste); }));
  };

  const resultater = el('div', 'pikto-grid');
  let sidste = [];
  let dansk = '';
  const tegnResultater = ids => {
    sidste = ids;
    resultater.replaceChildren(...ids.map(id => {
      const k = knap('', 'pikto' + (id === piktogram ? ' valgt' : ''), () => {
        piktogram = id; billede = ''; tegnValgt(); tegnResultater(sidste);
        naarValgt(dansk);
      });
      const img = el('img'); img.src = PIKTO_URL(id); img.alt = ''; img.loading = 'lazy';
      k.append(img);
      return k;
    }));
  };
  const status = el('p', 'hint');
  const soegeord = input('text', 'pikto-soeg', '', 'Søg (på engelsk), fx dentist = tandlæge');
  soegeord.enterKeyHint = 'search';
  const soeg = async (ord, daOrd) => {
    if (!ord) return;
    dansk = daOrd || '';
    status.textContent = 'Søger…';
    const ids = await soegPiktogrammer(ord);
    status.textContent = ids.length ? 'Tryk på et billede for at vælge det.' : 'Ingen billeder fundet. Prøv et andet ord på engelsk.';
    tegnResultater(ids);
  };
  const soegForm = el('form', 'tilfoj');
  soegForm.append(soegeord, el('button', 'knap', 'Søg'));
  soegForm.addEventListener('submit', e => { e.preventDefault(); soeg(soegeord.value.trim()); });

  const genveje = el('div', 'forslag');
  for (const [da, en] of Object.entries(PIKTO_GENVEJE)) {
    genveje.append(knap(da, null, () => { soegeord.value = en; soeg(en, da); }));
  }

  const fil = el('label', 'lille-knap fil-knap', 'Tag eller vælg eget foto');
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*';
  filInput.addEventListener('change', async () => {
    if (!filInput.files[0]) return;
    try { billede = await laesBillede(filInput.files[0]); piktogram = null; tegnValgt(); tegnResultater(sidste); } catch { status.textContent = 'Billedet kunne ikke læses.'; }
  });
  fil.append(filInput);

  tegnValgt();
  return {
    dele: [valgt, el('label', 'felt-label', 'Billede'), genveje, soegForm, status, resultater, fil,
      el('p', 'kilde', 'Piktogrammer: Sergio Palao / ARASAAC, CC BY-NC-SA')],
    vaerdi: () => ({ piktogram: piktogram || null, billede: piktogram ? '' : billede })
  };
}

// Vis et billede stort
// handlinger = {ret, slet} giver voksne knapper under billedet
function visStortBillede(url, tekst, handlinger = null) {
  const img = el('img', 'stort-billede hvid-bund');
  img.src = url; img.alt = tekst || '';
  const dele = [img];
  if (handlinger) {
    const knapper = el('div', 'ark-knapper');
    const slet = knap('Slet', 'knap fare', () => bekraeft(slet, handlinger.slet));
    slet.dataset.tekst = 'Slet';
    slet.dataset.handling = 'slette';
    knapper.append(slet, knap('Ret', 'knap', handlinger.ret));
    dele.push(knapper);
  }
  aabnArk(tekst || 'Billede', ...dele);
}

function redigerInfo(barn, iso, x) {
  const ny = !x.id;
  const tekst = input('text', 'info-tekst', x.tekst, 'Fx mormor henter, husk idrætstøj');
  const vaelger = billedVaelger(x, dansk => { if (!tekst.value.trim() && dansk) tekst.value = dansk; });

  // Kun denne dag eller hver uge på samme ugedag
  const ugedag = DAGE_LANG[(new Date((x.dato || iso) + 'T00:00').getDay() + 6) % 7].toLowerCase();
  let gentag = x.gentag === 'uge' ? 'uge' : '';
  const gentagValg = chipValg(['', 'uge'], gentag, v => { gentag = v; }, v => (v ? 'Hver ' + ugedag : 'Kun denne dag'));
  // Ny note: kan sættes på flere børns tavler på én gang
  const til = new Set([barn]);
  const tilValg = el('div', 'seg wrap');
  const tegnTil = () => tilValg.replaceChildren(...BOERN.map(b => {
    const k = knap(b, PK[b] || null, () => { if (til.has(b) && til.size > 1) til.delete(b); else til.add(b); tegnTil(); });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', til.has(b));
    return k;
  }));
  tegnTil();
  const gem = knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    const b = vaelger.vaerdi();
    if (!t && !b.piktogram && !b.billede) { tekst.focus(); return; }
    const felter = { tekst: t, ...b, gentag };
    if (ny) for (const b of BOERN.filter(b => til.has(b))) await Data.add('info', { barn: b, dato: iso, ...felter });
    else await Data.update('info', x.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('info', x.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);

  const d = new Date(iso + 'T00:00');
  aabnArk((ny ? 'Det sker' : 'Ret') + ' · ' + barn + ', ' + DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase(),
    felt('Hvad sker der?', tekst), ny ? felt('Hvis tavle?', tilValg) : '', felt('Hvornår', gentagValg),
    x.gentag === 'uge' ? el('p', 'hint', 'Gentages hver ' + ugedag + '. Ændringer og sletning gælder alle ugerne.') : '',
    ...vaelger.dele, el('p', 'hint', ny ? 'Vises under "Det sker" på de valgte tavler og på familiens I dag.' : 'Vises på ' + barn + 's tavle under "Det sker" og på familiens I dag.'), knapper);
}

// Vælg et måltid til et barn (direkte fra børnetavlen)
async function redigerMaaltid(barn, dato, felt) {
  const NAVN = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const plan = await madFor(dato, barn);
  const voksen = Data.bruger()?.rolle === 'voksen';
  const kanGoereFast = voksen && felt !== 'ret';
  const fastLabel = el('label', 'check');
  const fastTjek = el('input'); fastTjek.type = 'checkbox'; fastTjek.id = 'goer-fast';
  fastLabel.append(fastTjek, 'Gør det fast hver ' + DAGE_LANG[dag].toLowerCase());
  const vaelg = async v => {
    if (kanGoereFast && fastTjek.checked) {
      await gemFast(barn, dag, felt, v);
      if (plan.eget[felt]) await gemMad(dag, felt, '', ugeIso, barn);   // fjern dagens undtagelse
    } else {
      await gemMad(dag, felt, v, ugeIso, barn);
    }
    lukArk(); tegnAlt();
  };

  const inp = input('text', 'maaltid-felt', plan.eget[felt] ? plan[felt] : '', 'Skriv selv');
  inp.setAttribute('list', DATALISTE[felt]);
  inp.enterKeyHint = 'done';
  const form = el('form', 'tilfoj');
  form.append(inp, el('button', 'knap', 'Vælg'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = inp.value.trim();
    if (!v) return;
    await gemFavorit(felt, v);
    vaelg(v);
  });

  const favs = (await Data.list('favoritter')).filter(f => f.type === felt).map(f => f.tekst).sort((a, b) => a.localeCompare(b, 'da'));
  const chips = el('div', 'forslag');
  for (const v of favs) {
    const k = knap('', null, () => vaelg(v));
    k.append(el('span', 'plus', '+'), v);
    if (v === plan[felt]) k.classList.add('valgt');
    chips.append(k);
  }

  const knapper = el('div', 'ark-knapper');
  const terning = knap('', 'knap terning-knap', () => {
    const mulige = favs.filter(v => v !== plan[felt]);
    if (mulige.length) vaelg(mulige[Math.floor(Math.random() * mulige.length)]);
  });
  terning.innerHTML = IKON_TERNING + '<span>Slå med terningen</span>';
  knapper.append(terning);
  const standard = felt === 'ret' ? plan.faelles.ret : plan.fast[felt];
  if (plan.eget[felt]) {
    knapper.append(knap(felt === 'ret' ? 'Brug familiens' : 'Brug den faste', 'knap sekundaer-knap',
      async () => { await gemMad(dag, felt, '', ugeIso, barn); lukArk(); tegnAlt(); }));
  }

  const forklaring = felt === 'ret'
    ? (standard ? 'Familiens madplan: ' + standard : 'Der står ikke noget i familiens madplan.')
    : (standard ? 'Fast hver ' + DAGE_LANG[dag].toLowerCase() + ': ' + standard : 'Der er ikke noget fast for ' + DAGE_LANG[dag].toLowerCase() + '.');
  aabnArk(NAVN[felt] + ' til ' + barn + ' · ' + DAGE_LANG[dag].toLowerCase(),
    el('p', 'hint', forklaring), form, chips, kanGoereFast ? fastLabel : '', knapper);
}

// ---------- Fødselsdage og mærkedage ----------
// Data: 'foedselsdage' {navn, dato: 'ÅÅÅÅ-MM-DD', aarsdag?: true} eller {navn, maerkedag: 'DD-MM' | 'morsdag'}
//   aarsdag = fx bryllupsdag (viser antal år). Helligdage og almindelige mærkedage kommer fra dage.js
let visAlleFoed = false;
const VIS_FOED = 6;

function morsdag(aar) {  // 2. søndag i maj
  const d = new Date(aar, 4, 1);
  return new Date(aar, 4, 1 + ((7 - d.getDay()) % 7) + 7);
}
function datoIAar(f, aar) {
  if (f.maerkedag === 'morsdag') return morsdag(aar);
  if (f.dato) return new Date(aar, Number(f.dato.slice(5, 7)) - 1, Number(f.dato.slice(8, 10)));
  return new Date(aar, Number(f.maerkedag.slice(3, 5)) - 1, Number(f.maerkedag.slice(0, 2)));
}
function naesteGang(f, fra) {
  let d = datoIAar(f, fra.getFullYear());
  if (d < fra) d = datoIAar(f, fra.getFullYear() + 1);
  return d;
}
const alderPaa = (f, d) => (f.dato ? d.getFullYear() - Number(f.dato.slice(0, 4)) : null);
const foedIkon = f => (f.minde ? '🕯️ ' : f.dato ? (f.aarsdag ? '🎉 ' : '🇩🇰 ') : '');
const foedTekst = f => (f.indbygget ? f.ikon + ' ' + f.navn
  : f.minde ? '🕯️ ' + f.navn + ' · mindedag'
  : f.aarsdag && f.alder != null ? '🎉 ' + f.navn + ' · ' + f.alder + ' år'
  : f.alder != null ? '🇩🇰 ' + f.navn + ' fylder ' + f.alder : f.navn);
// Fødselsdage, årsdage og mærkedage den dag – inkl. helligdage/mærkedage fra dage.js
async function foedselsdageDen(iso, hvem = Data.bruger()?.navn) {
  const d = new Date(iso + 'T00:00');
  const valg = await valgFor(hvem);   // fra dage.js
  const egne = (await foedselsListe(hvem))
    .filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso)
    .map(f => ({ ...f, alder: alderPaa(f, d) }));
  return [...egne, ...indbyggedeDageDen(iso, egne, valg)];
}
const dagKlasse = f => (f.indbygget ? (f.hellig ? 'c-hellig' : 'c-dag') : 'c-foed');

async function tegnFoedselsdage() {
  const ul = document.getElementById('foed-liste');
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const alle = (await foedselsListe()).map(f => {
    const d = naesteGang(f, idag);
    return { f, d, dage: Math.round((d - idag) / 86400000), alder: alderPaa(f, d) };
  }).sort((a, b) => a.d - b.d || a.f.navn.localeCompare(b.f.navn, 'da'));

  ul.replaceChildren();
  if (!alle.length) ul.append(el('li', 'tom', 'Ingen fødselsdage endnu. Tryk "Tilføj".'));
  for (const r of (visAlleFoed ? alle : alle.slice(0, VIS_FOED))) {
    const li = el('li');
    const b = knap('', 'foed' + (r.dage === 0 ? ' idag' : ''), () => redigerFoed(r.f));
    const dato = el('span', 'foed-dato');
    dato.append(el('b', null, r.d.getDate()), el('small', null, MDR[r.d.getMonth()]));
    const midt = el('span', 'foed-midt');
    midt.append(el('span', 'foed-navn', r.f.navn),
      el('span', 'foed-under', r.f.minde ? '🕯️ Mindedag' : r.alder == null ? 'Mærkedag' : r.f.aarsdag ? '🎉 ' + r.alder + ' år' : '🇩🇰 Fylder ' + r.alder + ' år'));
    const naar = r.dage === 0 ? 'I dag' : r.dage === 1 ? 'I morgen' : 'Om ' + r.dage + ' dage';
    b.append(dato, midt, el('span', 'foed-naar', naar));
    li.append(b);
    ul.append(li);
  }
  const alleKnap = document.getElementById('foed-alle');
  alleKnap.hidden = alle.length <= VIS_FOED;
  alleKnap.textContent = visAlleFoed ? 'Vis færre' : 'Vis alle (' + alle.length + ')';
}
document.getElementById('foed-alle').addEventListener('click', () => { visAlleFoed = !visAlleFoed; tegnFoedselsdage(); });
document.getElementById('ny-foed').addEventListener('click', () => redigerFoed({}));

function redigerFoed(f) {
  if (f.person) return visPerson(f.person.id);   // fødselsdage fra familien rettes på personen (familie.js)
  if (erBarn()) return;
  const ny = !f.id;
  const navn = input('text', 'foed-navn', f.navn, 'Fx Mormor');
  const knapper = el('div', 'ark-knapper');
  const fejl = el('p', 'fejl'); fejl.hidden = true;

  // Mors dag beregnes automatisk og har ingen dato at rette
  if (f.maerkedag === 'morsdag') {
    const gem = knap('Gem', 'knap', async () => {
      if (!navn.value.trim()) { navn.focus(); return; }
      await Data.update('foedselsdage', f.id, { navn: navn.value.trim() });
      lukArk(); tegnAlt();
    });
    knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('foedselsdage', f.id); lukArk(); tegnAlt(); }), gem);
    aabnArk('Mærkedag', felt('Navn', navn), el('p', 'hint', 'Mors dag falder 2. søndag i maj og beregnes automatisk.'), knapper);
    return;
  }

  const aar = new Date().getFullYear();
  const startDato = f.dato || (f.maerkedag ? aar + '-' + f.maerkedag.slice(3, 5) + '-' + f.maerkedag.slice(0, 2) : '');
  const dato = input('date', 'foed-dato', startDato);
  let slags = f.maerkedag ? 'maerkedag' : f.aarsdag ? 'aarsdag' : 'foed';
  const datoFelt = felt(slags === 'foed' ? 'Født' : 'Dato', dato);
  const slagsValg = chipValg(['foed', 'aarsdag', 'maerkedag'], slags, v => {
    slags = v; datoFelt.querySelector('label, .felt-label') && (datoFelt.querySelector('label, .felt-label').textContent = v === 'foed' ? 'Født' : 'Dato');
  }, v => ({ foed: '🇩🇰 Fødselsdag', aarsdag: '🎉 Årsdag', maerkedag: 'Mærkedag (uden år)' })[v]);

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    if (!dato.value) { fejl.textContent = 'Vælg en dato.'; fejl.hidden = false; return; }
    const felter = slags === 'maerkedag'
      ? { navn: n, maerkedag: dato.value.slice(8, 10) + '-' + dato.value.slice(5, 7), dato: null, aarsdag: false }
      : { navn: n, dato: dato.value, maerkedag: null, aarsdag: slags === 'aarsdag' };
    if (ny) await Data.add('foedselsdage', felter); else await Data.update('foedselsdage', f.id, felter);
    lukArk(); tegnAlt();
  });
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('foedselsdage', f.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny fødselsdag eller mærkedag' : 'Ret ' + (f.aarsdag ? 'årsdag' : f.dato ? 'fødselsdag' : 'mærkedag'), felt('Navn', navn), felt('Slags', slagsValg), datoFelt,
    el('p', 'hint', 'Årsdag = fx bryllupsdag – viser hvor mange år. Helligdage, jul, halloween osv. kommer automatisk.'), fejl, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// ---------- I dag – overblik ----------
async function tegnOverblik() {
  tegnTavleValg();
  const erBoernetavle = tavleVisning !== 'familie';
  document.getElementById('familie-overblik').hidden = erBoernetavle;
  document.getElementById('boernetavle').hidden = !erBoernetavle;
  if (!erBoernetavle) lukZoom();
  if (erBoernetavle) {
    return tegnBoernetavle(tavleVisning);
  }
  const idag = idagNr();

  // Mine egne pligter (kun for voksne – fra mere.js)
  // Børnenes ønsker om at indløse belønninger – venter på en voksen
  const oensker = document.getElementById('ov-oensker');
  const oenskeIndhold = await oenskerIndhold();   // fra mere.js
  oensker.replaceChildren(...oenskeIndhold);
  oensker.hidden = !oenskeIndhold.length;

  const minePladser = document.getElementById('ov-mine-pligter');
  const mine = await minePligterKort();
  minePladser.replaceChildren(...(mine ? [...mine.childNodes] : []));
  minePladser.hidden = !mine;

  // Kalender i dag og i morgen
  const aftaler = await kalenderAftaler();
  const iDagIso = isoDato(new Date());
  const imorgenDato = new Date(); imorgenDato.setDate(imorgenDato.getDate() + 1);
  const iMorgenIso = isoDato(imorgenDato);
  const ovKal = document.getElementById('ov-kal');
  ovKal.replaceChildren();
  const dagens = iDagsListe(aftaler, iDagIso);
  const foedIdag = await foedselsdageDen(iDagIso);
  for (const f of foedIdag) {
    const li = el('li', dagKlasse(f));
    li.append(el('span', 'prik'), el('span', null, foedTekst(f)));
    ovKal.append(li);
  }
  // Børnenes noter fra "Det sker" på deres tavler (fx "Husk idrætstøj")
  const alleInfo = await Data.list('info');
  const noter = BOERN.flatMap(b => infoDen(alleInfo, b, iDagIso).map(x => ({ b, x })));
  if (!dagens.length && !foedIdag.length && !noter.length) ovKal.append(el('li', null, 'Intet i kalenderen i dag'));
  for (const a of dagens) {
    const li = el('li', aftaleFarve(a));
    li.append(el('span', 'prik'), el('span', null, tidTekst(a) + a.titel + laas(a) + ' · ' + personerI(a).join(', ')));
    ovKal.append(li);
  }
  // To do med frist i dag (eller over tid)
  const dagensTodo = (await Data.list('todo')).filter(p => !p.klaret && p.frist && p.frist <= iDagIso);
  for (const p of dagensTodo) {
    const li = el('li', p.hvem ? PK[p.hvem] : 'p' + p.prio);
    li.append(el('span', 'prik'), el('span', null, '☑️ ' + p.tekst + (p.hvem ? ' · ' + p.hvem : '') + (p.frist < iDagIso ? ' (over tid)' : '')));
    ovKal.append(li);
  }
  const samlet = new Map();
  for (const { b, x } of noter) {
    const n = x.tekst || 'Se billedet på tavlen';
    samlet.set(n, [...(samlet.get(n) || []), b]);
  }
  for (const [n, hvem] of samlet) {
    const li = el('li', hvem.length > 1 ? 'c-faelles' : PK[hvem[0]]);
    li.append(el('span', 'prik'), el('span', null, '📌 ' + n + ' · ' + hvem.join(' og ')));
    ovKal.append(li);
  }
  const morgen = iDagsListe(aftaler, iMorgenIso);
  const morgenTekster = [
    ...(await foedselsdageDen(iMorgenIso)).map(foedTekst),
    ...morgen.map(a => tidTekst(a) + a.titel + ' (' + personerI(a).join(', ') + ')')
  ];
  document.getElementById('ov-kal-imorgen').textContent = morgenTekster.length ? 'I morgen: ' + morgenTekster.join(', ') : '';
  // Solopgang og solnedgang (sted kan sættes under forbogstav-knappen)
  const mineValg = await valgFor(Data.bruger()?.navn);
  const sol = mineValg.sol ? solTider(new Date(), await familieSted()) : null;   // fra dage.js
  const ovSol = document.getElementById('ov-sol'), ovVejr = document.getElementById('ov-vejr');
  ovSol.replaceChildren(...(sol ? [solSpan(sol)] : []));
  ovVejr.replaceChildren();
  // Vejret hentes i baggrunden; er linjen kort, kommer solen med på samme linje
  if (mineValg.vejr) vejrLinje().then(t => {   // fra vejr.js
    if (!t) return;
    if (sol && t.length <= 34) { ovSol.replaceChildren(); ovVejr.replaceChildren(t + '  ·  ', solSpan(sol)); }
    else ovVejr.textContent = t;
  });

  const ret = (await madFor(new Date())).ret;
  const retEl = document.getElementById('ov-ret');
  retEl.textContent = ret || 'Ikke bestemt endnu';
  retEl.classList.toggle('tom-ret', !ret);
  const imorgen = (await madFor(imorgenDato)).ret;
  // Drengenes egne valg til aftensmad (afvigelser fra familiens)
  const afvigelser = async dato => (await Promise.all(BOERN.map(async b => [b, await madFor(dato, b)])))
    .filter(([, m]) => m.eget.ret).map(([b, m]) => b + ': ' + m.ret);
  const idagAfv = await afvigelser(new Date());
  const afvEl = document.getElementById('ov-ret-boern');
  afvEl.replaceChildren(...idagAfv.map(t => el('span', 'afvigelse', t)));
  afvEl.hidden = !idagAfv.length;
  const morgenAfv = await afvigelser(imorgenDato);
  document.getElementById('ov-ret-imorgen').textContent = imorgen || morgenAfv.length
    ? 'I morgen: ' + (imorgen || 'ikke bestemt') + (morgenAfv.length ? ' (' + morgenAfv.join(', ') + ')' : '')
    : '';

  // Skole: i dag, eller næste skoledag i weekenden / efter skole
  let dag = idag, label = 'Skole i dag';
  if (idag >= 5) { dag = 0; label = 'Skole på mandag'; }
  const skoleIso = plusDage(iDagIso, idag >= 5 ? 7 - idag : 0);
  document.getElementById('ov-skole-label').textContent = label;
  const skole = document.getElementById('ov-skole');
  skole.replaceChildren();
  for (const barn of BOERN) {
    const timer = (await dagensTimer(barn, dag)).filter(t => t.fag);
    const linje = el('div', 'barn-linje');
    linje.append(el('span', 'barn-navn', barn));
    const helligSkole = helligdagDen(skoleIso);
    const fri = friDen(aftaler, skoleIso, barn) || (helligSkole && { titel: helligSkole.navn, dato: skoleIso, fri: true, helligIkon: helligSkole.ikon });
    const tidlig = aftalerDen(aftaler, skoleIso, [barn]).find(a => a.type === 'tidlig' && a.tid);
    if (fri) {
      linje.append(el('span', 'barn-fri', fri.type === 'syg' ? 'Syg 🤒' : 'Fri ' + (fri.helligIkon || friIkon(fri))), el('span', 'barn-fag', fri.type === 'syg' ? 'Hjemme i dag' : friTekst(fri)));
    } else if (await fastFri(barn, dag)) {
      linje.append(el('span', 'barn-fri', 'Fri 🎉'), el('span', 'barn-fag', 'Fast fridag'));
    } else if (tidlig) {
      linje.append(el('span', 'barn-fri', '⏰ Fri ' + visTid(tidlig.tid)), el('span', 'barn-fag', 'Tidligere fri i dag'));
    } else if (!timer.length) {
      linje.append(el('span', 'barn-fri', 'Intet skema'));
    } else {
      const { start, slut } = skoleTider(await dagensTimer(barn, dag));
      linje.append(el('span', 'barn-fri', slut ? 'Fri ' + visTid(slut) : ''));
      linje.append(el('span', 'barn-fag', (start ? 'Møder ' + visTid(start) + ' · ' : '') + [...new Set(timer.map(t => t.fag))].join(', ')));
    }
    skole.append(linje);
  }

  // To do: de vigtigste åbne
  const todo = (await Data.list('todo')).filter(p => !p.klaret).sort((a, b) => a.prio - b.prio);
  const ovTodo = document.getElementById('ov-todo');
  ovTodo.replaceChildren();
  if (!todo.length) ovTodo.append(el('li', null, 'Ingen åbne opgaver'));
  for (const p of todo.slice(0, 4)) {
    const li = el('li', 'p' + p.prio);
    const ekstra = [p.hvem, p.frist ? fristTekst(p.frist).tekst : ''].filter(Boolean).join(' · ');
    li.append(el('span', 'prik'), el('span', null, p.tekst), ekstra ? el('span', 'todo-ekstra', ' · ' + ekstra) : '');
    ovTodo.append(li);
  }
  document.getElementById('ov-todo-antal').textContent = todo.length > 4 ? '+' + (todo.length - 4) + ' mere ›' : 'Alle ›';

  // Indkøb
  const varer = (await Data.list('indkob')).filter(p => !p.klaret);
  const ovInd = document.getElementById('ov-indkob');
  ovInd.replaceChildren();
  if (!varer.length) ovInd.append(el('span', null, 'Listen er tom'));
  for (const v of varer.slice(0, 8)) ovInd.append(el('span', v.af ? 'hvem-tag ' + (PK[v.af] || '') : null, v.tekst + (v.af ? ' · ' + v.af : '')));
  document.getElementById('ov-indkob-antal').textContent = varer.length ? varer.length + (varer.length === 1 ? ' vare ›' : ' varer ›') : '›';
}

// ---------- Eksempler første gang ----------
// ---------- Startlister (lægges ind én gang for hele familien) ----------
async function laegStartlisterInd() {
  const favs = await Data.list('favoritter');
  const start = {
    ret: ['Lasagne', 'Tarteletter', 'Fiskefrikadeller', 'Hjemmelavet pizza', 'Burgere', 'Kylling i ovn',
      'Frikadeller med kartofler', 'Spaghetti med kødsovs', 'Boller i karry', 'Biksemad', 'Tacos',
      'Pasta carbonara', 'Hakkebøf med bløde løg', 'Millionbøf med kartoffelmos', 'Wok med nudler',
      'Laks med ris', 'Pandekager', 'Chili con carne', 'Fiskefilet med remoulade', 'Medisterpølse med kartofler',
      'Grøntsagssuppe med brød', 'Burritos', 'Karbonader', 'Rester'],
    morgen: ['Havregryn', 'Havrefras', 'Cornflakes', 'Yoghurt med müsli', 'Rugbrød med ost', 'Toast',
      'Pandekager', 'Æg og bacon', 'Grød', 'Smoothie', 'Boller'],
    frokost: ['Madpakke', 'Rugbrød med pålæg', 'Rester fra i går', 'Toast', 'Pastasalat', 'Wraps',
      'Pitabrød', 'Suppe', 'Boller med ost', 'Frikadeller og rugbrød'],
    indkob: ['Mælk', 'Rugbrød', 'Toastbrød', 'Smør', 'Ost', 'Pålæg', 'Æg', 'Bananer', 'Æbler', 'Agurk',
      'Gulerødder', 'Kaffe', 'Yoghurt', 'Havregryn', 'Pasta', 'Ris', 'Hakket oksekød', 'Kylling',
      'Toiletpapir', 'Opvasketabs', 'Gulerødder til Alfie', 'Hø til Alfie'],
    todo: ['Skift Alfies hø', 'Betal SFO', 'Smør madpakker', 'Vask tøj', 'Tøm opvaskemaskinen', 'Støvsug', 'Sæt skraldespanden ud'],
    butik: ['Netto', 'Rema 1000', 'Lidl', 'Føtex', 'Bilka', 'Coop 365']
  };
  // Kun typer der slet ikke findes endnu (så nye lister kommer med uden at gamle fordobles)
  const raekker = [];
  for (const [type, liste] of Object.entries(start)) {
    if (favs.some(f => f.type === type)) continue;
    for (const tekst of liste) raekker.push({ type, tekst, brugt: 0 });
  }
  if (raekker.length) await Data.addMange('favoritter', raekker);
}

// ---------- Fejlbesked hvis noget ikke kunne gemmes ----------
let statusTimer;
// Kort besked nederst. fejl = rød (noget gik galt); ellers neutral
function visStatus(tekst, fejl = false) {
  const s = document.getElementById('status');
  s.textContent = tekst;
  s.classList.toggle('fejl-status', fejl);
  s.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (s.hidden = true), 5000);
}
window.addEventListener('unhandledrejection', e => {
  console.error(e.reason);
  visStatus(navigator.onLine ? 'Noget gik galt – ændringen blev måske ikke gemt.' : 'Ingen forbindelse – ændringen blev ikke gemt.', true);
});

// ---------- Børn: tavlen er mest til at kigge på ----------
// Databasen (barn_vagt i SQL) bestemmer, hvad børn må gemme. Her er den venlige udgave på siden:
// knapper skjules, og prøver man alligevel, kommer en kort besked i stedet for en fejl.
// Børn må: sætte flueben på egne pligter, ønske at indløse en belønning, skrive egne km,
// markere hvad de selv kan lide (hjerter) og tilføje til indkøbslisten (og slette det, de selv har tilføjet).
const erBarn = () => Data.bruger()?.rolle === 'barn';
function barnMaa(handling, liste, felter, gammel) {
  const navn = Data.bruger()?.navn;
  if (handling === 'ny') {
    if (liste === 'flueben') return felter.barn === navn;
    if (liste === 'indloesninger') return felter.barn === navn && felter.status === 'afventer';
    if (liste === 'motion') return felter.hvem === navn;
    if (liste === 'personvalg') return felter.navn === navn;
    return liste === 'indkob';
  }
  if (!gammel) return false;
  if (handling === 'ret') {
    if (liste === 'personvalg') return gammel.navn === navn && (!('navn' in felter) || felter.navn === navn);
    if (liste !== 'favoritter' || Object.keys(felter).some(k => k !== 'kanLide')) return false;
    const foer = new Set(gammel.kanLide || []), efter = new Set(felter.kanLide || []);
    return [...foer, ...efter].every(n => n === navn || (foer.has(n) && efter.has(n)));
  }
  if (liste === 'flueben') return gammel.barn === navn;
  if (liste === 'motion') return gammel.hvem === navn;
  if (liste === 'indloesninger') return gammel.barn === navn && gammel.status === 'afventer';
  if (liste === 'indkob') return gammel._af === Data.bruger()?.id;
  return false;
}
function laasForBoern() {
  document.body.classList.add('barn');
  const orig = { add: Data.add, addMange: Data.addMange, update: Data.update, remove: Data.remove };
  const nej = () => { visStatus('Det kan kun de voksne ændre 🙂'); return null; };
  const find = async (liste, id) => (await Data.list(liste)).find(x => x.id === id);
  Data.add = async (liste, f) => (barnMaa('ny', liste, f) ? orig.add(liste, f) : nej());
  Data.addMange = async (liste, fl) => (fl.every(f => barnMaa('ny', liste, f)) ? orig.addMange(liste, fl) : nej());
  Data.update = async (liste, id, f) => (barnMaa('ret', liste, f, await find(liste, id)) ? orig.update(liste, id, f) : nej());
  Data.remove = async (liste, id) => (barnMaa('slet', liste, null, await find(liste, id)) ? orig.remove(liste, id) : nej());
}

// Syg / fri fra skolen / tidligere fri – gemmes som en kalenderaftale for barnet
function redigerFravaer(barn, iso, x) {
  let type = x?.type || 'syg';
  const tid = input('time', 'fravaer-tid', x?.tid || '12:00');
  const til = input('date', 'fravaer-til', x?.tilDato || '');
  const note = input('text', 'fravaer-note', x?.note || '', 'Fx feber, tandlæge, mormor henter');
  const tidFelt = felt('Fri kl.', tid);
  const tilFelt = felt('Til og med (hvis flere dage)', til);
  const vis = () => { tidFelt.hidden = type !== 'tidlig'; tilFelt.hidden = type === 'tidlig'; };
  const valg = chipValg(Object.keys(FRAVAER), type, v => { type = v; vis(); }, v => FRAVAER[v].knap);
  vis();
  const d = new Date(iso + 'T00:00');
  const gem = knap('Gem', 'knap', async () => {
    const felter = {
      dato: x?.dato || iso, hvem: barn, titel: FRAVAER[type].titel, type,
      fri: type !== 'tidlig',
      tid: type === 'tidlig' ? tid.value : '', slut: '',
      tilDato: type !== 'tidlig' && til.value && til.value > (x?.dato || iso) ? til.value : null,
      note: note.value.trim(), gentag: '', gentagTil: null
    };
    if (x) await Data.update(kalListe(x), x.id, felter); else await Data.add('kalender', felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (x) knapper.append(knap('Fjern', 'knap fare', async () => { await Data.remove(kalListe(x), x.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(barn + ' · ' + DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '/' + (d.getMonth() + 1),
    felt('Hvad', valg), tidFelt, tilFelt, felt('Note (valgfri)', note),
    el('p', 'hint', 'Står i kalenderen, og skemaet på tavlen viser det. En sygedag bryder ikke streak.'), knapper);
}

// "Tilpas": hvad hver person vil se (helligdage, mærkedage, sol, vejr). Børn retter kun deres egne.
// ---------- Indstillinger: ét sted for alt det, man kan tilpasse ----------
// Åbnes fra forbogstav-knappen øverst til højre og fra "Tilpas" i Kalender.
//  1) Hvad der vises (for mig – og for børnene, hvis man er voksen): helligdage, mærkedage, sol, vejr, nedtælling, faner
//  2) Udseende (kun denne enhed)   3) By til vejr og sol (voksne)   4) Hjælp   5) Log ud
async function aabnIndstillinger(hvem = Data.bruger()?.navn) {
  const mig = Data.bruger()?.navn;
  const folk = erBarn() ? [mig] : [mig, ...BOERN.filter(b => b !== mig)];
  const valg = await valgFor(hvem);
  const dele = [el('h3', 'lille-titel', 'Hvad skal vises?')];
  if (folk.length > 1) {
    dele.push(el('p', 'hint', 'Vælg hvem du retter for:'), chipValg(folk, hvem, v => aabnIndstillinger(v), v => v));
  }
  const MULIGHEDER = [['helligdage', '🎄 Helligdage'], ['maerkedage', '🎃 Mærkedage (halloween, mors dag …)'],
    ['sol', '🌅 Solopgang og solnedgang'], ['vejr', '🌦️ Vejret'],
    ...(BOERN.includes(hvem) ? [['nedtaelling', '⏳ Nedtælling på tavlen'], ['makker', '🐰 Makker på tavlen']] : [])];
  const seg = el('div', 'seg wrap tilpas-valg');
  for (const [felt, tekst] of MULIGHEDER) {
    const k = knap(tekst, null, async () => {
      valg[felt] = !valg[felt];
      k.setAttribute('aria-checked', valg[felt]);
      await saetValg(hvem, felt, valg[felt]);
      tegnAlt();
    });
    k.setAttribute('role', 'checkbox');
    k.setAttribute('aria-checked', valg[felt]);
    seg.append(k);
  }
  dele.push(seg, el('p', 'hint', hvem === mig ? 'Gælder din kalender og din I dag-side – på alle dine enheder.' : 'Gælder ' + hvem + 's tavle og kalender.'));
  // Voksne vælger, hvilke faner et barn kan se (tavlen er der altid)
  if (!erBarn() && BOERN.includes(hvem)) {
    const faner = new Set(Array.isArray(valg.faner) ? valg.faner : BOERNE_FANER);
    const fseg = el('div', 'seg wrap tilpas-valg');
    for (const [f, navn] of Object.entries(VALGBARE_FANER)) {
      const k = knap(navn, null, async () => {
        if (faner.has(f)) faner.delete(f); else faner.add(f);
        k.setAttribute('aria-checked', faner.has(f));
        await saetValg(hvem, 'faner', Object.keys(VALGBARE_FANER).filter(x => faner.has(x)));
      });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', faner.has(f));
      fseg.append(k);
    }
    dele.push(el('label', 'felt-label', 'Faner ' + hvem + ' kan se (tavlen er der altid)'), fseg,
      el('p', 'hint', 'Gælder, når ' + hvem + ' selv er logget ind. Pligter, belønninger og rutiner ligger på tavlen.'));
  }
  // Udseende – kun denne enhed
  const temaValg = chipValg(Object.keys(TEMA_NAVN), lokal.get('tema') || 'auto', v => { lokal.set('tema', v); saetTema(v); }, v => TEMA_NAVN[v]);
  dele.push(el('h3', 'lille-titel indst-titel', 'Udseende på denne enhed'), temaValg,
    el('p', 'hint', 'Automatisk følger telefonens lys/mørk-indstilling.'));
  // By til vejr og sol – fælles for familien
  if (!erBarn()) {
    const stedKnap = knap('📍 Sted for vejr og sol …', 'lille-knap', () => vaelgSted());   // fra vejr.js
    familieSted().then(st => { stedKnap.textContent = '📍 Vejr og sol: ' + (st.navn || 'Ukendt sted') + ' – skift'; });
    dele.push(el('h3', 'lille-titel indst-titel', 'Vejr og sol'), stedKnap);
  }
  // Hjælp
  dele.push(el('h3', 'lille-titel indst-titel', 'Hjælp'),
    knap('❓ Sådan virker Familietavlen ›', 'lille-knap', () => { lukArk(); visFane('hjaelp'); window.scrollTo(0, 0); }));
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Log ud', 'knap fare', () => Data.logud()), knap('Færdig', 'knap', () => lukArk()));
  aabnArk('Indstillinger', ...dele,
    el('p', 'hint indst-bund', 'Logget ind som ' + mig + '. Du forbliver logget ind på denne enhed, indtil du logger ud.'), knapper);
}
document.getElementById('kal-tilpas').addEventListener('click', () => aabnIndstillinger());

// Visning af en aftale for børn (kun læse)
function visAftale(a, forekomst) {
  const dato = new Date((forekomst || a.dato) + 'T00:00');
  const linjer = [el('p', 'aftale-vis-dato', DAGE_LANG[(dato.getDay() + 6) % 7] + ' ' + dato.getDate() + '. ' + MDR_LANG[dato.getMonth()]
    + (a.tid ? ' · kl. ' + visTid(a.tid) + (a.slut ? '–' + visTid(a.slut) : '') : ''))];
  linjer.push(el('p', 'hint', 'Hvem: ' + personerI(a).join(', ')));
  if (a.note) linjer.push(el('p', null, a.note));
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap', () => lukArk()));
  aabnArk(a.titel, ...linjer, knapper);
}

// ---------- Login ----------
const LOGIN_NAVNE = ['Timmo', 'Winnie', 'Oliver', 'Villads'];
let loginNavn = lokal.get('sidste-navn') || '';

function visLogin() {
  document.body.dataset.tilstand = 'login';
  const login = document.getElementById('login');
  login.hidden = false;
  const navne = document.getElementById('login-navne');
  const tegn = () => navne.replaceChildren(...LOGIN_NAVNE.map(n => {
    const k = knap(n, null, () => { loginNavn = n; tegn(); document.getElementById('login-kode').focus(); });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', n === loginNavn);
    return k;
  }));
  tegn();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const fejl = document.getElementById('login-fejl');
  const kode = document.getElementById('login-kode');
  fejl.hidden = true;
  if (!loginNavn) { fejl.textContent = 'Tryk på dit navn først.'; fejl.hidden = false; return; }
  if (!kode.value) { kode.focus(); return; }
  const knapEl = e.target.querySelector('.knap');
  knapEl.disabled = true;
  knapEl.textContent = 'Logger ind…';
  try {
    await Data.login(loginNavn, kode.value);
    lokal.set('sidste-navn', loginNavn);
    kode.value = '';
    document.getElementById('login').hidden = true;
    await startTavle();
  } catch (err) {
    console.error(err);
    fejl.textContent = navigator.onLine ? 'Forkert navn eller kode. Prøv igen.' : 'Ingen forbindelse til internettet.';
    fejl.hidden = false;
  } finally {
    knapEl.disabled = false;
    knapEl.textContent = 'Log ind';
  }
});

// ---------- Udseende: automatisk (følg telefonen), lys eller mørk – huskes på enheden ----------
const TEMA_NAVN = { auto: 'Automatisk', lys: 'Lys', moerk: 'Mørk' };
function saetTema(tema) {
  const rod = document.documentElement;
  if (tema === 'lys') rod.dataset.theme = 'light';
  else if (tema === 'moerk') rod.dataset.theme = 'dark';
  else delete rod.dataset.theme;
  // Farven på telefonens statuslinje
  const farve = tema === 'lys' ? '#f2f5f3' : tema === 'moerk' ? '#0e1311' : null;
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => {
    if (!m.dataset.standard) m.dataset.standard = m.content;
    m.content = farve || m.dataset.standard;
  });
}
saetTema(lokal.get('tema') || 'auto');

document.getElementById('log-ud').addEventListener('click', () => aabnIndstillinger());

// ---------- Fortryd efter sletning ----------
// Vises i 8 sekunder nederst: "Slettet: Lasagne · Fortryd"
let fortrydEl = null, fortrydTimer = null;
function visFortryd(g) {
  if (!fortrydEl) {
    fortrydEl = el('div', 'fortryd-boks');
    fortrydEl.setAttribute('role', 'status');
    fortrydEl.hidden = true;
    document.body.append(fortrydEl);
  }
  const d = g.raekker[0].data || {};
  const navn = d.tekst || d.navn || d.titel || d.ret || '';
  const tekst = g.raekker.length > 1 ? g.raekker.length + ' ting slettet' : 'Slettet' + (navn ? ': ' + navn : '');
  const k = knap('Fortryd', 'fortryd-knap', async () => {
    clearTimeout(fortrydTimer);
    fortrydEl.hidden = true;
    try { await Data.gendan(g); visStatus('Fortrudt ✓'); }
    catch (e) { console.error(e); visStatus('Kunne ikke fortryde – prøv igen.', true); }
    tegnAlt();
  });
  fortrydEl.replaceChildren(el('span', 'fortryd-tekst', tekst), k);
  fortrydEl.hidden = false;
  clearTimeout(fortrydTimer);
  fortrydTimer = setTimeout(() => { fortrydEl.hidden = true; }, 8000);
}
Data.onFortryd(visFortryd);

// ---------- Start ----------
function tegnAlt() {
  tegnListe('indkob'); tegnListe('todo'); tegnMadplan(); tegnFastPlan(); tegnSkema(); tegnKalender(); tegnOverblik();
  tegnForslag('indkob'); tegnForslag('todo'); tegnForslag('ret'); tegnForslag('morgen'); tegnForslag('frokost');
  tegnFoedselsdage();
  tegnFamilie();   // fra familie.js
  tegnMere();   // fra mere.js
  tegnVejr();   // fra vejr.js (tegner kun, når siden er åben)
  anvendFaner();
}

async function startTavle() {
  const profil = Data.bruger();
  const logUd = document.getElementById('log-ud');
  logUd.textContent = profil.navn[0];
  logUd.className = 'bruger-knap ' + (PK[profil.navn] || 'c-faelles');
  logUd.setAttribute('aria-label', 'Indstillinger – logget ind som ' + profil.navn);
  logUd.hidden = false;
  if (erBarn()) {
    laasForBoern();
  } else {
    // Startindhold og flytning af gamle data sker kun, når en voksen er logget ind
    await laegStartlisterInd();
    await laegMereStartInd();   // fra mere.js
    for (const r of (await Data.list('madplan')).filter(r => !r.uge)) {
      await Data.update('madplan', r.id, { uge: isoDato(mandagDenneUge()) });
    }
  }
  // Drengene ser deres egen tavle; voksne kan vælge
  if (profil.rolle === 'barn' && BOERN.includes(profil.navn)) tavleVisning = profil.navn;
  else tavleVisning = ['familie', ...BOERN].includes(lokal.get('tavle')) ? lokal.get('tavle') : 'familie';
  if (!BOERN.includes(skemaBarn)) skemaBarn = BOERN[0];
  tegnNyPrio();
  tegnListeValg();
  visFane(lokal.get('fane'));
  tegnAlt();
  Data.onChange(tegnAlt);
  document.body.dataset.tilstand = 'klar';
}

document.documentElement.lang = 'da'; // giver dansk orddeling i kalenderen
document.getElementById('dato').textContent =
  new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });

(async () => {
  try {
    const profil = await Data.start();
    if (profil) await startTavle();
    else visLogin();
  } catch (err) {
    console.error(err);
    visLogin();
    const fejl = document.getElementById('login-fejl');
    fejl.textContent = err.message === 'mangler-profil'
      ? 'Din bruger mangler en profil i databasen. Spørg Timmo.'
      : 'Kunne ikke forbinde. Tjek internettet og prøv igen.';
    fejl.hidden = false;
  }
})();
