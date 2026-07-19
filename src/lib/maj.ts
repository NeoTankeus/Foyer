// Mise à jour à la demande : le nuage de l'accueil interroge le service worker.
// Si une nouvelle version existe, elle s'active et l'app se recharge sur place.

let enregistrement: ServiceWorkerRegistration | null = null
let majDisponible = false
const abonnes = new Set<() => void>()

function signalerMajDisponible(): void {
  majDisponible = true
  abonnes.forEach((cb) => cb())
}

/** Prévenu dès qu'une nouvelle version est prête (pastille rouge du nuage). */
export function surMiseAJourDisponible(cb: () => void): () => void {
  abonnes.add(cb)
  if (majDisponible) cb()
  return () => abonnes.delete(cb)
}

export function retenirEnregistrementSw(r: ServiceWorkerRegistration): void {
  enregistrement = r
  if (r.waiting) signalerMajDisponible()
  r.addEventListener('updatefound', () => {
    const nouveau = r.installing
    nouveau?.addEventListener('statechange', () => {
      if (nouveau.state === 'installed' && navigator.serviceWorker.controller) signalerMajDisponible()
    })
  })
}

/**
 * Vérifie tout de suite s'il y a une nouvelle version.
 * 'nouvelle'  → elle s'installe, l'app va se recharger toute seule dans quelques secondes.
 * 'a_jour'    → rien à faire.
 * 'indisponible' → pas de service worker (navigateur privé, très vieux iOS…).
 */
export async function verifierMiseAJour(): Promise<'nouvelle' | 'a_jour' | 'indisponible'> {
  if (!enregistrement) return 'indisponible'
  try {
    await enregistrement.update()
    if (enregistrement.installing || enregistrement.waiting) return 'nouvelle'
    return 'a_jour'
  } catch {
    return 'indisponible'
  }
}
