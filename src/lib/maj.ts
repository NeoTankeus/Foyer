// Mise à jour à la demande : le nuage de l'accueil interroge le service worker.
// Si une nouvelle version existe, elle s'active et l'app se recharge sur place.

let enregistrement: ServiceWorkerRegistration | null = null
let majDisponible = false
let installationEnCours = false
const abonnes = new Set<() => void>()
const abonnesInstallation = new Set<() => void>()

function signalerMajDisponible(): void {
  majDisponible = true
  abonnes.forEach((cb) => cb())
}

function signalerInstallation(): void {
  installationEnCours = true
  abonnesInstallation.forEach((cb) => cb())
}

// ——— La progression de l'installation (0 → 100), pour l'anneau façon Apple.
let progres = 0
const abonnesProgres = new Set<(p: number) => void>()

function signalerProgres(p: number): void {
  progres = Math.max(progres, p)
  abonnesProgres.forEach((cb) => cb(progres))
}

/** Prévenu à chaque jalon réel de l'installation (l'anneau se remplit). */
export function surProgresMaj(cb: (p: number) => void): () => void {
  abonnesProgres.add(cb)
  cb(progres)
  return () => abonnesProgres.delete(cb)
}

/** Prévenu dès qu'une nouvelle version est prête (pastille rouge du nuage). */
export function surMiseAJourDisponible(cb: () => void): () => void {
  abonnes.add(cb)
  if (majDisponible) cb()
  return () => abonnes.delete(cb)
}

/** Prévenu quand une installation démarre (le nuage passe en ⬇️ tout seul). */
export function surInstallationEnCours(cb: () => void): () => void {
  abonnesInstallation.add(cb)
  if (installationEnCours) cb()
  return () => abonnesInstallation.delete(cb)
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
 * Installe la nouvelle version en UN SEUL geste : téléchargement, activation
 * forcée (SKIP_WAITING), et rechargement dès que la nouvelle version prend le
 * contrôle (controllerchange) — plus jamais 3 ou 4 appuis.
 */
export async function mettreAJourMaintenant(): Promise<never> {
  progres = 0
  signalerInstallation()
  signalerProgres(6)
  let recharge = false
  const recharger = () => {
    if (recharge) return
    recharge = true
    // L'anneau se complète, le ✓ s'affiche un instant, PUIS on recharge.
    signalerProgres(100)
    window.setTimeout(() => window.location.reload(), 800)
  }
  // LE bon signal : la nouvelle version vient de prendre le contrôle.
  navigator.serviceWorker?.addEventListener('controllerchange', recharger)

  const debut = Date.now()
  let dernierUpdate = 0
  while (Date.now() - debut < 45000) {
    if (recharge) return new Promise<never>(() => undefined)
    // On (re)demande le téléchargement au plus toutes les 4 s.
    if (Date.now() - dernierUpdate > 4000) {
      dernierUpdate = Date.now()
      try {
        await enregistrement?.update()
        signalerProgres(20)
      } catch {
        // réseau capricieux — on retentera
      }
    }
    // Les jalons réels du service worker font avancer l'anneau.
    if (enregistrement?.installing) signalerProgres(45)
    if (enregistrement?.waiting) signalerProgres(70)
    // Une version téléchargée qui patiente ? On la pousse à s'activer tout de suite.
    enregistrement?.waiting?.postMessage({ type: 'SKIP_WAITING' })
    await attendre(500)
    // Activée sans avoir pris le contrôle (anciennes générations) : on recharge nous-mêmes.
    if (
      Date.now() - debut > 6000 &&
      enregistrement?.active &&
      !enregistrement.installing &&
      !enregistrement.waiting
    ) {
      signalerProgres(90)
      recharger()
      return new Promise<never>(() => undefined)
    }
  }
  // Dernier recours : rechargement sec — le réseau servira la nouvelle version.
  recharger()
  return new Promise<never>(() => undefined)
}

const CLE_AUTO = 'stg-auto-maj'

/**
 * Mise à jour AUTOMATIQUE à l'ouverture (et à chaque retour au premier plan) :
 * si le serveur a une version plus récente, on l'installe sans rien demander.
 * Garde-fou : une seule tentative par version toutes les 3 minutes, pour ne
 * jamais boucler si l'installation échoue.
 */
export async function majAutomatique(): Promise<void> {
  const distante = await versionServeur()
  if (!distante || distante === __DATE_VERSION__) return
  signalerMajDisponible()
  try {
    const memo = JSON.parse(localStorage.getItem(CLE_AUTO) ?? 'null') as { version: string; a: number } | null
    if (memo?.version === distante && Date.now() - memo.a < 3 * 60 * 1000) return
  } catch {
    // mémoire illisible — on tente
  }
  localStorage.setItem(CLE_AUTO, JSON.stringify({ version: distante, a: Date.now() }))
  await mettreAJourMaintenant()
}
