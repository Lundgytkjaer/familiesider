// ai.js – ✨ AI-hjælperen (kun voksne).
// To slags:
//  1) Knapper til faste opgaver, der hvor de bruges: "✨ Foreslå aftensmad" (Madplan), "📷 Seddel" (Indkøb), "📷 Ugeseddel" (Kalender),
//     "✨ Ryd op med AI" (Vores lister). Hver sender én klar opgave + præcis de data, den skal bruge (aiKontekst(opgave)).
//     "🏫 Ændring i skolen" (Skoleskema, Kalender, "Ændring" på skolekortet): besked fra Aula/sms/mail/seddel → særlig skoledag,
//     fri, huskeseddel på tavlen, to do med frist, barnets mad den dag. Sender kun de valgte børns normale skema (fag og tider).
//  2) ✨-knappen øverst: korte kommandoer ("Oliver tandlæge torsdag kl. 14") – en omstilling finder den rigtige opgave.
//     Værktøjskasse + opslag (2026-10-19q): opgaven 'fri' får kalenderens aftaler med (aiOpslagAftaler – kalender + kalender_voksne,
//     aldrig "Kun mig"), som Edge Function'en SLÅR OP i (find_aftaler), så den kan rette/flytte/aflyse en aftale (kalender_ret)
//     og svare på spørgsmål om kalenderen. Dataene går ikke i prompten – AI'en ser kun svarene på sine opslag.
//     Trin 2 (2026-10-19r): også skoledage (aiOpslagSkole), madplan (aiOpslagMad), to do og indkøb (aiOpslagLister) –
//     så ✨ kan svare på "hvornår har Villads fri torsdag?" og "hvad skal vi spise i morgen?".
//     Trin 3 (2026-10-19u): opgaverne 'invitation' (→ aftale + to do "køb gave"/"svar" + Det sker) og 'opskrift'
//     (foto/link/tekst → opskrift_ny koblet til en ret, evt. ret_ny og indkøb; Edge Function'en henter selv linket).
//     Trin 4 (2026-10-19v): 'fri' kan oprette pligter, rutiner, ting på pakkelister og noter i Familiemappen (slår op i
//     pligter/rutiner og pakkelister først); opgaven 'mappe' (foto/PDF af et dokument → note med billedet/PDF'en).
//     ✨ som søgning (2026-10-20h): opslag i Familiemappen (find_noter – Alle + Kun voksne, aldrig Kun mig) og opskrifter (find_opskrifter).
//     Trin 5: det ✨ ikke kunne, gemmes af Edge Function'en (ai_oensker) og kan ses under "💡 Det ✨ ikke kunne" i arket.
// Edge Function'en "ai" svarer med FORSLAG ({svar, handlinger}). Appen tjekker hvert forslag (aiTjek), viser kort med flueben, og først
// "Udfør" gemmer – med appens egne funktioner (aiUdfoer), så børnelås/regler gælder. Sletning/aflysning kun som fravalgt forslag,
// der skal vælges aktivt. Der sendes aldrig kontakter, "Kun mig"-aftaler, sedler, fødselsdage, budget, dagbog eller adresse.

const AI_IKON = { kalender_ny: '📅', kalender_ret: '✏️', opskrift_ny: '📖', pligt_ny: '⭐', rutine_ny: '🕖', pakke_ny: '🧳', note_ny: '📁', indkob_ny: '🛒', todo_ny: '☑️', ret_ny: '🍽️', ret_ret: '✏️', ret_saml: '🔗', madplan: '🗓️',
  skoledag_ny: '🏫', fri_ny: '😎', info_ny: '📌', madplan_barn: '🍕' };
