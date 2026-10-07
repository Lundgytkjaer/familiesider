// familie.js – Familie: personer og hvordan de hænger sammen (familietræet).
// Én person = ét kort. Fødselsdage, familietræ og (senere) kontakter er forskellige måder at se de samme personer på.
//
// Data: 'personer' {fornavn, efternavn, kaldenavn?, koen: 'm' | 'k' | '', foedt: 'ÅÅÅÅ-MM-DD' | 'ÅÅÅÅ' | '',
//   doed?: true, doedDato?: 'ÅÅÅÅ-MM-DD', minde?: true (vis mindedag i kalenderen),
//   foraeldre: [id], partner?: id, tidligere?: [id], bruger?: 'Oliver' (hvis personen logger ind)}
// Relationen ("mormor", "faster", "svoger" …) regnes ud automatisk ud fra hvem der kigger – den gemmes aldrig.
// Personlige data lægges ind via familie.sql eller i appen – aldrig i koden.

const famKort = p => ((p.kaldenavn || p.fornavn || '').trim() || '?');
const famFuldt = p => [p.fornavn, p.efternavn].map(x => (x || '').trim()).filter(Boolean).join(' ') || famKort(p);
const famHarDato = p => /^\d{4}-\d{2}-\d{2}$/.test(p.foedt || '');
const famAar = p => (/^\d{4}/.test(p.foedt || '') ? Number(p.foedt.slice(0, 4)) : null);

// ---------- Personer og forbindelser (genberegnes kun, når personerne ændres) ----------
let famCache = { sig: null, fd: null, stier: new Map() };
async function famData() {
  const alle = await Data.list('personer');
  const sig = JSON.stringify(alle);
  if (sig === famCache.sig) return famCache.fd;
  const efterId = new Map(alle.map(p => [p.id, p]));
  const boern = new Map(), partnere = new Map(), tidl = new Map();
  const tilfoej = (m, a, b) => {
    if (!efterId.has(a) || !efterId.has(b) || a === b) return;
    if (!m.has(a)) m.set(a, new Set());
    m.get(a).add(b);
  };
  for (const p of alle) {
    for (const f of p.foraeldre || []) tilfoej(boern, f, p.id);
    if (p.partner) { tilfoej(partnere, p.id, p.partner); tilfoej(partnere, p.partner, p.id); }
    for (const t of p.tidligere || []) { tilfoej(tidl, p.id, t); tilfoej(tidl, t, p.id); }
  }
  const fd = {
    alle, efterId,
    foraeldre: id => [...new Set((efterId.get(id)?.foraeldre || []).filter(f => efterId.has(f) && f !== id))],
    boern: id => [...(boern.get(id) || [])],
    partnere: id => [...(partnere.get(id) || [])],
    tidligere: id => [...(tidl.get(id) || [])].filter(x => !partnere.get(id)?.has(x)),
    mig: navn => alle.find(p => p.bruger && p.bruger === navn) || null
  };
  fd.soeskende = id => {
    const egne = fd.foraeldre(id);
    return [...new Set(egne.flatMap(f => fd.boern(f)))].filter(x => x !== id);
  };
  famCache = { sig, fd, stier: new Map() };
  return fd;
}

// Korteste vej i familien fra én person til alle andre.
// Trin: P = op til en forælder, C = ned til et barn, S = partner, X = tidligere partner.
// Blod går foran partnere (lidt "dyrere"), så fx en søster ikke bliver til "svogers kone".
function famStier(fd, fra) {
  if (famCache.fd === fd && famCache.stier.has(fra)) return famCache.stier.get(fra);
  const VAEGT = { P: 1, C: 1, S: 1.1, X: 1.2 };
  const dist = new Map([[fra, 0]]), forrige = new Map(), faerdig = new Set();
  for (;;) {
    let u = null;
    for (const [id, d] of dist) if (!faerdig.has(id) && (u === null || d < dist.get(u))) u = id;
    if (u === null) break;
    faerdig.add(u);
    const naboer = [...fd.foraeldre(u).map(v => ['P', v]), ...fd.boern(u).map(v => ['C', v]),
      ...fd.partnere(u).map(v => ['S', v]), ...fd.tidligere(u).map(v => ['X', v])];
    for (const [t, v] of naboer) {
      const nd = dist.get(u) + VAEGT[t];
      if (!dist.has(v) || nd < dist.get(v) - 1e-9) { dist.set(v, nd); forrige.set(v, [u, t]); }
    }
  }
  const res = { forrige, dist };
  if (famCache.fd === fd) famCache.stier.set(fra, res);
  return res;
}
function famSti(stier, fra, til) {
  if (fra === til) return [];
  const trin = [];
  let x = til;
  while (x !== fra) {
    const f = stier.forrige.get(x);
    if (!f) return null;
    trin.unshift({ t: f[1], id: x });
    x = f[0];
  }
  return trin;
}

