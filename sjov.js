// sjov.js – det sjove for børnene: konfetti, Alfie (familiens kanin) og streaks.
// Bruger hjælpere fra app.js og mere.js. Gemmer intet nyt i databasen – alt regnes ud fra
// flueben (pligter) og rutinetrin (huskes på enheden).

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

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
// I dag tæller med, når den er klaret – men bryder ikke rækken, før dagen er gået.
function streak(d) {
  const daglige = d.opgaver.filter(o => !o.frivillig && !['uge', 'engang', 'interval'].includes(o.gentag));
  if (!daglige.length) return 0;
  const klaret = new Set(d.flueben.map(f => f.opgave + '|' + f.periode));
  const oprettetIso = o => (o.oprettet ? isoDato(new Date(o.oprettet)) : '0000-00-00');
  const tidligste = daglige.map(oprettetIso).sort()[0];
  let n = 0;
  const dato = new Date();
  for (let i = 0; i < 400; i++) {
    const iso = isoDato(dato);
    if (iso < tidligste) break;
    const dag = (dato.getDay() + 6) % 7;
    if (d.kalender && sygDen(d.kalender, iso, d.barn)) { dato.setDate(dato.getDate() - 1); continue; }   // sygedag: springes over
    const planlagt = daglige.filter(o => (!o.dage || !o.dage.length || o.dage.includes(dag)) && oprettetIso(o) <= iso);
    if (planlagt.length) {
      if (planlagt.every(o => klaret.has(o.id + '|' + iso))) n++;
      else if (i > 0) break;
    }
    dato.setDate(dato.getDate() - 1);
  }
  return n;
}
const streakTekst = n => '🔥 ' + n + (n === 1 ? ' dag' : ' dage') + ' i træk';

// ---------- Alfie – orange løvehoved-dværgkanin ----------
// hvordan: 'venter' | 'glad' | 'super' | 'sover'
function alfieSvg(hvordan) {
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
      </g>
    </g>
    ${ekstra}
  </svg>`;
}

// ---------- Tanken Tut – en fredelig tank, der kun skyder med konfetti ----------
function tankSvg(hvordan) {
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
      <rect x="16" y="78" width="92" height="22" rx="11" fill="#4b4f55"/>
      ${[28, 44, 60, 76, 92].map(x => `<circle cx="${x}" cy="89" r="6.5" fill="#9aa0a8"/><circle cx="${x}" cy="89" r="2.2" fill="#4b4f55"/>`).join('')}
      <path d="M20 80 L30 64 L96 64 L106 80 Z" fill="${GROEN}"/>
      <path d="M38 72 l3 6 l6 1 l-4.5 4 l1.2 6 l-5.7 -3 l-5.7 3 l1.2 -6 l-4.5 -4 l6 -1z" fill="#ffd34d" transform="translate(48 -6) scale(.7)"/>
      <g class="alfie-hoved">
        <g transform="rotate(${vinkel} 80 50)"><rect x="78" y="46" width="34" height="8" rx="3" fill="#5b8a3e"/><rect x="108" y="44" width="7" height="12" rx="2" fill="#4c7834"/></g>
        <ellipse cx="59" cy="54" rx="26" ry="16" fill="${LYS}"/>
        <ellipse cx="59" cy="39" rx="9" ry="4" fill="${GROEN}"/>
        ${hvordan === 'sover' ? `<path d="M49 39 q10 -16 22 -2 z" fill="#5b7bd6"/><circle cx="74" cy="36" r="3" fill="#fff"/>` : ''}
        ${oejne}
        ${mund}
      </g>
    </g>
    ${ekstra}
  </svg>`;
}

