// data.js – det ENESTE sted der ved, hvor data gemmes.
// Lige nu: browserens lokale lagring (kun på denne enhed).
// Næste trin: Supabase – så skiftes kun denne fil, resten af siden er uændret.
const Data = (() => {
  const PREFIX = 'familiesider:';
  function hent(liste) { try { return JSON.parse(localStorage.getItem(PREFIX + liste)) || []; } catch { return []; } }
  // Kaster en fejl hvis der ikke er plads (fx for mange billeder i prototypen)
  function gem(liste, punkter) { localStorage.setItem(PREFIX + liste, JSON.stringify(punkter)); }
  function nytId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  return {
    async list(liste) { return hent(liste); },
    async add(liste, felter) {
      const punkter = hent(liste);
      const punkt = { id: nytId(), oprettet: new Date().toISOString(), ...felter };
      punkter.push(punkt); gem(liste, punkter); return punkt;
    },
    async update(liste, id, aendringer) { gem(liste, hent(liste).map(p => (p.id === id ? { ...p, ...aendringer } : p))); },
    async remove(liste, id) { gem(liste, hent(liste).filter(p => p.id !== id)); },
    onChange(fn) { window.addEventListener('storage', e => { if (!e.key || e.key.startsWith(PREFIX)) fn(); }); }
  };
})();