// Danske betegnelser for de almindelige relationer (null = ingen fast betegnelse)
function famBetegnelse(fd, fraId, trin) {
  const T = trin.map(x => x.t).join('');
  const p = i => fd.efterId.get(trin[i].id);
  const maal = p(trin.length - 1);
  const k = (m, kv, n) => (maal?.koen === 'm' ? m : maal?.koen === 'k' ? kv : n);
  const side = i => (p(i)?.koen === 'm' ? 'far' : p(i)?.koen === 'k' ? 'mor' : null);   // på fars eller mors side
  switch (T) {
    case 'P': return k('far', 'mor', 'forælder');
    case 'PP': return side(0) && maal?.koen ? side(0) + k('far', 'mor') : 'bedsteforælder';
    case 'PPP': return k('oldefar', 'oldemor', 'oldeforælder');
    case 'PPPP': return k('tipoldefar', 'tipoldemor', 'tipoldeforælder');
    case 'C': return k('søn', 'datter', 'barn');
    case 'CC': return 'barnebarn';
    case 'CCC': return 'oldebarn';
    case 'S': return 'partner';
    case 'X': return 'tidligere partner';
    case 'PC': {
      const a = fd.foraeldre(fraId), b = fd.foraeldre(maal.id);
      const halv = a.length >= 2 && b.length >= 2 && a.filter(x => b.includes(x)).length === 1;
      return (halv ? 'halv' : '') + k('bror', 'søster', 'søskende');
    }
    case 'PPC': {
      const s = side(0);
      if (!s || !maal?.koen) return k('onkel', 'tante', 'onkel/tante');
      return s === 'far' ? k('farbror', 'faster') : k('morbror', 'moster');
    }
    case 'PPCS': return k('onkel', 'tante', 'onkel/tante');
    case 'PPPC': case 'PPPCS': return k('grandonkel', 'grandtante', 'grandonkel/grandtante');
    case 'PPCC': return k('fætter', 'kusine', 'fætter/kusine');
    case 'PCC': return k('nevø', 'niece', 'nevø/niece');
    case 'SP': return k('svigerfar', 'svigermor', 'svigerforælder');
    case 'CS': return k('svigersøn', 'svigerdatter', 'svigerbarn');
    case 'PCS': case 'SPC': return k('svoger', 'svigerinde', 'svoger/svigerinde');
    case 'PS': return k('stedfar', 'stedmor', 'stedforælder');
    case 'SC': return k('stedsøn', 'steddatter', 'stedbarn');
    case 'PSC': return k('stedbror', 'stedsøster', 'stedsøskende');
    default: return null;
  }
}
const famGenitiv = n => (/[sxz]$/i.test(n) ? n + "'" : n + 's');
// Fuld relation – kendte betegnelser sættes sammen, fx "fars kusine" eller "Winnies farmor".
// Færrest led vinder; ved lige mange vælges det korteste første led (så "oldefars barnebarn" bliver til "fars kusine").
// Er første led en partner, der bor her, bruges navnet ("Winnies farmor" i stedet for "partners farmor").
function famRelationTekst(fd, fraId, trin) {
  if (!trin) return '';
  if (!trin.length) return 'dig';
  return famRelationDele(fd, fraId, trin).join(' ');
}
function famRelationDele(fd, fraId, trin) {
  const direkte = famBetegnelse(fd, fraId, trin);
  if (direkte) return [direkte];
  let bedst = null;
  for (let n = 1; n < trin.length; n++) {
    const hoved = famBetegnelse(fd, fraId, trin.slice(0, n));
    if (!hoved) continue;
    const midt = fd.efterId.get(trin[n - 1].id);
    const hovedTekst = hoved === 'partner' && midt?.bruger ? famKort(midt) : hoved;
    const dele = [famGenitiv(hovedTekst), ...famRelationDele(fd, midt.id, trin.slice(n))];
    if (!bedst || dele.length < bedst.length) bedst = dele;
  }
  return bedst || ['familie'];
}