const AI_OPGAVER = {
  fri: { titel: '✨ Hjælper' },
  madplan: { titel: '✨ Forslag til aftensmad', tekst: 'Foreslå aftensmad til de tomme dage.' },
  seddel: { titel: '📷 Indkøbsseddel', tekst: 'Læg varerne fra sedlen på indkøbslisten.', foto: 'kun' },
  ugeseddel: { titel: '📷 Ugeseddel', tekst: 'Lav aftaler ud fra billedet.', foto: 'kun' },
  ryd_retter: { titel: '✨ Ryd op i retterne', tekst: 'Ryd op i retterne.' },
  invitation: { titel: '🎉 Invitation', foto: 'ogsaa' },
  opskrift: { titel: '📖 Ny opskrift', foto: 'ogsaa' },
  mappe: { titel: '📁 Gem i Familiemappen', foto: 'ogsaa' },
  skole: { titel: '✨ Ændring i skolen', foto: 'ogsaa' }   // ingen fast tekst: beskeden skal indsættes (eller et foto)
};
let aiSkoleBoern = [...BOERN];   // de børn, der er valgt i "Ændring i skolen" (bruges, hvis AI'en ikke nævner nogen)
// Børn i et forslag: kun Oliver/Villads; "Fælles"/ingen = de valgte børn
const aiBoern = v => {
  const navne = [...new Set((Array.isArray(v) ? v : [v]).map(x => BOERN.find(b => lavt(b) === lavt(aiT(x, 20)))).filter(Boolean))];
  return navne.length ? navne : [...aiSkoleBoern];
};
// "9:00", "09.00", "9" → "09:00" (ellers '')
const aiKl = v => { const m = String(v ?? '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/); if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return ''; return m[1].padStart(2, '0') + ':' + (m[2] || '00'); };
const aiIso = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !isNaN(new Date(v + 'T00:00'));
const aiTid = v => /^\d{2}:\d{2}$/.test(v || '') && Number(v.slice(0, 2)) < 24 && Number(v.slice(3)) < 60;
const aiT = (v, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const aiListe = (v, n = 20) => (Array.isArray(v) ? [...new Set(v.map(x => lavt(aiT(x, 40))).filter(Boolean))].slice(0, n) : []);
const aiDag = iso => { const d = new Date(iso + 'T00:00'); return DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase() + ' ' + d.getDate() + '. ' + MDR_LANG[d.getMonth()].slice(0, 3) + '.'; };
const aiRetter = () => Data.listNu('favoritter').filter(f => MAAL_TYPER.includes(f.type));

// ---------- Opslag: kalenderen ----------
// Aftaler AI'en må se (alle + kun voksne – ALDRIG 'kalender_privat'), med listen de ligger i
const aiKalRaekker = () => [...Data.listNu('kalender'), ...Data.listNu('kalender_voksne').map(a => ({ ...a, _voksne: true }))];
// Hver gang en aftale sker (gentagne udregnet) fra 30 dage tilbage til et år frem – til opslag i Edge Function'en
function aiOpslagAftaler(fra = plusDage(isoDato(new Date()), -30), til = plusDage(isoDato(new Date()), 365)) {
  const ud = [];
  const raekker = aiKalRaekker().filter(a => a.dato && a.dato <= til && (!a.gentag ? (a.tilDato || a.dato) >= fra : !a.gentagTil || a.gentagTil >= fra));
  for (let iso = fra; iso <= til && ud.length < 2500; iso = plusDage(iso, 1)) {
    for (const a of raekker) {
      if (forekomstStart(a, iso) !== iso) continue;   // kun den dag, den starter
      ud.push({ id: a.id, dato: iso, ...(a.tilDato && a.tilDato > a.dato ? { til: plusDage(iso, dageMellem(a.dato, a.tilDato)) } : {}),
        tid: a.tid || '', slut: a.slut || '', titel: a.titel || skoledagTitel(a), hvem: personerI(a), note: a.note || '',
        ...(a.gentag ? { gentag: a.gentag } : {}), ...(a.fri ? { fri: true } : {}), ...(a.type ? { type: a.type } : {}), ...(a._voksne ? { voksne: true } : {}) });
    }
  }
  return ud;
}
// Børnenes skoledage (7 dage tilbage – 60 frem): fri med grund, eller mødetid/fri-tid/fag + særlig skoledag og noter
async function aiOpslagSkole(fra = plusDage(isoDato(new Date()), -7), til = plusDage(isoDato(new Date()), 60)) {
  const aftaler = await Data.list('kalender'), ud = [];
  for (const barn of BOERN) {
    const uge = await Promise.all([0, 1, 2, 3, 4].map(d => dagensTimer(barn, d)));
    const fastFriDag = await Promise.all([0, 1, 2, 3, 4].map(d => fastFri(barn, d)));
    for (let iso = fra; iso <= til; iso = plusDage(iso, 1)) {
      const dag = (tilDag(iso).getDay() + 6) % 7;
      const x = { barn, dato: iso, ugedag: DAGE_LANG[dag].toLowerCase() };
      const h = dag < 5 && helligdagDen(iso), f = dag < 5 && friDen(aftaler, iso, barn);
      const fri = dag >= 5 ? 'weekend' : h ? h.navn : f ? (FRAVAER[f.type]?.titel || f.titel) : fastFriDag[dag] ? 'fast fridag' : '';
      if (fri) { ud.push({ ...x, fri }); continue; }
      const s = skoledagDen(aftaler, iso, barn), d = fletSkoledag(uge[dag], s);
      const tidlig = aftalerDen(aftaler, iso, [barn]).find(a => a.type === 'tidlig' && a.tid);
      const kl = t => { const m = tidSomMin(visTid(t))[0]; return m == null ? null : m; };   // "8.00" / "08:00" → minutter
      const slut = kl(d.slut), tidligMin = tidlig ? kl(tidlig.tid) : null;
      const fag = [...new Set(d.timer.filter(t => !t.saerlig).map(t => t.fag).filter(Boolean))];
      ud.push({ ...x, moede: kl(d.start) == null ? '' : tilKl(kl(d.start)),
        fri_kl: tidligMin != null && (slut == null || tidligMin < slut) ? tilKl(tidligMin) : slut == null ? '' : tilKl(slut),
        fag, ...(!fag.length && !s ? { skema: 'ikke lagt ind' } : {}),
        ...(tidlig ? { tidlig: 'tidligere fri kl. ' + visTid(tidlig.tid) + (tidlig.note ? ' – ' + tidlig.note : '') } : {}),
        ...(s ? { saerlig: skoledagTitel(s), program: (s.program || []).map(p => visTider(p.tid) + ' ' + p.tekst) } : {}),
        noter: [...d.timer.flatMap(t => (t.noter || []).map(n => t.fag + ': ' + n)), ...d.noter.map(n => (n.fag ? n.fag + ': ' : '') + n.tekst)],
        ...(s?.note ? { note: s.note } : {}) });
    }
  }
  return ud;
}
// Madplanen (7 dage tilbage – 14 frem): familiens aftensmad + hvert barns morgenmad og frokost (som på tavlen)
async function aiOpslagMad(fra = plusDage(isoDato(new Date()), -7), til = plusDage(isoDato(new Date()), 14)) {
  const datoer = [];
  for (let iso = fra; iso <= til; iso = plusDage(iso, 1)) datoer.push(iso);
  return Promise.all(datoer.map(async iso => {
    const d = new Date(iso + 'T00:00'), f = await madFor(d);
    const boern = {};
    for (const barn of BOERN) { const m = await madFor(d, barn); boern[barn] = { morgen: m.visning.morgen || m.morgen || '', frokost: m.visning.frokost || m.frokost || '' }; }
    return { dato: iso, ugedag: DAGE_LANG[(d.getDay() + 6) % 7].toLowerCase(), aftensmad: f.visning.ret || f.ret || '', boern };
  }));
}
// To do og indkøb – det der ikke er klaret/købt
const aiOpslagLister = () => ({
  todo: Data.listNu('todo').filter(t => !t.klaret).map(t => ({ tekst: t.tekst, hvem: t.hvem || '', frist: t.frist || '', prio: t.prio || 2 })),
  indkob: Data.listNu('indkob').filter(v => !v.klaret).map(v => ({ tekst: v.tekst, antal: v.antal || '', butik: v.butik || '' }))
});
// Alle opslag på én gang – går én del galt, sendes resten alligevel (AI'en får så bare ingen data for den del)
async function aiOpslagAlle() {
  const proev = async (navn, fn) => { try { return await fn(); } catch (e) { console.error('✨ opslag ' + navn, e); return []; } };
  const [aftaler, skole, mad, lister] = await Promise.all([proev('aftaler', aiOpslagAftaler), proev('skole', aiOpslagSkole), proev('mad', aiOpslagMad), proev('lister', aiOpslagLister)]);
  const ekstra = (() => { try { return aiOpslagPligterOgPak(); } catch (e) { console.error('✨ opslag pligter', e); return {}; } })();
  const viden = (() => { try { return aiOpslagViden(); } catch (e) { console.error('✨ opslag noter', e); return {}; } })();
  return { aftaler, skole, mad, todo: lister.todo || [], indkob: lister.indkob || [], ...ekstra, ...viden };
}
// ✨ som søgning (2026-10-20h): Familiemappen (Alle + Kun voksne – ALDRIG "Kun mig") og opskrifter, som AI'en kan slå op i
function aiOpslagViden() {
  const blokTekst = b => b.type === 'tekst' ? b.tekst || '' : b.type === 'tjek' ? (b.punkter || []).map(p => (p.klaret ? '☑ ' : '☐ ') + p.tekst).join('\n')
    : b.type === 'tabel' ? [(b.kolonner || []).join(' | '), ...(b.raekker || []).map(r => r.join(' | '))].join('\n') : b.type === 'fil' ? '[fil: ' + (b.navn || '') + ']' : b.type === 'billede' ? '[billede]' : '';
  const noter = ['noter', 'noter_voksne'].flatMap(l => Data.listNu(l).map(n => ({ titel: n.titel || '', mappe: n.mappe || 'Andet', hvem: n.hvem || [],
    tekst: noteBlokke(n).map(blokTekst).filter(Boolean).join('\n').slice(0, 2500), ...(n.skjult ? { skjult: n.skjult } : {}), ...(l === 'noter_voksne' ? { kun_voksne: true } : {}), rettet: (n.rettet || n.oprettet || '').slice(0, 10) })));
  const opskrifter = Data.listNu('opskrifter').map(o => ({ titel: o.titel, ret: o.ret ? (Data.listNu('favoritter').find(f => f.id === o.ret)?.tekst || '') : '',
    portioner: o.portioner || null, tid: o.tid || null, ingredienser: o.ingredienser || [], fremgang: o.fremgang || [], note: o.note || '', kilde: o.kilde || '' }));
  return { noter, opskrifter };
}
// Pligter, rutiner og pakkelister – kort beskrevet, så AI'en kan se, hvad der findes
const AI_UGEDAGE = ['mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag'];
const aiDageTekst = x => (DAGTYPER[x.dagtype] ? DAGTYPER[x.dagtype].navn.toLowerCase() : Array.isArray(x.dage) && x.dage.length && x.dage.length < 7 ? x.dage.map(d => AI_UGEDAGE[d]).join(', ') : 'alle dage');
function aiOpslagPligterOgPak() {
  const idag = isoDato(new Date());
  const pligter = Data.listNu('opgaver').map(o => ({ hvem: o.barn, navn: o.navn,
    hvor_tit: o.gentag === 'uge' ? 'én gang om ugen' : o.gentag === 'engang' ? 'kun én gang' : o.gentag === 'interval' ? 'hver ' + (o.interval || '?') + '. dag' : 'på dage',
    dage: o.gentag === 'dag' || !o.gentag ? aiDageTekst(o) : '', kr: o.kr || 0, stjerner: o.stjerner || 0, bonus: !!o.frivillig, pause: typeof punktPauset === 'function' && punktPauset(o, idag) }));
  const rutiner = Data.listNu('rutiner').map(r => ({ hvem: r.barn, navn: r.navn, hvornaar: DAGSDELE[r.dagsdel] ? DAGSDELE[r.dagsdel].navn.toLowerCase() : r.tid ? 'kl. ' + visTid(r.tid) : '',
    dage: aiDageTekst(r), trin: (r.trin || []).map(t => t.tekst).filter(Boolean) }));
  const punkter = Data.listNu('pakkepunkter');
  const pakkelister = Data.listNu('pakkelister').map(l => ({ navn: l.navn, ting: punkter.filter(p => p.liste === l.id)
    .map(p => p.tekst + [p.kategori, p.hvem, ...(p.kun || []).map(k => 'kun ' + k)].filter(Boolean).map(x => ' · ' + x).join('')) }));
  return { pligter, rutiner, pakkelister };
}
// Mapper i Familiemappen (faste + dem, der er brugt)
const aiMapper = () => [...new Set([...(typeof MAPPE_IKON === 'object' ? Object.keys(MAPPE_IKON) : []), ...['noter', 'noter_voksne'].flatMap(l => Data.listNu(l).map(n => n.mappe).filter(Boolean))])].filter(m => m !== 'Huskesedler');
// CPR-, konto- og kortnumre må aldrig ind i en note fra AI'en
const aiUdenNumre = t => String(t || '').replace(/\b\d{6}[- ]?\d{4}\b/g, '(står på billedet)').replace(/\b(?:\d[ -]?){12,19}\b/g, '(står på billedet)').replace(/\b\d{4}[ -]\d{6,10}\b/g, '(står på billedet)');
const mappeIkonSikker = m => (typeof mappeIkon === 'function' ? mappeIkon(m) : '📁');
const aiFindAftale = id => aiKalRaekker().find(a => String(a.id) === String(id)) || null;
const aiAftaleTekst = (a, iso) => aiDag(iso) + (a.tid ? ' kl. ' + klTekst(a) : '');

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
// Nyere svar: {navn, antal?, oeko?, pris?, vigtig?, note?, usikker?} – "Ø" = økologisk → "Øko …", pris = tilbudspris
function aiVare(v) {
  const o = v && typeof v === 'object' ? v : { navn: v };
  const m = aiT(o.navn, 60).match(/^(.*?)\s*(?:\(([^)]*)\))?$/);
  let t = aiT(m?.[1], 40);
  if (!t) return null;
  if (o.oeko && !/^øko/i.test(t)) t = 'Øko ' + t[0].toLowerCase() + t.slice(1);
  const tekst = aiKendteVarer().find(k => lavt(k) === lavt(t)) || t[0].toUpperCase() + t.slice(1);
  const pris = aiT(o.pris, 20);
  return { tekst, antal: aiT(o.antal, 12) || aiT(m?.[2], 12), vigtig: !!o.vigtig, pris: pris && !/kr/i.test(pris) ? pris + ' kr' : pris,
    note: aiT(o.note, 80), usikker: aiT(o.usikker, 60) };
}
const aiVareTekst = v => (v.vigtig ? '★ ' : '') + (v.antal ? v.antal + ' ' : '') + v.tekst + (v.pris ? ' (tilbud ' + v.pris + ')' : '') + (v.note ? ' – ' + v.note : '') + (v.usikker ? ' ❓' : '');
// Det AI'en får at vide – kun det, opgaven skal bruge
async function aiKontekst(opgave = 'fri', uge = null, ekstra = {}) {
  const nu = new Date();
  const k = {
    dato: isoDato(nu), ugedag: DAGE_LANG[(nu.getDay() + 6) % 7].toLowerCase(),
    personer: PERSONER,
    kategorier: RET_GRUPPER.map(([noegle, , navn]) => ({ noegle, navn }))
  };
  const butikker = () => [...new Set(Data.listNu('favoritter').filter(f => f.type === 'butik').map(f => f.tekst))];
  if (opgave === 'fri') {
    Object.assign(k, { butikker: butikker(), varer: aiKendteVarer().slice(0, 150), retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type })),
      mapper: aiMapper(), opslag: await aiOpslagAlle() });   // kun til opslag – kommer ikke i prompten
  } else if (opgave === 'mappe') {
    k.personer = [...PERSONER, 'Alfie']; k.mapper = aiMapper();
  } else if (opgave === 'invitation') {
    const hvor = aiHvorErJeg();
    Object.assign(k, { ...(hvor.barn ? { valgtBarn: hvor.barn } : {}), opslag: { aftaler: aiOpslagAftaler() } });
  } else if (opgave === 'opskrift') {
    Object.assign(k, { varer: aiKendteVarer().slice(0, 150), butikker: butikker(),
      retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type, gruppe: f.gruppe || '' })), opskrifter: Data.listNu('opskrifter').map(o => o.titel) });
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
    k.seneste = [...new Set(Data.listNu('madplan').filter(r => !r.barn && r.ret && !r.ude && r.uge >= isoDato(fra) && r.uge < uge).map(r => r.ret))];
    k.retter = aiRetter().filter(f => passerTil(f, 'ret') && !f.ikkeAuto).map(f => ({ tekst: f.tekst, maaltid: 'ret', gruppe: f.gruppe || '', sider: passerSider(f), kanLide: f.kanLide || [], brugt: f.brugt || 0 }));
  } else if (opgave === 'skole') {
    // De valgte børns normale uge (mødetid, fri-tid, fag) + hvad der allerede er lagt ind, så det ikke kommer to gange
    const boern = (ekstra.boern || BOERN).filter(b => BOERN.includes(b));
    k.personer = [...boern, ...PERSONER.filter(p => !BOERN.includes(p))];
    k.boern = await Promise.all(boern.map(async navn => ({ navn, uge: await Promise.all([0, 1, 2, 3, 4].map(async d => {
      const alle = await dagensTimer(navn, d), { start, slut } = skoleTider(alle);
      return { ugedag: DAGE_LANG[d].toLowerCase(), moede: start, fri: slut, fridag: await fastFri(navn, d), fag: [...new Set(alle.filter(t => t.fag).map(t => t.fag))] };
    })) })));
    const idag = isoDato(nu), slut = new Date(nu); slut.setDate(slut.getDate() + 60);
    const iBoern = a => personerI(a).some(p => p === 'Fælles' || boern.includes(p));
    // Særlige skoledage, der allerede er lagt ind – med id, så AI'en kan foreslå at ÆNDRE dem i stedet for at lave en ny
    k.eksisterende = Data.listNu('kalender').filter(a => a.type === 'skoledag' && a.dato >= idag && a.dato <= isoDato(slut) && iBoern(a))
      .slice(0, 20).map(a => ({ id: a.id, dato: a.dato, hvem: personerI(a), titel: a.titel || '', program: (a.program || []).map(p => ({ tid: p.tid, tekst: p.tekst })),
        moede: a.moede || '', friKl: a.friKl || '', noter: a.noter || [], note: a.note || '' }));
    k.kommende = [
      ...Data.listNu('kalender').filter(a => a.fri && a.dato >= idag && a.dato <= isoDato(slut) && iBoern(a))
        .map(a => a.dato + ' ' + personerI(a).join('+') + ': fri ' + a.titel),
      ...Data.listNu('info').filter(x => x.dato >= idag && boern.includes(x.barn)).map(x => x.dato + ' ' + x.barn + ': husk ' + x.tekst),
      ...Data.listNu('todo').filter(t => !t.klaret && t.frist && t.frist >= idag).map(t => 'to do: ' + t.tekst)
    ].slice(0, 40);
  } else if (opgave === 'ryd_retter') {
    Object.assign(k, { tilbehoer: SIDER, ekstra: EKSTRA, fyld: FYLD,
      sovse: SOVSE,
      retter: aiRetter().map(f => ({ tekst: f.tekst, maaltid: f.type, gruppe: f.gruppe || '', side: f.side || '', sider: passerSider(f), sovs: f.sovs || '', sovse: passerSovse(f), ekstra: passerEkstra(f), fyld: passerFyld(f), brugt: f.brugt || 0 })) });
  }
  return k;
}

