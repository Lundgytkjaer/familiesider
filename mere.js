// mere.js – siderne under "Mere": Pligter og stjerner, Pakkelister og Ugens konkurrence.
// Bruger de fælles hjælpere fra app.js (el, knap, input, felt, chipValg, aabnArk, bekraeft ...).
// Data går som altid gennem Data (data.js).

const erVoksen = () => Data.bruger()?.rolle === 'voksen';
const loggetIndBarn = () => {
  const p = Data.bruger();
  return p && p.rolle === 'barn' && BOERN.includes(p.navn) ? p.navn : null;
};
const tal = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const sum = (liste, felt) => liste.reduce((s, x) => s + (Number(x[felt]) || 0), 0);
const kr = n => (Math.round(n * 100) / 100).toLocaleString('da-DK', { maximumFractionDigits: 2 }) + ' kr';
const kortDato = iso => { const d = new Date(iso + 'T00:00'); return DAGE[(d.getDay() + 6) % 7] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };

function bekraeftKnap(tekst, handling, klasse, fn) {
  const k = knap(tekst, klasse, () => bekraeft(k, fn));
  k.dataset.tekst = tekst;
  k.dataset.handling = handling;
  return k;
}
function fremskridt(andel) {
  const bar = el('span', 'fremskridt');
  const fyld = el('span');
  fyld.style.width = Math.round(Math.min(1, Math.max(0, andel)) * 100) + '%';
  bar.append(fyld);
  return bar;
}
function valgSeg(muligheder, valgt, onValg, tekstFn = v => v, ekstraKlasse = '') {
  const seg = el('div', 'seg ' + ekstraKlasse);
  seg.setAttribute('role', 'radiogroup');
  seg.append(...muligheder.map(m => {
    const k = knap(tekstFn(m), null, () => onValg(m));
    k.setAttribute('role', 'radio');
    k.setAttribute('aria-checked', m === valgt);
    return k;
  }));
  return seg;
}

function tegnMere() {
  tegnPligter();
  tegnPakkelister();
  tegnKonkurrence();
}

// =====================================================================
// PLIGTER OG STJERNER
// Data:
//   'opgaver'       {barn, navn, gentag: 'dag'|'uge'|'engang', dage: [0-6], kr, stjerner}   (kun voksne kan rette)
//   'flueben'       {opgave, barn, periode, dato, navn, kr, stjerner}  – periode = dato / ugens mandag / 'engang'
//   'beloenninger'  {barn: navn|'Begge', navn, stjerner}               (kun voksne kan rette)
//   'indloesninger' {barn, navn, stjerner, dato}
//   'udbetalinger'  {barn, kr, dato}                                   (kun voksne kan rette)
// =====================================================================
let pligtBarn = BOERN.includes(lokal.get('pligt-barn')) ? lokal.get('pligt-barn') : BOERN[0];
let pligtRet = false;

async function pligtData(barn) {
  const [opgaver, flueben, beloenninger, indl, udb] = await Promise.all(
    ['opgaver', 'flueben', 'beloenninger', 'indloesninger', 'udbetalinger'].map(l => Data.list(l)));
  return {
    opgaver: opgaver.filter(o => o.barn === barn),
    flueben: flueben.filter(f => f.barn === barn),
    beloenninger: beloenninger.filter(b => b.barn === barn || b.barn === 'Begge'),
    indl: indl.filter(x => x.barn === barn),
    udb: udb.filter(x => x.barn === barn)
  };
}

function saldo(d) {
  const man = isoDato(mandagDenneUge());
  return {
    stjerner: sum(d.flueben, 'stjerner') - sum(d.indl, 'stjerner'),
    tilGode: sum(d.flueben, 'kr') - sum(d.udb, 'kr'),
    ugeKr: sum(d.flueben.filter(f => f.dato >= man), 'kr')
  };
}

// Dagens opgaver: hver-dag-opgaver for i dag, ugens opgaver og engangsopgaver der ikke er klaret
function dagensOpgaver(d) {
  const nu = new Date();
  const iso = isoDato(nu), dag = idagNr(), man = isoDato(mandagDenneUge());
  const res = [];
  for (const o of d.opgaver) {
    let periode;
    if (o.gentag === 'uge') periode = man;
    else if (o.gentag === 'engang') periode = 'engang';
    else {
      if (o.dage && o.dage.length && !o.dage.includes(dag)) continue;
      periode = iso;
    }
    const f = d.flueben.find(x => x.opgave === o.id && x.periode === periode);
    if (o.gentag === 'engang' && f && f.dato !== iso) continue;   // klaret en tidligere dag
    res.push({ o, periode, f });
  }
  const orden = { dag: 0, uge: 1, engang: 2 };
  return res.sort((a, b) => Number(!!a.f) - Number(!!b.f) || (orden[a.o.gentag] ?? 0) - (orden[b.o.gentag] ?? 0));
}

