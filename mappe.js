// mappe.js – 📁 Familiemappen (Mere → Familiemappen): noter i mapper – lidt som OneNote.
// Data: tre lister med samme felter {titel, mappe, hvem: [navne], blokke: [...], skjult?, fast?, rettet}
//   'noter'         – alle i familien kan se (børn kun læse)
//   'noter_voksne'  – kun voksne (databasen: kun_voksne)
//   'noter_privat'  – kun den, der skrev den (databasen: maa_se) – logges heller ikke i Aktivitet
// En note består af blokke i rækkefølge:
//   {type: 'tekst', tekst}                       – links (https://… / www.…) bliver til knapper
//   {type: 'tabel', kolonner: [..], raekker: [[..]]} – fx synsprøver: én række pr. gang (nyeste øverst)
//   {type: 'tjek', punkter: [{tekst, klaret}]}  – tjekliste (kan krydses af direkte, når noten vises)
//   {type: 'billede', src}                       – billede (også indsat med "sæt ind" fra udklipsholderen)
// Ældre noter med {tekst, billeder} vises som blokke og gemmes som blokke næste gang, de rettes.
// "Skjult felt" vises først, når man trykker (fx et kode-HINT – gem aldrig rigtige koder).
const NOTE_LISTER = { alle: 'noter', voksne: 'noter_voksne', mig: 'noter_privat' };
const NOTE_SYN = { alle: '👨‍👩‍👦‍👦 Alle', voksne: '🔒 Kun voksne', mig: '👤 Kun mig' };
const MAPPE_IKON = {
  'Hus og have': '🏡', 'Bil': '🚗', 'Sundhed': '🩺', 'Skole og fritid': '🎒', 'Størrelser': '👕', 'Papirer og forsikring': '🗂️',
  'Wifi og teknik': '📶', 'Logins': '🔑', 'Links': '🔗', 'Opskrifter': '🍳', 'Ferie og rejser': '🏖️', 'Alfie': '🐰', 'Gaveidéer': '🎁', 'Andet': '📝'
};
const NOTE_HVEM = () => [...PERSONER.filter(n => n !== 'Fælles'), 'Alfie'];
const TABEL_SKABELONER = {
  'Synsprøve': ['Dato', 'Højre', 'Venstre', 'Bemærkning'],
  'Størrelser': ['Dato', 'Sko', 'Bukser', 'Trøje'],
  'Højde': ['Dato', 'Højde'],
  'Tom tabel': ['', '']
};
const MAX_BILLEDER = 6;
let mappeValgt = lokal.get('mappe') || 'alle';
let mappeHvem = '';
let mappeSoeg = '';

const mappeIkon = m => MAPPE_IKON[m] || '📁';
const idagDato = () => { const d = new Date(); return d.getDate() + '/' + (d.getMonth() + 1) + ' ' + d.getFullYear(); };
// Blokkene for en note (også gamle noter med tekst + billeder)
function noteBlokke(n) {
  if (Array.isArray(n.blokke)) return n.blokke;
  const b = [];
  if (n.tekst) b.push({ type: 'tekst', tekst: n.tekst });
  for (const src of n.billeder || []) b.push({ type: 'billede', src });
  return b;
}
function alleNoter() {
  const res = [];
  for (const [syn, liste] of Object.entries(NOTE_LISTER)) for (const n of Data.listNu(liste)) res.push({ ...n, _syn: syn, _liste: liste });
  return res;
}
function brugteMapper(noter) {
  const m = [...new Set(noter.map(n => n.mappe || 'Andet'))];
  return m.sort((a, b) => (a === 'Andet') - (b === 'Andet') || a.localeCompare(b, 'da'));
}
const noteSoegTekst = n => [n.titel, n.mappe, ...(n.hvem || []), ...noteBlokke(n).flatMap(b =>
  b.type === 'tekst' ? [b.tekst] : b.type === 'tabel' ? [...(b.kolonner || []), ...(b.raekker || []).flat()] : b.type === 'tjek' ? (b.punkter || []).map(p => p.tekst) : [])].join(' ').toLowerCase();

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
const antalLinks = n => noteBlokke(n).filter(b => b.type === 'tekst').reduce((s, b) => s + ((b.tekst || '').match(URL_RE) || []).length, 0);
const foersteLinje = n => {
  for (const b of noteBlokke(n)) {
    if (b.type === 'tekst') { const l = (b.tekst || '').split('\n').map(x => x.replace(URL_RE, '').trim()).find(Boolean); if (l) return l; }
    if (b.type === 'tabel' && (b.raekker || []).length) return (b.raekker[0] || []).filter(Boolean).join(' · ');
    if (b.type === 'tjek' && (b.punkter || []).length) return '☐ ' + b.punkter.filter(p => !p.klaret).length + ' af ' + b.punkter.length + ' mangler';
  }
  return '';
};