// Hvad er ændret i en særlig skoledag? → ["fri 13.00 → 12.00", "+ 12.00–12.30 Pizza", "− Hente pizza", …]
function aiSkoleForskel(g, h) {
  const ud = [];
  const ens = (a, b) => lavt(a) === lavt(b);
  if (g.dato !== h.dato) ud.push('flyttes til ' + aiDag(h.dato));
  if ([...personerI(g)].sort().join() !== [...h.hvem].sort().join()) ud.push('gælder ' + h.hvem.join(' og '));
  if (h.titel && !ens(g.titel, h.titel) && !ens(skoledagTitel(g), h.titel)) ud.push('hedder nu ' + h.titel);
  const tid = (f, navn) => { const a = g[f] || '', b = h[f] || ''; if (a !== b) ud.push(!b ? navn + '-tid fjernet' : navn + ' ' + (a ? visTid(a) + ' → ' : '') + visTid(b)); };
  tid('moede', 'møder'); tid('friKl', 'fri');
  const gp = (g.program || []).map(p => ({ tid: rensTid(p.tid) || p.tid, tekst: p.tekst })), hp = h.program;
  for (const p of hp) {
    const samme = gp.find(x => ens(x.tekst, p.tekst));
    if (!samme) ud.push('+ ' + visTider(p.tid) + ' ' + p.tekst);
    else if (samme.tid !== p.tid) ud.push(p.tekst + ' ' + visTider(samme.tid) + ' → ' + visTider(p.tid));
  }
  for (const p of gp) if (!hp.some(x => ens(x.tekst, p.tekst))) ud.push('− ' + p.tekst);
  const nt = n => lavt((n.fag || '') + ':' + n.tekst);
  for (const n of h.noter) if (!(g.noter || []).some(x => nt(x) === nt(n))) ud.push('+ 📝 ' + (n.fag ? n.fag + ': ' : '') + n.tekst);
  for (const n of g.noter || []) if (!h.noter.some(x => nt(x) === nt(n))) ud.push('− 📝 ' + (n.fag ? n.fag + ': ' : '') + n.tekst);
  if (!ens(g.note, h.note)) ud.push(h.note ? 'note: ' + h.note : 'note fjernet');
  return ud;
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
    case 'kalender_ret': {
      // Ret/flyt/aflys en aftale, der findes. Felter AI'en ikke sender (eller sender tomme), beholdes.
      const a = aiFindAftale(r.id);
      if (!a) return fejl('Fandt ikke aftalen');
      if (a.type === 'skoledag') return fejl(skoledagTitel(a) + ': særlige skoledage rettes under 🏫 Skole');
      const forekomst = aiIso(r.forekomst) && forekomstStart(a, r.forekomst) === r.forekomst ? r.forekomst : !a.gentag ? a.dato : null;
      if (!forekomst) return fejl(a.titel + ': fandt ikke den dag');
      const serie = a.gentag ? (r.serie === 'fremover' ? 'fremover' : 'denne') : '';
      const hvorTit = serie === 'denne' ? ' · kun denne gang' : serie === 'fremover' ? ' · fra denne gang og fremover' : '';
      const navn = a.titel + ' (' + personerI(a).join(', ') + ')';
      const h = { type: r.type, id: a.id, liste: a._voksne ? 'kalender_voksne' : 'kalender', forekomst, serie };
      if (r.aflys) {
        if (forekomst < isoDato(new Date())) return fejl(a.titel + ': dagen er gået');
        return { h: { ...h, aflys: true }, fravalgt: true, ikon: '🗑️', tekst: 'Aflys ' + navn + ' · ' + aiAftaleTekst(a, forekomst) + hvorTit };
      }
      const f = {};
      const titel = aiT(r.titel, 80); if (titel && titel !== a.titel) f.titel = titel;
      if (aiIso(r.dato) && r.dato !== forekomst) f.dato = r.dato;
      const tid = aiKl(r.tid), slut = aiKl(r.slut);
      if (tid && tid !== a.tid) {
        f.tid = tid;
        // Ny starttid uden sluttid: aftalen varer lige så længe som før
        if (!slut && a.tid && a.slut) { const [t, m] = a.tid.split(':').map(Number), [st, sm] = a.slut.split(':').map(Number), [nt, nm] = tid.split(':').map(Number);
          const s = nt * 60 + nm + (st * 60 + sm - t * 60 - m); f.slut = s > 0 && s < 1440 ? String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') : ''; }
      }
      if (slut && slut !== a.slut && slut > (f.tid || a.tid || '')) f.slut = slut;
      if (Array.isArray(r.hvem) && r.hvem.length) {
        let hvem = r.hvem.map(x => PERSONER.find(p => lavt(p) === lavt(aiT(x, 20)))).filter(Boolean);
        if (!hvem.length || hvem.includes('Fælles')) hvem = ['Fælles'];
        if ([...hvem].sort().join() !== [...personerI(a)].sort().join()) f.hvem = hvem;
      }
      const note = aiT(r.note, 300); if (note && note !== (a.note || '')) f.note = note;
      if (!Object.keys(f).length) return fejl(a.titel + ': intet at ændre');
      const nyDato = f.dato || forekomst;
      if (nyDato < isoDato(new Date())) return fejl(a.titel + ': den nye dag er gået');
      if (forekomst < isoDato(new Date()) && !f.dato) return fejl(a.titel + ': dagen er gået');
      const ny = { ...a, ...f };
      const dele = [];
      if (f.titel) dele.push('hedder nu ' + f.titel);
      if (f.dato || f.tid || 'slut' in f) dele.push(aiAftaleTekst(a, forekomst) + ' → ' + aiAftaleTekst(ny, nyDato));
      if (f.hvem) dele.push('gælder ' + f.hvem.join(', '));
      if (f.note) dele.push('note: ' + f.note);
      return { h: { ...h, felter: f }, ikon: '✏️', tekst: navn + ': ' + dele.join(' · ') + hvorTit };
    }
    case 'pligt_ny': {
      const navn = aiT(r.tekst || r.navn, 60);
      if (!navn) return fejl('Pligt uden navn');
      let hvem = [...new Set((Array.isArray(r.hvem) ? r.hvem : [r.hvem]).map(x => PERSONER.find(p => p !== 'Fælles' && lavt(p) === lavt(aiT(x, 20)))).filter(Boolean))];
      if (!hvem.length) return fejl(navn + ': hvem skal have pligten?');
      const findes = hvem.filter(b => Data.listNu('opgaver').some(o => o.barn === b && lavt(o.navn) === lavt(navn)));
      hvem = hvem.filter(b => !findes.includes(b));
      if (!hvem.length) return fejl(navn + ' findes allerede hos ' + findes.join(' og '));
      const gentag = ['dag', 'uge', 'engang'].includes(r.pligt_gentag) ? r.pligt_gentag : 'dag';
      const dagtype = gentag === 'dag' && DAGTYPER[r.dagtype] ? r.dagtype : null;
      const dage = gentag === 'dag' && !dagtype ? [...new Set((Array.isArray(r.ugedage) ? r.ugedage : []).map(d => AI_UGEDAGE.indexOf(lavt(d))).filter(d => d >= 0))].sort() : [];
      const kr = Math.max(0, Math.min(100, Math.round((Number(r.kr) || 0) * 2) / 2)), stjerner = Math.max(0, Math.min(50, Math.round(Number(r.stjerner) || 0)));
      const h = { type: r.type, navn: navn[0].toUpperCase() + navn.slice(1), hvem, gentag, dagtype, dage, kr, stjerner, frivillig: !!r.frivillig };
      // Hvem tjener kr/stjerner? (personregler – samme standard som regelFor i mere.js)
      const regelNu = b => { const x = Data.listNu('personregler').find(y => y.navn === b); return x ? { kr: !!x.kr, stjerner: !!x.stjerner } : { kr: BOERN.includes(b), stjerner: BOERN.includes(b) }; };
      const uden = f => hvem.filter(b => !regelNu(b)[f]);
      const forbehold = [kr && uden('kr').length ? uden('kr').join(' og ') + ' tjener ikke kr' : '', stjerner && uden('stjerner').length ? uden('stjerner').join(' og ') + ' tjener ikke stjerner' : ''].filter(Boolean);
      const tit = gentag === 'uge' ? 'én gang om ugen' : gentag === 'engang' ? 'kun én gang' : dagtype ? DAGTYPER[dagtype].navn.toLowerCase() : dage.length ? 'hver ' + dage.map(d => AI_UGEDAGE[d]).join(', ') : 'hver dag';
      return { h, tekst: 'Pligt: ' + h.navn + ' · ' + hvem.join(' og ') + ' · ' + tit + (kr ? ' · ' + String(kr).replace('.', ',') + ' kr' : '') + (stjerner ? ' · ★ ' + stjerner : '') + (h.frivillig ? ' · bonus' : '') + (forbehold.length ? ' (' + forbehold.join(', ') + ')' : '') + (findes.length ? ' (findes allerede hos ' + findes.join(' og ') + ')' : '') };
    }
    case 'rutine_ny': {
      const navn = aiT(r.tekst || r.navn, 60);
      if (!navn) return fejl('Rutine uden navn');
      let hvem = [...new Set((Array.isArray(r.hvem) ? r.hvem : [r.hvem]).map(x => BOERN.find(b => lavt(b) === lavt(aiT(x, 20)))).filter(Boolean))];
      if (!hvem.length) return fejl(navn + ': hvilket barn er rutinen til?');
      const findes = hvem.filter(b => Data.listNu('rutiner').some(x => x.barn === b && lavt(x.navn) === lavt(navn)));
      hvem = hvem.filter(b => !findes.includes(b));
      if (!hvem.length) return fejl(navn + ' findes allerede hos ' + findes.join(' og '));
      const dagsdel = DAGSDELE[r.dagsdel] ? r.dagsdel : null, tid = dagsdel ? '' : aiKl(r.tid);
      if (!dagsdel && !tid) return fejl(navn + ': mangler et klokkeslæt eller en del af dagen');
      const dagtype = DAGTYPER[r.dagtype] ? r.dagtype : null;
      const dage = dagtype ? [] : [...new Set((Array.isArray(r.ugedage) ? r.ugedage : []).map(d => AI_UGEDAGE.indexOf(lavt(d))).filter(d => d >= 0))].sort();
      const trin = (Array.isArray(r.trin) ? r.trin : []).map(t => aiT(t, 60)).filter(Boolean).slice(0, 15);
      if (!trin.length) return fejl(navn + ': ingen trin');
      const h = { type: r.type, navn: navn[0].toUpperCase() + navn.slice(1), hvem, tid, dagsdel, dagtype, dage: dage.length ? dage : [0, 1, 2, 3, 4, 5, 6], trin };
      return { h, tekst: 'Rutine: ' + h.navn + ' · ' + hvem.join(' og ') + ' · ' + (dagsdel ? DAGSDELE[dagsdel].navn.toLowerCase() : 'kl. ' + visTid(tid)) + ' · ' + aiDageTekst(h) + ' · ' + trin.join(' → ') };
    }
    case 'pakke_ny': {
      const navn = aiT(r.liste, 60);
      if (!navn) return fejl('Pakkeliste uden navn');
      const lister = Data.listNu('pakkelister');
      const liste = lister.find(l => lavt(l.navn) === lavt(navn)) || lister.find(l => lavt(l.navn).includes(lavt(navn)) || lavt(navn).includes(lavt(l.navn))) || null;
      const findes = new Set(liste ? Data.listNu('pakkepunkter').filter(p => p.liste === liste.id).map(p => lavt(p.tekst)) : []);
      const stort = t => t ? t[0].toUpperCase() + t.slice(1) : '';
      let gentaget = 0;
      const ting = [];
      for (const t of (Array.isArray(r.ting) ? r.ting : []).slice(0, 150)) {
        const tekst = stort(aiT(typeof t === 'string' ? t : t?.tekst, 60));
        if (!tekst) continue;
        if (findes.has(lavt(tekst))) { gentaget++; continue; }
        findes.add(lavt(tekst));
        const kat = aiT(t?.kategori, 30), kun = aiT(t?.kun, 30);
        ting.push({ tekst, kategori: PAK_KAT_ORDEN.find(k => lavt(k) === lavt(kat)) || stort(kat), hvem: PERSONER.find(p => p !== 'Fælles' && lavt(p) === lavt(aiT(t?.hvem, 20))) || '',
          kun: kun ? PAK_TURE.find(k => lavt(k) === lavt(kun)) || stort(kun) : '' });
      }
      if (!ting.length) return fejl(navn + ': ' + (gentaget ? 'det står der allerede' : 'ingen ting'));
      return { h: { type: r.type, listeId: liste?.id || null, navn: liste?.navn || stort(navn), ting },
        tekst: (liste ? liste.navn : stort(navn) + ' (ny liste)') + ': ' + ting.map(t => t.tekst).join(', ') + (gentaget ? ' (+' + gentaget + ' står der allerede)' : '') };
    }
    case 'note_ny': {
      const titel = aiUdenNumre(aiT(r.titel, 80));
      const tekst = aiUdenNumre(String(r.tekst || '').trim().slice(0, 2000));
      const tjek = (Array.isArray(r.tjek) ? r.tjek : []).map(t => aiUdenNumre(aiT(t, 120))).filter(Boolean).slice(0, 40);
      if (!titel && !tekst && !tjek.length) return fejl('Note uden indhold');
      const mapper = aiMapper(), m = aiT(r.mappe, 40);
      const mappe = mapper.find(x => lavt(x) === lavt(m)) || (m ? m[0].toUpperCase() + m.slice(1) : 'Andet');
      const hvem = [...new Set((Array.isArray(r.hvem) ? r.hvem : []).map(x => [...PERSONER, 'Alfie'].find(p => p !== 'Fælles' && lavt(p) === lavt(aiT(x, 20)))).filter(Boolean))];
      const syn = r.synlig === 'alle' ? 'alle' : 'voksne';
      return { h: { type: r.type, titel: titel || 'Note', mappe, tekst, tjek, hvem, syn },
        tekst: (mappeIkonSikker(mappe)) + ' ' + mappe + ': ' + (titel || 'Note') + (tekst ? ' · ' + tekst.split('\n')[0].slice(0, 60) : '') + (tjek.length ? ' · ☑ ' + tjek.length : '') + (hvem.length ? ' · ' + hvem.join(', ') : '') + (syn === 'voksne' ? ' · 🔒 kun voksne' : '') };
    }
    case 'opskrift_ny': {
      const titel = aiT(r.titel || r.tekst, 60);
      if (!titel) return fejl('Opskrift uden navn');
      if (Data.listNu('opskrifter').some(o => lavt(o.titel) === lavt(titel))) return fejl(titel + ' findes allerede under Opskrifter');
      const linjer = (v, n, m) => (Array.isArray(v) ? v : []).map(x => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, m)).filter(Boolean).slice(0, n);
      const ingredienser = linjer(r.ingredienser, 80, 120), fremgang = linjer(r.fremgang, 60, 600);
      if (!ingredienser.length && !fremgang.length) return fejl(titel + ': fandt hverken ingredienser eller fremgangsmåde');
      const retNavn = aiT(r.ret, 60), ret = retNavn ? aiRetter().find(f => lavt(f.tekst) === lavt(retNavn)) : null;
      const kilde = /^https?:\/\/\S+$/i.test(aiT(r.kilde, 300)) ? aiT(r.kilde, 300) : '';
      const portioner = Math.min(50, Math.round(Number(r.portioner) || 0)) || null, tid = Math.min(1440, Math.round(Number(r.minutter) || 0)) || null;
      const h = { type: r.type, titel: titel[0].toUpperCase() + titel.slice(1), retId: ret?.id || null, retNavn: ret ? ret.tekst : retNavn, portioner, tid, ingredienser, fremgang, kilde, note: aiT(r.note, 300) };
      return { h, tekst: h.titel + (h.retNavn ? ' · 🍽️ ' + h.retNavn : '') + (ingredienser.length ? ' · ' + ingredienser.length + ' ingredienser' : '') + (fremgang.length ? ' · ' + fremgang.length + ' trin' : '') + (tid ? ' · ' + tid + ' min' : '') + (portioner ? ' · ' + portioner + ' pers.' : '') };
    }
    case 'indkob_ny': {
      const set = new Map();   // samme vare to gange → den første (med evt. mængde) gælder
      for (const v of (Array.isArray(r.varer) ? r.varer : []).map(aiVare)) if (v && !set.has(lavt(v.tekst))) set.set(lavt(v.tekst), v);
      const varer = [...set.values()].slice(0, 60);
      if (!varer.length) return fejl('Ingen varer');
      const butik = Data.listNu('favoritter').find(f => f.type === 'butik' && lavt(f.tekst) === lavt(r.butik))?.tekst || '';
      return { h: { type: r.type, varer, butik }, tekst: (butik ? butik + ': ' : 'Uden butik: ') + varer.map(aiVareTekst).join(', ') };
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
    case 'skoledag_ny': {
      // Ændring af en særlig skoledag, der allerede er lagt ind (erstatter = id, ellers samme dato og samme børn)
      const kal = Data.listNu('kalender').filter(a => a.type === 'skoledag');
      const nyHvem = aiBoern(r.hvem).sort().join();
      const gammel = (r.erstatter && kal.find(a => String(a.id) === String(r.erstatter))) || (aiIso(r.dato) && kal.find(a => a.dato === r.dato && [...personerI(a)].sort().join() === nyHvem)) || null;
      if (gammel && r.aflys) return { h: { type: r.type, erstatter: gammel.id, aflys: true, dato: gammel.dato }, fravalgt: true, ikon: '🗑️',
        tekst: 'Aflys ' + skoledagTitel(gammel) + ' · ' + aiDag(gammel.dato) + ' · ' + personerI(gammel).join(' og ') };
      if (gammel) {   // felter AI'en ikke har sendt, beholdes
        for (const f of ['dato', 'titel', 'program', 'moede', 'friKl', 'noter', 'note']) if (r[f] === undefined) r = { ...r, [f]: gammel[f] };
        if (r.hvem === undefined) r = { ...r, hvem: personerI(gammel) };
      }
      if (!aiIso(r.dato)) return fejl('Ændring i skolen uden dato');
      if (r.dato < isoDato(new Date())) return fejl(aiT(r.titel, 60) || 'Ændring i skolen' + ': dagen er gået');
      const hvem = aiBoern(r.hvem);
      const program = (Array.isArray(r.program) ? r.program : []).slice(0, 15)
        .map(p => ({ tid: rensTid(aiT(p?.tid, 20)), tekst: aiT(p?.tekst, 60) })).filter(p => p.tid && p.tekst)
        .sort((a, b) => tidSomMin(a.tid)[0] - tidSomMin(b.tid)[0]);
      const noter = (Array.isArray(r.noter) ? r.noter : []).slice(0, 10).map(n => ({ fag: aiT(n?.fag, 30), tekst: aiT(n?.tekst, 120) })).filter(n => n.tekst);
      const moede = aiKl(r.moede), friKl = aiKl(r.friKl);
      if (!program.length && !moede && !friKl && !noter.length) return fejl('Ændring i skolen uden indhold');
      const h = { type: r.type, dato: r.dato, hvem, titel: aiT(r.titel, 60), program, moede, friKl: moede && friKl && friKl <= moede ? '' : friKl, noter, note: aiT(r.note, 200) };
      if (gammel) {
        h.erstatter = gammel.id;
        const forskel = aiSkoleForskel(gammel, h);
        if (!forskel.length) return fejl(skoledagTitel(gammel) + ' ' + aiDag(gammel.dato) + ': intet at ændre');
        return { h, ikon: '✏️', tekst: 'Ændrer ' + skoledagTitel(gammel) + ' · ' + aiDag(gammel.dato) + ': ' + forskel.join(' · ') };
      }
      return { h, tekst: aiDag(h.dato) + ': ' + skoledagTitel(h) + ' · ' + hvem.join(' og ')
        + (program.length ? ' · ' + program.length + (program.length === 1 ? ' punkt ' : ' punkter ') + visTider(program[0].tid.split('-')[0] + '-' + program[program.length - 1].tid.split('-')[1]) : '')
        + (moede ? ' · møder ' + visTid(moede) : '') + (h.friKl ? ' · fri ' + visTid(h.friKl) : '')
        + (h.titel || program.length ? noter.map(n => ' · 📝 ' + (n.fag ? n.fag + ': ' : '') + n.tekst).join('') : '') + (h.note ? ' · ' + h.note : '') };
    }
    case 'fri_ny': {
      if (!aiIso(r.dato)) return fejl('Fri uden dato');
      const tilDato = aiIso(r.tilDato) && r.tilDato > r.dato ? r.tilDato : null;
      if ((tilDato || r.dato) < isoDato(new Date())) return fejl('Fri: dagen er gået');
      const hvem = aiBoern(r.hvem), titel = aiT(r.titel, 60) || 'Fri fra skolen';
      return { h: { type: r.type, dato: r.dato, tilDato, hvem, titel }, tekst: 'Fri: ' + titel + ' · ' + aiDag(r.dato) + (tilDato ? ' til ' + aiDag(tilDato) : '') + ' · ' + hvem.join(' og ') };
    }
    case 'info_ny': {
      const tekst = aiT(r.tekst, 120);
      if (!tekst || !aiIso(r.dato)) return fejl('Huskeseddel uden tekst eller dato');
      if (r.dato < isoDato(new Date())) return fejl(tekst + ': dagen er gået');
      const hvem = aiBoern(r.hvem);
      return { h: { type: r.type, dato: r.dato, hvem, tekst }, tekst: 'Det sker ' + aiDag(r.dato) + ': ' + tekst + ' · ' + hvem.join(' og ') };
    }
    case 'madplan_barn': {
      const maaltid = r.maaltid === 'morgen' ? 'morgen' : 'frokost';
      const ret = aiT(r.ret || r.tekst, 80);
      if (!ret || !aiIso(r.dato)) return fejl('Mad uden ret eller dato');
      if (r.dato < isoDato(new Date())) return fejl(ret + ': dagen er gået');
      const hvem = aiBoern(r.hvem);
      return { h: { type: r.type, dato: r.dato, hvem, maaltid, ret }, tekst: MAALTIDER[maaltid] + ' ' + aiDag(r.dato) + ': ' + ret + ' · ' + hvem.join(' og ') };
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
    case 'kalender_ret': {
      // Som "Ret aftale" i kalenderen: gentagen aftale → kun denne gang = undtagelse + ny enkelt aftale; fremover = slut den gamle + ny serie
      const a = aiFindAftale(h.id);
      if (!a) throw new Error('Aftalen findes ikke længere');
      const liste = a._voksne ? 'kalender_voksne' : 'kalender';
      const { id, oprettet, _voksne, _privat, _af, undtagelser, ...gammel } = a;
      const undtag = [...(undtagelser || [])];
      const varighed = a.tilDato && a.tilDato > a.dato ? dageMellem(a.dato, a.tilDato) : 0;
      const f = { ...h.felter };
      if (f.hvem) f.hvem = f.hvem.length === 1 ? f.hvem[0] : f.hvem;
      const nyDato = f.dato || h.forekomst;
      if (h.aflys) {
        Data.huskFoer(a.id);
        if (!a.gentag || (h.serie === 'fremover' && h.forekomst === a.dato)) await Data.remove(liste, a.id);
        else if (h.serie === 'fremover') await Data.update(liste, a.id, { gentagTil: plusDage(h.forekomst, -1) });
        else await Data.update(liste, a.id, { undtagelser: [...undtag, h.forekomst] });
        return;
      }
      const datoer = { dato: nyDato, tilDato: varighed ? plusDage(nyDato, varighed) : null };
      if (!a.gentag) { await Data.update(liste, a.id, { ...f, ...(f.dato ? datoer : {}) }); return; }
      Data.huskFoer(a.id);
      if (h.serie === 'denne') {
        await Data.update(liste, a.id, { undtagelser: [...undtag, h.forekomst] });
        await Data.add(liste, { ...gammel, ...f, ...datoer, gentag: '', gentagTil: null });
      } else if (h.forekomst === a.dato) {
        await Data.update(liste, a.id, { ...f, ...datoer });
      } else {
        await Data.update(liste, a.id, { gentagTil: plusDage(h.forekomst, -1) });
        await Data.add(liste, { ...gammel, ...f, ...datoer, undtagelser: undtag.filter(d => d >= h.forekomst) });
      }
      return;
    }
    case 'pligt_ny':
      for (const b of h.hvem) {
        const regel = typeof regelFor === 'function' ? await regelFor(b) : { kr: true, stjerner: true };   // tjener personen kr/stjerner?
        await Data.add('opgaver', { navn: h.navn, gentag: h.gentag, dage: h.dage, dagtype: h.dagtype, interval: null, start: null, regnFra: null,
          kr: regel.kr ? h.kr : 0, stjerner: regel.stjerner ? h.stjerner : 0, frivillig: h.frivillig, godkend: false, barn: b });
      }
      return;
    case 'rutine_ny':
      for (const b of h.hvem) await Data.add('rutiner', { navn: h.navn, tid: h.tid, dagsdel: h.dagsdel, dagtype: h.dagtype, dage: h.dage,
        trin: h.trin.map(tekst => ({ tekst, piktogram: null, billede: '', soeg: '' })), barn: b });
      return;
    case 'pakke_ny': {
      let id = h.listeId && Data.listNu('pakkelister').some(l => l.id === h.listeId) ? h.listeId : Data.listNu('pakkelister').find(l => lavt(l.navn) === lavt(h.navn))?.id;
      if (!id) id = (await Data.add('pakkelister', { navn: h.navn })).id;
      const findes = new Set(Data.listNu('pakkepunkter').filter(p => p.liste === id).map(p => lavt(p.tekst)));
      const nye = h.ting.filter(t => !findes.has(lavt(t.tekst))).map(t => ({ liste: id, tekst: t.tekst, hvem: t.hvem, pakket: false, ...(t.kategori ? { kategori: t.kategori } : {}), ...(t.kun ? { kun: [t.kun] } : {}) }));
      if (nye.length) await Data.addMange('pakkepunkter', nye);
      return;
    }
    case 'note_ny': {
      const blokke = [];
      if (h.tekst) blokke.push({ type: 'tekst', tekst: h.tekst });
      if (h.tjek.length) blokke.push({ type: 'tjek', punkter: h.tjek.map(tekst => ({ tekst, klaret: false })) });
      if (h.foto) {   // billedet/PDF'en, AI'en læste – lægges i Storage i notens mappe
        const pdf = h.foto.startsWith('data:application/pdf');
        try {
          const blob = await (await fetch(h.foto)).blob();
          const f = await Data.uploadFil(h.syn, new File([blob], (pdf ? 'dokument.pdf' : 'billede.jpg'), { type: pdf ? 'application/pdf' : 'image/jpeg' }));
          blokke.push(pdf ? { type: 'fil', ...f, navn: h.titel.slice(0, 50) + '.pdf' } : { type: 'billede', sti: f.sti });
        } catch (e) { console.warn(e); if (!pdf) blokke.push({ type: 'billede', src: h.foto }); }
      }
      await Data.add(NOTE_LISTER[h.syn], { titel: h.titel, mappe: h.mappe, hvem: h.hvem, blokke, tekst: null, billeder: null, skjult: null, fast: false, tavle: false, rettet: new Date().toISOString() });
      return;
    }
    case 'opskrift_ny': {
      // Retten kan være lavet i samme omgang (ret_ny udføres før) – så findes den nu på navnet
      const ret = h.retId || (h.retNavn ? aiRetter().find(f => lavt(f.tekst) === lavt(h.retNavn))?.id : null) || null;
      await Data.add('opskrifter', { titel: h.titel, ret, portioner: h.portioner, tid: h.tid, ingredienser: h.ingredienser, fremgang: h.fremgang,
        note: h.note, kilde: h.kilde, billede: null, rettet: new Date().toISOString() });
      return;
    }
    case 'indkob_ny':
      for (const v of h.varer) {
        const note = [v.pris ? 'Tilbud ' + v.pris : '', v.note].filter(Boolean).join(' · ');
        if (await tilfoejUdenDublet('indkob', { tekst: v.tekst, klaret: false, ...(v.antal ? { antal: v.antal } : {}), ...(h.butik ? { butik: h.butik } : {}),
          ...(v.vigtig ? { vigtig: true } : {}), ...(v.pris ? { tilbud: true } : {}), ...(note ? { note } : {}) })) await gemFavorit('indkob', v.tekst);   // kommer i hurtigvalget som når man skriver selv
        if (h.butik) await saetFavFelter('indkob', v.tekst, { butik: h.butik });   // sedlen lærer appen, hvor varen købes
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
    case 'skoledag_ny':
      if (h.erstatter) {
        const g = Data.listNu('kalender').find(a => a.id === h.erstatter);
        if (!g) throw new Error('Den særlige skoledag findes ikke længere');
        if (h.aflys) { await Data.remove('kalender', g.id); return; }
        await Data.update('kalender', g.id, { dato: h.dato, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, titel: skoledagTitel(h),
          program: h.program, moede: h.moede, friKl: h.friKl, noter: h.noter, note: h.note });
        return;
      }
      await Data.add('kalender', { dato: h.dato, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, titel: skoledagTitel(h), type: 'skoledag', fri: false,
        tid: '', slut: '', tilDato: null, gentag: '', gentagTil: null, program: h.program, moede: h.moede, friKl: h.friKl, noter: h.noter, note: h.note });
      return;
    case 'fri_ny':
      await Data.add('kalender', { dato: h.dato, tilDato: h.tilDato, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, titel: h.titel, fri: true,
        tid: '', slut: '', note: '', gentag: '', gentagTil: null });
      return;
    case 'info_ny': {
      const findes = Data.listNu('info');
      for (const barn of h.hvem) if (!findes.some(x => x.barn === barn && x.dato === h.dato && lavt(x.tekst) === lavt(h.tekst)))
        await Data.add('info', { barn, dato: h.dato, tekst: h.tekst, gentag: '' });
      return;
    }
    case 'madplan_barn': {
      const d = new Date(h.dato + 'T00:00');
      for (const barn of h.hvem) await gemMad((d.getDay() + 6) % 7, h.maaltid, h.ret, isoDato(mandagFor(d)), barn);
      return;
    }
  }
}

// ---------- Arket ----------
// ✨ øverst er en OMSTILLING: man skriver, indsætter eller fotograferer hvad som helst. Et lille kald (opgave 'omstil') afgør,
// hvilken opgave det hører til (med hint om siden man står på, det viste barn og evt. valgt emne); er den i tvivl, spørger den.
// Derefter kaldes den rigtige opgave med sin egen instruks og kun sine data – samme forslagskort og "Udfør" som altid.
// Knapperne på siderne ("✨ Foreslå aftensmad", "✨ Ryd op med AI", skolens "✨ Læs en besked") åbner arket direkte på opgaven.
const AI_EMNER = [
  { id: 'skole', ikon: '🏫', navn: 'Skole', eks: 'Indsæt en besked fra Aula, sms eller mail – eller tag et billede af sedlen' },
  { id: 'indkob', ikon: '🛒', navn: 'Indkøb', eks: 'Fx "mælk, 2 rugbrød og æg" – eller tag et billede af sedlen' },
  { id: 'madplan', ikon: '🍽️', navn: 'Madplan', eks: 'Fx "pizza på fredag" – eller tryk ➤ for forslag til ugens aftensmad' },
  { id: 'kalender', ikon: '📅', navn: 'Kalender', eks: 'Fx "Oliver tandlæge torsdag kl. 14", "flyt tandlægen til fredag" eller "hvornår har Villads fri torsdag?"' },
  { id: 'todo', ikon: '☑️', navn: 'To do', eks: 'Fx "Ring til VVS i morgen"' },
  { id: 'invitation', ikon: '🎉', navn: 'Invitation', eks: 'Tag et billede af invitationen – eller indsæt teksten' },
  { id: 'opskrift', ikon: '📖', navn: 'Opskrift', eks: 'Indsæt et link til en opskrift – eller tag et billede af den' },
  { id: 'mappe', ikon: '📁', navn: 'Gem et dokument', eks: 'Tag et billede af fx et garantibevis, en synsprøve eller en kvittering' },
  { id: 'pligter', ikon: '⭐', navn: 'Pligter og rutiner', eks: 'Fx "Oliver tømmer opvaskeren hver tirsdag for 5 kr" eller "sengetidsrutine til Villads kl. 20"' },
  { id: 'pak', ikon: '🧳', navn: 'Pakkeliste', eks: 'Fx "pak til sommerhuset – badetøj, solcreme og Alfies mad"' }
];
// Hvor står brugeren? Siden og det barn, der vises (børnetavlen eller skemaet)
function aiHvorErJeg() {
  const side = typeof aktivFane !== 'undefined' && aktivFane ? aktivFane : 'idag';
  const barn = side === 'idag' && BOERN.includes(tavleVisning) ? tavleVisning : side === 'skema' && BOERN.includes(skemaBarn) ? skemaBarn : '';
  return { side, barn };
}
// Emne → opgave, når det kan afgøres uden AI (ellers null = spørg omstillingen)
function aiEmneOpgave(emne, skrevet, billede) {
  if (emne === 'skole') return 'skole';
  if (emne === 'indkob') return billede ? 'seddel' : 'fri';
  if (emne === 'kalender') return billede ? 'ugeseddel' : 'fri';
  if (emne === 'todo') return 'fri';
  if (emne === 'invitation' || emne === 'opskrift') return emne;
  if (emne === 'mappe') return billede ? 'mappe' : 'fri';
  if (emne === 'pligter' || emne === 'pak') return 'fri';
  if (emne === 'madplan' && !skrevet && !billede) return 'madplan';
  return null;
}

// opts: {opgave, uge (madplan), boern (skole), auto (send med det samme)}. Uden opgave = omstilling.
// Samtalen gælder kun, mens arket er åbent, og højst de seneste 6 beskeder sendes med – så en ny opgave altid starter rent.
function aabnAI(opts = {}) {
  const fast = !!AI_OPGAVER[opts.opgave];   // åbnet fra en knap på en side
  let opgave = fast ? opts.opgave : null;   // null = ikke afgjort endnu (omstilling)
  let def = opgave ? AI_OPGAVER[opgave] : { titel: '✨ Hjælper', foto: 'ogsaa' };
  let uge = opts.uge || null;
  let emne = null;   // valgt emne-chip (kun i omstillingen)
  const hvor = aiHvorErJeg();
  const erSkole = () => opgave === 'skole';
  // 🏫 Ændring i skolen: hvilke børn gælder beskeden?
  const boernValgt = new Set();
  const saetBoern = liste => { boernValgt.clear(); const ok = (liste || []).filter(b => BOERN.includes(b)); (ok.length ? ok : BOERN).forEach(b => boernValgt.add(b)); };
  saetBoern(opts.boern || (hvor.barn ? [hvor.barn] : null));
  const boernSeg = el('div', 'seg wrap ai-boern');
  const tegnBoern = () => boernSeg.replaceChildren(...BOERN.map(b => {
    const k = knap(b, null, () => { boernValgt.has(b) ? boernValgt.delete(b) : boernValgt.add(b); tegnBoern(); });
    k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', boernValgt.has(b));
    return k;
  }));
  const gaelder = el('div', 'ai-gaelder');
  gaelder.append(el('span', 'felt-label', 'Gælder'), boernSeg);
  const emneBoks = el('div', 'ai-emner');
  // 💡 Det ✨ ikke kunne (gemt af Edge Function'en) – kun i omstillingen, og kun når der er noget
  const oenskeLink = el('div', 'ai-oensker-link'); oenskeLink.hidden = true;
  if (!fast) Data.aiOensker().then(liste => {
    if (!liste.length) return;
    oenskeLink.replaceChildren(knap('💡 Det ✨ ikke kunne klare (' + liste.length + ')', 'tekst-knap', () => aiOenskerArk(liste)));
    oenskeLink.hidden = !!samtale.length;
  }).catch(() => {});
  let samtale = [];   // [{rolle, tekst, foto?, forslag?}]
  const historik = () => samtale.slice(-6).map(b => ({
    rolle: b.rolle,
    tekst: b.rolle === 'user' ? (b.foto ? '[billede] ' : '') + b.tekst
      : [b.tekst, ...(b.forslag || []).map(f => '- ' + f.tekst + (f.udfoert ? ' (udført)' : f.fejl ? ' (afvist af appen)' : ' (ikke udført)'))].join('\n')
  }));
  const felt = el('textarea', 'ai-felt');
  const log = el('div', 'ai-log');
  const knapper = el('div', 'ark-knapper');
  const send = knap('➤', 'ai-send', () => spoerg());
  send.setAttribute('aria-label', 'Send');
  const hint = el('p', 'hint');
  // Skrivefeltet: én boks i fuld bredde – evt. vedhæftet øverst, tekstfeltet, og nederst 📷 Kamera · 🖼️ Billede · 📎 Fil + ➤.
  // Det vedhæftede (billede eller PDF, som data-URL) sendes først ved ➤ – så man kan skrive en kommentar/ekstra instruks til det.
  let vedhaeftet = opts.billede || null;
  const bilagNavn = new Map();   // data-URL → filnavn (PDF)
  const skrivBoks = el('div', 'ai-skriv');
  const bilagVis = el('div', 'ai-bilag');
  const vaerktoej = el('div', 'ai-vaerktoej');
  const vedhaeft = el('div', 'ai-vedhaeft');
  const hentFil = slags => {   // 'kamera' | 'billede' | 'fil'
    const fil = el('input'); fil.type = 'file';
    fil.accept = slags === 'fil' ? 'image/*,application/pdf,.pdf,.txt,.eml,text/plain' : 'image/*';
    if (slags === 'kamera') fil.setAttribute('capture', 'environment');   // telefonens kamera (bagside) – computere viser bare filvælgeren
    fil.addEventListener('change', async () => {
      const f = fil.files[0];
      if (!f) return;
      try {
        if (f.type.startsWith('image/')) vedhaeftet = await laesBillede(f, 1568, 0.8);   // app.js – stort nok til håndskrift
        else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
          if (f.size > 4_000_000) { visStatus('PDF\'en er for stor (højst 4 MB)', true); return; }
          vedhaeftet = await new Promise((ok, fejl) => { const r = new FileReader(); r.onload = () => ok(String(r.result).replace(/^data:[^;]*;/, 'data:application/pdf;')); r.onerror = fejl; r.readAsDataURL(f); });
          bilagNavn.set(vedhaeftet, f.name);
        } else if (f.type.startsWith('text/') || /\.(txt|eml)$/i.test(f.name)) {   // tekst → ind i feltet
          const t = (await f.text()).slice(0, 6000);
          felt.value = (felt.value ? felt.value + '\n' : '') + t;
        } else { visStatus('Den filtype kan ikke læses – brug PDF, billede eller tekst', true); return; }
        tegnFoto(); felt.focus();
      } catch (e) { visStatus('Kunne ikke læse filen', true); }
    });
    fil.click();
  };
  const erPdf = d => typeof d === 'string' && d.startsWith('data:application/pdf');
  // Det vedhæftede som det sendes til Edge Function'en
  const bilag = d => d ? { media_type: d.slice(5, d.indexOf(';')), data: d.split(',')[1] } : null;
  const bilagEl = d => {
    if (erPdf(d)) return el('span', 'ai-pdf', '📄 ' + (bilagNavn.get(d) || 'PDF'));
    const img = el('img', 'ai-foto-vis'); img.src = d; img.alt = 'Billedet der sendes'; return img;
  };
  function pladsholder() {
    const eks = !opgave && emne ? AI_EMNER.find(x => x.id === emne)?.eks : '';
    felt.placeholder = vedhaeftet ? 'Evt. kommentar, fx ' + (opgave === 'seddel' || emne === 'indkob' ? '"kun Rema-varerne"' : '"det gælder kun Oliver"')
      : !opgave ? (samtale.length ? 'Svar her …' : eks || 'Hej ' + (Data.bruger()?.navn || '') + ' – hvad kan jeg hjælpe med? Skriv, indsæt en besked, tag et billede eller vælg en fil')
      : erSkole() ? (samtale.length ? 'Ret til, fx "det gælder kun Oliver" eller "ingen pizza"'
      : 'Indsæt beskeden fra skolen (Aula, sms, mail) – eller skriv selv, fx "Villads til tandlæge torsdag 10-11"')
      : opgave === 'invitation' ? (samtale.length ? 'Ret til, fx "det er kun Villads" eller "vi kan ikke komme"' : 'Tag et billede af invitationen – eller indsæt teksten')
      : opgave === 'mappe' ? (samtale.length ? 'Ret til, fx "læg den under Bil"' : 'Tag et billede af dokumentet – skriv evt. hvad det er')
      : opgave === 'opskrift' ? (samtale.length ? 'Ret til, fx "kald den Mormors lasagne"' : 'Indsæt et link til opskriften – eller tag et billede af den')
      : def.foto === 'kun' ? (samtale.length ? 'Ret til, fx "Diverse er Netto"' : 'Tag et billede eller vælg en fil – skriv evt. en kommentar')
      : samtale.length ? (opgave === 'fri' ? 'Skriv videre …' : 'Ret til, fx "ikke fisk" eller "kun hverdage"')
      : opgave === 'fri' ? 'Hej ' + (Data.bruger()?.navn || '') + ' – hvad kan jeg hjælpe med?' : 'Evt. ønsker, fx "noget nemt" – eller tryk ➤';
    const lang = !opgave || erSkole() || ['invitation', 'opskrift', 'mappe'].includes(opgave);
    felt.rows = lang ? 4 : 2; felt.maxLength = lang ? 6000 : 1500;
  }
  function tegnFoto() {
    vedhaeft.hidden = !def.foto;
    bilagVis.hidden = !vedhaeftet;
    if (vedhaeftet) bilagVis.replaceChildren(bilagEl(vedhaeftet), knap('✕', 'ai-bilag-fjern', () => { vedhaeftet = null; tegnFoto(); felt.focus(); }));
    bilagVis.lastElementChild?.setAttribute('aria-label', 'Fjern det vedhæftede');
    pladsholder();
  }
  {
    const lille = (ikon, navn, slags) => { const k = knap(ikon + ' ' + navn, 'ai-vaerktoej-knap', () => hentFil(slags)); k.title = navn; return k; };
    vedhaeft.append(lille('📷', 'Kamera', 'kamera'), lille('🖼️', 'Billede', 'billede'), lille('📎', 'Fil', 'fil'));
    vaerktoej.append(vedhaeft, send);
    skrivBoks.append(bilagVis, felt, vaerktoej);
    skrivBoks.addEventListener('click', e => { if (e.target === skrivBoks || e.target === vaerktoej) felt.focus(); });
  }
  // Emne-chips: viser hvad ✨ kan, og hjælper omstillingen (kun før første besked)
  function tegnEmner() {
    emneBoks.hidden = !!opgave || samtale.length > 0;
    if (samtale.length || opgave) oenskeLink.hidden = true;
    if (emneBoks.hidden) return;
    emneBoks.replaceChildren(...AI_EMNER.map(x => {
      const k = knap(x.ikon + ' ' + x.navn, 'ai-emne', () => { emne = emne === x.id ? null : x.id; tegnEmner(); pladsholder(); felt.focus(); });
      k.setAttribute('aria-pressed', String(emne === x.id));
      return k;
    }));
  }
  // Opgaven er afgjort: arket skifter titel, billede-knapper og evt. "Gælder"
  function saetOpgave(ny) {
    opgave = ny; def = AI_OPGAVER[ny];
    const t = document.getElementById('ark-titel'); if (t) t.textContent = def.titel;
    gaelder.hidden = !erSkole();
    if (erSkole()) tegnBoern();
    tegnEmner(); tegnFoto();
  }
  // ↺ Forfra: tilbage til omstillingen (kun når arket blev åbnet med ✨)
  function forfra() {
    opgave = null; def = { titel: '✨ Hjælper', foto: 'ogsaa' }; emne = null; samtale = []; aktuelle = null; uge = opts.uge || null;
    const t = document.getElementById('ark-titel'); if (t) t.textContent = def.titel;
    gaelder.hidden = true; tegnEmner(); tegnFoto(); tegn(); felt.focus();
  }
  felt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); spoerg(); } });
  let aktuelle = null;   // forslagene i det seneste svar

  function tegn() {
    log.replaceChildren();
    samtale.forEach((b, nr) => {
      if (b.rolle === 'user') {
        const boble = el('div', 'ai-boble mig');
        if (b.foto) boble.append(bilagEl(b.foto));
        if (b.vis) boble.append(el('span', null, b.vis.length > 400 ? b.vis.slice(0, 400) + ' …' : b.vis));
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
    pladsholder();
    hint.textContent = erSkole() ? 'AI\'en får kun de valgte børns skema (fag og tider). Intet gemmes, før du trykker "Udfør".'
      : 'Intet gemmes, før du trykker "Udfør". Aflysninger skal du selv sætte flueben ved.';
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk), ...(!fast && opgave ? [knap('↺ Forfra', 'knap sekundaer', forfra)] : []), ...(aktuelle?.udfoer ? [aktuelle.udfoer] : []));
    setTimeout(() => log.lastElementChild?.scrollIntoView({ block: 'nearest' }), 30);
  }

  function forslagKort(b) {
    const ul = el('ul', 'ai-forslag');
    const gode = b.forslag.filter(f => f.h);
    const valgt = new Set(gode.filter(f => !f.fravalgt));   // fx "Aflys" skal vælges aktivt
    for (const f of b.forslag) {
      const li = el('li', 'ai-kort' + (f.fejl ? ' fejl' : ''));
      if (f.fejl) { li.append(el('span', 'ai-ikon', '⚠️'), el('span', 'ai-tekst', f.tekst)); ul.append(li); continue; }
      const k = knap('', 'ai-valg', () => {
        if (valgt.has(f)) valgt.delete(f); else valgt.add(f);
        k.setAttribute('aria-checked', valgt.has(f)); opdater();
      });
      k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', String(valgt.has(f)));
      const tekstEl = el('span', 'ai-tekst', f.tekst);
      k.append(el('span', 'ai-flueben'), el('span', 'ai-ikon', f.ikon || AI_IKON[f.h.type]), tekstEl);
      li.append(k);
      if (f.h.type === 'indkob_ny') {   // AI'en var i tvivl → skriv selv, hvad der står
        for (const v of f.h.varer.filter(v => v.usikker)) {
          const r = el('div', 'ai-usikker');
          const inp = input('text', '', v.tekst, 'Hvad står der?');
          inp.maxLength = 40;
          inp.setAttribute('aria-label', 'Usikker vare');
          inp.addEventListener('input', () => { v.tekst = inp.value.trim() || v.tekst; v.usikker = ''; tekstEl.textContent = (f.h.butik ? f.h.butik + ': ' : 'Uden butik: ') + f.h.varer.map(aiVareTekst).join(', '); });
          r.append(el('span', null, '❓ Står der "' + v.tekst + '"? Måske ' + v.usikker + '.'), inp);
          r.append(knap('Fjern', 'lille-knap', () => { f.h.varer = f.h.varer.filter(x => x !== v); r.remove(); tekstEl.textContent = (f.h.butik ? f.h.butik + ': ' : 'Uden butik: ') + f.h.varer.map(aiVareTekst).join(', '); }));
          li.append(r);
        }
      }
      if (f.h.type === 'skoledag_ny' && !f.h.aflys) {   // ret i arket for særlig skoledag – gemmes derfra, og AI-arket kommer tilbage
        li.append(knap('Ret', 'lille-knap', () => {
          const titel = document.getElementById('ark-titel').textContent, indhold = [...document.getElementById('ark-indhold').childNodes];
          const h = f.h;
          redigerSkoledag(h.hvem[0], h.dato, { ...(h.erstatter ? { id: h.erstatter } : {}), dato: h.dato, hvem: h.hvem, titel: h.titel, type: 'skoledag', program: h.program, moede: h.moede, friKl: h.friKl, noter: h.noter, note: h.note }, {
            efter: gemt => {
              aabnArk(titel, ...indhold);
              if (!gemt) return;
              f.udfoert = true; valgt.delete(f); n0++;
              k.disabled = true; k.setAttribute('aria-checked', 'false'); li.classList.add('gemt');
              tekstEl.textContent = '✓ Gemt: ' + aiDag(gemt.dato) + ': ' + gemt.titel; li.querySelector('.lille-knap')?.remove();
              opdater(); tegnAlt();
            }
          });
        }));
      }
      if (f.h.type === 'kalender_ny') {   // ret selv, før den gemmes
        li.append(knap('Ret', 'lille-knap', () => { const h = f.h; redigerAftale({ titel: h.titel, dato: h.dato, tid: h.tid, slut: h.slut, hvem: h.hvem.length === 1 ? h.hvem[0] : h.hvem, gentag: h.gentag, gentagTil: h.gentagTil, note: h.note }); }));
      }
      ul.append(li);
    }
    if (!gode.length) { aktuelle = null; return ul; }
    let n0 = 0;   // gemt via "Ret"
    const udfoer = knap('', 'knap', async () => {
      let n = n0;
      for (const f of [...gode].sort((a, b) => (a.h.type === 'opskrift_ny') - (b.h.type === 'opskrift_ny'))) {   // ny ret før opskriften, der kobles til den
        if (!valgt.has(f) || f.udfoert) continue;
        try { await aiUdfoer(f.h); f.udfoert = true; n++; } catch (e) { console.error(e); visStatus('Kunne ikke gemme: ' + f.tekst, true); }
      }
      lukArk(); tegnAlt();   // færdig – næste gang starter rent
      if (n) visStatus('✨ ' + (n === 1 ? 'Det er gjort' : n + ' ting er gjort') + ' – kan fortrydes under Mere → Aktivitet');
    });
    const opdater = () => { udfoer.textContent = valgt.size ? 'Udfør' + (valgt.size > 1 ? ' (' + valgt.size + ')' : '') : n0 ? 'Færdig' : 'Udfør'; udfoer.disabled = !valgt.size && !n0; };
    opdater();
    aktuelle = { udfoer };
    return ul;
  }

  // Mandag i den uge, madplan-forslagene gælder: den viste uge på Madplan – ellers denne (eller næste) uge
  function madUge(naeste) {
    if (hvor.side === 'madplan' && typeof madUgeIso === 'function') return madUgeIso();
    const m = mandagFor(new Date()); if (naeste) m.setDate(m.getDate() + 7);
    return isoDato(m);
  }

  // Omstillingen: hvilken opgave? Svarer opgaven (og sætter den) – eller null, når den har spurgt
  async function omstil(skrevet, billede) {
    const valg = aiEmneOpgave(emne, skrevet, billede);
    if (valg) { if (valg === 'madplan') uge = madUge(false); return valg; }
    const kontekst = { dato: isoDato(new Date()), ugedag: DAGE_LANG[(new Date().getDay() + 6) % 7].toLowerCase(), personer: PERSONER,
      side: FANE_NAVN[hvor.side] || hvor.side, ...(hvor.barn ? { valgtBarn: hvor.barn } : {}), ...(emne ? { emne: AI_EMNER.find(x => x.id === emne)?.navn } : {}), ...(billede ? { billede: true } : {}) };
    const bil = bilag(billede);
    const res = await Data.ai(skrevet || 'Se billedet.', kontekst, historik(), bil, 'omstil');
    const o = res?.omstil;
    if (!o) throw new Error('✨ skal opdateres i Supabase (Edge Function "ai")');
    let ny = AI_OPGAVER[o.opgave] ? o.opgave : '';
    if ((ny === 'seddel' || ny === 'ugeseddel') && !billede) ny = 'fri';   // de to læser kun billeder
    if (!ny) return { spoergsmaal: o.spoergsmaal || 'Hvad vil du gerne have hjælp til?' };
    if (ny === 'invitation' && !billede && !skrevet) ny = 'fri';
    if (ny === 'skole') saetBoern(o.boern?.length ? o.boern : hvor.barn ? [hvor.barn] : null);
    if (ny === 'madplan') uge = madUge(o.uge === 'naeste');
    return ny;
  }

  async function spoerg() {
    let skrevet = felt.value.trim();
    let billede = vedhaeftet;
    // ---- Omstilling (✨ øverst): find opgaven først ----
    if (!opgave) {
      if (!skrevet && !billede && aiEmneOpgave(emne, '', null) !== 'madplan') { felt.focus(); return; }
      samtale.push({ rolle: 'user', tekst: (billede ? '[billede] ' : '') + skrevet, vis: skrevet, ...(billede ? { foto: billede } : {}), omstil: true });
      felt.value = ''; vedhaeftet = null; tegnEmner(); tegnFoto(); tegn();
      log.append(el('p', 'ai-taenker', '✨ Finder ud af, hvad du skal bruge …'));
      knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk));
      // Alt skrevet i omstillingen (også svar på et spørgsmål) samles, og et billede følger med videre
      const alleTekster = samtale.filter(b => b.rolle === 'user').map(b => b.vis).filter(Boolean).join('\n');
      const foto = samtale.find(b => b.foto)?.foto || null;
      let valg;
      try { valg = await omstil(alleTekster, foto); }
      catch (e) {
        const sidst = samtale.pop(); felt.value = sidst.vis || ''; vedhaeftet = sidst.foto || null; tegnEmner(); tegnFoto(); tegn();
        log.append(el('p', 'ai-fejl', 'Det gik ikke: ' + e.message));
        return;
      }
      if (typeof valg !== 'string') {   // i tvivl → spørg
        samtale.push({ rolle: 'assistant', tekst: valg.spoergsmaal, forslag: [] });
        tegn(); return;
      }
      if (valg === 'madplan' && typeof aabneDage === 'function' && hvor.side === 'madplan' && !aabneDage().length) {
        samtale.push({ rolle: 'assistant', tekst: 'Den uge på Madplan er gået – vælg denne eller næste uge og prøv igen.', forslag: [] }); tegn(); return;
      }
      samtale = [];   // omstillingen er klaret – opgaven starter rent med det, der er skrevet
      saetOpgave(valg);
      skrevet = alleTekster; billede = foto;
      if (def.foto === 'kun' && !billede) { tegn(); visStatus('Tag et billede eller vælg en fil'); return; }
    }
    await koer(skrevet, billede);
  }

  async function koer(skrevet, billede) {
    const foerste = !samtale.length;
    if (def.foto === 'kun' && foerste && !billede) { visStatus('Tag et billede eller vælg en fil først'); return; }
    if (!skrevet && !billede && !(foerste && def.tekst)) { felt.focus(); return; }
    if (erSkole() && !boernValgt.size) { visStatus('Vælg hvilke børn beskeden gælder'); return; }
    if (erSkole()) aiSkoleBoern = BOERN.filter(b => boernValgt.has(b));
    // Første besked i en fast opgave: opgavens tekst (+ evt. ønsker); ellers det der er skrevet
    const tekst = foerste && def.tekst ? def.tekst + (skrevet ? (billede ? ' Min kommentar til billedet: ' : ' Ønsker: ') + skrevet : '') : skrevet;
    const hist = historik();
    samtale.push({ rolle: 'user', tekst, vis: skrevet || (billede ? '' : def.tekst), ...(billede ? { foto: billede } : {}) });
    felt.value = '';
    const sendtBillede = vedhaeftet; vedhaeftet = null; tegnFoto();
    aktuelle = null;
    tegn();
    log.append(el('p', 'ai-taenker', '✨ Tænker …'));
    knapper.replaceChildren(knap('Luk', 'knap sekundaer', lukArk));
    let res;
    try {
      const bil = bilag(billede);
      res = await Data.ai(tekst || (billede ? 'Se billedet.' : ''), await aiKontekst(opgave, uge, { boern: aiSkoleBoern }), hist, bil, opgave);
    } catch (e) {
      samtale.pop(); felt.value = skrevet; vedhaeftet = sendtBillede || billede; tegnFoto();
      tegn();
      log.append(el('p', 'ai-fejl', 'Det gik ikke: ' + e.message));
      return;
    }
    const forslag = (res.handlinger || []).map(aiTjek);
    for (const f of forslag) if (f.h?.type === 'note_ny' && billede) { f.h.foto = billede; f.tekst += ' · 📎 ' + (billede.startsWith('data:application/pdf') ? 'PDF' : 'billedet') + ' gemmes med'; }
    samtale.push({ rolle: 'assistant', tekst: res.svar || (forslag.length ? '' : 'Jeg fandt ikke noget at foreslå.'), forslag });
    aktuelle = forslag.some(f => f.h) ? {} : null;
    tegn();
    if (typeof res.tilbage === 'number' && res.tilbage < 10) log.append(el('p', 'hint', res.tilbage + ' beskeder tilbage i dag.'));
  }

  gaelder.hidden = !erSkole();
  if (erSkole()) tegnBoern();
  tegnEmner(); tegnFoto(); tegn();
  aabnArk(def.titel, gaelder, emneBoks, log, skrivBoks, hint, oenskeLink, knapper);
  if (opts.auto) spoerg();
  else if (opts.kamera) hentFil('kamera');
  else setTimeout(() => felt.focus(), 50);
}

