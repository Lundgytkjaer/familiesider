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

  // Fortryd: slettede rækker huskes kort, så de kan sættes ind igen (med samme id).
  // Flere sletninger lige efter hinanden (fx "Ryd klarede") bliver til én fortrydelse.
  const IKKE_FORTRYD = new Set(['flueben', 'indloesninger']);   // har deres egen fortryd/af-knap
  let stille = 0, gruppe = null, fortrydLytter = null;
  function husk(r) {
    if (!r || stille || IKKE_FORTRYD.has(r.liste)) return;
    const nu = Date.now();
    if (!gruppe || nu - gruppe.tid > 1500) gruppe = { tid: nu, raekker: [] };
    gruppe.tid = nu;
    if (!gruppe.raekker.some(x => x.id === r.id)) gruppe.raekker.push(JSON.parse(JSON.stringify(r)));
    if (fortrydLytter) fortrydLytter(gruppe);
  }

  // _af = hvem der oprettede rækken (bruges fx til at børn kun kan slette deres egne indkøbsønsker)
  const tilPunkt = r => ({ ...r.data, id: r.id, oprettet: r.oprettet, _af: r.oprettet_af });

  function gemLokalt(r) {
    const i = raekker.findIndex(x => x.id === r.id);
    if (i >= 0) raekker[i] = r; else raekker.push(r);
  }

  // Saml mange ændringer i én opdatering af skærmen
  function fortaelLyttere() {
    clearTimeout(timer);
    timer = setTimeout(() => lyttere.forEach(fn => fn()), 150);
  }

  async function hentAlt() {
    const { data, error } = await db.from('punkter').select('*');
    if (error) throw error;
    raekker = data;
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
        if (payload.eventType === 'DELETE') raekker = raekker.filter(x => x.id !== payload.old.id);
        else gemLokalt(payload.new);
        fortaelLyttere();
      })
      .subscribe();

    // Når telefonen vågner, hentes alt igen for en sikkerheds skyld
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return;
      try { await hentAlt(); fortaelLyttere(); } catch (e) { console.warn(e); }
    });
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
      await db.auth.signOut();
      location.reload();
    },

    bruger() { return profil; },

    async list(liste) {
      return raekker.filter(r => r.liste === liste).map(tilPunkt);
    },

    async add(liste, felter) {
      const { data, error } = await db.from('punkter').insert({ liste, data: felter }).select().single();
      if (error) throw error;
      gemLokalt(data);
      return tilPunkt(data);
    },

    async addMange(liste, felterListe) {
      if (!felterListe.length) return;
      const { data, error } = await db.from('punkter').insert(felterListe.map(f => ({ liste, data: f }))).select();
      if (error) throw error;
      data.forEach(gemLokalt);
    },

    async update(liste, id, aendringer) {
      const r = raekker.find(x => x.id === id);
      if (!r) return;
      const { data, error } = await db.from('punkter').update({ data: { ...r.data, ...aendringer } }).eq('id', id).select().single();
      if (error) throw error;
      gemLokalt(data);
    },

    async remove(liste, id) {
      const r = raekker.find(x => x.id === id);
      const { error } = await db.from('punkter').delete().eq('id', id);
      if (error) throw error;
      raekker = raekker.filter(x => x.id !== id);
      husk(r);
    },

    // Kald før en ændring, der i praksis sletter noget (fx "slet kun denne dag" i en gentagen aftale)
    huskFoer(id) { husk(raekker.find(x => x.id === id)); },

    // Sæt en fortrudt gruppe ind igen: slettede rækker kommer tilbage, ændrede får deres gamle indhold
    async gendan(g) {
      const rows = g.raekker.map(r => ({ id: r.id, liste: r.liste, data: r.data, oprettet: r.oprettet, oprettet_af: r.oprettet_af }));
      const { data, error } = await db.from('punkter').upsert(rows).select();
      if (error) throw error;
      (data || []).forEach(gemLokalt);
      if (gruppe === g) gruppe = null;
    },

    // Sletninger inde i fn er "tekniske" (fx et tømt felt) og giver ingen Fortryd
    async stille(fn) { stille++; try { return await fn(); } finally { stille--; } },

    onFortryd(fn) { fortrydLytter = fn; },

    onChange(fn) { lyttere.push(fn); }
  };
})();
