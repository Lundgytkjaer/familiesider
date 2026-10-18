// bank.js – læser bankens CSV-eksport og inddeler posteringerne i budgettets poster.
// INGEN personlige data her (repoet er offentligt): reglerne og jeres konti ligger i databasen
// (budget-rækker {snap:'_bank', art:'regler'} og {snap:'_bank', art:'konti'}). Kontonumre gemmes kun som en kode (sha-256).
//
// Postering i filen (posteringer.json): {id, d, k, t, b, s, o, ty, n?, g?, sp?, ib?, mk?, af?}
//   id = sha1(konto|dato|tekst|beløb|nr)[:10] (samme som Claudes scripts), d = dato, k = kontonavn, t = tekst, b = beløb, s = saldo,
//   o = rækkefølge, ty = udgift | retur | intern | indskud | fra løn | til løn | flyttet, n/g = post og kategori,
//   sp = supplerende tekst (uden kortnumre), ib = indbetaler (to første ord), mk = modkonto (hvis det er en af jeres egne), af = flyttet fra id.
const Bank = (() => {
  const OPSPARET = { navn: 'Opsparet på kontiene (saldo steg/faldt)', gruppe: 'Opsparing' };

  // ---------- CSV ----------
  function csvLinjer(tekst) {
    const ud = []; let r = [], f = '', i = 0, q = false;
    while (i < tekst.length) {
      const c = tekst[i];
      if (q) {
        if (c === '"') { if (tekst[i + 1] === '"') { f += '"'; i++; } else q = false; }
        else f += c;
      } else if (c === '"') q = true;
      else if (c === ';') { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && tekst[i + 1] === '\n') i++; r.push(f); ud.push(r); r = []; f = ''; }
      else f += c;
      i++;
    }
    if (f || r.length) { r.push(f); ud.push(r); }
    return ud.filter(x => x.some(v => v.trim()));
  }
  const tal = s => { s = String(s || '').trim(); if (!s) return null; const v = Number(s.replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const isoDato = s => { const m = String(s || '').trim().match(/^(\d{2})[-.](\d{2})[-.](\d{4})$/); return m ? m[3] + '-' + m[2] + '-' + m[1] : null; };
  const cifre = s => String(s || '').replace(/\D/g, '');
  // Bankens supplerende tekst indeholder kortnumre o.l. – det gemmer vi ikke
  function rensSupp(s) {
    s = String(s || '');
    const stop = s.search(/Token|Kortnr|Wallet|VISA-NOTA/i);
    if (stop >= 0) s = s.slice(0, stop);
    return s.replace(/\d[\dX ]{4,}\d/g, '').replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  // Læser en CSV-fil fra banken (både den korte og den lange eksport – kolonnerne findes på navnet)
  function laesCsv(tekst) {
    const L = csvLinjer(tekst.replace(/^﻿/, ''));
    if (L.length < 2) throw new Error('Filen er tom');
    const h = L[0].map(x => x.trim().toLowerCase());
    const kol = navn => h.indexOf(navn.toLowerCase());
    const K = { konto: kol('Exportkonto'), afs: kol('Afsenderkonto'), mod: kol('Modtagerkonto'), dato: kol('Dato'), tekst: kol('Tekst'), beloeb: kol('Beløb'),
      saldo: kol('Saldo'), indbet: kol('Indbetaler'), supp: kol('Supp. tekst til modtager') >= 0 ? kol('Supp. tekst til modtager') : kol('Supp. tekst') };
    if (K.dato < 0 || K.tekst < 0 || K.beloeb < 0) throw new Error('Det ligner ikke en bankfil (mangler Dato, Tekst eller Beløb)');
    if (K.konto < 0) throw new Error('Filen mangler kolonnen Exportkonto – sæt flueben ved den, når du eksporterer');
    const rows = [];
    for (const r of L.slice(1)) {
      const d = isoDato(r[K.dato]), b = tal(r[K.beloeb]);
      if (!d || b == null) continue;
      rows.push({ nr: cifre(r[K.konto]), d, t: String(r[K.tekst] || '').trim(), b, s: K.saldo >= 0 ? tal(r[K.saldo]) : null,
        afs: K.afs >= 0 ? cifre(r[K.afs]) : '', mod: K.mod >= 0 ? cifre(r[K.mod]) : '',
        ib: K.indbet >= 0 ? String(r[K.indbet] || '').trim().split(/\s+/).slice(0, 2).join(' ') : '',
        sp: K.supp >= 0 ? rensSupp(r[K.supp]) : '' });
    }
    if (!rows.length) throw new Error('Ingen posteringer i filen');
    return rows;
  }

  // ---------- Koder (sha) ----------
  async function sha(algo, s) {
    const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const kontoKode = async nr => (await sha('SHA-256', 'familietavlen-konto|' + cifre(nr))).slice(0, 24);
  // Python skriver 12.0 for et helt tal – id'et skal være det samme som i Claudes scripts
  const pyTal = v => { v = Math.round(v * 100) / 100; return Number.isInteger(v) ? v.toFixed(1) : String(v); };
  const idFor = async (k, r, tael) => {
    const noegle = [k, r.d, r.t, pyTal(r.b)].join('|');
    tael.set(noegle, (tael.get(noegle) || 0) + 1);
    return (await sha('SHA-1', noegle + '|' + tael.get(noegle))).slice(0, 10);
  };
  // Giver hver postering id + kontonavn. konti: Map(kode → navn; '' = kontoen er ikke med).
  // Ukendte konti returneres (slut = sidste 4 cifre, antal, eksempler), så appen kan spørge.
  async function klarRaekker(raa, konti) {
    const koder = new Map();
    for (const nr of new Set(raa.flatMap(r => [r.nr, r.afs, r.mod]).filter(Boolean))) koder.set(nr, await kontoKode(nr));
    const navn = nr => (nr && konti.has(koder.get(nr)) ? konti.get(koder.get(nr)) : null) || null;
    const ukendte = [...new Set(raa.map(r => r.nr))].filter(nr => !konti.has(koder.get(nr))).map(nr => {
      const rk = raa.filter(r => r.nr === nr);
      return { nr, kode: koder.get(nr), slut: nr.slice(-4), antal: rk.length, eks: [...new Set(rk.map(r => r.t))].slice(0, 4) };
    });
    if (ukendte.length) return { ukendte };
    const tael = new Map(), rows = [];
    let o = 0;
    for (const r of raa) {
      const k = navn(r.nr);
      if (!k) continue;
      const id = await idFor(k, r, tael);
      const mk = navn(r.b < 0 ? r.mod : r.afs);
      const x = { id, d: r.d, k, t: r.t, b: Math.round(r.b * 100) / 100, s: r.s, o: o++ };
      if (r.sp) x.sp = r.sp;
      if (r.ib) x.ib = r.ib;
      if (mk && mk !== k) x.mk = mk;
      rows.push(x);
    }
    return { rows };
  }
  // Gæt hvilken konto en ukendt konto er: det navn, der giver flest id'er, som allerede findes i jeres posteringer
  async function gaetKonto(raa, nr, navne, kendte) {
    const rk = raa.filter(r => r.nr === nr);
    let bedst = null, max = 0;
    for (const n of navne) {
      const tael = new Map(); let hit = 0;
      for (const r of rk) if (kendte.has(await idFor(n, r, tael))) hit++;
      if (hit > max) { max = hit; bedst = n; }
    }
    return max >= Math.min(3, rk.length) ? bedst : null;
  }

  // ---------- Regler ----------
  // Python-agtig \b (æ/ø/å tæller som bogstaver)
  const B = '(?:(?<=[\\p{L}\\p{N}_])(?![\\p{L}\\p{N}_])|(?<![\\p{L}\\p{N}_])(?=[\\p{L}\\p{N}_]))';
  const rxCache = new Map();
  function rx(m) {
    if (!rxCache.has(m)) {
      let r;
      try { r = new RegExp(m.replace(/\\b/g, B), 'iu'); } catch { try { r = new RegExp(m, 'i'); } catch { r = /(?!)/; } }
      rxCache.set(m, r);
    }
    return rxCache.get(m);
  }
  const passer = (m, s) => rx(m).test(s || '');
  function norm(t) {
    return t.toUpperCase().replace(/\d{2}[./-]\d{2}([./-]\d{2,4})?/g, '').replace(/(?<![\p{L}\p{N}_])\d+(?![\p{L}\p{N}_])/gu, '')
      .replace(/\s+/g, ' ').replace(/^[ .,\-]+|[ .,\-]+$/g, '');
  }
  // Fælles betingelser for en regel
  function betingelser(r, x, T, katNavn) {
    const a = Math.abs(x.b);
    if (r.t && !passer(r.t, T)) return false;
    if (r.ikkeT && passer(r.ikkeT, T)) return false;
    if (r.tn && !passer(r.tn, norm(x.t))) return false;
    if (r.s != null && !passer(r.s, (x.sp || '').toUpperCase())) return false;
    if (r.ib && !passer(r.ib, x.ib || '')) return false;
    if (r.ikkeIb && passer(r.ikkeIb, (x.ib || '').toUpperCase())) return false;
    if (r.k && !r.k.includes(x.k)) return false;
    if (r.ikkeK && r.ikkeK.includes(x.k)) return false;
    if (r.kat && !r.kat.includes(katNavn)) return false;
    if (r.min != null && a < r.min) return false;
    if (r.max != null && a > r.max) return false;
    if (r.m && !r.m.includes(Number(x.d.slice(5, 7)))) return false;
    if (r.fortegn && Math.sign(x.b) !== r.fortegn) return false;
    return true;
  }
  const katAf = (R, x) => (R.kat || []).find(k => passer(k.t, x.t))?.navn || 'Andet / ukendt';

  // Overførsler mellem egne konti (parres ud/ind), indskud, fra/til løn, udgift, retur
  function klassificer(rows, R) {
    const ind = rows.filter(r => r.b > 0), brugt = new Set();
    for (const r of rows) r.ty = null;
    const dage = (a, b) => Math.abs((Date.parse(a) - Date.parse(b)) / 864e5);
    for (const r of rows) {
      if (r.b < 0 && r.mk) {
        r.ty = 'intern';
        for (let i = 0; i < ind.length; i++) {
          const q = ind[i];
          if (brugt.has(i)) continue;
          if (q.k === r.mk && Math.abs(q.b + r.b) < 0.01 && dage(q.d, r.d) <= 4) { brugt.add(i); q.ty = 'intern'; break; }
        }
      }
    }
    for (const r of rows) {
      if (r.ty) continue;
      const T = r.t.toUpperCase();
      if (r.b > 0) {
        const hit = (R.type || []).find(x => betingelser(x, r, T));
        r.ty = hit ? hit.ty : 'retur';
      } else r.ty = R.tilLoen && passer(R.tilLoen, T) ? 'til løn' : 'udgift';
    }
    for (const r of rows) if (r.ty === 'intern?') r.ty = 'intern';
    return rows;
  }
  // Hele inddelingen: type, post og kategori + de flyttede ekstra-posteringer. rows = alle rigtige posteringer (uden 'flyttet').
  function inddel(rows, R) {
    rows = rows.filter(x => x.ty !== 'flyttet').map(x => { const { n, g, ...y } = x; return y; }).sort((a, b) => a.o - b.o);
    klassificer(rows, R);
    const veksel = new Map(), ud = [];
    for (const x of rows) {
      const T = x.t.toUpperCase();
      if (x.b > 0 && (x.ty === 'fra løn' || x.ty === 'retur')) {
        const rf = (R.refusion || []).find(r => betingelser(r, x, T));
        if (rf) { x.n = rf.post; x.g = rf.gruppe; }
      }
      if (!x.n && (x.ty === 'udgift' || x.ty === 'retur')) {
        const kn = katAf(R, x);
        let hit = null, idx = -1;
        for (let i = 0; i < (R.post || []).length; i++) if (betingelser(R.post[i], x, T, kn)) { hit = R.post[i]; idx = i; break; }
        if (!hit) hit = R.standard || { post: 'Andet', gruppe: 'Andet' };
        let p = hit.post;
        if (Array.isArray(p)) {
          const nk = idx + '|' + x.d, nr = veksel.get(nk) || 0;
          veksel.set(nk, nr + 1); p = p[nr % p.length];
        }
        x.n = p; x.g = hit.gruppe;
      }
      ud.push(x);
      if (x.ty === 'intern' && x.b > 0) for (const f of R.flyt || []) if (betingelser(f, x, T)) {
        ud.push({ id: x.id + 's', d: x.d, k: x.k, t: f.tekst || f.post, b: -x.b, ty: 'flyttet', n: f.post, g: f.gruppe, af: x.id });
        ud.push({ id: x.id + 'h', d: x.d, k: x.k, t: f.fraTekst || f.fraPost, b: x.b, ty: 'flyttet', n: f.fraPost, g: f.fraGruppe, af: x.id });
      }
    }
    return ud.sort((a, b) => b.d.localeCompare(a.d) || b.o - a.o);
  }
  // Flet en ny fil ind i de gamle posteringer (samme id = samme postering)
  function flet(gamle, nye) {
    const m = new Map(gamle.filter(x => x.ty !== 'flyttet').map(x => [x.id, x]));
    let til = 0;
    for (const x of nye) if (!m.has(x.id)) { m.set(x.id, x); til++; }
    // Rækkefølge: efter dato, og inden for en dag som i filerne
    const alle = [...m.values()].sort((a, b) => a.d.localeCompare(b.d) || a.o - b.o);
    alle.forEach((x, i) => { x.o = i; });
    return { rows: alle, nye: til };
  }

  // ---------- Forbrug ----------
  // Saldoen på hver konto ved dagens begyndelse → hvor meget kontiene steg/faldt i perioden
  function saldi(rows, fra, til) {
    const pr = new Map();
    for (const x of rows) if (x.ty !== 'flyttet' && x.s != null) { if (!pr.has(x.k)) pr.set(x.k, []); pr.get(x.k).push(x); }
    let tot = 0;
    const r2 = v => Math.round(v * 100) / 100;
    for (const L of pr.values()) {
      L.sort((a, b) => a.d.localeCompare(b.d) || a.o - b.o);
      const foer = dato => {
        const fo = L.filter(x => x.d < dato);
        if (!fo.length) return L[0].s - L[0].b;
        const sidst = fo[fo.length - 1].d, dag = fo.filter(x => x.d === sidst);
        const ss = new Set(dag.map(x => r2(x.s - x.b)));
        const slut = dag.filter(x => !ss.has(r2(x.s)));
        return slut.length ? slut[0].s : dag[dag.length - 1].s;
      };
      tot += foer(til) - foer(fra);
    }
    return tot;
  }
  const naesteDag = iso => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
  // Forbrug pr. år: [{snap, art:'forbrug', maaneder, periode, dato, poster:[{navn, gruppe, aar}]}]
  function forbrug(rows, R) {
    if (!rows.length) return [];
    const fra0 = rows.reduce((m, x) => x.d < m ? x.d : m, '9999'), til0 = rows.reduce((m, x) => x.d > m ? x.d : m, '0000');
    const ops = (R && R.opsparing) || OPSPARET;
    const ud = [];
    for (let y = Number(fra0.slice(0, 4)); y <= Number(til0.slice(0, 4)); y++) {
      const start = y === Number(fra0.slice(0, 4)) && fra0 > y + '-01-07' ? fra0.slice(0, 8) + '01' : y + '-01-01';
      const slut = y === Number(til0.slice(0, 4)) && til0 < y + '-12-31' ? naesteDag(til0) : (y + 1) + '-01-01';
      const g = new Map();
      for (const x of rows) {
        if (!x.n || x.d < start || x.d >= slut) continue;
        const k = x.n + '\u0000' + x.g;
        g.set(k, (g.get(k) || 0) - x.b);
      }
      const ok = ops.navn + '\u0000' + ops.gruppe;
      g.set(ok, (g.get(ok) || 0) + saldi(rows, start, slut));
      const dage = (Date.parse(slut) - Date.parse(start)) / 864e5, aarDage = (Date.parse((y + 1) + '-01-01') - Date.parse(y + '-01-01')) / 864e5;
      const hel = start.endsWith('-01-01') && slut === (y + 1) + '-01-01';
      const maaneder = hel ? 12 : Math.round(dage / aarDage * 24) / 2;
      const dm = iso => Number(iso.slice(8, 10)) + '/' + Number(iso.slice(5, 7));
      const sidste = new Date(Date.parse(slut) - 864e5).toISOString().slice(0, 10);
      ud.push({ snap: String(y), art: 'forbrug', maaneder, periode: hel ? 'hele året' : dm(start) + '–' + dm(sidste), dato: slut,
        poster: [...g].map(([k, v]) => { const [navn, gruppe] = k.split('\u0000'); return { navn, gruppe, aar: Math.round(v) }; })
          .filter(p => Math.abs(p.aar) >= 1).sort((a, b) => a.gruppe.localeCompare(b.gruppe) || a.navn.localeCompare(b.navn)) });
    }
    return ud;
  }
  return { laesCsv, klarRaekker, gaetKonto, kontoKode, inddel, klassificer, flet, forbrug, saldi, rensSupp, norm, katAf };
})();
if (typeof module !== 'undefined') module.exports = Bank;
