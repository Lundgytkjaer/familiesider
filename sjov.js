// sjov.js – det sjove for børnene: konfetti, Alfie (familiens kanin) og streaks.
// Bruger hjælpere fra app.js og mere.js. Gemmer intet nyt i databasen – alt regnes ud fra
// flueben (pligter) og rutinetrin (huskes på enheden).

// ---------- Venlig besked (uden konfetti) – fx når mor og far har sagt nej ----------
function besked(tekst) {
  const b = el('div', 'fejring besked', tekst);
  b.setAttribute('role', 'status');
  document.body.append(b);
  setTimeout(() => b.classList.add('vaek'), 3200);
  setTimeout(() => b.remove(), 3800);
}

// ---------- Konfetti ----------
const KONFETTI_FARVER = ['#f2a45a', '#a990ff', '#7aa5f5', '#ee86bd', '#5cc3a3', '#ffd34d'];
let fejrerNu = false;
let alfieFestTil = 0;   // lige efter en fejring danser Alfie, også om aftenen
function fejr(tekst) {
  if (fejrerNu) return;
  fejrerNu = true;
  alfieFestTil = Date.now() + 2 * 60 * 1000;
  setTimeout(() => { fejrerNu = false; }, 2600);

  const besked = el('div', 'fejring', tekst);
  besked.setAttribute('role', 'status');
  document.body.append(besked);
  setTimeout(() => besked.classList.add('vaek'), 2000);
  setTimeout(() => besked.remove(), 2600);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.body.classList.contains('cool')) return;   // Cool-tavle: ingen konfetti
  konfetti();
}
function konfetti() {
  const c = el('canvas', 'konfetti');
  const dpr = window.devicePixelRatio || 1;
  const w = innerWidth, h = innerHeight;
  c.width = w * dpr; c.height = h * dpr;
  document.body.append(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const stk = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3, y: h * 0.35,
    vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 13 - 4,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
    s: 6 + Math.random() * 6, f: KONFETTI_FARVER[Math.floor(Math.random() * KONFETTI_FARVER.length)],
    rund: Math.random() < 0.3
  }));
  const start = performance.now();
  (function tegn(t) {
    const gaaet = t - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of stk) {
      p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - gaaet / 2600);
      ctx.translate(p.x, p.y); ctx.rotate(p.r);
      ctx.fillStyle = p.f;
      if (p.rund) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2.5, 0, 7); ctx.fill(); }
      else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (gaaet < 2600) requestAnimationFrame(tegn); else c.remove();
  })(start);
}

// ---------- Streak: dage i træk hvor alle dagens hver-dag-pligter blev klaret ----------
// Reglerne her er de SAMME som i databasen (opdatering-streakbonus-2.sql) – ret begge steder:
//   • En dag tæller, når alle dagens hver-dag-pligter er klaret (bonus og uge-/engangspligter tæller ikke).
//   • Dage uden hver-dag-pligter, sygedage (en "Syg"-aftale uden gentagelse) og dage reddet af jokeren springes over.
//   • En voksen kan sætte rækken ("var X dage til og med dato" – justeringer type 'streak').
//   • I dag tæller med, når den er klaret – men bryder ikke rækken, før dagen er gået.
// Data: 'streakbonus' {barn, dato, stjerner, dage, milepael?}  – automatisk ekstra stjerne(r) fra dag 2 i træk
//       'streakjoker' {barn, dato (den reddede dag), maaned 'ÅÅÅÅ-MM'} – én pr. måned redder en glemt dag
// Regler pr. barn (personregler, sættes af en voksen): streakBonus (0 = fra, standard 1), joker (false = fra)
const MILEPAELE = { 7: 3, 14: 5, 21: 5, 30: 10, 50: 10, 75: 15, 100: 20 };
const milepaelStjerner = n => MILEPAELE[n] || (n > 100 && n % 50 === 0 ? 20 : 0);
const naesteMilepael = n => { for (let m = n + 1; m < n + 60; m++) if (milepaelStjerner(m)) return m; return null; };
const bonusStjerner = d => (d.regel.stjerner ? Math.max(0, Math.round(tal(d.regel.streakBonus ?? 1))) : 0);
const jokerTil = d => d.regel.joker !== false;

const oprettetIso = o => (o.oprettet ? isoDato(new Date(o.oprettet)) : '0000-00-00');
const dagligePligter = d => d.opgaver.filter(o => !o.frivillig && !['uge', 'engang', 'interval'].includes(o.gentag));
function dagligeDen(d, iso) {
  const dag = (new Date(iso + 'T00:00').getDay() + 6) % 7;
  return dagligePligter(d).filter(o => (typeof pligtIDag === 'function' ? pligtIDag(o, iso) : (!Array.isArray(o.dage) || !o.dage.length || o.dage.includes(dag))) && oprettetIso(o) <= iso);   // mere.js: også skoledage/fridage
}
// null = ingen hver-dag-pligter den dag, true = alle klaret, false = ikke alle
function dagKlaret(d, iso) {
  const planlagt = dagligeDen(d, iso);
  if (!planlagt.length) return null;
  // Opslag i et sæt (bygges én gang pr. d) – ellers bliver mange dage × mange flueben langsomt
  if (!d._fb) Object.defineProperty(d, '_fb', { value: new Set(d.flueben.filter(f => !f.sprunget && !(f.glemt && f.venter)).map(f => f.opgave + '|' + f.periode)) });
  return planlagt.every(o => d._fb.has(o.id + '|' + iso));
}
// Syg den dag (simpel udgave som i databasen: en "Syg"-aftale uden gentagelse, der dækker dagen)
const sygSimpel = (d, iso) => (d.kalender || []).some(a => a.type === 'syg' && !a.gentag && a.dato <= iso
  && (a.tilDato && a.tilDato > a.dato ? a.tilDato : a.dato) >= iso
  && [].concat(a.hvem || []).some(h => h === d.barn || h === 'Fælles'));
const jokerDen = (d, iso) => (d.jokere || []).some(j => j.dato === iso);
// ⏸ Pause (pause.js): en pausedag uden klarede pligter springes over – som i databasen (opdatering-pause.sql)
const springOverDag = (d, iso) => sygSimpel(d, iso) || jokerDen(d, iso) || (typeof pauseSpring === 'function' && pauseSpring(d, iso) && dagKlaret(d, iso) !== true);
const tidligstePligt = d => dagligePligter(d).map(oprettetIso).sort()[0] || '9999-99-99';

function streak(d) {
  const anker = d.streakAnker;   // voksen-justering: "rækken var X dage til og med denne dato"
  if (!dagligePligter(d).length) return anker ? Math.max(0, Math.round(tal(anker.dage))) : 0;
  const idag = isoDato(new Date()), tidligste = tidligstePligt(d);
  let n = 0;
  for (let i = 0; i < 400; i++) {
    const iso = plusDage(idag, -i);
    if (anker && iso <= anker.dato) { n += Math.max(0, Math.round(tal(anker.dage))); break; }
    if (iso < tidligste) break;
    if (springOverDag(d, iso)) continue;
    const k = dagKlaret(d, iso);
    if (k === null) continue;
    if (k) n++;
    else if (i > 0) break;
  }
  return n;
}
const streakTekst = n => '🔥 ' + n + (n === 1 ? ' dag' : ' dage') + ' i træk';

// ---------- Ugepokal: 5 af ugens dage med alle hver-dag-pligter klaret (tilgivende – én glemt dag ødelægger ikke ugen) ----------
// Mål = 5 dage, eller færre hvis ugen har færre pligt-dage. Syge-/joker-dage tæller som klaret. Regnes ud – gemmes ikke.
function ugeStatus(d, man) {
  let n = 0, planlagt = 0;
  for (let i = 0; i < 7; i++) {
    const iso = plusDage(man, i);
    if (springOverDag(d, iso)) { if (dagligeDen(d, iso).length) { n++; planlagt++; } continue; }
    const k = dagKlaret(d, iso);
    if (k === null) continue;
    planlagt++;
    if (k) n++;
  }
  return { n, maal: Math.min(5, planlagt) };
}
// Alle vundne ugepokaler (nyeste først)
function ugepokaler(d) {
  const tidligste = tidligstePligt(d);
  if (tidligste === '9999-99-99') return [];
  const res = [], idag = isoDato(new Date());
  let man = isoDato(mandagFor(new Date(tidligste + 'T12:00')));   // app.js
  for (let k = 0; k < 160 && man <= idag; k++, man = plusDage(man, 7)) {
    const st = ugeStatus(d, man);
    if (st.maal && st.n >= st.maal) res.push({ man, ...st });
  }
  return res.reverse();
}

// ---------- Makkeren vokser: får nyt pynt for hver 5 (10, 20 …) klarede dage ----------
const MAKKER_PYNT = [[5, '🧢', 'en kasket'], [10, '🕶️', 'solbriller'], [20, '🧣', 'et halstørklæde'], [35, '🎩', 'en flot hat'],
  [50, '👑', 'en krone'], [75, '🦸', 'en superheltekappe'], [100, '🏆', 'en guldpokal']];
function klaredeDage(d) {
  const tidligste = tidligstePligt(d);
  if (tidligste === '9999-99-99') return 0;
  const idag = isoDato(new Date());
  let n = 0;
  for (let i = 0; i < 1000; i++) {
    const iso = plusDage(idag, -i);
    if (iso < tidligste) break;
    if (dagKlaret(d, iso) === true) n++;
  }
  return n;
}
function makkerNiveau(d) {
  const dage = klaredeDage(d);
  const fået = MAKKER_PYNT.filter(([n]) => dage >= n);
  const naeste = MAKKER_PYNT.find(([n]) => dage < n);
  return { dage, niveau: fået.length, pynt: fået.map(p => p[1]), sidste: fået[fået.length - 1] || null, naeste };
}

