// La tournée quotidienne de Gastif (déclenchée par le cron Vercel, ~7h Paris) :
// 1. importe les calendriers Apple (ICS), 2. met à jour les colis La Poste,
// 3. surveille les prix des cadeaux, 4. pousse le brief du matin en notification.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import webpush from 'web-push'
import { importerIcs } from './_ics'

export const config = { maxDuration: 60 }

const URL_SUPABASE = process.env.VITE_SUPABASE_URL ?? ''
const CLE_SERVICE = process.env.SUPABASE_SERVICE_ROLE ?? ''

async function sb<T>(chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(`${URL_SUPABASE}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: CLE_SERVICE,
      authorization: `Bearer ${CLE_SERVICE}`,
      'content-type': 'application/json',
      prefer: 'return=representation,resolution=merge-duplicates',
      ...(options?.headers ?? {}),
    },
  })
  if (!reponse.ok) throw new Error(`${chemin} → ${reponse.status} ${await reponse.text()}`)
  return (await reponse.json()) as T
}

function bornesJourParis(): { debut: string; fin: string; jour: string } {
  const maintenant = new Date()
  const jour = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(maintenant)
  const mois = Number(jour.slice(5, 7))
  const decalage = mois >= 4 && mois <= 10 ? '+02:00' : '+01:00'
  return {
    debut: new Date(`${jour}T00:00:00${decalage}`).toISOString(),
    fin: new Date(`${jour}T23:59:59${decalage}`).toISOString(),
    jour,
  }
}

// (import ICS partagé : api/_ics.ts)

// ————— Colis La Poste —————

interface Colis {
  id: string
  numero: string
  libelle: string | null
  statut: string
  transporteur: string
}

async function suivreColis(pousser: (titre: string, corps: string) => Promise<void>): Promise<number> {
  const cle = process.env.LAPOSTE_API_KEY
  if (!cle) return 0
  const liste = await sb<Colis[]>(`colis?statut=in.(attendu,en_transit)&select=*`)
  let maj = 0
  for (const colis of liste.slice(0, 20)) {
    try {
      const reponse = await fetch(`https://api.laposte.fr/suivi/v2/idships/${encodeURIComponent(colis.numero)}?lang=fr_FR`, {
        headers: { 'X-Okapi-Key': cle, accept: 'application/json' },
      })
      if (!reponse.ok) continue
      const donnees = (await reponse.json()) as {
        shipment?: { isFinal?: boolean; event?: { label?: string; date?: string }[] }
      }
      const dernier = donnees.shipment?.event?.[0]
      const livre = donnees.shipment?.isFinal === true
      const nouveauStatut = livre ? 'livre' : 'en_transit'
      if (nouveauStatut !== colis.statut || dernier) {
        await sb(`colis?id=eq.${colis.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            statut: nouveauStatut,
            dernier_evenement: dernier ?? null,
            livre_le: livre ? new Date().toISOString() : null,
          }),
        })
        maj += 1
        if (livre && colis.statut !== 'livre') {
          await pousser('📦 Colis livré', `${colis.libelle ?? colis.numero} vient d'être livré.`)
        }
      }
    } catch {
      // suivi indisponible pour ce numéro : on passe
    }
  }
  return maj
}

// ————— Veille des prix cadeaux —————

interface Idee {
  id: string
  libelle: string
  url: string | null
  prix: number | null
  offert: boolean
  historique_prix?: { date: string; prix: number }[]
}

