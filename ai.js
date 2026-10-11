// ai.js – ✨ AI-hjælperen (kun voksne).
// Den voksne skriver (eller dikterer) fx "Oliver tandlæge torsdag kl. 14". Edge Function'en "ai" svarer med FORSLAG
// ({svar, handlinger}). Appen tjekker hvert forslag, viser det som et kort med flueben, og først når den voksne trykker
// "Udfør", gemmes det – med de samme funktioner og regler, som når man selv trykker. AI'en sletter aldrig noget.
// Data der sendes: dato, fornavne, kategorier, lister over tilbehør/ekstra/fyld og retternes navne/kategori. Intet andet.

const AI_IKON = { kalender_ny: '📅', indkob_ny: '🛒', todo_ny: '☑️', ret_ny: '🍽️', ret_ret: '✏️', ret_saml: '🔗', madplan: '🗓️' };
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
    case 'ret_ny': case 'ret_ret': case 'ret_saml': {
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
      if (r.type === 'ret_saml') {
        // Læg sammen: "ind" forsvinder i "navn" (findes navn ikke, bliver den første af "ind" omdøbt til navn)
        const navn = aiT(r.navn || r.tekst, 60);
        if (!navn) return fejl('Sammenlægning uden navn');
        const alle = aiRetter().filter(x => x.type === maaltid);
        const maal = alle.find(x => lavt(x.tekst) === lavt(navn)) || null;
        const ind = [], brugt = new Set(maal ? [maal.id] : []);
        for (const x of (Array.isArray(r.ind) ? r.ind : []).slice(0, 20)) {
          const n = aiT(typeof x === 'string' ? x : x?.navn, 60);
          const fx = alle.find(y => lavt(y.tekst) === lavt(n) && !brugt.has(y.id));
          if (!fx) continue;
          brugt.add(fx.id);
          ind.push({ id: fx.id, tekst: fx.tekst, som: aiT(x?.som, 80) || null });
        }
        if (ind.length < (maal ? 1 : 2)) return fejl('Kan ikke lægge sammen til "' + navn + '" – fandt ikke retterne');
        // Tilbehør/ekstra/fyld fra de gamle retter kommer med
        const gamle = ind.map(x => alle.find(y => y.id === x.id)).concat(maal ? [maal] : []);
        for (const [k, hent] of [['sider', passerSider], ['ekstra', passerEkstra], ['fyld', passerFyld]]) {
          felter[k] = [...new Set([...(felter[k] || []), ...gamle.flatMap(g => hent(g).map(lavt))])].slice(0, 20);
          if (!felter[k].length) delete felter[k];
        }
        if (!felter.gruppe && !maal) { const g = gamle.find(x => x.gruppe)?.gruppe; if (g) felter.gruppe = g; }
        // "Stegt kylling med nudler" → nudler er tilbehør der passer
        const kendteSider = alleSider(aiRetter());
        for (const x of ind) {
          const som = lavt(x.som), start = lavt(navn) + ' med ';
          if (!som.startsWith(start)) continue;
          for (const d of som.slice(start.length).split(/\s*(?:,| og )\s*/)) if (kendteSider.includes(d)) felter.sider = [...new Set([...(felter.sider || []), d])];
        }
        if (felter.side) felter.sider = [...new Set([felter.side, ...(felter.sider || [])])];
        const tekst = (maal ? maal.tekst : navn[0].toUpperCase() + navn.slice(1));
        return { h: { type: r.type, maaltid, navn: tekst, maalId: maal?.id || null, ind, felter },
          tekst: tekst + (maal ? '' : ' (nyt navn)') + ' ← ' + ind.map(x => x.tekst).join(' · ') + (beskriv(felter) ? ' · ' + beskriv(felter) : '') };
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
    case 'ret_ny': case 'ret_ret': case 'ret_saml': {
      // Nyt tilbehør/ekstra/fyld kommer også på de fælles lister
      const f = h.felter;
      let nyt = false;
      for (const [liste, fra] of [['sider', f.sider], ['ekstra', f.ekstra], ['fyld', f.fyld]]) {
        const mangler = (fra || []).filter(x => !hentListe(liste).map(lavt).includes(x));
        if (mangler.length) { saetListe(liste, [...hentListe(liste), ...mangler]); nyt = true; }
      }
      if (nyt) await gemTilbehoer();
      if (h.type === 'ret_ny') await Data.add('favoritter', { type: h.maaltid, tekst: h.tekst, brugt: 0, ...f });
      else if (h.type === 'ret_ret') await Data.update('favoritter', h.id, f);
      else {
        // Læg sammen med retter.js' egen funktion (madplaner, hjerter, brugt og børnevalg flyttes)
        const find = id => Data.listNu('favoritter').find(x => x.id === id);
        let ind = [...h.ind];
        let maal = h.maalId ? find(h.maalId) : null;
        if (!maal) {   // nyt navn: den første bliver til den samlede ret
          const forste = ind.shift();
          const fx = find(forste.id);
          if (!fx) throw new Error('Retten findes ikke længere');
          await omdoebIPlaner(fx, fx.tekst, forste.som || h.navn);
          await Data.update('favoritter', fx.id, { tekst: h.navn });
          maal = find(fx.id);
        }
        for (const x of ind) {
          const dub = find(x.id);
          if (dub) { await slaaSammen(dub, find(maal.id), x.som || maal.tekst); }
        }
        await Data.update('favoritter', maal.id, f);
      }
      return;
    }
    case 'madplan': {
      const d = new Date(h.dato + 'T00:00');
      await gemMad((d.getDay() + 6) % 7, h.maaltid, h.ret, isoDato(mandagFor(d)));
      return;
    }
  }
}

