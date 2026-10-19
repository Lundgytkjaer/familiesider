// ---------- 🏫 Særlig skoledag og noter til fag ----------
// En ændring i skolen gemmes som en kalenderaftale i 'kalender' (alle kan se den, kun voksne retter):
//   {dato, hvem: barn | [børn], titel, type: 'skoledag', fri: false, tid: '', slut: '',
//    program?: [{tid: '09.00-10.00', tekst}],   – programmet for dagen (fx brætspilsdag). Fælles for alle børn i aftalen
//    moede?: 'HH:MM', friKl?: 'HH:MM',           – ændrede tider ("alle møder 9", "alle har fri 12")
//    noter?: [{fag, tekst}],                     – note til et fag den dag (fx "Idræt: løb ude, husk løbesko")
//    note?}
// Hvert barn beholder sine egne tider: programmet vises kun inden for barnets mødetid–fri-tid,
// og resten af dagen fyldes ud med barnets normale fag (`fletSkoledag`).

const SKOLEDAG = 'skoledag';
const tilKl = m => String(Math.floor(m / 60)).padStart(2, '0') + '.' + String(m % 60).padStart(2, '0');
const tidSpan = (fra, til) => tilKl(fra) + '-' + tilKl(til);
// "9-10", "9.00 - 10.00", "09:00–10:00" → "09.00-10.00" (eller null hvis den ikke kan forstås)
function rensTid(tekst) {
  const [fra, til] = tidSomMin(tekst);
  if (fra == null || til == null || fra >= til || til > 24 * 60) return null;
  return tidSpan(fra, til);
}
// Barnets ændring(er) i skolen på en dato. Er der flere (fx en temadag for begge + en note til Villads' idræt),
// lægges de sammen til én visning; `_rediger` er den, der åbnes, når man trykker på mærket.
function skoledagDen(aftaler, iso, barn) {
  const alle = aftalerDen(aftaler, iso, [barn]).filter(a => a.type === SKOLEDAG);
  if (alle.length < 2) return alle[0] || null;
  const hoved = alle.find(skoledagMaerke) || alle[0];
  const tider = (felt, f) => alle.map(a => a[felt]).filter(Boolean).sort()[f === 'max' ? 'pop' : 'shift']() || '';
  return { ...hoved, _rediger: hoved, _alle: alle,
    program: alle.flatMap(a => a.program || []), noter: alle.flatMap(a => a.noter || []),
    moede: tider('moede', 'max'), friKl: [...alle.map(a => a.friKl).filter(Boolean)].sort()[0] || '',
    note: [...new Set(alle.map(a => a.note).filter(Boolean))].join(' · ') };
}

