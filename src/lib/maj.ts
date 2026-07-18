// Mise à jour à la demande : le nuage de l'accueil interroge le service worker.
// Si une nouvelle version existe, elle s'active et l'app se recharge sur place.

let enregistrement: ServiceWorkerRegistration | null = null

export function retenirEnregistrementSw(r: ServiceWorkerRegistration): void {
  enregistrement = r
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
