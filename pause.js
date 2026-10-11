// pause.js – ⏸ Pause for børnene (Timmos ønske okt. 2026: mest til maden, når de voksne ikke har taget stilling endnu)
// Data: 'pauser' {hvem: 'Oliver'|'Villads'|'Begge', fra: dato, til: dato | '' (= til den slås fra),
//                 mad: ['morgen','frokost','ret'], pligter: bool, hele: bool, pligtValg: 'klaret' | 'frys'}
//  • Mad: barnets tavle viser "Ikke bestemt endnu" i stedet for maden, og barnet kan ikke ønske mad den dag.
//  • Pligter (og belønninger) skjules på tavlen. Hele tavlen: barnet ser kun sin makker ("kig igen senere").
//  • Pligterne i pausen: 'klaret' = hver-dag-pligterne gives som klaret (stjerner/kr, ikke bonus) – fluebenene oprettes,
//    når en voksen åbner appen efter dagen (pause: true); 'frys' = dagen springes over i "dage i træk" (som en sygedag).
//  Databasen kender pausedagene (opdatering-pause.sql: dag_springes + pause_vagt). Kun voksne kan oprette pauser.
const PAUSE_MAD = { morgen: 'Morgenmad', frokost: 'Frokost', ret: 'Aftensmad' };
const pauseListe = () => Data.listNu('pauser');
const pauseGaelder = (p, barn, iso) => (p.hvem === barn || (p.hvem === 'Begge' && BOERN.includes(barn))) && p.fra <= iso && (!p.til || p.til >= iso);
const pauserFor = (barn, iso) => pauseListe().filter(p => pauseGaelder(p, barn, iso));
const pauseMad = (barn, iso, felt) => pauserFor(barn, iso).some(p => p.hele || (Array.isArray(p.mad) && p.mad.includes(felt)));
const pausePligter = (barn, iso) => pauserFor(barn, iso).find(p => p.hele || p.pligter) || null;
const pauseHele = (barn, iso) => pauserFor(barn, iso).find(p => p.hele) || null;
// Dagen tæller ikke i "dage i træk" (bruges af springOverDag i sjov.js): pligterne holder pause og er ikke klaret
const pauseSpring = (d, iso) => !!pausePligter(d.barn, iso);

function pauseTekst(p) {
  const dele = [];
  if (p.hele) dele.push('hele tavlen');
  else {
    const mad = (p.mad || []).map(m => PAUSE_MAD[m].toLowerCase());
    if (mad.length) dele.push(mad.length === 3 ? 'maden' : mad.join(' og '));
    if (p.pligter) dele.push('pligterne');
  }
  const hvem = p.hvem === 'Begge' ? BOERN.join(' og ') : p.hvem;
  const idag = isoDato(new Date());
  const naar = p.fra > idag ? 'fra ' + kortDag(p.fra) + (p.til ? ' til og med ' + kortDag(p.til) : '')
    : !p.til ? 'til den slås fra' : p.til === idag ? 'i dag' : 'til og med ' + kortDag(p.til);
  return hvem + ': ' + (dele.join(', ') || 'intet') + ' · ' + naar;
}