// Flet barnets normale dag (alle = dagensTimer) med en særlig skoledag (s).
// Returnerer samme form som skoleTider + timer (rækker med fag) og noter, der ikke passede til et fag.
function fletSkoledag(alle, s) {
  const grund = skoleTider(alle);
  const normale = alle.filter(t => t.fag);
  if (!s) return { ...grund, timer: normale, saerlig: null, noter: [] };
  let a = tidSomMin(grund.start)[0], b = tidSomMin(grund.slut)[0];
  // Ændrede tider gælder kun, hvis de gør dagen kortere for netop dette barn
  const moede = tidSomMin(visTid(s.moede))[0], fri = tidSomMin(visTid(s.friKl))[0];
  if (moede != null && (a == null || moede > a)) a = moede;
  if (fri != null && (b == null || fri < b)) b = fri;
  const lo = a ?? 0, hi = b ?? 24 * 60;

  const program = (s.program || []).map(p => {
    const [f, e] = tidSomMin(p.tid);
    return f == null || e == null ? null : { f: Math.max(f, lo), e: Math.min(e, hi), tekst: p.tekst || '' };
  }).filter(p => p && p.e > p.f);

  const raekker = [];
  for (const t of normale) {
    const [f, e] = tidSomMin(t.tid);
    if (f == null || e == null) { if (!program.length) raekker.push({ ...t, _f: f ?? 0 }); continue; }   // uden tider: kan ikke placeres
    // Skær de stykker af timen væk, som programmet eller de ændrede tider tager
    let stykker = [[Math.max(f, lo), Math.min(e, hi)]];
    for (const p of program) stykker = stykker.flatMap(([x, y]) => (p.e <= x || p.f >= y ? [[x, y]] : [[x, p.f], [p.e, y]]));
    for (const [x, y] of stykker) if (y - x >= 10) raekker.push({ ...t, tid: x === f && y === e ? t.tid : tidSpan(x, y), _f: x });
  }
  for (const p of program) raekker.push({ nr: 0, tid: tidSpan(p.f, p.e), fag: p.tekst, farve: '', saerlig: true, _f: p.f });
  // Skolen har kun givet mødetid og hjemtid: hullerne mellem programpunkterne er almindelig skole
  if (program.length && !grund.harTimer && normale.length && a != null && b != null) {
    let x = a;
    for (const p of [...program].sort((p, q) => p.f - q.f)) { if (p.f - x >= 10) raekker.push({ nr: 0, tid: tidSpan(x, p.f), fag: 'Almindelig skole', farve: '', _f: x }); x = Math.max(x, p.e); }
    if (b - x >= 10) raekker.push({ nr: 0, tid: tidSpan(x, b), fag: 'Almindelig skole', farve: '', _f: x });
  }
  raekker.sort((p, q) => p._f - q._f);

  // Noter til fag: hænger på hver time med det fag ("idræt" passer også til "Idræt og bevægelse").
  // Har barnet ikke faget den dag, vises noten ikke for det barn. En note uden fag vises altid.
  const resten = [];
  const passer = (fag, navn) => { const f = (fag || '').trim().toLowerCase(); return !!f && (f === navn || f.includes(navn) || navn.includes(f)); };
  for (const n of (s.noter || []).filter(n => n.tekst)) {
    const navn = (n.fag || '').trim().toLowerCase();
    if (!navn) { resten.push(n); continue; }
    const ramt = raekker.filter(r => !r.saerlig && passer(r.fag, navn));
    // Dobbelttime (samme fag lige efter hinanden): noten står kun ved den første
    if (ramt.length) ramt.forEach(r => { const i = raekker.indexOf(r); if (!ramt.includes(raekker[i - 1])) (r.noter ||= []).push(n.tekst); });
    else if (normale.some(t => passer(t.fag, navn))) resten.push(n);   // faget er der, men kan ikke placeres (ingen tider)
  }
  const start = a != null ? tilKl(a) : grund.start, slut = b != null ? tilKl(b) : grund.slut;
  return { start, slut, harTimer: grund.harTimer || program.length > 0, timer: raekker.map(({ _f, ...r }) => r), saerlig: s, noter: resten };
}

// Barnets skoledag på en dato (bruges af tavlen, "Skole i dag" og "God morgen")
async function skoleDag(barn, iso, aftaler = null) {
  const dagNr = (new Date(iso + 'T00:00').getDay() + 6) % 7;
  const alle = await dagensTimer(barn, dagNr);
  const s = dagNr < 5 ? skoledagDen(aftaler || await Data.list('kalender'), iso, barn) : null;
  return fletSkoledag(alle, s);
}

// Titel til en ændring uden egen titel: "Idræt: husk løbesko"
const skoledagTitel = s => s.titel || (s.program?.length ? 'Særlig skoledag'
  : s.noter?.[0] ? (s.noter[0].fag ? s.noter[0].fag + ': ' : '') + s.noter[0].tekst : 'Ændring i skolen');
// Mærket på skolekortet vises kun ved et program eller ændrede tider (ikke ved en note til et fag)
const skoledagMaerke = s => !!(s && (s.program?.length || s.moede || s.friKl));

// Én time på kortet: normal time, programpunkt (stiplet kant) og evt. noter under
function skoleLi(t, erNu, farver) {
  const li = lektionLi(t, erNu, farver);
  if (t.saerlig) li.classList.add('saerlig');
  for (const n of t.noter || []) li.append(el('span', 'lektion-note', '📝 ' + n));
  return li;
}

