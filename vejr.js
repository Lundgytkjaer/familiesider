// vejr.js – vejrudsigt fra Open-Meteo (gratis, ingen konto/nøgle). Vejrdata: Open-Meteo.com (CC BY 4.0).
// Hentes højst hver 30. minut og gemmes ikke i databasen.

const VEJR_KODER = {
  0: ['☀️', 'Klart'], 1: ['🌤️', 'Mest klart'], 2: ['⛅', 'Let skyet'], 3: ['☁️', 'Overskyet'],
  45: ['🌫️', 'Tåge'], 48: ['🌫️', 'Rimtåge'],
  51: ['🌦️', 'Let støvregn'], 53: ['🌦️', 'Støvregn'], 55: ['🌧️', 'Kraftig støvregn'],
  56: ['🧊', 'Isslag'], 57: ['🧊', 'Isslag'],
  61: ['🌧️', 'Let regn'], 63: ['🌧️', 'Regn'], 65: ['🌧️', 'Kraftig regn'],
  66: ['🧊', 'Isregn'], 67: ['🧊', 'Isregn'],
  71: ['🌨️', 'Let sne'], 73: ['🌨️', 'Sne'], 75: ['❄️', 'Kraftig sne'], 77: ['🌨️', 'Snefnug'],
  80: ['🌦️', 'Regnbyger'], 81: ['🌧️', 'Regnbyger'], 82: ['⛈️', 'Kraftige byger'],
  85: ['🌨️', 'Snebyger'], 86: ['❄️', 'Kraftige snebyger'],
  95: ['⛈️', 'Torden'], 96: ['⛈️', 'Torden og hagl'], 99: ['⛈️', 'Torden og hagl']
};
const vejrIkon = k => (VEJR_KODER[k] || ['🌡️'])[0];
const vejrTekst = k => (VEJR_KODER[k] || ['', 'Ukendt'])[1];
const erSne = k => [71, 73, 75, 77, 85, 86].includes(k);
const grader = t => Math.round(t) + '°';

let vejrCache = null;   // {noegle, tid, data}
async function hentVejr() {
  const sted = await familieSted();   // fra dage.js
  const noegle = sted.lat + ',' + sted.lon;
  if (vejrCache && vejrCache.noegle === noegle && Date.now() - vejrCache.tid < 30 * 60 * 1000) return vejrCache.data;
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + sted.lat + '&longitude=' + sted.lon
    + '&current=temperature_2m,weather_code'
    + '&hourly=temperature_2m,precipitation_probability,precipitation,weather_code'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max'
    + '&timezone=Europe%2FCopenhagen&forecast_days=7&wind_speed_unit=ms';
  try {
    const svar = await fetch(url);
    if (!svar.ok) throw new Error('vejr ' + svar.status);
    const data = await svar.json();
    vejrCache = { noegle, tid: Date.now(), data };
    return data;
  } catch (e) {
    console.warn(e);
    return vejrCache?.data || null;   // uden net: brug sidste udsigt, ellers intet
  }
}

// Dagens timer mellem fra og til (klokkeslæt) for en dato 'ÅÅÅÅ-MM-DD'
function vejrTimer(data, iso, fra = 7, til = 19) {
  const h = data.hourly;
  return h.time.map((t, i) => ({ t, time: Number(t.slice(11, 13)), temp: h.temperature_2m[i], pct: h.precipitation_probability?.[i] ?? 0,
    mm: h.precipitation?.[i] ?? 0, kode: h.weather_code[i] })).filter(x => x.t.startsWith(iso) && x.time >= fra && x.time <= til);
}

// Kort opsummering af en dag + tøjråd til børnene
function vejrDag(data, iso) {
  const d = data.daily, i = d.time.indexOf(iso);
  if (i < 0) return null;
  const timer = vejrTimer(data, iso);
  const regnTime = timer.find(x => x.pct >= 50 || x.mm >= 0.5);
  const koldest = timer.length ? Math.min(...timer.map(x => x.temp)) : d.temperature_2m_min[i];
  const varmest = timer.length ? Math.max(...timer.map(x => x.temp)) : d.temperature_2m_max[i];
  const raad = [];
  if (erSne(d.weather_code[i])) raad.push('⛄ Sne – flyverdragt og støvler');
  else if (regnTime) raad.push('☔ Husk regntøj' + (regnTime.time > 8 ? ' (regn fra kl. ' + regnTime.time + ')' : ''));
  if (koldest <= 2) raad.push('🧤 Hue og vanter');
  else if (koldest <= 10) raad.push('🧥 Tag jakke på');
  if (varmest >= 22 && !regnTime) raad.push('🧢 Solcreme og kasket');
  if ((d.wind_speed_10m_max?.[i] ?? 0) >= 13) raad.push('💨 Det blæser meget');
  return {
    kode: d.weather_code[i], min: d.temperature_2m_min[i], max: d.temperature_2m_max[i],
    pct: d.precipitation_probability_max?.[i] ?? 0, regnFra: regnTime ? regnTime.time : null, raad
  };
}