// ---------- Siden ----------
function tegnMappe() {
  const boks = document.getElementById('mappe-indhold');
  if (!boks) return;
  const noter = alleNoter();
  const mapper = brugteMapper(noter);
  if (mappeValgt !== 'alle' && !mapper.includes(mappeValgt)) mappeValgt = 'alle';
  const personer = NOTE_HVEM().filter(p => noter.some(n => (n.hvem || []).includes(p)));
  if (mappeHvem && !personer.includes(mappeHvem)) mappeHvem = '';
  const dele = [];
  if (noter.length > 5) {
    const soeg = input('search', 'mappe-soeg', mappeSoeg, 'Søg i noterne – også i tabeller');
    soeg.addEventListener('input', () => { mappeSoeg = soeg.value; tegnListe(); });
    dele.push(soeg);
  }
  if (mapper.length) {
    const seg = el('div', 'seg wrap mappe-valg');
    const k = (id, tekst) => { const b = knap(tekst, null, () => { mappeValgt = id; lokal.set('mappe', id); tegnMappe(); }); b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', mappeValgt === id); return b; };
    seg.append(k('alle', 'Alle (' + noter.length + ')'), ...mapper.map(m => k(m, mappeIkon(m) + ' ' + m + ' (' + noter.filter(n => (n.mappe || 'Andet') === m).length + ')')));
    dele.push(seg);
  }
  if (personer.length) {
    const ps = el('div', 'seg wrap mappe-hvem');
    for (const p of ['', ...personer]) {
      const b = knap(p || 'Alle personer', p ? PK[p] || null : null, () => { mappeHvem = mappeHvem === p ? '' : p; tegnMappe(); });
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', mappeHvem === p);
      ps.append(b);
    }
    dele.push(ps);
  }
  const ul = el('ul', 'note-liste');
  dele.push(ul);
  boks.replaceChildren(...dele);
  function tegnListe() {
    const q = mappeSoeg.trim().toLowerCase();
    const vist = noter.filter(n => (mappeValgt === 'alle' || (n.mappe || 'Andet') === mappeValgt)
      && (!mappeHvem || (n.hvem || []).includes(mappeHvem)) && (!q || noteSoegTekst(n).includes(q)))
      .sort((a, b) => (!!b.fast - !!a.fast) || (b.rettet || b.oprettet || '').localeCompare(a.rettet || a.oprettet || ''));
    ul.replaceChildren(...vist.map(n => {
      const li = el('li');
      const b = knap('', 'note-kort', () => visNote(n.id));
      const top = el('span', 'note-top');
      top.append(el('span', 'note-ikon', mappeIkon(n.mappe || 'Andet')), el('b', 'note-titel', (n.fast ? '📌 ' : '') + (n.titel || 'Uden titel')));
      b.append(top);
      const f = foersteLinje(n);
      if (f) b.append(el('span', 'note-uddrag', f));
      const bl = noteBlokke(n);
      const nB = bl.filter(x => x.type === 'billede').length, nT = bl.filter(x => x.type === 'tabel').reduce((s, x) => s + (x.raekker || []).length, 0);
      const info = [(n.hvem || []).join(', '), antalLinks(n) ? '🔗 ' + antalLinks(n) : '', nT ? '▦ ' + nT + (nT === 1 ? ' række' : ' rækker') : '', nB ? '📷 ' + nB : '',
        n.skjult ? '🔒' : '', n._syn !== 'alle' ? NOTE_SYN[n._syn] : ''].filter(Boolean);
      if (info.length) b.append(el('span', 'note-info', info.join(' · ')));
      const billede = bl.find(x => x.type === 'billede');
      if (billede) { const img = el('img', 'note-thumb'); img.src = billede.src; img.alt = ''; img.loading = 'lazy'; b.append(img); }
      li.append(b);
      return li;
    }));
    if (!vist.length) ul.append(el('li', 'tom', noter.length ? 'Ingen noter her.' : (erBarn() ? 'Der er ingen noter endnu.' : 'Tryk "+ Ny note" – fx wifi, nummerpladen, gode links eller synsprøver.')));
  }
  tegnListe();
}

// ---------- Vis en note ----------
function tabelEl(b) {
  const wrap = el('div', 'note-tabel-wrap');
  const t = el('table', 'note-tabel');
  const thead = el('thead'), tr = el('tr');
  for (const k of b.kolonner || []) tr.append(el('th', null, k));
  thead.append(tr);
  const tbody = el('tbody');
  for (const r of b.raekker || []) { const rr = el('tr'); (b.kolonner || []).forEach((_, i) => rr.append(el('td', null, r[i] || ''))); tbody.append(rr); }
  if (!(b.raekker || []).length) { const rr = el('tr'); const td = el('td', 'tom', 'Ingen rækker endnu'); td.colSpan = (b.kolonner || []).length || 1; rr.append(td); tbody.append(rr); }
  t.append(thead, tbody);
  wrap.append(t);
  return wrap;
}
function visNote(id) {
  const n = alleNoter().find(x => x.id === id);
  if (!n) return;
  const meta = [mappeIkon(n.mappe || 'Andet') + ' ' + (n.mappe || 'Andet'), (n.hvem || []).join(', '), n._syn !== 'alle' ? NOTE_SYN[n._syn] : ''].filter(Boolean).join(' · ');
  const dele = [el('p', 'note-meta', meta)];
  const blokke = noteBlokke(n);
  blokke.forEach((b, bi) => {
    if (b.type === 'tekst' && b.tekst) dele.push(tekstMedLinks(b.tekst));
    if (b.type === 'tabel') dele.push(tabelEl(b));
    if (b.type === 'billede') { const k = knap('', 'note-billede-knap', () => visStortBillede(b.src, n.titel || '')); const img = el('img'); img.src = b.src; img.alt = ''; k.append(img); dele.push(k); }
    if (b.type === 'tjek') {
      const ul = el('ul', 'note-tjek');
      (b.punkter || []).forEach((p, pi) => {
        const li = el('li', p.klaret ? 'klaret' : '');
        const k = knap((p.klaret ? '☑ ' : '☐ ') + p.tekst, 'note-tjek-punkt', async () => {
          if (erBarn()) return;
          const ny = blokke.map((x, i) => i !== bi ? x : { ...x, punkter: x.punkter.map((y, j) => j !== pi ? y : { ...y, klaret: !y.klaret }) });
          await Data.update(n._liste, n.id, { blokke: ny, tekst: null, billeder: null });
          visNote(n.id);
        });
        li.append(k); ul.append(li);
      });
      dele.push(ul);
    }
  });
  if (n.skjult) {
    const s = el('div', 'note-skjult');
    const vaerdi = el('span', 'note-skjult-vaerdi', '••••••');
    const vis = knap('Vis', 'lille-knap', () => { const synlig = vaerdi.textContent !== '••••••'; vaerdi.textContent = synlig ? '••••••' : n.skjult; vis.textContent = synlig ? 'Vis' : 'Skjul'; });
    s.append(el('span', null, '🔒'), vaerdi, vis);
    if (navigator.clipboard) s.append(knap('Kopiér', 'lille-knap', async () => { try { await navigator.clipboard.writeText(n.skjult); visStatus('Kopieret'); } catch { visStatus('Kunne ikke kopiere', true); } }));
    dele.push(s);
  }
  // Tabel: hurtig "+ Ny række" uden at åbne hele noten
  const tabeller = blokke.map((b, i) => [b, i]).filter(([b]) => b.type === 'tabel');
  if (!erBarn()) {
    const knapper = el('div', 'ark-knapper');
    if (tabeller.length === 1) knapper.append(knap('+ Ny række', 'knap sekundaer', () => nyRaekke(n, tabeller[0][1])));
    knapper.append(knap('✏️ Ret', 'knap', () => redigerNote(n)));
    dele.push(knapper);
  }
  aabnArk((n.fast ? '📌 ' : '') + (n.titel || 'Note'), ...dele);
}
// En ny række i en tabel (fx en ny synsprøve) – dato-kolonnen udfyldes med i dag
function nyRaekke(n, bi) {
  const blokke = noteBlokke(n).map(b => ({ ...b }));
  const b = blokke[bi];
  const felter = (b.kolonner || []).map((k, i) => {
    const f = input('text', 'raekke-' + i, /dato/i.test(k) ? idagDato() : '', k || 'Kolonne ' + (i + 1));
    return felt(k || 'Kolonne ' + (i + 1), f);
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Gem række', 'knap', async () => {
    const r = felter.map(f => f.querySelector('input').value.trim());
    if (!r.some(Boolean)) return;
    b.raekker = [r, ...(b.raekker || [])];
    await Data.update(n._liste, n.id, { blokke, tekst: null, billeder: null, rettet: new Date().toISOString() });
    visNote(n.id);
  }));
  aabnArk('Ny række · ' + (n.titel || ''), ...felter, knapper);
  setTimeout(() => felter[0]?.querySelector('input')?.select(), 50);
}