async function skiftFlueben(barn, r) {
  if (r.f) await Data.remove('flueben', r.f.id);
  else await Data.add('flueben', {
    opgave: r.o.id, barn, periode: r.periode, dato: isoDato(new Date()),
    navn: r.o.navn, kr: tal(r.o.kr), stjerner: Math.round(tal(r.o.stjerner))
  });
  tegnAlt();
}

function opgaveLi(barn, r) {
  const li = el('li', 'punkt' + (r.f ? ' faerdig' : ''));
  const b = el('button', 'punkt-knap');
  b.type = 'button';
  b.setAttribute('aria-pressed', !!r.f);
  const tjek = el('span', 'tjek');
  tjek.innerHTML = IKON_TJEK;
  const tb = el('span', 'tekst-boks');
  tb.append(el('span', 'tekst', r.o.navn));
  const tags = el('span', 'tags');
  if (tal(r.o.kr)) tags.append(el('span', 'kr-tag', '+' + kr(tal(r.o.kr))));
  if (tal(r.o.stjerner)) tags.append(el('span', 'stjerne-tag', '★ ' + Math.round(tal(r.o.stjerner))));
  if (r.o.gentag === 'uge') tags.append(el('span', null, 'Ugens opgave'));
  if (r.o.gentag === 'engang') tags.append(el('span', null, 'Én gang'));
  tb.append(tags);
  b.append(tjek, tb);
  b.addEventListener('click', () => skiftFlueben(barn, r));
  li.append(b);
  return li;
}

// Kort til drengenes tavle
async function pligtKort(barn) {
  const d = await pligtData(barn);
  if (!d.opgaver.length) return null;
  const liste = dagensOpgaver(d);
  const s = saldo(d);
  const k = el('div', 'kort');
  const top = el('div', 'kort-top');
  top.append(el('span', 'kort-label', 'Pligter i dag'),
    knap('★ ' + s.stjerner + ' · ' + kr(s.tilGode) + ' ›', 'kort-pil link-knap', () => {
      pligtBarn = barn; visFane('pligter'); tegnPligter(); window.scrollTo(0, 0);
    }));
  const ul = el('ul', 'liste i-kort');
  liste.forEach(r => ul.append(opgaveLi(barn, r)));
  if (!liste.length) ul.append(el('li', 'tom', 'Ingen pligter i dag'));
  k.append(top, ul);
  return k;
}

