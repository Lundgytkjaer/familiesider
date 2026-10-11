// ai.js – ✨ AI-hjælperen (kun voksne).
// Den voksne skriver (eller dikterer) fx "Oliver tandlæge torsdag kl. 14". Edge Function'en "ai" svarer med FORSLAG
// ({svar, handlinger}). Appen tjekker hvert forslag, viser det som et kort med flueben, og først når den voksne trykker
// "Udfør", gemmes det – med de samme funktioner og regler, som når man selv trykker. AI'en sletter aldrig noget.
// Data der sendes: dato, fornavne, kategorier, lister over tilbehør/ekstra/fyld og retternes navne/kategori. Intet andet.

const AI_IKON = { kalender_ny: '📅', indkob_ny: '🛒', todo_ny: '☑️', ret_ny: '🍽️', ret_ret: '✏️', madplan: '🗓️' };
const AI_EKSEMPLER = ['Oliver tandlæge torsdag kl. 14', 'Mælk, æg og noget til tacos', 'Tilføj butter chicken med ris og naan',
  'Pizza på fredag', 'Ryd op i kategorierne på retterne'];
const aiIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(new Date(v + 'T00:00'));
const aiTid = v => /^\d{2}:\d{2}$/.test(v || '') && Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60;
const aiT = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const aiListe = (v, n = 20) => (Array.isArray(v) ? [...new Set(v.map(x => lavt(aiT(x, 40))).filter(Boolean))].slice(0, n) : []);
const aiDag = iso => { const d = new Date(iso + 'T00:00'); return DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()].slice(0, 3) + '.'; };
const aiRetter = () => Data.listNu('favoritter').filter(f => MAAL_TYPER.includes(f.type));

// Det AI'en får at vide om familien (ikke mere)
function aiKontekst() {
  const nu = new Date();
  return {
    dato: isoDato(nu), ugedag: DAGE_LANG[(nu.getDay() + 6) % 7].toLowerCase(),
    personer: PERSONER,
    kategorier: RET_GRUPPER.map(([noegle, , navn]) => ({ noegle, navn })),
    tilbehoer: SIDER, ekstra: EKSTRA, fyld: FYLD,
    retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type, gruppe: f.gruppe || '', side: f.side || '' }))
  };
}

