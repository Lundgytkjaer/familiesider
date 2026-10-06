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
  const raad = [], kort = [];   // kort = korte udgaver til tavlens vejrlinje
  if (erSne(d.weather_code[i])) { raad.push('⛄ Sne – flyverdragt og støvler'); kort.push('⛄ Flyverdragt'); }
  else if (regnTime) { raad.push('☔ Husk regntøj' + (regnTime.time > 8 ? ' (regn fra kl. ' + regnTime.time + ')' : '')); kort.push('☔ Regntøj'); }
  if (koldest <= 2) { raad.push('🧤 Hue og vanter'); kort.push('🧤 Hue og vanter'); }
  else if (koldest <= 10) { raad.push('🧥 Tag jakke på'); kort.push('🧥 Jakke'); }
  if (varmest >= 22 && !regnTime) { raad.push('🧢 Solcreme og kasket'); kort.push('🧢 Solcreme'); }
  if ((d.wind_speed_10m_max?.[i] ?? 0) >= 13) { raad.push('💨 Det blæser meget'); kort.push('💨 Blæst'); }
  return {
    kode: d.weather_code[i], min: d.temperature_2m_min[i], max: d.temperature_2m_max[i],
    pct: d.precipitation_probability_max?.[i] ?? 0, regnFra: regnTime ? regnTime.time : null, raad, kort
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

// Én diskret linje på børnetavlen (for den viste dag): vejr + tøjråd og evt. sol op/ned. Tryk åbner Vejret.
async function vejrStribe(iso, medSol, medVejr = true) {
  const data = medVejr ? await hentVejr() : null;
  const dag = data && vejrDag(data, iso);
  const sol = medSol ? solTider(new Date(iso + 'T12:00'), await familieSted()) : null;
  if (!dag && !sol) return null;
  const k = el('button', 'vejr-linje');
  k.type = 'button';
  k.addEventListener('click', () => { visFane('vejr'); window.scrollTo(0, 0); });
  if (dag) {
    const erIdag = iso === isoDato(new Date());
    k.append(el('span', 'vl-vejr', vejrIkon(dag.kode) + ' ' + (erIdag ? grader(data.current.temperature_2m) + ' nu · ' : '')
      + grader(dag.min) + '–' + grader(dag.max) + (dag.kort.length ? ' · ' + dag.kort.slice(0, 2).join(' · ') : '')));
  }
  if (sol) k.append(solSpan(sol));   // fra dage.js
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
  const sted = await familieSted();
  const stedLinje = el('div', 'vejr-sted');
  stedLinje.append(el('span', null, '📍 ' + (sted.navn || 'Ukendt sted')));
  if (!erBarn()) stedLinje.append(knap('Skift by', 'lille-knap', () => vaelgSted()));
  const dele = [stedLinje, hoved];
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

// ---------- Vælg sted (by) til vejr og sol – kun voksne ----------
async function gemSted(vaerdi) {
  const rk = (await Data.list('indstillinger')).find(x => x.noegle === 'sted');
  if (rk) await Data.update('indstillinger', rk.id, { vaerdi }); else await Data.add('indstillinger', { noegle: 'sted', vaerdi });
  vejrCache = null;
  lukArk(); tegnAlt();
}
function vaelgSted() {
  const soeg = input('text', 'sted-soeg', '', 'Skriv en by, fx Vejle');
  soeg.enterKeyHint = 'search';
  const status = el('p', 'hint');
  const liste = el('ul', 'sted-liste');
  const form = el('form', 'tilfoj');
  form.append(soeg, el('button', 'knap', 'Søg'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const navn = soeg.value.trim();
    if (!navn) return;
    status.textContent = 'Søger…';
    try {
      const svar = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=6&language=da&countryCode=DK&name=' + encodeURIComponent(navn));
      const res = (await svar.json()).results || [];
      status.textContent = res.length ? 'Tryk på den rigtige:' : 'Fandt ingen by med det navn.';
      liste.replaceChildren(...res.map(x => {
        const li = el('li');
        li.append(knap(x.name + (x.admin2 || x.admin1 ? ' · ' + (x.admin2 || x.admin1) : ''), 'sted-valg',
          () => gemSted({ lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100, navn: x.name })));
        return li;
      }));
    } catch { status.textContent = 'Kunne ikke søge lige nu. Tjek internettet.'; }
  });
  const minPlacering = knap('📍 Brug min placering', 'lille-knap', () => {
    if (!navigator.geolocation) { status.textContent = 'Enheden kan ikke give en placering.'; return; }
    status.textContent = 'Finder placering…';
    navigator.geolocation.getCurrentPosition(async pos => {
      const lat = Math.round(pos.coords.latitude * 10) / 10, lon = Math.round(pos.coords.longitude * 10) / 10;
      let navn = 'Min placering';
      try {
        const svar = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=da&latitude=' + lat + '&longitude=' + lon);
        const d = await svar.json();
        navn = d.city || d.locality || navn;
      } catch { /* navnet er ikke vigtigt */ }
      gemSted({ lat, lon, navn });
    }, () => { status.textContent = 'Fik ikke lov til at bruge placeringen.'; }, { timeout: 15000 });
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap', () => lukArk()));
  aabnArk('By til vejr og sol', form, status, liste, minPlacering,
    el('p', 'hint', 'Gælder hele familien. Placeringen gemmes kun groft (ca. 10 km).'), knapper);
  setTimeout(() => soeg.focus(), 50);
}