// ---------- Raketten Rolf ----------
function raketSvg(hvordan) {
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
      ${flamme}
      <path d="M42 62 L26 88 L44 82 Z" fill="${ROED}"/><path d="M78 62 L94 88 L76 82 Z" fill="${ROED}"/>
      <path d="M60 6 C80 22 82 52 78 84 L42 84 C38 52 40 22 60 6 Z" fill="#f4f5f8" stroke="#c9ccd3" stroke-width="1.5"/>
      <path d="M60 6 C69 13 74 21 76 28 L44 28 C46 21 51 13 60 6 Z" fill="${ROED}"/>
      <rect x="50" y="84" width="20" height="5" rx="2" fill="#5a6b7d"/>
      <circle cx="47" cy="74" r="2" fill="#c9ccd3"/><circle cx="73" cy="74" r="2" fill="#c9ccd3"/>
      <g class="alfie-hoved">
        <circle cx="60" cy="49" r="13" fill="#9fd0ff" stroke="#5a6b7d" stroke-width="3"/>
        ${oejne}
        ${mund}
      </g>
    </g>
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
  }
};
const makkerFor = valg => MAKKERE[valg?.ven] || MAKKERE.alfie;

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
  knapper.append(knap('Luk', 'knap', () => lukArk()));
  aabnArk('Vælg din makker', grid, el('p', 'hint', 'Makkeren bliver gladere, jo mere du klarer i dag.'), knapper);
}

// Kort til børnetavlen: makkeren bliver gladere, jo mere der er klaret i dag (pligter + rutinetrin)
async function alfieKort(barn) {
  const nu = new Date();
  const iso = isoDato(nu);
  const d = await pligtData(barn);
  const liste = skalKlares(dagensOpgaver(d));   // bonus-pligter tæller ikke med
  const rutiner = (await Data.list('rutiner')).filter(r => r.barn === barn && rutineAktiv(r, idagNr()));
  let ialt = liste.length, klaret = liste.filter(r => r.f).length;
  for (const r of rutiner) {
    const n = (r.trin || []).length;
    ialt += n;
    klaret += Math.min(n, hentTjek(r, iso).size);
  }
  if (!ialt) return null;
  const valg = await valgFor(barn);   // fra dage.js
  const m = makkerFor(valg);
  const syg = sygDen(d.kalender || [], iso, barn);
  const mangler = ialt - klaret;
  const aften = nu.getHours() >= 20;
  const hvordan = syg ? 'sover' : !mangler ? (aften && Date.now() > alfieFestTil ? 'sover' : 'super') : klaret ? 'glad' : 'venter';
  const tekst = syg ? m.syg : hvordan === 'venter' ? m.venter(mangler, aften) : hvordan === 'glad' ? m.glad(mangler) : m[hvordan];

  const k = el('div', 'kort alfie-kort makker-' + (valg.ven || 'alfie'));
  const figur = el('button', 'alfie-figur');
  figur.type = 'button';
  figur.setAttribute('aria-label', m.navn);
  figur.innerHTML = m.svg(hvordan);
  const boble = el('div', 'alfie-boble', tekst);
  boble.setAttribute('aria-live', 'polite');
  figur.addEventListener('click', () => {
    if (hvordan === 'sover') {
      // Sovende makker vågner et øjeblik og fester
      figur.innerHTML = m.svg('super');
      boble.textContent = m.vaagner;
      clearTimeout(figur._timer);
      figur._timer = setTimeout(() => { figur.innerHTML = m.svg('sover'); boble.textContent = tekst; }, 5000);
      return;
    }
    figur.classList.remove('vip'); void figur.offsetWidth; figur.classList.add('vip');
    boble.textContent = m.siger[Math.floor(Math.random() * m.siger.length)];
  });
  const hoejre = el('div', 'alfie-hoejre');
  hoejre.append(boble, fremskridt(klaret / ialt));
  const s = streak(d);
  const bund = el('div', 'makker-bund');
  bund.append(s >= 2 ? el('span', 'streak', streakTekst(s)) : el('span'),
    knap('Skift makker', 'lille-knap makker-skift', () => vaelgMakker(barn, valg.ven || 'alfie')));
  hoejre.append(bund);
  k.append(figur, hoejre);
  return k;
}
