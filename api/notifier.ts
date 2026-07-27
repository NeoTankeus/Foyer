// Notifier le foyer en direct : quand quelqu'un ajoute une tâche, un événement,
// une idée… les AUTRES téléphones reçoivent un push immédiat (jamais le sien).
import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'

export const config = { maxDuration: 15 }

const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? ''

async function sb<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    ...options,
    // Sans délai maximal, une base qui ne répond pas fige la fonction jusqu'au
    // couperet de Vercel — et le client n'obtient qu'un 504 illisible.
    signal: AbortSignal.timeout(10000),
    headers: {
      apikey: CLE_SERVICE,
      authorization: `Bearer ${CLE_SERVICE}`,
      'content-type': 'application/json',
      ...(options?.headers ?? {}),
    },
  })
  if (!reponse.ok) throw new Error(`${chemin} → ${reponse.status}`)
  return (await reponse.json()) as T
}

/** Une liste venue de la base : jamais autre chose qu'un tableau. */
function liste<T>(valeur: unknown): T[] {
  return Array.isArray(valeur) ? (valeur as T[]) : []
}

interface Membre { id: string; foyer_id: string; role: string }
interface Abonnement { id: string; membre_id: string; endpoint: string; cles?: { p256dh?: string; auth?: string } | null }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Une seule promesse au client : toujours du JSON exploitable, jamais un 500 nu.
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ erreur: 'methode', notifies: 0 })
      return
    }
    if (!URL_SUPABASE || !CLE_SERVICE) {
      res.status(503).json({ erreur: 'cle_absente', message: 'SUPABASE_SERVICE_ROLE manquant dans Vercel', notifies: 0 })
      return
    }
    const clePublique = process.env.VAPID_PUBLIC_KEY
    const clePrivee = process.env.VAPID_PRIVATE_KEY
    if (!clePublique || !clePrivee) {
      res.status(503).json({ erreur: 'cle_absente', message: 'clés VAPID manquantes dans Vercel', notifies: 0 })
      return
    }

    // Qui envoie ? On vérifie le jeton Supabase de l'expéditeur AVANT tout travail.
    const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!jeton) {
      res.status(401).json({ erreur: 'non_connecte', notifies: 0 })
      return
    }
    const reponseAuth = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
      headers: { apikey: CLE_SERVICE, authorization: `Bearer ${jeton}` },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null)
    if (!reponseAuth?.ok) {
      res.status(401).json({ erreur: 'non_connecte', notifies: 0 })
      return
    }
    const utilisateur = (await reponseAuth.json().catch(() => null)) as { id?: unknown } | null
    if (typeof utilisateur?.id !== 'string' || !utilisateur.id) {
      res.status(401).json({ erreur: 'non_connecte', notifies: 0 })
      return
    }

    const { titre, corps, url, adultesSeulement } = (req.body ?? {}) as {
      titre?: unknown
      corps?: unknown
      url?: unknown
      adultesSeulement?: unknown
    }
    if (typeof titre !== 'string' || !titre.trim()) {
      res.status(400).json({ erreur: 'titre_requis', notifies: 0 })
      return
    }
    const titrePropre = titre.slice(0, 80)
    const corpsPropre = (typeof corps === 'string' ? corps : '').slice(0, 200)
    const urlPropre = typeof url === 'string' && url ? url : '/'
    const seulementAdultes = adultesSeulement === true

    const expediteurs = liste<Membre>(
      await sb<unknown>(`membres?auth_user_id=eq.${encodeURIComponent(utilisateur.id)}&select=id,foyer_id,role`),
    )
    const expediteur = expediteurs[0]
    if (!expediteur?.foyer_id) {
      res.status(403).json({ erreur: 'membre_inconnu', notifies: 0 })
      return
    }

    // Tous les appareils du foyer, sauf ceux de l'expéditeur.
    const membres = liste<Membre>(
      await sb<unknown>(`membres?foyer_id=eq.${encodeURIComponent(expediteur.foyer_id)}&select=id,foyer_id,role`),
    )
    const cibles = membres
      .filter((m) => typeof m?.id === 'string' && m.id !== expediteur.id)
      .filter((m) => !seulementAdultes || m.role === 'adult') // verrou Père Noël
      .map((m) => m.id)
    if (cibles.length === 0) {
      res.status(200).json({ notifies: 0 })
      return
    }

    // Dépôt dans la boîte à notifications (la cloche 🔔) — même sans push actif.
    await sb('notifications', {
      method: 'POST',
      body: JSON.stringify({
        foyer_id: expediteur.foyer_id,
        titre: titrePropre,
        corps: corpsPropre,
        url: urlPropre,
        cibles,
        lu_par: [],
      }),
    }).catch(() => undefined)

    const abonnements = liste<Abonnement>(
      await sb<unknown>(`push_abonnements?membre_id=in.(${cibles.join(',')})&select=*`).catch(() => []),
    )

    webpush.setVapidDetails('mailto:stephanepitaud@me.com', clePublique, clePrivee)
    let notifies = 0
    for (const abonnement of abonnements) {
      // `cles` peut être null en base (abonnement enregistré à moitié).
      const p256dh = abonnement?.cles?.p256dh
      const auth = abonnement?.cles?.auth
      if (typeof abonnement?.endpoint !== 'string' || !p256dh || !auth) continue
      try {
        await webpush.sendNotification(
          { endpoint: abonnement.endpoint, keys: { p256dh, auth } },
          JSON.stringify({ titre: titrePropre, corps: corpsPropre, url: urlPropre }),
        )
        notifies += 1
      } catch (erreur) {
        const statut = (erreur as { statusCode?: number }).statusCode
        if (statut === 404 || statut === 410) {
          await sb(`push_abonnements?id=eq.${abonnement.id}`, { method: 'DELETE' }).catch(() => undefined)
        }
      }
    }
    res.status(200).json({ notifies })
  } catch (erreur) {
    res.status(200).json({
      notifies: 0,
      erreur: 'serveur',
      message: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160),
    })
  }
}
