// dagbog.js – 📓 Dagbog (kun voksne): små noteringer om familien med dato – fx mavepine, medicin, kost til lægen,
// eller "tabte en tand", "fik 10 i tysk". Kan filtreres og printes (fx til lægen).
// Data: 'dagbog' (de voksne ser den) og 'dagbog_privat' (kun den, der skrev den – databasens maa_se):
//   {hvem, dato 'ÅÅÅÅ-MM-DD', tid? 'HH:MM', kat, tekst, note?}
// Kun voksne kan se dagbogen (kun_voksne i opdatering-dagbog.sql). Intet vises på børnenes tavler.

const DB_LISTER = ['dagbog', 'dagbog_privat'];
const DB_KAT = [
  ['helbred', '🤒', 'Helbred'], ['medicin', '💊', 'Medicin'], ['kost', '🍽️', 'Kost'],
  ['skole', '🎒', 'Skole'], ['begivenhed', '⭐', 'Begivenhed'], ['andet', '📝', 'Andet']
];
const DB_KAT_NAVN = Object.fromEntries(DB_KAT.map(([k, i, n]) => [k, i + ' ' + n]));
const DB_IKON = Object.fromEntries(DB_KAT.map(([k, i]) => [k, i]));
// Hurtigknapper – suppleres af det, I selv har skrevet mest
const DB_HURTIG = {
  helbred: ['Hovedpine', 'Mavepine', 'Hård mave', 'Tynd mave', 'Kvalme', 'Feber', 'Hoste', 'Træt', 'Udslæt'],
  medicin: ['Smertestillende', 'Febernedsættende', 'Allergimedicin', 'Næsespray'],
  kost: ['Spiste dårligt', 'Spiste godt', 'Drak for lidt'],
  skole: ['Fik en god karakter', 'Prøve', 'Skole-hjem-samtale'],
  begivenhed: ['Tabte en tand', 'Første gang …'],
  andet: []
};
const dbPersoner = () => [...VOKSNE, ...BOERN, 'Alfie'];
let dbHvem = '', dbKat = '', dbPeriode = '90';

function dbAlle() {
  return DB_LISTER.flatMap(l => Data.listNu(l).map(x => ({ ...x, _liste: l })))
    .sort((a, b) => (b.dato || '').localeCompare(a.dato || '') || (b.tid || '').localeCompare(a.tid || '') || (b.oprettet || '').localeCompare(a.oprettet || ''));
}
function dbFiltreret() {
  const fra = dbPeriode === 'alt' ? '' : plusDage(isoDato(new Date()), -Number(dbPeriode));
  return dbAlle().filter(x => (!dbHvem || x.hvem === dbHvem) && (!dbKat || x.kat === dbKat) && (!fra || x.dato >= fra));
}
const dbPeriodeNavn = { '30': '30 dage', '90': '3 måneder', '365': '1 år', 'alt': 'Alt' };