// Én linje til familiens overblik
async function vejrLinje() {
  const data = await hentVejr();
  if (!data) return '';
  const dag = vejrDag(data, isoDato(new Date()));
  if (!dag) return '';
  return vejrIkon(data.current.weather_code) + ' ' + grader(data.current.temperature_2m) + ' nu · ' + grader(dag.min) + '–' + grader(dag.max)
    + (dag.regnFra != null ? ' · regn fra kl. ' + dag.regnFra : dag.pct >= 30 ? ' · ' + dag.pct + '% regn' : '');
}

// Stribe øverst på børnetavlen (for den viste dag) – med tøjråd og evt. sol op/ned
async function vejrStribe(iso, medSol) {
  const data = await hentVejr();
  const dag = data && vejrDag(data, iso);
  if (!dag && !medSol) return null;
  const k = el('button', 'vejr-stribe');
  k.type = 'button';
  k.addEventListener('click', () => { visFane('vejr'); window.scrollTo(0, 0); });
  if (dag) {
    const erIdag = iso === isoDato(new Date());
    const top = el('span', 'vs-top');
    top.append(el('span', 'vs-ikon', vejrIkon(dag.kode)),
      el('span', 'vs-temp', erIdag ? grader(data.current.temperature_2m) : grader(dag.max)),
      el('span', 'vs-tekst', vejrTekst(dag.kode) + ' · ' + grader(dag.min) + '–' + grader(dag.max)));
    k.append(top);
    if (dag.raad.length) {
      const r = el('span', 'vs-raad');
      dag.raad.forEach(t => r.append(el('span', null, t)));
      k.append(r);
    }
  }
  if (medSol) {
    const sol = solTider(new Date(iso + 'T12:00'), await familieSted());
    if (sol) k.append(el('span', 'vs-sol', '🌅 ' + klokken(sol.op) + ' · 🌇 ' + klokken(sol.ned)));
  }
  return k;
}

// Siden "Vejret" under Mere
async function tegnVejr() {
  const boks = document.getElementById('vejr-indhold');
  if (!boks || document.getElementById('vejr').hidden) return;
  const data = await hentVejr();
  if (!data) {
    boks.replaceChildren(el('p', 'hint', 'Kunne ikke hente vejret lige nu. Tjek internettet.'));
    return;
  }
  const iso = isoDato(new Date());
  const nu = new Date().getHours();
  const dag = vejrDag(data, iso);

  const hoved = el('div', 'kort vejr-nu');
  hoved.append(el('span', 'vn-ikon', vejrIkon(data.current.weather_code)),
    el('span', 'vn-temp', grader(data.current.temperature_2m)),
    el('span', 'vn-tekst', vejrTekst(data.current.weather_code) + (dag ? ' · i dag ' + grader(dag.min) + '–' + grader(dag.max) : '')));
  const dele = [hoved];
  if (dag?.raad.length) {
    const r = el('div', 'vs-raad stor-raad');
    dag.raad.forEach(t => r.append(el('span', null, t)));
    dele.push(r);
  }

  // De næste timer
  const timer = vejrTimer(data, iso, nu, 23);
  if (timer.length) {
    dele.push(el('h3', 'lille-titel', 'Resten af dagen'));
    const rk = el('div', 'vejr-timer');
    for (const t of timer.filter((_, i) => i % 2 === 0)) {
      const c = el('div', 'vt');
      c.append(el('span', 'vt-kl', String(t.time).padStart(2, '0')), el('span', 'vt-ikon', vejrIkon(t.kode)),
        el('span', 'vt-temp', grader(t.temp)), el('span', 'vt-regn', t.pct >= 20 ? t.pct + '%' : ''));
      rk.append(c);
    }
    dele.push(rk);
  }

  // 7 dage
  dele.push(el('h3', 'lille-titel', 'De næste dage'));
  const ul = el('ul', 'vejr-dage');
  data.daily.time.forEach((t, i) => {
    const d = new Date(t + 'T12:00');
    const li = el('li');
    li.append(el('span', 'vd-dag', i === 0 ? 'I dag' : i === 1 ? 'I morgen' : DAGE_LANG[(d.getDay() + 6) % 7]),
      el('span', 'vd-ikon', vejrIkon(data.daily.weather_code[i])),
      el('span', 'vd-regn', (data.daily.precipitation_probability_max?.[i] ?? 0) >= 20 ? '💧 ' + data.daily.precipitation_probability_max[i] + '%' : ''),
      el('span', 'vd-temp', grader(data.daily.temperature_2m_min[i]) + ' / ' + grader(data.daily.temperature_2m_max[i])));
    ul.append(li);
  });
  dele.push(ul, el('p', 'kilde', 'Vejrdata: Open-Meteo.com'));
  boks.replaceChildren(...dele);
}
