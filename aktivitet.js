// aktivitet.js – siden "Aktivitet" under Mere: hvem har ændret hvad (kun voksne).
// Loggen skrives af databasen selv (opdatering-aktivitet.sql) og kan kun læses af voksne.
// Slettede ting kan gendannes herfra, og en ændring kan fortrydes, hvis ingen har rettet tingen siden.

const AKT_LISTER = {
  indkob: 'Indkøb', todo: 'To do', madplan: 'Madplan', fastplan: 'Faste måltider', favoritter: 'Forslag',
  kalender: 'Kalender', kalender_voksne: 'Kalender (voksne)', foedselsdage: 'Fødselsdage', info: 'Det sker',
  flueben: 'Pligter', opgaver: 'Pligter', beloenninger: 'Belønninger', indloesninger: 'Belønninger',
  justeringer: 'Stjerner og kr', udbetalinger: 'Udbetalinger', ekstra: 'Ekstra stjerner', madoensker: 'Madønsker',
  streakbonus: 'Streak', streakjoker: 'Streak', rutiner: 'Rutiner', pakkelister: 'Pakkelister', motion: 'Konkurrence',
  skema: 'Skema', skemadag: 'Skema', skemafarver: 'Skema', ringetider: 'Skema', personer: 'Familie', kontakter: 'Kontakter',
  personvalg: 'Indstillinger', indstillinger: 'Indstillinger', personregler: 'Pligter'
};
const AKT_SIDE = 150;   // rækker pr. hentning
let aktRaekker = [], aktFilter = 'alle', aktAlleHentet = false, aktFejl = null;

// Kort navn på tingen ud fra dens indhold
function aktTitel(d, liste) {
  if (!d) return '';
  if (liste === 'motion') return [d.km ? String(d.km).replace('.', ',') + ' km' : '', d.type === 'cykel' ? 'cykel' : d.type === 'gaa' ? 'gå' : ''].filter(Boolean).join(' ');
  if (liste === 'udbetalinger') return (d.kr || 0) + ' kr' + (d.barn ? ' til ' + d.barn : '');
  if (liste === 'justeringer') return d.tekst || (d.type === 'streak' ? 'streak' : [d.stjerner ? d.stjerner + ' ★' : '', d.kr ? d.kr + ' kr' : ''].filter(Boolean).join(' '));
  if (liste === 'fastplan') return [d.barn, d.morgen, d.frokost, d.ret].filter(Boolean).join(' · ');
  if (liste === 'streakbonus' || liste === 'streakjoker') return (d.barn || '') + (d.stjerner ? ' · ' + d.stjerner + ' ★' : '');
  if (liste === 'personvalg') return d.navn || '';
  if (liste === 'indstillinger') return d.noegle || '';
  if (liste === 'skema') return [d.barn, d.fag].filter(Boolean).join(' · ');
  const t = d.tekst || d.titel || d.navn || d.ret || (d.fornavn ? d.fornavn + ' ' + (d.efternavn || '') : '') || '';
  return String(t).trim();
}

