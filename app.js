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
const FANER = ['idag', 'kalender', 'madplan', 'indkob', 'todo', 'skema'];
function visFane(navn) {
  if (!FANER.includes(navn)) navn = 'idag';
  document.querySelectorAll('.fane').forEach(s => (s.hidden = s.id !== navn));
  document.querySelectorAll('[data-fane]').forEach(b => b.setAttribute('aria-selected', b.dataset.fane === navn));
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
  const lavButikValg = () => chipValg(muligheder, butik, b => { butik = b; }, b => b || 'Ingen');
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
  };
  nyButik.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); tilfoejButik(); } });
  nyButik.addEventListener('change', tilfoejButik);

  const tilbudLabel = el('label', 'check');
  const tilbud = el('input'); tilbud.type = 'checkbox'; tilbud.id = 'vare-tilbud'; tilbud.checked = !!p.tilbud;
  tilbudLabel.append(tilbud, 'På tilbud');

  const note = input('text', 'vare-note', p.note, 'Fx 2 for 30 kr. eller "den med blåt låg"');

  let billede = p.billede || '';
  const billedBoks = el('div', 'billede-boks');
  const tegnBillede = () => {
    billedBoks.replaceChildren();
    if (billede) {
      const img = el('img'); img.src = billede; img.alt = 'Billede af ' + p.tekst;
      billedBoks.append(img, knap('Fjern billede', 'lille-knap', () => { billede = ''; tegnBillede(); }));
    }
    const fil = el('label', 'lille-knap fil-knap', billede ? 'Skift billede' : 'Tag eller vælg billede');
    const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*';
    filInput.addEventListener('change', async () => {
      if (!filInput.files[0]) return;
      try { billede = await laesBillede(filInput.files[0]); } catch { fejl.textContent = 'Billedet kunne ikke læses. Prøv et andet.'; fejl.hidden = false; }
      tegnBillede();
    });
    fil.append(filInput);
    billedBoks.append(fil);
  };
  tegnBillede();

  const fejl = el('p', 'fejl'); fejl.hidden = true;

  const gem = knap('Gem', 'knap', async () => {
    const tekst = navn.value.trim();
    if (!tekst) { navn.focus(); return; }
    try {
      await Data.update('indkob', p.id, { tekst, butik, tilbud: tilbud.checked, note: note.value.trim(), billede });
    } catch {
      fejl.textContent = 'Kunne ikke gemme. Tjek forbindelsen og prøv igen.';
      fejl.hidden = false;
      return;
    }
    if (butik) await gemFavorit('butik', butik);
    await gemFavorit('indkob', tekst);
    await saetFavFelter('indkob', tekst, { butik });
    lukArk();
    tegnAlt();
  });
  const slet = knap('Slet', 'knap fare', async () => { await Data.remove('indkob', p.id); lukArk(); tegnAlt(); });
  const knapper = el('div', 'ark-knapper'); knapper.append(slet, gem);

  aabnArk('Vare', felt('Vare', navn), felt('Butik', butikValg), nyButik, tilbudLabel,
    felt('Note', note), felt('Billede', billedBoks), fejl, knapper);
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
const FavTilstand = { indkob: { alle: false, ret: false }, todo: { alle: false, ret: false }, ret: { alle: true, ret: false } };
const VIS_FAERRE = 10;

async function gemFavorit(type, tekst) {
  const favs = await Data.list('favoritter');
  const f = favs.find(x => x.type === type && x.tekst.toLowerCase() === tekst.toLowerCase());
  if (f) await Data.update('favoritter', f.id, { brugt: (f.brugt || 0) + 1 });
  else await Data.add('favoritter', { type, tekst, brugt: 1 });
}

