// handel.js – Indkøb: kategorier (i butikkens rækkefølge) og "Handletilstand" til når man står i butikken.
// Varer får automatisk en kategori ud fra navnet (ordlisten herunder). Rettes kategorien på en vare,
// huskes den på varens favorit (favoritter type 'indkob', felt kategori), så samme vare lander rigtigt næste gang.
// Data: 'indkob' {..., kategori?}  (kategori på varen vinder over den huskede og den automatiske)

// Rækkefølgen er typisk for en dansk butik: frugt og grønt først, frost sidst
const KATEGORIER = [
  ['groent', '🥦', 'Frugt og grønt'],
  ['broed', '🍞', 'Brød og bager'],
  ['koed', '🥩', 'Kød og fisk'],
  ['koel', '🧀', 'Pålæg og køl'],
  ['mejeri', '🥛', 'Mejeri og æg'],
  ['kolonial', '🥫', 'Kolonial og morgenmad'],
  ['snacks', '🍫', 'Slik og snacks'],
  ['drikke', '🧃', 'Drikkevarer'],
  ['hus', '🧻', 'Husholdning og pleje'],
  ['frost', '🧊', 'Frost'],
  ['andet', '📦', 'Andet']
];
const KAT = Object.fromEntries(KATEGORIER.map(([k, ikon, navn], i) => [k, { ikon, navn, orden: i }]));