// Alt om relationer set fra én person (login-navn, fx 'Oliver')
async function famSetFra(navn) {
  const fd = await famData();
  const mig = fd.mig(navn);
  const stier = mig ? famStier(fd, mig.id) : null;
  const sti = id => (stier ? famSti(stier, mig.id, id) : null);
  return {
    fd, mig,
    sti,
    relation: id => famRelationTekst(fd, mig?.id, sti(id)),   // '' = ingen forbindelse
    direkte: id => { const s = sti(id); return s && s.length ? famBetegnelse(fd, mig.id, s) : null; },
    // Kort relation til fødselsdage: "mormor" eller "Winnies stedmor" – længere kæder udelades
    kort: id => { const s = sti(id); if (!s || !s.length) return null; const d = famRelationDele(fd, mig.id, s); return d.length <= 2 ? d.join(' ') : null; },
    generation: id => { const s = sti(id); return s ? s.filter(x => x.t === 'P').length - s.filter(x => x.t === 'C').length : null; },
    afstand: id => (stier?.dist.get(id) ?? Infinity)
  };
}

// ---------- Fødselsdage: personer med fødselsdato + de gamle 'foedselsdage'-rækker ----------
// Personer vises med relationen i parentes (fx "Jonna (mormor)") – undtagen dem, der bor her.
// Afdøde vises kun, hvis en voksen har slået mindedag til.
async function foedselsListe(hvem = Data.bruger()?.navn) {
  const egne = await Data.list('foedselsdage');
  const r = await famSetFra(hvem);
  const fra = [];
  for (const p of r.fd.alle) {
    if (!famHarDato(p) || (p.doed && !p.minde)) continue;
    const rel = p.bruger ? null : r.kort(p.id);
    fra.push({ id: p.id, person: p, navn: famKort(p) + (rel ? ' (' + rel + ')' : ''), dato: p.foedt, minde: !!p.doed, bruger: p.bruger || null });
  }
  // En gammel række med samme fornavn og dato som en person vises ikke to gange
  const fornavn = s => (s || '').trim().split(/\s+/)[0].toLowerCase();
  const rest = egne.filter(f => !(f.dato && !f.aarsdag && fra.some(x => x.dato === f.dato && fornavn(famKort(x.person)) === fornavn(f.navn))));
  return [...rest, ...fra];
}

// ---------- Siden "Familie" (under Mere) ----------
let famVisFra = null;   // hvis øjne siden ses med (login-navn)
const FAM_GRUPPER = [
  [3, 'Oldeforældre'], [2, 'Bedsteforældre'], [1, 'Forældre, onkler og tanter'], [0, 'Søskende, fætre og kusiner'],
  [-1, 'Børn, nevøer og niecer'], [-2, 'Børnebørn']
];
const famGruppe = g => (g == null ? null : Math.max(-2, Math.min(3, g)));
const FAM_FARVE = { Timmo: 'c-timmo', Winnie: 'c-winnie', Oliver: 'c-oliver', Villads: 'c-villads' };

function famFoedtTekst(p, kort = false) {
  if (!p.foedt) return '';
  const idag = new Date();
  if (!famHarDato(p)) return 'Født ' + p.foedt.slice(0, 4);
  const d = new Date(p.foedt + 'T00:00');
  if (p.doed) return (kort ? '' : 'Født ') + d.getDate() + '. ' + MDR[d.getMonth()] + ' ' + d.getFullYear();
  let alder = idag.getFullYear() - d.getFullYear();
  if (idag.getMonth() < d.getMonth() || (idag.getMonth() === d.getMonth() && idag.getDate() < d.getDate())) alder--;
  return (kort ? '🎂 ' : 'Født ') + d.getDate() + '. ' + MDR[d.getMonth()] + (kort ? '' : ' ' + d.getFullYear()) + ' · ' + alder + ' år';
}

