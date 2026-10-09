// push.js – notifikationer på denne telefon (Indstillinger → 🔔). Selve afsendelsen sker i Supabase
// (Edge Function "push", se opsaetning.md). Hver telefon vælger selv; abonnementet hører til den, der er logget ind.
const VAPID_OFFENTLIG = 'BATheDcbVt76pb-D3xtdaJ6TypQUnouxaIot18bb2T_MiA7SzqbtlNrxJfoHE5uFfbzM-hRsq9i5sQnChi1MlPM';   // offentlig nøgle – må gerne stå her
const pushMulig = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const erIPhone = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const erInstalleret = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let pushReg = null;

async function pushRegistrering() {
  if (!('serviceWorker' in navigator)) return null;
  if (!pushReg) pushReg = await navigator.serviceWorker.register('sw.js');
  return navigator.serviceWorker.ready;
}
async function pushAbonnement() {
  if (!pushMulig()) return null;
  const reg = await pushRegistrering();
  return reg ? reg.pushManager.getSubscription() : null;
}
function vapidBytes() {
  const s = VAPID_OFFENTLIG.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
}
const enhedNavn = () => (/Android/.test(navigator.userAgent) ? 'Android' : erIPhone() ? 'iPhone/iPad' : 'Computer') + ' · ' + new Date().toLocaleDateString('da-DK');

async function slaaPushTil() {
  const svar = await Notification.requestPermission();
  if (svar !== 'granted') return false;
  const reg = await pushRegistrering();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidBytes() });
  await Data.gemPush(sub.toJSON(), enhedNavn());
  return true;
}
async function slaaPushFra() {
  const sub = await pushAbonnement();
  if (!sub) return;
  try { await Data.fjernPush(sub.endpoint); } catch (e) { console.warn(e); }
  await sub.unsubscribe();
}
// Ved start: er telefonen allerede tilmeldt, gemmes den igen (så den hører til den, der er logget ind nu)
async function pushOpfrisk() {
  try { const sub = await pushAbonnement(); if (sub && Notification.permission === 'granted') await Data.gemPush(sub.toJSON(), enhedNavn()); } catch (e) { console.warn(e); }
}
// Før log ud: denne telefon skal ikke længere have den udloggedes beskeder
async function pushFoerLogud() {
  try { const sub = await pushAbonnement(); if (sub) { await Data.fjernPush(sub.endpoint); await sub.unsubscribe(); } } catch (e) { console.warn(e); }
}

// Afsnittet i Indstillinger
function pushIndstilling() {
  const boks = el('div', 'push-boks');
  const tegn = async () => {
    const dele = [];
    if (!pushMulig()) {
      dele.push(el('p', 'hint', erIPhone() && !erInstalleret()
        ? 'På iPhone/iPad virker notifikationer kun, når Familietavlen er lagt på hjemmeskærmen (Del → Føj til hjemmeskærm) og åbnet derfra.'
        : 'Denne browser kan ikke vise notifikationer.'));
    } else if (Notification.permission === 'denied') {
      dele.push(el('p', 'hint', 'Notifikationer er blokeret for Familietavlen på denne telefon. Slå dem til i telefonens indstillinger (Apps → Familietavlen / Chrome → Notifikationer) og prøv igen.'));
    } else {
      const sub = await pushAbonnement();
      if (sub) {
        const status = el('p', 'push-status', '✅ Slået til på denne telefon');
        const proeve = knap('Send en prøve', 'lille-knap', async () => {
          proeve.disabled = true;
          try {
            const r = await Data.push({ type: 'test' });
            status.textContent = r?.sendt ? '✅ Prøven er sendt – den kommer om et øjeblik' : '⚠️ Ingen telefoner fik den – prøv at slå fra og til igen';
          } catch (e) {
            console.error(e);
            status.textContent = '⚠️ Kunne ikke sende. Er Edge Function "push" og nøglerne sat op i Supabase?';
          }
          proeve.disabled = false;
        });
        const fra = knap('Slå fra', 'lille-knap', async () => { await slaaPushFra(); tegn(); });
        const r = el('div', 'push-knapper');
        r.append(proeve, fra);
        dele.push(status, r);
      } else {
        const til = knap('🔔 Slå notifikationer til', 'knap', async () => {
          til.disabled = true;
          try { if (!(await slaaPushTil())) visStatus('Notifikationer blev ikke tilladt'); }
          catch (e) { console.error(e); visStatus('Det lykkedes ikke at slå notifikationer til'); }
          tegn();
        });
        dele.push(til, el('p', 'hint', 'Gælder kun denne telefon. Telefonen spørger om lov første gang.'));
      }
    }
    boks.replaceChildren(...dele);
  };
  tegn();
  return boks;
}
