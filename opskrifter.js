// opskrifter.js – 📖 Opskrifter (Mere → Opskrifter). Egen side (før lå opskrifter som noter i Familiemappen).
// Data: 'opskrifter' {titel, ret?: id på en ret i favoritter (kobler opskriften til madplanen), portioner?, tid? (minutter),
//                      ingredienser: [tekst], fremgang: [tekst], note?, kilde? (link), billede?: {sti} | {src}, rettet}
// Alle kan se opskrifterne; kun voksne kan rette (databasens børnelås – ingen ny SQL).
// Fra en opskrift: "🛒 Læg på indkøbslisten" (de valgte ingredienser) og "🗓️ Sæt på madplanen" (rettens navn på en dag).
// Fra en ret (Ret ret i Madplan → Vores lister): "📖 Opskrift" åbner/laver opskriften.

let opsSoeg = '', opsKat = '';
const opsAlle = () => Data.listNu('opskrifter').sort((a, b) => (a.titel || '').localeCompare(b.titel || '', 'da'));
const opsRet = o => (o.ret ? Data.listNu('favoritter').find(f => f.id === o.ret) || null : null);
const opsKatAf = o => opsRet(o)?.gruppe || '';
const opsKatNavn = k => (k ? GRUPPE_NAVN[k] || k : '📖 Andet');
const opsForRet = f => Data.listNu('opskrifter').filter(o => o.ret === f.id);
const opsMeta = o => [o.tid ? '⏱ ' + o.tid + ' min' : '', o.portioner ? '👥 ' + o.portioner + ' pers.' : '', o.ingredienser?.length ? o.ingredienser.length + ' ingredienser' : ''].filter(Boolean).join(' · ');
// Retter man kan koble til (alle måltider), sorteret efter navn
const opsRetValg = () => Data.listNu('favoritter').filter(f => MAAL_TYPER.includes(f.type)).sort((a, b) => a.tekst.localeCompare(b.tekst, 'da'));

function opsBillede(b, klasse) {
  const img = el('img', klasse); img.alt = ''; img.loading = 'lazy';
  if (b?.src) img.src = b.src;
  else if (b?.sti) Data.filUrl(b.sti).then(u => { img.src = u; }).catch(() => img.remove());
  return img;
}

function tegnOpskrifter() {
  const sek = document.getElementById('opskrifter'), boks = document.getElementById('opskrifter-indhold');
  if (!boks || sek.hidden) return;
  if (sek.contains(document.activeElement) && document.activeElement.matches('input, textarea')) return;
  const alle = opsAlle(), dele = [];
  // Opskrifter, der stadig ligger i Familiemappen (voksne): flyt dem hertil med ét tryk
  const gamle = erBarn() ? [] : opsGamleNoter();
  if (gamle.length) {
    const b = el('div', 'kort ops-flyt');
    b.append(el('p', null, '📁 ' + gamle.length + (gamle.length === 1 ? ' opskrift ligger' : ' opskrifter ligger') + ' i Familiemappen.'),
      knap('Flyt ' + (gamle.length === 1 ? 'den' : 'dem') + ' hertil', 'lille-knap', () => opsFlytFraMappen(gamle)));
    dele.push(b);
  }
  if (!alle.length) {
    dele.push(el('p', 'tom', erBarn() ? 'Ingen opskrifter endnu.' : 'Ingen opskrifter endnu. Tryk "+ Ny opskrift" – eller giv ✨ et billede eller et link til en opskrift.'));
    boks.replaceChildren(...dele); return;
  }
  if (alle.length > 5) {
    const s = input('search', 'ops-soeg', opsSoeg, 'Søg i opskrifter og ingredienser');
    s.addEventListener('input', () => { opsSoeg = s.value; tegnListe(); });
    dele.push(s);
  }
  const kats = [...new Set(alle.map(opsKatAf))].sort((a, b) => (a === '') - (b === '') || opsKatNavn(a).localeCompare(opsKatNavn(b), 'da'));
  if (kats.length > 1) dele.push(chipValg(['*', ...kats], opsKat || '*', v => { opsKat = v === '*' ? '' : v; tegnListe(); }, v => (v === '*' ? 'Alle' : opsKatNavn(v))));
  const ul = el('ul', 'ops-liste');
  function tegnListe() {
    const q = opsSoeg.trim().toLowerCase();
    const vis = alle.filter(o => (!opsKat || opsKatAf(o) === opsKat) && (!q || [o.titel, opsRet(o)?.tekst, ...(o.ingredienser || [])].join(' ').toLowerCase().includes(q)));
    ul.replaceChildren(...vis.map(o => {
      const li = el('li');
      const k = knap('', 'ops-raekke', () => visOpskrift(o.id));
      if (o.billede) k.append(opsBillede(o.billede, 'ops-mini'));
      else k.append(el('span', 'ops-mini ops-ikon', GRUPPE_NAVN[opsKatAf(o)]?.split(' ')[0] || '📖'));
      const t = el('span', 'ops-tekst');
      t.append(el('strong', null, o.titel || 'Uden navn'), el('span', 'ops-under', [opsRet(o) ? '🍽️ ' + opsRet(o).tekst : '', opsMeta(o)].filter(Boolean).join(' · ')));
      k.append(t, el('span', 'kort-pil', '›'));
      li.append(k);
      return li;
    }));
    if (!vis.length) ul.append(el('li', 'tom', 'Ingen opskrifter passer.'));
  }
  tegnListe();
  dele.push(ul);
  boks.replaceChildren(...dele);
}
document.getElementById('ny-opskrift')?.addEventListener('click', () => redigerOpskrift({}));