// Én linje: ikon + hvad der skete
function aktSaetning(a) {
  const d = a.efter || a.foer || {};
  const t = aktTitel(d, a.liste);
  const sted = AKT_LISTER[a.liste] || a.liste;
  const q = t ? '"' + t + '"' : 'noget';
  const forBarn = d.barn && d.barn !== a.navn ? ' (' + d.barn + ')' : '';
  if (a.liste === 'flueben') {
    if (a.handling === 'ny') return { ikon: d.sprunget ? '⏭️' : '✅', tekst: (d.sprunget ? 'sprang over: ' : 'klarede ') + t + forBarn };
    if (a.handling === 'slet') return { ikon: '↩️', tekst: 'fjernede fluebenet ved ' + t + forBarn };
  }
  if (a.liste === 'indloesninger' || a.liste === 'ekstra' || a.liste === 'madoensker') {
    if (a.handling === 'ny') return { ikon: '🎁', tekst: (d.status === 'afventer' ? 'ønskede ' : 'gav ') + q + forBarn };
    if (a.handling === 'ret' && a.foer?.status !== a.efter?.status) {
      const st = a.efter?.status;
      if (st === 'godkendt') return { ikon: '👍', tekst: 'sagde ja til ' + q + forBarn };
      if (st === 'afvist') return { ikon: '👎', tekst: 'sagde nej til ' + q + forBarn };
      if (st === 'erstattet') return { ikon: '🔁', tekst: 'valgte noget andet end ' + q + forBarn };
    }
  }
  if ((a.liste === 'indkob' || a.liste === 'todo') && a.handling === 'ret' && !!a.foer?.klaret !== !!a.efter?.klaret) {
    return a.efter?.klaret ? { ikon: '☑️', tekst: 'krydsede ' + q + ' af i ' + sted } : { ikon: '↩️', tekst: 'satte ' + q + ' tilbage på ' + sted };
  }
  if (a.liste === 'favoritter' && a.handling === 'ret') return { ikon: '❤️', tekst: 'rettede hjerter/forslag ved ' + q };
  if (a.handling === 'ny' && a.gendannet) return { ikon: '♻️', tekst: 'gendannede ' + q + ' i ' + sted };
  if (a.handling === 'ny') return { ikon: '➕', tekst: 'tilføjede ' + q + ' i ' + sted };
  if (a.handling === 'ret') return { ikon: '✏️', tekst: 'rettede ' + q + ' i ' + sted };
  return { ikon: '🗑️', tekst: 'slettede ' + q + ' fra ' + sted };
}

// Rækker der hører sammen (samme person, handling og liste inden for 2 min) vises som én linje
function aktGrupper(raekker) {
  const grupper = [];
  for (const a of raekker) {
    const g = grupper[grupper.length - 1];
    const sidste = g && g[g.length - 1];
    if (sidste && sidste.navn === a.navn && sidste.handling === a.handling && sidste.liste === a.liste && !!sidste.gendannet === !!a.gendannet
      && a.liste !== 'flueben' && Math.abs(new Date(sidste.tid) - new Date(a.tid)) < 120000) g.push(a);
    else grupper.push([a]);
  }
  return grupper;
}

const aktSammeData = (x, y) => JSON.stringify(x) === JSON.stringify(y);
// Nuværende indhold af en ting (null = findes ikke længere)
async function aktNu(a) {
  const p = (await Data.list(a.liste)).find(x => x.id === a.punkt_id);
  if (!p) return null;
  const { id, oprettet, _af, ...data } = p;
  return data;
}

async function aktGendan(raekker, knapEl) {
  knapEl.disabled = true;
  try {
    await Data.gendan({ raekker: raekker.map(a => ({ id: a.punkt_id, liste: a.liste, data: a.foer, oprettet: a.oprettet, oprettet_af: a.oprettet_af })) });
    tegnAlt();
    besked(raekker.length > 1 ? raekker.length + ' ting er sat tilbage' : 'Det er sat tilbage');   // fra sjov.js
    aktHent(true);
  } catch (e) {
    console.error(e);
    knapEl.disabled = false;
    besked('Det kunne ikke sættes tilbage');
  }
}

function aktDagTekst(d) {
  const iso = isoDato(d), nu = new Date();
  if (iso === isoDato(nu)) return 'I dag';
  if (iso === isoDato(new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() - 1))) return 'I går';
  return d.toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'short' }).replace(/^./, c => c.toUpperCase());
}

async function aktHent(forfra) {
  try {
    const nye = await Data.aktivitet(forfra || !aktRaekker.length ? null : aktRaekker[aktRaekker.length - 1].tid, AKT_SIDE);
    aktRaekker = forfra ? nye : aktRaekker.concat(nye);
    // En "ny" række med samme id som noget, der tidligere er slettet, er en gendannelse
    const slettet = new Map();
    for (const a of [...aktRaekker].reverse()) {
      if (a.handling === 'slet') slettet.set(a.punkt_id, true);
      else if (a.handling === 'ny' && slettet.has(a.punkt_id)) a.gendannet = true;
    }
    aktAlleHentet = nye.length < AKT_SIDE;
    aktFejl = null;
  } catch (e) {
    console.error(e);
    aktFejl = e;
  }
  tegnAktivitet();
}

