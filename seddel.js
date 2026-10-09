// seddel.js – køleskabssedler mellem familien: voksne → børn, børn → voksne og voksne → hinanden.
// En seddel hænger hos modtageren (barnets tavle / "Familien" for en voksen). Modtageren svarer med en emoji
// og/eller en kort tekst – så flyver sedlen væk, og afsenderen ser svaret.
// Ekstra: klistermærke, farve, hemmelig seddel (skal "foldes ud"), gave med stjerner (kun fra voksne),
// og en voksen kan lade sedlen vente til næste morgen.
//
// Data: 'sedler' {til, fra, tekst, sticker, farve, hemmelig, stjerner, visFra (ISO-tid), aabnet?, reaktion?, svarTekst?, svaret?}
// Børnelåsen (opdatering-sedler-3.sql): et barn må sende sedler til en voksen (uden gave), svare på sine egne
// og slette dem, det selv har sendt. Alt andet kan kun voksne.

// Bevidst afdæmpet: ingen færdige beskeder, få emojis – sedler er en diskret mulighed, ikke en chat.
// En voksen kan slå det fra for et barn (Indstillinger → barnet; personregler.sedler = false):
// så kan barnet ikke sende sedler eller skrive svar – kun svare med en emoji (databasen håndhæver det).
const SEDDEL_HURTIG = ['👍', '❤️', '😂', '😮'];
const SEDDEL_EMOJI = ['👍', '👎', '❤️', '😊', '😂', '😮', '😢', '🤔', '🙏', '👌', '💪', '🎉'];
const SEDDEL_STICKERE = ['', '⭐', '❤️', '☀️', '🌈', '🎉', '👍'];
const SEDDEL_FARVER = { gul: 'Gul', pink: 'Pink', blaa: 'Blå', groen: 'Grøn' };
const VOKSNE = Object.keys(PK).filter(n => n !== 'Fælles' && !BOERN.includes(n));   // PK fra app.js
const ALLE_BOERN = 'alle-boern', ALLE_VOKSNE = 'alle-voksne';

