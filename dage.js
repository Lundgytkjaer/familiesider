// dage.js – danske helligdage og mærkedage samt solopgang/solnedgang.
// Alt beregnes ud fra årstallet, er ens for alle familier og indeholder ingen personlige data.

// Påskedag (gregoriansk kalender, "anonym" algoritme)
function paaskedag(aar) {
  const a = aar % 19, b = Math.floor(aar / 100), c = aar % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maaned = Math.floor((h + l - 7 * m + 114) / 31), dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(aar, maaned - 1, dag);
}
const flytDage = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sidsteSoendag = (aar, maaned) => { const d = new Date(aar, maaned + 1, 0); return flytDage(d, -d.getDay()); };
const nteSoendag = (aar, maaned, n) => { const d = new Date(aar, maaned, 1); return flytDage(d, ((7 - d.getDay()) % 7) + 7 * (n - 1)); };

// hellig: true = helligdag (fri fra skole og de fleste arbejdspladser)
const DAGE_CACHE = {};
function aaretsDage(aar) {
  if (DAGE_CACHE[aar]) return DAGE_CACHE[aar];
  const p = paaskedag(aar);
  const d = (m, dag) => new Date(aar, m - 1, dag);
  const jul = d(12, 25);
  const liste = [
    [d(1, 1), 'Nytårsdag', '🎆', true],
    [flytDage(p, -49), 'Fastelavn', '🎭'],
    [d(2, 14), 'Valentinsdag', '❤️'],
    [sidsteSoendag(aar, 2), 'Sommertid – stil uret 1 time frem', '⏰'],
    [flytDage(p, -7), 'Palmesøndag', '🌿'],
    [flytDage(p, -3), 'Skærtorsdag', '🐣', true],
    [flytDage(p, -2), 'Langfredag', '🐣', true],
    [p, 'Påskedag', '🐣', true],
    [flytDage(p, 1), '2. påskedag', '🐣', true],
    [d(5, 4), 'Befrielsesaften', '🕯️'],
    [nteSoendag(aar, 4, 2), 'Mors dag', '💐'],
    [flytDage(p, 39), 'Kristi himmelfartsdag', '⛪', true],
    [flytDage(p, 49), 'Pinsedag', '🕊️', true],
    [flytDage(p, 50), '2. pinsedag', '🕊️', true],
    [d(6, 5), 'Grundlovsdag', '🇩🇰'],
    [d(6, 5), 'Fars dag', '👔'],
    [d(6, 23), 'Sankthans aften', '🔥'],
    [sidsteSoendag(aar, 9), 'Vintertid – stil uret 1 time tilbage', '⏰'],
    [d(10, 31), 'Halloween', '🎃'],
    [d(11, 10), 'Mortensaften', '🦆'],
    [flytDage(jul, -(jul.getDay() || 7) - 21), '1. søndag i advent', '🕯️'],
    [d(12, 13), 'Lucia', '🕯️'],
    [d(12, 24), 'Juleaften', '🎄', true],
    [d(12, 25), 'Juledag', '🎄', true],
    [d(12, 26), '2. juledag', '🎄', true],
    [d(12, 31), 'Nytårsaften', '🎆']
  ].map(([dato, navn, ikon, hellig]) => ({ iso: isoDato(dato), navn, ikon, hellig: !!hellig, indbygget: true }));
  return (DAGE_CACHE[aar] = liste);
}
// Dagens helligdage/mærkedage. Har familien selv en mærkedag med samme navn samme dag
// (fx "Mors dag, Winnie"), vises kun familiens egen.
const normNavn = s => (s || '').toLowerCase().replace(/[^a-zæøå]/g, '');
// valg = personens valg (se valgFor) – helligdage og mærkedage kan slås fra hver for sig
function indbyggedeDageDen(iso, egne = [], valg = STANDARD_VALG) {
  const egneNavne = egne.map(f => normNavn(f.navn));
  return aaretsDage(Number(iso.slice(0, 4))).filter(x => x.iso === iso && (x.hellig ? valg.helligdage : valg.maerkedage)
    && !egneNavne.some(n => n.startsWith(normNavn(x.navn))));
}
const helligdagDen = iso => aaretsDage(Number(iso.slice(0, 4))).find(x => x.iso === iso && x.hellig) || null;

// ---------- Hvad hver person vil se ----------
// Data: 'personvalg' {navn, helligdage, maerkedage, sol, vejr} – mangler noget, er det slået til.
// Børn kan selv rette deres egne valg (børnelåsen tillader kun deres eget navn).
const STANDARD_VALG = { helligdage: true, maerkedage: true, sol: true, vejr: true };
async function valgFor(navn) {
  const r = (await Data.list('personvalg')).find(x => x.navn === navn);
  return { ...STANDARD_VALG, ...(r || {}) };
}
async function saetValg(navn, felt, vaerdi) {
  const r = (await Data.list('personvalg')).find(x => x.navn === navn);
  if (r) await Data.update('personvalg', r.id, { [felt]: vaerdi });
  else await Data.add('personvalg', { navn, [felt]: vaerdi });
}
// Familiens sted (til sol og vejr) – sættes af en voksen; ellers midt i Danmark
async function familieSted() {
  const r = (await Data.list('indstillinger')).find(x => x.noegle === 'sted');
  return r?.vaerdi?.lat ? r.vaerdi : STANDARD_STED;
}

// ---------- Solopgang og solnedgang (forenklet NOAA-beregning, ±1-2 min) ----------
const STANDARD_STED = { lat: 56.0, lon: 10.0 };   // midt i Danmark – kan ændres under Udseende
function solTider(dato, sted = STANDARD_STED) {
  const rad = Math.PI / 180;
  const dagNr = Math.round((Date.UTC(dato.getFullYear(), dato.getMonth(), dato.getDate()) - Date.UTC(2000, 0, 1)) / 86400000) + 0.5;
  const J = dagNr - sted.lon / 360;
  const M = (357.5291 + 0.98560028 * J) % 360;
  const C = 1.9148 * Math.sin(M * rad) + 0.02 * Math.sin(2 * M * rad) + 0.0003 * Math.sin(3 * M * rad);
  const L = (M + C + 180 + 102.9372) % 360;
  const transit = J + 0.0053 * Math.sin(M * rad) - 0.0069 * Math.sin(2 * L * rad);
  const dekl = Math.asin(Math.sin(L * rad) * Math.sin(23.44 * rad));
  const cosH = (Math.sin(-0.833 * rad) - Math.sin(sted.lat * rad) * Math.sin(dekl)) / (Math.cos(sted.lat * rad) * Math.cos(dekl));
  if (cosH > 1 || cosH < -1) return null;
  const H = Math.acos(cosH) / rad / 360;
  const tilDato = j => new Date(Date.UTC(2000, 0, 1, 12) + (j - 0.5) * 86400000);
  return { op: tilDato(transit - H), ned: tilDato(transit + H) };
}
const klokken = d => String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
