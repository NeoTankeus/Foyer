// 🚆 Relais Navitia (SNCF) : recherche de gares et prochains départs en temps
// réel. Nécessite une clé GRATUITE (navitia.io) dans la variable Vercel
// NAVITIA_KEY — l'écran explique comment l'obtenir si elle manque.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 20 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const cle = process.env.NAVITIA_KEY
    if (!cle) {
      res.status(200).json({ erreur: 'cle_absente' })
      return
    }
    const mode = String(req.query['mode'] ?? '')
    const entetes = { authorization: `Basic ${Buffer.from(`${cle}:`).toString('base64')}` }

    if (mode === 'gares') {
      const q = String(req.query['q'] ?? '').slice(0, 80)
      if (!q.trim()) {
        res.status(200).json({ gares: [] })
        return
      }
      const r = await fetch(
        `https://api.navitia.io/v1/coverage/sncf/places?q=${encodeURIComponent(q)}&type%5B%5D=stop_area&count=6`,
        { headers: entetes, signal: AbortSignal.timeout(10000) },
      )
      if (!r.ok) {
        res.status(200).json({ gares: [], erreur: `navitia ${r.status}` })
        return
      }
      const donnees = (await r.json()) as { places?: { id: string; name: string }[] }
      res.status(200).json({
        gares: (donnees.places ?? []).map((p) => ({ id: p.id, nom: p.name })),
      })
      return
    }

    if (mode === 'departs') {
      const gare = String(req.query['gare'] ?? '')
      if (!gare.startsWith('stop_area:')) {
        res.status(400).json({ erreur: 'gare invalide' })
        return
      }
      const r = await fetch(
        `https://api.navitia.io/v1/coverage/sncf/stop_areas/${encodeURIComponent(gare)}/departures?count=10&data_freshness=realtime`,
        { headers: entetes, signal: AbortSignal.timeout(10000) },
      )
      if (!r.ok) {
        res.status(200).json({ departs: [], erreur: `navitia ${r.status}` })
        return
      }
      const donnees = (await r.json()) as {
        departures?: {
          display_informations?: { direction?: string; commercial_mode?: string; headsign?: string }
          stop_date_time?: { departure_date_time?: string; base_departure_date_time?: string }
        }[]
      }
      const versHeure = (brut?: string) =>
        brut && brut.length >= 13 ? `${brut.slice(9, 11)}:${brut.slice(11, 13)}` : null
      res.status(200).json({
        departs: (donnees.departures ?? []).map((d) => {
          const heure = versHeure(d.stop_date_time?.departure_date_time)
          const heurePrevue = versHeure(d.stop_date_time?.base_departure_date_time)
          return {
            direction: d.display_informations?.direction ?? '?',
            type: d.display_informations?.commercial_mode ?? '',
            numero: d.display_informations?.headsign ?? '',
            heure,
            retard: heure && heurePrevue && heure !== heurePrevue ? heurePrevue : null,
          }
        }),
      })
      return
    }

    res.status(400).json({ erreur: 'mode inconnu' })
  } catch (e) {
    res.status(200).json({ erreur: String(e instanceof Error ? e.message : e).slice(0, 80) })
  }
}