async function tegnForslag(type) {
  const boks = document.querySelector(`[data-forslag="${type}"]`);
  const st = FavTilstand[type];
  let favs = (await Data.list('favoritter')).filter(f => f.type === type);
  let filter = '';

  if (type === 'ret') {
    document.getElementById('antal-retter').textContent = '(' + favs.length + ')';
    document.getElementById('retter-forslag').replaceChildren(...favs.map(f => { const o = el('option'); o.value = f.tekst; return o; }));
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
    if (type === 'ret' && !st.ret) { boks.append(el('span', 'tag', f.tekst)); continue; }
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
  if (!filter && !st.ret && type !== 'ret' && favs.length > VIS_FAERRE) {
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
  await gemFavorit('ret', tekst);
  felt.value = '';
  felt.focus();
  tegnForslag('ret');
});

document.querySelectorAll('.ryd[data-liste]').forEach(knap => {
  knap.addEventListener('click', () => bekraeft(knap, async () => {
    const navn = knap.dataset.liste;
    for (const p of (await Data.list(navn)).filter(p => p.klaret)) await Data.remove(navn, p.id);
    tegnAlt();
  }));
});

// ---------- Madplan ----------
async function tegnMadplan() {
  const ol = document.querySelector('.uge');
  const retter = await Data.list('madplan');
  const mandag = mandagDenneUge();
  const idag = idagNr();
  document.getElementById('ugenr').textContent = 'Uge ' + ugenummer(mandag);
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

    // Morgenmad og frokost (vises når "Morgen og frokost" er slået til)
    if (visMaaltider) {
      li.classList.add('med-maaltider');
      const ekstra = el('div', 'ekstra-mad');
      const plan = retter.find(r => r.dag === i) || {};
      for (const [noegle, navn, std] of [['morgen', 'Morgen', stdMorgen], ['frokost', 'Frokost', stdFrokost]]) {
        const lbl = el('label', null, navn);
        const inp = el('input');
        inp.type = 'text'; inp.id = noegle + '-' + i; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
        inp.placeholder = std || '–';
        inp.value = plan[noegle] || '';
        lbl.htmlFor = inp.id;
        inp.addEventListener('change', () => gemMad(i, noegle, inp.value.trim()));
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
        const par = el('div', 'mad-par');
        par.append(lbl, inp);
        ekstra.append(par);
      }
      li.append(ekstra);
    }
    ol.append(li);
  });
  nyeDage = new Set();
}

// Gemmer ét måltid (ret = aftensmad, morgen, frokost) for en ugedag
async function gemMad(dag, felt, vaerdi) {
  const fundet = (await Data.list('madplan')).find(r => r.dag === dag);
  if (fundet) {
    const ny = { ...fundet, [felt]: vaerdi };
    if (!ny.ret && !ny.morgen && !ny.frokost) await Data.remove('madplan', fundet.id);
    else await Data.update('madplan', fundet.id, { [felt]: vaerdi });
  } else if (vaerdi) {
    await Data.add('madplan', { dag, [felt]: vaerdi });
  }
  tegnOverblik();
}
const gemRet = (dag, ret) => gemMad(dag, 'ret', ret);

// Standard morgenmad/frokost – bruges når en dag ikke har sit eget
let visMaaltider = lokal.get('vis-maaltider') === '1';
let stdMorgen = '', stdFrokost = '';
async function hentIndstilling(noegle) {
  return (await Data.list('indstillinger')).find(x => x.noegle === noegle)?.vaerdi || '';
}
async function gemIndstilling(noegle, vaerdi) {
  const f = (await Data.list('indstillinger')).find(x => x.noegle === noegle);
  if (f) await Data.update('indstillinger', f.id, { vaerdi });
  else await Data.add('indstillinger', { noegle, vaerdi });
}
async function tegnMaaltidsValg() {
  stdMorgen = await hentIndstilling('std-morgen');
  stdFrokost = await hentIndstilling('std-frokost');
  const knapEl = document.getElementById('vis-maaltider');
  knapEl.setAttribute('aria-pressed', visMaaltider);
  knapEl.textContent = visMaaltider ? 'Skjul morgenmad og frokost' : 'Vis morgenmad og frokost';
  document.getElementById('standard-mad').hidden = !visMaaltider;
  const m = document.getElementById('std-morgen'), f = document.getElementById('std-frokost');
  if (document.activeElement !== m) m.value = stdMorgen;
  if (document.activeElement !== f) f.value = stdFrokost;
}
document.getElementById('vis-maaltider').addEventListener('click', async () => {
  visMaaltider = !visMaaltider;
  lokal.set('vis-maaltider', visMaaltider ? '1' : '');
  await tegnMaaltidsValg();
  tegnMadplan();
});
for (const [id, noegle] of [['std-morgen', 'std-morgen'], ['std-frokost', 'std-frokost']]) {
  const inp = document.getElementById(id);
  inp.addEventListener('change', async () => { await gemIndstilling(noegle, inp.value.trim()); await tegnMaaltidsValg(); tegnMadplan(); tegnOverblik(); });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') inp.blur(); });
}

