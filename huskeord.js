// huskeord.js – 💭 Mine huskeord (kun for den voksne, der skriver dem – Timmo 12/11).
// Korte, vigtige ting man vil mindes om igen og igen ("Tag initiativ til tid for jer to").
// Data: ligger i 'noter_privat' (databasen viser kun rækkerne til den, der skrev dem – maa_se – og logger dem ikke)
//   {huskeord: true, tekst, til?: 'ÅÅÅÅ-MM-DD' (sidste dag – fx "følg op i denne uge"), titel, mappe: 'Huskeord'}
// Familiemappen viser dem ikke (mappe.js alleNoter springer huskeord over).
// Dagens huskeord: de aktive sorteret efter oprettet, nr. (dagnummer % antal) – samme regel som Edge Function "push",
// så kortet på Familien og push-beskeden viser det samme. Push: personvalg.huskeordKl ('HH:MM' eller '') + huskeordHvor
// ('dag' | 'hverdage' | '2dage' | 'uge' = mandag). Kortet kan skjules på den enkelte enhed (fx en fælles tablet på væggen).
const HUSK_LISTE = 'noter_privat';
const HUSK_KL = ['', '07:00', '08:00', '12:00', '17:00', '20:00'];
const HUSK_HVOR = { dag: 'Hver dag', hverdage: 'Hverdage', '2dage': 'Hver 2. dag', uge: 'Mandag' };
const huskIdag = () => isoDato(new Date());
const huskDagNr = iso => Math.floor(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
const huskSort = (a, b) => String(a.oprettet || '9').localeCompare(String(b.oprettet || '9')) || String(a.id).localeCompare(String(b.id));
const huskAlle = () => Data.listNu(HUSK_LISTE).filter(n => n.huskeord).sort(huskSort);
const huskAktive = (iso = huskIdag()) => huskAlle().filter(n => !n.til || n.til >= iso);
const huskSkjultHer = () => lokal.get('huskeord-skjul') === '1';
function huskDagens(iso = huskIdag()) {
  const a = huskAktive(iso);
  return a.length ? { n: a[huskDagNr(iso) % a.length], nr: huskDagNr(iso) % a.length + 1, af: a.length } : null;
}

// Kortet på Familien (kun voksne, kun når der er huskeord, og ikke skjult på denne enhed)
function huskeordKort() {
  if (!Data.bruger() || erBarn() || huskSkjultHer()) return null;
  const d = huskDagens();
  if (!d) return null;
  const k = el('div', 'kort husk-kort');
  k.style.borderLeftColor = 'var(--c-' + String(Data.bruger().navn).toLowerCase() + ', var(--p))';   // personens farve
  k.setAttribute('role', 'button'); k.tabIndex = 0;
  k.setAttribute('aria-label', 'Mine huskeord – tryk for at se alle');
  const top = el('div', 'husk-top');
  top.append(el('span', 'husk-titel', '💭 Dagens huskeord'), el('span', 'husk-nr', d.af > 1 ? d.nr + '/' + d.af : ''));
  k.append(top, el('p', 'husk-tekst', d.n.tekst));
  if (d.n.til) k.append(el('p', 'hint', 'Til og med ' + kortDag(d.n.til)));
  k.addEventListener('click', () => huskeordArk());
  k.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); huskeordArk(); } });
  return k;
}