async function tegnFamilie() {
  const boks = document.getElementById('familie-indhold');
  if (!boks) return;
  const fd = await famData();
  const husets = PERSONER.filter(n => fd.mig(n));
  if (!famVisFra || !husets.includes(famVisFra)) famVisFra = husets.includes(Data.bruger()?.navn) ? Data.bruger().navn : husets[0] || null;
  const r = await famSetFra(famVisFra);
  document.getElementById('ny-person').hidden = erBarn();

  const dele = [];
  if (!fd.alle.length) {
    dele.push(el('p', 'tom-husk', erBarn() ? 'Der er ikke lagt nogen familie ind endnu.' : 'Ingen personer endnu. Tryk "Tilføj" – eller kør familie.sql i Supabase.'));
    boks.replaceChildren(...dele);
    return;
  }
  if (husets.length > 1) {
    dele.push(el('p', 'hint fam-setfra-hint', 'Se familien fra:'),
      chipValg(husets, famVisFra, v => { famVisFra = v; tegnFamilie(); }));
  }

  const grupper = new Map();
  for (const p of fd.alle) {
    const g = r.mig ? famGruppe(r.generation(p.id)) : null;
    const n = g == null ? 'andre' : g;
    if (!grupper.has(n)) grupper.set(n, []);
    grupper.get(n).push(p);
  }
  const sorter = liste => liste.sort((a, b) => r.afstand(a.id) - r.afstand(b.id) || (famAar(a) || 9999) - (famAar(b) || 9999) || famKort(a).localeCompare(famKort(b), 'da'));
  const sektioner = [...FAM_GRUPPER, ['andre', r.mig ? 'Andre' : 'Familien']];
  for (const [n, titel] of sektioner) {
    const liste = grupper.get(n);
    if (!liste?.length) continue;
    const grid = el('div', 'fam-grid');
    for (const p of sorter(liste)) grid.append(famFlise(p, r));
    dele.push(el('h3', 'lille-titel fam-gruppe', titel), grid);
  }
  boks.replaceChildren(...dele);
}

function famFlise(p, r) {
  const b = knap('', 'fam-person' + (p.doed ? ' doed' : '') + (r.mig?.id === p.id ? ' mig' : ''), () => visPerson(p.id));
  const farve = FAM_FARVE[p.bruger];
  const avatar = el('span', 'fam-avatar ' + (farve || (p.koen === 'm' ? 'fam-m' : p.koen === 'k' ? 'fam-k' : '')), famKort(p)[0].toUpperCase());
  const tekst = el('span', 'fam-tekst');
  const rel = r.mig ? (r.mig.id === p.id ? (famVisFra === Data.bruger()?.navn ? 'Dig' : '') : r.relation(p.id)) : '';
  tekst.append(el('span', 'fam-navn', famKort(p) + (p.doed ? ' †' : '')));
  if (rel) tekst.append(el('span', 'fam-rel', rel[0].toUpperCase() + rel.slice(1)));
  const foedt = famFoedtTekst(p, true);
  if (foedt) tekst.append(el('span', 'fam-foedt', foedt));
  b.append(avatar, tekst);
  return b;
}

// Kortet for én person: relation, fødsel og familien omkring – tryk videre på de andre
async function visPerson(id) {
  const fd = await famData();
  const p = fd.efterId.get(id);
  if (!p) return;
  const fra = famVisFra || Data.bruger()?.navn;
  const r = await famSetFra(fra);
  const dele = [];
  const rel = r.mig ? r.relation(id) : '';
  if (r.mig?.id === id) dele.push(el('p', 'fam-kort-rel', fra === Data.bruger()?.navn ? 'Det er dig 🙂' : 'Det er ' + fra));
  else if (/^[A-ZÆØÅ]/.test(rel)) dele.push(el('p', 'fam-kort-rel', rel));   // fx "Winnies stedmor"
  else if (rel) dele.push(el('p', 'fam-kort-rel', (fra === Data.bruger()?.navn ? 'Din ' : famGenitiv(fra) + ' ') + rel));
  const fakta = [];
  if (p.foedt) fakta.push(famFoedtTekst(p));
  if (p.doed) fakta.push('† Død' + (p.doedDato ? ' ' + kortDag(p.doedDato) + ' ' + p.doedDato.slice(0, 4) : ''));
  if (p.doed && famHarDato(p) && !erBarn()) fakta.push(p.minde ? '🕯️ Mindedag vises i kalenderen' : 'Mindedag vises ikke i kalenderen');
  for (const f of fakta) dele.push(el('p', 'fam-fakta', f));

  const raekke = (titel, ids) => {
    if (!ids.length) return;
    const seg = el('div', 'fam-chips');
    for (const x of ids) {
      const q = fd.efterId.get(x);
      seg.append(knap(famKort(q) + (q.doed ? ' †' : ''), 'fam-chip', () => visPerson(x)));
    }
    dele.push(el('h4', 'fam-kort-titel', titel), seg);
  };
  raekke('Forældre', fd.foraeldre(id));
  raekke('Partner', fd.partnere(id));
  raekke('Søskende', fd.soeskende(id));
  raekke('Børn', fd.boern(id));
  raekke('Tidligere partner', fd.tidligere(id));

  if (!erBarn()) {
    const knapper = el('div', 'ark-knapper fam-knapper');
    knapper.append(knap('Ret', 'knap', () => redigerPerson(p)));
    const tilfoej = el('div', 'seg wrap fam-tilfoej');
    tilfoej.append(knap('+ Barn', null, () => redigerPerson({ foraeldre: [id, ...fd.partnere(id).slice(0, 1)] })));
    if (fd.foraeldre(id).length < 2) tilfoej.append(knap('+ Forælder', null, () => redigerPerson({ _barnAf: id, efternavn: p.efternavn })));
    if (!fd.partnere(id).length) tilfoej.append(knap('+ Partner', null, () => redigerPerson({ partner: id })));
    if (fd.foraeldre(id).length) tilfoej.append(knap('+ Søskende', null, () => redigerPerson({ foraeldre: fd.foraeldre(id), efternavn: p.efternavn })));
    dele.push(knapper, tilfoej);
  }
  aabnArk(famFuldt(p), ...dele);
}