// Terning: vælg tilfældige retter fra "Vores retter" – undgå gentagelser i samme uge
let nyeDage = new Set();
async function rulDage(dage) {
  const alle = (await Data.list('favoritter')).filter(f => f.type === 'ret').map(f => f.tekst);
  if (!alle.length) { document.querySelector('.retter-boks').open = true; return; }
  const plan = await Data.list('madplan');
  const brugt = new Set(plan.map(r => (r.ret || '').toLowerCase()).filter(Boolean));
  for (const dag of dage) {
    let mulige = alle.filter(r => !brugt.has(r.toLowerCase()));
    if (!mulige.length) mulige = alle;
    const ret = mulige[Math.floor(Math.random() * mulige.length)];
    brugt.add(ret.toLowerCase());
    await gemRet(dag, ret);
    nyeDage.add(dag);
  }
  tegnMadplan();
}

document.getElementById('fyld-tomme').addEventListener('click', async () => {
  const plan = await Data.list('madplan');
  rulDage([0, 1, 2, 3, 4, 5, 6].filter(d => !plan.some(r => r.dag === d && r.ret)));
});
const blandUge = document.getElementById('bland-uge');
blandUge.addEventListener('click', () => bekraeft(blandUge, () => rulDage([0, 1, 2, 3, 4, 5, 6])));

const rydUge = document.getElementById('ryd-uge');
rydUge.addEventListener('click', () => bekraeft(rydUge, async () => {
  for (const r of await Data.list('madplan')) await Data.remove('madplan', r.id);
  tegnAlt();
}));

// ---------- Skoleskema ----------
// Data: 'ringetider' {barn, nr, tid}  og  'skema' {barn, dag (0-4), nr, fag}
let skemaBarn = lokal.get('skema-barn') || BOERN[0];
let skemaDag = idagNr() < 5 ? idagNr() : 0;
let redigerer = false;
const LEKTIONER = [1, 2, 3, 4, 5, 6, 7];

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

async function dagensTimer(barn, dag) {
  const tider = (await Data.list('ringetider')).filter(r => r.barn === barn);
  const fag = (await Data.list('skema')).filter(s => s.barn === barn && s.dag === dag);
  return LEKTIONER.map(nr => ({
    nr,
    tid: tider.find(t => t.nr === nr)?.tid || '',
    fag: fag.find(f => f.nr === nr)?.fag || ''
  }));
}