async function tegnPligter() {
  const boks = document.getElementById('pligter-indhold');
  const laast = loggetIndBarn();
  if (laast) pligtBarn = laast;
  const barn = pligtBarn;
  const d = await pligtData(barn);
  const s = saldo(d);
  const dele = [];

  if (!laast) dele.push(valgSeg(BOERN, barn, b => { pligtBarn = b; lokal.set('pligt-barn', b); tegnPligter(); }));

  // Status
  const stat = el('div', 'stat-raekke');
  const st1 = el('div', 'stat');
  st1.append(el('span', 'stat-tal', '★ ' + s.stjerner), el('span', 'stat-navn', 'stjerner at bruge'));
  const st2 = el('div', 'stat');
  st2.append(el('span', 'stat-tal', kr(s.tilGode)), el('span', 'stat-navn', 'til gode · ' + kr(s.ugeKr) + ' i denne uge'));
  stat.append(st1, st2);
  dele.push(stat);

  if (erVoksen() && s.tilGode > 0) {
    dele.push(bekraeftKnap('Udbetal ' + kr(s.tilGode), 'udbetale', 'ryd udbetal', async () => {
      await Data.add('udbetalinger', { barn, kr: s.tilGode, dato: isoDato(new Date()) });
      tegnAlt();
    }));
  }

  // I dag
  dele.push(el('h3', 'lille-titel', 'I dag'));
  const ul = el('ul', 'liste');
  const idag = dagensOpgaver(d);
  idag.forEach(r => ul.append(opgaveLi(barn, r)));
  if (!idag.length) ul.append(el('li', 'tom', d.opgaver.length ? 'Ingen pligter i dag' : 'Ingen opgaver endnu'));
  dele.push(ul);

  // Belønninger
  dele.push(el('h3', 'lille-titel', 'Belønninger'));
  const bl = el('ul', 'beloen-liste');
  for (const b of [...d.beloenninger].sort((a, c) => a.stjerner - c.stjerner)) {
    const li = el('li', 'beloen');
    const nok = s.stjerner >= b.stjerner;
    const info = el('div', 'beloen-info');
    info.append(el('span', 'beloen-navn', b.navn),
      el('span', 'beloen-pris', '★ ' + b.stjerner + (nok ? ' · du har nok!' : ' · mangler ' + (b.stjerner - s.stjerner))),
      fremskridt(b.stjerner ? s.stjerner / b.stjerner : 1));
    const indloes = bekraeftKnap('Indløs', 'indløse', 'lille-knap', async () => {
      await Data.add('indloesninger', { barn, navn: b.navn, stjerner: b.stjerner, dato: isoDato(new Date()) });
      tegnAlt();
    });
    indloes.disabled = !nok;
    li.append(info, indloes);
    bl.append(li);
  }
  if (!d.beloenninger.length) bl.append(el('li', 'tom', 'Ingen belønninger endnu'));
  dele.push(bl);

  // Seneste
  const haendelser = [
    ...d.flueben.map(f => ({ dato: f.dato, tekst: f.navn, vaerdi: [tal(f.kr) ? '+' + kr(tal(f.kr)) : '', f.stjerner ? '+★ ' + f.stjerner : ''].filter(Boolean).join(' ') })),
    ...d.indl.map(x => ({ dato: x.dato, tekst: 'Indløst: ' + x.navn, vaerdi: '−★ ' + x.stjerner })),
    ...d.udb.map(x => ({ dato: x.dato, tekst: 'Lommepenge udbetalt', vaerdi: kr(tal(x.kr)) }))
  ].sort((a, b) => (b.dato || '').localeCompare(a.dato || '')).slice(0, 8);
  if (haendelser.length) {
    dele.push(el('h3', 'lille-titel', 'Seneste'));
    const hl = el('ul', 'historik');
    for (const h of haendelser) {
      const li = el('li');
      li.append(el('span', 'h-dato', kortDato(h.dato)), el('span', 'h-tekst', h.tekst), el('span', 'h-vaerdi', h.vaerdi));
      hl.append(li);
    }
    dele.push(hl);
  }

  // Voksne: ret opgaver og belønninger
  if (erVoksen()) {
    const retKnap = knap(pligtRet ? 'Færdig med at rette' : 'Ret opgaver og belønninger', 'ryd', () => { pligtRet = !pligtRet; tegnPligter(); });
    dele.push(retKnap);
    if (pligtRet) {
      const GENTAG = { dag: 'Hver dag', uge: 'Hver uge', engang: 'Én gang' };
      dele.push(el('h3', 'lille-titel', 'Opgaver for ' + barn));
      const ol = el('ul', 'ret-liste');
      for (const o of d.opgaver) {
        const li = el('li');
        const b = knap('', 'ret-raekke', () => redigerOpgave(o));
        const under = [GENTAG[o.gentag] || 'Hver dag'];
        if (o.gentag === 'dag' && o.dage && o.dage.length && o.dage.length < 7) under[0] = o.dage.map(i => DAGE[i]).join(', ');
        if (tal(o.kr)) under.push(kr(tal(o.kr)));
        if (tal(o.stjerner)) under.push('★ ' + tal(o.stjerner));
        b.append(el('span', 'ret-navn', o.navn), el('span', 'ret-under', under.join(' · ')), el('span', 'm-pil', '›'));
        li.append(b);
        ol.append(li);
      }
      if (!d.opgaver.length) ol.append(el('li', 'tom', 'Ingen opgaver'));
      dele.push(ol, knap('Ny opgave', 'lille-knap', () => redigerOpgave({ barn })));

      dele.push(el('h3', 'lille-titel', 'Belønninger'));
      const bl2 = el('ul', 'ret-liste');
      for (const bel of d.beloenninger) {
        const li = el('li');
        const b = knap('', 'ret-raekke', () => redigerBeloenning(bel));
        b.append(el('span', 'ret-navn', bel.navn), el('span', 'ret-under', '★ ' + bel.stjerner + ' · ' + (bel.barn === 'Begge' ? 'begge drenge' : bel.barn)), el('span', 'm-pil', '›'));
        li.append(b);
        bl2.append(li);
      }
      if (!d.beloenninger.length) bl2.append(el('li', 'tom', 'Ingen belønninger'));
      dele.push(bl2, knap('Ny belønning', 'lille-knap', () => redigerBeloenning({ barn: 'Begge' })));
    }
  }

  boks.replaceChildren(...dele);
}

