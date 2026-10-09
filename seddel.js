// seddel.js – køleskabssedler: en voksen skriver en lille seddel til et barn, som hænger på barnets tavle.
// Barnet svarer med en emoji – så flyver sedlen væk, og den voksne kan se svaret.
// Sjove ting: klistermærke, farve, hemmelig seddel (skal "foldes ud"), en gave med stjerner,
// og en seddel kan vente til næste morgen ("godmorgen-seddel").
//
// Data: 'sedler' {til, fra, tekst, sticker, farve, hemmelig, stjerner, visFra (ISO-tid), aabnet?, reaktion?, svaret?}
// Børnelåsen (opdatering-sedler.sql) lader kun barnet sætte aabnet/reaktion/svaret på sine egne sedler.

const SEDDEL_REAKTIONER = ['👍', '❤️', '😂', '😮', '🙏'];
const SEDDEL_STICKERE = ['', '⭐', '❤️', '🦖', '🚀', '🐰', '🍕', '⚽', '🎮', '🌈', '🦄', '😎', '🎉', '💪'];
const SEDDEL_FARVER = { gul: 'Gul', pink: 'Pink', blaa: 'Blå', groen: 'Grøn' };
const SEDDEL_FORSLAG = ['Godmorgen ☀️ Hav en god dag!', 'Jeg er så stolt af dig', 'Godt klaret i dag!', 'Husk ', 'Glæder mig til at se dig 🤗'];

