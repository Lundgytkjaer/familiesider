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
  const tilMin = s => { const [t, m] = s.split('.').map(Number); return isNaN(t) ? null : t * 60 + (m || 0); };
  return [tilMin(dele[0] || ''), tilMin(dele[1] || '')];
}
const slutTid = tid => ((tid || '').split(/[-–]/)[1] || '').trim();

// ---------- Faner ----------
const FANER = ['idag', 'kalender', 'madplan', 'indkob', 'todo', 'mere', 'skema', 'pligter', 'pakkelister', 'konkurrence'];
const UNDER_MERE = ['skema', 'pligter', 'pakkelister', 'konkurrence'];   // sider man når via "Mere"
function visFane(navn) {
  if (!FANER.includes(navn)) navn = 'idag';
  document.querySelectorAll('.fane').forEach(s => (s.hidden = s.id !== navn));
  const iMenu = UNDER_MERE.includes(navn) ? 'mere' : navn;
  document.querySelectorAll('[data-fane]').forEach(b => b.setAttribute('aria-selected', b.dataset.fane === iMenu));
  lokal.set('fane', navn);
}
document.querySelectorAll('[data-fane]').forEach(b => b.addEventListener('click', () => { visFane(b.dataset.fane); window.scrollTo(0, 0); }));
document.querySelectorAll('[data-gaa]').forEach(b => b.addEventListener('click', () => { visFane(b.dataset.gaa); window.scrollTo(0, 0); }));

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
    if (p.butik || p.tilbud || p.note) {
      const tags = el('span', 'tags');
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

    if (navn === 'indkob') {
      const mere = el('button', 'mere-knap');
      mere.type = 'button';
      mere.innerHTML = IKON_MERE;
      mere.setAttribute('aria-label', 'Butik, tilbud og billede for ' + p.tekst);
      mere.addEventListener('click', () => redigerVare(p));
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
    await Data.add(form.dataset.liste, felter);
    await gemFavorit(form.dataset.liste, tekst);
    felt.value = '';
    felt.focus();
    tegnAlt();
  });
  // Mens man skriver, viser hurtigvalget kun det der passer
  form.querySelector('input').addEventListener('input', () => tegnForslag(form.dataset.liste));
});

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

