// ai.js – ✨ AI-hjælperen (kun voksne).
// To slags:
//  1) Knapper til faste opgaver, der hvor de bruges: "✨ Foreslå aftensmad" (Madplan), "📷 Seddel" (Indkøb), "📷 Ugeseddel" (Kalender),
//     "✨ Ryd op med AI" (Vores lister). Hver sender én klar opgave + præcis de data, den skal bruge (aiKontekst(opgave)).
//  2) ✨-knappen øverst: korte kommandoer ("Oliver tandlæge torsdag kl. 14").
// Edge Function'en "ai" svarer med FORSLAG ({svar, handlinger}). Appen tjekker hvert forslag (aiTjek), viser kort med flueben, og først
// "Udfør" gemmer – med appens egne funktioner (aiUdfoer), så børnelås/regler gælder. AI'en sletter aldrig noget.
// Der sendes aldrig kontakter, kalender, sedler, fødselsdage eller adresse.

const AI_IKON = { kalender_ny: '📅', indkob_ny: '🛒', todo_ny: '☑️', ret_ny: '🍽️', ret_ret: '✏️', ret_saml: '🔗', madplan: '🗓️' };
const AI_OPGAVER = {
  fri: { titel: '✨ Hjælper' },
  madplan: { titel: '✨ Forslag til aftensmad', tekst: 'Foreslå aftensmad til de tomme dage.' },
  seddel: { titel: '📷 Indkøbsseddel', tekst: 'Læg varerne fra sedlen på indkøbslisten.' },
  ugeseddel: { titel: '📷 Ugeseddel', tekst: 'Lav aftaler ud fra billedet.' },
  ryd_retter: { titel: '✨ Ryd op i retterne', tekst: 'Ryd op i retterne.' }
};
const aiIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(new Date(v + 'T00:00'));
const aiTid = v => /^\d{2}:\d{2}$/.test(v || '') && Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60;
const aiT = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const aiListe = (v, n = 20) => (Array.isArray(v) ? [...new Set(v.map(x => lavt(aiT(x, 40))).filter(Boolean))].slice(0, n) : []);
const aiDag = iso => { const d = new Date(iso + 'T00:00'); return DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()].slice(0, 3) + '.'; };
const aiRetter = () => Data.listNu('favoritter').filter(f => MAAL_TYPER.includes(f.type));

