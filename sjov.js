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

const ALFIE_SIGER = ['Alfie elsker gulerødder 🥕', 'Nus mig bag ørerne!', 'Mums! 🐰', 'Alfie har den flotteste manke 🦁',
'Mums – frisk hø!', 'Alfie siger hej! 👋', 'Du er sej!'];

// Kort til børnetavlen: Alfie bliver gladere, jo mere der er klaret i dag (pligter + rutinetrin)
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
  const mangler = ialt - klaret;
  const aften = nu.getHours() >= 20;
  const hvordan = !mangler ? (aften && Date.now() > alfieFestTil ? 'sover' : 'super') : klaret ? 'glad' : 'venter';
  const tekst = {
    venter: aften ? 'Alfie venter stadig… ' + mangler + ' ting mangler i dag 🥕' : 'Alfie glæder sig! Klar til at gå i gang? 🥕',
    glad: mangler === 1 ? 'Kun én ting tilbage – så får Alfie en gulerod!' : 'Godt gået! ' + mangler + ' ting tilbage i dag.',
    super: 'Alt er klaret! Alfie får en gulerod 🥕🧡',
    sover: 'Alt blev klaret i dag. Alfie sover sødt 💤'
  }[hvordan];

  const k = el('div', 'kort alfie-kort');
  const figur = el('button', 'alfie-figur');
  figur.type = 'button';
  figur.setAttribute('aria-label', 'Alfie');
  figur.innerHTML = alfieSvg(hvordan);
  const boble = el('div', 'alfie-boble', tekst);
  boble.setAttribute('aria-live', 'polite');
  figur.addEventListener('click', () => {
    if (hvordan === 'sover') {
      // Sovende Alfie vågner et øjeblik og danser
      figur.innerHTML = alfieSvg('super');
      boble.textContent = 'Alfie vågnede lige for at danse! 💃';
      clearTimeout(figur._timer);
      figur._timer = setTimeout(() => { figur.innerHTML = alfieSvg('sover'); boble.textContent = tekst; }, 5000);
      return;
    }
    figur.classList.remove('vip'); void figur.offsetWidth; figur.classList.add('vip');
    boble.textContent = ALFIE_SIGER[Math.floor(Math.random() * ALFIE_SIGER.length)];
  });
  const hoejre = el('div', 'alfie-hoejre');
  hoejre.append(boble, fremskridt(klaret / ialt));
  const s = streak(d);
  if (s >= 2) hoejre.append(el('span', 'streak', streakTekst(s)));
  k.append(figur, hoejre);
  return k;
}