// ---------- Ret en særlig skoledag (kun voksne) ----------
// x = eksisterende aftale (med id) eller et udfyldt forslag uden id (fra ✨ Ændring i skolen).
// opts.efter(gemt) kaldes i stedet for at lukke arket (gemt = null ved "Tilbage") – så AI-arket kan komme igen.
function redigerSkoledag(barn, iso, x = null, opts = {}) {
  if (erBarn()) return;
  const dato = input('date', 'sd-dato', x?.dato || iso);
  const titel = input('text', 'sd-titel', x?.titel || '', 'Fx Brætspilsdag, Motionsdag, Idræt');
  const valgte = new Set(x ? personerI(x).filter(p => BOERN.includes(p)) : [barn]);
  const hvemSeg = el('div', 'seg wrap');
  const tegnHvem = () => hvemSeg.replaceChildren(...BOERN.map(b => {
    const k = knap(b, null, () => { valgte.has(b) ? valgte.delete(b) : valgte.add(b); tegnHvem(); visEksempel(); });
    k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', valgte.has(b));
    return k;
  }));
  tegnHvem();

  // Programmet
  const prog = (x?.program || []).map(p => ({ ...p }));
  const progBoks = el('div', 'sd-raekker');
  const tegnProg = () => {
    progBoks.replaceChildren(...prog.map((p, i) => {
      const r = el('div', 'sd-raekke');
      const tid = el('input', 'tid-felt'); tid.type = 'text'; tid.value = visTider(p.tid); tid.placeholder = '9.00-10.00'; tid.inputMode = 'decimal';
      tid.setAttribute('aria-label', 'Tid');
      tid.addEventListener('input', () => { p.tid = tid.value; visEksempel(); });
      const tekst = el('input'); tekst.type = 'text'; tekst.value = p.tekst || ''; tekst.placeholder = 'Fx UNO-turnering';
      tekst.setAttribute('aria-label', 'Hvad sker der');
      tekst.addEventListener('input', () => { p.tekst = tekst.value; visEksempel(); });
      const slet = knap('', 'slet', () => { prog.splice(i, 1); tegnProg(); visEksempel(); });
      slet.innerHTML = IKON_SLET; slet.setAttribute('aria-label', 'Fjern punktet');
      r.append(tid, tekst, slet);
      return r;
    }));
  };
  tegnProg();
  const nyProg = knap('+ Punkt i programmet', 'lille-knap', () => {
    const sidste = prog.length ? tidSomMin(prog[prog.length - 1].tid)[1] : null;
    prog.push({ tid: sidste != null ? tidSpan(sidste, Math.min(sidste + 60, 24 * 60 - 1)) : '', tekst: '' });
    tegnProg(); progBoks.lastChild?.querySelector('input:not(.tid-felt)')?.focus();
  });

  // Ændrede tider (valgfri)
  const moede = input('time', 'sd-moede', x?.moede || '');
  const friKl = input('time', 'sd-fri', x?.friKl || '');
  for (const i of [moede, friKl]) i.addEventListener('input', visEksempel);
  const tiderPar = el('div', 'sd-tider');
  tiderPar.append(felt('Alle møder kl.', moede), felt('Alle har fri kl.', friKl));

  // Noter til fag
  const noter = (x?.noter || []).map(n => ({ ...n }));
  const fagListe = el('datalist'); fagListe.id = 'sd-fag-liste';
  (async () => {
    const navne = new Set((await Data.list('skema')).filter(s => BOERN.includes(s.barn) && s.fag).map(s => s.fag));
    fagListe.replaceChildren(...[...navne].sort((a, b) => a.localeCompare(b, 'da')).map(n => { const o = el('option'); o.value = n; return o; }));
  })();
  const noteBoks = el('div', 'sd-raekker');
  const tegnNoter = () => {
    noteBoks.replaceChildren(...noter.map((n, i) => {
      const r = el('div', 'sd-raekke');
      const fag = el('input', 'sd-fag'); fag.type = 'text'; fag.value = n.fag || ''; fag.placeholder = 'Fag'; fag.setAttribute('list', fagListe.id);
      fag.setAttribute('aria-label', 'Fag');
      fag.addEventListener('input', () => { n.fag = fag.value; visEksempel(); });
      const tekst = el('input'); tekst.type = 'text'; tekst.value = n.tekst || ''; tekst.placeholder = 'Fx løb ude – husk løbesko';
      tekst.setAttribute('aria-label', 'Note');
      tekst.addEventListener('input', () => { n.tekst = tekst.value; visEksempel(); });
      const slet = knap('', 'slet', () => { noter.splice(i, 1); tegnNoter(); visEksempel(); });
      slet.innerHTML = IKON_SLET; slet.setAttribute('aria-label', 'Fjern noten');
      r.append(fag, tekst, slet);
      return r;
    }));
  };
  tegnNoter();
  const nyNote = knap('+ Note til et fag', 'lille-knap', () => { noter.push({ fag: '', tekst: '' }); tegnNoter(); noteBoks.lastChild?.querySelector('input')?.focus(); });

  const note = input('text', 'sd-note', x?.note || '', 'Fx husk penge til pizza');

  // Sådan ser dagen ud for hvert valgt barn
  const eksempel = el('div', 'sd-eksempel');
  let eksTimer = null;
  function visEksempel() {
    clearTimeout(eksTimer);
    eksTimer = setTimeout(async () => {
      const s = samlet();
      const dagNr = (new Date(dato.value + 'T00:00').getDay() + 6) % 7;
      const dele = [];
      if (dato.value && dagNr < 5) for (const b of BOERN.filter(b => valgte.has(b))) {
        const r = fletSkoledag(await dagensTimer(b, dagNr), s);
        const farver = await skemaFarver(b);
        const boks = el('div', 'sd-eks-barn ' + (PK[b] || ''));
        const tider = [r.start ? 'møder ' + visTid(r.start) : '', r.slut ? 'fri ' + visTid(r.slut) : ''].filter(Boolean).join(' · ');
        boks.append(el('p', 'sd-eks-navn', b + (tider ? ' · ' + tider : '')));
        const ol = el('ol', 'lektioner bt-lektioner');
        ol.append(...r.timer.map(t => skoleLi(t, false, farver)));
        if (!r.timer.length) ol.append(el('li', 'tom', 'Intet skema lagt ind for ' + DAGE_LANG[dagNr].toLowerCase()));
        boks.append(ol);
        for (const n of r.noter) boks.append(el('p', 'lektion-note', '📝 ' + (n.fag ? n.fag + ': ' : '') + n.tekst));
        dele.push(boks);
      }
      if (dato.value && dagNr >= 5) dele.push(el('p', 'hint', 'Det er weekend den dag.'));
      eksempel.replaceChildren(...(dele.length ? [el('h3', 'lille-titel', 'Sådan ser dagen ud'), ...dele] : []));
    }, 250);
  }
  dato.addEventListener('change', visEksempel);

  function samlet() {
    const program = prog.filter(p => (p.tekst || '').trim() || (p.tid || '').trim())
      .map(p => ({ tid: rensTid(p.tid) || (p.tid || '').trim(), tekst: (p.tekst || '').trim() }));
    return {
      dato: dato.value, hvem: valgte.size === 1 ? [...valgte][0] : BOERN.filter(b => valgte.has(b)),
      titel: titel.value.trim(), type: SKOLEDAG, fri: false, tid: '', slut: '', tilDato: null, gentag: '', gentagTil: null,
      program, moede: moede.value || '', friKl: friKl.value || '',
      noter: noter.map(n => ({ fag: (n.fag || '').trim(), tekst: (n.tekst || '').trim() })).filter(n => n.tekst),
      note: note.value.trim()
    };
  }

  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const visFejl = t => { fejl.textContent = t; fejl.hidden = false; };
  const gem = knap('Gem', 'knap', async () => {
    const s = samlet();
    if (!s.dato) return visFejl('Vælg en dato.');
    if (!valgte.size) return visFejl('Vælg mindst ét barn.');
    const daarlig = s.program.find(p => !rensTid(p.tid));
    if (daarlig) return visFejl('Tiden "' + (daarlig.tid || '') + '" kan ikke forstås – skriv fx 9.00-10.00.');
    if (s.program.some(p => !p.tekst)) return visFejl('Skriv hvad der sker ved hvert punkt i programmet.');
    const sorteret = s.program.map(p => ({ ...p, m: tidSomMin(p.tid) })).sort((p, q) => p.m[0] - q.m[0]);
    const over = sorteret.find((p, i) => i && p.m[0] < sorteret[i - 1].m[1]);
    if (over) return visFejl('"' + over.tekst + '" starter, før det forrige punkt slutter – ret tiderne.');
    if (!s.program.length && !s.moede && !s.friKl && !s.noter.length) return visFejl('Skriv et program, ændrede tider eller en note til et fag.');
    if (s.moede && s.friKl && s.moede >= s.friKl) return visFejl('Mødetiden skal være før fri-tiden.');
    s.titel = skoledagTitel(s);
    if (x?.id) await Data.update(kalListe(x), x.id, s); else await Data.add('kalender', s);
    if (opts.efter) opts.efter(s); else { lukArk(); tegnAlt(); }
  });
  const knapper = el('div', 'ark-knapper');
  if (opts.efter) knapper.append(knap('‹ Tilbage', 'knap sekundaer', () => opts.efter(null)));
  if (x?.id && !opts.efter) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove(kalListe(x), x.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);

  // Ny (ikke fra AI): genvej til at lade AI'en udfylde det ud fra en besked
  const aiGenvej = !x && !opts.efter ? knap('✨ Har du en besked fra skolen? Lad AI\'en udfylde det', 'lille-knap sd-ai sd-vej', () => { lukArk(); aabnAI({ opgave: 'skole', boern: [...valgte] }); }) : '';
  aabnArk(x?.id ? 'Ret ændring i skolen' : '🏫 Særlig skoledag', aiGenvej,
    felt('Dato', dato), felt('Hvad hedder dagen? (valgfri)', titel), felt('Hvem', hvemSeg),
    el('h3', 'lille-titel', 'Program'),
    el('p', 'hint', 'Kun det, der er anderledes. Resten af dagen viser hvert barns normale skema – og hvert barn beholder sine egne tider.'),
    progBoks, nyProg,
    el('h3', 'lille-titel', 'Ændrede tider (valgfri)'), tiderPar,
    el('h3', 'lille-titel', 'Noter til fag'),
    el('p', 'hint', 'Vises under faget den dag, fx idræt.'), noteBoks, nyNote, fagListe,
    felt('Note (valgfri)', note), eksempel, fejl, knapper);
  visEksempel();
}