// ---------- Voksne: sæt eller ret en pause ----------
function redigerPause(p = {}, barn = null) {
  const ny = !p.id;
  const idag = isoDato(new Date());
  const s = {
    hvem: p.hvem || barn || 'Begge', mad: [...(p.mad || ['morgen', 'frokost', 'ret'])], pligter: !!p.pligter, hele: !!p.hele,
    pligtValg: p.pligtValg || 'klaret', fra: p.fra || idag, til: p.til ?? idag
  };
  if (ny && !p.mad) s.mad = ['morgen', 'frokost', 'ret'];
  const hvemBoks = el('div'), hvadBoks = el('div'), valgBoks = el('div'), naarBoks = el('div');
  const tegnHvem = () => hvemBoks.replaceChildren(chipValg([...BOERN, 'Begge'], s.hvem, v => { s.hvem = v; }, v => v));
  const HVAD = [['morgen', '🍽 Morgenmad'], ['frokost', '🍽 Frokost'], ['ret', '🍽 Aftensmad'], ['pligter', '📋 Pligter og belønninger'], ['hele', '🌙 Hele tavlen']];
  const tegnHvad = () => {
    const seg = el('div', 'seg wrap');
    for (const [k, navn] of HVAD) {
      const valgt = k === 'pligter' ? s.pligter : k === 'hele' ? s.hele : s.mad.includes(k);
      const b = knap((valgt ? '✓ ' : '') + navn, null, () => {
        if (k === 'pligter') s.pligter = !s.pligter;
        else if (k === 'hele') s.hele = !s.hele;
        else s.mad = valgt ? s.mad.filter(x => x !== k) : [...s.mad, k];
        tegnHvad(); tegnValg();
      });
      b.setAttribute('role', 'checkbox'); b.setAttribute('aria-checked', valgt);
      if (s.hele && k !== 'hele') b.disabled = true;   // hele tavlen = alt holder pause
      seg.append(b);
    }
    hvadBoks.replaceChildren(seg, el('p', 'hint', s.hele ? 'Barnet ser kun sin makker, der siger "kig igen senere".' : 'Maden står som "Ikke bestemt endnu" på tavlen, og der kan ikke ønskes mad.'));
  };
  const tegnValg = () => {
    valgBoks.replaceChildren();
    if (!s.pligter && !s.hele) return;
    valgBoks.append(el('label', 'felt-label', 'Pligterne i pausen'),
      chipValg(['klaret', 'frys'], s.pligtValg, v => { s.pligtValg = v; tegnValg(); }, v => v === 'klaret' ? '✅ Tæller som klaret' : '❄️ Frys'),
      el('p', 'hint', s.pligtValg === 'klaret'
        ? 'Hver-dag-pligterne giver stjerner/kr som klaret, og dage i træk fortsætter (bonus gives ikke). Fluebenene kommer, når en voksen åbner appen dagen efter – de kan ses og fjernes under Pligter.'
        : 'Ingen stjerner i pausen, men dage i træk står stille – ingen mister noget.'));
  };
  const fraIn = input('date', 'pause-fra', s.fra);
  fraIn.addEventListener('change', () => { s.fra = fraIn.value || idag; });
  const tilIn = input('date', 'pause-til', s.til || '');
  tilIn.addEventListener('change', () => { s.til = tilIn.value; });
  let laengde = !s.til ? 'altid' : s.til === s.fra && s.fra === idag ? 'idag' : 'dato';
  const tegnNaar = () => {
    naarBoks.replaceChildren(chipValg(['idag', 'dato', 'altid'], laengde, v => {
      laengde = v;
      if (v === 'idag') { s.fra = idag; s.til = idag; fraIn.value = idag; }
      if (v === 'altid') s.til = '';
      if (v === 'dato' && !s.til) { s.til = plusDage(s.fra, 6); tilIn.value = s.til; }
      tegnNaar();
    }, v => ({ idag: 'I dag', dato: 'Fra – til', altid: 'Til jeg slår den fra' })[v]));
    if (laengde === 'dato') { const r = el('div', 'pause-datoer'); r.append(felt('Fra', fraIn), felt('Til og med', tilIn)); naarBoks.append(r); }
    if (laengde === 'altid') naarBoks.append(felt('Fra', fraIn));
  };
  tegnHvem(); tegnHvad(); tegnValg(); tegnNaar();

  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slå fra', 'knap sekundaer', async () => { await slaaPauseFra(p); lukArk(); tegnAlt(); }));
  knapper.append(knap('Gem', 'knap', async () => {
    if (!s.hele && !s.pligter && !s.mad.length) { visStatus('Vælg hvad der skal holde pause', true); return; }
    if (laengde === 'dato' && (!s.til || s.til < s.fra)) { visStatus('"Til og med" skal være samme dag eller senere', true); return; }
    const felter = { hvem: s.hvem, fra: s.fra, til: laengde === 'altid' ? '' : s.til, mad: s.hele ? ['morgen', 'frokost', 'ret'] : s.mad,
      pligter: s.pligter || s.hele, hele: s.hele, pligtValg: s.pligtValg };
    if (ny) await Data.add('pauser', felter); else await Data.update('pauser', p.id, felter);
    lukArk(); visStatus('⏸ Pause: ' + pauseTekst(felter)); tegnAlt();
  }));
  aabnArk(ny ? '⏸ Sæt på pause' : '⏸ Ret pause',
    el('label', 'felt-label', 'Hvem'), hvemBoks,
    el('label', 'felt-label', 'Hvad holder pause?'), hvadBoks, valgBoks,
    el('label', 'felt-label', 'Hvor længe?'), naarBoks, knapper);
}
// Slå fra: er pausen allerede begyndt, slutter den i går (så dagene bagud stadig gælder for "dage i træk"); ellers slettes den
async function slaaPauseFra(p) {
  const idag = isoDato(new Date());
  if (p.fra < idag) await Data.update('pauser', p.id, { til: plusDage(idag, -1) });
  else await Data.remove('pauser', p.id);
}