// 💡 Ønsker ✨ ikke kunne opfylde – så I kan se, hvad familien beder om (og hvad der kunne bygges næste gang)
function aiOenskerArk(liste) {
  const ul = el('ul', 'ai-oensker');
  for (const x of liste) {
    const li = el('li');
    const d = new Date(x.tid);
    li.append(el('span', 'hint', d.getDate() + '/' + (d.getMonth() + 1) + ' · ' + (x.navn || '')), el('span', null, x.tekst));
    if (x.besked && x.besked !== x.tekst) li.append(el('span', 'hint', '"' + x.besked.slice(0, 140) + (x.besked.length > 140 ? ' …' : '') + '"'));
    ul.append(li);
  }
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('↩ Tilbage', 'knap sekundaer', () => aabnAI()),
    bekraeftKnap('Ryd listen', 'rydde listen', 'knap fare', async () => { await Data.rydAiOensker(liste.map(x => x.id)); visStatus('Listen er ryddet'); aabnAI(); }));
  aabnArk('💡 Det ✨ ikke kunne klare', el('p', 'hint', 'Det har I bedt ✨ om, som den ikke kan endnu. Fortæl Claude, hvad der skal bygges næste gang.'), ul, knapper);
}

// Knapperne på siderne (kun voksne – Edge Function'en tjekker det også). Input (sedler, beskeder, fotos) går via ✨ øverst;
// her er kun knapper, der arbejder på det, siden viser.
function aiSideKnapper() {
  const lav = (tekst, label, fn) => { const k = el('button', 'lille-knap ai-side-knap kun-voksen', tekst); k.type = 'button'; k.setAttribute('aria-label', label); k.addEventListener('click', fn); return k; };
  document.querySelector('#madplan .madplan-knapper')?.prepend(lav('✨ Foreslå aftensmad', 'Foreslå aftensmad med AI', () => {
    if (typeof aabneDage === 'function' && !aabneDage().length) { visStatus('Den uge er gået – vælg denne eller næste uge.'); return; }
    aabnAI({ opgave: 'madplan', uge: madUgeIso(), auto: true });
  }));
}
aiSideKnapper();