// ---------- Ret / ny note ----------
function redigerNote(n = {}) {
  const ny = !n.id;
  const s = {
    mappe: n.mappe || (mappeValgt !== 'alle' ? mappeValgt : 'Andet'), syn: n._syn || 'alle', fast: !!n.fast,
    hvem: [...(n.hvem || (mappeHvem ? [mappeHvem] : []))],
    blokke: JSON.parse(JSON.stringify(noteBlokke(n).length ? noteBlokke(n) : [{ type: 'tekst', tekst: '' }]))
  };
  const titel = input('text', 'note-titel', n.titel || '', 'Fx Wifi, Synsprøver, Bilens nummerplade');
  titel.maxLength = 80;
  const skjult = input('text', 'note-skjult', n.skjult || '', 'Valgfrit – vises først når man trykker');
  skjult.maxLength = 200;
  // Mapper: de faste + egne + "Ny mappe"
  const mappeBoks = el('div');
  const tegnMapper = () => {
    const alle = [...new Set([...Object.keys(MAPPE_IKON), ...brugteMapper(alleNoter()), s.mappe])];
    mappeBoks.replaceChildren(chipValg(alle, s.mappe, v => { s.mappe = v; tegnMapper(); }, v => mappeIkon(v) + ' ' + v));
  };
  const nyMappe = input('text', 'note-ny-mappe', '', '+ Ny mappe, fx Fiskeri');
  nyMappe.maxLength = 30;
  nyMappe.addEventListener('change', () => { const v = nyMappe.value.trim(); if (v) { s.mappe = v[0].toUpperCase() + v.slice(1); nyMappe.value = ''; tegnMapper(); } });
  tegnMapper();
  // Hvem drejer det sig om?
  const hvemBoks = el('div', 'seg wrap sted-hvem-valg');
  const tegnHvem = () => hvemBoks.replaceChildren(...NOTE_HVEM().map(p => {
    const k = knap(p, PK[p] || null, () => { s.hvem = s.hvem.includes(p) ? s.hvem.filter(x => x !== p) : [...s.hvem, p]; tegnHvem(); });
    k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', s.hvem.includes(p));
    return k;
  }));
  tegnHvem();

  // Blokkene
  const blokBoks = el('div', 'note-blokke');
  const antalBilleder = () => s.blokke.filter(b => b.type === 'billede').length;
  let aktiv = s.blokke.length - 1;   // hvor nye blokke indsættes (efter den blok man sidst rørte)
  const indsaet = b => { s.blokke.splice(aktiv + 1, 0, b); aktiv++; tegnBlokke(); };
  async function tilfoejBillede(fil) {
    if (antalBilleder() >= MAX_BILLEDER) { visStatus('Højst ' + MAX_BILLEDER + ' billeder pr. note', true); return; }
    try { indsaet({ type: 'billede', src: await laesBillede(fil, 1200, 0.72) }); } catch { visStatus('Billedet kunne ikke læses', true); }
  }
  function blokRamme(i, ...indhold) {
    const r = el('div', 'note-blok');
    r.addEventListener('focusin', () => { aktiv = i; });
    const styr = el('div', 'note-blok-styr');
    const op = knap('↑', 'lille-knap', () => { if (i > 0) { [s.blokke[i - 1], s.blokke[i]] = [s.blokke[i], s.blokke[i - 1]]; aktiv = i - 1; tegnBlokke(); } });
    const ned = knap('↓', 'lille-knap', () => { if (i < s.blokke.length - 1) { [s.blokke[i + 1], s.blokke[i]] = [s.blokke[i], s.blokke[i + 1]]; aktiv = i + 1; tegnBlokke(); } });
    const slet = knap('✕', 'lille-knap', () => { s.blokke.splice(i, 1); aktiv = Math.min(aktiv, s.blokke.length - 1); tegnBlokke(); });
    op.disabled = i === 0; ned.disabled = i === s.blokke.length - 1;
    op.setAttribute('aria-label', 'Flyt op'); ned.setAttribute('aria-label', 'Flyt ned'); slet.setAttribute('aria-label', 'Fjern');
    styr.append(op, ned, slet);
    r.append(...indhold, styr);
    return r;
  }
  function tegnBlokke() {
    blokBoks.replaceChildren(...s.blokke.map((b, i) => {
      if (b.type === 'tekst') {
        const t = el('textarea', 'k-tekst note-tekst-felt'); t.rows = Math.min(10, Math.max(3, (b.tekst || '').split('\n').length + 1)); t.value = b.tekst || '';
        t.placeholder = 'Skriv frit. Links (https://… eller www.…) bliver til knapper.';
        t.addEventListener('input', () => { b.tekst = t.value; });
        return blokRamme(i, t);
      }
      if (b.type === 'billede') { const img = el('img', 'note-blok-billede'); img.src = b.src; img.alt = ''; return blokRamme(i, img); }
      if (b.type === 'tjek') {
        const ul = el('div', 'note-tjek-ret');
        const tegnP = () => {
          ul.replaceChildren(...(b.punkter || []).map((p, pi) => {
            const r = el('div', 'note-tjek-raekke');
            const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!p.klaret; cb.addEventListener('change', () => { p.klaret = cb.checked; });
            const t = input('text', '', p.tekst, 'Punkt'); t.addEventListener('input', () => { p.tekst = t.value; });
            r.append(cb, t, knap('✕', 'lille-knap', () => { b.punkter.splice(pi, 1); tegnP(); }));
            return r;
          }), knap('+ Punkt', 'lille-knap', () => { (b.punkter ||= []).push({ tekst: '', klaret: false }); tegnP(); ul.querySelectorAll('input[type=text]')[b.punkter.length - 1]?.focus(); }));
        };
        tegnP();
        return blokRamme(i, ul);
      }
      if (b.type === 'tabel') {
        const wrap = el('div', 'note-tabel-ret');
        const tegnT = () => {
          const t = el('table', 'note-tabel');
          const hr = el('tr');
          (b.kolonner ||= []).forEach((k, ki) => { const th = el('th'); const inp = input('text', '', k, 'Kolonne'); inp.addEventListener('input', () => { b.kolonner[ki] = inp.value; }); th.append(inp); hr.append(th); });
          const thead = el('thead'); thead.append(hr);
          const tbody = el('tbody');
          (b.raekker ||= []).forEach((r, ri) => {
            const tr = el('tr');
            b.kolonner.forEach((_, ki) => { const td = el('td'); const inp = input('text', '', r[ki] || '', ''); inp.addEventListener('input', () => { r[ki] = inp.value; }); td.append(inp); tr.append(td); });
            const td = el('td', 'note-tabel-slet'); td.append(knap('✕', 'lille-knap', () => { b.raekker.splice(ri, 1); tegnT(); })); tr.append(td);
            tbody.append(tr);
          });
          t.append(thead, tbody);
          const sk = el('div', 'note-tabel-styr');
          sk.append(knap('+ Række', 'lille-knap', () => { b.raekker.unshift(b.kolonner.map(k => /dato/i.test(k) ? idagDato() : '')); tegnT(); }),
            knap('+ Kolonne', 'lille-knap', () => { b.kolonner.push(''); b.raekker.forEach(r => r.push('')); tegnT(); }),
            b.kolonner.length > 1 ? knap('− Kolonne', 'lille-knap', () => { b.kolonner.pop(); b.raekker.forEach(r => r.length = b.kolonner.length); tegnT(); }) : '');
          const scroll = el('div', 'note-tabel-wrap'); scroll.append(t);
          wrap.replaceChildren(scroll, sk);
        };
        tegnT();
        return blokRamme(i, wrap);
      }
      return el('div');
    }));
  }
  tegnBlokke();
  // Tilføj blokke
  const filInput = el('input'); filInput.type = 'file'; filInput.accept = 'image/*'; filInput.multiple = true; filInput.hidden = true;
  filInput.addEventListener('change', async () => { for (const f of [...(filInput.files || [])]) await tilfoejBillede(f); filInput.value = ''; });
  const tabelMenu = el('div', 'seg wrap'); tabelMenu.hidden = true;
  tabelMenu.append(...Object.entries(TABEL_SKABELONER).map(([navn, kol]) => knap('▦ ' + navn, 'lille-knap', () => { tabelMenu.hidden = true; indsaet({ type: 'tabel', kolonner: [...kol], raekker: [] }); })));
  const tilfoej = el('div', 'note-tilfoej');
  tilfoej.append(filInput, el('span', 'seg-label', 'Tilføj'),
    knap('¶ Tekst', 'lille-knap', () => indsaet({ type: 'tekst', tekst: '' })),
    knap('▦ Tabel', 'lille-knap', () => { tabelMenu.hidden = !tabelMenu.hidden; }),
    knap('☑ Tjekliste', 'lille-knap', () => indsaet({ type: 'tjek', punkter: [{ tekst: '', klaret: false }] })),
    knap('📷 Billede', 'lille-knap', () => filInput.click()),
    navigator.clipboard?.read ? knap('📋 Sæt billede ind', 'lille-knap', async () => {   // skærmklip fra udklipsholderen
      try {
        let fundet = 0;
        for (const item of await navigator.clipboard.read()) {
          const type = item.types.find(t => t.startsWith('image/'));
          if (type) { await tilfoejBillede(await item.getType(type)); fundet++; }
        }
        if (!fundet) visStatus('Der er intet billede i udklipsholderen', true);
      } catch { visStatus('Kunne ikke hente fra udklipsholderen', true); }
    }) : '');
  // Indsæt billede fra udklipsholderen (Ctrl+V / "Sæt ind")
  const indsaetBillede = async e => {
    const filer = [...(e.clipboardData?.items || [])].filter(x => x.type.startsWith('image/')).map(x => x.getAsFile()).filter(Boolean);
    if (!filer.length) return;
    e.preventDefault();
    for (const f of filer) await tilfoejBillede(f);
    visStatus('Billede sat ind');
  };

  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(bekraeftKnap('Slet', 'slette noten', 'knap fare', async () => { await Data.remove(n._liste, n.id); lukArk(); tegnMappe(); }));
  knapper.append(knap('Gem', 'knap', async () => {
    const t = titel.value.trim();
    const blokke = s.blokke.filter(b => b.type !== 'tekst' || (b.tekst || '').trim())
      .map(b => b.type === 'tjek' ? { ...b, punkter: (b.punkter || []).filter(p => (p.tekst || '').trim()) } : b)
      .filter(b => b.type !== 'tjek' || b.punkter.length);
    if (!t && !blokke.length) { titel.focus(); visStatus('Skriv en titel eller lidt indhold', true); return; }
    const felter = { titel: t, mappe: s.mappe, hvem: s.hvem, blokke, tekst: null, billeder: null, skjult: skjult.value.trim() || null, fast: s.fast, rettet: new Date().toISOString() };
    const liste = NOTE_LISTER[s.syn];
    try {
      if (ny) await Data.add(liste, felter);
      else if (liste === n._liste) await Data.update(liste, n.id, felter);
      else { await Data.add(liste, felter); await Data.stille(() => Data.remove(n._liste, n.id)); }   // ny synlighed = flyt til den anden liste
    } catch { visStatus('Kunne ikke gemme noten', true); return; }
    mappeValgt = s.mappe; lokal.set('mappe', s.mappe);
    lukArk(); tegnMappe(); visStatus('Gemt i ' + s.mappe);
  }));
  const synBoks = chipValg(Object.keys(NOTE_SYN), s.syn, v => { s.syn = v; }, v => NOTE_SYN[v]);
  const fastKnap = knap('📌 Fastgør øverst', null, () => { s.fast = !s.fast; fastKnap.setAttribute('aria-checked', s.fast); });
  fastKnap.setAttribute('role', 'checkbox'); fastKnap.setAttribute('aria-checked', s.fast);
  const fastBoks = el('div', 'seg wrap'); fastBoks.append(fastKnap);
  aabnArk(ny ? 'Ny note' : 'Ret note', felt('Titel', titel), el('label', 'felt-label', 'Mappe'), mappeBoks, nyMappe,
    el('label', 'felt-label', 'Hvem drejer det sig om? (valgfrit)'), hvemBoks,
    el('label', 'felt-label', 'Indhold'), blokBoks, tilfoej, tabelMenu,
    el('p', 'hint', 'Tip: kopiér et billede eller et skærmklip og tryk "Sæt ind" i noten.'),
    felt('🔒 Skjult felt', skjult),
    el('p', 'hint', 'Til fx et kode-HINT ("Alfie + årstal") – gem aldrig rigtige koder her. Brug telefonens adgangskode-app til dem.'),
    el('label', 'felt-label', 'Hvem kan se den?'), synBoks, fastBoks, knapper);
  const arkInd = document.getElementById('ark-indhold');
  if (window._notePaste) arkInd.removeEventListener('paste', window._notePaste);
  window._notePaste = e => { if (blokBoks.isConnected) indsaetBillede(e); };
  arkInd.addEventListener('paste', window._notePaste);
  if (ny) setTimeout(() => titel.focus(), 50);
}

document.getElementById('ny-note')?.addEventListener('click', () => redigerNote());
Data.onChange(() => { if (typeof aktivFane !== 'undefined' && aktivFane === 'mappe') tegnMappe(); });
