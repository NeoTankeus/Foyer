// Import des calendriers Apple — deux portes d'entrée, même moteur :
// 1. lien public ICS (webcal://…), 2. connexion directe iCloud (CalDAV,
// identifiant Apple + mot de passe d'app — la seule voie pour « Famille »).
// Partagé entre le cron quotidien et le bouton « Importer maintenant ».
import { lireIcsDepuisIcloud } from './_caldav.js'

async function sb<T>(base: string, cle: string, chemin: string, options?: RequestInit): Promise<T> {
  const reponse = await fetch(`${base}/rest/v1/${chemin}`, {
    ...options,
    headers: {
      apikey: cle,
      authorization: `Bearer ${cle}`,
      'content-type': 'application/json',
      prefer: 'return=representation,resolution=merge-duplicates',
      ...(options?.headers ?? {}),
    },
  })
  if (!reponse.ok) throw new Error(`${chemin} → ${reponse.status}`)
  return (await reponse.json()) as T
}

function deplierIcs(brut: string): string[] {
  return brut.replace(/\r\n[ \t]/g, '').split(/\r?\n/)
}

function dateIcs(valeur: string): string | null {
  const complet = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(valeur)
  if (complet) {
    const [, a, m, j, h, mi, s, z] = complet
    if (z === 'Z') return `${a}-${m}-${j}T${h}:${mi}:${s}Z`
    const mois = Number(m)
    const decalage = mois >= 4 && mois <= 10 ? '+02:00' : '+01:00'
    return new Date(`${a}-${m}-${j}T${h}:${mi}:${s}${decalage}`).toISOString()
  }
  const jourSeul = /^(\d{4})(\d{2})(\d{2})$/.exec(valeur)
  if (jourSeul) {
    const [, a, m, j] = jourSeul
    return new Date(`${a}-${m}-${j}T00:00:00+01:00`).toISOString()
  }
  return null
}

interface BaseEvenement {
  foyer_id: string
  participants: string[]
}

/** Transforme un texte ICS en lignes prêtes pour la table evenements. */
async function extraireEvenements(brut: string, base: BaseEvenement): Promise<Record<string, unknown>[]> {
  const lignes = deplierIcs(brut)
  let evenement: Record<string, string> | null = null
  const aInserer: Record<string, unknown>[] = []
  const ilYA30j = Date.now() - 30 * 86400000
  const dans180j = Date.now() + 180 * 86400000
  const { RRule } = await import('rrule')
  for (const ligne of lignes) {
    if (ligne === 'BEGIN:VEVENT') evenement = {}
    else if (ligne === 'END:VEVENT' && evenement) {
      const debut = evenement['DTSTART'] ? dateIcs(evenement['DTSTART']) : null
      const fin = evenement['DTEND'] ? dateIcs(evenement['DTEND']) : debut
      const uid = evenement['UID']
      // Les occurrences modifiées d'une série (RECURRENCE-ID) sont ignorées :
      // la série maître suffit, et ça évite les doublons venus de CalDAV.
      if (debut && fin && uid && !evenement['RECURRENCE-ID']) {
        const commun = {
          foyer_id: base.foyer_id,
          titre: evenement['SUMMARY'] ?? 'Sans titre',
          journee_entiere: /^\d{8}$/.test(evenement['DTSTART'] ?? ''),
          lieu: evenement['LOCATION'] ?? null,
          source: 'ics',
          participants: base.participants,
        }
        if (!evenement['RRULE']) {
          const t = new Date(debut).getTime()
          if (t > ilYA30j && t < dans180j) {
            aInserer.push({ ...commun, debut_a: debut, fin_a: fin, source_id: uid })
          }
        } else {
          // Récurrent (hebdo, mensuel…) : on déplie chaque occurrence de la fenêtre.
          try {
            const options = RRule.parseString(evenement['RRULE'])
            options.dtstart = new Date(debut)
            const regle = new RRule(options)
            const duree = new Date(fin).getTime() - new Date(debut).getTime()
            const exclues = new Set(
              (evenement['EXDATE'] ?? '')
                .split(',')
                .map((v) => dateIcs(v.trim()))
                .filter(Boolean),
            )
            const occurrences = regle
              .between(new Date(ilYA30j), new Date(dans180j), true)
              .slice(0, 60)
            for (const occ of occurrences) {
              const debutOcc = occ.toISOString()
              if (exclues.has(debutOcc)) continue
              aInserer.push({
                ...commun,
                debut_a: debutOcc,
                fin_a: new Date(occ.getTime() + duree).toISOString(),
                source_id: `${uid}::${debutOcc.slice(0, 10)}`,
              })
            }
          } catch {
            // règle exotique : on ignore cet événement
          }
        }
      }
      evenement = null
    } else if (evenement) {
      const deuxPoints = ligne.indexOf(':')
      if (deuxPoints > 0) {
        const cle = ligne.slice(0, deuxPoints).split(';')[0] ?? ''
        evenement[cle] = ligne.slice(deuxPoints + 1)
      }
    }
  }
  return aInserer
}

export interface ResultatImport {
  importes: number
  erreurs: string[]
}

export async function importerIcs(base: string, cle: string): Promise<ResultatImport> {
  interface Integration {
    id: string
    foyer_id: string
    membre_id: string | null
    reglages: {
      ics_url?: string
      membre_ids?: string[]
      apple_id?: string
      mdp_app?: string
      nom_calendrier?: string
    }
  }
  const integrations = await sb<Integration[]>(base, cle,
    `integrations?fournisseur=eq.icloud_caldav&statut=eq.active&select=*`,
  )
  const resultat: ResultatImport = { importes: 0, erreurs: [] }
  for (const integration of integrations.slice(0, 5)) {
    try {
      // D'où vient le texte ICS : connexion directe iCloud, ou lien public.
      let brut: string
      if (integration.reglages.apple_id && integration.reglages.mdp_app) {
        const lecture = await lireIcsDepuisIcloud(
          integration.reglages.apple_id,
          integration.reglages.mdp_app,
          integration.reglages.nom_calendrier ?? null,
        )
        brut = lecture.ics
      } else {
        const url = integration.reglages.ics_url?.replace(/^webcal:\/\//, 'https://')
        if (!url) continue
        brut = await (await fetch(url)).text()
      }

      const participants =
        integration.reglages.membre_ids && integration.reglages.membre_ids.length > 0
          ? integration.reglages.membre_ids
          : integration.membre_id
            ? [integration.membre_id]
            : []
      const aInserer = await extraireEvenements(brut, {
        foyer_id: integration.foyer_id,
        participants,
      })
      if (aInserer.length > 0) {
        await sb(base, cle, `evenements?on_conflict=foyer_id,source,source_id`, {
          method: 'POST',
          body: JSON.stringify(aInserer),
        })
        resultat.importes += aInserer.length
      }
      await sb(base, cle, `integrations?id=eq.${integration.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ derniere_sync: new Date().toISOString() }),
      })
    } catch (erreur) {
      resultat.erreurs.push(String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160))
    }
  }
  return resultat
}