// Lidt skæv, som en rigtig seddel – altid den samme skævhed for den samme seddel
function seddelDrej(id) {
  let h = 0;
  for (const c of String(id || 'x')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.8;
}
const seddelVist = s => new Date(s.visFra || s.oprettet || 0).getTime() <= Date.now();
function naesteMorgen() {
  const d = new Date();
  if (d.getHours() >= 6) d.setDate(d.getDate() + 1);
  d.setHours(6, 0, 0, 0);
  return d;
}

// Én seddel. opts: {barn: true} = barnets egen visning (kan åbnes og besvares), {forhaand: true} = forhåndsvisning
function seddelEl(s, opts = {}) {
  const k = el('div', 'seddel seddel-' + (SEDDEL_FARVER[s.farve] ? s.farve : 'gul') + (opts.animer ? ' folder-ud' : ''));
  k.style.setProperty('--drej', seddelDrej(s.id) + 'deg');
  const magnet = el('span', 'seddel-magnet ' + (PK[s.fra] || 'c-faelles'));
  k.append(magnet);

  // Hemmelig og ikke åbnet: barnet ser kun en foldet seddel
  if (opts.barn && s.hemmelig && !s.aabnet) {
    k.classList.add('lukket');
    const b = knap('', 'seddel-luk-knap', async () => {
      b.disabled = true;
      const aabnet = new Date().toISOString();
      await Data.update('sedler', s.id, { aabnet });
      k.replaceWith(seddelEl({ ...s, aabnet }, { ...opts, animer: true }));
    });
    b.append(el('span', 'seddel-hemmelig-ikon', '🤫'), el('span', 'seddel-tekst', 'Hemmelig seddel fra ' + (s.fra || 'en voksen')),
      el('span', 'seddel-hint', 'Tryk for at åbne'));
    k.append(b);
    return k;
  }

  if (s.sticker) k.append(el('span', 'seddel-sticker', s.sticker));
  k.append(el('p', 'seddel-tekst', s.tekst || (opts.forhaand ? 'Skriv noget sødt …' : '')));
  k.append(el('span', 'seddel-fra', '– ' + (s.fra || '')));
  if (s.stjerner > 0) k.append(el('span', 'seddel-gave', '🎁 ' + s.stjerner + ' ★ ' + (opts.barn || opts.forhaand ? 'til dig' : 'med')));
  if (opts.forhaand) return k;

  if (opts.barn) {
    // Svar med en emoji – sedlen flyver væk
    const svar = el('div', 'seddel-svar-knapper');
    svar.append(...SEDDEL_REAKTIONER.map(r => {
      const b = knap(r, 'seddel-reaktion', async () => {
        svar.querySelectorAll('button').forEach(x => (x.disabled = true));
        const nu = new Date().toISOString();
        await Data.update('sedler', s.id, { reaktion: r, svaret: nu, aabnet: s.aabnet || nu });
        k.classList.add('flyv');
        if (s.stjerner > 0) fejr('🎁 ' + s.stjerner + ' ★ fra ' + s.fra + '!');   // fra sjov.js
        else besked(r + ' sendt til ' + s.fra);
        setTimeout(() => tegnOverblik(), 700);
      });
      b.setAttribute('aria-label', 'Svar ' + r);
      return b;
    }));
    k.append(el('span', 'seddel-hint', 'Svar ' + (s.fra || '') + ':'), svar);
  } else {
    // Voksen: status + ret/slet (også ved at holde fingeren på sedlen)
    const status = !seddelVist(s) ? '⏰ Vises ' + new Date(s.visFra).toLocaleString('da-DK', { weekday: 'long', hour: '2-digit', minute: '2-digit' }).replace(':', '.')
      : s.hemmelig && !s.aabnet ? '🤫 Ikke åbnet endnu' : '⏳ Venter på svar';
    const bund = el('div', 'seddel-bund');
    bund.append(el('span', 'seddel-status', status), knap('Ret', 'lille-knap', () => skrivSeddel(s.til, s)));
    k.append(bund);
    langtTryk(k, () => holdValg('Seddel til ' + s.til, { slet: () => Data.remove('sedler', s.id), ret: () => skrivSeddel(s.til, s) }));
  }
  return k;
}

// Sedlerne på et barns tavle (øverst). Voksne ser også ventende sedler, svar fra de sidste 3 dage og "Skriv en seddel".
async function seddelDel(barn) {
  const voksen = erVoksen();
  const alle = (await Data.list('sedler')).filter(s => s.til === barn);
  if (voksen) {
    // Gamle sedler ryddes væk: besvarede efter 7 dage, ubesvarede efter 30 dage
    const gammel = alle.filter(s => (s.svaret && Date.now() - new Date(s.svaret) > 7 * 864e5) || Date.now() - new Date(s.oprettet) > 30 * 864e5);
    if (gammel.length) Data.stille(async () => { for (const s of gammel) await Data.remove('sedler', s.id); });
  }
  const sortering = (a, b) => new Date(a.visFra || a.oprettet) - new Date(b.visFra || b.oprettet);
  const aktive = alle.filter(s => !s.reaktion && seddelVist(s)).sort(sortering);
  const venter = voksen ? alle.filter(s => !s.reaktion && !seddelVist(s)).sort(sortering) : [];
  const svarede = voksen ? alle.filter(s => s.reaktion && Date.now() - new Date(s.svaret) < 3 * 864e5) : [];
  if (!voksen && !aktive.length) return null;

  const boks = el('div', 'sedler');
  const raekke = el('div', 'seddel-raekke');
  raekke.append(...aktive.map(s => seddelEl(s, { barn: !voksen })), ...venter.map(s => seddelEl(s)));
  if (raekke.children.length) boks.append(raekke);
  for (const s of svarede) {
    const l = el('div', 'seddel-svar-linje');
    l.append(el('span', 'seddel-svar-emoji', s.reaktion), el('span', null, barn + ' svarede på "' + (s.tekst || '').slice(0, 40) + ((s.tekst || '').length > 40 ? '…' : '') + '"'));
    const x = knap('✕', 'slet', () => Data.remove('sedler', s.id));
    x.setAttribute('aria-label', 'Fjern');
    l.append(x);
    boks.append(l);
  }
  if (voksen) boks.append(knap('📝 Skriv en seddel til ' + barn, 'lille-knap seddel-ny', () => skrivSeddel(barn)));
  return boks;
}

// Skriv eller ret en seddel (kun voksne). Forhåndsvisningen øverst viser, hvordan den ser ud på tavlen.
function skrivSeddel(barn, gl) {
  const ny = !gl;
  const s = {
    til: gl?.til || barn, fra: gl?.fra || Data.bruger()?.navn || '', tekst: gl?.tekst || '', sticker: gl?.sticker ?? '⭐',
    farve: gl?.farve || 'gul', hemmelig: !!gl?.hemmelig, stjerner: gl?.stjerner || 0, vis: 'nu', id: gl?.id
  };
  const forhaand = el('div', 'seddel-forhaand');
  const tegnForhaand = () => forhaand.replaceChildren(seddelEl(s, { forhaand: true }));
  tegnForhaand();

  const tekst = el('textarea', 'seddel-input');
  tekst.id = 'seddel-tekst'; tekst.maxLength = 160; tekst.rows = 3; tekst.value = s.tekst;
  tekst.placeholder = 'Fx: Husk nøglen – jeg kommer kl. 17 ❤️';
  tekst.addEventListener('input', () => { s.tekst = tekst.value; tegnForhaand(); });
  const forslag = el('div', 'seg wrap seddel-forslag');
  forslag.append(...SEDDEL_FORSLAG.map(f => knap(f.trim(), 'lille-knap', () => { s.tekst = tekst.value = f; tegnForhaand(); tekst.focus(); })));

  const tilValg = chipValg(ny ? [...BOERN, 'Begge'] : [s.til], s.til, v => { s.til = v; });
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

  const gem = knap(ny ? 'Hæng den op' : 'Gem', 'knap', async () => {
    if (!s.tekst.trim()) { tekst.focus(); return; }
    gem.disabled = true;
    const felter = { fra: s.fra, tekst: s.tekst.trim(), sticker: s.sticker, farve: s.farve, hemmelig: s.hemmelig, stjerner: s.stjerner };
    if (ny) {
      const visFra = (s.vis === 'morgen' ? naesteMorgen() : new Date()).toISOString();
      for (const b of (s.til === 'Begge' ? BOERN : [s.til])) {
        await Data.add('sedler', { ...felter, til: b, visFra });
        // Gaven: stjernerne lægges til barnets saldo (som en justering) den dag, sedlen vises
        if (s.stjerner > 0) await Data.add('justeringer', { barn: b, dato: isoDato(new Date(visFra)), stjerner: s.stjerner, kr: 0, tekst: 'Gave på seddel fra ' + s.fra });
      }
    } else {
      await Data.update('sedler', gl.id, { ...felter, stjerner: gl.stjerner });   // gaven kan ikke ændres bagefter
    }
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('sedler', gl.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  const dele = [forhaand, felt('Til', tilValg), felt('Besked', tekst), forslag,
    el('label', 'felt-label', 'Klistermærke'), stickerValg, el('label', 'felt-label', 'Farve'), farveValg, hemmeligBoks];
  if (ny) dele.push(el('label', 'felt-label', '🎁 Gave'), gaveValg, el('label', 'felt-label', 'Hvornår'), visValg);
  dele.push(knapper);
  aabnArk(ny ? 'Ny seddel' : 'Ret seddel', ...dele);
}