// Den seneste dag før 'iso', der tæller: true = holdt (klaret eller voksen-sat række), false = brudt.
// Giver også datoen, så jokeren ved, hvilken dag den skal redde.
function forrigeDag(d, iso) {
  const anker = d.streakAnker, tidligste = tidligstePligt(d);
  for (let i = 1; i <= 400; i++) {
    const dag = plusDage(iso, -i);
    if (anker && dag <= anker.dato) return { holdt: Math.round(tal(anker.dage)) > 0, dato: null };
    if (dag < tidligste) return { holdt: false, dato: null };
    if (springOverDag(d, dag)) continue;
    const k = dagKlaret(d, dag);
    if (k === null) continue;
    return { holdt: k, dato: dag };
  }
  return { holdt: false, dato: null };
}
// Kan jokeren redde rækken i dag? (gårsdagen – eller den seneste dag med pligter – blev glemt, men dagen før var holdt)
function jokerKanRedde(d, iso) {
  if (!jokerTil(d) || (d.jokere || []).some(j => j.maaned === iso.slice(0, 7))) return null;
  const f = forrigeDag(d, iso);
  if (f.holdt || !f.dato) return null;
  return forrigeDag(d, f.dato).holdt ? f.dato : null;
}
// Status til kortene
function bonusStatus(d) {
  const iso = isoDato(new Date());
  const n = bonusStjerner(d);
  const givet = (d.bonus || []).find(b => b.dato === iso) || null;
  const klaretIdag = dagKlaret(d, iso);
  const holdt = forrigeDag(d, iso).holdt;
  const joker = klaretIdag === false && !holdt ? jokerKanRedde(d, iso) : null;
  const naeste = streak(d) + (klaretIdag === true ? 0 : 1);   // rækken, hvis i dag bliver klaret
  return {
    n, givet, joker, klaretIdag,
    mulig: n > 0 && !givet && klaretIdag === false && (holdt || !!joker),
    starter: n > 0 && !givet && klaretIdag !== null && !holdt && !joker,   // første dag i en ny række
    milepael: klaretIdag === false ? milepaelStjerner(naeste) : 0, naeste,
    jokerBrugt: (d.jokere || []).some(j => j.maaned === iso.slice(0, 7))
  };
}
// Kaldes efter hvert flueben: bruger jokeren hvis det redder rækken, giver bonus (+ milepæl) –
// og tager bonussen igen, hvis et flueben fjernes
async function opdaterStreakBonus(barn) {
  let d = await pligtData(barn);   // fra mere.js
  const iso = isoDato(new Date());
  const klaret = dagKlaret(d, iso) === true;
  let jokerBrugt = false;
  try {
    if (klaret && !forrigeDag(d, iso).holdt) {
      const redde = jokerKanRedde(d, iso);
      if (redde) {
        await Data.add('streakjoker', { barn, dato: redde, maaned: iso.slice(0, 7) });
        jokerBrugt = true;
        d = await pligtData(barn);
      }
    }
    const n = bonusStjerner(d);
    const givet = d.bonus.find(b => b.dato === iso);
    const fortjent = n > 0 && klaret && forrigeDag(d, iso).holdt;
    if (fortjent && !givet) {
      const dage = streak(d);
      const ekstra = milepaelStjerner(dage);
      await Data.add('streakbonus', { barn, dato: iso, stjerner: n + ekstra, dage, ...(ekstra ? { milepael: dage } : {}) });
      return { n, ekstra, dage, jokerBrugt };
    }
    if (!fortjent && givet) await Data.stille(() => Data.remove('streakbonus', givet.id));
  } catch (e) { console.warn('Streak-bonus:', e); }
  return jokerBrugt ? { n: 0, ekstra: 0, dage: streak(d), jokerBrugt } : null;
}

// Animation: flammen blusser op og "spytter" stjerner ud, der flyver hen til stjernerne.
// Ved en milepæl: medalje, flere stjerner og konfetti. Jokeren vises med 🃏.
function flammeStjerne({ n, ekstra = 0, dage, jokerBrugt = false }) {
  const boks = el('div', 'flamme-fest' + (ekstra ? ' milepael' : ''));
  boks.setAttribute('role', 'status');
  const flamme = el('div', 'ff-flamme', ekstra ? '🏅' : jokerBrugt && !n ? '🃏' : '🔥');
  const tekst = el('div', 'ff-tekst');
  if (ekstra) tekst.append(el('b', null, dage + ' dage i træk!'), el('span', 'ff-ekstra', '+' + (n + ekstra) + ' ★ (heraf ' + ekstra + ' ekstra)'));
  else if (n) tekst.append(el('b', null, 'Dage i træk! +' + n + ' ★'), el('span', null, streakTekst(dage)));
  else tekst.append(el('b', null, 'Jokeren reddede dine dage i træk!'), el('span', null, streakTekst(dage)));
  if (jokerBrugt && n) tekst.append(el('span', 'ff-joker', '🃏 Jokeren reddede den glemte dag'));
  boks.append(flamme, tekst);
  document.body.append(boks);
  const varighed = ekstra ? 3800 : 2900;
  const vaek = () => { boks.classList.add('vaek'); setTimeout(() => boks.remove(), 450); };
  setTimeout(vaek, varighed);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (ekstra) konfetti();
  if (!n) return;
  const maal = [...document.querySelectorAll('.flise[data-noegle="beloenninger"], .stjerne-stat, .kort-pil')]
    .find(e => e.offsetParent && e.getBoundingClientRect().bottom > 0 && e.getBoundingClientRect().top < innerHeight);
  setTimeout(() => {
    const f = flamme.getBoundingClientRect();
    const fx = f.left + f.width / 2, fy = f.top + f.height * 0.35;
    const m = maal ? maal.getBoundingClientRect() : { left: innerWidth / 2, top: -40, width: 0, height: 0 };
    const mx = m.left + m.width / 2, my = m.top + m.height / 2;
    const antal = Math.min(ekstra ? 9 : 5, n + ekstra + 2);
    for (let i = 0; i < antal; i++) {
      const stj = el('div', 'ff-stjerne', '★');
      document.body.append(stj);
      const ud = (i - (antal - 1) / 2) * 34;
      stj.animate([
        { transform: `translate(${fx}px, ${fy}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${fx + ud}px, ${fy - 90 - (i % 3) * 14}px) scale(1.5)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${mx}px, ${my}px) scale(.6)`, opacity: .9 }
      ], { duration: 1200 + i * 110, delay: i * 100, easing: 'cubic-bezier(.3,.1,.3,1)', fill: 'forwards' })
        .finished.then(() => { stj.remove(); if (maal && i === 0) maal.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 350 }); });
    }
  }, 650);
}

// ---------- Stjerner fra mor og far: stor stjerne, der bliver stående til barnet trykker ----------
// gaver: [{stjerner, tekst}] – flere gaver: skærmen ryster, og en ny stjerne bryder frem for hver. faerdig() kaldes bagefter.
function stjerneGave(gaver, faerdig = () => {}) {
  if (!gaver.length) { faerdig(); return; }
  const roligt = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fest = el('div', 'gave-fest');
  fest.setAttribute('role', 'dialog');
  fest.setAttribute('aria-label', 'Du har fået stjerner');
  const scene = el('div', 'gf-scene');
  const stjerne = el('div', 'gf-stjerne');
  const tal = el('span', 'gf-tal');
  stjerne.append(el('span', 'gf-form', '★'), tal);
  const tekst = el('p', 'gf-tekst');
  const iAlt = el('p', 'gf-ialt');
  const videre = knap('', 'knap gf-knap', () => naeste());
  scene.append(stjerne, tekst, iAlt, videre);
  fest.append(scene);
  document.body.append(fest);
  let i = -1, sum = 0;
  const vis = () => {
    const g = gaver[i];
    sum += g.stjerner;
    tal.textContent = '+' + g.stjerner;
    tekst.textContent = g.tekst;
    iAlt.textContent = gaver.length > 1 ? (i + 1) + ' af ' + gaver.length + ' · i alt +★ ' + sum : '';
    videre.textContent = i < gaver.length - 1 ? 'Der er mere! ✨' : 'Fedt! 🙌';
    if (roligt) return;
    stjerne.classList.remove('frem'); void stjerne.offsetWidth; stjerne.classList.add('frem');
    if (i > 0) { fest.classList.remove('ryst'); void fest.offsetWidth; fest.classList.add('ryst'); }
    konfetti();
    // Små stjerner, der flyver ud fra den store
    for (let k = 0; k < Math.min(12, 4 + g.stjerner * 2); k++) {
      const s2 = el('div', 'ff-stjerne', '★');
      document.body.append(s2);
      const r = stjerne.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const v = (k / 12) * Math.PI * 2 + Math.random() * .4, afst = 120 + Math.random() * 90;
      s2.animate([
        { transform: `translate(${cx}px, ${cy}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${cx + Math.cos(v) * afst * .6}px, ${cy + Math.sin(v) * afst * .6}px) scale(1.3)`, opacity: 1, offset: .4 },
        { transform: `translate(${cx + Math.cos(v) * afst}px, ${cy + Math.sin(v) * afst}px) scale(.4)`, opacity: 0 }
      ], { duration: 1100 + Math.random() * 400, delay: 250 + k * 30, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }).finished.then(() => s2.remove());
    }
  };
  const naeste = () => {
    i++;
    if (i < gaver.length) { vis(); return; }
    fest.classList.add('vaek');
    setTimeout(() => { fest.remove(); faerdig(); }, 350);
  };
  naeste();
  setTimeout(() => videre.focus(), 50);
}

