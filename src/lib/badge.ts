// La pastille rouge sur l'icône STG (iOS 16.4+, app installée).
// L'app pousse le VRAI compte (relances + mots du Mur non lus) ; le service
// worker garde le même chiffre pour les pushs reçus app fermée.

export function majBadgeIcone(n: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    // `void` n'attrape PAS un rejet : sans .catch(), un refus de l'API badge
    // remontait en « unhandled rejection » malgré le try/catch autour.
    const pastille = n > 0 ? nav.setAppBadge?.(n) : nav.clearAppBadge?.()
    void pastille?.catch(() => undefined)
    // On aligne aussi le compteur du service worker (pushs app fermée).
    void navigator.serviceWorker?.ready
      .then((r) => r.active?.postMessage({ type: 'badge', n }))
      .catch(() => undefined)
  } catch {
    // pas supporté : tant pis, les notifications restent
  }
}