function tegnDagbog() {
  const sek = document.getElementById('dagbog'), boks = document.getElementById('dagbog-indhold');
  if (!boks || sek.hidden || erBarn()) return;
  if (sek.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
  const dele = [];
  dele.push(chipValg(['', ...dbPersoner()], dbHvem, v => { dbHvem = v; tegnDagbog(); }, v => v || 'Alle'));
  dele.push(chipValg(['', ...DB_KAT.map(k => k[0])], dbKat, v => { dbKat = v; tegnDagbog(); }, v => v ? DB_KAT_NAVN[v] : 'Alt'));
  const per = chipValg(Object.keys(dbPeriodeNavn), dbPeriode, v => { dbPeriode = v; tegnDagbog(); }, v => dbPeriodeNavn[v]);
  per.classList.add('db-periode');
  dele.push(per);

  const liste = dbFiltreret();
  // Optælling (fx "Mavepine 6 · Hovedpine 2") – nyttigt til lægen
  if (liste.length) {
    const tael = new Map();
    for (const x of liste) { const k = (x.tekst || '').trim(); if (k) tael.set(k, (tael.get(k) || 0) + 1); }
    const top = [...tael].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const linje = el('p', 'db-taelling', liste.length + (liste.length === 1 ? ' notering' : ' noteringer') + (top.length ? ' · ' + top.map(([t, n]) => t + ' ' + n + '×').join(' · ') : ''));
    dele.push(linje);
  }
  const knapper = el('div', 'db-knapper');
  knapper.append(knap('+ Ny notering', 'knap', () => dbRediger({ hvem: dbHvem || '', kat: dbKat || 'helbred' })));
  if (liste.length) knapper.append(knap('🖨️ Print / PDF', 'lille-knap', () => dbPrint(liste)));
  dele.push(knapper);

  const ul = el('ul', 'db-liste');
  let sidsteDato = '';
  for (const x of liste.slice(0, 300)) {
    if (x.dato !== sidsteDato) { sidsteDato = x.dato; ul.append(el('li', 'db-dag', dbDagNavn(x.dato))); }
    const li = el('li', 'db-punkt');
    const b = knap('', 'db-knap', () => dbRediger(x));
    const top = el('span', 'db-top');
    top.append(el('span', 'db-ikon', DB_IKON[x.kat] || '📝'), el('span', 'db-tekst', x.tekst || ''));
    if (x._liste === 'dagbog_privat') top.append(el('span', 'db-privat', '🔒'));
    const under = el('span', 'db-under');
    under.append(el('span', 'hvem-tag ' + (PK[x.hvem] || ''), x.hvem || '?'));
    if (x.tid) under.append(el('span', null, x.tid));
    if (x.note) under.append(el('span', 'db-note', x.note));
    b.append(top, under);
    li.append(b);
    ul.append(li);
  }
  if (!liste.length) ul.append(el('li', 'tom', dbAlle().length ? 'Ingen noteringer med det filter' : 'Ingen noteringer endnu. Tryk "+ Ny notering".'));
  if (liste.length > 300) ul.append(el('li', 'hint', 'Viser de 300 nyeste – vælg en kortere periode eller en person.'));
  dele.push(ul);
  boks.replaceChildren(...dele);
}
function dbDagNavn(iso) {
  const idag = isoDato(new Date());
  if (iso === idag) return 'I dag';
  if (iso === plusDage(idag, -1)) return 'I går';
  const d = new Date(iso + 'T00:00');
  return DAGE_LANG[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
}

// Ny / ret notering
function dbRediger(x) {
  const ny = !x.id;
  const s = { hvem: x.hvem || '', dato: x.dato || isoDato(new Date()), tid: x.tid || '', kat: x.kat || 'helbred', tekst: x.tekst || '', note: x.note || '',
    privat: x._liste === 'dagbog_privat' };
  const tekst = input('text', 'db-tekst', s.tekst, 'Fx Mavepine');
  tekst.maxLength = 120;
  tekst.addEventListener('input', () => { s.tekst = tekst.value; });
  const note = el('textarea'); note.id = 'db-note'; note.rows = 2; note.maxLength = 500; note.value = s.note; note.placeholder = 'Fx "efter aftensmad", "gik over efter 1 time", dosis …';
  note.addEventListener('input', () => { s.note = note.value; });
  const dato = input('date', 'db-dato', s.dato); dato.max = isoDato(new Date());
  dato.addEventListener('change', () => { s.dato = dato.value || s.dato; });
  const tid = input('time', 'db-tid', s.tid);
  tid.addEventListener('change', () => { s.tid = tid.value; });
  const tidKnap = knap('Nu', 'lille-knap', () => { const n = new Date(); tid.value = s.tid = String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); dato.value = s.dato = isoDato(n); });
  const tidRaekke = el('div', 'db-tid-raekke'); tidRaekke.append(dato, tid, tidKnap);

  const hvemValg = chipValg(dbPersoner(), s.hvem, v => { s.hvem = v; fejl.hidden = true; });
  const hurtig = el('div', 'seg wrap db-hurtig');
  const tegnHurtig = () => {
    // Det I selv har skrevet mest i kategorien (og for personen) kommer først
    const brugt = new Map();
    for (const y of dbAlle().filter(y => y.kat === s.kat)) { const t = (y.tekst || '').trim(); if (t) brugt.set(t, (brugt.get(t) || 0) + (y.hvem === s.hvem ? 3 : 1)); }
    const egne = [...brugt].sort((a, b) => b[1] - a[1]).map(([t]) => t);
    const alle = [...new Set([...egne, ...(DB_HURTIG[s.kat] || [])])].slice(0, 12);
    hurtig.replaceChildren(...alle.map(t => knap(t, null, () => { tekst.value = s.tekst = t.replace(/ …$/, ' '); tekst.focus(); })));
  };
  const katValg = chipValg(DB_KAT.map(k => k[0]), s.kat, v => { s.kat = v; tegnHurtig(); }, v => DB_KAT_NAVN[v]);
  tegnHurtig();
  const synlig = chipValg(['faelles', 'privat'], s.privat ? 'privat' : 'faelles', v => { s.privat = v === 'privat'; }, v => (v === 'privat' ? '🔒 Kun mig' : '👥 Begge voksne'));
  const fejl = el('p', 'fejl', 'Vælg hvem det handler om'); fejl.hidden = true;

  const gem = knap('Gem', 'knap', async () => {
    if (!s.hvem) { fejl.hidden = false; return; }
    if (!s.tekst.trim()) { tekst.focus(); return; }
    const felter = { hvem: s.hvem, dato: s.dato, kat: s.kat, tekst: s.tekst.trim(), ...(s.tid ? { tid: s.tid } : {}), ...(s.note.trim() ? { note: s.note.trim() } : {}) };
    const liste = s.privat ? 'dagbog_privat' : 'dagbog';
    if (ny) await Data.add(liste, felter);
    else if (liste === x._liste) await Data.update(liste, x.id, { tid: null, note: null, ...felter });
    else { await Data.add(liste, felter); await Data.stille(() => Data.remove(x._liste, x.id)); }   // skiftet synlighed = flyt til den anden liste
    lukArk(); tegnDagbog();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(bekraeftKnap('Slet', 'slette noteringen', 'knap fare', async () => { await Data.remove(x._liste, x.id); lukArk(); tegnDagbog(); }));
  knapper.append(gem);
  aabnArk(ny ? '📓 Ny notering' : '📓 Ret notering',
    felt('Hvem?', hvemValg), fejl, el('label', 'felt-label', 'Hvad slags?'), katValg, hurtig, felt('Hvad?', tekst),
    el('label', 'felt-label', 'Hvornår?'), tidRaekke, felt('Note (valgfri)', note), el('label', 'felt-label', 'Hvem kan se den?'), synlig, knapper);
}

// 🖨️ Print / PDF: en pæn liste i et nyt vindue (Gem som PDF i printvinduet)
function dbPrint(liste) {
  const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const titel = 'Dagbog' + (dbHvem ? ' – ' + dbHvem : '') + (dbKat ? ' – ' + DB_KAT_NAVN[dbKat].replace(/^\S+\s/, '') : '');
  const fra = liste[liste.length - 1]?.dato, til = liste[0]?.dato;
  const rk = [...liste].reverse().map(x => '<tr><td>' + esc(kortDato(x.dato)) + (x.dato ? ' ' + new Date(x.dato + 'T00:00').getFullYear() : '') + (x.tid ? ' ' + esc(x.tid) : '') + '</td>'
    + (dbHvem ? '' : '<td>' + esc(x.hvem) + '</td>') + '<td>' + esc((DB_KAT_NAVN[x.kat] || '').replace(/^\S+\s/, '')) + '</td><td><b>' + esc(x.tekst) + '</b>' + (x.note ? '<br><span>' + esc(x.note) + '</span>' : '') + '</td></tr>').join('');
  const tael = new Map();
  for (const x of liste) { const k = (x.tekst || '').trim(); if (k) tael.set(k, (tael.get(k) || 0) + 1); }
  const sum = [...tael].sort((a, b) => b[1] - a[1]).map(([t, n]) => esc(t) + ': ' + n).join(' · ');
  const html = '<!doctype html><html lang="da"><head><meta charset="utf-8"><title>' + esc(titel) + '</title><style>'
    + 'body{font:11pt/1.4 system-ui,sans-serif;margin:16mm;color:#111}h1{font-size:16pt;margin:0 0 2mm}p{margin:0 0 4mm;color:#444}'
    + 'table{width:100%;border-collapse:collapse}th,td{text-align:left;vertical-align:top;padding:1.6mm 2mm;border-bottom:1px solid #ddd}th{background:#eef3f1;font-size:9.5pt}'
    + 'td:first-child{white-space:nowrap}td span{color:#555;font-size:9.5pt}@page{size:A4;margin:12mm}</style></head><body>'
    + '<h1>' + esc(titel) + '</h1><p>' + esc(fra ? kortDato(fra) + ' ' + fra.slice(0, 4) + ' – ' + kortDato(til) + ' ' + til.slice(0, 4) : '') + ' · ' + liste.length + ' noteringer' + (sum ? '<br>' + sum : '') + '</p>'
    + '<table><tr><th>Dato</th>' + (dbHvem ? '' : '<th>Hvem</th>') + '<th>Slags</th><th>Notering</th></tr>' + rk + '</table>'
    + '<script>setTimeout(()=>print(),300)<\/script></body></html>';
  const w = window.open('', '_blank');
  if (!w) { visStatus('Tillad pop-up-vinduer for at printe', true); return; }
  w.document.open(); w.document.write(html); w.document.close();
}