// ✨-knappen øverst (kun voksne – Edge Function'en tjekker det også)
(() => {
  // Eget ikon (Timmos ønske: flottere end ✨-emojien): åben firkant med "AI" og tre stjerner i appens farver
  const k = el('button', 'ai-knap kun-voksen');
  // Rund som forbogstav-knappen ved siden af: grøn cirkel med "AI" (tegnet som streger, så skriften er ens overalt)
  // og to stjerner i guld oppe i hjørnet – ligesom tandhjulet sidder nede i hjørnet på forbogstavet
  k.innerHTML = '<svg viewBox="0 0 36 36" aria-hidden="true">'
    + '<circle class="ai-cirkel" cx="18" cy="18" r="18"/>'
    + '<g class="ai-tekst" transform="translate(1.6 0.5)"><path fill-rule="evenodd" d="M8.6 24.5 12.4 11.5h3.6l3.8 13h-3.2l-.8-2.9h-4.2l-.8 2.9zM12.3 19h2.9l-1.45-5.2z"/><rect x="21.2" y="11.5" width="3.2" height="13"/></g>'
    + '<path class="ai-stjerne s1" d="M31 -0.7000000000000002C32.36 4.14 32.36 4.14 37.2 5.5C32.36 6.86 32.36 6.86 31 11.7C29.64 6.86 29.64 6.86 24.8 5.5C29.64 4.14 29.64 4.14 31 -0.7000000000000002z"/>'
    + '<path class="ai-stjerne s2" d="M22.6 0.20C23.08 1.92 23.08 1.92 24.8 2.4C23.08 2.88 23.08 2.88 22.6 4.60C22.12 2.88 22.12 2.88 20.400000000000002 2.4C22.12 1.92 22.12 1.92 22.6 0.20z"/>'
    + '</svg>';
  k.type = 'button';
  k.setAttribute('aria-label', 'AI-hjælper');
  k.addEventListener('click', () => aabnAI());
  document.getElementById('log-ud').before(k);
})();