// Tjek og ryd ét forslag. Svarer {h, tekst, fejl?} – h er det, der gemmes
function aiTjek(r) {
  const fejl = t => ({ h: null, tekst: t, fejl: true });
  switch (r?.type) {
    case 'kalender_ny': {
      const titel = aiT(r.titel, 80);
      if (!titel || !aiIso(r.dato)) return fejl('Aftale uden titel eller dato');
      let hvem = (Array.isArray(r.hvem) ? r.hvem : []).map(x => PERSONER.find(p => p.toLowerCase() === String(x).trim().toLowerCase())).filter(Boolean);
      if (!hvem.length || hvem.includes('Fælles')) hvem = ['Fælles'];
      const tid = aiTid(r.tid) ? r.tid : '', slut = tid && aiTid(r.slut) && r.slut > tid ? r.slut : '';
      const gentag = Object.keys(GENTAG_NAVN).includes(r.gentag) ? r.gentag : '';
      const h = { type: r.type, titel, dato: r.dato, tid, slut, hvem, gentag, gentagTil: gentag && aiIso(r.gentagTil) && r.gentagTil >= r.dato ? r.gentagTil : null, note: aiT(r.note, 300) };
      return { h, tekst: titel + ' · ' + aiDag(h.dato) + (tid ? ' kl. ' + visTid(tid) + (slut ? '–' + visTid(slut) : '') : ' · hele dagen') + ' · ' + hvem.join(', ')
        + (gentag ? ' · ' + GENTAG_NAVN[gentag].toLowerCase() + (h.gentagTil ? ' til ' + aiDag(h.gentagTil) : '') : '') + (h.note ? ' · ' + h.note : '') };
    }
    case 'indkob_ny': {
      const varer = aiListe(r.varer, 40);
      if (!varer.length) return fejl('Ingen varer');
      return { h: { type: r.type, varer }, tekst: varer.join(', ') };
    }
    case 'todo_ny': {
      const tekst = aiT(r.tekst, 120);
      if (!tekst) return fejl('To do uden tekst');
      const hvem = PERSONER.filter(p => p !== 'Fælles').find(p => p.toLowerCase() === String((Array.isArray(r.hvem) ? r.hvem[0] : r.hvem) || '').toLowerCase()) || '';
      const frist = aiIso(r.frist) ? r.frist : null;
      return { h: { type: r.type, tekst, hvem, frist }, tekst: tekst + (hvem ? ' · ' + hvem : '') + (frist ? ' · ' + aiDag(frist) : '') };
    }
    case 'ret_ny': case 'ret_ret': {
      const maaltid = MAAL_TYPER.includes(r.maaltid) ? r.maaltid : 'ret';
      const felter = {};
      if (r.gruppe !== undefined && maaltid === 'ret') { const g = RET_GRUPPER.find(x => x[0] === r.gruppe); if (g) felter.gruppe = g[0]; }
      if (Array.isArray(r.sider)) felter.sider = aiListe(r.sider, 12);
      if (r.side !== undefined) felter.side = lavt(aiT(r.side, 40)) || null;
      if (felter.side && felter.sider && !felter.sider.includes(felter.side)) felter.sider.unshift(felter.side);
      if (Array.isArray(r.ekstra)) felter.ekstra = aiListe(r.ekstra, 12);
      if (Array.isArray(r.fyld)) felter.fyld = aiListe(r.fyld, 20);
      const beskriv = (f, gammel = {}) => [
        'gruppe' in f && f.gruppe !== gammel.gruppe ? (gammel.gruppe ? GRUPPE_NAVN[gammel.gruppe] + ' → ' : '') + GRUPPE_NAVN[f.gruppe] : '',
        f.side ? 'standard: ' + f.side : '',
        f.sider?.length && !(f.sider.length === 1 && f.sider[0] === f.side) ? 'tilbehør: ' + f.sider.join(', ') : '',
        f.ekstra?.length ? 'ekstra: ' + f.ekstra.join(', ') : '',
        f.fyld?.length ? 'fyld: ' + f.fyld.join(', ') : ''].filter(Boolean).join(' · ');
      if (r.type === 'ret_ny') {
        const tekst = aiT(r.tekst || r.navn, 60);
        if (!tekst) return fejl('Ret uden navn');
        const findes = aiRetter().find(f => f.type === maaltid && lavt(f.tekst) === lavt(tekst));
        if (findes) return fejl(tekst + ' findes allerede');
        return { h: { type: r.type, maaltid, tekst: tekst[0].toUpperCase() + tekst.slice(1), felter }, tekst: MAALTIDER[maaltid] + ': ' + tekst + (beskriv(felter) ? ' · ' + beskriv(felter) : '') };
      }
      const navn = aiT(r.navn || r.tekst, 60);
      const f = aiRetter().filter(x => lavt(x.tekst) === lavt(navn)).sort((a, b) => (b.type === maaltid) - (a.type === maaltid))[0];
      if (!f) return fejl('Kender ikke retten "' + navn + '"');
      for (const k of Object.keys(felter)) if (JSON.stringify(felter[k]) === JSON.stringify(f[k] ?? null)) delete felter[k];
      if (!Object.keys(felter).length) return fejl(f.tekst + ': intet at ændre');
      return { h: { type: r.type, id: f.id, felter }, tekst: f.tekst + ': ' + beskriv(felter, f) };
    }
    case 'madplan': {
      const maaltid = MAAL_TYPER.includes(r.maaltid) ? r.maaltid : 'ret';
      const ret = aiT(r.ret || r.tekst, 80);
      if (!ret || !aiIso(r.dato)) return fejl('Madplan uden ret eller dato');
      if (r.dato < isoDato(new Date())) return fejl(ret + ': dagen er gået');
      return { h: { type: r.type, dato: r.dato, maaltid, ret }, tekst: MAALTIDER[maaltid] + ' ' + aiDag(r.dato) + ': ' + ret };
    }
  }
  return fejl('Ukendt forslag');
}

// Udfør ét forslag – med appens normale funktioner (og dermed databasens regler)
async function aiUdfoer(h) {
  switch (h.type) {
    case 'kalender_ny':
      await Data.add('kalender', { titel: h.titel, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, dato: h.dato, tilDato: null,
        tid: h.tid, slut: h.slut, note: h.note, gentag: h.gentag, gentagTil: h.gentagTil, fri: false });
      return;
    case 'indkob_ny':
      for (const v of h.varer) await tilfoejUdenDublet('indkob', { tekst: v, klaret: false });
      return;
    case 'todo_ny':
      await tilfoejUdenDublet('todo', { tekst: h.tekst, klaret: false, prio: 2, ...(h.hvem ? { hvem: h.hvem } : {}), ...(h.frist ? { frist: h.frist } : {}) });
      return;
    case 'ret_ny': case 'ret_ret': {
      // Nyt tilbehør/ekstra/fyld kommer også på de fælles lister
      const f = h.felter;
      let nyt = false;
      for (const [liste, fra] of [['sider', f.sider], ['ekstra', f.ekstra], ['fyld', f.fyld]]) {
        const mangler = (fra || []).filter(x => !hentListe(liste).map(lavt).includes(x));
        if (mangler.length) { saetListe(liste, [...hentListe(liste), ...mangler]); nyt = true; }
      }
      if (nyt) await gemTilbehoer();
      if (h.type === 'ret_ny') await Data.add('favoritter', { type: h.maaltid, tekst: h.tekst, brugt: 0, ...f });
      else await Data.update('favoritter', h.id, f);
      return;
    }
    case 'madplan': {
      const d = new Date(h.dato + 'T00:00');
      await gemMad((d.getDay() + 6) % 7, h.maaltid, h.ret, isoDato(mandagFor(d)));
      return;
    }
  }
}