// ---------- Vis en opskrift ----------
function visOpskrift(id) {
  const o = Data.listNu('opskrifter').find(x => x.id === id);
  if (!o) return;
  const ret = opsRet(o), dele = [];
  if (o.billede) dele.push(opsBillede(o.billede, 'ops-stort'));
  if (opsMeta(o)) dele.push(el('p', 'hint', opsMeta(o)));
  if (ret) {
    const r = el('div', 'ops-ret');
    r.append(el('span', null, '🍽️ Hører til retten ' + ret.tekst));
    if (!erBarn()) r.append(knap('🗓️ Sæt på madplanen', 'lille-knap', () => opsPaaMadplan(ret)));
    dele.push(r);
  }
  // Ingredienser med flueben → indkøbslisten
  if (o.ingredienser?.length) {
    const valgt = new Set(o.ingredienser.map((_, i) => i));
    const ul = el('ul', 'ops-ingr');
    const tilKnap = knap('', 'knap sekundaer', async () => {
      let n = 0;
      for (const i of [...valgt].sort((a, b) => a - b)) {
        const { antal, tekst } = delAntal(o.ingredienser[i]);   // "2 dl fløde" → antal "2 dl", tekst "fløde"
        const t = tekst ? tekst[0].toUpperCase() + tekst.slice(1) : '';
        if (t && await tilfoejUdenDublet('indkob', { tekst: t, klaret: false, ...(antal ? { antal } : {}), note: 'Til ' + o.titel })) { await gemFavorit('indkob', t); n++; }
      }
      visStatus(n ? '🛒 ' + n + (n === 1 ? ' ting' : ' ting') + ' lagt på indkøbslisten' : 'Det står allerede på listen');
      tegnAlt();
    });
    const opdater = () => { tilKnap.textContent = '🛒 Læg ' + valgt.size + ' på indkøbslisten'; tilKnap.disabled = !valgt.size; };
    o.ingredienser.forEach((t, i) => {
      const li = el('li');
      if (erBarn()) { li.textContent = t; ul.append(li); return; }
      const k = knap(t, 'ops-ingr-valg', () => { valgt.has(i) ? valgt.delete(i) : valgt.add(i); k.setAttribute('aria-checked', String(valgt.has(i))); opdater(); });
      k.setAttribute('role', 'checkbox'); k.setAttribute('aria-checked', 'true');
      li.append(k); ul.append(li);
    });
    opdater();
    dele.push(el('h3', 'ops-h', 'Ingredienser'), ul);
    if (!erBarn()) dele.push(el('p', 'hint', 'Fjern fluebenet ved det, I har i forvejen.'), tilKnap);
  }
  if (o.fremgang?.length) {
    const ol = el('ol', 'ops-trin');
    for (const t of o.fremgang) ol.append(el('li', null, t));
    dele.push(el('h3', 'ops-h', 'Sådan gør du'), ol);
  }
  if (o.note) dele.push(el('h3', 'ops-h', 'Note'), tekstMedLinks(o.note));   // mappe.js
  if (o.kilde) {
    const a = el('a', 'note-link', '🔗 ' + o.kilde.replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 60));
    a.href = /^https?:/i.test(o.kilde) ? o.kilde : 'https://' + o.kilde; a.target = '_blank'; a.rel = 'noopener noreferrer';
    dele.push(el('p', 'ops-kilde'), a);
  }
  const knapper = el('div', 'ark-knapper');
  knapper.append(knap('Luk', 'knap sekundaer', lukArk));
  if (!erBarn()) knapper.append(knap('Ret', 'knap', () => redigerOpskrift(o)));
  aabnArk('📖 ' + (o.titel || 'Opskrift'), ...dele, knapper);
}