// ---------- Alfie – orange løvehoved-dværgkanin ----------
// hvordan: 'venter' | 'glad' | 'super' | 'sover'
// ---------- Pynt tegnet ind i makkeren (kasket, solbriller, tørklæde, hat, krone, kappe, pokal) ----------
// Hver makker har sine egne ankerpunkter: hoved (top af hovedet), øjne, hals, kappe (skuldre) og pokal (på jorden).
// Hovedpynt: kun den nyeste af kasket/hat/krone. Resten bliver siddende, når man først har fået det.
const PYNT_ANKER = {
  alfie: { hoved: [46, 36, 26, -6], oejne: [39, 53, 50, 5.2], hals: [47, 73, 30, 4], kappe: 'M56 61 Q80 52 100 64 Q105 80 94 92 Q76 86 60 80 Z', pokal: [104, 101, 1] },
  tank: { hoved: [59, 36, 24, 0], oejne: [51, 67, 51, 7.4], hals: [59, 68, 50, 0], kappe: [59, 58, .9], pokal: [10, 101, .9] },
  raket: { hoved: [60, 11, 16, 0], oejne: [55, 65, 48, 4.2], hals: [60, 66, 34, 0], kappe: [60, 34, .9], pokal: [100, 103, 1] },
  globus: { hoved: [58, 21, 30, -8], oejne: [49, 67, 46, 5.6], hals: [60, 84, 18, 0], kappe: [58, 40, 1.15], pokal: [96, 104, 1] },
  fodbold: { hoved: [58, 41, 30, -8], oejne: [49, 67, 72, 5.6], hals: [58, 88, 40, 0], kappe: [58, 58, 1.15], pokal: [100, 101, 1] },
  robot: { hoved: [60, 19, 34, 0], oejne: [49, 71, 36, 6.4], hals: [60, 59, 30, 0], kappe: [60, 62, 1], pokal: [100, 104, 1] }
};
const PYNT_HOVED = ['🧢', '🎩', '👑'];
// pynt = liste af emoji fra MAKKER_PYNT, som barnet har fået
function pyntDele(id, pynt, hvordan) {
  const a = PYNT_ANKER[id], p = new Set(pynt || []);
  const tom = { kappe: '', hals: '', hoved: '', pokal: '' };
  if (!a || !p.size) return tom;
  const hovedTing = [...PYNT_HOVED].reverse().find(e => p.has(e));
  const [hx, hy, hw, hr] = a.hoved, k = hw / 30;
  let hoved = '';
  if (hovedTing === '🧢') hoved = `<g transform="translate(${hx} ${hy}) rotate(${hr}) scale(${k})"><path d="M-14 1 a14 12.5 0 0 1 28 0 z" fill="#2f6fdb"/><path d="M8 0 q12 -2 17 2 q-1 3 -6 3 h-11 z" fill="#1f4fa8"/><path d="M-14 1 h28" stroke="#1f4fa8" stroke-width="2"/><circle cx="0" cy="-11" r="1.8" fill="#1f4fa8"/><path d="M-4 -10 q-3 5 -3 10" stroke="#fff" stroke-width="1.4" fill="none" opacity=".5"/></g>`;
  if (hovedTing === '🎩') hoved = `<g transform="translate(${hx} ${hy}) rotate(${hr}) scale(${k})"><ellipse cx="0" cy="0" rx="18" ry="3.6" fill="#24252b"/><path d="M-10.5 -1 v-19 q10.5 -3 21 0 v19 z" fill="#2b2c33"/><rect x="-10.5" y="-6.5" width="21" height="4" fill="#e5484d"/><path d="M-7 -18 v10" stroke="#fff" stroke-width="1.2" opacity=".25"/></g>`;
  if (hovedTing === '👑') hoved = `<g transform="translate(${hx} ${hy}) rotate(${hr}) scale(${k})"><path d="M-13 1 L-14 -13 L-6.5 -5 L0 -16 L6.5 -5 L14 -13 L13 1 Z" fill="#ffcf33" stroke="#c99a12" stroke-width="1.2" stroke-linejoin="round"/><circle cx="0" cy="-3" r="2" fill="#e5484d"/><circle cx="-8" cy="-2" r="1.5" fill="#4aa3df"/><circle cx="8" cy="-2" r="1.5" fill="#5cc3a3"/><circle cx="0" cy="-16" r="1.6" fill="#ffcf33" stroke="#c99a12" stroke-width=".8"/></g>`;
  if (p.has('🕶️') && hvordan !== 'sover') {   // brillerne tages af, når makkeren sover
    const [vx, hx2, oy, r] = a.oejne;
    const glas = x => `<rect x="${x - r * 1.2}" y="${oy - r * .85}" width="${r * 2.4}" height="${r * 1.7}" rx="${r * .7}" fill="#1d1f26" opacity=".93"/><path d="M${x - r * .6} ${oy - r * .35} l${r * .6} -${r * .25}" stroke="#fff" stroke-width="1" opacity=".55" stroke-linecap="round"/>`;
    hoved = `<g>${glas(vx)}${glas(hx2)}<path d="M${vx + r * 1.2} ${oy - r * .3} Q${(vx + hx2) / 2} ${oy - r * .8} ${hx2 - r * 1.2} ${oy - r * .3}" stroke="#1d1f26" stroke-width="1.6" fill="none"/></g>` + hoved;
  }
  let hals = '';
  if (p.has('🧣')) {
    const [x, y, w, r] = a.hals;
    hals = `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="${-w / 2}" y="-3.5" width="${w}" height="7" rx="3.5" fill="#e5484d"/>${[-.3, 0, .3].map(f => `<path d="M${w * f} -3.5 v7" stroke="#fff" stroke-width="2" opacity=".8"/>`).join('')}<path d="M${w * .18} 2 l3 13 h6 l-3 -13 z" fill="#d43b40"/><path d="M${w * .18 + 3.6} 12 h6" stroke="#fff" stroke-width="2" opacity=".8"/></g>`;
  }
  let kappe = '';
  if (p.has('🦸') && typeof a.kappe === 'string') kappe = `<path d="${a.kappe}" fill="#c0392b"/><path d="M60 64 Q78 58 96 68" stroke="#962d22" stroke-width="2" fill="none" opacity=".5"/>`;   // Alfie ligger ned: kappen ligger på ryggen
  else if (p.has('🦸')) {
    const [x, y, sk] = a.kappe;
    kappe = `<g transform="translate(${x} ${y}) scale(${sk})"><path d="M-12 0 Q-30 22 -26 40 Q0 48 26 40 Q30 22 12 0 Z" fill="#c0392b"/><path d="M-12 0 Q-22 20 -20 38" stroke="#962d22" stroke-width="2" fill="none" opacity=".6"/></g>`;
  }
  let pokal = '';
  if (p.has('🏆')) {
    const [x, y, sk] = a.pokal;
    pokal = `<g transform="translate(${x} ${y}) scale(${sk})"><rect x="-8" y="-4" width="16" height="4" rx="1" fill="#8a5a1a"/><rect x="-2" y="-9" width="4" height="5" fill="#e0a92a"/><path d="M-8 -22 h16 q0 12 -8 13 q-8 -1 -8 -13 z" fill="#ffcf33" stroke="#c99a12" stroke-width="1"/><path d="M-8 -20 q-5 0 -4 4 q1 3 5 3 M8 -20 q5 0 4 4 q-1 3 -5 3" stroke="#c99a12" stroke-width="1.6" fill="none"/><path d="M-4 -19 q0 6 3 8" stroke="#fff" stroke-width="1.2" fill="none" opacity=".6"/></g>`;
  }
  return { kappe, hals, hoved, pokal };
}