// Familiens egne varenavne fra indkøbslisten (hurtigvalg), mest brugte først
const aiKendteVarer = () => {
  const set = new Map();
  for (const f of Data.listNu('favoritter').filter(f => f.type === 'indkob').sort((a, b) => (b.brugt || 0) - (a.brugt || 0))) {
    if (f.tekst && !set.has(lavt(f.tekst))) set.set(lavt(f.tekst), f.tekst.trim());
  }
  return [...set.values()];
};
// En vare fra AI'en: jeres egen stavemåde, hvis den findes – ellers stort forbogstav
// "Mælk (2 l)" → { tekst: 'Mælk', antal: '2 l' } – navnet passer med hurtigvalget, antallet står forrest på listen
function aiVare(v) {
  const m = aiT(v, 60).match(/^(.*?)\s*(?:\(([^)]*)\))?$/);
  const t = aiT(m?.[1], 40);
  if (!t) return null;
  const tekst = aiKendteVarer().find(k => lavt(k) === lavt(t)) || t[0].toUpperCase() + t.slice(1);
  return { tekst, antal: aiT(m?.[2], 12) };
}
// Det AI'en får at vide – kun det, opgaven skal bruge
async function aiKontekst(opgave = 'fri', uge = null) {
  const nu = new Date();
  const k = {
    dato: isoDato(nu), ugedag: DAGE_LANG[(nu.getDay() + 6) % 7].toLowerCase(),
    personer: PERSONER,
    kategorier: RET_GRUPPER.map(([noegle, , navn]) => ({ noegle, navn }))
  };
  const butikker = () => [...new Set(Data.listNu('favoritter').filter(f => f.type === 'butik').map(f => f.tekst))];
  if (opgave === 'fri') {
    Object.assign(k, { butikker: butikker(), varer: aiKendteVarer().slice(0, 150), retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type })) });
  } else if (opgave === 'seddel') {
    Object.assign(k, { butikker: butikker(), varer: aiKendteVarer().slice(0, 300) });
  } else if (opgave === 'madplan') {
    // Ugen der vises på Madplan: hvad står der, faste dage og dage der er gået; + retterne og hvad der er spist de sidste 3 uger
    const mandag = new Date(uge + 'T00:00');
    const plan = await madplanForUge(uge), faste = await fastAftensmad(), idag = isoDato(nu);
    k.uge = Array.from({ length: 7 }, (_, d) => {
      const dato = new Date(mandag); dato.setDate(mandag.getDate() + d);
      const iso = isoDato(dato);
      return { dato: iso, ugedag: DAGE_LANG[d].toLowerCase(), ret: plan.find(r => r.dag === d)?.ret || '', fast: faste[d] || '', gaaet: iso < idag };
    });
    const fra = new Date(mandag); fra.setDate(fra.getDate() - 21);
    k.seneste = [...new Set(Data.listNu('madplan').filter(r => !r.barn && r.ret && r.uge >= isoDato(fra) && r.uge < uge).map(r => r.ret))];
    k.retter = aiRetter().filter(f => f.type === 'ret' && !f.ikkeAuto).map(f => ({ tekst: f.tekst, maaltid: 'ret', gruppe: f.gruppe || '', sider: passerSider(f), kanLide: f.kanLide || [], brugt: f.brugt || 0 }));
  } else if (opgave === 'ryd_retter') {
    Object.assign(k, { tilbehoer: SIDER, ekstra: EKSTRA, fyld: FYLD,
      sovse: SOVSE,
      retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type, gruppe: f.gruppe || '', side: f.side || '', sider: passerSider(f), sovs: f.sovs || '', sovse: passerSovse(f), ekstra: passerEkstra(f), fyld: passerFyld(f), brugt: f.brugt || 0 })) });
  }
  return k;
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
      const set = new Map();   // samme vare to gange → den første (med evt. mængde) gælder
      for (const v of (Array.isArray(r.varer) ? r.varer : []).map(aiVare)) if (v && !set.has(lavt(v.tekst))) set.set(lavt(v.tekst), v);
      const varer = [...set.values()].slice(0, 60);
      if (!varer.length) return fejl('Ingen varer');
      const butik = Data.listNu('favoritter').find(f => f.type === 'butik' && lavt(f.tekst) === lavt(r.butik))?.tekst || '';
      return { h: { type: r.type, varer, butik }, tekst: (butik ? butik + ': ' : '') + varer.map(v => (v.antal ? v.antal + ' ' : '') + v.tekst).join(', ') };
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
      if (Array.isArray(r.sovse)) felter.sovse = aiListe(r.sovse, 12);
      if (r.sovs !== undefined) felter.sovs = lavt(aiT(r.sovs, 40)) || null;
      if (felter.sovs && felter.sovse && !felter.sovse.includes(felter.sovs)) felter.sovse.unshift(felter.sovs);
      const beskriv = (f, gammel = {}) => [
        'gruppe' in f && f.gruppe !== gammel.gruppe ? (gammel.gruppe ? GRUPPE_NAVN[gammel.gruppe] + ' → ' : '') + GRUPPE_NAVN[f.gruppe] : '',
        f.side ? 'standard: ' + f.side : '',
        f.sider?.length && !(f.sider.length === 1 && f.sider[0] === f.side) ? 'tilbehør: ' + f.sider.join(', ') : '',
        f.sovs ? 'sovs: ' + f.sovs : '',
        f.sovse?.length && !(f.sovse.length === 1 && f.sovse[0] === f.sovs) ? 'sovse: ' + f.sovse.join(', ') : '',
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
      return { h: { type: r.type, dato: r.dato, maaltid, ret }, tekst: (maaltid === 'ret' ? '' : MAALTIDER[maaltid] + ' ') + aiDag(r.dato) + ': ' + ret };
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
      for (const v of h.varer) {
        if (await tilfoejUdenDublet('indkob', { tekst: v.tekst, klaret: false, ...(v.antal ? { antal: v.antal } : {}), ...(h.butik ? { butik: h.butik } : {}) })) await gemFavorit('indkob', v.tekst);   // kommer i hurtigvalget som når man skriver selv
      }
      return;
    case 'todo_ny':
      await tilfoejUdenDublet('todo', { tekst: h.tekst, klaret: false, prio: 2, ...(h.hvem ? { hvem: h.hvem } : {}), ...(h.frist ? { frist: h.frist } : {}) });
      return;
    case 'ret_ny': case 'ret_ret': case 'ret_saml': {
      // Nyt tilbehør/ekstra/fyld kommer også på de fælles lister
      const f = h.felter;
      let nyt = false;
      for (const [liste, fra] of [['sider', f.sider], ['ekstra', f.ekstra], ['fyld', f.fyld], ['sovse', f.sovse]]) {
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

// ---------- Arket ----------
// opts: {opgave, uge (madplan), billede (data-URL), auto (send med det samme)}. Samtalen gælder kun, mens arket er åbent,
// og højst de seneste 6 beskeder sendes med – så en ny opgave altid starter rent.
function aabnAI(opts = {}) {
  const opgave = AI_OPGAVER[opts.opgave] ? opts.opgave : 'fri';
  const def = AI_OPGAVER[opgave];
  const samtale = [];   // [{rolle, tekst, foto?, forslag?}]
  const historik = () => samtale.slice(-6).map(b => ({
    rolle: b.rolle,
    tekst: b.rolle === 'user' ? (b.foto ? '[billede] ' : '') + b.tekst
      : [b.tekst, ...(b.forslag || []).map(f => '- ' + f.tekst + (f.udfoert ? ' (udført)' : f.fejl ? ' (afvist af appen)' : ' (ikke udført)'))].join('\n')
  }));
  const felt = el('textarea', 'ai-felt');
  felt.rows = 2; felt.maxLength = 1500;
  const log = el('div', 'ai-log');
  const knapper = el('div', 'ark-knapper');
  const send = knap('➤', 'knap ai-send', () => spoerg());
  send.setAttribute('aria-label', 'Send');
  const inputRaekke = el('div', 'ai-input');
  inputRaekke.append(felt, send);
  felt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); spoerg(); } });
  let aktuelle = null;   // forslagene i det seneste svar

  function tegn() {
    log.replaceChildren();
    samtale.forEach((b, nr) => {
      if (b.rolle === 'user') {
        const boble = el('div', 'ai-boble mig');
        if (b.foto) { const img = el('img', 'ai-foto-vis'); img.src = b.foto; img.alt = ''; boble.append(img); }
        if (b.vis) boble.append(el('span', null, b.vis));
        log.append(boble); return;
      }
      const boks = el('div', 'ai-boble ai');
      if (b.tekst) boks.append(el('p', 'ai-besked', b.tekst));
      const sidst = nr === samtale.length - 1;
      if (b.forslag?.length && !(sidst && aktuelle)) {
        const n = b.forslag.filter(f => f.udfoert).length;
        boks.append(el('p', 'hint', b.forslag.length + ' forslag' + (n ? ' · ' + n + ' udført ✓' : ' · ikke udført')));
      }
      if (sidst && aktuelle) boks.append(forslagKort(b));
      log.append(boks);
    });
    felt.placeholder = samtale.length ? (opgave === 'fri' ? 'Skriv videre …' : 'Ret til, fx "ikke fisk" eller "kun hverdage"')
      : opgave === 'fri' ? 'Hej ' + (Data.bruger()?.navn || '') + ' – hvad kan jeg hjælpe med?' : 'Evt. ønsker, fx "noget nemt" – eller tryk ➤';
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk), ...(aktuelle?.udfoer ? [aktuelle.udfoer] : []));
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
      lukArk(); tegnAlt();   // færdig – næste gang starter rent
      if (n) visStatus('✨ ' + (n === 1 ? 'Det er gjort' : n + ' ting er gjort') + ' – kan fortrydes under Mere → Aktivitet');
    });
    const opdater = () => { udfoer.textContent = 'Udfør' + (valgt.size > 1 ? ' (' + valgt.size + ')' : ''); udfoer.disabled = !valgt.size; };
    opdater();
    aktuelle = { udfoer };
    return ul;
  }

  async function spoerg(billede = null) {
    const skrevet = felt.value.trim();
    const foerste = !samtale.length;
    if (!skrevet && !billede && !(foerste && def.tekst)) { felt.focus(); return; }
    // Første besked i en fast opgave: opgavens tekst (+ evt. ønsker); ellers det der er skrevet
    const tekst = foerste && def.tekst ? def.tekst + (skrevet ? ' Ønsker: ' + skrevet : '') : skrevet;
    const hist = historik();
    samtale.push({ rolle: 'user', tekst, vis: skrevet || (billede ? '' : def.tekst), ...(billede ? { foto: billede } : {}) });
    felt.value = '';
    aktuelle = null;
    tegn();
    log.append(el('p', 'ai-taenker', '✨ Tænker …'));
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk));
    let res;
    try {
      const bil = billede ? { media_type: 'image/jpeg', data: billede.split(',')[1] } : null;
      res = await Data.ai(tekst, await aiKontekst(opgave, opts.uge), hist, bil, opgave);
    } catch (e) {
      samtale.pop(); felt.value = skrevet;
      tegn();
      log.append(el('p', 'ai-fejl', 'Det gik ikke: ' + e.message));
      return;
    }
    const forslag = (res.handlinger || []).map(aiTjek);
    samtale.push({ rolle: 'assistant', tekst: res.svar || (forslag.length ? '' : 'Jeg fandt ikke noget at foreslå.'), forslag });
    aktuelle = forslag.some(f => f.h) ? {} : null;
    tegn();
    if (typeof res.tilbage === 'number' && res.tilbage < 10) log.append(el('p', 'hint', res.tilbage + ' beskeder tilbage i dag.'));
  }

  tegn();
  aabnArk(def.titel, log, inputRaekke,
    el('p', 'hint', 'Intet gemmes, før du trykker "Udfør". Den sletter aldrig noget.'), knapper);
  if (opts.auto || opts.billede) spoerg(opts.billede || null);
  else setTimeout(() => felt.focus(), 50);
}