// Vælg en person fra listen (eller ingen)
function famVaelger(id, fd, valgt, udenId, tomTekst = 'Ingen') {
  const s = el('select', 'fam-vaelg');
  s.id = id;
  s.append(new Option(tomTekst, ''));
  const liste = fd.alle.filter(q => q.id !== udenId)
    .sort((a, b) => famFuldt(a).localeCompare(famFuldt(b), 'da'));
  for (const q of liste) s.append(new Option(famFuldt(q) + (famAar(q) ? ' (' + famAar(q) + ')' : ''), q.id, false, q.id === valgt));
  s.value = valgt && fd.efterId.has(valgt) ? valgt : '';
  return s;
}

async function redigerPerson(p) {
  if (erBarn()) return;
  const fd = await famData();
  const ny = !p.id;
  const fornavn = input('text', 'p-fornavn', p.fornavn, 'Fx Jonna');
  const efternavn = input('text', 'p-efternavn', p.efternavn, 'Fx Hansen');
  const kaldenavn = input('text', 'p-kaldenavn', p.kaldenavn, 'Hvis hun/han kaldes noget andet');
  let koen = p.koen || '';
  const koenValg = chipValg(['m', 'k'], koen, v => { koen = v; }, v => ({ m: 'Mand / dreng', k: 'Kvinde / pige' })[v]);
  const foedt = input('date', 'p-foedt', famHarDato(p) ? p.foedt : '');
  const aar = input('text', 'p-aar', famHarDato(p) ? '' : (p.foedt || '').slice(0, 4), 'Fx 1956');
  aar.inputMode = 'numeric'; aar.maxLength = 4;

  const doedLabel = el('label', 'check');
  const doed = el('input'); doed.type = 'checkbox'; doed.id = 'p-doed'; doed.checked = !!p.doed;
  doedLabel.append(doed, 'Død');
  const doedDato = input('date', 'p-doeddato', p.doedDato);
  const mindeLabel = el('label', 'check');
  const minde = el('input'); minde.type = 'checkbox'; minde.id = 'p-minde'; minde.checked = !!p.minde;
  mindeLabel.append(minde, '🕯️ Vis mindedag i kalenderen (på fødselsdagen)');
  const doedDel = el('div', 'fam-doed-del');
  doedDel.append(felt('Dødsdato (hvis I kender den)', doedDato), mindeLabel);
  const visDoed = () => { doedDel.hidden = !doed.checked; };
  doed.addEventListener('change', visDoed); visDoed();

  const nuForaeldre = (p.foraeldre || []).filter(f => fd.efterId.has(f));
  const mor = famVaelger('p-mor', fd, nuForaeldre.find(f => fd.efterId.get(f).koen === 'k') || nuForaeldre[1] || '', p.id, 'Ikke valgt');
  const far = famVaelger('p-far', fd, nuForaeldre.find(f => fd.efterId.get(f).koen === 'm' && f !== mor.value) || nuForaeldre.find(f => f !== mor.value) || '', p.id, 'Ikke valgt');
  const partner = famVaelger('p-partner', fd, p.partner || (p.id ? fd.partnere(p.id)[0] : '') || '', p.id);
  const foersteTidl = (p.id ? fd.tidligere(p.id)[0] : (p.tidligere || [])[0]) || '';
  const tidligere = famVaelger('p-tidligere', fd, foersteTidl, p.id);

  const bruger = el('select', 'fam-vaelg');
  bruger.id = 'p-bruger';
  bruger.append(new Option('Nej', ''));
  for (const n of PERSONER.filter(n => n !== 'Fælles')) bruger.append(new Option(n, n, false, p.bruger === n));
  bruger.value = p.bruger || '';

  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const gem = knap('Gem', 'knap', async () => {
    const fn = fornavn.value.trim();
    if (!fn) { fornavn.focus(); return; }
    const aarTal = aar.value.trim();
    if (!foedt.value && aarTal && !/^\d{4}$/.test(aarTal)) { fejl.textContent = 'Skriv årstallet med 4 cifre, fx 1956.'; fejl.hidden = false; return; }
    const optaget = bruger.value && fd.alle.find(q => q.bruger === bruger.value && q.id !== p.id);
    if (optaget) { fejl.textContent = bruger.value + ' er allerede ' + famFuldt(optaget) + '.'; fejl.hidden = false; return; }
    const felter = {
      fornavn: fn, efternavn: efternavn.value.trim(), kaldenavn: kaldenavn.value.trim(), koen,
      foedt: foedt.value || aarTal || '',
      doed: doed.checked, doedDato: doed.checked ? doedDato.value : '', minde: doed.checked && minde.checked,
      foraeldre: [mor.value, far.value].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i),
      partner: partner.value || null,
      // Kun den første tidligere partner vises i feltet – evt. flere bevares
      tidligere: [...new Set([...(p.tidligere || []).filter(x => x !== foersteTidl && fd.efterId.has(x)), tidligere.value])].filter(x => x && x !== partner.value),
      bruger: bruger.value || null
    };
    let pid = p.id;
    if (ny) pid = (await Data.add('personer', felter)).id;
    else await Data.update('personer', pid, felter);
    await famPartnerSymmetri(fd, pid, p.partner || (p.id ? fd.partnere(p.id)[0] : null), felter.partner);
    if (p._barnAf) {
      const barn = fd.efterId.get(p._barnAf);
      if (barn) await Data.update('personer', barn.id, { foraeldre: [...new Set([...(barn.foraeldre || []), pid])] });
    }
    lukArk(); tegnAlt();
    if (!ny || p._barnAf || p.partner || p.foraeldre) setTimeout(() => visPerson(p._barnAf || pid), 60);
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => {
    await Data.remove('personer', p.id);
    lukArk(); tegnAlt();
  }));
  knapper.append(gem);

  aabnArk(ny ? 'Ny person' : 'Ret ' + famKort(p),
    felt('Fornavn', fornavn), felt('Efternavn', efternavn), felt('Kaldes (valgfrit)', kaldenavn), felt('Køn', koenValg),
    felt('Født', foedt), felt('… eller kun årstal', aar),
    el('div', 'fam-mellem'), doedLabel, doedDel,
    felt('Mor', mor), felt('Far', far), felt('Partner nu', partner), felt('Tidligere partner', tidligere),
    felt('Logger ind på Familietavlen som', bruger),
    el('p', 'hint', 'Relationer som "mormor" og "svoger" regnes ud af sig selv ud fra forældre og partnere. Har personen en fødselsdato, kommer fødselsdagen automatisk i kalenderen.'),
    fejl, knapper);
  if (ny) setTimeout(() => fornavn.focus(), 50);
}

// Partnere peger på hinanden: sættes A's partner til B, får B også A (og B's gamle partner slippes)
async function famPartnerSymmetri(fd, id, gammel, ny) {
  if (gammel && gammel !== ny) {
    const g = fd.efterId.get(gammel);
    if (g && g.partner === id) await Data.update('personer', gammel, { partner: null });
  }
  if (ny) {
    const n = fd.efterId.get(ny);
    if (n && n.partner !== id) {
      if (n.partner && n.partner !== id) {
        const x = fd.efterId.get(n.partner);
        if (x && x.partner === ny) await Data.update('personer', x.id, { partner: null });
      }
      await Data.update('personer', ny, { partner: id });
    }
  }
}

document.getElementById('ny-person')?.addEventListener('click', () => redigerPerson({}));
