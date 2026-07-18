// Bouton « Importer maintenant » : lance l'import des calendriers Apple à la demande.
import type { VercelRequest, VercelResponse } from '@vercel/node'

// La lecture directe iCloud enchaîne plusieurs requêtes CalDAV : il faut
// plus que les 10 s par défaut, sinon Vercel coupe en plein vol.
export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
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
    // Import dynamique : même une erreur de chargement du module remonte proprement.
    const { importerIcs } = await import('./_ics.js')
    const resultat = await importerIcs(base, service)
    res.status(200).json(resultat)
  } catch (erreur) {
    // Jamais de plantage muet : la cause exacte remonte jusqu'au téléphone.
    const detail = erreur instanceof Error ? `${erreur.message}` : String(erreur)
    res.status(200).json({ importes: 0, erreurs: [detail.slice(0, 200)] })
  }
}
