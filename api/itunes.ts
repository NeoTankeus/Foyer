// 🎬 Relais iTunes Search (l'API Apple ne parle pas aux navigateurs) :
// affiches de films, synopsis et liens pour la Soirée parfaite.
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 15 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const terme = String(req.query['terme'] ?? '').slice(0, 120)
    const media = String(req.query['media'] ?? 'movie')
    if (!terme.trim()) {
      res.status(400).json({ erreur: 'terme manquant' })
      return
    }
    const r = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(terme)}&country=fr&lang=fr_fr&media=${encodeURIComponent(media)}&limit=3`,
      { signal: AbortSignal.timeout(8000) },
    )
    if (!r.ok) {
      res.status(200).json({ resultats: [] })
      return
    }
    const donnees = (await r.json()) as { results?: Record<string, unknown>[] }
    const resultats = (donnees.results ?? []).map((x) => ({
      titre: String(x['trackName'] ?? x['collectionName'] ?? ''),
      affiche: typeof x['artworkUrl100'] === 'string' ? x['artworkUrl100'].replace('100x100', '400x400') : null,
      synopsis: typeof x['longDescription'] === 'string' ? x['longDescription'].slice(0, 300) : null,
      lien: typeof x['trackViewUrl'] === 'string' ? x['trackViewUrl'] : null,
      annee: typeof x['releaseDate'] === 'string' ? x['releaseDate'].slice(0, 4) : null,
    }))
    res.setHeader('cache-control', 'public, max-age=86400')
    res.status(200).json({ resultats })
  } catch {
    res.status(200).json({ resultats: [] })
  }
}
