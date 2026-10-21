// medicin.js – 💊 Medicin og kosttilskud (kun voksne): hvem tager hvad, hvor meget og hvornår.
// Ingen daglige flueben (Timmos valg 21/10) – det er en oversigt. Historikken er perioderne: hvornår noget blev startet,
// ændret og stoppet, så man kan printe "hvad har Oliver fået det sidste år" til lægen.
// Data: 'medicin' {hvem, navn, slags 'medicin'|'tilskud', dosis?, tider: ['morgen'|'middag'|'aften'|'sengetid'], tidKl? 'HH:MM',
//   hyppighed 'dagligt'|'ugedage'|'behov', ugedage? [0-6], fra 'ÅÅÅÅ-MM-DD', til? 'ÅÅÅÅ-MM-DD' (sidste dag – sat = stoppet/kur),
//   grund?, note?, forrige? id (rækken før en ændring af dosis/tider)}
// Kun voksne kan se og rette (kun_voksne i opdatering-medicin.sql). AI'en må ikke læse listen.

const MED_TIDER = [['morgen', '🌅', 'Morgen'], ['middag', '☀️', 'Middag'], ['aften', '🌙', 'Aften'], ['sengetid', '🛏️', 'Sengetid']];
const MED_TID_NAVN = Object.fromEntries(MED_TIDER.map(([k, i, n]) => [k, i + ' ' + n]));
const MED_SLAGS = { medicin: ['💊', 'Medicin'], tilskud: ['🌿', 'Kosttilskud'] };
const MED_HURTIG = {
  tilskud: ['D-vitamin', 'Multivitamin', 'Omega-3', 'Magnesium', 'Jern', 'B12-vitamin', 'C-vitamin', 'Calcium', 'Zink', 'Probiotika'],
  medicin: ['Allergitablet', 'Næsespray', 'Øjendråber', 'Astmaspray', 'Smertestillende', 'Creme']
};
const medPersoner = () => [...VOKSNE, ...BOERN, 'Alfie'];
let medHvem = '', medVis = 'nu';

const medIdag = () => isoDato(new Date());
const medAktiv = (x, iso = medIdag()) => (!x.fra || x.fra <= iso) && (!x.til || x.til >= iso);
const medKommende = x => x.fra && x.fra > medIdag();
function medAlle() { return Data.listNu('medicin').slice(); }
const medDato = iso => { if (!iso) return ''; const d = new Date(iso + 'T00:00'); return d.getDate() + '. ' + MDR_LANG[d.getMonth()].slice(0, 3) + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''); };
function medHvornaar(x) {
  const t = (x.tider || []).map(k => MED_TID_NAVN[k]).filter(Boolean);
  if (x.tidKl) t.push('kl. ' + visTid(x.tidKl));
  const h = x.hyppighed === 'behov' ? 'Efter behov' : x.hyppighed === 'ugedage' && (x.ugedage || []).length ? (x.ugedage || []).slice().sort().map(i => DAGE[i]).join(', ') : '';
  return [t.join(' · '), h].filter(Boolean).join(' · ') || (x.hyppighed === 'behov' ? 'Efter behov' : 'Hver dag');
}
const medForste = x => { const i = MED_TIDER.findIndex(([k]) => (x.tider || []).includes(k)); return i < 0 ? (x.hyppighed === 'behov' ? 9 : 5) : i; };

function tegnMedicin() {
  const sek = document.getElementById('medicin'), boks = document.getElementById('medicin-indhold');
  if (!boks || sek.hidden || erBarn()) return;
  const dele = [];
  dele.push(chipValg(['', ...medPersoner()], medHvem, v => { medHvem = v; tegnMedicin(); }, v => v || 'Alle'));
  dele.push(chipValg(['nu', 'historik'], medVis, v => { medVis = v; tegnMedicin(); }, v => (v === 'nu' ? '💊 Tager nu' : '📜 Historik')));
  const knapper = el('div', 'db-knapper');
  knapper.append(knap('+ Tilføj', 'knap', () => medRediger({ hvem: medHvem })));
  const alle = medAlle().filter(x => !medHvem || x.hvem === medHvem);
  if (medVis === 'historik' && alle.length) knapper.append(knap('🖨️ Print / PDF', 'lille-knap', () => medPrint(alle)));
  dele.push(knapper);
  dele.push(medVis === 'nu' ? medNu(alle) : medHistorik(alle));
  boks.replaceChildren(...dele);
}