// Rettens navn på en dag i denne eller næste uge (aftensmad – eller rettens eget måltid)
function opsPaaMadplan(ret) {
  const maal = ret.type === 'ret' || passerTil(ret, 'ret') ? 'ret' : ret.type;
  const idag = isoDato(new Date()), dage = [];
  for (let i = 0; i < 14; i++) dage.push(plusDage(idag, i));
  const boks = el('div', 'seg wrap');
  boks.append(...dage.map(iso => knap((iso === idag ? 'I dag' : iso === plusDage(idag, 1) ? 'I morgen' : DAGE[(tilDag(iso).getDay() + 6) % 7] + ' ' + kortDag(iso)), null, async () => {
    const d = tilDag(iso);
    await gemMad((d.getDay() + 6) % 7, maal, ret.tekst, isoDato(mandagFor(d)));
    lukArk(); tegnAlt(); visStatus('🗓️ ' + ret.tekst + ' står nu på madplanen ' + (iso === idag ? 'i dag' : kortDag(iso)));
  })));
  aabnArk('Hvilken dag?', el('p', 'hint', ret.tekst + ' sættes på madplanen (' + MAALTIDER[maal].toLowerCase() + '). Står der noget, bliver det erstattet.'), boks);
}

// ---------- Ret / ny opskrift ----------
function redigerOpskrift(o = {}, forRet = null) {
  if (erBarn()) return;
  const titel = input('text', 'ops-titel', o.titel || forRet?.tekst || '', 'Fx Lasagne');
  const retSel = el('select'); retSel.id = 'ops-ret';
  retSel.append(new Option('Ikke koblet til en ret', ''), ...opsRetValg().map(f => new Option(f.tekst + (f.type !== 'ret' ? ' (' + MAALTIDER[f.type].toLowerCase() + ')' : ''), f.id)));
  retSel.value = o.ret || forRet?.id || '';
  const portioner = input('text', 'ops-portioner', o.portioner || '', 'Fx 4'); portioner.inputMode = 'numeric';
  const tid = input('text', 'ops-tid', o.tid || '', 'Minutter'); tid.inputMode = 'numeric';
  const omraade = (id, vaerdi, ph, rows) => { const t = el('textarea', 'k-tekst'); t.id = id; t.value = vaerdi; t.placeholder = ph; t.rows = rows; return t; };
  const ingr = omraade('ops-ingr', (o.ingredienser || []).join('\n'), 'Én pr. linje, fx\n500 g hakket oksekød\n2 dl fløde', 6);
  const frem = omraade('ops-frem', (o.fremgang || []).join('\n'), 'Ét trin pr. linje', 6);
  const note = omraade('ops-note', o.note || '', 'Fx "Drengene vil have mindre chili"', 2);
  const kilde = input('text', 'ops-kilde', o.kilde || '', 'Link til opskriften (valgfri)'); kilde.inputMode = 'url';
  // Billede (lægges i Storage alle/ – hele familien kan se det; virker Storage ikke, gemmes et lille billede i databasen)
  let billede = o.billede || null, nyFil = null;
  const bVis = el('div', 'ops-billede-valg');
  const tegnB = () => {
    const fil = el('input'); fil.type = 'file'; fil.accept = 'image/*'; fil.hidden = true;
    fil.addEventListener('change', async () => {
      const f = fil.files[0]; if (!f) return;
      try {
        const dataUrl = await laesBillede(f, 1600, 0.78);
        try { const blob = await (await fetch(dataUrl)).blob(); const op = await Data.uploadFil('alle', new File([blob], 'opskrift.jpg', { type: 'image/jpeg' })); billede = { sti: op.sti }; nyFil = op.sti; }
        catch (e) { billede = { src: await laesBillede(f, 900, 0.72) }; }
        tegnB();
      } catch (e) { visStatus('Kunne ikke læse billedet', true); }
    });
    bVis.replaceChildren(...(billede ? [opsBillede(billede, 'ops-mini'), knap('✕ Fjern billede', 'lille-knap', () => { billede = null; tegnB(); })] : []),
      knap(billede ? '📷 Andet billede' : '📷 Billede', 'lille-knap', () => fil.click()), fil);
  };
  tegnB();
  const fejl = el('p', 'fejl'); fejl.hidden = true;
  const linjer = t => t.value.split('\n').map(x => x.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
  const gem = knap('Gem', 'knap', async () => {
    const t = titel.value.trim();
    if (!t) { titel.focus(); return; }
    const k = kilde.value.trim();
    const felter = { titel: t[0].toUpperCase() + t.slice(1), ret: retSel.value || null, portioner: Math.min(50, parseInt(portioner.value) || 0) || null, tid: Math.min(1440, parseInt(tid.value) || 0) || null,
      ingredienser: linjer(ingr).slice(0, 80), fremgang: linjer(frem).slice(0, 60), note: note.value.trim(), kilde: k && /^(https?:\/\/|www\.)/i.test(k) ? k : '', billede, rettet: new Date().toISOString() };
    if (o.id) {
      if (o.billede?.sti && o.billede.sti !== billede?.sti) Data.sletFiler([o.billede.sti]).catch(() => {});
      await Data.update('opskrifter', o.id, felter);
    } else await Data.add('opskrifter', felter);
    nyFil = null; lukArk(); tegnAlt(); tegnOpskrifter();
  });
  let sletKlar = false;
  const slet = knap('Slet', 'knap fare', async () => {
    if (!sletKlar) { sletKlar = true; slet.textContent = 'Tryk igen for at slette'; return; }
    await Data.remove('opskrifter', o.id); lukArk(); tegnAlt(); tegnOpskrifter();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(...(o.id ? [slet] : []), gem);
  const to = el('div', 'to-felter'); to.append(felt('Portioner', portioner), felt('Tid (min.)', tid));
  aabnArk(o.id ? 'Ret opskrift' : 'Ny opskrift', felt('Navn', titel), felt('Hører til retten (madplanen)', retSel),
    el('p', 'hint', 'Koblet til en ret kan opskriften åbnes fra retten, og retten kan sættes på madplanen herfra.'),
    to, felt('Ingredienser', ingr), felt('Sådan gør du', frem), felt('Note', note), felt('Link', kilde), el('label', 'felt-label', 'Billede'), bVis, fejl, knapper);
  if (!o.id) setTimeout(() => titel.focus(), 50);
}

// Linje i "Ret ret" (retter.js): åbn rettens opskrift – eller lav en
function opsLinjeForRet(f) {
  const boks = el('div', 'ops-ret-linje');
  const liste = opsForRet(f);
  for (const o of liste) boks.append(knap('📖 Opskrift: ' + o.titel + ' ›', 'lille-knap', () => visOpskrift(o.id)));
  if (!erBarn()) boks.append(knap(liste.length ? '+ Endnu en opskrift' : '📖 + Tilføj opskrift', 'lille-knap', () => redigerOpskrift({}, f)));
  return boks;
}

// ---------- Fra Familiemappen ----------
// Noter i mappen "Opskrifter" (alle + kun voksne – ikke "Kun mig"). Flyttes kun, når en voksen trykker.
function opsGamleNoter() {
  return ['noter', 'noter_voksne'].flatMap(l => Data.listNu(l).filter(n => (n.mappe || '') === 'Opskrifter').map(n => ({ ...n, _liste: l })));
}
async function opsFlytFraMappen(noter) {
  let n = 0;
  for (const nt of noter) {
    const blokke = noteBlokke(nt);   // mappe.js
    const tekst = blokke.filter(b => b.type === 'tekst').map(b => b.tekst || '').join('\n').trim();
    const links = tekst.match(URL_RE) || [];
    const ingredienser = blokke.filter(b => b.type === 'tjek').flatMap(b => (b.punkter || []).map(p => p.tekst)).filter(Boolean);
    const tabeller = blokke.filter(b => b.type === 'tabel').flatMap(b => (b.raekker || []).map(r => r.filter(Boolean).join(' '))).filter(Boolean);
    const bil = blokke.find(b => b.type === 'billede' && (b.sti || b.src));
    const filer = blokke.filter(b => b.type === 'fil').map(b => b.navn + ' (ligger stadig i Familiemappen)');
    const ret = opsRetValg().find(f => lavt(f.tekst) === lavt(nt.titel));
    const brugtLink = links.length === 1 && tekst.replace(links[0], '').trim().length < 3;
    await Data.add('opskrifter', {
      titel: nt.titel || 'Opskrift', ret: ret?.id || null, ingredienser: [...ingredienser, ...tabeller].slice(0, 80),
      fremgang: brugtLink ? [] : tekst.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 60),
      note: filer.join('\n'), kilde: links[0] ? links[0].replace(/[.,;:!?)]+$/, '') : '', billede: bil ? (bil.sti ? { sti: bil.sti } : { src: bil.src }) : null,
      rettet: new Date().toISOString()
    });
    // Noter med filer bliver liggende (filerne hører til noten) – resten fjernes fra mappen
    if (!filer.length) { Data.huskFoer(nt.id); await Data.remove(nt._liste, nt.id); }
    n++;
  }
  visStatus('📖 ' + n + (n === 1 ? ' opskrift' : ' opskrifter') + ' flyttet hertil');
  tegnAlt(); tegnOpskrifter();
}
