// Bouton « Importer maintenant » : lance l'import des calendriers Apple à la demande.
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { importerIcs } from './_ics'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const base = process.env.VITE_SUPABASE_URL ?? ''
  const service = process.env.SUPABASE_SERVICE_ROLE ?? ''
  const anon = process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const jeton = String(req.headers.authorization ?? '').replace(/^Bearer\s+/i, '')
  if (!base || !anon || !jeton) {
    res.status(401).json({ erreur: 'non_connecte' })
    return
  }
  if (!service) {
    res.status(503).json({ erreur: 'SUPABASE_SERVICE_ROLE manquant dans Vercel' })
    return
  }
  const verification = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: anon, authorization: `Bearer ${jeton}` },
  })
  if (!verification.ok) {
    res.status(401).json({ erreur: 'non_connecte' })
    return
  }
  try {
    const resultat = await importerIcs(base, service)
    res.status(200).json(resultat)
  } catch (erreur) {
    res.status(502).json({ erreur: 'import', message: String(erreur).slice(0, 200) })
  }
}