// Lidt skæv, som en rigtig seddel – altid den samme skævhed for den samme seddel
function seddelDrej(id) {
  let h = 0;
  for (const c of String(id || 'x')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.8;
}
const seddelVist = s => new Date(s.visFra || s.oprettet || 0).getTime() <= Date.now();
const seddelBesvaret = s => !!(s.reaktion || s.svarTekst);
const nylig = (iso, dage) => iso && Date.now() - new Date(iso) < dage * 864e5;
const kortTekst = (t, n = 40) => (t || '').length > n ? t.slice(0, n) + '…' : (t || '');
function naesteMorgen() {
  const d = new Date();
  if (d.getHours() >= 6) d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

// Svar: emoji og/eller tekst. Sedlen flyver væk; er der en gave, kommer der konfetti.
async function sendSvar(s, reaktion, svarTekst, k) {
  const nu = new Date().toISOString();
  await Data.update('sedler', s.id, { reaktion: reaktion || '', svarTekst: (svarTekst || '').trim(), svaret: nu, aabnet: s.aabnet || nu });
  k?.classList.add('flyv');
  if (s.stjerner > 0) fejr('🎁 ' + s.stjerner + ' ★ fra ' + s.fra + '!');   // fra sjov.js
  else besked((reaktion || '✉️') + ' Svar sendt til ' + s.fra);
  setTimeout(() => tegnAlt(), 700);
}

// Et helt svar: en emoji og/eller en kort tekst
function svarArk(s, k) {
  let valgt = '';
  const forhaand = el('p', 'svar-citat', '"' + kortTekst(s.tekst, 80) + '" – ' + s.fra);
  const plade = el('div', 'svar-emoji');
  const tegnPlade = () => plade.replaceChildren(...SEDDEL_EMOJI.map(e => {
    const b = knap(e, 'svar-emoji-knap', () => { valgt = valgt === e ? '' : e; tegnPlade(); });
    b.setAttribute('aria-pressed', e === valgt);
    return b;
  }));
  tegnPlade();
  const tekst = el('textarea', 'seddel-input');
  tekst.id = 'svar-tekst'; tekst.rows = 2; tekst.maxLength = 100; tekst.placeholder = 'Skriv et svar …';
  const send = knap('Send svar', 'knap', async () => {
    if (!valgt && !tekst.value.trim()) { tekst.focus(); return; }
    send.disabled = true;
    lukArk();
    await sendSvar(s, valgt, tekst.value, k);
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(send);
  aabnArk('Svar ' + s.fra, forhaand, el('label', 'felt-label', 'Vælg en emoji'), plade,
    felt('Og/eller skriv noget', tekst), knapper);
}

// Én seddel. opts.rolle: 'modtager' (kan åbne og svare), 'afsender' (status, svar, ret/slet) eller 'forhaand'
function seddelEl(s, opts = {}) {
  const rolle = opts.rolle || 'afsender';
  const k = el('div', 'seddel seddel-' + (SEDDEL_FARVER[s.farve] ? s.farve : 'gul') + (opts.animer ? ' folder-ud' : '') + (opts.lille ? ' lille' : ''));
  k.style.setProperty('--drej', seddelDrej(s.id) + 'deg');
  k.append(el('span', 'seddel-magnet ' + (PK[s.fra] || 'c-faelles')));

  // Hemmelig og ikke åbnet: modtageren ser kun en foldet seddel
  if (rolle === 'modtager' && s.hemmelig && !s.aabnet) {
    k.classList.add('lukket');
    const b = knap('', 'seddel-luk-knap', async () => {
      b.disabled = true;
      const aabnet = new Date().toISOString();
      await Data.update('sedler', s.id, { aabnet });
      k.replaceWith(seddelEl({ ...s, aabnet }, { ...opts, animer: true }));
    });
    b.append(el('span', 'seddel-hemmelig-ikon', '🤫'), el('span', 'seddel-tekst', 'Hemmelig seddel fra ' + (s.fra || '')),
      el('span', 'seddel-hint', 'Tryk for at åbne'));
    k.append(b);
    return k;
  }

  if (s.sticker) k.append(el('span', 'seddel-sticker', s.sticker));
  if (rolle === 'afsender' && !opts.udenTil) k.append(el('span', 'seddel-til', 'Til ' + s.til));
  k.append(el('p', 'seddel-tekst', s.tekst || (rolle === 'forhaand' ? 'Skriv noget …' : '')));
  k.append(el('span', 'seddel-fra', '– ' + (s.fra || '')));
  if (s.stjerner > 0) k.append(el('span', 'seddel-gave', '🎁 ' + s.stjerner + ' ★ ' + (rolle === 'afsender' ? 'med' : 'til dig')));
  if (rolle === 'forhaand') return k;

  if (rolle === 'modtager') {
    const svar = el('div', 'seddel-svar-knapper');
    svar.append(...SEDDEL_HURTIG.map(r => {
      const b = knap(r, 'seddel-reaktion', () => { svar.querySelectorAll('button').forEach(x => (x.disabled = true)); sendSvar(s, r, '', k); });
      b.setAttribute('aria-label', 'Svar ' + r);
      return b;
    }));
    if (opts.maaSkrive !== false) {
      const mere = knap('Svar …', 'seddel-reaktion seddel-skriv', () => svarArk(s, k));
      mere.setAttribute('aria-label', 'Skriv et svar eller vælg en anden emoji');
      svar.append(mere);
    }
    k.append(el('span', 'seddel-hint', 'Svar ' + (s.fra || '') + ':'), svar);
    return k;
  }

  // Afsender (eller en voksen, der kigger på et barns tavle): status, ret og slet
  const status = !seddelVist(s) ? '⏰ Vises ' + new Date(s.visFra).toLocaleString('da-DK', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', '.')
    : s.hemmelig && !s.aabnet ? '🤫 Ikke åbnet endnu' : '⏳ Venter på svar';
  const bund = el('div', 'seddel-bund');
  bund.append(el('span', 'seddel-status', status));
  const maaRette = erVoksen();
  if (maaRette) bund.append(knap('Ret', 'lille-knap', () => skrivSeddel(s.til, s)));
  else bund.append(knap('Fortryd', 'lille-knap', () => Data.remove('sedler', s.id)));   // barnet kan tage sin egen seddel ned igen
  k.append(bund);
  if (maaRette) langtTryk(k, () => holdValg('Seddel til ' + s.til, { slet: () => Data.remove('sedler', s.id), ret: () => skrivSeddel(s.til, s) }));
  return k;
}

// "Villads svarede 😂 Nej, DU er den bedste!" – vises hos afsenderen i 3 dage (kan fjernes med ✕)
function svarLinje(s) {
  const l = el('div', 'seddel-svar-linje');
  l.append(el('span', 'seddel-svar-emoji', s.reaktion || '✉️'));
  const t = el('span', 'seddel-svar-tekst');
  const hvem = el('span');
  hvem.append(el('b', null, s.til), ' svarede på "' + kortTekst(s.tekst) + '"');
  t.append(hvem);
  if (s.svarTekst) t.append(el('span', 'seddel-svar-citat', s.svarTekst));
  l.append(t);
  const x = knap('✕', 'slet', () => Data.remove('sedler', s.id));
  x.setAttribute('aria-label', 'Fjern');
  l.append(x);
  return l;
}

// Ryd gamle sedler (kun voksne): besvarede efter 7 dage, alle efter 30 dage
let seddelRyddet = 0;
async function ryddSedler() {
  if (!erVoksen() || Date.now() - seddelRyddet < 600000) return;
  seddelRyddet = Date.now();
  const gammel = (await Data.list('sedler')).filter(s => (s.svaret && !nylig(s.svaret, 7)) || !nylig(s.oprettet, 30));
  if (gammel.length) Data.stille(async () => { for (const s of gammel) await Data.remove('sedler', s.id); });
}

function seddelSamling(dele) {
  const boks = el('div', 'sedler');
  const raekke = el('div', 'seddel-raekke');
  raekke.append(...dele.sedler);
  if (raekke.children.length) boks.append(raekke);
  boks.append(...dele.linjer);
  return boks.children.length ? boks : null;
}

// Må barnet sende sedler og skrive svar? (voksne kan slå det fra – se Indstillinger)
async function sedlerTilladt(navn) {
  if (!BOERN.includes(navn)) return true;
  return (await regelFor(navn)).sedler;   // fra mere.js
}

// Den diskrete "skriv"-mulighed nederst på tavlen / Familien (null = ikke tilladt)
async function seddelSkrivLink(barn) {
  const mig = Data.bruger()?.navn;
  if (mig === barn) {
    if (!(await sedlerTilladt(barn))) return null;
    return knap('✉️ Skriv en seddel', 'seddel-skriv-link', () => skrivSeddel(VOKSNE[0]));
  }
  if (!erVoksen()) return null;
  return knap('✉️ Skriv en seddel' + (barn ? ' til ' + barn : ''), 'seddel-skriv-link', () => skrivSeddel(barn || BOERN[0]));
}

// Sedlerne på et barns tavle (øverst)
async function seddelDel(barn) {
  ryddSedler();
  const alle = await Data.list('sedler');
  const sortering = (a, b) => new Date(a.visFra || a.oprettet) - new Date(b.visFra || b.oprettet);
  const tilBarn = alle.filter(s => s.til === barn).sort(sortering);
  const migSelv = Data.bruger()?.navn === barn;   // barnet selv er logget ind
  if (migSelv) {
    // Barnet: sedler til mig (svar), mine sendte sedler (status/svar) og "Skriv en seddel"
    const fraBarn = alle.filter(s => s.fra === barn).sort(sortering);
    const maaSkrive = await sedlerTilladt(barn);
    return seddelSamling({
      sedler: [...tilBarn.filter(s => !seddelBesvaret(s) && seddelVist(s)).map(s => seddelEl(s, { rolle: 'modtager', maaSkrive })),
        ...fraBarn.filter(s => !seddelBesvaret(s)).map(s => seddelEl(s, { rolle: 'afsender', lille: true }))],
      linjer: fraBarn.filter(s => seddelBesvaret(s) && nylig(s.svaret, 3)).map(s => svarLinje(s))
    });
  }
  // En voksen kigger på barnets tavle: sedlerne til barnet med status, svar fra de sidste 3 dage og "Skriv en seddel"
  if (!erVoksen()) return null;
  return seddelSamling({
    sedler: tilBarn.filter(s => !seddelBesvaret(s)).map(s => seddelEl(s, { rolle: 'afsender', udenTil: true })),
    linjer: tilBarn.filter(s => seddelBesvaret(s) && nylig(s.svaret, 3)).map(s => svarLinje(s))
  });
}

// Sedler til mig som voksen + svar på det, jeg har sendt (vises øverst på "Familien")
async function voksenSedler() {
  ryddSedler();
  const mig = Data.bruger()?.navn;
  const alle = await Data.list('sedler');
  const tilMig = alle.filter(s => s.til === mig && !seddelBesvaret(s) && seddelVist(s))
    .sort((a, b) => new Date(a.visFra || a.oprettet) - new Date(b.visFra || b.oprettet));
  const fraMig = alle.filter(s => s.fra === mig);
  const tilVoksne = fraMig.filter(s => VOKSNE.includes(s.til) && !seddelBesvaret(s));   // til børn ses på deres tavle
  return seddelSamling({
    sedler: [...tilMig.map(s => seddelEl(s, { rolle: 'modtager' })), ...tilVoksne.map(s => seddelEl(s, { rolle: 'afsender', lille: true }))],
    linjer: fraMig.filter(s => seddelBesvaret(s) && nylig(s.svaret, 3)).map(s => svarLinje(s))
  });
}
// Antal ubesvarede sedler til mig (rødt tal på I dag)
async function sedlerTilMig() {
  const mig = Data.bruger()?.navn;
  return (await Data.list('sedler')).filter(s => s.til === mig && !seddelBesvaret(s) && seddelVist(s)).length;
}

// Skriv eller ret en seddel. Børn kan skrive til de voksne (uden gave og "næste morgen").
function skrivSeddel(tilStandard, gl) {
  const ny = !gl;
  const mig = Data.bruger()?.navn || '';
  const barn = !erVoksen();
  const modtagere = barn ? [...VOKSNE, ALLE_VOKSNE] : [...BOERN, ALLE_BOERN, ...VOKSNE.filter(v => v !== mig)];
  const tilNavn = v => (v === ALLE_BOERN ? 'Begge børn' : v === ALLE_VOKSNE ? VOKSNE.join(' og ') : v);
  const s = {
    til: gl?.til || (modtagere.includes(tilStandard) ? tilStandard : modtagere[0]), fra: gl?.fra || mig, tekst: gl?.tekst || '',
    sticker: gl?.sticker ?? '', farve: gl?.farve || 'gul', hemmelig: !!gl?.hemmelig,
    stjerner: gl?.stjerner || 0, vis: 'nu', id: gl?.id
  };
  const forhaand = el('div', 'seddel-forhaand');
  const tegnForhaand = () => forhaand.replaceChildren(seddelEl({ ...s, til: tilNavn(s.til) }, { rolle: 'forhaand' }));
  tegnForhaand();

  const tekst = el('textarea', 'seddel-input');
  tekst.id = 'seddel-tekst'; tekst.maxLength = 160; tekst.rows = 3; tekst.value = s.tekst;
  tekst.placeholder = 'Skriv din besked …';
  tekst.addEventListener('input', () => { s.tekst = tekst.value; tegnForhaand(); });

  const tilValg = chipValg(ny ? modtagere : [s.til], s.til, v => { s.til = v; tegnForhaand(); }, tilNavn);
  const stickerValg = chipValg(SEDDEL_STICKERE, s.sticker, v => { s.sticker = v; tegnForhaand(); }, v => v || 'Ingen');
  stickerValg.classList.add('seddel-stickere');
  const farveValg = chipValg(   // farverne sættes i style.css (rækkefølgen gul, pink, blå, grøn)
    Object.keys(SEDDEL_FARVER), s.farve, v => { s.farve = v; tegnForhaand(); }, v => SEDDEL_FARVER[v]);
  farveValg.classList.add('seddel-farver');
  const gaveValg = chipValg([0, 1, 2, 3, 5], s.stjerner, v => { s.stjerner = v; tegnForhaand(); }, v => (v ? v + ' ★' : 'Ingen'));
  const hemmelig = knap('🤫 Hemmelig – skal foldes ud med et tryk', null, () => { s.hemmelig = !s.hemmelig; hemmelig.setAttribute('aria-checked', s.hemmelig); });
  hemmelig.setAttribute('role', 'checkbox');
  hemmelig.setAttribute('aria-checked', s.hemmelig);
  const hemmeligBoks = el('div', 'seg wrap');
  hemmeligBoks.append(hemmelig);
  const visValg = chipValg(['nu', 'morgen'], s.vis, v => { s.vis = v; }, v => (v === 'nu' ? 'Med det samme' : '☀️ Næste morgen kl. 6'));

  const gem = knap(ny ? (barn ? 'Send sedlen' : 'Hæng den op') : 'Gem', 'knap', async () => {
    if (!s.tekst.trim()) { tekst.focus(); return; }
    gem.disabled = true;
    const felter = { fra: s.fra, tekst: s.tekst.trim(), sticker: s.sticker, farve: s.farve, hemmelig: s.hemmelig };
    if (ny) {
      const stjerner = barn ? 0 : s.stjerner;
      const visFra = (!barn && s.vis === 'morgen' ? naesteMorgen() : new Date()).toISOString();
      const til = s.til === ALLE_BOERN ? BOERN : s.til === ALLE_VOKSNE ? VOKSNE : [s.til];
      for (const t of til) {
        const gave = BOERN.includes(t) ? stjerner : 0;   // gaver kun til børn
        await Data.add('sedler', { ...felter, til: t, stjerner: gave, visFra });
        // Gaven: stjernerne lægges til barnets saldo (som en justering) den dag, sedlen vises
        if (gave > 0) await Data.add('justeringer', { barn: t, dato: isoDato(new Date(visFra)), stjerner: gave, kr: 0, tekst: 'Gave på seddel fra ' + s.fra });
      }
      if (barn) besked('✉️ Sedlen er sendt til ' + tilNavn(s.til));
    } else {
      await Data.update('sedler', gl.id, felter);   // gaven og modtageren kan ikke ændres bagefter
    }
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('sedler', gl.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  const dele = [forhaand, felt('Til', tilValg), felt('Besked', tekst),
    el('label', 'felt-label', 'Klistermærke'), stickerValg, el('label', 'felt-label', 'Farve'), farveValg, hemmeligBoks];
  if (ny && !barn) dele.push(el('label', 'felt-label', '🎁 Gave (kun til børn)'), gaveValg, el('label', 'felt-label', 'Hvornår'), visValg);
  dele.push(knapper);
  aabnArk(ny ? 'Ny seddel' : 'Ret seddel', ...dele);
}