function redigerOpgave(o) {
  const ny = !o.id;
  const navn = input('text', 'opg-navn', o.navn, 'Fx tøm opvaskemaskinen');
  let til = o.barn || pligtBarn;
  const tilValg = chipValg(ny ? [...BOERN, 'Begge'] : [o.barn], til, v => { til = v; });
  let gentag = o.gentag || 'dag';
  const dage = new Set(o.dage && o.dage.length ? o.dage : [0, 1, 2, 3, 4, 5, 6]);
  const dageBoks = el('div', 'seg wrap dage-valg');
  const tegnDage = () => {
    dageBoks.hidden = gentag !== 'dag';
    dageBoks.replaceChildren(...DAGE.map((d, i) => {
      const k = knap(d, null, () => { if (dage.has(i)) dage.delete(i); else dage.add(i); tegnDage(); });
      k.setAttribute('role', 'checkbox');
      k.setAttribute('aria-checked', dage.has(i));
      return k;
    }));
  };
  const gentagValg = chipValg(['dag', 'uge', 'engang'], gentag, v => { gentag = v; tegnDage(); },
    v => ({ dag: 'Hver dag', uge: 'Én gang om ugen', engang: 'Kun én gang' })[v]);
  tegnDage();
  const krInp = input('text', 'opg-kr', o.kr ? String(o.kr).replace('.', ',') : '', '0');
  krInp.inputMode = 'decimal';
  const stjInp = input('text', 'opg-stj', o.stjerner ? String(o.stjerner) : '', '0');
  stjInp.inputMode = 'numeric';
  const to = el('div', 'to-felter');
  to.append(felt('Lommepenge (kr)', krInp), felt('Stjerner', stjInp));

  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    const felter = {
      navn: n, gentag,
      dage: gentag === 'dag' ? [...dage].sort((a, b) => a - b) : [],
      kr: tal(krInp.value), stjerner: Math.round(tal(stjInp.value))
    };
    if (ny) for (const b of (til === 'Begge' ? BOERN : [til])) await Data.add('opgaver', { ...felter, barn: b });
    else await Data.update('opgaver', o.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('opgaver', o.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny opgave' : 'Ret opgave', felt('Opgave', navn), felt('Til', tilValg), felt('Hvor tit', gentagValg),
    dageBoks, to, el('p', 'hint', 'Giv lommepenge for pligter og stjerner for motivationsopgaver – eller begge dele.'), knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

function redigerBeloenning(b) {
  const ny = !b.id;
  const navn = input('text', 'bel-navn', b.navn, 'Fx tur i biografen');
  let til = b.barn || 'Begge';
  const tilValg = chipValg(['Begge', ...BOERN], til, v => { til = v; }, v => (v === 'Begge' ? 'Begge drenge' : v));
  const stj = input('text', 'bel-stj', b.stjerner ? String(b.stjerner) : '', 'Fx 10');
  stj.inputMode = 'numeric';
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    const pris = Math.round(tal(stj.value));
    if (!n) { navn.focus(); return; }
    if (pris <= 0) { stj.focus(); return; }
    const felter = { navn: n, barn: til, stjerner: pris };
    if (ny) await Data.add('beloenninger', felter); else await Data.update('beloenninger', b.id, felter);
    lukArk(); tegnAlt();
  });
  const knapper = el('div', 'ark-knapper');
  if (!ny) knapper.append(knap('Slet', 'knap fare', async () => { await Data.remove('beloenninger', b.id); lukArk(); tegnAlt(); }));
  knapper.append(gem);
  aabnArk(ny ? 'Ny belønning' : 'Ret belønning', felt('Belønning', navn), felt('Til', tilValg), felt('Koster (stjerner)', stj), knapper);
  if (ny) setTimeout(() => navn.focus(), 50);
}

// =====================================================================
// PAKKELISTER
// Data: 'pakkelister' {navn}   'pakkepunkter' {liste, tekst, hvem, pakket}
// =====================================================================
let pakValgt = lokal.get('pak-valgt') || '';
let pakFilter = 'Alle';
let pakNyHvem = 'Alle';
const pakForm = (() => {
  const form = el('form', 'tilfoj');
  const inp = el('input');
  inp.type = 'text'; inp.id = 'ny-pak'; inp.placeholder = 'Fx opladere'; inp.autocomplete = 'off'; inp.enterKeyHint = 'done';
  inp.setAttribute('aria-label', 'Tilføj til pakkelisten');
  form.append(inp, el('button', 'knap', 'Tilføj'));
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const tekst = inp.value.trim();
    if (!tekst || !pakValgt) return;
    inp.value = '';
    await Data.add('pakkepunkter', { liste: pakValgt, tekst, hvem: pakNyHvem === 'Alle' ? '' : pakNyHvem, pakket: false });
    tegnPakkelister();
    inp.focus();
  });
  return form;
})();

