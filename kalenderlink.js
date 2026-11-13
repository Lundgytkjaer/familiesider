// kalenderlink.js – 📅 Kalender i telefonen: familiens aftaler som abonnement i telefonens egen kalender (iCal).
// Hver voksen har ét hemmeligt link (tabellen kalender_links, SQL #45). Edge Function'en "kalender" laver kalenderen ud fra linket.
// Kun til at se – aftaler laves og rettes i appen. "Lav nyt link" lukker det gamle. Data.kalenderLink/nytKalenderLink/sletKalenderLink i data.js.

const webcal = url => url.replace(/^https:/, 'webcal:');

async function kopierKalenderLink(url) {
  try { await navigator.clipboard.writeText(url); visStatus('Linket er kopieret ✓'); }
  catch (e) {
    const felt = el('textarea', 'kopi-felt');
    felt.value = url; felt.readOnly = true; felt.rows = 3;
    felt.addEventListener('focus', () => felt.select());
    const knapper = el('div', 'ark-knapper');
    knapper.append(knap('Færdig', 'knap', lukArk));
    aabnArk('📅 Dit kalender-link', el('p', null, 'Markér linket og kopiér det.'), felt, knapper);
  }
}

function kalenderLinkIndstilling() {
  const boks = el('div', 'push-boks kal-link');
  const tegn = async () => {
    boks.replaceChildren(el('p', 'hint', 'Henter …'));
    let url;
    try { url = await Data.kalenderLink(); }
    catch (e) {
      console.warn(e);
      boks.replaceChildren(el('p', 'hint', Data.udenNet() || !navigator.onLine ? 'Uden net – prøv igen, når nettet er tilbage.'
        : 'Kalender-linket er ikke sat op endnu (SQL-filen opdatering-kalenderlink.sql og Edge Function "kalender" i Supabase).'));
      return;
    }
    const lav = async (k) => {
      k.disabled = true;
      try { await Data.nytKalenderLink(); visStatus('Nyt link lavet ✓'); }
      catch (e) { console.error(e); visStatus(Data.erNetfejl?.(e) ? 'Uden net – prøv igen om lidt.' : 'Kunne ikke lave linket.', !Data.erNetfejl?.(e)); }
      tegn();
    };
    if (!url) {
      const k = knap('📅 Lav mit kalender-link', 'knap', () => lav(k));
      boks.replaceChildren(k, el('p', 'hint', 'Så kan familiens aftaler ses i din telefons kalender ved siden af dine andre aftaler. Kun til at se – aftaler laves og rettes stadig her.'));
      return;
    }
    const aabn = el('a', 'knap', '📅 Åbn i kalender-appen');
    aabn.href = webcal(url);
    const kopi = knap('Kopiér link', 'lille-knap', () => kopierKalenderLink(url));
    const nyt = bekraeftKnap('Lav nyt link', 'lave et nyt link (det gamle holder op med at virke)', 'lille-knap', () => lav(nyt));
    const fra = bekraeftKnap('Slå fra', 'slå linket fra', 'lille-knap', async () => {
      try { await Data.sletKalenderLink(); visStatus('Linket er slået fra ✓'); } catch (e) { console.error(e); visStatus('Kunne ikke slå det fra – prøv igen.', true); }
      tegn();
    });
    const r = el('div', 'push-knapper');
    r.append(kopi, nyt, fra);
    const hjaelp = el('details', 'indst-fold');
    hjaelp.append(el('summary', null, 'Sådan gør du'),
      el('p', 'hint', 'iPhone: tryk "Åbn i kalender-appen" → Abonnér. Under Indstillinger → Kalender → Konti → Abonnerede kalendere kan du vælge, hvor ofte den henter nyt.'),
      el('p', 'hint', 'Android: installér appen ICSx⁵ (Play Butik), tryk så "Åbn i kalender-appen" – eller "Kopiér link" og sæt det ind i ICSx⁵ med +. Vælg fx at hente hver time.'),
      el('p', 'hint', 'Google Kalender på computeren: "Kopiér link" → calendar.google.com → Andre kalendere → + → Fra webadresse. Google henter kun nyt få gange om dagen.'));
    boks.replaceChildren(el('p', 'push-status', '✅ Dit link er klar'), aabn, r, hjaelp,
      el('p', 'hint', 'Linket er personligt: den, der har det, kan se familiens aftaler (også dine "Kun mig"). Del det ikke. Mister du telefonen: "Lav nyt link".'));
  };
  tegn();
  return boks;
}