function extrairePrix(html: string): number | null {
  const motifs = [
    /<meta[^>]+property=["'](?:og|product):price:amount["'][^>]+content=["']([\d.,]+)["']/i,
    /"price"\s*:\s*"?([\d]+[.,][\d]{2})"?/,
    /itemprop=["']price["'][^>]+content=["']([\d.,]+)["']/i,
  ]
  for (const motif of motifs) {
    const r = motif.exec(html)
    if (r?.[1]) {
      const valeur = Number(r[1].replace(',', '.'))
      if (Number.isFinite(valeur) && valeur > 0) return valeur
    }
  }
  return null
}

async function veillerPrix(pousser: (titre: string, corps: string) => Promise<void>): Promise<number> {
  const idees = await sb<Idee[]>(`idees_cadeaux?offert=eq.false&url=not.is.null&select=*`)
  let suivis = 0
  const { jour } = bornesJourParis()
  for (const idee of idees.slice(0, 15)) {
    try {
      const page = await fetch(idee.url ?? '', {
        headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
      })
      const prix = extrairePrix((await page.text()).slice(0, 400000))
      if (prix === null) continue
      const historique = idee.historique_prix ?? []
      if (historique[historique.length - 1]?.date !== jour) historique.push({ date: jour, prix })
      await sb(`idees_cadeaux?id=eq.${idee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ prix, historique_prix: historique.slice(-90) }),
      })
      suivis += 1
      if (idee.prix !== null && prix < idee.prix - 0.01) {
        await pousser(
          '💸 Baisse de prix !',
          `${idee.libelle} : ${prix.toFixed(2)} € (au lieu de ${idee.prix.toFixed(2)} €)`,
        )
      }
    } catch {
      // page injoignable aujourd'hui
    }
  }
  return suivis
}

// ————— Le brief du matin —————

async function composerBrief(): Promise<string> {
  const { debut, fin, jour } = bornesJourParis()
  interface Evt { titre: string; debut_a: string; journee_entiere: boolean }
  interface Tache { titre: string }
  interface Repas { notes: string | null; recette_id: string | null }
  const [evenements, taches, repas] = await Promise.all([
    sb<Evt[]>(`evenements?debut_a=gte.${debut}&debut_a=lte.${fin}&order=debut_a&select=*`),
    sb<Tache[]>(`taches?statut=eq.a_faire&echeance=lte.${jour}&select=*`),
    sb<Repas[]>(`repas?date=eq.${jour}&creneau=eq.soir&select=*`),
  ])
  const morceaux: string[] = []
  const horaires = evenements.filter((e) => !e.journee_entiere)
  if (horaires.length === 0) morceaux.push('Rien au programme aujourd’hui.')
  else {
    const premier = horaires[0]
    const heure = premier
      ? new Date(premier.debut_a).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
      : ''
    morceaux.push(
      `${horaires.length} rendez-vous aujourd’hui — premier : ${premier?.titre ?? ''} à ${heure}.`,
    )
  }
  if (taches.length === 1) morceaux.push(`1 chose à faire : ${taches[0]?.titre ?? ''}.`)
  else if (taches.length > 1) morceaux.push(`${taches.length} choses à faire.`)
  const soir = repas[0]
  if (soir?.notes) morceaux.push(`Ce soir : ${soir.notes}.`)
  return morceaux.join(' ')
}

// ————— Envoi des notifications —————

interface Abonnement {
  id: string
  endpoint: string
  cles: { p256dh?: string; auth?: string }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ erreur: 'non autorisé' })
    return
  }
  if (!URL_SUPABASE || !CLE_SERVICE) {
    res.status(503).json({ erreur: 'SUPABASE_SERVICE_ROLE manquant dans Vercel' })
    return
  }

  const clePublique = process.env.VAPID_PUBLIC_KEY
  const clePrivee = process.env.VAPID_PRIVATE_KEY
  let abonnements: Abonnement[] = []
  if (clePublique && clePrivee) {
    webpush.setVapidDetails('mailto:stephanepitaud@me.com', clePublique, clePrivee)
    abonnements = await sb<Abonnement[]>('push_abonnements?select=*')
  }

  const pousser = async (titre: string, corps: string) => {
    for (const abonnement of abonnements) {
      try {
        await webpush.sendNotification(
          {
            endpoint: abonnement.endpoint,
            keys: { p256dh: abonnement.cles.p256dh ?? '', auth: abonnement.cles.auth ?? '' },
          },
          JSON.stringify({ titre, corps, url: '/' }),
        )
      } catch (erreur) {
        const statut = (erreur as { statusCode?: number }).statusCode
        if (statut === 404 || statut === 410) {
          await sb(`push_abonnements?id=eq.${abonnement.id}`, { method: 'DELETE' }).catch(() => undefined)
        }
      }
    }
  }

  const resultat = { ics: 0, colis: 0, prix: 0, brief: '', notifies: abonnements.length }
  try { resultat.ics = await importerIcs(URL_SUPABASE, CLE_SERVICE) } catch { /* section suivante */ }
  try { resultat.colis = await suivreColis(pousser) } catch { /* section suivante */ }
  try { resultat.prix = await veillerPrix(pousser) } catch { /* section suivante */ }
  try {
    resultat.brief = await composerBrief()
    if (resultat.brief) await pousser('☀️ Le brief de Gastif', resultat.brief)
  } catch { /* fin */ }

  res.status(200).json(resultat)
}