async function tegnPakkelister() {
  const boks = document.getElementById('pak-indhold');
  const lister = (await Data.list('pakkelister')).sort((a, b) => a.navn.localeCompare(b.navn, 'da'));
  const punkter = await Data.list('pakkepunkter');
  const valgt = lister.find(l => l.id === pakValgt);

  if (!valgt) {
    const grid = el('div', 'pak-grid');
    for (const l of lister) {
      const mine = punkter.filter(p => p.liste === l.id);
      const pakket = mine.filter(p => p.pakket).length;
      const k = knap('', 'kort pak-kort', () => {
        pakValgt = l.id; lokal.set('pak-valgt', l.id); pakFilter = 'Alle'; tegnPakkelister(); window.scrollTo(0, 0);
      });
      k.append(el('span', 'pak-navn', l.navn), el('span', 'under', pakket + ' af ' + mine.length + ' pakket'), fremskridt(mine.length ? pakket / mine.length : 0));
      grid.append(k);
    }
    if (!lister.length) grid.append(el('p', 'under', 'Ingen pakkelister endnu.'));
    boks.replaceChildren(grid, knap('Ny pakkeliste', 'knap bred-knap', () => navnPakkeliste({})));
    return;
  }

  const mine = punkter.filter(p => p.liste === valgt.id);
  const pakket = mine.filter(p => p.pakket).length;
  const top = el('div', 'pak-top');
  top.append(knap('‹ Alle lister', 'lille-knap', () => { pakValgt = ''; lokal.set('pak-valgt', ''); tegnPakkelister(); }));
  const titel = el('div', 'pak-titel');
  titel.append(el('h3', 'lille-titel', valgt.navn), el('span', 'under', pakket + ' af ' + mine.length + ' pakket'), fremskridt(mine.length ? pakket / mine.length : 0));

  const personer = ['Alle', ...PERSONER.filter(p => p !== 'Fælles' && mine.some(x => x.hvem === p))];
  if (!personer.includes(pakFilter)) pakFilter = 'Alle';
  const filter = personer.length > 1 ? valgSeg(personer, pakFilter, v => { pakFilter = v; tegnPakkelister(); }, v => (v === 'Alle' ? 'Alle' : v)) : '';

  const hvemValg = valgSeg(['Alle', ...PERSONER.filter(p => p !== 'Fælles')], pakNyHvem, v => { pakNyHvem = v; tegnPakkelister(); },
    v => (v === 'Alle' ? 'Fælles' : v), 'wrap lille-seg');

  const ul = el('ul', 'liste');
  const viste = mine.filter(p => pakFilter === 'Alle' || p.hvem === pakFilter)
    .sort((a, b) => Number(a.pakket) - Number(b.pakket) || a.tekst.localeCompare(b.tekst, 'da'));
  for (const p of viste) {
    const li = el('li', 'punkt' + (p.pakket ? ' faerdig' : ''));
    const b = el('button', 'punkt-knap');
    b.type = 'button';
    b.setAttribute('aria-pressed', !!p.pakket);
    const tjek = el('span', 'tjek');
    tjek.innerHTML = IKON_TJEK;
    const tb = el('span', 'tekst-boks');
    tb.append(el('span', 'tekst', p.tekst));
    if (p.hvem) {
      const tags = el('span', 'tags');
      const t = el('span', 'hvem-tag ' + (PK[p.hvem] || ''), p.hvem);
      tags.append(t);
      tb.append(tags);
    }
    b.append(tjek, tb);
    b.addEventListener('click', async () => { await Data.update('pakkepunkter', p.id, { pakket: !p.pakket }); tegnPakkelister(); });
    const slet = knap('', 'slet', async () => { await Data.remove('pakkepunkter', p.id); tegnPakkelister(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet ' + p.tekst);
    li.append(b, slet);
    ul.append(li);
  }
  if (!viste.length) ul.append(el('li', 'tom', 'Intet på listen endnu'));

  const fod = el('div', 'pak-fod');
  fod.append(
    bekraeftKnap('Start forfra', 'starte forfra', 'lille-knap', async () => {
      for (const p of mine.filter(p => p.pakket)) await Data.update('pakkepunkter', p.id, { pakket: false });
      tegnPakkelister();
    }),
    knap('Omdøb', 'lille-knap', () => navnPakkeliste(valgt)),
    bekraeftKnap('Slet liste', 'slette', 'lille-knap fare-knap', async () => {
      for (const p of mine) await Data.remove('pakkepunkter', p.id);
      await Data.remove('pakkelister', valgt.id);
      pakValgt = ''; lokal.set('pak-valgt', '');
      tegnPakkelister();
    })
  );

  const nyLabel = el('p', 'seg-label', 'Ny ting er til:');
  const visLabel = filter ? el('p', 'seg-label', 'Vis:') : '';
  boks.replaceChildren(top, titel, pakForm, nyLabel, hvemValg, visLabel, filter, ul, fod);
}

function navnPakkeliste(l) {
  const ny = !l.id;
  const navn = input('text', 'pakliste-navn', l.navn, 'Fx weekend hos mormor');
  const gem = knap('Gem', 'knap', async () => {
    const n = navn.value.trim();
    if (!n) { navn.focus(); return; }
    if (ny) { const nyL = await Data.add('pakkelister', { navn: n }); pakValgt = nyL.id; lokal.set('pak-valgt', nyL.id); }
    else await Data.update('pakkelister', l.id, { navn: n });
    lukArk(); tegnPakkelister();
  });
  const knapper = el('div', 'ark-knapper');
  knapper.append(gem);
  aabnArk(ny ? 'Ny pakkeliste' : 'Omdøb pakkeliste', felt('Navn', navn), knapper);
  setTimeout(() => navn.focus(), 50);
}

// =====================================================================
// UGENS KONKURRENCE – hvem cykler eller går længst
// Data: 'motion' {hvem, dato, km, type: 'cykel'|'gaa'}
// =====================================================================
const DELTAGERE = ['Timmo', 'Winnie', 'Oliver', 'Villads'];
const MOTION_NAVN = { cykel: 'Cykel', gaa: 'Gå', samlet: 'Samlet' };
let konkUge = 0;
let konkType = ['cykel', 'gaa', 'samlet'].includes(lokal.get('konk-type')) ? lokal.get('konk-type') : 'samlet';
let konkHvem = null;
let konkNyType = 'cykel';
const fmtKm = n => n.toLocaleString('da-DK', { maximumFractionDigits: 1 }) + ' km';

const konkForm = (() => {
  const form = el('form', 'konk-form');
  const km = el('input');
  km.type = 'text'; km.id = 'konk-km'; km.placeholder = 'Km'; km.inputMode = 'decimal'; km.autocomplete = 'off';
  km.setAttribute('aria-label', 'Kilometer');
  const dato = el('input');
  dato.type = 'date'; dato.id = 'konk-dato';
  dato.setAttribute('aria-label', 'Dato');
  const raekke = el('div', 'konk-felter');
  raekke.append(km, dato, el('button', 'knap', 'Tilføj'));
  form.append(raekke);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const v = tal(km.value);
    if (v <= 0) { km.focus(); return; }
    await Data.add('motion', { hvem: konkHvem, dato: dato.value || isoDato(new Date()), km: v, type: konkNyType });
    km.value = '';
    tegnKonkurrence();
  });
  return { form, km, dato };
})();

function ugeVinder(alle, manIso, sonIso, type) {
  const ugens = alle.filter(m => m.dato >= manIso && m.dato <= sonIso && (type === 'samlet' || m.type === type));
  let bedst = null;
  for (const p of DELTAGERE) {
    const km = sum(ugens.filter(m => m.hvem === p), 'km');
    if (km > 0 && (!bedst || km > bedst.km)) bedst = { hvem: p, km };
  }
  return bedst;
}

async function tegnKonkurrence() {
  const boks = document.getElementById('konk-indhold');
  if (!konkHvem) konkHvem = DELTAGERE.includes(Data.bruger()?.navn) ? Data.bruger().navn : DELTAGERE[0];
  const man = mandagDenneUge();
  man.setDate(man.getDate() + konkUge * 7);
  const son = new Date(man); son.setDate(man.getDate() + 6);
  const manIso = isoDato(man), sonIso = isoDato(son);
  const alle = await Data.list('motion');
  const ugens = alle.filter(m => m.dato >= manIso && m.dato <= sonIso);

  // Uge-navigation
  const nav = el('div', 'kal-nav');
  const titel = el('div', 'kal-titel');
  titel.append(el('strong', null, 'Uge ' + ugenummer(man) + ' · ' + man.getDate() + '. ' + MDR[man.getMonth()] + '–' + son.getDate() + '. ' + MDR[son.getMonth()]));
  if (konkUge !== 0) titel.append(knap('Til denne uge', 'lille-knap', () => { konkUge = 0; tegnKonkurrence(); }));
  const forrige = knap('‹', 'pil', () => { konkUge--; tegnKonkurrence(); });
  forrige.setAttribute('aria-label', 'Forrige uge');
  const naeste = knap('›', 'pil', () => { konkUge++; tegnKonkurrence(); });
  naeste.setAttribute('aria-label', 'Næste uge');
  nav.append(forrige, titel, naeste);

  const typeValg = valgSeg(['cykel', 'gaa', 'samlet'], konkType, v => { konkType = v; lokal.set('konk-type', v); tegnKonkurrence(); }, v => MOTION_NAVN[v]);

  // Stilling
  const stilling = DELTAGERE.map(p => ({
    hvem: p, km: sum(ugens.filter(m => m.hvem === p && (konkType === 'samlet' || m.type === konkType)), 'km')
  })).sort((a, b) => b.km - a.km);
  const max = Math.max(...stilling.map(s => s.km), 0);
  const ol = el('ol', 'konk-liste');
  stilling.forEach((s, i) => {
    const plads = s.km > 0 ? (i === 0 || s.km < stilling[i - 1].km ? i + 1 : null) : null;
    const li = el('li', 'konk-raekke ' + PK[s.hvem] + (plads === 1 ? ' foerer' : ''));
    const bar = el('span', 'konk-bar');
    const fyld = el('span');
    fyld.style.width = (max ? Math.round(s.km / max * 100) : 0) + '%';
    bar.append(fyld);
    li.append(el('span', 'konk-plads', s.km > 0 ? (plads ? plads + '.' : '') : '–'), el('span', 'konk-navn', s.hvem), bar, el('span', 'konk-km', fmtKm(s.km)));
    ol.append(li);
  });
  const status = max === 0 ? el('p', 'hint', 'Ingen kilometer i denne uge endnu.')
    : el('p', 'konk-status', (konkUge === 0 ? 'Fører lige nu: ' : 'Vinder: ') + stilling[0].hvem + ' med ' + fmtKm(stilling[0].km));

  // Tilføj tur
  const dagsDato = konkUge === 0 ? isoDato(new Date()) : manIso;
  if (!konkForm.dato.value || konkForm.dato.value < manIso || konkForm.dato.value > sonIso) konkForm.dato.value = dagsDato;
  const tilfoej = el('div', 'kort konk-tilfoej');
  tilfoej.append(
    el('span', 'kort-label', 'Tilføj en tur'),
    valgSeg(DELTAGERE, konkHvem, v => { konkHvem = v; tegnKonkurrence(); }, v => v, 'wrap lille-seg'),
    valgSeg(['cykel', 'gaa'], konkNyType, v => { konkNyType = v; tegnKonkurrence(); }, v => (v === 'cykel' ? 'Cyklet' : 'Gået'), 'lille-seg'),
    konkForm.form
  );

  // Ugens ture
  const ture = el('ul', 'historik');
  for (const m of [...ugens].sort((a, b) => b.dato.localeCompare(a.dato))) {
    const li = el('li', PK[m.hvem]);
    const slet = knap('', 'slet', async () => { await Data.remove('motion', m.id); tegnKonkurrence(); });
    slet.innerHTML = IKON_SLET;
    slet.setAttribute('aria-label', 'Slet tur');
    li.append(el('span', 'h-dato', kortDato(m.dato)), el('span', 'h-tekst', m.hvem + ' · ' + (m.type === 'cykel' ? 'cyklet' : 'gået')), el('span', 'h-vaerdi', fmtKm(tal(m.km))), slet);
    ture.append(li);
  }

  // Tidligere vindere
  const vindere = el('ul', 'historik');
  for (let i = 1; i <= 8; i++) {
    const m = new Date(man); m.setDate(m.getDate() - i * 7);
    const s = new Date(m); s.setDate(m.getDate() + 6);
    const v = ugeVinder(alle, isoDato(m), isoDato(s), konkType);
    if (!v) continue;
    const li = el('li', PK[v.hvem]);
    li.append(el('span', 'h-dato', 'Uge ' + ugenummer(m)), el('span', 'h-tekst', v.hvem), el('span', 'h-vaerdi', fmtKm(v.km)));
    vindere.append(li);
  }

  const dele = [nav, typeValg, ol, status, tilfoej];
  if (ugens.length) dele.push(el('h3', 'lille-titel', 'Ugens ture'), ture);
  if (vindere.children.length) dele.push(el('h3', 'lille-titel', 'Tidligere vindere (' + MOTION_NAVN[konkType].toLowerCase() + ')'), vindere);
  boks.replaceChildren(...dele);
}

// =====================================================================
// Startindhold – lægges ind én gang (eksempler som kan rettes og slettes)
// =====================================================================
async function laegMereStartInd() {
  const indst = await Data.list('indstillinger');
  const harGjort = noegle => indst.some(x => x.noegle === noegle);

  if (!harGjort('start-pakkelister') && !(await Data.list('pakkelister')).length) {
    await Data.add('indstillinger', { noegle: 'start-pakkelister', vaerdi: '1' });
    const eksempler = {
      'Weekend i sommerhuset': ['Sengetøj', 'Håndklæder', 'Opladere', 'Mad til første aften', 'Regntøj', 'Gummistøvler', 'Spil og bøger', 'Hø og foder til Alfie'],
      'Sommerferie': ['Tøj', 'Badetøj', 'Solcreme', 'Solbriller', 'Toilettaske', 'Opladere', 'Pas', 'Sygesikringskort', 'Snacks til turen', 'Hovedtelefoner']
    };
    for (const [navn, ting] of Object.entries(eksempler)) {
      const l = await Data.add('pakkelister', { navn });
      await Data.addMange('pakkepunkter', ting.map(tekst => ({ liste: l.id, tekst, hvem: '', pakket: false })));
    }
  }

  // Opgaver og belønninger kan kun voksne lægge ind
  if (erVoksen() && !harGjort('start-pligter') && !(await Data.list('opgaver')).length) {
    await Data.add('indstillinger', { noegle: 'start-pligter', vaerdi: '1' });
    const opgaver = [];
    for (const barn of BOERN) {
      opgaver.push(
        { barn, navn: 'Tøm opvaskemaskinen', gentag: 'dag', dage: [], kr: 5, stjerner: 0 },
        { barn, navn: 'Giv Alfie mad og vand', gentag: 'dag', dage: [], kr: 3, stjerner: 0 },
        { barn, navn: 'Ryd op på værelset', gentag: 'uge', dage: [], kr: 20, stjerner: 0 }
      );
    }
    opgaver.push(
      { barn: 'Villads', navn: 'Læs i 15 minutter', gentag: 'dag', dage: [], kr: 0, stjerner: 1 },
      { barn: 'Villads', navn: 'Klar til skole til tiden', gentag: 'dag', dage: [0, 1, 2, 3, 4], kr: 0, stjerner: 1 }
    );
    await Data.addMange('opgaver', opgaver);
    await Data.addMange('beloenninger', [
      { barn: 'Begge', navn: 'Vælg aftensmaden', stjerner: 5 },
      { barn: 'Begge', navn: '30 minutters ekstra skærmtid', stjerner: 10 },
      { barn: 'Begge', navn: 'Tur i biografen', stjerner: 30 }
    ]);
  }
}