// ---------- Arket ----------
function aabnAI(start = '') {
  const felt = el('textarea', 'ai-felt');
  felt.rows = 3; felt.maxLength = 1500; felt.value = start;
  felt.placeholder = 'Skriv eller tal (🎤 på tastaturet) – fx "Villads fodbold hver tirsdag 16.30–17.45"';
  const send = knap('✨ Send', 'knap', () => spoerg());
  const eksempler = el('div', 'seg wrap ai-eksempler');
  eksempler.append(...AI_EKSEMPLER.map(t => knap(t, null, () => { felt.value = t; felt.focus(); })));
  const svarBoks = el('div', 'ai-svar');
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap sekundaer', lukArk), send);
  felt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); spoerg(); } });

  async function spoerg() {
    const tekst = felt.value.trim();
    if (!tekst) { felt.focus(); return; }
    svarBoks.replaceChildren(el('p', 'ai-taenker', '✨ Tænker …'));
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk));
    eksempler.hidden = true;
    let res;
    try { res = await Data.ai(tekst, aiKontekst()); }
    catch (e) {
      svarBoks.replaceChildren(el('p', 'ai-fejl', 'Det gik ikke: ' + e.message));
      knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk), knap('Prøv igen', 'knap', () => spoerg()));
      return;
    }
    visForslag(res);
  }

  function visForslag(res) {
    const forslag = (res.handlinger || []).map(aiTjek);
    const gode = forslag.filter(x => x.h);
    const valgt = new Set(gode);
    const dele = [];
    if (res.svar) dele.push(el('p', 'ai-besked', res.svar));
    const ul = el('ul', 'ai-forslag');
    for (const f of forslag) {
      const li = el('li', 'ai-kort' + (f.fejl ? ' fejl' : ''));
      if (f.fejl) { li.append(el('span', 'ai-ikon', '⚠️'), el('span', 'ai-tekst', f.tekst)); ul.append(li); continue; }
      const k = knap('', 'ai-valg', () => {
        if (valgt.has(f)) valgt.delete(f); else valgt.add(f);
        k.setAttribute('aria-checked', valgt.has(f)); opdater();
      });
      k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', 'true');
      k.append(el('span', 'ai-flueben'), el('span', 'ai-ikon', AI_IKON[f.h.type]), el('span', 'ai-tekst', f.tekst));
      li.append(k);
      if (f.h.type === 'kalender_ny') {   // ret selv, før den gemmes
        li.append(knap('Ret', 'lille-knap', () => { const h = f.h; redigerAftale({ titel: h.titel, dato: h.dato, tid: h.tid, slut: h.slut, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, gentag: h.gentag, gentagTil: h.gentagTil, note: h.note }); }));
      }
      ul.append(li);
    }
    if (forslag.length) dele.push(ul);
    if (typeof res.tilbage === 'number' && res.tilbage < 10) dele.push(el('p', 'hint', res.tilbage + ' beskeder tilbage i dag.'));
    svarBoks.replaceChildren(...dele);
    const udfoer = knap('', 'knap', async () => {
      let n = 0;
      for (const f of gode) {
        if (!valgt.has(f)) continue;
        try { await aiUdfoer(f.h); n++; } catch (e) { console.error(e); visStatus('Kunne ikke gemme: ' + f.tekst, true); }
      }
      lukArk(); tegnAlt();
      if (n) visStatus('✨ ' + (n === 1 ? 'Det er gjort' : n + ' ting er gjort') + ' – kan fortrydes under Mere → Aktivitet');
    });
    const opdater = () => { udfoer.textContent = 'Udfør' + (valgt.size > 1 ? ' (' + valgt.size + ')' : ''); udfoer.disabled = !valgt.size; };
    opdater();
    const igen = knap('Ny besked', 'knap sekundaer', () => { felt.value = ''; svarBoks.replaceChildren(); eksempler.hidden = false; knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk), send); felt.focus(); });
    knapper.replaceChildren(igen, ...(gode.length ? [udfoer] : []));
  }

  aabnArk('✨ Hjælper', felt, eksempler, svarBoks,
    el('p', 'hint', 'Den foreslår – du trykker "Udfør". Den kan oprette og rette aftaler, indkøb, to do, retter og madplan, men aldrig slette.'), knapper);
  setTimeout(() => felt.focus(), 50);
}

// ✨-knappen øverst (kun voksne – Edge Function'en tjekker det også)
(() => {
  const k = el('button', 'ai-knap kun-voksen', '✨');
  k.type = 'button';
  k.setAttribute('aria-label', 'AI-hjælper');
  k.addEventListener('click', () => aabnAI());
  document.getElementById('log-ud').before(k);
})();
