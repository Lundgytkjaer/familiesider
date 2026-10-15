// mappe.js – 📁 Familiemappen (Mere → Familiemappen): noter, links, nummerplader, kode-hints, billeder … sorteret i mapper.
// Data: tre lister med samme felter {titel, tekst, mappe, billeder: [data-URL], skjult?, fast?}
//   'noter'         – alle i familien kan se (børn kun læse)
//   'noter_voksne'  – kun voksne (databasen: kun_voksne)
//   'noter_privat'  – kun den, der skrev den (databasen: maa_se) – logges heller ikke i Aktivitet
// Links i teksten bliver til knapper. "Skjult felt" vises først, når man trykker (fx et kode-HINT – gem aldrig rigtige koder).
const NOTE_LISTER = { alle: 'noter', voksne: 'noter_voksne', mig: 'noter_privat' };
const NOTE_SYN = { alle: '👨‍👩‍👦‍👦 Alle', voksne: '🔒 Kun voksne', mig: '👤 Kun mig' };
const MAPPE_IKON = { 'Links': '🔗', 'Bil': '🚗', 'Hus og have': '🏡', 'Logins': '🔑', 'Skole': '🎒', 'Opskrifter': '🍳', 'Ferie': '🏖️', 'Andet': '📝' };
const MAX_BILLEDER = 4;
let mappeValgt = lokal.get('mappe') || 'alle';
let mappeSoeg = '';

const mappeIkon = m => MAPPE_IKON[m] || '📁';
function alleNoter() {
  const res = [];
  for (const [syn, liste] of Object.entries(NOTE_LISTER)) for (const n of Data.listNu(liste)) res.push({ ...n, _syn: syn, _liste: liste });
  return res;
}
function brugteMapper(noter) {
  const m = [...new Set(noter.map(n => n.mappe || 'Andet'))];
  return m.sort((a, b) => (a === 'Andet') - (b === 'Andet') || a.localeCompare(b, 'da'));
}
// Tekst → tekst + link-knapper (kun http/https og www.; laves som DOM, aldrig som HTML)
const URL_RE = /\b(https?:\/\/[^\s<>"]+|www\.[^\s<>"]+)/gi;
function tekstMedLinks(tekst) {
  const boks = el('div', 'note-tekst');
  for (const linje of (tekst || '').split('\n')) {
    const p = el('p');
    let rest = 0;
    linje.replace(URL_RE, (m, _, i) => {
      if (i > rest) p.append(linje.slice(rest, i));
      const url = m.replace(/[.,;:!?)]+$/, '');
      const a = el('a', 'note-link', url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''));
      a.href = /^https?:/i.test(url) ? url : 'https://' + url;
      a.target = '_blank'; a.rel = 'noopener noreferrer';
      p.append('🔗 ', a);
      rest = i + url.length;
      return m;
    });
    if (rest < linje.length) p.append(linje.slice(rest));
    boks.append(p);
  }
  return boks;
}
const antalLinks = t => ((t || '').match(URL_RE) || []).length;
const foersteLinje = t => ((t || '').split('\n').map(x => x.replace(URL_RE, '').trim()).find(Boolean) || '');