// ---------- Arket: en lille samtale ----------
// Samtalen huskes, til man trykker "Ny samtale" (også hvis arket lukkes og åbnes igen). Kun de seneste 12 beskeder sendes med.
let aiSamtale = [];   // [{rolle: 'user'|'assistant', tekst, forslag?: [{tekst, udfoert}]}]
const aiHistorik = () => aiSamtale.slice(-12).map(b => ({
  rolle: b.rolle,
  tekst: b.rolle === 'user' ? b.tekst : [b.tekst, ...(b.forslag || []).map(f => '- ' + f.tekst + (f.udfoert ? ' (udført)' : f.fejl ? ' (afvist af appen)' : ' (ikke udført)'))].join('\n')
}));

function aabnAI(start = '') {
  const felt = el('textarea', 'ai-felt');
  felt.rows = 2; felt.maxLength = 1500; felt.value = start;
  const log = el('div', 'ai-log');
  const eksempler = el('div', 'seg wrap ai-eksempler');
  eksempler.append(...AI_EKSEMPLER.map(t => knap(t, null, () => { felt.value = t; felt.focus(); })));
  const knapper = el('div', 'ark-knapper');
  const send = knap('➤', 'knap ai-send', () => spoerg());
  send.setAttribute('aria-label', 'Send');
  const inputRaekke = el('div', 'ai-input');
  inputRaekke.append(felt, send);
  felt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); spoerg(); } });
  let aktuelle = null;   // forslagene i det seneste svar

  function tegn() {
    log.replaceChildren();
    aiSamtale.forEach((b, nr) => {
      if (b.rolle === 'user') { log.append(el('p', 'ai-boble mig', b.tekst)); return; }
      const boks = el('div', 'ai-boble ai');
      if (b.tekst) boks.append(el('p', 'ai-besked', b.tekst));
      const sidst = nr === aiSamtale.length - 1;
      if (b.forslag?.length && !(sidst && aktuelle)) {   // ældre forslag: kort opsummering
        const n = b.forslag.filter(f => f.udfoert).length;
        boks.append(el('p', 'hint', b.forslag.length + ' forslag' + (n ? ' · ' + n + ' udført ✓' : ' · ikke udført')));
      }
      if (sidst && aktuelle) boks.append(forslagKort(b));
      log.append(boks);
    });
    eksempler.hidden = aiSamtale.length > 0;
    felt.placeholder = aiSamtale.length ? 'Skriv videre …' : 'Skriv eller tal (🎤 på tastaturet) – fx "Villads fodbold hver tirsdag 16.30–17.45"';
    knapper.replaceChildren(...(aiSamtale.length ? [knap('Ny samtale', 'knap sekundaer', () => { aiSamtale = []; aktuelle = null; tegn(); felt.focus(); })] : [knap('Luk', 'knap sekundaer', lukArk)]),
      ...(aktuelle?.udfoer ? [aktuelle.udfoer] : []));
    setTimeout(() => log.lastElementChild?.scrollIntoView({ block: 'nearest' }), 30);
  }

  function forslagKort(b) {
    const ul = el('ul', 'ai-forslag');
    const gode = b.forslag.filter(f => f.h);
    const valgt = new Set(gode);
    for (const f of b.forslag) {
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
    if (!gode.length) { aktuelle = null; return ul; }
    const udfoer = knap('', 'knap', async () => {
      let n = 0;
      for (const f of gode) {
        if (!valgt.has(f)) continue;
        try { await aiUdfoer(f.h); f.udfoert = true; n++; } catch (e) { console.error(e); visStatus('Kunne ikke gemme: ' + f.tekst, true); }
      }
      aktuelle = null;
      tegnAlt(); tegn();
      if (n) visStatus('✨ ' + (n === 1 ? 'Det er gjort' : n + ' ting er gjort') + ' – kan fortrydes under Mere → Aktivitet');
      felt.focus();
    });
    const opdater = () => { udfoer.textContent = 'Udfør' + (valgt.size > 1 ? ' (' + valgt.size + ')' : ''); udfoer.disabled = !valgt.size; };
    opdater();
    aktuelle = { udfoer };
    return ul;
  }

  async function spoerg() {
    const tekst = felt.value.trim();
    if (!tekst) { felt.focus(); return; }
    const historik = aiHistorik();
    aiSamtale.push({ rolle: 'user', tekst });
    felt.value = '';
    aktuelle = null;
    tegn();
    const vent = el('p', 'ai-taenker', '✨ Tænker …');
    log.append(vent);
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk));
    let res;
    try { res = await Data.ai(tekst, aiKontekst(), historik); }
    catch (e) {
      aiSamtale.pop(); felt.value = tekst;
      tegn();
      log.append(el('p', 'ai-fejl', 'Det gik ikke: ' + e.message));
      return;
    }
    const forslag = (res.handlinger || []).map(aiTjek);
    aiSamtale.push({ rolle: 'assistant', tekst: res.svar || '', forslag });
    aktuelle = forslag.some(f => f.h) ? {} : null;
    tegn();
    if (typeof res.tilbage === 'number' && res.tilbage < 10) log.append(el('p', 'hint', res.tilbage + ' beskeder tilbage i dag.'));
  }

  tegn();
  aabnArk('✨ Hjælper', log, eksempler, inputRaekke,
    el('p', 'hint', 'Den foreslår – du trykker "Udfør". Du kan skrive videre for at præcisere. Den kan lægge retter sammen, men sletter aldrig noget.'), knapper);
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
