// data.js – det ENESTE sted der ved, hvor data gemmes: Supabase.
// Resten af siden kender kun funktionerne i Data herunder.
//
// Alt ligger i én tabel "punkter": hver række har en liste (fx 'indkob'),
// og selve indholdet i feltet data (JSON). Rækkerne holdes i hukommelsen,
// så siden er hurtig, og ændringer fra de andre i familien kommer ind live.

const SUPABASE_URL = 'https://vymohgarikwlkpidcjgu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_3e2ZRaUFg6f2O2O0xq_hYw_FnYSheP5'; // offentlig nøgle – beskyttet af databasens regler
const EMAIL_DOMAENE = 'familien.local'; // "Oliver" logger ind som oliver@familien.local

const Data = (() => {
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  let raekker = [];          // alle rækker: {id, liste, data, oprettet}
  let profil = null;         // {id, navn, rolle}
  const lyttere = [];
  let timer;
  const filUrlCache = new Map();   // sti → {url, til}

  // Fortryd: slettede rækker huskes kort, så de kan sættes ind igen (med samme id).
  // Flere sletninger lige efter hinanden (fx "Ryd klarede") bliver til én fortrydelse.
  const IKKE_FORTRYD = new Set(['flueben', 'indloesninger']);   // har deres egen fortryd/af-knap
  let stille = 0, gruppe = null, fortrydLytter = null;
  // tekst = hvad bjælken skal sige (fx "Godkendt: LEGO") – så kan også et svar på et ønske fortrydes
  function husk(r, tekst) {
    if (!r || stille || (!tekst && IKKE_FORTRYD.has(r.liste))) return;
    const nu = Date.now();
    if (!gruppe || nu - gruppe.tid > 1500) gruppe = { tid: nu, raekker: [] };
    gruppe.tid = nu;
    if (!gruppe.raekker.some(x => x.id === r.id)) gruppe.raekker.push(JSON.parse(JSON.stringify(r)));
    gruppe.tekst = tekst || null;
    if (fortrydLytter) fortrydLytter(gruppe);
  }

  // Push trin 2: efter et nyt/rettet ønske eller en seddel bedes Edge Function'en "push" om at give besked.
  // Den henter selv rækken og afgør, om nogen skal have besked (og sender højst én gang). Fejl ignoreres stille.
  const PUSH_LISTER = new Set(['indloesninger', 'ekstra', 'madoensker', 'sedler', 'justeringer']);
  function pushOm(liste, id) {
    if (!PUSH_LISTER.has(liste) || !id) return;
    db.functions.invoke('push', { body: { type: 'punkt', id } }).catch(() => {});
  }

  // _af = hvem der oprettede rækken (bruges fx til at børn kun kan slette deres egne indkøbsønsker)
  const tilPunkt = r => ({ ...r.data, id: r.id, oprettet: r.oprettet, _af: r.oprettet_af });

  // ---------- Ændringer vises med det samme ----------
  // Ret og slet ændrer først rækkerne her på telefonen (så skærmen svarer med det samme) og sendes så til databasen
  // i baggrunden – én ad gangen og i rækkefølge. Siger databasen nej (fx intet net eller børnelåsen), rulles
  // ændringen tilbage, der kommer en besked, og alt hentes forfra, så skærmen viser det, der faktisk er gemt.
  let koe = Promise.resolve();
  let udefra = 0;   // tæller op, når der kommer ændringer fra de andre (bruges til at vide, hvornår noget skal hentes igen)
  const ventende = new Map();   // id → antal ændringer der endnu ikke er gemt (live-opdateringer af dem ignoreres imens)
  const iKoe = fn => (koe = koe.then(fn, fn));   // det næste kører også, selvom det forrige fejlede
  function iBaggrund(ids, send, rul) {
    ids.forEach(id => ventende.set(id, (ventende.get(id) || 0) + 1));
    iKoe(async () => {
      try { await send(); }
      catch (e) {
        console.warn('Kunne ikke gemme:', e);
        rul();
        const nej = e?.code === '42501' || /voksne/.test(e?.message || '');
        if (erNetfejl(e)) { netNede = !!forbundet; if (typeof visStatus === 'function') visStatus(UDEN_NET_BESKED); }   // rolig, ikke rød
        else if (typeof visStatus === 'function') visStatus(nej ? 'Det kan kun de voksne ændre 🙂' : 'Kunne ikke gemme – prøv igen.', true);
        fortaelLyttere();
        setTimeout(genhent, 300);
      } finally {
        ids.forEach(id => { const n = (ventende.get(id) || 1) - 1; if (n > 0) ventende.set(id, n); else ventende.delete(id); });
      }
    });
  }

  function gemLokalt(r) {
    const i = raekker.findIndex(x => x.id === r.id);
    if (i >= 0) raekker[i] = r; else raekker.push(r);
  }

  // Saml mange ændringer i én opdatering af skærmen
  function fortaelLyttere() {
    clearTimeout(timer);
    timer = setTimeout(() => lyttere.forEach(fn => fn()), 150);
    gemKopiSnart();
  }

  // ---------- Kopi på telefonen (til brug uden net) ----------
  // Rækkerne og profilen gemmes i telefonens egen database (IndexedDB), hver gang de er hentet eller ændret.
  // Uden net starter appen fra kopien. Kopien slettes ved log ud. Fejl her må aldrig vælte appen.
  const Kopi = (() => {
    const aabn = () => new Promise((ok, fejl) => {
      const q = indexedDB.open('familietavlen', 1);
      q.onupgradeneeded = () => q.result.createObjectStore('kopi');
      q.onsuccess = () => ok(q.result);
      q.onerror = () => fejl(q.error);
    });
    const med = async (skriv, fn) => {
      const d = await aabn();
      try {
        return await new Promise((ok, fejl) => {
          const t = d.transaction('kopi', skriv ? 'readwrite' : 'readonly'), q = fn(t.objectStore('kopi'));
          t.oncomplete = () => ok(q && q.result);
          t.onerror = t.onabort = () => fejl(t.error);
        });
      } finally { d.close(); }
    };
    return {
      async hent() { try { const k = await med(false, s => s.get('alt')); return k && k.profil && Array.isArray(k.raekker) ? k : null; } catch (e) { return null; } },
      async gem(k) { try { await med(true, s => s.put(k, 'alt')); } catch (e) { console.warn('Kunne ikke gemme kopien:', e); } },
      async hentKoe() { try { const k = await med(false, s => s.get('koe')); return Array.isArray(k) ? k : []; } catch (e) { return []; } },
      async gemKoe(k) { try { await med(true, s => s.put(k, 'koe')); } catch (e) { console.warn('Kunne ikke gemme køen:', e); } },
      async slet() { try { await med(true, s => { s.delete('alt'); return s.delete('koe'); }); } catch (e) { /* ingen kopi */ } }
    };
  })();
  let kopiTimer, kopiStop = false;   // kopiStop: der logges ud – gem ikke mere
  function gemKopiSnart() {
    if (!profil || kopiStop) return;
    clearTimeout(kopiTimer);
    kopiTimer = setTimeout(() => { if (profil && !kopiStop) Kopi.gem({ profil, raekker, tid: Date.now() }); }, 1500);
  }
  const UDEN_NET_BESKED = 'Uden net – det her gemmes først, når nettet er tilbage. Prøv igen om lidt (Indkøb virker uden net).';
  // Er det nettet, der mangler (og ikke fx en forkert kode eller børnelåsen)?
  const erNetfejl = e => !navigator.onLine || e?.name === 'AuthRetryableFetchError' || e?.status === 0
    || /failed to fetch|load failed|networkerror|network request failed|fetch failed/i.test(e?.message || '');

  // ---------- Kø på telefonen: Indkøb (og hurtigvalget) virker uden net ----------
  // Ændringer i KOE_LISTER vises med det samme, gemmes i telefonens kø (overlever at appen lukkes) og sendes én ad
  // gangen i den rækkefølge, de blev lavet. Intet net → de bliver liggende og sendes, når nettet er tilbage (ingen
  // tilbagerulning, ingen rød besked). Nye rækker får deres id her på telefonen.
  // En rettelse sender kun de felter, der blev rørt (lægges oven på det, der står i databasen lige nu).
  // Er rækken slettet af en anden imens, droppes rettelsen. Siger databasen nej (fx børnelåsen), droppes ændringen.
  const KOE_LISTER = new Set(['indkob', 'favoritter']);
  let koeListe = [];   // [{type: 'add'|'update'|'remove'|'upsert', liste, id, ids, data, felter, raekker}]
  let koeSkriv = Promise.resolve(), sender = null, netNede = false;
  const klon = x => JSON.parse(JSON.stringify(x));
  const nytId = () => crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  function gemKoe() { const k = klon(koeListe); koeSkriv = koeSkriv.then(() => kopiStop ? null : Kopi.gemKoe(k)); return koeSkriv; }
  function laegIKoe(op) { koeListe.push(klon({ ...op, tid: Date.now() })); gemKoe(); fortaelLyttere(); sendKoe(); }
  const koeHar = id => koeListe.some(o => o.id === id || (o.ids || []).includes(id) || (o.raekker || []).some(r => r.id === id));
  // Læg de ventende ændringer oven på rækkerne (efter hver hentning, så de ikke forsvinder fra skærmen)
  function anvendKoe() {
    for (const o of koeListe) {
      if (o.type === 'add') { if (!raekker.some(x => x.id === o.id)) raekker.push({ id: o.id, liste: o.liste, data: klon(o.data), oprettet: o.oprettet, oprettet_af: o.af }); }
      else if (o.type === 'update') { const r = raekker.find(x => x.id === o.id); if (r) gemLokalt({ ...r, data: { ...r.data, ...klon(o.felter), _t: { ...(r.data._t || {}), ...Object.fromEntries(Object.keys(o.felter).map(k => [k, o.tid || 0])) } } }); }
      else if (o.type === 'remove') { const s = new Set(o.ids); raekker = raekker.filter(x => !s.has(x.id)); }
      else if (o.type === 'upsert') o.raekker.forEach(r => gemLokalt(klon(r)));
    }
  }
  async function sendEn(o) {
    if (o.type === 'add') {
      const { error } = await db.from('punkter').insert({ id: o.id, liste: o.liste, data: o.data });
      if (error && error.code !== '23505') throw error;   // 23505 = findes allerede (sendt før, men svaret gik tabt)
      pushOm(o.liste, o.id);
    } else if (o.type === 'update') {
      const { data: nu, error: f1 } = await db.from('punkter').select('data').eq('id', o.id).maybeSingle();
      if (f1) throw f1;
      if (!nu) return;   // slettet imens – rettelsen droppes
      // Seneste ændring vinder, felt for felt: data._t = { felt: tidspunkt for ændringen (telefonens ur) }
      const tid = o.tid || Date.now(), t = nu.data._t || {}, ny = { ...nu.data }, nyT = { ...t };
      let noget = false;
      for (const [k, v] of Object.entries(o.felter)) {
        if (k === '_t' || (t[k] || 0) > tid) continue;   // en anden har ændret feltet senere – deres vinder
        ny[k] = v; nyT[k] = tid; noget = true;
      }
      if (!noget) return;
      ny._t = nyT;
      const { error } = await db.from('punkter').update({ data: ny }).eq('id', o.id);
      if (error) throw error;
      pushOm(o.liste, o.id);
    } else if (o.type === 'remove') {
      // Er en vare rettet af en anden EFTER min sletning, bliver den (ingen varer må forsvinde)
      let ids = o.ids;
      if (o.tid) {
        const { data: nu, error: f1 } = await db.from('punkter').select('id, data').in('id', ids);
        if (f1) throw f1;
        const nyere = new Set((nu || []).filter(r => Object.values(r.data?._t || {}).some(x => x > o.tid)).map(r => r.id));
        ids = ids.filter(id => !nyere.has(id));
      }
      if (!ids.length) return;
      const { error } = await db.from('punkter').delete().in('id', ids);
      if (error) throw error;
    } else if (o.type === 'upsert') {
      const { error } = await db.from('punkter').upsert(o.raekker);
      if (error) throw error;
    }
  }
  const proevIgen = e => erNetfejl(e) || e?.code === 'PGRST301' || /jwt/i.test(e?.message || '');   // net eller udløbet login
  function sendKoe() {
    if (sender) return sender;
    if (!forbundet || !koeListe.length) return Promise.resolve();
    const varNede = netNede;
    sender = (async () => {
      let afvist = false;
      while (koeListe.length && forbundet) {
        const o = koeListe[0];
        try { await sendEn(o); netNede = false; }
        catch (e) {
          if (proevIgen(e)) { netNede = true; fortaelLyttere(); return; }   // bliver i køen – prøves igen senere
          console.warn('Ændring afvist:', e);
          afvist = true;
          const nej = e?.code === '42501' || /voksne/.test(e?.message || '');
          if (typeof visStatus === 'function') visStatus(nej ? 'Det kan kun de voksne ændre 🙂' : 'En ændring kunne ikke gemmes.', !nej);
        }
        if (koeListe[0] === o) koeListe.shift();
        await gemKoe();
      }
      fortaelLyttere();
      if (afvist || varNede) setTimeout(genhent, 300);   // vis det, der faktisk er gemt / de andres ændringer imens
    })().finally(() => { sender = null; });
    return sender;
  }

  // Supabase giver højst 1000 rækker pr. svar – derfor hentes i bidder (ellers mangler der stille og roligt data)
  async function hentAlt() {
    const BID = 1000, alle = [];
    for (let fra = 0; ; fra += BID) {
      const { data, error } = await db.from('punkter').select('*').order('oprettet').order('id').range(fra, fra + BID - 1);
      if (error) throw error;
      alle.push(...data);
      if (data.length < BID) break;
    }
    raekker = alle;
    anvendKoe();
  }
  async function genhent() {
    if (!forbundet) return proevForbind();   // startet fra kopien: prøv at komme på nettet
    try {
      await koe;   // først skal det, der venter på at blive gemt, være gemt
      await sendKoe();
      await hentAlt();
      netNede = false;
      udefra++;
      if (ventende.size) { setTimeout(genhent, 500); return; }   // nye ændringer imens – hent igen bagefter
      fortaelLyttere();
    } catch (e) { console.warn(e); }
  }

  // Kom på nettet: tjek login, hent profil og alle rækker, lyt efter de andres ændringer.
  // Returnerer profilen, null (ikke logget ind) – eller kaster en fejl (fx intet net).
  let forbundet = false, forbinder = null, lytter = false;
  async function forbind() {
    const { data: { session }, error: sFejl } = await db.auth.getSession();
    if (!session) { if (sFejl && erNetfejl(sFejl)) throw sFejl; return null; }
    const { data: { user }, error: uFejl } = await db.auth.getUser();
    if (!user) { if (uFejl && erNetfejl(uFejl)) throw uFejl; return null; }
    const { data, error } = await db.from('profiler').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('mangler-profil');
    await koe;   // ændringer lavet på kopien imens skal være gemt, før alt hentes
    await hentAlt();
    profil = data;
    forbundet = true;
    netNede = false;
    if (ventende.size) setTimeout(genhent, 500);   // nye ændringer imens – hent igen bagefter
    gemKopiSnart();
    sendKoe();   // det, der blev lavet uden net

    // Live: når en anden ændrer noget, opdateres skærmen
    db.channel('punkter')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'punkter' }, payload => {
        const id = (payload.new || payload.old)?.id;
        if (ventende.has(id) || koeHar(id)) return;   // vores egen ændring, som allerede står på skærmen
        udefra++;
        if (payload.eventType === 'DELETE') raekker = raekker.filter(x => x.id !== payload.old.id);
        else gemLokalt(payload.new);
        fortaelLyttere();
      })
      .subscribe();
    return profil;
  }
  // Når telefonen vågner, nettet kommer igen, eller hvert 10. minut (fx en iPad der altid er tændt), hentes alt igen
  function lyt() {
    if (lytter) return;
    lytter = true;
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') genhent(); });
    window.addEventListener('online', genhent);
    setInterval(() => { if (document.visibilityState === 'visible') genhent(); }, 10 * 60 * 1000);
    setInterval(() => { if (koeListe.length) { if (forbundet) sendKoe(); else proevForbind(); } }, 30 * 1000);   // ændringer venter: prøv igen
  }
  // Appen kører på kopien: prøv at komme på nettet (én ad gangen). Lykkes det, vises de friske data.
  function proevForbind() {
    if (forbundet || forbinder) return forbinder;
    forbinder = (async () => {
      try {
        const p = await forbind();
        if (p) { udefra++; fortaelLyttere(); }
        else { await Kopi.slet(); location.reload(); }   // ikke længere logget ind på denne telefon → login-skærmen
      } catch (e) { console.warn('Stadig uden net:', e?.message || e); }
      finally { forbinder = null; }
    })();
    return forbinder;
  }

  return {
    // Er man allerede logget ind på denne enhed? Returnerer profilen eller null.
    // Har telefonen en kopi, vises den med det samme (også med net – så åbner appen hurtigt), og de friske data hentes
    // i baggrunden (proevForbind). Uden kopi ventes der på nettet som før.
    async start() {
      const kopi = await Kopi.hent();
      koeListe = await Kopi.hentKoe();
      if (!kopi) { const p = await forbind(); if (p) lyt(); return p; }
      profil = kopi.profil; raekker = kopi.raekker;
      anvendKoe();
      proevForbind();
      lyt();
      return profil;
    },
    // Kører appen på kopien fra sidst (uden forbindelse til databasen)?
    udenNet() { return !!profil && (!forbundet || netNede); },
    // Antal ændringer, der venter på at blive sendt (Indkøb uden net)
    erNetfejl,
    venter() { return koeListe.filter(o => o.liste !== 'favoritter').length; },   // hurtigvalgets tællere regnes ikke med

    async login(navn, kode) {
      const email = navn.trim().toLowerCase() + '@' + EMAIL_DOMAENE;
      const { error } = await db.auth.signInWithPassword({ email, password: kode });
      if (error) throw error;
      const p = await forbind();
      if (p) lyt();
      return p;
    },

    async logud() {
      await koe;   // gem det, der venter, før man logges ud
      if (forbundet) await sendKoe();   // og det i køen (uden net går det tabt – det hører til den, der var logget ind)
      clearTimeout(kopiTimer);
      kopiStop = true;
      await Kopi.slet();   // kopien på telefonen hører til den, der var logget ind
      if (typeof pushFoerLogud === 'function') await pushFoerLogud();   // push.js: telefonen skal ikke have den udloggedes beskeder
      await db.auth.signOut();
      location.reload();
    },

    bruger() { return profil; },

    async list(liste) {
      return raekker.filter(r => r.liste === liste).map(tilPunkt);
    },
    // 💾 Kopi af alle data, den indloggede kan se (rå rækker) – til en fil på enheden
    eksport() { return { app: 'familietavlen', version: 1, tid: new Date().toISOString(), bruger: profil?.navn || '', antal: raekker.length, punkter: JSON.parse(JSON.stringify(raekker)) }; },
    listNu(liste) { return raekker.filter(r => r.liste === liste).map(tilPunkt); },   // samme, uden at vente

    async add(liste, felter) {
      if (KOE_LISTER.has(liste)) {   // vises med det samme, sendes via køen (også uden net)
        const r = { id: nytId(), liste, data: klon(felter), oprettet: new Date().toISOString(), oprettet_af: profil?.id || null };
        gemLokalt(r);
        laegIKoe({ type: 'add', liste, id: r.id, data: r.data, oprettet: r.oprettet, af: r.oprettet_af });
        return tilPunkt(r);
      }
      await koe;   // efter de ændringer der venter (rækkefølgen bevares)
      const { data, error } = await db.from('punkter').insert({ liste, data: felter }).select().single();
      if (error) throw error;
      gemLokalt(data);
      fortaelLyttere();   // tegn med det samme – vent ikke på live-opdateringen
      pushOm(liste, data.id);
      return tilPunkt(data);
    },

    async addMange(liste, felterListe) {
      if (!felterListe.length) return;
      if (KOE_LISTER.has(liste)) { for (const f of felterListe) await this.add(liste, f); return; }
      await koe;
      const { data, error } = await db.from('punkter').insert(felterListe.map(f => ({ liste, data: f }))).select();
      if (error) throw error;
      data.forEach(gemLokalt);
      fortaelLyttere();
    },

    // Vises med det samme – gemmes i baggrunden (se iBaggrund)
    async update(liste, id, aendringer) {
      const r = raekker.find(x => x.id === id);
      if (!r) return;
      const ny = { ...r, data: { ...r.data, ...aendringer } };
      gemLokalt(ny);
      if (KOE_LISTER.has(liste)) { laegIKoe({ type: 'update', liste, id, felter: aendringer }); return; }
      iBaggrund([id], async () => {
        const { data, error } = await db.from('punkter').update({ data: ny.data }).eq('id', id).select().single();
        if (error) throw error;
        if ((ventende.get(id) || 0) <= 1) gemLokalt(data);   // ingen nyere ændring på vej
        pushOm(liste, id);
      }, () => { if (raekker.some(x => x.id === id)) gemLokalt(r); });
    },

    async remove(liste, id) {
      const r = raekker.find(x => x.id === id);
      raekker = raekker.filter(x => x.id !== id);
      husk(r);
      if (KOE_LISTER.has(liste)) { laegIKoe({ type: 'remove', liste, ids: [id] }); return; }
      iBaggrund([id], async () => {
        const { error } = await db.from('punkter').delete().eq('id', id);
        if (error) throw error;
      }, () => { if (r) gemLokalt(r); });
    },

    // Slet mange på én gang (fx "Ryd" og "Ryd kurven") – ét kald til databasen
    async removeMange(liste, ids) {
      ids = [...new Set(ids)];
      if (!ids.length) return;
      const s = new Set(ids);
      const fjernet = raekker.filter(x => s.has(x.id));
      raekker = raekker.filter(x => !s.has(x.id));
      fjernet.forEach(r => husk(r));
      if (KOE_LISTER.has(liste)) { laegIKoe({ type: 'remove', liste, ids }); return; }
      iBaggrund(ids, async () => {
        const { error } = await db.from('punkter').delete().in('id', ids);
        if (error) throw error;
      }, () => fjernet.forEach(gemLokalt));
    },
    nytUdefra() { return udefra; },
    // Rå kopier af rækkerne i en liste (til "Fortryd" af større ændringer, fx bland hele ugen)
    raaKopi(liste, filter = () => true) { return JSON.parse(JSON.stringify(raekker.filter(r => r.liste === liste && filter(tilPunkt(r))))); },
    // Er alt gemt? (venter til køen er tom)
    async gemt() { await koe; },

    // Kald før en ændring, der i praksis sletter noget (fx "slet kun denne dag" i en gentagen aftale)
    huskFoer(id, tekst) { husk(raekker.find(x => x.id === id), tekst); },

    // Sæt en fortrudt gruppe ind igen: slettede rækker kommer tilbage, ændrede får deres gamle indhold
    async gendan(g) {
      await koe;   // en sletning, der stadig er på vej, må ikke ramme det gendannede
      let rows = g.raekker.map(r => ({ id: r.id, liste: r.liste, data: r.data, oprettet: r.oprettet, oprettet_af: r.oprettet_af }));
      const viaKoe = rows.filter(r => KOE_LISTER.has(r.liste));   // fx en slettet indkøbsvare: kommer tilbage via køen (også uden net)
      if (viaKoe.length) { viaKoe.forEach(r => gemLokalt(klon(r))); laegIKoe({ type: 'upsert', raekker: viaKoe }); rows = rows.filter(r => !KOE_LISTER.has(r.liste)); }
      if (!rows.length) { if (gruppe === g) gruppe = null; return; }
      const { data, error } = await db.from('punkter').upsert(rows).select();
      if (error) throw error;
      (data || []).forEach(gemLokalt);
      if (gruppe === g) gruppe = null;
    },

    // Sletninger inde i fn er "tekniske" (fx et tømt felt) og giver ingen Fortryd
    async stille(fn) { stille++; try { return await fn(); } finally { stille--; } },

    onFortryd(fn) { fortrydLytter = fn; },

    // Push-notifikationer (push.js): denne telefons abonnement gemmes/fjernes via databasefunktioner
    async gemPush(sub, enhed) {
      const { error } = await db.rpc('gem_push', { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth, p_enhed: enhed });
      if (error) throw error;
    },
    async fjernPush(endpoint) {
      const { error } = await db.rpc('fjern_push', { p_endpoint: endpoint });
      if (error) throw error;
    },
    // Bed Edge Function'en "push" sende (den afgør selv hvem der må få hvad)
    async push(krop) {
      const { data, error } = await db.functions.invoke('push', { body: krop });
      if (error) throw error;
      return data;
    },

    // ✨ AI-hjælperen: Edge Function'en "ai" svarer {svar, handlinger} – den gemmer aldrig selv noget
    async ai(tekst, kontekst, historik = [], billede = null, opgave = 'fri') {
      const { data, error } = await db.functions.invoke('ai', { body: { opgave, tekst, kontekst, historik, ...(billede ? { billede } : {}) } });
      if (error) {
        let besked = error.message;
        try { const j = await error.context?.json(); if (j?.fejl) besked = j.fejl; } catch (e) { /* ingen detaljer */ }
        throw new Error(besked);
      }
      return data;
    },

    // ✨ Det AI'en ikke kunne (tabellen ai_oensker – opdatering-ai-oensker.sql; kun voksne kan læse og slette, kun Edge Function'en skriver)
    async aiOensker() {
      const { data, error } = await db.from('ai_oensker').select('*').order('tid', { ascending: false }).limit(100);
      if (error) throw error;
      return data || [];
    },
    async rydAiOensker(ids) {
      const { error } = await db.from('ai_oensker').delete().in('id', ids);
      if (error) throw error;
    },

    // Aktivitet (kun voksne kan læse den – databasens regler): nyeste først, evt. kun ældre end "foer"
    async aktivitet(foer, antal = 150) {
      let q = db.from('aktivitet').select('*').order('tid', { ascending: false }).limit(antal);
      if (foer) q = q.lt('tid', foer);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },

    // ---------- Filer (Supabase Storage, bucket 'filer' – opdatering-filer.sql) ----------
    // Stien bestemmer, hvem der må se filen: alle/… · voksne/… · mig/<bruger-id>/…  (regler i databasen)
    async uploadFil(syn, fil) {
      const mappe = syn === 'mig' ? 'mig/' + profil.id : syn === 'voksne' ? 'voksne' : 'alle';
      const ren = (fil.name || 'fil').normalize('NFD').replace(/[^\w.\-]+/g, '_').slice(-60);
      const sti = mappe + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '-' + ren;
      const { error } = await db.storage.from('filer').upload(sti, fil, { contentType: fil.type || 'application/octet-stream', upsert: false });
      if (error) throw error;
      return { sti, navn: fil.name || ren, mime: fil.type || '', str: fil.size || 0 };
    },
    // Midlertidigt link (1 time) – genbruges, så den samme fil ikke hentes igen og igen
    async filUrl(sti) {
      const c = filUrlCache.get(sti);
      if (c && c.til > Date.now()) return c.url;
      const { data, error } = await db.storage.from('filer').createSignedUrl(sti, 3600);
      if (error) throw error;
      filUrlCache.set(sti, { url: data.signedUrl, til: Date.now() + 50 * 60000 });
      return data.signedUrl;
    },
    // Alle filer, den indloggede må se (til fuld backup): alle/, voksne/ og mig/<eget id>/
    async listFiler() {
      const ud = [];
      for (const mappe of ['alle', 'voksne', 'mig/' + profil.id]) {
        for (let offset = 0; ; offset += 1000) {
          const { data, error } = await db.storage.from('filer').list(mappe, { limit: 1000, offset });
          if (error || !data) break;
          ud.push(...data.filter(f => f.id).map(f => ({ sti: mappe + '/' + f.name, str: f.metadata?.size || 0 })));
          if (data.length < 1000) break;
        }
      }
      return ud;
    },
    async hentFil(sti) {
      const { data, error } = await db.storage.from('filer').download(sti);
      if (error) throw error;
      return data;
    },
    async sletFiler(stier) {
      const s = (stier || []).filter(Boolean);
      if (!s.length) return;
      s.forEach(x => filUrlCache.delete(x));
      const { error } = await db.storage.from('filer').remove(s);
      if (error) console.warn('Kunne ikke slette filer', error);
    },
    // Ny synlighed → flyt filen til den anden mappe (ellers gælder de gamle regler stadig)
    async flytFil(sti, syn) {
      const navn = sti.split('/').pop();
      const ny = (syn === 'mig' ? 'mig/' + profil.id : syn === 'voksne' ? 'voksne' : 'alle') + '/' + navn;
      if (ny === sti) return sti;
      const { error } = await db.storage.from('filer').move(sti, ny);
      if (error) throw error;
      filUrlCache.delete(sti);
      return ny;
    },

    onChange(fn) { lyttere.push(fn); }
  };
})();