// Ordliste: et ord matcher, hvis varen indeholder det i starten eller slutningen af et ord
// (så "rødløg" rammer "løg" og "kyllingebryst" rammer "kylling" – men "leverpostej" ikke rammer "ost").
// Det længste ord vinder; ord i FOERST vinder altid (fx "frosne ærter" → frost, "kyllingepålæg" → pålæg).
const FOERST = [
  ['frost', ['frost', 'frosne', 'frossen', 'frosset', 'dybfrost', 'is', 'flødeis', 'vaniljeis', 'sandwichis', 'ispinde', 'sorbet', 'isvafler', 'isterninger', 'fiskepinde', 'pommes frites', 'fritter']],
  ['koel', ['pålæg']],
  ['hus', ['kattemad', 'hundemad', 'kaninfoder', 'foder']]
];
const ORD = {
  groent: ['frugt', 'grønt', 'grøntsager', 'æble', 'æbler', 'banan', 'bananer', 'pære', 'pærer', 'appelsin', 'appelsiner', 'citron', 'citroner', 'lime',
    'mandarin', 'mandariner', 'klementin', 'klementiner', 'vindruer', 'druer', 'jordbær', 'hindbær', 'blåbær', 'brombær', 'bær', 'melon', 'vandmelon',
    'kiwi', 'ananas', 'mango', 'avocado', 'avokado', 'fersken', 'nektarin', 'blomme', 'blommer', 'granatæble', 'kartoffel', 'kartofler', 'løg',
    'porre', 'porrer', 'gulerod', 'gulerødder', 'agurk', 'agurker', 'tomat', 'tomater', 'cherrytomater', 'salat', 'salathoved', 'spinat', 'rucola',
    'broccoli', 'blomkål', 'kål', 'peberfrugt', 'peberfrugter', 'squash', 'aubergine', 'champignon', 'champignoner', 'svampe', 'ingefær', 'chili',
    'persille', 'purløg', 'dild', 'basilikum', 'koriander', 'mynte', 'krydderurter', 'radiser', 'selleri', 'bladselleri', 'rødbede', 'rødbeder',
    'pastinak', 'asparges', 'sukkerærter', 'bønnespirer', 'majskolber', 'rabarber', 'hvidløg'],
  broed: ['brød', 'rugbrød', 'franskbrød', 'boller', 'bolle', 'rundstykker', 'toast', 'toastbrød', 'pitabrød', 'pita', 'wraps', 'tortilla', 'tortillas',
    'baguette', 'baguettes', 'flutes', 'croissant', 'croissanter', 'kage', 'kager', 'kanelsnegle', 'wienerbrød', 'knækbrød', 'burgerboller',
    'pølsebrød', 'naan', 'ciabatta', 'sandwichbrød', 'grovboller', 'muffins', 'lagkagebunde'],
  koed: ['kød', 'hakket', 'oksekød', 'svinekød', 'kalvekød', 'lammekød', 'flæsk', 'flæskesteg', 'bacon', 'kylling', 'kyllingebryst', 'kyllingelår',
    'kalkun', 'and', 'fisk', 'laks', 'torsk', 'sej', 'rødspætte', 'rejer', 'muslinger', 'medister', 'pølser', 'grillpølser', 'mørbrad', 'kotelet',
    'koteletter', 'bøf', 'bøffer', 'steak', 'entrecote', 'culotte', 'kebab', 'lam', 'fars', 'farsbrød', 'schnitzel', 'burgerbøffer', 'fiskefilet',
    'fiskefrikadeller', 'frikadeller', 'tarteletter', 'nakkefilet', 'spareribs', 'kyllingelårfilet', 'gullasch', 'tatar'],
  koel: ['leverpostej', 'spegepølse', 'salami', 'rullepølse', 'hamburgerryg', 'skinke', 'kalkunbryst', 'pålægssalami', 'hummus', 'pesto',
    'færdigret', 'færdigretter', 'pizzadej', 'tærtedej', 'butterdej', 'dej', 'sushi', 'dip', 'tzatziki', 'gær', 'tun i vand', 'makrel', 'sild',
    'hønsesalat', 'italiensk salat', 'karrysalat', 'rejesalat', 'pasta frisk', 'frisk pasta', 'tofu'],
  mejeri: ['mælk', 'minimælk', 'letmælk', 'sødmælk', 'skummetmælk', 'kærnemælk', 'kakaomælk', 'yoghurt', 'skyr', 'ymer', 'a38', 'creme fraiche',
    'cremefraiche', 'fløde', 'piskefløde', 'madlavningsfløde', 'smør', 'kærgården', 'lurpak', 'margarine', 'ost', 'oste', 'flødeost', 'smøreost',
    'mozzarella', 'parmesan', 'feta', 'hytteost', 'revet ost', 'cheddar', 'brie', 'æg', 'cheasy', 'koldskål', 'kammerjunkere', 'havremælk',
    'sojamælk', 'mascarpone', 'ricotta', 'smørbar'],
  kolonial: ['pasta', 'spaghetti', 'makaroni', 'lasagneplader', 'penne', 'fusilli', 'nudler', 'ris', 'risengrød', 'grødris', 'couscous', 'bulgur',
    'quinoa', 'mel', 'hvedemel', 'rugmel', 'sukker', 'flormelis', 'rørsukker', 'salt', 'peber', 'krydderi', 'krydderier', 'karry', 'paprika',
    'kanel', 'oregano', 'timian', 'spidskommen', 'olie', 'olivenolie', 'rapsolie', 'eddike', 'balsamico', 'ketchup', 'sennep', 'mayonnaise', 'mayo',
    'remoulade', 'dressing', 'soja', 'sojasauce', 'bouillon', 'fond', 'dåse', 'dåsetomater', 'flåede tomater', 'hakkede tomater', 'tomatpuré',
    'passata', 'kokosmælk', 'majs', 'kidneybønner', 'bønner', 'kikærter', 'linser', 'havregryn', 'müsli', 'mysli', 'cornflakes', 'cheerios',
    'morgenmad', 'morgenmadsprodukt', 'honning', 'syltetøj', 'marmelade', 'nutella', 'peanutbutter', 'jordnøddesmør', 'mandler', 'nødder',
    'rosiner', 'bagepulver', 'natron', 'vaniljesukker', 'kakao', 'kaffe', 'te', 'tebreve', 'tun', 'tacokrydderi', 'tacoskaller', 'tacosauce',
    'salsa', 'pastasauce', 'kapers', 'oliven', 'pickles', 'agurkesalat', 'rødbedesalat', 'asier', 'rasp', 'gelatine', 'chokoladeknapper',
    'riskiks', 'kiks', 'tvebakker'],
  snacks: ['slik', 'chokolade', 'vingummi', 'lakrids', 'chips', 'tortillachips', 'popcorn', 'saltstænger', 'flødeboller', 'småkager', 'kakaoer',
    'mazarin', 'marcipan', 'karameller', 'bolsjer', 'pastiller', 'tyggegummi', 'snacks', 'peanuts', 'cashewnødder'],
  drikke: ['vand', 'danskvand', 'kildevand', 'sodavand', 'cola', 'faxe kondi', 'juice', 'appelsinjuice', 'æblejuice', 'saft', 'øl', 'vin',
    'rødvin', 'hvidvin', 'rosé', 'cider', 'smoothie', 'energidrik', 'iste', 'sportsdrik'],
  hus: ['toiletpapir', 'køkkenrulle', 'køkkenruller', 'opvask', 'opvaskemiddel', 'opvasketabs', 'opvaskebørste', 'sæbe', 'håndsæbe', 'shampoo',
    'balsam', 'tandpasta', 'tandbørste', 'tandbørster', 'vaskepulver', 'vaskemiddel', 'skyllemiddel', 'affaldsposer', 'skraldeposer', 'poser',
    'fryseposer', 'sølvpapir', 'alufolie', 'bagepapir', 'husholdningsfilm', 'servietter', 'bleer', 'vatpinde', 'vatrondeller', 'deodorant',
    'rengøring', 'rengøringsmiddel', 'karklude', 'klude', 'batterier', 'stearinlys', 'fyrfadslys', 'tændstikker', 'plaster',
    'solcreme', 'hudcreme', 'hø', 'strøelse', 'kattegrus', 'kaffefiltre', 'filtre', 'afkalker', 'maskinopvask', 'wc-rens', 'glasrens'],
  frost: ['pizza', 'ærter', 'majs frost', 'spinat frost', 'grøntsagsblanding', 'wokblanding', 'frikadeller frost']
};
// Korte ord skal stå alene – nogle må dog også stå sidst i et sammensat ord (rødløg, flødeost, jordbær, rødvin …)
const KORT_ORD = new Set(['is', 'te', 'øl', 'vin', 'and', 'lam', 'ris', 'æg', 'mel', 'ost', 'dej', 'bær', 'kød', 'løg', 'kål', 'gær', 'tun', 'hø']);
const SAMMENSAT_OK = new Set(['ost', 'løg', 'kål', 'bær', 'kød', 'dej', 'mel', 'ris', 'vin', 'øl']);
const norm = t => ' ' + (t || '').toLowerCase().replace(/[éèê]/g, 'e').replace(/[^a-zæøå0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
function passer(t, o) {
  o = o.replace(/[éèê]/g, 'e');
  if (o.includes(' ')) return t.includes(' ' + o + ' ');
  if (KORT_ORD.has(o)) {
    if (t.includes(' ' + o + ' ')) return true;
    if (!SAMMENSAT_OK.has(o) || !new RegExp('[a-zæøå]{2,}' + o + ' ').test(t)) return false;
    return !(o === 'ost' && /(toast|post|kost|most|frost) /.test(t)) && !(o === 'mel' && /karamel /.test(t));
  }
  return t.includes(' ' + o) || t.includes(o + ' ');
}
function autoKategori(vare) {
  const t = norm(vare);
  for (const [kat, liste] of FOERST) if (liste.some(o => passer(t, o))) return kat;
  let bedst = null, laengde = 0;
  for (const [kat, liste] of Object.entries(ORD)) {
    for (const o of liste) if (o.length > laengde && passer(t, o)) { bedst = kat; laengde = o.length; }
  }
  return bedst || 'andet';
}
// Varens kategori: sat på varen > husket på favoritten > automatisk
function varensKategori(p, favoritter) {
  if (p.kategori && KAT[p.kategori]) return p.kategori;
  const f = favoritter.find(x => x.type === 'indkob' && x.tekst.toLowerCase() === (p.tekst || '').toLowerCase());
  if (f?.kategori && KAT[f.kategori]) return f.kategori;
  return autoKategori(p.tekst);
}
// Sæt kategori på en vare – og husk den til næste gang (voksne; børn kan ikke rette varer)
async function saetKategori(p, kat) {
  await Data.update('indkob', p.id, { kategori: kat });
  if (!erBarn()) {
    await gemFavorit('indkob', p.tekst);
    await saetFavFelter('indkob', p.tekst, { kategori: kat });
  }
}
// Hurtigt valg af kategori: store knapper i et bundpanel
function vaelgKategori(p, nu) {
  const grid = el('div', 'kat-valg');
  for (const [k, ikon, navn] of KATEGORIER) {
    const b = knap('', 'kat-knap' + (k === nu ? ' valgt' : ''), async () => { await saetKategori(p, k); lukArk(); tegnAlt(); });
    b.append(el('span', 'kat-ikon', ikon), el('span', null, navn));
    grid.append(b);
  }
  aabnArk('Hvor ligger ' + p.tekst + '?', grid, el('p', 'hint', 'Huskes til næste gang, varen kommer på listen.'));
}

// ---------- Handletilstand ----------
let handler = lokal.get('handletilstand') === 'ja';
let skaermLaas = null;
async function holdSkaermTaendt(til) {
  try {
    if (til && 'wakeLock' in navigator && document.visibilityState === 'visible') skaermLaas = await navigator.wakeLock.request('screen');
    else if (!til && skaermLaas) { await skaermLaas.release(); skaermLaas = null; }
  } catch { skaermLaas = null; }
}
document.addEventListener('visibilitychange', () => { if (handler && aktivFane === 'indkob') holdSkaermTaendt(true); });

function saetHandler(til) {
  handler = til;
  lokal.set('handletilstand', til ? 'ja' : 'nej');
  holdSkaermTaendt(til);
  tegnListe('indkob');
  window.scrollTo(0, 0);
}
document.getElementById('handle-knap')?.addEventListener('click', () => saetHandler(!handler));

// Tegnes af tegnListe('indkob') i app.js
async function tegnHandleliste(viste) {
  const sek = document.getElementById('indkob');
  sek.classList.toggle('handler', handler);
  const knapEl = document.getElementById('handle-knap');
  knapEl.textContent = handler ? '✓ Færdig' : '🛒 Handle';
  knapEl.setAttribute('aria-pressed', handler);
  const boks = document.getElementById('handle-liste');
  if (!handler) { boks.replaceChildren(); return; }
  const fav = await Data.list('favoritter');
  const mangler = viste.filter(p => !p.klaret), kurv = viste.filter(p => p.klaret);
  const dele = [];
  const ialt = mangler.length + kurv.length;
  const status = el('div', 'handle-status');
  status.append(el('span', null, ialt ? kurv.length + ' af ' + ialt + ' i kurven' : 'Listen er tom'));
  const bar = el('span', 'handle-bar');
  const fyld = el('span'); fyld.style.width = (ialt ? Math.round(100 * kurv.length / ialt) : 0) + '%';
  bar.append(fyld);
  status.append(bar);
  dele.push(status);

  const grupper = new Map();
  for (const p of mangler) {
    const k = varensKategori(p, fav);
    if (!grupper.has(k)) grupper.set(k, []);
    grupper.get(k).push(p);
  }
  for (const [k, ikon, navn] of KATEGORIER) {
    const liste = grupper.get(k);
    if (!liste) continue;
    const sektion = el('section', 'handle-gruppe');
    sektion.append(el('h3', 'handle-titel', ikon + ' ' + navn + ' · ' + liste.length));
    const ul = el('ul', 'handle-ul');
    for (const p of liste.sort((a, b) => a.tekst.localeCompare(b.tekst, 'da'))) ul.append(handleLi(p, k));
    sektion.append(ul);
    dele.push(sektion);
  }
  if (!mangler.length && ialt) dele.push(el('p', 'handle-faerdig', 'Alt er i kurven 🎉'));
  if (kurv.length) {
    const d = el('details', 'handle-kurv');
    d.append(el('summary', null, '🛒 I kurven (' + kurv.length + ')'));
    const ul = el('ul', 'handle-ul');
    for (const p of kurv) ul.append(handleLi(p, varensKategori(p, fav)));
    d.append(ul);
    dele.push(d);
  }
  boks.replaceChildren(...dele);
}
function handleLi(p, k) {
  const li = el('li', 'handle-vare' + (p.klaret ? ' klaret' : ''));
  const b = knap('', 'handle-tjek', async () => { await Data.update('indkob', p.id, { klaret: !p.klaret }); tegnAlt(); });
  b.setAttribute('aria-pressed', !!p.klaret);
  const tjek = el('span', 'tjek'); tjek.innerHTML = IKON_TJEK;
  const tekst = el('span', 'handle-tekst', p.tekst);
  b.append(tjek, tekst);
  const ekstra = [p.tilbud ? 'Tilbud' : '', p.note || '', p.butik && !butikFilter ? p.butik : ''].filter(Boolean);
  if (ekstra.length) b.append(el('span', 'handle-ekstra' + (p.tilbud ? ' tilbud' : ''), ekstra.join(' · ')));
  li.append(b);
  if (!erBarn() && !p.klaret) {
    const kat = knap(k === 'andet' ? '❔' : KAT[k].ikon, 'handle-kat' + (k === 'andet' ? ' ukendt' : ''), () => vaelgKategori(p, k));
    kat.setAttribute('aria-label', 'Kategori for ' + p.tekst + ': ' + KAT[k].navn + '. Tryk for at ændre');
    li.append(kat);
  }
  return li;
}