function alfieSvg(hvordan, pynt) {
  const P = pyntDele('alfie', pynt, hvordan);
  const ORANGE = '#e98a3a', MANKE = '#f4a85e', LYS = '#fde6c8', MORK = '#3a2418', LYSROED = '#f39aa8';
  const manke = Array.from({ length: 14 }, (_, i) => {
    const v = (i / 14) * Math.PI * 2;
    return `<circle cx="${(46 + Math.cos(v) * 22).toFixed(1)}" cy="${(52 + Math.sin(v) * 21).toFixed(1)}" r="9.5" fill="${MANKE}"/>`;
  }).join('');
  const oejne = {
    venter: `<circle cx="39" cy="50" r="3.4" fill="${MORK}"/><circle cx="53" cy="50" r="3.4" fill="${MORK}"/>
             <circle cx="40.2" cy="48.8" r="1.1" fill="#fff"/><circle cx="54.2" cy="48.8" r="1.1" fill="#fff"/>`,
    glad: `<circle cx="39" cy="50" r="3.6" fill="${MORK}"/><circle cx="53" cy="50" r="3.6" fill="${MORK}"/>
           <circle cx="40.3" cy="48.6" r="1.3" fill="#fff"/><circle cx="54.3" cy="48.6" r="1.3" fill="#fff"/>`,
    super: `<path d="M35 51 q4 -6 8 0 M49 51 q4 -6 8 0" stroke="${MORK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sover: `<path d="M35 50 q4 4 8 0 M49 50 q4 4 8 0" stroke="${MORK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  }[hvordan];
  const mund = hvordan === 'venter'
    ? `<path d="M43.5 63 q2.5 1.2 5 0" stroke="${MORK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
    : `<path d="M42 62.5 q2 2.6 4 0 q2 2.6 4 0" stroke="${MORK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  const kinder = hvordan === 'super' || hvordan === 'glad'
    ? `<ellipse cx="33.5" cy="57" rx="3.6" ry="2.2" fill="${LYSROED}" opacity=".6"/><ellipse cx="58.5" cy="57" rx="3.6" ry="2.2" fill="${LYSROED}" opacity=".6"/>` : '';
  const ekstra = {
    super: `<path d="M46 65 L22 75 L27 84 Z" fill="#ff8a1f" stroke="#b85d0c" stroke-width="1" stroke-linejoin="round"/>
             <path d="M32 75 l1.6 3 M38 71.5 l1.4 2.6" stroke="#b85d0c" stroke-width="1.2" stroke-linecap="round"/>
             <path d="M24.5 79.5 l-9 -6 M24.5 79.5 l-10.5 1 M24.5 79.5 l-6 7.5" stroke="#3f9c43" stroke-width="2.8" stroke-linecap="round"/>
             <g class="alfie-hjerter" fill="#ef6b8a"><path d="M86 14 c0 -4 6 -4 6 0 c0 -4 6 -4 6 0 c0 5 -6 8 -6 10 c0 -2 -6 -5 -6 -10z"/>
             <path d="M100 32 c0 -3 4.5 -3 4.5 0 c0 -3 4.5 -3 4.5 0 c0 3.8 -4.5 6 -4.5 7.5 c0 -1.5 -4.5 -3.7 -4.5 -7.5z"/></g>`,
    sover: `<g class="alfie-zzz" fill="${MORK}" font-family="system-ui, sans-serif" font-weight="800">
             <text x="74" y="26" font-size="12">z</text><text x="84" y="16" font-size="15">z</text><text x="96" y="8" font-size="18">Z</text></g>`,
    venter: `<g transform="translate(6 96) rotate(-20)"><path d="M0 0 l14 -4 l-12 10z" fill="#f08a24"/>
             <path d="M12 -4 l6 -6 M13 -3 l8 -2 M12 -4 l3 -8" stroke="#4caf50" stroke-width="2" stroke-linecap="round"/></g>`,
    glad: ''
  }[hvordan];
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <ellipse cx="62" cy="104" rx="40" ry="5" fill="#000" opacity=".08"/>
    <g class="alfie-krop">
      <ellipse cx="68" cy="80" rx="36" ry="24" fill="${ORANGE}"/>
      <circle cx="102" cy="74" r="8" fill="${LYS}"/>
      <ellipse cx="88" cy="100" rx="13" ry="5" fill="${ORANGE}"/>
      <ellipse cx="40" cy="98" rx="7" ry="5" fill="${LYS}"/>
      <ellipse cx="55" cy="99" rx="7" ry="5" fill="${LYS}"/>
      ${P.kappe}
      <g class="alfie-hoved">
        <ellipse cx="37" cy="25" rx="6.5" ry="11.5" fill="${ORANGE}" transform="rotate(-14 37 25)"/>
        <ellipse cx="37" cy="26" rx="3" ry="7" fill="${LYSROED}" opacity=".7" transform="rotate(-14 37 26)"/>
        <ellipse cx="56" cy="24" rx="6.5" ry="11.5" fill="${ORANGE}" transform="rotate(12 56 24)"/>
        <ellipse cx="56" cy="25" rx="3" ry="7" fill="${LYSROED}" opacity=".7" transform="rotate(12 56 25)"/>
        ${manke}
        <circle cx="46" cy="53" r="18.5" fill="${ORANGE}"/>
        <path d="M38 36 q8 -6 16 0 q-8 3 -16 0z" fill="${MANKE}"/>
        <ellipse cx="46" cy="61" rx="9.5" ry="6.5" fill="${LYS}"/>
        ${kinder}
        ${oejne}
        <path d="M43.3 57.2 h5.4 l-2.7 3.2z" fill="${LYSROED}"/>
        ${mund}
        <path d="M36 60 h-10 M36 62.5 l-9 3 M56 60 h10 M56 62.5 l9 3" stroke="${MORK}" stroke-width=".7" opacity=".45"/>
        ${P.hals}
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
    ${ekstra}
  </svg>`;
}

// ---------- Tanken Tut – en fredelig tank, der kun skyder med konfetti ----------
function tankSvg(hvordan, pynt) {
  const P = pyntDele('tank', pynt, hvordan);
  const GROEN = '#6a9f4b', LYS = '#86bb63', MORK = '#2f3a24';
  const vinkel = { venter: 14, glad: -6, super: -30, sover: 20 }[hvordan];
  const oejne = {
    venter: `<circle cx="51" cy="51" r="6.5" fill="#fff"/><circle cx="67" cy="51" r="6.5" fill="#fff"/>
             <circle cx="53" cy="53" r="3" fill="${MORK}"/><circle cx="69" cy="53" r="3" fill="${MORK}"/>`,
    glad: `<circle cx="51" cy="50" r="6.5" fill="#fff"/><circle cx="67" cy="50" r="6.5" fill="#fff"/>
           <circle cx="52" cy="49" r="3.2" fill="${MORK}"/><circle cx="68" cy="49" r="3.2" fill="${MORK}"/>`,
    super: `<path d="M46 52 q5 -7 10 0 M62 52 q5 -7 10 0" stroke="${MORK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`,
    sover: `<path d="M46 51 q5 4 10 0 M62 51 q5 4 10 0" stroke="${MORK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  }[hvordan];
  const mund = hvordan === 'venter'
    ? `<path d="M55 61 h8" stroke="${MORK}" stroke-width="1.8" stroke-linecap="round"/>`
    : hvordan === 'sover' ? `<circle cx="59" cy="61" r="1.8" fill="${MORK}"/>`
    : `<path d="M53 59 q6 5 12 0" stroke="${MORK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  const konfetti = ['#ef6b8a', '#ffd34d', '#7aa5f5', '#a990ff', '#5cc3a3', '#f2a45a'];
  const ekstra = {
    super: `<g class="alfie-hjerter">${[[104, 14], [112, 26], [96, 6], [116, 8], [100, 24], [88, 12], [110, 2]].map(([x, y], i) =>
      i % 2 ? `<rect x="${x}" y="${y}" width="5" height="3" rx="1" fill="${konfetti[i % 6]}" transform="rotate(${i * 40} ${x} ${y})"/>`
        : `<circle cx="${x}" cy="${y}" r="2.6" fill="${konfetti[i % 6]}"/>`).join('')}</g>`,
    sover: `<g class="alfie-zzz" fill="${MORK}" font-family="system-ui, sans-serif" font-weight="800">
             <text x="86" y="30" font-size="12">z</text><text x="96" y="18" font-size="15">z</text><text x="106" y="6" font-size="18">Z</text></g>`,
    venter: `<text x="20" y="40" font-size="16" font-weight="800" fill="${MORK}" font-family="system-ui, sans-serif" opacity=".55">?</text>`,
    glad: ''
  }[hvordan];
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <ellipse cx="62" cy="104" rx="46" ry="5" fill="#000" opacity=".08"/>
    <g class="alfie-krop">
      ${P.kappe}
      <rect x="16" y="78" width="92" height="22" rx="11" fill="#4b4f55"/>
      ${[28, 44, 60, 76, 92].map(x => `<circle cx="${x}" cy="89" r="6.5" fill="#9aa0a8"/><circle cx="${x}" cy="89" r="2.2" fill="#4b4f55"/>`).join('')}
      <path d="M20 80 L30 64 L96 64 L106 80 Z" fill="${GROEN}"/>
      <path d="M38 72 l3 6 l6 1 l-4.5 4 l1.2 6 l-5.7 -3 l-5.7 3 l1.2 -6 l-4.5 -4 l6 -1z" fill="#ffd34d" transform="translate(48 -6) scale(.7)"/>
      ${P.hals}
      <g class="alfie-hoved">
        <g transform="rotate(${vinkel} 80 50)"><rect x="78" y="46" width="34" height="8" rx="3" fill="#5b8a3e"/><rect x="108" y="44" width="7" height="12" rx="2" fill="#4c7834"/></g>
        <ellipse cx="59" cy="54" rx="26" ry="16" fill="${LYS}"/>
        <ellipse cx="59" cy="39" rx="9" ry="4" fill="${GROEN}"/>
        ${hvordan === 'sover' ? `<path d="M49 39 q10 -16 22 -2 z" fill="#5b7bd6"/><circle cx="74" cy="36" r="3" fill="#fff"/>` : ''}
        ${oejne}
        ${mund}
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
    ${ekstra}
  </svg>`;
}

// ---------- Raketten Rolf ----------
function raketSvg(hvordan, pynt) {
  const P = pyntDele('raket', pynt, hvordan);
  const ROED = '#e5484d', MORK = '#2b3442';
  const oejne = {
    venter: `<circle cx="55" cy="48" r="3" fill="${MORK}"/><circle cx="65" cy="48" r="3" fill="${MORK}"/>`,
    glad: `<circle cx="55" cy="47" r="3.2" fill="${MORK}"/><circle cx="65" cy="47" r="3.2" fill="${MORK}"/><circle cx="56" cy="46" r="1" fill="#fff"/><circle cx="66" cy="46" r="1" fill="#fff"/>`,
    super: `<path d="M51 48 q4 -6 8 0 M61 48 q4 -6 8 0" stroke="${MORK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sover: `<path d="M51 47 q4 4 8 0 M61 47 q4 4 8 0" stroke="${MORK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  }[hvordan];
  const mund = hvordan === 'venter' ? `<path d="M57 54 h6" stroke="${MORK}" stroke-width="1.6" stroke-linecap="round"/>`
    : hvordan === 'sover' ? '' : `<path d="M55 53 q5 4 10 0" stroke="${MORK}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
  const flamme = {
    venter: `<g fill="#cfd5dd" opacity=".9"><circle cx="44" cy="99" r="5"/><circle cx="76" cy="99" r="5"/><circle cx="36" cy="101" r="3.5"/></g>`,
    glad: `<path class="raket-flamme" d="M51 87 q9 20 18 0 z" fill="#ffb02e"/><path d="M55 87 q5 10 10 0 z" fill="#fff3b0"/>`,
    super: `<path class="raket-flamme" d="M48 86 q12 30 24 0 z" fill="#ff7a1a"/><path d="M53 86 q7 18 14 0 z" fill="#ffd34d"/>
            <g class="alfie-hjerter" fill="#ffd34d"><path d="M18 20 l2 5 l5 .5 l-4 3.5 l1.2 5 l-4.2 -2.7 l-4.2 2.7 l1.2 -5 l-4 -3.5 l5 -.5z"/>
            <path d="M98 34 l1.5 3.8 l3.8 .4 l-3 2.6 l.9 3.8 l-3.2 -2 l-3.2 2 l.9 -3.8 l-3 -2.6 l3.8 -.4z"/><circle cx="104" cy="12" r="2"/><circle cx="24" cy="50" r="1.6"/></g>`,
    sover: `<path d="M98 14 a10 10 0 1 0 8 16 a8 8 0 1 1 -8 -16z" fill="#ffd34d"/>
            <g class="alfie-zzz" fill="${MORK}" font-family="system-ui, sans-serif" font-weight="800">
            <text x="78" y="44" font-size="11">z</text><text x="86" y="56" font-size="9">z</text></g>`
  }[hvordan];
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <ellipse cx="60" cy="106" rx="34" ry="4" fill="#000" opacity=".08"/>
    <g class="alfie-krop">
      ${P.kappe}
      ${flamme}
      <path d="M42 62 L26 88 L44 82 Z" fill="${ROED}"/><path d="M78 62 L94 88 L76 82 Z" fill="${ROED}"/>
      <path d="M60 6 C80 22 82 52 78 84 L42 84 C38 52 40 22 60 6 Z" fill="#f4f5f8" stroke="#c9ccd3" stroke-width="1.5"/>
      <path d="M60 6 C69 13 74 21 76 28 L44 28 C46 21 51 13 60 6 Z" fill="${ROED}"/>
      <rect x="50" y="84" width="20" height="5" rx="2" fill="#5a6b7d"/>
      <circle cx="47" cy="74" r="2" fill="#c9ccd3"/><circle cx="73" cy="74" r="2" fill="#c9ccd3"/>
      ${P.hals}
      <g class="alfie-hoved">
        <circle cx="60" cy="49" r="13" fill="#9fd0ff" stroke="#5a6b7d" stroke-width="3"/>
        ${oejne}
        ${mund}
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
  </svg>`;
}

// Fælles ansigtsdele til de nye makkere (øjne/mund efter humør), centreret i (cx, cy)
function ansigt(hvordan, cx, cy, af = 7, farve = '#2b3442') {
  const o = {
    venter: `<circle cx="${cx - af}" cy="${cy}" r="3" fill="${farve}"/><circle cx="${cx + af}" cy="${cy}" r="3" fill="${farve}"/>`,
    glad: `<circle cx="${cx - af}" cy="${cy - 1}" r="3.3" fill="${farve}"/><circle cx="${cx + af}" cy="${cy - 1}" r="3.3" fill="${farve}"/>
           <circle cx="${cx - af + 1}" cy="${cy - 2}" r="1" fill="#fff"/><circle cx="${cx + af + 1}" cy="${cy - 2}" r="1" fill="#fff"/>`,
    super: `<path d="M${cx - af - 4} ${cy + 1} q4 -6 8 0 M${cx + af - 4} ${cy + 1} q4 -6 8 0" stroke="${farve}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    sover: `<path d="M${cx - af - 4} ${cy} q4 4 8 0 M${cx + af - 4} ${cy} q4 4 8 0" stroke="${farve}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`
  }[hvordan];
  const m = hvordan === 'venter' ? `<path d="M${cx - 3} ${cy + 9} h6" stroke="${farve}" stroke-width="1.8" stroke-linecap="round"/>`
    : hvordan === 'sover' ? `<circle cx="${cx}" cy="${cy + 9}" r="1.8" fill="${farve}"/>`
    : hvordan === 'super' ? `<path d="M${cx - 6} ${cy + 7} q6 8 12 0 z" fill="${farve}"/>`
    : `<path d="M${cx - 5} ${cy + 7} q5 5 10 0" stroke="${farve}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
  return o + m;
}
const ZZZ = (x, y, farve = '#2b3442') => `<g class="alfie-zzz" fill="${farve}" font-family="system-ui, sans-serif" font-weight="800">
  <text x="${x}" y="${y}" font-size="11">z</text><text x="${x + 9}" y="${y - 11}" font-size="14">z</text><text x="${x + 19}" y="${y - 23}" font-size="17">Z</text></g>`;
const KONFETTI = (pkt) => `<g class="alfie-hjerter">${pkt.map(([x, y], i) => i % 2
  ? `<rect x="${x}" y="${y}" width="5" height="3" rx="1" fill="${['#ef6b8a', '#ffd34d', '#7aa5f5', '#a990ff', '#5cc3a3', '#f2a45a'][i % 6]}" transform="rotate(${i * 37} ${x} ${y})"/>`
  : `<circle cx="${x}" cy="${y}" r="2.4" fill="${['#ef6b8a', '#ffd34d', '#7aa5f5', '#a990ff', '#5cc3a3', '#f2a45a'][i % 6]}"/>`).join('')}</g>`;

// ---------- Globussen Gløbe – kan alle lande (næsten) ----------
function globusSvg(hvordan, pynt) {
  const P = pyntDele('globus', pynt, hvordan);
  const flag = (x, y, a, b) => `<g transform="translate(${x} ${y})"><path d="M0 0 v16" stroke="#7a5b2e" stroke-width="1.4"/><rect x="0.7" y="0" width="12" height="8" fill="${a}"/><rect x="0.7" y="3" width="12" height="2" fill="${b}"/></g>`;
  const ekstra = {
    super: `<g class="alfie-hjerter">${flag(4, 8, '#c8102e', '#fff')}${flag(100, 4, '#0052b4', '#ffd34d')}${flag(106, 34, '#009246', '#fff')}${flag(8, 40, '#ffd34d', '#c8102e')}</g>`,
    sover: ZZZ(88, 34),
    venter: `<text x="96" y="30" font-size="16" font-weight="800" fill="#2b3442" font-family="system-ui, sans-serif" opacity=".55">?</text>`,
    glad: ''
  }[hvordan];
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <ellipse cx="60" cy="106" rx="26" ry="4" fill="#000" opacity=".08"/>
    <g class="alfie-krop">
      ${P.kappe}
      <path d="M44 104 h32 l-4 -8 h-24 z" fill="#c9a227"/><rect x="57" y="84" width="6" height="13" fill="#c9a227"/>
      ${P.hals}
      <path d="M26 46 a34 34 0 0 0 58 30" stroke="#c9a227" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <g class="alfie-hoved">
        <circle cx="58" cy="48" r="30" fill="#4aa3df"/>
        <g class="globus-land" fill="#5cb85c">
          <path d="M36 32 q8 -8 18 -4 q4 6 -2 10 q-6 2 -6 8 q-6 2 -10 -4 q-4 -6 0 -10z"/>
          <path d="M66 22 q10 0 14 8 q-2 6 -8 6 q-4 4 -2 10 q-6 4 -10 -2 q0 -8 -4 -12 q2 -8 10 -10z"/>
          <path d="M44 62 q8 -2 12 4 q2 8 -6 10 q-8 -2 -6 -14z"/>
          <path d="M74 58 q8 0 8 8 q-6 6 -12 2 q0 -6 4 -10z"/>
        </g>
        <circle cx="58" cy="48" r="30" fill="none" stroke="#2f7fb8" stroke-width="2"/>
        ${hvordan === 'sover' ? `<path d="M40 22 q18 -24 36 -2 z" fill="#5b7bd6"/><circle cx="78" cy="19" r="3.5" fill="#fff"/>` : ''}
        <g>${ansigt(hvordan, 58, 46, 9, '#1d2a3a')}</g>
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
    ${ekstra}
  </svg>`;
}

// ---------- Fodbolden Bobby ----------
function fodboldSvg(hvordan, pynt) {
  const P = pyntDele('fodbold', pynt, hvordan);
  const MORK = '#2b3442';
  const ekstra = {
    super: `<g class="alfie-hjerter"><text x="78" y="22" font-size="17" font-weight="900" fill="#e5484d" font-family="system-ui, sans-serif">MÅL!</text></g>${KONFETTI([[12, 12], [24, 24], [100, 40], [8, 36], [110, 30], [30, 6]])}`,
    sover: ZZZ(84, 40),
    venter: '',
    glad: ''
  }[hvordan];
  const net = hvordan === 'super'
    ? `<g stroke="#c9ccd3" stroke-width="1" opacity=".9">${[20, 32, 44, 56, 68, 80, 92].map(x => `<path d="M${x} 30 V98"/>`).join('')}${[30, 42, 54, 66, 78, 90].map(y => `<path d="M20 ${y} H92"/>`).join('')}</g>
       <path d="M18 98 V28 H94 V98" stroke="#fff" stroke-width="4" fill="none"/><path d="M18 98 V28 H94 V98" stroke="#c9ccd3" stroke-width="1" fill="none"/>` : '';
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <path d="M0 100 q60 -8 120 0 v12 H0z" fill="#7cc36b"/>
    ${net}
    <ellipse cx="58" cy="102" rx="24" ry="4" fill="#000" opacity=".1"/>
    <g class="alfie-krop">
      ${P.kappe}
      <g class="alfie-hoved">
        <circle cx="58" cy="68" r="30" fill="#fff" stroke="#c9ccd3" stroke-width="1.5"/>
        <path d="M58 40 l10 7 -4 12 h-12 l-4 -12z" fill="${MORK}" opacity=".9"/>
        <path d="M30 60 l8 -3 4 9 -6 7 -7 -3z M86 60 l-8 -3 -4 9 6 7 7 -3z M44 92 l3 -8 h22 l3 8 q-14 6 -28 0z" fill="${MORK}" opacity=".85"/>
        <g transform="translate(0 6)">${ansigt(hvordan, 58, 66, 9)}</g>
        ${P.hals}
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
    ${ekstra}
  </svg>`;
}

// ---------- Robotten Bit – kører på high fives ----------
function robotSvg(hvordan, pynt) {
  const P = pyntDele('robot', pynt, hvordan);
  const niveau = { venter: 0.2, glad: 0.6, super: 1, sover: 0.6 }[hvordan];
  const batFarve = niveau < 0.3 ? '#e5484d' : niveau < 1 ? '#f2b33d' : '#43b65a';
  const oejeFarve = hvordan === 'sover' ? '#7d8a99' : '#2ee6f0';
  const oejne = hvordan === 'super'
    ? `<path d="M44 38 q5 -6 10 0 M66 38 q5 -6 10 0" stroke="${oejeFarve}" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : hvordan === 'sover' ? `<path d="M44 37 h10 M66 37 h10" stroke="${oejeFarve}" stroke-width="3" stroke-linecap="round"/>`
    : `<rect x="44" y="31" width="10" height="${hvordan === 'venter' ? 6 : 10}" rx="2" fill="${oejeFarve}"/><rect x="66" y="31" width="10" height="${hvordan === 'venter' ? 6 : 10}" rx="2" fill="${oejeFarve}"/>`;
  const mund = hvordan === 'super' ? `<path d="M50 47 q10 8 20 0" stroke="${oejeFarve}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
    : `<g fill="${oejeFarve}" opacity="${hvordan === 'sover' ? .5 : 1}">${[50, 55, 60, 65].map((x, i) => `<rect x="${x}" y="${hvordan === 'venter' && i % 2 ? 48 : 46}" width="3.5" height="3" rx="1"/>`).join('')}</g>`;
  const ekstra = {
    super: `<g class="alfie-hjerter" fill="#ffd34d"><path d="M14 30 l8 -12 -2 9 h6 l-8 12 2 -9z"/><path d="M100 46 l7 -10 -2 8 h5 l-7 10 2 -8z"/></g>`,
    sover: ZZZ(86, 26),
    venter: '', glad: ''
  }[hvordan];
  return `<svg viewBox="0 0 120 112" class="alfie-svg alfie-${hvordan}" aria-hidden="true">
    <ellipse cx="60" cy="106" rx="26" ry="4" fill="#000" opacity=".08"/>
    <g class="alfie-krop">
      ${P.kappe}
      <rect x="44" y="92" width="12" height="12" rx="3" fill="#5a6b7d"/><rect x="64" y="92" width="12" height="12" rx="3" fill="#5a6b7d"/>
      <path d="M40 66 q-12 6 -14 ${hvordan === 'super' ? -14 : 8}" stroke="#8a9bb0" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M80 66 q12 6 14 ${hvordan === 'super' ? -14 : 8}" stroke="#8a9bb0" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="38" y="58" width="44" height="36" rx="8" fill="#a9b8c9"/>
      <rect x="49" y="66" width="22" height="12" rx="2" fill="#2b3442"/><rect x="71" y="69" width="2.5" height="6" rx="1" fill="#2b3442"/>
      <rect x="51" y="68" width="${(18 * niveau).toFixed(1)}" height="8" rx="1" fill="${batFarve}"/>
      ${P.hals}
      <g class="alfie-hoved">
        <path d="M60 18 v-8" stroke="#8a9bb0" stroke-width="3"/>
        <circle cx="60" cy="8" r="4.5" fill="${hvordan === 'super' ? '#ff4d6d' : hvordan === 'sover' ? '#7d8a99' : '#ffd34d'}" class="${hvordan === 'super' ? 'robot-lys' : ''}"/>
        <rect x="34" y="18" width="52" height="40" rx="10" fill="#c3d0de"/>
        <rect x="40" y="25" width="40" height="28" rx="6" fill="#2b3442"/>
        <circle cx="31" cy="38" r="4" fill="#8a9bb0"/><circle cx="89" cy="38" r="4" fill="#8a9bb0"/>
        ${oejne}${mund}
        ${P.hoved}
      </g>
    </g>
    ${P.pokal}
    ${ekstra}
  </svg>`;
}

// ---------- Makkere: Alfie, Tanken Tut og Raketten Rolf – barnet vælger selv (personvalg.ven) ----------
const MAKKERE = {
  alfie: {
    navn: 'Alfie', svg: alfieSvg,
    venter: (m, aften) => aften ? 'Alfie venter stadig… ' + m + ' ting mangler i dag 🥕' : 'Alfie glæder sig! Klar til at gå i gang? 🥕',
    glad: m => m === 1 ? 'Kun én ting tilbage – så får Alfie en gulerod!' : 'Godt gået! ' + m + ' ting tilbage i dag.',
    super: 'Alt er klaret! Alfie får en gulerod 🥕🧡',
    sover: 'Alt blev klaret i dag. Alfie sover sødt 💤',
    syg: 'Alfie hviler sig sammen med dig. God bedring 🤒',
    vaagner: 'Alfie vågnede lige for at danse! 💃',
    siger: ['Alfie elsker gulerødder 🥕', 'Nus mig bag ørerne!', 'Mums! 🐰', 'Alfie har den flotteste manke 🦁', 'Mums – frisk hø!', 'Alfie siger hej! 👋', 'Du er sej!']
  },
  tank: {
    navn: 'Tanken Tut', svg: tankSvg,
    venter: (m, aften) => aften ? 'Tut mangler stadig brændstof… ' + m + ' ting tilbage i dag ⛽' : 'Tut venter på brændstof ⛽ Klar til at gå i gang?',
    glad: m => m === 1 ? 'Kun én ting tilbage – så fyrer Tut konfetti af!' : 'Godt kørt! ' + m + ' ting tilbage i dag.',
    super: 'Alt er klaret! Tut fyrer konfetti af 🎊',
    sover: 'Alt blev klaret. Tut er parkeret og snorker 💤',
    syg: 'Tut holder pause i garagen sammen med dig. God bedring 🤒',
    vaagner: 'Tut vågnede lige for at fyre konfetti af! 🎊',
    siger: ['Tut tut! 📯', 'Jeg skyder kun med konfetti 🎊', 'Larvefødder er de bedste fødder', 'Fuld fart frem! (ca. 4 km/t)', 'Jeg kører på havregryn og godt humør', 'Pas på – jeg bakker! 🔙', 'Du er sej!']
  },
  raket: {
    navn: 'Raketten Rolf', svg: raketSvg,
    venter: (m, aften) => aften ? 'Rolf står stadig på rampen… ' + m + ' ting tilbage i dag 🚀' : 'Rolf står klar på rampen. 3… 2… klar til at gå i gang? 🚀',
    glad: m => m === 1 ? 'Kun én ting tilbage – så letter Rolf!' : 'Motorerne varmer op! ' + m + ' ting tilbage.',
    super: 'Alt er klaret! Rolf flyver til månen 🌙🚀',
    sover: 'Alt blev klaret. Rolf er landet og sover 💤',
    syg: 'Rolf bliver på jorden sammen med dig i dag. God bedring 🤒',
    vaagner: 'Rolf tog lige en ekstra tur rundt om månen! 🌙',
    siger: ['Houston, vi har en… god dag! 🛰️', 'Næste stop: Mars! 🔴', 'Hvem har spist min rum-is? 🍦', '10… 9… 8… åh nej, jeg glemte madpakken!', 'Jeg kører på sodavand og gode vibes', 'Du er sej!']
  },
  globus: {
    navn: 'Globussen Gløbe', svg: globusSvg,
    venter: (m, aften) => aften ? 'Gløbe venter stadig… ' + m + ' ting tilbage i dag 🌍' : 'Gløbe er klar til verdensturné! Klar til at gå i gang? 🌍',
    glad: m => m === 1 ? 'Kun én ting tilbage – så snurrer Gløbe rundt!' : 'Godt gået! ' + m + ' ting tilbage, så har du rejst jorden rundt.',
    super: 'Alt er klaret! Gløbe vifter med flag fra hele verden 🎌',
    sover: 'Alt blev klaret. Gløbe sover – det er nat på denne side af jorden 💤',
    syg: 'Gløbe holder fri sammen med dig. God bedring 🤒',
    vaagner: 'Gløbe vågnede – nu er det dag i Australien! 🦘',
    siger: ['Vidste du, at Rusland har 11 tidszoner? ⏰', 'Vatikanstaten er verdens mindste land!', 'Hvad er hovedstaden i Australien? (Canberra!) 🦘',
      'Nepals flag er det eneste, der ikke er firkantet 🇳🇵', 'Afrika har 54 lande – kan du nævne 10?', 'Canada har flest søer i hele verden 🛶',
      'Jeg bliver svimmel, når jeg snurrer 😵‍💫', 'Australien er både et land og et kontinent!']
  },
  fodbold: {
    navn: 'Fodbolden Bobby', svg: fodboldSvg,
    venter: (m, aften) => aften ? 'Bobby ligger stadig på banen… ' + m + ' ting tilbage i dag ⚽' : 'Bobby er klar til kampstart! Fløjt i fløjten? ⚽',
    glad: m => m === 1 ? 'Kun én ting tilbage – så er det MÅL!' : 'Flot afleveret! ' + m + ' ting tilbage i dag.',
    super: 'MÅÅÅL! Alt er klaret – publikum jubler 🏆',
    sover: 'Alt blev klaret. Bobby hviler sig i bolddepotet 💤',
    syg: 'Bobby sidder på bænken sammen med dig i dag. God bedring 🤒',
    vaagner: 'Bobby vågnede til forlænget spilletid! ⏱️',
    siger: ['GOOOOOL! ⚽', 'Jeg er rund – derfor ruller jeg altid videre', 'VAR har tjekket: Du er sej! 📺', 'Hvem tager straffesparket?',
      'Jeg bliver sparket hele dagen – og jeg ELSKER det', 'Ingen offside her! 🚩', 'Næste stop: VM-finalen! 🏆']
  },
  robot: {
    navn: 'Robotten Bit', svg: robotSvg,
    venter: (m, aften) => aften ? 'Bits batteri er lavt… ' + m + ' ting tilbage i dag 🔋' : 'Bit har lavt batteri 🔋 Hver ting du klarer, lader ham op!',
    glad: m => m === 1 ? 'Kun én ting tilbage – så er batteriet 100%!' : 'Batteriet lader! ' + m + ' ting tilbage.',
    super: 'Alt er klaret! Bit er fuldt opladet og danser robotdans 🤖⚡',
    sover: 'Alt blev klaret. Bit er i strømsparetilstand 💤',
    syg: 'Bit kører i hvile-tilstand sammen med dig. God bedring 🤒',
    vaagner: 'Bit genstartede lige for at lave robotdans! 🤖',
    siger: ['Bip bop! 🤖', 'Beregner… 2 + 2 = fisk. FEJL! Det er 4', 'Mit batteri kører på high fives ✋', 'Loading… 99%… stadig 99%…',
      'Jeg har ingen næse, men jeg kan lugte kage 🍰', 'Hvis det ikke virker: sluk og tænd igen', 'Jeg drømmer om elektriske får 🐑']
  }
};
const makkerFor = valg => (Object.hasOwn(MAKKERE, valg?.ven || '') ? MAKKERE[valg.ven] : MAKKERE.alfie);   // ukendte værdier (fx 'constructor') giver Alfie

// Vælg makker (barnet selv eller en voksen)
function vaelgMakker(barn, nu) {
  const grid = el('div', 'makker-valg');
  for (const [noegle, m] of Object.entries(MAKKERE)) {
    const k = knap('', 'makker' + (noegle === nu ? ' valgt' : ''), async () => {
      await saetValg(barn, 'ven', noegle);   // fra dage.js
      lukArk(); tegnAlt();
    });
    const fig = el('span', 'makker-fig');
    fig.innerHTML = m.svg('glad');
    k.append(fig, el('span', 'makker-navn', m.navn));
    k.setAttribute('aria-pressed', noegle === nu);
    grid.append(k);
  }
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Ingen makker', 'knap sekundaer-knap', async () => {
    await saetValg(barn, 'makker', false);
    lukArk(); tegnAlt();
    visStatus('Makkeren er væk. Den kan komme tilbage under Indstillinger.');
  }), knap('Luk', 'knap', () => lukArk()));
  aabnArk('Vælg din makker', grid, el('p', 'hint', 'Makkeren bliver gladere, jo mere du klarer i dag. "Ingen makker" fjerner den fra tavlen – den kan slås til igen under Indstillinger (din runde knap øverst).'), knapper);
}

// ---------- 🤖 Makkeren siger noget om det, der sker i appen (AI) ----------
// Appen finder selv emnerne (mad, vejr, pligter, dage i træk, konkurrencen, dagens gåde) – AI'en skriver kun replikken
// i makkerens stemme (Edge Function "ai", opgave 'makker' – børn må bruge den, højst 6 gange om dagen).
// Kun på barnets egen enhed. Højst 4 kald om dagen herfra, og kun når emnerne har ændret sig; 3 replikker pr. kald.
// Fejler det (intet net, loft nået, funktionen ikke opdateret), siger makkeren bare sine faste sætninger som før.
async function makkerEmner(barn, d, ialt, klaret) {
  const e = [], nu = new Date(), iso = isoDato(nu);
  const t = nu.getHours();
  e.push('Det er ' + DAGE_LANG[(nu.getDay() + 6) % 7].toLowerCase() + ' ' + (t < 10 ? 'morgen' : t < 13 ? 'formiddag' : t < 17 ? 'eftermiddag' : 'aften'));
  if (ialt) e.push(klaret === ialt ? 'Alle dagens pligter er klaret' : klaret + ' af ' + ialt + ' pligter er klaret i dag');
  const st = streak(d);
  if (st >= 2) e.push(st + ' dage i træk med alle pligter');
  try {
    const plan = await madFor(nu, barn);   // app.js
    const aften = plan.visning?.ret || plan.ret;
    if (aften && aften !== INGEN_MAD) e.push('Aftensmad i dag: ' + aften);
    const im = new Date(nu); im.setDate(im.getDate() + 1);
    // Morgendagens mad kun, når barnet selv kan se den (efter tavlen er skiftet til i morgen) – den kan nå at ændre sig
    if (isoDato(im) <= isoDato(tavleAutoDato())) {
      const p2 = await madFor(im, barn);
      if (p2.visning?.ret || p2.ret) e.push('Aftensmad i morgen: ' + (p2.visning?.ret || p2.ret));
    }
  } catch {}
  try {
    if ((await valgFor(barn)).vejr !== false && typeof hentVejr === 'function') {
      const data = await hentVejr();
      const v = data && vejrDag(data, iso);
      if (v) e.push('Vejret i dag: ' + vejrTekst(v.kode).toLowerCase() + ', ' + grader(v.min) + ' til ' + grader(v.max) + (v.regnFra != null ? ', regn fra kl. ' + v.regnFra : ''));
    }
  } catch {}
  try {
    const man = isoDato(mandagDenneUge()), son = plusDage(man, 6);
    const ugens = (await Data.list('motion')).filter(m => m.dato >= man && m.dato <= son);
    if (ugens.length) {
      const stil = DELTAGERE.map(p => ({ p, km: sum(ugens.filter(m => m.hvem === p), 'km') })).filter(x => x.km > 0).sort((a, b) => b.km - a.km);
      e.push('Ugens cykel/gå-konkurrence: ' + stil.map(x => (x.p === barn ? barn + ' (barnet selv)' : x.p) + ' ' + fmtKm(x.km)).join(', '));
    }
  } catch {}
  const sj = (await Data.list('sjov')).find(x => x.dato === iso);
  if (sj && sj.slags === 'gaade') e.push('Dagens gåde på tavlen: ' + sj.tekst);
  return e;
}
// Dagens replikker gemmes i databasen ('makker_snak', én række pr. barn – opdatering-makker.sql),
// så de voksne ser det samme som barnet. Hvilken af de 3 replikker der står i boblen, huskes kun på enheden.
const makkerI = new Map();
// Ekstra sikring (samme liste som i Edge Function'en): replikker med voksenord vises aldrig
const MAKKER_FORBUDT = /pigelørdag|drengelørdag|fest|druk|fuld\b|alkohol|(^|[^a-zæøå])øl([^a-zæøå]|$)|\bvin\b|bajer|shots?\b|tømmermænd|kæreste|forelsk|kys|date|sexy|sex|død|dræb|blod|vægt|slank|fed\b|tyk\b/i;
// Nøglen afgør, hvornår replikkerne er forældede: ændres maden (eller er alle pligter klaret), skal der nye til.
// Tid på dagen og antal klarede pligter tæller ikke med – ellers ville dagens 4 kald være brugt før frokost.
const makkerNoegle = emner => emner.filter(e => /^Aftensmad /.test(e) || e === 'Alle dagens pligter er klaret').join('|');
function makkerHuske(barn) {
  const dag = isoDato(new Date());
  const r = Data.listNu('makker_snak').filter(x => x.barn === barn).sort((a, b) => (b.dag || '').localeCompare(a.dag || '') || (b.kald || 0) - (a.kald || 0))[0];
  const i = makkerI.get(barn) || 0;
  return r && r.dag === dag ? { dag, kald: r.kald || 0, linjer: (Array.isArray(r.linjer) ? r.linjer : []).filter(l => !MAKKER_FORBUDT.test(l)), emner: r.emner || '', i, _id: r.id }
    : { dag, kald: 0, linjer: [], emner: '', i: 0, _id: r?.id };
}
async function makkerGem(barn, c) {
  makkerI.set(barn, c.i || 0);
  const felter = { barn, dag: c.dag, emner: String(c.emner || '').slice(0, 2000), linjer: c.linjer || [], kald: c.kald || 0 };
  if (c._id) await Data.stille(() => Data.update('makker_snak', c._id, felter));
  else { const r = await Data.add('makker_snak', felter); c._id = r?.id; }
}
const makkerHenter = new Map();   // barn → igangværende hentning (en ny tegning venter på den i stedet for at spørge igen)
function makkerHent(barn, m, emner) {
  if (makkerHenter.has(barn)) return makkerHenter.get(barn);
  const c = makkerHuske(barn);
  if (c.kald >= 4 || typeof Data.ai !== 'function') return Promise.resolve(null);
  const p = makkerHentNu(barn, m, emner, c);
  makkerHenter.set(barn, p);
  return p;
}
async function makkerHentNu(barn, m, emner, c) {
  try {
    c.kald++; await makkerGem(barn, c);   // tæller også, hvis AI'en fejler (så der ikke spørges igen og igen)
    const kontekst = { dato: isoDato(new Date()), ugedag: DAGE_LANG[(new Date().getDay() + 6) % 7].toLowerCase(), personer: [], kategorier: [],
      barn, makker: { navn: m.navn, eksempler: (m.siger || []).slice(0, 6) }, emner };
    const res = await Data.ai('Sig noget til ' + barn + '.', kontekst, [], null, 'makker');
    const linjer = (res?.handlinger || []).filter(h => h?.type === 'makker_replik' && String(h.tekst || '').trim())
      .map(h => String(h.tekst).replace(/\s+/g, ' ').trim().slice(0, 120)).filter(l => !MAKKER_FORBUDT.test(l)).slice(0, 3);
    if (!linjer.length) return null;
    const ny = { ...makkerHuske(barn), linjer, i: 0, emner: makkerNoegle(emner) };
    await makkerGem(barn, ny);
    return linjer[0];
  } catch (e) { console.warn('Makker:', e.message || e); return null; }
  finally { makkerHenter.delete(barn); }
}

// Kort til børnetavlen: makkeren bliver gladere, jo flere af dagens pligter der er klaret
async function alfieKort(barn) {
  const nu = new Date();
  const iso = isoDato(nu);
  const d = await pligtData(barn);
  const liste = skalKlares(dagensOpgaver(d));   // bonus-pligter tæller ikke med
  // Kun pligter tæller – rutiner er en guide, som ikke skal registreres
  const ialt = liste.length, klaret = liste.filter(r => r.f).length;
  if (!d.opgaver.length) return null;   // barnet har slet ingen pligter – så ingen makker
  const valg = await valgFor(barn);   // fra dage.js
  if (valg.makker === false) return null;   // slået fra (Indstillinger eller "Skift makker")
  const m = makkerFor(valg);
  const syg = sygDen(d.kalender || [], iso, barn);
  const mangler = ialt - klaret;
  const aften = nu.getHours() >= 20;
  // Ingen pligter i dag (fx weekend): makkeren hygger sig bare
  const hvordan = syg ? 'sover' : !ialt ? (aften ? 'sover' : 'glad') : !mangler ? (aften && Date.now() > alfieFestTil ? 'sover' : 'super') : klaret ? 'glad' : 'venter';
  // Efter kl. 21 skælder makkeren ikke ud – i morgen er en ny dag
  const sent = nu.getHours() >= 21;
  const tekst = syg ? m.syg : !ialt ? (aften ? 'Ingen pligter i dag. Godnat 💤' : 'Ingen pligter i dag – nyd det! 😎')
    : sent && mangler ? 'Godnat! ' + m.navn + ' gemmer resten til i morgen 💤'
    : hvordan === 'venter' ? m.venter(mangler, aften) : hvordan === 'glad' ? m.glad(mangler) : m[hvordan];

  const k = el('div', 'kort alfie-kort makker-' + (valg.ven || 'alfie'));
  const nv = makkerNiveau(d);
  const figur = el('button', 'alfie-figur');
  figur.type = 'button';
  figur.setAttribute('aria-label', m.navn);
  figur.innerHTML = m.svg(hvordan, nv.pynt);
  const boble = el('div', 'alfie-boble', tekst);
  boble.setAttribute('aria-live', 'polite');
  // AI-replikker – ikke når makkeren sover/er syg. Barnets egen enhed henter nye, når emnerne ændrer sig;
  // en voksen, der kigger på tavlen, ser de samme replikker (og henter kun, hvis der slet ingen er i dag)
  const egen = loggetIndBarn() === barn;
  const egenAI = (egen || erVoksen()) && hvordan !== 'sover' && !syg;
  if (egenAI) {
    // Passer replikkerne stadig (samme emner), står den aktuelle i boblen; ellers bedes om nye i baggrunden.
    // Indtil da (og hvis dagens kald er brugt) står den almindelige status ("2 ting tilbage …")
    // Replikkerne vises kun, hvis de stadig passer (fx samme aftensmad). Er maden ændret, hentes nye;
    // kan der ikke hentes flere i dag, står den almindelige status i stedet for en forældet replik.
    makkerEmner(barn, d, ialt, klaret).then(async emner => {
      const c = makkerHuske(barn);
      if (makkerNoegle(emner) === c.emner && c.linjer.length) { boble.textContent = c.linjer[c.i] || c.linjer[0]; return; }
      const l = await makkerHent(barn, m, emner);
      if (l) boble.textContent = l;
    });
  }
  figur.addEventListener('click', async () => {
    if (hvordan === 'sover') {
      // Sovende makker vågner et øjeblik og fester
      figur.innerHTML = m.svg('super', nv.pynt);
      boble.textContent = m.vaagner;
      clearTimeout(figur._timer);
      figur._timer = setTimeout(() => { figur.innerHTML = m.svg('sover', nv.pynt); boble.textContent = tekst; }, 5000);
      return;
    }
    figur.classList.remove('vip'); void figur.offsetWidth; figur.classList.add('vip');
    // Barnets egen tavle: næste AI-replik om det, der sker (og en ny omgang, når de er brugt) – ellers en fast sætning
    if (egenAI) {
      const c = makkerHuske(barn);
      if (c.linjer.length && c.i + 1 < c.linjer.length) { c.i++; makkerI.set(barn, c.i); boble.textContent = c.linjer[c.i]; return; }
      if (c.kald < 4 && !makkerHenter.has(barn)) {
        boble.textContent = '…';
        const l = await makkerHent(barn, m, await makkerEmner(barn, d, ialt, klaret));
        boble.textContent = l || m.siger[Math.floor(Math.random() * m.siger.length)];
        return;
      }
    }
    boble.textContent = m.siger[Math.floor(Math.random() * m.siger.length)];
  });
  // Pynten tegnes ind i makkeren (pyntDele) – alt det, barnet har fået, sidder på den
  const figurBoks = el('div', 'makker-figur-boks');
  figurBoks.append(figur);
  const hoejre = el('div', 'alfie-hoejre');
  hoejre.append(boble, ialt ? fremskridt(klaret / ialt) : '');
  hoejre.append(el('p', 'makker-niveau', (nv.niveau ? 'Niveau ' + (nv.niveau + 1) + ' ' + nv.pynt.join('') : 'Niveau 1')
    + (nv.naeste ? ' · ' + (nv.naeste[0] - nv.dage) + (nv.naeste[0] - nv.dage === 1 ? ' dag' : ' dage') + ' til ' + nv.naeste[1] : '')));
  // Nyt pynt siden sidst (husket på enheden) → fest
  if (loggetIndBarn() === barn) {
    const noegle = 'makker-niveau-' + barn, foer = lokal.get(noegle);
    lokal.set(noegle, String(nv.niveau));
    if (foer !== null && nv.niveau > Number(foer) && nv.sidste) setTimeout(() => fejr(m.navn + ' har fået ' + nv.sidste[2] + '! ' + nv.sidste[1]), 1500);
  }
  const s = streak(d);
  const bund = el('div', 'makker-bund');
  bund.append(s >= 2 ? el('span', 'streak', streakTekst(s)) : el('span'),
    knap('Skift makker', 'lille-knap makker-skift', () => vaelgMakker(barn, valg.ven || 'alfie')));
  hoejre.append(bund);
  k.append(figurBoks, hoejre);
  return k;
}

// ---------- Nedtælling på børnetavlen ----------
// Regnes ud fra fødselsdage, kalenderens ferie/fri og udvalgte festdage – gemmer intet nyt.
// Barnet (eller en voksen) kan slå den fra under Kalender → Tilpas (personvalg.nedtaelling).
const NEDTAEL_FEST = { 'Fastelavn': 'maerkedage', 'Påskedag': 'helligdage', 'Halloween': 'maerkedage', 'Juleaften': 'helligdage', 'Nytårsaften': 'maerkedage' };
const NEDTAEL_DAGE = 120;   // hvor langt frem (egen fødselsdag vises altid)
const genitiv = n => (/[sxz]$/i.test(n) ? n + "'" : n + 's');
async function nedtaellingKort(barn) {
  const valg = await valgFor(barn);
  if (valg.nedtaelling === false) return null;
  const idag = new Date(); idag.setHours(0, 0, 0, 0);
  const dageTil = d => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - idag) / 86400000);
  const ting = [];

  // Fødselsdage i familien (og Alfies)
  const familie = [...PERSONER.filter(p => p !== 'Fælles'), 'Alfie'];
  for (const f of await foedselsListe(barn)) {   // fra familie.js
    if (!f.dato || f.aarsdag || f.minde) continue;
    const hvem = f.bruger || (f.navn || '').trim().split(/\s+/)[0];
    if (!familie.includes(hvem)) continue;
    const d = naesteGang(f, idag);
    const alder = alderPaa(f, d);
    const egen = hvem === barn;
    ting.push({ n: dageTil(d), egen, ikon: egen ? '🎂' : hvem === 'Alfie' ? '🐰' : '🎁',
      tekst: egen ? 'din fødselsdag' + (alder > 0 ? ' – du fylder ' + alder : '') : genitiv(hvem) + ' fødselsdag' });
  }

  // Festdage (efter barnets valg)
  for (const navn of Object.keys(NEDTAEL_FEST)) {
    if (!valg[NEDTAEL_FEST[navn]]) continue;
    const x = [...aaretsDage(idag.getFullYear()), ...aaretsDage(idag.getFullYear() + 1)]
      .find(x => x.navn === navn && x.iso >= isoDato(idag));
    if (x) ting.push({ n: dageTil(new Date(x.iso + 'T00:00')), ikon: x.ikon, tekst: navn.toLowerCase() });
  }

  // Ferie/fri fra kalenderen (ikke sygdom o.l. og ikke voksen-aftaler)
  const aftaler = (await kalenderAftaler()).filter(a => a.fri && !FRAVAER[a.type] && !a._voksne && !a._privat);
  const set = new Set();
  for (let i = 0; i <= NEDTAEL_DAGE && set.size < 2; i++) {
    const d = new Date(idag); d.setDate(d.getDate() + i);
    const iso = isoDato(d);
    for (const a of aftalerDen(aftaler, iso, [barn, 'Fælles'])) {
      if (forekomstStart(a, iso) !== iso || set.has(a.titel)) continue;
      set.add(a.titel);
      // "til efterårsferie" med lille e (navne som "Legoland" beholder stort bogstav)
      const lille = /ferie$|^fri/i.test(a.titel.trim()) ? a.titel.trim()[0].toLowerCase() + a.titel.trim().slice(1) : a.titel;
      ting.push({ n: i, ikon: '😎', tekst: lille });
    }
  }

  ting.sort((a, b) => a.n - b.n);
  let vis = ting.filter(t => t.n <= NEDTAEL_DAGE).slice(0, 3);
  const egen = ting.find(t => t.egen);
  if (egen && !vis.includes(egen)) vis = [...vis.slice(0, 2), egen];
  if (!vis.length) return null;

  const k = el('div', 'kort nedtael-kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Nedtælling ⏳'));
  const ul = el('ul', 'nedtael-liste');
  for (const t of vis) {
    const li = el('li', t.egen ? 'egen' : '');
    const tal = el('span', 'nt-tal');
    if (t.n === 0) tal.append(el('b', null, t.ikon));
    else tal.append(el('b', null, String(t.n)), el('small', null, t.n === 1 ? 'dag' : 'dage'));
    const tekst = t.n === 0 ? 'I dag: ' + t.tekst + '! 🎉' : 'til ' + t.tekst + ' ' + t.ikon;
    li.append(tal, el('span', 'nt-tekst', tekst));
    ul.append(li);
  }
  k.append(top, ul);
  const f = vis.slice().sort((a, b) => a.n - b.n)[0];
  k.tavle = { noegle: 'nedtaelling', ikon: '⏳', titel: 'Nedtælling', stor: f.n === 0 ? 'I dag! 🎉' : f.n === 1 ? 'I morgen' : f.n + ' dage',
    lille: (f.n <= 1 ? 'er det ' : 'til ') + f.tekst + ' ' + f.ikon };   // "I morgen er det efterårsferie" / "6 dage til halloween"
  return k;
}


// ---------- 🧩 Dagens sjove: gåde, vits, "vidste du" eller en lille udfordring på drengenes tavle ----------
// Data: 'sjov' {dato, slags: 'gaade'|'vits'|'vidste'|'udfordring', tekst, loesning?} – samme indslag til begge drenge (så kan de snakke om det).
// Laves af AI'en (Edge Function "ai", opgave 'sjov') 14 dage ad gangen: når en voksen åbner appen, og der er under 4 dage tilbage.
// Højst ét forsøg pr. dag pr. enhed. Kan slås fra pr. barn (personvalg.sjov). Gamle indslag (over 30 dage) ryddes væk.
const SJOV_SLAGS = { gaade: ['🧩', 'Dagens gåde'], vits: ['😂', 'Dagens vits'], vidste: ['🤓', 'Vidste du?'], udfordring: ['💪', 'Dagens udfordring'] };
async function sjovKort(barn, iso) {
  if ((await valgFor(barn)).sjov === false) return null;
  const x = (await Data.list('sjov')).find(s => s.dato === iso && s.tekst);
  if (!x) return null;
  const [ikon, titel] = SJOV_SLAGS[x.slags] || SJOV_SLAGS.vits;
  const k = el('div', 'kort sjov-kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', titel + ' ' + ikon));
  k.append(top, el('p', 'sjov-tekst', x.tekst));
  if (x.loesning) {
    const svar = el('p', 'sjov-svar', x.loesning);
    svar.hidden = true;
    const vis = knap(x.slags === 'gaade' ? '🤔 Se svaret' : 'Se pointen', 'lille-knap sjov-vis', () => { svar.hidden = false; vis.remove(); });
    k.append(vis, svar);
  }
  k.tavle = { noegle: 'sjov', ikon, titel, linjer: [x.tekst.length > 90 ? x.tekst.slice(0, 88).replace(/\s+\S*$/, '') + ' …' : x.tekst],
    lille: x.loesning ? (x.slags === 'gaade' ? 'Tryk for at se svaret' : 'Tryk for pointen') : '' };
  return k;
}
let sjovHenter = false;
async function sjovFyldOp() {
  if (sjovHenter || Data.bruger()?.rolle !== 'voksen' || typeof Data.ai !== 'function') return;
  if (!BOERN.some(b => Data.listNu('personvalg').find(p => p.navn === b)?.sjov !== false)) return;   // slået fra for alle børn
  const idag = isoDato(new Date());
  const alle = await Data.list('sjov');
  const gamle = alle.filter(s => s.dato < plusDage(idag, -30)).map(s => s.id);
  if (gamle.length) await Data.stille(() => Data.removeMange('sjov', gamle));
  if (alle.filter(s => s.dato >= idag).length >= 4) return;
  if (lokal.get('sjov-forsoeg') === idag) return;
  lokal.set('sjov-forsoeg', idag);
  sjovHenter = true;
  try {
    const d0 = new Date();
    const kontekst = { dato: idag, ugedag: DAGE_LANG[(d0.getDay() + 6) % 7].toLowerCase(), personer: [], kategorier: [],
      seneste: [...alle].sort((a, b) => (b.dato || '').localeCompare(a.dato || '')).slice(0, 40).map(s => String(s.tekst || '').slice(0, 80)) };
    const res = await Data.ai('Lav 14 nye indslag.', kontekst, [], null, 'sjov');
    const nye = (res?.handlinger || []).filter(h => h?.type === 'sjov_ny' && String(h.tekst || '').trim()).slice(0, 14);
    const brugt = new Set(alle.map(s => s.dato));
    let d = idag;
    const rows = [];
    for (const h of nye) {
      while (brugt.has(d)) d = plusDage(d, 1);
      brugt.add(d);
      const loesning = String(h.loesning || '').replace(/\s+/g, ' ').trim().slice(0, 200);
      rows.push({ dato: d, slags: SJOV_SLAGS[h.slags] ? h.slags : 'vits', tekst: String(h.tekst).replace(/\s+/g, ' ').trim().slice(0, 240), ...(loesning ? { loesning } : {}) });
    }
    if (rows.length) { await Data.stille(() => Data.addMange('sjov', rows)); tegnAlt(); }
  } catch (e) { console.warn('Dagens sjove:', e); }
  finally { sjovHenter = false; }
}

// ---------- 🚴 Ugens konkurrence på tavlen ----------
// Vises, når nogen har skrevet km i denne uge – så de andre kan se, at konkurrencen er i gang. barn = null: Familien (voksne).
async function konkKort(barn) {
  if (barn && (await valgFor(barn)).konk === false) return null;
  const man = isoDato(mandagDenneUge()), son = plusDage(man, 6);
  const ugens = (await Data.list('motion')).filter(m => m.dato >= man && m.dato <= son);
  const st = DELTAGERE.map(p => ({ hvem: p, km: sum(ugens.filter(m => m.hvem === p), 'km') })).filter(s => s.km > 0).sort((a, b) => b.km - a.km);
  if (!st.length) return null;
  const mig = barn || Data.bruger()?.navn;
  const foerst = st[0], minKm = st.find(s => s.hvem === mig)?.km || 0;
  const k = el('div', 'kort konk-kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Ugens konkurrence 🚴'), knap('Skriv km ›', 'kort-pil link-knap', () => { if (typeof lukZoom === 'function') lukZoom(); visFane('konkurrence'); window.scrollTo(0, 0); }));
  const ol = el('ol', 'konk-liste lille');
  st.slice(0, 4).forEach((s, i) => {
    const li = el('li', 'konk-raekke ' + (PK[s.hvem] || '') + (i === 0 ? ' foerer' : ''));
    const bar = el('span', 'konk-bar'); const fyld = el('span'); fyld.style.width = Math.round(100 * s.km / foerst.km) + '%'; bar.append(fyld);
    li.append(el('span', 'konk-plads', (i + 1) + '.'), el('span', 'konk-navn', s.hvem === mig && barn ? 'Dig' : s.hvem), bar, el('span', 'konk-km', fmtKm(s.km)));
    ol.append(li);
  });
  k.append(top, ol);
  if (barn && !minKm) k.append(el('p', 'hint', 'Du er ikke med endnu – en cykeltur tæller! 🚲'));
  k.tavle = { noegle: 'konk', ikon: '🚴', titel: 'Konkurrence',
    stor: foerst.hvem === mig ? 'Du fører! 🥇' : foerst.hvem + ' fører',
    lille: (minKm ? 'Dig: ' + fmtKm(minKm) + ' · ' : '') + foerst.hvem + ': ' + fmtKm(foerst.km) };
  return k;
}