// Bånd øverst på Familien (voksne): aktive og kommende pauser
function pauseBaand() {
  const idag = isoDato(new Date());
  const aktuelle = pauseListe().filter(p => !p.til || p.til >= idag).sort((a, b) => a.fra.localeCompare(b.fra));
  if (!aktuelle.length) return null;
  const boks = el('div', 'kort pause-baand');
  for (const p of aktuelle) {
    const r = el('div', 'pause-linje');
    const t = knap('', 'pause-tekst', () => redigerPause(p));
    t.append(el('b', null, '⏸ Pause '), document.createTextNode(pauseTekst(p)));
    r.append(t, knap('Slå fra', 'lille-knap', async () => { await slaaPauseFra(p); tegnAlt(); }));
    boks.append(r);
  }
  return boks;
}

// Kort på barnets tavle i stedet for pligter, mens de holder pause
function pausePligtKort(p) {
  const k = el('div', 'kort pause-kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Pligter'));
  const under = p.pligtValg === 'klaret' ? 'Pligterne tæller som klaret 👍' : 'Dine dage i træk står stille ❄️';
  k.append(top, el('p', 'stor', '⏸ Pause'), el('p', 'under', under));
  k.tavle = { noegle: 'pligter', ikon: '⏸', titel: 'Pligter', stor: 'Pause', lille: under, klar: true };
  return k;
}

// Hele tavlen holder pause: barnet ser kun sin makker
const PAUSE_REPLIKKER = ['Tavlen er på værksted 🛠 – kig igen senere!', 'Mor og far er ved at gøre tavlen klar. Kig igen senere 🙂',
  'Pssst … tavlen holder pause. Hvad med at lege lidt? 🎈', 'Jeg holder øje med tavlen for dig – kig igen senere 👀', 'Pause! Tid til at strække benene 🦵'];
async function pauseSkaerm(barn) {
  const valg = await valgFor(barn);   // dage.js
  const m = makkerFor(valg);   // sjov.js
  const boks = el('div', 'pause-skaerm');
  const fig = el('div', 'pause-makker');
  fig.innerHTML = m.svg('venter');
  const boble = el('p', 'pause-boble', PAUSE_REPLIKKER[new Date().getDate() % PAUSE_REPLIKKER.length]);
  let i = new Date().getDate();
  fig.addEventListener('click', () => {
    i++; boble.textContent = PAUSE_REPLIKKER[i % PAUSE_REPLIKKER.length];
    fig.innerHTML = m.svg('glad');
    fig.classList.remove('vip'); void fig.offsetWidth; fig.classList.add('vip');
    setTimeout(() => { fig.innerHTML = m.svg('venter'); }, 1600);
  });
  boks.append(boble, fig, el('p', 'pause-navn', m.navn + ' passer på tavlen'));
  return boks;
}

// 'klaret'-pauser: giv hver-dag-pligterne som klaret for de dage, der er gået (kører hos en voksen, højst hvert 10. minut)
let pauseUdfyldt = 0;
async function pauseUdfyld() {
  if (erBarn() || Date.now() - pauseUdfyldt < 600000) return;
  pauseUdfyldt = Date.now();
  const idag = isoDato(new Date()), igaar = plusDage(idag, -1), tidligst = plusDage(idag, -60);
  const pauser = pauseListe().filter(p => p.pligtValg === 'klaret' && (p.pligter || p.hele) && p.fra <= igaar);
  if (!pauser.length) return;
  let n = 0;
  for (const barn of BOERN) {
    const mine = pauser.filter(p => p.hvem === barn || p.hvem === 'Begge');
    if (!mine.length) continue;
    const d = await pligtData(barn);   // mere.js
    const har = new Set(d.flueben.map(f => f.opgave + '|' + f.periode));
    for (const p of mine) {
      const slut = p.til && p.til < igaar ? p.til : igaar;
      for (let iso = p.fra < tidligst ? tidligst : p.fra; iso <= slut; iso = plusDage(iso, 1)) {
        for (const o of dagligeDen(d, iso)) {   // sjov.js: hver-dag-pligter den dag (ikke bonus)
          if (har.has(o.id + '|' + iso)) continue;
          await Data.add('flueben', { opgave: o.id, barn, periode: iso, dato: iso, navn: o.navn,
            kr: d.regel.kr ? tal(o.kr) : 0, stjerner: d.regel.stjerner ? Math.round(tal(o.stjerner)) : 0, pause: true });
          har.add(o.id + '|' + iso); n++;
        }
      }
    }
  }
  if (n) visStatus('⏸ ' + n + (n === 1 ? ' pligt' : ' pligter') + ' fra pausen er givet som klaret');
}