async function gemFavorit(type, tekst) {
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
    if (erMaaltid && !st.ret) { boks.append(el('span', 'tag', f.tekst)); continue; }
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
        await Data.add(type, felter);
        await gemFavorit(type, f.tekst);
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
  if (!filter && favs.length) {
    styr(st.ret ? 'Færdig' : 'Ret listen', () => { st.ret = !st.ret; tegnForslag(type); });
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
// Maden for en dato. Med barn: barnets egne valg går forud for familiens.
// Returnerer {morgen, frokost, ret, eget: {felt: true}}
async function madFor(dato, barn = null) {
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const faelles = (await madplanForUge(ugeIso)).find(r => r.dag === dag) || {};
  const res = { morgen: faelles.morgen, frokost: faelles.frokost, ret: faelles.ret, eget: {}, faelles };
  if (barn) {
    const eget = (await madplanForUge(ugeIso, barn)).find(r => r.dag === dag) || {};
    for (const f of ['morgen', 'frokost', 'ret']) if (eget[f]) { res[f] = eget[f]; res.eget[f] = true; }
  }
  return res;
}

async function tegnMadplan() {
  const ol = document.querySelector('.uge');
  const mandag = madMandag();
  const retter = await madplanForUge(isoDato(mandag));
  const egne = (await Data.list('madplan')).filter(r => r.uge === isoDato(mandag) && r.barn);
  const idag = madUge === 0 ? idagNr() : madUge > 0 ? -1 : 7;   // markér dage der er gået
  const son = new Date(mandag); son.setDate(mandag.getDate() + 6);
  const navn = madUge === 0 ? 'Denne uge' : madUge === 1 ? 'Næste uge' : madUge === -1 ? 'Sidste uge' : null;
  document.getElementById('mad-titel').textContent = 'Uge ' + ugenummer(mandag) + (navn ? ' · ' + navn : '');
  document.getElementById('ugenr').textContent = mandag.getDate() + '. ' + MDR[mandag.getMonth()] + '–' + son.getDate() + '. ' + MDR[son.getMonth()];
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
    felt.value = retter.find(r => r.dag === i)?.ret || '';
    felt.addEventListener('change', async () => {
      const ret = felt.value.trim();
      await gemRet(i, ret);
      if (ret) { await gemFavorit('ret', ret); tegnForslag('ret'); }
    });
    felt.addEventListener('keydown', e => { if (e.key === 'Enter') felt.blur(); });

    const terning = el('button', 'terning');
    terning.type = 'button';
    terning.setAttribute('aria-label', 'Ny ret til ' + DAGE_LANG[i]);
    terning.innerHTML = IKON_TERNING;
    terning.addEventListener('click', () => rulDage([i]));

    li.append(label, felt, terning);

    // Morgenmad og frokost (vises når knappen er slået til)
    if (visMaaltider) {
      li.classList.add('med-maaltider');
      const ekstra = el('div', 'ekstra-mad');
      const plan = retter.find(r => r.dag === i) || {};
      for (const noegle of ['morgen', 'frokost']) {
        const navn = noegle === 'morgen' ? 'Morgen' : 'Frokost';
        const lbl = el('label', null, navn);
        const inp = el('input');
        inp.type = 'text'; inp.id = noegle + '-' + i; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
        inp.placeholder = '–';
        inp.setAttribute('list', DATALISTE[noegle]);
        inp.value = plan[noegle] || '';
        lbl.htmlFor = inp.id;
        inp.addEventListener('change', async () => {
          const v = inp.value.trim();
          await gemMad(i, noegle, v);
          if (v) { await gemFavorit(noegle, v); tegnForslag(noegle); }
        });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
        const t = el('button', 'terning lille');
        t.type = 'button';
        t.setAttribute('aria-label', 'Ny ' + navn.toLowerCase() + ' til ' + DAGE_LANG[i]);
        t.innerHTML = IKON_TERNING;
        t.addEventListener('click', () => rulDage([i], [noegle]));
        const par = el('div', 'mad-par');
        par.append(lbl, inp, t);
        ekstra.append(par);
      }
      li.append(ekstra);
    }

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
    if (!ny.ret && !ny.morgen && !ny.frokost) await Data.remove('madplan', fundet.id);
    else await Data.update('madplan', fundet.id, { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('madplan', barn ? { uge, dag, barn, [felt]: vaerdi } : { uge, dag, [felt]: vaerdi });
  }
  tegnOverblik();
}
const gemRet = (dag, ret) => gemMad(dag, 'ret', ret);

// Vis/skjul morgenmad og frokost i madplanen (huskes på denne enhed)
let visMaaltider = lokal.get('vis-maaltider') === '1';
async function tegnMaaltidsValg() {
  const knapEl = document.getElementById('vis-maaltider');
  knapEl.setAttribute('aria-pressed', visMaaltider);
  knapEl.textContent = visMaaltider ? 'Skjul morgenmad og frokost' : 'Vis morgenmad og frokost';
}
document.getElementById('vis-maaltider').addEventListener('click', async () => {
  visMaaltider = !visMaaltider;
  lokal.set('vis-maaltider', visMaaltider ? '1' : '');
  await tegnMaaltidsValg();
  tegnMadplan();
});

// Terning: vælg tilfældigt fra listerne – undgå gentagelser i samme uge
let nyeDage = new Set();
async function rulDage(dage, felter = ['ret']) {
  const favs = await Data.list('favoritter');
  if (felter.includes('ret') && !favs.some(f => f.type === 'ret')) { document.querySelector('.retter-boks').open = true; return; }
  for (const felt of felter) {
    const alle = favs.filter(f => f.type === felt).map(f => f.tekst);
    if (!alle.length) continue;
    const plan = await madplanForUge(madUgeIso());
    const brugt = new Set(plan.map(r => (r[felt] || '').toLowerCase()).filter(Boolean));
    for (const dag of dage) {
      let mulige = alle.filter(r => !brugt.has(r.toLowerCase()));
      if (!mulige.length) mulige = alle;
      const valgt = mulige[Math.floor(Math.random() * mulige.length)];
      brugt.add(valgt.toLowerCase());
      await gemMad(dag, felt, valgt);
      nyeDage.add(dag);
    }
  }
  tegnMadplan();
}
const synligeMaaltider = () => (visMaaltider ? ['morgen', 'frokost', 'ret'] : ['ret']);

document.getElementById('fyld-tomme').addEventListener('click', async () => {
  for (const felt of synligeMaaltider()) {
    const plan = await madplanForUge(madUgeIso());
    await rulDage([0, 1, 2, 3, 4, 5, 6].filter(d => !plan.some(r => r.dag === d && r[felt])), [felt]);
  }
});
const blandUge = document.getElementById('bland-uge');
blandUge.addEventListener('click', () => bekraeft(blandUge, () => rulDage([0, 1, 2, 3, 4, 5, 6], synligeMaaltider())));

document.getElementById('mad-forrige').addEventListener('click', () => { madUge--; tegnMadplan(); });
document.getElementById('mad-naeste').addEventListener('click', () => { madUge++; tegnMadplan(); });
document.getElementById('mad-denne').addEventListener('click', () => { madUge = 0; tegnMadplan(); });

const rydUge = document.getElementById('ryd-uge');
rydUge.addEventListener('click', () => bekraeft(rydUge, async () => {
  for (const r of await madplanForUge(madUgeIso())) await Data.remove('madplan', r.id);
  tegnAlt();
}));

// ---------- Skoleskema ----------
// Data: 'ringetider' {barn, nr, tid}
//       'skema' {barn, dag (0-4), nr, fag, farve}   – farve = navnet på en farve i skemafarver
//       'skemafarver' {barn, navn, farve}            – fx {Oliver, 'Mette', 'blaa'}
//       'skemadag' {barn, dag, kontakt}              – dagens kontaktperson
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
  li.append(el('span', 'tid', t.tid.replace('-', '–')), el('span', 'fag', t.fag));
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
    kontaktBoks.append(par);
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

  const sidste = medFag[medFag.length - 1];
  const fod = [];
  if (sidste && slutTid(sidste.tid)) fod.push('Fri kl. ' + slutTid(sidste.tid));
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
  const VAERDIER = { skema: ['fag', 'farve'], ringetider: ['tid'], skemadag: ['kontakt'] }[liste];
  const match = r => Object.entries(noegle).every(([k, v]) => r[k] === v);
  const fundet = (await Data.list(liste)).find(match);
  const samlet = { ...(fundet || {}), ...felter };
  const tom = VAERDIER.every(k => !samlet[k]);
  if (fundet && tom) await Data.remove(liste, fundet.id);
  else if (fundet) await Data.update(liste, fundet.id, felter);
  else if (!tom) await Data.add(liste, { ...noegle, ...felter });
  tegnOverblik();
}

document.getElementById('rediger-skema').addEventListener('click', () => { redigerer = !redigerer; tegnSkema(); });

// ---------- Kalender ----------
// Data: 'kalender' {dato: 'ÅÅÅÅ-MM-DD', hvem, titel, tid: 'TT:MM' eller ''}
const PERSONER = ['Fælles', 'Timmo', 'Winnie', 'Oliver', 'Villads'];
const PK = { 'Fælles': 'c-faelles', Timmo: 'c-timmo', Winnie: 'c-winnie', Oliver: 'c-oliver', Villads: 'c-villads' };
const MDR = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
let kalUge = 0;

function isoDato(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const visTid = t => (t || '').replace(':', '.');
const sorterAftaler = (a, b) => (a.tid || '').localeCompare(b.tid || '');

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

  const aftaler = await Data.list('kalender');
  const alleFoed = await Data.list('foedselsdage');
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
      const dagens = aftaler.filter(a => a.dato === iso).sort(sorterAftaler);
      const foed = alleFoed.filter(f => isoDato(datoIAar(f, dag.getFullYear())) === iso);
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
        prikker.append(el('span', 'prik c-foed'));
        titler.append(el('span', 'md-titel c-foed', f.navn));
      }
      for (const a of dagens) {
        prikker.append(el('span', 'prik ' + PK[a.hvem]));
        titler.append(el('span', 'md-titel ' + PK[a.hvem], (a.tid ? visTid(a.tid) + ' ' : '') + a.titel));
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
    const li = el('li', 'c-foed');
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    ul.append(li);
  }
  for (const a of aftaler.filter(a => a.dato === kalValgtDag).sort(sorterAftaler)) {
    const li = el('li', PK[a.hvem]);
    const b = knap('', 'dag-aftale', () => redigerAftale(a));
    b.append(el('span', 'prik'), el('span', 'husk-tekst', (a.tid ? visTid(a.tid) + ' ' : '') + a.titel), el('span', 'dag-hvem', a.hvem));
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
  const fra = man.getDate() + (man.getMonth() !== son.getMonth() ? '. ' + MDR[man.getMonth()] : '.');
  document.getElementById('kal-titel').textContent = 'Uge ' + ugenummer(man) + ' · ' + fra + '–' + son.getDate() + '. ' + MDR[son.getMonth()];
  document.getElementById('kal-idag').hidden = kalUge === 0;
  document.getElementById('kal-dato').textContent = son.getFullYear();

  const aftaler = await Data.list('kalender');
  const alleFoed = await Data.list('foedselsdage');
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
        for (const f of alleFoed.filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso)) {
          const b = el('button', 'beg c-foed');
          b.type = 'button';
          const alder = alderPaa(f, d);
          b.append(el('b', null, f.navn));
          if (alder != null) b.append(el('span', null, alder + ' år'));
          b.addEventListener('click', e => { e.stopPropagation(); redigerFoed(f); });
          celle.append(b);
        }
      }

      for (const a of aftaler.filter(a => a.dato === iso && a.hvem === p).sort(sorterAftaler)) {
        const b = el('button', 'beg ' + PK[p]);
        b.type = 'button';
        if (a.tid) b.append(el('b', null, visTid(a.tid)));
        b.append(el('span', null, a.titel));
        b.addEventListener('click', e => { e.stopPropagation(); redigerAftale(a); });
        celle.append(b);
      }
      g.append(celle);
    }
  }
}