// "Tager nu": pr. person, sorteret efter tidspunkt på dagen. Kommende (startdato frem i tiden) står nederst for sig.
function medNu(alle) {
  const boks = el('div', 'med-nu');
  const aktive = alle.filter(x => medAktiv(x)), kommende = alle.filter(medKommende);
  const personer = medPersoner().filter(p => aktive.some(x => x.hvem === p) || kommende.some(x => x.hvem === p));
  if (!personer.length) {
    boks.append(el('p', 'tom', alle.length ? 'Ingen tager noget lige nu. Se 📜 Historik for det, der er stoppet.' : 'Intet lagt ind endnu. Tryk "+ Tilføj".'));
    return boks;
  }
  for (const p of personer) {
    const k = el('div', 'kort med-person');
    const top = el('div', 'kort-top');
    top.append(el('span', 'kort-label', p), knap('+', 'lille-knap med-plus', () => medRediger({ hvem: p })));
    top.lastChild.setAttribute('aria-label', 'Tilføj til ' + p);
    k.append(top);
    const ul = el('ul', 'med-liste');
    for (const x of aktive.filter(x => x.hvem === p).sort((a, b) => medForste(a) - medForste(b) || a.navn.localeCompare(b.navn, 'da'))) ul.append(medLi(x));
    for (const x of kommende.filter(x => x.hvem === p)) ul.append(medLi(x, 'Starter ' + medDato(x.fra)));
    k.append(ul);
    boks.append(k);
  }
  return boks;
}
function medLi(x, ekstra = '') {
  const li = el('li');
  const b = knap('', 'med-knap', () => medRediger(x));
  const [ikon] = MED_SLAGS[x.slags] || MED_SLAGS.tilskud;
  const top = el('span', 'med-top');
  top.append(el('span', 'med-ikon', ikon), el('span', 'med-navn', x.navn + (x.dosis ? ' · ' + x.dosis : '')));
  const under = el('span', 'med-under');
  under.append(el('span', 'med-tid', medHvornaar(x)));
  const per = ekstra || (x.til ? 'til og med ' + medDato(x.til) : x.fra ? 'siden ' + medDato(x.fra) : '');
  if (per) under.append(el('span', null, per));
  if (x.grund) under.append(el('span', 'med-note', x.grund));
  if (x.note) under.append(el('span', 'med-note', x.note));
  b.append(top, under);
  li.append(b);
  return li;
}

// Historik: alle perioder (også stoppede) – nyeste start øverst
function medHistorik(alle) {
  const ul = el('ul', 'db-liste med-historik');
  const sorteret = alle.slice().sort((a, b) => (b.fra || '').localeCompare(a.fra || '') || a.navn.localeCompare(b.navn, 'da'));
  if (!sorteret.length) { ul.append(el('li', 'tom', 'Intet lagt ind endnu.')); return ul; }
  for (const x of sorteret) {
    const li = el('li', 'db-punkt');
    const b = knap('', 'db-knap', () => medRediger(x));
    const top = el('span', 'db-top');
    top.append(el('span', 'db-ikon', (MED_SLAGS[x.slags] || MED_SLAGS.tilskud)[0]), el('span', 'db-tekst', x.navn + (x.dosis ? ' · ' + x.dosis : '')));
    if (medAktiv(x)) top.append(el('span', 'med-aktiv', 'Nu'));
    const under = el('span', 'db-under');
    under.append(el('span', 'hvem-tag ' + (PK[x.hvem] || ''), x.hvem || '?'),
      el('span', null, (x.fra ? medDato(x.fra) : '?') + ' – ' + (x.til ? medDato(x.til) : 'nu')),
      el('span', null, medHvornaar(x)));
    if (x.grund || x.note) under.append(el('span', 'db-note', [x.grund, x.note].filter(Boolean).join(' · ')));
    b.append(top, under);
    li.append(b);
    ul.append(li);
  }
  return ul;
}