// ---------- Skema-siden: kommende ændringer for barnet ----------
async function tegnSkemaAendringer() {
  const boks = document.getElementById('skema-aendringer');
  if (!boks) return;
  const idag = isoDato(new Date());
  const kommende = (await Data.list('kalender'))
    .filter(a => a.type === SKOLEDAG && a.dato >= idag && personerI(a).includes(skemaBarn))
    .sort((a, b) => a.dato.localeCompare(b.dato));
  const dele = [];
  if (kommende.length) {
    dele.push(el('h3', 'lille-titel', 'Ændringer de næste dage'));
    const ul = el('ul', 'liste sd-liste');
    for (const a of kommende) {
      const d = new Date(a.dato + 'T00:00');
      const li = el('li');
      const b = knap('', 'sd-punkt', () => (erBarn() ? visAftale(a, a.dato) : redigerSkoledag(skemaBarn, a.dato, a)));
      b.append(el('span', 'sd-dato', DAGE[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '/' + (d.getMonth() + 1)),
        el('span', 'sd-titel', '🏫 ' + skoledagTitel(a)));
      li.append(b);
      ul.append(li);
    }
    dele.push(ul);
  }
  if (!erBarn()) {
    // Standard: næste gang den viste ugedag kommer (i dag, hvis det er i dag)
    const d = new Date(); d.setDate(d.getDate() + ((skemaDag - idagNr() + 7) % 7));
    const knapper = el('div', 'sd-knapper');
    knapper.append(knap('✨ Læs en besked med AI', 'lille-knap kun-voksen sd-ai', () => aabnAI({ opgave: 'skole', boern: [skemaBarn] })),   // ai.js
      knap('✏️ Skriv selv', 'lille-knap kun-voksen', () => redigerSkoledag(skemaBarn, isoDato(d))));
    dele.push(el('p', 'hint kun-voksen', 'AI\'en læser en besked fra Aula, en sms eller et foto af en seddel og foreslår det hele – også to do, huskesedler, mad og fri. Med "Skriv selv" udfylder du programmet.'));
    dele.push(knapper);
  }
  boks.replaceChildren(...dele);
}