async function tegnSkema() {
  tegnSkemaValg();
  const ol = document.getElementById('lektioner');
  const timer = await dagensTimer(skemaBarn, skemaDag);
  const medFag = timer.filter(t => t.fag);
  ol.replaceChildren();

  document.getElementById('rediger-skema').setAttribute('aria-pressed', redigerer);
  document.getElementById('rediger-skema').textContent = redigerer ? 'Færdig' : 'Ret skema';
  document.getElementById('rediger-hint').hidden = !redigerer;

  if (redigerer) {
    for (const t of timer) {
      const li = el('li', 'lektion');
      const tid = el('input', 'tid-felt');
      tid.type = 'text'; tid.value = t.tid; tid.placeholder = '8.00-8.45'; tid.inputMode = 'decimal';
      tid.setAttribute('aria-label', t.nr + '. lektion tid');
      tid.addEventListener('change', () => gemSkemaFelt('ringetider', { barn: skemaBarn, nr: t.nr }, { tid: tid.value.trim() }));
      const fag = el('input');
      fag.type = 'text'; fag.value = t.fag; fag.placeholder = 'Fag';
      fag.setAttribute('aria-label', t.nr + '. lektion fag');
      fag.addEventListener('change', () => gemSkemaFelt('skema', { barn: skemaBarn, dag: skemaDag, nr: t.nr }, { fag: fag.value.trim() }));
      li.append(el('span', 'nr', t.nr), tid, fag);
      ol.append(li);
    }
  } else if (!medFag.length) {
    ol.append(el('li', 'tom', 'Ingen timer lagt ind. Tryk på "Ret skema".'));
  } else {
    const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
    for (const t of medFag) {
      const [fra, til] = tidSomMin(t.tid);
      const erNu = skemaDag === idagNr() && fra != null && til != null && nuMin >= fra && nuMin < til;
      const li = el('li', 'lektion' + (erNu ? ' nu' : ''));
      li.append(el('span', 'nr', t.nr), el('span', 'tid', t.tid.replace('-', '–')), el('span', 'fag', t.fag));
      ol.append(li);
    }
  }

  const sidste = medFag[medFag.length - 1];
  document.getElementById('fri-kl').textContent = sidste && slutTid(sidste.tid) ? 'Fri kl. ' + slutTid(sidste.tid) : '';
}