// Foto → opgave (seddel / ugeseddel): vælg eller tag et billede, så åbner arket og sender det med det samme
function aiFoto(opgave) {
  const fil = el('input');
  fil.type = 'file'; fil.accept = 'image/*';
  fil.addEventListener('change', async () => {
    if (!fil.files[0]) return;
    try { aabnAI({ opgave, billede: await laesBillede(fil.files[0], 1568, 0.8) }); }   // app.js – stort nok til håndskrift
    catch (e) { visStatus('Kunne ikke læse billedet', true); }
  });
  fil.click();
}

// Knapperne på siderne (kun voksne – Edge Function'en tjekker det også)
function aiSideKnapper() {
  const lav = (tekst, label, fn) => { const k = el('button', 'lille-knap ai-side-knap kun-voksen', tekst); k.type = 'button'; k.setAttribute('aria-label', label); k.addEventListener('click', fn); return k; };
  document.querySelector('#madplan .madplan-knapper')?.prepend(lav('✨ Foreslå aftensmad', 'Foreslå aftensmad med AI', () => {
    if (typeof aabneDage === 'function' && !aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
    aabnAI({ opgave: 'madplan', uge: madUgeIso(), auto: true });
  }));
  document.getElementById('handle-knap')?.before(lav('📷 Seddel', 'Foto af indkøbsseddel', () => aiFoto('seddel')));
  document.getElementById('kal-ny')?.before(lav('📷', 'Foto af ugeseddel', () => aiFoto('ugeseddel')));
}
aiSideKnapper();

// ✨-knappen øverst (kun voksne – Edge Function'en tjekker det også)
(() => {
  const k = el('button', 'ai-knap kun-voksen', '✨');
  k.type = 'button';
  k.setAttribute('aria-label', 'AI-hjælper');
  k.addEventListener('click', () => aabnAI());
  document.getElementById('log-ud').before(k);
})();