// Arket: alle huskeord + nyt + push-valg
async function huskeordArk() {
  const mig = Data.bruger();
  if (!mig || erBarn()) return;
  const valg = await valgFor(mig.navn);
  const liste = el('ul', 'husk-liste');
  const tegnListe = () => {
    const idag = huskIdag(), dagens = huskDagens()?.n;
    const alle = huskAlle();
    liste.replaceChildren(...(alle.length ? alle.map(n => {
      const li = el('li', 'husk-li' + (n.til && n.til < idag ? ' udloebet' : '') + (n === dagens || n.id === dagens?.id ? ' i-dag' : ''));
      const b = knap('', 'husk-punkt', () => redigerHuskeord(n));
      b.append(el('span', 'husk-punkt-tekst', n.tekst));
      if (n.til) b.append(el('span', 'hint', n.til < idag ? 'Udløbet ' + kortDag(n.til) : 'Til og med ' + kortDag(n.til)));
      li.append(b);
      return li;
    }) : [el('li', 'hint', 'Ingen huskeord endnu. Skriv det første herunder.')]));
  };
  tegnListe();

  // Nyt huskeord
  const tekst = el('textarea', 'k-tekst'); tekst.id = 'husk-ny'; tekst.rows = 2; tekst.placeholder = 'Fx Tag initiativ til tid for jer to';
  const til = input('date', 'husk-til', '');
  const tilfoej = knap('Tilføj', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    await Data.add(HUSK_LISTE, { huskeord: true, tekst: t, titel: t.slice(0, 40), mappe: 'Huskeord', ...(til.value ? { til: til.value } : {}) });
    tekst.value = ''; til.value = '';
    tegnListe(); opdaterHuskKort();
    visStatus('✓ Huskeord gemt – kun du kan se det');
  });

  // Push
  let kl = HUSK_KL.includes(valg.huskeordKl) ? valg.huskeordKl || '' : '';
  let hvor = HUSK_HVOR[valg.huskeordHvor] ? valg.huskeordHvor : 'dag';
  const hvorBoks = el('div');
  const tegnHvor = () => { hvorBoks.hidden = !kl; };
  const klValg = chipValg(HUSK_KL, kl, async v => { kl = v; tegnHvor(); await saetValg(mig.navn, 'huskeordKl', v); }, v => v ? visTid(v).replace(/^0/, '') : 'Fra');
  hvorBoks.append(chipValg(Object.keys(HUSK_HVOR), hvor, async v => { hvor = v; await saetValg(mig.navn, 'huskeordHvor', v); }, v => HUSK_HVOR[v]));
  tegnHvor();

  // Vis kortet på denne enhed?
  const visLabel = el('label', 'check');
  const vis = el('input'); vis.type = 'checkbox'; vis.id = 'husk-vis'; vis.checked = !huskSkjultHer();
  vis.addEventListener('change', () => { lokal.set('huskeord-skjul', vis.checked ? '' : '1'); opdaterHuskKort(); });
  visLabel.append(vis, 'Vis dagens huskeord på Familien på denne enhed');

  aabnArk('💭 Mine huskeord',
    el('p', 'hint', 'Kun du kan se dem. Hver dag står ét af dem på Familien – på skift, så du ser dem alle igen og igen.'),
    liste,
    felt('Nyt huskeord', tekst), felt('Til og med (valgfri – fx "følg op i denne uge")', til), tilfoej,
    felt('🔔 Send dagens huskeord som besked', klValg), hvorBoks,
    visLabel,
    el('p', 'hint', 'Slå fra på en fælles skærm (fx tavlen på væggen), så andre ikke ser dem.'));
}

function redigerHuskeord(n) {
  const tekst = el('textarea', 'k-tekst'); tekst.id = 'husk-tekst'; tekst.rows = 3; tekst.value = n.tekst || '';
  const til = input('date', 'husk-ret-til', n.til || '');
  const knapper = el('div', 'ark-knapper');
  const slet = knap('Slet', 'knap fare', e => bekraeft(e.currentTarget, async () => {
    await Data.remove(HUSK_LISTE, n.id);
    opdaterHuskKort(); huskeordArk();
  }));
  slet.dataset.tekst = 'Slet'; slet.dataset.handling = 'slette';
  knapper.append(slet, knap('Gem', 'knap', async () => {
    const t = tekst.value.trim();
    if (!t) { tekst.focus(); return; }
    await Data.update(HUSK_LISTE, n.id, { tekst: t, titel: t.slice(0, 40), til: til.value || null });
    opdaterHuskKort(); huskeordArk();
  }));
  aabnArk('Ret huskeord', felt('Huskeord', tekst), felt('Til og med (valgfri)', til), knapper,
    knap('‹ Tilbage', 'link-knap', () => huskeordArk()));
}

// Opdater kortet på Familien (uden at tegne hele siden)
function opdaterHuskKort() {
  const boks = document.getElementById('ov-huskeord');
  if (!boks) return;
  const k = huskeordKort();
  boks.replaceChildren(...(k ? [k] : [])); boks.hidden = !k;
}

document.getElementById('mere-huskeord')?.addEventListener('click', () => huskeordArk());