async function gemSkemaFelt(liste, noegle, felter) {
  const match = r => Object.entries(noegle).every(([k, v]) => r[k] === v);
  const fundet = (await Data.list(liste)).find(match);
  const tom = Object.values(felter).every(v => !v);
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

async function tegnKalender() {
  const man = mandagDenneUge();
  man.setDate(man.getDate() + kalUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  const fra = man.getDate() + (man.getMonth() !== son.getMonth() ? '. ' + MDR[man.getMonth()] : '.');
  document.getElementById('kal-titel').textContent = 'Uge ' + ugenummer(man) + ' · ' + fra + '–' + son.getDate() + '. ' + MDR[son.getMonth()];
  document.getElementById('kal-idag').hidden = kalUge === 0;
  document.getElementById('kal-dato').textContent = son.getFullYear();

  const aftaler = await Data.list('kalender');
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

document.getElementById('kal-forrige').addEventListener('click', () => { kalUge--; tegnKalender(); });
document.getElementById('kal-naeste').addEventListener('click', () => { kalUge++; tegnKalender(); });
document.getElementById('kal-idag').addEventListener('click', () => { kalUge = 0; tegnKalender(); });

// ---------- Børnetavle: Olivers og Villads' egen I dag-side ----------
// Data: 'info' {barn, dato: 'ÅÅÅÅ-MM-DD', tekst} – ekstra ting at huske, som ikke står i kalenderen
const MDR_LANG = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
let tavleVisning = 'familie';   // 'familie' eller et barns navn
let tavleDag = idagNr();        // valgt ugedag på børnetavlen

function tegnTavleValg() {
  const seg = document.getElementById('idag-valg');
  const profil = Data.bruger();
  const erBarn = profil && profil.rolle === 'barn' && BOERN.includes(profil.navn);
  seg.hidden = erBarn;
  if (erBarn) return;
  seg.replaceChildren(...['familie', ...BOERN].map(v => {
    const k = knap(v === 'familie' ? 'Familien' : v, null, () => {
      tavleVisning = v; tavleDag = idagNr(); lokal.set('tavle', v); tegnOverblik();
    });
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', v === tavleVisning);
    return k;
  }));
}

async function tegnBoernetavle(barn) {
  const boks = document.getElementById('boernetavle');
  const man = mandagDenneUge();
  const idag = idagNr();
  const dato = new Date(man); dato.setDate(man.getDate() + tavleDag);
  const iso = isoDato(dato);

  // Ugedage med markering
  const strip = el('div', 'uge-strip');
  DAGE.forEach((d, i) => {
    const dd = new Date(man); dd.setDate(man.getDate() + i);
    const k = knap('', 'ugedag' + (i === idag ? ' idag' : '') + (i === tavleDag ? ' valgt' : '') + (i < idag ? ' forbi' : ''),
      () => { tavleDag = i; tegnOverblik(); });
    k.setAttribute('aria-pressed', i === tavleDag);
    k.setAttribute('aria-label', DAGE_LANG[i] + ' ' + dd.getDate() + '. ' + MDR_LANG[dd.getMonth()]);
    k.append(el('span', 'ud-navn', d), el('span', 'ud-nr', dd.getDate()));
    strip.append(k);
  });

  // Dato
  const hoved = el('div', 'bt-hoved');
  const dagNavn = el('p', 'bt-dag', DAGE_LANG[tavleDag]);
  if (tavleDag === idag) dagNavn.append(el('span', 'bt-idag', 'I dag'));
  hoved.append(dagNavn, el('p', 'bt-dato', dato.getDate() + '. ' + MDR_LANG[dato.getMonth()] + ' · uge ' + ugenummer(dato)));

  const kort = (titel, ...indhold) => {
    const k = el('div', 'kort');
    const top = el('div', 'kort-top');
    top.append(el('span', 'kort-label', titel));
    k.append(top, ...indhold);
    return k;
  };

  // Skema
  let skemaKort;
  if (tavleDag >= 5) {
    skemaKort = kort('Skole', el('p', 'stor tom-ret', 'Weekend – ingen skole'));
  } else {
    const timer = (await dagensTimer(barn, tavleDag)).filter(t => t.fag);
    if (!timer.length) {
      skemaKort = kort('Skole', el('p', 'under', 'Intet skema lagt ind for ' + DAGE_LANG[tavleDag].toLowerCase() + '.'));
    } else {
      const start = (timer[0].tid.split(/[-–]/)[0] || '').trim();
      const slut = slutTid(timer[timer.length - 1].tid);
      const tider = el('p', 'bt-tider');
      if (start) tider.append(el('span', null, 'Møder ' + start));
      if (slut) tider.append(el('span', null, 'Fri ' + slut));
      const ol = el('ol', 'lektioner bt-lektioner');
      const nu = new Date(); const nuMin = nu.getHours() * 60 + nu.getMinutes();
      for (const t of timer) {
        const [fra, til] = tidSomMin(t.tid);
        const erNu = tavleDag === idag && fra != null && til != null && nuMin >= fra && nuMin < til;
        const li = el('li', 'lektion' + (erNu ? ' nu' : ''));
        li.append(el('span', 'nr', t.nr), el('span', 'tid', t.tid.replace('-', '–')), el('span', 'fag', t.fag));
        ol.append(li);
      }
      skemaKort = kort('Skole', tider, ol);
    }
  }

  // Mad
  const plan = (await Data.list('madplan')).find(r => r.dag === tavleDag) || {};
  const morgen = plan.morgen || await hentIndstilling('std-morgen');
  const frokost = plan.frokost || await hentIndstilling('std-frokost');
  const madKort = kort('Mad');
  for (const [navn, ret] of [['Morgen', morgen], ['Frokost', frokost], ['Aften', plan.ret]]) {
    const r = el('div', 'maaltid');
    r.append(el('span', 'm-navn', navn), el('span', 'm-ret' + (ret ? '' : ' tom-ret'), ret || 'Ikke bestemt'));
    madKort.append(r);
  }

  // Husk: kalender (eget + fælles) og ekstra info
  const aftaler = (await Data.list('kalender'))
    .filter(a => a.dato === iso && (a.hvem === barn || a.hvem === 'Fælles')).sort(sorterAftaler);
  const info = (await Data.list('info')).filter(x => x.barn === barn && x.dato === iso);
  const liste = el('ul', 'husk-liste');
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
  if (!aftaler.length && !info.length) liste.append(el('li', 'tom-husk', 'Ikke noget særligt at huske.'));
  const form = el('form', 'tilfoj');
  const inp = input('text', 'ny-info', '', 'Fx idrætstøj, mormor henter');
  inp.enterKeyHint = 'done';
  inp.setAttribute('aria-label', 'Tilføj noget at huske');
  const tilfoej = el('button', 'knap', 'Tilføj');
  form.append(inp, tilfoej);
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
  gitter.append(huskKort, skemaKort, madKort);
  boks.replaceChildren(strip, hoved, gitter);
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
  if (!dagens.length) ovKal.append(el('li', null, 'Intet i kalenderen i dag'));
  for (const a of dagens) {
    const li = el('li', PK[a.hvem]);
    li.append(el('span', 'prik'), el('span', null, (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + ' · ' + a.hvem));
    ovKal.append(li);
  }
  const morgen = aftaler.filter(a => a.dato === iMorgenIso).sort(sorterAftaler);
  document.getElementById('ov-kal-imorgen').textContent = morgen.length
    ? 'I morgen: ' + morgen.map(a => (a.tid ? visTid(a.tid) + ' ' : '') + a.titel + ' (' + a.hvem + ')').join(', ')
    : '';

  const retter = await Data.list('madplan');
  const ret = retter.find(r => r.dag === idag)?.ret;
  const retEl = document.getElementById('ov-ret');
  retEl.textContent = ret || 'Ikke bestemt endnu';
  retEl.classList.toggle('tom-ret', !ret);
  const imorgen = idag < 6 ? retter.find(r => r.dag === idag + 1)?.ret : null;
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
  if ((await Data.list('favoritter')).length) return;
  const start = {
    ret: ['Lasagne', 'Tarteletter', 'Fiskefrikadeller', 'Hjemmelavet pizza', 'Burgere', 'Kylling i ovn',
      'Frikadeller med kartofler', 'Spaghetti med kødsovs', 'Boller i karry', 'Biksemad', 'Tacos',
      'Pasta carbonara', 'Hakkebøf med bløde løg', 'Millionbøf med kartoffelmos', 'Wok med nudler',
      'Laks med ris', 'Pandekager', 'Chili con carne', 'Fiskefilet med remoulade', 'Medisterpølse med kartofler',
      'Grøntsagssuppe med brød', 'Burritos', 'Karbonader', 'Rester'],
    indkob: ['Mælk', 'Rugbrød', 'Toastbrød', 'Smør', 'Ost', 'Pålæg', 'Æg', 'Bananer', 'Æbler', 'Agurk',
      'Gulerødder', 'Kaffe', 'Yoghurt', 'Havregryn', 'Pasta', 'Ris', 'Hakket oksekød', 'Kylling',
      'Toiletpapir', 'Opvasketabs', 'Gulerødder til Alfie', 'Hø til Alfie'],
    todo: ['Skift Alfies hø', 'Betal SFO', 'Smør madpakker', 'Vask tøj', 'Tøm opvaskemaskinen', 'Støvsug', 'Sæt skraldespanden ud'],
    butik: ['Netto', 'Rema 1000', 'Lidl', 'Føtex', 'Bilka', 'Coop 365']
  };
  const raekker = [];
  for (const [type, liste] of Object.entries(start)) {
    for (const tekst of liste) raekker.push({ type, tekst, brugt: 0 });
  }
  await Data.addMange('favoritter', raekker);
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
  tegnForslag('indkob'); tegnForslag('todo'); tegnForslag('ret');
}

async function startTavle() {
  const profil = Data.bruger();
  const logUd = document.getElementById('log-ud');
  logUd.textContent = profil.navn + ' · Log ud';
  logUd.hidden = false;
  await laegStartlisterInd();
  // Drengene ser deres egen tavle; voksne kan vælge
  if (profil.rolle === 'barn' && BOERN.includes(profil.navn)) tavleVisning = profil.navn;
  else tavleVisning = ['familie', ...BOERN].includes(lokal.get('tavle')) ? lokal.get('tavle') : 'familie';
  if (!BOERN.includes(skemaBarn)) skemaBarn = BOERN[0];
  tegnNyPrio();
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
