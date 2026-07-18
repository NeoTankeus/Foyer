// Abonnement aux notifications push (brief du matin, colis, baisses de prix).
// iOS : uniquement si l'app est installée sur l'écran d'accueil (≥ 16.4).
import { supabase } from './supabase'

export function notificationsPossibles(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function etatAbonnement(): Promise<'active' | 'refuse' | 'inactif'> {
  if (!notificationsPossibles()) return 'inactif'
  if (Notification.permission === 'denied') return 'refuse'
  const enregistrement = await navigator.serviceWorker.getRegistration()
  const abonnement = await enregistrement?.pushManager.getSubscription()
  return abonnement ? 'active' : 'inactif'
}

/**
 * Prévenir les AUTRES téléphones du foyer, tout de suite (jamais le sien).
 * Silencieux et non bloquant : si le réseau manque, la saisie reste prioritaire.
 */
export function notifierLesAutres(titre: string, corps: string, url = '/', adultesSeulement = false): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession()
      const jeton = data.session?.access_token
      if (!jeton) return
      await fetch('/api/notifier', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ titre, corps, url, adultesSeulement }),
      })
    } catch {
      // pas de réseau — tant pis pour cette notification
    }
  })()
}

/** Au plus une notification « courses » par quart d'heure — sinon ça mitraille. */
export function notifierCoursesAvecReserve(prenom: string): void {
  const cle = 'foyer-notif-courses'
  const derniere = Number(localStorage.getItem(cle) ?? 0)
  if (Date.now() - derniere < 15 * 60 * 1000) return
  localStorage.setItem(cle, String(Date.now()))
  notifierLesAutres('🛒 Courses', `${prenom} a ajouté des articles à la liste.`, '/maison?ajout=courses')
}

export async function activerNotifications(membreId: string): Promise<boolean> {
  const clePublique = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
  if (!clePublique || !notificationsPossibles()) return false
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return false
  const enregistrement = await navigator.serviceWorker.ready
  const abonnement = await enregistrement.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: clePublique,
  })
  const brut = abonnement.toJSON()
  const { error } = await supabase.from('push_abonnements' as never).upsert({
    id: crypto.randomUUID(),
    membre_id: membreId,
    endpoint: abonnement.endpoint,
    cles: brut.keys ?? {},
  } as never, { onConflict: 'endpoint' })
  return !error
}