// Ny / ret. Ændres dosis, tidspunkter eller hvor tit på noget, der er startet før i dag, gemmes det som en ny periode
// fra i dag (den gamle slutter i går) – så historikken viser, hvornår dosis blev ændret.
function medRediger(x) {
  const ny = !x.id;
  const s = { hvem: x.hvem || '', navn: x.navn || '', slags: x.slags || 'tilskud', dosis: x.dosis || '', tider: [...(x.tider || [])], tidKl: x.tidKl || '',
    hyppighed: x.hyppighed || 'dagligt', ugedage: [...(x.ugedage || [])], fra: x.fra || medIdag(), til: x.til || '', grund: x.grund || '', note: x.note || '' };
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const hvemValg = chipValg(medPersoner(), s.hvem, v => { s.hvem = v; fejl.hidden = true; });
  const navn = input('text', 'med-navn', s.navn, 'Fx D-vitamin');
  navn.maxLength = 80;
  navn.addEventListener('input', () => { s.navn = navn.value; });
  const hurtig = el('div', 'seg wrap db-hurtig');
  const tegnHurtig = () => {
    const egne = [...new Set(medAlle().filter(y => y.slags === s.slags).map(y => y.navn))];
    const alle = [...new Set([...egne, ...(MED_HURTIG[s.slags] || [])])].slice(0, 12);
    hurtig.replaceChildren(...alle.map(t => knap(t, null, () => { navn.value = s.navn = t; })));
  };
  const slagsValg = chipValg(Object.keys(MED_SLAGS), s.slags, v => { s.slags = v; tegnHurtig(); }, v => MED_SLAGS[v].join(' '));
  tegnHurtig();
  const dosis = input('text', 'med-dosis', s.dosis, 'Fx 1 tablet, 10 µg, 2 pust');
  dosis.maxLength = 60;
  dosis.addEventListener('input', () => { s.dosis = dosis.value; });

  // Hvornår på dagen (flere kan vælges) + evt. klokkeslæt
  const tiderBoks = el('div', 'seg wrap');
  const tegnTider = () => tiderBoks.replaceChildren(...MED_TIDER.map(([k, i, n]) => {
    const b = knap(i + ' ' + n, null, () => { s.tider = s.tider.includes(k) ? s.tider.filter(t => t !== k) : [...s.tider, k]; tegnTider(); });
    b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', s.tider.includes(k));
    return b;
  }));
  tegnTider();
  const kl = input('time', 'med-kl', s.tidKl);
  kl.addEventListener('change', () => { s.tidKl = kl.value; });
  const klRaekke = el('div', 'db-tid-raekke'); klRaekke.append(el('span', 'hint', 'Bestemt klokkeslæt (valgfrit):'), kl);

  // Hvor tit
  const ugeBoks = el('div', 'seg wrap');
  const tegnUge = () => {
    ugeBoks.hidden = s.hyppighed !== 'ugedage';
    ugeBoks.replaceChildren(...DAGE.map((d, i) => {
      const b = knap(d, null, () => { s.ugedage = s.ugedage.includes(i) ? s.ugedage.filter(t => t !== i) : [...s.ugedage, i]; tegnUge(); });
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', s.ugedage.includes(i));
      return b;
    }));
  };
  const hypValg = chipValg(['dagligt', 'ugedage', 'behov'], s.hyppighed, v => { s.hyppighed = v; tegnUge(); }, v => ({ dagligt: 'Hver dag', ugedage: 'Bestemte dage', behov: 'Efter behov' })[v]);
  tegnUge();

  const fra = input('date', 'med-fra', s.fra);
  fra.addEventListener('change', () => { s.fra = fra.value || s.fra; });
  const til = input('date', 'med-til', s.til);
  til.addEventListener('change', () => { s.til = til.value; });
  const periode = el('div', 'to-felter'); periode.append(felt('Startet', fra), felt('Til og med (kur – valgfri)', til));
  const grund = input('text', 'med-grund', s.grund, 'Fx allergi, ordineret af lægen');
  grund.maxLength = 120;
  grund.addEventListener('input', () => { s.grund = grund.value; });
  const note = el('textarea'); note.id = 'med-note'; note.rows = 2; note.maxLength = 400; note.value = s.note; note.placeholder = 'Fx "tages med mad", "pause i sommerferien"';
  note.addEventListener('input', () => { s.note = note.value; });

  const felter = () => ({
    hvem: s.hvem, navn: s.navn.trim(), slags: s.slags, dosis: s.dosis.trim() || null, tider: s.tider, tidKl: s.tidKl || null,
    hyppighed: s.hyppighed, ugedage: s.hyppighed === 'ugedage' ? s.ugedage : [], fra: s.fra, til: s.til || null, grund: s.grund.trim() || null, note: s.note.trim() || null
  });
  const gem = knap('Gem', 'knap', async () => {
    if (!s.hvem) { fejl.textContent = 'Vælg hvem'; fejl.hidden = false; return; }
    if (!s.navn.trim()) { navn.focus(); return; }
    if (s.hyppighed === 'ugedage' && !s.ugedage.length) { fejl.textContent = 'Vælg mindst én ugedag'; fejl.hidden = false; return; }
    if (s.til && s.til < s.fra) { fejl.textContent = '"Til og med" er før startdatoen'; fejl.hidden = false; return; }
    const f = felter(), idag = medIdag();
    if (ny) { await Data.add('medicin', f); visStatus('💊 ' + f.navn + ' er tilføjet til ' + f.hvem); }
    else {
      const sammen = a => JSON.stringify([a.dosis || null, [...(a.tider || [])].sort(), a.tidKl || null, a.hyppighed || 'dagligt', [...(a.ugedage || [])].sort()]);
      const nyPeriode = sammen(x) !== sammen(f) && x.fra && x.fra < idag && medAktiv(x) && f.fra === x.fra;
      if (nyPeriode) {
        // Ny dosis/nye tider fra i dag – den gamle periode slutter i går og bliver i historikken
        await Data.update('medicin', x.id, { til: plusDage(idag, -1) });
        await Data.add('medicin', { ...f, fra: idag, forrige: x.id });
        visStatus('✓ Gemt fra i dag – det gamle står i 📜 Historik');
      } else { await Data.update('medicin', x.id, f); visStatus('✓ Gemt'); }
    }
    lukArk(); tegnMedicin();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) {
    knapper.append(bekraeftKnap('Slet', 'slette den helt', 'knap fare', async () => { await Data.remove('medicin', x.id); lukArk(); tegnMedicin(); }));
    if (medAktiv(x) && !x.til) knapper.append(knap('⏹ Stoppet', 'knap sekundaer-knap', async () => {
      await Data.update('medicin', x.id, { til: medIdag() }); visStatus(x.navn + ' er stoppet – står i 📜 Historik'); lukArk(); tegnMedicin();
    }));
  }
  knapper.append(gem);
  aabnArk(ny ? '💊 Tilføj medicin eller kosttilskud' : '💊 ' + x.navn,
    felt('Hvem?', hvemValg), el('label', 'felt-label', 'Hvad slags?'), slagsValg, felt('Hvad?', navn), hurtig, felt('Dosis', dosis),
    el('label', 'felt-label', 'Hvornår på dagen?'), tiderBoks, klRaekke, el('label', 'felt-label', 'Hvor tit?'), hypValg, ugeBoks,
    periode, felt('Hvorfor (valgfri)', grund), felt('Note (valgfri)', note),
    el('p', 'hint', ny ? 'Kun I voksne kan se det her.' : 'Ændrer du dosis eller tidspunkter, gemmes det fra i dag, og det gamle bliver stående i historikken. "Slet" fjerner det helt – brug "Stoppet", hvis det skal kunne ses i historikken.'),
    fejl, knapper);
}

// 🖨️ Print / PDF – til lægen
function medPrint(alle) {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const titel = 'Medicin og kosttilskud' + (medHvem ? ' – ' + medHvem : '');
  const fuld = iso => iso ? new Date(iso + 'T00:00').toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const sorteret = alle.slice().sort((a, b) => (a.hvem || '').localeCompare(b.hvem || '', 'da') || (b.fra || '').localeCompare(a.fra || ''));
  const rk = sorteret.map(x => '<tr>' + (medHvem ? '' : '<td>' + esc(x.hvem) + '</td>') + '<td><b>' + esc(x.navn) + '</b><br><span>' + esc((MED_SLAGS[x.slags] || MED_SLAGS.tilskud)[1]) + '</span></td>'
    + '<td>' + esc(x.dosis || '') + '</td><td>' + esc(medHvornaar(x).replace(/[🌅☀️🌙🛏️]️?\s?/gu, '')) + '</td><td>' + esc(fuld(x.fra)) + ' – ' + esc(x.til ? fuld(x.til) : 'nu') + '</td>'
    + '<td>' + esc([x.grund, x.note].filter(Boolean).join(' · ')) + '</td></tr>').join('');
  const html = '<!doctype html><html lang="da"><head><meta charset="utf-8"><title>' + esc(titel) + '</title><style>'
    + 'body{font:11pt/1.4 system-ui,sans-serif;margin:16mm;color:#111}h1{font-size:16pt;margin:0 0 2mm}p{margin:0 0 4mm;color:#444}'
    + 'table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:1.6mm 2mm;border-bottom:1px solid #ddd}th{background:#eef3f1;font-size:9.5pt}'
    + 'td span{color:#555;font-size:9pt}@page{size:A4;margin:12mm}</style></head><body>'
    + '<h1>' + esc(titel) + '</h1><p>Udskrevet ' + esc(fuld(medIdag())) + ' · ' + sorteret.length + (sorteret.length === 1 ? ' periode' : ' perioder') + '</p>'
    + '<table><tr>' + (medHvem ? '' : '<th>Hvem</th>') + '<th>Hvad</th><th>Dosis</th><th>Hvornår</th><th>Periode</th><th>Note</th></tr>' + rk + '</table>'
    + '<script>setTimeout(()=>print(),300)<\/script></body></html>';
  const w = window.open('', '_blank');
  if (!w) { visStatus('Tillad pop-up-vinduer for at printe', true); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