// ---------- Siden ----------
function tegnMappe() {
  const boks = document.getElementById('mappe-indhold');
  if (!boks) return;
  const noter = alleNoter();
  const mapper = brugteMapper(noter);
  if (mappeValgt !== 'alle' && !mapper.includes(mappeValgt)) mappeValgt = 'alle';
  const dele = [];
  if (noter.length > 5) {
    const soeg = input('search', 'mappe-soeg', mappeSoeg, 'Søg i noterne');
    soeg.addEventListener('input', () => { mappeSoeg = soeg.value; tegnListe(); });
    dele.push(soeg);
  }
  if (mapper.length) {
    const seg = el('div', 'seg wrap mappe-valg');
    const k = (id, tekst) => { const b = knap(tekst, null, () => { mappeValgt = id; lokal.set('mappe', id); tegnMappe(); }); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', mappeValgt === id); return b; };
    seg.append(k('alle', 'Alle (' + noter.length + ')'), ...mapper.map(m => k(m, mappeIkon(m) + ' ' + m + ' (' + noter.filter(n => (n.mappe || 'Andet') === m).length + ')')));
    dele.push(seg);
  }
  const ul = el('ul', 'note-liste');
  dele.push(ul);
  boks.replaceChildren(...dele);
  function tegnListe() {
    const q = mappeSoeg.trim().toLowerCase();
    const vist = noter.filter(n => (mappeValgt === 'alle' || (n.mappe || 'Andet') === mappeValgt)
      && (!q || [n.titel, n.tekst, n.mappe].some(x => (x || '').toLowerCase().includes(q))))
      .sort((a, b) => (!!b.fast - !!a.fast) || (b.rettet || b.oprettet || '').localeCompare(a.rettet || a.oprettet || ''));
    ul.replaceChildren(...vist.map(n => {
      const li = el('li');
      const b = knap('', 'note-kort', () => visNote(n));
      const top = el('span', 'note-top');
      top.append(el('span', 'note-ikon', mappeIkon(n.mappe || 'Andet')), el('b', 'note-titel', (n.fast ? '📌 ' : '') + (n.titel || 'Uden titel')));
      b.append(top);
      const f = foersteLinje(n.tekst);
      if (f) b.append(el('span', 'note-uddrag', f));
      const info = [antalLinks(n.tekst) ? '🔗 ' + antalLinks(n.tekst) : '', (n.billeder || []).length ? '📷 ' + n.billeder.length : '', n.skjult ? '🔒 skjult felt' : '',
        n._syn !== 'alle' ? NOTE_SYN[n._syn] : ''].filter(Boolean);
      if (info.length) b.append(el('span', 'note-info', info.join(' · ')));
      if ((n.billeder || [])[0]) { const img = el('img', 'note-thumb'); img.src = n.billeder[0]; img.alt = ''; img.loading = 'lazy'; b.append(img); }
      li.append(b);
      return li;
    }));
    if (!vist.length) ul.append(el('li', 'tom', noter.length ? 'Ingen noter her.' : (erBarn() ? 'Der er ingen noter endnu.' : 'Tryk "+ Ny note" – fx wifi, nummerpladen, gode links eller skolens telefonnummer.')));
  }
  tegnListe();
}

function visNote(n) {
  const dele = [el('p', 'note-meta', mappeIkon(n.mappe || 'Andet') + ' ' + (n.mappe || 'Andet') + (n._syn !== 'alle' ? ' · ' + NOTE_SYN[n._syn] : ''))];
  if (n.tekst) dele.push(tekstMedLinks(n.tekst));
  if (n.skjult) {
    const s = el('div', 'note-skjult');
    const vaerdi = el('span', 'note-skjult-vaerdi', '••••••');
    const vis = knap('Vis', 'lille-knap', () => { const synlig = vaerdi.textContent !== '••••••'; vaerdi.textContent = synlig ? '••••••' : n.skjult; vis.textContent = synlig ? 'Vis' : 'Skjul'; });
    s.append(el('span', null, '🔒'), vaerdi, vis);
    if (navigator.clipboard) s.append(knap('Kopiér', 'lille-knap', async () => { try { await navigator.clipboard.writeText(n.skjult); visStatus('Kopieret'); } catch { visStatus('Kunne ikke kopiere', true); } }));
    dele.push(s);
  }
  if ((n.billeder || []).length) {
    const g = el('div', 'note-billeder');
    for (const src of n.billeder) {
      const k = knap('', 'note-billede-knap', () => visStortBillede(src, n.titel || ''));
      const img = el('img'); img.src = src; img.alt = ''; k.append(img); g.append(k);
    }
    dele.push(g);
  }
  if (!erBarn()) {
    const knapper = el('div', 'ark-knapper');
    knapper.append(knap('✏️ Ret', 'knap', () => redigerNote(n)));
    dele.push(knapper);
  }
  aabnArk((n.fast ? '📌 ' : '') + (n.titel || 'Note'), ...dele);
}

function redigerNote(n = {}) {
  const ny = !n.id;
  const s = { mappe: n.mappe || (mappeValgt !== 'alle' ? mappeValgt : 'Andet'), syn: n._syn || 'alle', billeder: [...(n.billeder || [])], fast: !!n.fast };
  const titel = input('text', 'note-titel', n.titel || '', 'Fx Wifi, Bilens nummerplade, Skolens intra');
  titel.maxLength = 80;
  const tekst = el('textarea', 'k-tekst note-tekst-felt'); tekst.id = 'note-tekst'; tekst.rows = 5; tekst.value = n.tekst || '';
  tekst.placeholder = 'Skriv frit. Links (https://… eller www.…) bliver til knapper.';
  const skjult = input('text', 'note-skjult', n.skjult || '', 'Valgfrit – vises først når man trykker');
  skjult.maxLength = 200;
  // Mapper: de faste + dem I selv har lavet + "Ny mappe"
  const mappeBoks = el('div');
  const tegnMapper = () => {
    const alle = [...new Set([...Object.keys(MAPPE_IKON), ...brugteMapper(alleNoter()), s.mappe])];
    mappeBoks.replaceChildren(chipValg(alle, s.mappe, v => { s.mappe = v; tegnMapper(); }, v => mappeIkon(v) + ' ' + v));
  };
  const nyMappe = input('text', 'note-ny-mappe', '', '+ Ny mappe, fx Fiskeri');
  nyMappe.maxLength = 30;
  nyMappe.addEventListener('change', () => { const v = nyMappe.value.trim(); if (v) { s.mappe = v[0].toUpperCase() + v.slice(1); nyMappe.value = ''; tegnMapper(); } });
  tegnMapper();
  const synBoks = chipValg(Object.keys(NOTE_SYN), s.syn, v => { s.syn = v; }, v => NOTE_SYN[v]);
  const fastKnap = knap('📌 Fastgør øverst', null, () => { s.fast = !s.fast; fastKnap.setAttribute('aria-checked', s.fast); });
  fastKnap.setAttribute('role', 'checkbox'); fastKnap.setAttribute('aria-checked', s.fast);
  const fastBoks = el('div', 'seg wrap'); fastBoks.append(fastKnap);
  // Billeder (højst 4, gøres små før de gemmes)
  const billedBoks = el('div', 'note-billeder ret');
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*'; filInput.multiple = true; filInput.hidden = true;
  filInput.addEventListener('change', async () => {
    for (const fil of [...(filInput.files || [])].slice(0, MAX_BILLEDER - s.billeder.length)) {
      try { s.billeder.push(await laesBillede(fil, 1200, 0.72)); } catch { visStatus('Et billede kunne ikke læses', true); }
    }
    filInput.value = ''; tegnBilleder();
  });
  const tegnBilleder = () => {
    billedBoks.replaceChildren(filInput, ...s.billeder.map((src, i) => {
      const w = el('div', 'note-billede-ret');
      const img = el('img'); img.src = src; img.alt = '';
      const fjern = knap('✕', 'note-fjern', () => { s.billeder.splice(i, 1); tegnBilleder(); });
      fjern.setAttribute('aria-label', 'Fjern billede');
      w.append(img, fjern);
      return w;
    }));
    if (s.billeder.length < MAX_BILLEDER) billedBoks.append(knap('📷 Tilføj billede', 'lille-knap', () => filInput.click()));
  };
  tegnBilleder();

  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(bekraeftKnap('Slet', 'slette noten', 'knap fare', async () => { await Data.remove(n._liste, n.id); lukArk(); tegnMappe(); }));
  knapper.append(knap('Gem', 'knap', async () => {
    const t = titel.value.trim();
    if (!t && !tekst.value.trim()) { titel.focus(); visStatus('Skriv en titel eller lidt tekst', true); return; }
    const felter = { titel: t, tekst: tekst.value.trim(), mappe: s.mappe, billeder: s.billeder, skjult: skjult.value.trim() || null, fast: s.fast, rettet: new Date().toISOString() };
    const liste = NOTE_LISTER[s.syn];
    try {
      if (ny) await Data.add(liste, felter);
      else if (liste === n._liste) await Data.update(liste, n.id, felter);
      else { await Data.add(liste, felter); await Data.stille(() => Data.remove(n._liste, n.id)); }   // ny synlighed = flyt til den anden liste
    } catch { visStatus('Kunne ikke gemme noten', true); return; }
    mappeValgt = s.mappe; lokal.set('mappe', s.mappe);
    lukArk(); tegnMappe(); visStatus('Gemt i ' + s.mappe);
  }));
  aabnArk(ny ? 'Ny note' : 'Ret note', felt('Titel', titel), el('label', 'felt-label', 'Mappe'), mappeBoks, nyMappe,
    felt('Tekst og links', tekst), felt('🔒 Skjult felt', skjult),
    el('p', 'hint', 'Til fx et kode-HINT ("Alfie + årstal") – gem aldrig rigtige koder her. Brug telefonens adgangskode-app til dem.'),
    el('label', 'felt-label', 'Billeder'), billedBoks,
    el('label', 'felt-label', 'Hvem kan se den?'), synBoks, fastBoks, knapper);
  if (ny) setTimeout(() => titel.focus(), 50);
}

document.getElementById('ny-note')?.addEventListener('click', () => redigerNote());
Data.onChange(() => { if (typeof aktivFane !== 'undefined' && aktivFane === 'mappe') tegnMappe(); });
