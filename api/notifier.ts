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

interface Membre { id: string; foyer_id: string; role: string }
interface Abonnement { id: string; membre_id: string; endpoint: string; cles: { p256dh?: string; auth?: string } }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'POST uniquement' })
    return
  }
  if (!URL_SUPABASE || !CLE_SERVICE) {
    res.status(503).json({ erreur: 'SUPABASE_SERVICE_ROLE manquant dans Vercel' })
    return
  }
  const clePublique = process.env.VAPID_PUBLIC_KEY
  const clePrivee = process.env.VAPID_PRIVATE_KEY
  if (!clePublique || !clePrivee) {
    res.status(503).json({ erreur: 'clés VAPID manquantes dans Vercel' })
    return
  }

  // Qui envoie ? On vérifie le jeton Supabase de l'expéditeur.
  const jeton = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!jeton) {
    res.status(401).json({ erreur: 'jeton manquant' })
    return
  }
  const reponseAuth = await fetch(`${URL_SUPABASE}/auth/v1/user`, {
    headers: { apikey: CLE_SERVICE, authorization: `Bearer ${jeton}` },
  })
  if (!reponseAuth.ok) {
    res.status(401).json({ erreur: 'jeton invalide' })
    return
  }
  const utilisateur = (await reponseAuth.json()) as { id?: string }
  if (!utilisateur.id) {
    res.status(401).json({ erreur: 'jeton invalide' })
    return
  }

  const { titre, corps, url, adultesSeulement } = (req.body ?? {}) as {
    titre?: string
    corps?: string
    url?: string
    adultesSeulement?: boolean
  }
  if (!titre || typeof titre !== 'string' || typeof (corps ?? '') !== 'string') {
    res.status(400).json({ erreur: 'titre requis' })
    return
  }

  const expediteurs = await sb<Membre[]>(`membres?auth_user_id=eq.${utilisateur.id}&select=id,foyer_id,role`)
  const expediteur = expediteurs[0]
  if (!expediteur) {
    res.status(403).json({ erreur: 'membre inconnu' })
    return
  }

  // Tous les appareils du foyer, sauf ceux de l'expéditeur.
  const membres = await sb<Membre[]>(`membres?foyer_id=eq.${expediteur.foyer_id}&select=id,foyer_id,role`)
  const cibles = membres
    .filter((m) => m.id !== expediteur.id)
    .filter((m) => !adultesSeulement || m.role === 'adult') // verrou Père Noël
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
      titre: titre.slice(0, 80),
      corps: (corps ?? '').slice(0, 200),
      url: url ?? '/',
      cibles,
      lu_par: [],
    }),
  }).catch(() => undefined)

  const abonnements = await sb<Abonnement[]>(
    `push_abonnements?membre_id=in.(${cibles.join(',')})&select=*`,
  )

  webpush.setVapidDetails('mailto:stephanepitaud@me.com', clePublique, clePrivee)
  let notifies = 0
  for (const abonnement of abonnements) {
    try {
      await webpush.sendNotification(
        {
          endpoint: abonnement.endpoint,
          keys: { p256dh: abonnement.cles.p256dh ?? '', auth: abonnement.cles.auth ?? '' },
        },
        JSON.stringify({ titre: titre.slice(0, 80), corps: (corps ?? '').slice(0, 200), url: url ?? '/' }),
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
}