function redigerAftale(a) {
  const ny = !a.id;
  const titel = input('text', 'aftale-titel', a.titel, 'Fx fodbold, tandlæge, fødselsdag');
  let hvem = a.hvem || 'Fælles';
  const hvemValg = chipValg(PERSONER, hvem, v => { hvem = v; });
  const dato = input('date', 'aftale-dato', a.dato);
  const tid = input('time', 'aftale-tid', a.tid);
  const toFelter = el('div', 'to-felter');
  toFelter.append(felt('Dato', dato), felt('Tid (valgfri)', tid));

  const gem = knap('Gem', 'knap', async () => {
    const t = titel.value.trim();
    if (!t) { titel.focus(); return; }
    if (!dato.value) { dato.focus(); return; }
    const felter = { titel: t, hvem, dato: dato.value, tid: tid.value };
    if (ny) await Data.add('kalender', felter); else await Data.update('kalender', a.id, felter);
    lukArk();
    tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('kalender', a.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);

  aabnArk(ny ? 'Ny aftale' : 'Ret aftale', felt('Hvad', titel), felt('Hvem', hvemValg), toFelter, knapper);
  if (ny) setTimeout(() => titel.focus(), 50);
}

document.getElementById('kal-forrige').addEventListener('click', () => { if (kalVisning === 'uge') kalUge--; else kalMaaned--; tegnKalender(); });
document.getElementById('kal-naeste').addEventListener('click', () => { if (kalVisning === 'uge') kalUge++; else kalMaaned++; tegnKalender(); });
document.getElementById('kal-idag').addEventListener('click', () => { kalUge = 0; kalMaaned = 0; kalValgtDag = isoDato(new Date()); tegnKalender(); });

// ---------- Børnetavle: Olivers og Villads' egen I dag-side ----------
// Data: 'info' {barn, dato: 'ÅÅÅÅ-MM-DD', tekst} – ekstra ting at huske, som ikke står i kalenderen
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
  hoved.append(dagNavn, el('p', 'bt-dato', valgt.getDate() + '. ' + MDR_LANG[valgt.getMonth()] + ' · uge ' + ugenummer(valgt)));

  const kort = (titel, ...indhold) => {
    const k = el('div', 'kort');
    const top = el('div', 'kort-top');
    top.append(el('span', 'kort-label', titel));
    k.append(top, ...indhold);
    return k;
  };

  // Skema
  let skemaKort;
  if (dagNr >= 5) {
    skemaKort = kort('Skole', el('p', 'stor tom-ret', 'Weekend – ingen skole'));
  } else {
    const timer = (await dagensTimer(barn, dagNr)).filter(t => t.fag);
    if (!timer.length) {
      skemaKort = kort('Skole', el('p', 'under', 'Intet skema lagt ind for ' + DAGE_LANG[dagNr].toLowerCase() + '.'));
    } else {
      const start = (timer[0].tid.split(/[-–]/)[0] || '').trim();
      const slut = slutTid(timer[timer.length - 1].tid);
      const tider = el('p', 'bt-tider');
      if (start) tider.append(el('span', null, 'Møder ' + start));
      if (slut) tider.append(el('span', null, 'Fri ' + slut));
      const ol = el('ol', 'lektioner bt-lektioner');
      const farver = await skemaFarver(barn);
      const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
      for (const t of timer) {
        const [fra, til] = tidSomMin(t.tid);
        ol.append(lektionLi(t, iso === idagIso && fra != null && til != null && nuMin >= fra && nuMin < til, farver));
      }
      skemaKort = kort('Skole', tider, ol, forklaring(farver, new Set(timer.map(t => t.farve))));
    }
  }

  // Mad
  const plan = await madFor(valgt, barn);
  const madKort = kort('Mad');
  for (const [felt, navn] of [['morgen', 'Morgen'], ['frokost', 'Frokost'], ['ret', 'Aften']]) {
    const ret = plan[felt];
    const r = knap('', 'maaltid', () => redigerMaaltid(barn, valgt, felt));
    r.setAttribute('aria-label', navn + ': ' + (ret || 'ikke bestemt') + '. Tryk for at ændre');
    const retEl = el('span', 'm-ret' + (ret ? '' : ' tom-ret'), ret || 'Ikke bestemt');
    if (plan.eget[felt]) retEl.append(el('span', 'eget-tag', 'Eget valg'));
    r.append(el('span', 'm-navn', navn), retEl, el('span', 'm-pil', '›'));
    madKort.append(r);
  }

  const kontakt = dagNr < 5 ? await dagKontakt(barn, dagNr) : '';
  if (kontakt && skemaKort.querySelector('.bt-tider')) skemaKort.querySelector('.bt-tider').append(el('span', 'bt-kontakt', 'Kontakt: ' + kontakt));

  // Husk: fødselsdage, kalender (eget + fælles) og ekstra info
  const foed = await foedselsdageDen(iso);
  const aftaler = (await Data.list('kalender'))
    .filter(a => a.dato === iso && (a.hvem === barn || a.hvem === 'Fælles')).sort(sorterAftaler);
  const info = (await Data.list('info')).filter(x => x.barn === barn && x.dato === iso);
  const liste = el('ul', 'husk-liste');
  for (const f of foed) {
    const li = el('li', 'c-foed');
    li.append(el('span', 'prik'), el('span', 'husk-tekst', foedTekst(f)));
    liste.append(li);
  }
  for (const a of aftaler) {
    const li = el('li', PK[a.hvem]);
    li.append(el('span', 'prik'), el('span', 'husk-tekst', (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + (a.hvem === 'Fælles' ? ' · hele familien' : '')));
    liste.append(li);
  }
  for (const x of info) {
    const li = el('li', 'husk-info');
    const slet = knap('', 'slet', async () => { await Data.remove('info', x.id); tegnOverblik(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + x.tekst);
    li.append(el('span', 'prik'), el('span', 'husk-tekst', x.tekst), slet);
    liste.append(li);
  }
  if (!foed.length && !aftaler.length && !info.length) liste.append(el('li', 'tom-husk', 'Ikke noget særligt at huske.'));
  const form = el('form', 'tilfoj');
  const inp = input('text', 'ny-info', '', 'Fx idrætstøj, mormor henter');
  inp.enterKeyHint = 'done';
  inp.setAttribute('aria-label', 'Tilføj noget at huske');
  form.append(inp, el('button', 'knap', 'Tilføj'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const tekst = inp.value.trim();
    if (!tekst) return;
    inp.value = '';
    await Data.add('info', { barn, dato: iso, tekst });
    await tegnOverblik();
    setTimeout(() => document.getElementById('ny-info')?.focus(), 50);
  });
  const huskKort = kort('Husk', liste, form);

  const gitter = el('div', 'overblik');
  gitter.append(huskKort);
  const pligter = await pligtKort(barn);   // fra mere.js
  if (pligter) gitter.append(pligter);
  gitter.append(skemaKort, madKort);
  boks.replaceChildren(strip, hoved, gitter);
}

// Vælg et måltid til et barn (direkte fra børnetavlen)
async function redigerMaaltid(barn, dato, felt) {
  const NAVN = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
  const ugeIso = isoDato(mandagFor(dato));
  const dag = (dato.getDay() + 6) % 7;
  const plan = await madFor(dato, barn);
  const vaelg = async v => { await gemMad(dag, felt, v, ugeIso, barn); lukArk(); tegnAlt(); };

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
  if (plan.eget[felt]) {
    knapper.append(knap('Brug familiens', 'knap sekundaer-knap', async () => { await gemMad(dag, felt, '', ugeIso, barn); lukArk(); tegnAlt(); }));
  }

  const faellesTekst = plan.faelles[felt]
    ? 'Familiens madplan: ' + plan.faelles[felt]
    : 'Der står ikke noget i familiens madplan.';
  aabnArk(NAVN[felt] + ' til ' + barn + ' · ' + DAGE_LANG[dag].toLowerCase(),
    el('p', 'hint', faellesTekst), form, chips, knapper);
}

// ---------- Fødselsdage og mærkedage ----------
// Data: 'foedselsdage' {navn, dato: 'ÅÅÅÅ-MM-DD'} eller {navn, maerkedag: 'DD-MM' | 'morsdag'}
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
const foedTekst = f => (f.alder != null ? f.navn + ' fylder ' + f.alder : f.navn);
async function foedselsdageDen(iso) {
  const d = new Date(iso + 'T00:00');
  return (await Data.list('foedselsdage'))
    .filter(f => isoDato(datoIAar(f, d.getFullYear())) === iso)
    .map(f => ({ ...f, alder: alderPaa(f, d) }));
}

async function tegnFoedselsdage() {
  const ul = document.getElementById('foed-liste');
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const alle = (await Data.list('foedselsdage')).map(f => {
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
      el('span', 'foed-under', r.alder != null ? 'Fylder ' + r.alder + ' år' : 'Mærkedag'));
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
  const maerkeLabel = el('label', 'check');
  const maerke = el('input'); maerke.type = 'checkbox'; maerke.id = 'foed-maerke'; maerke.checked = !!f.maerkedag;
  maerkeLabel.append(maerke, 'Mærkedag (ingen alder)');

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    if (!dato.value) { fejl.textContent = 'Vælg en dato.'; fejl.hidden = false; return; }
    const felter = maerke.checked
      ? { navn: n, maerkedag: dato.value.slice(8, 10) + '-' + dato.value.slice(5, 7), dato: null }
      : { navn: n, dato: dato.value, maerkedag: null };
    if (ny) await Data.add('foedselsdage', felter); else await Data.update('foedselsdage', f.id, felter);
    lukArk(); tegnAlt();
  });
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('foedselsdage', f.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny fødselsdag' : 'Ret fødselsdag', felt('Navn', navn), felt('Født', dato), maerkeLabel, fejl, knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// ---------- I dag – overblik ----------
async function tegnOverblik() {
  tegnTavleValg();
  const erBoernetavle = tavleVisning !== 'familie';
  document.getElementById('familie-overblik').hidden = erBoernetavle;
  document.getElementById('boernetavle').hidden = !erBoernetavle;
  if (erBoernetavle) {
    // Tegn ikke igen mens der skrives i Husk-feltet
    if (document.activeElement?.id === 'ny-info' && document.activeElement.value) return;
    return tegnBoernetavle(tavleVisning);
  }
  const idag = idagNr();

  // Kalender i dag og i morgen
  const aftaler = await Data.list('kalender');
  const iDagIso = isoDato(new Date());
  const imorgenDato = new Date(); imorgenDato.setDate(imorgenDato.getDate() + 1);
  const iMorgenIso = isoDato(imorgenDato);
  const ovKal = document.getElementById('ov-kal');
  ovKal.replaceChildren();
  const dagens = aftaler.filter(a => a.dato === iDagIso).sort(sorterAftaler);
  const foedIdag = await foedselsdageDen(iDagIso);
  for (const f of foedIdag) {
    const li = el('li', 'c-foed');
    li.append(el('span', 'prik'), el('span', null, foedTekst(f)));
    ovKal.append(li);
  }
  if (!dagens.length && !foedIdag.length) ovKal.append(el('li', null, 'Intet i kalenderen i dag'));
  for (const a of dagens) {
    const li = el('li', PK[a.hvem]);
    li.append(el('span', 'prik'), el('span', null, (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + ' · ' + a.hvem));
    ovKal.append(li);
  }
  const morgen = aftaler.filter(a => a.dato === iMorgenIso).sort(sorterAftaler);
  const morgenTekster = [
    ...(await foedselsdageDen(iMorgenIso)).map(foedTekst),
    ...morgen.map(a => (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + ' (' + a.hvem + ')')
  ];
  document.getElementById('ov-kal-imorgen').textContent = morgenTekster.length ? 'I morgen: ' + morgenTekster.join(', ') : '';

  const ret = (await madFor(new Date())).ret;
  const retEl = document.getElementById('ov-ret');
  retEl.textContent = ret || 'Ikke bestemt endnu';
  retEl.classList.toggle('tom-ret', !ret);
  const imorgen = (await madFor(imorgenDato)).ret;
  document.getElementById('ov-ret-imorgen').textContent = imorgen ? 'I morgen: ' + imorgen : '';

  // Skole: i dag, eller næste skoledag i weekenden / efter skole
  let dag = idag, label = 'Skole i dag';
  if (idag >= 5) { dag = 0; label = 'Skole på mandag'; }
  document.getElementById('ov-skole-label').textContent = label;
  const skole = document.getElementById('ov-skole');
  skole.replaceChildren();
  for (const barn of BOERN) {
    const timer = (await dagensTimer(barn, dag)).filter(t => t.fag);
    const linje = el('div', 'barn-linje');
    linje.append(el('span', 'barn-navn', barn));
    if (!timer.length) {
      linje.append(el('span', 'barn-fri', 'Intet skema'));
    } else {
      const start = (timer[0].tid.split(/[-–]/)[0] || '').trim();
      linje.append(el('span', 'barn-fri', 'Fri ' + slutTid(timer[timer.length - 1].tid)));
      linje.append(el('span', 'barn-fag', (start ? 'Møder ' + start + ' · ' : '') + [...new Set(timer.map(t => t.fag))].join(', ')));
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
    li.append(el('span', 'prik'), el('span', null, p.tekst));
    ovTodo.append(li);
  }
  document.getElementById('ov-todo-antal').textContent = todo.length > 4 ? '+' + (todo.length - 4) + ' mere ›' : 'Alle ›';

  // Indkøb
  const varer = (await Data.list('indkob')).filter(p => !p.klaret);
  const ovInd = document.getElementById('ov-indkob');
  ovInd.replaceChildren();
  if (!varer.length) ovInd.append(el('span', null, 'Listen er tom'));
  for (const v of varer.slice(0, 8)) ovInd.append(el('span', null, v.tekst));
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
function visStatus(tekst) {
  const s = document.getElementById('status');
  s.textContent = tekst;
  s.hidden = false;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => (s.hidden = true), 5000);
}
window.addEventListener('unhandledrejection', e => {
  console.error(e.reason);
  visStatus(navigator.onLine ? 'Noget gik galt – ændringen blev måske ikke gemt.' : 'Ingen forbindelse – ændringen blev ikke gemt.');
});

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

document.getElementById('log-ud').addEventListener('click', () => Data.logud());

// ---------- Start ----------
function tegnAlt() {
  tegnListe('indkob'); tegnListe('todo'); tegnMaaltidsValg().then(tegnMadplan); tegnSkema(); tegnKalender(); tegnOverblik();
  tegnForslag('indkob'); tegnForslag('todo'); tegnForslag('ret'); tegnForslag('morgen'); tegnForslag('frokost');
  tegnFoedselsdage();
  tegnMere();   // fra mere.js
}

async function startTavle() {
  const profil = Data.bruger();
  const logUd = document.getElementById('log-ud');
  logUd.textContent = profil.navn + ' · Log ud';
  logUd.hidden = false;
  await laegStartlisterInd();
  await laegMereStartInd();   // fra mere.js
  for (const r of (await Data.list('madplan')).filter(r => !r.uge)) {
    await Data.update('madplan', r.id, { uge: isoDato(mandagDenneUge()) });
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
