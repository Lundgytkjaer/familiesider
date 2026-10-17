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
        if (typeof visStatus === 'function') visStatus(nej ? 'Det kan kun de voksne ændre 🙂' : navigator.onLine ? 'Kunne ikke gemme – prøv igen.' : 'Ingen forbindelse – ændringen blev ikke gemt.', true);
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
  }
  async function genhent() {
    try {
      await koe;   // først skal det, der venter på at blive gemt, være gemt
      await hentAlt();
      udefra++;
      if (ventende.size) { setTimeout(genhent, 500); return; }   // nye ændringer imens – hent igen bagefter
      fortaelLyttere();
    } catch (e) { console.warn(e); }
  }

  async function efterLogin() {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return null;
    const { data, error } = await db.from('profiler').select('*').eq('id', user.id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('mangler-profil');
    profil = data;
    await hentAlt();

    // Live: når en anden ændrer noget, opdateres skærmen
    db.channel('punkter')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'punkter' }, payload => {
        if (ventende.has((payload.new || payload.old)?.id)) return;   // vores egen ændring, som allerede står på skærmen
        udefra++;
        if (payload.eventType === 'DELETE') raekker = raekker.filter(x => x.id !== payload.old.id);
        else gemLokalt(payload.new);
        fortaelLyttere();
      })
      .subscribe();

    // Når telefonen vågner, nettet kommer igen, eller hvert 10. minut (fx en iPad der altid er tændt), hentes alt igen
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') genhent(); });
    window.addEventListener('online', genhent);
    setInterval(() => { if (document.visibilityState === 'visible') genhent(); }, 10 * 60 * 1000);
    return profil;
  }

  return {
    // Er man allerede logget ind på denne enhed? Returnerer profilen eller null.
    async start() {
      const { data: { session } } = await db.auth.getSession();
      if (!session) return null;
      return efterLogin();
    },

    async login(navn, kode) {
      const email = navn.trim().toLowerCase() + '@' + EMAIL_DOMAENE;
      const { error } = await db.auth.signInWithPassword({ email, password: kode });
      if (error) throw error;
      return efterLogin();
    },

    async logud() {
      await koe;   // gem det, der venter, før man logges ud
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
      await koe;   // efter de ændringer der venter (rækkefølgen bevares)
      const { data, error } = await db.from('punkter').insert({ liste, data: felter }).select().single();
      if (error) throw error;
      gemLokalt(data);
      pushOm(liste, data.id);
      return tilPunkt(data);
    },

    async addMange(liste, felterListe) {
      if (!felterListe.length) return;
      await koe;
      const { data, error } = await db.from('punkter').insert(felterListe.map(f => ({ liste, data: f }))).select();
      if (error) throw error;
      data.forEach(gemLokalt);
    },

    // Vises med det samme – gemmes i baggrunden (se iBaggrund)
    async update(liste, id, aendringer) {
      const r = raekker.find(x => x.id === id);
      if (!r) return;
      const ny = { ...r, data: { ...r.data, ...aendringer } };
      gemLokalt(ny);
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
      iBaggrund(ids, async () => {
        const { error } = await db.from('punkter').delete().in('id', ids);
        if (error) throw error;
      }, () => fjernet.forEach(gemLokalt));
    },
    nytUdefra() { return udefra; },
    // Er alt gemt? (venter til køen er tom)
    async gemt() { await koe; },

    // Kald før en ændring, der i praksis sletter noget (fx "slet kun denne dag" i en gentagen aftale)
    huskFoer(id, tekst) { husk(raekker.find(x => x.id === id), tekst); },

    // Sæt en fortrudt gruppe ind igen: slettede rækker kommer tilbage, ændrede får deres gamle indhold
    async gendan(g) {
      await koe;   // en sletning, der stadig er på vej, må ikke ramme det gendannede
      const rows = g.raekker.map(r => ({ id: r.id, liste: r.liste, data: r.data, oprettet: r.oprettet, oprettet_af: r.oprettet_af }));
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
