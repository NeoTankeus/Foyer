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

/** Compare la version locale à celle du serveur — allume la pastille si besoin. */
export async function detecterMajEnLigne(): Promise<void> {
  const distante = await versionServeur()
  if (distante && distante !== __DATE_VERSION__) signalerMajDisponible()
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

/** La version actuellement en ligne, lue directement (jamais de cache). */
export async function versionServeur(): Promise<string | null> {
  try {
    const reponse = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!reponse.ok) return null
    const donnees = (await reponse.json()) as { version?: string }
    return donnees.version ?? null
  } catch {
    return null
  }
}

/**
 * Vérifie tout de suite s'il y a une nouvelle version — d'abord en comparant
 * les numéros de version (fiable), puis via le service worker.
 */
export async function verifierMiseAJour(): Promise<'nouvelle' | 'a_jour' | 'indisponible'> {
  const distante = await versionServeur()
  if (distante && distante !== __DATE_VERSION__) return 'nouvelle'
  if (!enregistrement) return distante ? 'a_jour' : 'indisponible'
  try {
    await enregistrement.update()
    if (enregistrement.installing || enregistrement.waiting) return 'nouvelle'
    return 'a_jour'
  } catch {
    return distante ? 'a_jour' : 'indisponible'
  }
}

const attendre = (ms: number) => new Promise((res) => setTimeout(res, ms))

/**
 * Installe la nouvelle version COÛTE QUE COÛTE : on insiste auprès du service
 * worker jusqu'à ce qu'elle soit prise (le rechargement final est garanti).
 */
export async function mettreAJourMaintenant(): Promise<never> {
  for (let tentative = 0; tentative < 10; tentative++) {
    try {
      await enregistrement?.update()
      const nouveau = enregistrement?.installing ?? enregistrement?.waiting
      if (nouveau) {
        // On laisse la nouvelle version s'activer (skipWaiting est déjà dans le SW).
        for (let attente = 0; attente < 20; attente++) {
          if (enregistrement?.active && !enregistrement.installing && !enregistrement.waiting) break
          await attendre(500)
        }
        window.location.reload()
        return new Promise<never>(() => undefined)
      }
    } catch {
      // on retente
    }
    await attendre(2000)
  }
  // Dernier recours : rechargement sec — le réseau servira la nouvelle version.
  window.location.reload()
  return new Promise<never>(() => undefined)
}
