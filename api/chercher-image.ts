// Le bouton « chercher les visuels » : reçoit des libellés de produits,
// rend une image trouvée sur internet pour chacun (25 max par appel).
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ erreur: 'POST uniquement' })
      return
    }
    const base = process.env.VITE_SUPABASE_URL ?? ''
    const anon = process.env.VITE_SUPABASE_ANON_KEY ?? ''
    const jeton = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
    if (!base || !anon || !jeton) {
      res.status(401).json({ erreur: 'non_connecte' })
      return
    }
    const verification = await fetch(`${base}/auth/v1/user`, {
      headers: { apikey: anon, authorization: `Bearer ${jeton}` },
    })
    if (!verification.ok) {
      res.status(401).json({ erreur: 'non_connecte' })
      return
    }

    const { libelles } = (req.body ?? {}) as { libelles?: string[] }
    if (!Array.isArray(libelles) || libelles.length === 0) {
      res.status(400).json({ erreur: 'libelles requis' })
      return
    }
    const { chercherImage } = await import('./_images.js')
    const images: Record<string, string | null> = {}
    for (const libelle of libelles.slice(0, 25)) {
      if (typeof libelle !== 'string' || !libelle.trim()) continue
      images[libelle] = await chercherImage(libelle.trim())
    }
    res.status(200).json({ images })
  } catch (erreur) {
    res.status(200).json({ images: {}, erreur: String(erreur instanceof Error ? erreur.message : erreur).slice(0, 160) })
  }
}