async function tegnAktivitet() {
  const boks = document.getElementById('aktivitet-indhold');
  if (!boks || erBarn()) return;
  if (aktFejl) {
    boks.replaceChildren(el('p', 'tom', 'Aktivitet kunne ikke hentes.'),
      el('p', 'hint', 'Er opdatering-aktivitet.sql kørt i Supabase? Ellers tjek internettet og prøv igen.'),
      knap('Prøv igen', 'knap', () => aktHent(true)));
    return;
  }
  const navne = [...new Set(aktRaekker.map(a => a.navn).filter(Boolean))];
  if (aktFilter !== 'alle' && aktFilter !== 'slet' && !navne.includes(aktFilter)) aktFilter = 'alle';
  const valg = chipValg(['alle', ...navne, 'slet'], aktFilter, v => { aktFilter = v; tegnAktivitet(); },
    v => (v === 'alle' ? 'Alle' : v === 'slet' ? '🗑️ Slettet' : v));
  const vis = aktRaekker.filter(a => aktFilter === 'alle' || (aktFilter === 'slet' ? a.handling === 'slet' : a.navn === aktFilter));

  const liste = el('div', 'akt-liste');
  let dag = '';
  for (const g of aktGrupper(vis)) {
    const a = g[0];
    const tid = new Date(a.tid);
    const dTekst = aktDagTekst(tid);
    if (dTekst !== dag) { dag = dTekst; liste.append(el('h3', 'akt-dag', dag)); }
    const s = aktSaetning(a);
    const raekke = el('div', 'akt-raekke');
    const tekst = el('div', 'akt-tekst');
    const hvem = el('b', 'akt-navn ' + (PK[a.navn] || ''), a.navn || 'Ukendt');
    let linje = s.tekst;
    if (g.length > 1) {
      const sted = AKT_LISTER[a.liste] || a.liste;
      linje = a.handling === 'slet' ? 'slettede ' + g.length + ' ting fra ' + sted
        : a.handling === 'ny' ? (a.gendannet ? 'gendannede ' : 'tilføjede ') + g.length + ' ting i ' + sted : 'rettede ' + g.length + ' ting i ' + sted;
    }
    const linjeEl = el('span', 'akt-linje');
    linjeEl.append(hvem, ' ' + linje);
    tekst.append(linjeEl);
    if (g.length > 1) {
      const titler = g.map(x => aktTitel(x.efter || x.foer, x.liste)).filter(Boolean);
      if (titler.length) tekst.append(el('span', 'akt-under', titler.slice(0, 8).join(', ') + (titler.length > 8 ? ' …' : '')));
    }
    raekke.append(el('span', 'akt-tid', tid.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }).replace(':', '.')),
      el('span', 'akt-ikon', s.ikon), tekst);
    // Gendan slettede ting / fortryd en ændring, som ingen har rørt siden
    if (a.handling === 'slet' && a.liste !== 'flueben') {
      const mangler = [];
      for (const x of g) if (!(await aktNu(x))) mangler.push(x);
      if (mangler.length) { const k = knap('Gendan', 'lille-knap akt-knap', () => aktGendan(mangler, k)); raekke.append(k); }
    } else if (a.handling === 'ret' && g.length === 1 && a.foer && aktSammeData(await aktNu(a), a.efter)) {
      const k = knap('Fortryd', 'lille-knap akt-knap', () => aktGendan([a], k));
      raekke.append(k);
    }
    liste.append(raekke);
  }
  const dele = [valg];
  if (!aktRaekker.length) dele.push(el('p', 'tom', 'Ingen aktivitet endnu. Den kommer, når nogen tilføjer, retter eller sletter noget.'));
  else if (!vis.length) dele.push(el('p', 'tom', 'Intet at vise med det valg.'));
  dele.push(liste);
  if (!aktAlleHentet && aktRaekker.length) dele.push(knap('Vis ældre', 'knap sekundaer-knap bred-knap', () => aktHent(false)));
  dele.push(el('p', 'hint', 'Viser de sidste 60 dage. Kun voksne kan se aktiviteten. Private aftaler og afkrydsede rutinetrin kommer ikke med.'));
  boks.replaceChildren(...dele);
}

document.getElementById('akt-opdater')?.addEventListener('click', () => aktHent(true));
