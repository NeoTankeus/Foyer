// La pastille rouge sur l'icône STG (iOS 16.4+, app installée).
// L'app pousse le VRAI compte (relances + mots du Mur non lus) ; le service
// worker garde le même chiffre pour les pushs reçus app fermée.

export function majBadgeIcone(n: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>
      clearAppBadge?: () => Promise<void>
    }
    if (n > 0) void nav.setAppBadge?.(n)
    else void nav.clearAppBadge?.()
    // On aligne aussi le compteur du service worker (pushs app fermée).
    void navigator.serviceWorker?.ready.then((r) => r.active?.postMessage({ type: 'badge', n }))
  } catch {
    // pas supporté : tant pis, les notifications restent
  }
}
